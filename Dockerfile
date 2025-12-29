# syntax=docker/dockerfile:1

FROM node:20-alpine
WORKDIR /app

# Install dependencies needed for Prisma
RUN apk add --no-cache libc6-compat openssl

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create data directory for SQLite
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy application code
COPY . .

# Build Next.js
RUN npm run build

# Change ownership of .next folder
RUN chown -R nextjs:nodejs /app/.next

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Data volume for SQLite
VOLUME ["/app/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start: run migrations then start server
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
