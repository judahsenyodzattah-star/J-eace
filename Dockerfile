FROM node:22-alpine
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3001 5173
CMD ["npm", "run", "dev:api"]
