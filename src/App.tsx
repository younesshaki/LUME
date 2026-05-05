import "./App.scss";
import { useCallback, useEffect, useRef, useState } from "react";
import { OllamaChat } from "./components/chat/OllamaChat";
import { OutsideShowcaseMusic } from "./experience/audio/OutsideShowcaseMusic";
import { UiSoundProvider } from "./experience/audio/UiSoundProvider";
import Experience from "./experience/Experience";
import { StoryProvider } from "./experience/story/StoryProvider";
import PreloadGate from "./experience/ui/PreloadGate";
import ShowcaseTitleCard from "./experience/ui/ShowcaseTitleCard";
import StoryHomePage from "./experience/ui/StoryHomePage";
import ProductsPage from "./experience/ui/ProductsPage";
import ContactPage from "./experience/ui/ContactPage";
import PhoneExperienceNotice from "./experience/ui/PhoneExperienceNotice";
import AdminPage from "./experience/ui/AdminPage";
import { MediaQualitySettings } from "./experience/ui/MediaQualitySettings";
import { AppBackButton } from "./experience/ui/AppBackButton";
import type { ShowcaseVideoQuality } from "./experience/scenes/showcase/data/sceneAssets";
import { isShowcaseChapterId } from "./experience/scenes/showcase/data";
import { getChapterDefinition } from "./experience/story/manifest";
import { logStoryEvent } from "./lib/eventsService";

type AppScreen = "gate" | "home" | "products" | "contact" | "titlecard" | "experience" | "admin";


const MEDIA_QUALITY_STORAGE_KEY = "nomad.media-quality.v1";
const LOCAL_CHAT_ENABLED = import.meta.env.VITE_ENABLE_LOCAL_CHAT === "true";

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
  const [entryPartIndex, setEntryPartIndex] = useState(0);
  const [entryChapterIndex, setEntryChapterIndex] = useState(0);
  const [showcaseChapterRevealed, setShowcaseChapterRevealed] = useState(false);
  const [mediaQuality, setMediaQuality] = useState<ShowcaseVideoQuality>(
    readInitialMediaQuality
  );
  const screenEnteredAtRef = useRef(Date.now());

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

  const handleGoHome = useCallback(() => {
    setShowcaseChapterRevealed(false);
    if (window.location.hash === "#admin") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setScreen("home");
  }, []);

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
    if (screen === "titlecard") {
      logNavigationAction("back", "titlecard", "home");
      handleGoHome();
      return;
    }

    if (screen === "experience") {
      logNavigationAction("back", "experience", "home");
      handleGoHome();
      return;
    }

    if (screen === "admin") {
      logNavigationAction("back", "admin", "home");
      handleGoHome();
      return;
    }

    if (screen === "products") {
      logNavigationAction("back", "products", "home");
      handleGoHome();
      return;
    }

    if (screen === "contact") {
      logNavigationAction("back", "contact", "home");
      handleGoHome();
    }
  }, [handleGoHome, logNavigationAction, screen]);

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
    setShowcaseChapterRevealed(false);
    setScreen("experience");
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
      <UiSoundProvider>
        <MediaQualitySettings
          quality={mediaQuality}
          visible={!isShowcaseExperience}
          onQualityChange={handleMediaQualityChange}
        />
        {(screen === "titlecard" || screen === "experience" || screen === "admin" || screen === "products" || screen === "contact") && (
          <AppBackButton onClick={handleBack} />
        )}
        {screen !== "gate" && (
          <OutsideShowcaseMusic enabled={!(isShowcaseExperience && showcaseChapterRevealed)} />
        )}
        {LOCAL_CHAT_ENABLED && screen !== "gate" && <OllamaChat />}
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
                onEnter={handleEnterExperience}
                onNavigateToContact={() => setScreen("contact")}
              />
            ) : screen === "contact" ? (
              <ContactPage
                onGoHome={handleGoHome}
                onNavigateToProducts={() => setScreen("products")}
              />
            ) : (
              <StoryHomePage
                onEnter={handleEnterExperience}
                onNavigateToProducts={() => setScreen("products")}
                onNavigateToContact={() => setScreen("contact")}
              />
            )}
          </StoryProvider>
        )}
      </UiSoundProvider>
    </div>
  );
}
