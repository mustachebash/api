ARG NODE_VERSION=23.6-alpine3.20

# Base
FROM node:${NODE_VERSION} as base
RUN mkdir -p /mustachebash
WORKDIR /mustachebash
COPY package.json package-lock.json ./

# Build dependencies
FROM base AS build-deps
# https://docs.docker.com/build/guide/mounts/
RUN --mount=type=cache,target=/root/.npm \
	npm ci

# Build
FROM base as build
# https://docs.docker.com/build/guide/mounts/
RUN --mount=type=cache,target=/root/.npm \
	--mount=type=bind,source=tsconfig.json,target=tsconfig.json \
	--mount=type=bind,source=lib,target=lib \
	npm run build; exit 0

# Production
FROM base as production
# https://docs.docker.com/build/guide/mounts/
RUN --mount=type=cache,target=/root/.npm \
	NODE_ENV=production npm ci
USER node
COPY --from=build /mustachebash/dist ./dist
EXPOSE 4000
CMD npm --silent --no-update-notifier start
