'use strict';

const jwt     = require('jsonwebtoken');
const UserBot = require('../models/UserBot');

var JWT_SECRET = process.env.JWT_SECRET || 'change_me_32_chars_random_string';

async function authMiddleware(req, res, next) {
  var authHeader = req.headers['authorization'] || '';
  var token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token talab qilinadi' });
  }

  try {
    var decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    var botDoc = await UserBot.findOne({ isActive: true });
    if (!botDoc) {
      console.error('[Middleware] UserBot topilmadi! MongoDB da bot yozuvi yo\'q.');
      return res.status(503).json({ error: 'Bot topilmadi. Super-admin botda /newbot qiling.' });
    }

    var uid        = req.user.userId;
    var isOwner    = uid === String(botDoc.ownerTelegramId);
    var accessMode = botDoc.accessMode || 'private';

    // Egasini allowedUsers ga avtomatik qo'shamiz
    if (isOwner && !(botDoc.allowedUsers || []).includes(uid)) {
      await UserBot.findByIdAndUpdate(botDoc._id, { $addToSet: { allowedUsers: uid } });
      botDoc.allowedUsers = (botDoc.allowedUsers || []).concat([uid]);
    }

    var isAllowed = false;

    if (isOwner) {
      // Egasi har doim kiradi
      isAllowed = true;
    } else if (accessMode === 'private') {
      // Faqat egasi — boshqalar kira olmaydi
      isAllowed = false;
    } else if (accessMode === 'whitelist') {
      // Faqat allowedUsers ro'yxatidagilar
      isAllowed = (botDoc.allowedUsers || []).includes(uid);
    } else if (accessMode === 'open') {
      // Hamma kiradi
      isAllowed = true;
    }

    if (!isAllowed) {
      var mode = accessMode === 'private'
        ? 'Bu shaxsiy bot. Faqat egasi foydalana oladi.'
        : 'Ruxsat yo\'q. Bot egasi sizga ruxsat berishi kerak.';
      return res.status(403).json({ error: mode, code: 'ACCESS_DENIED' });
    }

    req.botDoc  = botDoc;
    req.botId   = botDoc._id;
    req.isOwner = isOwner;
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token muddati tugagan. Qaytadan kiring.' });
    }
    console.error('[Middleware] JWT xato:', e.message);
    return res.status(401).json({ error: 'Noto\'g\'ri token' });
  }
}

module.exports = { authMiddleware };
