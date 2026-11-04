"use client";
export const audioPreferenceKey = (tenant: string) =>
  `lume.showcase-audio.v1:${tenant}`;
export function readAudioPreference(tenant: string): "on" | "off" {
  try {
    return localStorage.getItem(audioPreferenceKey(tenant)) === "on"
      ? "on"
      : "off";
  } catch {
    return "off";
  }
}
export function writeAudioPreference(tenant: string, value: "on" | "off") {
  try {
    localStorage.setItem(audioPreferenceKey(tenant), value);
  } catch {
    /* Session choice still works. */
  }
}
