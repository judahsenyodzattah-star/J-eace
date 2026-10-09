/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JEACE_DEMO_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
