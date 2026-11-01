"use client";
import { useEffect, useRef, useState } from "react";
import InteractiveForms from "../content/InteractiveForms";
import { LEAD_FORM_EVENT, pendingLeadForm } from "./pendingLeadForm";
import "./concierge.css";

export default function VehicleInquiry({
  tenant,
  vehicleId,
  title,
  siteKey,
}: {
  tenant: string;
  vehicleId: string;
  title: string;
  siteKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const activate = () => {
      if (pendingLeadForm(tenant, window.location.pathname, "vehicle-inquiry"))
        setOpen(true);
    };
    activate();
    window.addEventListener(LEAD_FORM_EVENT, activate);
    return () => window.removeEventListener(LEAD_FORM_EVENT, activate);
  }, [tenant]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Request information
      </button>
      {open && (
        <dialog
          id="vehicle-inquiry"
          ref={dialog}
          className="concierge concierge--inquiry"
          aria-label={`Inquiry for ${title}`}
          onCancel={() => setOpen(false)}
        >
          <button type="button" onClick={() => setOpen(false)}>
            Close inquiry
          </button>
          <InteractiveForms
            tenant={tenant}
            vehicleId={vehicleId}
            handlerId="vehicle-inquiry"
            siteKey={siteKey}
          />
        </dialog>
      )}
    </>
  );
}
