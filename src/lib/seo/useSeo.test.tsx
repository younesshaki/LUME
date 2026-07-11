import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LUME_SEO_FALLBACK, resolveSeo, useSeo, type SeoOptions } from "./useSeo";

function SeoHarness({ options }: { options: SeoOptions }) {
  useSeo(options);
  return null;
}

function metaContent(selector: string): string | null {
  return document.head.querySelector<HTMLMetaElement>(selector)?.content ?? null;
}

describe("resolveSeo", () => {
  it("uses page values before tenant defaults and hardcoded fallbacks", () => {
    expect(
      resolveSeo(
        {
          page: { title: "About Atelier", description: "Page description" },
          tenant: { title: "Atelier Motors", description: "Tenant description" },
          canonicalPath: "/about",
        },
        "https://atelier.example"
      )
    ).toEqual({
      title: "About Atelier",
      description: "Page description",
      ogImage: "https://atelier.example/logo.svg",
      canonical: "https://atelier.example/about",
    });

    expect(resolveSeo({ tenant: { title: "Atelier Motors" } }).title).toBe("Atelier Motors");
    expect(resolveSeo({}).description).toBe(LUME_SEO_FALLBACK.description);
  });
});

describe("useSeo", () => {
  afterEach(() => {
    document.head.querySelectorAll('[data-lume-seo-managed="true"]').forEach((element) => {
      element.remove();
    });
  });

  it("updates route metadata and restores the previous head on cleanup", () => {
    document.title = "Before";
    const existingDescription = document.createElement("meta");
    existingDescription.name = "description";
    existingDescription.content = "Before description";
    document.head.appendChild(existingDescription);

    const view = render(
      <SeoHarness
        options={{
          page: {
            title: "Home — Atelier",
            description: "Curated vehicles.",
            ogImage: "/atelier.jpg",
          },
          canonicalPath: "/home",
        }}
      />
    );

    expect(document.title).toBe("Home — Atelier");
    expect(metaContent('meta[name="description"]')).toBe("Curated vehicles.");
    expect(metaContent('meta[property="og:title"]')).toBe("Home — Atelier");
    expect(metaContent('meta[property="og:description"]')).toBe("Curated vehicles.");
    expect(metaContent('meta[property="og:image"]')).toBe(`${document.location.origin}/atelier.jpg`);
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      `${document.location.origin}/home`
    );

    view.rerender(
      <SeoHarness
        options={{
          page: { title: "Journal — Atelier", description: "Latest stories." },
          canonicalPath: "/journal",
        }}
      />
    );

    expect(document.title).toBe("Journal — Atelier");
    expect(metaContent('meta[name="description"]')).toBe("Latest stories.");

    view.unmount();
    expect(document.title).toBe("Before");
    expect(existingDescription.content).toBe("Before description");
    expect(document.head.querySelector('meta[property="og:title"]')).toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();

    existingDescription.remove();
  });
});
