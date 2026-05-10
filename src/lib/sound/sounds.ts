/**
 * LUME Sound System — Layer 1: Sound Library
 *
 * Every audio file the site can play is registered here with metadata.
 * Sound keys are stable identifiers (kebab-case). Drop the audio file
 * into /public/sounds/ and reference it via the `src` field.
 *
 * To add a new sound:  add an entry below + drop the file into /public/sounds/.
 * To remove a sound:   delete the entry (and any actions referencing it).
 * To re-skin a sound:  swap its `src` to a new file. All actions inherit.
 */

import type { SoundSpec } from "./types";

export const SOUND_LIBRARY = {
  // ─── UI primitives (shared across many actions) ─────────────────────
  "click-soft": {
    src: "/sounds/ui/470451__erokia__menu-ui-click-203.wav",
    volume: 0.42,
    pitchVariation: 0.04,
    pool: 4,
  },
  "click-sharp": {
    src: "/sounds/ui/828235__cat-fox_alex__click-3.flac",
    volume: 0.5,
    pitchVariation: 0.03,
    pool: 4,
  },
  "click-firm": {
    src: "/sounds/ui/828235__cat-fox_alex__click-3.flac",
    volume: 0.65,
    pitchVariation: 0.02,
    pool: 3,
  },
  "hover": {
    src: "/sounds/ui/565131__unfa__ui_hover.flac",
    volume: 0.28,
    cooldownMs: 200,
    pool: 2,
  },
  "tab-switch": {
    src: "/sounds/ui/215415__unfa__ping.flac",
    volume: 0.34,
    cooldownMs: 120,
    pool: 2,
  },
  "approval-bell": {
    src: "/sounds/ui/625174__gabfitzgerald__ui-sound-approval-high-pitched-bell-synth.wav",
    volume: 0.42,
  },
  "submit-confirm": {
    src: "/sounds/ui/756269__joseegn__ui_sound_submit_1.wav",
    volume: 0.46,
  },

  // ─── Chat ───────────────────────────────────────────────────────────
  "chat-send": { src: "/sounds/ui/756269__joseegn__ui_sound_submit_1.wav", volume: 0.42 },
  "chat-receive": {
    src: "/sounds/chat/277033__headphaze__ui-completed-status-alert-notification-sfx001.wav",
    volume: 0.36,
  },
  "chat-copy": {
    src: "/sounds/ui/625174__gabfitzgerald__ui-sound-approval-high-pitched-bell-synth.wav",
    volume: 0.3,
  },

  // ─── Product ────────────────────────────────────────────────────────
  "product-filter-blip": {
    src: "/sounds/nav/807304__soundvariant__whoosh-1.wav",
    volume: 0.32,
    cooldownMs: 100,
  },
  "product-reveal": {
    src: "/sounds/product/277031__headphaze__ui-completed-status-alert-notification-sfx003.wav",
    volume: 0.42,
  },
  "product-hover": {
    src: "/sounds/ui/565131__unfa__ui_hover.flac",
    volume: 0.22,
    cooldownMs: 250,
    pool: 2,
  },

  // ─── Navigation ─────────────────────────────────────────────────────
  "page-transition": {
    src: "/sounds/nav/807304__soundvariant__whoosh-1.wav",
    volume: 0.34,
  },

  // ─── Showcase / cinematic ───────────────────────────────────────────
  "showcase-enter": {
    src: "/sounds/showcase/636630__cogfirestudios__soft-buildup-game-fx-deep.wav",
    volume: 0.38,
  },
  "ambient-shimmer": {
    src: "/sounds/showcase/462089__newagesoup__ethereal-woosh.wav",
    volume: 0.3,
  },
  "cinematic-logo-impact": {
    src: "/sounds/showcase/851333__newlocknew__muscstngr_cinematic-logo-designimpactbright-chord.mp3",
    volume: 0.42,
  },
} as const satisfies Record<string, SoundSpec>;

export type SoundKey = keyof typeof SOUND_LIBRARY;
