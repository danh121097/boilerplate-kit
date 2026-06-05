# Naming Conventions

Back to [Code Standards](../code-standards.md). Filenames are covered in
[file-naming.md](./file-naming.md); this page covers identifiers in code.

## Variables & functions

- `camelCase` for variables and functions: `accessToken`, `hashedToken`,
  `requiredRank`, `extractAccessToken`.
- Functions read as verbs: `signAccessToken`, `verifyRefreshToken`,
  `createRefreshTokenInDb`, `revokeUserTokens`, `buildPayload`.
- Exported handlers are named for the action: `register`, `login`, `refresh`,
  `logout`, `getMe`.
- Module-level constants are `SCREAMING_SNAKE_CASE`:
  `REFRESH_TOKEN_EXPIRY_DAYS`, `ROLE_RANK`.

## Types & interfaces

- `PascalCase` for types, interfaces, classes: `AppError`, `JwtPayload`,
  `AuthTokens`, `UserDocument`, `RouteGroup`, `RouteConfig`,
  `EnvironmentConfig`.
- No `I`-prefix on interfaces.
- Union string literals for closed sets — define once, derive the rest:

  ```ts
  export type ErrorType =
    | 'VALIDATION_ERROR'
    | 'AUTHENTICATION_ERROR'
    | 'AUTHORIZATION_ERROR'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'RATE_LIMIT'
    | 'INTERNAL_ERROR';
  ```

## Roles: single source of truth

Closed enums are declared once as a `const` object, with the type derived from
its values — never duplicate the list:

```ts
export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
```

`ROLES` feeds both the Mongoose schema `enum` and the `Role` type
(`src/types/auth.ts`, `src/models/user.ts`).

## Zod schemas

- Suffix schema constants with `Schema`: `registerSchema`, `loginSchema`.
- Each schema lives in the feature's `validation.ts`.
- Field-level error messages are written for humans and surfaced verbatim by the
  `validate()` middleware:

  ```ts
  password: z.string().min(8, 'Password must be at least 8 characters'),
  ```

## Mongoose models

- Model variables are `PascalCase` singular: `User`, `RefreshToken`.
- The matching document interface is `<Name>Document`: `UserDocument`,
  `RefreshTokenDocument`.
- Schema fields are `camelCase`: `isActive`, `expiresAt`, `isRevoked`,
  `userId`. Mongoose `timestamps: true` supplies `createdAt` / `updatedAt`.

## API field naming

- **Request bodies** use `camelCase` (validated by Zod): `email`, `password`,
  `name`.
- **Success responses** follow a stable envelope:

  ```json
  { "success": true, "message": "Login successful!", "data": { "user": {}, "tokens": {} } }
  ```

- **Error responses** are shaped by the global handler and intentionally expose
  both `errorType` and the client-facing `error_code` / `error_message` aliases
  (`snake_case`) — these names are part of the contract the frontend expects, so
  keep them:

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
