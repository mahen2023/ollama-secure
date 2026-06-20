# Stage 1: Build the React client
FROM node:22-alpine AS client-builder
WORKDIR /build
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# Stage 2: Production server (serves both the API and the built client)
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY --from=client-builder /build/dist ./client/dist
EXPOSE 3001
CMD ["node", "server.js"]
