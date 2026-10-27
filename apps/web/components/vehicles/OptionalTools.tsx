"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
const ChatEntry = dynamic(() => import("./ChatEntry"), { ssr: false });
/** Phase 2 boundary only. Real concierge and model adapters remain Phase 4/5 work. */
export default function OptionalTools(props: {
  title: string;
  vehicleId: string;
  tenant: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [chat, setChat] = useState(false);
  if (!hydrated) return null;
  return (
    <aside className="enhancement" aria-label="Optional vehicle tools">
      <p>Photos and specifications work without interactive tools.</p>
      <p>3D view unavailable: no vehicle model is configured.</p>
      <button type="button" onClick={() => setChat(true)}>
        Vehicle concierge preview
      </button>
      {chat && <ChatEntry {...props} close={() => setChat(false)} />}
    </aside>
  );
}
