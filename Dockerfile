FROM node:22-bookworm-slim AS build

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
COPY tsconfig.base.json ./tsconfig.base.json
COPY eslint.config.mjs ./eslint.config.mjs

RUN npm ci

# Copy source
COPY client ./client
COPY server ./server
COPY shared ./shared

# Build everything
RUN npm run build


FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production
WORKDIR /app

# Only bring what we need to run the server (which serves client/dist)
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/client/package.json ./client/package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/shared/package.json ./shared/package.json

RUN npm ci --omit=dev

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3001

# Railway provides PORT; Fastify reads it via process.env.PORT
CMD ["npm", "run", "start", "-w", "server"]

