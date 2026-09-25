# System Architecture

How this Nuxt 4 + TypeScript **SSR** app is wired end-to-end: how it boots (on
both server and client), how `runtimeConfig` replaces `import.meta.env`, how it
talks to backends, how it stays secure under SSR, how state flows and hydrates,
how it builds, and how errors surface. Every topic maps to real code under
`app/` and `nuxt.config.ts`.

The stack: **Nuxt 4.4** (Nitro SSR, `app/` srcDir), **Pinia** (`@pinia/nuxt`),
**TanStack Vue Query**, an **axios** service layer (multi-service, httpOnly
access + refresh-cookie rotation + HMAC-signed requests, **SSR-guarded**),
**Socket.IO** (client-only handshake), and **@nuxtjs/i18n**.

## Topics

| Topic | What it covers |
| --- | --- |
| [Bootstrap Flow](./system-architecture/bootstrap-flow.md) | Numbered plugin order, `01.init-services.ts` running on server + client, app mount |
| [SSR & Runtime Config](./system-architecture/ssr-and-runtime-config.md) | The key Nuxt delta: `runtimeConfig` + `NUXT_PUBLIC_*`, `useRuntimeConfig`, server vs client, hydration concerns |
| [Networking & Realtime](./system-architecture/networking-realtime.md) | `Api` client, `Model` base, interceptors, TanStack wrappers, Socket.IO |
| [Security & Auth](./system-architecture/security-auth.md) | **Flagship** — httpOnly auth cookies, session hint, HMAC signing, single-flight cross-tab refresh, session expiry → `/login` |
| [State Management](./system-architecture/state-management.md) | Pinia (`@pinia/nuxt`) + TanStack Vue Query keys, caching, invalidation |
| [Build Pipeline](./system-architecture/build-pipeline.md) | `nuxt build`/`generate`, auto-imports, Tailwind v4, modules |
| [Error Handling](./system-architecture/error-handling.md) | Envelope detection, 401 flow, no reloads (session expiry → `/login`), blob/network errors |

## At a Glance

- One shared `Api` class serves many backends keyed by an `ApiService` name. The
  `01.init-services.ts` plugin runs on **both** server and client and reads base
  URLs from `runtimeConfig` so SSR and CSR resolve the same origins.
- Every request is signed with HMAC (when `runtimeConfig.public.hmacSecret` is
  set); auth rides on httpOnly cookies the browser attaches. The response
  interceptor unwraps the API envelope.
- `window`, `document.cookie` and `localStorage` access are **client-guarded**;
  signing reads the secret via `useRuntimeConfig()` (never `import.meta.env`).
- In the browser a 401 triggers a **single-flight**, cross-tab-locked refresh per
  service (only while the session hint cookie is set); the page never reloads. Server state lives in
  TanStack Vue Query; UI/session state lives in Pinia.

## Read Order

1. [Bootstrap Flow](./system-architecture/bootstrap-flow.md) — what runs first.
2. [SSR & Runtime Config](./system-architecture/ssr-and-runtime-config.md) — the Nuxt delta everything else assumes.
3. [Networking & Realtime](./system-architecture/networking-realtime.md) — the data layer.
4. [Security & Auth](./system-architecture/security-auth.md) — the flagship; auth + refresh + SSR guards.
5. [State Management](./system-architecture/state-management.md), [Error Handling](./system-architecture/error-handling.md), [Build Pipeline](./system-architecture/build-pipeline.md).
