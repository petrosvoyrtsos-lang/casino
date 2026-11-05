FROM node:22-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0 PORT=3000 DB_FILE=/data/db.json
RUN mkdir -p /data
EXPOSE 3000
CMD ["node","server.js"]
