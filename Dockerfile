# Fastify 5 Heroes on Node.js 24 LTS.
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js cluster.js ./
ENV NODE_ENV=production POOL_SIZE=16
EXPOSE 8000
ENTRYPOINT ["sh", "-c", "exec node $NODE_OPTS server.js"]
