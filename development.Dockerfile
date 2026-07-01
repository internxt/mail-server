FROM node:24.18

WORKDIR /usr/app

COPY package.json ./
COPY package-lock.json ./
RUN npm ci

CMD ["sh", "-c", "npm run migrate && npm run start:dev"]
