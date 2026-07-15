import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useVisitorAuth } from "./VisitorAuthContext";
import { visitorClient, type VisitorClient } from "./visitorClient";
import type { VisitorSavedVehicle } from "./types";

export const SAVED_VEHICLE_STORAGE_KEY = "lume.vehicle-saved.v1";

type SavedVehiclesContextValue = {
  savedIds: readonly string[];
  savedVehicles: readonly VisitorSavedVehicle[];
  status: "loading" | "ready" | "error";
  error: string | null;
  toggleSaved: (vehicleId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const SavedVehiclesContext = createContext<SavedVehiclesContextValue | null>(null);

export function SavedVehiclesProvider({
  children,
  client = visitorClient,
  enabled = true,
}: PropsWithChildren<{ client?: VisitorClient; enabled?: boolean }>) {
  if (!enabled) return <>{children}</>;
  return <ActiveSavedVehiclesProvider client={client}>{children}</ActiveSavedVehiclesProvider>;
}

function ActiveSavedVehiclesProvider({
  children,
  client,
}: PropsWithChildren<{ client: VisitorClient }>) {
  const auth = useVisitorAuth();
  const [savedIds, setSavedIds] = useState<string[]>(() => readSavedVehicleIds());
  const [savedVehicles, setSavedVehicles] = useState<VisitorSavedVehicle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("ready");
  const [error, setError] = useState<string | null>(null);
  const syncedVisitorRef = useRef<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (auth.status !== "authenticated" || !auth.visitor) {
      setSavedVehicles([]);
      setSavedIds(readSavedVehicleIds());
      setStatus("ready");
      return;
    }
    setStatus("loading");
    try {
      const saves = await client.getSavedVehicles();
      setSavedVehicles(saves);
      setSavedIds(saves.map((save) => save.vehicleId));
      setStatus("ready");
      setError(null);
    } catch (reason) {
      setStatus("error");
      setError(messageFor(reason));
    }
  }, [auth.status, auth.visitor, client]);

  useEffect(() => {
    if (auth.status === "loading") return;
    if (auth.status !== "authenticated" || !auth.visitor) {
      syncedVisitorRef.current = null;
      setSavedVehicles([]);
      setSavedIds(readSavedVehicleIds());
      setStatus("ready");
      setError(null);
      return;
    }
    if (syncedVisitorRef.current === auth.visitor.id) return;
    syncedVisitorRef.current = auth.visitor.id;
    let cancelled = false;

    void (async () => {
      setStatus("loading");
      const localIds = readSavedVehicleIds();
      const results = await Promise.allSettled(localIds.map((vehicleId) => client.saveVehicle(vehicleId)));
      const retryIds = localIds.filter((_, index) => results[index]?.status === "rejected");
      writeSavedVehicleIds(retryIds);
      try {
        const saves = await client.getSavedVehicles();
        if (cancelled) return;
        setSavedVehicles(saves);
        setSavedIds(saves.map((save) => save.vehicleId));
        setStatus("ready");
        setError(retryIds.length ? "Some saved vehicles will be retried later." : null);
      } catch (reason) {
        if (cancelled) return;
        setSavedIds(uniqueIds([...localIds]));
        setStatus("error");
        setError(messageFor(reason));
      }
    })();
    return () => { cancelled = true; };
  }, [auth.status, auth.visitor, client]);

  const toggleSaved = useCallback(async (vehicleId: string) => {
    if (!vehicleId || inFlight.current.has(vehicleId)) return;
    inFlight.current.add(vehicleId);
    const wasSaved = savedIds.includes(vehicleId);
    const nextIds = wasSaved ? savedIds.filter((id) => id !== vehicleId) : uniqueIds([...savedIds, vehicleId]);
    setSavedIds(nextIds);
    setError(null);

    if (auth.status !== "authenticated") {
      writeSavedVehicleIds(nextIds);
      inFlight.current.delete(vehicleId);
      return;
    }

    try {
      if (wasSaved) {
        await client.removeSavedVehicle(vehicleId);
        setSavedVehicles((items) => items.filter((item) => item.vehicleId !== vehicleId));
      } else {
        await client.saveVehicle(vehicleId);
        const items = await client.getSavedVehicles();
        setSavedVehicles(items);
        setSavedIds(items.map((item) => item.vehicleId));
      }
    } catch (reason) {
      setSavedIds(savedIds);
      setError(messageFor(reason));
    } finally {
      inFlight.current.delete(vehicleId);
    }
  }, [auth.status, client, savedIds]);

  const value = useMemo<SavedVehiclesContextValue>(
    () => ({ savedIds, savedVehicles, status, error, toggleSaved, refresh }),
    [error, refresh, savedIds, savedVehicles, status, toggleSaved],
  );
  return <SavedVehiclesContext.Provider value={value}>{children}</SavedVehiclesContext.Provider>;
}

export function useSavedVehicles(): SavedVehiclesContextValue {
  const value = useContext(SavedVehiclesContext);
  if (!value) throw new Error("useSavedVehicles must be used inside SavedVehiclesProvider.");
  return value;
}

export function readSavedVehicleIds(storage: Storage | null = browserStorage()): string[] {
  if (!storage) return [];
  try {
    const value: unknown = JSON.parse(storage.getItem(SAVED_VEHICLE_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? uniqueIds(value.filter((id): id is string => typeof id === "string")) : [];
  } catch {
    return [];
  }
}

export function writeSavedVehicleIds(ids: readonly string[], storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SAVED_VEHICLE_STORAGE_KEY, JSON.stringify(uniqueIds(ids)));
  } catch {
    // Storage failures must never block a save interaction.
  }
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Unable to update saved vehicles.";
}
