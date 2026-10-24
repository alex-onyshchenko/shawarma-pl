FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3002
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY *.js ./
COPY fonts ./fonts
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3002
CMD ["npm", "start"]
