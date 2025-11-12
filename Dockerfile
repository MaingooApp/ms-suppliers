FROM node:20-alpine

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

RUN pnpm install

COPY . .

RUN npx prisma generate

EXPOSE 3003
