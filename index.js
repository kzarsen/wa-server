const fs = require('fs');
const qrcode = require('qrcode');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SESSION_DIR = './.wwebjs_auth';

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

let qrCodeData = '';
let isReady = false;
let messageLog = [];

function logMessage({ direction, text, from, to }) {
  messageLog.unshift({
    direction,
    text,
    from,
    to,
    time: new Date().toLocaleString()
  });
  if (messageLog.length > 100) messageLog = messageLog.slice(0, 100);
}

function extractText(msg) {
  if (msg.body && typeof msg.body === 'string' && msg.body.trim().length > 0) {
    return msg.body;
  }

  if (msg.hasMedia && msg.caption) {
    return msg.caption;
  }

  if (msg.type === 'image') return '[Изображение]';
  if (msg.type === 'video') return '[Видео]';
  if (msg.type === 'sticker') return '[Стикер]';
  if (msg.type === 'document') return msg.filename || '[Документ]';
  if (msg.type === 'reaction') return `[Реакция: ${msg.body}]`;

  return '[Сообщение без текста]';
}

client.on('qr', async (qr) => {
  qrCodeData = await qrcode.toDataURL(qr);
  console.log('📱 QR-код обновлён. Перейди на /');
});

client.on('ready', () => {
  console.log('✅ WhatsApp подключён');
  isReady = true;
});

client.on('disconnected', async (reason) => {
  console.warn('❌ Отключение:', reason);
  isReady = false;

  try {
    await axios.post('https://primary-production-458a9.up.railway.app/webhook/wa-disconnected-alert', {
      event: 'whatsapp_disconnected',
      time: new Date().toISOString()
    });
    console.log('📤 Уведомление об отключении отправлено в n8n');
  } catch (err) {
    console.error('❗ Не удалось отправить уведомление в n8n:', err.message);
  }

  setTimeout(() => {
    console.log('🔁 Повторная инициализация...');
    client.initialize();
  }, 10000);
});

client.on('message', async (msg) => {
  try {
    const contact = await msg.getContact();
    const sender = contact.number || msg.from || 'неизвестно';
    const text = extractText(msg);

    logMessage({ direction: 'IN', from: sender, text });
    console.log(`📥 Входящее сообщение от ${sender}: ${text}`);

    try {
      await axios.post('https://primary-production-458a9.up.railway.app/webhook/whatsapp-reply-hook', {
        destination: sender,
        message: text
      });
    } catch (err) {
      console.error('❗ Ошибка отправки в n8n:', err.message);
    }

    try {
      await axios.post('https://primary-production-458a9.up.railway.app/webhook/gpt-whatsapp-agent', {
        destination: sender,
        message: text
      });
      console.log('🤖 Отправлено в GPT-бота');
    } catch (err) {
      console.error('❌ Ошибка при вызове GPT-бота:', err.message);
    }

  } catch (error) {
    console.error('⚠️ Ошибка обработки входящего сообщения:', error.message);
  }
});

app.get('/', (_, res) => {
  const html = `
  <html>
  <head>
    <title>WA-сервер</title>
    <style>
      body { font-family: sans-serif; padding: 20px; background: #f9f9f9; color: #333; }
      h1 { color: #1e90ff; }
      .qr { margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 14px; }
      th { background: #eee; }
      .in { color: green; }
      .out { color: blue; }
      .offline { color: red; }
      .status { font-weight: bold; margin-bottom: 10px; }
    </style>
  </head>
  <body>
    <h1>📡 Arcanum WA-сервер</h1>
    <div class="status">Статус: <span class="${isReady ? 'online' : 'offline'}">${isReady ? '🟢 Онлайн' : '🔴 Оффлайн'}</span></div>

    ${qrCodeData ? `<div class="qr"><img src="${qrCodeData}" width="250" /></div>` : '<p>⏳ QR-код ещё не сгенерирован...</p>'}

    <h2>📋 Что делать при отключении</h2>
    <ol>
      <li>Откройте рабочий WhatsApp на телефоне</li>
      <li>Зайдите в <strong>Меню → Связанные устройства</strong></li>
      <li>Нажмите <strong>Привязать устройство</strong></li>
      <li>Отсканируйте QR-код на этой странице</li>
    </ol>
    <p>После сканирования обновите страницу или дождитесь статуса <strong>🟢 Онлайн</strong>.</p>

    <h2>📑 Последние сообщения</h2>
    <table>
      <thead><tr><th>Тип</th><th>От/Кому</th><th>Текст</th><th>Время</th></tr></thead>
      <tbody>
        ${messageLog.slice(0, 20).map(msg => `
          <tr>
            <td class="\${msg.direction === 'IN' ? 'in' : 'out'}">\${msg.direction}</td>
            <td>\${msg.from || msg.to}</td>
            <td>\${msg.text}</td>
            <td>\${msg.time}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </body>
  </html>
  `;
  res.send(html);
});

app.post('/send', async (req, res) => {
  const { phone, text } = req.body;

  if (!phone || !text) {
    return res.status(400).json({ error: 'Неверные параметры' });
  }

  if (!isReady || !client.info || !client.info.wid) {
    return res.status(503).json({ error: 'WhatsApp не подключён' });
  }

  try {
    const chatId = `${phone}@c.us`;
    const chat = await client.getChatById(chatId);
    await chat.sendMessage(text);

    logMessage({ direction: 'OUT', to: phone, text });
    console.log('📤 Отправлено на', phone, ':', text);
    res.json({ status: 'ok', message: 'Отправлено' });
  } catch (err) {
    console.error('❌ Ошибка отправки:', err.message);
    res.status(500).json({ error: 'Ошибка отправки сообщения', details: err.message });
  }
});

app.post('/restart', async (_, res) => {
  try {
    console.log('🔄 Перезапуск WA клиента по запросу...');
    isReady = false;
    await client.destroy();
    client.initialize();
    res.json({ status: 'ok', message: 'Клиент перезапускается...' });
  } catch (err) {
    console.error('❌ Ошибка при перезапуске:', err.message);
    res.status(500).json({ error: 'Ошибка перезапуска', details: err.message });
  }
});

process.on('SIGINT', async () => {
  console.log('🛑 Завершение работы...');
  await client.destroy();
  process.exit(0);
});

client.initialize();

const PORT = process.env.PORT || 3000;
app.get('/status', (_, res) => {
  res.json({ status: isReady ? 'online' : 'offline' });
});
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
"""

# Save to file
file_path = Path("/mnt/data/index-gpt-updated.js")
file_path.write_text(updated_code.strip(), encoding="utf-8")
file_path.name
