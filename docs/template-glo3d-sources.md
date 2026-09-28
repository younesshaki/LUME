# Template Glo3D — sources and licences

Every externally sourced component pattern and photograph used by Template
Glo3D. Plan: `docs/website-builder/template-glo3d-plan.md`.

## UI component patterns

Adapted (restructured to LUME's block props, theme variables and existing
behaviour), not copied wholesale. No Tailwind Plus/UI, Aceternity or Magic UI
code is used.

| Pattern | Source | Licence | Adapted in |
|---|---|---|---|
| Marketing header 1 (bar proportions, nav size, compact CTA) | [HyperUI](https://hyperui.dev/components/marketing/headers) · [repo](https://github.com/markmead/hyperui) | MIT | `src/experience/ui/TemplateGlo3D.css` (header section) |
| Marketing footer 5 (photo panel + contact/nav columns + legal bar) | [HyperUI footers](https://hyperui.dev/components/marketing/footers) | MIT | `src/components/layout/SiteFooter/SiteFooterGlo3D.tsx`, `SiteFooterGlo3D.css` |
| Marketing banner 3 (copy beside media) — hero "Split with photo" | [HyperUI banners](https://hyperui.dev/components/marketing/banners) | MIT | `src/lib/pageBuilder/components/AutomotiveHero.tsx`, `AutomotiveHero.css` |
| Jumbotron "Background image" — hero "Full-bleed photo" | [Flowbite](https://flowbite.com/docs/components/jumbotron/) · [repo](https://github.com/themesberg/flowbite) | MIT | `AutomotiveHero.tsx` / `.css` |
| Jumbotron "with form" — hero "Inventory search" | [Flowbite](https://flowbite.com/docs/components/jumbotron/) | MIT | `AutomotiveHero.tsx` / `.css` + `VehicleQuickSearch.tsx` |
| Marketing card 5 (listing card: image, price, details row) — vehicle cards | [HyperUI cards](https://hyperui.dev/components/marketing/cards) | MIT | `TemplateGlo3D.css` (inventory section) |
| Marketing section 1 (two-column image/text) — feature band | [HyperUI sections](https://hyperui.dev/components/marketing/sections) | MIT | `TemplateGlo3D.css` (feature band section) |
| Icons | [lucide-react](https://lucide.dev) (already a dependency) | ISC | throughout |

## Photography

All photos are from [Unsplash](https://unsplash.com) under the
[Unsplash License](https://unsplash.com/license): free for commercial use, no
permission or attribution required, modification allowed (not sold as-is or
compiled into a competing photo service). Each was checked on its own page as
"Free to use under the Unsplash License" (not Unsplash+). Cropped to the slot's
ratio and re-encoded as WebP at 2400px plus a `-1200.webp` sibling; served from
R2 under `templates/glo3d/` (upload: `scripts/upload-template-assets.ts`).

| R2 key (`templates/glo3d/…`) | Ratio | Photo | Photographer |
|---|---|---|---|
| `hero-showroom` | 3:2 | [bC5NNbwuoB0](https://unsplash.com/photos/bC5NNbwuoB0) — red car in a showroom | Crosby Hinze (@crosbyhinze) |
| `hero-road` | 16:9 | [ostLWBW4hsw](https://unsplash.com/photos/ostLWBW4hsw) — car on an open road | Raivis Razgals (@rraivisr) |
| `search-hero` | 21:9 | [AmFj7Xn9x_k](https://unsplash.com/photos/AmFj7Xn9x_k) — new cars in a showroom | Portafolio fotográfico automotriz (@portafoliofotograficoautomotriz) |
| `dealership-exterior` | 3:2 | [xCm3FGX8lb8](https://unsplash.com/photos/xCm3FGX8lb8) — row of cars on a lot | Sara Kurfeß (@stereophototyp) |
| `service-bay` | 3:2 | [XP8o9_Arwqg](https://unsplash.com/photos/XP8o9_Arwqg) — technician in a service bay | Dextar Studio (@dextarstudio) |
| `financing-desk` | 3:2 | [HJckKnwCXxQ](https://unsplash.com/photos/HJckKnwCXxQ) — signing paperwork | Gabrielle Henderson (@gabriellefaithhenderson) |
| `trade-in-keys` | 3:2 | [iDSsOlqFa8w](https://unsplash.com/photos/iDSsOlqFa8w) — car key handover | yahdi yasya (@yayi1077) |
| `delivery-handover` | 3:2 | [wNxbeoNUg_4](https://unsplash.com/photos/wNxbeoNUg_4) — handover at a desk | Annika Wischnewsky (@wischn) |
| `detail-interior` | 3:2 | [2gybIHnDHd8](https://unsplash.com/photos/2gybIHnDHd8) — car interior | Erik Mclean (@introspectivedsgn) |
| `detail-wheel` | 1:1 | [MZW_OCjZDSo](https://unsplash.com/photos/close-up-of-a-shiny-silver-car-wheel-with-spokes-MZW_OCjZDSo) — spoked wheel | Mathew Antony (@martuflex) |
| `detail-headlight` | 1:1 | [w8RT-3E61Ys](https://unsplash.com/photos/vehicle-headlight-w8RT-3E61Ys) — headlight | Samuel-Elias Nadler (@mrsamuelelias) |
| `team` | 3:2 | [teLAkjwtCCI](https://unsplash.com/photos/teLAkjwtCCI) — sales floor | Portafolio fotográfico automotriz (@portafoliofotograficoautomotriz) |

The optional `site-background-light` / `-dark` slots are intentionally unused:
Glo3D's site background is a flat colour.
