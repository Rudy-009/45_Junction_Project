/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STANDBY_API_BASE_URL?: string;
  /** Local development only. Production credentials must stay on the server. */
  readonly VITE_STANDBY_API_TOKEN?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
