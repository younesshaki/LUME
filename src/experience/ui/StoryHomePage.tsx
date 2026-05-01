import { useMemo } from "react";
import { useUiSounds } from "../audio/useUiSounds";
import { useStory } from "../story/StoryProvider";
import {
  getPartDisplayList,
  getResumeTarget,
  hasProgress,
  type ChapterDisplayInfo,
  type ChapterStatus,
  type PartDisplayInfo,
} from "../story/selectors";
import CinematicShell from "./CinematicShell";
import {
  CardBody,
  CardContainer,
  CardItem,
} from "@/components/ui/3d-card";
import { mediaUrl } from "@/config/cdn";
const redBullCyclesImage = mediaUrl("blackredbullcycles.png");
import "./StoryHomePage.css";

type StoryHomePageProps = {
  onEnter: (partIndex: number, chapterIndex: number) => void;
};

const VISIBLE_CHAPTER_IDS = ["showcase-chapter-1"];

/* ─── Status label helpers ─── */

const STATUS_LABELS: Record<ChapterStatus, string> = {
  locked: "Locked",
  available: "Ready",
  "in-progress": "In Progress",
  completed: "Complete",
};

/* ─── Subcomponents ─── */

export function ChapterCard({
  chapter,
  globalNumber,
  onSelect,
  standalone = false,
}: {
  chapter: ChapterDisplayInfo;
  globalNumber: number;
  onSelect: () => void;
  standalone?: boolean;
}) {
  const { playHover, playNavClick } = useUiSounds();
  const canSelect = chapter.status !== "locked";

  const handleSelect = () => {
    if (!canSelect) {
      return;
    }

    playNavClick();
    onSelect();
  };

  return (
    <div
      className={`storyHome__chapterCard storyHome__chapterCard--${chapter.status}${standalone ? " storyHome__chapterCard--standalone" : ""}`}
      onMouseEnter={canSelect ? playHover : undefined}
      onFocus={canSelect ? playHover : undefined}
      onClick={canSelect ? handleSelect : undefined}
      role={canSelect ? "button" : undefined}
      tabIndex={canSelect ? 0 : undefined}
      onKeyDown={
        canSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSelect();
              }
            }
          : undefined
      }
    >
      {!standalone ? (
        <div className="storyHome__chapterMeta">
          <span className="storyHome__chapterNumber">
            Chapter {globalNumber}
          </span>
          <span
            className={`storyHome__chapterStatus storyHome__chapterStatus--${chapter.status}`}
          >
            <span
              className={`storyHome__statusDot storyHome__statusDot--${chapter.status}`}
            />
            {STATUS_LABELS[chapter.status]}
          </span>
        </div>
      ) : null}
      <h4 className="storyHome__chapterTitle">
        {chapter.definition.title}
      </h4>
      {!standalone && chapter.sceneCount > 0 ? (
        <div className="storyHome__chapterScenes">
          {chapter.completedSceneCount} / {chapter.sceneCount} scenes
        </div>
      ) : null}
      {standalone ? (
        <p className="storyHome__chapterStandaloneHint">Open</p>
      ) : null}
    </div>
  );
}

export function PartGroup({
  part,
  globalOffset,
  onChapterSelect,
}: {
  part: PartDisplayInfo;
  globalOffset: number;
  onChapterSelect: (partIndex: number, chapterIndex: number) => void;
}) {
  return (
    <div className="storyHome__partGroup">
      <div className="storyHome__partHeader">
        <span className="storyHome__partNumber">
          Part {part.partIndex + 1}
        </span>
        <h3 className="storyHome__partTitle">{part.definition.title}</h3>
        <div className="storyHome__partLine" />
        <span className="storyHome__partProgress">
          {part.completedChapterCount} / {part.totalChapterCount}
        </span>
      </div>
      <div className="storyHome__chapterList">
        {part.chapters.map((chapter, ci) => (
          <ChapterCard
            key={chapter.definition.id}
            chapter={chapter}
            globalNumber={globalOffset + ci + 1}
            onSelect={() =>
              onChapterSelect(chapter.partIndex, chapter.chapterIndex)
            }
          />
        ))}
      </div>
    </div>
  );
}

function StoryOptionCard({
  title,
  actionLabel,
  imageSrc,
  imageAlt,
  unlocked,
  onSelect,
}: {
  title: string;
  actionLabel: string;
  imageSrc: string;
  imageAlt: string;
  unlocked: boolean;
  onSelect?: () => void;
}) {
  const { playHover, playNavClick } = useUiSounds();

  const handleSelect = () => {
    if (!unlocked || !onSelect) {
      return;
    }

    playNavClick();
    onSelect();
  };

  return (
    <div
      className={`storyHome__option3dWrap storyHome__option3dWrap--${unlocked ? "available" : "locked"}`}
      onMouseEnter={unlocked ? playHover : undefined}
      onFocus={unlocked ? playHover : undefined}
      onClick={unlocked ? handleSelect : undefined}
      role={unlocked ? "button" : undefined}
      tabIndex={unlocked ? 0 : undefined}
      onKeyDown={
        unlocked
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSelect();
              }
            }
          : undefined
      }
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

function UnlockablesPlaceholder() {
  return (
    <div className="storyHome__unlockables">
      <p className="storyHome__sectionLabel">Unlockables</p>
      <div className="storyHome__unlockGrid">
        <div className="storyHome__unlockSlot">
          <div className="storyHome__unlockIcon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="storyHome__unlockLabel">Memories</span>
        </div>
        <div className="storyHome__unlockSlot">
          <div className="storyHome__unlockIcon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <span className="storyHome__unlockLabel">Letters</span>
        </div>
        <div className="storyHome__unlockSlot">
          <div className="storyHome__unlockIcon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="7"/>
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
            </svg>
          </div>
          <span className="storyHome__unlockLabel">Achievements</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─── */

export default function StoryHomePage({
  onEnter,
}: StoryHomePageProps) {
  const { isReady, state } = useStory();
  const deepDiveUnlocked = false; // reserved for a future product deep dive

  const parts = useMemo(
    () => (isReady ? getPartDisplayList(state) : []),
    [isReady, state]
  );

  const visibleParts = useMemo(
    () =>
      parts
        .map((part) => {
          const visibleChapters = part.chapters
            .filter((chapter) =>
              VISIBLE_CHAPTER_IDS.includes(chapter.definition.id)
            )
            .map((chapter) => ({
              ...chapter,
              status: chapter.status === "locked" ? "available" : chapter.status,
            }));

          return {
            ...part,
            chapters: visibleChapters,
            completedChapterCount: visibleChapters.filter(
              (chapter) => chapter.status === "completed"
            ).length,
            totalChapterCount: visibleChapters.length,
          };
        })
        .filter((part) => part.chapters.length > 0),
    [parts]
  );

  const visibleChapterCount = useMemo(
    () =>
      visibleParts.reduce(
        (sum, part) => sum + part.chapters.length,
        0
      ),
    [visibleParts]
  );

  const standaloneChapter =
    visibleChapterCount === 1 ? visibleParts[0]?.chapters[0] ?? null : null;

  // Compute global chapter offsets for numbering
  const globalOffsets = useMemo(() => {
    let sum = 0;
    return visibleParts.map((part) => {
      const offset = sum;
      sum += part.totalChapterCount;
      return offset;
    });
  }, [visibleParts]);

  return (
    <CinematicShell>
      <div className="storyHome">
        {!isReady ? null : standaloneChapter ? (
          <section className="storyHome__singleChapter">
            <p className="storyHome__singleEyebrow">Cinematic Product Showcase</p>
            <div className="storyHome__dualCards">
              <StoryOptionCard
                title={standaloneChapter.definition.title}
                actionLabel="Open"
                imageSrc={redBullCyclesImage}
                imageAlt="LUME product showcase preview"
                unlocked
                onSelect={() =>
                  onEnter(standaloneChapter.partIndex, standaloneChapter.chapterIndex)
                }
              />
              <StoryOptionCard
                title="Product Deep Dive"
                actionLabel="Locked"
                imageSrc={redBullCyclesImage}
                imageAlt="Locked product deep dive preview"
                unlocked={deepDiveUnlocked}
                onSelect={undefined}
              />
            </div>
          </section>
        ) : (
          <>
            <section className="storyHome__hero">
              <h1 className="storyHome__title">LUME</h1>
              <p className="storyHome__subtitle">A cinematic product journey</p>
            </section>

            <div className="storyHome__divider" />

            <section className="storyHome__chapters">
              <p className="storyHome__sectionLabel">Your Journey</p>
              {visibleParts.map((part, pi) => (
                <PartGroup
                  key={part.definition.id}
                  part={part}
                  globalOffset={globalOffsets[pi]}
                  onChapterSelect={onEnter}
                />
              ))}
            </section>

            {isReady && hasProgress(state) && getResumeTarget(state) ? (
              <>
                <div className="storyHome__divider" />
                <UnlockablesPlaceholder />
              </>
            ) : null}

            <div className="storyHome__footer" />
          </>
        )}
      </div>
    </CinematicShell>
  );
}
