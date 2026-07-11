import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "@/lib/theme/ThemeContext";
import type { ThemeMode } from "@/lib/theme/theme";
import "./ThemeToggle.css";

const MODE_ORDER: ThemeMode[] = ["light", "dark", "auto"];

const MODE_DETAILS: Record<ThemeMode, { label: string; icon: LucideIcon }> = {
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
  auto: { label: "Auto", icon: Monitor },
};

export function ThemeToggle() {
  const { mode, resolvedTheme, setMode } = useTheme();
  const currentIndex = MODE_ORDER.indexOf(mode);
  const nextMode = MODE_ORDER[(currentIndex + 1) % MODE_ORDER.length];
  const { label, icon: Icon } = MODE_DETAILS[mode];
  const nextLabel = MODE_DETAILS[nextMode].label;
  const currentLabel = mode === "auto" ? `${label} (${resolvedTheme})` : label;
  const accessibleLabel = `Color theme: ${currentLabel}. Switch to ${nextLabel}.`;

  return (
    <button
      type="button"
      className="themeToggle"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      onClick={() => setMode(nextMode)}
    >
      <Icon className="themeToggle__icon" size={15} strokeWidth={1.9} aria-hidden="true" />
      <span className="themeToggle__label">{label}</span>
    </button>
  );
}
