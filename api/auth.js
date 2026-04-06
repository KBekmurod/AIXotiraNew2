'use strict';

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');

var JWT_SECRET  = process.env.JWT_SECRET  || 'change_me_32_chars_random_string';
var BOT_TOKEN   = process.env.INDIVIDUAL_BOT_TOKEN || '';
var JWT_EXPIRES = '24h';

function verifyTelegramData(initData) {
  try {
    // BOT_TOKEN tekshiruvi
    if (!BOT_TOKEN) {
      console.error('[Auth] INDIVIDUAL_BOT_TOKEN env variable topilmadi!');
      return null;
    }

    var params = new URLSearchParams(initData);
    var hash   = params.get('hash');
    if (!hash) {
      console.error('[Auth] initData ichida hash yo\'q');
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

    if (expectedHash !== hash) {
      console.error('[Auth] Hash mos kelmadi. BOT_TOKEN to\'g\'riligini tekshiring.');
      console.error('[Auth] expected:', expectedHash);
      console.error('[Auth] received:', hash);
      return null;
    }

    // auth_date — 1 kun limit
    var authDate = parseInt(params.get('auth_date') || '0');
    var now      = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      console.error('[Auth] auth_date juda eski:', now - authDate, 'soniya');
      return null;
    }

    var userStr = params.get('user');
    if (!userStr) {
      console.error('[Auth] user parametri yo\'q');
      return null;
    }

    var user = JSON.parse(userStr);
    console.log('[Auth] ✅ Muvaffaqiyatli kirdi:', user.id, user.first_name);

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

  // Test rejim — har doim ishlaydi
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
