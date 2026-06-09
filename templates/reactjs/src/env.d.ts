/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_ENDPOINT: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_LANGUAGE_CODE: string;
  readonly VITE_HMAC_SECRET: string;
  readonly VITE_BUILD_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
