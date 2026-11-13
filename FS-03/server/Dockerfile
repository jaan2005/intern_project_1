# One image, two jobs: the API (default) and the video worker (override the command).
FROM node:20-bookworm-slim
# FFmpeg from the OS, so the optional ffmpeg-static download is not needed
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional
COPY src ./src
ENV NODE_ENV=production FFMPEG_PATH=/usr/bin/ffmpeg
EXPOSE 5000
CMD ["node", "src/server.js"]
