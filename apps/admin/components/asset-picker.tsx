"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKET_UPLOAD_POLICIES,
  TENANT_BUCKETS,
  type Database,
} from "@lume/db";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  listTenantMediaAssets,
  filterTenantAssets,
  tenantAssetType,
  uploadTenantMediaAsset,
  type TenantAsset,
  type TenantAssetFilter,
} from "@/lib/assets";

type AssetPickerProps = {
  tenantId: string;
  value?: string;
  onSelect: (asset: TenantAsset) => void;
  triggerLabel?: string;
};

export function AssetPicker({
  tenantId,
  value = "",
  onSelect,
  triggerLabel = "Choose asset",
}: AssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<TenantAsset[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TenantAssetFilter>("all");
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "error"; message: string }>({
    type: "idle",
    message: "",
  });
  const filteredAssets = useMemo(
    () => filterTenantAssets(assets, query, typeFilter),
    [assets, query, typeFilter]
  );

  async function handleOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen || assets.length > 0 || status.type === "loading") return;
    setStatus({ type: "loading", message: "Loading assets…" });
    try {
      setAssets(await listTenantMediaAssets(storageClient(), tenantId));
      setStatus({ type: "idle", message: "" });
    } catch (error) {
      setStatus({ type: "error", message: errorMessage(error, "Unable to load assets.") });
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setStatus({ type: "loading", message: "Uploading asset…" });
    try {
      const asset = await uploadTenantMediaAsset(storageClient(), tenantId, file);
      setAssets((current) => [asset, ...current]);
      setStatus({ type: "idle", message: "" });
      onSelect(asset);
      setOpen(false);
    } catch (error) {
      setStatus({ type: "error", message: errorMessage(error, "Unable to upload asset.") });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => void handleOpen(nextOpen)}>
      <DialogTrigger asChild>
        <button type="button" className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900">
          {triggerLabel}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose an asset</DialogTitle>
          <DialogDescription>Search tenant media, filter by type, or upload a policy-validated image.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
          <label className="text-xs font-medium">
            <span className="sr-only">Search assets</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets…" className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-medium">
            <span className="sr-only">Filter asset type</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TenantAssetFilter)} className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm">
              <option value="all">All types</option>
              <option value="image">Images</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium hover:bg-muted">
            Upload new
            <input
              type="file"
              className="sr-only"
              accept={BUCKET_UPLOAD_POLICIES[TENANT_BUCKETS.media].allowedTypes.join(",")}
              disabled={status.type === "loading"}
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {value ? <p className="truncate text-xs text-muted-foreground">Current: {value}</p> : null}
        {status.message ? (
          <p className={`rounded-lg border px-3 py-2 text-sm ${status.type === "error" ? "border-red-200 text-red-700 dark:border-red-900 dark:text-red-300" : "text-muted-foreground"}`} role={status.type === "error" ? "alert" : "status"}>
            {status.message}
          </p>
        ) : null}
        <div className="max-h-[55vh] overflow-y-auto rounded-lg border p-2">
          {status.type !== "loading" && filteredAssets.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No assets match this search.</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {filteredAssets.map((asset) => (
              <button
                key={asset.objectKey}
                type="button"
                onClick={() => {
                  onSelect(asset);
                  setOpen(false);
                }}
                className="overflow-hidden rounded-lg border text-left text-xs hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {tenantAssetType(asset) === "image" ? (
                  <img src={asset.url} alt="" className="aspect-video w-full bg-muted object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">File</div>
                )}
                <span className="block truncate px-2 py-1.5">{asset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function storageClient(): SupabaseClient<Database> {
  return createSupabaseBrowserClient() as unknown as SupabaseClient<Database>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
