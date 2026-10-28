"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
const ChatEntry = dynamic(() => import("../vehicles/ChatEntry"), {
  ssr: false,
});

export default function ChatLauncher({
  tenant,
  title,
  vehicleId = "",
}: {
  tenant: string;
  title: string;
  vehicleId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ask the concierge
      </button>
      {open && (
        <ChatEntry
          key={tenant}
          tenant={tenant}
          title={title}
          vehicleId={vehicleId}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
