# Database: MongoDB + Mongoose

Mongoose models, transforms, indexes, and the connection lifecycle. Source:
[`config/database.ts`](../../src/config/database.ts),
[`models/user.ts`](../../src/models/user.ts),
[`models/refresh-token.ts`](../../src/models/refresh-token.ts),
[`types/auth.ts`](../../src/types/auth.ts).

## Connection

[`config/database.ts`](../../src/config/database.ts) connects at boot:

```ts
if (!config.isProduction) mongoose.set("debug", true); // query logging in dev
await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 15000 });
```

- **Fail-fast** — 15 s server-selection timeout (vs Mongoose's 30 s default) so an
  unreachable DB surfaces a clear error instead of hanging the boot.
- **Fail-closed** — on connection error it logs a hint and `process.exit(1)`
  (unlike Redis, the app cannot run without Mongo).
- Connection-level `error` / `disconnected` events are logged.
- `gracefulShutdown` (`SIGINT`/`SIGTERM`) closes Socket.IO, then Mongo, then Redis.
  Each step runs even if an earlier one fails; exit code 0 when all closed cleanly,
  1 when a step failed or the whole shutdown passed `SHUTDOWN_TIMEOUT_MS` (10 s, below
  a typical 30 s SIGKILL grace period). A repeated signal during shutdown is ignored.

## User Model

[`models/user.ts`](../../src/models/user.ts):

```ts
const userSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, select: false }, // never returned by default
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true, // createdAt / updatedAt
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);
```

Key behaviors:

- **`password` is `select: false`** — excluded from every query unless explicitly
  asked (`User.findOne(...).select('+password')`, as `login` does).
- **`toJSON` transform deletes `password` and `__v`** as a fallback for code that
  serializes a document directly. It does **not** rename `_id` to `id`. API
  responses do not rely on it: controllers call `serializeUser`
  ([`modules/user/serialize-user.ts`](../../src/modules/user/serialize-user.ts)), an
  allowlist that emits `_id` (string), `email`, `name`, `role`, `isActive`, and ISO
  `createdAt` / `updatedAt`, so new schema fields stay private until added there.
- **Password hashing** — a `pre('save')` hook bcrypt-hashes the password (cost 12)
  only when modified; `comparePassword` wraps `bcrypt.compare`.
- **Roles** — enum from the single `ROLES` source of truth in
  [`types/auth.ts`](../../src/types/auth.ts) (`user` / `admin` / `super_admin`).

## RefreshToken Model

[`models/refresh-token.ts`](../../src/models/refresh-token.ts):

```ts
{
  token:     { type: String, required: true, unique: true },       // SHA-256 hash of the JWT
  userId:    { type: ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },// TTL index
  familyId:  { type: String, index: true },                         // one per login/register chain
  isRevoked: { type: Boolean, default: false },
  rotatedAt: { type: Date },                                        // set by rotation only (not logout)
}
```

- Stores the **hash**, not the raw token (see
  [auth-jwt-refresh.md](./auth-jwt-refresh.md)).
- **TTL index** `index: { expires: 0 }` on `expiresAt` — MongoDB's background
  reaper deletes documents once `expiresAt` passes, so expired tokens self-purge.
- `timestamps: true` adds `createdAt` / `updatedAt`.

## Indexes Summary

| Collection      | Indexed fields                 | Why                            |
| --------------- | ------------------------------ | ------------------------------ |
| `users`         | `email` (unique)               | login lookup + uniqueness      |
| `refreshtokens` | `token` (unique)               | rotation/logout lookup by hash |
| `refreshtokens` | `familyId`                     | logout revokes a session chain |
| `refreshtokens` | `userId`                       | per-user queries               |
| `refreshtokens` | `expiresAt` (TTL `expires: 0`) | auto-expiry                    |

## Querying Patterns

- `login` selects the hidden field: `User.findOne({ email }).select('+password')`.
- The user module excludes it defensively: `User.find().select('-password')`.
- Services resolve users by id (`User.findById(...)`) and check `isActive`.

## See Also

- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — how the models are used in auth
- [security-rate-limit.md](./security-rate-limit.md) — Redis (optional, not the DB)
