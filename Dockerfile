# Single persistent Node service: web app + REST API + WebSocket bridge.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY services ./services
COPY apps ./apps
# npm records only the macOS native binding for Tailwind's engine in the lockfile; add the Linux one for this image.
RUN npm ci && npm install --no-save @tailwindcss/oxide-linux-x64-gnu@4.3.3 && npm run build -w @blindspot/web
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "services/api/src/index.ts"]
