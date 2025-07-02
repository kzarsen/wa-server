const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

let currentQR = null;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', async (qr) => {
  currentQR = qr;
  console.log('🔐 QR строка:', qr);
  await qrcode.toFile('./public/qr.png', qr);
  console.log('📱 QR сгенерирован. Перейди на /qr');
});

client.on('ready', () => console.log('✅ WhatsApp подключён'));

client.initialize();

app.get('/', (req, res) => res.send('Сервер работает!'));
app.get('/qr', (req, res) => {
  if (!currentQR) return res.send('✅ Уже подключено');
  res.render('qr', { qrImage: '/qr.png' });
});

app.post('/send', async (req, res) => {
  const { number, message } = req.body;
  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  try {
    await client.sendMessage(chatId, message);
    res.send({ status: 'ok' });
  } catch (e) {
    res.status(500).send({ status: 'error', error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер слушает порт ${PORT}`));
