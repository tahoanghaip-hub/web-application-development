FROM node:22-alpine AS assets
WORKDIR /src
COPY package*.json build-vendor.mjs ./
RUN npm ci --ignore-scripts && npm run build

FROM nginx:1.28-alpine
COPY *.html /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY --from=assets /src/vendor /usr/share/nginx/html/vendor
