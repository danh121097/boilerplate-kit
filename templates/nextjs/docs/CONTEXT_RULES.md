> **Note — boilerplate template:** This harness ships **markdown-first**. The
> SQLite durable layer and the Rust `harness-cli` are **optional**; the
> `docs/*.md` files are the source of truth.

# Context Engineering Rules

## Context Phases

### Intake Phase

| Document                  | Tiny   | Normal                   | High-Risk |
| ------------------------- | ------ | ------------------------ | --------- |
| `AGENTS.md`               | Must   | Must                     | Must      |
| `docs/FEATURE_INTAKE.md`  | Must   | Must                     | Must      |
| `README.md`               | Should | Must                     | Must      |
| `docs/HARNESS.md`         | Should | Must                     | Must      |
| `docs/ARCHITECTURE.md`    | Skip   | Should                   | Must      |
| Relevant `docs/product/*` | Skip   | Must if behavior changes | Must      |
| `docs/decisions/*`        | Skip   | Should                   | Must      |

### Planning Phase

| Document                                             | Tiny   | Normal                          | High-Risk |
| ---------------------------------------------------- | ------ | ------------------------------- | --------- |
| Current files to edit                                | Must   | Must                            | Must      |
| `docs/TEST_MATRIX.md`                                | Should | Must                            | Must      |
| `docs/system-architecture.md`                        | Skip   | Should                          | Must      |
| `docs/system-architecture/ssr-and-runtime-config.md` | Skip   | Must if touching storage/window | Must      |
| Relevant decisions                                   | Skip   | Should                          | Must      |

### Implementation Phase

| Document                                    | Tiny   | Normal                | High-Risk |
| ------------------------------------------- | ------ | --------------------- | --------- |
| Files being edited                          | Must   | Must                  | Must      |
| `docs/code-standards.md`                    | Should | Must                  | Must      |
| `docs/system-architecture/security-auth.md` | Skip   | Must if touching auth | Must      |
