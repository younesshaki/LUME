"use client";
import { useEffect, useState } from "react";
import ChatLauncher from "../concierge/ChatLauncher";
/** Live concierge chat (Phase 4a) mounts on demand; the 3D/model viewer
 * remains Phase 5 work. */
export default function OptionalTools(props: {
  title: string;
  vehicleId: string;
  tenant: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (!hydrated) return null;
  return (
    <aside className="enhancement" aria-label="Optional vehicle tools">
      <p>Photos and specifications work without interactive tools.</p>
      <p>3D view unavailable: no vehicle model is configured.</p>
      <ChatLauncher {...props} />
    </aside>
  );
}
