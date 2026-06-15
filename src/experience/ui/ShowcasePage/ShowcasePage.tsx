import { useMemo } from "react";
import { mediaUrl } from "@/config/cdn";
import {
  CardBody,
  CardContainer,
  CardItem,
} from "@/components/ui/3d-card";
import { useSound } from "@/lib/sound";
import { useDualMode } from "@/lib/DualModeContext";
import { getShowcasePreviewForChapter } from "@/experience/products/catalog";
import { useStory } from "@/experience/story/StoryProvider";
import { getPartDisplayList } from "@/experience/story/selectors";
import CinematicShell from "../CinematicShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { showcasePageSoundActions } from "./ShowcasePage.sounds";
import "../StoryHomePage/StoryHomePage.css";
import "./ShowcasePage.css";

type ShowcasePageProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToVehicles: () => void;
  onNavigateToContact: () => void;
  onEnter: (partIndex: number, chapterIndex: number) => void;
};

const VISIBLE_CHAPTER_IDS = [
  "showcase-chapter-1",
  "showcase-chapter-2",
  "showcase-chapter-3",
];

const fallbackShowcaseImage = mediaUrl("blackredbullcycles.png");

function FlatShowcaseCard({
  title,
  imageSrc,
  imageAlt,
  onSelect,
}: {
  title: string;
  imageSrc: string;
  imageAlt: string;
  onSelect: () => void;
}) {
  const { play } = useSound();

  const handleSelect = () => {
    play(showcasePageSoundActions.cardOpen);
    onSelect();
  };

  return (
    <div
      className="storyHome__flatCard"
      onClick={handleSelect}
      onMouseEnter={() => play(showcasePageSoundActions.cardHover)}
      onFocus={() => play(showcasePageSoundActions.cardHover)}
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
        <span className="storyHome__flatCardAction">Open</span>
      </div>
    </div>
  );
}

function ShowcaseCard({
  title,
  imageSrc,
  imageAlt,
  onSelect,
}: {
  title: string;
  imageSrc: string;
  imageAlt: string;
  onSelect: () => void;
}) {
  const { play } = useSound();

  const handleSelect = () => {
    play(showcasePageSoundActions.cardOpen);
    onSelect();
  };

  return (
    <div
      className="storyHome__option3dWrap storyHome__option3dWrap--available"
      onMouseEnter={() => play(showcasePageSoundActions.cardHover)}
      onFocus={() => play(showcasePageSoundActions.cardHover)}
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
            Open
          </CardItem>
        </CardBody>
      </CardContainer>
    </div>
  );
}

export default function ShowcasePage({
  onGoHome,
  onNavigateToProducts,
  onNavigateToVehicles,
  onNavigateToContact,
  onEnter,
}: ShowcasePageProps) {
  const { isReady, state } = useStory();
  const { play } = useSound();
  const { mode } = useDualMode();
  const isStandard = mode === "standard";

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

  return (
    <CinematicShell>
      <div className="showcasePage">
        <main className="showcasePage__main" style={{ paddingTop: "72px", paddingBottom: "160px" }}>
          <section className="showcasePage__hero">
            <p className="showcasePage__eyebrow">Cinematic Entries</p>
            <h1>Showcase</h1>
            <p>
              Dedicated cinematic product stories. These entries start with the
              LUME title card before loading the full experience.
            </p>
          </section>

          <section className="showcasePage__cards" aria-label="LUME showcases">
            {showcaseChapters.map((chapter, index) => {
              const preview = getShowcasePreviewForChapter(
                chapter.definition.id,
                index
              );

              return isStandard ? (
                <FlatShowcaseCard
                  key={chapter.definition.id}
                  title={chapter.definition.title}
                  imageSrc={preview.imageSrc ?? fallbackShowcaseImage}
                  imageAlt={`${preview.brand} ${preview.name} LUME showcase preview`}
                  onSelect={() => onEnter(chapter.partIndex, chapter.chapterIndex)}
                />
              ) : (
                <ShowcaseCard
                  key={chapter.definition.id}
                  title={chapter.definition.title}
                  imageSrc={preview.imageSrc ?? fallbackShowcaseImage}
                  imageAlt={`${preview.brand} ${preview.name} LUME showcase preview`}
                  onSelect={() => onEnter(chapter.partIndex, chapter.chapterIndex)}
                />
              );
            })}
          </section>
        </main>
        <SiteFooter onNavigate={(s) => {
          if (s === "home") onGoHome();
          else if (s === "products") onNavigateToProducts();
          else if (s === "vehicles") onNavigateToVehicles();
          else if (s === "contact") onNavigateToContact();
        }} />
      </div>
    </CinematicShell>
  );
}
