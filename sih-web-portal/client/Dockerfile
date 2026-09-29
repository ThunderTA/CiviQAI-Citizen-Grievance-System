# --- build ------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .

# Vite inlines VITE_* variables at build time, so they must be present here,
# not at container start.
ARG VITE_API_URL=http://localhost:3000/api
ARG VITE_CLERK_PUBLISHABLE_KEY=
ARG VITE_AI_SERVICE_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    VITE_AI_SERVICE_URL=$VITE_AI_SERVICE_URL

RUN npm run build

# --- serve ------------------------------------------------------------------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# SPA routing: unknown paths must return index.html, not a 404, or a deep link
# to /admin breaks on refresh.
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / { try_files $uri $uri/ /index.html; }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
