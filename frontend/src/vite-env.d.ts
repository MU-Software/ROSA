/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POCA_URL: string
  readonly VITE_POCA_WS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
