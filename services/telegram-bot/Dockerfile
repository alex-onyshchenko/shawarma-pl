FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3005
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY api ./api
COPY src ./src
COPY server.js ./server.js
USER node
EXPOSE 3005
CMD ["npm", "start"]
