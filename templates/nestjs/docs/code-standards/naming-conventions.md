# Naming Conventions

Back to [Code Standards](../code-standards.md). Filenames are covered in
[file-naming.md](./file-naming.md); this page covers identifiers in code.

## Variables & functions

- `camelCase` for variables and functions: `accessToken`, `hashedToken`,
  `requiredRank`, `rawRefreshToken`.
- Functions / methods read as verbs: `signAccessToken`, `verifyRefreshToken`,
  `hashToken`, `revokeUserTokens`, `validatePasswordStrength`.
- Controller handlers are named for the action: `register`, `login`, `refresh`,
  `logout`, `getMe`, `listUsers`, `getUserById`.
- Module-level constants are `SCREAMING_SNAKE_CASE`: `ROLE_RANK`,
  `MAX_TIMESTAMP_AGE_MS`, `SOCKET_HMAC_PATH`, `IS_PUBLIC_KEY`, `ROLES_KEY`.

## Types, classes & providers

- `PascalCase` for types, interfaces, classes, and Nest providers: `AppException`,
  `JwtPayload`, `AuthTokens`, `SecurityGuard`, `TokenService`, `AppConfigService`.
- Providers carry their role suffix: `*Service`, `*Guard`, `*Filter`, `*Pipe`,
  `*Controller`, `*Module`.
- No `I`-prefix on interfaces.
- Union string literals for closed sets — define once, derive the rest:

  ```ts
  export type ErrorType =
    | "VALIDATION_ERROR"
    | "AUTHENTICATION_ERROR"
    | "AUTHORIZATION_ERROR"
    | "NOT_FOUND"
    | "CONFLICT"
    | "RATE_LIMIT"
    | "INTERNAL_ERROR";
  ```

## Roles: single source of truth

Closed enums are declared once as a `const` object, with the type derived from
its values — never duplicate the list (`src/common/types/auth.types.ts`):

```ts
export const ROLES = {
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_RANK: Record<Role, number> = { user: 1, admin: 2, super_admin: 3 };
```

`ROLES` feeds both the Mongoose schema `enum` and the `Role` type; `ROLE_RANK`
feeds the role step of `SecurityGuard` (`src/schemas/user.schema.ts`).

## Zod schemas & DTOs

- Suffix schema constants with `Schema`: `registerSchema`, `loginSchema`.
- Wrap the schema in a `createZodDto` class named `<Action>Dto`: `RegisterDto`,
  `LoginDto`, `RefreshDto`. Each lives in the feature's `dto/`.
- Field-level error messages are written for humans and surfaced verbatim by the
  global `ZodValidationPipe`:

  ```ts
  password: z.string().min(8, "Password must be at least 8 characters"),
  ```

## Mongoose schemas

- Schema classes are `PascalCase` singular: `User`, `RefreshToken`; the exported
  `*Schema` factory is `UserSchema`, `RefreshTokenSchema`.
- Schema fields are `camelCase`: `isActive`, `expiresAt`, `isRevoked`, `userId`.
  `timestamps: true` supplies `createdAt` / `updatedAt`.

## API field naming

- **Request bodies** use `camelCase` (validated by the DTO): `email`, `password`,
  `name`, `refreshToken`.
- **Success responses** follow a stable envelope:

  ```json
  { "success": true, "message": "Login successful!", "data": { "user": {}, "tokens": {} } }
  ```

  (The user module uses `{ "status": "success", "data": [...], "meta": {...} }`
  for list endpoints.)

- **Error responses** are shaped by `HttpExceptionFilter` and intentionally
  expose both `errorType` and the client-facing `error_code` / `error_message`
  aliases (`snake_case`) — these names are part of the contract the frontend
  expects, so keep them:

  ```json
  {
    "success": false,
    "status": "error",
    "errorType": "AUTHENTICATION_ERROR",
    "message": "Invalid email or password!",
    "error_code": 401,
    "error_message": "Invalid email or password!"
  }
  ```
