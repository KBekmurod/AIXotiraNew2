'use strict';

const { Telegraf, session, Markup } = require('telegraf');
const UserBot      = require('./models/UserBot');
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

  var statusLine = '';
  if (pendingSubs > 0) statusLine = '\n⚠️ ' + pendingSubs + ' ta obuna to\'lovi kutilmoqda!';
  if (graceSubs > 0)   statusLine += '\n🔶 ' + graceSubs + ' ta obuna grace periodda';

  await ctx.reply(
    '🛡 Admin Panel\n\n' +
    '👥 Foydalanuvchilar: ' + userCount + ' ta\n' +
    '⭐ Faol obunalar: ' + activeSubs + ' ta' +
    statusLine + '\n\n' +
    'Amalni tanlang:',
    Markup.keyboard([
      ['⭐ Obunalar',          '📊 Statistika'],
      ['📋 Foydalanuvchilar', '🔍 Qidirish'],
      ['📰 Yangiliklar',       '📢 Xabar yuborish']
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

    // DB yangilash
    await UserBot.findOneAndUpdate(
      { ownerTelegramId: String(sub.telegramId), isActive: true },
      { $set: { currentPlan: sub.plan } }
    );

    // RAM yangilash — activeBots dan bot.botConfig orqali
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
      'Foydalanuvchi: ' + (sub.firstName || "Noma'lum") + (sub.username ? ' @' + sub.username : '') + '\n' +
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
// 📋 FOYDALANUVCHILAR
// ═══════════════════════════════════════════════
adminBot.hears('📋 Foydalanuvchilar', async function(ctx) {
  ctx.session = {};
  var botDoc = await UserBot.findOne({ isActive: true });
  if (!botDoc) return ctx.reply('Bot topilmadi.');
  var users = botDoc.allowedUsers || [];
  if (!users.length) return ctx.reply('Hali foydalanuvchi yo\'q.');
  var text = '👥 Foydalanuvchilar (' + users.length + ' ta):\n\n';
  users.slice(0, 30).forEach(function(uid, i) {
    text += (i+1) + '. ID: ' + uid + '\n';
  });
  if (users.length > 30) text += '\n... va yana ' + (users.length - 30) + ' ta';
  await ctx.reply(text);
});

// ═══════════════════════════════════════════════
// 🔍 QIDIRISH
// ═══════════════════════════════════════════════
adminBot.hears('🔍 Qidirish', async function(ctx) {
  ctx.session = { step: 'search_user' };
  await ctx.reply('Foydalanuvchi Telegram ID sini kiriting:', Markup.removeKeyboard());
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

  var mainBtns = ['⭐ Obunalar', '📊 Statistika', '📋 Foydalanuvchilar', '🔍 Qidirish', '📰 Yangiliklar', '📢 Xabar yuborish'];
  if (mainBtns.indexOf(text) !== -1) return;

  // Foydalanuvchi qidirish
  if (step === 'search_user') {
    ctx.session = {};
    var searchId = text.trim();
    var botDoc = await UserBot.findOne({ isActive: true });
    var found  = botDoc && botDoc.allowedUsers.includes(searchId);
    var sub    = await Subscription.findOne({ telegramId: searchId }).sort({ createdAt: -1 });
    if (!found && !sub) return ctx.reply('Foydalanuvchi topilmadi: ' + searchId, Markup.keyboard([['⭐ Obunalar','📊 Statistika'],['📋 Foydalanuvchilar','🔍 Qidirish'],['📰 Yangiliklar','📢 Xabar yuborish']]).resize());
    var info = '👤 Foydalanuvchi: ' + searchId + '\n\n';
    if (found) info += '✅ Botda ro\'yxatda\n';
    if (sub) {
      info += '⭐ Oxirgi obuna: ' + (PLAN_NAMES[sub.plan] || sub.plan) + '\n';
      info += '   Status: ' + sub.status + '\n';
      info += '   ID: ' + sub.uniqueId + '\n';
      if (sub.expiresAt) info += '   Muddat: ' + sub.expiresAt.toLocaleDateString('ru-RU') + ' gacha\n';
    }
    await ctx.reply(info, Markup.keyboard([['⭐ Obunalar','📊 Statistika'],['📋 Foydalanuvchilar','🔍 Qidirish'],['📰 Yangiliklar','📢 Xabar yuborish']]).resize());
    return;
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
