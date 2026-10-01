# Express starter

Opinionated Node.js + TypeScript backend built on Express 5. Production-grade structure mirroring a real codebase — modular routing, JWT (RS256) + HMAC auth, Socket.io, optional Redis, Zod validation, and a full Vitest suite — kept lean enough to read in one sitting.

## Stack

| Concern        | Choice                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Runtime        | Node.js + TypeScript                                                                            |
| Framework      | Express 5                                                                                       |
| Database       | MongoDB via Mongoose                                                                            |
| Auth           | JWT access tokens (RS256, file keys) + refresh tokens (HS256 symmetric secret, httpOnly cookie) |
| API signing    | HMAC request signing, required (`src/middleware/hmac.ts`)                                       |
| Realtime       | Socket.io (+ optional `@socket.io/redis-adapter`)                                               |
| Cache / limits | Redis (optional) — distributed rate-limit, cache, token revocation                              |
| Validation     | Zod schemas per module + `validate()` middleware                                                |
| Security       | helmet, cors, compression, cookie-parser, express-rate-limit                                    |
| Passwords      | bcrypt                                                                                          |
| Testing        | Vitest + supertest + `mongodb-memory-server` (no external Mongo needed)                         |
| Build          | `tsc --noEmit` type-check + `swc`                                                               |
| Lint / format  | ESLint flat config (typescript-eslint) + Prettier                                               |
| API docs       | OpenAPI spec + Swagger UI at `/docs`                                                            |

## Setup

```sh
cp .env.example .env          # then edit values
pnpm install
pnpm dev
```

The first `pnpm dev` runs `predev`, which executes `scripts/ensure-keys.mjs` to generate the
RSA keypair (`src/keys/rsa.private` / `rsa.public`) used to sign access tokens. Both keys are
gitignored — never commit `rsa.private`. Rotate with `pnpm keys --force` (or `sh src/keys/setup.sh --force`).

> Requires `openssl` (for key generation) and a running MongoDB at `MONGODB_URI`.
> Redis is opt-in: leave `REDIS_ENABLED=false` to run fully without it.

## Environment

All variables are documented in [`.env.example`](.env.example). Key ones:

| Variable                                       | Purpose                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                         | HTTP port (default 3000)                                                                                                                                                                                                                                                                                                                                              |
| `MONGODB_URI`                                  | MongoDB connection string                                                                                                                                                                                                                                                                                                                                             |
| `API_PREFIX`                                   | Base path all routes mount under (default `/api/v1`)                                                                                                                                                                                                                                                                                                                  |
| `ENABLE_CSRF`                                  | Optional. `true` turns on the Origin allow-list guard for mutating methods (default off). Allowed origins are the hard-coded `corsOrigins` list in `src/config/environment.ts` — edit it before deploying. Requests with no `Cookie`, `Origin` and `Referer` header (native apps, server-to-server) are exempt: with no ambient credentials there is nothing to forge |
| `COOKIE_DOMAIN`                                | Optional. Cookie `Domain` for split-domain deploys. Unset = host-only cookie                                                                                                                                                                                                                                                                                          |
| `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` | RS256 key file paths (access)                                                                                                                                                                                                                                                                                                                                         |
| `JWT_REFRESH_SECRET`                           | HS256 symmetric secret for refresh tokens (required; use ≥32 random chars — length is not enforced)                                                                                                                                                                                                                                                                   |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY`     | Token lifetimes                                                                                                                                                                                                                                                                                                                                                       |
| `HMAC_SECRET`                                  | Required. Secret for HMAC request signing; must equal the secret the client signs with. Anti-abuse only: a secret shipped to a browser or app is public                                                                                                                                                                                                               |
| `REDIS_ENABLED` / `REDIS_URL`                  | Toggle + connection for Redis features                                                                                                                                                                                                                                                                                                                                |
| `TRUST_PROXY`                                  | Optional. Behind a reverse proxy/LB: a hop count (`1`, preferred over `true`), or a comma-separated IP/subnet list. Unset = trust nothing                                                                                                                                                                                                                             |
| `LOG_LEVEL`                                    | Optional. `debug` / `info` / `warn` / `error`. Unset = `debug` in development, `info` in production                                                                                                                                                                                                                                                                   |
| `APP_NAME`                                     | Optional. Swagger title; unset = default title                                                                                                                                                                                                                                                                                                                        |
| `DOCS_ENABLED`                                 | Optional. Swagger UI + OpenAPI at `/docs`. Unset = on outside production, off in production; `true`/`false` overrides                                                                                                                                                                                                                                                 |

## Routes

Mounted under `API_PREFIX` (default `/api/v1`):

| Method | Path             | Auth          | Description                    |
| ------ | ---------------- | ------------- | ------------------------------ |
| GET    | `/health`        | public        | Server, DB, and Redis liveness |
| POST   | `/auth/register` | public        | Create an account              |
| POST   | `/auth/login`    | public        | Log in, set refresh cookie     |
| POST   | `/auth/refresh`  | refresh token | Rotate access token            |
| POST   | `/auth/logout`   | public        | Revoke session / clear cookie  |
| GET    | `/auth/me`       | access token  | Current user                   |
| GET    | `/users`         | admin         | List users                     |
| GET    | `/users/:id`     | admin         | Get user by ID                 |

OpenAPI JSON is served at `/docs/json` and Swagger UI at `/docs`. In
development, Swagger UI signs "Try it out" requests automatically, so only a
Bearer token is needed for protected routes. The server still enforces HMAC,
and the HMAC secret is served to Swagger only in development. Docs are on
outside production and off in production unless `DOCS_ENABLED=true`;
`DOCS_ENABLED=false` hides them everywhere. `NODE_ENV` defaults to
`development` when unset, so always set `NODE_ENV=production` on deploys.

## Scripts

- `dev` — watch-mode dev server (tsx)
- `build` — type-check (`tsconfig.build.json`) then compile `src` to `dist` with swc
- `typecheck` — `tsc --noEmit -p tsconfig.test.json` (includes tests)
- `keys` — generate the RSA keypair (`--force` rotates)
- `format` / `format:check` — Prettier
- `start` — run the built server with Node (`node dist/server.js`)
- `lint` / `lint:fix` — ESLint
- `test` / `test:watch` / `test:coverage` — Vitest

## Project structure

```
src/
├── app.ts              # Express app assembly (middleware, routes)
├── server.ts           # HTTP + Socket.io bootstrap
├── config/             # environment, database, redis, key loading
├── docs/               # OpenAPI document builder + Swagger HMAC interceptor
├── middleware/         # auth, role, hmac, verify-origin, rate-limit, error handlers
├── models/             # Mongoose models (user, refresh-token)
├── modules/            # feature modules (auth, user): controller/routes/service/validation (+ auth/refresh-session, user/serialize-user)
├── routes/             # route registry + health check
├── socket/             # Socket.io auth + hmac middleware + event wiring
├── types/              # shared types (auth, routing, pagination)
├── utils/              # jwt, password, hmac, cache, cookie, logger, pagination, token-revocation helpers
├── keys/               # setup.sh + generated RSA keys (gitignored)
└── __tests__/          # unit/, integration/, helpers/ (Vitest)
```

## License

MIT

## Documentation

This template is agent-ready out of the box:

- [`AGENTS.md`](./AGENTS.md) — agent entry point + reading list (Claude Code, Codex, Cursor, …).
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code guidance for this project.
- [`docs/`](./docs/README.md) — full map: project overview, codebase summary, code standards, system architecture, and **api reference**.
