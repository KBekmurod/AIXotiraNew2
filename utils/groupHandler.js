'use strict';

// ═══════════════════════════════════════════════════════════
// GROUP HANDLER — Gruppa va kanal uchun AI suhbat
//
// Trigger shartlari:
//   1. /ai <savol>           — buyruq bilan
//   2. @bot_username <savol> — mention bilan
//   3. Bot xabariga reply    — javob berish
//
// Limit zanjiri:
//   GroupProfile.limit bor → AI ishlaydi
//   GroupProfile.limit tugagan → UserProfile tekshiriladi
//   UserProfile.limit ham tugagan → xabar yuboriladi
// ═══════════════════════════════════════════════════════════

const GroupProfile      = require('../models/GroupProfile');
const GroupChatHistory  = require('../models/GroupChatHistory');
const UserProfile       = require('../models/UserProfile');
const UserBot           = require('../models/UserBot');
const Subscription      = require('../models/Subscription');
const { getAIResponse } = require('./ai');

// ── Plan limitleri (shaxsiy bot bilan bir xil) ──
const PLAN_LIMITS = {
  free:    { ai: 30,   ppt: 2  },
  starter: { ai: 500,  ppt: 15 },
  pro:     { ai: 2000, ppt: 50 },
  premium: { ai: 5000, ppt: 100}
};

const PLAN_NAMES = {
  free: '📦 Free', starter: '⭐ Starter', pro: '🚀 Pro', premium: '💎 Premium'
};

// ── Oylik string ──
function monthStr() { return new Date().toISOString().slice(0, 7); }

// ── Gruppa profili olish yoki yaratish ──
async function getOrCreateGroupProfile(botId, ctx) {
  var chatId    = String(ctx.chat.id);
  var chatType  = ctx.chat.type || 'group';
  var chatTitle = ctx.chat.title || '';

  var profile = await GroupProfile.findOne({ botId, chatId });
  if (!profile) {
    profile = await GroupProfile.create({
      botId, chatId, chatType, chatTitle,
      currentPlan: 'free',
      adminUserIds: []
    });
  } else if (profile.chatTitle !== chatTitle && chatTitle) {
    // Guruh nomi o'zgansa yangilash
    await GroupProfile.findByIdAndUpdate(profile._id, { $set: { chatTitle, updatedAt: new Date() } });
    profile.chatTitle = chatTitle;
  }
  return profile;
}

// ── Oylik reset (gruppa) ──
async function resetGroupMonthlyIfNeeded(profile) {
  var current = monthStr();
  if (profile.monthlyReset !== current) {
    await GroupProfile.findByIdAndUpdate(profile._id, {
      $set: { monthlyMessages: 0, monthlyPpt: 0, monthlyReset: current }
    });
    profile.monthlyMessages = 0;
    profile.monthlyPpt      = 0;
    profile.monthlyReset    = current;
  }
  return profile;
}

// ── Oylik reset (user profili) ──
async function resetUserMonthlyIfNeeded(profile) {
  var current = monthStr();
  if (profile.monthlyReset !== current) {
    await UserProfile.findByIdAndUpdate(profile._id, {
      $set: { monthlyMessages: 0, monthlyPpt: 0, monthlyPptPro: 0, monthlySessions: 0, monthlyReset: current }
    });
    profile.monthlyMessages = 0;
    profile.monthlyReset    = current;
  }
  return profile;
}

// ── Gruppa obunasini tekshirish ──
async function getGroupSub(botId, chatId) {
  return Subscription.findOne({
    groupChatId: chatId,
    botId,
    status: { $in: ['active', 'grace'] }
  }).sort({ activatedAt: -1 });
}

// ═══════════════════════════════════════════════
// ASOSIY LIMIT ZANJIRI
// Gruppa limiti → User limiti → Bloklash
// ═══════════════════════════════════════════════
async function checkGroupAILimit(botId, chatId, uid, lang) {
  // 1. Gruppa profilini olish
  var groupProfile = await GroupProfile.findOne({ botId, chatId });
  if (!groupProfile) return { source: 'none', allowed: false, needsActivation: true };

  await resetGroupMonthlyIfNeeded(groupProfile);

  var groupPlan = groupProfile.currentPlan || 'free';
  var groupLim  = PLAN_LIMITS[groupPlan].ai;

  // 2. Gruppa limitida joy bormi?
  if ((groupProfile.monthlyMessages || 0) < groupLim) {
    return { source: 'group', allowed: true, groupProfile };
  }

  // 3. Gruppa limiti tugadi — user o'z profiliga o'tsin
  var userProfile = await UserProfile.findOne({ botId, userTelegramId: String(uid) });
  if (!userProfile) {
    // User profili yo'q = free
    return {
      source: 'user_free',
      allowed: false,
      groupProfile,
      msg: _limitMsg(lang, 'group_limit_user_activate')
    };
  }

  await resetUserMonthlyIfNeeded(userProfile);

  var userPlan = userProfile.currentPlan || 'free';
  var userLim  = PLAN_LIMITS[userPlan].ai;

  if ((userProfile.monthlyMessages || 0) < userLim) {
    return { source: 'user', allowed: true, groupProfile, userProfile };
  }

  // 4. Ikkalasi ham tugadi
  return {
    source: 'both_exceeded',
    allowed: false,
    groupProfile,
    userProfile,
    msg: _limitMsg(lang, 'both_limit', PLAN_NAMES[userPlan])
  };
}

// ── Limit xabarlari ──
function _limitMsg(lang, key, extra) {
  var msgs = {
    group_limit_user_activate: {
      uz: '⚠️ Gruppa AI limiti tugadi.\n\n' +
          'Davom etish uchun shaxsiy botga o\'ting va obuna oling:\n' +
          '👉 /start yozing — o\'z obunangizni aktivlashtiring.',
      ru: '⚠️ Лимит AI группы исчерпан.\n\n' +
          'Для продолжения перейдите в личный бот и оформите подписку:\n' +
          '👉 Напишите /start — активируйте свою подписку.',
      en: '⚠️ Group AI limit reached.\n\n' +
          'To continue, go to the personal bot and subscribe:\n' +
          '👉 Write /start — activate your subscription.'
    },
    both_limit: {
      uz: '⚠️ Limitingiz tugadi (' + (extra||'') + ').\n\nObuna yangilash uchun shaxsiy botga o\'ting.',
      ru: '⚠️ Ваш лимит исчерпан (' + (extra||'') + ').\n\nОбновите подписку в личном боте.',
      en: '⚠️ Your limit is reached (' + (extra||'') + ').\n\nUpdate subscription in personal bot.'
    }
  };
  var l = lang || 'ru';
  return (msgs[key] && msgs[key][l]) || (msgs[key] && msgs[key].ru) || '';
}

// ── Trigger tekshiruvi ──
// Xabar AI ga yuborilishi kerakmi?
function shouldRespond(ctx, botUsername) {
  var msg  = ctx.message;
  var text = (msg && (msg.text || msg.caption)) || '';
  if (!text) return { respond: false };

  var lc = text.trim().toLowerCase();

  // 1. /ai buyrug'i
  if (lc.startsWith('/ai') || lc.startsWith('/ai@' + (botUsername||'').toLowerCase())) {
    var query = text.replace(/^\/ai(@\S+)?\s*/i, '').trim();
    return { respond: true, query: query || null, trigger: 'command' };
  }

  // 2. @mention
  if (botUsername) {
    var mentionRe = new RegExp('@' + botUsername.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i');
    if (mentionRe.test(text)) {
      var q2 = text.replace(mentionRe, '').trim();
      return { respond: true, query: q2 || null, trigger: 'mention' };
    }
  }

  // 3. Botga reply
  if (msg && msg.reply_to_message && msg.reply_to_message.from) {
    var replyFrom = msg.reply_to_message.from;
    if (replyFrom.is_bot && botUsername &&
        (replyFrom.username || '').toLowerCase() === botUsername.toLowerCase()) {
      return { respond: true, query: text, trigger: 'reply' };
    }
  }

  return { respond: false };
}

// ── Typing action (gruppada ham ishlaydi) ──
async function sendGroupTyping(ctx, botTelegram, chatId) {
  try { await botTelegram.sendChatAction(chatId, 'typing'); } catch(_) {}
}

// ═══════════════════════════════════════════════
// ASOSIY HANDLER — launchUserBot ga ulanadi
// ═══════════════════════════════════════════════
async function handleGroupMessage(ctx, botConfig, botUsername) {
  var msg  = ctx.message;
  if (!msg) return;

  var chatId   = String(ctx.chat.id);
  var uid      = String(ctx.from.id);
  var userName = ctx.from.first_name || ctx.from.username || 'User';
  var lang     = 'ru'; // Gruppada til — default ru (keyinchalik GroupProfile ga qo'shish mumkin)

  // Trigger tekshiruvi
  var check = shouldRespond(ctx, botUsername);
  if (!check.respond) return;

  var query = check.query;

  // Savol bo'sh bo'lsa — help xabari
  if (!query || !query.trim()) {
    var helpMsg = lang === 'uz'
      ? '💬 Savol yozing:\n/ai <savol>\n@' + botUsername + ' <savol>\nYoki menga reply qiling.'
      : lang === 'en'
      ? '💬 Write your question:\n/ai <question>\n@' + botUsername + ' <question>\nOr reply to me.'
      : '💬 Напишите вопрос:\n/ai <вопрос>\n@' + botUsername + ' <вопрос>\nИли ответьте на моё сообщение.';
    try { await ctx.reply(helpMsg, { reply_to_message_id: msg.message_id }); } catch(_) {}
    return;
  }

  // Gruppa profilini yaratish/olish
  var groupProfile = await getOrCreateGroupProfile(botConfig._id, ctx);

  // Limit tekshiruvi
  var limitCheck = await checkGroupAILimit(botConfig._id, chatId, uid, lang);

  if (!limitCheck.allowed) {
    try {
      await ctx.reply(limitCheck.msg || '⚠️ Limit tugadi.', {
        reply_to_message_id: msg.message_id
      });
    } catch(_) {}
    return;
  }

  // Typing
  var typingInterval = null;
  try {
    await ctx.sendChatAction('typing');
    typingInterval = setInterval(function() {
      ctx.sendChatAction('typing').catch(function(){});
    }, 4000);
  } catch(_) {}

  try {
    // Suhbat tarixini olish
    var hist = await GroupChatHistory.findOne({
      botId: botConfig._id,
      chatId,
      userTelegramId: uid
    });
    if (!hist) {
      hist = new GroupChatHistory({
        botId: botConfig._id,
        chatId,
        userTelegramId: uid,
        messages: []
      });
    }

    var histMsgs = hist.messages || [];

    // Gruppa uchun botConfig kengaytmasi
    var cfg = Object.assign({}, botConfig.toObject ? botConfig.toObject() : botConfig);
    cfg.activePersonaPrompt = null;
    // Gruppa kontekstini promptga qo'shish
    cfg.groupContext = {
      chatTitle: groupProfile.chatTitle || ctx.chat.title || 'Gruppa',
      chatType:  groupProfile.chatType || 'group',
      userName:  userName
    };

    // AI javob
    var aiResult  = await getAIResponse(cfg, histMsgs, query, userName);
    if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }

    var aiReply = typeof aiResult === 'object' ? aiResult.text : aiResult;
    var useHTML = typeof aiResult === 'object' ? aiResult.html : false;

    // Tarixni yangilash (max 20 xabar)
    var newMsgs = histMsgs.concat([
      { role: 'user',      content: query,   userName: userName },
      { role: 'assistant', content: aiReply, userName: 'AI'     }
    ]);
    if (newMsgs.length > 20) newMsgs = newMsgs.slice(-20);

    hist.messages  = newMsgs;
    hist.updatedAt = new Date();
    await hist.save();

    // Counterni yangilash
    if (limitCheck.source === 'group') {
      await GroupProfile.findByIdAndUpdate(groupProfile._id, {
        $inc: { monthlyMessages: 1, totalMessages: 1 }
      });
    } else if (limitCheck.source === 'user' && limitCheck.userProfile) {
      await UserProfile.findByIdAndUpdate(limitCheck.userProfile._id, {
        $inc: { monthlyMessages: 1, totalMessages: 1 }
      });
    }
    await UserBot.findByIdAndUpdate(botConfig._id, { $inc: { totalMessages: 1 } });

    // Javobni yuborish (reply shaklida)
    if (useHTML) {
      try {
        await ctx.reply(aiReply, {
          parse_mode: 'HTML',
          reply_to_message_id: msg.message_id
        });
      } catch(e) {
        var plain = aiReply.replace(/<[^>]+>/g, '');
        await ctx.reply(plain, { reply_to_message_id: msg.message_id });
      }
    } else {
      await ctx.reply(aiReply, { reply_to_message_id: msg.message_id });
    }

  } catch(err) {
    if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
    console.error('[GroupHandler] Xato:', err.message);
    try {
      var errMsg = lang === 'uz'
        ? 'Hozir biroz muammo bor. Qayta urinib ko\'ring!'
        : lang === 'en'
        ? 'Something went wrong. Please try again!'
        : 'Произошла ошибка. Попробуйте ещё раз!';
      await ctx.reply(errMsg, { reply_to_message_id: msg.message_id });
    } catch(_) {}
  }
}

module.exports = {
  handleGroupMessage,
  getOrCreateGroupProfile,
  checkGroupAILimit,
  shouldRespond,
  PLAN_LIMITS,
  PLAN_NAMES
};
