import { Moon, Sun } from "lucide-react";
import { useDualMode } from "@/lib/DualModeContext";
import "./ModeToggle.css";

type ModeToggleProps = {
  className?: string;
};

export function ModeToggle({ className = "" }: ModeToggleProps) {
  const { mode, toggleMode } = useDualMode();
  const isLightMode = mode === "light";
  const label = isLightMode
    ? "Switch to experience mode"
    : "Switch to light mode";

  return (
    <button
      type="button"
      className={`modeToggle ${isLightMode ? "modeToggle--light" : "modeToggle--experience"} ${className}`.trim()}
      role="switch"
      aria-checked={isLightMode}
      aria-label={label}
      title={label}
      onClick={toggleMode}
    >
      <span className="modeToggle__track" aria-hidden="true">
        <span className="modeToggle__icon modeToggle__icon--experience">
          <Sun size={14} strokeWidth={1.8} />
        </span>
        <span className="modeToggle__icon modeToggle__icon--light">
          <Moon size={14} strokeWidth={1.8} />
        </span>
        <span className="modeToggle__thumb" />
      </span>
      <span className="modeToggle__label">
        {isLightMode ? "Light" : "Experience"}
      </span>
    </button>
  );
}
