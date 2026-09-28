export type ThemeMode = "light" | "dark";
export type ResolvedTheme = ThemeMode;

export const THEME_STORAGE_KEY = "lume.color-theme.v1";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
export const DEFAULT_THEME_MODE: ThemeMode = "dark";

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode;
}

/** Set when the visitor picked a mode themselves (the toggle), not a default. */
export const THEME_CHOICE_STORAGE_KEY = "lume.color-theme.chosen.v1";
/**
 * The last site's template default mode, so the pre-React script in
 * index.html can paint it before the tenant's design loads (no dark flash).
 */
export const THEME_SITE_DEFAULT_STORAGE_KEY = "lume.color-theme.site-default.v1";

type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * The mode to show: the visitor's own choice, else the site's template
 * default, else an older stored value, else dark. Keep in step with the
 * inline script in index.html.
 */
export function readThemeMode(
  storage: Pick<Storage, "getItem" | "setItem"> | null = browserStorage(),
  systemPrefersDark?: boolean
): ThemeMode {
  if (!storage) return DEFAULT_THEME_MODE;

  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored) && storage.getItem(THEME_CHOICE_STORAGE_KEY) === "1") return stored;

    const siteDefault = storage.getItem(THEME_SITE_DEFAULT_STORAGE_KEY);
    if (isThemeMode(siteDefault)) return siteDefault;
    if (isThemeMode(stored)) return stored;

    // Older public releases offered an Auto mode. Keep its visible result on
    // the first binary-only release, then persist that concrete choice so the
    // setting no longer follows future OS preference changes.
    if (stored === "auto") {
      const migrated = (systemPrefersDark ?? readSystemPrefersDark()) ? "dark" : "light";
      persistThemeMode(migrated, storage);
      return migrated;
    }

    return DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

/**
 * Record the active site's template default (null: the template has none) and
 * return the mode to show now. A visitor's own choice is never overridden.
 */
export function applySiteDefaultMode(
  siteDefault: ThemeMode | null,
  storage: ThemeStorage | null = browserStorage()
): ThemeMode {
  if (!storage) return siteDefault ?? DEFAULT_THEME_MODE;
  try {
    if (siteDefault) storage.setItem(THEME_SITE_DEFAULT_STORAGE_KEY, siteDefault);
    else storage.removeItem(THEME_SITE_DEFAULT_STORAGE_KEY);
  } catch {
    // Storage unavailable: the default still applies for this page view.
  }
  return readThemeMode(storage);
}

export function persistThemeMode(
  mode: ThemeMode,
  storage: Pick<Storage, "setItem"> | null = browserStorage()
): void {
  if (!storage) return;

  try {
    storage.setItem(THEME_STORAGE_KEY, mode);
    storage.setItem(THEME_CHOICE_STORAGE_KEY, "1");
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
