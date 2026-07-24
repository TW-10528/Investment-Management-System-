# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Install dependencies required by Prisma
RUN apt-get update && apt-get install -y dumb-init openssl && rm -rf /var/lib/apt/lists/*

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

# Install Python for PaddleOCR
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*

# Install graphics libraries for PaddleOCR
RUN apt-get update && apt-get install -y libgl1-mesa-glx libglib2.0-0 && rm -rf /var/lib/apt/lists/*

COPY scripts ./dist/scripts

# Create fresh venv and install PaddleOCR packages
RUN python3 -m venv /app/dist/paddle-venv && \
    /app/dist/paddle-venv/bin/pip install --upgrade pip && \
    /app/dist/paddle-venv/bin/pip install paddlepaddle paddleocr

EXPOSE 8004

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD node -e "require('http').get('http://localhost:8004/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
