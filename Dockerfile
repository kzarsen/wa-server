FROM node:18

# Установка системных зависимостей для Chromium
RUN apt-get update && apt-get install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libxss1 \
  libgtk-3-0 \
  libxshmfence1 \
  libglu1 \
  chromium

# Установка зависимостей проекта
WORKDIR /app
COPY . .
RUN npm install

# Запуск
CMD ["npm", "start"]
