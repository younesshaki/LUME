import { ProgressBarCircle } from "@/components/base/progress-indicators/progress-circles";
import "./ShowcaseChapterProgress.css";

type ShowcaseChapterProgressProps = {
  value: number;
};

export function ShowcaseChapterProgress({ value }: ShowcaseChapterProgressProps) {
  return (
    <div className="showcaseChapterProgress" aria-label="Showcase chapter progress">
      <ProgressBarCircle
        size="sm"
        min={0}
        max={100}
        value={value}
        label="Showcase chapter progress"
      />
    </div>
  );
}
