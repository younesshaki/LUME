import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublishedPage } from "@lume/types";

const fetchPublishedPageMock = vi.fn();
const resolveTenantIdMock = vi.fn();

vi.mock("@lume/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lume/db")>();
  return {
    ...actual,
    fetchPublishedPage: fetchPublishedPageMock,
  };
});

vi.mock("@/lib/publicTenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/publicTenant")>();
  return {
    ...actual,
    publicTenantSlug: "default",
    resolveTenantId: resolveTenantIdMock,
  };
});

function publishedPage(blocks: PublishedPage["blocks"]["blocks"]): PublishedPage {
  return {
    id: "page-1",
    slug: "contact",
    title: "Contact",
    seoMeta: {},
    publishedRevisionId: "revision-1",
    blocks: { version: 1, blocks },
  };
}

async function loadRenderer(enabled: boolean) {
  vi.resetModules();
  vi.stubEnv("VITE_PAGE_RENDERER", enabled ? "true" : "false");
  return import("./PageRenderer");
}

async function renderPageRenderer(enabled = true) {
  const [{ PageRenderer }, { DualModeProvider }] = await Promise.all([
    loadRenderer(enabled),
    import("@/lib/DualModeContext"),
  ]);
  return render(
    <DualModeProvider>
      <PageRenderer slug="contact" fallback={<div>Fallback contact</div>} />
    </DualModeProvider>
  );
}

describe("PageRenderer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("renders fallback when the feature flag is off", async () => {
    await renderPageRenderer(false);

    expect(screen.getByText("Fallback contact")).toBeInTheDocument();
    expect(resolveTenantIdMock).not.toHaveBeenCalled();
    expect(fetchPublishedPageMock).not.toHaveBeenCalled();
  });

  it("renders fallback when the published page fetch fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    resolveTenantIdMock.mockResolvedValue("tenant-1");
    fetchPublishedPageMock.mockRejectedValue(new Error("network failed"));

    await renderPageRenderer(true);

    await screen.findByText("Fallback contact");
  });

  it("renders fallback for an empty published document", async () => {
    resolveTenantIdMock.mockResolvedValue("tenant-1");
    fetchPublishedPageMock.mockResolvedValue(publishedPage([]));

    await renderPageRenderer(true);

    await screen.findByText("Fallback contact");
  });

  it("skips unknown blocks and renders known valid blocks", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    resolveTenantIdMock.mockResolvedValue("tenant-1");
    fetchPublishedPageMock.mockResolvedValue(
      publishedPage([
        { id: "unknown-1", type: "unknown-block", props: {} },
        {
          id: "hero-1",
          type: "hero",
          props: {
            eyebrow: "Access",
            title: "Rendered from DB",
            subtitle: "Published contact copy.",
          },
        },
      ])
    );

    await renderPageRenderer(true);

    await screen.findByRole("heading", { name: "Rendered from DB" });
    expect(screen.queryByText("Fallback contact")).not.toBeInTheDocument();
  });

  it("filters experience-only blocks out of standard mode", async () => {
    const { isBlockVisibleInMode } = await loadRenderer(true);

    expect(
      isBlockVisibleInMode({ modes: ["experience"], experienceOnly: true }, "standard")
    ).toBe(false);
    expect(
      isBlockVisibleInMode({ modes: ["experience", "standard"], experienceOnly: true }, "standard")
    ).toBe(false);
    expect(
      isBlockVisibleInMode({ modes: ["experience", "standard"], experienceOnly: true }, "experience")
    ).toBe(true);
  });
});
