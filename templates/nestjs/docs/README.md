<!-- HARNESS-DOC -->
# Documentation Map

Agent-ready documentation for this template. Two layers:

- **Harness layer** — how humans and agents collaborate (ported from
  [repository-harness](https://github.com/hoangnb24/repository-harness),
  markdown-first; the durable-layer CLI is optional).
- **Technical layer** — how THIS codebase is built (stack-specific).

## Harness Layer

| File | Purpose |
| --- | --- |
| [HARNESS.md](./HARNESS.md) | Human ↔ agent collaboration model |
| [FEATURE_INTAKE.md](./FEATURE_INTAKE.md) | Classify work: tiny / normal / high-risk |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Architecture discovery + boundary rules |
| [CONTEXT_RULES.md](./CONTEXT_RULES.md) | What to read per task phase + risk lane |
| [TEST_MATRIX.md](./TEST_MATRIX.md) | Behavior → proof map |
| [HARNESS_BACKLOG.md](./HARNESS_BACKLOG.md) | Friction tracker for missing harness capability |
| [GLOSSARY.md](./GLOSSARY.md) | Shared terms |
| [decisions/](./decisions/README.md) | Architecture Decision Records (ADR log) |
| [templates/](./templates/) | Reusable story / decision / spec / validation templates |
| [stories/](./stories/README.md) | Story packets + backlog |
| [product/](./product/README.md) | Product truth (filled when a spec is derived) |

## Technical Layer

| File | Purpose |
| --- | --- |
| [project-overview-pdr.md](./project-overview-pdr.md) | Vision, stack, constraints, scripts |
| [codebase-summary.md](./codebase-summary.md) | Directory tree, modules, conventions |
| [code-standards.md](./code-standards.md) | Naming, structure, lint, commit convention |
| [system-architecture.md](./system-architecture.md) | Bootstrap, data flow, auth, build pipeline |
| [api-reference.md](./api-reference.md) | All HTTP endpoints, guards, request/response shapes (live OpenAPI at `/docs`) |

## Read Order For New Agents

1. `AGENTS.md` (repo root) — the stable shim + reading list
2. [project-overview-pdr.md](./project-overview-pdr.md) — what this is
3. [codebase-summary.md](./codebase-summary.md) — where things live
4. [code-standards.md](./code-standards.md) — how to write code here
5. [FEATURE_INTAKE.md](./FEATURE_INTAKE.md) — classify before changing code
