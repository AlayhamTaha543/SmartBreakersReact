/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SMARTBREAKER_BACKEND_URL?: string
  readonly VITE_SMARTBREAKER_TIER1_URL?: string
  readonly VITE_SMARTBREAKER_ORGANIZATION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
