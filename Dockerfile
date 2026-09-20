# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package*.json ./
COPY packages/ ./packages/

RUN npm install

# Stage 2: Builder
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .

# Generate Prisma Client
RUN npx prisma generate

ENV NODE_ENV=production
ENV NEXT_OUTPUT_STANDALONE=true
ENV NEXT_PUBLIC_APP_URL=https://probuyer.pitayacode.io
ENV DATABASE_URL="postgresql://dummy:dummy@127.0.0.1:5432/dummy?schema=public"

RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3007
ENV HOSTNAME="0.0.0.0"

RUN apk add --no-cache openssl curl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Automatically leverage output traces to reduce image size
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3007

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:3007/robots.txt || exit 1

CMD ["node", "server.js"]
