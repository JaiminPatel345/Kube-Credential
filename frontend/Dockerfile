# Stage 1: Dependencies (shared)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Stage 2: Development (with hot reload)
FROM node:20-alpine AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
EXPOSE 5173
CMD ["yarn", "dev", "--host", "0.0.0.0"]

# Stage 3: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

# Stage 4: Production
FROM node:20-alpine AS production
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install only production dependencies
RUN yarn install --frozen-lockfile --production

# Copy built application
COPY --from=build /app/dist ./dist

EXPOSE 5173

# Run preview server
CMD ["yarn", "preview", "--host", "0.0.0.0", "--port", "${PORT:-5173}"]
