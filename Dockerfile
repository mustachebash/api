FROM node:12.13-alpine
RUN mkdir -p /mustachebash
WORKDIR /mustachebash
COPY package.json package-lock.json ./
RUN npm install --production --no-optional && \
	npm cache clean --force

COPY lib lib
EXPOSE 4000
CMD npm start
