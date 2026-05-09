/**
 * LUME Sound System — preferences (mute / volume / categories)
 *
 * Module-global state with localStorage persistence. Subscribers can
 * react to changes via `subscribe()`. Categories are inferred from the
 * action namespace (first segment before the first dot).
 */

import type { SoundPreferences } from "./types";

export type { SoundPreferences };

const STORAGE_KEY = "lume-sound-prefs-v1";

const DEFAULT_PREFS: SoundPreferences = {
  master: { muted: false, volume: 1 },
  categories: {},
};

let prefs: SoundPreferences = loadPrefs();
const listeners = new Set<(p: SoundPreferences) => void>();

function loadPrefs(): SoundPreferences {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return structuredClone(DEFAULT_PREFS);
    const parsed = JSON.parse(raw) as Partial<SoundPreferences>;
    return {
      master: { ...DEFAULT_PREFS.master, ...parsed.master },
      categories: { ...DEFAULT_PREFS.categories, ...parsed.categories },
    };
  } catch {
    return structuredClone(DEFAULT_PREFS);
  }
}

function savePrefs() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {
    // quota exceeded or private mode — silent
  }
}

function notify() {
  for (const listener of listeners) listener(prefs);
}

export function getPreferences(): SoundPreferences {
  return prefs;
}

export function setMasterMuted(muted: boolean): void {
  prefs = { ...prefs, master: { ...prefs.master, muted } };
  savePrefs();
  notify();
}

export function setMasterVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  prefs = { ...prefs, master: { ...prefs.master, volume: clamped } };
  savePrefs();
  notify();
}

export function setCategoryMuted(category: string, muted: boolean): void {
  const current = prefs.categories[category] ?? { muted: false, volume: 1 };
  prefs = {
    ...prefs,
    categories: { ...prefs.categories, [category]: { ...current, muted } },
  };
  savePrefs();
  notify();
}

export function setCategoryVolume(category: string, volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  const current = prefs.categories[category] ?? { muted: false, volume: 1 };
  prefs = {
    ...prefs,
    categories: { ...prefs.categories, [category]: { ...current, volume: clamped } },
  };
  savePrefs();
  notify();
}

export function getCategoryFor(actionKey: string): string {
  const idx = actionKey.indexOf(".");
  return idx === -1 ? actionKey : actionKey.slice(0, idx);
}

export function subscribe(listener: (p: SoundPreferences) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
