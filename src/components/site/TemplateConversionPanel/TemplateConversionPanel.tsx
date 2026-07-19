import {
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { getSiteTemplate, type SiteTemplateAction } from "@lume/types";
import { useNavigation } from "@/app-shell/NavigationProvider";
import { BlurFade } from "@/components/ui/blur-fade";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { useTenantSiteDesign } from "@/lib/TenantThemeProvider";
import { submitLead } from "@/lib/leads";
import {
  prefixTemplateLeadMessage,
  resolveTemplateAction,
  type TemplateActionBehavior,
} from "@/lib/siteTemplateExperience";
import "./TemplateConversionPanel.css";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();

type LeadBehavior = Extract<TemplateActionBehavior, { kind: "lead" }>;

type LeadFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
};

type SubmissionState =
  | { type: "idle"; message: "" }
  | { type: "submitting"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

const EMPTY_FORM: LeadFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  message: "",
};

export function TemplateConversionPanel() {
  const design = useTenantSiteDesign();
  const { navigateTo } = useNavigation();
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const firstNameRef = useRef<HTMLInputElement | null>(null);
  const [leadBehavior, setLeadBehavior] = useState<LeadBehavior | null>(null);
  const [form, setForm] = useState<LeadFormState>(EMPTY_FORM);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [submission, setSubmission] = useState<SubmissionState>({
    type: "idle",
    message: "",
  });
  const titleId = useId();
  const descriptionId = useId();

  // Waiting for the tenant document avoids briefly rendering Luxury copy for a
  // tenant whose published template is different.
  if (!design) return null;

  const template = getSiteTemplate(design.template.key);
  if (template.key === "luxury") return null;

  function activate(action: SiteTemplateAction) {
    const behavior = resolveTemplateAction(action);
    if (behavior.kind === "navigate") {
      navigateTo(
        { route: behavior.route },
        {
          analytics: {
            action: `template_${template.key}_${action}`,
          },
        },
      );
      return;
    }

    setLeadBehavior(behavior);
    setSubmission({ type: "idle", message: "" });
    setTurnstileToken(null);
    dialogRef.current?.showModal();
    window.requestAnimationFrame(() => firstNameRef.current?.focus());
  }

  function closeDialog() {
    if (submission.type === "submitting") return;
    dialogRef.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadBehavior) return;
    if (!form.email.trim() && !form.phone.trim()) {
      setSubmission({
        type: "error",
        message: "Add an email address or phone number so the dealership can follow up.",
      });
      return;
    }

    setSubmission({ type: "submitting", message: "Sending your request…" });
    try {
      await submitLead({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        message: prefixTemplateLeadMessage(leadBehavior, form.message),
        source: leadBehavior.source,
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      setForm(EMPTY_FORM);
      setSubmission({
        type: "success",
        message: "Request received. The dealership will follow up to confirm the next step.",
      });
    } catch (error) {
      setSubmission({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to send your request.",
      });
    } finally {
      if (TURNSTILE_SITE_KEY) {
        setTurnstileToken(null);
        setTurnstileResetKey((value) => value + 1);
      }
    }
  }

  return (
    <>
      <section
        className="templateConversion"
        aria-labelledby="template-conversion-heading"
        data-template={template.key}
        data-layout={template.visual.layout}
      >
        <BlurFade inView duration={reduceMotion ? 0 : 0.58} offset={reduceMotion ? 0 : 14}>
          <div className="templateConversion__surface">
            <GlowingEffect
              disabled={Boolean(reduceMotion)}
              proximity={90}
              spread={34}
              movementDuration={1.2}
              borderWidth={1}
            />
            <div className="templateConversion__ornament" aria-hidden="true" />
            <div className="templateConversion__copy">
              <p className="templateConversion__eyebrow">{template.conversion.eyebrow}</p>
              <h2 id="template-conversion-heading">{template.conversion.headline}</h2>
              <p className="templateConversion__description">{template.conversion.description}</p>
              <div className="templateConversion__actions">
                <button
                  type="button"
                  className="templateConversion__primary"
                  onClick={() => activate(template.conversion.primaryAction)}
                >
                  {template.conversion.primaryLabel}
                  <ArrowRight aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="templateConversion__secondary"
                  onClick={() => activate(template.conversion.secondaryAction)}
                >
                  {template.conversion.secondaryLabel}
                </button>
              </div>
            </div>
            <div className="templateConversion__proof" aria-label="Experience highlights">
              <span className="templateConversion__proofIndex">01—03</span>
              <ul>
                {template.conversion.trustPoints.map((point) => (
                  <li key={point}>
                    <Check aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </BlurFade>
      </section>

      <dialog
        ref={dialogRef}
        className="templateLeadDialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => {
          setLeadBehavior(null);
          setSubmission({ type: "idle", message: "" });
        }}
        onCancel={(event) => {
          if (submission.type === "submitting") event.preventDefault();
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        {leadBehavior ? (
          <div className="templateLeadDialog__panel">
            <button
              type="button"
              className="templateLeadDialog__close"
              onClick={closeDialog}
              aria-label="Close request form"
            >
              <X aria-hidden="true" />
            </button>
            <p className="templateLeadDialog__eyebrow">{template.name} concierge</p>
            <h2 id={titleId}>{leadBehavior.title}</h2>
            <p id={descriptionId}>{leadBehavior.description}</p>

            {submission.type === "success" ? (
              <div className="templateLeadDialog__success" role="status">
                <Check aria-hidden="true" />
                <p>{submission.message}</p>
                <button type="button" onClick={closeDialog}>Done</button>
              </div>
            ) : (
              <form onSubmit={(event) => void submit(event)}>
                <div className="templateLeadDialog__grid">
                  <label>
                    <span>First name</span>
                    <input
                      ref={firstNameRef}
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Last name</span>
                    <input
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="templateLeadDialog__message">
                  <span>{leadBehavior.messagePrompt}</span>
                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                  />
                </label>
                {TURNSTILE_SITE_KEY ? (
                  <TurnstileWidget
                    key={turnstileResetKey}
                    siteKey={TURNSTILE_SITE_KEY}
                    onToken={setTurnstileToken}
                  />
                ) : null}
                {submission.message ? (
                  <p
                    className={`templateLeadDialog__status templateLeadDialog__status--${submission.type}`}
                    role={submission.type === "error" ? "alert" : "status"}
                  >
                    {submission.message}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="templateLeadDialog__submit"
                  disabled={
                    submission.type === "submitting" ||
                    (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)
                  }
                >
                  {submission.type === "submitting" ? "Sending…" : "Send request"}
                  <ArrowRight aria-hidden="true" />
                </button>
              </form>
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
