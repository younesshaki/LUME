import { lazy, Suspense } from "react";

const ShowcaseChapter = lazy(() => import("./scenes/showcase"));

interface SceneManagerProps {
  scenesHidden?: boolean;
  showcaseChapterId?: string | null;
  onGoHome?: () => void;
  onShowcaseSceneChange?: (index: number) => void;
  onShowcaseProgressChange?: (progress: number) => void;
}

export default function SceneManager({
  scenesHidden = false,
  showcaseChapterId,
  onGoHome,
  onShowcaseSceneChange,
  onShowcaseProgressChange,
}: SceneManagerProps) {
  return (
    <group visible={!scenesHidden}>
      <Suspense fallback={null}>
        <ShowcaseChapter
          isActive={!scenesHidden}
          chapterId={showcaseChapterId}
          onGoHome={onGoHome}
          onSceneChange={onShowcaseSceneChange}
          onProgressChange={onShowcaseProgressChange}
        />
      </Suspense>
    </group>
  );
}
