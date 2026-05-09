# Learning JavaScript With LUME

Welcome. This file teaches JavaScript from zero by using code that already exists in this project.

LUME is a cinematic React/Vite app for a fictional invitation-only luxury hotel in Monaco. It has screens, products, sounds, story progress, CDN images, and a 3D showcase. That means you can learn JavaScript with examples that feel alive: clicking product cards, filtering categories, playing sounds, choosing screens, and loading media.

The project uses TypeScript, which is JavaScript with extra labels that describe what values should look like. In this guide, focus on the JavaScript ideas first. When you see things like `: string`, `type Product`, or `<ProductCard />`, I will explain them gently.

## How To Use This Guide

Read one chapter at a time. After each chapter, open the referenced project file and try the tiny challenge.

Useful commands:

```bash
npm run dev
npm run typecheck
npm run test
```

Important files we will visit:

- `src/App.tsx`: the app's main screen controller.
- `src/experience/ui/ProductsPage.tsx`: the product page, product cards, filters, clicks, and hover behavior.
- `src/experience/products/catalog.ts`: product data helpers.
- `src/config/cdn.ts`: helper functions for media URLs.
- `src/lib/sound/actions.ts`: maps action names to sound effects.
- `src/lib/sound/useSound.ts`: a custom React hook for playing sounds.
- `src/experience/story/selectors.ts`: story progress logic.

## 1. Variables: Naming Things

JavaScript lets you store values in named boxes.

From `src/config/cdn.ts`:

```ts
export const R2 =
  (import.meta.env.VITE_R2_PUBLIC_BASE_URL as string | undefined) ??
  "https://pub-3a8f85adfce6494097551ac5c045b121.r2.dev";
```

Beginner translation:

```js
const hotelName = "LUME";
const city = "Monaco";
```

`const` means: "I am naming this value, and I do not plan to reassign it."

In LUME, `R2` stores the base CDN address. The app uses that address to build image URLs.

Fun mental model: `R2` is the hotel's media vault. If a product image lives at `LUMElogo.png`, the app needs to know which vault door to open first.

Try it:

```js
const baseUrl = "https://example.com";
const imageName = "LUMElogo.png";
const fullUrl = `${baseUrl}/${imageName}`;

console.log(fullUrl);
```

Expected result:

```txt
https://example.com/LUMElogo.png
```

Project challenge:

Open `src/config/cdn.ts` and find `mediaUrl`. That function uses the same idea.

## 2. Strings: Text Values

Strings are text. They live inside quotes.

From `src/App.tsx`:

```ts
const MEDIA_QUALITY_STORAGE_KEY = "nomad.media-quality.v1";
```

This string is a key used to save the user's media quality preference in `localStorage`.

There are three common ways to write strings:

```js
const single = 'Products';
const double = "Showcase";
const template = `Welcome to ${single}`;
```

Template strings use backticks and let you insert values with `${...}`.

From `src/config/cdn.ts`:

```ts
return `${R2}/${path}`;
```

Beginner translation:

```js
function mediaUrl(path) {
  return `${R2}/${path}`;
}
```

If `R2` is `"https://cdn.lume.test"` and `path` is `"chair.png"`, the result is:

```txt
https://cdn.lume.test/chair.png
```

Mini exercise:

```js
const brand = "LUME";
const product = "Midnight Fragrance";
console.log(`${brand} x ${product}`);
```

## 3. Functions: Reusable Actions

A function is a named recipe.

From `src/config/cdn.ts`:

```ts
export function mediaUrl(path: string): string {
  return `${R2}/${path}`;
}
```

Ignore the TypeScript labels for a moment:

```js
function mediaUrl(path) {
  return `${R2}/${path}`;
}
```

This function receives `path`, then returns a full URL.

`return` means: "send this value back to whoever called me."

Try:

```js
const R2 = "https://cdn.lume.test";

function mediaUrl(path) {
  return `${R2}/${path}`;
}

const logo = mediaUrl("LUMElogo.png");
console.log(logo);
```

Project challenge:

In `src/experience/ui/ProductsPage.tsx`, find this line:

```ts
const lumeLogoImage = mediaUrl("LUMElogo.png");
```

That line calls the function and stores the result.

## 4. Objects: Grouping Related Data

Objects hold related information.

Beginner example:

```js
const product = {
  id: "lume-candle",
  brand: "LUME",
  name: "Nocturne Candle",
  category: "fragrance",
};
```

You read object values with dots:

```js
console.log(product.name);
console.log(product.category);
```

In LUME, products come from `src/experience/products/catalog.json`, then `src/experience/products/catalog.ts` prepares them.

From `catalog.ts`:

```ts
export const PRODUCTS: Product[] = catalog.products.map((product) => ({
  ...product,
  imageSrc: product.imageKey ? mediaUrl(product.imageKey) : undefined,
}));
```

This looks advanced, but the idea is simple:

- Take every product.
- Keep all existing product fields.
- Add a new field called `imageSrc`.
- If the product has an `imageKey`, convert it into a full media URL.

This part:

```js
{
  ...product,
  imageSrc: "some-url"
}
```

means: "copy everything from `product`, then add or replace `imageSrc`."

Mini exercise:

```js
const rawProduct = {
  id: "lume-watch",
  brand: "LUME",
  imageKey: "watch.png",
};

const preparedProduct = {
  ...rawProduct,
  imageSrc: `https://cdn.lume.test/${rawProduct.imageKey}`,
};

console.log(preparedProduct);
```

## 5. Arrays: Lists Of Things

An array is a list.

From `src/experience/products/catalog.ts`:

```ts
export const PRODUCT_CATEGORIES = [
  { id: "all", label: "ALL" },
  { id: "drink", label: "DRINK" },
  { id: "fragrance", label: "FRAGRANCE" },
  { id: "fashion", label: "FASHION" },
];
```

This is a list of category objects.

You can loop through arrays with `.map`.

From `src/experience/ui/ProductsPage.tsx`:

```tsx
{PRODUCT_CATEGORIES.map((cat) => {
  const isActive = activeCategory === cat.id;

  return (
    <motion.button key={cat.id}>
      <span>{cat.label}</span>
    </motion.button>
  );
})}
```

Beginner translation:

```js
const categories = ["ALL", "DRINK", "FRAGRANCE", "FASHION"];

const loudCategories = categories.map((category) => {
  return `Category: ${category}`;
});

console.log(loudCategories);
```

`.map` creates a new list by transforming each item.

Project challenge:

Find `PRODUCT_CATEGORIES.map` in `ProductsPage.tsx`. That is how the filter buttons are created.

## 6. Conditions: Making Choices

Programs make decisions with `if`.

From `src/App.tsx`:

```ts
if (screen === "titlecard") {
  logNavigationAction("back", "titlecard", "home");
  handleGoHome(false);
  return;
}
```

Beginner translation:

```js
if (currentRoom === "lobby") {
  goToRoom("suite");
  return;
}
```

`===` checks whether two values are equal.

In LUME, `handleBack` checks the current screen and decides where the back button should go.

Another condition from `ProductsPage.tsx`:

```ts
const filtered = activeCategory === "all"
  ? PRODUCTS
  : PRODUCTS.filter((p) => p.category === activeCategory);
```

This uses the ternary operator:

```js
condition ? valueIfTrue : valueIfFalse
```

Beginner version:

```js
const activeCategory = "all";
const message = activeCategory === "all" ? "Show everything" : "Show one category";
```

Mini exercise:

```js
const guestHasInvitation = true;

if (guestHasInvitation) {
  console.log("Welcome to LUME.");
} else {
  console.log("Please request access.");
}
```

## 7. Filtering: Picking Only What You Want

`.filter` creates a new list with only the items that pass a test.

From `ProductsPage.tsx`:

```ts
const filtered = activeCategory === "all"
  ? PRODUCTS
  : PRODUCTS.filter((p) => p.category === activeCategory);
```

If the active category is `"all"`, show every product.

Otherwise, keep only products where:

```js
p.category === activeCategory
```

Mini exercise:

```js
const products = [
  { name: "Golden Water", category: "drink" },
  { name: "Night Jacket", category: "fashion" },
  { name: "Lobby Scent", category: "fragrance" },
];

const activeCategory = "fashion";

const filtered = products.filter((product) => {
  return product.category === activeCategory;
});

console.log(filtered);
```

Project challenge:

In the app, click the product filters. You are watching `.filter` change what appears.

## 8. Finding One Item

`.find` returns the first item that matches.

From `src/experience/products/catalog.ts`:

```ts
export function getProductById(productId: string | null): Product | undefined {
  if (!productId) return undefined;
  return PRODUCTS.find((product) => product.id === productId);
}
```

Beginner translation:

```js
function getProductById(productId) {
  if (!productId) return undefined;
  return PRODUCTS.find((product) => product.id === productId);
}
```

What it does:

1. If there is no product id, return nothing.
2. Otherwise, search the product list.
3. Return the product with the matching id.

Mini exercise:

```js
const products = [
  { id: "drink-1", name: "Golden Water" },
  { id: "fashion-1", name: "Night Jacket" },
];

const selected = products.find((product) => product.id === "fashion-1");
console.log(selected.name);
```

## 9. Events: Reacting To Clicks And Movement

Web apps respond to events: clicks, hovers, key presses, image loading, errors.

From `ProductCard` in `src/experience/ui/ProductsPage.tsx`:

```tsx
const handleClick = () => {
  onSelectProduct(product.id);
};
```

This function runs when someone clicks a product card.

Later in the JSX:

```tsx
<div
  onClick={handleClick}
  onMouseEnter={() => play("product.card.hover")}
>
```

Beginner translation:

```js
button.onclick = function () {
  console.log("Product selected");
};
```

LUME also handles keyboard access:

```tsx
onKeyDown={(e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handleClick();
  }
}}
```

That means keyboard users can press Enter or Space to open a product.

Mini exercise:

Read this like a sentence:

```js
if (key is Enter or key is Space) {
  stop the default browser action;
  select the product;
}
```

Project challenge:

Find `onMouseEnter={() => play("product.card.hover")}`. That one line connects hovering with the sound system.

## 10. State: Remembering What Changed

State is memory for a component.

From `src/App.tsx`:

```ts
const [screen, setScreen] = useState<AppScreen>(
  initialHash === "#admin" ? "admin" : "gate"
);
```

This creates:

- `screen`: the current screen.
- `setScreen`: the function that changes the screen.

Beginner React idea:

```js
const [mood, setMood] = useState("curious");
```

When you call:

```js
setMood("confident");
```

React remembers the new value and redraws the UI.

In LUME, `screen` can be:

```ts
"gate" | "home" | "products" | "productDetail" | "showcase" | "contact" | "titlecard" | "experience" | "admin"
```

That TypeScript line means: "screen must be one of these exact strings."

Project challenge:

In `src/App.tsx`, find every `navigateToScreen("...")`. Those are screen changes.

## 11. Rendering: Showing Different UI

React components return JSX, which looks like HTML mixed with JavaScript.

From `src/App.tsx`:

```tsx
{screen === "products" ? (
  <ProductsPage
    onGoHome={handleGoHome}
    onSelectProduct={handleSelectProduct}
    onNavigateToShowcase={handleNavigateToShowcase}
    onNavigateToContact={handleNavigateToContact}
  />
) : (
  <StoryHomePage
    onEnter={handleEnterExperience}
    onNavigateToProducts={handleNavigateToProducts}
    onNavigateToShowcase={handleNavigateToShowcase}
    onNavigateToContact={handleNavigateToContact}
  />
)}
```

Beginner translation:

```js
if (screen === "products") {
  showProductsPage();
} else {
  showHomePage();
}
```

React uses this pattern constantly:

```jsx
{condition ? <ThingA /> : <ThingB />}
```

Project challenge:

Follow the `screen` value:

1. `handleNavigateToProducts` calls `navigateToScreen("products")`.
2. `screen` becomes `"products"`.
3. React shows `<ProductsPage />`.

That is the main app routing system.

## 12. Props: Passing Information Down

Props are values passed into components.

From `ProductsPage.tsx`:

```tsx
function ProductCard({
  product,
  onSelectProduct,
}: {
  product: Product;
  onSelectProduct: (productId: string) => void;
}) {
```

Ignore the TypeScript labels and read it like:

```js
function ProductCard({ product, onSelectProduct }) {
```

This means the component receives an object with two properties:

- `product`
- `onSelectProduct`

Then it uses them:

```tsx
onSelectProduct(product.id);
```

Beginner example:

```js
function welcomeGuest({ name, room }) {
  console.log(`Welcome ${name}, your room is ${room}.`);
}

welcomeGuest({ name: "Youness", room: "Sky Suite" });
```

Project challenge:

Find where `ProductCard` is used:

```tsx
<ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct} />
```

That line passes props into the component.

## 13. Destructuring: Opening The Box Quickly

Destructuring pulls values out of objects.

From `ProductsPage.tsx`:

```ts
const { play } = useSound();
```

Without destructuring, it would look like:

```js
const sound = useSound();
const play = sound.play;
```

Destructuring is shorter.

Another example:

```js
const guest = {
  name: "Youness",
  room: "Sky Suite",
};

const { name, room } = guest;
console.log(name);
console.log(room);
```

Project challenge:

Search for `const { play } = useSound();`. Every place you find it is a component borrowing the sound system's `play` function.

## 14. Custom Hooks: Reusable Component Logic

React hooks are functions that help components remember state or run side effects.

From `src/lib/sound/useSound.ts`:

```ts
export function useSound(): UseSoundReturn {
  const [prefs, setPrefs] = useState<SoundPreferences>(getPreferences);

  useEffect(() => {
    const unsub = subscribe((p) => setPrefs(p));
    return () => {
      unsub();
    };
  }, []);

  return {
    play: (action: ActionKey) => enginePlay(action),
    isMuted: prefs.master.muted,
    volume: prefs.master.volume,
    mute: () => setMasterMuted(true),
    unmute: () => setMasterMuted(false),
    toggleMute: () => setMasterMuted(!prefs.master.muted),
    setVolume: (v: number) => setMasterVolume(v),
    preferences: prefs,
  };
}
```

What this hook does:

- Gets the current sound preferences.
- Subscribes to preference changes.
- Returns useful actions like `play`, `mute`, `unmute`, and `toggleMute`.

Beginner idea:

```js
const { play } = useSound();
play("nav.hover");
```

That says: "get the sound player, then play the hover sound action."

Project challenge:

In `ProductsPage.tsx`, hover a nav item. The hover calls `play("nav.hover")`. The hook sends that action to the sound engine.

## 15. Objects As Lookup Tables

Sometimes an object works like a menu.

From `src/lib/sound/actions.ts`:

```ts
export const ACTION_REGISTRY = {
  "nav.toHome": "page-transition",
  "nav.toProducts": "page-transition",
  "nav.toShowcase": "showcase-confirmation",
  "nav.back": "click-soft",
} as const;
```

Beginner translation:

```js
const actionRegistry = {
  "nav.toHome": "page-transition",
  "nav.back": "click-soft",
};
```

If a component says:

```js
play("nav.back");
```

the sound system can look up `"nav.back"` and learn that it should play `"click-soft"`.

This design keeps components clean. A button does not need to know the exact audio file. It only says what happened.

Mini exercise:

```js
const hotelActions = {
  enterLobby: "soft-chime",
  openSuite: "door-swish",
};

const action = "enterLobby";
console.log(hotelActions[action]);
```

## 16. Effects: Doing Something After Render

`useEffect` runs code after React updates the screen.

From `src/App.tsx`:

```ts
useEffect(() => {
  screenEnteredAtRef.current = Date.now();
}, [screen]);
```

Meaning:

- Whenever `screen` changes,
- remember the current time.

LUME uses that time to calculate how long someone stayed on a screen before navigating away.

Beginner example:

```js
useEffect(() => {
  console.log("The screen changed.");
}, [screen]);
```

The dependency array `[screen]` means: "run this effect when `screen` changes."

Another effect from `ProductsPage.tsx`:

```ts
useEffect(() => {
  return () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };
}, []);
```

This is cleanup. When the component leaves the screen, it clears any pending timer.

Project challenge:

Find one `useEffect` in `App.tsx` and explain it out loud in one sentence.

## 17. Refs: Remembering Without Redrawing

`useRef` stores a value without causing React to redraw.

From `src/App.tsx`:

```ts
const screenEnteredAtRef = useRef(Date.now());
```

This stores the time when the current screen was entered.

From `ProductsPage.tsx`:

```ts
const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

This stores a timer id so it can be cleared later.

Beginner mental model:

- `useState`: remember something and redraw when it changes.
- `useRef`: remember something quietly.

Mini example:

```js
const timerRef = useRef(null);

timerRef.current = setTimeout(() => {
  console.log("Done");
}, 300);
```

## 18. Timers: Waiting Before Doing Something

From `ProductsPage.tsx`:

```ts
timeoutRef.current = setTimeout(() => {
  setTouchedCategory(null);
}, 300);
```

This means:

- Wait 300 milliseconds.
- Then set `touchedCategory` back to `null`.

That creates a short visual "touched" state when a category is clicked.

Mini exercise:

```js
console.log("Lights dimming...");

setTimeout(() => {
  console.log("Curtain opens.");
}, 1000);
```

## 19. Optional Values: Sometimes There Is Nothing

JavaScript uses `null` and `undefined` for missing values.

From `src/App.tsx`:

```ts
const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
```

This starts with no selected product.

When a product is clicked:

```ts
setSelectedProductId(productId);
```

Then the app can show the product detail page.

From `catalog.ts`:

```ts
if (!productId) return undefined;
```

That means: "if the id is missing, stop now and return no product."

Mini exercise:

```js
let selectedProductId = null;

if (!selectedProductId) {
  console.log("No product selected yet.");
}
```

## 20. Safe Fallbacks With `??`

The nullish coalescing operator `??` means: "use the value on the left, unless it is `null` or `undefined`."

From `src/config/cdn.ts`:

```ts
export const SUPABASE_CDN =
  (import.meta.env.VITE_SUPABASE_STORAGE_URL as string | undefined) ?? "";
```

Meaning:

- If the environment variable exists, use it.
- Otherwise, use an empty string.

From `catalog.ts`:

```ts
return (
  SHOWCASE_PREVIEW_PRODUCTS.find(...)
  ??
  SHOWCASE_PREVIEW_PRODUCTS[fallbackIndex]
  ??
  SHOWCASE_PREVIEW_PRODUCTS[0]
  ??
  PRODUCTS[0]
);
```

This is a fallback chain:

1. Use the matching showcase preview product.
2. If missing, use the fallback index.
3. If missing, use the first showcase preview product.
4. If missing, use the first product.

Mini exercise:

```js
const preferredRoom = null;
const fallbackRoom = "Garden Suite";

const room = preferredRoom ?? fallbackRoom;
console.log(room);
```

## 21. Optional Chaining With `?.`

Optional chaining safely reads nested values.

From `src/App.tsx`:

```ts
chapterDefinition?.id
```

Meaning:

- If `chapterDefinition` exists, read `.id`.
- If it does not exist, return `undefined` instead of crashing.

Beginner example:

```js
const guest = null;
console.log(guest?.name);
```

Without `?.`, `guest.name` would crash because `guest` is `null`.

## 22. Async-Looking Code: `void logStoryEvent(...)`

From `src/App.tsx`:

```ts
void logStoryEvent({
  type: "navigation_action",
  payload: {
    action,
    fromScreen,
    toScreen,
  },
});
```

`logStoryEvent` likely returns a Promise because it talks to a service. The `void` tells TypeScript and linters: "we know this is async, but we intentionally are not waiting for it here."

Beginner translation:

```js
sendAnalyticsEvent(event);
keepGoingImmediately();
```

This is useful for analytics. You do not want navigation to feel slow just because an event is being logged.

## 23. Loops: Walking Through Story Chapters

From `src/experience/story/selectors.ts`:

```ts
function getGlobalChapterIndex(chapterId: string): number {
  let index = 0;
  for (const part of storyManifest) {
    for (const ch of part.chapters) {
      if (ch.id === chapterId) return index;
      index++;
    }
  }
  return -1;
}
```

This function searches through every part and every chapter.

Beginner translation:

```js
function findRoomNumber(roomName) {
  let index = 0;

  for (const floor of hotel) {
    for (const room of floor.rooms) {
      if (room.name === roomName) return index;
      index++;
    }
  }

  return -1;
}
```

`for...of` means: "for each item in this list."

`return -1` is a common way to say "not found."

Project challenge:

Open `selectors.ts` and read `getPartDisplayList`. It builds the chapter display data used by the story UI.

## 24. Building Derived Data

Derived data means data calculated from other data.

From `selectors.ts`:

```ts
completedChapterCount: chapters.filter((c) => c.status === "completed").length,
totalChapterCount: chapters.length,
```

The app does not manually store `completedChapterCount`. It calculates it from the chapter list.

Beginner example:

```js
const rooms = [
  { name: "A", clean: true },
  { name: "B", clean: false },
  { name: "C", clean: true },
];

const cleanRoomCount = rooms.filter((room) => room.clean).length;
console.log(cleanRoomCount);
```

Derived data keeps your app easier to trust because there is less duplicated state.

## 25. The Main LUME Flow In Plain English

Here is the app's core flow using beginner JavaScript ideas:

1. `App.tsx` stores the current `screen` in state.
2. Button handlers call functions like `handleNavigateToProducts`.
3. Those functions play sounds and update `screen`.
4. React sees `screen` changed.
5. React renders the matching page.
6. Product pages use arrays, filters, maps, and props to show product cards.
7. Clicking a product stores `selectedProductId`.
8. The product detail page receives that id and can find the matching product.

Tiny version:

```js
let screen = "home";
let selectedProductId = null;

function goToProducts() {
  play("nav.toProducts");
  screen = "products";
}

function selectProduct(productId) {
  play("product.card.click");
  selectedProductId = productId;
  screen = "productDetail";
}
```

React makes this live and visual by redrawing the screen when state changes.

## 26. Your First Safe Project Experiment

Try this small change after you understand filters:

File: `src/experience/ui/ProductsPage.tsx`

Find:

```ts
const filtered = activeCategory === "all"
  ? PRODUCTS
  : PRODUCTS.filter((p) => p.category === activeCategory);
```

Temporarily add:

```ts
console.log("Active category:", activeCategory);
console.log("Visible products:", filtered.map((product) => product.name));
```

Then run:

```bash
npm run dev
```

Open the browser console and click the category filters. You will see JavaScript data changing as you interact with the app.

Remove the logs when you are done.

## 27. Your Second Safe Project Experiment

File: `src/lib/sound/actions.ts`

Find:

```ts
"nav.back": "click-soft",
```

Change it temporarily to another sound key already used nearby, for example:

```ts
"nav.back": "page-transition",
```

Now the back button should feel different.

This teaches an important idea: many apps use data objects to control behavior. You did not edit a button. You edited the action registry that the button depends on.

Change it back when you are done.

## 28. Tiny Glossary

- Variable: a named value, like `const screen = "home"`.
- String: text, like `"products"`.
- Number: a numeric value, like `300`.
- Boolean: `true` or `false`.
- Object: grouped data, like `{ id: "drink", label: "DRINK" }`.
- Array: a list, like `[product1, product2]`.
- Function: reusable instructions.
- Return: the value a function sends back.
- Condition: a choice, usually with `if`.
- Event: something that happens, like a click.
- State: component memory that can redraw the UI.
- Props: values passed into a component.
- Hook: a React function for state, effects, or reusable behavior.
- JSX: HTML-like syntax inside React code.
- TypeScript: JavaScript with extra type labels.

## 29. Beginner Reading Path Through This Project

Use this order:

1. `src/config/cdn.ts` for functions and strings.
2. `src/experience/products/catalog.ts` for arrays, objects, `.map`, `.find`, and fallbacks.
3. `src/lib/sound/actions.ts` for lookup objects.
4. `src/experience/ui/ProductsPage.tsx` for components, props, events, filters, and state.
5. `src/App.tsx` for screen routing and navigation.
6. `src/experience/story/selectors.ts` for loops and derived data.
7. `src/lib/sound/useSound.ts` for custom hooks.

## 30. Final Mini Quest

Explain this line from `ProductsPage.tsx` in your own words:

```tsx
{filtered.map((product) => (
  <ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct} />
))}
```

A good beginner answer:

"For every product in the filtered product list, create one ProductCard. Give each card the product data and the function it should call when selected."

That sentence contains a lot of JavaScript power: arrays, callbacks, props, rendering, and events.

You now have the map. The next step is repetition: read a little code, explain it in plain English, change one safe thing, run the app, and observe what happened.
