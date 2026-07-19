# Minimal CD artifact: build and serve the Next.js frontend in a container.
FROM node:22-alpine AS build

WORKDIR /app
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
