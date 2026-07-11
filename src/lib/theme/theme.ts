export type ThemeMode = "light" | "dark" | "auto";
export type ResolvedTheme = Exclude<ThemeMode, "auto">;

export const THEME_STORAGE_KEY = "lume.color-theme.v1";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function resolveTheme(
  mode: ThemeMode,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (mode === "auto") return systemPrefersDark ? "dark" : "light";
  return mode;
}

export function readThemeMode(
  storage: Pick<Storage, "getItem"> | null = browserStorage()
): ThemeMode {
  if (!storage) return "auto";

  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function persistThemeMode(
  mode: ThemeMode,
  storage: Pick<Storage, "setItem"> | null = browserStorage()
): void {
  if (!storage) return;

  try {
    storage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Theme selection still works in memory when browser storage is unavailable.
  }
}

export function readSystemPrefersDark(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(THEME_MEDIA_QUERY).matches;
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "auto";
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
