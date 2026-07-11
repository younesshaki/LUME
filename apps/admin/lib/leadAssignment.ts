export type LeadAssignmentMode = "manual" | "round_robin";

export type SalesMember = {
  userId: string;
  createdAt: string;
  salesEnabled: boolean;
  outOfOffice: boolean;
};

/** Pure mirror of the SQL rotation rule for deterministic tests and previews. */
export function nextRoundRobinAssignee(
  members: readonly SalesMember[],
  lastAssigneeId: string | null,
): string | null {
  const eligible = members
    .filter((member) => member.salesEnabled && !member.outOfOffice)
    .sort((left, right) =>
      timestamp(left.createdAt) - timestamp(right.createdAt) ||
      left.userId.localeCompare(right.userId)
    );
  if (eligible.length === 0) return null;
  const lastIndex = eligible.findIndex((member) => member.userId === lastAssigneeId);
  return eligible[(lastIndex + 1) % eligible.length]?.userId ?? null;
}

export function normalizeLeadAssignmentMode(value: unknown): LeadAssignmentMode | null {
  return value === "manual" || value === "round_robin" ? value : null;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
