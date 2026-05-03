/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OLLAMA_CHAT_URL?: string;
  readonly VITE_OLLAMA_HOST?: string;
  readonly VITE_OLLAMA_MODEL?: string;
}

declare module "*.glb" {
  const src: string;
  export default src;
}

declare module "*?url" {
  const src: string;
  export default src;
}
