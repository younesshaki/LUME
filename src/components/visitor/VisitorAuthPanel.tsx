import { type FormEvent, useState } from "react";
import { useVisitorAuth } from "@/lib/visitor/VisitorAuthContext";
import type { VisitorSignupInput } from "@/lib/visitor/types";

type AuthMode = "login" | "signup";

type AuthForm = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

const EMPTY_FORM: AuthForm = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
};

export function VisitorAuthPanel() {
  const { login, signup, pendingAction, error, clearError } = useVisitorAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState<AuthForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const isSubmitting = pendingAction === "login" || pendingAction === "signup";
  const displayedError = formError ?? error;

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFormError(null);
    clearError();
  };

  const updateField = (field: keyof AuthForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateAuthForm(form, mode);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    clearError();
    const email = form.email.trim().toLowerCase();

    try {
      if (mode === "login") {
        await login({ email, password: form.password });
      } else {
        const input: VisitorSignupInput = { email, password: form.password };
        const firstName = form.firstName.trim();
        const lastName = form.lastName.trim();
        if (firstName) input.firstName = firstName;
        if (lastName) input.lastName = lastName;
        await signup(input);
      }
      setForm(EMPTY_FORM);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to complete this request."
      );
    }
  }

  return (
    <section className="visitorAuth" aria-labelledby="visitor-auth-title">
      <div className="visitorAuth__mode" aria-label="Choose account action">
        <button
          type="button"
          className={mode === "login" ? "visitorAuth__modeButton visitorAuth__modeButton--active" : "visitorAuth__modeButton"}
          aria-pressed={mode === "login"}
          onClick={() => selectMode("login")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "signup" ? "visitorAuth__modeButton visitorAuth__modeButton--active" : "visitorAuth__modeButton"}
          aria-pressed={mode === "signup"}
          onClick={() => selectMode("signup")}
        >
          Create account
        </button>
      </div>

      <div className="visitorAuth__intro">
        <p className="visitorAccount__eyebrow">Private access</p>
        <h2 id="visitor-auth-title">
          {mode === "login" ? "Welcome back." : "Create your LUME account."}
        </h2>
        <p>
          {mode === "login"
            ? "Sign in to view your profile and loyalty activity."
            : "Your account keeps your private profile and loyalty history in one place."}
        </p>
      </div>

      <form className="visitorAuth__form" onSubmit={submit} noValidate aria-busy={isSubmitting}>
        {mode === "signup" ? (
          <div className="visitorAuth__nameGrid">
            <label>
              <span>First name <small>Optional</small></span>
              <input
                value={form.firstName}
                onChange={(event) => updateField("firstName", event.target.value)}
                autoComplete="given-name"
                maxLength={80}
              />
            </label>
            <label>
              <span>Last name <small>Optional</small></span>
              <input
                value={form.lastName}
                onChange={(event) => updateField("lastName", event.target.value)}
                autoComplete="family-name"
                maxLength={80}
              />
            </label>
          </div>
        ) : null}

        <label>
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </label>

        {displayedError ? (
          <p className="visitorAccount__status visitorAccount__status--error" role="alert">
            {displayedError}
          </p>
        ) : null}

        <button className="visitorAccount__primaryButton" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "login" ? "Signing in…" : "Creating account…"
            : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </section>
  );
}

export function validateAuthForm(form: AuthForm, mode: AuthMode): string | null {
  const email = form.email.trim();
  if (!email) return "Email is required.";
  if (!/^\S+@\S+\.\S+$/.test(email)) return "Enter a valid email address.";
  if (!form.password) return "Password is required.";
  if (form.password.length < 8) return "Password must be at least 8 characters.";
  if (mode === "signup" && form.firstName.trim().length > 80) {
    return "First name must be 80 characters or fewer.";
  }
  if (mode === "signup" && form.lastName.trim().length > 80) {
    return "Last name must be 80 characters or fewer.";
  }
  return null;
}
