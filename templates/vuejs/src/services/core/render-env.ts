/**
 * Always false: this SPA never renders on a server. Shared code such as
 * `defineQuery` reads it here; the Nuxt template sets it from `import.meta.server`.
 */
export const isServerRender = false;
