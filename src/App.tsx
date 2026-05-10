import "./App.scss";
import {
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { OutsideShowcaseMusic } from "./experience/audio/OutsideShowcaseMusic";
import { StoryProvider } from "./experience/story/StoryProvider";
import PreloadGate from "./experience/ui/PreloadGate";
import PhoneExperienceNotice from "./experience/ui/PhoneExperienceNotice";
import { MediaQualitySettings } from "./experience/ui/MediaQualitySettings";
import { AppBackButton } from "./experience/ui/AppBackButton";
import type { ShowcaseVideoQuality } from "./experience/scenes/showcase/data/sceneAssets";
import { isShowcaseChapterId } from "./experience/scenes/showcase/data";
import { getChapterDefinition } from "./experience/story/manifest";
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

export default function App() {
  const initialHash = typeof window !== "undefined" ? window.location.hash : "";
  const [screen, setScreen] = useState<AppScreen>(
    initialHash === "#admin" ? "admin" : initialHash.startsWith("#vehicles") ? "vehicles" : "gate"
  );
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [entryPartIndex, setEntryPartIndex] = useState(0);
  const [entryChapterIndex, setEntryChapterIndex] = useState(0);
  const [showcaseChapterRevealed, setShowcaseChapterRevealed] = useState(false);
  const [mediaQuality, setMediaQuality] = useState<ShowcaseVideoQuality>(
    readInitialMediaQuality
  );
  const screenEnteredAtRef = useRef(Date.now());

  const navigateToScreen = useCallback((nextScreen: AppScreen) => {
    startTransition(() => {
      setScreen(nextScreen);
    });
  }, []);

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
      if (window.location.hash === "#admin") navigateToScreen("admin");
      if (window.location.hash.startsWith("#vehicles")) navigateToScreen("vehicles");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, [navigateToScreen]);

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

  const handleBack = useCallback(() => {
    playSound("nav.back");

    if (screen === "titlecard") {
      logNavigationAction("back", "titlecard", "home");
      handleGoHome(false);
      return;
    }

    if (screen === "experience") {
      logNavigationAction("back", "experience", "home");
      handleGoHome(false);
      return;
    }

    if (screen === "admin") {
      logNavigationAction("back", "admin", "home");
      handleGoHome(false);
      return;
    }

    if (screen === "products") {
      logNavigationAction("back", "products", "home");
      handleGoHome(false);
      return;
    }

    if (screen === "vehicles") {
      logNavigationAction("back", "vehicles", "home");
      handleGoHome(false);
      return;
    }

    if (screen === "vehicleDetail") {
      logNavigationAction("back", "vehicleDetail", "vehicles");
      navigateToScreen("vehicles");
      return;
    }

    if (screen === "productDetail") {
      logNavigationAction("back", "productDetail", "products");
      navigateToScreen("products");
      return;
    }

    if (screen === "showcase") {
      logNavigationAction("back", "showcase", "home");
      handleGoHome(false);
      return;
    }

    if (screen === "contact") {
      logNavigationAction("back", "contact", "home");
      handleGoHome(false);
    }
  }, [handleGoHome, logNavigationAction, navigateToScreen, screen]);

  const handleEnterExperience = useCallback(
    (partIndex: number, chapterIndex: number) => {
      setShowcaseChapterRevealed(false);
      setEntryPartIndex(partIndex);
      setEntryChapterIndex(chapterIndex);
      const chapterDefinition = getChapterDefinition(partIndex + 1, chapterIndex + 1);
      if (isShowcaseChapterId(chapterDefinition?.id)) {
        navigateToScreen("titlecard");
        return;
      }
      navigateToScreen("experience");
    },
    [navigateToScreen]
  );

  const handleStartExperience = useCallback(() => {
    playSound("showcase.enter");
    setShowcaseChapterRevealed(false);
    navigateToScreen("experience");
  }, [navigateToScreen]);

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
      setScreen("productDetail");
    });
  }, []);

  const handleSelectVehicle = useCallback((vehicleId: string) => {
    startTransition(() => {
      setSelectedVehicleId(vehicleId);
      setScreen("vehicleDetail");
    });
  }, []);

  const handleMediaQualityChange = useCallback((quality: ShowcaseVideoQuality) => {
    setMediaQuality(quality);
    window.localStorage.setItem(MEDIA_QUALITY_STORAGE_KEY, quality);
  }, []);

  const isShowcaseExperience =
    screen === "experience" &&
    isShowcaseChapterId(
      getChapterDefinition(entryPartIndex + 1, entryChapterIndex + 1)?.id
    );

  return (
    <div style={{ width: "100%", height: "100%", margin: 0, padding: 0, overflow: "hidden" }}>
      <MediaQualitySettings
        quality={mediaQuality}
        visible={!isShowcaseExperience}
        onQualityChange={handleMediaQualityChange}
      />
      {(screen === "titlecard" || screen === "experience" || screen === "admin" || screen === "products" || screen === "productDetail" || screen === "vehicles" || screen === "vehicleDetail" || screen === "showcase" || screen === "contact") && (
        <AppBackButton onClick={handleBack} />
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
    </div>
  );
}
