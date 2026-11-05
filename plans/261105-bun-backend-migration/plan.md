# Migrate backend templates to Bun

## Outcome and boundaries

Run the Express, Fastify and NestJS applications on Bun in development and production while preserving their existing HTTP, authentication, database and realtime contracts. Keep the root CLI and frontend templates on their existing runtimes, preserve the CLI's package-manager choices, and retain the existing compiler and test tooling where needed. Do not change frameworks, schemas, token formats or unrelated dependencies.

## Acceptance criteria

- [x] Each backend's documented development and production entrypoints execute under Bun; watch, build, typecheck and existing key generation work, and repeated starts do not rotate keys.
- [x] Each backend preserves its own API envelopes, route/guard precedence, JWT and refresh rotation, HMAC, cookies, RBAC, MongoDB, Redis, Socket.IO and Swagger behavior. Full Vitest suites and real-Redis lanes passed with Bun workers.
- [x] NestJS dependency injection and schema metadata work with the existing SWC build; existing credentials, hashes and tokens remain compatible.
- [x] Clean installs, native dependencies, Socket.IO dependency resolution and generated-project flows work with the supported package-manager choices. Bun version and lockfile requirements are explicit and reproducible.
- [x] Production Docker images run Bun with externally supplied secrets and keys. A freshly scaffolded project's documented Docker workflow works; images respond and stop correctly.
- [ ] CI verifies the root CLI and backend builds and exercises the actual Bun application, including a real Redis lane that must not be silently skipped.
- [x] Documentation reflects verified commands, requirements and operational behavior. No keys or environment values enter Git, images or reports.
- [x] Relevant checks pass; separate QA and code-review passes cover the same diff (single-session, per user instruction). Record unavailable environments or remaining gaps honestly.

## Phases and ownership

1. **Baseline and shared contracts — lead.** Capture branch/status, existing test behavior, runtime/tool availability, package-manager and lockfile/scaffold constraints. Establish one common runtime contract: Bun for application entrypoints; preserve TypeScript, SWC and Vitest until compatibility is demonstrated. Gate tier: **high**, because authentication, native dependencies and production infrastructure are affected.
2. **Application migration — direct implementation.** Own the respective `templates/express`, `templates/fastify`, and `templates/nestjs` application scripts, app/test files and documentation; avoid Docker and CI ownership. Verify Bun runtime, typechecking, build, keys, APIs and compatibility; NestJS must retain decorator metadata. Reuse existing tests and add targeted coverage only for behavior not already protected.
3. **Delivery and lockfiles — direct implementation.** Own the three Dockerfiles, relevant Docker ignore files, and root GitHub Actions workflow. Coordinate lockfile and script contracts with backend owners and lead; verify clean and scaffolded Docker builds, runtime, external keys and termination. Keep root CLI CI on Node. Check real Redis lane runs tests rather than skipping.
4. **Integration and gates — direct implementation.** Test the exact combined diff, including untracked files. Run root checks, per-template checks, generated-project and real Bun/Redis/container scenarios. Conduct distinct QA and code-review passes in this session; these are not independent reviews, per the user’s no-subagent instruction.
5. **Documentation and handoff — direct implementation.** Update only affected setup/architecture docs, record command results and remaining limitations, update this checklist, and commit as requested. Do not push, publish or deploy.

## Verification details

- Compare behavior against each template's documented API and existing Node baseline; preserve error and guard behavior rather than imposing parity across frameworks.
- Exercise Bun application processes through HTTP and Socket.IO, including auth/refresh/HMAC, Redis on/off/outage and graceful shutdown. A Vitest process running on Node alone does not prove Bun compatibility.
- Use disposable MongoDB and Redis instances and only task-owned processes. Do not expose actual environment values or secrets.
- Smoke fresh scaffolds with the supported package managers, verifying lockfile handling and the documented Docker path. Test production images without baking in keys or development dependencies.
- Retain a rollback path through the prior Node image/revision with existing keys and data unchanged.

## Evidence and status

- Baseline: branch `master`, HEAD `712890b25a3216ba1ff5b456716a83c71dfe030e`; working tree initially clean.
- Initial feasibility: Bun 1.3.10 successfully loaded existing `bcrypt` dependencies and performed hash/compare in all three templates; full clean installs and applications were not yet verified.
- Bun 1.3.10 failed to import BSON 7.3.x; Bun 1.4.4 was used for verification and the supported minimum is 1.4.0. NestJS development retains Nest CLI/SWC with `--exec bun` because direct TypeScript execution failed on a type-only export.
- Root checks: typecheck, lint, build and 97 tests passed. Backend suites ran with Bun 1.4.4 workers: Express 345, Fastify 364, NestJS 397 tests; real Redis lanes: 3 tests each. Existing Node test commands remain available.
- Bun runtime: signed health and OpenAPI, invalid auth, register/login, JWT, refresh rotation/logout, MongoDB, Redis enabled/disabled, and Socket.IO polling/WebSocket passed for all three. Node-issued passwords and tokens worked under Bun. Production containers passed with mounted keys; missing keys were rejected; Redis outage/recovery passed.
- Fresh scaffold: Bun, npm and pnpm installs/builds and dev key bootstrap passed for all three; Yarn 1 installs/builds/dev passed in Linux containers. Docker builds passed for all Bun scaffolds and representative npm, pnpm and Yarn lockfile migrations. Remote fetch filtering and preservation of existing lockfiles have regression tests.
- CI workflow is configured and YAML-parsed; an actual GitHub Actions run remains pending until changes are pushed. No push, deployment or external production mutation was performed.
- Bun-specific Vitest configuration transforms Zod to work around Bun/Vitest module interop; the complete suites and Redis lanes passed without weakening assertions. CI now runs both Node and Bun test lanes.
- Final QA and review are single-session logical passes, not independent-agent reviews. Platform scope verified locally: macOS arm64 and Linux arm64 containers; Windows and Linux x64 were not run.
