# Minimal CD artifact: build and serve the Next.js frontend in a container.
FROM node:22-alpine AS build

WORKDIR /app
RUN apk add --no-cache curl
RUN curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.1/compact-installer.sh | sh -s -- --quiet
ENV PATH="/root/.local/bin:${PATH}"
RUN compact update 0.31.1

COPY package.json ./package.json
RUN npm install --no-package-lock

COPY contracts ./contracts
COPY frontend/package.json ./frontend/package.json
RUN cd frontend && npm install --no-package-lock

COPY frontend ./frontend
RUN npm run compile
RUN cd frontend && npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/frontend ./

EXPOSE 3000
CMD ["npm", "run", "start"]
