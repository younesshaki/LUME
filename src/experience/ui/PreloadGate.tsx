import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useUiSounds } from "../audio/useUiSounds";
import { checkExistingSession, loginOrRegister } from "../../lib/authService";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import "../loaders/preloader/styles.css";
import { useCdnImage } from "@/config/cdn";

type Phase = "checking" | "auth" | "ready";
type PreloadGateProps = {
  onStart: () => void;
};

const ACCESS_PASSWORD =
  (import.meta.env.VITE_ACCESS_PASSWORD as string | undefined) ?? "lume";

const ERROR_MESSAGES: Record<string, string> = {
  wrong_password: "incorrect password",
  username_taken: "this name is already taken",
  invalid_username: "letters, numbers and underscores only (2–30 chars)",
  network_error: "something went wrong, try again",
};

const USERNAME_PLACEHOLDERS = ["enter your name"];
const PASSWORD_PLACEHOLDERS = ["enter access password"];
const PRELOAD_GATE_BACKGROUND_IMAGE = "ChatGPT Image May 1, 2026, 09_26_21 PM.png";

export default function PreloadGate({ onStart }: PreloadGateProps) {
  const preloadGateBackground = useCdnImage(PRELOAD_GATE_BACKGROUND_IMAGE);
  const { playGateClick, playHover } = useUiSounds();
  const startTimeoutRef = useRef<number | null>(null);
  const authRef = useRef<HTMLDivElement | null>(null);
  const buttonShellRef = useRef<HTMLDivElement | null>(null);

  const [phase, setPhase] = useState<Phase>("checking");
  const [isStarting, setIsStarting] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession().then((user) => {
      if (user) {
        setPhase("ready");
      } else {
        setPhase("auth");
      }
    });
  }, []);

  // Animate auth form in when phase becomes "auth"
  useEffect(() => {
    if (phase !== "auth" || !authRef.current) return;
    gsap.fromTo(
      authRef.current.querySelectorAll(".pgAuth__item"),
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 1.1, ease: "power3.out", stagger: 0.1 }
    );
  }, [phase]);

  // Animate play button in when phase becomes "ready"
  useEffect(() => {
    if (phase !== "ready" || !buttonShellRef.current) return;
    gsap.fromTo(
      buttonShellRef.current,
      { autoAlpha: 0, scale: 0.88 },
      { autoAlpha: 1, scale: 1, duration: 1.2, ease: "power3.out" }
    );
  }, [phase]);

  useEffect(() => {
    return () => {
      if (startTimeoutRef.current !== null) {
        window.clearTimeout(startTimeoutRef.current);
      }
    };
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorKey(null);

    if (password.trim() !== ACCESS_PASSWORD) {
      setErrorKey("wrong_password");
      return;
    }

    setSubmitting(true);
    const result = await loginOrRegister(username, ACCESS_PASSWORD);
    setSubmitting(false);

    if (!result.success) {
      setErrorKey(result.error);
      return;
    }

    // Transition: fade out auth form, fade in play button
    if (authRef.current) {
      gsap.to(authRef.current, {
        autoAlpha: 0,
        y: -12,
        duration: 0.55,
        ease: "power2.in",
        onComplete: () => setPhase("ready"),
      });
    } else {
      setPhase("ready");
    }
  };

  const handleStart = () => {
    if (isStarting) return;
    setIsStarting(true);
    playGateClick();
    startTimeoutRef.current = window.setTimeout(() => {
      onStart();
    }, 1080);
  };

  const busy = submitting;

  return (
    <div className="preloadGate">
      <div
        className="preloadGateImage"
        style={{ backgroundImage: `url(${preloadGateBackground})` }}
      />

      {/* Auth form — shown before login */}
      {phase === "auth" || (phase === "checking") ? (
        <div ref={authRef} className="pgAuth">
          <form className="pgAuth__form" onSubmit={handleAuthSubmit} noValidate>
            <p className="pgAuth__item pgAuth__eyebrow">Private Preview</p>
            <PlaceholdersAndVanishInput
              className="pgAuth__item pgAuth__vanishInput"
              inputClassName="pgAuth__vanishInputField"
              placeholderClassName="pgAuth__vanishPlaceholder"
              placeholders={USERNAME_PLACEHOLDERS}
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setErrorKey(null); }}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
            />
            <PlaceholdersAndVanishInput
              className="pgAuth__item pgAuth__vanishInput pgAuth__vanishInput--password"
              inputClassName="pgAuth__vanishInputField"
              placeholderClassName="pgAuth__vanishPlaceholder pgAuth__vanishPlaceholder--password"
              placeholders={PASSWORD_PLACEHOLDERS}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrorKey(null); }}
              autoComplete="current-password"
              disabled={busy}
            />
            <p className="pgAuth__item pgAuth__error">
              {errorKey ? ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.network_error : ""}
            </p>
            <button
              className="pgAuth__item pgAuth__submit"
              type="submit"
              disabled={busy || !username.trim() || !password.trim()}
              onMouseEnter={!busy ? playHover : undefined}
            >
              {submitting ? "..." : "Enter"}
            </button>
          </form>
        </div>
      ) : null}

      {/* Play button — shown after successful login */}
      {phase === "ready" ? (
        <div
          ref={buttonShellRef}
          className={`preloadGateButtonShell${isStarting ? " isStarting" : ""}`}
          style={{ opacity: 0 }}
        >
          <span className="preloadGatePulse preloadGatePulse--glow" aria-hidden="true" />
          <span className="preloadGatePulse preloadGatePulse--ring" aria-hidden="true" />
          <button
            className="preloadGateButton"
            type="button"
            onMouseEnter={isStarting ? undefined : playHover}
            onFocus={isStarting ? undefined : playHover}
            onClick={handleStart}
            disabled={isStarting}
          >
            Play
          </button>
        </div>
      ) : null}

    </div>
  );
}
