FROM node:22-alpine
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @sfl/shared build \
  && pnpm --filter @sfl/api prisma:generate \
  && pnpm --filter @sfl/api build

ENV NODE_ENV=production
USER node

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
