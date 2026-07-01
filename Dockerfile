FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package*.json ./
RUN npm ci

# Copy source and build.
COPY . .
RUN npm run build

# Runtime config is provided via environment variables (see .env.example).
# Postgres and Redis are required and must be reachable from the container.
CMD [ "node", "--enable-source-maps", "dist/start-bot.js" ]
