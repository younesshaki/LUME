"use client";
import { useEffect } from "react";
import {
  CookieBanner,
  COOKIE_CONSENT_STORAGE_KEY,
  readCookieConsent,
  openCookiePreferences,
} from "@lume/blocks/react/CookieBanner";
import type { StoryStore } from "./story-store";

export default function StoryConsent({
  tenant,
  store,
}: {
  tenant: string;
  store: StoryStore;
}) {
  useEffect(() => {
    const read = () => store.update({ consent: readCookieConsent() });
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === COOKIE_CONSENT_STORAGE_KEY)
        read();
    };
    read();
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, [store]);
  return (
    <>
      <CookieBanner
        mode="experience"
        onConsentChange={(consent) => store.update({ consent })}
        reportChoice={(choice, version) => {
          void fetch(`/api/consent?tenant=${encodeURIComponent(tenant)}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Lume-Tenant": tenant,
            },
            body: JSON.stringify({ choice, version }),
            keepalive: true,
          }).catch(() => undefined);
        }}
      />
      <button
        className="showcase__button"
        type="button"
        onClick={openCookiePreferences}
      >
        Cookie preferences
      </button>
    </>
  );
}
