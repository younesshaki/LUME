import type { Visitor } from "@lume/types";

type VisitorPublicRow = {
  id: string;
  tenant_id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
};

/** Maps an explicit, non-credential visitor projection to the public API shape. */
export function toPublicVisitor(row: VisitorPublicRow): Visitor {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    createdAt: row.created_at,
  };
}
