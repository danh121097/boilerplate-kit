# Database: MongoDB + Mongoose

Mongoose models, transforms, indexes, and the connection lifecycle. Source:
[`config/database.ts`](../../src/config/database.ts),
[`models/user.ts`](../../src/models/user.ts),
[`models/refresh-token.ts`](../../src/models/refresh-token.ts),
[`types/auth.ts`](../../src/types/auth.ts).

## Connection

[`config/database.ts`](../../src/config/database.ts) connects at boot:

```ts
if (!config.isProduction) mongoose.set('debug', true);     // query logging in dev
await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 15000 });
```

- **Fail-fast** — 15 s server-selection timeout (vs Mongoose's 30 s default) so an
  unreachable DB surfaces a clear error instead of hanging the boot.
- **Fail-closed** — on connection error it logs a hint and `process.exit(1)`
  (unlike Redis, the app cannot run without Mongo).
- Connection-level `error` / `disconnected` events are logged.
- `gracefulShutdown` (`SIGINT`/`SIGTERM`) closes Socket.IO, then Mongo, then Redis.

## User Model

[`models/user.ts`](../../src/models/user.ts):

```ts
const userSchema = new Schema<UserDocument>(
  {
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, select: false },        // never returned by default
    name:     { type: String, required: true, trim: true },
    role:     { type: String, enum: Object.values(ROLES), default: ROLES.USER },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,                                                   // createdAt / updatedAt
    toJSON: {
      transform: (_doc, ret) => { delete ret.password; delete ret.__v; return ret; },
    },
  },
);
```

Key behaviors:

- **`password` is `select: false`** — excluded from every query unless explicitly
  asked (`User.findOne(...).select('+password')`, as `login` does).
- **`toJSON` transform deletes `password` and `__v`.** Note it does **not** rename
  `_id` to `id` — serialized users keep the raw `_id` (and the model keeps `__v`
  internally; it is only stripped from JSON output). So API responses still expose
  `_id`.
- **Password hashing** — a `pre('save')` hook bcrypt-hashes the password (cost 12)
  only when modified; `comparePassword` wraps `bcrypt.compare`.
- **Roles** — enum from the single `ROLES` source of truth in
  [`types/auth.ts`](../../src/types/auth.ts) (`user` / `admin` / `super_admin`).

## RefreshToken Model

[`models/refresh-token.ts`](../../src/models/refresh-token.ts):

```ts
{
  token:     { type: String, required: true, index: true },        // SHA-256 hash of the JWT
  userId:    { type: ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },// TTL index
  isRevoked: { type: Boolean, default: false },
}
```

- Stores the **hash**, not the raw token (see
  [auth-jwt-refresh.md](./auth-jwt-refresh.md)).
- **TTL index** `index: { expires: 0 }` on `expiresAt` — MongoDB's background
  reaper deletes documents once `expiresAt` passes, so expired tokens self-purge.
- `timestamps: true` adds `createdAt` / `updatedAt`.

## Indexes Summary

| Collection | Indexed fields | Why |
| --- | --- | --- |
| `users` | `email` (unique) | login lookup + uniqueness |
| `refreshtokens` | `token` | rotation/logout lookup by hash |
| `refreshtokens` | `userId` | per-user queries |
| `refreshtokens` | `expiresAt` (TTL `expires: 0`) | auto-expiry |

## Querying Patterns

- `login` selects the hidden field: `User.findOne({ email }).select('+password')`.
- The user module excludes it defensively: `User.find().select('-password')`.
- Services resolve users by id (`User.findById(...)`) and check `isActive`.

## See Also

- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — how the models are used in auth
- [security-rate-limit.md](./security-rate-limit.md) — Redis (optional, not the DB)
