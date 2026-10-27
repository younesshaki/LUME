"use client";
import {
  CookieBanner,
  openCookiePreferences,
} from "@lume/blocks/react/CookieBanner";
export default function Consent({
  tenant,
  name,
}: {
  tenant: string;
  name: string;
}) {
  return (
    <>
      <CookieBanner
        tenantName={name}
        mode="standard"
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
        type="button"
        className="web-cookie-preferences"
        onClick={openCookiePreferences}
      >
        Cookie preferences
      </button>
    </>
  );
}
