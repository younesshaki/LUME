# LUME — Git Worktree Setup (Multi-Branch Dev)

## Why

Allows two branches to run simultaneously in separate directories, each with its own
dev server and port. Safe for parallel work (e.g. Codex on one terminal, feature work
on another) — no stashing, no branch switching, no bleed between sessions.

## Setup

Run once from the LUME root:

```bash
git worktree add ../LUME-aceternity aceternity-updates
```

## Workflow

| Directory | Branch | Start Command | URL |
|---|---|---|---|
| `~/Documents/LUME` | `codex-max` | `npm run dev` | http://localhost:5173 |
| `~/Documents/LUME-chatbot-design` | `5-may` / feature worktree | `npm run dev -- --host 127.0.0.1 --port 5175` | http://localhost:5175 |

Open a terminal in each directory and run its start command. Both share the same
`.git` history — commits on either side are immediately visible to the other.

## Teardown

When the `aceternity-updates` branch is merged and no longer needed:

```bash
git worktree remove ../LUME-aceternity
```

## Notes

- Never check out `aceternity-updates` inside the main `LUME` directory while the
  worktree exists — git will block it.
- The `node_modules` in each directory are independent. Run `npm install` in the
  worktree directory after creating it if dependencies differ between branches.
- `.env.local` is not shared — copy it manually into `../LUME-aceternity` if needed.
