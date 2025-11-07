
FROM node:20-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
  && apk add --no-cache libc6-compat

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm run build

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S nextjs -g 1001 \
  && adduser -S nextjs -G nextjs -u 1001

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/BUILD_ID ./.next/BUILD_ID

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]


