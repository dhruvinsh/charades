# Frontend Dockerfile — Node 22 (build) + Nginx (serve)

# --- Build stage ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY frontend/package.json frontend/package-lock.json* ./

RUN npm ci --legacy-peer-deps

# Copy source
COPY frontend/ .

# Build Vite PWA
RUN npm run build

# --- Serve stage ---
FROM nginx:1.27-alpine AS final

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -q -O /dev/null http://localhost/favicon.png || exit 1

CMD ["nginx", "-g", "daemon off;"]
