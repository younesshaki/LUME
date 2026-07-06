"use client";

/**
 * Styled replacement for window.confirm on destructive/irreversible actions.
 * Wrap the existing trigger button as the child; the action only runs after
 * the user confirms in the dialog. Pair with a sonner toast on completion
 * (same pattern as vehicles/DeleteButton).
 */
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

export function ConfirmActionDialog({
  title,
  description,
  actionLabel,
  destructive = true,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  actionLabel: string;
  /** Destructive actions get the red confirm button. */
  destructive?: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={onConfirm}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
