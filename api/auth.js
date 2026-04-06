'use strict';

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');

var JWT_SECRET  = process.env.JWT_SECRET  || 'change_me_32_chars_random_string';
var BOT_TOKEN   = process.env.INDIVIDUAL_BOT_TOKEN || '';
var JWT_EXPIRES = '24h';

// ─────────────────────────────────────────
// Telegram initData HMAC-SHA256 tekshiruvi
// ─────────────────────────────────────────
function verifyTelegramData(initData) {
  try {
    var params = new URLSearchParams(initData);
    var hash   = params.get('hash');
    if (!hash) {
      console.error('[Auth] hash topilmadi');
      return null;
    }

    params.delete('hash');

    var entries = [];
    params.forEach(function(val, key) { entries.push(key + '=' + val); });
    entries.sort();
    var dataCheckString = entries.join('\n');

    var secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    var expectedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    console.log('[Auth] expectedHash:', expectedHash);
    console.log('[Auth] receivedHash:', hash);
    console.log('[Auth] BOT_TOKEN mavjud:', !!BOT_TOKEN);

    if (expectedHash !== hash) {
      console.error('[Auth] Hash mos kelmadi! BOT_TOKEN noto\'g\'ri bo\'lishi mumkin.');
      return null;
    }

    // auth_date tekshiruvi — 1 soatga uzaytirildi
    var authDate = parseInt(params.get('auth_date') || '0');
    var now      = Math.floor(Date.now() / 1000);
    var diff     = now - authDate;
    console.log('[Auth] auth_date farqi (soniya):', diff);

    if (diff > 3600) {
      console.error('[Auth] auth_date juda eski:', diff, 'soniya');
      return null;
    }

    var userStr = params.get('user');
    if (!userStr) {
      console.error('[Auth] user parametri topilmadi');
      return null;
    }
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

function createToken(userData) {
  return jwt.sign(userData, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyHandler(req, res) {
  var initData = (req.body && req.body.initData) || '';

  if (!initData) {
    return res.status(400).json({ error: 'initData talab qilinadi' });
  }

  // Development yoki test rejim
  if (initData === 'test') {
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
