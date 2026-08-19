# syntax=docker/dockerfile:1

FROM node:24-slim AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/patches ./.yarn/patches

FROM base AS build
RUN yarn install --immutable
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN yarn build

FROM base AS deps
ENV NODE_ENV=production
RUN yarn workspaces focus --production

FROM node:24-slim AS runtime
LABEL org.opencontainers.image.title="rss2.pub" \
      org.opencontainers.image.description="RSS/Atom to ActivityPub bridge" \
      org.opencontainers.image.url="https://rss2.pub" \
      org.opencontainers.image.documentation="https://github.com/moreal/rss2.pub#readme" \
      org.opencontainers.image.source="https://github.com/moreal/rss2.pub" \
      org.opencontainers.image.vendor="moreal"

WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node package.json ./
EXPOSE 8000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "const port=process.env.PORT||'8000';fetch('http://127.0.0.1:'+port+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/web/main.js"]
