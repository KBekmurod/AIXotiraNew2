'use strict';

const UserBot      = require('../models/UserBot');
const Subscription = require('../models/Subscription');

// ─────────────────────────────────────────
// PLAN KONSTANTLARI — bir joyda
// ─────────────────────────────────────────
const PLAN_LIMITS = {
  free:    { ai: 30,   ppt: 2,   pptPro: 0,  sessions: 2,        personas: 0,        video: 1   },
  starter: { ai: 500,  ppt: 15,  pptPro: 5,  sessions: 20,       personas: 3,        video: 10  },
  pro:     { ai: 2000, ppt: 50,  pptPro: 20, sessions: 50,       personas: 10,       video: 30  },
  premium: { ai: 5000, ppt: 100, pptPro: 50, sessions: Infinity, personas: Infinity, video: 100 }
};

const PLAN_NAMES = {
  free: 'Free', starter: 'Starter', pro: 'Pro', premium: 'Premium'
};

const PLAN_PRICES = {
  starter: { discounted: '19 000', original: '29 000' },
  pro:     { discounted: '39 000', original: '59 000' },
  premium: { discounted: '59 000', original: '99 000' }
};

// ─────────────────────────────────────────
// OYLIK RESET — har API so'rovda tekshiriladi
// ─────────────────────────────────────────


async function resetMonthlyIfNeeded(botDoc) {
  var current = monthStr();
  if (botDoc.monthlyReset !== current) {
    await UserBot.findByIdAndUpdate(botDoc._id, {
      $set: {
        monthlyMessages:  0,
        monthlyPpt:       0,
        monthlyPptPro:    0,
        monthlySessions:  0,
        monthlyVideo:     0,
        monthlyReset:     current
      }
    });
    botDoc.monthlyMessages  = 0;
    botDoc.monthlyPpt       = 0;
    botDoc.monthlyPptPro    = 0;
    botDoc.monthlySessions  = 0;
    botDoc.monthlyVideo     = 0;
    botDoc.monthlyReset     = current;
  }
  return botDoc;
}

// ─────────────────────────────────────────
// LIMIT TEKSHIRUVI — har bir action uchun
// ─────────────────────────────────────────

// AI xabar limiti
function checkAILimit(botDoc) {
  var plan = botDoc.currentPlan || 'free';
  var lims = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  var used = botDoc.monthlyMessages || 0;
  if (used >= lims.ai) {
    return {
      allowed: false,
      code:    'LIMIT_AI',
      plan:    plan,
      planName: PLAN_NAMES[plan],
      used:    used,
      limit:   lims.ai,
      message: PLAN_NAMES[plan] + ' tarifida oylik ' + lims.ai + ' ta AI xabar limiti tugadi. Obunani yangilang.'
    };
  }
  return { allowed: true };
}

// PPT limiti
function checkPptLimit(botDoc, isPro) {
  var plan = botDoc.currentPlan || 'free';
  var lims = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  if (isPro) {
    if (lims.pptPro === 0) {
      return {
        allowed:  false,
        code:     'PLAN_PPT_PRO',
        plan:     plan,
        planName: PLAN_NAMES[plan],
        message:  'Pro prezentatsiya ' + PLAN_NAMES[plan] + ' tarifida mavjud emas. Obunani yangilang.'
      };
    }
    var usedPro = botDoc.monthlyPptPro || 0;
    if (usedPro >= lims.pptPro) {
      return {
        allowed:  false,
        code:     'LIMIT_PPT_PRO',
        plan:     plan,
        planName: PLAN_NAMES[plan],
        used:     usedPro,
        limit:    lims.pptPro,
        message:  PLAN_NAMES[plan] + ' tarifida oylik ' + lims.pptPro + ' ta Pro PPT limiti tugadi.'
      };
    }
  } else {
    var usedPpt = botDoc.monthlyPpt || 0;
    if (usedPpt >= lims.ppt) {
      return {
        allowed:  false,
        code:     'LIMIT_PPT',
        plan:     plan,
        planName: PLAN_NAMES[plan],
        used:     usedPpt,
        limit:    lims.ppt,
        message:  PLAN_NAMES[plan] + ' tarifida oylik ' + lims.ppt + ' ta PPT limiti tugadi. Obunani yangilang.'
      };
    }
  }
  return { allowed: true };
}

// Sessiya limiti
function checkSessionLimit(botDoc) {
  var plan = botDoc.currentPlan || 'free';
  var lims = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  if (lims.sessions === Infinity) return { allowed: true };
  var used = botDoc.monthlySessions || 0;
  if (used >= lims.sessions) {
    return {
      allowed:  false,
      code:     'LIMIT_SESSION',
      plan:     plan,
      planName: PLAN_NAMES[plan],
      used:     used,
      limit:    lims.sessions,
      message:  PLAN_NAMES[plan] + ' tarifida oylik ' + lims.sessions + ' ta suhbat fayli limiti tugadi.'
    };
  }
  return { allowed: true };
}

// Persona limiti
function checkPersonaLimit(botDoc, currentCount) {
  var plan = botDoc.currentPlan || 'free';
  var lims = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  if (lims.personas === 0) {
    return {
      allowed:  false,
      code:     'PLAN_PERSONA',
      plan:     plan,
      planName: PLAN_NAMES[plan],
      message:  PLAN_NAMES[plan] + ' tarifida model yaratib bo\'lmaydi. Obunani yangilang.'
    };
  }
  if (lims.personas !== Infinity && currentCount >= lims.personas) {
    return {
      allowed:  false,
      code:     'LIMIT_PERSONA',
      plan:     plan,
      planName: PLAN_NAMES[plan],
      used:     currentCount,
      limit:    lims.personas,
      message:  PLAN_NAMES[plan] + ' tarifida maksimal ' + lims.personas + ' ta model yaratish mumkin.'
    };
  }
  return { allowed: true };
}

// ─────────────────────────────────────────
// LIMIT XATOSI RESPONSE FORMATI
// ─────────────────────────────────────────
function limitError(res, check) {
  return res.status(403).json({
    error:    check.message,
    code:     check.code,
    plan:     check.plan,
    planName: check.planName,
    used:     check.used,
    limit:    check.limit
  });
}

// SSE stream uchun limit xatosi
function limitErrorSSE(sendFn, check) {
  sendFn('error', {
    message:  check.message,
    code:     check.code,
    plan:     check.plan,
    planName: check.planName
  });
}

// ─────────────────────────────────────────
// UNIKAL ID YARATISH (obuna uchun)
// ─────────────────────────────────────────
async function generateUniqueId(plan) {
  var prefix = plan.toUpperCase();
  var chars  = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var id, attempts = 0;
  do {
    var s = '';
    for (var i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    id = prefix + '-' + s;
    var ex = await Subscription.findOne({ uniqueId: id });
    if (!ex) break;
    if (++attempts > 30) { id = prefix + '-' + Date.now().toString().slice(-4); break; }
  } while (true);
  return id;
}

// ─────────────────────────────────────────
// OPEN REJIM — alohida foydalanuvchi limiti
// ─────────────────────────────────────────
function monthStr() {
  return new Date().toISOString().slice(0, 7);
}

// open rejimda foydalanuvchining oylik hisobini olish yoki yaratish
function getUserUsage(botDoc, uid) {
  var usage = botDoc.userUsage ? botDoc.userUsage.get(uid) : null;
  var cur   = monthStr();
  if (!usage || usage.reset !== cur) {
    return { ai: 0, ppt: 0, pptPro: 0, sessions: 0, reset: cur };
  }
  return usage;
}

async function saveUserUsage(botDoc, uid, usage) {
  var UserBot = require('../models/UserBot');
  var key = 'userUsage.' + uid;
  var upd = {};
  upd[key] = usage;
  await UserBot.findByIdAndUpdate(botDoc._id, { $set: upd });
}

// open rejim limit tekshiruvi
function checkUserLimit(botDoc, uid, type) {
  var plan  = botDoc.currentPlan || 'free';
  var lims  = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  var usage = getUserUsage(botDoc, uid);

  var used  = usage[type] || 0;
  var limit = lims[type];

  if (limit === 0) {
    return {
      allowed:  false,
      code:     'PLAN_' + type.toUpperCase(),
      plan:     plan,
      planName: PLAN_NAMES[plan],
      message:  PLAN_NAMES[plan] + ' tarifida bu funksiya mavjud emas.'
    };
  }
  if (limit !== Infinity && used >= limit) {
    return {
      allowed:  false,
      code:     'LIMIT_' + type.toUpperCase(),
      plan:     plan,
      planName: PLAN_NAMES[plan],
      used:     used,
      limit:    limit,
      message:  PLAN_NAMES[plan] + ' tarifida oylik ' + limit + ' ta limit tugadi.'
    };
  }
  return { allowed: true, usage: usage };
}

// ─────────────────────────────────────────
// XABAR UZUNLIGI TEKSHIRUVI
// ─────────────────────────────────────────
var MAX_MSG_LENGTH = 4000; // belgi

function validateMessage(msg) {
  if (!msg || !msg.trim()) return { ok: false, error: 'Xabar bo\'sh' };
  if (msg.length > MAX_MSG_LENGTH) return { ok: false, error: 'Xabar juda uzun (max 4000 belgi)' };
  return { ok: true };
}

module.exports = {
  PLAN_LIMITS,
  PLAN_NAMES,
  PLAN_PRICES,
  monthStr,
  resetMonthlyIfNeeded,
  checkAILimit,
  checkPptLimit,
  checkSessionLimit,
  checkPersonaLimit,
  limitError,
  limitErrorSSE,
  generateUniqueId,
  validateMessage,
  getUserUsage,
  saveUserUsage,
  checkUserLimit
};
