# Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/) with an optional
leading emoji. Keep commits focused on the actual change; no secrets in history.

## Format

```
<type>(<scope>): <description>
```

- `<type>` — required (see table). An optional emoji may precede the type.
- `<scope>` — optional but recommended (the area touched, e.g. `auth`, `ui`).
- `<description>` — imperative mood, lowercase, no trailing period.
- **Header ≤ 72 characters.**

## Types

| Type | Use for | Optional emoji |
| --- | --- | --- |
| `feat` | new feature | ✨ |
| `fix` | bug fix | 🐛 |
| `refactor` | code change, no behavior change | ♻️ |
| `perf` | performance improvement | 🚀 |
| `style` | formatting only (no logic) | 💎 |
| `test` | add or fix tests | 🚨 |
| `docs` | documentation only | 📚 |
| `build` | build system or dependencies | 🛠 |
| `ci` | CI configuration | ⚙️ |
| `chore` | other maintenance | ♻️ |
| `revert` | revert a previous commit | ⏪ |

## Examples

```
feat(auth): add login mutation with httpOnly refresh rotation
fix(socket): reconnect on unauthorized handshake error
refactor(services): unwrap api envelope in response interceptor
test(form): cover zod email + password validation messages
```

With optional emoji:

```
✨feat(ui): add floating-label VeeInput wrapper
🐛fix(query): reactivate queryKey on params change
```

## Body (optional)

Wrap at ~72–100 chars. Explain the *why*, not the *what* — list bullet points for
multiple changes:

```
feat(auth): add session persistence

- persist access token for the Bearer header
- server sets/clears the refresh token as an httpOnly cookie
- read .data once since the interceptor unwraps the envelope
```

## Rules

- Imperative mood: "add", not "added" / "adds".
- One logical change per commit.
- Never commit `.env`, API keys, or credentials.
- Do not commit or push unless explicitly asked to.
