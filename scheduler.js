'use strict';

// ═══════════════════════════════════════════════
// SCHEDULER — Obuna muddati va eslatmalar
// Har kecha soat 02:00 da ishlaydi
// npm install node-cron kerak
// ═══════════════════════════════════════════════

const cron         = require('node-cron');
const Subscription = require('./models/Subscription');
const UserBot      = require('./models/UserBot');
const { t }        = require('./utils/i18n');

var _individualBot = null; // individual bot instance (xabar yuborish uchun)
var _botConfig     = null; // individual botConfig (RAM yangilash uchun)
var _cronJob       = null;

const GRACE_DAYS = 3;

const PLAN_NAMES = {
  free:    '📦 Free',
  starter: '⭐ Starter',
  pro:     '🚀 Pro',
  premium: '💎 Premium'
};

function setBot(botInstance, botCfg) {
  _individualBot = botInstance;
  _botConfig     = botCfg;
}

// ── YORDAMCHI: foydalanuvchiga xabar yuborish ──
async function sendMsg(telegramId, text) {
  if (!_individualBot || !_individualBot.telegram) {
    console.warn('[Scheduler] Bot instance yo\'q — xabar yuborilmadi.');
    return;
  }
  try {
    await _individualBot.telegram.sendMessage(String(telegramId), text);
  } catch (e) {
    console.error('[Scheduler] Xabar xato (' + telegramId + '):', e.message);
  }
}

// ── 1. ESLATMALAR ──
// notified7d/notified1d flag — server ishlamasa ham o'tkazib yuborilmaydi
// $lte ishlatiladi: "7 kundan kam qolgan, hali eslatma yuborilmagan"
async function notifyExpiring() {
  var now = new Date();

  // 7 kun eslatma — expiresAt 7 kun ichida tugaydi, hali xabar yuborilmagan
  var in7days = new Date(now);
  in7days.setDate(in7days.getDate() + 7);

  var subs7 = await Subscription.find({
    status:     'active',
    notified7d: false,
    expiresAt:  { $gt: now, $lte: in7days }
  });

  for (var i = 0; i < subs7.length; i++) {
    var sub = subs7[i];
    var planName = PLAN_NAMES[sub.plan] || sub.plan;
    var expires  = sub.expiresAt.toLocaleDateString('ru-RU');
    var msg = t('sub_expiry_7d', 'uz', planName, expires);
    await sendMsg(sub.telegramId, msg);
    await Subscription.findByIdAndUpdate(sub._id, { $set: { notified7d: true } });
    console.log('[Scheduler] 7 kun eslatma → ' + sub.telegramId + ' (' + sub.uniqueId + ')');
  }

  // 1 kun eslatma — expiresAt 1 kun ichida tugaydi, hali xabar yuborilmagan
  var in1day = new Date(now);
  in1day.setDate(in1day.getDate() + 1);

  var subs1 = await Subscription.find({
    status:     'active',
    notified1d: false,
    expiresAt:  { $gt: now, $lte: in1day }
  });

  for (var j = 0; j < subs1.length; j++) {
    var sub2 = subs1[j];
    var planName2 = PLAN_NAMES[sub2.plan] || sub2.plan;
    var expires2  = sub2.expiresAt.toLocaleDateString('ru-RU');
    var msg2 = t('sub_expiry_1d', 'uz', planName2, expires2);
    await sendMsg(sub2.telegramId, msg2);
    await Subscription.findByIdAndUpdate(sub2._id, { $set: { notified1d: true } });
    console.log('[Scheduler] 1 kun eslatma → ' + sub2.telegramId + ' (' + sub2.uniqueId + ')');
  }
}

// ── 2. GRACE PERIOD BOSHLASH ──
// expiresAt o'tgan, lekin hali active holat
async function startGrace() {
  var now = new Date();
  var expired = await Subscription.find({
    status:    'active',
    expiresAt: { $lt: now }
  });

  for (var i = 0; i < expired.length; i++) {
    var sub = expired[i];
    var graceEndsAt = new Date(sub.expiresAt);
    graceEndsAt.setDate(graceEndsAt.getDate() + GRACE_DAYS);

    await Subscription.findByIdAndUpdate(sub._id, {
      $set: { status: 'grace', graceEndsAt: graceEndsAt }
    });

    var planName = PLAN_NAMES[sub.plan] || sub.plan;
    var graceStr = graceEndsAt.toLocaleDateString('ru-RU');
    var msg = t('sub_grace_started', 'uz', planName, graceStr);
    await sendMsg(sub.telegramId, msg);
    console.log('[Scheduler] Grace period boshlandi → ' + sub.telegramId + ' (' + sub.uniqueId + ')');
  }
}

// ── 3. FREE GA TUSHIRISH ──
// graceEndsAt o'tgan
async function downgradeExpired() {
  var now     = new Date();
  var expired = await Subscription.find({
    status:     'grace',
    graceEndsAt: { $lt: now }
  });

  for (var i = 0; i < expired.length; i++) {
    var sub = expired[i];
    await Subscription.findByIdAndUpdate(sub._id, { $set: { status: 'expired' } });

    // UserBot.currentPlan = 'free'
    await UserBot.findOneAndUpdate(
      { ownerTelegramId: String(sub.telegramId), isActive: true },
      { $set: { currentPlan: 'free' } }
    );

    // RAM dagi botConfig ni yangilash
    if (_botConfig && String(_botConfig.ownerTelegramId) === String(sub.telegramId)) {
      _botConfig.currentPlan = 'free';
    }

    var msg = t('sub_downgraded', 'uz');
    await sendMsg(sub.telegramId, msg);
    console.log('[Scheduler] Free ga tushirildi → ' + sub.telegramId + ' (' + sub.uniqueId + ')');
  }
}

// ── BARCHA VAZIFALARNI BAJARISH ──
async function runAll() {
  console.log('[Scheduler] Ishga tushdi:', new Date().toISOString());
  try {
    await notifyExpiring();
    await startGrace();
    await downgradeExpired();
    console.log('[Scheduler] Tugadi.');
  } catch (err) {
    console.error('[Scheduler] Xato:', err.message);
  }
}

// ── ISHGA TUSHIRISH ──
// Har kecha 02:00 da
function start() {
  _cronJob = cron.schedule('0 2 * * *', runAll, {
    scheduled: true,
    timezone: 'Asia/Tashkent'
  });
  console.log('[Scheduler] Ishga tushdi — har kecha 02:00 (Toshkent vaqti)');
}

function stop() {
  if (_cronJob) {
    _cronJob.stop();
    console.log('[Scheduler] To\'xtatildi.');
  }
}

module.exports = { start, stop, setBot, runAll };
