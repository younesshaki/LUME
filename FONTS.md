# Font Inventory

All project font assets live in `src/experience/assets/fonts`.

## Asset Structure

```text
src/experience/assets/fonts/
  higher-jump/
    Higher Jump.ttf
    READ ME.txt
  mileast/
    Mileast.otf
    NOTE  !!!!.txt
  montserrat/
    Montserrat-*.otf
    Montserrat-*.ttf
    OFL.txt
  moralana/
    Moralana DEMO.otf
    1001fonts-moralana-eula.txt
```

## Fonts In Use

| Font | Loaded from | Defined in | Used by |
| --- | --- | --- | --- |
| Moralana | `src/experience/assets/fonts/moralana/Moralana DEMO.otf` | `src/experience/scenes/shared/sceneFonts.css` | Global experience body text through `--experience-font-family`; product page title/card display text; story home display text; contact page display text; login screen title; showcase title card; loader text that uses `var(--experience-font-family)`; fallback scene font through `--scene-font-moralana`. |
| Higher Jump | `src/experience/assets/fonts/higher-jump/Higher Jump.ttf` | `src/experience/scenes/shared/sceneFonts.css` | Showcase narrative/scene typography through `--scene-font-family`; showcase mode overrides in `Showcase.css`; product choice hero/title text in `ProductChoiceScene.css`; `sceneTypography.ts` constants. |
| Mileast | `src/experience/assets/fonts/mileast/Mileast.otf` | `src/index.css` | App back button; media quality settings; preloader labels and counters; any element explicitly using `"Mileast", var(--experience-font-family)`. |
| Montserrat | `src/experience/assets/fonts/montserrat/Montserrat-Regular.otf`, `Montserrat-Light.otf` | `src/experience/ui/ProductsPage.css` | Products page category tab navbar only: `.luxuryTabs` and its tab labels. Current tab label style is `300 normal` using `Montserrat-Light.otf`. |

## Available But Not Currently Loaded

Montserrat includes additional `.otf` and `.ttf` weights/styles in `src/experience/assets/fonts/montserrat`, including Thin, ExtraLight, Medium, SemiBold, Bold, ExtraBold, Black, and italic variants. Only Regular `400` and Light `300 normal` are currently declared with `@font-face`.

## Non-Asset Font References

| Font reference | Location | Notes |
| --- | --- | --- |
| Instrument Serif | `src/components/chat/OllamaChat.css` | Referenced as a preferred font in `--lc-font-family`, but no local font file is present in this repo. It falls back to Georgia/serif unless loaded externally. |
| System UI stack | `src/experience/ui/AdminPage.css` | Uses native system fonts only. |

## Maintenance Notes

- Add new font files under `src/experience/assets/fonts/<font-name>/`.
- Keep licenses/readme files beside the font files.
- Define `@font-face` close to the CSS area that owns the font if the font is scoped to one feature.
- Define shared experience or scene fonts in `src/experience/scenes/shared/sceneFonts.css`.
- Update this file whenever a font is added, removed, or assigned to new UI elements.
