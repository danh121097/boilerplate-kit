# Commit Convention

Back to [Code Standards](../code-standards.md).

Use [Conventional Commits](https://www.conventionalcommits.org/). An optional
leading emoji is allowed but not required — the type is what matters.

## Format

```
<type>(<scope>): <description>
```

- **Header ≤ 72 characters.**
- **Imperative mood**, present tense: "add", "fix", "remove" — not "added" /
  "fixes".
- Lowercase description, no trailing period.
- `scope` is optional but recommended — usually the module or area touched
  (`auth`, `jwt`, `routing`, `config`).

## Types

| Type | Use for |
| --- | --- |
| `feat` | new feature |
| `fix` | bug fix |
| `refactor` | code change that neither fixes a bug nor adds a feature |
| `perf` | performance improvement |
| `test` | adding or fixing tests |
| `docs` | documentation only |
| `style` | formatting / lint, no logic change |
| `build` | build system or dependencies |
| `chore` | other maintenance |

## Examples

```
feat(auth): add refresh-token rotation on /refresh
fix(jwt): pin RS256 and reject refresh tokens at access verification
refactor(routing): build router from declarative RouteGroup
test(auth): cover login failure for inactive users
docs(code-standards): document AppError error contract
build(deps): bump zod to v4
```

Body (optional) explains the why, wrapped at ~72 cols:

```
feat(auth): revoke outstanding access tokens on logout

Logout now flags the stored refresh token and calls revokeUserTokens so a
stolen access token stops working at its next request (no-op when Redis off).
```

## Rules

- **No auto-commit.** Never run `git commit` or `git push` unless the request
  explicitly asks for it in the current task.
- One logical change per commit; keep the diff focused.
- Never commit secrets, `.env`, or RSA keys (`src/keys/*`).
- Write messages that describe the change, not the process or tooling.
