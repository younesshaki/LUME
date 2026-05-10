import { Check, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSound } from "../../lib/sound";
import type { ShowcaseVideoQuality } from "../scenes/showcase/data/sceneAssets";
import "./MediaQualitySettings.css";

type MediaQualitySettingsProps = {
  quality: ShowcaseVideoQuality;
  visible: boolean;
  onQualityChange: (quality: ShowcaseVideoQuality) => void;
  belowHeader?: boolean;
};

const options: Array<{
  value: ShowcaseVideoQuality;
  label: string;
  note: string;
}> = [
  {
    value: "high",
    label: "High quality",
    note: "Original videos",
  },
  {
    value: "normal",
    label: "Normal quality",
    note: "Faster loading",
  },
];

export function MediaQualitySettings({
  quality,
  visible,
  onQualityChange,
  belowHeader = false,
}: MediaQualitySettingsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { play } = useSound();

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!visible) return null;

  return (
    <div ref={rootRef} className={`mediaQualitySettings${belowHeader ? " mediaQualitySettings--belowHeader" : ""}`}>
      <button
        className="mediaQualitySettings__trigger"
        type="button"
        aria-label="Open video quality settings"
        aria-expanded={open}
        onMouseEnter={() => play("nav.hover")}
        onClick={() => {
          play("settings.open");
          setOpen((value) => !value);
        }}
      >
        <Settings aria-hidden="true" size={18} strokeWidth={2.2} />
      </button>

      {open ? (
        <div className="mediaQualitySettings__menu" role="menu">
          {options.map((option) => {
            const selected = quality === option.value;

            return (
              <button
                key={option.value}
                className="mediaQualitySettings__option"
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onMouseEnter={() => play("nav.hover")}
                onClick={() => {
                  play("settings.change");
                  onQualityChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="mediaQualitySettings__optionText">
                  <span className="mediaQualitySettings__label">{option.label}</span>
                  <span className="mediaQualitySettings__note">{option.note}</span>
                </span>
                <span
                  className="mediaQualitySettings__check"
                  aria-hidden="true"
                  data-selected={selected ? "true" : "false"}
                >
                  {selected ? <Check size={15} strokeWidth={2.4} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
