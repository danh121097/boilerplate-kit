# Express starter

Opinionated Node.js + TypeScript backend built on Express 5. Production-grade structure mirroring a real codebase — modular routing, JWT (RS256) + HMAC auth, Socket.io, optional Redis, Zod validation, and a full Vitest suite — kept lean enough to read in one sitting.

## Stack

| Concern        | Choice                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Runtime        | Node.js + TypeScript                                                          |
| Framework      | Express 5                                                                                       |
| Database       | MongoDB via Mongoose                                                                            |
| Auth           | JWT access tokens (RS256, file keys) + refresh tokens (HS256 symmetric secret, httpOnly cookie) |
| API signing    | Optional HMAC request signing (`src/middleware/hmac.ts`)                                        |
| Realtime       | Socket.io (+ optional `@socket.io/redis-adapter`)                                               |
| Cache / limits | Redis (optional) — distributed rate-limit, cache, token revocation                              |
| Validation     | Zod schemas per module + `validate()` middleware                                                |
| Security       | helmet, cors, compression, cookie-parser, express-rate-limit                                    |
| Passwords      | bcrypt                                                                                          |
| Testing        | Vitest + supertest + `mongodb-memory-server` (no external Mongo needed)                         |
| Build          | `tsc --noEmit` type-check + `swc`                                                                |
| Lint           | ESLint flat config (typescript-eslint)                                                          |
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

| Variable                                       | Purpose                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                         | HTTP port (default 3000)                                                                                                                  |
| `MONGODB_URI`                                  | MongoDB connection string                                                                                                                 |
| `API_PREFIX`                                   | Base path all routes mount under (default `/api/v1`)                                                                                      |
| `CORS_ORIGIN`                                  | Allowed CORS origin                                                                                                                       |
| `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` | RS256 key file paths (access)                                                                                                             |
| `JWT_REFRESH_SECRET`                           | HS256 symmetric secret for refresh tokens (≥32 chars, required)                                                                           |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY`     | Token lifetimes                                                                                                                           |
| `HMAC_SECRET`                                  | Secret for HMAC request signing                                                                                                           |
| `REDIS_ENABLED` / `REDIS_URL`                  | Toggle + connection for Redis features                                                                                                    |
| `TRUST_PROXY`                                  | Optional. Behind a reverse proxy/LB: a hop count (`1`, preferred over `true`), or a comma-separated IP/subnet list. Unset = trust nothing |

## Routes

Mounted under `API_PREFIX` (default `/api/v1`):

| Method | Path             | Auth           | Description                    |
| ------ | ---------------- | -------------- | ------------------------------ |
| GET    | `/health`        | public         | Server, DB, and Redis liveness |
| POST   | `/auth/register` | public         | Create an account              |
| POST   | `/auth/login`    | public         | Log in, set refresh cookie     |
| POST   | `/auth/refresh`  | refresh cookie | Rotate access token            |
| POST   | `/auth/logout`   | public         | Revoke session / clear cookie  |
| GET    | `/auth/me`       | access token   | Current user                   |
| GET    | `/users`         | admin          | List users                     |
| GET    | `/users/:id`     | access token   | Get user by ID                 |

## Scripts

The OpenAPI spec is available at `/docs/json`; Swagger UI is available at
`/docs`. In development, Swagger signs "Try it out" requests automatically, so
only a Bearer token is needed for protected routes. The server still enforces HMAC.

- `dev` — watch-mode dev server (tsx)
- `build` — type-check (`tsconfig.build.json`) then compile `src` to `dist` with swc
- `typecheck` — `tsc --noEmit`
- `start` — run the built server with Node (`node dist/server.js`)
- `lint` / `lint:fix` — ESLint
- `test` / `test:watch` / `test:coverage` — Vitest

## Project structure

```
src/
├── app.ts              # Express app assembly (middleware, routes)
├── server.ts           # HTTP + Socket.io bootstrap
├── config/             # environment, database, redis, key loading
├── middleware/         # auth, role, hmac, rate-limit, error handlers
├── models/             # Mongoose models (user, refresh-token)
├── modules/            # feature modules (auth, user): controller/routes/service/validation
├── routes/             # route registry + health check
├── socket/             # Socket.io auth + hmac middleware + event wiring
├── types/              # shared types (auth, routing)
├── utils/              # jwt, password, hmac, cache, cookie, token-revocation helpers
├── keys/               # setup.sh + generated RSA keys (gitignored)
└── __tests__/          # unit + integration tests
```

## License

MIT

## Documentation

This template is agent-ready out of the box:

- [`AGENTS.md`](./AGENTS.md) — agent entry point + reading list (Claude Code, Codex, Cursor, …).
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code guidance for this project.
- [`docs/`](./docs/README.md) — full map: project overview, codebase summary, code standards, system architecture, and **api reference**.
