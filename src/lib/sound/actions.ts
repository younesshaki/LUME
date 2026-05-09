/**
 * LUME Sound System — Layer 2: Action Registry
 *
 * Maps every named action in the site to the sound(s) that play.
 * This is the file you edit most. Components fire action keys
 * (strings like "navbar.tab.click") — never sound keys directly.
 *
 * Three forms an action can take:
 *   "click-sharp"                         → play one sound
 *   ["click-sharp", { sound: "x", delay: 150 }]  → sequence
 *   { pool: ["click-1", "click-2"] }      → random pick from a pool
 *   null                                  → explicitly silent
 *
 * Layered (parallel) sounds: add `layer: true` to a step.
 *   ["page-transition", { sound: "shimmer", layer: true }]
 */

import type { ActionSpec } from "./types";
import type { SoundKey } from "./sounds";

type Action = ActionSpec<SoundKey>;

export const ACTION_REGISTRY = {
  // ─── Navbar ─────────────────────────────────────────────────────────
  "navbar.tab.hover":  "hover",
  "navbar.tab.click":  "click-sharp",
  "navbar.tab.switch": "tab-switch",
  "navbar.logo.click": "click-firm",

  // ─── Products ───────────────────────────────────────────────────────
  "product.card.hover": "product-hover",
  "product.card.click": [
    "click-sharp",
    { sound: "product-reveal", delay: 150 },
  ],
  "product.filter.click": "product-filter-blip",
  "product.detail.back": "page-transition",
  "product.detail.showcase": "showcase-confirmation",

  // ─── Chat ───────────────────────────────────────────────────────────
  "chat.open":       "click-sharp",
  "chat.close":      "click-soft",
  "chat.send":       "chat-send",
  "chat.receive":    "chat-receive",
  "chat.copy":       "chat-copy",
  "chat.sources.toggle": "click-soft",
  "chat.suggestion": "product-filter-blip",
  "chat.rate":       "approval-bell",
  "chat.reset":      "click-firm",

  // ─── Page navigation ────────────────────────────────────────────────
  "nav.toHome":     "page-transition",
  "nav.toProducts": "page-transition",
  "nav.toVehicles": "page-transition",
  "nav.toShowcase": "page-transition",
  "nav.toContact":  "page-transition",
  "nav.back":       "click-soft",
  "nav.hover":      "hover",

  // ─── Entry gate / settings / admin ──────────────────────────────────
  "gate.submit": "submit-confirm",
  "gate.start": "cinematic-logo-impact",
  "settings.open": "click-soft",
  "settings.change": "approval-bell",
  "admin.exit": "page-transition",
  "admin.filter.clear": "click-soft",
  "admin.profile.select": "product-filter-blip",

  // ─── Showcase / cinematic ───────────────────────────────────────────
  "showcase.card.hover": "product-hover",
  "showcase.card.open": [
    "showcase-confirmation",
    { sound: "ambient-shimmer", delay: 120, layer: true },
  ],
  "showcase.title.play": "cinematic-logo-impact",
  "showcase.enter": [
    "showcase-enter",
    { sound: "ambient-shimmer", layer: true },
    { sound: "cinematic-logo-impact", delay: 260, layer: true },
  ],

  // ─── Chapter controls ────────────────────────────────────────────────
  "chapter.nav.hover": "hover",
  "chapter.nav.click": "click-sharp",
  "chapter.select.open": "click-soft",
  "chapter.select.choose": "product-filter-blip",

  // ─── Generic primitives (cheap defaults) ────────────────────────────
  "button.primary.click":   "submit-confirm",
  "button.secondary.click": "click-sharp",
  "button.ghost.click":     "click-soft",

  // ─── Explicitly silent (kept for clarity, easy to unmute later) ─────
  "form.input.focus":  null,
  "form.input.change": null,
} as const satisfies Record<string, Action>;

export type ActionKey = keyof typeof ACTION_REGISTRY;
