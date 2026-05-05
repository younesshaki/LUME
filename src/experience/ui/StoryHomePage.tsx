import { CSSProperties, UIEvent, useMemo, useRef } from "react";
import { useUiSounds } from "../audio/useUiSounds";
import { useStory } from "../story/StoryProvider";
import { getPartDisplayList } from "../story/selectors";
import CinematicShell from "./CinematicShell";
import {
  CardBody,
  CardContainer,
  CardItem,
} from "@/components/ui/3d-card";
import { mediaUrl } from "@/config/cdn";
import homepageBackgroundImage from "../assets/images/lume-homepage-background.png";
import "./StoryHomePage.css";

type StoryHomePageProps = {
  onEnter: (partIndex: number, chapterIndex: number) => void;
  onNavigateToProducts?: () => void;
  onNavigateToShowcase?: () => void;
  onNavigateToContact?: () => void;
};

const VISIBLE_CHAPTER_IDS = [
  "showcase-chapter-1",
  "showcase-chapter-2",
  "showcase-chapter-3",
];

const redBullCyclesImage = mediaUrl("blackredbullcycles.png");
const starbucksImage = mediaUrl("starbucksLUME.png");
const yslFemmeImage = mediaUrl("YSLfemmeLUME.png");
const lumeLogoImage = mediaUrl("LUMElogo.png");

const SHOWCASE_CARD_IMAGES = [
  { src: redBullCyclesImage, alt: "Red Bull Special Edition LUME product preview" },
  { src: starbucksImage, alt: "Starbucks Reserve Blend LUME product preview" },
  { src: yslFemmeImage, alt: "YSL Libre Femme LUME product preview" },
];

const homepageBackgroundStyle = {
  "--story-home-bg-image": `url(${homepageBackgroundImage})`,
} as CSSProperties & Record<"--story-home-bg-image", string>;

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
  const { playHover, playNavClick } = useUiSounds();

  const handleSelect = () => {
    playNavClick();
    onSelect();
  };

  return (
    <div
      className="storyHome__option3dWrap storyHome__option3dWrap--available"
      onMouseEnter={playHover}
      onFocus={playHover}
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
  onNavigateToShowcase,
  onNavigateToContact,
}: StoryHomePageProps) {
  const { isReady, state } = useStory();
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
        <div className="storyHome__floatingLogo" aria-hidden="true">
          <img src={lumeLogoImage} alt="" />
        </div>
        <header className="storyHome__header">
          <nav className="storyHome__nav" aria-label="Primary">
            <a
                href="#product"
                onClick={onNavigateToProducts ? (e) => { e.preventDefault(); onNavigateToProducts(); } : undefined}
              >
                Product
              </a>
            <a
              href="#showcase"
              onClick={onNavigateToShowcase ? (e) => { e.preventDefault(); onNavigateToShowcase(); } : undefined}
            >
              Showcase
            </a>
            <a
              href="#contact"
              onClick={onNavigateToContact ? (e) => { e.preventDefault(); onNavigateToContact(); } : undefined}
            >
              Contact
            </a>
          </nav>
        </header>

        <main id="top">
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
                const preview = SHOWCASE_CARD_IMAGES[index] ?? SHOWCASE_CARD_IMAGES[0];

                return (
                  <StoryOptionCard
                    key={chapter.definition.id}
                    title={chapter.definition.title}
                    actionLabel="Open"
                    imageSrc={preview.src}
                    imageAlt={preview.alt}
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

        <footer id="contact" className="storyHome__footer">
          <img className="storyHome__footerLogo" src={lumeLogoImage} alt="" />
          <div>
            <p>LUME</p>
            <span>Premium concepts for regular products.</span>
          </div>
        </footer>
      </div>
    </CinematicShell>
  );
}
