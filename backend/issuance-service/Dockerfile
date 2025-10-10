# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock* ./
RUN corepack enable \
  && yarn install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM node:20-alpine AS production
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/data/credentials.db
WORKDIR /app
COPY package.json yarn.lock* ./
RUN corepack enable \
  && yarn install --frozen-lockfile --production --non-interactive
COPY --from=build /app/dist ./dist
RUN addgroup -S app && adduser -S app -G app \
  && mkdir -p /data \
  && chown -R app:app /app /data
USER app
EXPOSE 3001
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
