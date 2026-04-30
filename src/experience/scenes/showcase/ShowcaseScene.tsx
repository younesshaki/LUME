import { Sparkles } from "@react-three/drei";

type ShowcaseSceneProps = {
  isActive?: boolean;
  activeSceneId?: string | null;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
};

export function ShowcaseScene({ isActive = true }: ShowcaseSceneProps) {
  if (!isActive) return null;

  return (
    <Sparkles count={20} size={2.2} scale={[5, 3, 4]} speed={0.25} color="#c48d7e" />
  );
}
