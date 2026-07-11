"use client";

import { useState, useTransition } from "react";
import { Award, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createTier, deleteTier } from "./actions";

export type TierRow = { id: string; name: string; threshold: number };

export function TierManager({ slug, tiers }: { slug: string; tiers: TierRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createTier(slug, formData);
      if (result.error) setError(result.error);
    });
  }

  function onDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteTier(slug, id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="rounded-xl border">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Award className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Tiers</h2>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tier</TableHead>
            <TableHead>Points threshold</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiers.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                No tiers yet. Add one below.
              </TableCell>
            </TableRow>
          )}
          {tiers.map((tier) => (
            <TableRow key={tier.id}>
              <TableCell className="font-medium">{tier.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {tier.threshold.toLocaleString()}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={pending}
                  onClick={() => onDelete(tier.id)}
                  aria-label={`Delete ${tier.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <form action={onCreate} className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <Input name="name" placeholder="Tier name (e.g. Gold)" className="max-w-48" required />
        <Input
          name="threshold"
          type="number"
          min={0}
          placeholder="Points"
          className="max-w-32"
          required
        />
        <Button type="submit" size="sm" disabled={pending}>
          Add tier
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </form>
    </div>
  );
}
