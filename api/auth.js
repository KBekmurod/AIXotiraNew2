'use strict';

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');

var JWT_SECRET  = process.env.JWT_SECRET  || 'change_me_32_chars_random_string';
var BOT_TOKEN   = process.env.INDIVIDUAL_BOT_TOKEN || '';
var JWT_EXPIRES = '24h';

// ─────────────────────────────────────────
// Telegram initData HMAC-SHA256 tekshiruvi
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// ─────────────────────────────────────────
function verifyTelegramData(initData) {
  try {
    var params = new URLSearchParams(initData);
    var hash   = params.get('hash');
    if (!hash) return null;

    // hash parametrini olib tashlaymiz
    params.delete('hash');

    // Parametrlarni alfavit tartibda saralash
    var entries = [];
    params.forEach(function(val, key) { entries.push(key + '=' + val); });
    entries.sort();
    var dataCheckString = entries.join('\n');

    // HMAC-SHA256: secret = HMAC-SHA256("WebAppData", BOT_TOKEN)
    var secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    var expectedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) return null;

    // auth_date tekshiruvi (5 daqiqadan eski bo'lsa rad etamiz)
    var authDate = parseInt(params.get('auth_date') || '0');
    var now      = Math.floor(Date.now() / 1000);
    if (now - authDate > 300) return null; // 5 daqiqa

    // user ma'lumotlari
    var userStr = params.get('user');
    if (!userStr) return null;
    var user = JSON.parse(userStr);

    return {
      userId:    String(user.id),
      firstName: user.first_name || '',
      lastName:  user.last_name  || '',
      username:  user.username   || '',
      langCode:  user.language_code || 'ru'
    };
  } catch (e) {
    console.error('[Auth] verifyTelegramData xato:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────
// JWT yaratish
// ─────────────────────────────────────────
function createToken(userData) {
  return jwt.sign(userData, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ─────────────────────────────────────────
// POST /api/auth/verify
// Body: { initData: "..." }
// Response: { token, user }
// ─────────────────────────────────────────
function verifyHandler(req, res) {
  var initData = (req.body && req.body.initData) || '';

  if (!initData) {
    return res.status(400).json({ error: 'initData talab qilinadi' });
  }

  // Development rejim — test uchun
  if (process.env.NODE_ENV === 'development' && initData === 'test') {
    var testUser = {
      userId:    String(process.env.SUPER_ADMIN_ID || '12345'),
      firstName: 'Test',
      username:  'testuser',
      langCode:  'uz'
    };
    return res.json({ token: createToken(testUser), user: testUser });
  }

  var userData = verifyTelegramData(initData);
  if (!userData) {
    return res.status(401).json({ error: 'Telegram ma\'lumotlari noto\'g\'ri' });
  }

  var token = createToken(userData);
  res.json({ token, user: userData });
}

module.exports = { verifyHandler, createToken, verifyTelegramData };
