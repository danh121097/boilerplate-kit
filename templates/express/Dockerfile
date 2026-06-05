# Multi-stage build with Bun (the project's package manager + runtime).
# Compiles TypeScript in a builder stage, ships only prod deps + dist/.

# ---- Builder: install all deps and compile src -> dist ----
FROM oven/bun:1-alpine AS builder
WORKDIR /usr/src/app

# Install deps first for better layer caching (re-runs only when manifest changes).
COPY package.json bun.lock* ./
RUN bun install

# Compile (tsc && tsc-alias) -> runnable CommonJS in dist/.
COPY tsconfig.json .swcrc ./
COPY src ./src
RUN bun run build

# ---- Runner: minimal image with prod deps + compiled output ----
FROM oven/bun:1-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Only production dependencies in the final image.
COPY package.json bun.lock* ./
RUN bun install --production

COPY --from=builder /usr/src/app/dist ./dist

# RSA signing keys are intentionally NOT baked into the image (they are secrets).
# Mount them at runtime and point the env at the mounted paths, e.g.:
#   docker run --env-file .env.production \
#     -v $(pwd)/src/keys:/usr/src/app/keys:ro \
#     -e JWT_PRIVATE_KEY_PATH=/usr/src/app/keys/rsa.private \
#     -e JWT_PUBLIC_KEY_PATH=/usr/src/app/keys/rsa.public \
#     -p 3000:3000 node-ts-boilerplate
# (production env refuses to start without real key files — by design.)

EXPOSE 3000
CMD ["bun", "dist/server.js"]
