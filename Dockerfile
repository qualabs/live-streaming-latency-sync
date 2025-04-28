FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY .env ./

COPY index.js ./

EXPOSE 3000

ENV PORT=3000

CMD ["npm", "start"]
