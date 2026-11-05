# Bun runs the app; Node remains in the builder for the existing compiler tools.
FROM oven/bun:1.4.4 AS bun
FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock bunfig.toml ./

FROM base AS build
RUN bun install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json .swcrc ./
COPY src ./src
RUN bun run build

FROM base AS production-deps
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.4 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json bunfig.toml ./
# Supply RSA keys and configuration at runtime; never bake them into the image.
EXPOSE 3000
CMD ["bun", "dist/server.js"]
