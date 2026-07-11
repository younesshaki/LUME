"use client";

import { useReducer, useState } from "react";
import { ImagePlus, LoaderCircle, UploadCloud } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { MAX_VEHICLE_IMAGES, MAX_VEHICLE_IMAGE_BYTES } from "@/lib/vehicleImages";
import { uploadVehicleImage } from "@/lib/vehicleImageUploadClient";
import {
  createVehicleImageUploadItems,
  vehicleImageUploadReducer,
  type VehicleImageUploadItem,
} from "@/lib/vehicleImageUploadState";

const ACCEPTED_IMAGES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export function VehicleImageUploader({
  tenantSlug,
  vehicleId,
  initialImageCount,
  migrationWarning,
}: {
  tenantSlug: string;
  vehicleId: string;
  initialImageCount: number;
  migrationWarning: string | null;
}) {
  const [items, dispatch] = useReducer(vehicleImageUploadReducer, []);
  const [imageCount, setImageCount] = useState(initialImageCount);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(migrationWarning);
  const remainingSlots = Math.max(0, MAX_VEHICLE_IMAGES - imageCount);

  async function uploadFiles(files: File[]) {
    const queued = createVehicleImageUploadItems(files, remainingSlots);
    if (queued.rejectedCount > 0) {
      setError(`${queued.rejectedCount} image${queued.rejectedCount === 1 ? " was" : "s were"} skipped because the vehicle limit is ${MAX_VEHICLE_IMAGES}.`);
    } else {
      setError(null);
    }
    if (queued.items.length === 0) return;

    dispatch({ type: "enqueue", items: queued.items });
    setUploading(true);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < queued.items.length) {
        const item = queued.items[nextIndex++];
        if (!item) return;
        await uploadOne(item);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(3, queued.items.length) }, () => worker()),
    );
    setUploading(false);
  }

  async function uploadOne(item: VehicleImageUploadItem) {
    dispatch({ type: "progress", id: item.id, progress: 1 });
    try {
      await uploadVehicleImage(vehicleId, tenantSlug, item.file, (progress) => {
        dispatch({ type: "progress", id: item.id, progress });
      });
      dispatch({ type: "complete", id: item.id });
      setImageCount((count) => Math.min(MAX_VEHICLE_IMAGES, count + 1));
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Upload failed.";
      dispatch({ type: "error", id: item.id, error: message });
    }
  }

  const disabled = uploading || remainingSlots === 0 || Boolean(migrationWarning);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPTED_IMAGES,
    maxSize: MAX_VEHICLE_IMAGE_BYTES,
    multiple: true,
    maxFiles: Math.max(1, remainingSlots),
    disabled,
    noClick: true,
    noKeyboard: true,
    onDropAccepted: (files) => void uploadFiles(files),
    onDropRejected: () => {
      const message = "Choose JPEG, PNG, or WebP images up to 10 MB each.";
      setError(message);
      toast.error("Images not accepted", { description: message });
    },
  });

  return (
    <section className="max-w-4xl rounded-xl border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Vehicle images</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload up to 20 JPEG, PNG, or WebP images directly to R2.
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
          {imageCount}/{MAX_VEHICLE_IMAGES}
        </span>
      </div>

      <div
        {...getRootProps()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={disabled ? undefined : open}
        onKeyDown={(event) => {
          if (!disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            open();
          }
        }}
        className={`mt-4 flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center outline-none transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <LoaderCircle className="size-7 animate-spin text-primary" aria-hidden="true" />
        ) : isDragActive ? (
          <ImagePlus className="size-7 text-primary" aria-hidden="true" />
        ) : (
          <UploadCloud className="size-7 text-muted-foreground" aria-hidden="true" />
        )}
        <p className="mt-3 text-sm font-medium">
          {remainingSlots === 0
            ? "Vehicle image limit reached"
            : uploading
              ? "Uploading images…"
              : isDragActive
                ? "Drop images here"
                : "Drag images here or choose files"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Maximum 10 MB per image · 3 concurrent uploads</p>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}

      {items.length > 0 ? (
        <ul className="mt-4 space-y-2" aria-label="Image upload progress">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{item.file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {uploadStatusLabel(item)}
                </span>
              </div>
              <progress
                value={item.progress}
                max={100}
                aria-label={`Upload progress for ${item.file.name}`}
                className="mt-2 h-2 w-full accent-primary"
              />
              {item.error ? <p className="mt-1 text-xs text-destructive">{item.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function uploadStatusLabel(item: VehicleImageUploadItem): string {
  if (item.status === "complete") return "Uploaded";
  if (item.status === "error") return "Failed";
  if (item.status === "queued") return "Queued";
  return `${item.progress}%`;
}
