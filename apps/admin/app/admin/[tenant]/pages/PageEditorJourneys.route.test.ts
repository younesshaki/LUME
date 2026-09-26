/** @vitest-environment jsdom */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listEditorBlockDescriptors } from "@lume/blocks";
import type { PageBlock, PageBlocksDocument } from "@lume/types";
import NewPageClient from "./new/NewPageClient";
import PageEditorClient from "./[pageId]/PageEditorClient";

const mocks = vi.hoisted(() => ({
  createPage: vi.fn(),
  publishDraft: vi.fn(),
  updateDraftBlocks: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  preview: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@lume/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lume/db")>()),
  createPage: mocks.createPage,
  publishDraft: mocks.publishDraft,
  updateDraftBlocks: mocks.updateDraftBlocks,
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({}),
}));

vi.mock("./[pageId]/LivePreviewPanel", () => ({
  LivePreviewPanel: ({ blocks }: { blocks: PageBlock[] }) => {
    mocks.preview(blocks);
    return createElement("output", { "data-preview-block-count": blocks.length });
  },
}));

vi.mock("./[pageId]/VariantCarousel", () => ({
  VariantCarousel: () => createElement("div", null, "Design picker"),
}));

vi.mock("./[pageId]/ConciergePanel", () => ({
  ConciergePanel: () => null,
}));

vi.mock("@/components/asset-picker", () => ({
  AssetPicker: () => null,
}));

const JOURNEY_BLOCKS = [
  ["hero", "Hero"],
  ["featured-vehicles", "Featured Vehicles"],
  ["finance-calculator", "Finance Calculator"],
  ["trade-in-form", "Trade-In Form"],
  ["cta-banner", "CTA Banner"],
] as const;

const descriptors = listEditorBlockDescriptors();

function renderEditor() {
  return render(createElement(PageEditorClient, {
    tenantId: "tenant-1",
    tenantSlug: "sandbox",
    publicSiteBaseUrl: "https://public.example.test",
    page: {
      id: "page-1",
      slug: "demo-journey",
      title: "Demo journey",
      draftRevisionId: "draft-1",
      publishedRevisionId: null,
    },
    initialBlocks: { version: 1, blocks: [] },
    initialRevisions: [],
    blockDescriptors: descriptors,
    premiumModelsEnabled: false,
    providerAvailability: {} as never,
  }));
}

function lastPreviewBlocks(): PageBlock[] {
  const call = mocks.preview.mock.calls.at(-1);
  if (!call) throw new Error("Live preview did not render");
  return call[0] as PageBlock[];
}

describe("page-builder demo journeys", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.createPage.mockResolvedValue({ id: "new-page", slug: "demo-journey" });
    mocks.updateDraftBlocks.mockResolvedValue(undefined);
    mocks.publishDraft.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("creates a clean draft page before entering the editor", async () => {
    render(createElement(NewPageClient, {
      tenantId: "tenant-1",
      tenantSlug: "sandbox",
      existingSlugs: [],
      navOrder: 8,
    }));

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Demo Journey" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create Page" }).closest("form")!);

    await waitFor(() => expect(mocks.createPage).toHaveBeenCalledTimes(1));
    expect(mocks.createPage.mock.calls[0]?.[1]).toMatchObject({
      tenantId: "tenant-1",
      title: "Demo Journey",
      slug: "demo-journey",
      navOrder: 8,
    });
    expect(mocks.push).toHaveBeenCalledWith("/admin/sandbox/pages/new-page");
  });

  it.each(JOURNEY_BLOCKS)(
    "adds, edits, previews, and publishes the %s block without losing its draft",
    async (type, displayName) => {
      renderEditor();

      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${displayName}`) }));
      const editedTitle = `Demo ${displayName} title`;
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: editedTitle } });

      const previewBlock = lastPreviewBlocks()[0];
      expect(previewBlock).toMatchObject({ type, props: { title: editedTitle } });

      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
      await waitFor(() => expect(mocks.publishDraft).toHaveBeenCalledTimes(1));

      const savedDocument = mocks.updateDraftBlocks.mock.calls[0]?.[2] as PageBlocksDocument;
      expect(savedDocument.blocks).toHaveLength(1);
      expect(savedDocument.blocks[0]).toMatchObject({ type, props: { title: editedTitle } });
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.getByRole("link", { name: "View live page" }).getAttribute("href"))
        .toBe("https://public.example.test/demo-journey?tenant=sandbox"));
    },
  );
});
