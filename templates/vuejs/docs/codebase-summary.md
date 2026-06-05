# Codebase Summary

A tour of how this Vue 3 + TypeScript starter is organized. Start here, then
open the nested doc that matches what you are touching. Every claim is grounded
in real files under `src/`.

The app boots in `src/main.ts`: `initServices()` wires the HTTP layer, then
`registerPlugins(app)` installs i18n, Pinia, the router, Vue Query, and custom
directives before mounting.

## Topics

| Topic | What it covers |
| --- | --- |
| [Directory Structure](./codebase-summary/directory-structure.md) | The real `src/` tree with a one-line purpose per folder and key file |
| [Services & Stores](./codebase-summary/services-and-stores.md) | The axios service layer (`Api`, `Model`, core utilities), auth/users services, Pinia stores, and the Socket.IO composable |
| [Conventions](./codebase-summary/conventions.md) | Barrel `index.ts` pattern, `@/` alias, file-size guidance, the enums registry, and `utils/` |

## Related Documentation

- [project-overview-pdr.md](./project-overview-pdr.md) — stack, scripts, constraints
- [code-standards.md](./code-standards.md) — naming, lint, commit convention
- [system-architecture.md](./system-architecture.md) — bootstrap, data flow, auth, build
