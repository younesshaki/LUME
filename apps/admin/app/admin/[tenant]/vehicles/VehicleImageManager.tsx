"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, GripVertical, ImageIcon, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  deleteManagedVehicleImage,
  persistPrimaryVehicleImage,
  persistVehicleImageOrder,
} from "@/lib/vehicleImageManagementClient";
import type { ConfirmedVehicleImage } from "@/lib/vehicleImageUploadClient";
import { moveVehicleImage, moveVehicleImageByOffset } from "@/lib/vehicleImages";
import { VehicleImageUploader } from "./VehicleImageUploader";

export function VehicleImageManager({
  tenantSlug,
  vehicleId,
  initialImages,
  migrationWarning,
}: {
  tenantSlug: string;
  vehicleId: string;
  initialImages: ConfirmedVehicleImage[];
  migrationWarning: string | null;
}) {
  const [images, setImages] = useState(() => ordered(initialImages));
  const [pending, setPending] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  async function saveOrder(next: ConfirmedVehicleImage[] | null) {
    if (!next || pending) return;
    const previous = images;
    const normalized = ordered(next.map((image, index) => ({ ...image, sort_order: index })));
    setImages(normalized);
    setPending(true);
    try {
      await persistVehicleImageOrder(vehicleId, tenantSlug, normalized.map((image) => image.id));
      toast.success("Image order saved.");
    } catch (error) {
      setImages(previous);
      toast.error("Unable to reorder images", { description: errorMessage(error) });
    } finally {
      setPending(false);
      setDraggedId(null);
    }
  }

  async function setPrimary(imageId: string) {
    if (pending || images.find((image) => image.id === imageId)?.is_primary) return;
    const previous = images;
    setImages((current) => current.map((image) => ({
      ...image,
      is_primary: image.id === imageId,
    })));
    setPending(true);
    try {
      await persistPrimaryVehicleImage(vehicleId, imageId, tenantSlug);
      toast.success("Primary image updated.");
    } catch (error) {
      setImages(previous);
      toast.error("Unable to set primary image", { description: errorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  async function removeImage(imageId: string) {
    if (pending) return;
    setPending(true);
    try {
      const result = await deleteManagedVehicleImage(vehicleId, imageId, tenantSlug);
      setImages((current) => current
        .filter((image) => image.id !== imageId)
        .map((image, index) => ({
          ...image,
          sort_order: index,
          is_primary: result.promotedImageId
            ? image.id === result.promotedImageId
            : image.is_primary,
        })));
      if (result.warning) {
        toast.warning("Image removed with a storage warning", { description: result.warning });
      } else {
        toast.success("Vehicle image deleted.");
      }
    } catch (error) {
      toast.error("Unable to delete image", { description: errorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="max-w-4xl space-y-5">
      <VehicleImageUploader
        tenantSlug={tenantSlug}
        vehicleId={vehicleId}
        imageCount={images.length}
        migrationWarning={migrationWarning}
        managementDisabled={pending}
        onUploaded={(image) => setImages((current) => ordered([...current, image]))}
      />

      <div className="rounded-xl border p-4">
        <div>
          <h2 className="text-base font-semibold">Image gallery</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag to reorder, or use the move buttons. The starred image appears first publicly.
          </p>
        </div>

        {images.length === 0 ? (
          <div className="mt-4 flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            <ImageIcon className="size-6" aria-hidden="true" />
            <p className="mt-2 text-sm">No vehicle images yet.</p>
          </div>
        ) : (
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image, index) => (
              <li
                key={image.id}
                draggable={!pending}
                onDragStart={() => setDraggedId(image.id)}
                onDragEnd={() => setDraggedId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void saveOrder(
                  draggedId ? moveVehicleImage(images, draggedId, image.id) : null,
                )}
                className={`overflow-hidden rounded-lg border bg-card ${
                  image.is_primary ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="relative aspect-video bg-muted">
                  {image.url ? (
                    <img src={image.url} alt={`Vehicle image ${index + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-7" aria-hidden="true" />
                    </div>
                  )}
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
                    <GripVertical className="size-3" /> {index + 1}
                  </span>
                  {image.is_primary ? (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground">
                      <Star className="size-3 fill-current" /> Primary
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-1 p-2">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending || index === 0}
                      aria-label={`Move image ${index + 1} earlier`}
                      onClick={() => void saveOrder(moveVehicleImageByOffset(images, image.id, -1))}
                    >
                      <ArrowLeft />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending || index === images.length - 1}
                      aria-label={`Move image ${index + 1} later`}
                      onClick={() => void saveOrder(moveVehicleImageByOffset(images, image.id, 1))}
                    >
                      <ArrowRight />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      aria-label={image.is_primary ? "Current primary image" : `Set image ${index + 1} as primary`}
                      aria-pressed={image.is_primary}
                      onClick={() => void setPrimary(image.id)}
                    >
                      <Star className={image.is_primary ? "fill-current text-primary" : ""} />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          className="text-destructive hover:text-destructive"
                          aria-label={`Delete image ${index + 1}`}
                        >
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this vehicle image?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the association and the R2 object. It cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => void removeImage(image.id)}
                          >
                            Delete image
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function ordered(images: readonly ConfirmedVehicleImage[]): ConfirmedVehicleImage[] {
  return [...images].sort((left, right) => left.sort_order - right.sort_order);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Vehicle image update failed.";
}
