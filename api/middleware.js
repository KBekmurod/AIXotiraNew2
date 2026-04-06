'use strict';

const jwt     = require('jsonwebtoken');
const UserBot = require('../models/UserBot');

var JWT_SECRET = process.env.JWT_SECRET || 'change_me_32_chars_random_string';

// ─────────────────────────────────────────
// JWT tekshiruvi — barcha /api/* uchun
// ─────────────────────────────────────────
async function authMiddleware(req, res, next) {
  var authHeader = req.headers['authorization'] || '';
  var token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token talab qilinadi' });
  }

  try {
    var decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, firstName, username, langCode }

    // BotConfig — UserBot dan olamiz
    var botDoc = await UserBot.findOne({ isActive: true });
    if (!botDoc) {
      return res.status(503).json({ error: 'Bot topilmadi' });
    }
    req.botDoc = botDoc;
    req.botId  = botDoc._id;

    // Foydalanuvchi ruxsatli foydalanuvchilardan biriga kirishi kerak
    var uid     = req.user.userId;
    var isOwner = uid === String(botDoc.ownerTelegramId);
    var isAllowed = isOwner || (botDoc.allowedUsers || []).includes(uid);

    if (!isAllowed) {
      return res.status(403).json({ error: 'Ruxsat yo\'q' });
    }

    req.isOwner = isOwner;
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token muddati tugagan' });
    }
    return res.status(401).json({ error: 'Noto\'g\'ri token' });
  }
}

module.exports = { authMiddleware };
