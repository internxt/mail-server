FROM node:22.17.0 AS builder
LABEL author="internxt"

WORKDIR /usr/app

COPY package.json ./
COPY package-lock.json ./
COPY .npmrc ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY nest-cli.json ./
COPY --chmod=755 src ./src
RUN npm run build && chmod -R 755 dist/

FROM node:22.17.0
LABEL author="internxt"

WORKDIR /usr/app

COPY package.json ./
COPY package-lock.json ./
COPY .npmrc ./
RUN npm ci --ignore-scripts --omit=dev

COPY --from=builder /usr/app/dist ./dist

USER node

CMD ["npm", "run", "start:prod"]
