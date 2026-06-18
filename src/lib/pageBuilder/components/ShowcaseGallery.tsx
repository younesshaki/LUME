import { useMemo } from "react";
import { mediaUrl } from "@/config/cdn";
import {
  CardBody,
  CardContainer,
  CardItem,
} from "@/components/ui/3d-card";
import { useSound } from "@/lib/sound";
import { getShowcasePreviewForChapter } from "@/experience/products/catalog";
import { useStory } from "@/experience/story/StoryProvider";
import { getPartDisplayList } from "@/experience/story/selectors";
import { showcasePageSoundActions } from "@/experience/ui/ShowcasePage/ShowcasePage.sounds";
import type { BlockComponentProps } from "../registry";
import { usePageBuilderRenderContext } from "../renderContext";
import { stringArrayProp, stringProp } from "./props";
import "@/experience/ui/StoryHomePage/StoryHomePage.css";
import "@/experience/ui/ShowcasePage/ShowcasePage.css";

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
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
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
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
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

export function ShowcaseGallery({ block, mode }: BlockComponentProps) {
  const { isReady, state } = useStory();
  const { onEnterShowcase, pageSlug } = usePageBuilderRenderContext();
  const isStandard = mode === "standard";
  const title = stringProp(block, "title");
  const chapterIds = stringArrayProp(block, "chapterIds");
  const visibleChapterIds = useMemo(() => new Set(chapterIds), [chapterIds]);

  const showcaseChapters = useMemo(() => {
    if (!isReady) return [];

    return getPartDisplayList(state)
      .flatMap((part) => part.chapters)
      .filter(
        (chapter) =>
          visibleChapterIds.size === 0 || visibleChapterIds.has(chapter.definition.id)
      )
      .map((chapter) => ({
        ...chapter,
        status: chapter.status === "locked" ? "available" : chapter.status,
      }));
  }, [isReady, state, visibleChapterIds]);

  if (showcaseChapters.length === 0) return null;

  return (
    <section
      className={pageSlug === "showcase" ? "showcasePage__cards" : "storyHome__showcaseCards"}
      aria-label="LUME showcases"
    >
      {title && <h2 className="showcasePage__eyebrow">{title}</h2>}
      {showcaseChapters.map((chapter, index) => {
        const preview = getShowcasePreviewForChapter(chapter.definition.id, index);
        const handleSelect = () => {
          if (onEnterShowcase) {
            onEnterShowcase(chapter.partIndex, chapter.chapterIndex);
            return;
          }
          console.warn(
            `[pageBuilder] showcase selected without route handler: ${chapter.definition.id}`
          );
        };

        return isStandard ? (
          <FlatShowcaseCard
            key={chapter.definition.id}
            title={chapter.definition.title}
            imageSrc={preview.imageSrc ?? fallbackShowcaseImage}
            imageAlt={`${preview.brand} ${preview.name} LUME showcase preview`}
            onSelect={handleSelect}
          />
        ) : (
          <ShowcaseCard
            key={chapter.definition.id}
            title={chapter.definition.title}
            imageSrc={preview.imageSrc ?? fallbackShowcaseImage}
            imageAlt={`${preview.brand} ${preview.name} LUME showcase preview`}
            onSelect={handleSelect}
          />
        );
      })}
    </section>
  );
}
