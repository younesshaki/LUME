import "./App.scss";
import { Analytics } from "@vercel/analytics/react";
import {
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OutsideShowcaseMusic } from "./experience/audio/OutsideShowcaseMusic";
import { StoryProvider } from "./experience/story/StoryProvider";
import PreloadGate from "./experience/ui/PreloadGate";
import PhoneExperienceNotice from "./experience/ui/PhoneExperienceNotice";
import { MediaQualitySettings } from "./experience/ui/MediaQualitySettings";
import { SiteHeader } from "./components/layout/SiteHeader";
import { BottomDock } from "./components/layout/BottomDock";
import type { SiteScreen } from "./components/layout/siteNavigation";
import type { ShowcaseVideoQuality } from "./experience/scenes/showcase/data/sceneAssets";
import { isShowcaseChapterId } from "./experience/scenes/showcase/data";
import { getChapterDefinition } from "./experience/story/manifest";
import { matchRoutePath, screenToPath, type ScreenPathParams } from "./app-shell/routePaths";
import { logStoryEvent } from "./lib/eventsService";
import { play as playSound } from "./lib/sound";

const loadAdminPage = () => import("./experience/ui/AdminPage");
const loadContactPage = () => import("./experience/ui/ContactPage");
const loadExperience = () => import("./experience/Experience");
const loadProductDetailPage = () => import("./experience/ui/ProductDetailPage");
const loadProductsPage = () => import("./experience/ui/ProductsPage");
const loadVehicleDetailPage = () => import("./experience/ui/VehicleDetailPage");
const loadVehiclesPage = () => import("./experience/ui/VehiclesPage");
const loadShowcasePage = () => import("./experience/ui/ShowcasePage");
const loadShowcaseTitleCard = () => import("./experience/ui/ShowcaseTitleCard");
const loadStoryHomePage = () => import("./experience/ui/StoryHomePage");

const AdminPage = lazy(loadAdminPage);
const ContactPage = lazy(loadContactPage);
const Experience = lazy(loadExperience);
const ProductDetailPage = lazy(loadProductDetailPage);
const ProductsPage = lazy(loadProductsPage);
const VehicleDetailPage = lazy(loadVehicleDetailPage);
const VehiclesPage = lazy(loadVehiclesPage);
const ShowcasePage = lazy(loadShowcasePage);
const ShowcaseTitleCard = lazy(loadShowcaseTitleCard);
const StoryHomePage = lazy(loadStoryHomePage);
const OllamaChat = lazy(() =>
  import("./components/chat/OllamaChat").then((module) => ({
    default: module.OllamaChat,
  }))
);

type AppScreen =
  | "gate"
  | "home"
  | "products"
  | "productDetail"
  | "vehicles"
  | "vehicleDetail"
  | "showcase"
  | "contact"
  | "titlecard"
  | "experience"
  | "admin";

type RouteScreenState = {
  screen: AppScreen;
  productId: string | null;
  vehicleId: string | null;
  partIndex: number;
  chapterIndex: number;
};

const MEDIA_QUALITY_STORAGE_KEY = "nomad.media-quality.v1";
const LOCAL_CHAT_ENABLED = import.meta.env.VITE_ENABLE_LOCAL_CHAT === "true";

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

function readRouteScreenState(
  pathname: string,
  search: string,
  hash: string
): RouteScreenState {
  // Backward compatibility for old links while we migrate away from hash URLs.
  if (hash === "#admin") {
    return createRouteScreenState("admin");
  }

  if (hash.startsWith("#vehicles")) {
    return createRouteScreenState("vehicles");
  }

  const routeMatch = matchRoutePath(pathname);
  const searchParams = new URLSearchParams(search);

  // This converts the browser URL into the old screen state that App.tsx still
  // renders with. Later, these screens can become real <Route> elements.
  switch (routeMatch?.routeId) {
    case "home":
      return createRouteScreenState("home");
    case "products":
      return createRouteScreenState("products");
    case "productDetail":
      return createRouteScreenState("productDetail", {
        productId: routeMatch.params.productId ?? null,
      });
    case "vehicles":
      return createRouteScreenState("vehicles");
    case "vehicleDetail":
      return createRouteScreenState("vehicleDetail", {
        vehicleId: routeMatch.params.vehicleId ?? null,
      });
    case "showcase":
      return createRouteScreenState("showcase");
    case "showcaseIntro":
      return createRouteScreenState("titlecard");
    case "showcaseExperience":
      return createRouteScreenState("experience", {
        partIndex: readNumberParam(searchParams, "part", 0),
        chapterIndex: readNumberParam(searchParams, "chapter", 0),
      });
    case "contact":
      return createRouteScreenState("contact");
    case "admin":
    case "adminLogin":
    case "adminDashboard":
      return createRouteScreenState("admin");
    case "gate":
    default:
      return createRouteScreenState("gate");
  }
}

function createRouteScreenState(
  screen: AppScreen,
  overrides: Partial<RouteScreenState> = {}
): RouteScreenState {
  // Defaults keep every route state complete, so callers only provide the
  // fields that matter for that specific route.
  return {
    screen,
    productId: null,
    vehicleId: null,
    partIndex: 0,
    chapterIndex: 0,
    ...overrides,
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

export default function App() {
  // React Router gives us the current URL and the function used to change it.
  const location = useLocation();
  const navigate = useNavigate();
  const initialHash = typeof window !== "undefined" ? window.location.hash : "";
  const initialRouteState = readRouteScreenState(
    location.pathname,
    location.search,
    initialHash
  );
  const [screen, setScreen] = useState<AppScreen>(initialRouteState.screen);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    initialRouteState.productId
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    initialRouteState.vehicleId
  );
  const [entryPartIndex, setEntryPartIndex] = useState(initialRouteState.partIndex);
  const [entryChapterIndex, setEntryChapterIndex] = useState(
    initialRouteState.chapterIndex
  );
  const [showcaseChapterRevealed, setShowcaseChapterRevealed] = useState(false);
  const [mediaQuality, setMediaQuality] = useState<ShowcaseVideoQuality>(
    readInitialMediaQuality
  );
  const screenEnteredAtRef = useRef(Date.now());

  const navigateToScreen = useCallback((nextScreen: AppScreen, params: ScreenPathParams = {}) => {
    let nextPath: string | null = null;

    try {
      // Convert the old screen navigation into a real browser path.
      nextPath = screenToPath(nextScreen, params);
    } catch {
      // Some legacy calls do not have enough params yet. In that case we still
      // update the old state, but skip changing the URL.
      nextPath = null;
    }

    startTransition(() => {
      setScreen(nextScreen);
    });

    if (nextPath && `${location.pathname}${location.search}` !== nextPath) {
      // This is what makes browser back/forward and direct links possible.
      navigate(nextPath);
    }
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    const routeState = readRouteScreenState(
      location.pathname,
      location.search,
      typeof window !== "undefined" ? window.location.hash : ""
    );

    // When the user presses browser back/forward, the URL changes first.
    // This effect then updates the old App.tsx screen state to match it.
    startTransition(() => {
      setScreen(routeState.screen);
      setSelectedProductId(routeState.productId);
      setSelectedVehicleId(routeState.vehicleId);
      setEntryPartIndex(routeState.partIndex);
      setEntryChapterIndex(routeState.chapterIndex);
    });
  }, [location.pathname, location.search]);

  useEffect(() => {
    screenEnteredAtRef.current = Date.now();
  }, [screen]);

  useEffect(() => {
    void loadStoryHomePage();
    void loadProductsPage();
    void loadVehiclesPage();
    void loadVehicleDetailPage();
    void loadProductDetailPage();
    void loadShowcasePage();
    void loadContactPage();
    void loadShowcaseTitleCard();
    void loadAdminPage();
    void loadExperience();
  }, []);

  // React to hash changes (e.g., user manually types #admin to enter, or removes it to exit)
  useEffect(() => {
    const handler = () => {
      if (window.location.hash === "#admin") navigate("/admin", { replace: true });
      if (window.location.hash.startsWith("#vehicles")) {
        navigate("/vehicles", { replace: true });
      }
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, [navigate]);

  const handleGoHome = useCallback((playNavSound = true) => {
    if (playNavSound) {
      playSound("nav.toHome");
    }
    setShowcaseChapterRevealed(false);
    if (window.location.hash === "#admin") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    navigateToScreen("home");
  }, [navigateToScreen]);

  const logNavigationAction = useCallback(
    (action: string, fromScreen: AppScreen, toScreen: AppScreen) => {
      const nowMs = Date.now();
      const durationMs = Math.max(0, nowMs - screenEnteredAtRef.current);
      const chapterDefinition = getChapterDefinition(entryPartIndex + 1, entryChapterIndex + 1);

      void logStoryEvent({
        type: "navigation_action",
        payload: {
          action,
          fromScreen,
          toScreen,
          durationMs,
          occurredAt: new Date(nowMs).toISOString(),
          entryPartIndex,
          entryChapterIndex,
          chapterId: chapterDefinition?.id ?? null,
          chapterTitle: chapterDefinition?.title ?? null,
        },
      });
    },
    [entryChapterIndex, entryPartIndex]
  );


  const handleEnterExperience = useCallback(
    (partIndex: number, chapterIndex: number) => {
      setShowcaseChapterRevealed(false);
      setEntryPartIndex(partIndex);
      setEntryChapterIndex(chapterIndex);
      const chapterDefinition = getChapterDefinition(partIndex + 1, chapterIndex + 1);
      if (isShowcaseChapterId(chapterDefinition?.id)) {
        navigateToScreen("titlecard", { partIndex, chapterIndex });
        return;
      }
      navigateToScreen("experience", { partIndex, chapterIndex });
    },
    [navigateToScreen]
  );

  const handleStartExperience = useCallback(() => {
    playSound("showcase.enter");
    setShowcaseChapterRevealed(false);
    navigateToScreen("experience", { partIndex: entryPartIndex, chapterIndex: entryChapterIndex });
  }, [entryChapterIndex, entryPartIndex, navigateToScreen]);

  const handleNavigateToProducts = useCallback(() => {
    playSound("nav.toProducts");
    navigateToScreen("products");
  }, [navigateToScreen]);

  const handleNavigateToVehicles = useCallback(() => {
    playSound("nav.toVehicles");
    navigateToScreen("vehicles");
  }, [navigateToScreen]);

  const handleNavigateToShowcase = useCallback(() => {
    playSound("nav.toShowcase");
    navigateToScreen("showcase");
  }, [navigateToScreen]);

  const handleNavigateToContact = useCallback(() => {
    playSound("nav.toContact");
    navigateToScreen("contact");
  }, [navigateToScreen]);

  const handleSelectProduct = useCallback((productId: string) => {
    playSound("product.card.click");
    startTransition(() => {
      setSelectedProductId(productId);
      navigateToScreen("productDetail", { productId });
    });
  }, [navigateToScreen]);

  const handleSelectVehicle = useCallback((vehicleId: string) => {
    startTransition(() => {
      setSelectedVehicleId(vehicleId);
      navigateToScreen("vehicleDetail", { vehicleId });
    });
  }, [navigateToScreen]);

  const handleMediaQualityChange = useCallback((quality: ShowcaseVideoQuality) => {
    setMediaQuality(quality);
    window.localStorage.setItem(MEDIA_QUALITY_STORAGE_KEY, quality);
  }, []);

  const isShowcaseExperience =
    screen === "experience" &&
    isShowcaseChapterId(
      getChapterDefinition(entryPartIndex + 1, entryChapterIndex + 1)?.id
    );

  type LayoutScreen = SiteScreen | "productDetail" | "vehicleDetail";
  const LAYOUT_SCREENS: AppScreen[] = ["home", "products", "productDetail", "showcase", "contact", "vehicles", "vehicleDetail"];
  const showSiteHeader = LAYOUT_SCREENS.includes(screen);
  const layoutCurrentScreen =
    screen === "productDetail" ? "products" :
    screen === "vehicleDetail" ? "vehicles" :
    screen as SiteScreen;

  const handleSiteNavigate = useCallback((nextScreen: LayoutScreen) => {
    switch (nextScreen) {
      case "home":          handleGoHome(); break;
      case "products":      handleNavigateToProducts(); break;
      case "showcase":      handleNavigateToShowcase(); break;
      case "contact":       handleNavigateToContact(); break;
      case "vehicles":      handleNavigateToVehicles(); break;
      case "productDetail": navigateToScreen("productDetail"); break;
      case "vehicleDetail": navigateToScreen("vehicleDetail"); break;
    }
  }, [handleGoHome, handleNavigateToProducts, handleNavigateToShowcase, handleNavigateToContact, handleNavigateToVehicles, navigateToScreen]);

  return (
    <div style={{ width: "100%", height: "100%", margin: 0, padding: 0, overflow: "hidden" }}>
      <MediaQualitySettings
        quality={mediaQuality}
        visible={!isShowcaseExperience}
        onQualityChange={handleMediaQualityChange}
        belowHeader={showSiteHeader}
      />
      {showSiteHeader && (
        <SiteHeader currentScreen={layoutCurrentScreen} onNavigate={handleSiteNavigate} />
      )}
      {showSiteHeader && (
        <BottomDock currentScreen={layoutCurrentScreen} onNavigate={handleSiteNavigate} />
      )}

      {screen !== "gate" && (
        <OutsideShowcaseMusic enabled={!(isShowcaseExperience && showcaseChapterRevealed)} />
      )}
      {LOCAL_CHAT_ENABLED && screen !== "gate" && (
        <Suspense fallback={null}>
          <OllamaChat />
        </Suspense>
      )}
      <Suspense fallback={null}>
        {screen === "admin" ? (
          <AdminPage onExit={handleGoHome} />
        ) : screen === "gate" ? (
          <>
            <PhoneExperienceNotice />
            <PreloadGate onStart={handleGoHome} />
          </>
        ) : (
          <StoryProvider>
            {screen === "titlecard" ? (
              <ShowcaseTitleCard onPlay={handleStartExperience} />
            ) : screen === "experience" ? (
              <Experience
                initialPartIndex={entryPartIndex}
                initialChapterIndex={entryChapterIndex}
                onGoHome={handleGoHome}
                onShowcaseChapterRevealChange={setShowcaseChapterRevealed}
                mediaQuality={mediaQuality}
              />
            ) : screen === "products" ? (
              <ProductsPage
                onGoHome={handleGoHome}
                onSelectProduct={handleSelectProduct}
                onNavigateToShowcase={handleNavigateToShowcase}
                onNavigateToContact={handleNavigateToContact}
                onNavigateToVehicles={handleNavigateToVehicles}
              />
            ) : screen === "vehicles" ? (
              <VehiclesPage
                onGoHome={handleGoHome}
                onNavigateToProducts={handleNavigateToProducts}
                onNavigateToShowcase={handleNavigateToShowcase}
                onNavigateToContact={handleNavigateToContact}
                onSelectVehicle={handleSelectVehicle}
              />
            ) : screen === "vehicleDetail" ? (
              <VehicleDetailPage
                vehicleId={selectedVehicleId}
                onBackToVehicles={handleNavigateToVehicles}
                onGoHome={handleGoHome}
                onNavigateToProducts={handleNavigateToProducts}
                onNavigateToShowcase={handleNavigateToShowcase}
                onNavigateToContact={handleNavigateToContact}
              />
            ) : screen === "productDetail" ? (
              <ProductDetailPage
                productId={selectedProductId}
                onGoHome={handleGoHome}
                onNavigateToProducts={handleNavigateToProducts}
                onNavigateToVehicles={handleNavigateToVehicles}
                onNavigateToShowcase={handleNavigateToShowcase}
                onNavigateToContact={handleNavigateToContact}
                onViewShowcase={handleEnterExperience}
              />
            ) : screen === "showcase" ? (
              <ShowcasePage
                onGoHome={handleGoHome}
                onNavigateToProducts={handleNavigateToProducts}
                onNavigateToVehicles={handleNavigateToVehicles}
                onNavigateToContact={handleNavigateToContact}
                onEnter={handleEnterExperience}
              />
            ) : screen === "contact" ? (
              <ContactPage
                onGoHome={handleGoHome}
                onNavigateToProducts={handleNavigateToProducts}
                onNavigateToVehicles={handleNavigateToVehicles}
                onNavigateToShowcase={handleNavigateToShowcase}
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
        )}
      </Suspense>
      <Analytics />
    </div>
  );
}
