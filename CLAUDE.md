# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project Overview

`create-prism-app` — a Node CLI (>= 20, ESM, pnpm) that scaffolds full-stack starters.
The repo holds two things:

- **The CLI** (`src/`) — wizard, option resolving, template fetch, post-processing.
- **The starters** (`templates/<name>/`) — `vuejs`, `nuxtjs`, `reactjs`, `nextjs`,
  `tanstack-start`, `react-native`, `express`, `fastify`, `nestjs`. Each is a standalone
  project with its own `package.json`, lockfile, `AGENTS.md`, `CLAUDE.md` and `docs/`.

**IMPORTANT:** Read `./README.md` before planning or implementing anything. When working
inside `templates/<name>/`, read that template's `CLAUDE.md` / `AGENTS.md` / `docs/README.md`
first — they override this file for that template.

## Commands (root CLI)

```bash
pnpm install
pnpm dev            # tsup --watch
pnpm build          # tsup → dist/cli.mjs
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint .  (lint:fix to autofix)
pnpm format:check   # prettier --check .  (format to write)
pnpm test           # vitest run  (test:watch for watch mode)
node dist/cli.mjs --version
```

CI (`.github/workflows/ci.yml`) runs typecheck → lint → build → test on
ubuntu/macos/windows × Node 20/22. Run the same before handing work back.

## CLI Architecture (`src/`)

- `cli.ts` / `main.ts` — citty entry and orchestration; `options-resolver.ts` merges flags with prompts.
- `wizard/` — one `prompt-*.ts` per interactive question (@clack/prompts).
- `fetcher/` — `template-registry.ts`, `download-template.ts` (giget, or local copy when linked), `validate-ref.ts`, `verify-extraction.ts`.
- `postprocess/` — `rewrite-package-json`, `git-init`, `install-dependencies`, `upgrade-dependencies`, `success-banner`.
- `validators/`, `runtime/` (`run-scaffold`, `tty`), `errors.ts`, `types.ts`.
- Tests live in `src/__tests__/`.

Local development: a linked/`realpath`-resolved `dist/cli.mjs` copies the sibling `templates/`
instead of hitting GitHub; `BOILERPLATE_KIT_LOCAL` forces a root. Details in the README.

## Adding or Changing a Template

1. Add `templates/<name>/` (must include `package.json` + `README.md`, plus `AGENTS.md`, `CLAUDE.md`, `docs/`).
2. Register the key in `src/types.ts` (`TEMPLATES`) and label it in `src/wizard/prompt-template.ts`.
3. Update `src/__tests__/template-registry.test.ts`, and the stack table / `--template` list in `README.md`.
4. **Shared files** (TanStack Query layer, test setups, etc.) are copied between templates and
   guarded by `src/__tests__/template-shared-files.test.ts`. Edit the canonical copy (first root
   listed in the test), copy it to the others, then run `pnpm test`.
5. Keep each template's docs in sync with its code (docs are agent-facing and verified against source).

## Development Rules

- **YAGNI / KISS / DRY.** Match surrounding code: naming, comment density, idioms.
- Files over ~200 LOC: consider splitting along real boundaries. Check existing modules first.
  Use descriptive kebab-case filenames (not for Markdown, config, env, shell scripts).
- Handle errors and edge cases; keep public CLI flags and template contracts stable unless intentional.
- ESLint uses `eslint-plugin-perfectionist` (sorted imports/keys/etc.) and Prettier — run `pnpm lint:fix` / `pnpm format`.
- No secrets, `.env` files, or keys in commits. Templates must not ship lockfiles' local junk (`node_modules`, `dist`, `tsconfig.tsbuildinfo`).
- Never modify skills in `~/.claude/skills` directly unless asked.

## Git

- Conventional Commits with emoji: `<type>(<scope>): <icon> <description>`, header ≤ 72 chars, imperative.
  Types: `✨feat`, `🐛fix`, `📚docs`, `💎style`, `📦refactor`, `🚀perf`, `🚨test`, `🛠build`, `⚙️ci`, `♻️chore`, `⏪revert`.
  Scopes seen here: `templates`, `config`, `backend`, `docs`, plus per-stack names.
- No AI references in commit messages. Do not commit or push unless asked.
- Default branch is `master` (templates are fetched from `#master`).

## Plans & Docs

- Plans live in `plans/<YYMMDD-HHMM>-<slug>/` (`plan.md` + `phase-NN-*.md`); reports in `plans/reports/`;
  reusable skeletons in `plans/templates/` (see `template-usage-guide.md`).
- Documentation lives **per template** in `templates/<name>/docs/` (thin top-level `.md` index →
  matching `docs/<topic>/` folder). There is no root `./docs`. Update a template's docs only when its
  behavior, setup, commands, config, or architecture change; read before editing, verify against source after.
- Reports: sacrifice grammar for concision; list unresolved questions at the end.
