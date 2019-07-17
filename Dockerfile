FROM node:10-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
RUN rm -Rf node_modules/

# Production
FROM node:10-alpine

COPY --from=builder /app/dist /app/dist
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

ENV NODE_ENV=production

RUN ls -al /app

CMD [ "node", "dist/server.js" ]