import { Component, CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { fetchPublishedPage } from "@lume/db";
import { validateBlock, type BlockDescriptor, type BlockMode } from "@lume/blocks";
import type { PageBlock, PublishedPage } from "@lume/types";
import CinematicShell from "@/experience/ui/CinematicShell";
import homepageBackgroundImage from "@/experience/assets/images/lume-homepage-background.png";
import { useDualMode } from "@/lib/DualModeContext";
import { supabase } from "@/lib/supabase";
import { publicTenantSlug, resolveTenantId } from "@/lib/publicTenant";
import { getBlockComponent, getBlockDescriptor } from "./registry";
import { PageBuilderRenderProvider, type PageBuilderRenderContextValue } from "./renderContext";
import { registerBlocks } from "./registerBlocks";
import { isPageRendererEnabled } from "./featureFlag";
import { usePublishedPageSeo } from "@/lib/seo/SeoProvider";
import { TemplateConversionPanel } from "@/components/site/TemplateConversionPanel";

// Always register: custom tenant pages render regardless of the feature flag
// (force prop), and this module only loads via the lazy renderer chunk anyway.
// registerBlocks() is idempotent.
registerBlocks();

type PageFrame = {
  rootClassName: string;
  mainClassName: string;
  mainId?: string;
  rootStyle?: CSSProperties & Record<string, string>;
  beforeMain?: ReactNode;
};

type PageRendererProps = {
  slug: string;
  fallback: ReactNode;
  /**
   * Render regardless of the page-renderer feature flag. Used by custom
   * tenant pages, which have no hand-built cinematic fallback to protect.
   */
  force?: boolean;
  footer?: ReactNode;
  context?: Omit<PageBuilderRenderContextValue, "pageSlug">;
  loadingFallback?: ReactNode;
  tenantSlug?: string;
};

type PageRendererState =
  | { status: "loading"; page: null }
  | { status: "ready"; page: PublishedPage }
  | { status: "fallback"; page: null };

const publishedPageRequests = new Map<string, Promise<PublishedPage | null>>();

function fetchPublishedPageOnce(tenantId: string, slug: string): Promise<PublishedPage | null> {
  const key = `${tenantId}\u0000${slug}`;
  const existing = publishedPageRequests.get(key);
  if (existing) return existing;
  const request = fetchPublishedPage(
    supabase as Parameters<typeof fetchPublishedPage>[0],
    tenantId,
    slug,
  );
  publishedPageRequests.set(key, request);
  const clear = () => {
    if (publishedPageRequests.get(key) === request) publishedPageRequests.delete(key);
  };
  void request.then(clear, clear);
  return request;
}

const PAGE_FRAMES: Record<string, PageFrame> = {
  contact: {
    rootClassName: "contactPage",
    mainClassName: "contactPage__main",
  },
  home: {
    rootClassName: "storyHome",
    mainClassName: "",
    mainId: "top",
    rootStyle: {
      "--story-home-bg-image": `url(${homepageBackgroundImage})`,
    } as CSSProperties & Record<string, string>,
    beforeMain: <div className="storyHome__background" aria-hidden="true" />,
  },
  products: {
    rootClassName: "productsPage",
    mainClassName: "productsPage__main",
  },
  showcase: {
    rootClassName: "showcasePage",
    mainClassName: "showcasePage__main",
  },
  vehicles: {
    rootClassName: "vehiclesPage",
    mainClassName: "vehiclesPage__main",
  },
};

export function PageRenderer({
  slug,
  fallback,
  force = false,
  footer,
  context,
  loadingFallback,
  tenantSlug = publicTenantSlug,
}: PageRendererProps) {
  const { mode } = useDualMode();
  const enabled = force || isPageRendererEnabled;
  const [state, setState] = useState<PageRendererState>(() =>
    enabled ? { status: "loading", page: null } : { status: "fallback", page: null }
  );

  useEffect(() => {
    if (!enabled) {
      setState({ status: "fallback", page: null });
      return;
    }

    let cancelled = false;
    setState({ status: "loading", page: null });

    async function loadPublishedPage() {
      try {
        const tenantId = await resolveTenantId(tenantSlug);
        if (!tenantId) {
          if (!cancelled) setState({ status: "fallback", page: null });
          return;
        }

        const page = await fetchPublishedPageOnce(tenantId, slug);
        if (!cancelled) {
          setState(page ? { status: "ready", page } : { status: "fallback", page: null });
        }
      } catch (error) {
        console.warn(`[pageBuilder] falling back after ${slug} page fetch failed`, error);
        if (!cancelled) setState({ status: "fallback", page: null });
      }
    }

    void loadPublishedPage();
    return () => {
      cancelled = true;
    };
  }, [slug, tenantSlug, enabled]);

  const renderableBlocks = useMemo(
    () =>
      state.status === "ready"
        ? state.page.blocks.blocks
            .map((block) => toRenderableBlock(block, state.page.slug, mode))
            .filter((block): block is RenderableBlock => Boolean(block))
        : [],
    [mode, state]
  );
  usePublishedPageSeo(state.status === "ready" ? state.page : null);

  if (!enabled || state.status === "fallback") return <>{fallback}</>;
  if (state.status === "loading") {
    return <>{loadingFallback ?? <PageRendererLoading slug={slug} />}</>;
  }
  if (renderableBlocks.length === 0) return <>{fallback}</>;

  return (
    <PageBlocksView slug={slug} blocks={state.page.blocks.blocks} footer={footer} context={context} />
  );
}

type PageBlocksViewProps = {
  slug: string;
  blocks: PageBlock[];
  footer?: ReactNode;
  context?: Omit<PageBuilderRenderContextValue, "pageSlug">;
  /** Override the ambient dual-mode value (the live preview forces a mode). */
  mode?: BlockMode;
};

/**
 * The pure block-rendering core: the cinematic shell, the per-slug page frame,
 * and the validated blocks mapped through the real registered components. Both
 * the published-page renderer and the admin live-preview bridge render through
 * this so the preview is pixel-identical to production — never an approximation.
 */
export function PageBlocksView({ slug, blocks, footer, context, mode: modeOverride }: PageBlocksViewProps) {
  const { mode: ambientMode } = useDualMode();
  const mode = modeOverride ?? ambientMode;

  const renderableBlocks = useMemo(
    () =>
      blocks
        .map((block) => toRenderableBlock(block, slug, mode))
        .filter((block): block is RenderableBlock => Boolean(block)),
    [blocks, slug, mode]
  );

  // Custom published pages get a neutral frame (contact's padded dark page),
  // not the homepage frame with its background art.
  const frame = PAGE_FRAMES[slug] ?? PAGE_FRAMES.contact;

  return (
    <PageBuilderRenderProvider value={{ pageSlug: slug, ...context }}>
      <CinematicShell>
        <div className={frame.rootClassName} style={frame.rootStyle}>
          {frame.beforeMain}
          <main
            id={frame.mainId}
            className={frame.mainClassName || undefined}
            style={{ paddingTop: "72px", paddingBottom: "160px" }}
          >
            {slug === "home" && <div className="storyHome__tracingBeam" aria-hidden="true" />}
            {renderableBlocks.map(({ block, Component }) => (
              <BlockBoundary key={block.id} block={block}>
                <Component block={block} mode={mode} />
              </BlockBoundary>
            ))}
          </main>
          {slug === "home" ? <TemplateConversionPanel /> : null}
          {footer}
        </div>
      </CinematicShell>
    </PageBuilderRenderProvider>
  );
}

function PageRendererLoading({ slug }: { slug: string }) {
  const frame = PAGE_FRAMES[slug] ?? PAGE_FRAMES.home;
  return (
    <CinematicShell>
      <div className={frame.rootClassName} style={frame.rootStyle}>
        {frame.beforeMain}
        <main
          id={frame.mainId}
          className={frame.mainClassName || undefined}
          style={{ paddingTop: "72px", paddingBottom: "160px" }}
        >
          <div className="vehiclesPage__loading" role="status">
            <span>Loading page...</span>
          </div>
        </main>
      </div>
    </CinematicShell>
  );
}

type RenderableBlock = {
  block: PageBlock;
  Component: NonNullable<ReturnType<typeof getBlockComponent>>;
};

function toRenderableBlock(
  block: PageBlock,
  slug: string,
  mode: BlockMode
): RenderableBlock | null {
  try {
    const descriptor = getBlockDescriptor(block.type);
    if (!descriptor) {
      console.warn(`[pageBuilder] skipping unknown block "${block.type}" on ${slug}`);
      return null;
    }

    if (!isBlockVisibleInMode(descriptor, mode)) {
      return null;
    }

    const validation = validateBlock(block);
    if (!validation.ok) {
      console.warn(
        `[pageBuilder] skipping invalid block "${block.type}" on ${slug}`,
        validation.errors
      );
      return null;
    }

    const Component = getBlockComponent(block.type);
    if (!Component) {
      console.warn(`[pageBuilder] skipping unregistered block "${block.type}" on ${slug}`);
      return null;
    }

    return { block, Component };
  } catch (error) {
    console.warn(`[pageBuilder] skipping block "${block.type}" on ${slug}`, error);
    return null;
  }
}

export function isBlockVisibleInMode(
  descriptor: Pick<BlockDescriptor, "modes" | "experienceOnly">,
  mode: BlockMode
): boolean {
  return descriptor.modes.includes(mode) && !(mode === "standard" && descriptor.experienceOnly);
}

class BlockBoundary extends Component<
  { block: PageBlock; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(`[pageBuilder] block render failed: ${this.props.block.type}`, error);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
