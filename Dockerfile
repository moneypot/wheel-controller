FROM node:22-alpine
# FROM --platform=linux/amd64 node:${NODE_VERSION}-alpine
# FROM gcr.io/cupblanket/node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4003

CMD ["npm", "start"]
