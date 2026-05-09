# Chatbot Details

## Overview

The LUME chatbot is an optional local AI chat widget that connects the React app to an Ollama model through the Vite dev proxy. It supports streaming responses, persistent local chat history, response actions, source-category labels, and a small RAG layer backed by local LUME knowledge chunks and embeddings.

The current model target is:

```txt
llama3.1:8b
```

In the app, the browser calls a local Vite proxy path:

```txt
/ollama/api/chat
```

That proxy forwards requests to `VITE_OLLAMA_HOST` during local development. The default is `http://127.0.0.1:11434`.

## Files

Main chatbot component:

```txt
src/components/chat/OllamaChat.tsx
```

Chatbot styling:

```txt
src/components/chat/OllamaChat.css
```

App integration:

```txt
src/App.tsx
```

Vite proxy configuration:

```txt
vite.config.ts
```

Vite env typings:

```txt
src/vite-env.d.ts
```

RAG service and local knowledge:

```txt
src/lib/ragService.ts
src/lib/knowledge/chunks.ts
src/lib/knowledge/embeddings.json
scripts/generateEmbeddings.ts
```

## How It Is Mounted

The chatbot is lazy-loaded in `src/App.tsx`:

```tsx
const OllamaChat = lazy(() =>
  import("./components/chat/OllamaChat").then((module) => ({
    default: module.OllamaChat,
  }))
);
```

It is rendered on every screen except the gate screen when local chat is enabled:

```tsx
const LOCAL_CHAT_ENABLED = import.meta.env.VITE_ENABLE_LOCAL_CHAT === "true";

{LOCAL_CHAT_ENABLED && screen !== "gate" && <OllamaChat />}
```

This keeps the local/dev chatbot out of production unless `VITE_ENABLE_LOCAL_CHAT=true` is explicitly set.

## Local Model Integration

The chat component defaults to this browser-facing URL:

```ts
const OLLAMA_CHAT_URL =
  (import.meta.env.VITE_OLLAMA_CHAT_URL as string | undefined) ?? "/ollama/api/chat";
```

The default model is:

```ts
const OLLAMA_MODEL =
  (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) ?? "llama3.1:8b";
```

The Vite dev server proxies `/ollama` to the Linux device:

```ts
const ollamaHost = env.VITE_OLLAMA_HOST ?? "http://127.0.0.1:11434";

server: {
  proxy: {
    "/ollama": {
      target: ollamaHost,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/ollama/, ""),
    },
  },
}
```

So this browser request:

```txt
/ollama/api/chat
```

becomes:

```txt
http://127.0.0.1:11434/api/chat
```

## Request Shape

When the user sends a message, `OllamaChat.tsx` first asks `getSystemPromptWithContext()` for a context-aware system prompt. That function embeds the query, retrieves relevant local LUME knowledge chunks, and appends those chunks to a strict system prompt.

Then the component sends a streaming POST request to Ollama:

```ts
await fetch(OLLAMA_CHAT_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: OLLAMA_MODEL,
    stream: true,
    messages: [{ role: "system", content: systemPrompt }, ...nextApiMessages],
  }),
});
```

The base system prompt lives in `src/lib/ragService.ts`. It instructs the assistant to treat LUME as an invitation-only luxury hotel in Monaco and to answer only from the retrieved context.

Streaming chunks are read from `response.body.getReader()` and appended token-by-token into the in-progress assistant message.

## Memory Behavior

The chatbot has two memory layers:

- Current session state in React.
- Persistent local browser history in `localStorage` under `lume-chat-v1`.

```ts
const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
```

On every request, the current conversation is converted into Ollama chat messages and sent with the new user message. When the chat is not actively retrieving or streaming, messages are persisted to local storage.

This means:

- The model can follow the current conversation while the page is open.
- The conversation survives page refresh.
- The conversation survives component unmount/remount.
- Nothing is stored in Supabase.
- Reset clears the stored local chat.

## UI Behavior

The chatbot starts as a floating button.

When opened, it shows:

- Conversation history.
- Current model name.
- Reset button.
- Close button.
- Text input.
- Send button.
- Suggested starter prompts before the first user message.
- Copy/helpful/not-helpful response actions.
- Collapsible source-category labels for RAG-backed assistant messages.
- Loading state.
- Error state.
- RAG retrieval state.
- Streaming assistant response cursor.

Keyboard behavior:

- `Enter` sends the message.
- `Shift + Enter` creates a new line.

## Configuration

Optional environment variables:

```txt
VITE_ENABLE_LOCAL_CHAT=true
VITE_OLLAMA_HOST=http://127.0.0.1:11434
VITE_OLLAMA_CHAT_URL=/ollama/api/chat
VITE_OLLAMA_MODEL=llama3.1:8b
VITE_OLLAMA_EMBED_MODEL=nomic-embed-text
```

Typical local development setup should use `VITE_OLLAMA_HOST` and keep `VITE_OLLAMA_CHAT_URL` as the default proxy path.

## Why We Use A Vite Proxy

The browser should not call the Linux Ollama server directly during development because direct cross-origin browser calls can run into CORS issues.

Instead, the browser calls:

```txt
http://localhost:5173/ollama/api/chat
```

Vite forwards that request to:

```txt
http://127.0.0.1:11434/api/chat
```

This keeps the frontend request same-origin from the browser's point of view.

## Current Limitations

- Persistent chat history is local-browser only.
- RAG uses static local chunks and embeddings.
- Embeddings must be regenerated manually when knowledge chunks change.
- No server-side rate limiting.
- No Supabase-backed user-specific chat memory.
- The model is only available when the configured Ollama host is online and reachable from the Vite dev server.
- The current implementation is client-side and meant for local/dev use.

## RAG Maintenance

Knowledge source:

```txt
src/lib/knowledge/chunks.ts
```

Generated embeddings:

```txt
src/lib/knowledge/embeddings.json
```

Regeneration command:

```bash
npm run embed
```

The current request flow:

1. User sends a message.
2. `ragService` embeds the query through Ollama embeddings.
3. `ragService` scores local chunks with cosine similarity.
4. Top chunks are inserted into the system prompt.
5. Ollama streams the final answer.

Likely future pieces:

- Move retrieval/model calls to a server/API layer for production.
- Add rate limits.
- Add authenticated user-specific memory if needed.
- Add automated embedding regeneration in CI or release workflow.

## Verification Commands

Direct Ollama test from the machine running Ollama:

```bash
curl http://127.0.0.1:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.1:8b",
    "stream": true,
    "messages": [
      {
        "role": "user",
        "content": "Reply with exactly: ollama-ok"
      }
    ]
  }'
```

Vite proxy test:

```bash
curl http://localhost:5173/ollama/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.1:8b",
    "stream": true,
    "messages": [
      {
        "role": "user",
        "content": "Reply with exactly: vite-proxy-ok"
      }
    ]
  }'
```

Build check:

```bash
npm run build
```
