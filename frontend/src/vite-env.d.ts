/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POCA_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
