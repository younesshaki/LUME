import { useMemo } from "react";
import { mediaUrl } from "@/config/cdn";
import {
  CardBody,
  CardContainer,
  CardItem,
} from "@/components/ui/3d-card";
import { useSound } from "../../lib/sound";
import { getShowcasePreviewForChapter } from "../products/catalog";
import { useStory } from "../story/StoryProvider";
import { getPartDisplayList } from "../story/selectors";
import CinematicShell from "./CinematicShell";
import "./StoryHomePage.css";
import "./ShowcasePage.css";

type ShowcasePageProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToContact: () => void;
  onEnter: (partIndex: number, chapterIndex: number) => void;
};

const VISIBLE_CHAPTER_IDS = [
  "showcase-chapter-1",
  "showcase-chapter-2",
  "showcase-chapter-3",
];

const lumeLogoImage = mediaUrl("LUMElogo.png");
const fallbackShowcaseImage = mediaUrl("blackredbullcycles.png");

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
    play("showcase.card.open");
    onSelect();
  };

  return (
    <div
      className="storyHome__option3dWrap storyHome__option3dWrap--available"
      onMouseEnter={() => play("showcase.card.hover")}
      onFocus={() => play("showcase.card.hover")}
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
  onNavigateToContact,
  onEnter,
}: ShowcasePageProps) {
  const { isReady, state } = useStory();
  const { play } = useSound();

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
        <div className="showcasePage__floatingLogo" aria-hidden="true">
          <img src={lumeLogoImage} alt="" />
        </div>

        <header className="showcasePage__header">
          <nav className="showcasePage__nav" aria-label="Primary">
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onGoHome}>
              Home
            </button>
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onNavigateToProducts}>
              Products
            </button>
            <span>Showcase</span>
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onNavigateToContact}>
              Contact
            </button>
          </nav>
        </header>

        <main className="showcasePage__main">
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

              return (
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
      </div>
    </CinematicShell>
  );
}
