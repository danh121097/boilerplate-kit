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
generate them with `pnpm keys`. `LOG_LEVEL` (`debug`, `info`, `warn`, `error`) defaults to `debug` in
development and `info` in production. `DOCS_ENABLED` optionally forces Swagger on or off (unset = on outside
production). `PORT` defaults to `3000`, `REDIS_URL` to `redis://localhost:6379`
(used only when `REDIS_ENABLED=true`), `COOKIE_DOMAIN` (optional) sets the auth cookie domain, and `APP_NAME` (optional) sets the Swagger title.
`ENABLE_CSRF` turns on the Origin/Referer check for state-changing requests. `TRUST_PROXY` accepts `true`, `false`, or
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

OpenAPI JSON is served at `/docs/json` and Swagger UI at `/docs`. In
development, Swagger UI signs "Try it out" requests automatically, so only a
Bearer token is needed for protected routes. The server still enforces HMAC,
and the HMAC secret is served to Swagger only in development. Docs are on
outside production and off in production unless `DOCS_ENABLED=true`;
`DOCS_ENABLED=false` hides them everywhere. `NODE_ENV` defaults to
`development` when unset, so always set `NODE_ENV=production` on deploys.

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
├── docs/               # Swagger HMAC interceptor and response descriptions
├── plugins/            # HMAC/CSRF hooks, authenticate, requireMinRole, error handlers
├── models/             # Mongoose user and refresh-token models
├── modules/            # health, auth, and user route/controller/service modules
├── routes/             # API plugin registry
├── socket/             # Socket.IO auth, HMAC, and event wiring
├── types/              # shared application and auth types
└── utils/              # JWT, password, HMAC, cookies, cache, and token helpers
test/
├── unit/               # pure helpers, hooks, schemas, config, socket units
├── integration/        # HTTP routes via app.inject(), services, Socket.IO, Redis outage
└── helpers/            # HMAC signers, signed-request client, test-user factory
```

## Documentation

- [`AGENTS.md`](./AGENTS.md) — agent entry point and reading list
- [`CLAUDE.md`](./CLAUDE.md) — coding guidance
- [`docs/`](./docs/README.md) — architecture, API contract, code standards

MIT
