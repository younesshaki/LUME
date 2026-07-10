"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Copy, ImageIcon, LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  listTenantMediaAssets,
  uploadTenantMediaAsset,
  type TenantAsset,
} from "@/lib/assets";

type AssetsClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
};

type StatusState =
  | { type: "idle"; message: string }
  | { type: "loading"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

const ACCEPTED_MEDIA = {
  "image/*": [],
  "video/*": [],
};

const MAX_ASSET_BYTES = 50 * 1024 * 1024;

export default function AssetsClient({ tenantId, tenantSlug, tenantName }: AssetsClientProps) {
  const [assets, setAssets] = useState<TenantAsset[]>([]);
  const [status, setStatus] = useState<StatusState>({ type: "loading", message: "Loading assets..." });

  async function loadAssets() {
    setStatus({ type: "loading", message: "Loading assets..." });
    try {
      const result = await listTenantMediaAssets(createStorageClient(), tenantId);
      setAssets(result);
      setStatus({ type: "idle", message: "" });
    } catch (error) {
      setStatus({ type: "error", message: errorMessage(error, "Unable to load assets.") });
    }
  }

  async function uploadAsset(file: File | undefined) {
    if (!file) return;
    setStatus({ type: "loading", message: "Uploading asset..." });
    try {
      const asset = await uploadTenantMediaAsset(createStorageClient(), tenantId, file);
      setAssets((current) => [asset, ...current]);
      setStatus({ type: "success", message: "Asset uploaded." });
      toast.success(`${asset.name} uploaded`);
    } catch (error) {
      const message = errorMessage(error, "Unable to upload asset.");
      setStatus({ type: "error", message });
      toast.error("Unable to upload asset", { description: message });
    }
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description={
          <>
            Tenant media library for {tenantName} <code>/{tenantSlug}</code>.
          </>
        }
      />

      <FileUpload
        accept={ACCEPTED_MEDIA}
        maxSize={MAX_ASSET_BYTES}
        disabled={status.type === "loading"}
        label={status.type === "loading" ? "Uploading…" : "Upload media"}
        description="Drop an image or video here, or click to browse. Maximum 50 MB."
        onChange={(files) => void uploadAsset(files[0])}
        onReject={() => {
          const message = "Choose an image or video smaller than 50 MB.";
          setStatus({ type: "error", message });
          toast.error("File not accepted", { description: message });
        }}
      />

      {status.type === "error" ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Asset library needs attention</AlertTitle>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      ) : null}

      {status.type === "loading" && assets.length > 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" />
          {status.message}
        </div>
      ) : null}

      {status.type === "loading" && assets.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading assets">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {assets.map((asset) => (
          <Card key={asset.objectKey} className="group overflow-hidden py-0 transition-colors hover:border-primary/40">
            <CardContent className="aspect-video bg-muted p-0">
              {isVideo(asset.name) ? (
                <video src={asset.url} aria-label={asset.name} className="h-full w-full object-cover" muted />
              ) : (
                <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" />
              )}
            </CardContent>
            <CardFooter className="items-end justify-between gap-3 p-3">
              <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-medium">{asset.name}</p>
              <p className="truncate text-xs text-muted-foreground">{asset.objectKey}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Copy URL for ${asset.name}`}
                onClick={() => {
                  void navigator.clipboard?.writeText(asset.url).then(() => toast.success("Asset URL copied"));
                }}
              >
                <Copy />
              </Button>
            </CardFooter>
          </Card>
        ))}
        {assets.length === 0 && status.type !== "loading" && (
          <div className="sm:col-span-2 lg:col-span-4">
            <EmptyState
              icon={ImageIcon}
              title="Your media library is empty"
              description="Drop your first image or video above. Uploaded assets become available to pages, branding, and vehicle content."
              action={
                <span className="inline-flex items-center gap-2 text-sm text-primary">
                  <UploadCloud className="size-4" /> Drag a file into the upload area
                </span>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function createStorageClient(): SupabaseClient<Database> {
  return createSupabaseBrowserClient() as unknown as SupabaseClient<Database>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isVideo(fileName: string): boolean {
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(fileName);
}
