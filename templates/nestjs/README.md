# NestJS starter

Opinionated Node.js + TypeScript backend built on NestJS 11. Production-grade
structure mirroring a real codebase — modular controllers, a single composite
security guard (HMAC → CSRF → JWT → roles), JWT (RS256 access + HS256 refresh
rotation with reuse detection), Socket.IO, optional Redis, Zod-validated DTOs,
live Swagger docs, and a full Vitest suite — kept lean enough to read in one
sitting.

## Stack

| Concern        | Choice                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| Runtime        | Node.js + TypeScript (pnpm recommended; PM-agnostic)                   |
| Framework      | NestJS 11 (`@nestjs/platform-express`)                                 |
| Database       | MongoDB via `@nestjs/mongoose`                                         |
| Auth           | JWT access tokens (RS256, file keys) + refresh tokens (HS256 symmetric secret, httpOnly cookie) |
| Request signing| HMAC request signing on every route (composite `SecurityGuard`)        |
| Realtime       | Socket.IO via `@nestjs/websockets` (+ optional `@socket.io/redis-adapter`) |
| Cache / limits | Redis (optional) — distributed throttler store, cache, token revocation |
| Validation     | Zod schemas + `nestjs-zod` DTOs + global `ZodValidationPipe`           |
| Security       | helmet, CORS (credentials), compression, cookie-parser, `@nestjs/throttler` |
| Passwords      | bcrypt                                                                  |
| API docs       | `@nestjs/swagger` — live OpenAPI UI at `/docs`                         |
| Testing        | Vitest (via `unplugin-swc`) + supertest + `mongodb-memory-server`      |
| Build          | `nest build`                                                          |
| Lint / format  | ESLint flat config + Prettier                                         |

## Setup

```sh
cp .env.example .env          # then edit values
pnpm install
pnpm keys                     # generate the RS256 keypair (src/keys/rsa.*)
docker compose up -d          # start MongoDB (+ Redis) locally
pnpm dev
```

`pnpm keys` runs a portable Node script (`scripts/ensure-keys.mjs`) that
generates the RSA keypair (`src/keys/rsa.private` / `rsa.public`) used to sign
access tokens — no openssl needed (`src/keys/setup.sh` is the openssl
alternative). The `predev` hook runs it automatically if the keys are absent.
Both keys are gitignored — never commit `rsa.private`. Rotate with
`pnpm keys --force`.

> Requires a running MongoDB at `MONGODB_URI`. Redis is opt-in: leave
> `REDIS_ENABLED=false` to run fully without it. `docker-compose.yml` provides
> both.

Once running:

- API base: `http://localhost:3000/api/v1`
- **Swagger UI: `http://localhost:3000/docs`** (OpenAPI JSON at `/docs-json`)

> HMAC guards every route. In **dev**, Swagger "Try it out" **auto-signs** each
> request (`sig`/`ctime` computed in the browser), so it works out of the box. The
> auto-signing is disabled in production and the secret is never embedded in the page.
> See [docs/api-reference.md](./docs/api-reference.md).

## Environment

All variables are documented in [`.env.example`](.env.example). Key ones:

| Variable                | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `PORT`                  | HTTP port (default 3000)                                   |
| `MONGODB_URI`           | MongoDB connection string (required)                       |
| `API_PREFIX`            | Base path all routes mount under (default `/api/v1`)       |
| `ENABLE_CSRF`           | Toggle the origin/CSRF guard step (default false)          |
| `COOKIE_DOMAIN`         | Cookie domain for split-domain deploys (empty = host-only) |
| `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` | RS256 keypair file paths (access)        |
| `JWT_REFRESH_SECRET`    | HS256 symmetric secret for refresh tokens (≥32 chars, required) |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` | Token lifetimes                         |
| `HMAC_SECRET`           | Secret for HMAC request signing (required)                 |
| `REDIS_ENABLED` / `REDIS_URL` | Toggle + connection for Redis features               |
| `LOG_LEVEL`             | `debug` / `info` / `warn` / `error` (defaults by env)      |

## Routes

Mounted under `API_PREFIX` (default `/api/v1`). The live reference is Swagger at
`/docs`; full detail in [docs/api-reference.md](./docs/api-reference.md).

| Method | Path             | Auth            | Description                       |
| ------ | ---------------- | --------------- | -------------------------------- |
| GET    | `/health`        | public (HMAC)   | Server, DB, and Redis liveness   |
| POST   | `/auth/register` | public (HMAC)   | Create an account                |
| POST   | `/auth/login`    | public (HMAC)   | Log in, set refresh cookie       |
| POST   | `/auth/refresh`  | public (HMAC)   | Rotate access token (reuse-detected) |
| POST   | `/auth/logout`   | public (HMAC)   | Revoke session / clear cookie    |
| GET    | `/auth/me`       | access token    | Current user                     |
| GET    | `/users`         | admin           | List users                       |
| GET    | `/users/:id`     | admin           | Get user by ID                   |

## Scripts

- `dev` — watch-mode dev server (`nest start --watch`)
- `build` — `nest build`
- `typecheck` — `tsc --noEmit`
- `start` — run the built server (`node dist/src/main.js`)
- `lint` / `lint:fix` — ESLint
- `format` / `format:check` — Prettier
- `test` / `test:watch` / `test:coverage` — Vitest
- `keys` — generate / rotate the RS256 keypair

> Scripts are package-manager agnostic — `pnpm run …`, `npm run …`, `yarn …`,
> or `bun run …` all work.

## Project structure

```
src/
├── main.ts             # Bootstrap: middleware, global prefix, CORS, Swagger, WS adapter
├── app.module.ts       # Root module: wires every feature module + global guards
├── config/             # ConfigModule + Zod env schema + AppConfigService + key loader
├── common/             # @Global: SecurityGuard, services/, utils/, pipe, filter, decorators, throttler/, swagger/
├── database/           # MongooseModule.forRootAsync
├── schemas/            # Mongoose @Schema classes (user, refresh-token)
├── modules/            # feature modules (auth, user, health, realtime): controller/service/(dto)/module
│   ├── auth/           # + password.service + cookie.util (auth-domain helpers)
│   ├── user/
│   ├── health/         # GET /health
│   └── realtime/       # @WebSocketGateway + RedisIoAdapter + emit helpers
├── redis/              # @Global shared ioredis client (optional)
└── keys/               # setup.sh + generated RSA keys (gitignored)

test/                   # unit + e2e (mongodb-memory-server, supertest, socket.io-client)
```

## License

MIT

## Documentation

This template is agent-ready out of the box:

- [`AGENTS.md`](./AGENTS.md) — agent entry point + reading list (Claude Code, Codex, Cursor, …).
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code guidance for this project.
- [`docs/`](./docs/README.md) — full map: project overview, codebase summary, code standards, system architecture, and **api reference**.
