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
feat(router): add file-based TanStack Router setup
fix(interceptors): prevent refresh loop on anonymous 401
refactor(services): extract HMAC signing into HMACSignatureGenerator
test(auth): add integration tests for token refresh single-flight
```
