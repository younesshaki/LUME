import "./App.scss";
import { useCallback, useEffect, useRef, useState } from "react";
import { OllamaChat } from "./components/chat/OllamaChat";
import { OutsideShowcaseMusic } from "./experience/audio/OutsideShowcaseMusic";
import Experience from "./experience/Experience";
import { StoryProvider } from "./experience/story/StoryProvider";
import PreloadGate from "./experience/ui/PreloadGate";
import ShowcaseTitleCard from "./experience/ui/ShowcaseTitleCard";
import StoryHomePage from "./experience/ui/StoryHomePage";
import ProductsPage from "./experience/ui/ProductsPage";
import ProductDetailPage from "./experience/ui/ProductDetailPage";
import ShowcasePage from "./experience/ui/ShowcasePage";
import ContactPage from "./experience/ui/ContactPage";
import PhoneExperienceNotice from "./experience/ui/PhoneExperienceNotice";
import AdminPage from "./experience/ui/AdminPage";
import { MediaQualitySettings } from "./experience/ui/MediaQualitySettings";
import { AppBackButton } from "./experience/ui/AppBackButton";
import type { ShowcaseVideoQuality } from "./experience/scenes/showcase/data/sceneAssets";
import { isShowcaseChapterId } from "./experience/scenes/showcase/data";
import { getChapterDefinition } from "./experience/story/manifest";
import { logStoryEvent } from "./lib/eventsService";
import { useSound } from "./lib/sound";

type AppScreen =
  | "gate"
  | "home"
  | "products"
  | "productDetail"
  | "showcase"
  | "contact"
  | "titlecard"
  | "experience"
  | "admin";


const MEDIA_QUALITY_STORAGE_KEY = "nomad.media-quality.v1";

function readInitialMediaQuality(): ShowcaseVideoQuality {
  if (typeof window === "undefined") return "high";

  const stored = window.localStorage.getItem(MEDIA_QUALITY_STORAGE_KEY);
  return stored === "normal" || stored === "high" ? stored : "high";
}

export default function App() {
  const initialHash = typeof window !== "undefined" ? window.location.hash : "";
  const [screen, setScreen] = useState<AppScreen>(
    initialHash === "#admin" ? "admin" : "gate"
  );
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [entryPartIndex, setEntryPartIndex] = useState(0);
  const [entryChapterIndex, setEntryChapterIndex] = useState(0);
  const [showcaseChapterRevealed, setShowcaseChapterRevealed] = useState(false);
  const [mediaQuality, setMediaQuality] = useState<ShowcaseVideoQuality>(
    readInitialMediaQuality
  );
  const screenEnteredAtRef = useRef(Date.now());
  const sound = useSound();

  useEffect(() => {
    screenEnteredAtRef.current = Date.now();
  }, [screen]);

  // React to hash changes (e.g., user manually types #admin to enter, or removes it to exit)
  useEffect(() => {
    const handler = () => {
      if (window.location.hash === "#admin") setScreen("admin");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const handleGoHome = useCallback((playSound = true) => {
    if (playSound) {
      sound.play("nav.toHome");
    }
    setShowcaseChapterRevealed(false);
    if (window.location.hash === "#admin") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setScreen("home");
  }, [sound]);

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
    sound.play("nav.back");

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

    if (screen === "productDetail") {
      logNavigationAction("back", "productDetail", "products");
      setScreen("products");
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
  }, [handleGoHome, logNavigationAction, screen, sound]);

  const handleEnterExperience = useCallback(
    (partIndex: number, chapterIndex: number) => {
      setShowcaseChapterRevealed(false);
      setEntryPartIndex(partIndex);
      setEntryChapterIndex(chapterIndex);
      const chapterDefinition = getChapterDefinition(partIndex + 1, chapterIndex + 1);
      if (isShowcaseChapterId(chapterDefinition?.id)) {
        setScreen("titlecard");
        return;
      }
      setScreen("experience");
    },
    []
  );

  const handleStartExperience = useCallback(() => {
    sound.play("showcase.enter");
    setShowcaseChapterRevealed(false);
    setScreen("experience");
  }, [sound]);

  const handleNavigateToProducts = useCallback(() => {
    sound.play("nav.toProducts");
    setScreen("products");
  }, [sound]);

  const handleNavigateToShowcase = useCallback(() => {
    sound.play("nav.toShowcase");
    setScreen("showcase");
  }, [sound]);

  const handleNavigateToContact = useCallback(() => {
    sound.play("nav.toContact");
    setScreen("contact");
  }, [sound]);

  const handleSelectProduct = useCallback((productId: string) => {
    sound.play("product.card.click");
    setSelectedProductId(productId);
    setScreen("productDetail");
  }, [sound]);

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
      {(screen === "titlecard" || screen === "experience" || screen === "admin" || screen === "products" || screen === "productDetail" || screen === "showcase" || screen === "contact") && (
        <AppBackButton onClick={handleBack} />
      )}
      {screen !== "gate" && (
        <OutsideShowcaseMusic enabled={!(isShowcaseExperience && showcaseChapterRevealed)} />
      )}
      {screen !== "gate" && <OllamaChat />}
      {screen === "admin" ? (
        <AdminPage onExit={() => handleGoHome(false)} />
      ) : screen === "gate" ? (
        <>
          <PhoneExperienceNotice />
          <PreloadGate onStart={() => handleGoHome(false)} />
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
            />
          ) : screen === "productDetail" ? (
            <ProductDetailPage
              productId={selectedProductId}
              onGoHome={handleGoHome}
              onNavigateToProducts={handleNavigateToProducts}
              onNavigateToShowcase={handleNavigateToShowcase}
              onNavigateToContact={handleNavigateToContact}
              onViewShowcase={handleEnterExperience}
            />
          ) : screen === "showcase" ? (
            <ShowcasePage
              onGoHome={handleGoHome}
              onNavigateToProducts={handleNavigateToProducts}
              onNavigateToContact={handleNavigateToContact}
              onEnter={handleEnterExperience}
            />
          ) : screen === "contact" ? (
            <ContactPage
              onGoHome={handleGoHome}
              onNavigateToProducts={handleNavigateToProducts}
              onNavigateToShowcase={handleNavigateToShowcase}
            />
          ) : (
            <StoryHomePage
              onEnter={handleEnterExperience}
              onNavigateToProducts={handleNavigateToProducts}
              onNavigateToShowcase={handleNavigateToShowcase}
              onNavigateToContact={handleNavigateToContact}
            />
          )}
        </StoryProvider>
      )}
    </div>
  );
}
