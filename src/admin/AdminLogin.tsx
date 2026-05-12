import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app-shell/AuthProvider";
import { ROUTE_PATHS } from "../app-shell/routePaths";
import { loginOrRegister } from "../lib/authService";
import { useSound } from "../lib/sound";
import "./AdminLogin.css";

const ACCESS_PASSWORD =
  (import.meta.env.VITE_ACCESS_PASSWORD as string | undefined) ?? "lume";

type LocationState = {
  from?: string;
};

export function AdminLogin() {
  const { user, refresh } = useAuth();
  const { play } = useSound();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const from = (location.state as LocationState | null)?.from ?? ROUTE_PATHS.adminDashboard;

  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setError("");

    if (password.trim() !== ACCESS_PASSWORD) {
      setError("Incorrect access password.");
      return;
    }

    play("gate.submit");
    setSubmitting(true);
    const result = await loginOrRegister(username, ACCESS_PASSWORD);
    setSubmitting(false);

    if (!result.success) {
      setError("Unable to sign in. Check the username and password.");
      return;
    }

    await refresh();
    navigate(from, { replace: true });
  };

  return (
    <main className="adminLogin">
      <form className="adminLogin__form" onSubmit={handleSubmit}>
        <p className="adminLogin__eyebrow">LUME Admin</p>
        <h1>Admin Login</h1>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="access password"
          autoComplete="current-password"
        />
        <p className="adminLogin__error">{error}</p>
        <button type="submit" disabled={submitting || !username.trim() || !password.trim()}>
          {submitting ? "Signing in..." : "Enter Admin"}
        </button>
      </form>
    </main>
  );
}

