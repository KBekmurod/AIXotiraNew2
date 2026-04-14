'use strict';

const { Telegraf, session, Markup } = require('telegraf');
const UserBot      = require('./models/UserBot');
const UserProfile  = require('./models/UserProfile');
const GroupProfile = require('./models/GroupProfile');
const ChatHistory  = require('./models/ChatHistory');
const Subscription = require('./models/Subscription');
const News         = require('./models/News');
const Broadcast    = require('./models/Broadcast');
const { launchUserBot } = require('./individual-bot');

const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID;
const activeBots     = new Map();

const adminBot = new Telegraf(process.env.SUPER_ADMIN_BOT_TOKEN);
adminBot.use(session());

const PLAN_NAMES = {
  free:    '📦 Free',
  starter: '⭐ Starter',
  pro:     '🚀 Pro',
  premium: '💎 Premium'
};

function esc(text) {
  return String(text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Faqat admin
adminBot.use(function(ctx, next) {
  if (String(ctx.from.id) !== String(SUPER_ADMIN_ID)) return ctx.reply('Bu bot faqat admin uchun.');
  return next();
});

// Xavfsiz edit helper
async function safeEdit(ctx, text, extra) {
  try {
    if (extra) await ctx.editMessageText(text, extra);
    else        await ctx.editMessageText(text);
  } catch (e) {
    try {
      if (extra) await ctx.reply(text, extra);
      else        await ctx.reply(text);
    } catch (_) {}
  }
}

// ═══════════════════════════════════════════════
// ASOSIY MENYU
// ═══════════════════════════════════════════════
async function showMainMenu(ctx) {
  var botDoc  = await UserBot.findOne({ isActive: true });
  var userCount = botDoc ? botDoc.allowedUsers.length : 0;

  var activeSubs  = await Subscription.countDocuments({ status: 'active' });
  var graceSubs   = await Subscription.countDocuments({ status: 'grace' });
  var pendingSubs = await Subscription.countDocuments({ status: 'pending' });
  var groupCount  = await GroupProfile.countDocuments({ isActive: true });

  var statusLine = '';
  if (pendingSubs > 0) statusLine = '\n⚠️ ' + pendingSubs + ' ta obuna to\'lovi kutilmoqda!';
  if (graceSubs > 0)   statusLine += '\n🔶 ' + graceSubs + ' ta obuna grace periodda';

  await ctx.reply(
    '🛡 Admin Panel\n\n' +
    '👥 Foydalanuvchilar: ' + userCount + ' ta\n' +
    '💬 Gruppalar/Kanallar: ' + groupCount + ' ta\n' +
    '⭐ Faol obunalar: ' + activeSubs + ' ta' +
    statusLine + '\n\n' +
    'Amalni tanlang:',
    Markup.keyboard([
      ['⭐ Obunalar',          '📊 Statistika'],
      ['📋 Foydalanuvchilar', '💬 Gruppalar'],
      ['🔍 Qidirish',          '📰 Yangiliklar'],
      ['📢 Xabar yuborish']
    ]).resize()
  );
}

adminBot.start(async function(ctx) { ctx.session = {}; await showMainMenu(ctx); });
adminBot.command('bekor', async function(ctx) { ctx.session = {}; await showMainMenu(ctx); });

// ═══════════════════════════════════════════════
// /activate PLAN-XXXX — Universal obuna tasdiqlash
// ═══════════════════════════════════════════════
adminBot.command('activate', async function(ctx) {
  var parts    = ctx.message.text.trim().split(/\s+/);
  var uniqueId = (parts[1] || '').toUpperCase();
  if (!uniqueId) return ctx.reply('Ishlatish: /activate PRO-K7M2\n\nSubskriptsiya ID sini kiriting.');
  await activateByUniqueId(ctx, uniqueId);
});

async function activateByUniqueId(ctx, uniqueId) {
  try {
    var sub = await Subscription.findOne({ uniqueId: uniqueId });
    if (!sub) return ctx.reply('❌ ID topilmadi: ' + uniqueId);
    if (sub.status === 'active') {
      return ctx.reply('ℹ️ ' + uniqueId + ' allaqachon faol!\n\nFoydalanuvchi: ' + (sub.firstName || '') + '\nMuddat: ' + (sub.expiresAt ? sub.expiresAt.toLocaleDateString('ru-RU') : '—') + ' gacha');
    }
    if (sub.status === 'expired') return ctx.reply('⚠️ ' + uniqueId + ' allaqachon tugagan (expired).');

    var now       = new Date();
    var expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + (sub.durationMonths || 1));
    var graceEndsAt = new Date(expiresAt);
    graceEndsAt.setDate(graceEndsAt.getDate() + 3);

    sub.status      = 'active';
    sub.activatedAt = now;
    sub.expiresAt   = expiresAt;
    sub.graceEndsAt = graceEndsAt;
    sub.notified7d  = false;
    sub.notified1d  = false;
    await sub.save();

    // DB yangilash — UserProfile (har user uchun alohida plan)
    var botIdForSub = sub.botId || null;
    if (botIdForSub) {
      await UserProfile.findOneAndUpdate(
        { botId: botIdForSub, userTelegramId: String(sub.telegramId) },
        { $set: { currentPlan: sub.plan } },
        { upsert: true }
      );
    } else {
      // Backward compat — eski yozuvlar uchun
      await UserBot.findOneAndUpdate(
        { ownerTelegramId: String(sub.telegramId), isActive: true },
        { $set: { currentPlan: sub.plan } }
      );
    }

    // RAM yangilash — activeBots dan bot.botConfig orqali (owner uchun)
    for (var [, runningBot] of activeBots) {
      if (runningBot.botConfig &&
          String(runningBot.botConfig.ownerTelegramId) === String(sub.telegramId)) {
        runningBot.botConfig.currentPlan = sub.plan;
        break;
      }
    }

    var expires  = expiresAt.toLocaleDateString('ru-RU');
    var planName = PLAN_NAMES[sub.plan] || sub.plan;

    // Foydalanuvchiga xabar — activeBots dan running bot telegram orqali
    var sent = false;
    for (var [, rb] of activeBots) {
      if (rb.botConfig &&
          String(rb.botConfig.ownerTelegramId) === String(sub.telegramId)) {
        try {
          await rb.telegram.sendMessage(
            String(sub.telegramId),
            '✅ ' + planName + " obuna faollashtirildi!\n\n" +
            '📅 Muddat: ' + expires + ' gacha\n\n' +
            'Barcha imkoniyatlardan foydalaning! 🎉'
          );
          sent = true;
        } catch (e) { console.error('[Admin] Foydalanuvchiga xabar xato:', e.message); }
        break;
      }
    }

    var resultText =
      '✅ ' + uniqueId + ' faollashtirildi!\n\n' +
      'Foydalanuvchi: ' + (sub.firstName || "Noma\'lum") + (sub.username ? ' @' + sub.username : '') + '\n' +
      'Tarif: ' + planName + '\n' +
      'Muddat: ' + expires + ' gacha' +
      (sent ? '' : '\n\n⚠️ Foydalanuvchiga xabar yuborilmadi (bot topilmadi)');

    if (ctx.callbackQuery) {
      await safeEdit(ctx, resultText);
    } else {
      await ctx.reply(resultText);
    }
  } catch (err) {
    console.error('[activate] Xato:', err.message);
    var errMsg = '❌ Xato: ' + err.message;
    if (ctx.callbackQuery) await safeEdit(ctx, errMsg);
    else await ctx.reply(errMsg);
  }
}

// Inline tasdiqlash tugmasi (individual botdan kelgan bildirishnomaga)
adminBot.action(/^adm_activate_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery('Tasdiqlanmoqda...');
  var uniqueId = ctx.match[1];
  await activateByUniqueId(ctx, uniqueId);
});

// ═══════════════════════════════════════════════
// ⭐ OBUNALAR
// ═══════════════════════════════════════════════
adminBot.hears('⭐ Obunalar', async function(ctx) {
  ctx.session = {};
  await showSubsMenu(ctx, false);
});

async function showSubsMenu(ctx, edit) {
  var pending = await Subscription.find({ status: 'pending' }).sort({ createdAt: -1 });
  var active  = await Subscription.find({ status: { $in: ['active', 'grace'] } }).sort({ activatedAt: -1 });
  var expired = await Subscription.find({ status: 'expired' }).sort({ expiresAt: -1 }).limit(10);

  var text = '⭐ Obunalar\n\n' +
    '⏳ Kutilayotgan: ' + pending.length + ' ta\n' +
    '✅ Faol: ' + active.length + ' ta\n' +
    '❌ Tugagan (oxirgi 10): ' + expired.length + ' ta\n\n';

  var btns = [
    [Markup.button.callback('⏳ Kutilayotganlar (' + pending.length + ')', 'subs_pending')],
    [Markup.button.callback('✅ Faol obunalar (' + active.length + ')',   'subs_active')],
    [Markup.button.callback('📋 Tugaganlar',                               'subs_expired')]
  ];

  // Kutilayotganlar to'g'ridan-to'g'ri ko'rinsin
  if (pending.length > 0) {
    text += '⏳ Kutilayotganlar:\n\n';
    pending.forEach(function(s, i) {
      text += (i+1) + '. ' + (PLAN_NAMES[s.plan] || s.plan) + '\n';
      text += '   ' + (s.firstName || '') + (s.username ? ' @' + s.username : '') + '\n';
      text += '   ID: ' + s.uniqueId + '\n\n';
      btns.push([Markup.button.callback('✅ Tasdiqlash — ' + s.uniqueId, 'adm_activate_' + s.uniqueId)]);
    });
  }

  if (edit) await safeEdit(ctx, text, Markup.inlineKeyboard(btns));
  else       await ctx.reply(text, Markup.inlineKeyboard(btns));
}

adminBot.action('subs_pending', async function(ctx) {
  await ctx.answerCbQuery();
  var list = await Subscription.find({ status: 'pending' }).sort({ createdAt: -1 });
  if (!list.length) return safeEdit(ctx, '⏳ Kutilayotgan obuna yo\'q.');
  var text = '⏳ Kutilayotganlar (' + list.length + ' ta):\n\n';
  var btns = [];
  list.forEach(function(s, i) {
    var d = new Date(s.createdAt).toLocaleDateString('ru-RU');
    text += (i+1) + '. ' + (PLAN_NAMES[s.plan] || s.plan) + ' — ' + (s.firstName || '') + (s.username ? ' @' + s.username : '') + '\n';
    text += '   ID: ' + s.uniqueId + '  |  ' + d + '\n\n';
    btns.push([Markup.button.callback('✅ ' + s.uniqueId + ' tasdiqlash', 'adm_activate_' + s.uniqueId)]);
  });
  btns.push([Markup.button.callback('◀️ Orqaga', 'subs_back')]);
  await safeEdit(ctx, text, Markup.inlineKeyboard(btns));
});

adminBot.action('subs_active', async function(ctx) {
  await ctx.answerCbQuery();
  var list = await Subscription.find({ status: { $in: ['active', 'grace'] } }).sort({ activatedAt: -1 });
  if (!list.length) return safeEdit(ctx, '✅ Faol obuna yo\'q.');
  var text = '✅ Faol obunalar (' + list.length + ' ta):\n\n';
  list.forEach(function(s, i) {
    var daysLeft = s.expiresAt ? Math.ceil((s.expiresAt - new Date()) / (1000*60*60*24)) : 0;
    var expires  = s.expiresAt ? s.expiresAt.toLocaleDateString('ru-RU') : '—';
    var graceTag = s.status === 'grace' ? ' 🔶 Grace' : '';
    text += (i+1) + '. ' + (PLAN_NAMES[s.plan] || s.plan) + graceTag + '\n';
    text += '   ' + (s.firstName || '') + (s.username ? ' @' + s.username : '') + '\n';
    text += '   ' + expires + ' gacha (' + Math.max(0, daysLeft) + ' kun)\n\n';
  });
  await safeEdit(ctx, text, Markup.inlineKeyboard([[Markup.button.callback('◀️ Orqaga', 'subs_back')]]));
});

adminBot.action('subs_expired', async function(ctx) {
  await ctx.answerCbQuery();
  var list = await Subscription.find({ status: 'expired' }).sort({ expiresAt: -1 }).limit(10);
  if (!list.length) return safeEdit(ctx, '❌ Tugagan obuna yo\'q.');
  var text = '❌ Tugagan obunalar (oxirgi 10):\n\n';
  list.forEach(function(s, i) {
    var expires = s.expiresAt ? s.expiresAt.toLocaleDateString('ru-RU') : '—';
    text += (i+1) + '. ' + (PLAN_NAMES[s.plan] || s.plan) + '\n';
    text += '   ' + (s.firstName || '') + (s.username ? ' @' + s.username : '') + '\n';
    text += '   Tugagan: ' + expires + '\n\n';
  });
  await safeEdit(ctx, text, Markup.inlineKeyboard([[Markup.button.callback('◀️ Orqaga', 'subs_back')]]));
});

adminBot.action('subs_back', async function(ctx) {
  await ctx.answerCbQuery();
  await showSubsMenu(ctx, true);
});

// ═══════════════════════════════════════════════
// 📋 FOYDALANUVCHILAR — To\'liq management
// ═══════════════════════════════════════════════
const USERS_PAGE = 15;

adminBot.hears('📋 Foydalanuvchilar', async function(ctx) {
  ctx.session = {};
  await showUsersList(ctx, 0, false);
});

async function showUsersList(ctx, page, edit) {
  var botDoc = await UserBot.findOne({ isActive: true });
  if (!botDoc) return ctx.reply('Bot topilmadi.');
  var allIds = botDoc.allowedUsers || [];
  if (!allIds.length) {
    var msg = 'Hali foydalanuvchi yo\'q.';
    if (edit) return safeEdit(ctx, msg);
    return ctx.reply(msg);
  }
  var profiles = await UserProfile.find({ botId: botDoc._id, userTelegramId: { $in: allIds } })
    .sort({ joinedAt: -1 }).skip(page * USERS_PAGE).limit(USERS_PAGE);
  var total    = allIds.length;
  var tp       = Math.ceil(total / USERS_PAGE) || 1;
  var blocked  = await UserProfile.countDocuments({ botId: botDoc._id, isBlocked: true });
  var header   = '👥 Foydalanuvchilar (' + total + ' ta) — ' + (page+1) + '/' + tp + ' sahifa' +
                 (blocked ? '\n🚫 Bloklangan: ' + blocked + ' ta' : '') + '\n\nBirorini tanlang:';

  var btns = profiles.map(function(p) {
    var name  = (p.firstName || ('ID:' + p.userTelegramId)).slice(0, 18);
    var uname = p.telegramUsername ? ' @' + p.telegramUsername.slice(0,10) : '';
    var plan  = p.currentPlan !== 'free' ? ' ' + (PLAN_NAMES[p.currentPlan]||'') : '';
    var blk   = p.isBlocked ? ' 🚫' : '';
    return [Markup.button.callback(name + uname + plan + blk, 'usr_view_' + p.userTelegramId)];
  });

  // Profili yo\'q userlar (eski)
  var withProfile = profiles.map(function(p){ return p.userTelegramId; });
  var noProf = allIds.filter(function(id){ return !withProfile.includes(id); }).slice(0, 3);
  noProf.forEach(function(id){ btns.push([Markup.button.callback('ID: ' + id, 'usr_view_' + id)]); });

  var nav = [];
  if (page > 0)    nav.push(Markup.button.callback('◀️', 'usr_pg_' + (page-1)));
  if (page < tp-1) nav.push(Markup.button.callback('▶️', 'usr_pg_' + (page+1)));
  if (nav.length)  btns.push(nav);
  btns.push([Markup.button.callback('🔍 Qidirish', 'usr_search_btn')]);

  if (edit) await safeEdit(ctx, header, Markup.inlineKeyboard(btns));
  else       await ctx.reply(header, Markup.inlineKeyboard(btns));
}

adminBot.action(/^usr_pg_(\d+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  await showUsersList(ctx, parseInt(ctx.match[1]), true);
});

adminBot.action('usr_search_btn', async function(ctx) {
  await ctx.answerCbQuery();
  ctx.session = { step: 'search_user' };
  await safeEdit(ctx, 'Foydalanuvchi Telegram ID yoki @username kiriting:');
});

// ── User profili ──
adminBot.action(/^usr_view_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var uid2   = ctx.match[1];
  var botDoc = await UserBot.findOne({ isActive: true });
  var prof   = await UserProfile.findOne({ botId: botDoc._id, userTelegramId: uid2 });
  var sub    = await Subscription.findOne({ telegramId: uid2, botId: botDoc._id, status: { $in: ['active','grace'] } }).sort({ activatedAt: -1 });

  var name   = (prof && prof.firstName)         || 'Noma\'lum';
  var uname  = (prof && prof.telegramUsername)  ? '@' + prof.telegramUsername : '—';
  var plan   = (prof && PLAN_NAMES[prof.currentPlan]) || '📦 Free';
  var joined = (prof && prof.joinedAt)          ? new Date(prof.joinedAt).toLocaleDateString('ru-RU') : '—';
  var msgs   = (prof && prof.totalMessages)     || 0;
  var blk    = prof  && prof.isBlocked;
  var aiNom  = (prof && prof.customBotName)     || '—';
  var aiPers = (prof && prof.customPersonality) || '—';
  var aiLang = (prof && prof.customLanguage)    || '—';
  var hasEx  = prof  && prof.customExtra;
  var subTxt = sub && sub.expiresAt ? sub.expiresAt.toLocaleDateString('ru-RU') + ' gacha' : '—';

  var txt =
    '👤 Foydalanuvchi\n\n' +
    'Ism: ' + name + '\n' +
    'Username: ' + uname + '\n' +
    'ID: ' + uid2 + '\n' +
    'Qo\'shilgan: ' + joined + '\n' +
    'Xabarlar: ' + msgs + ' ta\n' +
    'Plan: ' + plan + '\n' +
    'Obuna: ' + subTxt +
    (blk ? '\n🚫 BLOKLANGAN' : '') +
    '\n\n🤖 AI sozlamalari:\n' +
    'Nom: ' + aiNom + '  Uslub: ' + aiPers + '  Til: ' + aiLang + '\n' +
    'Prompt: ' + (hasEx ? '✅ bor' : '—');

  var row1 = [Markup.button.callback('⭐ Plan', 'usr_plan_' + uid2), Markup.button.callback('🔄 Reset', 'usr_reset_' + uid2)];
  var row2 = [Markup.button.callback('🗑 Xotira', 'usr_clrmem_' + uid2), Markup.button.callback('✉️ Xabar', 'usr_msg_' + uid2)];
  var row3 = [blk
    ? Markup.button.callback('✅ Blokdan chiqar', 'usr_unblock_' + uid2)
    : Markup.button.callback('🚫 Bloklash', 'usr_block_' + uid2)];
  var row4 = [Markup.button.callback('🗑 O\'chirish', 'usr_del_' + uid2), Markup.button.callback('◀️ Ro\'yxat', 'usr_back_list')];

  await safeEdit(ctx, txt, Markup.inlineKeyboard([row1, row2, row3, row4]));
});

adminBot.action('usr_back_list', async function(ctx) {
  await ctx.answerCbQuery();
  await showUsersList(ctx, 0, true);
});

// ── Plan o\'zgartirish ──
adminBot.action(/^usr_plan_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var uid2 = ctx.match[1];
  await safeEdit(ctx, '⭐ Plan tanlang — ID: ' + uid2, Markup.inlineKeyboard([
    [Markup.button.callback('📦 Free',    'usr_setplan_' + uid2 + '_free')],
    [Markup.button.callback('⭐ Starter', 'usr_setplan_' + uid2 + '_starter')],
    [Markup.button.callback('🚀 Pro',     'usr_setplan_' + uid2 + '_pro')],
    [Markup.button.callback('💎 Premium', 'usr_setplan_' + uid2 + '_premium')],
    [Markup.button.callback('◀️ Orqaga',  'usr_view_' + uid2)]
  ]));
});

adminBot.action(/^usr_setplan_(.+)_(free|starter|pro|premium)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var uid2 = ctx.match[1]; var plan = ctx.match[2];
  var botDoc = await UserBot.findOne({ isActive: true });
  await UserProfile.findOneAndUpdate(
    { botId: botDoc._id, userTelegramId: uid2 },
    { $set: { currentPlan: plan, updatedAt: new Date() } },
    { upsert: true }
  );
  for (var [, rb] of activeBots) {
    if (rb && rb.telegram) {
      try { await rb.telegram.sendMessage(uid2, '⭐ Sizning planningiz ' + (PLAN_NAMES[plan]||plan) + ' ga o\'zgardi!'); } catch(_) {}
      break;
    }
  }
  await safeEdit(ctx, '✅ Plan o\'zgardi: ' + (PLAN_NAMES[plan]||plan) + ' — ' + uid2);
});

// ── Limit reset ──
adminBot.action(/^usr_reset_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var uid2 = ctx.match[1]; var botDoc = await UserBot.findOne({ isActive: true });
  await UserProfile.findOneAndUpdate(
    { botId: botDoc._id, userTelegramId: uid2 },
    { $set: { monthlyMessages:0, monthlyPpt:0, monthlyPptPro:0, monthlySessions:0, monthlyReset:'', updatedAt:new Date() } }
  );
  await safeEdit(ctx, '✅ ' + uid2 + ' limiti reset qilindi!');
});

// ── Xotirani tozalash ──
adminBot.action(/^usr_clrmem_(?!do_)(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var uid2 = ctx.match[1];
  await safeEdit(ctx, '🗑 Xotirani tozalash — ' + uid2 + '\n\nBarcha suhbat tarixi o\'chiriladi. Davom etasizmi?',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Ha', 'usr_clrmem_do_' + uid2)],
      [Markup.button.callback('❌ Bekor', 'usr_view_' + uid2)]
    ])
  );
});

adminBot.action(/^usr_clrmem_do_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var uid2 = ctx.match[1]; var botDoc = await UserBot.findOne({ isActive: true });
  await ChatHistory.findOneAndUpdate(
    { botId: botDoc._id, userTelegramId: uid2 },
    { $set: { messages: [], updatedAt: new Date() } }
  );
  await safeEdit(ctx, '✅ ' + uid2 + ' xotirasi tozalandi!');
});

// ── Userga xabar ──
adminBot.action(/^usr_msg_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  ctx.session = { step: 'send_user_msg', targetUid: ctx.match[1] };
  await safeEdit(ctx, '✉️ Xabar matnini yozing:\nQabul qiluvchi: ' + ctx.match[1]);
});

// ── Bloklash ──
adminBot.action(/^usr_block_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var uid2 = ctx.match[1]; var botDoc = await UserBot.findOne({ isActive: true });
  await UserProfile.findOneAndUpdate(
    { botId: botDoc._id, userTelegramId: uid2 },
    { $set: { isBlocked: true, blockedAt: new Date(), updatedAt: new Date() } },
    { upsert: true }
  );
  await safeEdit(ctx, '🚫 ' + uid2 + ' bloklandi!');
  console.log('[Admin] Bloklandi:', uid2);
});

// ── Blokdan chiqarish ──
adminBot.action(/^usr_unblock_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var uid2 = ctx.match[1]; var botDoc = await UserBot.findOne({ isActive: true });
  await UserProfile.findOneAndUpdate(
    { botId: botDoc._id, userTelegramId: uid2 },
    { $set: { isBlocked: false, blockedAt: null, blockedReason: '', updatedAt: new Date() } }
  );
  await safeEdit(ctx, '✅ ' + uid2 + ' blokdan chiqarildi!');
});

// ── O\'chirish ──
adminBot.action(/^usr_del_(?!do_)(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var uid2 = ctx.match[1];
  await safeEdit(ctx, '🗑 O\'chirish: ' + uid2 + '\n\nBotdan chiqariladi, profil, xotira, sessiyalar o\'chiriladi. Davom etasizmi?',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Ha', 'usr_del_do_' + uid2)],
      [Markup.button.callback('❌ Bekor', 'usr_view_' + uid2)]
    ])
  );
});

adminBot.action(/^usr_del_do_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery('O\'chirilmoqda...');
  var uid2 = ctx.match[1]; var botDoc = await UserBot.findOne({ isActive: true });
  if (!botDoc) return safeEdit(ctx, 'Bot topilmadi.');
  // allowedUsers dan chiqarish
  await UserBot.findByIdAndUpdate(botDoc._id, { $pull: { allowedUsers: uid2 } });
  for (var [, rb] of activeBots) {
    if (rb && rb.botConfig) {
      rb.botConfig.allowedUsers = (rb.botConfig.allowedUsers||[]).filter(function(id){ return id !== uid2; });
    }
  }
  // Ma'lumotlarni o\'chirish
  await UserProfile.findOneAndDelete({ botId: botDoc._id, userTelegramId: uid2 });
  await ChatHistory.findOneAndDelete({ botId: botDoc._id, userTelegramId: uid2 });
  try { var CS = require('./models/ChatSession'); await CS.deleteMany({ botId: botDoc._id, userTelegramId: uid2 }); } catch(_) {}
  try { var PE = require('./models/Persona');     await PE.updateMany({ botId: botDoc._id, userTelegramId: uid2 }, { $set: { isActive: false } }); } catch(_) {}

  await safeEdit(ctx, '✅ Foydalanuvchi o\'chirildi: ' + uid2);
  console.log('[Admin] O\'chirildi:', uid2);
});

// ═══════════════════════════════════════════════
// 🔍 QIDIRISH
// ═══════════════════════════════════════════════
adminBot.hears('🔍 Qidirish', async function(ctx) {
  ctx.session = { step: 'search_user' };
  await ctx.reply('Foydalanuvchi Telegram ID yoki @username ni kiriting:', Markup.removeKeyboard());
});

// ═══════════════════════════════════════════════
// 📊 STATISTIKA
// ═══════════════════════════════════════════════
adminBot.hears('📊 Statistika', async function(ctx) {
  ctx.session = {};
  var botDoc = await UserBot.findOne({ isActive: true });
  var userCount = botDoc ? botDoc.allowedUsers.length : 0;
  var totalMsgs = botDoc ? botDoc.totalMessages : 0;
  var plan      = botDoc ? (botDoc.currentPlan || 'free') : 'free';

  var activeSubs  = await Subscription.countDocuments({ status: 'active' });
  var graceSubs   = await Subscription.countDocuments({ status: 'grace' });
  var pendingSubs = await Subscription.countDocuments({ status: 'pending' });
  var expiredSubs = await Subscription.countDocuments({ status: 'expired' });

  // Plan bo'yicha taqsimot
  var starterCount = await Subscription.countDocuments({ status: { $in: ['active','grace'] }, plan: 'starter' });
  var proCount     = await Subscription.countDocuments({ status: { $in: ['active','grace'] }, plan: 'pro' });
  var premiumCount = await Subscription.countDocuments({ status: { $in: ['active','grace'] }, plan: 'premium' });

  // Oylik daromad hisoblash (taxminiy)
  var starterPrice = 19000, proPrice = 39000, premiumPrice = 59000;
  var monthlyIncome = (starterCount * starterPrice) + (proCount * proPrice) + (premiumCount * premiumPrice);

  var text =
    '📊 Statistika\n\n' +
    '🤖 Bot: ' + (botDoc ? '@' + botDoc.botUsername : 'Yo\'q') + '\n' +
    '   Tarif: ' + (PLAN_NAMES[plan] || plan) + '\n\n' +
    '👥 Foydalanuvchilar: ' + userCount + ' ta\n' +
    '💬 Jami xabarlar: ' + totalMsgs + ' ta\n\n' +
    '⭐ Obunalar:\n' +
    '   Faol: ' + activeSubs + ' ta\n' +
    '   Grace: ' + graceSubs + ' ta\n' +
    '   Kutilayotgan: ' + pendingSubs + ' ta\n' +
    '   Tugagan: ' + expiredSubs + ' ta\n\n' +
    '📊 Plan taqsimoti:\n' +
    '   Starter: ' + starterCount + ' ta\n' +
    '   Pro: ' + proCount + ' ta\n' +
    '   Premium: ' + premiumCount + ' ta\n\n' +
    '💵 Taxminiy oylik daromad: ' + monthlyIncome.toLocaleString() + ' so\'m';

  await ctx.reply(text);
});

// ═══════════════════════════════════════════════
// TEXT HANDLER (wizard qadamlari)
// ═══════════════════════════════════════════════
adminBot.on('text', async function(ctx) {
  var step = ctx.session && ctx.session.step;
  var text = ctx.message.text;
  if (!text || text.startsWith('/')) return;

  var mainBtns = ['⭐ Obunalar', '📊 Statistika', '📋 Foydalanuvchilar', '💬 Gruppalar', '🔍 Qidirish', '📰 Yangiliklar', '📢 Xabar yuborish'];
  if (mainBtns.indexOf(text) !== -1) return;

  // Gruppa admin qo\'shish
  if (step === 'grp_add_admin') {
    var adminId = text.trim();
    if (!/^\d+$/.test(adminId)) {
      return ctx.reply('❌ Noto\'g\'ri format. Faqat raqam (Telegram ID) kiriting:');
    }
    var gId2 = ctx.session.editGroupId;
    await GroupProfile.findByIdAndUpdate(gId2, {
      $addToSet: { adminUserIds: adminId }
    });
    ctx.session = {};
    return ctx.reply('✅ Admin qo\'shildi: ' + adminId,
      Markup.keyboard([
        ['⭐ Obunalar', '📊 Statistika'],
        ['📋 Foydalanuvchilar', '💬 Gruppalar'],
        ['🔍 Qidirish', '📰 Yangiliklar'],
        ['📢 Xabar yuborish']
      ]).resize()
    );
  }

  // Foydalanuvchi qidirish
  if (step === 'search_user') {
    ctx.session = {};
    var searchRaw = text.trim().replace('@','');
    var botDoc2   = await UserBot.findOne({ isActive: true });
    var prof2     = await UserProfile.findOne({
      botId: botDoc2._id,
      $or: [{ userTelegramId: searchRaw }, { telegramUsername: searchRaw }]
    });
    var realId = prof2 ? prof2.userTelegramId : searchRaw;
    var found2 = botDoc2 && botDoc2.allowedUsers.includes(realId);
    if (!found2 && !prof2) {
      return ctx.reply('Foydalanuvchi topilmadi: ' + searchRaw, Markup.keyboard([
        ['⭐ Obunalar','📊 Statistika'],['📋 Foydalanuvchilar','💬 Gruppalar'],
        ['🔍 Qidirish','📰 Yangiliklar'],['📢 Xabar yuborish']
      ]).resize());
    }
    var sub2  = await Subscription.findOne({ telegramId: realId, botId: botDoc2._id }).sort({ createdAt: -1 });
    var info2 = '👤 ' + ((prof2 && prof2.firstName) || realId) + '\n' +
      'ID: ' + realId + '\n' +
      'Plan: ' + ((prof2 && PLAN_NAMES[prof2.currentPlan]) || '📦 Free') + '\n' +
      'Xabarlar: ' + ((prof2 && prof2.totalMessages) || 0) + '\n' +
      (sub2 ? 'Obuna: ' + (PLAN_NAMES[sub2.plan]||sub2.plan) + ' — ' + sub2.status : '') +
      ((prof2 && prof2.isBlocked) ? '\n🚫 BLOKLANGAN' : '');
    await ctx.reply(info2, Markup.inlineKeyboard([
      [Markup.button.callback('⭐ Plan', 'usr_plan_' + realId),
       Markup.button.callback('🚫 Bloklash', 'usr_block_' + realId)],
      [Markup.button.callback('🗑 O\'chirish', 'usr_del_' + realId),
       Markup.button.callback('📋 To\'liq profil', 'usr_view_' + realId)]
    ]));
    return;
  }

  // Userga xabar yuborish
  if (step === 'send_user_msg') {
    var target = ctx.session.targetUid;
    ctx.session = {};
    if (!target) return ctx.reply('Xato: target topilmadi.');
    for (var [, rb] of activeBots) {
      if (rb && rb.telegram) {
        try {
          await rb.telegram.sendMessage(target, '📨 Admin xabari:\n\n' + text.trim());
          return ctx.reply('✅ Xabar yuborildi!', Markup.keyboard([
            ['⭐ Obunalar','📊 Statistika'],['📋 Foydalanuvchilar','💬 Gruppalar'],
            ['🔍 Qidirish','📰 Yangiliklar'],['📢 Xabar yuborish']
          ]).resize());
        } catch(e) {
          return ctx.reply('❌ Yuborib bo\'lmadi: ' + e.message);
        }
      }
    }
    return ctx.reply('❌ Bot instance topilmadi.');
  }

  // Yangilik yaratish wizard
  if (step === 'nws_add_title') {
    if (!ctx.session.newNews) ctx.session.newNews = {};
    ctx.session.newNews.title = text.trim();
    ctx.session.step = 'nws_add_body';
    return ctx.reply('3/4: Asosiy matnni yozing:');
  }
  if (step === 'nws_add_body') {
    if (!ctx.session.newNews) ctx.session.newNews = {};
    ctx.session.newNews.body = text.trim();
    ctx.session.step = 'nws_add_footer';
    return ctx.reply('4/4: Footer / Teglar (ixtiyoriy):\nMisol: #yangilik\n\nYo\'q bo\'lsa — "O\'tkazib yuborish" bosing:',
      Markup.inlineKeyboard([[Markup.button.callback('⏭ O\'tkazib yuborish', 'nws_skip_footer')]]));
  }
  if (step === 'nws_add_footer') {
    if (!ctx.session.newNews) ctx.session.newNews = {};
    ctx.session.newNews.footer = text.trim();
    ctx.session.step = null;
    var nn = ctx.session.newNews;
    await News.create({ title: nn.title, body: nn.body, footer: nn.footer || '', mediaId: nn.mediaId || '', mediaType: nn.mediaType || 'none' });
    ctx.session.newNews = {};
    return ctx.reply('✅ Yangilik qo\'shildi!');
  }
  // Yangilik tahrirlash
  if (step === 'nws_edit_title') { await News.findByIdAndUpdate(ctx.session.editId, { $set: { title: text.trim(), updatedAt: new Date() } }); ctx.session = {}; return ctx.reply('✅ Sarlavha yangilandi!'); }
  if (step === 'nws_edit_body')  { await News.findByIdAndUpdate(ctx.session.editId, { $set: { body:  text.trim(), updatedAt: new Date() } }); ctx.session = {}; return ctx.reply('✅ Matn yangilandi!'); }
  if (step === 'nws_edit_footer'){ await News.findByIdAndUpdate(ctx.session.editId, { $set: { footer:text.trim(), updatedAt: new Date() } }); ctx.session = {}; return ctx.reply('✅ Footer yangilandi!'); }

  // Broadcast wizard
  if (step === 'bc_add_title') { if (!ctx.session.newBc) ctx.session.newBc = {}; ctx.session.newBc.title = text.trim(); ctx.session.step = 'bc_add_body'; return ctx.reply('3/4: Matnni yozing:'); }
  if (step === 'bc_add_body')  { if (!ctx.session.newBc) ctx.session.newBc = {}; ctx.session.newBc.body = text.trim(); ctx.session.step = 'bc_add_footer';
    return ctx.reply('4/4: Footer (ixtiyoriy):', Markup.inlineKeyboard([[Markup.button.callback('⏭ O\'tkazib yuborish', 'bc_skip_footer')]]));
  }
  if (step === 'bc_add_footer') { if (!ctx.session.newBc) ctx.session.newBc = {}; ctx.session.newBc.footer = text.trim(); ctx.session.step = null;
    var nb = ctx.session.newBc;
    await Broadcast.create({ title: nb.title, body: nb.body, footer: nb.footer || '', mediaId: nb.mediaId || '', mediaType: nb.mediaType || 'none', status: 'pending' });
    ctx.session.newBc = {};
    return ctx.reply('✅ Xabar qo\'shildi! "📢 Xabar yuborish" ga boring.');
  }
  if (step === 'bc_edit_title') { await Broadcast.findByIdAndUpdate(ctx.session.editId, { $set: { title: text.trim(), updatedAt: new Date() } }); ctx.session = {}; return ctx.reply('✅ Nom yangilandi!'); }
  if (step === 'bc_edit_body')  { await Broadcast.findByIdAndUpdate(ctx.session.editId, { $set: { body:  text.trim(), updatedAt: new Date() } }); ctx.session = {}; return ctx.reply('✅ Matn yangilandi!'); }
  if (step === 'bc_edit_footer'){ await Broadcast.findByIdAndUpdate(ctx.session.editId, { $set: { footer:text.trim(), updatedAt: new Date() } }); ctx.session = {}; return ctx.reply('✅ Footer yangilandi!'); }
});

// Media handler (yangilik va broadcast uchun)
adminBot.on(['photo', 'video'], async function(ctx) {
  var step = ctx.session && ctx.session.step;
  var mediaId   = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : ctx.message.video.file_id;
  var mediaType = ctx.message.photo ? 'photo' : 'video';

  if (step === 'nws_add_media') {
    if (!ctx.session.newNews) ctx.session.newNews = {};
    ctx.session.newNews.mediaId   = mediaId;
    ctx.session.newNews.mediaType = mediaType;
    ctx.session.step = 'nws_add_title';
    return ctx.reply('Media qabul qilindi ✅\n\n2/4: Sarlavha yozing:');
  }
  if (step === 'nws_edit_media') {
    await News.findByIdAndUpdate(ctx.session.editId, { $set: { mediaId, mediaType, updatedAt: new Date() } });
    ctx.session = {};
    return ctx.reply('✅ Media yangilandi!');
  }
  if (step === 'bc_add_media') {
    if (!ctx.session.newBc) ctx.session.newBc = {};
    ctx.session.newBc.mediaId   = mediaId;
    ctx.session.newBc.mediaType = mediaType;
    ctx.session.step = 'bc_add_title';
    return ctx.reply('Media qabul qilindi ✅\n\n2/4: Ichki nom yozing:');
  }
  if (step === 'bc_edit_media') {
    await Broadcast.findByIdAndUpdate(ctx.session.editId, { $set: { mediaId, mediaType, updatedAt: new Date() } });
    ctx.session = {};
    return ctx.reply('✅ Media yangilandi!');
  }
});

// ═══════════════════════════════════════════════
// 📰 YANGILIKLAR
// ═══════════════════════════════════════════════
function formatNews(n) {
  var parts = [n.title, '', n.body];
  if (n.footer && n.footer.trim()) parts.push('', n.footer.trim());
  return parts.join('\n');
}

async function showNewsList(ctx, edit) {
  var list = await News.find({ isActive: { $ne: false } }).sort({ createdAt: -1 });
  var header = '📰 Yangiliklar boshqaruvi\n\nJami faol: ' + list.length + ' ta\n\nBirorta tanlang:';
  var btns = list.map(function(n) {
    var d = new Date(n.createdAt).toLocaleDateString('ru-RU');
    var mediaIcon = n.mediaType === 'photo' ? '🖼 ' : n.mediaType === 'video' ? '🎥 ' : '📄 ';
    return [Markup.button.callback(mediaIcon + n.title.slice(0, 26) + ' (' + d + ')', 'nws_view_' + n._id)];
  });
  btns.push([Markup.button.callback('➕ Yangi yangilik qo\'shish', 'nws_add')]);
  if (edit) await safeEdit(ctx, header, Markup.inlineKeyboard(btns));
  else       await ctx.reply(header, Markup.inlineKeyboard(btns));
}

adminBot.hears('📰 Yangiliklar', async function(ctx) { ctx.session = {}; await showNewsList(ctx, false); });

adminBot.action(/^nws_view_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var n = await News.findById(ctx.match[1]);
  if (!n) return safeEdit(ctx, 'Topilmadi.');
  var d = new Date(n.createdAt).toLocaleDateString('ru-RU');
  await safeEdit(ctx,
    '📄 ' + n.title + '\n🗓 ' + d + '\n\n' + n.body.slice(0, 200) + (n.body.length > 200 ? '...' : ''),
    Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Sarlavha', 'nws_edit_title_' + n._id), Markup.button.callback('✏️ Matn', 'nws_edit_body_' + n._id)],
      [Markup.button.callback('✏️ Footer',   'nws_edit_footer_' + n._id), Markup.button.callback('✏️ Media', 'nws_edit_media_' + n._id)],
      [Markup.button.callback('👁 Preview', 'nws_preview_' + n._id)],
      [Markup.button.callback('🗑 O\'chirish', 'nws_del_confirm_' + n._id)],
      [Markup.button.callback('◀️ Ro\'yxat', 'nws_back_list')]
    ])
  );
});

adminBot.action(/^nws_preview_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var n = await News.findById(ctx.match[1]);
  if (!n) return safeEdit(ctx, 'Topilmadi.');
  var text = formatNews(n);
  var backBtn = Markup.inlineKeyboard([[Markup.button.callback('◀️ Orqaga', 'nws_view_' + n._id)]]);
  if (n.mediaId && n.mediaType === 'photo') await ctx.replyWithPhoto(n.mediaId, { caption: text, reply_markup: backBtn.reply_markup });
  else if (n.mediaId && n.mediaType === 'video') await ctx.replyWithVideo(n.mediaId, { caption: text, reply_markup: backBtn.reply_markup });
  else await ctx.reply(text, backBtn);
});

adminBot.action('nws_add', async function(ctx) {
  await ctx.answerCbQuery();
  ctx.session = { step: 'nws_add_media', newNews: {} };
  await safeEdit(ctx, '➕ Yangi yangilik — 1/4: Media\n\nRasm yoki video yuboring yoki o\'tkazib yuboring:',
    Markup.inlineKeyboard([[Markup.button.callback('⏭ O\'tkazib yuborish', 'nws_skip_media')]]));
});
adminBot.action('nws_skip_media', async function(ctx) {
  await ctx.answerCbQuery();
  if (!ctx.session) ctx.session = {};
  if (!ctx.session.newNews) ctx.session.newNews = {};
  ctx.session.newNews.mediaId = ''; ctx.session.newNews.mediaType = 'none';
  ctx.session.step = 'nws_add_title';
  await safeEdit(ctx, '2/4: Sarlavha yozing:');
});
adminBot.action(/^nws_edit_title_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); var n = await News.findById(ctx.match[1]); if (!n) return; ctx.session = { step: 'nws_edit_title', editId: String(n._id) }; await safeEdit(ctx, '✏️ Sarlavha\n\nHozirgi: ' + n.title + '\n\nYangi sarlavha yozing:'); });
adminBot.action(/^nws_edit_body_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); var n = await News.findById(ctx.match[1]); if (!n) return; ctx.session = { step: 'nws_edit_body', editId: String(n._id) }; await safeEdit(ctx, '✏️ Matn\n\nHozirgi:\n' + n.body.slice(0,300) + '\n\nYangi matn yozing:'); });
adminBot.action(/^nws_edit_footer_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); var n = await News.findById(ctx.match[1]); if (!n) return; ctx.session = { step: 'nws_edit_footer', editId: String(n._id) }; await safeEdit(ctx, '✏️ Footer\n\nHozirgi: ' + (n.footer || '(bo\'sh)') + '\n\nYangi footer yozing:'); });
adminBot.action(/^nws_edit_media_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); ctx.session = { step: 'nws_edit_media', editId: ctx.match[1] }; await safeEdit(ctx, '✏️ Media\n\nYangi rasm/video yuboring:'); });
adminBot.action(/^nws_clear_media_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); await News.findByIdAndUpdate(ctx.match[1], { $set: { mediaId: '', mediaType: 'none', updatedAt: new Date() } }); ctx.session = {}; await safeEdit(ctx, '✅ Media o\'chirildi.'); await showNewsList(ctx, true); });
adminBot.action(/^nws_del_confirm_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); var n = await News.findById(ctx.match[1]); if (!n) return; await safeEdit(ctx, '🗑 O\'chirishni tasdiqlang\n\n"' + n.title + '"', Markup.inlineKeyboard([[Markup.button.callback('Ha, o\'chirish', 'nws_del_do_' + n._id)], [Markup.button.callback('Bekor', 'nws_view_' + n._id)]])); });
adminBot.action(/^nws_del_do_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); await News.findByIdAndUpdate(ctx.match[1], { $set: { isActive: false } }); await safeEdit(ctx, '🗑 Yangilik o\'chirildi.'); await showNewsList(ctx, true); });
adminBot.action('nws_skip_footer', async function(ctx) { await ctx.answerCbQuery(); if (!ctx.session) ctx.session = {}; if (!ctx.session.newNews) ctx.session.newNews = {}; ctx.session.newNews.footer = ''; ctx.session.step = null; var nn = ctx.session.newNews; await News.create({ title: nn.title, body: nn.body, footer: '', mediaId: nn.mediaId || '', mediaType: nn.mediaType || 'none' }); ctx.session.newNews = {}; await safeEdit(ctx, '✅ Yangilik qo\'shildi!'); });
adminBot.action('nws_back_list', async function(ctx) { await ctx.answerCbQuery(); await showNewsList(ctx, true); });

// ═══════════════════════════════════════════════
// 📢 XABAR YUBORISH (Broadcast)
// ═══════════════════════════════════════════════
function formatBroadcast(b) {
  var parts = [b.body];
  if (b.footer && b.footer.trim()) parts.push('', b.footer.trim());
  return parts.join('\n');
}

async function showBroadcastList(ctx, edit) {
  var pending  = await Broadcast.find({ status: 'pending' }).sort({ createdAt: -1 });
  var sentCount = await Broadcast.countDocuments({ status: 'sent' });
  var header = '📢 Xabar yuborish\n\n📝 Kutilayotgan: ' + pending.length + ' ta\n✅ Yuborilgan: ' + sentCount + ' ta\n\n' + (pending.length > 0 ? 'Kutilayotganlar:' : 'Hozircha yo\'q.');
  var btns = pending.map(function(b) {
    var d = new Date(b.createdAt).toLocaleDateString('ru-RU');
    return [Markup.button.callback(b.title.slice(0, 26) + ' (' + d + ')', 'bc_view_' + b._id)];
  });
  if (sentCount > 0) btns.push([Markup.button.callback('📋 Yuborilganlar', 'bc_sent_list')]);
  btns.push([Markup.button.callback('➕ Yangi xabar', 'bc_add')]);
  if (edit) await safeEdit(ctx, header, Markup.inlineKeyboard(btns));
  else       await ctx.reply(header, Markup.inlineKeyboard(btns));
}

adminBot.hears('📢 Xabar yuborish', async function(ctx) { ctx.session = {}; await showBroadcastList(ctx, false); });

adminBot.action(/^bc_view_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var b = await Broadcast.findById(ctx.match[1]);
  if (!b) return safeEdit(ctx, 'Topilmadi.');
  var botDoc = await UserBot.findOne({ isActive: true });
  var userCount = botDoc ? botDoc.allowedUsers.length : 0;
  await safeEdit(ctx,
    '📢 ' + b.title + '\n\nYuborilsa: ~' + userCount + ' ta foydalanuvchi\n\n' + b.body.slice(0, 200) + (b.body.length > 200 ? '...' : ''),
    Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Sarlavha', 'bc_edit_title_' + b._id), Markup.button.callback('✏️ Matn', 'bc_edit_body_' + b._id)],
      [Markup.button.callback('✏️ Footer',   'bc_edit_footer_' + b._id), Markup.button.callback('✏️ Media', 'bc_edit_media_' + b._id)],
      [Markup.button.callback('👁 Preview',   'bc_preview_' + b._id)],
      [Markup.button.callback('🚀 Hozir yuborish', 'bc_send_confirm_' + b._id)],
      [Markup.button.callback('🗑 O\'chirish',      'bc_del_confirm_' + b._id)],
      [Markup.button.callback('◀️ Ro\'yxat',       'bc_back_list')]
    ])
  );
});

adminBot.action(/^bc_preview_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var b = await Broadcast.findById(ctx.match[1]);
  if (!b) return safeEdit(ctx, 'Topilmadi.');
  var text = formatBroadcast(b);
  var backBtn = Markup.inlineKeyboard([[Markup.button.callback('◀️ Orqaga', 'bc_view_' + b._id)]]);
  if (b.mediaId && b.mediaType === 'photo') await ctx.replyWithPhoto(b.mediaId, { caption: text, reply_markup: backBtn.reply_markup });
  else if (b.mediaId && b.mediaType === 'video') await ctx.replyWithVideo(b.mediaId, { caption: text, reply_markup: backBtn.reply_markup });
  else await ctx.reply(text, backBtn);
});

adminBot.action('bc_add', async function(ctx) {
  await ctx.answerCbQuery();
  ctx.session = { step: 'bc_add_media', newBc: {} };
  await safeEdit(ctx, '➕ Yangi reklama — 1/4: Media\n\nRasm/video yuboring yoki o\'tkazib yuboring:',
    Markup.inlineKeyboard([[Markup.button.callback('⏭ O\'tkazib yuborish', 'bc_skip_media')]]));
});
adminBot.action('bc_skip_media', async function(ctx) { await ctx.answerCbQuery(); if (!ctx.session) ctx.session = {}; if (!ctx.session.newBc) ctx.session.newBc = {}; ctx.session.newBc.mediaId = ''; ctx.session.newBc.mediaType = 'none'; ctx.session.step = 'bc_add_title'; await safeEdit(ctx, '2/4: Ichki nom yozing:'); });
adminBot.action('bc_skip_footer', async function(ctx) { await ctx.answerCbQuery(); if (!ctx.session) ctx.session = {}; if (!ctx.session.newBc) ctx.session.newBc = {}; ctx.session.newBc.footer = ''; ctx.session.step = null; var nb = ctx.session.newBc; await Broadcast.create({ title: nb.title, body: nb.body, footer: '', mediaId: nb.mediaId || '', mediaType: nb.mediaType || 'none', status: 'pending' }); ctx.session.newBc = {}; await safeEdit(ctx, '✅ Xabar qo\'shildi!'); });
adminBot.action(/^bc_edit_title_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); var b = await Broadcast.findById(ctx.match[1]); if (!b) return; ctx.session = { step: 'bc_edit_title', editId: String(b._id) }; await safeEdit(ctx, '✏️ Nom\n\nHozirgi: ' + b.title + '\n\nYangi nom:'); });
adminBot.action(/^bc_edit_body_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); var b = await Broadcast.findById(ctx.match[1]); if (!b) return; ctx.session = { step: 'bc_edit_body', editId: String(b._id) }; await safeEdit(ctx, '✏️ Matn\n\nHozirgi:\n' + b.body.slice(0,300) + '\n\nYangi matn:'); });
adminBot.action(/^bc_edit_footer_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); var b = await Broadcast.findById(ctx.match[1]); if (!b) return; ctx.session = { step: 'bc_edit_footer', editId: String(b._id) }; await safeEdit(ctx, '✏️ Footer\n\nHozirgi: ' + (b.footer || '(bo\'sh)') + '\n\nYangi footer:'); });
adminBot.action(/^bc_edit_media_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); ctx.session = { step: 'bc_edit_media', editId: ctx.match[1] }; await safeEdit(ctx, '✏️ Media\n\nYangi rasm/video yuboring:'); });
adminBot.action(/^bc_clear_media_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); await Broadcast.findByIdAndUpdate(ctx.match[1], { $set: { mediaId: '', mediaType: 'none', updatedAt: new Date() } }); ctx.session = {}; await safeEdit(ctx, '✅ Media o\'chirildi.'); await showBroadcastList(ctx, true); });
adminBot.action(/^bc_del_confirm_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); var b = await Broadcast.findById(ctx.match[1]); if (!b) return; await safeEdit(ctx, '🗑 "' + b.title + '" — o\'chirasizmi?', Markup.inlineKeyboard([[Markup.button.callback('Ha', 'bc_del_do_' + b._id),], [Markup.button.callback('Bekor', 'bc_view_' + b._id)]])); });
adminBot.action(/^bc_del_do_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); await Broadcast.findByIdAndDelete(ctx.match[1]); await safeEdit(ctx, '🗑 O\'chirildi.'); await showBroadcastList(ctx, true); });
adminBot.action('bc_back_list', async function(ctx) { await ctx.answerCbQuery(); await showBroadcastList(ctx, true); });
adminBot.action('bc_sent_list', async function(ctx) {
  await ctx.answerCbQuery();
  var list = await Broadcast.find({ status: 'sent' }).sort({ sentAt: -1 }).limit(10);
  if (!list.length) return safeEdit(ctx, 'Yuborilgan xabar yo\'q.');
  var text = '✅ Yuborilganlar (oxirgi 10):\n\n';
  list.forEach(function(b, i) {
    text += (i+1) + '. ' + b.title + ' — ' + (b.sentAt ? new Date(b.sentAt).toLocaleDateString('ru-RU') : '') + '\n';
  });
  await safeEdit(ctx, text, Markup.inlineKeyboard([[Markup.button.callback('◀️ Orqaga', 'bc_back_list')]]));
});

adminBot.action(/^bc_send_confirm_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var b = await Broadcast.findById(ctx.match[1]);
  if (!b) return safeEdit(ctx, 'Topilmadi.');
  var botDoc = await UserBot.findOne({ isActive: true });
  var userCount = botDoc ? botDoc.allowedUsers.length : 0;
  await safeEdit(ctx,
    '🚀 Yuborishni tasdiqlang\n\n"' + b.title + '"\n\n👥 Qabul qiluvchilar: ~' + userCount + ' ta',
    Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Ha, yuborish', 'bc_send_do_' + b._id)],
      [Markup.button.callback('Bekor',           'bc_view_' + b._id)]
    ])
  );
});

adminBot.action(/^bc_send_do_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery('Yuborilmoqda...');
  var b = await Broadcast.findById(ctx.match[1]);
  if (!b) return ctx.reply('Topilmadi.');
  var botDoc = await UserBot.findOne({ isActive: true });
  if (!botDoc) return ctx.reply('Bot topilmadi.');

  var users   = botDoc.allowedUsers || [];
  var msgText = formatBroadcast(b);
  var sent = 0, failed = 0;

  // activeBots dan running bot telegram instance olish (yangi instance shart emas)
  var tg = null;
  for (var [, rb] of activeBots) {
    if (rb && rb.telegram) { tg = rb.telegram; break; }
  }
  if (!tg) {
    // Fallback: yangi instance
    var { Telegraf: Tgf } = require('telegraf');
    tg = new Tgf(botDoc.botToken).telegram;
  }

  for (var i = 0; i < users.length; i++) {
    try {
      if (b.mediaId && b.mediaType === 'photo') {
        try { await tg.sendPhoto(users[i], b.mediaId, { caption: msgText }); }
        catch (e) { await tg.sendMessage(users[i], msgText); }
      } else if (b.mediaId && b.mediaType === 'video') {
        try { await tg.sendVideo(users[i], b.mediaId, { caption: msgText }); }
        catch (e) { await tg.sendMessage(users[i], msgText); }
      } else {
        await tg.sendMessage(users[i], msgText);
      }
      sent++;
      if (i > 0 && i % 20 === 0) await new Promise(function(r) { setTimeout(r, 1000); });
    } catch (e) {
      failed++;
      console.error('[Broadcast] ' + users[i] + ' xato:', e.message);
    }
  }

  await Broadcast.findByIdAndUpdate(b._id, { $set: { status: 'sent', sentAt: new Date() } });
  await ctx.reply('✅ Xabar yuborildi!\n\n✅ Muvaffaqiyatli: ' + sent + '\n❌ Xato: ' + failed);
  await showBroadcastList(ctx, false);
});

// ═══════════════════════════════════════════════
// 💬 GRUPPALAR VA KANALLAR BOSHQARUVI
// ═══════════════════════════════════════════════
const GROUP_PLAN_NAMES = {
  free: '📦 Free', starter: '⭐ Starter', pro: '🚀 Pro', premium: '💎 Premium'
};

adminBot.hears('💬 Gruppalar', async function(ctx) {
  ctx.session = {};
  await showGroupsList(ctx, false);
});

async function showGroupsList(ctx, edit) {
  var botDoc = await UserBot.findOne({ isActive: true });
  var groups = await GroupProfile.find({
    isActive: true,
    ...(botDoc ? { botId: botDoc._id } : {})
  }).sort({ createdAt: -1 }).limit(30);

  var header = '💬 Gruppalar va Kanallar\n\n' +
    'Jami: ' + groups.length + ' ta\n\n' +
    (groups.length ? 'Birortasini tanlang:' : 'Hali guruh/kanal yo\'q.\n\nBotni biror guruhga qo\'shing.');

  var btns = groups.map(function(g) {
    var planTag = g.currentPlan === 'free' ? '' : ' ' + (GROUP_PLAN_NAMES[g.currentPlan] || '');
    var typeTag = g.chatType === 'channel' ? '📢' : '👥';
    return [Markup.button.callback(
      typeTag + ' ' + (g.chatTitle || g.chatId).slice(0, 25) + planTag,
      'grp_view_' + g._id
    )];
  });

  btns.push([Markup.button.callback('◀️ Orqaga', 'grp_back_main')]);

  if (edit) await safeEdit(ctx, header, Markup.inlineKeyboard(btns));
  else       await ctx.reply(header, Markup.inlineKeyboard(btns));
}

adminBot.action('grp_back_main', async function(ctx) {
  await ctx.answerCbQuery();
  await showGroupsList(ctx, true);
});

adminBot.action(/^grp_view_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var g = await GroupProfile.findById(ctx.match[1]);
  if (!g) return safeEdit(ctx, 'Topilmadi.');

  var typeStr  = g.chatType === 'channel' ? '📢 Kanal' : '👥 Gruppa';
  var planStr  = GROUP_PLAN_NAMES[g.currentPlan] || g.currentPlan;
  var sub      = await Subscription.findOne({ groupChatId: g.chatId, status: { $in: ['active','grace'] } }).sort({ activatedAt: -1 });
  var subInfo  = sub ? '\n⭐ Obuna: ' + sub.expiresAt.toLocaleDateString('ru-RU') + ' gacha' : '\n❌ Obuna yo\'q';

  var text = typeStr + '\n\n' +
    '📛 ' + (g.chatTitle || '—') + '\n' +
    '🆔 ' + g.chatId + '\n' +
    '📊 Plan: ' + planStr + subInfo + '\n' +
    '💬 Oy xabarlari: ' + (g.monthlyMessages || 0) + '\n' +
    '📈 Jami xabarlar: ' + (g.totalMessages || 0) + '\n' +
    '👑 Adminlar: ' + (g.adminUserIds || []).length + ' ta';

  await safeEdit(ctx, text, Markup.inlineKeyboard([
    [Markup.button.callback('⭐ Obuna berish',    'grp_sub_' + g._id),
     Markup.button.callback('📊 Plan o\'zgartir', 'grp_plan_' + g._id)],
    [Markup.button.callback('👑 Adminlar',        'grp_admins_' + g._id),
     Markup.button.callback('🔄 Limitni reset',   'grp_reset_' + g._id)],
    [Markup.button.callback('🗑 O\'chirish',       'grp_del_' + g._id)],
    [Markup.button.callback('◀️ Ro\'yxat',        'grp_back_list')]
  ]));
});

adminBot.action('grp_back_list', async function(ctx) {
  await ctx.answerCbQuery();
  await showGroupsList(ctx, true);
});

// ── Gruppa plan o\'zgartirish ──
adminBot.action(/^grp_plan_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var g = await GroupProfile.findById(ctx.match[1]);
  if (!g) return safeEdit(ctx, 'Topilmadi.');
  await safeEdit(ctx,
    '📊 Plan tanlang\n\nHozir: ' + (GROUP_PLAN_NAMES[g.currentPlan] || g.currentPlan),
    Markup.inlineKeyboard([
      [Markup.button.callback('📦 Free',     'grp_setplan_' + g._id + '_free')],
      [Markup.button.callback('⭐ Starter',  'grp_setplan_' + g._id + '_starter')],
      [Markup.button.callback('🚀 Pro',      'grp_setplan_' + g._id + '_pro')],
      [Markup.button.callback('💎 Premium',  'grp_setplan_' + g._id + '_premium')],
      [Markup.button.callback('◀️ Orqaga',   'grp_view_' + g._id)]
    ])
  );
});

adminBot.action(/^grp_setplan_(.+)_(free|starter|pro|premium)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var gId  = ctx.match[1];
  var plan = ctx.match[2];
  await GroupProfile.findByIdAndUpdate(gId, { $set: { currentPlan: plan, updatedAt: new Date() } });
  await safeEdit(ctx, '✅ Gruppa plani ' + (GROUP_PLAN_NAMES[plan] || plan) + ' ga o\'zgardi!');
  var g = await GroupProfile.findById(gId);
  if (g) await showGroupView(ctx, g);
});

// ── Gruppa obuna berish (to'g'ridan-to'g'ri admin tomonidan) ──
adminBot.action(/^grp_sub_(?!do_)(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var g = await GroupProfile.findById(ctx.match[1]);
  if (!g) return safeEdit(ctx, 'Topilmadi.');
  await safeEdit(ctx,
    '⭐ Gruppa uchun obuna tarifi:\n\n' + (g.chatTitle || g.chatId),
    Markup.inlineKeyboard([
      [Markup.button.callback('⭐ Starter — 1 oy', 'grp_subdo_' + g._id + '_starter_1')],
      [Markup.button.callback('🚀 Pro — 1 oy',     'grp_subdo_' + g._id + '_pro_1')],
      [Markup.button.callback('💎 Premium — 1 oy', 'grp_subdo_' + g._id + '_premium_1')],
      [Markup.button.callback('⭐ Starter — 3 oy', 'grp_subdo_' + g._id + '_starter_3')],
      [Markup.button.callback('🚀 Pro — 3 oy',     'grp_subdo_' + g._id + '_pro_3')],
      [Markup.button.callback('◀️ Orqaga',         'grp_view_' + g._id)]
    ])
  );
});

adminBot.action(/^grp_subdo_(.+)_(starter|pro|premium)_(\d+)$/, async function(ctx) {
  await ctx.answerCbQuery('Faollashtirilmoqda...');
  var gId     = ctx.match[1];
  var plan    = ctx.match[2];
  var months  = parseInt(ctx.match[3]) || 1;
  var g = await GroupProfile.findById(gId);
  if (!g) return safeEdit(ctx, 'Topilmadi.');

  var now       = new Date();
  var expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + months);
  var graceEndsAt = new Date(expiresAt);
  graceEndsAt.setDate(graceEndsAt.getDate() + 3);

  // Subscription yaratish
  var chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var rnd = ''; for (var i = 0; i < 4; i++) rnd += chars[Math.floor(Math.random()*chars.length)];
  var uniqueId = plan.toUpperCase() + '-G' + rnd;

  await Subscription.create({
    telegramId:   String(g.chatId),
    groupChatId:  String(g.chatId),
    botId:        g.botId,
    firstName:    g.chatTitle || 'Gruppa',
    username:     '',
    plan,
    uniqueId,
    price:        '',
    durationMonths: months,
    status:       'active',
    activatedAt:  now,
    expiresAt,
    graceEndsAt,
    notified7d:   false,
    notified1d:   false
  });

  // GroupProfile yangilash
  await GroupProfile.findByIdAndUpdate(gId, {
    $set: { currentPlan: plan, updatedAt: new Date() }
  });

  await safeEdit(ctx,
    '✅ Gruppa obunasi faollashtirildi!\n\n' +
    '📛 ' + (g.chatTitle || g.chatId) + '\n' +
    '⭐ Tarif: ' + (GROUP_PLAN_NAMES[plan] || plan) + '\n' +
    '📅 Muddat: ' + expiresAt.toLocaleDateString('ru-RU') + ' gacha (' + months + ' oy)'
  );
});

// ── Gruppa adminlarini boshqarish ──
adminBot.action(/^grp_admins_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var g = await GroupProfile.findById(ctx.match[1]);
  if (!g) return safeEdit(ctx, 'Topilmadi.');

  var admins = g.adminUserIds || [];
  var text = '👑 Gruppa adminlari\n\n' +
    (admins.length ? admins.map(function(a, i) { return (i+1) + '. ID: ' + a; }).join('\n') : 'Admin yo\'q') +
    '\n\nAdmin qo\'shish uchun user Telegram ID sini yuboring.';

  ctx.session = ctx.session || {};
  ctx.session.step       = 'grp_add_admin';
  ctx.session.editGroupId = String(g._id);

  await safeEdit(ctx, text, Markup.inlineKeyboard([
    [Markup.button.callback('◀️ Orqaga', 'grp_view_' + g._id)]
  ]));
});

// ── Gruppa limitini reset qilish ──
adminBot.action(/^grp_reset_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var g = await GroupProfile.findById(ctx.match[1]);
  if (!g) return safeEdit(ctx, 'Topilmadi.');
  await GroupProfile.findByIdAndUpdate(g._id, {
    $set: { monthlyMessages: 0, monthlyPpt: 0, monthlyReset: '', updatedAt: new Date() }
  });
  await safeEdit(ctx, '✅ ' + (g.chatTitle || g.chatId) + ' limiti reset qilindi!');
});

// ── Gruppa o\'chirish ──
adminBot.action(/^grp_del_(?!do_)(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  var g = await GroupProfile.findById(ctx.match[1]);
  if (!g) return safeEdit(ctx, 'Topilmadi.');
  await safeEdit(ctx,
    '🗑 \"' + (g.chatTitle || g.chatId) + '\"\n\nO\'chirasizmi?',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Ha', 'grp_del_do_' + g._id),
       Markup.button.callback('❌ Bekor', 'grp_view_' + g._id)]
    ])
  );
});

adminBot.action(/^grp_del_do_(.+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  await GroupProfile.findByIdAndUpdate(ctx.match[1], { $set: { isActive: false } });
  await safeEdit(ctx, '🗑 Gruppa o\'chirildi.');
  await showGroupsList(ctx, true);
});

// ── Yordamchi: gruppa ko\'rinishiga qaytish ──
async function showGroupView(ctx, g) {
  var typeStr = g.chatType === 'channel' ? '📢 Kanal' : '👥 Gruppa';
  var planStr = GROUP_PLAN_NAMES[g.currentPlan] || g.currentPlan;
  await safeEdit(ctx,
    typeStr + '\n\n📛 ' + (g.chatTitle || '—') + '\n🆔 ' + g.chatId + '\n📊 Plan: ' + planStr,
    Markup.inlineKeyboard([
      [Markup.button.callback('⭐ Obuna berish',    'grp_sub_' + g._id),
       Markup.button.callback('📊 Plan o\'zgartir', 'grp_plan_' + g._id)],
      [Markup.button.callback('◀️ Ro\'yxat',        'grp_back_list')]
    ])
  );
}

// ═══════════════════════════════════════════════
// BOT YUKLASH
// ═══════════════════════════════════════════════
async function loadActiveBots() {
  var bots = await UserBot.find({ isActive: true });
  console.log('[Admin] ' + bots.length + ' ta bot yuklanmoqda...');
  for (var i = 0; i < bots.length; i++) {
    try {
      var running = await launchUserBot(bots[i]);
      activeBots.set(String(bots[i]._id), running);
      console.log('✅ @' + bots[i].botUsername + ' yuklandi');
    } catch (e) {
      console.error('❌ @' + bots[i].botUsername + ' yuklanmadi:', e.message);
    }
  }
  console.log('[Admin] Botlar yuklandi.');
}

module.exports = { adminBot, activeBots, loadActiveBots };
