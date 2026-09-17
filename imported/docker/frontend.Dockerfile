FROM node:22-bookworm AS builder

WORKDIR /app

# Copy root and web package files
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json* ./web/

# Install dependencies
RUN npm ci
RUN cd web && npm ci || npm install

# Copy all source files
COPY . .

# Build the frontend
RUN cd web && npm run build

# Use Nginx to serve the built files
FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
