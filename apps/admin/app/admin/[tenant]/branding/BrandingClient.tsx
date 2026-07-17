"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ImageIcon, LoaderCircle, Upload } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import type { SiteDesign, TenantTheme } from "@lume/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  BRANDING_ASSET_ACCEPT,
  uploadTenantBrandingAsset,
  type BrandingAssetKind,
} from "@/lib/brandingAssets";

type SaveState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type ThemeDocument = (TenantTheme | SiteDesign) & {
  branding?: { logoUrl?: string; favicon32Url?: string; favicon192Url?: string };
};

type BrandingClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialTheme: ThemeDocument;
  migrationWarning: string | null;
  canManageBranding: boolean;
  previewUrl: string;
};

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
  const [currentTheme, setCurrentTheme] = useState<ThemeDocument>(initialTheme);
  const [state, setState] = useState<SaveState>({ type: "idle", message: "" });
  const [pendingAsset, setPendingAsset] = useState<BrandingAssetKind | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);

  async function uploadBrandAsset(kind: BrandingAssetKind, file: File) {
    if (migrationWarning || !canManageBranding) {
      setState({
        type: "error",
        message: migrationWarning ?? "Owner or admin access is required to update brand assets.",
      });
      return;
    }

    setPendingAsset(kind);
    setState({ type: "saving", message: "Uploading brand image…" });
    try {
      const supabase = createTenantThemeClient();
      const asset = await uploadTenantBrandingAsset(supabase, tenantId, kind, file);
      const field = brandingThemeField(kind);
      const nextTheme: ThemeDocument = {
        ...currentTheme,
        branding: { ...currentTheme.branding, [field]: asset.url },
      };
      const { error } = await supabase
        .from("tenants")
        .update({ theme: nextTheme as unknown as Record<string, unknown> } as Database["public"]["Tables"]["tenants"]["Update"])
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logo & favicons"
        description={<>Manage {tenantName}&rsquo;s identity assets for the public website <code>/{tenantSlug}</code>.</>}
        actions={previewUrl ? <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">Open published site <ExternalLink className="size-4" /></a> : null}
      />

      <Alert>
        <ImageIcon />
        <AlertTitle>Brand assets and Website Design are separate</AlertTitle>
        <AlertDescription>
          Logo and favicon uploads publish immediately. Colors, fonts, backgrounds, and Website dark/light modes are edited and explicitly published from Website &gt; Design.
        </AlertDescription>
      </Alert>
      {migrationWarning ? <StatusAlert type="error" message={migrationWarning} /> : null}
      {state.message ? <StatusAlert type={state.type} message={state.message} /> : null}
      {!canManageBranding && !migrationWarning ? <StatusAlert type="error" message="Owner or admin access is required to update brand assets." /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Public website identity</CardTitle>
          <CardDescription>Files are tenant-scoped in the logo bucket and remain unchanged when a website template is applied.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <BrandAssetControl
            kind="logo"
            title="Website logo"
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
        </CardContent>
      </Card>

      {previewUrl ? (
        <Card>
          <CardHeader><CardTitle>Published website</CardTitle><CardDescription>The preview reloads after a successful asset upload.</CardDescription></CardHeader>
          <CardContent><iframe key={previewRevision} src={previewUrl} title={`${tenantName} published public website`} className="h-[36rem] w-full rounded-lg border bg-black" sandbox="allow-forms allow-popups allow-same-origin allow-scripts" /></CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function BrandAssetControl({ kind, title, description, currentUrl, pending, disabled, onSelect }: {
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
    <div className="rounded-lg border p-3">
      <div className="flex h-28 items-center justify-center overflow-hidden rounded-md bg-muted">
        {currentUrl ? <img src={currentUrl} alt={`${title} preview`} className="max-h-24 max-w-full object-contain" /> : <ImageIcon className="size-7 text-muted-foreground" aria-hidden="true" />}
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p id={descriptionId} className="mt-1 min-h-8 text-xs text-muted-foreground">{description}</p>
      <label htmlFor={inputId} className={`mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted"}`}>
        {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {pending ? "Uploading…" : currentUrl ? "Replace" : "Upload"}
      </label>
      <input id={inputId} type="file" accept={BRANDING_ASSET_ACCEPT[kind]} className="sr-only" disabled={disabled} aria-describedby={descriptionId} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) onSelect(file);
      }} />
    </div>
  );
}

function StatusAlert({ type, message }: { type: SaveState["type"]; message: string }) {
  return <Alert variant={type === "error" ? "destructive" : "default"}><AlertTitle>{type === "error" ? "Brand assets need attention" : type === "success" ? "Brand asset published" : "Working"}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>;
}

function brandingSaveError(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to upload the brand image.";
}

function brandingThemeField(kind: BrandingAssetKind): "logoUrl" | "favicon32Url" | "favicon192Url" {
  if (kind === "logo") return "logoUrl";
  return kind === "favicon32" ? "favicon32Url" : "favicon192Url";
}

function createTenantThemeClient(): SupabaseClient<Database> {
  return createSupabaseBrowserClient() as unknown as SupabaseClient<Database>;
}
