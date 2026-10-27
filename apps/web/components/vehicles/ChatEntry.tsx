"use client";
import { useEffect, useRef } from "react";
export default function ChatEntry({
  title,
  vehicleId,
  tenant,
  close,
}: {
  title: string;
  vehicleId: string;
  tenant: string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={close}
      aria-label="Vehicle concierge preview"
    >
      <h2>Ask about {title}</h2>
      <p>The concierge is not connected in this read-only preview.</p>
      <p>
        Vehicle: {vehicleId} · Tenant: {tenant}
      </p>
      <button autoFocus onClick={close}>
        Close concierge
      </button>
    </dialog>
  );
}
