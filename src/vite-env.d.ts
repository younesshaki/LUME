/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ACCESS_PASSWORD?: string;
  readonly VITE_R2_PUBLIC_BASE_URL?: string;
  readonly VITE_SUPABASE_STORAGE_URL?: string;
  readonly VITE_USE_BACKEND?: string;
  readonly VITE_ENABLE_LOCAL_CHAT?: string;
  readonly VITE_ENABLE_GOOEY_NAV?: string;
  readonly VITE_OLLAMA_CHAT_URL?: string;
  readonly VITE_OLLAMA_HOST?: string;
  readonly VITE_OLLAMA_MODEL?: string;
  readonly VITE_OLLAMA_EMBED_MODEL?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_POSTHOG_ENABLED?: string;
  /** Provided by Vercel at build time; tags speed events with the release. */
  readonly VITE_VERCEL_GIT_COMMIT_SHA?: string;
  readonly VITE_POSTHOG_PROJECT_TOKEN?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_POSTHOG_SESSION_REPLAY?: string;
  readonly VITEST?: string;
}

declare module "*.glb" {
  const src: string;
  export default src;
}

declare module "*?url" {
  const src: string;
  export default src;
}
