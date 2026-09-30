# Multi-stage build on Node (pnpm via corepack).
# Compiles TypeScript in a build stage, ships only prod deps + dist/.

# ---- Build: install all deps and compile src -> dist ----
FROM node:20.19-bookworm-slim AS build
WORKDIR /usr/src/app

RUN corepack enable

# Install deps first for better layer caching (re-runs only when manifest changes).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Compile with swc -> runnable CommonJS in dist/ (build type-checks first).
COPY tsconfig.json tsconfig.build.json .swcrc ./
COPY src ./src
RUN pnpm build

# ---- Runtime: minimal image with prod deps + compiled output ----
FROM node:20.19-bookworm-slim AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production

RUN corepack enable

# Only production dependencies in the final image.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /usr/src/app/dist ./dist

# RSA signing keys are intentionally NOT baked into the image (they are secrets).
# Mount them at runtime and point the env at the mounted paths, e.g.:
#   docker run --env-file .env.production \
#     -v $(pwd)/src/keys:/usr/src/app/keys:ro \
#     -e JWT_PRIVATE_KEY_PATH=/usr/src/app/keys/rsa.private \
#     -e JWT_PUBLIC_KEY_PATH=/usr/src/app/keys/rsa.public \
#     -p 3000:3000 express-starter
# (production env refuses to start without real key files — by design.)

EXPOSE 3000
CMD ["node", "dist/server.js"]
