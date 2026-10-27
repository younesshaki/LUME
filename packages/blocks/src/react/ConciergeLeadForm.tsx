import type {
  Dispatch,
  SetStateAction,
  FormEventHandler,
  ReactNode,
  Ref,
} from "react";
export type ContactFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
};
export type ContactSubmissionState = {
  type: "idle" | "submitting" | "success" | "error";
  message: string;
};
export type ContactFormProps = {
  formSectionRef?: Ref<HTMLElement>;
  firstNameInputRef?: Ref<HTMLInputElement>;
  form: ContactFormState;
  setForm: Dispatch<SetStateAction<ContactFormState>>;
  handleSubmit: FormEventHandler<HTMLFormElement>;
  status: ContactSubmissionState;
  verification?: ReactNode;
  verificationPending?: boolean;
};
export function ConciergeLeadFormView({
  formSectionRef,
  firstNameInputRef,
  form,
  setForm,
  handleSubmit,
  status,
  verification,
  verificationPending,
}: ContactFormProps) {
  return (
    <section
      id="concierge-lead-form"
      ref={formSectionRef}
      className="contactPage__formSection"
      aria-label="Dealership inquiry"
      data-concierge-target="contact-lead-form"
    >
      <div>
        <p className="contactPage__eyebrowSmall">Request information</p>
        <h2>Continue with the dealership.</h2>
      </div>
      <form className="contactPage__form" onSubmit={handleSubmit}>
        <div className="contactPage__formGrid">
          <label>
            <span>First name</span>
            <input
              ref={firstNameInputRef}
              value={form.firstName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  firstName: event.target.value,
                }))
              }
              autoComplete="given-name"
            />
          </label>
          <label>
            <span>Last name</span>
            <input
              value={form.lastName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  lastName: event.target.value,
                }))
              }
              autoComplete="family-name"
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              autoComplete="email"
            />
          </label>
          <label>
            <span>Phone</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              autoComplete="tel"
            />
          </label>
        </div>
        <label className="contactPage__messageField">
          <span>How can we help?</span>
          <textarea
            value={form.message}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                message: event.target.value,
              }))
            }
            rows={5}
          />
        </label>
        {verification}
        {status.message ? (
          <p
            className={`contactPage__formStatus contactPage__formStatus--${status.type}`}
            role={status.type === "error" ? "alert" : "status"}
          >
            {status.message}
          </p>
        ) : null}
        <button
          type="submit"
          className="contactPage__submit"
          disabled={status.type === "submitting" || verificationPending}
        >
          {status.type === "submitting" ? "Sending…" : "Submit request"}
        </button>
      </form>
    </section>
  );
}
