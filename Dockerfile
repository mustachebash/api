FROM node:20.10-alpine3.19
RUN mkdir -p /mustachebash
WORKDIR /mustachebash
COPY package.json package-lock.json ./
RUN NODE_ENV=production npm ci --include=prod --no-optional && \
	npm --silent cache clean --force

COPY lib lib
EXPOSE 4000
CMD npm start
