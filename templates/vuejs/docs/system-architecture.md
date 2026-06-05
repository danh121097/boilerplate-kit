# System Architecture

How this Vue 3 + TypeScript SPA is wired end-to-end: how it boots, how it talks
to backends, how it stays secure, how state flows, how it builds, and how errors
surface. Every topic below maps to real code under `src/` and the project config.

The stack: **Vite 8**, **Vue 3.5** + `<script setup>`, **Pinia**, **TanStack Vue
Query**, an **axios** service layer (multi-service, JWT bearer + httpOnly
refresh-cookie rotation + HMAC-signed requests), **Socket.IO**, and **vue-i18n**.

## Topics

| Topic | What it covers |
| --- | --- |
| [Bootstrap Flow](./system-architecture/bootstrap-flow.md) | `main.ts` → `initServices()` → plugins (i18n, pinia, router, vue-query, directives) → mount |
| [Networking & Realtime](./system-architecture/networking-realtime.md) | `Api` client, `Model` base, request/response interceptors, TanStack `defineQuery`/`defineMutation`, Socket.IO |
| [Security & Auth](./system-architecture/security-auth.md) | JWT bearer + httpOnly refresh cookie, HMAC request signing, single-flight refresh + replay, per-service tokens |
| [State Management](./system-architecture/state-management.md) | Pinia stores + TanStack Vue Query keys, caching, invalidation |
| [Build Pipeline](./system-architecture/build-pipeline.md) | Vite plugins, auto-import, `ui`-only component registration, Tailwind v4, `@/` alias, scripts |
| [Error Handling](./system-architecture/error-handling.md) | Envelope detection, 401 path, network errors, blob errors |

## At a Glance

- One shared `Api` class serves many backends keyed by an `ApiService` name; each
  has its own base URL, localStorage token slot, and optional refresh endpoint.
- Every request is signed with HMAC (when `VITE_HMAC_SECRET` is set) and carries
  the matching bearer token; the response interceptor unwraps the API envelope.
- A 401 triggers a **single-flight** refresh per service — concurrent 401s share
  one network refresh, then each request is replayed with the new token.
- Server state lives in TanStack Vue Query; UI/session state lives in Pinia.

## Read Order

1. [Bootstrap Flow](./system-architecture/bootstrap-flow.md) — what runs first.
2. [Networking & Realtime](./system-architecture/networking-realtime.md) — the data layer.
3. [Security & Auth](./system-architecture/security-auth.md) — the flagship; auth + refresh.
4. [State Management](./system-architecture/state-management.md), [Error Handling](./system-architecture/error-handling.md), [Build Pipeline](./system-architecture/build-pipeline.md).
