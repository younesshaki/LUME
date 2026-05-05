/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ACCESS_PASSWORD?: string;
  readonly VITE_R2_PUBLIC_BASE_URL?: string;
  readonly VITE_SUPABASE_STORAGE_URL?: string;
  readonly VITE_USE_BACKEND?: string;
  readonly VITE_ENABLE_LOCAL_CHAT?: string;
  readonly VITE_OLLAMA_CHAT_URL?: string;
  readonly VITE_OLLAMA_HOST?: string;
  readonly VITE_OLLAMA_MODEL?: string;
  readonly VITE_OLLAMA_EMBED_MODEL?: string;
}

declare module "*.glb" {
  const src: string;
  export default src;
}

declare module "*?url" {
  const src: string;
  export default src;
}
