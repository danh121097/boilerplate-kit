> **Note — boilerplate template:** This harness ships **markdown-first**. The
> SQLite durable layer and the Rust `harness-cli` (`scripts/bin/harness-cli ...`)
> are **optional**; the `docs/*.md` files are the source of truth. To enable the
> CLI later, install repository-harness:
> `curl -fsSL https://raw.githubusercontent.com/hoangnb24/repository-harness/main/scripts/install-harness.sh | bash -s -- --merge --yes`
> Treat any `scripts/bin/harness-cli` example below as optional until then.

# Feature Intake

Every implementation prompt enters the intake gate before code changes.

## Lanes

### Tiny

Low-risk docs, copy, narrow edits. Single file, no interface changes.

### Normal

Multi-file feature work. Requires story packet + proof row in TEST_MATRIX.

### High-Risk

Auth, data model, security, breaking API changes. Requires full story packet

- design doc + validation plan.

## Intake Checklist

1. Restate the work item in one sentence.
2. Identify affected files / domains.
3. Check TEST_MATRIX for existing proof rows.
4. Choose lane: tiny / normal / high-risk.
5. For normal+: create/update story in `docs/stories/`.
6. For high-risk: fill `docs/templates/high-risk-story/` packet.
