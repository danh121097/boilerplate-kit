# Commit Convention

Conventional Commits format: `<type>(<scope>): <description>`

## Types

| Type | Use for |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Tooling, config, dependency updates |
| `perf` | Performance improvement |
| `ci` | CI/CD changes |

## Rules

- Header ≤ 72 characters.
- Imperative mood: "add login form" not "added login form".
- No AI references in commit messages.
- Scope is optional but recommended (e.g. `feat(auth): add refresh token rotation`).
- Do not auto-commit unless the user explicitly asks in the current turn.

## Examples

```
feat(users): prefetch the users list on the server
fix(interceptors): prevent refresh loop on anonymous 401
refactor(server): extract cookie forwarding into server-api
test(auth): cover refresh single-flight across tabs
```
