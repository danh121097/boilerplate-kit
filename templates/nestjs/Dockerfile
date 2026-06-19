# Multi-stage build for the NestJS app. Compiles TypeScript in a builder stage,
# ships only prod deps + dist/. Uses corepack-enabled pnpm (swap for your PM).

# ---- Builder: install all deps and compile src -> dist ----
FROM node:22-alpine AS builder
WORKDIR /usr/src/app
RUN corepack enable

# Install deps first for better layer caching.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# Compile (nest build -> dist/).
COPY tsconfig.json tsconfig.build.json nest-cli.json .swcrc ./
COPY src ./src
RUN pnpm run build

# ---- Runner: minimal image with prod deps + compiled output ----
FROM node:22-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

COPY --from=builder /usr/src/app/dist ./dist

# RSA signing keys are intentionally NOT baked into the image (they are secrets).
# Mount them at runtime and point the env at the mounted paths, e.g.:
#   docker run --env-file .env.production \
#     -v $(pwd)/src/keys:/usr/src/app/keys:ro \
#     -e JWT_PRIVATE_KEY_PATH=/usr/src/app/keys/rsa.private \
#     -e JWT_PUBLIC_KEY_PATH=/usr/src/app/keys/rsa.public \
#     -p 3000:3000 nestjs-starter
# (production env refuses to start without real key files — by design.)

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
