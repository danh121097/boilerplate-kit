# Agent Instructions

**Project**: `express-starter` — Node.js + Express + TypeScript backend.
JWT access tokens + httpOnly refresh-token rotation, HMAC-signed requests,
MongoDB/Mongoose, Redis (cache + rate limit + token revocation), Socket.IO,
rate limiting. Package manager: **bun**.

Project-specific guidance lives in [`CLAUDE.md`](./CLAUDE.md) and [`docs/`](./docs/README.md).

<!-- HARNESS:BEGIN -->
## Harness

This repo uses Harness (markdown-first). Before work, read:

- `README.md`
- `docs/HARNESS.md` — human ↔ agent collaboration model
- `docs/FEATURE_INTAKE.md` — classify work (tiny / normal / high-risk)
- `docs/ARCHITECTURE.md` — boundaries + discovery
- `docs/CONTEXT_RULES.md` — what to read per phase + risk lane
- `docs/TEST_MATRIX.md` — behavior → proof

The SQLite durable layer and the Rust `harness-cli` are **optional**; the
`docs/*.md` files are the source of truth. To enable the CLI, install
repository-harness:

```bash
curl -fsSL https://raw.githubusercontent.com/hoangnb24/repository-harness/main/scripts/install-harness.sh | bash -s -- --merge --yes
```
<!-- HARNESS:END -->
