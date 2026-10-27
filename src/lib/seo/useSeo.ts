import { resolveSeo, type SeoOptions } from "@lume/blocks/seo";
export {
  resolveSeo,
  LUME_SEO_FALLBACK,
  type SeoOptions,
  type SeoValues,
  type ResolvedSeo,
} from "@lume/blocks/seo";
import { useEffect, useMemo } from "react";

/** Own the document metadata for the current public route. */
export function useSeo(options: SeoOptions): void {
  const pageTitle = options.page?.title;
  const pageDescription = options.page?.description;
  const pageOgImage = options.page?.ogImage;
  const tenantTitle = options.tenant?.title;
  const tenantDescription = options.tenant?.description;
  const tenantOgImage = options.tenant?.ogImage;
  const fallbackTitle = options.fallback?.title;
  const fallbackDescription = options.fallback?.description;
  const fallbackOgImage = options.fallback?.ogImage;
  const canonicalPath = options.canonicalPath;

  const resolved = useMemo(
    () =>
      resolveSeo(
        {
          page: {
            title: pageTitle,
            description: pageDescription,
            ogImage: pageOgImage,
          },
          tenant: {
            title: tenantTitle,
            description: tenantDescription,
            ogImage: tenantOgImage,
          },
          fallback: {
            title: fallbackTitle,
            description: fallbackDescription,
            ogImage: fallbackOgImage,
          },
          canonicalPath,
        },
        typeof document === "undefined" ? "" : document.location.origin,
      ),
    [
      canonicalPath,
      fallbackDescription,
      fallbackOgImage,
      fallbackTitle,
      pageDescription,
      pageOgImage,
      pageTitle,
      tenantDescription,
      tenantOgImage,
      tenantTitle,
    ],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    const previousTitle = document.title;
    document.title = resolved.title;

    const restoreDescription = upsertMeta(
      "name",
      "description",
      resolved.description,
    );
    const restoreOgTitle = upsertMeta("property", "og:title", resolved.title);
    const restoreOgDescription = upsertMeta(
      "property",
      "og:description",
      resolved.description,
    );
    const restoreOgImage = upsertMeta("property", "og:image", resolved.ogImage);
    const restoreCanonical = upsertCanonical(resolved.canonical);

    return () => {
      document.title = previousTitle;
      restoreDescription();
      restoreOgTitle();
      restoreOgDescription();
      restoreOgImage();
      restoreCanonical();
    };
  }, [resolved]);
}

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
): () => void {
  const selector = `meta[${attribute}="${key}"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const element = existing ?? document.createElement("meta");
  const previousContent = existing?.getAttribute("content") ?? null;

  if (!existing) {
    element.setAttribute(attribute, key);
    element.dataset.lumeSeoManaged = "true";
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);

  return () => {
    if (!existing) {
      element.remove();
    } else if (previousContent === null) {
      element.removeAttribute("content");
    } else {
      element.setAttribute("content", previousContent);
    }
  };
}

function upsertCanonical(href: string): () => void {
  const existing = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  const element = existing ?? document.createElement("link");
  const previousHref = existing?.getAttribute("href") ?? null;

  if (!existing) {
    element.rel = "canonical";
    element.dataset.lumeSeoManaged = "true";
    document.head.appendChild(element);
  }
  element.href = href;

  return () => {
    if (!existing) {
      element.remove();
    } else if (previousHref === null) {
      element.removeAttribute("href");
    } else {
      element.setAttribute("href", previousHref);
    }
  };
}
