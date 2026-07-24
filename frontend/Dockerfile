FROM node:20-alpine AS builder

# BUILD_MODE selects the Vite mode: "production" (prod /mitaines) or
# "staging" (/mitaines-dev). See vite.config.js and .env.staging.
ARG BUILD_MODE=production

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build -- --mode ${BUILD_MODE}

FROM nginx:alpine
# NGINX_CONF picks the server block: nginx.conf (prod → backend) or
# nginx.dev.conf (staging → backend-dev).
ARG NGINX_CONF=nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf

EXPOSE 80
