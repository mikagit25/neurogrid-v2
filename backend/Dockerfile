FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Fonts for SVG/sharp rendering (Cyrillic support)
RUN apk add --no-cache fontconfig ttf-dejavu && fc-cache -f

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY src/db/migrations ./dist/db/migrations
RUN mkdir -p public/images
EXPOSE 4001
CMD ["node", "dist/app.js"]
