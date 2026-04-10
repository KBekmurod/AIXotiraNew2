'use strict';

// ═══════════════════════════════════════════════
// SCHEDULER — Obuna muddati va eslatmalar
// Har kecha soat 02:00 da ishlaydi
// ═══════════════════════════════════════════════

const cron         = require('node-cron');
const Subscription = require('./models/Subscription');
const UserBot      = require('./models/UserBot');
const UserProfile  = require('./models/UserProfile');
const { t }        = require('./utils/i18n');

var _individualBot = null;
var _botConfig     = null;
var _cronJob       = null;

const GRACE_DAYS = 3;
const PLAN_NAMES = {
  free: '📦 Free', starter: '⭐ Starter', pro: '🚀 Pro', premium: '💎 Premium'
};

function setBot(botInstance, botCfg) {
  _individualBot = botInstance;
  _botConfig     = botCfg;
}

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
async function notifyExpiring() {
  var now     = new Date();
  var in7days = new Date(now); in7days.setDate(in7days.getDate() + 7);

  var subs7 = await Subscription.find({
    status: 'active', notified7d: false,
    expiresAt: { $gt: now, $lte: in7days }
  });
  for (var i = 0; i < subs7.length; i++) {
    var s = subs7[i];
    await sendMsg(s.telegramId, t('sub_expiry_7d', 'uz', PLAN_NAMES[s.plan]||s.plan, s.expiresAt.toLocaleDateString('ru-RU')));
    await Subscription.findByIdAndUpdate(s._id, { $set: { notified7d: true } });
    console.log('[Scheduler] 7 kun eslatma → ' + s.telegramId + ' (' + s.uniqueId + ')');
  }

  var in1day = new Date(now); in1day.setDate(in1day.getDate() + 1);
  var subs1 = await Subscription.find({
    status: 'active', notified1d: false,
    expiresAt: { $gt: now, $lte: in1day }
  });
  for (var j = 0; j < subs1.length; j++) {
    var s2 = subs1[j];
    await sendMsg(s2.telegramId, t('sub_expiry_1d', 'uz', PLAN_NAMES[s2.plan]||s2.plan, s2.expiresAt.toLocaleDateString('ru-RU')));
    await Subscription.findByIdAndUpdate(s2._id, { $set: { notified1d: true } });
    console.log('[Scheduler] 1 kun eslatma → ' + s2.telegramId + ' (' + s2.uniqueId + ')');
  }
}

// ── 2. GRACE PERIOD BOSHLASH ──
async function startGrace() {
  var now     = new Date();
  var expired = await Subscription.find({ status: 'active', expiresAt: { $lt: now } });
  for (var i = 0; i < expired.length; i++) {
    var s = expired[i];
    var graceEndsAt = new Date(s.expiresAt);
    graceEndsAt.setDate(graceEndsAt.getDate() + GRACE_DAYS);
    await Subscription.findByIdAndUpdate(s._id, { $set: { status: 'grace', graceEndsAt: graceEndsAt } });
    await sendMsg(s.telegramId, t('sub_grace_started', 'uz', PLAN_NAMES[s.plan]||s.plan, graceEndsAt.toLocaleDateString('ru-RU')));
    console.log('[Scheduler] Grace period boshlandi → ' + s.telegramId + ' (' + s.uniqueId + ')');
  }
}

// ── 3. FREE GA TUSHIRISH ──
async function downgradeExpired() {
  var now     = new Date();
  var expired = await Subscription.find({ status: 'grace', graceEndsAt: { $lt: now } });
  for (var i = 0; i < expired.length; i++) {
    var s = expired[i];
    await Subscription.findByIdAndUpdate(s._id, { $set: { status: 'expired' } });

    // UserProfile ni free ga tushirish (har user uchun alohida)
    if (s.botId) {
      await UserProfile.findOneAndUpdate(
        { botId: s.botId, userTelegramId: String(s.telegramId) },
        { $set: { currentPlan: 'free' } }
      );
    } else {
      // Backward compat — eski yozuvlar uchun
      await UserBot.findOneAndUpdate(
        { ownerTelegramId: String(s.telegramId), isActive: true },
        { $set: { currentPlan: 'free' } }
      );
    }

    await sendMsg(s.telegramId, t('sub_downgraded', 'uz'));
    console.log('[Scheduler] Free ga tushirildi → ' + s.telegramId + ' (' + s.uniqueId + ')');
  }
}

// ── BARCHA VAZIFALAR ──
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
