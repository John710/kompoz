FROM node:22-alpine
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY server/ server/
COPY public/ public/
COPY locales/ locales/

# Security: run as non-root user
USER node

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(0)}).on('error', () => process.exit(1))"

CMD ["node", "server/index.js"]
