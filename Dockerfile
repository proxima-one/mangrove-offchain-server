FROM node:16-alpine AS build
WORKDIR /app
COPY package.json ./
RUN --mount=type=secret,id=npmrc,dst=/root/.npmrc \
    yarn install

COPY ./prisma/schema.prisma ./prisma/
RUN yarn gen
COPY . .

RUN yarn build

FROM node:16-alpine as prod
ARG BUILD_VERSION
WORKDIR /app
RUN apk add dumb-init
COPY ./package.json ./

ENV NODE_ENV production
RUN --mount=type=secret,id=npmrc,dst=/root/.npmrc \
  yarn install --production --ignore-optional

COPY ./prisma ./prisma
COPY --from=build /app/dist .
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@generated ./node_modules/@generated

ENV NODE_PATH /app
ENV VERSION $BUILD_VERSION

COPY ./scripts/entrypoint.sh /scripts/
RUN ["chmod", "+x", "/scripts/entrypoint.sh"]
ENTRYPOINT ["/scripts/entrypoint.sh"]
