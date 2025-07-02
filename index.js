const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

let qrCode = null;
let isReady = false;

// Настройка шаблонов и статики
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // поддержка JSON-запросов

// Инициализация WhatsApp-клиента
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox'],
  },
});

client.on('qr', (qr) => {
  qrcode.toDataURL(qr, (err, url) => {
    qrCode = url;
  });
});

client.on('ready', () => {
  isReady = true;
  console.log('✅ WhatsApp подключён');
});

client.initialize();

// Главная страница
app.get('/', (req, res) => {
  res.send('🚀 Сервер работает. Перейдите на /qr');
});

// Страница QR-кода
app.get('/qr', (req, res) => {
  if (isReady) {
    res.send('✅ WhatsApp уже подключён');
  } else if (qrCode) {
    res.render('qr', { qrCode });
  } else {
    res.send('⏳ QR ещё не сгенерирован, обновите страницу через 5 сек...');
  }
});

// Новый API-эндпоинт для отправки сообщений
app.post('/send', async (req, res) => {
  const { phone, text } = req.body;

  if (!phone || !text) {
    return res.status(400).json({ error: 'Необходимо указать phone и text' });
  }

  try {
    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, text);
    console.log(`📤 Сообщение отправлено: ${phone} — ${text}`);
    res.json({ success: true, message: 'Сообщение отправлено' });
  } catch (error) {
    console.error('❌ Ошибка отправки:', error);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен: http://localhost:${port}`);
});
