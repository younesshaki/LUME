"use client";

import { type FormEvent, type ReactNode, useState, useTransition } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { isSensitiveManagedIntegrationQueryKey } from "@/lib/managedIntegrationUrl";

/**
 * These types intentionally live beside the client surface. The page/server-action
 * layer maps database rows to them, keeping credentials and service clients out of
 * the browser bundle.
 */
export type InventoryIntegrationFormat = "csv" | "json" | "xml";
export type InventoryIntegrationHttpMethod = "POST" | "PUT";
export type InventoryFeedSourceKind = "https" | "storage";
/** `configured` means an existing opaque credential whose kind is intentionally never read back. */
export type InventoryIntegrationAuthKind = "none" | "configured" | "bearer" | "basic" | "custom";
export type ManagedFeedMode = "hybrid" | "mirror";
export type InventoryIntegrationHealth = "healthy" | "degraded" | "failing" | "unknown";
export type InventoryIntegrationRunStatus =
  | "queued"
  | "running"
  | "retrying"
  | "succeeded"
  | "partial"
  | "skipped"
  | "cancelled"
  | "failed"
  | "dead_letter";

export type InventoryFeedSourceRow = {
  id: string;
  name: string;
  sourceKind: InventoryFeedSourceKind;
  endpointUrl: string;
  sourceObjectPath: string | null;
  format: InventoryIntegrationFormat;
  mappingProfile: Record<string, unknown>;
  mode: ManagedFeedMode;
  enabled: boolean;
  scheduleMinutes: number | null;
  authKind: InventoryIntegrationAuthKind;
  credentialsConfigured: boolean;
  health: InventoryIntegrationHealth;
  lastAttemptAt: string | null;
  lastSucceededAt: string | null;
  lastError: string | null;
};

export type InventoryExportDestinationRow = {
  id: string;
  name: string;
  endpointUrl: string;
  httpMethod: InventoryIntegrationHttpMethod;
  format: InventoryIntegrationFormat;
  mappingProfile: Record<string, unknown>;
  enabled: boolean;
  scheduleMinutes: number | null;
  authKind: InventoryIntegrationAuthKind;
  credentialsConfigured: boolean;
  health: InventoryIntegrationHealth;
  lastAttemptAt: string | null;
  lastSucceededAt: string | null;
  lastError: string | null;
  lastSemanticHashAt: string | null;
};

export type InventoryIntegrationRunRow = {
  id: string;
  targetKind: "source" | "export";
  targetId: string;
  targetName: string;
  status: InventoryIntegrationRunStatus;
  attemptCount: number;
  createdAt: string;
  completedAt: string | null;
  totalRecords: number | null;
  createdRecords: number | null;
  updatedRecords: number | null;
  skippedRecords: number | null;
  failedRecords: number | null;
  responseStatus: number | null;
  lastError: string | null;
};

export type InventoryIntegrationAuthInput =
  | { kind: "none" }
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; password: string }
  | { kind: "custom"; headerName: string; headerValue: string };

export type ManagedFeedSourceInput = {
  name: string;
  endpointUrl: string;
  profile: Record<string, unknown>;
  mode: ManagedFeedMode;
  scheduleMinutes: number;
  /** Omitted on an unchanged edit so server code retains encrypted credentials. */
  auth?: InventoryIntegrationAuthInput;
};

export type InventoryExportDestinationInput = {
  name: string;
  endpointUrl: string;
  httpMethod: InventoryIntegrationHttpMethod;
  profile: Record<string, unknown>;
  scheduleMinutes: number;
  /** Omitted on an unchanged edit so server code retains encrypted credentials. */
  auth?: InventoryIntegrationAuthInput;
};

export type InventoryIntegrationActionResult = {
  error?: string | null;
  message?: string | null;
};

export type InventoryFeedsActions = {
  createSource: (input: ManagedFeedSourceInput) => Promise<InventoryIntegrationActionResult>;
  updateSource: (sourceId: string, input: ManagedFeedSourceInput) => Promise<InventoryIntegrationActionResult>;
  setSourceEnabled: (sourceId: string, enabled: boolean) => Promise<InventoryIntegrationActionResult>;
  runSource: (sourceId: string) => Promise<InventoryIntegrationActionResult>;
  removeSource: (sourceId: string) => Promise<InventoryIntegrationActionResult>;
  createDestination: (input: InventoryExportDestinationInput) => Promise<InventoryIntegrationActionResult>;
  updateDestination: (
    destinationId: string,
    input: InventoryExportDestinationInput,
  ) => Promise<InventoryIntegrationActionResult>;
  setDestinationEnabled: (
    destinationId: string,
    enabled: boolean,
  ) => Promise<InventoryIntegrationActionResult>;
  runDestination: (destinationId: string) => Promise<InventoryIntegrationActionResult>;
  removeDestination: (destinationId: string) => Promise<InventoryIntegrationActionResult>;
};

export type InventoryFeedsClientProps = {
  sources: readonly InventoryFeedSourceRow[];
  destinations: readonly InventoryExportDestinationRow[];
  runs: readonly InventoryIntegrationRunRow[];
  actions: InventoryFeedsActions;
  canManage?: boolean;
};

type Feedback =
  | { type: "success" | "error"; message: string }
  | null;

type SourceEditor = "new" | InventoryFeedSourceRow | null;
type DestinationEditor = "new" | InventoryExportDestinationRow | null;

const SOURCE_PROFILE_EXAMPLE: Record<string, unknown> = {
  format: "csv",
  mode: "hybrid",
  mappings: {
    external_id: { path: "Stock" },
    feed_vin: { path: "VIN" },
    year: { path: "Year" },
    make: { path: "Make" },
    model: { path: "Model" },
    price: { path: "SellingPrice" },
    mileage: { path: "Miles" },
    image_list: { path: "ImageList" },
  },
};

const EXPORT_PROFILE_EXAMPLE: Record<string, unknown> = {
  format: "csv",
  fields: [
    { name: "stock", source: "stockNumber" },
    { name: "vin", source: "vin" },
    { name: "year", source: "year" },
    { name: "make", source: "make" },
    { name: "model", source: "model" },
    { name: "price", source: "price" },
    { name: "image_url", source: "primaryImageUrl" },
  ],
};

const HEALTH_LABELS: Record<InventoryIntegrationHealth, string> = {
  healthy: "Healthy",
  degraded: "Needs attention",
  failing: "Failing",
  unknown: "Not checked yet",
};

const AUTH_LABELS: Record<InventoryIntegrationAuthKind, string> = {
  none: "No authentication",
  configured: "Configured credential",
  bearer: "Bearer token",
  basic: "Basic authentication",
  custom: "Custom header",
};

export default function InventoryFeedsClient({
  sources,
  destinations,
  runs,
  actions,
  canManage = true,
}: InventoryFeedsClientProps) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [sourceEditor, setSourceEditor] = useState<SourceEditor>(null);
  const [destinationEditor, setDestinationEditor] = useState<DestinationEditor>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const disabled = pending || !canManage;

  function perform(
    key: string,
    successMessage: string,
    operation: () => Promise<InventoryIntegrationActionResult>,
    afterSuccess?: () => void,
  ) {
    setFeedback(null);
    setPendingKey(key);
    startTransition(async () => {
      try {
        const result = await operation();
        if (result.error) {
          setFeedback({ type: "error", message: result.error });
          return;
        }
        setFeedback({ type: "success", message: result.message ?? successMessage });
        afterSuccess?.();
      } catch {
        setFeedback({
          type: "error",
          message: "We could not complete that inventory integration action. Please try again.",
        });
      } finally {
        setPendingKey(null);
      }
    });
  }

  function saveSource(input: ManagedFeedSourceInput) {
    const editing = sourceEditor !== "new" ? sourceEditor : null;
    perform(
      editing ? `source:${editing.id}` : "source:create",
      editing ? `${editing.name} has been updated.` : "Inventory source created.",
      () => editing ? actions.updateSource(editing.id, input) : actions.createSource(input),
      () => setSourceEditor(null),
    );
  }

  function saveDestination(input: InventoryExportDestinationInput) {
    const editing = destinationEditor !== "new" ? destinationEditor : null;
    perform(
      editing ? `destination:${editing.id}` : "destination:create",
      editing ? `${editing.name} has been updated.` : "Export destination created.",
      () => editing
        ? actions.updateDestination(editing.id, input)
        : actions.createDestination(input),
      () => setDestinationEditor(null),
    );
  }

  return (
    <div className="max-w-6xl space-y-8">
      <section className="rounded-2xl border bg-gradient-to-br from-muted/55 to-background p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Activity className="size-4 text-primary" />
              Inventory infrastructure
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Managed feeds & syndication</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Import supplier inventory without replacing customer history, then publish a
              deterministic, tenant-owned inventory feed to approved destinations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{sources.filter((source) => source.enabled).length} sources active</Badge>
            <Badge variant="outline">{destinations.filter((destination) => destination.enabled).length} exports active</Badge>
          </div>
        </div>
      </section>

      {!canManage ? (
        <Status type="error">
          Owner or admin access is required to change inventory integrations.
        </Status>
      ) : null}
      {feedback ? <Status type={feedback.type}>{feedback.message}</Status> : null}

      <section aria-labelledby="inventory-sources-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="inventory-sources-heading" className="text-xl font-semibold">Inventory sources</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              HTTPS-only supplier feeds are fetched server-side, validated, and synchronized in place.
            </p>
          </div>
          <Button type="button" onClick={() => setSourceEditor("new")} disabled={disabled}>
            <Plus /> Add inventory source
          </Button>
        </div>

        {sources.length === 0 ? (
          <EmptyState
            icon={<ArrowDownToLine className="size-5" />}
            title="No managed inventory sources"
            description="Add an HTTPS CSV, JSON, or XML feed. Existing manual CSV import remains available and unchanged."
            action={canManage ? (
              <Button type="button" onClick={() => setSourceEditor("new")} disabled={disabled}>
                <Plus /> Configure a source
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {sources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                disabled={disabled}
                pendingKey={pendingKey}
                onConfigure={() => setSourceEditor(source)}
                onToggle={() => perform(
                  `source:${source.id}`,
                  source.enabled ? `${source.name} paused.` : `${source.name} enabled.`,
                  () => actions.setSourceEnabled(source.id, !source.enabled),
                )}
                onRun={() => perform(
                  `source:run:${source.id}`,
                  `${source.name} has been queued for a manual sync.`,
                  () => actions.runSource(source.id),
                )}
                onRemove={() => perform(
                  `source:remove:${source.id}`,
                  `${source.name} has been removed.`,
                  () => actions.removeSource(source.id),
                )}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="inventory-exports-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="inventory-exports-heading" className="text-xl font-semibold">Syndication destinations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Publish CSV, JSON, or XML through a constrained mapping profile. Unchanged output is not delivered again.
            </p>
          </div>
          <Button type="button" onClick={() => setDestinationEditor("new")} disabled={disabled}>
            <Plus /> Add export destination
          </Button>
        </div>

        {destinations.length === 0 ? (
          <EmptyState
            icon={<ArrowUpFromLine className="size-5" />}
            title="No syndication destinations"
            description="Create a controlled inventory export for a marketplace, listing site, or other approved endpoint."
            action={canManage ? (
              <Button type="button" onClick={() => setDestinationEditor("new")} disabled={disabled}>
                <Plus /> Configure an export
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {destinations.map((destination) => (
              <DestinationCard
                key={destination.id}
                destination={destination}
                disabled={disabled}
                pendingKey={pendingKey}
                onConfigure={() => setDestinationEditor(destination)}
                onToggle={() => perform(
                  `destination:${destination.id}`,
                  destination.enabled ? `${destination.name} paused.` : `${destination.name} enabled.`,
                  () => actions.setDestinationEnabled(destination.id, !destination.enabled),
                )}
                onRun={() => perform(
                  `destination:run:${destination.id}`,
                  `${destination.name} has been queued for delivery.`,
                  () => actions.runDestination(destination.id),
                )}
                onRemove={() => perform(
                  `destination:remove:${destination.id}`,
                  `${destination.name} has been removed.`,
                  () => actions.removeDestination(destination.id),
                )}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="inventory-runs-heading" className="space-y-4">
        <div>
          <h2 id="inventory-runs-heading" className="text-xl font-semibold">Run history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent source syncs and export deliveries, including any safe-to-display failures.
          </p>
        </div>
        <RunHistoryTable runs={runs} />
      </section>

      <Dialog
        open={sourceEditor !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setSourceEditor(null);
        }}
      >
        {sourceEditor ? (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{sourceEditor === "new" ? "Add inventory source" : "Configure inventory source"}</DialogTitle>
              <DialogDescription>
                LUME fetches this HTTPS feed from the server. Profiles are declarative only—no scripts,
                templates, or credentials belong in the mapping JSON.
              </DialogDescription>
            </DialogHeader>
            <SourceEditorForm
              key={sourceEditor === "new" ? "new" : sourceEditor.id}
              source={sourceEditor === "new" ? null : sourceEditor}
              disabled={disabled}
              pending={pendingKey === "source:create" || (sourceEditor !== "new" && pendingKey === `source:${sourceEditor.id}`)}
              onCancel={() => setSourceEditor(null)}
              onSubmit={saveSource}
            />
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={destinationEditor !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDestinationEditor(null);
        }}
      >
        {destinationEditor ? (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{destinationEditor === "new" ? "Add export destination" : "Configure export destination"}</DialogTitle>
              <DialogDescription>
                The profile selects only allow-listed vehicle values and serializes deterministic CSV, JSON, or XML.
                Secret credentials stay encrypted server-side.
              </DialogDescription>
            </DialogHeader>
            <DestinationEditorForm
              key={destinationEditor === "new" ? "new" : destinationEditor.id}
              destination={destinationEditor === "new" ? null : destinationEditor}
              disabled={disabled}
              pending={pendingKey === "destination:create" || (destinationEditor !== "new" && pendingKey === `destination:${destinationEditor.id}`)}
              onCancel={() => setDestinationEditor(null)}
              onSubmit={saveDestination}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function SourceCard({
  source,
  disabled,
  pendingKey,
  onConfigure,
  onToggle,
  onRun,
  onRemove,
}: {
  source: InventoryFeedSourceRow;
  disabled: boolean;
  pendingKey: string | null;
  onConfigure: () => void;
  onToggle: () => void;
  onRun: () => void;
  onRemove: () => void;
}) {
  const isRunning = pendingKey === `source:run:${source.id}`;
  const isToggling = pendingKey === `source:${source.id}`;
  const isRemoving = pendingKey === `source:remove:${source.id}`;

  return (
    <Card className={!source.enabled ? "opacity-75" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{source.name}</CardTitle>
              <Badge variant="secondary" className="uppercase">{source.format}</Badge>
              <HealthBadge health={source.health} />
            </div>
            <CardDescription className="mt-2 break-all font-mono text-xs">
              {source.sourceKind === "storage"
                ? source.sourceObjectPath ?? "Private storage object"
                : redactEndpointUrl(source.endpointUrl)}
            </CardDescription>
          </div>
          <Switch
            checked={source.enabled}
            disabled={disabled}
            onCheckedChange={onToggle}
            aria-label={`${source.enabled ? "Pause" : "Enable"} ${source.name}`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Metadata label="Sync mode" value={source.mode === "hybrid" ? "Hybrid—preserve absent values" : "Mirror—clear mapped blanks"} />
          <Metadata label="Schedule" value={source.enabled ? everyMinutes(source.scheduleMinutes) : "Paused"} />
          <Metadata label="Last successful sync" value={formatDate(source.lastSucceededAt, "Never")} />
          <Metadata label="Authentication" value={source.credentialsConfigured ? `${AUTH_LABELS[source.authKind]} configured` : "No credentials"} />
        </dl>
        {source.lastError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
            <span className="font-medium">Last issue: </span>{source.lastError}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2">
        <p className="text-xs text-muted-foreground">Last attempted {formatDate(source.lastAttemptAt, "never")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onConfigure} disabled={disabled || source.sourceKind !== "https"}>
            Configure
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onToggle} disabled={disabled || isToggling}>
            {isToggling ? <RefreshCw className="animate-spin" /> : source.enabled ? <Pause /> : <Play />}
            {isToggling ? "Saving…" : source.enabled ? "Pause" : "Enable"}
          </Button>
          <Button type="button" size="sm" onClick={onRun} disabled={disabled || isRunning}>
            <RefreshCw className={isRunning ? "animate-spin" : undefined} />
            {isRunning ? "Queueing…" : "Run now"}
          </Button>
          <ConfirmActionDialog
            title={`Archive ${source.name}?`}
            description="This stops future runs and removes its encrypted credentials. Historical run records remain available for audit. Wait for an active run to finish first."
            actionLabel="Archive source"
            onConfirm={onRemove}
          >
            <Button type="button" size="sm" variant="ghost" disabled={disabled || isRemoving} className="text-destructive hover:text-destructive">
              <Trash2 />
              Archive
            </Button>
          </ConfirmActionDialog>
        </div>
      </CardFooter>
    </Card>
  );
}

function DestinationCard({
  destination,
  disabled,
  pendingKey,
  onConfigure,
  onToggle,
  onRun,
  onRemove,
}: {
  destination: InventoryExportDestinationRow;
  disabled: boolean;
  pendingKey: string | null;
  onConfigure: () => void;
  onToggle: () => void;
  onRun: () => void;
  onRemove: () => void;
}) {
  const isRunning = pendingKey === `destination:run:${destination.id}`;
  const isToggling = pendingKey === `destination:${destination.id}`;
  const isRemoving = pendingKey === `destination:remove:${destination.id}`;

  return (
    <Card className={!destination.enabled ? "opacity-75" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{destination.name}</CardTitle>
              <Badge variant="secondary" className="uppercase">{destination.format}</Badge>
              <HealthBadge health={destination.health} />
            </div>
            <CardDescription className="mt-2 break-all font-mono text-xs">{redactEndpointUrl(destination.endpointUrl)}</CardDescription>
          </div>
          <Switch
            checked={destination.enabled}
            disabled={disabled}
            onCheckedChange={onToggle}
            aria-label={`${destination.enabled ? "Pause" : "Enable"} ${destination.name}`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Metadata label="Schedule" value={destination.enabled ? everyMinutes(destination.scheduleMinutes) : "Paused"} />
          <Metadata label="Delivery method" value={destination.httpMethod} />
          <Metadata label="Last delivery" value={formatDate(destination.lastSucceededAt, "Never")} />
          <Metadata label="No-op check" value={destination.lastSemanticHashAt ? `Compared ${formatDate(destination.lastSemanticHashAt, "recently")}` : "Awaiting first export"} />
          <Metadata label="Authentication" value={destination.credentialsConfigured ? `${AUTH_LABELS[destination.authKind]} configured` : "No credentials"} />
        </dl>
        {destination.lastError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
            <span className="font-medium">Last issue: </span>{destination.lastError}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2">
        <p className="text-xs text-muted-foreground">Last attempted {formatDate(destination.lastAttemptAt, "never")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onConfigure} disabled={disabled}>
            Configure
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onToggle} disabled={disabled || isToggling}>
            {isToggling ? <RefreshCw className="animate-spin" /> : destination.enabled ? <Pause /> : <Play />}
            {isToggling ? "Saving…" : destination.enabled ? "Pause" : "Enable"}
          </Button>
          <Button type="button" size="sm" onClick={onRun} disabled={disabled || isRunning}>
            <RefreshCw className={isRunning ? "animate-spin" : undefined} />
            {isRunning ? "Queueing…" : "Run now"}
          </Button>
          <ConfirmActionDialog
            title={`Archive ${destination.name}?`}
            description="This stops future deliveries and removes its encrypted credentials. Historical delivery records remain available for audit. Wait for an active delivery to finish first."
            actionLabel="Archive destination"
            onConfirm={onRemove}
          >
            <Button type="button" size="sm" variant="ghost" disabled={disabled || isRemoving} className="text-destructive hover:text-destructive">
              <Trash2 />
              Archive
            </Button>
          </ConfirmActionDialog>
        </div>
      </CardFooter>
    </Card>
  );
}

function SourceEditorForm({
  source,
  disabled,
  pending,
  onCancel,
  onSubmit,
}: {
  source: InventoryFeedSourceRow | null;
  disabled: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: ManagedFeedSourceInput) => void;
}) {
  const [format, setFormat] = useState<InventoryIntegrationFormat>(source?.format ?? "csv");
  const [mode, setMode] = useState<ManagedFeedMode>(source?.mode ?? "hybrid");
  const [authKind, setAuthKind] = useState<InventoryIntegrationAuthKind>(source?.authKind ?? "none");
  const [profileText, setProfileText] = useState(() => prettyJson(source?.mappingProfile ?? SOURCE_PROFILE_EXAMPLE));
  const [error, setError] = useState<string | null>(null);

  function onFormatChange(next: InventoryIntegrationFormat) {
    setFormat(next);
    setProfileText((current) => updateProfileFormat(current, next));
  }

  function onModeChange(next: ManagedFeedMode) {
    setMode(next);
    setProfileText((current) => updateProfileMode(current, next));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const profile = parseSafeProfile(profileText, "Source mapping profile");
    if (!profile.ok) {
      setError(profile.error);
      return;
    }
    if (profile.value.format !== format) {
      setError("The source format must match the profile’s format field.");
      return;
    }
    if (profile.value.mode !== undefined && profile.value.mode !== mode) {
      setError("The sync mode must match the profile’s mode field.");
      return;
    }
    const auth = readAuthInput(form, authKind, source);
    if (auth.error) {
      setError(auth.error);
      return;
    }
    const name = readRequired(form, "name", "Source name");
    const endpointUrl = readHttpsUrl(form, "endpointUrl", "Source URL");
    const scheduleMinutes = readSchedule(form);
    if (!name.ok) {
      setError(name.error);
      return;
    }
    if (!endpointUrl.ok) {
      setError(endpointUrl.error);
      return;
    }
    if (!scheduleMinutes.ok) {
      setError(scheduleMinutes.error);
      return;
    }
    onSubmit({
      name: name.value,
      endpointUrl: endpointUrl.value,
      profile: profile.value,
      mode,
      scheduleMinutes: scheduleMinutes.value,
      ...(auth.value ? { auth: auth.value } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5 py-2">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Source name" htmlFor="source-name">
          <Input id="source-name" name="name" required maxLength={100} defaultValue={source?.name} placeholder="Homenet production feed" />
        </Field>
        <Field label="Feed format" htmlFor="source-format">
          <select id="source-format" value={format} onChange={(event) => onFormatChange(event.target.value as InventoryIntegrationFormat)} disabled={disabled} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="xml">XML</option>
          </select>
        </Field>
        <Field label="Public HTTPS feed URL" htmlFor="source-endpoint" className="md:col-span-2">
          <Input id="source-endpoint" name="endpointUrl" type="url" required maxLength={2_048} defaultValue={source ? safeEndpointValue(source.endpointUrl) : undefined} placeholder={source && hasSensitiveUrlQuery(source.endpointUrl) ? "Re-enter a credential-free HTTPS URL" : "https://inventory.example.com/feed.csv"} inputMode="url" autoCapitalize="none" autoCorrect="off" />
        </Field>
        <Field label="Update mode" htmlFor="source-mode">
          <select id="source-mode" value={mode} onChange={(event) => onModeChange(event.target.value as ManagedFeedMode)} disabled={disabled} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="hybrid">Hybrid — preserve values absent from the feed</option>
            <option value="mirror">Mirror — clear mapped blank values</option>
          </select>
        </Field>
        <Field label="Run every (minutes)" htmlFor="source-schedule">
          <Input id="source-schedule" name="scheduleMinutes" type="number" min={15} max={10_080} required defaultValue={source?.scheduleMinutes ?? 60} disabled={disabled} />
        </Field>
      </div>

      <div className="rounded-xl border bg-muted/25 p-4 text-sm">
        <p className="font-medium">Non-destructive synchronization</p>
        <p className="mt-1 leading-6 text-muted-foreground">
          Matching is VIN-first with stock/external-ID fallback. Normal runs update matching vehicles in place and never delete or recreate customer, lead, saved-vehicle, or managed-R2 data.
        </p>
      </div>

      <Field label="Safe mapping profile (JSON)" htmlFor="source-profile" hint="Use literal headers or paths only. The profile cannot run code. Keep authentication values out of this field.">
        <Textarea id="source-profile" value={profileText} onChange={(event) => setProfileText(event.target.value)} rows={14} maxLength={20_000} spellCheck={false} className="font-mono text-xs" disabled={disabled} />
      </Field>

      <AuthFields
        prefix="source"
        authKind={authKind}
        onAuthKindChange={setAuthKind}
        existingCredentialsConfigured={Boolean(source?.credentialsConfigured)}
        existingAuthKind={source?.authKind ?? "none"}
        disabled={disabled}
      />

      {error ? <InlineError>{error}</InlineError> : null}
      <DialogFooter className="gap-2 sm:justify-between">
        <p className="text-xs text-muted-foreground">The endpoint is revalidated server-side before every fetch.</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>Cancel</Button>
          <Button type="submit" disabled={disabled}>
            {pending ? <RefreshCw className="animate-spin" /> : <ShieldCheck />}
            {pending ? "Saving…" : source ? "Save source" : "Create source"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function DestinationEditorForm({
  destination,
  disabled,
  pending,
  onCancel,
  onSubmit,
}: {
  destination: InventoryExportDestinationRow | null;
  disabled: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: InventoryExportDestinationInput) => void;
}) {
  const [format, setFormat] = useState<InventoryIntegrationFormat>(destination?.format ?? "csv");
  const [httpMethod, setHttpMethod] = useState<InventoryIntegrationHttpMethod>(destination?.httpMethod ?? "POST");
  const [authKind, setAuthKind] = useState<InventoryIntegrationAuthKind>(destination?.authKind ?? "none");
  const [profileText, setProfileText] = useState(() => prettyJson(destination?.mappingProfile ?? EXPORT_PROFILE_EXAMPLE));
  const [error, setError] = useState<string | null>(null);

  function onFormatChange(next: InventoryIntegrationFormat) {
    setFormat(next);
    setProfileText((current) => updateProfileFormat(current, next));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const profile = parseSafeProfile(profileText, "Export mapping profile");
    if (!profile.ok) {
      setError(profile.error);
      return;
    }
    if (profile.value.format !== format) {
      setError("The output format must match the profile’s format field.");
      return;
    }
    const auth = readAuthInput(form, authKind, destination);
    if (auth.error) {
      setError(auth.error);
      return;
    }
    const name = readRequired(form, "name", "Destination name");
    const endpointUrl = readHttpsUrl(form, "endpointUrl", "Destination URL");
    const scheduleMinutes = readSchedule(form);
    if (!name.ok) {
      setError(name.error);
      return;
    }
    if (!endpointUrl.ok) {
      setError(endpointUrl.error);
      return;
    }
    if (!scheduleMinutes.ok) {
      setError(scheduleMinutes.error);
      return;
    }
    onSubmit({
      name: name.value,
      endpointUrl: endpointUrl.value,
      httpMethod,
      profile: profile.value,
      scheduleMinutes: scheduleMinutes.value,
      ...(auth.value ? { auth: auth.value } : {}),
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5 py-2">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Destination name" htmlFor="destination-name">
          <Input id="destination-name" name="name" required maxLength={100} defaultValue={destination?.name} placeholder="Marketplace inventory endpoint" />
        </Field>
        <Field label="Output format" htmlFor="destination-format">
          <select id="destination-format" value={format} onChange={(event) => onFormatChange(event.target.value as InventoryIntegrationFormat)} disabled={disabled} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="xml">XML</option>
          </select>
        </Field>
        <Field label="Delivery method" htmlFor="destination-method">
          <select id="destination-method" value={httpMethod} onChange={(event) => setHttpMethod(event.target.value as InventoryIntegrationHttpMethod)} disabled={disabled} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
          </select>
        </Field>
        <Field label="Public HTTPS endpoint" htmlFor="destination-endpoint" className="md:col-span-2">
          <Input id="destination-endpoint" name="endpointUrl" type="url" required maxLength={2_048} defaultValue={destination ? safeEndpointValue(destination.endpointUrl) : undefined} placeholder={destination && hasSensitiveUrlQuery(destination.endpointUrl) ? "Re-enter a credential-free HTTPS URL" : "https://partner.example.com/lume/inventory"} inputMode="url" autoCapitalize="none" autoCorrect="off" />
        </Field>
        <Field label="Run every (minutes)" htmlFor="destination-schedule">
          <Input id="destination-schedule" name="scheduleMinutes" type="number" min={15} max={10_080} required defaultValue={destination?.scheduleMinutes ?? 60} disabled={disabled} />
        </Field>
      </div>

      <div className="rounded-xl border bg-muted/25 p-4 text-sm">
        <p className="font-medium">Semantic no-op protection</p>
        <p className="mt-1 leading-6 text-muted-foreground">
          LUME hashes the mapped output before delivery. If the destination would receive the same inventory again, it records a skipped run instead of sending a redundant request.
        </p>
      </div>

      <Field label="Safe export profile (JSON)" htmlFor="destination-profile" hint="Choose allow-listed vehicle fields or literal values only. The profile cannot execute expressions, templates, or code.">
        <Textarea id="destination-profile" value={profileText} onChange={(event) => setProfileText(event.target.value)} rows={14} maxLength={20_000} spellCheck={false} className="font-mono text-xs" disabled={disabled} />
      </Field>

      <AuthFields
        prefix="destination"
        authKind={authKind}
        onAuthKindChange={setAuthKind}
        existingCredentialsConfigured={Boolean(destination?.credentialsConfigured)}
        existingAuthKind={destination?.authKind ?? "none"}
        disabled={disabled}
      />

      {error ? <InlineError>{error}</InlineError> : null}
      <DialogFooter className="gap-2 sm:justify-between">
        <p className="text-xs text-muted-foreground">Each delivery URL is validated server-side before it is contacted.</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>Cancel</Button>
          <Button type="submit" disabled={disabled}>
            {pending ? <RefreshCw className="animate-spin" /> : <ShieldCheck />}
            {pending ? "Saving…" : destination ? "Save destination" : "Create destination"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function AuthFields({
  prefix,
  authKind,
  onAuthKindChange,
  existingCredentialsConfigured,
  existingAuthKind,
  disabled,
}: {
  prefix: string;
  authKind: InventoryIntegrationAuthKind;
  onAuthKindChange: (value: InventoryIntegrationAuthKind) => void;
  existingCredentialsConfigured: boolean;
  existingAuthKind: InventoryIntegrationAuthKind;
  disabled: boolean;
}) {
  const preservingExisting = existingCredentialsConfigured && authKind === existingAuthKind;

  return (
    <fieldset className="grid gap-4 rounded-xl border p-4">
      <legend className="px-1 text-sm font-medium">Authentication</legend>
      <p className="-mt-2 text-sm text-muted-foreground">
        Credentials are encrypted at rest and never displayed here after saving.
        {preservingExisting ? " Leave fields blank to keep the current credentials." : ""}
      </p>
      <Field label="Authentication method" htmlFor={`${prefix}-auth-kind`}>
          <select id={`${prefix}-auth-kind`} value={authKind} onChange={(event) => onAuthKindChange(event.target.value as InventoryIntegrationAuthKind)} disabled={disabled} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
          {existingCredentialsConfigured ? <option value="configured">Configured credential (keep encrypted)</option> : null}
          <option value="none">None</option>
          <option value="bearer">Bearer token</option>
          <option value="basic">Basic authentication</option>
          <option value="custom">Custom header</option>
        </select>
      </Field>
      {authKind === "bearer" ? (
        <Field label="Bearer token" htmlFor={`${prefix}-bearer-token`}>
          <Input id={`${prefix}-bearer-token`} name="bearerToken" type="password" autoComplete="new-password" placeholder={preservingExisting ? "Configured — leave blank to keep" : "Paste token"} disabled={disabled} />
        </Field>
      ) : null}
      {authKind === "basic" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username" htmlFor={`${prefix}-basic-username`}>
            <Input id={`${prefix}-basic-username`} name="basicUsername" autoComplete="off" placeholder={preservingExisting ? "Configured — leave blank to keep" : "Username"} disabled={disabled} />
          </Field>
          <Field label="Password" htmlFor={`${prefix}-basic-password`}>
            <Input id={`${prefix}-basic-password`} name="basicPassword" type="password" autoComplete="new-password" placeholder={preservingExisting ? "Configured — leave blank to keep" : "Password"} disabled={disabled} />
          </Field>
        </div>
      ) : null}
      {authKind === "custom" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Header name" htmlFor={`${prefix}-custom-header-name`}>
            <Input id={`${prefix}-custom-header-name`} name="customHeaderName" autoComplete="off" placeholder={preservingExisting ? "Configured — leave blank to keep" : "X-Partner-Key"} disabled={disabled} />
          </Field>
          <Field label="Header value" htmlFor={`${prefix}-custom-header-value`}>
            <Input id={`${prefix}-custom-header-value`} name="customHeaderValue" type="password" autoComplete="new-password" placeholder={preservingExisting ? "Configured — leave blank to keep" : "Header value"} disabled={disabled} />
          </Field>
        </div>
      ) : null}
    </fieldset>
  );
}

function RunHistoryTable({ runs }: { runs: readonly InventoryIntegrationRunRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <caption className="sr-only">Recent inventory source and export runs</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Integration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Records</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Finished</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                No managed source or syndication runs yet.
              </TableCell>
            </TableRow>
          ) : null}
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {run.targetKind === "source" ? <ArrowDownToLine className="size-3.5 text-muted-foreground" /> : <ArrowUpFromLine className="size-3.5 text-muted-foreground" />}
                  <div>
                    <p className="font-medium">{run.targetName}</p>
                    <p className="text-xs capitalize text-muted-foreground">{run.targetKind}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <RunStatusBadge status={run.status} />
                {run.lastError ? <p className="mt-1 max-w-64 truncate text-xs text-destructive" title={run.lastError}>{run.lastError}</p> : null}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{runSummary(run)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{run.attemptCount}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDate(run.completedAt ?? run.createdAt, "—")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center">
      <div className="rounded-full bg-muted p-3 text-muted-foreground">{icon}</div>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  const helpId = hint ? `${htmlFor}-help` : undefined;
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p id={helpId} className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

function Status({ type, children }: { type: "success" | "error"; children: ReactNode }) {
  const success = type === "success";
  return (
    <p
      role={success ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${success ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-destructive/30 bg-destructive/5 text-destructive"}`}
    >
      {success ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

function HealthBadge({ health }: { health: InventoryIntegrationHealth }) {
  const classes: Record<InventoryIntegrationHealth, string> = {
    healthy: "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
    degraded: "border-amber-500/30 text-amber-700 dark:text-amber-300",
    failing: "border-destructive/30 text-destructive",
    unknown: "text-muted-foreground",
  };
  return <Badge variant="outline" className={classes[health]}>{HEALTH_LABELS[health]}</Badge>;
}

function RunStatusBadge({ status }: { status: InventoryIntegrationRunStatus }) {
  const classes: Partial<Record<InventoryIntegrationRunStatus, string>> = {
    succeeded: "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
    skipped: "border-sky-500/30 text-sky-700 dark:text-sky-300",
    partial: "border-amber-500/30 text-amber-700 dark:text-amber-300",
    cancelled: "text-muted-foreground",
    failed: "border-destructive/30 text-destructive",
    dead_letter: "border-destructive/30 text-destructive",
    running: "border-primary/30 text-primary",
    retrying: "border-amber-500/30 text-amber-700 dark:text-amber-300",
  };
  return (
    <Badge variant="outline" className={classes[status]}>
      {status === "running" ? <RefreshCw className="size-3 animate-spin" /> : status === "queued" ? <Clock3 className="size-3" /> : null}
      {status.replace("_", " ")}
    </Badge>
  );
}

function readRequired(
  form: FormData,
  key: string,
  label: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim()) return { ok: false, error: `${label} is required.` };
  return { ok: true, value: value.trim() };
}

function readHttpsUrl(
  form: FormData,
  key: string,
  label: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const raw = readRequired(form, key, label);
  if (!raw.ok) return raw;
  try {
    const url = new URL(raw.value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      return { ok: false, error: `${label} must be an HTTPS URL without embedded credentials or a fragment.` };
    }
    if (hasSensitiveUrlQuery(url.toString())) {
      return { ok: false, error: `${label} cannot contain credentials in query parameters. Use the authentication fields instead.` };
    }
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, error: `${label} must be a valid HTTPS URL.` };
  }
}

function readSchedule(
  form: FormData,
): { ok: true; value: number } | { ok: false; error: string } {
  const raw = form.get("scheduleMinutes");
  const value = typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isInteger(value) || value < 15 || value > 10_080) {
    return { ok: false, error: "Choose a whole-number schedule between 15 minutes and 7 days." };
  }
  return { ok: true, value };
}

function readAuthInput(
  form: FormData,
  kind: InventoryIntegrationAuthKind,
  existing: Pick<InventoryFeedSourceRow | InventoryExportDestinationRow, "authKind" | "credentialsConfigured"> | null,
): { value?: InventoryIntegrationAuthInput; error?: string } {
  if (kind === "configured") {
    return existing?.credentialsConfigured
      ? {}
      : { error: "Choose an authentication method for this new integration." };
  }
  if (kind === "none") return { value: { kind: "none" } };

  const hasExistingCredentials = Boolean(existing?.credentialsConfigured);
  const isUnchangedKind = hasExistingCredentials && existing?.authKind === kind;
  const bearerToken = formString(form, "bearerToken");
  const username = formString(form, "basicUsername");
  const password = formString(form, "basicPassword");
  const headerName = formString(form, "customHeaderName");
  const headerValue = formString(form, "customHeaderValue");

  if (kind === "bearer") {
    if (bearerToken) return { value: { kind, token: bearerToken } };
    return isUnchangedKind ? {} : { error: "A bearer token is required for this authentication method." };
  }
  if (kind === "basic") {
    if (username && password) return { value: { kind, username, password } };
    if (!username && !password && isUnchangedKind) return {};
    return { error: "Provide both a username and password for basic authentication." };
  }
  if (headerName && headerValue) {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(headerName)) {
      return { error: "Custom header names may contain only letters, numbers, and hyphens." };
    }
    return { value: { kind, headerName, headerValue } };
  }
  if (!headerName && !headerValue && isUnchangedKind) return {};
  return { error: "Provide both a custom header name and value." };
}

function parseSafeProfile(
  text: string,
  label: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (text.length > 20_000) return { ok: false, error: `${label} is too large.` };
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isPlainRecord(parsed)) return { ok: false, error: `${label} must be a JSON object.` };
    const sensitiveKey = findSensitiveProfileKey(parsed);
    if (sensitiveKey) {
      return { ok: false, error: `${label} cannot contain ${sensitiveKey}. Put credentials in the authentication fields instead.` };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: `${label} must be valid JSON.` };
  }
}

function findSensitiveProfileKey(value: Record<string, unknown>, path = ""): string | null {
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (isSensitiveManagedIntegrationQueryKey(key)) return nextPath;
    if (isPlainRecord(nested)) {
      const nestedKey = findSensitiveProfileKey(nested, nextPath);
      if (nestedKey) return nestedKey;
    }
    if (Array.isArray(nested)) {
      for (const [index, item] of nested.entries()) {
        if (isPlainRecord(item)) {
          const nestedKey = findSensitiveProfileKey(item, `${nextPath}[${index}]`);
          if (nestedKey) return nestedKey;
        }
      }
    }
  }
  return null;
}

function updateProfileFormat(profileText: string, format: InventoryIntegrationFormat): string {
  try {
    const parsed: unknown = JSON.parse(profileText);
    if (!isPlainRecord(parsed)) return profileText;
    return prettyJson({ ...parsed, format });
  } catch {
    return profileText;
  }
}

function updateProfileMode(profileText: string, mode: ManagedFeedMode): string {
  try {
    const parsed: unknown = JSON.parse(profileText);
    if (!isPlainRecord(parsed)) return profileText;
    return prettyJson({ ...parsed, mode });
  } catch {
    return profileText;
  }
}

function prettyJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function hasSensitiveUrlQuery(value: string): boolean {
  try {
    const url = new URL(value);
    return Array.from(url.searchParams.keys()).some(isSensitiveManagedIntegrationQueryKey);
  } catch {
    return false;
  }
}

function safeEndpointValue(value: string): string | undefined {
  return hasSensitiveUrlQuery(value) ? undefined : value;
}

function redactEndpointUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const [key] of url.searchParams) {
      if (isSensitiveManagedIntegrationQueryKey(key)) url.searchParams.set(key, "••••");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function everyMinutes(value: number | null): string {
  if (!value) return "Manual only";
  if (value >= 1_440 && value % 1_440 === 0) return `Every ${value / 1_440} day${value === 1_440 ? "" : "s"}`;
  if (value >= 60 && value % 60 === 0) return `Every ${value / 60} hour${value === 60 ? "" : "s"}`;
  return `Every ${value} minutes`;
}

function formatDate(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function runSummary(run: InventoryIntegrationRunRow): string {
  if (run.status === "skipped") return "No inventory changes";
  const parts: string[] = [];
  if (run.totalRecords !== null) parts.push(`${run.totalRecords} total`);
  if (run.createdRecords) parts.push(`${run.createdRecords} created`);
  if (run.updatedRecords) parts.push(`${run.updatedRecords} updated`);
  if (run.skippedRecords) parts.push(`${run.skippedRecords} skipped`);
  if (run.failedRecords) parts.push(`${run.failedRecords} failed`);
  if (run.responseStatus) parts.push(`HTTP ${run.responseStatus}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}
