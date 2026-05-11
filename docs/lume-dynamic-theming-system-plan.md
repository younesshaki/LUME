# LUME Dynamic Theming & Component Control System

**Status:** Planned  
**Estimated implementation time:** 1 day (with parallel Claude agents, full autonomy)  
**Last updated:** 2026-05-10

---

## Overview

A system that allows an admin to modify any visual aspect of the LUME website — components, colors, layouts, typography — either through a natural language chatbot or a minimal admin control panel. Changes persist to Supabase and apply on next page load for all visitors.

This is not a RAG system. It is an **agentic tool-calling system** where the LLM maps natural language intent to a predefined action space (variant switches, token updates, structural mutations). RAG is not needed because there is nothing to retrieve — the LLM is given a schema of what is controllable and executes against it.

---

## Prior Art

Other companies that have implemented comparable systems:

- **Webflow AI** — natural language maps to their internal component schema
- **Framer AI** — prompt-driven component prop rewrites
- **Builder.io** — AI edits a visual component tree via chat
- **Vercel v0** — full component generation and swapping from prompts
- **Shopify Sidekick** — storefront theme/section changes via admin chat
- **Salesforce Einstein** — CRM UI layout control via natural language

None use RAG. All use structured tool-calling against a controlled schema.

---

## Architecture

```
Admin input (chatbot or UI)
  → Intent detection (DeepSeek V3 API / Claude / Ollama fallback)
  → Tool call resolved against Component Registry + Token Registry
  → Mutation applied to Runtime Config (React context)
  → Config persisted to Supabase
  → Site reflects change immediately for admin, on next load for visitors
```

### Key layers

| Layer | What it does |
|---|---|
| **Component Registry** | Maps every controllable component to its named variants |
| **Token Registry** | Maps every design token (color, spacing, typography) to its current value |
| **Tool-calling layer** | LLM receives registry as schema, outputs structured function calls |
| **Runtime Config** | React context that holds the active variant/token state |
| **Persistence layer** | Supabase table storing the current published config |
| **Admin UI** | Manual control panel as an alternative to chatbot input |

---

## Implementation Phases

### Phase 1 — Variant System + Tool-calling (2–3 hours)

Build named variants for every major component and wire the chatbot to switch between them.

**Deliverables:**
- `server/theming/componentRegistry.ts` — maps component names to variant definitions
- 5 variants per major component:
  - Header (minimal, bold, transparent, dark, cinematic)
  - Color theme (obsidian, gold, arctic, ember, midnight)
  - Layout density (compact, default, spacious)
  - Vehicles page (grid, list, cinematic-cards, data-dense, editorial)
  - Showcase (immersive, guided, autoplay, chapters, silent)
- `server/theming/tools.ts` — LLM tool definitions (`switch_variant`, `list_variants`, `describe_variant`)
- Extended `OllamaChat` with tool-calling support
- DeepSeek V3 API as primary LLM, Ollama as local fallback
- Runtime-only switching (no persistence yet)

**Example interactions:**
```
"Switch the header to minimal"         → switch_variant({ component: "header", variant: "minimal" })
"Show me the available color themes"   → list_variants({ component: "color-theme" })
"Make the vehicles page more editorial"→ switch_variant({ component: "vehicles", variant: "editorial" })
```

---

### Phase 2 — Supabase Persistence (1–2 hours)

Changes survive page refresh and apply site-wide.

**Deliverables:**
- `supabase/migrations/012_theming_config.sql` — `site_config` table with JSONB config column, admin-only RLS
- `server/theming/configService.ts` — read/write active config
- App loads config from Supabase on startup, falls back to defaults if none set
- `publish` and `revert` commands exposed to the chatbot
- Config history (last 10 states) stored for rollback

**Supabase schema:**
```sql
create table site_config (
  id          uuid primary key default gen_random_uuid(),
  config      jsonb not null,
  published   boolean default false,
  created_at  timestamptz default now(),
  created_by  uuid references auth.users
);
```

---

### Phase 3 — Design Token System (3–5 hours, parallel with Phase 2)

Every color, spacing value, border radius, and typography setting becomes individually addressable.

**Deliverables:**
- Full audit of all CSS variables and Tailwind classes across the codebase
- `src/theming/tokens.ts` — typed token registry (color, spacing, typography, radius, shadow)
- CSS variable injection layer — tokens written to `:root` at runtime
- LLM tool: `update_token({ token: "color.accent", value: "#C9A84C" })`
- LLM tool: `update_token_group({ group: "colors", values: { accent: "...", background: "..." } })`
- Validation layer — rejects values that would break contrast ratios or accessibility thresholds
- Token changes compose with variant switches (variant sets a baseline, tokens override individual values)

**Token categories:**
```
color.background       color.surface          color.border
color.text.primary     color.text.secondary   color.text.muted
color.accent           color.accent.hover     color.accent.muted
spacing.xs → spacing.2xl
typography.size.sm → typography.size.2xl
typography.weight.*    typography.tracking.*
radius.sm → radius.full
shadow.sm → shadow.2xl
```

---

### Phase 4 — Structural Editing (4–8 hours)

Add, remove, reorder, and modify content sections.

**Deliverables:**
- `src/theming/componentGraph.ts` — directed graph of every renderable section
- LLM tools: `add_section`, `remove_section`, `reorder_sections`, `update_copy`
- Structural changes are staged (not live) until explicitly published
- Admin sees a diff of pending structural changes before publishing
- Rollback to any previous published state in one command

**Scope of structural edits:**
- Toggle entire page sections (e.g. hide the footer, show/hide invitation CTA)
- Reorder homepage sections
- Update text copy on any labeled text node
- Show/hide nav items
- Enable/disable features (chatbot, sound system, media quality toggle)

**Out of scope for Phase 4:**
- Adding entirely new components that don't exist in the codebase
- Modifying the cinematic 3D experience scenes (separate system, too high risk)
- Changing routing structure

---

### Phase 5 — Admin Control Panel UI (4–6 hours, parallel with Phase 4)

A minimal protected UI as an alternative to chatbot commands.

**Route:** `/admin` (already exists, will be extended)

**Panels:**

1. **Component Browser**
   - Lists every registered component
   - Click → see variants as labeled cards with live preview thumbnails
   - One-click to apply

2. **Token Editor**
   - Color swatches for every color token (click to open color picker)
   - Sliders for spacing and typography scale
   - Live preview of changes before publishing

3. **Structure Editor**
   - Toggle switches for every optional section
   - Drag-to-reorder for orderable sections
   - Inline text editing for labeled copy nodes

4. **Config History**
   - List of last 10 published configs with timestamps
   - One-click rollback to any previous state
   - Diff view between current and any historical state

5. **Chatbot panel**
   - The existing OllamaChat, now aware of the full admin action space
   - Stays as the primary interface; the UI panels are an alternative

**Tech:** All panels built with existing shadcn components already in the codebase. No new UI libraries. Minimal styling — functional over beautiful.

---

## Parallel Agent Execution Plan

With full autonomy and parallel Claude agents:

```
Hour 0–3    Agent A: Component registry + variant definitions (Phase 1)
            Agent B: Design token audit + token registry (Phase 3 start)
            Agent C: Supabase schema + persistence layer (Phase 2)

Hour 3–6    Agent A: Tool-calling layer + OllamaChat extension
            Agent B: Token runtime injection + CSS variable system
            Agent C: Config history + rollback

Hour 6–10   Agent A: Structural editing (Phase 4)
            Agent B: Admin UI panels (Phase 5)
            Agent C: Integration, testing, deployment

Hour 10–12  All agents: Integration pass, smoke testing, deploy
```

**Total wall-clock: ~12 hours**

---

## LLM Strategy

| Use case | Model | Why |
|---|---|---|
| Variant switching (simple intent) | Ollama local (Llama 3.2) | Fast, free, no latency |
| Token updates (structured output) | DeepSeek V3 API | Strong structured output, cheap |
| Structural edits (complex reasoning) | Claude API | Most reliable for multi-step tool-calling |
| Fallback chain | Local → DeepSeek → Claude | Cost-optimized with quality floor |

---

## What Is and Isn't Controllable

**Controllable:**
- All non-cinematic UI components (header, footer, nav, all pages)
- Every design token (colors, spacing, typography)
- Feature flags (sound, chatbot, quality toggle, invitation CTA)
- Text copy on labeled nodes
- Section visibility and order

**Not controllable (by design):**
- The cinematic 3D WebGL experience scenes — too high risk, separate system
- Authentication and security config
- R2/Supabase connection settings
- The vehicle CSV data source

---

## Risks

| Risk | Mitigation |
|---|---|
| LLM produces invalid token values | Validation layer rejects out-of-range values before applying |
| Structural edit breaks a page | Changes are staged, not live, until explicitly published |
| Accidental destructive prompt | Confirmation required for removes and structural changes |
| Config corruption | Last 10 states stored; one-command rollback |
| Cinematic UX regressions | Cinematic experience explicitly excluded from controllable scope |

---

## Success Criteria

The system is complete when:

- Admin can say "switch the header to minimal and make the accent color warmer" and the site updates
- Admin can open the control panel, browse variants visually, and apply one with a click
- Changes persist across deploys and page loads
- Any change can be rolled back to a previous state in under 10 seconds
- The cinematic experience is completely unaffected by any theming operation
- Production build passes with no regressions

---

## Decision Log

- **Tool-calling over RAG:** RAG is for retrieval. This system needs execution. The LLM acts as an intent parser, not a knowledge retriever.
- **Supabase over file-based config:** Config stored in Supabase because it changes independently of code deploys and needs to be writable at runtime.
- **DeepSeek V3 over GPT-4o:** Comparable tool-calling quality at significantly lower cost. Claude as fallback for complex structural operations.
- **Variants over open-ended generation:** Open-ended CSS generation is flaky. Named variants are robust, predictable, and easy to test.
- **Existing `/admin` route:** LUME already has an admin page and admin auth. Extending it is faster and less risky than a separate admin app.
