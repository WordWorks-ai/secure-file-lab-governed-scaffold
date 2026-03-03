FROM node:22-alpine
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @sfl/shared build \
  && pnpm --filter @sfl/worker build

ENV NODE_ENV=production
USER node

EXPOSE 3001

CMD ["node", "apps/worker/dist/main.js"]
