import { Component, ReactNode, useEffect, useMemo, useState } from "react";
import { fetchPublishedPage } from "@lume/db";
import { validateBlock } from "@lume/blocks";
import type { PageBlock, PublishedPage } from "@lume/types";
import CinematicShell from "@/experience/ui/CinematicShell";
import { useDualMode } from "@/lib/DualModeContext";
import { supabase } from "@/lib/supabase";
import { publicTenantSlug, resolveTenantId } from "@/lib/publicTenant";
import { getBlockComponent, getBlockDescriptor } from "./registry";
import { PageBuilderRenderProvider, type PageBuilderRenderContextValue } from "./renderContext";
import { registerBlocks } from "./registerBlocks";
import { isPageRendererEnabled } from "./featureFlag";

if (isPageRendererEnabled) registerBlocks();

type PageFrame = {
  rootClassName: string;
  mainClassName: string;
};

type PageRendererProps = {
  slug: string;
  fallback: ReactNode;
  footer?: ReactNode;
  context?: Omit<PageBuilderRenderContextValue, "pageSlug">;
  loadingFallback?: ReactNode;
  tenantSlug?: string;
};

type PageRendererState =
  | { status: "loading"; page: null }
  | { status: "ready"; page: PublishedPage }
  | { status: "fallback"; page: null };

const PAGE_FRAMES: Record<string, PageFrame> = {
  contact: {
    rootClassName: "contactPage",
    mainClassName: "contactPage__main",
  },
  home: {
    rootClassName: "storyHome",
    mainClassName: "",
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
  footer,
  context,
  loadingFallback,
  tenantSlug = publicTenantSlug,
}: PageRendererProps) {
  const { mode } = useDualMode();
  const [state, setState] = useState<PageRendererState>(() =>
    isPageRendererEnabled ? { status: "loading", page: null } : { status: "fallback", page: null }
  );

  useEffect(() => {
    if (!isPageRendererEnabled) {
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

        const page = await fetchPublishedPage(
          supabase as Parameters<typeof fetchPublishedPage>[0],
          tenantId,
          slug
        );
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
  }, [slug, tenantSlug]);

  const renderableBlocks = useMemo(
    () =>
      state.status === "ready"
        ? state.page.blocks.blocks
            .map((block) => toRenderableBlock(block, state.page.slug, mode))
            .filter((block): block is RenderableBlock => Boolean(block))
        : [],
    [mode, state]
  );

  if (!isPageRendererEnabled || state.status === "fallback") return <>{fallback}</>;
  if (state.status === "loading") {
    return <>{loadingFallback ?? <PageRendererLoading slug={slug} />}</>;
  }
  if (renderableBlocks.length === 0) return <>{fallback}</>;

  const frame = PAGE_FRAMES[slug] ?? PAGE_FRAMES.home;

  return (
    <PageBuilderRenderProvider value={{ pageSlug: slug, ...context }}>
      <CinematicShell>
        <div className={frame.rootClassName}>
          <main
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
      <div className={frame.rootClassName}>
        <main
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
  mode: "experience" | "standard"
): RenderableBlock | null {
  try {
    const descriptor = getBlockDescriptor(block.type);
    if (!descriptor) {
      console.warn(`[pageBuilder] skipping unknown block "${block.type}" on ${slug}`);
      return null;
    }

    if (!descriptor.modes.includes(mode) || (mode === "standard" && descriptor.experienceOnly)) {
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
