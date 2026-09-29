/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_ENDPOINT: string;
  readonly VITE_API_PREFIX: string;
  readonly VITE_LANGUAGE_CODE: string;
  readonly VITE_HMAC_SECRET: string;
  readonly VITE_BUILD_VERSION: string;
  readonly VITE_AUTH_MOCK?: string;
  readonly VITE_AUTH_MOCK_EMAIL?: string;
  readonly VITE_AUTH_MOCK_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
