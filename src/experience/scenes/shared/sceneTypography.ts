export const MORALANA_SCENE_FONT_FAMILY = '"Moralana", Georgia, "Times New Roman", serif';
export const HIGHER_JUMP_SCENE_FONT_FAMILY = '"Higher Jump", Georgia, "Times New Roman", serif';
export const SCENE_FONT_FAMILY = HIGHER_JUMP_SCENE_FONT_FAMILY;

export function getShowcaseSceneFontFamily(sceneIndex: number): string {
  return sceneIndex >= 0 && sceneIndex < 8
    ? MORALANA_SCENE_FONT_FAMILY
    : HIGHER_JUMP_SCENE_FONT_FAMILY;
}
