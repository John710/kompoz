FROM node:22-alpine
WORKDIR /app

# Install su-exec for privilege dropping
RUN apk add --no-cache su-exec

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY server/ server/
COPY public/ public/
COPY locales/ locales/

# Copy and set up entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod 755 /app/entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3710

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3710/api/info

ENTRYPOINT ["./entrypoint.sh"]
