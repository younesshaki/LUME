"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function DeleteButton({
  tenantSlug,
  vehicleId,
}: {
  tenantSlug: string;
  vehicleId: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this vehicle permanently?")) return;
    setDeleting(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId);
    if (error) {
      alert("Failed to delete: " + error.message);
      setDeleting(false);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
    >
      {deleting ? "..." : "Delete"}
    </button>
  );
}
