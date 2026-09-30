# Fastify starter

Opinionated Node.js + TypeScript backend built on Fastify 5. It includes modular
routes, JWT (RS256 access + HS256 refresh), HMAC-signed API requests, MongoDB,
Socket.IO, optional Redis, Zod validation, Swagger, and Vitest integration tests.

## Stack

| Concern               | Choice                                                                   |
| --------------------- | ------------------------------------------------------------------------ |
| Runtime               | Node.js >=20.19.0 + TypeScript                                           |
| Framework             | Fastify 5                                                                |
| Database              | MongoDB via Mongoose                                                     |
| Auth                  | RS256 access JWT + rotating HS256 refresh JWT in an httpOnly cookie      |
| API signing           | HMAC-SHA256 on every route under `API_PREFIX`                            |
| Realtime              | Socket.IO attached to Fastify's Node HTTP server                         |
| Cache / scale         | Optional Redis for rate limits, cache, revocation, and Socket.IO adapter |
| Validation / API docs | Zod 4 + Fastify Swagger/OpenAPI                                          |
| Security              | `@fastify/helmet`, cors, compress, cookie, and rate-limit plugins        |
| Tests                 | Vitest + `fastify.inject()` + `mongodb-memory-server`                    |

## Setup

```sh
cp .env.example .env          # then edit required values
pnpm install
pnpm dev
```

`pnpm dev` generates the RSA access-token keypair when it is missing. The
private key is local-only and must never be committed. MongoDB is required;
Redis is optional and disabled by default.

## Environment

See [`.env.example`](./.env.example) for the complete list. Required values are
`MONGODB_URI`, `HMAC_SECRET` and `JWT_REFRESH_SECRET` (at least 32 characters).
RSA key paths default to `src/keys/rsa.private` and `src/keys/rsa.public`;
generate them with `pnpm keys`. `TRUST_PROXY` accepts `true`, `false`, or
comma-separated IP/CIDR ranges. Fastify 5.12 intentionally does not accept
hop-count trust because it can allow direct clients to spoof forwarded headers.

## Routes

Routes use `API_PREFIX` (default `/api/v1`). Every API route, including health
and public auth routes, requires valid `sig` and `ctime` HMAC headers.

| Method | Path             | Auth                 | Description                             |
| ------ | ---------------- | -------------------- | --------------------------------------- |
| GET    | `/health`        | HMAC                 | Server, DB, and Redis status            |
| POST   | `/auth/register` | HMAC                 | Create an account                       |
| POST   | `/auth/login`    | HMAC                 | Log in and issue tokens                 |
| POST   | `/auth/refresh`  | HMAC + refresh token | Rotate the token pair                   |
| POST   | `/auth/logout`   | HMAC                 | Revoke the refresh-token session family |
| GET    | `/auth/me`       | HMAC + access token  | Current user                            |
| GET    | `/users`         | HMAC + admin         | Paginated user list                     |
| GET    | `/users/:id`     | HMAC + admin         | Get a user by ID                        |

OpenAPI is available at `/docs/json`, with the interactive Swagger UI at `/docs`.
In development, Swagger signs "Try it out" requests automatically, so only a
Bearer token is needed for protected routes. HMAC remains enforced by the server;
the secret is served to Swagger only in development.

## Scripts

- `pnpm dev` — watch-mode Fastify server; generates local JWT keys first
- `pnpm keys` — generate the local RSA keypair
- `pnpm build` — type-check (`tsconfig.build.json`) then compile `src` to `dist` with swc
- `pnpm typecheck` — TypeScript check
- `pnpm lint` / `pnpm lint:fix` — ESLint
- `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` — Vitest
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm start` — run `dist/server.js` with Node.js

## Project structure

```text
src/
├── app.ts              # Fastify assembly: plugins, hooks, Swagger, routes
├── server.ts           # MongoDB/Redis + HTTP bootstrap and shutdown
├── config/             # environment, database, Redis, keys, proxy parsing
├── plugins/            # Fastify security hooks and error handlers
├── models/             # Mongoose user and refresh-token models
├── modules/            # health, auth, and user route/controller/service modules
├── routes/             # API plugin registry
├── socket/             # Socket.IO auth, HMAC, and event wiring
├── types/              # shared application and auth types
└── utils/              # JWT, password, HMAC, cookies, cache, and token helpers
test/
├── api.test.ts         # public HTTP contract via app.inject()
├── auth-service.test.ts# refresh rotation and reuse at service boundary
└── helpers/            # HMAC test signer
```

## Documentation

- [`AGENTS.md`](./AGENTS.md) — agent entry point and reading list
- [`CLAUDE.md`](./CLAUDE.md) — coding guidance
- [`docs/`](./docs/README.md) — architecture, API contract, code standards

MIT
