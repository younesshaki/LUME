import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { loginOrRegister, type AuthUser } from "@/lib/authService";
import { useSound } from "@/lib/sound";
import { loginScreenSoundActions } from "./LoginScreen.sounds";
import "./LoginScreen.css";

type LoginScreenProps = {
  onSuccess: (user: AuthUser) => void;
};

const ACCESS_PASSWORD =
  (import.meta.env.VITE_ACCESS_PASSWORD as string | undefined) ?? "lume";

const ERROR_MESSAGES: Record<string, string> = {
  wrong_password: "incorrect password",
  username_taken: "this name is already taken",
  invalid_username:
    "name can only contain letters, numbers, and underscores (2–30 characters)",
  network_error: "something went wrong, please try again",
};

export default function LoginScreen({ onSuccess }: LoginScreenProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { play } = useSound();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".loginScreen__card > *",
        { autoAlpha: 0, y: 20 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 1.2,
          ease: "power3.out",
          stagger: 0.1,
        }
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || leaving) return;

    setErrorKey(null);

    if (password.trim() !== ACCESS_PASSWORD) {
      setErrorKey("wrong_password");
      return;
    }

    play(loginScreenSoundActions.submit);
    setLoading(true);

    const result = await loginOrRegister(username, ACCESS_PASSWORD);

    setLoading(false);

    if (!result.success) {
      setErrorKey(result.error);
      return;
    }

    setLeaving(true);
    gsap.to(rootRef.current, {
      autoAlpha: 0,
      duration: 0.9,
      ease: "power2.inOut",
      onComplete: () => onSuccess(result.user),
    });
  };

  const busy = loading || leaving;

  return (
    <div ref={rootRef} className="loginScreen">
      <form className="loginScreen__card" onSubmit={handleSubmit} noValidate>
        <p className="loginScreen__eyebrow">Private Preview</p>
        <h1 className="loginScreen__title">LUME</h1>

        <input
          className="loginScreen__input"
          type="text"
          placeholder="choose a name"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setErrorKey(null);
          }}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          disabled={busy}
          required
        />

        <input
          className="loginScreen__input"
          type="password"
          placeholder="enter access password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrorKey(null);
          }}
          autoComplete="current-password"
          disabled={busy}
          required
        />

        <p className="loginScreen__error">
          {errorKey ? ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.network_error : ""}
        </p>

        <button
          className="loginScreen__submit"
          type="submit"
          disabled={busy || !username.trim() || !password.trim()}
          onMouseEnter={busy ? undefined : () => play(loginScreenSoundActions.hover)}
        >
          {loading ? "..." : "Enter"}
        </button>
      </form>
    </div>
  );
}
