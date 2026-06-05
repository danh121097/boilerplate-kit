# Codebase Summary

A tour of how this Nuxt 4 + TypeScript SSR starter is organized. Start here,
then open the nested doc that matches what you are touching. Every claim is
grounded in real files under `app/` (the Nuxt `srcDir`), plus `i18n/` and
`types/`.

The app boots through ordered `app/plugins/*`, which run on **both server and
client**: `01.init-services.ts` wires the HTTP layer (base URLs, token slots,
refresh interceptors) before any page-level data fetch; then `02.vue-query.ts`
installs TanStack Vue Query, `03.directives.ts` registers the `v-track`
directive, and `04.vee-validate.ts` registers the bare vee-validate components.
The root component `app/app.vue` renders `<NuxtLayout><NuxtPage /></NuxtLayout>`.

## Topics

| Topic | What it covers |
| --- | --- |
| [Directory Structure](./codebase-summary/directory-structure.md) | The real `app/` tree (plus `i18n/`, `types/`, empty `server/`) with a one-line purpose per folder and key file |
| [Services & Stores](./codebase-summary/services-and-stores.md) | The SSR-guarded axios layer (`Api`, `Model`, core utilities, refresh/HMAC), auth/users services, the init plugin, Pinia stores, and the Socket.IO composable |
| [Conventions](./codebase-summary/conventions.md) | The `@/` → `app/` alias, barrel `index.ts` pattern, Nuxt auto-imports, the enums registry (`useStorageKeys`), and file-size guidance |

## Related Documentation

- [project-overview-pdr.md](./project-overview-pdr.md) — stack, scripts, constraints
- [code-standards.md](./code-standards.md) — naming, lint, commit convention
- [system-architecture.md](./system-architecture.md) — bootstrap, data flow, auth, build
