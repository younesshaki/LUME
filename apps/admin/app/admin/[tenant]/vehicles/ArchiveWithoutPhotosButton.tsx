"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";

import { archiveVehiclesWithoutImages, countVehiclesWithoutImages } from "./bulk-actions";

/**
 * Archives every vehicle in the tenant with no photo.
 *
 * Whole-inventory, not the current page: the checkbox selection is capped at
 * MAX_BULK_VEHICLES and one page of results. The count is fetched when the
 * dialog opens rather than on page load, so browsing the inventory doesn't pay
 * for a scan nobody asked for.
 */
export function ArchiveWithoutPhotosButton({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState<number | null>(null);
  const [countError, setCountError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;

    let active = true;
    setCount(null);
    setCountError(null);
    countVehiclesWithoutImages(tenantSlug).then((result) => {
      if (!active) return;
      if (result.error) setCountError(result.error);
      else setCount(result.count ?? 0);
    });
    return () => {
      active = false;
    };
  }, [open, tenantSlug]);

  const onConfirm = () => {
    startTransition(async () => {
      const result = await archiveVehiclesWithoutImages(tenantSlug);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const affected = result.affected ?? 0;
      toast.success(
        affected === 0
          ? "No vehicles were missing photos."
          : `Archived ${affected.toLocaleString()} ${affected === 1 ? "vehicle" : "vehicles"} without photos.`,
      );
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ImageOff className="size-3.5" />
          Archive without photos
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive vehicles without photos?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {countError ? (
                <p className="text-destructive">{countError}</p>
              ) : count === null ? (
                <p className="flex items-center gap-2">
                  <Spinner /> Counting vehicles without photos…
                </p>
              ) : (
                <p>
                  This archives{" "}
                  <strong className="text-foreground">
                    {count.toLocaleString()} {count === 1 ? "vehicle" : "vehicles"}
                  </strong>{" "}
                  across the whole inventory — not just this page — with no
                  managed photo, feed image, or special image.
                </p>
              )}
              <p className="text-muted-foreground">
                Sold and already-archived vehicles are left alone. Archiving is
                reversible: set the status back from the Archived filter.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={pending || count === null || count === 0 || Boolean(countError)}
          >
            {pending ? "Archiving…" : "Archive them"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
