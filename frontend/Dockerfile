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

# Build arguments for API URLs
ARG VITE_ISSUANCE_API_URL
ARG VITE_VERIFICATION_API_URL

# Set as environment variables for Vite build
ENV VITE_ISSUANCE_API_URL=$VITE_ISSUANCE_API_URL
ENV VITE_VERIFICATION_API_URL=$VITE_VERIFICATION_API_URL

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN yarn build

# Stage 4: Production
FROM nginx:alpine AS production

# Copy built application from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx configuration 
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 5173

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
