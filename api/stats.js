'use strict';

const ChatHistory  = require('../models/ChatHistory');
const ChatSession  = require('../models/ChatSession');
const Persona      = require('../models/Persona');
const Subscription = require('../models/Subscription');
const PptFile      = require('../models/PptFile');
const UserBot      = require('../models/UserBot');
const { PLAN_LIMITS, PLAN_NAMES, resetMonthlyIfNeeded } = require('./helpers');

async function getStats(req, res) {
  try {
    var uid    = req.user.userId;
    var botDoc = await UserBot.findById(req.botId);
    if (!botDoc) return res.status(503).json({ error: 'Bot topilmadi' });

    // Oylik reset tekshiruvi
    await resetMonthlyIfNeeded(botDoc);

    var plan = botDoc.currentPlan || 'free';
    var lims = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    var hist      = await ChatHistory.findOne({ botId: req.botId, userTelegramId: uid });
    var msgCount  = hist ? Math.floor((hist.messages || []).length / 2) : 0;
    var sessCount = await ChatSession.countDocuments({ botId: req.botId, userTelegramId: uid, isActive: true });
    var pptCount  = await PptFile.countDocuments({ botId: req.botId, userTelegramId: uid });
    var perCount  = await Persona.countDocuments({ botId: req.botId, userTelegramId: uid, isActive: true });

    var subInfo = null;
    var sub = await Subscription.findOne({
      telegramId: uid, status: { $in: ['active','grace','pending'] }
    }).sort({ createdAt: -1 });

    if (sub) {
      var dl = sub.expiresAt ? Math.ceil((sub.expiresAt - new Date()) / (1000*60*60*24)) : 0;
      subInfo = {
        plan:      sub.plan,
        planName:  PLAN_NAMES[sub.plan] || sub.plan,
        status:    sub.status,
        expiresAt: sub.expiresAt ? sub.expiresAt.toLocaleDateString('ru-RU') : null,
        daysLeft:  dl > 0 ? dl : 0
      };
    }

    res.json({
      plan,
      planName: PLAN_NAMES[plan] || plan,
      isOwner:  req.isOwner,
      counts: {
        messages: msgCount,
        sessions: sessCount,
        ppts:     pptCount,
        personas: perCount
      },
      // Oylik hisoblagichlar va limitlar faqat bot egasiga ko'rsatiladi
      monthly: req.isOwner ? {
        ai:       botDoc.monthlyMessages  || 0,
        ppt:      botDoc.monthlyPpt       || 0,
        pptPro:   botDoc.monthlyPptPro    || 0,
        sessions: botDoc.monthlySessions  || 0
      } : null,
      limits: req.isOwner ? {
        ai:       lims.ai,
        ppt:      lims.ppt,
        pptPro:   lims.pptPro,
        sessions: lims.sessions === Infinity ? null : lims.sessions,
        personas: lims.personas === Infinity ? null : lims.personas
      } : null,
      subscription:  subInfo,
      totalMessages: req.isOwner ? (botDoc.totalMessages || 0) : null
    });
  } catch (e) {
    console.error('[API/stats]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

module.exports = { getStats };
