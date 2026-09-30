/**
 * True while Nuxt renders on the server (`import.meta.server`; false in client
 * bundles, so server-only branches behind it are dropped there). Shared code such
 * as `defineQuery` reads it here, keeping `tanstack.ts` identical to the vuejs one.
 */
export const isServerRender: boolean = import.meta.server;
