# =============================================================
# Stage 1: Builder — installs deps and compiles TypeScript
# =============================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

RUN npx prisma generate

COPY . .

RUN npm run build

# =============================================================
# Stage 2: Runner — lean production image
# =============================================================
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production

# Non-root user for security
RUN addgroup --system --gid 1001 datahub && \
    adduser --system --uid 1001 --ingroup datahub datahub

# Copy only what runtime needs
COPY --from=builder --chown=datahub:datahub /app/dist ./dist
COPY --from=builder --chown=datahub:datahub /app/node_modules ./node_modules
COPY --from=builder --chown=datahub:datahub /app/prisma ./prisma
COPY --from=builder --chown=datahub:datahub /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=datahub:datahub /app/package.json ./package.json

USER datahub

EXPOSE 3000

# dumb-init handles signals properly for graceful shutdown
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
