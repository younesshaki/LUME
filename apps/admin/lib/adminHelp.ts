/**
 * Versioned, global LUME product help for the authenticated dashboard.
 *
 * This intentionally does not live in tenant RAG. Product help is curated with
 * the application release and must never be implemented as a missing-tenant
 * wildcard over tenant-owned documents.
 */
export type AdminHelpArticle = {
  id: string;
  title: string;
  capabilityId: string;
  keywords: readonly string[];
  answer: string;
};

export const ADMIN_HELP_ARTICLES: readonly AdminHelpArticle[] = [
  article(
    "inventory-import",
    "Import inventory",
    "vehicles.import",
    ["csv", "upload", "import", "inventory", "feed"],
    "Open Inventory import, choose Add, Replace, or Synchronize, preview the changes, then confirm only after the counts and conflicts look correct.",
  ),
  article(
    "managed-feeds",
    "Manage inventory feeds",
    "feeds.view",
    ["feed", "sync", "sftp", "supplier", "schedule"],
    "Open Inventory feeds to configure a supplier source, inspect recent runs, and review failures. Running a feed is a separately confirmed operation.",
  ),
  article(
    "pages",
    "Build and publish pages",
    "pages.view",
    ["page", "builder", "publish", "website", "section", "block"],
    "Open Pages, edit a draft with page-builder blocks, use Preview to review it, and publish only when the draft is ready to replace the live revision.",
  ),
  article(
    "branding",
    "Update branding",
    "branding.view",
    ["brand", "logo", "colors", "font", "identity"],
    "Open Brand assets to manage the dealership logo and approved visual assets. Use Design for theme and color changes, then verify the public preview before publishing.",
  ),
  article(
    "leads",
    "Work with leads",
    "leads.search",
    ["lead", "inquiry", "contact", "qualified", "assign"],
    "Open Leads to review the inquiry source and activity timeline. Status changes and assignments are prepared and confirmed separately so the wrong record is not changed silently.",
  ),
  article(
    "concierge",
    "Configure the public concierge",
    "concierge.view",
    ["concierge", "persona", "model", "tools", "bot", "ai"],
    "Open Concierge configuration to choose the approved model, persona, and allowed tools. Test changes in preview before relying on them on the public site.",
  ),
  article(
    "launch",
    "Check launch readiness",
    "setup.readiness",
    ["launch", "ready", "go live", "setup", "checklist"],
    "Ask for launch readiness to run the verified setup checks. Resolve the listed blockers, then rerun the check before going live.",
  ),
  article(
    "photos",
    "Find vehicles missing photos",
    "inventory.photo_gap",
    ["photo", "image", "missing", "vehicle", "gallery"],
    "Ask for vehicles missing photos to get a tenant-scoped report, then open Inventory to add or import managed images for those vehicles.",
  ),
] as const;

export function searchAdminHelp(query: string, limit = 3): AdminHelpArticle[] {
  const terms = normalize(query)
    .split(" ")
    .filter((term) => term.length > 1);
  if (terms.length === 0) return [];
  return ADMIN_HELP_ARTICLES.map((entry) => {
    const title = normalize(entry.title);
    const haystack = normalize(
      `${entry.title} ${entry.keywords.join(" ")} ${entry.answer}`,
    );
    const score = terms.reduce(
      (total, term) =>
        total + (title.includes(term) ? 3 : haystack.includes(term) ? 1 : 0),
      0,
    );
    return { entry, score };
  })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title),
    )
    .slice(0, Math.max(1, Math.min(limit, 5)))
    .map(({ entry }) => entry);
}

function article(
  id: string,
  title: string,
  capabilityId: string,
  keywords: readonly string[],
  answer: string,
): AdminHelpArticle {
  return { id, title, capabilityId, keywords, answer };
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
