# Multi-stage Docker build for production optimization

# Build stage
FROM oven/bun:1-alpine AS builder

# Install build tools needed for migrations
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1-alpine AS production

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S etera -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=etera:nodejs /app/dist ./dist
COPY --from=builder --chown=etera:nodejs /app/package.json .
COPY --from=builder --chown=etera:nodejs /app/bun.lock .
COPY --from=builder --chown=etera:nodejs /app/node_modules ./node_modules

# RUN bun install --production

# Switch to non-root user
USER etera

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run --bun /app/dist/healthcheck.js

# Expose port
EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the service
CMD ["bun", "run", "start"]
