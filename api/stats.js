'use strict';

const ChatHistory = require('../models/ChatHistory');
const ChatSession = require('../models/ChatSession');
const Persona     = require('../models/Persona');
const Subscription = require('../models/Subscription');
const PptFile     = require('../models/PptFile');
const UserBot     = require('../models/UserBot');

const PLAN_LIMITS = {
  free:    { ai: 30,   ppt: 2,   pptPro: 0,  sessions: 2,       personas: 0         },
  starter: { ai: 500,  ppt: 15,  pptPro: 5,  sessions: 20,      personas: 3         },
  pro:     { ai: 2000, ppt: 50,  pptPro: 20, sessions: 50,      personas: 10        },
  premium: { ai: 5000, ppt: 100, pptPro: 50, sessions: Infinity, personas: Infinity }
};

const PLAN_NAMES = {
  free: 'Free', starter: 'Starter', pro: 'Pro', premium: 'Premium'
};

// GET /api/stats
async function getStats(req, res) {
  try {
    var uid    = req.user.userId;
    var botDoc = await UserBot.findById(req.botId);
    var plan   = botDoc ? (botDoc.currentPlan || 'free') : 'free';
    var lims   = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    var hist     = await ChatHistory.findOne({ botId: req.botId, userTelegramId: uid });
    var msgCount = hist ? Math.floor((hist.messages || []).length / 2) : 0;
    var sessCount = await ChatSession.countDocuments({ botId: req.botId, userTelegramId: uid, isActive: true });
    var pptCount  = await PptFile.countDocuments({ botId: req.botId, userTelegramId: uid });
    var perCount  = await Persona.countDocuments({ botId: req.botId, userTelegramId: uid, isActive: true });

    var sub = null;
    var subInfo = null;
    if (req.isOwner) {
      sub = await Subscription.findOne({ telegramId: uid, status: { $in: ['active','grace'] } }).sort({ activatedAt: -1 });
      if (sub) {
        var dl = sub.expiresAt ? Math.ceil((sub.expiresAt - new Date()) / (1000*60*60*24)) : 0;
        subInfo = {
          plan:      sub.plan,
          planName:  PLAN_NAMES[sub.plan] || sub.plan,
          status:    sub.status,
          expiresAt: sub.expiresAt ? sub.expiresAt.toLocaleDateString('ru-RU') : null,
          daysLeft:  dl
        };
      }
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
      monthly: req.isOwner && botDoc ? {
        ai:       botDoc.monthlyMessages || 0,
        ppt:      botDoc.monthlyPpt      || 0,
        pptPro:   botDoc.monthlyPptPro   || 0,
        sessions: botDoc.monthlySessions || 0
      } : null,
      limits: {
        ai:       lims.ai,
        ppt:      lims.ppt,
        pptPro:   lims.pptPro,
        sessions: lims.sessions === Infinity ? null : lims.sessions,
        personas: lims.personas === Infinity ? null : lims.personas
      },
      subscription: subInfo,
      totalMessages: botDoc ? (botDoc.totalMessages || 0) : 0
    });
  } catch (e) {
    console.error('[API/stats]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

module.exports = { getStats };
