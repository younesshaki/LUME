import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { resolveBlockVariant } from "@lume/blocks";
import { getBlockDescriptor } from "@lume/blocks";
import type { BlockComponentProps } from "../registry";
import { stringProp } from "./props";
import { DealershipSection } from "./DealershipSection";
import { ShineBorder } from "@/components/ui/shine-border";
import {
  ContactFields,
  EMPTY_CONTACT,
  FormFeedback,
  FormVerification,
  submitDisabled,
  useLeadSubmission,
  type ContactState,
} from "./DealershipForms";
import "./TradeInFormVariants.css";

/**
 * Trade-in form designs.
 *
 * Every variant shares one submission path, one validation story, and one lead
 * payload — only the layout differs. That is the entire argument for variants
 * over separate block types: a dealer can switch design without losing the
 * copy they wrote, and there is no second implementation of lead capture to
 * keep in sync.
 *
 * `classic` reproduces the pre-variants layout exactly, so introducing variants
 * changed nothing for pages already published.
 */

type VehicleState = {
  year: string;
  make: string;
  model: string;
  mileage: string;
  condition: string;
};

const EMPTY_VEHICLE: VehicleState = {
  year: "",
  make: "",
  model: "",
  mileage: "",
  condition: "Excellent",
};

const CONDITIONS = ["Excellent", "Very good", "Good", "Needs attention"] as const;

/** Shared lead body, so every variant reports identically to the pipeline. */
function tradeInMessage(vehicle: VehicleState): string {
  return [
    "[Trade-in appraisal]",
    `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim(),
    `Mileage: ${vehicle.mileage || "Not supplied"}`,
    `Condition: ${vehicle.condition}`,
  ].join("\n");
}

function VehicleFields({
  value,
  onChange,
}: {
  value: VehicleState;
  onChange: (next: VehicleState) => void;
}) {
  const set = (patch: Partial<VehicleState>) => onChange({ ...value, ...patch });
  return (
    <div className="dealershipForm__grid dealershipForm__grid--vehicle">
      <label className="dealershipForm__field">
        <span>Year</span>
        <input
          name="tradeInYear"
          type="number"
          min={1900}
          max={2100}
          required
          inputMode="numeric"
          value={value.year}
          onChange={(event) => set({ year: event.target.value })}
        />
      </label>
      <label className="dealershipForm__field">
        <span>Make</span>
        <input
          name="tradeInMake"
          required
          value={value.make}
          onChange={(event) => set({ make: event.target.value })}
        />
      </label>
      <label className="dealershipForm__field">
        <span>Model</span>
        <input
          name="tradeInModel"
          required
          value={value.model}
          onChange={(event) => set({ model: event.target.value })}
        />
      </label>
      <label className="dealershipForm__field">
        <span>Mileage</span>
        <input
          name="tradeInMileage"
          type="number"
          min={0}
          required
          inputMode="numeric"
          value={value.mileage}
          onChange={(event) => set({ mileage: event.target.value })}
        />
      </label>
      <label className="dealershipForm__field">
        <span>Condition</span>
        <select
          name="tradeInCondition"
          value={value.condition}
          onChange={(event) => set({ condition: event.target.value })}
        >
          {CONDITIONS.map((condition) => (
            <option key={condition}>{condition}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Everything the three layouts share: state, submission, reset. */
function useTradeInForm(block: BlockComponentProps["block"]) {
  const [contact, setContact] = useState<ContactState>(EMPTY_CONTACT);
  const [vehicle, setVehicle] = useState<VehicleState>(EMPTY_VEHICLE);
  const lead = useLeadSubmission(stringProp(block, "successMessage"));
  const submitting = lead.submission.type === "submitting";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lead.send(
      { ...contact, source: "contact-form", message: tradeInMessage(vehicle) },
      () => {
        setContact(EMPTY_CONTACT);
        setVehicle(EMPTY_VEHICLE);
      },
    );
  }

  return { contact, setContact, vehicle, setVehicle, lead, submitting, submit };
}

function SubmitButton({
  block,
  lead,
  submitting,
}: {
  block: BlockComponentProps["block"];
  lead: ReturnType<typeof useLeadSubmission>;
  submitting: boolean;
}) {
  return (
    <button
      className="dealershipForm__submit"
      type="submit"
      disabled={submitDisabled(lead.submission, lead.turnstileToken)}
    >
      {submitting ? "Sending…" : stringProp(block, "buttonLabel")}
      <ArrowRight aria-hidden="true" />
    </button>
  );
}

/* ── classic: the original single-column layout ──────────────────────────── */

function ClassicTradeIn({ block }: BlockComponentProps) {
  const form = useTradeInForm(block);
  const disclaimer = stringProp(block, "disclaimer");
  return (
    <DealershipSection block={block} className="dealershipBlock--form">
      <form className="dealershipForm" onSubmit={form.submit} aria-busy={form.submitting}>
        <fieldset disabled={form.submitting}>
          <legend>Vehicle for appraisal</legend>
          <VehicleFields value={form.vehicle} onChange={form.setVehicle} />
        </fieldset>
        <fieldset disabled={form.submitting}>
          <legend>Your details</legend>
          <ContactFields value={form.contact} onChange={form.setContact} />
        </fieldset>
        <FormVerification resetKey={form.lead.turnstileResetKey} onToken={form.lead.setTurnstileToken} />
        <FormFeedback submission={form.lead.submission} />
        <SubmitButton block={block} lead={form.lead} submitting={form.submitting} />
        {disclaimer ? <p className="dealershipForm__disclaimer">{disclaimer}</p> : null}
      </form>
    </DealershipSection>
  );
}

/* ── wizard: three short steps instead of one long form ──────────────────── */

const WIZARD_STEPS = ["Vehicle", "Your details", "Confirm"] as const;

function WizardTradeIn({ block }: BlockComponentProps) {
  const form = useTradeInForm(block);
  const [step, setStep] = useState(0);
  const disclaimer = stringProp(block, "disclaimer");

  // Gate progression on the fields that step actually owns, so a visitor is
  // never told "required" about something on a screen they cannot see.
  const vehicleComplete = Boolean(
    form.vehicle.year && form.vehicle.make && form.vehicle.model && form.vehicle.mileage,
  );
  const contactComplete = Boolean(form.contact.email || form.contact.phone);
  const canAdvance = step === 0 ? vehicleComplete : step === 1 ? contactComplete : true;

  return (
    <DealershipSection block={block} className="dealershipBlock--form tradeInWizard">
      <ol className="tradeInWizard__steps" aria-label="Progress">
        {WIZARD_STEPS.map((label, index) => (
          <li
            key={label}
            className={`tradeInWizard__step${index === step ? " is-current" : ""}${index < step ? " is-done" : ""}`}
            aria-current={index === step ? "step" : undefined}
          >
            <span className="tradeInWizard__marker" aria-hidden="true">
              {index < step ? <Check /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <form className="dealershipForm" onSubmit={form.submit} aria-busy={form.submitting}>
        {/* Steps stay mounted so typed values survive navigation; only the
            inactive ones are hidden. Unmounting would silently clear input. */}
        <fieldset disabled={form.submitting} hidden={step !== 0}>
          <legend>Vehicle for appraisal</legend>
          <VehicleFields value={form.vehicle} onChange={form.setVehicle} />
        </fieldset>
        <fieldset disabled={form.submitting} hidden={step !== 1}>
          <legend>Your details</legend>
          <ContactFields value={form.contact} onChange={form.setContact} />
        </fieldset>

        {step === 2 && (
          <div className="tradeInWizard__review">
            <h4>Ready to send</h4>
            <dl>
              <div>
                <dt>Vehicle</dt>
                <dd>
                  {[form.vehicle.year, form.vehicle.make, form.vehicle.model]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </dd>
              </div>
              <div>
                <dt>Mileage</dt>
                <dd>{form.vehicle.mileage || "—"}</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>{form.vehicle.condition}</dd>
              </div>
            </dl>
            <FormVerification
              resetKey={form.lead.turnstileResetKey}
              onToken={form.lead.setTurnstileToken}
            />
          </div>
        )}

        <FormFeedback submission={form.lead.submission} />

        <div className="tradeInWizard__actions">
          {step > 0 && (
            <button
              type="button"
              className="tradeInWizard__back"
              onClick={() => setStep((value) => value - 1)}
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </button>
          )}
          {step < WIZARD_STEPS.length - 1 ? (
            <button
              type="button"
              className="dealershipForm__submit"
              disabled={!canAdvance}
              onClick={() => setStep((value) => value + 1)}
            >
              Continue
              <ArrowRight aria-hidden="true" />
            </button>
          ) : (
            <SubmitButton block={block} lead={form.lead} submitting={form.submitting} />
          )}
        </div>
        {disclaimer ? <p className="dealershipForm__disclaimer">{disclaimer}</p> : null}
      </form>
    </DealershipSection>
  );
}

/* ── spotlight: compact card with an animated border ─────────────────────── */

function SpotlightTradeIn({ block }: BlockComponentProps) {
  const form = useTradeInForm(block);
  const disclaimer = stringProp(block, "disclaimer");
  return (
    <DealershipSection block={block} className="dealershipBlock--form tradeInSpotlight">
      <div className="tradeInSpotlight__card">
        {/* Decorative only, and motion-safe by construction (see the vendored
            component's motion-safe: prefix). */}
        <ShineBorder
          className="tradeInSpotlight__shine"
          shineColor={["var(--theme-lume-gold, #C9A84C)", "transparent"]}
          duration={12}
        />
        <form
          className="dealershipForm tradeInSpotlight__form"
          onSubmit={form.submit}
          aria-busy={form.submitting}
        >
          <div className="tradeInSpotlight__columns">
            <fieldset disabled={form.submitting}>
              <legend>Vehicle</legend>
              <VehicleFields value={form.vehicle} onChange={form.setVehicle} />
            </fieldset>
            <fieldset disabled={form.submitting}>
              <legend>You</legend>
              <ContactFields value={form.contact} onChange={form.setContact} />
            </fieldset>
          </div>
          <FormVerification
            resetKey={form.lead.turnstileResetKey}
            onToken={form.lead.setTurnstileToken}
          />
          <FormFeedback submission={form.lead.submission} />
          <SubmitButton block={block} lead={form.lead} submitting={form.submitting} />
          {disclaimer ? <p className="dealershipForm__disclaimer">{disclaimer}</p> : null}
        </form>
      </div>
    </DealershipSection>
  );
}

/* ── entry point ─────────────────────────────────────────────────────────── */

const LAYOUTS: Record<string, (props: BlockComponentProps) => JSX.Element> = {
  classic: ClassicTradeIn,
  wizard: WizardTradeIn,
  spotlight: SpotlightTradeIn,
};

export function TradeInForm(props: BlockComponentProps) {
  const descriptor = getBlockDescriptor("trade-in-form");
  const variant = resolveBlockVariant(
    descriptor?.variants,
    props.block.props as Record<string, unknown>,
  );
  // resolveBlockVariant already falls back to the first declared variant, so
  // this only guards a descriptor with no variants at all.
  const Layout = LAYOUTS[variant ?? "classic"] ?? ClassicTradeIn;
  return <Layout {...props} />;
}
