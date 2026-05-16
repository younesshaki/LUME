import { CSSProperties, UIEvent, useMemo, useRef } from "react";
import { useSound } from "@/lib/sound";
import { useDualMode } from "@/lib/DualModeContext";
import { useStory } from "@/experience/story/StoryProvider";
import { getPartDisplayList } from "@/experience/story/selectors";
import CinematicShell from "../CinematicShell";
import {
  CardBody,
  CardContainer,
  CardItem,
} from "@/components/ui/3d-card";
import { mediaUrl } from "@/config/cdn";
import { getShowcasePreviewForChapter } from "@/experience/products/catalog";
import homepageBackgroundImage from "@/experience/assets/images/lume-homepage-background.png";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { storyHomePageSoundActions } from "./StoryHomePage.sounds";
import "./StoryHomePage.css";

type StoryHomePageProps = {
  onEnter: (partIndex: number, chapterIndex: number) => void;
  onNavigateToProducts?: () => void;
  onNavigateToVehicles?: () => void;
  onNavigateToShowcase?: () => void;
  onNavigateToContact?: () => void;
};

const VISIBLE_CHAPTER_IDS = [
  "showcase-chapter-1",
  "showcase-chapter-2",
  "showcase-chapter-3",
];

const redBullCyclesImage = mediaUrl("blackredbullcycles.png");

const homepageBackgroundStyle = {
  "--story-home-bg-image": `url(${homepageBackgroundImage})`,
} as CSSProperties & Record<"--story-home-bg-image", string>;

function FlatStoryOptionCard({
  title,
  actionLabel,
  imageSrc,
  imageAlt,
  onSelect,
}: {
  title: string;
  actionLabel: string;
  imageSrc: string;
  imageAlt: string;
  onSelect: () => void;
}) {
  const { play } = useSound();

  const handleSelect = () => {
    play(storyHomePageSoundActions.cardOpen);
    onSelect();
  };

  return (
    <div
      className="storyHome__flatCard"
      onClick={handleSelect}
      onMouseEnter={() => play(storyHomePageSoundActions.cardHover)}
      onFocus={() => play(storyHomePageSoundActions.cardHover)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
    >
      <img className="storyHome__flatCardImage" src={imageSrc} alt={imageAlt} />
      <div className="storyHome__flatCardBody">
        <p className="storyHome__flatCardTitle">{title}</p>
        <span className="storyHome__flatCardAction">{actionLabel}</span>
      </div>
    </div>
  );
}

function StoryOptionCard({
  title,
  actionLabel,
  imageSrc,
  imageAlt,
  onSelect,
}: {
  title: string;
  actionLabel: string;
  imageSrc: string;
  imageAlt: string;
  onSelect: () => void;
}) {
  const { play } = useSound();

  const handleSelect = () => {
    play(storyHomePageSoundActions.cardOpen);
    onSelect();
  };

  return (
    <div
      className="storyHome__option3dWrap storyHome__option3dWrap--available"
      onMouseEnter={() => play(storyHomePageSoundActions.cardHover)}
      onFocus={() => play(storyHomePageSoundActions.cardHover)}
      onClick={handleSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
    >
      <CardContainer
        containerClassName="storyHome__option3dContainer"
        className="storyHome__option3dPlane"
      >
        <CardBody className="storyHome__option3dBody group/card">
          <CardItem translateZ="70" className="storyHome__option3dTitle">
            {title}
          </CardItem>
          <CardItem
            translateZ="95"
            rotateX={8}
            rotateZ={-2}
            className="storyHome__option3dImageSlot"
          >
            <img className="storyHome__option3dImage" src={imageSrc} alt={imageAlt} />
          </CardItem>
          <CardItem
            translateZ={44}
            translateY={8}
            as="p"
            className="storyHome__option3dAction"
          >
            {actionLabel}
          </CardItem>
        </CardBody>
      </CardContainer>
    </div>
  );
}

export default function StoryHomePage({
  onEnter,
  onNavigateToProducts,
  onNavigateToVehicles,
  onNavigateToShowcase,
  onNavigateToContact,
}: StoryHomePageProps) {
  const { isReady, state } = useStory();
  const { play } = useSound();
  const { mode } = useDualMode();
  const isLight = mode === "light";
  const pageRef = useRef<HTMLDivElement | null>(null);

  const showcaseChapters = useMemo(() => {
    if (!isReady) return [];

    return getPartDisplayList(state)
      .flatMap((part) => part.chapters)
      .filter((chapter) => VISIBLE_CHAPTER_IDS.includes(chapter.definition.id))
      .map((chapter) => ({
        ...chapter,
        status: chapter.status === "locked" ? "available" : chapter.status,
      }));
  }, [isReady, state]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const maxScroll = Math.max(1, element.scrollHeight - element.clientHeight);
    element.style.setProperty("--trace-progress", `${element.scrollTop / maxScroll}`);
  };

  return (
    <CinematicShell>
      <div
        ref={pageRef}
        className="storyHome"
        style={homepageBackgroundStyle}
        onScroll={handleScroll}
      >
        <div className="storyHome__background" aria-hidden="true" />

        <main id="top" style={{ paddingTop: "72px", paddingBottom: "160px" }}>
          <div className="storyHome__tracingBeam" aria-hidden="true" />
          <section id="showcases" className="storyHome__hero">
            <div className="storyHome__heroCopy">
              <div className="storyHome__lamp" aria-hidden="true" />
              <h1 className="storyHome__title">Luxury versions of everyday energy.</h1>
              <p className="storyHome__subtitle">
                LUME reframes familiar products through black-gold design,
                cinematic pacing, and premium product storytelling.
              </p>
            </div>

            <div className="storyHome__showcaseCards" aria-label="LUME showcases">
              {showcaseChapters.map((chapter, index) => {
                const preview = getShowcasePreviewForChapter(
                  chapter.definition.id,
                  index
                );

                return isLight ? (
                  <FlatStoryOptionCard
                    key={chapter.definition.id}
                    title={chapter.definition.title}
                    actionLabel="Open"
                    imageSrc={preview.imageSrc ?? redBullCyclesImage}
                    imageAlt={`${preview.brand} ${preview.name} LUME product preview`}
                    onSelect={() => onEnter(chapter.partIndex, chapter.chapterIndex)}
                  />
                ) : (
                  <StoryOptionCard
                    key={chapter.definition.id}
                    title={chapter.definition.title}
                    actionLabel="Open"
                    imageSrc={preview.imageSrc ?? redBullCyclesImage}
                    imageAlt={`${preview.brand} ${preview.name} LUME product preview`}
                    onSelect={() => onEnter(chapter.partIndex, chapter.chapterIndex)}
                  />
                );
              })}
            </div>
          </section>

          <section id="product" className="storyHome__featureBand">
            <div className="storyHome__featureMedia">
              <img src={redBullCyclesImage} alt="Black and gold LUME product concept" />
            </div>
            <div className="storyHome__featureCopy">
              <p className="storyHome__sectionKicker">Product Language</p>
              <h2>Energy, treated like an object of desire.</h2>
              <p>
                The first LUME direction imagines a premium black-and-gold energy product:
                sharper, slower, more tactile, and built for a cinematic first impression.
              </p>
            </div>
          </section>
        </main>

        <SiteFooter onNavigate={(s) => {
          if (s === "products") onNavigateToProducts?.();
          else if (s === "vehicles") onNavigateToVehicles?.();
          else if (s === "showcase") onNavigateToShowcase?.();
          else if (s === "contact") onNavigateToContact?.();
          else if (s === "home") pageRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }} />
      </div>
    </CinematicShell>
  );
}
