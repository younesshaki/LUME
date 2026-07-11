"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ImageIcon, LoaderCircle, Upload } from "lucide-react";
import type { CSSProperties } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import type { TenantDockVariant, TenantTheme } from "@lume/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  BRANDING_ASSET_ACCEPT,
  uploadTenantBrandingAsset,
  type BrandingAssetKind,
} from "@/lib/brandingAssets";
import {
  BRANDING_THEME_DEFAULTS,
  brandingFormFromTheme,
  themeFromBrandingForm,
  toColorInputValue,
  type BrandingThemeForm,
} from "./themeForm";

type SaveState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type BrandingClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialTheme: TenantTheme;
  migrationWarning: string | null;
  canManageBranding: boolean;
  previewUrl: string;
};

const FONT_OPTIONS = [
  { label: "Moralana", value: "var(--scene-font-moralana)" },
  { label: "Higher Jump", value: "var(--scene-font-higher-jump)" },
  { label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
  { label: "Montserrat", value: '"Montserrat", ui-sans-serif, system-ui, sans-serif' },
  { label: "System Sans", value: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
] as const;

const DOCK_VARIANTS: Array<{ label: string; value: TenantDockVariant }> = [
  { label: "Default", value: "default" },
  { label: "Minimal", value: "minimal" },
  { label: "Floating", value: "floating" },
  { label: "Hidden", value: "hidden" },
];

export default function BrandingClient({
  tenantId,
  tenantSlug,
  tenantName,
  initialTheme,
  migrationWarning,
  canManageBranding,
  previewUrl,
}: BrandingClientProps) {
  const router = useRouter();
  const [form, setForm] = useState<BrandingThemeForm>(() => brandingFormFromTheme(initialTheme));
  const [currentTheme, setCurrentTheme] = useState<TenantTheme>(initialTheme);
  const [state, setState] = useState<SaveState>({ type: "idle", message: "" });
  const [pendingAsset, setPendingAsset] = useState<BrandingAssetKind | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const previewStyle = useMemo(() => previewCssVariables(form), [form]);

  async function saveTheme() {
    if (migrationWarning) {
      setState({ type: "error", message: migrationWarning });
      return;
    }

    setState({ type: "saving", message: "Saving branding..." });
    try {
      const supabase = createTenantThemeClient();
      const nextTheme = themeFromBrandingForm(form, currentTheme);
      const { error } = await supabase
        .from("tenants")
        .update({ theme: nextTheme } as Database["public"]["Tables"]["tenants"]["Update"])
        .eq("id", tenantId);
      if (error) throw new Error(error.message);
      setCurrentTheme(nextTheme);
      setState({ type: "success", message: "Branding saved." });
      setPreviewRevision((revision) => revision + 1);
      router.refresh();
    } catch (error) {
      setState({ type: "error", message: brandingSaveError(error) });
    }
  }

  async function uploadBrandAsset(kind: BrandingAssetKind, file: File) {
    if (migrationWarning || !canManageBranding) {
      setState({
        type: "error",
        message: migrationWarning ?? "Owner or admin access is required to update branding.",
      });
      return;
    }

    setPendingAsset(kind);
    setState({ type: "saving", message: "Uploading brand image..." });
    try {
      const supabase = createTenantThemeClient();
      const asset = await uploadTenantBrandingAsset(supabase, tenantId, kind, file);
      const field = brandingThemeField(kind);
      const nextTheme: TenantTheme = {
        ...currentTheme,
        branding: {
          ...currentTheme.branding,
          [field]: asset.url,
        },
      };
      const { error } = await supabase
        .from("tenants")
        .update({ theme: nextTheme } as Database["public"]["Tables"]["tenants"]["Update"])
        .eq("id", tenantId);
      if (error) throw new Error(error.message);

      setCurrentTheme(nextTheme);
      setState({ type: "success", message: "Brand image uploaded and published." });
      setPreviewRevision((revision) => revision + 1);
      router.refresh();
    } catch (error) {
      setState({ type: "error", message: brandingSaveError(error) });
    } finally {
      setPendingAsset(null);
    }
  }

  function updateColor(name: keyof BrandingThemeForm["colors"], value: string) {
    setForm((current) => ({
      ...current,
      colors: { ...current.colors, [name]: value },
    }));
    setState({ type: "idle", message: "" });
  }

  function updateFont(name: keyof BrandingThemeForm["fonts"], value: string) {
    setForm((current) => ({
      ...current,
      fonts: { ...current.fonts, [name]: value },
    }));
    setState({ type: "idle", message: "" });
  }

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Branding</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Theme public site tokens for {tenantName} <code>/{tenantSlug}</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm(BRANDING_THEME_DEFAULTS)}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Reset Fields
          </button>
          <button
            type="button"
            onClick={saveTheme}
            disabled={state.type === "saving" || Boolean(migrationWarning) || !canManageBranding}
            className="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            Save Branding
          </button>
        </div>
      </header>

      {migrationWarning && (
        <StatusBanner type="error" message={migrationWarning} />
      )}
      {state.message && <StatusBanner type={state.type} message={state.message} />}
      {!canManageBranding && !migrationWarning ? (
        <StatusBanner type="error" message="Owner or admin access is required to update branding." />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-6">
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Logo and favicons</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Files are published from the tenant-logos bucket and applied to the public site.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <BrandAssetControl
                kind="logo"
                title="Logo"
                description="SVG, PNG, or WebP · max 2 MB"
                currentUrl={currentTheme.branding?.logoUrl}
                pending={pendingAsset === "logo"}
                disabled={Boolean(pendingAsset) || !canManageBranding || Boolean(migrationWarning)}
                onSelect={(file) => void uploadBrandAsset("logo", file)}
              />
              <BrandAssetControl
                kind="favicon32"
                title="Favicon 32"
                description="PNG or WebP · exactly 32×32"
                currentUrl={currentTheme.branding?.favicon32Url}
                pending={pendingAsset === "favicon32"}
                disabled={Boolean(pendingAsset) || !canManageBranding || Boolean(migrationWarning)}
                onSelect={(file) => void uploadBrandAsset("favicon32", file)}
              />
              <BrandAssetControl
                kind="favicon192"
                title="Favicon 192"
                description="PNG or WebP · exactly 192×192"
                currentUrl={currentTheme.branding?.favicon192Url}
                pending={pendingAsset === "favicon192"}
                disabled={Boolean(pendingAsset) || !canManageBranding || Boolean(migrationWarning)}
                onSelect={(file) => void uploadBrandAsset("favicon192", file)}
              />
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Colors</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ColorControl label="Text" value={form.colors.ink} onChange={(value) => updateColor("ink", value)} />
              <ColorControl label="Muted text" value={form.colors.muted} onChange={(value) => updateColor("muted", value)} />
              <ColorControl label="Soft text" value={form.colors.soft} onChange={(value) => updateColor("soft", value)} />
              <ColorControl label="Line" value={form.colors.line} onChange={(value) => updateColor("line", value)} />
              <ColorControl label="Accent" value={form.colors.gold} onChange={(value) => updateColor("gold", value)} />
              <ColorControl label="Background" value={form.colors.background} onChange={(value) => updateColor("background", value)} />
              <ColorControl label="Panel" value={form.colors.panel} onChange={(value) => updateColor("panel", value)} />
              <ColorControl label="Dock item" value={form.colors.dockItemBackground} onChange={(value) => updateColor("dockItemBackground", value)} />
              <ColorControl label="Dock text" value={form.colors.dockItemColor} onChange={(value) => updateColor("dockItemColor", value)} />
              <ColorControl label="Dock border" value={form.colors.dockItemBorder} onChange={(value) => updateColor("dockItemBorder", value)} />
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Typography and Motion</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SelectControl
                label="Display font"
                value={form.fonts.experience}
                options={FONT_OPTIONS}
                onChange={(value) => updateFont("experience", value)}
              />
              <SelectControl
                label="Body font"
                value={form.fonts.body}
                options={FONT_OPTIONS}
                onChange={(value) => updateFont("body", value)}
              />
              <SelectControl
                label="Dock variant"
                value={form.dockVariant}
                options={DOCK_VARIANTS}
                onChange={(value) =>
                  setForm((current) => ({ ...current, dockVariant: value as TenantDockVariant }))
                }
              />
              <label className="block text-xs font-medium text-muted-foreground">
                Cinematic intensity
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={form.cinematicIntensity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      cinematicIntensity: Number(event.target.value),
                    }))
                  }
                  className="mt-3 w-full"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  {form.cinematicIntensity.toFixed(2)}
                </span>
              </label>
            </div>
          </div>
        </section>

        <aside className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Live Preview</h2>
          <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800" style={previewStyle}>
            <div className="bg-[var(--preview-bg)] p-6 text-[var(--preview-ink)]">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--preview-gold)]">
                LUME private access
              </p>
              <h3
                className="mt-3 text-3xl leading-tight"
                style={{ fontFamily: "var(--preview-display-font)" }}
              >
                Cinematic hospitality, tuned per tenant.
              </h3>
              <p className="mt-3 text-sm leading-6 text-[var(--preview-muted)]">
                Colors, display type, dock treatment, and motion intensity update here before saving.
              </p>
              <div className="mt-5 rounded-lg border border-[var(--preview-line)] bg-[var(--preview-panel)] p-4">
                <p className="text-sm text-[var(--preview-soft)]">
                  Intensity {form.cinematicIntensity.toFixed(2)}
                </p>
              </div>
              <div className="mt-6 flex justify-center">
                <div className={`rounded-full border px-4 py-2 text-xs ${dockVariantClass(form.dockVariant)}`}>
                  {form.dockVariant === "hidden" ? "Dock hidden" : "Dock preview"}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 p-3 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold">Tenant site preview</h2>
            <p className="text-xs text-muted-foreground">The actual public site reloads after each successful save.</p>
          </div>
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open site <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
        {previewUrl ? (
          <div className="bg-neutral-100 p-3 dark:bg-neutral-950">
            <iframe
              key={previewRevision}
              src={previewUrl}
              title={`${tenantName} public site preview`}
              className="h-[36rem] w-full rounded-md border border-neutral-300 bg-black dark:border-neutral-700"
              sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
            />
          </div>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            Configure NEXT_PUBLIC_PUBLIC_SITE_URL to enable the live site preview.
          </p>
        )}
      </section>
    </div>
  );
}

function BrandAssetControl({
  kind,
  title,
  description,
  currentUrl,
  pending,
  disabled,
  onSelect,
}: {
  kind: BrandingAssetKind;
  title: string;
  description: string;
  currentUrl: string | undefined;
  pending: boolean;
  disabled: boolean;
  onSelect: (file: File) => void;
}) {
  const inputId = useId();
  const descriptionId = `${inputId}-description`;

  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-900">
        {currentUrl ? (
          <img src={currentUrl} alt={`${title} preview`} className="max-h-20 max-w-full object-contain" />
        ) : (
          <ImageIcon className="size-7 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p id={descriptionId} className="mt-1 min-h-8 text-xs text-muted-foreground">{description}</p>
      <label
        htmlFor={inputId}
        className={`mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900"
        }`}
      >
        {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {pending ? "Uploading…" : currentUrl ? "Replace" : "Upload"}
      </label>
      <input
        id={inputId}
        type="file"
        accept={BRANDING_ASSET_ACCEPT[kind]}
        className="sr-only"
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onSelect(file);
        }}
      />
    </div>
  );
}

function StatusBanner({ type, message }: { type: SaveState["type"]; message: string }) {
  const className =
    type === "error"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
      : type === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
        : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300";

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${className}`} role={type === "error" ? "alert" : "status"}>
      {message}
    </div>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <div className="mt-1 flex gap-2">
        <input
          type="color"
          value={toColorInputValue(value)}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 rounded border border-neutral-300 bg-transparent dark:border-neutral-700"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
      </div>
    </label>
  );
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function previewCssVariables(form: BrandingThemeForm): CSSProperties & Record<string, string> {
  return {
    "--preview-ink": form.colors.ink,
    "--preview-muted": form.colors.muted,
    "--preview-soft": form.colors.soft,
    "--preview-line": form.colors.line,
    "--preview-gold": form.colors.gold,
    "--preview-bg": form.colors.background,
    "--preview-panel": form.colors.panel,
    "--preview-display-font": form.fonts.experience,
  } as CSSProperties & Record<string, string>;
}

function dockVariantClass(variant: TenantDockVariant): string {
  if (variant === "hidden") return "hidden";
  if (variant === "minimal") return "border-white/20 bg-white/5 text-[var(--preview-muted)] opacity-75";
  if (variant === "floating") return "border-[var(--preview-gold)] bg-[var(--preview-panel)] text-[var(--preview-ink)] shadow-xl";
  return "border-[var(--preview-line)] bg-[var(--preview-panel)] text-[var(--preview-ink)]";
}

function brandingSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unable to save branding.";
  if (message.toLowerCase().includes("theme")) {
    return "Unable to save branding. Apply migration 019_tenant_theme.sql first.";
  }
  return message;
}

function brandingThemeField(
  kind: BrandingAssetKind,
): "logoUrl" | "favicon32Url" | "favicon192Url" {
  if (kind === "logo") return "logoUrl";
  return kind === "favicon32" ? "favicon32Url" : "favicon192Url";
}

function createTenantThemeClient(): SupabaseClient<Database> {
  return createSupabaseBrowserClient() as unknown as SupabaseClient<Database>;
}
