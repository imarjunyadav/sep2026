# ── Stage 1: build ─────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /build

# Package manifests first — this layer is cached until lockfile changes
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci

# Source files
COPY frontend/ ./frontend/
COPY backend/ ./backend/

# Produce frontend/dist
RUN npm run build --workspace frontend

# ── Stage 2: runtime ───────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /workspace

# Install backend production dependencies only.
# Both workspace package.json files are needed so npm can resolve the workspace
# graph; --workspace=backend limits the actual install to backend's deps only.
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci --workspace=backend --omit=dev

# Application code and pre-built frontend bundle
COPY --from=build /build/backend ./backend
COPY --from=build /build/frontend/dist ./frontend/dist

EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "backend/src/server.js"]
