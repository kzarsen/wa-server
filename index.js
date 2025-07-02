const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

let qrCode = null;
let isReady = false;

// Настройки шаблонов и JSON
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Инициализация WhatsApp клиента
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
    console.log('📱 QR-код готов, перейди на /qr');
  });
});

client.on('ready', () => {
  isReady = true;
  console.log('✅ WhatsApp подключён и готов к отправке');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Ошибка авторизации:', msg);
});

client.initialize();

// Корневая страница
app.get('/', (req, res) => {
  res.send('🚀 Сервер работает. Перейди на /qr для авторизации');
});

// Страница QR
app.get('/qr', (req, res) => {
  if (isReady) {
    res.send('✅ WhatsApp уже подключён');
  } else if (qrCode) {
    res.render('qr', { qrCode });
  } else {
    res.send('⏳ QR ещё не сгенерирован, подожди и обнови страницу');
  }
});

// Обработка POST-запросов для отправки сообщений
app.post('/send', async (req, res) => {
  const body = req.body?.body || req.body;
  const raw = body.destination || body.phone || "";
  const text = body.message || body.text || "Сообщение по умолчанию";

  let digits = raw.replace(/\D/g, '');

  if (digits.length === 10) {
    digits = '7' + digits;
  } else if (digits.length === 11 && digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  }

  // 🔐 Финальная проверка
  const validPhone = digits.length === 11 && digits.startsWith('7');
  if (!validPhone) {
    console.log('❌ Неверный номер:', raw);
    return res.status(400).json({ error: 'Неверный номер телефона', original: raw });
  }

  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp ещё не подключён' });
  }

  const chatId = `${digits}@c.us`;

  try {
    const result = await client.sendMessage(chatId, text);
    console.log(`✅ Отправлено ${digits}: ${text}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Ошибка отправки:', error.message);
    res.status(500).json({ error: 'Ошибка отправки сообщения', details: error.message });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`🌐 Сервер запущен: http://localhost:${port}`);
});
