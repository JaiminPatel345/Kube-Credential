# Stage 1: Dependencies
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

# Stage 2: Development
FROM node:20-slim AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
EXPOSE 3002
CMD ["yarn", "dev"]

# Stage 3: Build
FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
RUN yarn build

# Stage 4: Production
FROM node:20-slim AS production
ENV NODE_ENV=production
ENV PORT=3002
ENV DATABASE_PATH=/data/verification.db
WORKDIR /app

COPY --chown=node:node package.json yarn.lock* ./
RUN yarn install --frozen-lockfile --production

COPY --chown=node:node --from=build /app/dist ./dist

USER node

EXPOSE 3002
VOLUME ["/data"]
CMD ["node", "dist/index.js"]