# Database: MongoDB + Mongoose

Mongoose schemas, transforms, indexes, and the connection lifecycle, wired
through `@nestjs/mongoose`. Source:
[`database/database.module.ts`](../../src/database/database.module.ts),
[`schemas/user.schema.ts`](../../src/schemas/user.schema.ts),
[`schemas/refresh-token.schema.ts`](../../src/schemas/refresh-token.schema.ts).

## Connection

[`database.module.ts`](../../src/database/database.module.ts) connects via
`MongooseModule.forRootAsync`, reading the URI from `AppConfigService`:

```ts
MongooseModule.forRootAsync({
  inject: [AppConfigService],
  useFactory: (config: AppConfigService) => ({
    uri: config.mongodbUri,
    connectionFactory: (connection) => {
      if (!config.isProduction) mongoose.set("debug", true);   // query logging in dev
      return connection;
    },
  }),
});
```

- **Query logging in dev** — `mongoose.set("debug", true)` outside production.
- **Fail-closed at boot** — Nest will not finish bootstrapping if the connection
  fails (the app cannot run without Mongo). `enableShutdownHooks()` in `main.ts`
  closes the connection gracefully on `SIGINT`/`SIGTERM`.
- Schemas are registered per feature with `MongooseModule.forFeature([...])`
  (e.g. `AuthModule` registers `User` + `RefreshToken`; `UserModule` registers
  `User`).

## User Schema

[`schemas/user.schema.ts`](../../src/schemas/user.schema.ts) uses the
decorator-based `@Schema` / `@Prop` API:

```ts
@Schema({
  timestamps: true,                                            // createdAt / updatedAt
  toJSON: { transform: (_doc, ret) => { delete ret.password; delete ret.__v; return ret; } },
})
export class User {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true, index: true })
  email!: string;
  @Prop({ type: String, required: true, select: false })       // never returned by default
  password!: string;
  @Prop({ type: String, required: true, trim: true })
  name!: string;
  @Prop({ type: String, enum: Object.values(ROLES), default: ROLES.USER })
  role!: Role;
  @Prop({ type: Boolean, default: true })
  isActive!: boolean;
}
export const UserSchema = SchemaFactory.createForClass(User);
```

Key behaviors:

- **`password` is `select: false`** — excluded from every query unless explicitly
  projected (`findOne(...).select("+password")`, as `login` does).
- **`toJSON` transform deletes `password` and `__v`.** It does **not** rename
  `_id` to `id` — serialized users keep the raw `_id`.
- **Password hashing** — a `pre("save")` hook bcrypt-hashes the password (cost 12)
  only when modified; `comparePassword` wraps `bcrypt.compare`.
- **Roles** — enum from the single `ROLES` source of truth
  (`src/common/types/auth.types.ts`): `user` / `admin` / `super_admin`.

## RefreshToken Schema

[`schemas/refresh-token.schema.ts`](../../src/schemas/refresh-token.schema.ts):

```ts
@Schema({ timestamps: true })
export class RefreshToken {
  @Prop({ type: String, required: true, index: true })                 // SHA-256 hash of the JWT
  token!: string;
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ type: Date, required: true, index: { expires: 0 } })         // TTL index
  expiresAt!: Date;
  @Prop({ type: Boolean, default: false })
  isRevoked!: boolean;
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
| `refreshtokens` | `userId` | per-user queries (reuse detection `updateMany`) |
| `refreshtokens` | `expiresAt` (TTL `expires: 0`) | auto-expiry |

## Querying Patterns

- `login` selects the hidden field: `findOne({ email }).select("+password")`.
- The user module excludes it defensively: `find().select("-password")`.
- Services resolve users by id (`findById(...)`) and check `isActive`.

## See Also

- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — how the schemas are used in auth
- [security-rate-limit.md](./security-rate-limit.md) — Redis (optional, not the DB)
