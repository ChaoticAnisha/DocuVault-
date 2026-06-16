# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (including devDependencies such as typescript)
COPY package*.json ./
RUN npm ci

COPY . .

# Generate Prisma client then compile TypeScript
RUN npx prisma generate && npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Compiled output
COPY --from=builder /app/dist ./dist

# Prisma schema (needed for migrate deploy at startup)
COPY --from=builder /app/prisma ./prisma

# Generated Prisma client from builder (avoids re-running generate with dev deps)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Create writable dirs and hand ownership to non-root user
RUN mkdir -p uploads logs && chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

# Run pending migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
