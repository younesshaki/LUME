# Chatbot Details

## Overview

The LUME chatbot is an optional first-pass local AI chat widget that connects the React app to an Ollama model running on a Linux device on the local network.

The current model target is:

```txt
llama3.1:8b
```

The Ollama API is reachable from this Mac at:

```txt
http://192.168.11.118:11434/api/chat
```

In the app, the browser calls a local Vite proxy path instead:

```txt
/ollama/api/chat
```

That proxy forwards requests to the Linux Ollama server during local development.

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

## How It Is Mounted

The chatbot is imported in `src/App.tsx`:

```tsx
import { OllamaChat } from "./components/chat/OllamaChat";
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
const ollamaHost = env.VITE_OLLAMA_HOST ?? "http://192.168.11.118:11434";

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
http://192.168.11.118:11434/api/chat
```

## Request Shape

When the user sends a message, `OllamaChat.tsx` sends a POST request to Ollama:

```ts
await fetch(OLLAMA_CHAT_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: OLLAMA_MODEL,
    stream: false,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...nextApiMessages,
    ],
  }),
});
```

The system prompt is currently:

```txt
You are LUME's local assistant. Be concise, helpful, and clear. If you do not know something, say so.
```

## Memory Behavior

The chatbot currently has short-term memory only.

Messages are stored in React state:

```ts
const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
```

On every request, the current conversation is converted into Ollama chat messages and sent with the new user message.

This means:

- The model can follow the current conversation while the page is open.
- The conversation is lost on page refresh.
- The conversation is lost if the component unmounts.
- Nothing is stored in Supabase.
- Nothing is stored in `localStorage`.
- No RAG memory has been added yet.

## UI Behavior

The chatbot starts as a floating button.

When opened, it shows:

- Conversation history.
- Current model name.
- Reset button.
- Close button.
- Text input.
- Send button.
- Loading state.
- Error state.

Keyboard behavior:

- `Enter` sends the message.
- `Shift + Enter` creates a new line.

## Configuration

Optional environment variables:

```txt
VITE_ENABLE_LOCAL_CHAT=true
VITE_OLLAMA_HOST=http://192.168.11.118:11434
VITE_OLLAMA_CHAT_URL=/ollama/api/chat
VITE_OLLAMA_MODEL=llama3.1:8b
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
http://192.168.11.118:11434/api/chat
```

This keeps the frontend request same-origin from the browser's point of view.

## Current Limitations

- No persistent chat history.
- No streaming response UI yet.
- No RAG.
- No document retrieval.
- No user-specific memory.
- The model is only available when the Linux Ollama device is online and reachable on the network.
- The current implementation is client-side and meant for local/dev use.

## Future RAG Direction

The next RAG step should happen before calling Ollama:

1. User sends a message.
2. App searches project/product/brand knowledge.
3. Relevant context snippets are selected.
4. The snippets are inserted into the prompt.
5. Ollama answers using both the conversation and retrieved context.

Likely future pieces:

- A knowledge source for LUME brand/product content.
- An embedding model.
- A vector store.
- A retrieval function.
- A server/API layer so retrieval and model calls are not handled only in the browser.

## Verification Commands

Direct Ollama test from the Mac:

```bash
curl http://192.168.11.118:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.1:8b",
    "stream": false,
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
    "stream": false,
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
