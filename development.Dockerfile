FROM node:22.17.0

WORKDIR /usr/app

COPY package.json ./
COPY package-lock.json ./
RUN npm ci

CMD ["npm", "run", "start:dev"]
