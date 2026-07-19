import "./App.scss";
import "./experience/ui/PublicLightMode.css";
import "./experience/ui/SiteTemplates.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { OutsideShowcaseMusic } from "./experience/audio/OutsideShowcaseMusic";
import { MediaQualitySettings } from "./experience/ui/MediaQualitySettings";
import { SiteHeader } from "./components/layout/SiteHeader";
import { BottomDock } from "./components/layout/BottomDock";
import { ModeToggle } from "./components/layout/ModeToggle";
import type { ShowcaseVideoQuality } from "./experience/scenes/showcase/data/sceneAssets";
import { isShowcaseChapterId } from "./experience/scenes/showcase/data";
import { getChapterDefinition } from "./experience/story/manifest";
import { ROUTE_PATHS } from "./app-shell/routePaths";
import { useCurrentRoute } from "./app-shell/useCurrentRoute";
import { useNavigation } from "./app-shell/NavigationProvider";
import { useUIStore } from "./lib/ui-state";
import { LeadCaptureBridge } from "./lib/LeadCaptureBridge";
import { useBotAction } from "./lib/useBotAction";
import {
  resolveBotNavigationRoute,
  storePendingLeadFormPrefill,
  vehicleRouteFromBotAction,
} from "./lib/botActionConsumers";
import {
  activatePendingConciergeTarget,
  queueConciergeTargetAction,
  resolveConciergeTargetAction,
  watchPendingConciergeTarget,
} from "./lib/conciergeTargetRuntime";
import { isPageRendererEnabled } from "./lib/pageBuilder/featureFlag";
import {
  CookieBanner,
  readCookieConsent,
  type CookieConsent,
} from "./components/CookieBanner/CookieBanner";
import { SeoProvider } from "./lib/seo/SeoProvider";
import { ThemeProvider } from "./lib/theme/ThemeContext";
import { TenantThemeProvider } from "./lib/TenantThemeProvider";
import { PublicNavLoader } from "./lib/navLoader/PublicNavLoader";
import { VisitorAuthProvider } from "./lib/visitor/VisitorAuthContext";
import { SavedVehiclesProvider } from "./lib/visitor/SavedVehiclesContext";
import {
  loadAccountPage,
  loadAdminRouter,
  loadContactPage,
  loadExperience,
  loadPagePreviewBridge,
  loadPageRendererRoutes,
  loadProductDetailPage,
  loadProductsPage,
  loadShowcasePage,
  loadShowcaseTitleCard,
  loadStoryHomePage,
  loadVehicleDetailPage,
  loadVehiclesPage,
  loadVehiclesPageRendererRoute,
  preloadVehiclesRoute,
} from "./app-shell/routeModules";

// The admin embeds this route in an iframe and streams draft blocks in over
// postMessage. It renders the real block components with no site chrome.
const PAGE_PREVIEW_PATH = "/__preview";

const AdminRouter = lazy(loadAdminRouter);
const AccountPage = lazy(loadAccountPage);
const StoryProvider = lazy(() =>
  import("./experience/story/StoryProvider").then((module) => ({ default: module.StoryProvider }))
);
const ContactPage = lazy(loadContactPage);
const Experience = lazy(loadExperience);
const ProductDetailPage = lazy(loadProductDetailPage);
const ProductsPage = lazy(loadProductsPage);
const VehicleDetailPage = lazy(loadVehicleDetailPage);
const VehiclesPage = lazy(loadVehiclesPage);
const ShowcasePage = lazy(loadShowcasePage);
const ShowcaseTitleCard = lazy(loadShowcaseTitleCard);
const StoryHomePage = lazy(loadStoryHomePage);
const ContactPageRendererRoute = lazy(() =>
  loadPageRendererRoutes().then((module) => ({
    default: module.ContactPageRendererRoute,
  }))
);
const CustomPageRendererRoute = lazy(() =>
  loadPageRendererRoutes().then((module) => ({
    default: module.CustomPageRendererRoute,
  }))
);
const HomePageRendererRoute = lazy(() =>
  loadPageRendererRoutes().then((module) => ({
    default: module.HomePageRendererRoute,
  }))
);
const PagePreviewBridge = lazy(loadPagePreviewBridge);
const ProductsPageRendererRoute = lazy(() =>
  loadPageRendererRoutes().then((module) => ({
    default: module.ProductsPageRendererRoute,
  }))
);
const VehiclesPageRendererRoute = lazy(loadVehiclesPageRendererRoute);
const ShowcasePageRendererRoute = lazy(() =>
  loadPageRendererRoutes().then((module) => ({
    default: module.ShowcasePageRendererRoute,
  }))
);
const OllamaChat = lazy(() =>
  import("./components/chat/OllamaChat").then((module) => ({
    default: module.OllamaChat,
  }))
);

type ShowcaseEntryState = {
  partIndex: number;
  chapterIndex: number;
};

const MEDIA_QUALITY_STORAGE_KEY = "nomad.media-quality.v1";
const LOCAL_CHAT_ENABLED = import.meta.env.VITE_ENABLE_LOCAL_CHAT === "true";
const PAGE_RENDERER_ENABLED = isPageRendererEnabled;

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

function getRecommendedMediaQuality(): ShowcaseVideoQuality {
  if (typeof window === "undefined") return "high";

  const connection = (
    navigator as Navigator & {
      connection?: NetworkInformationLike;
      deviceMemory?: number;
    }
  ).connection;
  const deviceMemory = (
    navigator as Navigator & {
      deviceMemory?: number;
    }
  ).deviceMemory;
  const prefersReducedData =
    connection?.saveData === true ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g" ||
    connection?.effectiveType === "3g";
  const narrowScreen = window.matchMedia("(max-width: 760px)").matches;
  const lowMemory = typeof deviceMemory === "number" && deviceMemory <= 4;

  return prefersReducedData || narrowScreen || lowMemory ? "normal" : "high";
}

function readInitialMediaQuality(): ShowcaseVideoQuality {
  if (typeof window === "undefined") return "high";

  const stored = window.localStorage.getItem(MEDIA_QUALITY_STORAGE_KEY);
  return stored === "normal" || stored === "high"
    ? stored
    : getRecommendedMediaQuality();
}

function readShowcaseEntryState(search: string): ShowcaseEntryState {
  const searchParams = new URLSearchParams(search);

  return {
    partIndex: readNumberParam(searchParams, "part", 0),
    chapterIndex: readNumberParam(searchParams, "chapter", 0),
  };
}

function readNumberParam(
  searchParams: URLSearchParams,
  key: string,
  fallback: number
): number {
  const value = searchParams.get(key);

  if (value === null) {
    return fallback;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

type ProductDetailRouteProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToVehicles: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
  onViewShowcase: (partIndex: number, chapterIndex: number) => void;
};

function ProductDetailRoute(props: ProductDetailRouteProps) {
  const { productId } = useParams();

  return <ProductDetailPage productId={productId ?? null} {...props} />;
}

type VehicleDetailRouteProps = {
  onBackToVehicles: () => void;
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
};

function VehicleDetailRoute(props: VehicleDetailRouteProps) {
  const { vehicleId } = useParams();

  return <VehicleDetailPage vehicleId={vehicleId ?? null} {...props} />;
}

type ShowcaseExperienceRouteProps = {
  onGoHome: () => void;
  onShowcaseChapterRevealChange: (revealed: boolean) => void;
  mediaQuality: ShowcaseVideoQuality;
};

function ShowcaseExperienceRoute(props: ShowcaseExperienceRouteProps) {
  const [searchParams] = useSearchParams();

  return (
    <Experience
      initialPartIndex={readNumberParam(searchParams, "part", 0)}
      initialChapterIndex={readNumberParam(searchParams, "chapter", 0)}
      {...props}
    />
  );
}

export default function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const { navigateTo } = useNavigation();
  const { routeId, config: currentRouteConfig } = useCurrentRoute();
  const setActiveRoute = useUIStore((state) => state.setActiveRoute);
  const { partIndex: currentPartIndex, chapterIndex: currentChapterIndex } =
    readShowcaseEntryState(location.search);
  const [showcaseChapterRevealed, setShowcaseChapterRevealed] = useState(false);
  const [mediaQuality, setMediaQuality] = useState<ShowcaseVideoQuality>(
    readInitialMediaQuality
  );
  const [cookieConsent, setCookieConsent] = useState<CookieConsent | null>(
    readCookieConsent
  );

  useEffect(() => {
    setActiveRoute(routeId);
  }, [routeId, setActiveRoute]);

  const handleGoHome = useCallback((playNavSound = true) => {
    setShowcaseChapterRevealed(false);
    navigateTo(
      { route: "home" },
      {
        sound: playNavSound ? "nav.toHome" : undefined,
        analytics: { action: "go_home" },
      }
    );
  }, [navigateTo]);

  const handleEnterExperience = useCallback(
    (partIndex: number, chapterIndex: number) => {
      setShowcaseChapterRevealed(false);
      const chapterDefinition = getChapterDefinition(partIndex + 1, chapterIndex + 1);
      if (isShowcaseChapterId(chapterDefinition?.id)) {
        navigateTo(
          { route: "titlecard", partIndex, chapterIndex },
          { analytics: { action: "enter_showcase_intro" } }
        );
        return;
      }
      navigateTo(
        { route: "experience", partIndex, chapterIndex },
        { analytics: { action: "enter_experience" } }
      );
    },
    [navigateTo]
  );

  const handleStartExperience = useCallback(() => {
    setShowcaseChapterRevealed(false);
    navigateTo(
      {
        route: "experience",
        partIndex: currentPartIndex,
        chapterIndex: currentChapterIndex,
      },
      { sound: "showcase.enter", analytics: { action: "start_experience" } }
    );
  }, [currentChapterIndex, currentPartIndex, navigateTo]);

  const handleNavigateToProducts = useCallback(() => {
    navigateTo(
      { route: "products" },
      { sound: "nav.toProducts", analytics: { action: "page_nav" } }
    );
  }, [navigateTo]);

  const handleNavigateToVehicles = useCallback(() => {
    navigateTo(
      { route: "vehicles" },
      { sound: "nav.toVehicles", analytics: { action: "page_nav" } }
    );
  }, [navigateTo]);

  const handleNavigateToShowcase = useCallback(() => {
    navigateTo(
      { route: "showcase" },
      { sound: "nav.toShowcase", analytics: { action: "page_nav" } }
    );
  }, [navigateTo]);

  const handleNavigateToContact = useCallback(() => {
    navigateTo(
      { route: "contact" },
      { sound: "nav.toContact", analytics: { action: "page_nav" } }
    );
  }, [navigateTo]);

  const handleSelectProduct = useCallback((productId: string) => {
    navigateTo(
      { route: "productDetail", productId },
      { sound: "product.card.click", analytics: { action: "select_product" } }
    );
  }, [navigateTo]);

  const handleSelectVehicle = useCallback((vehicleId: string) => {
    navigateTo(
      { route: "vehicleDetail", vehicleId },
      { analytics: { action: "select_vehicle" } }
    );
  }, [navigateTo]);

  const handleMediaQualityChange = useCallback((quality: ShowcaseVideoQuality) => {
    setMediaQuality(quality);
    window.localStorage.setItem(MEDIA_QUALITY_STORAGE_KEY, quality);
  }, []);

  useBotAction("navigate", (action) => {
    const target = resolveBotNavigationRoute(action.route);
    if (!target) {
      console.warn(`[bot] Unsupported navigation route: ${action.route}`);
      return;
    }
    setShowcaseChapterRevealed(false);
    navigateTo(target, {
      source: "bot",
      analytics: { action: "bot_navigate" },
    });
  });

  useBotAction("navigate-target", (action) => {
    const resolved = resolveConciergeTargetAction(action);
    if (!resolved) {
      console.warn(`[concierge] Unable to resolve enabled target: ${action.targetKey}`);
      return;
    }

    setShowcaseChapterRevealed(false);
    const currentPath = location.pathname.replace(/\/+$/, "") || "/";
    const targetPath = resolved.path.replace(/\/+$/, "") || "/";
    if (resolved.handlerId) queueConciergeTargetAction(action);

    if (currentPath === targetPath) {
      window.requestAnimationFrame(() => {
        activatePendingConciergeTarget(location.pathname);
      });
      return;
    }

    if (resolved.route) {
      navigateTo(resolved.route, {
        source: "bot",
        analytics: { action: `concierge_target:${action.targetKey}` },
      });
    } else {
      // Custom Page Builder routes still flow through React Router while the
      // trusted server descriptor guarantees a safe same-origin public path.
      routerNavigate(resolved.path, {
        state: { source: "bot", conciergeTargetKey: action.targetKey },
      });
    }
  });

  useBotAction("highlight-vehicle", (action) => {
    const vehicleId = action.vehicleId.trim();
    if (!vehicleId) {
      console.warn("[bot] highlight-vehicle action missing vehicleId");
      return;
    }
    setShowcaseChapterRevealed(false);
    navigateTo(
      { route: "vehicleDetail", vehicleId },
      { source: "bot", analytics: { action: "bot_highlight_vehicle" } },
    );
  });

  useBotAction("filter_inventory", (action) => {
    setShowcaseChapterRevealed(false);
    navigateTo(
      vehicleRouteFromBotAction(action),
      { source: "bot", analytics: { action: "bot_filter_inventory" } }
    );
  });

  useBotAction("open-lead-form", (action) => {
    if (location.pathname !== ROUTE_PATHS.contact) {
      storePendingLeadFormPrefill(action);
    }
    setShowcaseChapterRevealed(false);
    navigateTo(
      { route: "contact" },
      { source: "bot", analytics: { action: "bot_open_lead_form" } }
    );
  });

  const isShowcaseExperience =
    routeId === "showcaseExperience" &&
    isShowcaseChapterId(
      getChapterDefinition(currentPartIndex + 1, currentChapterIndex + 1)?.id
    );
  const isAdminPath = currentRouteConfig.section === "admin";
  const showSiteHeader = currentRouteConfig.chrome.showHeader;
  const showSiteDock = currentRouteConfig.chrome.showDock;

  useEffect(() => {
    if (location.pathname === ROUTE_PATHS.vehicles) {
      preloadVehiclesRoute();
    }
    let stopWatching: () => void = () => undefined;
    const frameId = window.requestAnimationFrame(() => {
      stopWatching = watchPendingConciergeTarget(location.pathname);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      stopWatching();
    };
  }, [location.pathname]);

  // The live-preview iframe endpoint: no site chrome or audio — just
  // the block canvas the admin editor streams into. Kept out of the route-config
  // union on purpose; it is an internal surface, not a navigable page.
  if (location.pathname === PAGE_PREVIEW_PATH) {
    return (
      <Suspense fallback={null}>
        <PagePreviewBridge />
      </Suspense>
    );
  }

  return (
    <ThemeProvider enabled={!isAdminPath}>
      <TenantThemeProvider enabled={!isAdminPath}>
      <VisitorAuthProvider enabled={!isAdminPath}>
        <SavedVehiclesProvider enabled={!isAdminPath}>
        <SeoProvider pathname={location.pathname} enabled={!isAdminPath}>
      <div style={{ width: "100%", height: "100%", margin: 0, padding: 0, overflow: "hidden" }}>
      <MediaQualitySettings
        quality={mediaQuality}
        visible={!isShowcaseExperience}
        onQualityChange={handleMediaQualityChange}
        belowHeader={showSiteHeader}
      />
      {showSiteHeader && (
        <SiteHeader />
      )}
      {showSiteDock && (
        <BottomDock />
      )}
      <ModeToggle className={showSiteHeader ? "modeToggle--belowHeader" : ""} />
      {/* Ambient music only mounts on the home and showcase sections, so light
          public routes like /vehicles never instantiate (and fetch) the audio. */}
      {(currentRouteConfig.section === "home" ||
        currentRouteConfig.section === "showcase") && (
          <OutsideShowcaseMusic enabled={!(isShowcaseExperience && showcaseChapterRevealed)} />
        )}
      {LOCAL_CHAT_ENABLED && (
        <Suspense fallback={null}>
          <OllamaChat />
        </Suspense>
      )}
      <LeadCaptureBridge />
      {!isAdminPath && <CookieBanner onConsentChange={setCookieConsent} />}
      {!isAdminPath && <PublicNavLoader />}
      <Suspense fallback={null}>
        {/* Phase 3: pages now render from real URLs instead of the old screen ternary. */}
        <Routes>
          <Route
            path={ROUTE_PATHS.gate}
            element={<Navigate to={ROUTE_PATHS.home} replace />}
          />
          <Route
            path={ROUTE_PATHS.home}
            element={
              <StoryProvider>
                {PAGE_RENDERER_ENABLED ? (
                  <HomePageRendererRoute
                    onEnter={handleEnterExperience}
                    onNavigateToProducts={handleNavigateToProducts}
                    onNavigateToVehicles={handleNavigateToVehicles}
                    onNavigateToShowcase={handleNavigateToShowcase}
                    onNavigateToContact={handleNavigateToContact}
                  />
                ) : (
                  <StoryHomePage
                    onEnter={handleEnterExperience}
                    onNavigateToProducts={handleNavigateToProducts}
                    onNavigateToVehicles={handleNavigateToVehicles}
                    onNavigateToShowcase={handleNavigateToShowcase}
                    onNavigateToContact={handleNavigateToContact}
                  />
                )}
              </StoryProvider>
            }
          />
          <Route
            path={ROUTE_PATHS.products}
            element={
              <StoryProvider>
                {PAGE_RENDERER_ENABLED ? (
                  <ProductsPageRendererRoute
                    onGoHome={handleGoHome}
                    onSelectProduct={handleSelectProduct}
                    onNavigateToShowcase={handleNavigateToShowcase}
                    onNavigateToContact={handleNavigateToContact}
                    onNavigateToVehicles={handleNavigateToVehicles}
                  />
                ) : (
                  <ProductsPage
                    onGoHome={handleGoHome}
                    onSelectProduct={handleSelectProduct}
                    onNavigateToShowcase={handleNavigateToShowcase}
                    onNavigateToContact={handleNavigateToContact}
                    onNavigateToVehicles={handleNavigateToVehicles}
                  />
                )}
              </StoryProvider>
            }
          />
          <Route
            path={ROUTE_PATHS.productDetail}
            element={
              <StoryProvider>
                <ProductDetailRoute
                  onGoHome={handleGoHome}
                  onNavigateToProducts={handleNavigateToProducts}
                  onNavigateToVehicles={handleNavigateToVehicles}
                  onNavigateToShowcase={handleNavigateToShowcase}
                  onNavigateToContact={handleNavigateToContact}
                  onViewShowcase={handleEnterExperience}
                />
              </StoryProvider>
            }
          />
          <Route
            path={ROUTE_PATHS.vehicles}
            element={
              <StoryProvider>
                {PAGE_RENDERER_ENABLED ? (
                  <VehiclesPageRendererRoute
                    onGoHome={handleGoHome}
                    onNavigateToProducts={handleNavigateToProducts}
                    onNavigateToShowcase={handleNavigateToShowcase}
                    onNavigateToContact={handleNavigateToContact}
                    onSelectVehicle={handleSelectVehicle}
                  />
                ) : (
                  <VehiclesPage
                    onGoHome={handleGoHome}
                    onNavigateToProducts={handleNavigateToProducts}
                    onNavigateToShowcase={handleNavigateToShowcase}
                    onNavigateToContact={handleNavigateToContact}
                    onSelectVehicle={handleSelectVehicle}
                  />
                )}
              </StoryProvider>
            }
          />
          <Route
            path={ROUTE_PATHS.vehicleDetail}
            element={
              <StoryProvider>
                <VehicleDetailRoute
                  onBackToVehicles={handleNavigateToVehicles}
                  onGoHome={handleGoHome}
                  onNavigateToProducts={handleNavigateToProducts}
                  onNavigateToShowcase={handleNavigateToShowcase}
                  onNavigateToContact={handleNavigateToContact}
                />
              </StoryProvider>
            }
          />
          <Route
            path={ROUTE_PATHS.showcase}
            element={
              <StoryProvider>
                {PAGE_RENDERER_ENABLED ? (
                  <ShowcasePageRendererRoute
                    onGoHome={handleGoHome}
                    onNavigateToProducts={handleNavigateToProducts}
                    onNavigateToVehicles={handleNavigateToVehicles}
                    onNavigateToContact={handleNavigateToContact}
                    onEnter={handleEnterExperience}
                  />
                ) : (
                  <ShowcasePage
                    onGoHome={handleGoHome}
                    onNavigateToProducts={handleNavigateToProducts}
                    onNavigateToVehicles={handleNavigateToVehicles}
                    onNavigateToContact={handleNavigateToContact}
                    onEnter={handleEnterExperience}
                  />
                )}
              </StoryProvider>
            }
          />
          <Route
            path={ROUTE_PATHS.showcaseIntro}
            element={
              <StoryProvider>
                <ShowcaseTitleCard onPlay={handleStartExperience} />
              </StoryProvider>
            }
          />
          <Route
            path={ROUTE_PATHS.showcaseExperience}
            element={
              <StoryProvider>
                <ShowcaseExperienceRoute
                  onGoHome={handleGoHome}
                  onShowcaseChapterRevealChange={setShowcaseChapterRevealed}
                  mediaQuality={mediaQuality}
                />
              </StoryProvider>
            }
          />
          <Route
            path={ROUTE_PATHS.contact}
            element={
              <StoryProvider>
                {PAGE_RENDERER_ENABLED ? (
                  <ContactPageRendererRoute
                    onGoHome={handleGoHome}
                    onNavigateToProducts={handleNavigateToProducts}
                    onNavigateToVehicles={handleNavigateToVehicles}
                    onNavigateToShowcase={handleNavigateToShowcase}
                  />
                ) : (
                  <ContactPage
                    onGoHome={handleGoHome}
                    onNavigateToProducts={handleNavigateToProducts}
                    onNavigateToVehicles={handleNavigateToVehicles}
                    onNavigateToShowcase={handleNavigateToShowcase}
                  />
                )}
              </StoryProvider>
            }
          />
          <Route path={ROUTE_PATHS.account} element={<AccountPage />} />
          <Route path={`${ROUTE_PATHS.admin}/*`} element={<AdminRouter onExit={handleGoHome} />} />
          {/* Tenant-created pages published from the admin (static routes above
              always win over this dynamic segment). Unknown slugs still land
              on /home via the route's own fallback. */}
          <Route path="/:pageSlug" element={<CustomPageRendererRoute />} />
          <Route path="*" element={<Navigate to={ROUTE_PATHS.home} replace />} />
        </Routes>
      </Suspense>
      {cookieConsent === "accepted" && (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      )}
      </div>
        </SeoProvider>
        </SavedVehiclesProvider>
      </VisitorAuthProvider>
      </TenantThemeProvider>
    </ThemeProvider>
  );
}
