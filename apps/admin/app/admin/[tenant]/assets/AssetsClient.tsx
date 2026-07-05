"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
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
    } catch (error) {
      setStatus({ type: "error", message: errorMessage(error, "Unable to upload asset.") });
    }
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Assets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tenant media library for {tenantName} <code>/{tenantSlug}</code>.
          </p>
        </div>
        <label className="inline-flex cursor-pointer rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200">
          Upload Media
          <input
            type="file"
            accept="image/*,video/*"
            className="sr-only"
            onChange={(event) => void uploadAsset(event.target.files?.[0])}
          />
        </label>
      </header>

      {status.message && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${statusClass(status.type)}`}>
          {status.message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {assets.map((asset) => (
          <article key={asset.objectKey} className="overflow-hidden rounded-xl border">
            <div className="aspect-video bg-neutral-100 dark:bg-neutral-900">
              <img src={asset.url} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="space-y-2 p-3">
              <p className="truncate text-sm font-medium">{asset.name}</p>
              <p className="truncate text-xs text-muted-foreground">{asset.objectKey}</p>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(asset.url)}
                className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                Copy URL
              </button>
            </div>
          </article>
        ))}
        {assets.length === 0 && status.type !== "loading" && (
          <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-muted-foreground dark:border-neutral-700">
            No media assets uploaded yet.
          </div>
        )}
      </div>
    </div>
  );
}

function createStorageClient(): SupabaseClient<Database> {
  return createSupabaseBrowserClient() as unknown as SupabaseClient<Database>;
}

function statusClass(type: StatusState["type"]): string {
  if (type === "error") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300";
  }
  if (type === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
  }
  return "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
