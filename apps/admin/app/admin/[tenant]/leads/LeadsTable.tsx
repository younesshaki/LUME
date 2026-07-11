"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { LeadStatus } from "@lume/types";
import type { LeadLostReason } from "@/lib/leadLostReasons";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { bulkUpdateLeadStatus } from "./actions";

export type LeadCard = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: string;
  status: LeadStatus;
  createdAt: string;
};

const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export function LeadsTable({
  slug,
  leads,
  lostReasons,
}: {
  slug: string;
  leads: LeadCard[];
  lostReasons: LeadLostReason[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<LeadStatus | "">("");
  const [bulkLostReason, setBulkLostReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = leads.length > 0 && selected.size === leads.length;
  const selectedIds = useMemo(() => [...selected], [selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  }

  function applyBulk() {
    if (!bulkStatus) return;
    setError(null);
    startTransition(async () => {
      const result = await bulkUpdateLeadStatus(
        slug,
        selectedIds,
        bulkStatus,
        bulkStatus === "lost" ? bulkLostReason : null,
      );
      if (result.error) setError(result.error);
      else {
        setSelected(new Set());
        setBulkStatus("");
        setBulkLostReason("");
      }
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Select
            value={bulkStatus}
            onValueChange={(value) => {
              setBulkStatus(value as LeadStatus);
              if (value !== "lost") setBulkLostReason("");
            }}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Set status…" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bulkStatus === "lost" ? (
            <Select value={bulkLostReason} onValueChange={setBulkLostReason}>
              <SelectTrigger className="h-8 w-52" aria-label="Lost reason">
                <SelectValue placeholder="Choose lost reason…" />
              </SelectTrigger>
              <SelectContent>
                {lostReasons.map((reason) => (
                  <SelectItem key={reason.key} value={reason.key}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            size="sm"
            disabled={!bulkStatus || (bulkStatus === "lost" && !bulkLostReason) || pending}
            onClick={applyBulk}
          >
            Apply
          </Button>
          {error ? (
            <span className="text-sm text-destructive" role="alert">{error}</span>
          ) : null}
        </div>
      )}

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all leads"
                />
              </TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No leads match these filters.
                </TableCell>
              </TableRow>
            )}
            {leads.map((lead) => (
              <TableRow key={lead.id} data-state={selected.has(lead.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(lead.id)}
                    onCheckedChange={() => toggle(lead.id)}
                    aria-label={`Select ${lead.name}`}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/${slug}/leads/${lead.id}`}
                    className="font-medium hover:underline"
                  >
                    {lead.name}
                  </Link>
                  {lead.message && (
                    <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                      {lead.message}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lead.email && <p>{lead.email}</p>}
                  {lead.phone && <p>{lead.phone}</p>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-muted-foreground">
                    {lead.source}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StatusBadge status={lead.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(lead.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
