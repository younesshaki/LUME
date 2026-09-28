/** @vitest-environment jsdom */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Page, TenantHeaderConfig } from "@lume/types";
import PagesListClient from "./PagesListClient";

/**
 * The Pages list shows where each page really appears in the site's
 * navigation — header, More, or hidden — and lets an editor hide a page or
 * bring it back.
 */

const db = vi.hoisted(() => ({
  theme: {} as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./VehicleLayoutPanel", () => ({ VehicleLayoutPanel: () => null }));
vi.mock("@/components/ui/carousel", () => ({ default: () => null }));
vi.mock("@/components/confirm-action-dialog", () => ({
  ConfirmActionDialog: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { theme: db.theme }, error: null }) }) }),
      update: (values: { theme: Record<string, unknown> }) => ({
        eq: async () => {
          db.updates.push(values.theme);
          db.theme = values.theme;
          return { error: null };
        },
      }),
    }),
  }),
}));

function page(slug: string, navOrder: number, extra: Partial<Page> = {}): Page {
  return {
    id: `page-${slug}`, tenantId: "tenant-1", slug, title: slug[0].toUpperCase() + slug.slice(1), navOrder,
    isReserved: false, archivedAt: null, draftRevisionId: null, publishedRevisionId: `rev-${slug}`,
    seoMeta: {}, createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z", ...extra,
  };
}

// Header holds 2. home + vehicles in the header, contact + about in More,
// faq hidden, drafts not live.
const PAGES = [
  page("home", 0),
  page("vehicles", 1),
  page("faq", 2),
  page("contact", 3),
  page("about", 4),
  page("careers", 5, { publishedRevisionId: null, draftRevisionId: "draft-careers" }),
];
const HEADER: TenantHeaderConfig = { maxNavItems: 2, hiddenNavSlugs: ["faq"], variant: "split" };

function row(slug: string): HTMLElement {
  return screen.getByText(`/${slug}`).closest("tr") as HTMLElement;
}

beforeEach(() => {
  db.theme = { header: HEADER, footer: { variant: "columns" } };
  db.updates = [];
  render(
    createElement(PagesListClient, {
      tenantId: "tenant-1",
      tenantSlug: "sandbox",
      initialPages: PAGES,
      initialHeader: HEADER,
      publicSiteBaseUrl: "https://public.example.test",
      sampleVehicle: null,
    }),
  );
});

afterEach(() => cleanup());

describe("Pages list navigation state", () => {
  it("shows each page's real placement", () => {
    expect(within(row("home")).getByText("In header")).toBeTruthy();
    expect(within(row("vehicles")).getByText("In header")).toBeTruthy();
    expect(within(row("contact")).getByText("In More")).toBeTruthy();
    expect(within(row("about")).getByText("In More")).toBeTruthy();
    expect(within(row("faq")).getByText("Hidden from nav")).toBeTruthy();
    expect(within(row("careers")).getByText("Not live")).toBeTruthy();
  });

  it("mutes a hidden page's row but keeps it editable", () => {
    expect(row("faq").className).toContain("opacity-60");
    expect(row("home").className).not.toContain("opacity-60");
    expect(within(row("faq")).getByRole("link", { name: "Edit" })).toBeTruthy();
  });

  it("bringing a hidden page back places it by the same rule (header full → More)", async () => {
    fireEvent.click(within(row("faq")).getByRole("button", { name: "Show /faq in navigation" }));
    await waitFor(() => expect(within(row("faq")).getByText("In More")).toBeTruthy());
    expect(row("faq").className).not.toContain("opacity-60");
    // Only the hidden list changed; other header and theme settings survive.
    expect(db.updates).toEqual([
      { header: { maxNavItems: 2, hiddenNavSlugs: [], variant: "split" }, footer: { variant: "columns" } },
    ]);
  });

  it("hiding a header page moves the next page up from More", async () => {
    fireEvent.click(within(row("vehicles")).getByRole("button", { name: "Hide /vehicles from navigation" }));
    await waitFor(() => expect(within(row("vehicles")).getByText("Hidden from nav")).toBeTruthy());
    expect(within(row("contact")).getByText("In header")).toBeTruthy();
    expect(db.theme.header).toMatchObject({ hiddenNavSlugs: ["faq", "vehicles"] });
  });

  it("follows a reorder without a reload", () => {
    // Drag "about" (More) onto "home": it becomes the first page.
    fireEvent.dragStart(row("about"));
    fireEvent.drop(row("home"));
    expect(within(row("about")).getByText("In header")).toBeTruthy();
  });
});
