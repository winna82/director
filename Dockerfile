FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
