import { lazy, Suspense } from "react";

const ShowcaseChapter = lazy(() => import("./scenes/showcase"));

interface SceneManagerProps {
  scenesHidden?: boolean;
  onGoHome?: () => void;
  onShowcaseSceneChange?: (index: number) => void;
  onShowcaseProgressChange?: (progress: number) => void;
}

export default function SceneManager({
  scenesHidden = false,
  onGoHome,
  onShowcaseSceneChange,
  onShowcaseProgressChange,
}: SceneManagerProps) {
  return (
    <group visible={!scenesHidden}>
      <Suspense fallback={null}>
        <ShowcaseChapter
          isActive={!scenesHidden}
          onGoHome={onGoHome}
          onSceneChange={onShowcaseSceneChange}
          onProgressChange={onShowcaseProgressChange}
        />
      </Suspense>
    </group>
  );
}
