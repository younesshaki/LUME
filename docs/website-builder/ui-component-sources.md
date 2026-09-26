# Free UI Component Sources for LUME (Headers, Footers, Sections)

- **Date:** 2026-09-26
- **Purpose:** where to get free, license-safe UI components, and new header
  and footer designs in particular, plus the MCP tooling that lets Claude Code
  and Codex browse and install them.

## Why this is easy for LUME

The public site is already a shadcn project:

- `components.json` exists, with the `base-nova` style (shadcn on **Base UI**),
  Tailwind CSS v4 and lucide icons.
- `src/components/ui/` already holds Aceternity and Magic UI pieces.

So anything from a **shadcn-compatible registry** installs with one command
(`npx shadcn@latest add @registry/item`) and uses our Tailwind tokens.
Registries built on Base UI, such as 7ovr and coss, match our style most
directly.

## MCP servers

**Available in our sessions today:**

| MCP / tool | Useful for components? | Notes |
|---|---|---|
| Vercel plugin (shadcn skill, v0 import) | Yes | Guidance for installing, composing and theming shadcn; can import a Claude design from a URL. |
| Supabase, Notion, Atlassian, Google Drive/Gmail/Calendar, Cloudflare, filesystem | No | Unrelated to UI components. |
| Canva | Design only | Mockups and brand assets, not code. |
| Unreal, Unity | No | Game engines. The Unreal server currently fails to connect anyway. |
| **shadcn MCP** | **Not installed. Recommended.** | See below. |

Codex's `~/.codex/config.toml` has only the Unreal and Unity servers.

**Recommended: the official shadcn MCP server** (free).

- **What it does:** lets the agent search, browse and install from the default
  shadcn registry and from **all 382 registries** in the official index
  (`https://ui.shadcn.com/r/registries.json`) by name, using the
  `@namespace/item` syntax.
- **Claude Code:** run `npx shadcn@latest mcp init --client claude` at the repo
  root (it writes the project's `.mcp.json`), then restart Claude Code and
  check `/mcp`. The repo already has a `.mcp.json` (with `supabase-staging`), so
  review the diff.
- **Codex:** add this to `~/.codex/config.toml`:
  ```toml
  [mcp_servers.shadcn]
  command = "npx"
  args = ["shadcn@latest", "mcp"]
  ```
- **Registries that need it:** a registry that isn't in the built-in index, or
  a private one, goes under `"registries"` in `components.json`, for example
  `"@acme": "https://registry.acme.com/{name}.json"`.

**Other MCPs, optional:**

- **Magic UI MCP** (`@magicuidesign/mcp`): free, but Magic UI has **no** header
  or footer items (checked: 250 items, none). Useful for effects only.
- **21st.dev Magic:** generates components from prompts. There's a free tier
  with an API key, and output quality varies. Treat it as inspiration, not
  source.
- **Shadcnblocks MCP:** mostly paid Pro content.

## Where the free headers and footers are

Checked on 2026-09-26 by downloading each registry's index and one header and
one footer item without an account. HTTP 200 with source means free; 401 means
an account or payment is required.

| Registry | License | Headers / footers | Free download? | Fit for LUME |
|---|---|---|---|---|
| **7ovr** `@7ovr` | **MIT-0** (free blocks: commercial use, no attribution) | 18 (e.g. `header-1`…`header-14`, `footer-1`…`footer-4`) | **Yes** (`header-1`, `footer-2`: 200) | **Best fit.** Built on Base UI, like our `base-nova` style. Depends on `@base-ui/react`. |
| **Efferd** `@efferd` | Mixed: a free set plus a paid pack | 28 (`header-1`…`header-12`, `footer-1`…`footer-10`) | **Yes** for the free ones (`footer-3`: 200). Check each item. | Good. Uses `motion`, already a dependency. |
| **Aceternity** `@aceternity` | Free core. Pro is proprietary. | 16 (`resizable-navbar`, `floating-navbar`, `navbar-menu`…; footers mostly Pro) | Navbars **yes** (`resizable-navbar`: 200); `footer-with-grid` **no** (401, Pro) | Good for animated navbars; already in the codebase. |
| **Tailark** `@tailark` | **MIT** (GitHub `tailark/blocks`) | 15 (`header-4/5/8`…, `footer-1`…`footer-5`) | Registry **no** (401). Source is free on GitHub. | Good marketing designs; copy from GitHub, not the CLI. |
| **Launch UI** `@launchui` | Free version (MIT) | `navbar`, `footer` | **Yes** (200) | Weaker fit: Radix and `next-themes` (Next.js-specific) dependencies. |
| **Kokonut UI** `@kokonutui` | Free | `morphic-navbar` | Not checked | One animated navbar. |
| Others to look at | Varies | Marketing sections | Not checked | `@nusaiba` (base-nova motion marketing blocks, including footers), `@blockus`, `@beste-ui`, `@hextaui`, `@reui` (1,000+ free patterns), `@coss` (Base UI), `@shadcn-studio`, `@solaceui`, `@initium`. |

Galleries to browse before installing: [7ovr.com/blocks](https://7ovr.com/blocks),
[efferd.com/blocks](https://efferd.com/blocks),
[ui.aceternity.com/components](https://ui.aceternity.com/components),
[tailark.com](https://tailark.com) and
[github.com/tailark/blocks](https://github.com/tailark/blocks).

## How to bring one in without breaking the builder

LUME's header and footer aren't free-standing components. They are
**config-driven variants** rendered by `SiteHeader` and `SiteFooter` from tenant
theme data. The header uses tenant nav items, the measured More menu, calls to
action and the visitor tab. A new design therefore becomes a **new named
variant**, not a dropped-in file:

1. **Pick** from a gallery and check that the item's license is free
   (MIT/MIT-0) and that it downloads without an account.
2. **Install into a scratch folder**, not over our files:
   `npx shadcn@latest add @7ovr/header-3 --path src/components/ui/_incoming`.
   Read its dependencies first. Base UI and `motion` are fine; `next-themes` or
   any `next/*` import is not, because the public site is Vite.
3. **Port** the visual structure into a new variant:
   - extend `TenantHeaderVariant` / `TenantFooterVariant` in
     `packages/types/src/tenantTheme.ts`;
   - add its grid tracks in `SiteHeader`;
   - feed it the existing nav data, overflow menu and theme tokens.

   Keep the rule that every header variant is a three-track grid, so the
   overlap fix holds.
4. **Test it** with the same 1/6/10-item × viewport matrix as the other
   variants, plus the pure-function fit test. Expose it in the admin website
   settings picker.
5. **Record provenance** in a comment at the top of the variant: source
   registry, item and license. Delete the scratch copy.

## Suggested next sprint (after the demo)

- **New header variants:** two, e.g. a "floating pill" (Aceternity
  `resizable-navbar` style) and a "mega-menu" (7ovr), for dealerships with many
  pages.
- **New footer variants:** two, e.g. a "big wordmark" and a "dealer info"
  footer with hours, map link and departments (7ovr or Efferd `footer-*`).
- **Setup:** install the shadcn MCP for both agents first, so they can browse
  and preview before porting.

## Sources

- shadcn MCP server: https://ui.shadcn.com/docs/mcp
- shadcn registry index (382 registries): https://ui.shadcn.com/r/registries.json
- Tailark license (MIT): https://github.com/tailark/blocks/blob/main/LICENCE.md
- 7ovr (MIT-0 free blocks): https://7ovr.com/
- Efferd: https://efferd.com/blocks
- Aceternity UI license: https://ui.aceternity.com/licence
- Block-library overview: https://adminlte.io/blog/shadcn-ui-block-libraries/
