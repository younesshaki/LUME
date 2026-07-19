"use client";

import { useMemo, useState } from "react";
import { Bot, CircleDot, Plus, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import {
  CONCIERGE_TARGET_KINDS,
  type ConciergeTarget,
  type ConciergeTargetConfig,
  type ConciergeTargetKind,
} from "@lume/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import {
  resetConciergeTargetAction,
  saveConciergeTargetAction,
} from "./actions";

type Props = {
  tenantSlug: string;
  tenantName: string;
  initialTargets: ConciergeTarget[];
  migrationWarning: string | null;
  canManage: boolean;
};

type EditorState = {
  originalKey: string | null;
  builtIn: boolean;
  target: ConciergeTargetConfig;
};

type Feedback =
  | { type: "idle"; message: "" }
  | { type: "success" | "error"; message: string };

export default function ConciergeTargetsClient({
  tenantSlug,
  tenantName,
  initialTargets,
  migrationWarning,
  canManage,
}: Props) {
  const [targets, setTargets] = useState(initialTargets);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({ type: "idle", message: "" });
  const enabledCount = useMemo(
    () => targets.filter((target) => target.enabled).length,
    [targets],
  );
  const mutable = canManage && !migrationWarning;

  async function persist(
    target: ConciergeTargetConfig,
    originalKey: string | null,
    closeEditor = false,
  ) {
    setWorkingKey(target.key);
    setFeedback({ type: "idle", message: "" });
    try {
      const result = await saveConciergeTargetAction(
        tenantSlug,
        target,
        originalKey,
      );
      if (!result.ok) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setTargets(result.targets);
      if (closeEditor) setEditor(null);
      setFeedback({ type: "success", message: `${target.label} saved.` });
    } catch {
      setFeedback({ type: "error", message: "Unable to save this target right now." });
    } finally {
      setWorkingKey(null);
    }
  }

  async function resetTarget(target: ConciergeTarget) {
    const confirmed = window.confirm(
      target.builtIn
        ? `Restore ${target.label} to its built-in settings?`
        : `Delete ${target.label}? This cannot be undone.`,
    );
    if (!confirmed) return;
    setWorkingKey(target.key);
    setFeedback({ type: "idle", message: "" });
    try {
      const result = await resetConciergeTargetAction(tenantSlug, target.key);
      if (!result.ok) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setTargets(result.targets);
      setEditor(null);
      setFeedback({
        type: "success",
        message: target.builtIn
          ? `${target.label} restored to its built-in settings.`
          : `${target.label} deleted.`,
      });
    } catch {
      setFeedback({ type: "error", message: "Unable to update this target right now." });
    } finally {
      setWorkingKey(null);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="Concierge Targets"
        description={`Choose the safe public destinations the AI Concierge may use for ${tenantName}.`}
      />

      <div className="grid gap-4 rounded-2xl border bg-gradient-to-br from-muted/55 to-background p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="font-medium">Targets connect conversation intent to real website actions.</p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            The concierge can only use enabled targets. Conversion targets tell it where to guide
            visitors who ask for follow-up, without giving it arbitrary access to website routes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{enabledCount} enabled</Badge>
          <Badge variant="secondary">{targets.length} configured</Badge>
        </div>
      </div>

      {migrationWarning ? (
        <Status type="error">{migrationWarning}</Status>
      ) : null}
      {!canManage ? (
        <Status type="error">Owner or admin access is required to change targets.</Status>
      ) : null}
      {feedback.type !== "idle" ? (
        <Status type={feedback.type}>{feedback.message}</Status>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => setEditor(newTargetEditor(targets))}
          disabled={!mutable || Boolean(workingKey)}
        >
          <Plus /> Add target
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {targets.map((target) => (
          <Card key={target.key} className={!target.enabled ? "opacity-70" : undefined}>
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{target.label}</CardTitle>
                    {target.builtIn ? <Badge variant="outline">Built-in</Badge> : null}
                    {target.isConversion ? (
                      <Badge className="gap-1"><Sparkles className="size-3" /> Conversion</Badge>
                    ) : null}
                  </div>
                  <CardDescription className="mt-2 font-mono text-xs">
                    {target.key} · {target.kind} · {target.destination}
                  </CardDescription>
                </div>
                <Switch
                  aria-label={`${target.enabled ? "Disable" : "Enable"} ${target.label}`}
                  checked={target.enabled}
                  disabled={!mutable || Boolean(workingKey)}
                  onCheckedChange={(enabled) =>
                    void persist(
                      { ...configFromTarget(target), enabled },
                      target.key,
                    )
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">{target.aiDescription}</p>
              {target.examplePrompts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {target.examplePrompts.map((prompt) => (
                    <Badge key={prompt} variant="secondary" className="font-normal">
                      “{prompt}”
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!mutable || Boolean(workingKey)}
                  onClick={() => setEditor({
                    originalKey: target.key,
                    builtIn: target.builtIn,
                    target: configFromTarget(target),
                  })}
                >
                  Configure
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        {editor ? (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editor.originalKey ? "Configure target" : "Add target"}</DialogTitle>
              <DialogDescription>
                Describe when the concierge should use this destination. Paths are limited to safe
                public routes; forms and modals require a registered # handler.
              </DialogDescription>
            </DialogHeader>
            <TargetEditor editor={editor} onChange={setEditor} />
            <DialogFooter className="gap-2 sm:justify-between">
              {editor.originalKey ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!mutable || Boolean(workingKey)}
                  onClick={() => {
                    const current = targets.find((target) => target.key === editor.originalKey);
                    if (current) void resetTarget(current);
                  }}
                >
                  {editor.builtIn ? <RotateCcw /> : <Trash2 />}
                  {editor.builtIn ? "Restore built-in" : "Delete target"}
                </Button>
              ) : <span />}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!mutable || Boolean(workingKey)}
                  onClick={() =>
                    void persist(editor.target, editor.originalKey, true)
                  }
                >
                  <Save />
                  {workingKey === editor.target.key ? "Saving…" : "Save target"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function TargetEditor({
  editor,
  onChange,
}: {
  editor: EditorState;
  onChange: (next: EditorState) => void;
}) {
  const update = (next: Partial<ConciergeTargetConfig>) =>
    onChange({ ...editor, target: { ...editor.target, ...next } });

  return (
    <div className="grid gap-5 py-2">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Stable key">
          <Input
            value={editor.target.key}
            disabled={Boolean(editor.originalKey)}
            onChange={(event) => update({ key: slugifyKey(event.target.value) })}
            placeholder="trade-in"
          />
        </Field>
        <Field label="Admin label">
          <Input
            value={editor.target.label}
            onChange={(event) => update({ label: event.target.value })}
            placeholder="Trade-in form"
          />
        </Field>
        <Field label="Target kind">
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={editor.target.kind}
            onChange={(event) => update({ kind: event.target.value as ConciergeTargetKind })}
          >
            {CONCIERGE_TARGET_KINDS.map((kind) => (
              <option key={kind} value={kind}>{kindLabel(kind)}</option>
            ))}
          </select>
        </Field>
        <Field label="Public destination">
          <Input
            value={editor.target.destination}
            onChange={(event) => update({ destination: event.target.value })}
            placeholder="/trade-in#trade-in-form"
          />
        </Field>
      </div>

      <Field label="When should the AI use it?">
        <Textarea
          value={editor.target.aiDescription}
          rows={5}
          onChange={(event) => update({ aiDescription: event.target.value })}
          placeholder="Use when a visitor asks for…"
        />
      </Field>
      <Field label="Example visitor prompts (one per line)">
        <Textarea
          value={editor.target.examplePrompts.join("\n")}
          rows={4}
          onChange={(event) =>
            update({
              examplePrompts: event.target.value
                .split(/\r?\n/)
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
          placeholder={"What is my car worth?\nCan I trade my current vehicle?"}
        />
      </Field>

      <div className="grid gap-3 rounded-xl border p-4 md:grid-cols-2">
        <ToggleRow
          icon={<CircleDot className="size-4" />}
          label="Enabled"
          description="Make this target available to the concierge."
          checked={editor.target.enabled}
          onCheckedChange={(enabled) => update({ enabled })}
        />
        <ToggleRow
          icon={<Bot className="size-4" />}
          label="Conversion target"
          description="Guide qualified visitors here when intent matches."
          checked={editor.target.isConversion}
          onCheckedChange={(isConversion) => update({ isConversion })}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="grid gap-2">
      <span>{label}</span>
      {children}
    </Label>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span className="flex gap-2">
        {icon}
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function Status({
  type,
  children,
}: {
  type: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={
        type === "error"
          ? "rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          : "rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300"
      }
    >
      {children}
    </div>
  );
}

function configFromTarget(target: ConciergeTarget): ConciergeTargetConfig {
  return {
    key: target.key,
    label: target.label,
    kind: target.kind,
    destination: target.destination,
    aiDescription: target.aiDescription,
    isConversion: target.isConversion,
    enabled: target.enabled,
    examplePrompts: [...target.examplePrompts],
    sortOrder: target.sortOrder,
  };
}

function newTargetEditor(targets: readonly ConciergeTarget[]): EditorState {
  const key = uniqueNewKey(new Set(targets.map((target) => target.key)));
  return {
    originalKey: null,
    builtIn: false,
    target: {
      key,
      label: "New website target",
      kind: "section-anchor",
      destination: "/home#new-target",
      aiDescription: "Explain what this section offers and when the concierge should use it.",
      isConversion: false,
      enabled: false,
      examplePrompts: [],
      sortOrder: (targets.at(-1)?.sortOrder ?? 0) + 10,
    },
  };
}

function uniqueNewKey(existing: ReadonlySet<string>): string {
  let index = 1;
  while (existing.has(`new-target-${index}`)) index += 1;
  return `new-target-${index}`;
}

function slugifyKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64);
}

function kindLabel(kind: ConciergeTargetKind): string {
  switch (kind) {
    case "route": return "Route";
    case "section-anchor": return "Section anchor";
    case "form": return "Form";
    case "modal": return "Modal";
  }
}
