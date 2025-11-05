# Stage 1: Dependencies
FROM node:20-slim AS deps

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

# Stage 2: Development
FROM node:20-slim AS development

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

# Rebuild better-sqlite3 for this environment
RUN yarn install --force 

RUN mkdir -p /data && chown -R node:node /data

USER node
EXPOSE 3002
CMD ["yarn", "dev"]

# Stage 3: Build
FROM node:20-slim AS build

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Change ownership of the entire /app directory to node user
RUN chown -R node:node /app

RUN mkdir -p /data && chown -R node:node /data

# Switch to node user BEFORE rebuild and build
USER node

RUN yarn install --force
RUN yarn build

# Stage 4: Production
FROM node:20-slim AS production

ENV NODE_ENV=production
ENV PORT=3002
ENV DATABASE_PATH=/data/credentials.db
ENV WORKER_COUNT=1

WORKDIR /app

COPY --chown=node:node package.json yarn.lock* ./

# Install build dependencies temporarily for production rebuild
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && yarn install --frozen-lockfile --production \
    && yarn install --force \
    && apt-get remove -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node --from=build /app/dist ./dist

# Create data directory with proper permissions
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3002
VOLUME ["/data"]

CMD ["node", "dist/index.js"]