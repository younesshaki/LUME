import { play } from "@/lib/sound";

export const chatSounds = {
  hover: () => play("nav.hover"),
  open: () => play("chat.open"),
  close: () => play("chat.close"),
  reset: () => play("chat.reset"),
  send: () => play("chat.send"),
  receive: () => play("chat.receive"),
  copy: () => play("chat.copy"),
  rate: () => play("chat.rate"),
  suggestion: () => play("chat.suggestion"),
  toggleSources: () => play("chat.sources.toggle"),
};
