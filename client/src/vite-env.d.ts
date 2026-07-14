/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ERMIS_API_KEY: string;
  readonly VITE_ERMIS_PROJECT_ID: string;
  readonly VITE_ERMIS_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
