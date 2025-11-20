# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Copy server package.json and install server deps first
COPY package.json package-lock.json* ./
RUN npm ci --production --no-audit --no-fund || true

# Copy client and build it
COPY ../client ./client
WORKDIR /app/client
RUN npm ci --no-audit --no-fund
RUN npm run build

# Copy server source
WORKDIR /app
COPY . .
# Ensure server deps installed (dev or production as needed)
RUN npm ci --production --no-audit --no-fund || true

# Final stage
FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy built client and server files from builder
COPY --from=builder /app .

EXPOSE 3001

CMD ["node", "server.js"]
