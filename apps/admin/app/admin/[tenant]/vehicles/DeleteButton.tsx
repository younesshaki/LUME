"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function DeleteButton({
  tenantId,
  vehicleId,
}: {
  tenantId: string;
  vehicleId: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this vehicle permanently?")) return;
    setDeleting(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", vehicleId)
      .eq("tenant_id", tenantId);
    if (error) {
      setError(error.message);
      setDeleting(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleDelete}
        disabled={deleting}
        aria-label="Delete vehicle"
        className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
