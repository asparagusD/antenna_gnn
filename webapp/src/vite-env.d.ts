/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" only in the Playwright build (playwright.config.ts): enables window.__graphpatchTest. */
  readonly VITE_E2E_HOOKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
