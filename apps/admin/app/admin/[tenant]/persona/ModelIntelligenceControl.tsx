"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, Check, LockKeyhole, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  CONCIERGE_MODEL_PROFILES,
  conciergeModelIndex,
  isProviderAvailable,
  type ConciergeModelId,
  type ConciergeProvider,
} from "@/lib/conciergeModels";
import { saveConciergeModel } from "./actions";

type SaveState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type ModelIntelligenceControlProps = {
  tenantSlug: string;
  initialModelId: ConciergeModelId;
  providerAvailability: Readonly<Record<ConciergeProvider, boolean>>;
  canManage: boolean;
  configurationWarning: string | null;
};

export function ModelIntelligenceControl({
  tenantSlug,
  initialModelId,
  providerAvailability,
  canManage,
  configurationWarning,
}: ModelIntelligenceControlProps) {
  const router = useRouter();
  const [publishedModelId, setPublishedModelId] = useState(initialModelId);
  const [selectedIndex, setSelectedIndex] = useState(() =>
    conciergeModelIndex(initialModelId),
  );
  const [state, setState] = useState<SaveState>({
    type: "idle",
    message: "",
  });

  const selectedProfile =
    CONCIERGE_MODEL_PROFILES[selectedIndex] ??
    CONCIERGE_MODEL_PROFILES[0];
  const selectedAvailable = isProviderAvailable(
    selectedProfile.id,
    providerAvailability,
  );
  const hasChanges = selectedProfile.id !== publishedModelId;
  const disabled =
    state.type === "saving" ||
    !canManage ||
    Boolean(configurationWarning) ||
    !selectedAvailable ||
    !hasChanges;

  function selectIndex(index: number) {
    const bounded = Math.max(
      0,
      Math.min(index, CONCIERGE_MODEL_PROFILES.length - 1),
    );
    setSelectedIndex(bounded);
    setState({ type: "idle", message: "" });
  }

  async function saveModel() {
    if (disabled) return;
    setState({
      type: "saving",
      message: `Applying ${selectedProfile.providerLabel} ${selectedProfile.modelLabel}…`,
    });
    const result = await saveConciergeModel(
      tenantSlug,
      selectedProfile.id,
    );
    if (!result.ok) {
      setState({ type: "error", message: result.error });
      return;
    }
    setPublishedModelId(result.modelId);
    setState({
      type: "success",
      message: `${selectedProfile.providerLabel} ${selectedProfile.modelLabel} will handle new concierge conversations.`,
    });
    router.refresh();
  }

  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
      aria-labelledby="concierge-intelligence-heading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BrainCircuit className="size-5" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="concierge-intelligence-heading"
                className="text-sm font-semibold"
              >
                Concierge intelligence
              </h2>
              <Badge variant="secondary">
                Level {selectedIndex + 1} of{" "}
                {CONCIERGE_MODEL_PROFILES.length}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Drag toward deeper intelligence for more complex reasoning.
              Higher levels may respond more slowly and cost more. Inventory
              facts and tenant access remain server-verified at every level.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void saveModel()}
          disabled={disabled}
        >
          {state.type === "saving"
            ? "Applying…"
            : hasChanges
              ? "Apply intelligence level"
              : "Current level"}
        </Button>
      </div>

      <div className="mt-6 px-5 sm:px-7">
        <div className="relative h-[88px]">
          {CONCIERGE_MODEL_PROFILES.map((profile, index) => {
            const isSelected = index === selectedIndex;
            const isPublished = profile.id === publishedModelId;
            const isAvailable = isProviderAvailable(
              profile.id,
              providerAvailability,
            );
            const position =
              (index / (CONCIERGE_MODEL_PROFILES.length - 1)) * 100;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => selectIndex(index)}
                disabled={!canManage || Boolean(configurationWarning)}
                aria-label={`Select level ${index + 1}, ${profile.providerLabel} ${profile.modelLabel}`}
                aria-pressed={isSelected}
                style={{ left: `${position}%` }}
                className="group absolute top-0 flex w-16 -translate-x-1/2 flex-col items-center gap-1.5 rounded-lg px-0.5 py-2 text-center outline-none transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 sm:w-20"
              >
                <span
                  className={`relative flex size-10 items-center justify-center rounded-xl border bg-white p-2 shadow-sm transition-all ${
                    isSelected
                      ? "border-primary ring-3 ring-primary/15"
                      : "border-border group-hover:border-foreground/25"
                  }`}
                >
                  <img
                    src={profile.iconSrc}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    aria-hidden="true"
                  />
                  <span className="absolute -bottom-1.5 -right-1.5 rounded-md border border-border bg-background px-1 py-0.5 text-[9px] font-bold leading-none text-foreground shadow-sm">
                    {profile.iconBadge}
                  </span>
                  {!isAvailable ? (
                    <span className="absolute -left-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <LockKeyhole className="size-2.5" aria-hidden="true" />
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate text-[10px] font-medium sm:text-xs">
                  {profile.levelLabel}
                </span>
                <span className="hidden truncate text-[10px] text-muted-foreground sm:block">
                  {profile.providerLabel}
                </span>
                {isPublished ? (
                  <span className="flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    <Check className="size-2.5" aria-hidden="true" />
                    Active
                  </span>
                ) : (
                  <span className="h-3 text-[9px] uppercase tracking-wide text-transparent">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Slider
          className="mt-2 py-3 [&_[data-slot=slider-range]]:bg-gradient-to-r [&_[data-slot=slider-range]]:from-sky-500 [&_[data-slot=slider-range]]:to-violet-500 [&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:border-4 [&_[data-slot=slider-thumb]]:border-background [&_[data-slot=slider-thumb]]:bg-primary [&_[data-slot=slider-thumb]]:shadow-md"
          min={0}
          max={CONCIERGE_MODEL_PROFILES.length - 1}
          step={1}
          value={[selectedIndex]}
          onValueChange={(values) => selectIndex(values[0] ?? 0)}
          disabled={!canManage || Boolean(configurationWarning)}
          aria-label="Concierge intelligence level"
          aria-valuetext={`Level ${selectedIndex + 1}: ${selectedProfile.levelLabel}, ${selectedProfile.providerLabel} ${selectedProfile.modelLabel}`}
        />
      </div>

      <div className="mt-4 grid gap-4 rounded-lg border border-border bg-muted/35 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white p-2.5 shadow-sm">
            <img
              src={selectedProfile.iconSrc}
              alt=""
              className="max-h-full max-w-full object-contain"
              aria-hidden="true"
            />
            <span className="absolute -bottom-1.5 -right-1.5 rounded-md border border-border bg-background px-1 py-0.5 text-[9px] font-bold leading-none">
              {selectedProfile.iconBadge}
            </span>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">
                {selectedProfile.providerLabel}{" "}
                {selectedProfile.modelLabel}
              </p>
              {selectedProfile.thinkingMode === "max" ? (
                <Badge variant="outline">
                  <Sparkles className="size-3" aria-hidden="true" />
                  Always reasoning
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {selectedProfile.description}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div>
            <dt className="text-muted-foreground">Response</dt>
            <dd className="mt-0.5 font-medium">{selectedProfile.speedLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Relative cost</dt>
            <dd className="mt-0.5 font-medium">{selectedProfile.costLabel}</dd>
          </div>
        </dl>
      </div>

      {configurationWarning ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {configurationWarning}
        </p>
      ) : !canManage ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Owner or admin access is required to change the concierge model.
        </p>
      ) : !selectedAvailable ? (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300" role="status">
          {selectedProfile.providerLabel} is not configured in this
          environment. Add its server-side API key before selecting this
          level.
        </p>
      ) : null}

      {state.message ? (
        <p
          className={
            state.type === "error"
              ? "mt-3 text-sm text-destructive"
              : state.type === "success"
                ? "mt-3 text-sm text-emerald-600 dark:text-emerald-400"
                : "mt-3 text-sm text-muted-foreground"
          }
          role={state.type === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
