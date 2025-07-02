const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

let qrCode = null;
let isReady = false;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/', (req, res) => {
  res.send('🚀 Сервер работает. Перейдите на /qr');
});

app.get('/qr', (req, res) => {
  if (isReady) {
    res.send('✅ WhatsApp уже подключён');
  } else if (qrCode) {
    res.render('qr', { qrCode });
  } else {
    res.send('⏳ QR ещё не сгенерирован, обновите страницу через 5 сек...');
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен: http://localhost:${port}`);
});
