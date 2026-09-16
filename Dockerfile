FROM node:22-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
ENV NITRO_PRESET=node-server
ENV HOST=0.0.0.0
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node .output/server/index.mjs"]
