import "./App.scss";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { OutsideShowcaseMusic } from "./experience/audio/OutsideShowcaseMusic";
import { UiSoundProvider } from "./experience/audio/UiSoundProvider";
import Experience from "./experience/Experience";
import { StoryProvider } from "./experience/story/StoryProvider";
import PreloadGate from "./experience/ui/PreloadGate";
import ShowcaseTitleCard from "./experience/ui/ShowcaseTitleCard";
import StoryHomePage from "./experience/ui/StoryHomePage";
import PhoneExperienceNotice from "./experience/ui/PhoneExperienceNotice";
import AdminPage from "./experience/ui/AdminPage";
import { MediaQualitySettings } from "./experience/ui/MediaQualitySettings";
import type { ShowcaseVideoQuality } from "./experience/scenes/showcase/data/sceneAssets";

type AppScreen = "gate" | "home" | "titlecard" | "experience" | "admin";

function HeadphonesIcon() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const div = document.createElement("div");
    div.style.cssText = "position:fixed;bottom:1.5rem;right:1.5rem;z-index:900;pointer-events:none;";
    document.body.appendChild(div);
    setHost(div);
    return () => { div.remove(); };
  }, []);

  if (!host) return null;

  return createPortal(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="44"
      height="44"
      fill="#ffffff"
    >
      <path d="m12,3C6.49,3,2,7.49,2,13v6c0,.55.45,1,1,1h3c.55,0,1-.45,1-1v-5c0-.55-.45-1-1-1h-2c0-4.41,3.59-8,8-8s8,3.59,8,8h-2c-.55,0-1,.45-1,1v5c0,.55.45,1,1,1h3c.55,0,1-.45,1-1v-6c0-5.51-4.49-10-10-10Z"/>
    </svg>,
    host
  );
}

const SHOWCASE_ENTRY = {
  partIndex: 6,
  chapterIndex: 0,
};

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
  const [entryPartIndex, setEntryPartIndex] = useState(0);
  const [entryChapterIndex, setEntryChapterIndex] = useState(0);
  const [showcaseChapterRevealed, setShowcaseChapterRevealed] = useState(false);
  const [mediaQuality, setMediaQuality] = useState<ShowcaseVideoQuality>(
    readInitialMediaQuality
  );

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

  const handleEnterExperience = useCallback(
    (partIndex: number, chapterIndex: number) => {
      setShowcaseChapterRevealed(false);
      setEntryPartIndex(partIndex);
      setEntryChapterIndex(chapterIndex);
      if (
        partIndex === SHOWCASE_ENTRY.partIndex &&
        chapterIndex === SHOWCASE_ENTRY.chapterIndex
      ) {
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
    entryPartIndex === SHOWCASE_ENTRY.partIndex &&
    entryChapterIndex === SHOWCASE_ENTRY.chapterIndex;

  return (
    <div style={{ width: "100%", height: "100%", margin: 0, padding: 0, overflow: "hidden" }}>
      <UiSoundProvider>
        <MediaQualitySettings
          quality={mediaQuality}
          visible={!isShowcaseExperience}
          onQualityChange={handleMediaQualityChange}
        />
        {screen !== "gate" && (
          <OutsideShowcaseMusic enabled={!(isShowcaseExperience && showcaseChapterRevealed)} />
        )}
        {!(isShowcaseExperience && showcaseChapterRevealed) && <HeadphonesIcon />}
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
            ) : (
              <StoryHomePage onEnter={handleEnterExperience} />
            )}
          </StoryProvider>
        )}
      </UiSoundProvider>
    </div>
  );
}
