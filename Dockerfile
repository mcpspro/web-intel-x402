FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/stdio.ts"]
