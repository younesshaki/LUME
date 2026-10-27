import { ConciergeLeadFormView } from "@lume/blocks/react/ConciergeLeadForm";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  botLeadFormSourceContext,
  consumePendingLeadFormPrefill,
  consumePendingLeadFormSourceContext,
  leadFormPrefillFromAction,
  mergeLeadFormPrefill,
} from "@/lib/botActionConsumers";
import { useBotAction } from "@/lib/useBotAction";
import { useConciergeTarget } from "@/lib/useConciergeTarget";
import { submitLead } from "@/lib/leads";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import "@/experience/ui/ContactPage/ContactPage.css";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();

type ContactFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
};

type SubmissionState =
  | { type: "idle"; message: string }
  | { type: "submitting"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export function ConciergeLeadForm() {
  const formSectionRef = useRef<HTMLElement | null>(null);
  const firstNameInputRef = useRef<HTMLInputElement | null>(null);
  const [initialBotPrefill] = useState(() => consumePendingLeadFormPrefill());
  const [form, setForm] = useState<ContactFormState>(() =>
    mergeLeadFormPrefill(createEmptyContactForm(), initialBotPrefill),
  );
  const [botSourceContext, setBotSourceContext] = useState(() =>
    consumePendingLeadFormSourceContext(),
  );
  const [focusRequestCount, setFocusRequestCount] = useState(() =>
    initialBotPrefill ? 1 : 0,
  );
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [status, setStatus] = useState<SubmissionState>({
    type: "idle",
    message: "",
  });

  useBotAction("open-lead-form", (action) => {
    setForm((current) =>
      mergeLeadFormPrefill(current, leadFormPrefillFromAction(action)),
    );
    setStatus({ type: "idle", message: "" });
    setBotSourceContext(botLeadFormSourceContext(action));
    setFocusRequestCount((count) => count + 1);
  });

  useConciergeTarget("concierge-lead-form", (action) => {
    setStatus({ type: "idle", message: "" });
    setBotSourceContext(
      botLeadFormSourceContext({
        vehicleId: action.params?.vehicleId,
        attribution: action.attribution,
      }),
    );
    setFocusRequestCount((count) => count + 1);
  });

  useEffect(() => {
    if (focusRequestCount === 0) return;
    const frameId = window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      firstNameInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusRequestCount]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.email.trim() && !form.phone.trim()) {
      setStatus({ type: "error", message: "Email or phone is required." });
      return;
    }

    setStatus({ type: "submitting", message: "Sending request…" });
    try {
      await submitLead({
        ...form,
        ...(botSourceContext?.trigger === "bot-action" &&
        botSourceContext.vehicleId
          ? { vehicleId: botSourceContext.vehicleId }
          : {}),
        source: botSourceContext ? "chat" : "contact-form",
        ...(botSourceContext ? { sourceContext: botSourceContext } : {}),
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      setForm(createEmptyContactForm());
      setBotSourceContext(null);
      setStatus({
        type: "success",
        message: "Request received. The dealership will follow up with you.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to submit request.",
      });
    } finally {
      if (TURNSTILE_SITE_KEY) {
        setTurnstileToken(null);
        setTurnstileResetKey((key) => key + 1);
      }
    }
  }

  return (
    <ConciergeLeadFormView
      formSectionRef={formSectionRef}
      firstNameInputRef={firstNameInputRef}
      form={form}
      setForm={setForm}
      handleSubmit={handleSubmit}
      status={status}
      verificationPending={Boolean(TURNSTILE_SITE_KEY) && !turnstileToken}
      verification={
        TURNSTILE_SITE_KEY ? (
          <TurnstileWidget
            key={turnstileResetKey}
            siteKey={TURNSTILE_SITE_KEY}
            onToken={setTurnstileToken}
          />
        ) : null
      }
    />
  );
}

function createEmptyContactForm(): ContactFormState {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
  };
}
