# LUME — Aceternity UI Integration Plan

## Already Installed
- `3d-card` — used on homepage showcase cards
- `flip-words` — installed
- `hover-border-gradient` — installed
- `placeholders-and-vanish-input` — used on the login/gate screen

---

## Products Grid Page

| Component | Install Command | Effect | Priority |
|---|---|---|---|
| `focus-cards` | `npx shadcn@latest add "@aceternity/focus-cards"` | Hovering one card blurs all others | ⭐ Start here |
| `card-spotlight` | `npx shadcn@latest add "@aceternity/card-spotlight"` | Light follows mouse inside each card | High |
| `layout-grid` | `npx shadcn@latest add "@aceternity/layout-grid"` | Cards expand to fill screen on click | High |
| `direction-aware-hover` | `npx shadcn@latest add "@aceternity/direction-aware-hover"` | Card content slides in from hover direction | Medium |
| `lens` | `npx shadcn@latest add "@aceternity/lens"` | Magnifying glass on product images | Medium |

---

## Homepage

| Component | Install Command | Effect | Priority |
|---|---|---|---|
| `lamp` | `npx shadcn@latest add "@aceternity/lamp"` | Dramatic cone of light above section titles | ⭐ High |
| `tracing-beam` | `npx shadcn@latest add "@aceternity/tracing-beam"` | Vertical line traces down as you scroll | High |
| `text-generate-effect` | `npx shadcn@latest add "@aceternity/text-generate-effect"` | Text reveals character by character | High |
| `hero-parallax` | `npx shadcn@latest add "@aceternity/hero-parallax"` | Product image grid scrolls in parallax | Medium |
| `sparkles` | `npx shadcn@latest add "@aceternity/sparkles"` | Gold particles around headings | Medium |
| `evervault-card` | `npx shadcn@latest add "@aceternity/evervault-card"` | Matrix/encrypted text reveal on hover | Medium |

---

## Access / Get Access Page

| Component | Install Command | Effect | Priority |
|---|---|---|---|
| `vortex` | `npx shadcn@latest add "@aceternity/vortex"` | Particle vortex fills the background | ⭐ High |
| `background-beams` | `npx shadcn@latest add "@aceternity/background-beams"` | Subtle animated light beams on dark pages | High |
| `moving-border` | `npx shadcn@latest add "@aceternity/moving-border"` | Animated gradient traces the CTA button border | ⭐ High |

---

## Site-Wide

| Component | Install Command | Effect | Where |
|---|---|---|---|
| `following-pointer` | `npx shadcn@latest add "@aceternity/following-pointer"` | Custom cursor that follows the mouse | Global — signals premium immediately |
| `spotlight` | `npx shadcn@latest add "@aceternity/spotlight"` | Spotlight follows mouse on dark pages | Any full-dark section |
| `shooting-stars` | `npx shadcn@latest add "@aceternity/shooting-stars"` | Subtle shooting stars in the background | Page backgrounds |

---

## Recommended Implementation Order

1. **`focus-cards`** — products grid, highest visual impact
2. **`lamp`** — homepage section headers
3. **`moving-border`** — "Request Access" CTA button
4. **`text-generate-effect`** — LUME headline on the access page
5. **`vortex`** — access page background
6. **`tracing-beam`** — homepage scroll experience
7. **`following-pointer`** — site-wide custom cursor
