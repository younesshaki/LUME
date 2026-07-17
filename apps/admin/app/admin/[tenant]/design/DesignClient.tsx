"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Copy, History, ImageIcon, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import type { CSSProperties } from "react";
import {
  SITE_COLOR_KEYS,
  applyTemplateToDesign,
  getSiteTemplate,
  resolveModeBackground,
  resolveModeColors,
  resolveShared,
  type SiteBackgroundAsset,
  type SiteColorKey,
  type SiteDesign,
  type SiteMode,
} from "@lume/types";
import { TENANT_BUCKETS, validateUploadWithBytes } from "@lume/db";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  clearDesignDraft,
  copyMode,
  hasDesignChanges,
  readDesignDraft,
  resetMode,
  saveDesignDraft,
  updateModeBackground,
  updateModeColor,
} from "@/lib/siteDesignDraft";
import {
  SITE_BACKGROUND_MAX_BYTES,
  SITE_BACKGROUND_MIME_TYPES,
  validateSiteBackgroundCandidate,
} from "@/lib/siteDesignAssets";
import type { DesignRevisionSummary } from "@/lib/siteDesign.server";
import {
  prepareWebsiteBackgroundUploadAction,
  publishWebsiteDesignAction,
  restoreWebsiteDesignAction,
} from "./actions";

type DesignTab = "shared" | SiteMode;
type ConfirmAction =
  | { kind: "copy"; source: SiteMode; destination: SiteMode }
  | { kind: "reset-mode"; mode: SiteMode }
  | { kind: "reset-all" }
  | { kind: "publish" }
  | { kind: "restore"; revisionId: string };

type Status = { type: "idle" | "working" | "success" | "error"; message: string };

type DesignClientProps = {
  tenantSlug: string;
  tenantName: string;
  initialPublishedDesign: SiteDesign;
  initialRevisions: DesignRevisionSummary[];
  canManage: boolean;
  livePreviewUrl: string;
};

const COLOR_LABELS: Record<SiteColorKey, string> = {
  ink: "Primary text",
  muted: "Muted text",
  soft: "Soft text",
  line: "Borders and lines",
  gold: "Accent",
  background: "Page background",
  panel: "Panels",
  dockItemBackground: "Dock background",
  dockItemColor: "Dock text",
  dockItemBorder: "Dock border",
};

const FONT_OPTIONS = [
  { label: "Moralana", value: "var(--scene-font-moralana)" },
  { label: "Higher Jump", value: "var(--scene-font-higher-jump)" },
  { label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
  { label: "Montserrat", value: '"Montserrat", ui-sans-serif, system-ui, sans-serif' },
  { label: "System Sans", value: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
] as const;

export default function DesignClient({
  tenantSlug,
  tenantName,
  initialPublishedDesign,
  initialRevisions,
  canManage,
  livePreviewUrl,
}: DesignClientProps) {
  const router = useRouter();
  const [published, setPublished] = useState(initialPublishedDesign);
  const [draft, setDraft] = useState(initialPublishedDesign);
  const [tab, setTab] = useState<DesignTab>("dark");
  const [previewMode, setPreviewMode] = useState<SiteMode>("dark");
  const [hydratedDraft, setHydratedDraft] = useState(false);
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [uploadingMode, setUploadingMode] = useState<SiteMode | null>(null);
  const template = getSiteTemplate(draft.template.key);
  const dirty = hasDesignChanges(draft, published);

  useEffect(() => {
    const stored = readDesignDraft(window.sessionStorage, tenantSlug, initialPublishedDesign);
    if (stored) setDraft(stored);
    setHydratedDraft(true);
  }, [initialPublishedDesign, tenantSlug]);

  useEffect(() => {
    if (!hydratedDraft) return;
    if (hasDesignChanges(draft, published)) {
      saveDesignDraft(window.sessionStorage, tenantSlug, draft, published);
    } else {
      clearDesignDraft(window.sessionStorage, tenantSlug);
    }
  }, [draft, hydratedDraft, published, tenantSlug]);

  const preview = useMemo(
    () => ({
      colors: resolveModeColors(draft, template, previewMode),
      background: resolveModeBackground(draft, template, previewMode),
      shared: resolveShared(draft, template),
    }),
    [draft, previewMode, template],
  );

  function updateShared(next: Partial<SiteDesign["shared"]>) {
    setDraft((current) => ({ ...current, shared: { ...current.shared, ...next } }));
    setStatus({ type: "idle", message: "" });
  }

  function updateBackground(mode: SiteMode, patch: Partial<SiteBackgroundAsset>) {
    setDraft((current) => {
      const currentBackground = current.modes[mode].assets?.siteBackground ?? {};
      return updateModeBackground(current, mode, { ...currentBackground, ...patch });
    });
    setStatus({ type: "idle", message: "" });
  }

  async function uploadBackground(mode: SiteMode, file: File | undefined) {
    if (!file || !canManage) return;
    const validationError = validateSiteBackgroundCandidate(file);
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }
    const leadingBytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
    const uploadValidation = validateUploadWithBytes(
      TENANT_BUCKETS.media,
      { type: file.type, size: file.size },
      leadingBytes,
    );
    if (!uploadValidation.ok) {
      setStatus({ type: "error", message: uploadValidation.error });
      return;
    }

    setUploadingMode(mode);
    setStatus({ type: "working", message: `Uploading the Website ${mode} mode background…` });
    try {
      const prepared = await prepareWebsiteBackgroundUploadAction(tenantSlug, mode, {
        name: file.name,
        type: file.type,
        size: file.size,
      });
      if (!prepared.ok) throw new Error(prepared.error);
      const { error } = await createSupabaseBrowserClient().storage
        .from(TENANT_BUCKETS.media)
        .uploadToSignedUrl(prepared.objectKey, prepared.token, file, {
          contentType: file.type,
          cacheControl: "3600",
        });
      if (error) throw new Error(error.message);
      updateBackground(mode, { url: prepared.publicUrl });
      setPreviewMode(mode);
      setStatus({
        type: "success",
        message: `${capitalize(mode)} background uploaded to this draft. Publish to make it live.`,
      });
    } catch (error) {
      setStatus({ type: "error", message: errorMessage(error, "Unable to upload the background.") });
    } finally {
      setUploadingMode(null);
    }
  }

  async function publish() {
    setStatus({ type: "working", message: "Publishing website design…" });
    const result = await publishWebsiteDesignAction(tenantSlug, draft);
    if (!result.ok) {
      setStatus({ type: "error", message: result.error });
      return;
    }
    setPublished(result.design);
    setDraft(result.design);
    clearDesignDraft(window.sessionStorage, tenantSlug);
    setStatus({ type: "success", message: "Website design published." });
    router.refresh();
  }

  async function restore(revisionId: string) {
    setStatus({ type: "working", message: "Restoring website design…" });
    const result = await restoreWebsiteDesignAction(tenantSlug, revisionId);
    if (!result.ok) {
      setStatus({ type: "error", message: result.error });
      return;
    }
    setPublished(result.design);
    setDraft(result.design);
    clearDesignDraft(window.sessionStorage, tenantSlug);
    setStatus({ type: "success", message: "Previous website design restored and published." });
    router.refresh();
  }

  function runConfirmedAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;
    if (action.kind === "copy") setDraft((current) => copyMode(current, action.source, action.destination));
    if (action.kind === "reset-mode") setDraft((current) => resetMode(current, action.mode));
    if (action.kind === "reset-all") setDraft((current) => applyTemplateToDesign(current, getSiteTemplate(current.template.key)));
    if (action.kind === "publish") void publish();
    if (action.kind === "restore") void restore(action.revisionId);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Website Design"
        description={`Customize ${tenantName}'s public website. These settings do not change the Admin dashboard appearance.`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={dirty ? "default" : "secondary"}>{dirty ? "Unpublished changes" : "Published"}</Badge>
            <Button disabled={!canManage || !dirty || status.type === "working"} onClick={() => setConfirmAction({ kind: "publish" })}>
              {status.type === "working" ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
              Publish website design
            </Button>
          </div>
        }
      />

      {!canManage ? (
        <Alert><AlertCircle /><AlertTitle>View only</AlertTitle><AlertDescription>Owner or admin access is required to publish website design changes.</AlertDescription></Alert>
      ) : null}
      {status.message ? <StatusAlert status={status} /> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Tabs value={tab} onValueChange={(value) => {
          const next = value as DesignTab;
          setTab(next);
          if (next === "dark" || next === "light") setPreviewMode(next);
        }}>
          <TabsList className="h-auto w-full justify-start p-1" aria-label="Website design scope">
            <TabsTrigger value="shared" className="min-h-9 px-3">Shared website settings</TabsTrigger>
            <TabsTrigger value="dark" className="min-h-9 px-3">Website dark mode</TabsTrigger>
            <TabsTrigger value="light" className="min-h-9 px-3">Website light mode</TabsTrigger>
          </TabsList>

          <TabsContent value="shared" className="space-y-4 pt-3">
            <SharedSettings design={draft} onChange={updateShared} />
            <Card className="border-destructive/30">
              <CardHeader><CardTitle>Reset entire design</CardTitle><CardDescription>Reset both website modes and shared settings to {template.name}. Logo, favicons, pages, and navigation stay unchanged.</CardDescription></CardHeader>
              <CardFooter><Button variant="destructive" disabled={!canManage} onClick={() => setConfirmAction({ kind: "reset-all" })}><RotateCcw /> Reset entire design</Button></CardFooter>
            </Card>
          </TabsContent>

          {(["dark", "light"] as const).map((mode) => (
            <TabsContent key={mode} value={mode} className="space-y-4 pt-3">
              <ModeSettings
                design={draft}
                mode={mode}
                uploading={uploadingMode === mode}
                disabled={!canManage || uploadingMode !== null}
                onColor={(key, value) => setDraft((current) => updateModeColor(current, mode, key, value))}
                onBackground={(patch) => updateBackground(mode, patch)}
                onRemoveBackground={() => {
                  const background = draft.modes[mode].assets?.siteBackground;
                  if (!background) return;
                  const { url: _url, ...treatment } = background;
                  setDraft((current) => updateModeBackground(current, mode, Object.keys(treatment).length ? treatment : undefined));
                }}
                onUpload={(file) => void uploadBackground(mode, file)}
                onReset={() => setConfirmAction({ kind: "reset-mode", mode })}
                onCopy={(source) => setConfirmAction({ kind: "copy", source, destination: mode })}
              />
            </TabsContent>
          ))}
        </Tabs>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div><CardTitle>Design preview</CardTitle><CardDescription>Previewing website {previewMode} mode</CardDescription></div>
                <div className="flex gap-1">
                  <Button size="sm" variant={previewMode === "dark" ? "default" : "outline"} onClick={() => setPreviewMode("dark")}>Dark</Button>
                  <Button size="sm" variant={previewMode === "light" ? "default" : "outline"} onClick={() => setPreviewMode("light")}>Light</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent><DesignPreview {...preview} mode={previewMode} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Currently published</CardTitle><CardDescription>Template: {getSiteTemplate(published.template.key).name}. The iframe shows only published changes.</CardDescription></CardHeader>
            <CardContent><iframe src={livePreviewUrl} title={`${tenantName} published website`} className="aspect-[4/3] w-full rounded-lg border bg-black" sandbox="allow-forms allow-popups allow-same-origin allow-scripts" /></CardContent>
          </Card>
        </aside>
      </div>

      <RevisionHistory revisions={initialRevisions} canManage={canManage} onRestore={(revisionId) => setConfirmAction({ kind: "restore", revisionId })} />

      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationTitle(confirmAction)}</AlertDialogTitle>
            <AlertDialogDescription>{confirmationDescription(confirmAction)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirmedAction}>{confirmationAction(confirmAction)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SharedSettings({ design, onChange }: { design: SiteDesign; onChange: (next: Partial<SiteDesign["shared"]>) => void }) {
  const resolved = resolveShared(design, getSiteTemplate(design.template.key));
  return (
    <Card>
      <CardHeader><CardTitle>Shared website settings</CardTitle><CardDescription>Typography, dock, and cinematic intensity apply to both website modes.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Website display font" value={resolved.fonts?.experience ?? FONT_OPTIONS[0].value} options={FONT_OPTIONS} onChange={(value) => onChange({ fonts: { ...design.shared.fonts, experience: value } })} />
        <SelectField label="Website body font" value={resolved.fonts?.body ?? FONT_OPTIONS[3].value} options={FONT_OPTIONS} onChange={(value) => onChange({ fonts: { ...design.shared.fonts, body: value } })} />
        <SelectField label="Website dock style" value={resolved.dockVariant ?? "default"} options={[{ label: "Default", value: "default" }, { label: "Minimal", value: "minimal" }, { label: "Floating", value: "floating" }, { label: "Hidden", value: "hidden" }]} onChange={(value) => onChange({ dockVariant: value as NonNullable<SiteDesign["shared"]["dockVariant"]> })} />
        <div className="space-y-2">
          <Label htmlFor="website-cinematic-intensity">Website cinematic intensity</Label>
          <Input id="website-cinematic-intensity" type="range" min="0" max="1.5" step="0.05" value={resolved.cinematicIntensity ?? 1} onChange={(event) => onChange({ cinematicIntensity: Number(event.target.value) })} />
          <p className="text-xs text-muted-foreground">{(resolved.cinematicIntensity ?? 1).toFixed(2)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ModeSettings({ design, mode, uploading, disabled, onColor, onBackground, onRemoveBackground, onUpload, onReset, onCopy }: {
  design: SiteDesign;
  mode: SiteMode;
  uploading: boolean;
  disabled: boolean;
  onColor: (key: SiteColorKey, value: string) => void;
  onBackground: (patch: Partial<SiteBackgroundAsset>) => void;
  onRemoveBackground: () => void;
  onUpload: (file: File) => void;
  onReset: () => void;
  onCopy: (source: SiteMode) => void;
}) {
  const template = getSiteTemplate(design.template.key);
  const colors = resolveModeColors(design, template, mode);
  const customBackground = design.modes[mode].assets?.siteBackground;
  const resolvedBackground = resolveModeBackground(design, template, mode);
  const source: SiteMode = mode === "dark" ? "light" : "dark";
  return (
    <>
      <Card>
        <CardHeader><CardTitle>Website {mode} mode background</CardTitle><CardDescription>Fallback: this mode&apos;s tenant image → {template.name} {mode} default → safe flat background color.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-lg border bg-muted" style={{ background: colors.background }}>
            {resolvedBackground?.url ? <img src={resolvedBackground.url} alt={`Current Website ${mode} mode background`} className="aspect-video w-full object-cover" /> : <div className="text-center text-sm text-muted-foreground"><ImageIcon className="mx-auto mb-2 size-7" />{template.name} uses the safe {mode} flat-color fallback.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Label className="cursor-pointer" aria-disabled={disabled}>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground">
                {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {uploading ? "Uploading…" : customBackground?.url ? "Replace image" : "Upload image"}
              </span>
              <Input className="sr-only" type="file" accept={SITE_BACKGROUND_MIME_TYPES.join(",")} disabled={disabled} onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) onUpload(file);
              }} />
            </Label>
            {customBackground?.url ? <Button type="button" variant="outline" disabled={disabled} onClick={onRemoveBackground}>Remove custom image</Button> : null}
          </div>
          <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, or AVIF · maximum {SITE_BACKGROUND_MAX_BYTES / 1024 / 1024} MB. Uploading does not publish.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Background position" value={customBackground?.position ?? resolvedBackground?.position ?? "center"} options={[{ label: "Center", value: "center" }, { label: "Top", value: "top" }, { label: "Bottom", value: "bottom" }]} onChange={(value) => onBackground({ position: value as NonNullable<SiteBackgroundAsset["position"]> })} />
            <SelectField label="Background fit" value={customBackground?.size ?? resolvedBackground?.size ?? "cover"} options={[{ label: "Cover", value: "cover" }, { label: "Contain", value: "contain" }]} onChange={(value) => onBackground({ size: value as NonNullable<SiteBackgroundAsset["size"]> })} />
            <ColorField label="Overlay color" value={customBackground?.overlayColor ?? (mode === "dark" ? "#000000" : "#f4efe5")} onChange={(value) => onBackground({ overlayColor: value })} />
            <div className="space-y-2"><Label htmlFor={`${mode}-overlay-opacity`}>Overlay opacity</Label><Input id={`${mode}-overlay-opacity`} type="range" min="0" max="1" step="0.05" value={customBackground?.overlayOpacity ?? (mode === "dark" ? 0.42 : 0.12)} onChange={(event) => onBackground({ overlayOpacity: Number(event.target.value) })} /><p className="text-xs text-muted-foreground">{Math.round((customBackground?.overlayOpacity ?? (mode === "dark" ? 0.42 : 0.12)) * 100)}%</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Website {mode} mode colors</CardTitle><CardDescription>These values affect only Website {mode} mode.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {SITE_COLOR_KEYS.map((key) => <ColorField key={key} label={COLOR_LABELS[key]} value={colors[key] ?? ""} onChange={(value) => onColor(key, value)} />)}
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button variant="outline" disabled={disabled} onClick={onReset}><RotateCcw /> Reset this mode to {template.name}</Button>
          <Button variant="outline" disabled={disabled} onClick={() => onCopy(source)}><Copy /> Copy {source} settings to {mode}</Button>
        </CardFooter>
      </Card>
    </>
  );
}

function DesignPreview({ colors, background, shared, mode }: {
  colors: ReturnType<typeof resolveModeColors>;
  background: SiteBackgroundAsset | undefined;
  shared: ReturnType<typeof resolveShared>;
  mode: SiteMode;
}) {
  const style = {
    backgroundColor: colors.background,
    backgroundImage: background?.url ? `linear-gradient(${overlay(background, mode)}, ${overlay(background, mode)}), url(${JSON.stringify(background.url)})` : undefined,
    backgroundPosition: background?.position ?? "center",
    backgroundSize: background?.size ?? "cover",
    color: colors.ink,
    fontFamily: shared.fonts?.body,
  } as CSSProperties;
  return (
    <div className="aspect-[4/3] overflow-hidden rounded-lg border p-5" style={{ ...style, borderColor: colors.line }} data-preview-mode={mode}>
      <p className="text-[10px] uppercase tracking-[0.24em]" style={{ color: colors.gold }}>LUME private collection</p>
      <h3 className="mt-10 text-3xl leading-tight" style={{ fontFamily: shared.fonts?.experience }}>A quieter way to discover what moves you.</h3>
      <p className="mt-3 text-sm" style={{ color: colors.muted }}>Curated inventory, personal attention, and a design tuned for Website {mode} mode.</p>
      <div className="mt-6 rounded-lg border p-3" style={{ background: colors.panel, borderColor: colors.line }}><span className="text-xs" style={{ color: colors.soft }}>Preview panel</span></div>
    </div>
  );
}

function RevisionHistory({ revisions, canManage, onRestore }: { revisions: DesignRevisionSummary[]; canManage: boolean; onRestore: (id: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" /> Recent published designs</CardTitle><CardDescription>Publishing stores the previous design. Up to 20 tenant-scoped revisions are retained.</CardDescription></CardHeader>
      <CardContent>
        {revisions.length === 0 ? <p className="text-sm text-muted-foreground">No design revisions yet. The first successful publish creates one.</p> : (
          <ul className="divide-y">
            {revisions.map((revision) => <li key={revision.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{getSiteTemplate(revision.templateKey).name} v{revision.templateVersion}</p><time className="text-xs text-muted-foreground" dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></div><Button variant="outline" size="sm" disabled={!canManage} onClick={() => onRestore(revision.id)}>Restore</Button></li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><div className="flex gap-2"><Input type="color" value={hexColor(value)} className="w-12 px-1" aria-label={`${label} color picker`} onChange={(event) => onChange(event.target.value)} /><Input value={value} aria-label={`${label} value`} onChange={(event) => onChange(event.target.value)} /></div></div>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly { label: string; value: string }[]; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}

function StatusAlert({ status }: { status: Status }) {
  return <Alert variant={status.type === "error" ? "destructive" : "default"}>{status.type === "working" ? <LoaderCircle className="animate-spin" /> : status.type === "success" ? <CheckCircle2 /> : <AlertCircle />}<AlertTitle>{status.type === "error" ? "Design needs attention" : status.type === "success" ? "Website design updated" : "Working"}</AlertTitle><AlertDescription>{status.message}</AlertDescription></Alert>;
}

function confirmationTitle(action: ConfirmAction | null): string {
  if (!action) return "Confirm design change";
  if (action.kind === "publish") return "Publish this website design?";
  if (action.kind === "restore") return "Restore this published design?";
  if (action.kind === "reset-all") return "Reset the entire website design?";
  if (action.kind === "reset-mode") return `Reset Website ${action.mode} mode?`;
  return `Copy Website ${action.source} mode to ${action.destination} mode?`;
}

function confirmationDescription(action: ConfirmAction | null): string {
  if (!action) return "Review the change before continuing.";
  if (action.kind === "publish") return "This makes the draft live and stores the current published design as a recoverable revision. Pages, inventory, navigation, logo, favicons, and domains remain unchanged.";
  if (action.kind === "restore") return "The selected revision becomes live. The current design is saved first, so this restore can be undone.";
  if (action.kind === "reset-all") return "Both website modes and shared settings return to the selected template defaults. This remains a draft until published.";
  if (action.kind === "reset-mode") return `Only Website ${action.mode} mode returns to the selected template defaults.`;
  return `This overwrites the current Website ${action.destination} mode draft. The source mode is unchanged.`;
}

function confirmationAction(action: ConfirmAction | null): string {
  if (action?.kind === "publish") return "Publish website design";
  if (action?.kind === "restore") return "Restore and publish";
  if (action?.kind === "copy") return "Copy settings";
  return "Reset draft";
}

function overlay(background: SiteBackgroundAsset, mode: SiteMode): string {
  const color = background.overlayColor ?? (mode === "dark" ? "#000" : "#f4efe5");
  const opacity = background.overlayOpacity ?? (mode === "dark" ? 0.42 : 0.12);
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}

function hexColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
