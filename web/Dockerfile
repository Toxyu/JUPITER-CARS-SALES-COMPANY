FROM node:22-alpine AS build
WORKDIR /web
COPY package.json ./
RUN npm install --ignore-scripts
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_KEYCLOAK_URL=http://localhost:8082
ARG VITE_KEYCLOAK_REALM=jupiter
ARG VITE_KEYCLOAK_CLIENT_ID=jupiter-web
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /web/dist /usr/share/nginx/html
EXPOSE 8080