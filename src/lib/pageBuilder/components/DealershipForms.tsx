import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { ArrowRight, Calculator, Check } from "lucide-react";
import type { LeadCaptureInput } from "@lume/types";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { submitLead } from "@/lib/leads";
import type { BlockComponentProps } from "../registry";
import { DealershipSection } from "./DealershipSection";
import { numberProp, stringProp } from "./props";
import { calculateMonthlyPayment } from "./dealershipBlockUtils";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();

type SubmissionState =
  | { type: "idle"; message: "" }
  | { type: "submitting"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type ContactState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const EMPTY_CONTACT: ContactState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

function useLeadSubmission(successMessage: string) {
  const inFlightRef = useRef(false);
  const [submission, setSubmission] = useState<SubmissionState>({
    type: "idle",
    message: "",
  });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  async function send(input: LeadCaptureInput, onSuccess: () => void) {
    if (inFlightRef.current) return;
    if (!input.email?.trim() && !input.phone?.trim()) {
      setSubmission({
        type: "error",
        message: "Add an email address or phone number so the dealership can respond.",
      });
      return;
    }
    inFlightRef.current = true;
    setSubmission({ type: "submitting", message: "Sending your request…" });
    try {
      await submitLead({
        ...input,
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      onSuccess();
      setSubmission({ type: "success", message: successMessage });
    } catch (error) {
      setSubmission({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to send your request.",
      });
    } finally {
      inFlightRef.current = false;
      if (TURNSTILE_SITE_KEY) {
        setTurnstileToken(null);
        setTurnstileResetKey((value) => value + 1);
      }
    }
  }

  return {
    submission,
    turnstileToken,
    turnstileResetKey,
    setTurnstileToken,
    send,
  };
}

function ContactFields({
  value,
  onChange,
}: {
  value: ContactState;
  onChange: Dispatch<SetStateAction<ContactState>>;
}) {
  return (
    <div className="dealershipForm__grid">
      <label className="dealershipForm__field">
        <span>First name</span>
        <input
          name="firstName"
          autoComplete="given-name"
          value={value.firstName}
          onChange={(event) =>
            onChange((current) => ({ ...current, firstName: event.target.value }))
          }
        />
      </label>
      <label className="dealershipForm__field">
        <span>Last name</span>
        <input
          name="lastName"
          autoComplete="family-name"
          value={value.lastName}
          onChange={(event) =>
            onChange((current) => ({ ...current, lastName: event.target.value }))
          }
        />
      </label>
      <label className="dealershipForm__field">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          value={value.email}
          onChange={(event) =>
            onChange((current) => ({ ...current, email: event.target.value }))
          }
        />
      </label>
      <label className="dealershipForm__field">
        <span>Phone</span>
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          value={value.phone}
          onChange={(event) =>
            onChange((current) => ({ ...current, phone: event.target.value }))
          }
        />
      </label>
    </div>
  );
}

function FormFeedback({ submission }: { submission: SubmissionState }) {
  if (!submission.message) return null;
  return (
    <p
      className={`dealershipForm__status dealershipForm__status--${submission.type}`}
      role={submission.type === "error" ? "alert" : "status"}
    >
      {submission.type === "success" ? <Check aria-hidden="true" /> : null}
      {submission.message}
    </p>
  );
}

function FormVerification({
  resetKey,
  onToken,
}: {
  resetKey: number;
  onToken: (token: string | null) => void;
}) {
  return TURNSTILE_SITE_KEY ? (
    <div className="dealershipForm__verification">
      <TurnstileWidget
        key={resetKey}
        siteKey={TURNSTILE_SITE_KEY}
        onToken={onToken}
      />
    </div>
  ) : null;
}

function submitDisabled(
  submission: SubmissionState,
  turnstileToken: string | null,
): boolean {
  return (
    submission.type === "submitting" ||
    (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)
  );
}

export function TradeInForm({ block }: BlockComponentProps) {
  const [contact, setContact] = useState<ContactState>(EMPTY_CONTACT);
  const [vehicle, setVehicle] = useState({
    year: "",
    make: "",
    model: "",
    mileage: "",
    condition: "Excellent",
  });
  const successMessage = stringProp(block, "successMessage");
  const lead = useLeadSubmission(successMessage);
  const disclaimer = stringProp(block, "disclaimer");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lead.send(
      {
        ...contact,
        source: "contact-form",
        message: [
          "[Trade-in appraisal]",
          `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim(),
          `Mileage: ${vehicle.mileage || "Not supplied"}`,
          `Condition: ${vehicle.condition}`,
        ].join("\n"),
      },
      () => {
        setContact(EMPTY_CONTACT);
        setVehicle({
          year: "",
          make: "",
          model: "",
          mileage: "",
          condition: "Excellent",
        });
      },
    );
  }

  return (
    <DealershipSection block={block} className="dealershipBlock--form">
      <form
        className="dealershipForm"
        onSubmit={handleSubmit}
        aria-busy={lead.submission.type === "submitting"}
      >
        <fieldset disabled={lead.submission.type === "submitting"}>
          <legend>Vehicle for appraisal</legend>
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
                value={vehicle.year}
                onChange={(event) =>
                  setVehicle((current) => ({ ...current, year: event.target.value }))
                }
              />
            </label>
            <label className="dealershipForm__field">
              <span>Make</span>
              <input
                name="tradeInMake"
                required
                value={vehicle.make}
                onChange={(event) =>
                  setVehicle((current) => ({ ...current, make: event.target.value }))
                }
              />
            </label>
            <label className="dealershipForm__field">
              <span>Model</span>
              <input
                name="tradeInModel"
                required
                value={vehicle.model}
                onChange={(event) =>
                  setVehicle((current) => ({ ...current, model: event.target.value }))
                }
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
                value={vehicle.mileage}
                onChange={(event) =>
                  setVehicle((current) => ({ ...current, mileage: event.target.value }))
                }
              />
            </label>
            <label className="dealershipForm__field">
              <span>Condition</span>
              <select
                name="tradeInCondition"
                value={vehicle.condition}
                onChange={(event) =>
                  setVehicle((current) => ({
                    ...current,
                    condition: event.target.value,
                  }))
                }
              >
                <option>Excellent</option>
                <option>Very good</option>
                <option>Good</option>
                <option>Needs attention</option>
              </select>
            </label>
          </div>
        </fieldset>
        <fieldset disabled={lead.submission.type === "submitting"}>
          <legend>Your details</legend>
          <ContactFields value={contact} onChange={setContact} />
        </fieldset>
        <FormVerification
          resetKey={lead.turnstileResetKey}
          onToken={lead.setTurnstileToken}
        />
        <FormFeedback submission={lead.submission} />
        <button
          className="dealershipForm__submit"
          type="submit"
          disabled={submitDisabled(lead.submission, lead.turnstileToken)}
        >
          {lead.submission.type === "submitting"
            ? "Sending…"
            : stringProp(block, "buttonLabel")}
          <ArrowRight aria-hidden="true" />
        </button>
        {disclaimer ? <p className="dealershipForm__disclaimer">{disclaimer}</p> : null}
      </form>
    </DealershipSection>
  );
}

export function FinanceCalculator({ block }: BlockComponentProps) {
  const defaultPrice = numberProp(block, "defaultPrice", 85000);
  const defaultDeposit = numberProp(block, "defaultDeposit", 15000);
  const defaultTerm = numberProp(block, "defaultTermMonths", 60);
  const defaultRate = numberProp(block, "defaultAnnualRate", 6.9);
  const [price, setPrice] = useState(defaultPrice);
  const [deposit, setDeposit] = useState(defaultDeposit);
  const [term, setTerm] = useState(defaultTerm);
  const [rate, setRate] = useState(defaultRate);
  const monthly = calculateMonthlyPayment(price, deposit, rate, term);

  useEffect(() => setPrice(defaultPrice), [defaultPrice]);
  useEffect(() => setDeposit(defaultDeposit), [defaultDeposit]);
  useEffect(() => setTerm(defaultTerm), [defaultTerm]);
  useEffect(() => setRate(defaultRate), [defaultRate]);

  return (
    <DealershipSection
      block={block}
      className="dealershipBlock--calculator"
      headerAside={<Calculator aria-hidden="true" />}
    >
      <div className="financeCalculator">
        <div className="financeCalculator__controls">
          <label className="dealershipForm__field">
            <span>Vehicle price</span>
            <input
              name="financePrice"
              type="number"
              min={0}
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(Number(event.target.value))}
            />
          </label>
          <label className="dealershipForm__field">
            <span>Deposit</span>
            <input
              name="financeDeposit"
              type="number"
              min={0}
              max={price}
              inputMode="decimal"
              value={deposit}
              onChange={(event) => setDeposit(Number(event.target.value))}
            />
          </label>
          <label className="dealershipForm__field">
            <span>Term</span>
            <select
              name="financeTerm"
              value={term}
              onChange={(event) => setTerm(Number(event.target.value))}
            >
              {[24, 36, 48, 60, 72, 84].map((months) => (
                <option key={months} value={months}>{months} months</option>
              ))}
            </select>
          </label>
          <label className="dealershipForm__field">
            <span>Illustrative annual rate (%)</span>
            <input
              name="financeRate"
              type="number"
              min={0}
              max={100}
              step={0.1}
              inputMode="decimal"
              value={rate}
              onChange={(event) => setRate(Number(event.target.value))}
            />
          </label>
        </div>
        <output className="financeCalculator__result" aria-live="polite">
          <span>Estimated monthly payment</span>
          <strong>
            {monthly.toLocaleString(undefined, {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            })}
          </strong>
          <small>
            {Math.round(term)} monthly payments on{" "}
            {Math.max(0, price - deposit).toLocaleString(undefined, {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            })}
          </small>
        </output>
      </div>
      <p className="dealershipForm__disclaimer">{stringProp(block, "disclaimer")}</p>
    </DealershipSection>
  );
}

export function TestDriveBooking({ block }: BlockComponentProps) {
  const [contact, setContact] = useState<ContactState>(EMPTY_CONTACT);
  const [request, setRequest] = useState({
    vehicle: "",
    date: "",
    time: "Morning",
    notes: "",
  });
  const lead = useLeadSubmission(stringProp(block, "successMessage"));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lead.send(
      {
        ...contact,
        source: "test-drive",
        message: [
          "[Test-drive request]",
          `Vehicle: ${request.vehicle}`,
          `Preferred date: ${request.date}`,
          `Preferred time: ${request.time}`,
          request.notes ? `Notes: ${request.notes}` : "",
        ].filter(Boolean).join("\n"),
      },
      () => {
        setContact(EMPTY_CONTACT);
        setRequest({ vehicle: "", date: "", time: "Morning", notes: "" });
      },
    );
  }

  return (
    <DealershipSection block={block} className="dealershipBlock--form">
      <form
        className="dealershipForm"
        onSubmit={handleSubmit}
        aria-busy={lead.submission.type === "submitting"}
      >
        <div className="dealershipForm__grid">
          <label className="dealershipForm__field dealershipForm__field--wide">
            <span>Vehicle of interest</span>
            <input
              name="testDriveVehicle"
              required
              placeholder="Year, make, and model"
              value={request.vehicle}
              onChange={(event) =>
                setRequest((current) => ({ ...current, vehicle: event.target.value }))
              }
            />
          </label>
          <label className="dealershipForm__field">
            <span>Preferred date</span>
            <input
              name="testDriveDate"
              type="date"
              required
              value={request.date}
              onChange={(event) =>
                setRequest((current) => ({ ...current, date: event.target.value }))
              }
            />
          </label>
          <label className="dealershipForm__field">
            <span>Preferred time</span>
            <select
              name="testDriveTime"
              value={request.time}
              onChange={(event) =>
                setRequest((current) => ({ ...current, time: event.target.value }))
              }
            >
              <option>Morning</option>
              <option>Afternoon</option>
              <option>Evening</option>
            </select>
          </label>
        </div>
        <ContactFields value={contact} onChange={setContact} />
        <label className="dealershipForm__field">
          <span>Anything we should prepare?</span>
          <textarea
            name="testDriveNotes"
            rows={4}
            value={request.notes}
            onChange={(event) =>
              setRequest((current) => ({ ...current, notes: event.target.value }))
            }
          />
        </label>
        <FormVerification
          resetKey={lead.turnstileResetKey}
          onToken={lead.setTurnstileToken}
        />
        <FormFeedback submission={lead.submission} />
        <button
          className="dealershipForm__submit"
          type="submit"
          disabled={submitDisabled(lead.submission, lead.turnstileToken)}
        >
          {lead.submission.type === "submitting"
            ? "Sending…"
            : stringProp(block, "buttonLabel")}
          <ArrowRight aria-hidden="true" />
        </button>
      </form>
    </DealershipSection>
  );
}

export function ServiceBooking({ block }: BlockComponentProps) {
  const [contact, setContact] = useState<ContactState>(EMPTY_CONTACT);
  const [request, setRequest] = useState({
    serviceType: "Scheduled maintenance",
    vehicle: "",
    date: "",
    time: "Morning",
    notes: "",
  });
  const lead = useLeadSubmission(stringProp(block, "successMessage"));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lead.send(
      {
        ...contact,
        source: "contact-form",
        message: [
          "[Service booking request]",
          `Service type: ${request.serviceType}`,
          `Vehicle: ${request.vehicle}`,
          `Preferred date: ${request.date}`,
          `Preferred time: ${request.time}`,
          request.notes ? `Notes: ${request.notes}` : "",
        ].filter(Boolean).join("\n"),
      },
      () => {
        setContact(EMPTY_CONTACT);
        setRequest({
          serviceType: "Scheduled maintenance",
          vehicle: "",
          date: "",
          time: "Morning",
          notes: "",
        });
      },
    );
  }

  return (
    <DealershipSection block={block} className="dealershipBlock--form">
      <form
        className="dealershipForm"
        onSubmit={handleSubmit}
        aria-busy={lead.submission.type === "submitting"}
      >
        <div className="dealershipForm__grid">
          <label className="dealershipForm__field">
            <span>Service type</span>
            <select
              name="serviceType"
              value={request.serviceType}
              onChange={(event) =>
                setRequest((current) => ({ ...current, serviceType: event.target.value }))
              }
            >
              <option>Scheduled maintenance</option>
              <option>Oil &amp; filter change</option>
              <option>Brakes</option>
              <option>Tires &amp; alignment</option>
              <option>Diagnostics</option>
              <option>Body &amp; paint</option>
              <option>Other</option>
            </select>
          </label>
          <label className="dealershipForm__field">
            <span>Vehicle</span>
            <input
              name="serviceVehicle"
              required
              placeholder="Year, make, and model"
              value={request.vehicle}
              onChange={(event) =>
                setRequest((current) => ({ ...current, vehicle: event.target.value }))
              }
            />
          </label>
          <label className="dealershipForm__field">
            <span>Preferred date</span>
            <input
              name="serviceDate"
              type="date"
              required
              value={request.date}
              onChange={(event) =>
                setRequest((current) => ({ ...current, date: event.target.value }))
              }
            />
          </label>
          <label className="dealershipForm__field">
            <span>Preferred time</span>
            <select
              name="serviceTime"
              value={request.time}
              onChange={(event) =>
                setRequest((current) => ({ ...current, time: event.target.value }))
              }
            >
              <option>Morning</option>
              <option>Afternoon</option>
              <option>Evening</option>
            </select>
          </label>
        </div>
        <ContactFields value={contact} onChange={setContact} />
        <label className="dealershipForm__field">
          <span>Anything the service team should know?</span>
          <textarea
            name="serviceNotes"
            rows={4}
            value={request.notes}
            onChange={(event) =>
              setRequest((current) => ({ ...current, notes: event.target.value }))
            }
          />
        </label>
        <FormVerification
          resetKey={lead.turnstileResetKey}
          onToken={lead.setTurnstileToken}
        />
        <FormFeedback submission={lead.submission} />
        <button
          className="dealershipForm__submit"
          type="submit"
          disabled={submitDisabled(lead.submission, lead.turnstileToken)}
        >
          {lead.submission.type === "submitting"
            ? "Sending…"
            : stringProp(block, "buttonLabel")}
          <ArrowRight aria-hidden="true" />
        </button>
      </form>
    </DealershipSection>
  );
}

export function LeadCaptureForm({ block }: BlockComponentProps) {
  const [contact, setContact] = useState<ContactState>(EMPTY_CONTACT);
  const [message, setMessage] = useState("");
  const lead = useLeadSubmission(stringProp(block, "successMessage"));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lead.send(
      {
        ...contact,
        message,
        source: "contact-form",
      },
      () => {
        setContact(EMPTY_CONTACT);
        setMessage("");
      },
    );
  }

  return (
    <DealershipSection block={block} className="dealershipBlock--form">
      <form
        className="dealershipForm"
        onSubmit={handleSubmit}
        aria-busy={lead.submission.type === "submitting"}
      >
        <ContactFields value={contact} onChange={setContact} />
        <label className="dealershipForm__field">
          <span>How can we help?</span>
          <textarea
            name="message"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <FormVerification
          resetKey={lead.turnstileResetKey}
          onToken={lead.setTurnstileToken}
        />
        <FormFeedback submission={lead.submission} />
        <button
          className="dealershipForm__submit"
          type="submit"
          disabled={submitDisabled(lead.submission, lead.turnstileToken)}
        >
          {lead.submission.type === "submitting"
            ? "Sending…"
            : stringProp(block, "buttonLabel")}
          <ArrowRight aria-hidden="true" />
        </button>
      </form>
    </DealershipSection>
  );
}

export function NewsletterSignup({ block }: BlockComponentProps) {
  const [email, setEmail] = useState("");
  const lead = useLeadSubmission(stringProp(block, "successMessage"));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lead.send(
      {
        email,
        source: "contact-form",
        message: "[New-arrival notification request]",
      },
      () => setEmail(""),
    );
  }

  return (
    <DealershipSection block={block} className="dealershipBlock--newsletter">
      <form
        className="newsletterForm"
        onSubmit={handleSubmit}
        aria-busy={lead.submission.type === "submitting"}
      >
        <label>
          <span className="dealershipBlock__srOnly">Email address</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={submitDisabled(lead.submission, lead.turnstileToken)}
        >
          {lead.submission.type === "submitting"
            ? "Sending…"
            : stringProp(block, "buttonLabel")}
          <ArrowRight aria-hidden="true" />
        </button>
        <FormVerification
          resetKey={lead.turnstileResetKey}
          onToken={lead.setTurnstileToken}
        />
        <FormFeedback submission={lead.submission} />
      </form>
    </DealershipSection>
  );
}
