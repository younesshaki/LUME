"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  Check,
  Eye,
  Gauge,
  Layers3,
  LoaderCircle,
  Repeat2,
  Sparkles,
} from "lucide-react";
import {
  listSiteTemplates,
  resolveModeColors,
  type SiteMode,
  type SiteTemplate,
  type SiteTemplateSpecialty,
} from "@lume/types";
import FluidTabs from "@/components/animata/tabs/fluid-tabs";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import type { DesignDraftSummary } from "@/lib/siteDesign.server";
import { saveDesignDraft } from "@/lib/siteDesignDraft";
import { prepareWebsiteTemplateDraftAction } from "./actions";

type TemplatesClientProps = {
  tenantSlug: string;
  tenantName: string;
  publishedDesign: import("@lume/types").SiteDesign;
  initialDrafts: DesignDraftSummary[];
  canManage: boolean;
};

const SPECIALTY_LABELS: Record<SiteTemplateSpecialty, string> = {
  luxury: "Curated retail",
  finance: "Finance focused",
  "test-drive": "Test-drive focused",
  appointment: "Appointment focused",
  "trade-in": "Trade-in focused",
};

const SPECIALTY_ICONS: Record<
  SiteTemplateSpecialty,
  typeof Sparkles
> = {
  luxury: Sparkles,
  finance: BadgeDollarSign,
  "test-drive": Gauge,
  appointment: CalendarClock,
  "trade-in": Repeat2,
};

export default function TemplatesClient({
  tenantSlug,
  tenantName,
  publishedDesign,
  initialDrafts,
  canManage,
}: TemplatesClientProps) {
  const router = useRouter();
  const templates = listSiteTemplates();
  const draftsByTemplate = useMemo(
    () => new Map(initialDrafts.map((draft) => [draft.templateKey, draft])),
    [initialDrafts],
  );
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<SiteMode>("dark");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const preview = templates.find((template) => template.key === previewKey) ?? null;
  const pending = templates.find((template) => template.key === pendingKey) ?? null;

  function openPreview(templateKey: string) {
    setPreviewMode("dark");
    setPreviewKey(templateKey);
  }

  function continueDraft(templateKey: string) {
    router.push(`/admin/${tenantSlug}/design?template=${encodeURIComponent(templateKey)}`);
  }

  async function prepareTemplate() {
    if (!pending || !canManage) return;
    const templateKey = pending.key;
    setPendingKey(null);
    setWorkingKey(templateKey);
    setError("");
    const result = await prepareWebsiteTemplateDraftAction(tenantSlug, templateKey);
    setWorkingKey(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    // Immediate same-browser fallback while the server-rendered Design page
    // loads the durable row.
    saveDesignDraft(window.sessionStorage, tenantSlug, result.draft.design);
    continueDraft(templateKey);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Website Templates"
        description={`Choose the conversion strategy and visual starting point for ${tenantName}. Nothing changes publicly until you publish.`}
      />

      <div className="grid gap-4 rounded-2xl border bg-gradient-to-br from-muted/55 to-background p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="font-medium">Templates change the website&apos;s visual design and conversion emphasis.</p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            They do not replace inventory, pages, leads, customers, contact details, branding, or navigation.
            Each template keeps its own autosaved working draft.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">{templates.length} built-in templates</Badge>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const selected = publishedDesign.template.key === template.key;
          const savedDraft = draftsByTemplate.get(template.key);
          const working = workingKey === template.key;
          const SpecialtyIcon = SPECIALTY_ICONS[template.specialty];

          return (
            <Card
              key={template.key}
              className="group relative overflow-hidden transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg"
            >
              <CardContent className="p-3 pb-0">
                <TemplatePreview template={template} mode="dark" />
              </CardContent>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1.5">
                    <SpecialtyIcon className="size-3.5" />
                    {SPECIALTY_LABELS[template.specialty]}
                  </Badge>
                  {selected ? <Badge variant="secondary"><Check /> Live</Badge> : null}
                  {savedDraft ? <Badge>Draft saved</Badge> : null}
                </div>
                <div>
                  <CardTitle className="text-xl">{template.name}</CardTitle>
                  <CardDescription className="mt-1 min-h-12">{template.description}</CardDescription>
                </div>
                {savedDraft ? (
                  <p className="text-xs text-muted-foreground">
                    Working draft updated{" "}
                    <time dateTime={savedDraft.updatedAt} suppressHydrationWarning>
                      {new Date(savedDraft.updatedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </p>
                ) : null}
              </CardHeader>
              <CardFooter className="mt-auto flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => openPreview(template.key)}>
                  <Eye /> Preview
                </Button>
                <Button
                  disabled={!canManage || working}
                  onClick={() => savedDraft ? continueDraft(template.key) : setPendingKey(template.key)}
                >
                  {working ? <LoaderCircle className="animate-spin" /> : savedDraft ? <ArrowRight /> : <Layers3 />}
                  {working ? "Preparing…" : savedDraft ? "Continue draft" : selected ? "Customize" : "Use template"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground" role="status">
          Owner or admin access is required to prepare and publish a website design.
        </p>
      ) : null}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreviewKey(null)}>
        <DialogContent className="sm:max-w-4xl">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle>{preview.name} website preview</DialogTitle>
                <DialogDescription>
                  {preview.description} Dark and light are independent, intentional website modes.
                </DialogDescription>
              </DialogHeader>
              <FluidTabs
                activeIndex={previewMode === "dark" ? 0 : 1}
                onActiveIndexChange={(index) => setPreviewMode(index === 0 ? "dark" : "light")}
                className="max-w-none justify-start"
              >
                <FluidTabs.List aria-label="Template preview mode">
                  <FluidTabs.Tab>Website dark mode</FluidTabs.Tab>
                  <FluidTabs.Tab>Website light mode</FluidTabs.Tab>
                </FluidTabs.List>
              </FluidTabs>
              <TemplatePreview template={preview} mode={previewMode} labelled expanded />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPendingKey(null)}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Start a {pending?.name} working draft?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p>
                  This creates an autosaved draft with {pending?.name}&apos;s shared settings,
                  dark mode, light mode, and {pending ? SPECIALTY_LABELS[pending.specialty].toLowerCase() : "conversion"} experience.
                </p>
                <p>Your logo, favicons, pages, navigation, contact details, inventory, and domains stay intact.</p>
                <p className="font-medium text-foreground">Nothing changes on the public website until you explicitly publish.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void prepareTemplate()}>Prepare working draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplatePreview({
  template,
  mode,
  labelled = false,
  expanded = false,
}: {
  template: SiteTemplate;
  mode: SiteMode;
  labelled?: boolean;
  expanded?: boolean;
}) {
  const colors = resolveModeColors(
    {
      schemaVersion: 2,
      template: { key: template.key, version: template.version },
      shared: {},
      modes: { dark: {}, light: {} },
    },
    template,
    mode,
  );
  const style = {
    "--preview-bg": colors.background,
    "--preview-ink": colors.ink,
    "--preview-muted": colors.muted,
    "--preview-line": colors.line,
    "--preview-accent": colors.gold,
    "--preview-panel": colors.panel,
  } as CSSProperties;

  return (
    <div>
      {labelled ? (
        <p className="mb-2 text-xs font-medium">Previewing Website {mode} mode</p>
      ) : null}
      <div
        className={`relative overflow-hidden border bg-[var(--preview-bg)] text-[var(--preview-ink)] ${
          expanded ? "min-h-[420px] rounded-2xl p-6 sm:p-8" : "aspect-[16/10] rounded-xl p-4"
        }`}
        style={{ ...style, borderColor: colors.line }}
        data-template-preview={template.key}
        data-template-layout={template.visual.layout}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: previewBackdrop(template) }}
          aria-hidden
        />
        <div className="relative z-10">
          <div className="flex items-center justify-between border-b pb-3 text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ borderColor: colors.line }}>
            <span>{template.name}</span>
            <span style={{ color: colors.gold }}>{SPECIALTY_LABELS[template.specialty]}</span>
          </div>
          <PreviewScene template={template} expanded={expanded} />
        </div>
      </div>
    </div>
  );
}

function PreviewScene({ template, expanded }: { template: SiteTemplate; expanded: boolean }) {
  const compact = !expanded;
  const headingClass = compact
    ? "mt-5 max-w-[85%] text-lg font-semibold leading-[1.05]"
    : "mt-12 max-w-2xl text-4xl font-semibold leading-[1.02] sm:text-5xl";

  if (template.visual.layout === "precision-grid") {
    return (
      <div className="grid gap-4 sm:grid-cols-[1.25fr_.75fr]">
        <div>
          <p className="mt-5 text-[9px] uppercase tracking-[0.2em] text-[var(--preview-accent)]">{template.conversion.eyebrow}</p>
          <h3 className={headingClass}>{template.conversion.headline}</h3>
          {!compact ? <p className="mt-4 max-w-xl text-sm text-[var(--preview-muted)]">{template.conversion.description}</p> : null}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {["Budget", "Inventory", "Options", "Next step"].map((label, index) => (
            <div key={label} className="border bg-[var(--preview-panel)] p-3" style={{ borderColor: "var(--preview-line)" }}>
              <span className="text-[8px] uppercase text-[var(--preview-muted)]">{label}</span>
              <div className="mt-3 h-1.5 rounded-full bg-[var(--preview-accent)]" style={{ width: `${54 + index * 10}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (template.visual.layout === "kinetic-track") {
    return (
      <div className="relative">
        <div className="absolute -right-16 top-5 h-32 w-56 -skew-x-12 border border-[var(--preview-accent)] opacity-35" aria-hidden />
        <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--preview-accent)]">{template.conversion.eyebrow}</p>
        <h3 className={`${headingClass} uppercase italic`}>{template.conversion.headline}</h3>
        <div className="mt-6 inline-flex -skew-x-6 items-center gap-2 bg-[var(--preview-accent)] px-4 py-2 text-[10px] font-bold uppercase text-[var(--preview-bg)]">
          <span className="skew-x-6">{template.conversion.primaryLabel}</span>
          <ArrowRight className="size-3 skew-x-6" />
        </div>
      </div>
    );
  }

  if (template.visual.layout === "hospitality-suite") {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <p className="mt-6 text-[9px] uppercase tracking-[0.24em] text-[var(--preview-accent)]">{template.conversion.eyebrow}</p>
        <h3 className={`${headingClass} mx-auto max-w-xl`}>{template.conversion.headline}</h3>
        <div className="mx-auto mt-6 flex max-w-md items-center justify-between rounded-full border bg-[var(--preview-panel)] p-2 pl-4" style={{ borderColor: "var(--preview-line)" }}>
          <span className="text-[10px] text-[var(--preview-muted)]">Choose a comfortable time</span>
          <span className="rounded-full bg-[var(--preview-accent)] px-3 py-2 text-[9px] font-semibold text-[var(--preview-bg)]">Reserve</span>
        </div>
      </div>
    );
  }

  if (template.visual.layout === "equity-split") {
    return (
      <div className="grid items-end gap-5 sm:grid-cols-2">
        <div>
          <p className="mt-5 text-[9px] uppercase tracking-[0.22em] text-[var(--preview-accent)]">{template.conversion.eyebrow}</p>
          <h3 className={headingClass}>{template.conversion.headline}</h3>
        </div>
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="rounded-l-xl border bg-[var(--preview-panel)] p-4" style={{ borderColor: "var(--preview-line)" }}>
            <span className="text-[9px] text-[var(--preview-muted)]">Your trade</span>
            <div className="mt-4 h-8 rounded bg-[var(--preview-accent)]/20" />
          </div>
          <ArrowRight className="relative z-10 -mx-2 size-5 rounded-full bg-[var(--preview-accent)] p-1 text-[var(--preview-bg)]" />
          <div className="rounded-r-xl border bg-[var(--preview-panel)] p-4" style={{ borderColor: "var(--preview-line)" }}>
            <span className="text-[9px] text-[var(--preview-muted)]">What&apos;s next</span>
            <div className="mt-4 h-8 rounded border" style={{ borderColor: "var(--preview-accent)" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mt-6 text-[9px] uppercase tracking-[0.24em] text-[var(--preview-accent)]">{template.conversion.eyebrow}</p>
      <h3 className={`${headingClass} font-serif font-normal`}>{template.conversion.headline}</h3>
      {!compact ? <p className="mt-4 max-w-xl text-sm text-[var(--preview-muted)]">{template.conversion.description}</p> : null}
      <div className="mt-6 h-px w-24 bg-[var(--preview-accent)]" />
    </div>
  );
}

function previewBackdrop(template: SiteTemplate): string {
  if (template.visual.layout === "precision-grid") {
    return "linear-gradient(var(--preview-line) 1px, transparent 1px), linear-gradient(90deg, var(--preview-line) 1px, transparent 1px)";
  }
  if (template.visual.layout === "kinetic-track") {
    return "linear-gradient(118deg, transparent 52%, color-mix(in srgb, var(--preview-accent) 18%, transparent) 52%, transparent 68%)";
  }
  if (template.visual.layout === "hospitality-suite") {
    return "radial-gradient(circle at 50% 10%, color-mix(in srgb, var(--preview-accent) 20%, transparent), transparent 55%)";
  }
  if (template.visual.layout === "equity-split") {
    return "linear-gradient(90deg, color-mix(in srgb, var(--preview-accent) 9%, transparent) 0 49.8%, transparent 49.8% 50.2%, color-mix(in srgb, var(--preview-panel) 60%, transparent) 50.2%)";
  }
  return "radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--preview-accent) 17%, transparent), transparent 48%)";
}
