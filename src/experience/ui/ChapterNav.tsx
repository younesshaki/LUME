import { useEffect, useMemo, useRef, useState } from "react";
import { useUiSounds } from "../audio/useUiSounds";
import type { Part } from "../parts";
import "./ChapterNav.css";

interface ChapterNavProps {
  parts: Part[];
  activePartIndex: number;
  activeChapterIndex: number;
  onSelectionChange: (partIndex: number, chapterIndex: number) => void;
  onGoHome?: () => void;
}

function FancyButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { playHover, playNavClick } = useUiSounds();

  const handleClick = () => {
    if (disabled) {
      return;
    }

    playNavClick();
    onClick();
  };

  return (
    <button
      type="button"
      className="button"
      onMouseEnter={disabled ? undefined : playHover}
      onFocus={disabled ? undefined : playHover}
      onClick={handleClick}
      disabled={disabled}
    >
      <span className="fold" />

      <div className="points_wrapper" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <i key={i} className="point" />
        ))}
      </div>

      <span className="inner">
        <svg
          className="icon"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          aria-hidden="true"
          focusable="false"
        >
          <polyline points="13.18 1.37 13.18 9.64 21.45 9.64 10.82 22.63 10.82 14.36 2.55 14.36 13.18 1.37" />
        </svg>
        {label}
      </span>
    </button>
  );
}

type SelectOption = {
  label: string;
  value: number;
};

function ChapterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  options: SelectOption[];
  onChange: (nextValue: number) => void;
  disabled?: boolean;
}) {
  const { playHover, playNavClick } = useUiSounds();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const handleToggle = () => {
    if (disabled) return;
    playNavClick();
    setOpen((prev) => !prev);
  };

  return (
    <label className="chapterNavLabel">
      <span className="chapterNavLabelText">{label}</span>
      <span
        ref={wrapRef}
        className={`chapterNavSelectWrap${open ? " isOpen" : ""}${disabled ? " isDisabled" : ""}`}
      >
        <button
          type="button"
          className="chapterNavSelectButton"
          onMouseEnter={disabled ? undefined : playHover}
          onFocus={disabled ? undefined : playHover}
          onClick={handleToggle}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
        >
          <span className="chapterNavSelectValue">{selected?.label ?? "Select"}</span>
          <svg
            className="chapterNavSelectChevron"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div className="chapterNavSelectMenu" role="listbox" aria-label={label}>
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`chapterNavSelectOption${isSelected ? " isSelected" : ""}`}
                  onMouseEnter={playHover}
                  onFocus={playHover}
                  onClick={() => {
                    playNavClick();
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </span>
    </label>
  );
}

export default function ChapterNav({
  parts,
  activePartIndex,
  activeChapterIndex,
  onSelectionChange,
  onGoHome,
}: ChapterNavProps) {
  const [isHidden, setIsHidden] = useState(false);
  const activePart = parts[activePartIndex];
  const activeChapter = activePart?.chapters[activeChapterIndex];
  const activeChapters = activePart?.chapters ?? [];
  const shouldHideForShowcase = activePartIndex === 6 && activeChapterIndex === 0 && activeChapter?.title === "Showcase";
  const chapterOffsets = useMemo(() => {
    let sum = 0;
    return parts.map((part) => {
      const offset = sum;
      sum += part.chapters.length;
      return offset;
    });
  }, [parts]);
  const getGlobalChapterNumber = (partIndex: number, chapterIndex: number) =>
    (chapterOffsets[partIndex] ?? 0) + chapterIndex + 1;
  const canPrevPart = activePartIndex > 0;
  const canNextPart = activePartIndex < parts.length - 1;
  const canPrevChapter = activeChapterIndex > 0;
  const canNextChapter = activeChapterIndex < activeChapters.length - 1;

  useEffect(() => {
    if (shouldHideForShowcase) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "h") {
        return;
      }
      setIsHidden((prev) => !prev);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [shouldHideForShowcase]);

  if (shouldHideForShowcase) {
    return null;
  }

  return (
    <div className={`chapterNav${isHidden ? " chapterNav--hidden" : ""}`}>
      {onGoHome && (
        <FancyButton label="Home" onClick={onGoHome} />
      )}
      <div className="chapterNavButtonRow">
        <FancyButton
          label="Prev Part"
          disabled={!canPrevPart}
          onClick={() => onSelectionChange(activePartIndex - 1, 0)}
        />
        <FancyButton
          label="Next Part"
          disabled={!canNextPart}
          onClick={() => onSelectionChange(activePartIndex + 1, 0)}
        />
      </div>

      <ChapterSelect
        label="Part"
        value={activePartIndex}
        options={parts.map((part, index) => ({
          value: index,
          label: `Part ${index + 1}: ${part.title}`,
        }))}
        onChange={(nextPart) => onSelectionChange(nextPart, 0)}
      />

      <div className="chapterNavButtonRow">
        <FancyButton
          label="Prev Chapter"
          disabled={!canPrevChapter}
          onClick={() => onSelectionChange(activePartIndex, activeChapterIndex - 1)}
        />
        <FancyButton
          label="Next Chapter"
          disabled={!canNextChapter}
          onClick={() => onSelectionChange(activePartIndex, activeChapterIndex + 1)}
        />
      </div>

      <ChapterSelect
        label="Chapter"
        value={activeChapterIndex}
        options={activeChapters.map((chapter, index) => ({
          value: index,
          label: `Chapter ${getGlobalChapterNumber(activePartIndex, index)}: ${chapter.title}`,
        }))}
        onChange={(nextChapter) => onSelectionChange(activePartIndex, nextChapter)}
        disabled={activeChapters.length === 0}
      />
    </div>
  );
}
