FROM node:20.10-alpine3.19
RUN mkdir -p /mustachebash
WORKDIR /mustachebash
COPY package.json package-lock.json ticket-logo.png ./
RUN npm install --production --no-optional && \
	npm --silent cache clean --force

COPY lib lib
EXPOSE 4000
CMD npm start
