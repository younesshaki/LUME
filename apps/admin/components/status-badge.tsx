import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Consistent status colors across the admin. Semantic groups:
 * positive (green), attention (amber), neutral (gray), negative (red),
 * brand (gold) — mapped from the domain's status strings.
 */
const STATUS_STYLES: Record<string, string> = {
  // tenants
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent",
  trial: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  suspended: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  // leads
  new: "bg-primary/15 text-primary border-transparent",
  contacted: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-transparent",
  qualified: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-transparent",
  won: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent",
  lost: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  // invites
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent",
  revoked: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  expired: "bg-muted text-muted-foreground border-transparent",
  // roles
  owner: "bg-primary/15 text-primary border-transparent",
  admin: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-transparent",
  editor: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-transparent",
  viewer: "bg-muted text-muted-foreground border-transparent",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", STATUS_STYLES[status] ?? "bg-muted text-muted-foreground", className)}
    >
      {status}
    </Badge>
  );
}
