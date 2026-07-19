export type ThemeMode = "light" | "dark";
export type ResolvedTheme = ThemeMode;

export const THEME_STORAGE_KEY = "lume.color-theme.v1";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
export const DEFAULT_THEME_MODE: ThemeMode = "dark";

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode;
}

export function readThemeMode(
  storage: Pick<Storage, "getItem" | "setItem"> | null = browserStorage(),
  systemPrefersDark?: boolean
): ThemeMode {
  if (!storage) return DEFAULT_THEME_MODE;

  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;

    // Older public releases offered an Auto mode. Keep its visible result on
    // the first binary-only release, then persist that concrete choice so the
    // setting no longer follows future OS preference changes.
    if (stored === "auto") {
      const migrated = (systemPrefersDark ?? readSystemPrefersDark()) ? "dark" : "light";
      storage.setItem(THEME_STORAGE_KEY, migrated);
      return migrated;
    }

    return DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
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
  return value === "light" || value === "dark";
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
