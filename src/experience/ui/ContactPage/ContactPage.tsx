import { type FormEvent, useState } from "react";
import CinematicShell from "../CinematicShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { submitLead } from "@/lib/leads";
import "./ContactPage.css";

type ContactPageProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToVehicles: () => void;
  onNavigateToShowcase: () => void;
};

export default function ContactPage({
  onGoHome,
  onNavigateToProducts,
  onNavigateToVehicles,
  onNavigateToShowcase,
}: ContactPageProps) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
  });
  const [status, setStatus] = useState<
    { type: "idle"; message: string } |
    { type: "submitting"; message: string } |
    { type: "success"; message: string } |
    { type: "error"; message: string }
  >({ type: "idle", message: "" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.email.trim() && !form.phone.trim()) {
      setStatus({ type: "error", message: "Email or phone is required." });
      return;
    }

    setStatus({ type: "submitting", message: "Sending request..." });
    try {
      await submitLead({
        ...form,
        source: "contact-form",
      });
      setForm({ firstName: "", lastName: "", email: "", phone: "", message: "" });
      setStatus({
        type: "success",
        message: "Request received. The LUME team will review it discreetly.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to submit request.",
      });
    }
  }

  return (
    <CinematicShell>
      <div className="contactPage">
        <main className="contactPage__main" style={{ paddingTop: "72px", paddingBottom: "160px" }}>
          <section className="contactPage__hero">
            <p className="contactPage__eyebrow">Access</p>
            <h1 className="contactPage__title">LUME is not found. It is entered by invitation.</h1>
            <p className="contactPage__lead">
              LUME is a secret luxury hotel in Monaco built around a different form of
              exclusivity. Wealth is not the currency. Impact is.
            </p>
          </section>

          <section className="contactPage__body" aria-label="About LUME access">
            <div className="contactPage__statement">
              <span>01</span>
              <p>
                Access to LUME is reserved for people who have positively influenced
                society and helped others. The invitation is not a purchase, a booking
                strategy, or a public application. It is recognition.
              </p>
            </div>

            <div className="contactPage__statement">
              <span>02</span>
              <p>
                Once invited, a guest is placed on the list. From that moment, they may
                request a stay whenever availability allows, but only once per year.
                When the visit ends, the card resets. The wait becomes part of the
                experience.
              </p>
            </div>

            <div className="contactPage__statement">
              <span>03</span>
              <p>
                Inside LUME, every object belongs to the stay. Special editions created
                with the world&apos;s most recognised brands exist only within the hotel.
                They are experienced there, and they remain there.
              </p>
            </div>
          </section>

          <section className="contactPage__closing">
            <p>
              For LUME, contact is not a form. It is the beginning of discretion,
              consideration, and alignment with a philosophy: the stay itself is the
              product, and access is earned by what a person contributes to the world.
            </p>
          </section>

          <section className="contactPage__formSection" aria-label="Invitation request">
            <div>
              <p className="contactPage__eyebrowSmall">Request consideration</p>
              <h2>Begin the private review.</h2>
            </div>
            <form className="contactPage__form" onSubmit={handleSubmit}>
              <div className="contactPage__formGrid">
                <label>
                  <span>First name</span>
                  <input
                    value={form.firstName}
                    onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                    autoComplete="given-name"
                  />
                </label>
                <label>
                  <span>Last name</span>
                  <input
                    value={form.lastName}
                    onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
                    autoComplete="family-name"
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    autoComplete="email"
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                    autoComplete="tel"
                  />
                </label>
              </div>
              <label className="contactPage__messageField">
                <span>Context</span>
                <textarea
                  value={form.message}
                  onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                  rows={5}
                />
              </label>
              {status.message && (
                <p
                  className={`contactPage__formStatus contactPage__formStatus--${status.type}`}
                  role={status.type === "error" ? "alert" : "status"}
                >
                  {status.message}
                </p>
              )}
              <button
                type="submit"
                className="contactPage__submit"
                disabled={status.type === "submitting"}
              >
                Submit request
              </button>
            </form>
          </section>
        </main>
        <SiteFooter onNavigate={(s) => {
          if (s === "home") onGoHome();
          else if (s === "products") onNavigateToProducts();
          else if (s === "vehicles") onNavigateToVehicles();
          else if (s === "showcase") onNavigateToShowcase();
        }} />
      </div>
    </CinematicShell>
  );
}
