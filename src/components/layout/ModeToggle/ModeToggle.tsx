import { Gauge, Zap } from "lucide-react";
import { useDualMode } from "@/lib/DualModeContext";
import "./ModeToggle.css";

type ModeToggleProps = {
  className?: string;
};

export function ModeToggle({ className = "" }: ModeToggleProps) {
  const { mode, toggleMode } = useDualMode();
  const isStandardMode = mode === "standard";
  const label = isStandardMode
    ? "Switch to experience mode"
    : "Switch to standard mode";

  return (
    <button
      type="button"
      className={`modeToggle ${isStandardMode ? "modeToggle--standard" : "modeToggle--experience"} ${className}`.trim()}
      role="switch"
      aria-checked={isStandardMode}
      aria-label={label}
      title={label}
      onClick={toggleMode}
    >
      <span className="modeToggle__track" aria-hidden="true">
        <span className="modeToggle__icon modeToggle__icon--experience">
          <Zap size={14} strokeWidth={1.9} />
        </span>
        <span className="modeToggle__icon modeToggle__icon--standard">
          <Gauge size={14} strokeWidth={1.9} />
        </span>
        <span className="modeToggle__thumb" />
      </span>
      <span className="modeToggle__label">
        {isStandardMode ? "Standard" : "Cinematic"}
      </span>
    </button>
  );
}
