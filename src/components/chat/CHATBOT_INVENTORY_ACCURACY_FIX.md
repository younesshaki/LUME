# Chatbot Inventory Accuracy Fix

## What Was Wrong

The chatbot was answering from the real Supabase inventory, but the production
chat API was not selecting the right inventory slice before sending context to
Deepseek.

Examples of bad behavior:

- `toyotas ?` returned no Toyotas even though the DB had 126.
- `how many FORDS are there ?` returned 68 even though the DB had 111.
- `do you have any feraris ?` worked partially, but the follow-up
  `how many are they ?` could lose the Ferrari context.
- `how many lambos ?` returned 4 even though the DB had 3 Lamborghinis.

The database was correct. The bug was in the retrieval/filtering layer that
builds the prompt for Deepseek.

## Root Causes

### 1. The production API used a small hard-coded make list

The first production `/api/chat` function only recognized a few makes in
`VEHICLE_INTENT_KEYWORDS`, such as:

```ts
"ferrari",
"lamborghini",
"bmw",
"mercedes",
"porsche",
"audi",
"tesla",
```

That meant common makes like Toyota and Ford were not always treated as vehicle
queries.

### 2. Make detection was plain substring matching

The old logic looked roughly like this:

```ts
query.includes(make) || query.includes(`${make}s`)
```

That is too weak for real chat input:

- `feraris` is misspelled.
- `FORDS` is uppercase and plural.
- `lambos` is slang.
- Multi-word makes like `Mercedes-Benz` need aliases like `mercedes` or `benz`.

### 3. Follow-up questions only looked at the last user message

For `how many are they ?`, the last message does not contain `Ferrari`.

The API was only using:

```ts
lastUser.content
```

So it could not reliably know that `they` referred to the previous Ferrari
question.

### 4. Deepseek was asked to infer counts from sample rows

The prompt included vehicle rows, but it needed stronger instructions to use
the exact `TOTAL MATCHING` value instead of counting only the shown examples.

## What Changed

The fix lives in the root production API:

```txt
api/chat.ts
```

The frontend still calls:

```ts
fetch("/api/chat", ...)
```

The browser does not get the Deepseek key, Supabase service role key, RAG
chunks, or full inventory directly.

## New Request Flow

When a user sends a chat message:

```txt
OllamaChat.tsx
  -> src/lib/deepseekService.ts
  -> POST /api/chat
  -> Supabase tenant inventory + RAG chunks
  -> deterministic vehicle filtering
  -> Deepseek
  -> streamed SSE response back to the chat UI
```

## Step 1: Clean and Limit User Messages

The API accepts recent chat messages, drops any client-supplied `system`
messages, and keeps only user/assistant turns:

```ts
const cleanMessages = body.messages
  .filter((m) => m.role === "user" || m.role === "assistant")
  .map((m) => ({
    role: m.role,
    content: String(m.content ?? "").slice(0, MAX_USER_CONTENT_LENGTH),
  }));
```

This prevents the browser from injecting its own system prompt.

## Step 2: Preserve Follow-Up Context

The API now keeps the last few user messages:

```ts
const recentUserText = cleanMessages
  .filter((m) => m.role === "user")
  .slice(-3)
  .map((m) => m.content)
  .join(" ");
```

This makes follow-ups work:

```txt
User: do you have any feraris ?
User: how many are they ?
```

The second message can still resolve back to Ferrari because the API checks
recent user text, not just the last message.

## Step 3: Read Real Makes From Supabase

Instead of relying only on a hard-coded list, the API asks Supabase what makes
actually exist for the tenant:

```ts
const { data: makeRows } = await supabase
  .from("vehicles")
  .select("make")
  .eq("tenant_id", tenant.tenantId);

const knownMakes = uniqueStrings(
  (makeRows ?? []).map((row) => row.make)
);
```

This is the key accuracy improvement.

If the tenant inventory has:

```txt
Toyota
Ford
Ferrari
Lamborghini
Chevrolet
...
```

then the chatbot can detect those makes dynamically.

## Step 4: Resolve Plurals, Typos, and Aliases

The API normalizes user words:

```ts
function normalizedWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
```

Then it singularizes simple plurals:

```ts
function singularize(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
  return word;
}
```

So:

```txt
toyotas -> toyota
fords   -> ford
```

It also has a small alias map:

```ts
const MAKE_ALIASES = {
  benz: "Mercedes-Benz",
  mercedes: "Mercedes-Benz",
  lambo: "Lamborghini",
  lambos: "Lamborghini",
  vw: "Volkswagen",
  chevy: "Chevrolet",
};
```

For typos, it uses a lightweight Levenshtein distance check:

```ts
levenshteinDistance(queryWord, makeWord) <= 1
```

That is why:

```txt
feraris
```

can still match:

```txt
Ferrari
```

## Step 5: Use Direct Match First, Then Contextual Match

The API first tries to detect a make in the current message:

```ts
const directFilters = extractVehicleFilters(lastUser.content, knownMakes);
```

If that fails, it tries recent user messages:

```ts
const contextualFilters = directFilters.make
  ? directFilters
  : extractVehicleFilters(recentUserText, knownMakes);
```

This matters for follow-ups:

```txt
User: do you have any feraris ?
Assistant: Yes.
User: how many are they ?
```

The final question has no make, so the API falls back to recent user text and
recovers `Ferrari`.

## Step 6: Decide When To Load Vehicle Inventory

The API loads full tenant vehicle inventory only when needed:

```ts
const shouldUseVehicleInventory =
  isVehicleQuery(lastUser.content) ||
  isVehicleFollowUp(lastUser.content) ||
  Boolean(contextualFilters.make);
```

Vehicle follow-ups are detected with:

```ts
/\b(how many|count|they|those|them|ones|what about)\b/i
```

So `how many are they ?` is treated as an inventory question.

## Step 7: Deterministically Count Matching Vehicles

Once the make is known, matching is done in code before Deepseek is called:

```ts
if (filters.make) {
  results = results.filter(
    (vehicle) => vehicle.make.toLowerCase() === filters.make!.toLowerCase()
  );
}

const totalMatched = results.length;
```

Deepseek does not calculate the count from scratch.

The API calculates:

```txt
Toyota:      126
Ford:        111
Ferrari:       4
Lamborghini:   3
```

Then those exact counts are put into the prompt.

## Step 8: Put Exact Count In The Prompt

The vehicle prompt block includes:

```txt
=== VEHICLE INVENTORY ===
Total vehicles in full inventory: 1000
TOTAL MATCHING make=Toyota: 126
Showing first 30 of 126.
[1] 2026 Toyota Land Cruiser | ...
...
=========================
```

And the system prompt now explicitly says:

```txt
For count questions, answer with the exact TOTAL MATCHING value from VEHICLE
INVENTORY. Do not count only the shown sample rows.
```

This is important because the API may only show the first 30 matching vehicles,
but the count may be much higher.

## Why This Works Better

The model is now used for language, not database logic.

The code handles:

- tenant selection
- make detection
- typo/plural/alias handling
- inventory filtering
- exact counts
- prompt construction

Deepseek handles:

- wording the answer
- summarizing the matching vehicles
- keeping the response conversational

That separation makes the answers more accurate.

## Production Verification

After the fix, these were tested against production:

```txt
toyotas ?
-> We have 126 Toyotas in inventory.

how many FORDS are there ?
-> There are 111 Ford vehicles in the inventory.

how many lambos ?
-> We have 3 Lamborghinis in inventory.

do you have any feraris ?
how many are they ?
-> There are exactly 4 Ferraris in the inventory.
```

## Files Involved

Frontend chat UI:

```txt
src/components/chat/OllamaChat.tsx
src/lib/deepseekService.ts
```

Production chat API:

```txt
api/chat.ts
```

Supabase data:

```txt
tenants
vehicles
rag_chunks
```

## Important Lesson

Do not ask the LLM to infer inventory truth when the database can answer it
deterministically.

For structured data like vehicle inventory, calculate the facts in code first,
then give the model a clear prompt with exact numbers.
