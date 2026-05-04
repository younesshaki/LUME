# Using Aceternity Components With shadcn

This project is already configured so `shadcn` can pull components from the
Aceternity registry.

## Registry Setup

The Aceternity registry is configured in `components.json`:

```json
"registries": {
  "@aceternity": "https://ui.aceternity.com/registry/{name}.json"
}
```

That means any Aceternity component can be requested with:

```sh
npx shadcn@latest add @aceternity/<component-name>
```

Examples:

```sh
npx shadcn@latest add @aceternity/loader-four-demo
npx shadcn@latest add @aceternity/loader-five-demo
```

## Where Components Go

Project aliases in `components.json` send UI components here:

```text
src/components/ui/
```

So a loader component should be imported like this:

```tsx
import { LoaderFive } from "@/components/ui/loader";
```

## If Aceternity Requires Auth

Some Aceternity registry items may return:

```text
Unauthorized - Please provide a valid API token or sign in
```

When that happens, the CLI cannot download that item. Use this fallback:

1. Keep the same public API the demo expects.
2. Create or update the matching local component file under `src/components/ui/`.
3. Import it using the same path shown by Aceternity docs.

For example, the demo:

```tsx
import { LoaderFive } from "@/components/ui/loader";

export function LoaderFiveDemo() {
  return <LoaderFive text="Generating chat..." />;
}
```

maps locally to:

```text
src/components/ui/loader.tsx
src/components/ui/loader.css
```

The important part is preserving this API:

```tsx
<LoaderFive text="Generating scenes..." />
```

Then the rest of the app can use the component exactly as if the CLI had
installed it.

## How To Wire A Component Into The App

1. Add the component:

```sh
npx shadcn@latest add @aceternity/<component-name>
```

2. Check the files that changed:

```sh
git status --short
git diff --stat
```

3. Import the component where it is needed:

```tsx
import { ComponentName } from "@/components/ui/component-file";
```

4. Replace the old UI while keeping surrounding app behavior intact.

Example from the Red Bull preloader:

```tsx
import { LoaderFive } from "@/components/ui/loader";

<LoaderFive className="loaderFive--preloader" text="Generating scenes..." />
```

5. Run a build check:

```sh
npm run build
```

## Sizing And Text

Prefer passing text through props:

```tsx
<LoaderFive text="Generating scenes..." />
```

Prefer sizing with a local class at the usage site:

```tsx
<LoaderFive className="loaderFive--preloader" text="Generating scenes..." />
```

Then style that usage-specific class in the nearby CSS file:

```css
.loader-variant-preload .loaderFive--preloader {
  min-height: 2.25rem;
  max-width: min(9rem, 52vw);
  font-size: clamp(0.6rem, 2.2vw, 1.08rem);
}
```

This keeps the base Aceternity component reusable while allowing each page or
loader to tune the final size.

## Notes For AI Agents

- Use `npx shadcn@latest add @aceternity/<name>` first.
- If the registry returns Unauthorized, do not keep retrying.
- Implement the component locally with the same export name and import path the
  Aceternity demo expects.
- Keep edits scoped to `src/components/ui/*` and the file where the component is
  being used.
- Always run `npm run build` after wiring the component.
