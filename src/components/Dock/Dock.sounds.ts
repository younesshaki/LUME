import { play, type ActionKey } from "@/lib/sound";

export const dockSounds = {
  itemHover: () => play("nav.hover"),
  itemClick: () => play("button.ghost.click"),
  adaptStart: () => play("settings.change"),
  adaptEnd: () => play("nav.hover"),
};

export function playDockNavigation(sound: ActionKey) {
  play(sound);
}
