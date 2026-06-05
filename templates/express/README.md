# Express starter

Opinionated Node.js + TypeScript backend built on Express 5. Production-grade structure mirroring a real codebase — modular routing, JWT (RS256) + HMAC auth, Socket.io, optional Redis, Zod validation, and a full Vitest suite — kept lean enough to read in one sitting.

## Stack

| Concern        | Choice                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| Runtime        | Node.js + TypeScript (dev/run via [Bun](https://bun.sh), Node-compatible) |
| Framework      | Express 5                                                              |
| Database       | MongoDB via Mongoose                                                   |
| Auth           | JWT access tokens (RS256, file keys) + refresh tokens (httpOnly cookie) |
| API signing    | Optional HMAC request signing (`src/middleware/hmac.ts`)              |
| Realtime       | Socket.io (+ optional `@socket.io/redis-adapter`)                     |
| Cache / limits | Redis (optional) — distributed rate-limit, cache, token revocation     |
| Validation     | Zod schemas per module + `validate()` middleware                       |
| Security       | helmet, cors, compression, cookie-parser, express-rate-limit           |
| Passwords      | bcrypt                                                                  |
| Testing        | Vitest + supertest + `mongodb-memory-server` (no external Mongo needed) |
| Build          | `tsc` + `tsc-alias` (or `swc` via `build:swc`)                          |
| Lint           | ESLint flat config (typescript-eslint)                                 |
| API docs       | Postman collection sync scripts (`scripts/postman/`)                   |

## Setup

```sh
cp .env.example .env          # then edit values
bun install
bun run dev
```

The first `bun run dev` runs `predev`, which executes `src/keys/setup.sh` to generate the
RSA keypair (`src/keys/rsa.private` / `rsa.public`) used to sign access tokens. Both keys are
gitignored — never commit `rsa.private`. Rotate with `sh src/keys/setup.sh --force`.

> Requires `openssl` (for key generation) and a running MongoDB at `MONGODB_URI`.
> Redis is opt-in: leave `REDIS_ENABLED=false` to run fully without it.

## Environment

All variables are documented in [`.env.example`](.env.example). Key ones:

| Variable                | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `PORT`                  | HTTP port (default 3000)                                   |
| `MONGODB_URI`           | MongoDB connection string                                  |
| `API_PREFIX`            | Base path all routes mount under (default `/api/v1`)       |
| `CORS_ORIGIN`           | Allowed CORS origin                                        |
| `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` | RS256 key file paths                    |
| `JWT_REFRESH_SECRET`    | Secret for refresh tokens (min 32 chars)                   |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` | Token lifetimes                         |
| `HMAC_SECRET`           | Secret for HMAC request signing                            |
| `REDIS_ENABLED` / `REDIS_URL` | Toggle + connection for Redis features               |
| `POSTMAN_API_KEY` / `POSTMAN_COLLECTION_UID` | For `postman:generate` sync          |

## Routes

Mounted under `API_PREFIX` (default `/api/v1`):

| Method | Path             | Auth            | Description                       |
| ------ | ---------------- | --------------- | -------------------------------- |
| GET    | `/health`        | public          | Server, DB, and Redis liveness   |
| POST   | `/auth/register` | public          | Create an account                |
| POST   | `/auth/login`    | public          | Log in, set refresh cookie       |
| POST   | `/auth/refresh`  | refresh cookie  | Rotate access token              |
| POST   | `/auth/logout`   | public          | Revoke session / clear cookie    |
| GET    | `/auth/me`       | access token    | Current user                     |
| GET    | `/users`         | admin           | List users                       |
| GET    | `/users/:id`     | access token    | Get user by ID                   |

## Scripts

- `dev` — watch-mode dev server (Bun)
- `build` — `tsc -p tsconfig.build.json` + `tsc-alias`
- `build:swc` — faster build via swc + `tsc-alias`
- `typecheck` — `tsc --noEmit`
- `start` — run the built server (`bun dist/server.js`); `start:node` for Node
- `lint` / `lint:fix` — ESLint
- `test` / `test:watch` / `test:coverage` — Vitest
- `postman:generate` — sync the Postman collection from route metadata

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
