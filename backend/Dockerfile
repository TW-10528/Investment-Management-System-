# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22 AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma client
RUN npm run db:generate

# Build TypeScript
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22

WORKDIR /app

# Install dumb-init, OpenSSL for Prisma, Python 3 and build tools for PaddleOCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init openssl python3 python3-pip python3-dev python3-venv build-essential \
    libgl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm install --production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy Prisma files
COPY prisma ./prisma

# Copy scripts for PaddleOCR
COPY scripts ./scripts

# Generate Prisma client in runtime stage
RUN npm run db:generate

# Create uploads directory
RUN mkdir -p ./uploads

# Create PaddleOCR Python venv and install dependencies
RUN python3 -m venv paddle-venv && \
    . paddle-venv/bin/activate && \
    pip install --upgrade pip setuptools wheel && \
    pip install paddlepaddle paddleocr

# Expose port (must match PORT in .env)
EXPOSE 8004

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]
