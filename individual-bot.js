'use strict';

const { Telegraf, session, Markup } = require('telegraf');
const ChatHistory   = require('./models/ChatHistory');
const ChatSession   = require('./models/ChatSession');
const Persona       = require('./models/Persona');
const UserBot       = require('./models/UserBot');
const Subscription  = require('./models/Subscription');
const { getAIResponse, getPptAIResponse } = require('./utils/ai');
const { generatePptx }                    = require('./utils/pptx');
const { buildPptPrompt }                  = require('./utils/pptPrompt');
const GroupConfig       = require('./models/GroupConfig');
const GroupSubscription = require('./models/GroupSubscription');

const News = require('./models/News');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { t, mainKeyboard, detectLang } = require('./utils/i18n');
const PptFile = require('./models/PptFile');

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const PLAN_LIMITS = {
  free:    { ai: 30,   ppt: 2,   pptPro: 0,  sessions: 2,       personas: 0        },
  starter: { ai: 500,  ppt: 15,  pptPro: 5,  sessions: 20,      personas: 3        },
  pro:     { ai: 2000, ppt: 50,  pptPro: 20, sessions: 50,      personas: 10       },
  premium: { ai: 5000, ppt: 100, pptPro: 50, sessions: Infinity, personas: Infinity }
};

const PLAN_NAMES = {
  free: '📦 Free', starter: '⭐ Starter', pro: '🚀 Pro', premium: '💎 Premium'
};

// Guruh uchun limitlar — faqat xabar soni farqlanadi
// PPT va Video barcha planlarda mavjud
const GROUP_PLAN_LIMITS = {
  free:    { ai: 100       },
  starter: { ai: 1000      },
  pro:     { ai: 5000      },
  premium: { ai: Infinity  }
};

const GROUP_PLAN_PRICES = {
  starter: { discounted: '19 000', original: '29 000' },
  pro:     { discounted: '39 000', original: '59 000' },
  premium: { discounted: '59 000', original: '99 000' }
};

const PLAN_PRICES = {
  starter: { discounted: '19 000', original: '29 000' },
  pro:     { discounted: '39 000', original: '59 000' },
  premium: { discounted: '59 000', original: '99 000' }
};

const GRACE_DAYS = 3;

const BUILTIN_PERSONAS = [
  { key:'aql',      emoji:'🧠', name:'Aql',      desc:"Professional maslahatchi. Aniq, to'g'ri va foydali.",   prompt:"Sen professional va bilimdon maslahatchi sifatida gapirasan. Har doim aniq, to'g'ri va foydali javob berasan. Ortiqcha so'z ishlatmaysan. Faktlarga asoslanasan." },
  { key:'dost',     emoji:'😊', name:"Do'st",    desc:"Samimiy do'st. Iliq, qo'llab-quvvatlovchi.",            prompt:"Sen samimiy, iliq va qo'llab-quvvatlovchi do'st sifatida gapirasan. Foydalanuvchini tushunishga harakat qilasan. Ba'zan hazil ham qilasan." },
  { key:'murabbiy', emoji:'🎯', name:'Murabbiy', desc:"Qat'iy murabbiy. Motivatsiya, intizom, natija.",         prompt:"Sen qat'iy lekin adolatli murabbiy sifatida gapirasan. Maqsadga erishish, intizom va harakat muhimligini ta'kidlaysan. Bahona qabul qilmaysan." },
  { key:'doktor',   emoji:'🩺', name:'Doktor',   desc:"Sog'liq bo'yicha maslahatchi. Ehtiyotkor, asosli.",     prompt:"Sen sog'liq bo'yicha bilimdon maslahatchi sifatida gapirasan. Faqat umumiy ma'lumot berasan (tibbiy tashxis qo'ymaysan)." },
  { key:'ustoz',    emoji:'📚', name:'Ustoz',    desc:"Ta'lim va o'rganish bo'yicha. Sabr bilan tushuntiradi.", prompt:"Sen sabr-toqatli va tushuntirishga usta o'qituvchi sifatida gapirasan. Murakkab narsalarni sodda qilib tushuntirasan." }
];

const MENU_ITEMS_ALL = [
  '💬 Suhbat','📊 Statistika','🗂 Suhbatlar','⚙️ Sozlamalar',
  '🎭 Promptizatsiya','🎨 Prezentatsiya','📰 Yangiliklar','🗑 Tozalash','⭐ Obuna','📁 Fayllarim','🌐 Web interfeys',
  '💬 Чат','📊 Статистика','🗂 Беседы','⚙️ Настройки',
  '🎭 Промпты','🎨 Презентация','📰 Новости','🗑 Очистить','⭐ Подписка','📁 Мои файлы','🌐 Веб-интерфейс',
  '💬 Chat','📊 Statistics','🗂 Sessions','⚙️ Settings',
  '🎭 Prompts','🎨 Presentation','📰 News','🗑 Clear','⭐ Subscribe','📁 My Files','🌐 Web App'
];

async function launchUserBot(botConfig) {
  const bot = new Telegraf(botConfig.botToken);
  bot.use(session());
  // super-admin activeBots orqali botConfig ga kirishi uchun
  bot.botConfig = botConfig;

  const _adminUsername = process.env.ADMIN_USERNAME || '';
  const _cardNumber    = process.env.CARD_NUMBER    || '';

  function lang(ctx) {
    return (ctx.session && ctx.session.lang) || 'ru';
  }

  // ── ZONA MENEJERI ──
  async function openZone(ctx, text, extra) {
    await clearZone(ctx);
    var msg = await ctx.reply(text, extra || {});
    ctx.session = ctx.session || {};
    ctx.session.zoneMessageId = msg.message_id;
    ctx.session.zoneChatId    = ctx.chat.id;
    return msg;
  }

  // ── Suhbatlar ro'yxatini ko'rsatish — umumiy funksiya ──
  async function showSessionsList(ctx, edit) {
    var uid  = String(ctx.from.id);
    var l    = lang(ctx);
    var list = await ChatSession.find({botId:botConfig._id,userTelegramId:uid,isActive:true})
                 .sort({updatedAt:-1}).limit(10);

    var header;
    if (!list.length) {
      header = l==='uz'?"🗂 Suhbat fayllari yo'q.\n\nYangi suhbat boshlash uchun 💬 Suhbat tugmasini bosing."
        :l==='en'?"🗂 No session files.\n\nPress 💬 Chat to start a new chat."
        :"🗂 Файлов бесед нет.\n\nНажмите 💬 Чат чтобы начать.";
      var kb0 = Markup.inlineKeyboard([[Markup.button.callback(t('btn_close',l),'zone_close')]]);
      if (edit) return ctx.editMessageText(header,kb0).catch(function(){ctx.reply(header,kb0);});
      return openZone(ctx,header,kb0);
    }

    header = l==='uz'?'🗂 Suhbat fayllari ('+list.length+' ta)\n\nBirorta tanlang:'
      :l==='en'?'🗂 Session files ('+list.length+')\n\nSelect one:'
      :'🗂 Файлы бесед ('+list.length+')\n\nВыберите:';

    var btns = list.map(function(s) {
      var cnt = Math.floor((s.messages||[]).length/2);
      var d   = new Date(s.updatedAt).toLocaleDateString('ru-RU');
      var active = ctx.session && ctx.session.activeSessionId===String(s._id) ? '▶️ ' : '';
      return [Markup.button.callback(active+s.title+' ('+cnt+') — '+d, 'open_session_'+s._id)];
    });
    btns.push([Markup.button.callback(t('btn_close',l),'zone_close')]);

    var kb = Markup.inlineKeyboard(btns);
    if (edit) return ctx.editMessageText(header,kb).catch(function(){ctx.reply(header,kb);});
    return openZone(ctx,header,kb);
  }

  async function clearZone(ctx) {
    ctx.session = ctx.session || {};
    if (ctx.session.zoneMessageId && ctx.session.zoneChatId) {
      try { await bot.telegram.deleteMessage(ctx.session.zoneChatId, ctx.session.zoneMessageId); } catch (_) {}
      ctx.session.zoneMessageId = null;
      ctx.session.zoneChatId    = null;
    }
  }
  async function updateZone(ctx, text, extra) {
    ctx.session = ctx.session || {};
    if (ctx.session.zoneMessageId) {
      try {
        await bot.telegram.editMessageText(ctx.session.zoneChatId, ctx.session.zoneMessageId, null, text, extra || {});
        return;
      } catch (_) {}
    }
    await openZone(ctx, text, extra);
  }

  // ── UZUN XABARNI BO'LIB YUBORISH ──
  // Telegram 4096 belgi chegarasi. Uzun bo'lsa bo'lib yuboradi.
  // Oxirgi qismda "Davomini so'rash" eslatmasi qo'shiladi.
  async function sendLongMessage(ctx, text, useHTML) {
    var LIMIT = 4000; // 4096 dan biroz kam — xavfsiz chegara
    var lang2 = lang(ctx);

    // Qisqa bo'lsa — to'g'ri yuborish
    if (text.length <= LIMIT) {
      if (useHTML) {
        try { await ctx.reply(text, {parse_mode:'HTML'}); }
        catch(e) { await ctx.reply(text.replace(/<[^>]+>/g,'')); }
      } else {
        await ctx.reply(text);
      }
      return;
    }

    // Uzun bo'lsa — paragraf bo'yicha bo'lamiz
    var parts = splitByParagraphs(text, LIMIT);

    for (var i = 0; i < parts.length; i++) {
      var isLast = i === parts.length - 1;
      var chunk  = parts[i];

      // Oxirgi qismga "davomi bor" eslatmasi
      if (!isLast) {
        var contNote = lang2==='uz' ? '\n\n⏳ <i>Javob davom etmoqda...</i>'
          : lang2==='en' ? '\n\n⏳ <i>Continuing...</i>'
          : '\n\n⏳ <i>Продолжение следует...</i>';
        if (useHTML) chunk += contNote;
      } else {
        // Oxirgi qismda davomini so'rash eslatmasi
        var nextNote = lang2==='uz'
          ? '\n\n💬 <i>Davomini ko\'rish uchun "davom" deb yozing.</i>'
          : lang2==='en'
          ? '\n\n💬 <i>Type "continue" to see more.</i>'
          : '\n\n💬 <i>Напишите "продолжай" чтобы получить продолжение.</i>';
        if (useHTML) chunk += nextNote;
      }

      try {
        if (useHTML) {
          try {
            await ctx.reply(chunk, {parse_mode:'HTML'});
          } catch(htmlErr) {
            // HTML parse xato — taglarni olib, qayta yuborish
            console.warn('[MSG] HTML parse xato, oddiy matn:', htmlErr.message);
            var plain = chunk.replace(/<\/?(b|i|code|pre|s|u|a)[^>]*>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
            await ctx.reply(plain);
          }
        } else {
          await ctx.reply(chunk);
        }
      } catch(e) {
        console.error('[MSG] Yuborish xato:', e.message);
      }

      // Qismlar orasida kichik pauza (spam filtri)
      if (!isLast) await new Promise(function(r){setTimeout(r,300);});
    }
  }

  // Matnni paragraf bo'yicha limitga moslash
  function splitByParagraphs(text, limit) {
    if (text.length <= limit) return [text];

    var parts  = [];
    var current = '';
    // Avval paragrafga bo'lamiz
    var paras  = text.split('\n\n');

    for (var i = 0; i < paras.length; i++) {
      var para = paras[i];
      // Bitta paragraf limitdan katta bo'lsa — satr bo'yicha bo'lamiz
      if (para.length > limit) {
        var lines = para.split('\n');
        for (var j = 0; j < lines.length; j++) {
          var line = lines[j] + (j < lines.length-1 ? '\n' : '');
          if ((current + line).length > limit) {
            if (current) parts.push(current.trim());
            current = line;
          } else {
            current += line;
          }
        }
      } else {
        var sep = current ? '\n\n' : '';
        if ((current + sep + para).length > limit) {
          if (current) parts.push(current.trim());
          current = para;
        } else {
          current += sep + para;
        }
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

    // ── SESSIYA SAQLANDI ESLATMASI ──
  // Foydalanuvchi boshqa tugmani bosganida bir marta ko'rsatiladi
  async function notifySessionSavedIfNeeded(ctx) {
    ctx.session = ctx.session || {};
    if (ctx.session.activeSessionId && !ctx.session.sessionSavedNotified) {
      ctx.session.sessionSavedNotified = true;
      var l = lang(ctx);
      var sess = await ChatSession.findById(ctx.session.activeSessionId).catch(function(){return null;});
      var title = sess ? sess.title : (l==='uz'?'Suhbat':l==='en'?'Chat':'Беседа');
      // Kichik eslatma — pastda chiqadi, bloklamas
      ctx.reply(t('chat_saved_notice', l, title)).catch(function(){});
    }
  }

  // ── OYLIK RESET ──
  function monthStr() { return new Date().toISOString().slice(0, 7); }

  async function resetMonthlyIfNeeded(cfg) {
    var current = monthStr();
    if (cfg.monthlyReset !== current) {
      await UserBot.findByIdAndUpdate(cfg._id, {
        $set: { monthlyMessages:0, monthlyPpt:0, monthlyPptPro:0, monthlySessions:0, monthlyReset:current }
      });
      cfg.monthlyMessages = 0; cfg.monthlyPpt = 0;
      cfg.monthlyPptPro   = 0; cfg.monthlySessions = 0;
      cfg.monthlyReset    = current;
    }
  }

  // ── FRESH CONFIG — DB dan yangi qiymatlar olish ──
  async function getFreshConfig() {
    var fresh = await UserBot.findById(botConfig._id);
    if (fresh) {
      botConfig.currentPlan     = fresh.currentPlan;
      botConfig.monthlyMessages = fresh.monthlyMessages;
      botConfig.monthlyPpt      = fresh.monthlyPpt;
      botConfig.monthlyPptPro   = fresh.monthlyPptPro;
      botConfig.monthlySessions = fresh.monthlySessions;
      botConfig.monthlyReset    = fresh.monthlyReset;
    }
    return botConfig;
  }

  // ── LIMIT TEKSHIRUVLARI ──
  // FIX #1: typeof t() olib tashlandi — t() har doim string qaytaradi

  async function checkAILimit(cfg, l) {
    await resetMonthlyIfNeeded(cfg);
    var plan = cfg.currentPlan || 'free';
    var lim  = PLAN_LIMITS[plan].ai;
    if ((cfg.monthlyMessages || 0) >= lim) {
      return { allowed:false, msg:t('limit_reached_ai',l,PLAN_NAMES[plan],lim),
        keyboard:Markup.inlineKeyboard([[Markup.button.callback(t('btn_subscribe',l),'sub_show_plans')]]) };
    }
    return { allowed:true };
  }

  async function checkPptLimit(cfg, l) {
    await resetMonthlyIfNeeded(cfg);
    var plan = cfg.currentPlan || 'free';
    var lim  = PLAN_LIMITS[plan].ppt;
    if ((cfg.monthlyPpt || 0) >= lim) {
      return { allowed:false, msg:t('limit_reached_ppt',l,PLAN_NAMES[plan],lim),
        keyboard:Markup.inlineKeyboard([[Markup.button.callback(t('btn_subscribe',l),'sub_show_plans')]]) };
    }
    return { allowed:true };
  }

  async function checkPptProLimit(cfg, l) {
    await resetMonthlyIfNeeded(cfg);
    var plan = cfg.currentPlan || 'free';
    var lim  = PLAN_LIMITS[plan].pptPro;
    // FIX #1: to'g'ridan-to'g'ri t() chaqiriladi
    if (lim === 0 || (cfg.monthlyPptPro || 0) >= lim) {
      return { allowed:false, msg:t('limit_reached_ppt_pro',l,plan),
        keyboard:Markup.inlineKeyboard([[Markup.button.callback(t('btn_subscribe',l),'sub_show_plans')]]) };
    }
    return { allowed:true };
  }

  async function checkSessionLimit(cfg, l) {
    await resetMonthlyIfNeeded(cfg);
    var plan = cfg.currentPlan || 'free';
    var lim  = PLAN_LIMITS[plan].sessions;
    if (lim !== Infinity && (cfg.monthlySessions || 0) >= lim) {
      return { allowed:false, msg:t('limit_reached_session',l,PLAN_NAMES[plan],lim),
        keyboard:Markup.inlineKeyboard([[Markup.button.callback(t('btn_subscribe',l),'sub_show_plans')]]) };
    }
    return { allowed:true };
  }

  async function checkPersonaLimit(cfg, count, l) {
    var plan = cfg.currentPlan || 'free';
    var lim  = PLAN_LIMITS[plan].personas;
    // FIX #1: to'g'ridan-to'g'ri t() chaqiriladi
    if (lim === 0 || (lim !== Infinity && count >= lim)) {
      return { allowed:false, msg:t('limit_reached_persona',l,plan,lim),
        keyboard:Markup.inlineKeyboard([[Markup.button.callback(t('btn_subscribe',l),'sub_show_plans')]]) };
    }
    return { allowed:true };
  }

  function subscribeLink(plan, uniqueId) {
    var planName = PLAN_NAMES[plan] || plan;
    return 'https://t.me/' + _adminUsername + '?text=' +
      encodeURIComponent(t('sub_order_text','uz',planName,uniqueId));
  }

  async function generateUniqueId(plan) {
    var prefix = plan.toUpperCase();
    var chars  = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    var id, attempts = 0;
    do {
      var s = '';
      for (var i=0;i<4;i++) s += chars[Math.floor(Math.random()*chars.length)];
      id = prefix+'-'+s;
      var ex = await Subscription.findOne({uniqueId:id});
      if (++attempts > 30) { id = prefix+'-'+Date.now().toString().slice(-4); break; }
    } while (ex);
    return id;
  }

  function pptMenu(plan, l) {
    var canPro = PLAN_LIMITS[plan].pptPro > 0;
    return Markup.inlineKeyboard([
      [Markup.button.callback(t('btn_ppt_simple',l),'ppt_start_simple')],
      [canPro ? Markup.button.callback(t('btn_ppt_pro',l),'ppt_start_pro')
              : Markup.button.callback(t('btn_ppt_pro_locked',l),'ppt_need_sub')],
      [Markup.button.callback(t('btn_ppt_diff',l),'ppt_diff'),
       Markup.button.callback(t('btn_close',l),'zone_close')]
    ]);
  }

  // ═══════════════════════════════════════════════
  // START
  // ═══════════════════════════════════════════════
  bot.start(async (ctx) => {
    ctx.session = ctx.session || {};
    var userId    = String(ctx.from.id);
    var firstName = esc(ctx.from.first_name || "Do'st");
    var isOwner   = userId === String(botConfig.ownerTelegramId);
    var accessMode = botConfig.accessMode || 'private';
    var l = lang(ctx);

    if (!isOwner) {
      if (accessMode === 'private') {
        // Faqat egasi — boshqalar bloklanadi
        return ctx.reply(
          l==='uz' ? '🔒 Bu shaxsiy bot.\n\nFaqat bot egasi foydalana oladi.'
          :l==='en' ? '🔒 This is a private bot.\n\nOnly the owner can use it.'
          :'🔒 Это личный бот.\n\nТолько владелец может им пользоваться.'
        );
      } else if (accessMode === 'whitelist') {
        // Faqat allowedUsers ro'yxatidagilar
        if (!botConfig.allowedUsers.includes(userId)) {
          return ctx.reply(
            l==='uz' ? '🔒 Bu bot yopiq.\n\n'+esc(botConfig.ownerName||'Bot egasi')+' sizga ruxsat berishi kerak.'
            :l==='en' ? '🔒 This bot is closed.\n\nThe owner must grant you access.'
            :'🔒 Этот бот закрыт.\n\nВладелец должен предоставить вам доступ.'
          );
        }
      } else if (accessMode === 'open') {
        // Hamma kiradi — allowedUsers ga qo'shmaymiz, har birining o'z hisobi
      }
    } else {
      // Egasini allowedUsers ga qo'shamiz
      if (!botConfig.allowedUsers.includes(userId)) {
        await UserBot.findByIdAndUpdate(botConfig._id,{$addToSet:{allowedUsers:userId}});
        botConfig.allowedUsers.push(userId);
      }
    }

    if (!ctx.session.lang) {
      ctx.session.lang = detectLang(ctx.from.language_code);
      var h0 = await ChatHistory.findOne({botId:botConfig._id,userTelegramId:userId});
      if (!h0||!h0.messages||!h0.messages.length) {
        await ctx.reply('🌐 Tilni tanlang / Выберите язык / Choose language:',
          Markup.inlineKeyboard([[
            Markup.button.callback("🇺🇿 O'zbek",'set_lang_ui_uz'),
            Markup.button.callback('🇷🇺 Русский','set_lang_ui_ru'),
            Markup.button.callback('🇬🇧 English','set_lang_ui_en')
          ]])
        );
        return;
      }
    }

    var l        = lang(ctx);
    var title    = botConfig.userTitle || "do'stim";
    var hasPrompt = isOwner && !!(botConfig.extraInstructions && botConfig.extraInstructions.trim());
    var hist     = await ChatHistory.findOne({botId:botConfig._id,userTelegramId:userId});
    var hasHist  = hist && hist.messages && hist.messages.length > 0;

    if (hasHist) {
      var pairs = Math.floor(hist.messages.length/2);
      var msg   = l==='uz' ? 'Xush kelibsiz, '+firstName+'! 👋\n\nEslab qolganman — '+pairs+" ta suhbatimiz bor. 🧠\n\nDavom etamizmi?"
                : l==='en' ? 'Welcome back, '+firstName+'! 👋\n\nI remember — '+pairs+' conversation(s). 🧠\n\nShall we continue?'
                : 'С возвращением, '+firstName+'! 👋\n\nПомню — '+pairs+' разговор(а). 🧠\n\nПродолжим?';
      await ctx.reply(msg, mainKeyboard(l,isOwner,hasPrompt));
    } else {
      await ctx.reply(t('start_greeting',l,firstName,title), mainKeyboard(l,isOwner,hasPrompt));
    }
  });

  // FIX: noyob regex set_lang_ui_ (set_bot_lang_ bilan to'qnashmaydi)
  bot.action(/^set_lang_ui_(uz|ru|en)$/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = ctx.session || {};
    var ch    = ctx.match[1];
    ctx.session.lang = ch;
    var uid   = String(ctx.from.id);
    var fname = esc(ctx.from.first_name || "Do'st");
    var isOwn = uid === String(botConfig.ownerTelegramId);
    var hp    = isOwn && !!(botConfig.extraInstructions && botConfig.extraInstructions.trim());
    var conf  = ch==='uz' ? "✅ Til: O'zbek tili tanlandi!" : ch==='en' ? '✅ Language: English selected!' : '✅ Язык: Русский выбран!';
    await ctx.editMessageText(conf);
    await ctx.reply(t('start_greeting',ch,fname,botConfig.userTitle||"do'stim"), mainKeyboard(ch,isOwn,hp));
  });

  bot.command('menu', async (ctx) => {
    ctx.session = ctx.session || {};
    await clearZone(ctx);
    ctx.session.step = null; ctx.session.ppt = null;
    var uid  = String(ctx.from.id);
    var isOwn = uid === String(botConfig.ownerTelegramId);
    var hp   = isOwn && !!(botConfig.extraInstructions && botConfig.extraInstructions.trim());
    await ctx.reply('🏠 Asosiy menyu', mainKeyboard(lang(ctx),isOwn,hp));
  });

  bot.action('zone_close', async (ctx) => {
    await ctx.answerCbQuery();
    await clearZone(ctx);
  });

  // ═══════════════════════════════════════════════
  // 💬 SUHBAT — sessiya yaratuvchi tizim
  // ═══════════════════════════════════════════════
  bot.hears(['💬 Suhbat','💬 Чат','💬 Chat'], async (ctx) => {
    var uid   = String(ctx.from.id);
    var isOwn = uid === String(botConfig.ownerTelegramId);
    var l     = lang(ctx);
    ctx.session = ctx.session || {};

    // Faol sessiya bor — davom etish
    if (ctx.session.activeSessionId) {
      var existSess = await ChatSession.findOne({
        _id: ctx.session.activeSessionId,
        botId: botConfig._id, userTelegramId: uid, isActive: true
      });
      if (existSess) {
        var cnt = Math.floor((existSess.messages||[]).length/2);
        return ctx.reply(t('chat_session_resumed',l,existSess.title,cnt));
      }
      ctx.session.activeSessionId = null;
    }

    // Menyu: yangi sessiya | oddiy suhbat | (egaga) bot sozlamalari
    var btns = [
      [Markup.button.callback(t('btn_chat_new_session',l),'chat_new_session')],
      [Markup.button.callback(t('btn_chat_plain',l),'chat_plain_start')]
    ];
    if (isOwn) btns.push([Markup.button.callback(t('btn_bot_settings',l),'chat_bot_settings')]);
    btns.push([Markup.button.callback(t('btn_close',l),'zone_close')]);
    await openZone(ctx, t('chat_no_active',l), Markup.inlineKeyboard(btns));
  });

  // ── Yangi papkali suhbat ──
  bot.action('chat_new_session', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = ctx.session || {};
    var uid   = String(ctx.from.id);
    var isOwn = uid === String(botConfig.ownerTelegramId);
    var l     = lang(ctx);

    if (isOwn) {
      await getFreshConfig();
      var chk = await checkSessionLimit(botConfig, l);
      if (!chk.allowed) return ctx.editMessageText(chk.msg, chk.keyboard||{});
      await UserBot.findByIdAndUpdate(botConfig._id, {$inc:{monthlySessions:1}});
      botConfig.monthlySessions = (botConfig.monthlySessions||0)+1;
    }

    var now  = new Date();
    var dd   = String(now.getDate()).padStart(2,'0');
    var mm   = String(now.getMonth()+1).padStart(2,'0');
    var hh   = String(now.getHours()).padStart(2,'0');
    var min  = String(now.getMinutes()).padStart(2,'0');
    var autoTitle = (l==='uz'?'Suhbat ':l==='en'?'Chat ':'Беседа ')+dd+'.'+mm+' '+hh+':'+min;

    var sess = await ChatSession.create({
      botId: botConfig._id, userTelegramId: uid,
      title: autoTitle, messages: []
    });
    ctx.session.activeSessionId      = String(sess._id);
    ctx.session.chatNudgeSent        = true;
    ctx.session.sessionSavedNotified = false;
    await ctx.editMessageText(t('chat_session_started',l,autoTitle));
  });

  // ── Oddiy suhbat (sessiyasiz) ──
  bot.action('chat_plain_start', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = ctx.session || {};
    ctx.session.activeSessionId = null;
    ctx.session.chatNudgeSent   = true;
    var l   = lang(ctx);
    var msg = l==='uz'?'💬 Oddiy suhbat boshlandi.\n\nXabarlaringiz xotirada saqlanadi.\nYozing!'
      :l==='en'?'💬 Plain chat started.\n\nMessages saved in memory.\nWrite!'
      :'💬 Обычный чат начат.\n\nСообщения сохраняются в памяти.\nПишите!';
    await ctx.editMessageText(msg);
  });

  // ── Bot sozlamalari (faqat egasi) — nom va uslub ──
  bot.action('chat_bot_settings', async (ctx) => {
    await ctx.answerCbQuery();
    var l = lang(ctx);
    var persMap = {
      friendly:     {uz:'Samimiy',    en:'Friendly',    ru:'Дружелюбный'},
      professional: {uz:'Professional',en:'Professional',ru:'Профессиональный'},
      funny:        {uz:'Quvnoq',     en:'Funny',       ru:'Весёлый'},
      strict:       {uz:'Qisqa va aniq',en:'Concise',   ru:'Краткий'}
    };
    var persObj = persMap[botConfig.personality]||persMap.friendly;
    var pers    = persObj[l]||persObj.ru;
    var infoText = l==='uz'
      ? '🤖 Bot sozlamalari\n\nNom: '+esc(botConfig.botName)+'\nUslub: '+pers
      : l==='en'
      ? '🤖 Bot settings\n\nName: '+esc(botConfig.botName)+'\nStyle: '+pers
      : '🤖 Настройки бота\n\nИмя: '+esc(botConfig.botName)+'\nСтиль: '+pers;
    await ctx.editMessageText(infoText, Markup.inlineKeyboard([
      [Markup.button.callback('✏️ '+(l==='uz'?'Bot nomi':l==='en'?'Bot name':'Имя бота'),'edit_name'),
       Markup.button.callback('🎭 '+(l==='uz'?'Uslub':l==='en'?'Style':'Стиль'),'edit_personality')],
      [Markup.button.callback('◀️ '+(l==='uz'?'Orqaga':l==='en'?'Back':'Назад'),'chat_back_to_menu')]
    ]));
  });

  bot.action('chat_back_to_menu', async (ctx) => {
    await ctx.answerCbQuery();
    var uid   = String(ctx.from.id);
    var isOwn = uid === String(botConfig.ownerTelegramId);
    var l     = lang(ctx);
    var btns  = [
      [Markup.button.callback(t('btn_chat_new_session',l),'chat_new_session')],
      [Markup.button.callback(t('btn_chat_plain',l),'chat_plain_start')],
      [Markup.button.callback(t('btn_bot_settings',l),'chat_bot_settings')],
      [Markup.button.callback(t('btn_close',l),'zone_close')]
    ];
    await ctx.editMessageText(t('chat_no_active',l), Markup.inlineKeyboard(btns));
  });

  bot.action('edit_name', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = ctx.session || {}; ctx.session.step = 'edit_bot_name';
    await ctx.editMessageText('Bot nomini yozing:\nHozir: '+esc(botConfig.botName));
  });
  bot.action('edit_topics', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = ctx.session || {}; ctx.session.step = 'edit_bot_topics';
    await ctx.editMessageText('Yangi mavzularni vergul bilan yozing:\nHozir: '+esc((botConfig.topics||[]).join(', ')||'belgilanmagan'));
  });
  bot.action('edit_language', async (ctx) => {
    await ctx.answerCbQuery();
    var names = { uz:"O'zbek", ru:'Rus', en:'Ingliz' };
    await ctx.editMessageText('Tilni tanlang:\nHozir: '+(names[botConfig.language]||"O'zbek"),
      Markup.inlineKeyboard([
        [Markup.button.callback("🇺🇿 O'zbek",'set_bot_lang_uz')],
        [Markup.button.callback('🇷🇺 Rus','set_bot_lang_ru')],
        [Markup.button.callback('🇬🇧 Ingliz','set_bot_lang_en')]
      ])
    );
  });
  // FIX: set_bot_lang_ — UI tilidan alohida regex, aniq 3 ta til
  bot.action(/^set_bot_lang_(uz|ru|en)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var lc = ctx.match[1];
    botConfig.language = lc;
    await UserBot.findByIdAndUpdate(botConfig._id,{$set:{language:lc}});
    var names = { uz:"O'zbek", ru:'Rus', en:'Ingliz' };
    await ctx.editMessageText('Bot tili '+(names[lc]||lc)+" ga o'zgardi!");
  });
  bot.action('edit_personality', async (ctx) => {
    await ctx.answerCbQuery();
    var cur = { friendly:'Samimiy', professional:'Professional', funny:'Quvnoq', strict:'Qisqa va aniq' }[botConfig.personality]||'Samimiy';
    await ctx.editMessageText('Uslubni tanlang:\nHozir: '+cur,
      Markup.inlineKeyboard([
        [Markup.button.callback('😊 Samimiy','set_pers_friendly')],
        [Markup.button.callback('💼 Professional','set_pers_professional')],
        [Markup.button.callback('😄 Quvnoq','set_pers_funny')],
        [Markup.button.callback('🎯 Qisqa va aniq','set_pers_strict')]
      ])
    );
  });
  bot.action(/^set_pers_(friendly|professional|funny|strict)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var p = ctx.match[1];
    botConfig.personality = p;
    await UserBot.findByIdAndUpdate(botConfig._id,{$set:{personality:p}});
    var names = { friendly:'Samimiy', professional:'Professional', funny:'Quvnoq', strict:'Qisqa va aniq' };
    await ctx.editMessageText('Uslub '+(names[p]||p)+" ga o'zgardi!");
  });

  // ═══════════════════════════════════════════════
  // 📊 STATISTIKA
  // ═══════════════════════════════════════════════
  bot.hears(['📊 Statistika','📊 Статистика','📊 Statistics'], async (ctx) => {
    await notifySessionSavedIfNeeded(ctx);
    var uid  = String(ctx.from.id);
    var isOwn = uid === String(botConfig.ownerTelegramId);
    var l    = lang(ctx);
    var hist = await ChatHistory.findOne({botId:botConfig._id,userTelegramId:uid});
    var cnt  = hist ? hist.messages.length : 0;
    var sess = await ChatSession.countDocuments({botId:botConfig._id,userTelegramId:uid,isActive:true});
    if (cnt===0 && sess===0) {
      return openZone(ctx,
        l==='uz' ? "📊 Hali statistika yo'q.\n\nBirinchi savolingizni yozing!"
        :l==='en' ? "📊 No statistics yet.\n\nWrite your first question!"
        :'📊 Статистики пока нет.\n\nНапишите первый вопрос!',
        Markup.inlineKeyboard([[Markup.button.callback(t('btn_close',l),'zone_close')]])
      );
    }
    var fresh = await UserBot.findById(botConfig._id);
    var plan  = fresh ? (fresh.currentPlan||'free') : 'free';
    var title = l==='uz'?'📊 Statistika':l==='en'?'📊 Statistics':'📊 Статистика';
    var text  = title+'\n\n'+t('stats_messages',l,fresh?fresh.totalMessages:0)+'\n'+t('stats_sessions',l,sess);
    if (isOwn && fresh) {
      var lims = PLAN_LIMITS[plan];
      var pct  = await Persona.countDocuments({botId:botConfig._id,userTelegramId:uid,isActive:true});
      text += '\n\n'+t('stats_plan',l,PLAN_NAMES[plan]);
      var sub = await Subscription.findOne({telegramId:uid,status:{$in:['active','grace']}});
      if (sub && sub.expiresAt) {
        var dl = Math.ceil((sub.expiresAt-new Date())/(1000*60*60*24));
        if (dl>0) text += '\n'+t('stats_expires',l,sub.expiresAt.toLocaleDateString('ru-RU'));
      }
      var perMax = lims.personas===Infinity?'∞':lims.personas;
      text += '\n\n'+t('stats_monthly_ai',l,fresh.monthlyMessages||0,lims.ai)+'\n'+
        t('stats_monthly_ppt',l,fresh.monthlyPpt||0,lims.ppt===Infinity?'∞':lims.ppt)+'\n'+
        (l==='uz'?'🎭 Personalar: ':l==='en'?'🎭 Personas: ':'🎭 Персон: ')+pct+'/'+perMax;
    }
    await openZone(ctx,text,Markup.inlineKeyboard([[Markup.button.callback(t('btn_close',l),'zone_close')]]));
  });

  // ═══════════════════════════════════════════════
  // 🗑 TOZALASH
  // ═══════════════════════════════════════════════
  bot.hears(['🗑 Tozalash','🗑 Очистить','🗑 Clear'], async (ctx) => {
    await notifySessionSavedIfNeeded(ctx);
    var uid  = String(ctx.from.id);
    var hist = await ChatHistory.findOne({botId:botConfig._id,userTelegramId:uid});
    var cnt  = hist ? Math.floor(hist.messages.length/2) : 0;
    var l    = lang(ctx);
    if (cnt===0) return openZone(ctx,
      l==='uz'?"🗑 Xotirada hech narsa yo'q.":l==='en'?'🗑 Memory is empty.':'🗑 Память пуста.',
      Markup.inlineKeyboard([[Markup.button.callback(t('btn_close',l),'zone_close')]])
    );
    var yes = l==='uz'?'✅ Ha, tozala':l==='en'?'✅ Yes, clear':'✅ Да, очистить';
    var no  = l==='uz'?'❌ Bekor':l==='en'?'❌ Cancel':'❌ Отмена';
    await openZone(ctx,
      l==='uz'?"🗑 Xotirani tozalash\n\n"+cnt+" ta suhbat o'chiriladi.\n(Qaytarib bo'lmaydi)\n\nIshonchingiz komilmi?"
      :l==='en'?"🗑 Clear memory\n\n"+cnt+" conversation(s) will be deleted.\n(Cannot be undone)\n\nAre you sure?"
      :'🗑 Очистить память\n\n'+cnt+' разговор(а) будет удалено.\n(Нельзя отменить)\n\nВы уверены?',
      Markup.inlineKeyboard([[Markup.button.callback(yes,'confirm_clear'),Markup.button.callback(no,'cancel_clear')]])
    );
  });
  bot.action('confirm_clear', async (ctx) => {
    await ctx.answerCbQuery();
    var uid = String(ctx.from.id);
    await ChatHistory.findOneAndUpdate({botId:botConfig._id,userTelegramId:uid},{$set:{messages:[],updatedAt:new Date()}});
    var l = lang(ctx);
    await ctx.editMessageText(l==='uz'?'✅ Tozalandi! Yangi varaqdan boshlaymiz. 🌱':l==='en'?'✅ Cleared! Starting fresh. 🌱':'✅ Очищено! Начинаем с чистого листа. 🌱');
    setTimeout(async()=>{ try{await bot.telegram.deleteMessage(ctx.chat.id,ctx.callbackQuery.message.message_id);}catch(_){} ctx.session=ctx.session||{}; ctx.session.zoneMessageId=null; },2000);
  });
  bot.action('cancel_clear', async (ctx) => { await ctx.answerCbQuery(); await clearZone(ctx); });
  bot.action('change_interface_lang', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('🌐 Tilni tanlang / Выберите язык / Choose language:',
      Markup.inlineKeyboard([[
        Markup.button.callback("🇺🇿 O'zbek",'set_lang_ui_uz'),
        Markup.button.callback('🇷🇺 Русский','set_lang_ui_ru'),
        Markup.button.callback('🇬🇧 English','set_lang_ui_en')
      ]])
    );
  });

  // ═══════════════════════════════════════════════
  // 🗂 SUHBAT FAYLLAR
  // ═══════════════════════════════════════════════
  bot.hears(['🗂 Suhbatlar','🗂 Беседы','🗂 Sessions'], async (ctx) => {
    await notifySessionSavedIfNeeded(ctx);
    await showSessionsList(ctx, false);
  });


  bot.action('sessions_back_list', async (ctx) => {
    await ctx.answerCbQuery();
    await showSessionsList(ctx, true);
  });

  bot.action('back_to_sessions', async (ctx) => {
    await ctx.answerCbQuery();
    await showSessionsList(ctx, true);
  });

  bot.command('yangi_suhbat', async (ctx) => {
    var parts = ctx.message.text.trim().split(/\s+/); parts.shift();
    var title = parts.join(' ').trim();
    if (!title) { ctx.session=ctx.session||{}; ctx.session.step='new_session_title'; return ctx.reply(t('session_title_prompt',lang(ctx))); }
    await createSession(ctx,title);
  });

  bot.action('new_session', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session=ctx.session||{}; ctx.session.step='new_session_title';
    var l=lang(ctx);
    await ctx.reply(l==='uz'?'Suhbat sarlavhasini yozing:':l==='en'?'Enter session title:':'Введите название беседы:');
  });

  bot.action(/^open_session_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var uid    = String(ctx.from.id);
    var sessId = ctx.match[1];
    var sess   = await ChatSession.findOne({_id:sessId,botId:botConfig._id,userTelegramId:uid});
    if (!sess) return ctx.editMessageText('Suhbat topilmadi.').catch(function(){ctx.reply('Suhbat topilmadi.');});

    ctx.session = ctx.session||{};
    ctx.session.activeSessionId = sessId;
    ctx.session.sessionSavedNotified = false;

    var cnt  = Math.floor((sess.messages||[]).length/2);
    var l    = lang(ctx);
    var isActive = ctx.session.activeSessionId === sessId;

    // Oxirgi 2 xabar preview
    var prev = '';
    if (sess.messages.length > 0) {
      sess.messages.slice(-2).forEach(function(m) {
        var who = m.role==='user'?(l==='uz'?'Siz':l==='en'?'You':'Вы'):(sess.title||'AI');
        prev += who+': '+m.content.replace(/<[^>]+>/g,'').slice(0,50)+(m.content.length>50?'...':'')+'\n';
      });
    }

    var header = '🗂 <b>'+sess.title+'</b>\n\n' +
      (l==='uz'?'💬 Xabarlar: '+cnt+' ta':l==='en'?'💬 Messages: '+cnt:'💬 Сообщений: '+cnt) +
      (prev ? '\n\n'+(l==='uz'?'Oxirgi:':l==='en'?'Last:':'Последние:')+'\n<i>'+prev.trim()+'</i>' : '') +
      '\n\n'+(l==='uz'?'▶️ Faollashtirildi — yozing!':l==='en'?'▶️ Active — write!':'▶️ Активна — пишите!');

    var btns = [
      [Markup.button.callback(l==='uz'?"📋 Tarixni o'qish":l==='en'?'📋 Read history':'📋 История','read_session_'+sessId),
       Markup.button.callback(l==='uz'?"📥 Yuklab olish":l==='en'?'📥 Download':'📥 Скачать','dl_session_'+sessId)],
      [Markup.button.callback(l==='uz'?"🗑 O'chirish":l==='en'?'🗑 Delete':'🗑 Удалить','del_session_'+sessId),
       Markup.button.callback(l==='uz'?"◀️ Ro'yxat":l==='en'?"◀️ List":"◀️ Список",'sessions_back_list')]
    ];

    await ctx.editMessageText(header,{
      parse_mode:'HTML',
      reply_markup: Markup.inlineKeyboard(btns).reply_markup
    }).catch(async function() {
      await ctx.reply(header,{parse_mode:'HTML',reply_markup:Markup.inlineKeyboard(btns).reply_markup});
    });
  });

  bot.action(/^read_session_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var uid    = String(ctx.from.id);
    var sessId = ctx.match[1];
    var l      = lang(ctx);
    var sess   = await ChatSession.findOne({_id:sessId,botId:botConfig._id,userTelegramId:uid});
    if (!sess) return ctx.answerCbQuery(l==='uz'?'Suhbat topilmadi.':l==='en'?'Not found.':'Не найдена.', true);
    if (!sess.messages||!sess.messages.length) {
      return ctx.answerCbQuery(l==='uz'?"Bo'sh — xabar yo'q.":l==='en'?'Empty.':'Пусто.', true);
    }

    var msgs    = sess.messages.slice(-30);
    var LIMIT   = 3500;
    var parts   = [];
    var cur     = '';
    var header  = '🗂 <b>'+esc(sess.title)+'</b> — '
      +(l==='uz'?'tarix':l==='en'?'history':'история')
      +'\n<i>'+(l==='uz'?msgs.length+' ta xabar':l==='en'?msgs.length+' messages':msgs.length+' сообщений')+'</i>\n\n';

    // Har bir xabarni alohida blok sifatida saqlang
    var blocks = msgs.map(function(m, i) {
      // AI javobidagi HTML taglarni Telegram uchun tozalang
      var cleanContent = (m.content||'')
        .replace(/<(?!\/?(b|i|code|pre|s|u)>)[^>]*>/gi, '')
        .trim();
      var who = m.role==='user'
        ? '👤 <b>'+(l==='uz'?'Siz':l==='en'?'You':'Вы')+'</b>'
        : '🤖 <b>'+esc(sess.title||'AI')+'</b>';
      var sep = i < msgs.length-1 ? '\n──────────────\n' : '';
      return who+':\n'+cleanContent+'\n'+sep;
    });

    // Header birinchi partga qo'shiladi
    cur = header;
    for (var bi=0; bi<blocks.length; bi++) {
      var blk = blocks[bi];
      // Bitta blok LIMIT dan katta bo'lsa — qisqartiramiz
      if (blk.length > LIMIT) {
        blk = blk.slice(0, LIMIT-50) + '\n<i>... (qolgan qism yuklab oling)</i>\n';
      }
      if ((cur+blk).length > LIMIT) {
        parts.push(cur);
        cur = blk;
      } else {
        cur += blk;
      }
    }
    if (cur.trim()) parts.push(cur);

    var backBtn = Markup.inlineKeyboard([
      [Markup.button.callback('📥 '+(l==='uz'?'Yuklab olish':l==='en'?'Download':'Скачать'),'dl_session_'+sessId),
       Markup.button.callback('◀️ '+(l==='uz'?'Orqaga':l==='en'?'Back':'Назад'),'open_session_'+sessId)]
    ]);

    for (var pi=0; pi<parts.length; pi++) {
      var isLast = pi===parts.length-1;
      try {
        await ctx.reply(parts[pi], {
          parse_mode: 'HTML',
          reply_markup: isLast ? backBtn.reply_markup : undefined
        });
      } catch(e) {
        // HTML parse xato — taglarni olib qayta yuboramiz
        var plain = parts[pi].replace(/<\/?(b|i|code|pre|s|u|a)[^>]*>/g,'')
          .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
        await ctx.reply(plain, {
          reply_markup: isLast ? backBtn.reply_markup : undefined
        });
      }
      if (!isLast) await new Promise(function(r){setTimeout(r,200);});
    }
  });

  bot.action(/^del_session_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var sessId = ctx.match[1];
    var l = lang(ctx);
    var sess = await ChatSession.findById(sessId).catch(function(){return null;});
    var title = sess ? sess.title : '';
    var msg = l==='uz'?'🗑 "'+title+'"\n\nBu suhbatni o\'chirasizmi?'
      :l==='en'?'🗑 "'+title+'"\n\nDelete this session?'
      :'🗑 "'+title+'"\n\nУдалить эту беседу?';
    await ctx.editMessageText(msg, Markup.inlineKeyboard([
      [Markup.button.callback(l==='uz'?"✅ Ha, o'chir":l==='en'?'✅ Yes, delete':'✅ Да, удалить','confirm_del_session_'+sessId),
       Markup.button.callback(l==='uz'?'❌ Bekor':l==='en'?'❌ Cancel':'❌ Отмена','open_session_'+sessId)]
    ]));
  });

  bot.action(/^confirm_del_session_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var uid    = String(ctx.from.id);
    var sessId = ctx.match[1];
    await ChatSession.findOneAndDelete({_id:sessId,botId:botConfig._id,userTelegramId:uid});
    if (ctx.session && ctx.session.activeSessionId===sessId) {
      ctx.session.activeSessionId = null;
    }
    var l = lang(ctx);
    // editMessageText o'rniga yangi xabar — 400 xatosidan qochish
    try { await bot.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id); } catch(_) {}
    await ctx.reply(l==='uz'?"✅ Suhbat o'chirildi.":l==='en'?'✅ Session deleted.':'✅ Беседа удалена.');
    await showSessionsList(ctx, false);
  });

  bot.action('cancel_del_session', async (ctx) => {
    await ctx.answerCbQuery();
    await showSessionsList(ctx, true);
  });
  bot.action('close_session', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = ctx.session||{};
    ctx.session.activeSessionId = null;
    ctx.session.sessionSavedNotified = true;
    // Ro'yxatga qaytish
    await showSessionsList(ctx, true);
  });

  // ═══════════════════════════════════════════════
  // ⚙️ SOZLAMALAR — FIX #4: barcha foydalanuvchilar ko'ra oladi
  // ═══════════════════════════════════════════════
  // ── Sozlamalar asosiy menyu — 2 bo'lim ──
  async function showSettingsMain(ctx, edit) {
    var uid   = String(ctx.from.id);
    var isOwn = uid === String(botConfig.ownerTelegramId);
    var l     = lang(ctx);
    var title = l==='uz'
      ? '⚙️ Sozlamalar\n\nQuyidagi bo\'limlardan birini tanlang:'
      : l==='en'
      ? '⚙️ Settings\n\nChoose a section:'
      : '⚙️ Настройки\n\nВыберите раздел:';
    var btns = [];
    if (isOwn) {
      btns.push([Markup.button.callback(
        l==='uz'?'🤖 Bot sozlamalari':l==='en'?'🤖 Bot settings':'🤖 Настройки бота',
        'sett_section_bot'
      )]);
    }
    btns.push(
      [Markup.button.callback(
        l==='uz'?'👤 Interfeys sozlamalari':l==='en'?'👤 Interface settings':'👤 Настройки интерфейса',
        'sett_section_interface'
      )],
      [Markup.button.callback(t('btn_close',l),'zone_close')]
    );
    if (edit) await ctx.editMessageText(title, Markup.inlineKeyboard(btns));
    else      await openZone(ctx, title, Markup.inlineKeyboard(btns));
  }

  bot.hears(['⚙️ Sozlamalar','⚙️ Настройки','⚙️ Settings'], async (ctx) => {
    await notifySessionSavedIfNeeded(ctx);
    await showSettingsMain(ctx, false);
  });

  // ── 1-bo'lim: Bot sozlamalari (faqat egasi) ──
  bot.action('sett_section_bot', async (ctx) => {
    await ctx.answerCbQuery();
    var l = lang(ctx);
    var persMap = {
      friendly:     {uz:'Samimiy',      en:'Friendly',    ru:'Дружелюбный'},
      professional: {uz:'Professional', en:'Professional', ru:'Профессиональный'},
      funny:        {uz:'Quvnoq',       en:'Funny',        ru:'Весёлый'},
      strict:       {uz:'Qisqa va aniq',en:'Concise',      ru:'Краткий'}
    };
    var persObj  = persMap[botConfig.personality] || persMap.friendly;
    var pers     = persObj[l] || persObj.ru;
    var hasPrompt = !!(botConfig.extraInstructions && botConfig.extraInstructions.trim());
    var modeMap  = {
      private:   { uz:'🔒 Shaxsiy (faqat men)', en:'🔒 Private (only me)',   ru:'🔒 Личный (только я)' },
      whitelist: { uz:'👥 Whitelist',            en:'👥 Whitelist',           ru:'👥 Whitelist' },
      open:      { uz:'🌐 Ochiq (hamma)',         en:'🌐 Open (everyone)',      ru:'🌐 Открытый (все)' }
    };
    var curMode  = botConfig.accessMode || 'private';
    var modeObj  = modeMap[curMode] || modeMap.private;
    var modeText = modeObj[l] || modeObj.ru;
    var text = l==='uz'
      ? '🤖 Bot sozlamalari\n\n✏️ Nom: '+esc(botConfig.botName)+'\n🎭 Uslub: '+pers+'\n🧬 Prompt: '+(hasPrompt?'Bor ✅':'Yo\'q')+'\n🔐 Kirish: '+modeText
      : l==='en'
      ? '🤖 Bot settings\n\n✏️ Name: '+esc(botConfig.botName)+'\n🎭 Style: '+pers+'\n🧬 Prompt: '+(hasPrompt?'Set ✅':'Not set')+'\n🔐 Access: '+modeText
      : '🤖 Настройки бота\n\n✏️ Имя: '+esc(botConfig.botName)+'\n🎭 Стиль: '+pers+'\n🧬 Промпт: '+(hasPrompt?'Есть ✅':'Нет')+'\n🔐 Доступ: '+modeText;
    await ctx.editMessageText(text, Markup.inlineKeyboard([
      [Markup.button.callback('✏️ '+(l==='uz'?'Bot nomi':l==='en'?'Bot name':'Имя'),'edit_name'),
       Markup.button.callback('🎭 '+(l==='uz'?'Uslub':l==='en'?'Style':'Стиль'),'edit_personality')],
      [Markup.button.callback('🧬 Promptizatsiya','prz_main')],
      [Markup.button.callback('🔐 '+(l==='uz'?'Kirish rejimi':l==='en'?'Access mode':'Режим доступа'),'sett_access_mode')],
      [Markup.button.callback('◀️ '+(l==='uz'?'Orqaga':l==='en'?'Back':'Назад'),'sett_main_back')]
    ]));
  });

  // ── Kirish rejimi tanlash ──
  bot.action('sett_access_mode', async (ctx) => {
    await ctx.answerCbQuery();
    var l       = lang(ctx);
    var curMode = botConfig.accessMode || 'private';
    var text    = l==='uz'
      ? '🔐 Kirish rejimi\n\nHozirgi: '+(curMode==='private'?'🔒 Shaxsiy':curMode==='whitelist'?'👥 Whitelist':'🌐 Ochiq')+'\n\n🔒 Shaxsiy — faqat siz\n👥 Whitelist — ruxsat bergan odamlar\n🌐 Ochiq — hamma, lekin limitlangan'
      : l==='en'
      ? '🔐 Access mode\n\nCurrent: '+(curMode==='private'?'🔒 Private':curMode==='whitelist'?'👥 Whitelist':'🌐 Open')+'\n\n🔒 Private — only you\n👥 Whitelist — users you add\n🌐 Open — everyone with limits'
      : '🔐 Режим доступа\n\nТекущий: '+(curMode==='private'?'🔒 Личный':curMode==='whitelist'?'👥 Whitelist':'🌐 Открытый')+'\n\n🔒 Личный — только вы\n👥 Whitelist — добавленные пользователи\n🌐 Открытый — все с лимитами';
    var mk = Markup.inlineKeyboard([
      [Markup.button.callback((curMode==='private'?'✅ ':'')+'🔒 '+(l==='uz'?'Shaxsiy':l==='en'?'Private':'Личный'),'set_access_private')],
      [Markup.button.callback((curMode==='whitelist'?'✅ ':'')+'👥 Whitelist','set_access_whitelist')],
      [Markup.button.callback((curMode==='open'?'✅ ':'')+'🌐 '+(l==='uz'?'Ochiq':l==='en'?'Open':'Открытый'),'set_access_open')],
      [Markup.button.callback('◀️ '+(l==='uz'?'Orqaga':l==='en'?'Back':'Назад'),'sett_section_bot')]
    ]);
    await ctx.editMessageText(text, mk);
  });

  bot.action(/^set_access_(private|whitelist|open)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var newMode = ctx.match[1];
    var l       = lang(ctx);
    await UserBot.findByIdAndUpdate(botConfig._id, { $set: { accessMode: newMode } });
    botConfig.accessMode = newMode;
    var modeNames = {
      private:   {uz:'🔒 Shaxsiy',   en:'🔒 Private',  ru:'🔒 Личный'},
      whitelist: {uz:'👥 Whitelist',  en:'👥 Whitelist', ru:'👥 Whitelist'},
      open:      {uz:'🌐 Ochiq',      en:'🌐 Open',       ru:'🌐 Открытый'}
    };
    var mn = (modeNames[newMode]||modeNames.private)[l] || (modeNames[newMode]||modeNames.private).ru;
    await ctx.editMessageText(
      l==='uz' ? '✅ Kirish rejimi o\'zgartirildi: '+mn
      :l==='en' ? '✅ Access mode changed: '+mn
      :'✅ Режим доступа изменён: '+mn
    );
    setTimeout(async()=>{try{await ctx.deleteMessage();}catch(_){}},2000);
  });

  // ── 2-bo'lim: Interfeys sozlamalari (hamma uchun) ──
  bot.action('sett_section_interface', async (ctx) => {
    await ctx.answerCbQuery();
    var uid   = String(ctx.from.id);
    var l     = lang(ctx);
    var fresh = await UserBot.findById(botConfig._id);
    var plan  = fresh ? (fresh.currentPlan||'free') : 'free';
    var maxP  = PLAN_LIMITS[plan].personas;
    var cnt   = await Persona.countDocuments({botId:botConfig._id,userTelegramId:uid,isActive:true});
    var text  = l==='uz'
      ? '👤 Interfeys sozlamalari\n\n🧠 Modellarim: '+cnt+'/'+(maxP===Infinity?'∞':maxP)+'\n🌐 Til: '+({uz:"O'zbek",ru:'Rus',en:'Ingliz'}[botConfig.language]||"O'zbek")
      : l==='en'
      ? '👤 Interface settings\n\n🧠 Personas: '+cnt+'/'+(maxP===Infinity?'∞':maxP)+'\n🌐 Language: '+({uz:'Uzbek',ru:'Russian',en:'English'}[botConfig.language]||'Uzbek')
      : '👤 Настройки интерфейса\n\n🧠 Персоны: '+cnt+'/'+(maxP===Infinity?'∞':maxP)+'\n🌐 Язык: '+({uz:'Узбекский',ru:'Русский',en:'Английский'}[botConfig.language]||'Узбекский');
    await ctx.editMessageText(text, Markup.inlineKeyboard([
      [Markup.button.callback(l==='uz'?"🧠 Modellarni ko'rish":l==='en'?'🧠 View personas':'🧠 Персоны','show_personas')],
      [Markup.button.callback(l==='uz'?'➕ Yangi model':l==='en'?'➕ New persona':'➕ Новая персона','create_persona'),
       Markup.button.callback(l==='uz'?'📋 Tayyor modellar':l==='en'?'📋 Ready':'📋 Готовые','builtin_personas')],
      [Markup.button.callback(t('btn_change_lang',l),'change_interface_lang')],
      [Markup.button.callback(l==='uz'?'🗑 Xotirani tozalash':l==='en'?'🗑 Clear memory':'🗑 Очистить память','confirm_clear_from_sett')],
      [Markup.button.callback('◀️ '+(l==='uz'?'Orqaga':l==='en'?'Back':'Назад'),'sett_main_back')]
    ]));
  });

  bot.action('sett_main_back', async (ctx) => {
    await ctx.answerCbQuery();
    await showSettingsMain(ctx, true);
  });

  // Tozalash — sozlamalardan
  bot.action('confirm_clear_from_sett', async (ctx) => {
    await ctx.answerCbQuery();
    var l = lang(ctx);
    await ctx.editMessageText(
      l==='uz'?'🗑 Asosiy xotirani tozalashni tasdiqlaysizmi?\n\n(Qaytarib bo\'lmaydi)':
      l==='en'?'🗑 Clear main memory? (Cannot be undone)':
      '🗑 Очистить основную память? (Нельзя отменить)',
      Markup.inlineKeyboard([
        [Markup.button.callback(l==='uz'?'✅ Ha, tozala':l==='en'?'✅ Yes, clear':'✅ Да, очистить','confirm_clear'),
         Markup.button.callback(l==='uz'?'❌ Bekor':l==='en'?'❌ Cancel':'❌ Отмена','sett_section_interface')]
      ])
    );
  });




  bot.action('show_personas', async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var list=await Persona.find({botId:botConfig._id,userTelegramId:uid,isActive:true});
    if (!list.length) return ctx.editMessageText("Hali model yo'q.\n\nQuyidan tayyor model qo'shing.",Markup.inlineKeyboard([
      [Markup.button.callback('📋 Tayyor modellar','builtin_personas')],
      [Markup.button.callback('➕ Yangi yaratish','create_persona')]
    ]));
    var text='Mening modellarim:\n\n';
    var btns=list.map(p=>{ text+=p.emoji+' '+p.name+' — '+p.description+'\n'; return [Markup.button.callback('💬 '+p.emoji+' '+p.name,'use_persona_'+p._id),Markup.button.callback('🗑','del_persona_'+p._id)]; });
    btns.push([Markup.button.callback('➕ Yangi yaratish','create_persona')]);
    btns.push([Markup.button.callback('📋 Tayyor modellar','builtin_personas')]);
    var l2=lang(ctx);
    btns.push([Markup.button.callback(t('btn_close',l2),'zone_close')]);
    await ctx.editMessageText(text,Markup.inlineKeyboard(btns));
  });

  bot.action('builtin_personas', async (ctx) => {
    await ctx.answerCbQuery();
    var text='Tayyor modellar:\n\n';
    BUILTIN_PERSONAS.forEach(p=>{ text+=p.emoji+' '+p.name+' — '+p.desc+'\n'; });
    var btns=BUILTIN_PERSONAS.map(p=>[Markup.button.callback("➕ "+p.emoji+' '+p.name+" qo'shish",'add_builtin_'+p.key)]);
    btns.push([Markup.button.callback('🔙 Orqaga','show_personas'),Markup.button.callback(t('btn_close',lang(ctx)),'zone_close')]);
    await ctx.editMessageText(text,Markup.inlineKeyboard(btns));
  });

  bot.action(/^add_builtin_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var bp=BUILTIN_PERSONAS.find(p=>p.key===ctx.match[1]);
    if (!bp) return ctx.editMessageText('Topilmadi.');
    var fresh=await UserBot.findById(botConfig._id);
    var plan=fresh?(fresh.currentPlan||'free'):'free';
    var cnt=await Persona.countDocuments({botId:botConfig._id,userTelegramId:uid,isActive:true});
    var chk=await checkPersonaLimit({currentPlan:plan},cnt,lang(ctx));
    if (!chk.allowed) return ctx.editMessageText(chk.msg,chk.keyboard||{});
    var ex=await Persona.findOne({botId:botConfig._id,userTelegramId:uid,name:bp.name,isActive:true});
    if (ex) return ctx.editMessageText(bp.emoji+' '+bp.name+' modeli allaqachon bor.');
    await Persona.create({botId:botConfig._id,userTelegramId:uid,name:bp.name,description:bp.desc,systemPrompt:bp.prompt,emoji:bp.emoji,isBuiltin:true});
    await ctx.editMessageText(bp.emoji+' '+bp.name+" modeli qo'shildi!\n\nIshlatish uchun: Sozlamalar → Modellarni ko'rish",
      Markup.inlineKeyboard([[Markup.button.callback("🧠 Modellarni ko'rish",'show_personas')]]));
  });

  bot.action(/^use_persona_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var p=await Persona.findOne({_id:ctx.match[1],botId:botConfig._id,userTelegramId:uid});
    if (!p) return ctx.editMessageText('Model topilmadi.');
    ctx.session=ctx.session||{}; ctx.session.activePersonaId=ctx.match[1];
    await ctx.editMessageText(p.emoji+' '+p.name+' modeli faollashtirildi!'+(p.description?'\n\n'+p.description:'')+'\n\nYozing!');
  });

  bot.action(/^del_persona_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var p=await Persona.findOne({_id:ctx.match[1],botId:botConfig._id,userTelegramId:uid});
    if (!p) return;
    await ctx.editMessageText(p.emoji+' '+p.name+" modelini o'chirasizmi?",Markup.inlineKeyboard([
      [Markup.button.callback("Ha, o'chir",'confirm_del_persona_'+ctx.match[1])],
      [Markup.button.callback('Bekor','show_personas')]
    ]));
  });

  bot.action(/^confirm_del_persona_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    await Persona.findOneAndUpdate({_id:ctx.match[1],botId:botConfig._id,userTelegramId:uid},{$set:{isActive:false}});
    if (ctx.session&&ctx.session.activePersonaId===ctx.match[1]) ctx.session.activePersonaId=null;
    await ctx.editMessageText("Model o'chirildi.");
  });

  bot.action('create_persona', async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var fresh=await UserBot.findById(botConfig._id);
    var plan=fresh?(fresh.currentPlan||'free'):'free';
    var cnt=await Persona.countDocuments({botId:botConfig._id,userTelegramId:uid,isActive:true});
    var chk=await checkPersonaLimit({currentPlan:plan},cnt,lang(ctx));
    if (!chk.allowed) return ctx.editMessageText(chk.msg,chk.keyboard||{});
    ctx.session=ctx.session||{}; ctx.session.step='persona_name'; ctx.session.newPersona={};
    await ctx.editMessageText('Yangi model yaratish\n\n1-qadam: Model nomini yozing.\nMisol: Biznes Maslahatchi, Shoir, Psixolog');
  });

  // ═══════════════════════════════════════════════
  // 🎭 PROMPTIZATSIYA (faqat egasi)
  // ═══════════════════════════════════════════════
  bot.hears(['🎭 Promptizatsiya','🎭 Промпты','🎭 Prompts'], async (ctx) => {
    await notifySessionSavedIfNeeded(ctx);
    if (String(ctx.from.id)!==String(botConfig.ownerTelegramId)) return ctx.reply("Bu bo'lim faqat bot egasi uchun.");
    await openZone(ctx,
      '🎭 Promptizatsiya\n\n━━━━━━━━━━━━━━━━━━━\n🧬 Asosiy prompt\n📖 Yo\'riqnoma\n👁 Joriy holat\n🔄 Asl holatga qaytarish\n━━━━━━━━━━━━━━━━━━━',
      Markup.inlineKeyboard([
        [Markup.button.callback('🧬 Asosiy promptni sozlash','prz_main')],
        [Markup.button.callback("👁 Joriy holatni ko'rish",'prz_view')],
        [Markup.button.callback("📖 Yo'riqnoma",'prz_guide')],
        [Markup.button.callback('🔄 Asl holatga qaytarish','prz_reset')],
        [Markup.button.callback('✕ Yopish','zone_close')]
      ])
    );
  });

  bot.action('prz_guide', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      "📖 Promptizatsiya yo'riqnomasi\n\n1. ROL → \"Sen tajribali maslahatchi sisan\"\n2. USLUB → \"Professional, lekin quruq emas\"\n3. CHEKLOV → \"Faqat moliya mavzularida javob ber\"",
      Markup.inlineKeyboard([[Markup.button.callback("🧬 Promptni sozlash",'prz_main')],[Markup.button.callback('◀️ Orqaga','prz_back')]])
    );
  });

  bot.action('prz_view', async (ctx) => {
    await ctx.answerCbQuery();
    var hasC = botConfig.extraInstructions && botConfig.extraInstructions.trim();
    if (!hasC) return ctx.editMessageText("👁 Joriy holat\n\nStandart sozlama — o'zgartirilmagan.",
      Markup.inlineKeyboard([[Markup.button.callback('🧬 Prompt sozlash','prz_main')],[Markup.button.callback('◀️ Orqaga','prz_back')]]) );
    var prev = botConfig.extraInstructions.slice(0,500)+(botConfig.extraInstructions.length>500?'...':'');
    await ctx.editMessageText('👁 Joriy prompt\n\n━━━━━━━━━━━━━━━━━━━\n'+prev+'\n━━━━━━━━━━━━━━━━━━━',
      Markup.inlineKeyboard([[Markup.button.callback("✏️ O'zgartirish",'prz_main')],[Markup.button.callback('🔄 Asl holatga','prz_reset')],[Markup.button.callback('◀️ Orqaga','prz_back')]]) );
  });

  bot.action('prz_main', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session=ctx.session||{}; ctx.session.step='prz_set_main';
    var cur = botConfig.extraInstructions && botConfig.extraInstructions.trim()
      ? '📌 Hozirgi:\n"'+botConfig.extraInstructions.slice(0,150)+(botConfig.extraInstructions.length>150?'..."':'"')+'\n\n' : '';
    await ctx.editMessageText('🧬 Asosiy promptni sozlash\n\n'+cur+'💡 Namuna:\n"Sen tajribali dasturlash murabbiyisan."\n\n✍️ Promptingizni yozing ↓',
      Markup.inlineKeyboard([[Markup.button.callback("📖 Yo'riqnoma",'prz_guide')],[Markup.button.callback('❌ Bekor qilish','prz_back')]]) );
  });

  bot.action('prz_reset', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("🔄 Asl holatga qaytarish\n\nMaxsus prompt o'chiriladi.\n\nDavom etasizmi?",
      Markup.inlineKeyboard([[Markup.button.callback('✅ Ha, qaytarish','prz_reset_confirm')],[Markup.button.callback('❌ Bekor','prz_back')]]) );
  });

  bot.action('prz_reset_confirm', async (ctx) => {
    await ctx.answerCbQuery();
    botConfig.extraInstructions='';
    await UserBot.findByIdAndUpdate(botConfig._id,{$set:{extraInstructions:''}});
    ctx.session=ctx.session||{}; ctx.session.step=null;
    await ctx.editMessageText('✅ Sozlama tiklandi! Bot standart holatda. 🔄');
    setTimeout(async()=>{ try{await bot.telegram.deleteMessage(ctx.chat.id,ctx.callbackQuery.message.message_id);}catch(_){} if(ctx.session)ctx.session.zoneMessageId=null; },2000);
  });

  bot.action('prz_back', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session=ctx.session||{}; ctx.session.step=null;
    await ctx.editMessageText('🎭 Promptizatsiya\n\n━━━━━━━━━━━━━━━━━━━\n🧬 Asosiy prompt\n📖 Yo\'riqnoma\n👁 Joriy holat\n🔄 Asl holatga qaytarish\n━━━━━━━━━━━━━━━━━━━',
      Markup.inlineKeyboard([
        [Markup.button.callback('🧬 Asosiy promptni sozlash','prz_main')],
        [Markup.button.callback("👁 Joriy holatni ko'rish",'prz_view')],
        [Markup.button.callback("📖 Yo'riqnoma",'prz_guide')],
        [Markup.button.callback('🔄 Asl holatga qaytarish','prz_reset')],
        [Markup.button.callback('✕ Yopish','zone_close')]
      ])
    );
  });

  // ═══════════════════════════════════════════════
  // 🎨 PREZENTATSIYA
  // ═══════════════════════════════════════════════
  var IMG_COUNT = {5:4,7:5,10:7,12:10,15:13};

  bot.hears(['🎨 Prezentatsiya','🎨 Презентация','🎨 Presentation'], async (ctx) => {
    await notifySessionSavedIfNeeded(ctx);
    ctx.session=ctx.session||{}; ctx.session.ppt=null; ctx.session.step=null;
    var fresh = await getFreshConfig();
    var plan  = fresh.currentPlan||'free';
    var l     = lang(ctx);
    var canPro = PLAN_LIMITS[plan].pptPro>0;
    var hdr = (l==='uz'?'🎨 Prezentatsiya yaratish\n\n':l==='en'?'🎨 Create Presentation\n\n':'🎨 Создание Презентации\n\n')+
      (canPro?t('ppt_mode_pro',l)+'\n\n':t('ppt_mode_simple',l)+'\n\n')+t('ppt_question',l);
    await openZone(ctx,hdr,pptMenu(plan,l));
  });

  bot.action('ppt_diff', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('ℹ️ Oddiy vs Professional\n\n📄 Oddiy: Oq fon, standart dizayn\n⭐ Professional: Rang sxema, gradient, rasmlar',
      Markup.inlineKeyboard([[Markup.button.callback('📄 Oddiy boshlash','ppt_start_simple')],[Markup.button.callback('◀️ Orqaga','ppt_back')]]) );
  });

  // FIX #3: ppt_need_sub — alohida ctx.reply (zone editMessage bilan to'qnashmaydi)
  bot.action('ppt_need_sub', async (ctx) => {
    await ctx.answerCbQuery();
    var l=lang(ctx);
    var msg=l==='uz'?'⭐ Pro obuna kerak\n\nStarter yoki undan yuqori obuna oling.':l==='en'?'⭐ Pro subscription needed\n\nGet Starter or higher.':'⭐ Нужна Pro подписка\n\nОформите Starter или выше.';
    await ctx.reply(msg,Markup.inlineKeyboard([
      [Markup.button.callback(t('btn_subscribe',l),'sub_show_plans')],
      [Markup.button.callback('📄 Oddiy yaratish','ppt_start_simple')]
    ]));
  });

  bot.action('ppt_back', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session=ctx.session||{}; ctx.session.ppt=null; ctx.session.step=null;
    var fresh=await getFreshConfig();
    var plan=fresh.currentPlan||'free';
    var l=lang(ctx);
    await ctx.editMessageText('🎨 Prezentatsiya yaratish\n\n'+t('ppt_question',l),pptMenu(plan,l));
  });

  bot.action('ppt_start_simple', async (ctx) => {
    await ctx.answerCbQuery();
    var fresh=await getFreshConfig();
    var chk=await checkPptLimit(fresh,lang(ctx));
    if (!chk.allowed) return ctx.editMessageText(chk.msg,chk.keyboard||{});
    ctx.session=ctx.session||{}; ctx.session.ppt={mode:'simple'}; ctx.session.step='ppt_topic';
    await ctx.editMessageText('📄 Oddiy prezentatsiya\n\nMavzu nima haqida?\n\n💡 Misol: Fotosintez, AI, Marketing\n\n'+t('ppt_topic_prompt',lang(ctx)));
  });

  bot.action('ppt_start_pro', async (ctx) => {
    await ctx.answerCbQuery();
    var fresh=await getFreshConfig();
    var plan=fresh.currentPlan||'free';
    if (PLAN_LIMITS[plan].pptPro===0) return ctx.editMessageText(t('limit_reached_ppt_pro',lang(ctx),plan),Markup.inlineKeyboard([[Markup.button.callback(t('btn_subscribe',lang(ctx)),'sub_show_plans')]]));
    var chk=await checkPptProLimit(fresh,lang(ctx));
    if (!chk.allowed) return ctx.editMessageText(chk.msg,chk.keyboard||{});
    ctx.session=ctx.session||{}; ctx.session.ppt={mode:'pro'}; ctx.session.step='ppt_topic';
    await ctx.editMessageText('⭐ Professional prezentatsiya\n\nRang sxemasini tanlang:',Markup.inlineKeyboard([
      [Markup.button.callback("🔵 Ko'k",'ppt_theme_blue'),Markup.button.callback("🟢 Yashil",'ppt_theme_green')],
      [Markup.button.callback('🔴 Qizil','ppt_theme_red'),Markup.button.callback('🌊 Navy','ppt_theme_navy')],
      [Markup.button.callback('💜 Binafsha','ppt_theme_purple')],
      [Markup.button.callback('🤖 Avtomatik','ppt_theme_auto')]
    ]));
  });

  bot.action(/^ppt_theme_(blue|green|red|navy|purple|auto)$/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session=ctx.session||{}; ctx.session.ppt=ctx.session.ppt||{mode:'pro'};
    ctx.session.ppt.theme=ctx.match[1]; ctx.session.step='ppt_topic';
    var n={blue:"Ko'k",green:'Yashil',red:'Qizil',navy:'Navy',purple:'Binafsha',auto:'Avtomatik'};
    await ctx.editMessageText('⭐ '+(n[ctx.match[1]]||'Avtomatik')+' rang tanlandi ✓\n\nMavzuni yozing:\n\n💡 Misol: AI, Marketing\n\n↓ Mavzuni yozing');
  });

  bot.action(/^ppt_n_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var n=parseInt(ctx.match[1]);
    ctx.session=ctx.session||{}; ctx.session.ppt=ctx.session.ppt||{};
    ctx.session.ppt.slideCount=n; ctx.session.step=null;
    await ctx.editMessageText('Mavzu: '+(ctx.session.ppt.topic||'')+'\nSlaydlar: '+n+' ta ✓\n\nReja qanday?',Markup.inlineKeyboard([
      [Markup.button.callback('🤖 AI avtomatik reja','ppt_plan_auto')],
      [Markup.button.callback("✍️ O'z rejamni kiritaman",'ppt_plan_manual')]
    ]));
  });

  bot.action('ppt_plan_auto', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session=ctx.session||{}; ctx.session.step='ppt_description';
    await ctx.editMessageText("Tasavvurni yozing:\n\n💡 \"Talabalar uchun, jadvallar bilan\"",
      Markup.inlineKeyboard([[Markup.button.callback("⏭ Tasavvursiz davom",'ppt_desc_skip')]]));
  });

  bot.action('ppt_plan_manual', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session=ctx.session||{}; ctx.session.step='ppt_manual_plan';
    var n=(ctx.session.ppt||{}).slideCount||5;
    await ctx.editMessageText("Rejangizni kiriting ✍️\n\nHar band — yangi qatorda ("+(n-2)+" ta):\n\n💡 Misol:\nMavzu nima\nAsosiy qism\nXulosa");
  });

  async function generatePresentation(ctx, desc) {
    var ppt=ctx.session&&ctx.session.ppt||{};
    if (ppt.mode==='pro') {
      ctx.session.step='ppt_images'; ctx.session.ppt.description=desc;
      var imgMax=IMG_COUNT[ppt.slideCount||5]||4;
      await ctx.reply('🖼 Rasmlar (ixtiyoriy)\n\nMaksimal: '+imgMax+' ta rasm',
        Markup.inlineKeyboard([[Markup.button.callback("⏭ Rasmsiz davom",'ppt_skip_images')]]) );
      ctx.session.ppt.images=[]; ctx.session.ppt.imgMax=imgMax; return;
    }
    await buildAndSendPptx(ctx,desc,[]);
  }

  async function buildAndSendPptx(ctx, desc, images) {
    var ppt=ctx.session&&ctx.session.ppt||{};
    var isPro=ppt.mode==='pro';
    var n=ppt.slideCount||5;
    var topic=ppt.topic||'';
    var imgPaths=images.map(img=>typeof img==='string'?img:(img.path||img)).filter(Boolean);
    var l=lang(ctx);
    var slideTxt=l==='uz'?' ta slayd':l==='en'?' slides':' слайдов';
    await ctx.reply((l==='uz'?'🎨 Prezentatsiya yaratilmoqda...':l==='en'?'🎨 Creating presentation...':'🎨 Создание презентации...')+'\n\n📌 '+topic+'\n📊 '+n+slideTxt+(isPro?'  ⭐ Pro':'')+(imgPaths.length?'  🖼 '+imgPaths.length+' ta rasm':'')+'\n\nAI kontent yozmoqda... ⏳');
    try {
      var aiPrompt=buildPptPrompt({topic,slideCount:n,plan:ppt.plan||null,description:desc||'',language:botConfig.language||'uz',isPro});
      var rawText=(await getPptAIResponse(aiPrompt)||'').replace(/<[^>]+>/g,' ').replace(/```[\w]*\n?/g,'').trim();
      var si=rawText.indexOf('['),ei=rawText.lastIndexOf(']');
      if (si===-1||ei===-1||ei<=si) {
        rawText=((await getPptAIResponse('FAQAT JSON massiv qaytargil:\n'+aiPrompt))||'').replace(/<[^>]+>/g,' ').replace(/```[\w]*\n?/g,'').trim();
        si=rawText.indexOf('['); ei=rawText.lastIndexOf(']');
      }
      if (si===-1||ei===-1) throw new Error("AI JSON qaytarmadi. Mavzuni o'zgartirib qayta urining.");
      var jsonStr=rawText.slice(si,ei+1).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/[ \t]{2,}/g,' ').replace(/ +\n/g,'\n').replace(/,(\s*[}\]])/g,'$1').replace(/([{,]\s*)(\w+)\s*:/g,'$1"$2":').replace(/:\s*'([^']*?)'/g,': "$1"');
      var slides; try{slides=JSON.parse(jsonStr);}catch(e){slides=JSON.parse(jsonStr.split('\n').map(l=>l.trim()).join('\n'));}
      if (!Array.isArray(slides)||slides.length<2) throw new Error('Slaydlar yetarli emas. Qayta urining.');
      if (slides.length!==n) {
        var endSl=slides[slides.length-1]; var hasE=endSl&&endSl.isEnd;
        if(hasE)slides.pop();
        while(slides.length<n-1){
          var prevSl=slides[slides.length-1]||{};
          var fbNum=slides.length;
          // Avvalgi slayd mavzusiga bog'liq kontentni kengaytiradi
          slides.push({
            type:'text',
            title:(prevSl.title?prevSl.title+' — davomi':(fbNum+"-bo'lim")),
            body:topic?(topic+' mavzusining muhim jihatlari va amaliy ko\'llanilishi ko\'rib chiqiladi.'):'Bu bo\'limda asosiy jihatlar tahlil qilinadi.',
            points:["Asosiy tushunchalar va ta'riflar","Amaliy misollar va qo'llanilishi","Muhim xulosalar"]
          });
        }
        if(hasE||slides.length===n-1)slides.push(endSl||{title:'Xulosa',summary:'Prezentatsiya yakunlandi.',isEnd:true});
        while(slides.length>n)slides.splice(slides.length-2,1);
      }
      var filePath=await generatePptx(slides,{professional:isPro,topic,theme:(ppt.theme&&ppt.theme!=='auto')?ppt.theme:null,images:imgPaths.map(p=>({path:p,topic:''}))});
      var stat=fs.statSync(filePath);
      if (stat.size>25*1024*1024){fs.unlinkSync(filePath);throw new Error('Fayl 25 MB dan oshdi.');}
      var fn=topic.replace(/[^\w\u0400-\u04FF ]/g,'_').slice(0,25).trim()+'.pptx';
      var sentDoc=await ctx.replyWithDocument({source:filePath,filename:fn},{caption:'🎉 Tayyor! '+(isPro?'⭐ Professional':'📄 Oddiy')+' prezentatsiya\n\n📌 '+topic+'\n📊 '+slides.length+' ta slayd'+(imgPaths.length?'  🖼 '+imgPaths.length+' ta rasm':'')+'\n\nPowerPoint yoki Google Slides da oching. 🚀'});
      // Telegram file_id DB ga saqlanadi — keyingi yuborishlarda tez ishlaydi
      try {
        var tgFileId=sentDoc&&sentDoc.document&&sentDoc.document.file_id;
        if (tgFileId) {
          await PptFile.create({
            botId:botConfig._id, userTelegramId:String(ctx.from.id),
            topic:topic, fileName:fn, fileId:tgFileId,
            isPro:isPro, slideCount:slides.length
          });
        }
      } catch(saveErr){ console.warn('[PPT] file_id saqlash xato:',saveErr.message); }
      try{fs.unlinkSync(filePath);}catch(_){}
      imgPaths.forEach(p=>{try{fs.unlinkSync(p);}catch(_){}});
      var pptUid=String(ctx.from.id);
      if (pptUid===String(botConfig.ownerTelegramId)) {
        if (isPro){await UserBot.findByIdAndUpdate(botConfig._id,{$inc:{monthlyPptPro:1}}); botConfig.monthlyPptPro=(botConfig.monthlyPptPro||0)+1;}
        else{await UserBot.findByIdAndUpdate(botConfig._id,{$inc:{monthlyPpt:1}}); botConfig.monthlyPpt=(botConfig.monthlyPpt||0)+1;}
      }
      ctx.session.ppt=null; ctx.session.step=null; await clearZone(ctx);
    } catch(err) {
      console.error('[PPT] Xato:',err.message);
      ctx.session.ppt=null; ctx.session.step=null;
      await openZone(ctx,'❌ Xatolik: '+err.message+'\n\nQayta urinib ko\'ring.',Markup.inlineKeyboard([[Markup.button.callback('🔄 Qaytadan','ppt_back'),Markup.button.callback('✕ Yopish','zone_close')]]));
    }
    images.forEach(p=>{try{fs.unlinkSync(p);}catch(_){}});
  }

  bot.action('ctx_cancel_wizard', async (ctx) => { await ctx.answerCbQuery(); ctx.session=ctx.session||{}; ctx.session.step=null; ctx.session.ppt=null; ctx.session.newPersona=null; await ctx.editMessageText("Bekor qilindi ✓"); });
  bot.action('ctx_send_to_ai', async (ctx) => { await ctx.answerCbQuery(); ctx.session=ctx.session||{}; ctx.session.step=null; ctx.session.ppt=null; ctx.session.newPersona=null; await ctx.editMessageText("Jarayon bekor qilindi ✓\n\nXabaringizni yozing. 💬"); });
  bot.action(/^ctx_use_for_wizard_/, async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText('Tushunarli ✓  Davom eting!'); });

  bot.on('photo', async (ctx) => {
    var step = ctx.session && ctx.session.step;

    if (step!=='ppt_images') { var lp=lang(ctx); return ctx.reply(lp==='uz'?'Rasmni tavsiflab yozing.':lp==='en'?'Please describe the image in text.':'Опишите изображение текстом.'); }
    var ppt=ctx.session.ppt||{}; var images=ppt.images||[]; var imgMax=ppt.imgMax||4;
    if (images.length>=imgMax) return ctx.reply('Maksimal rasm soni: '+imgMax+' ta.',Markup.inlineKeyboard([[Markup.button.callback('✅ Tayyor','ppt_images_done')]]));
    var fileId=ctx.message.photo[ctx.message.photo.length-1].file_id;
    var fileUrl=await ctx.telegram.getFileLink(fileId);
    var tmpPath=path.join(os.tmpdir(),'ppt_img_'+Date.now()+'_'+images.length+'.jpg');
    var fetch2=require('node-fetch'); var resp=await fetch2(fileUrl.href);
    fs.writeFileSync(tmpPath,await resp.buffer());
    images.push(tmpPath); ctx.session.ppt.images=images;
    var rem=imgMax-images.length;
    await ctx.reply('🖼 Rasm qabul qilindi ('+images.length+'/'+imgMax+')\n\n'+(rem>0?rem+" ta ko'proq yuborishingiz mumkin yoki \"Tayyor\" bosing.":'✅ Maksimal!'),
      Markup.inlineKeyboard([[Markup.button.callback('✅ Tayyor, prezentatsiya yarat','ppt_images_done')],[Markup.button.callback('⏭ Rasmsiz davom','ppt_skip_images')]]) );
  });

  bot.action('ppt_images_done', async (ctx) => {
    await ctx.answerCbQuery();
    var ppt=(ctx.session&&ctx.session.ppt)||{};
    ctx.session.step=null;
    // setImmediate — Telegraf timeout (90s) dan chiqib ketadi
    setImmediate(function(){ buildAndSendPptx(ctx,ppt.description||'',ppt.images||[]); });
  });
  bot.action('ppt_skip_images', async (ctx) => {
    await ctx.answerCbQuery();
    var ppt=(ctx.session&&ctx.session.ppt)||{};
    ctx.session.step=null;
    setImmediate(function(){ buildAndSendPptx(ctx,ppt.description||'',[]); });
  });
  bot.action('ppt_desc_skip', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session=ctx.session||{};
    ctx.session.step=null;
    setImmediate(function(){ generatePresentation(ctx,''); });
  });

  // ═══════════════════════════════════════════════
  // 📰 YANGILIKLAR
  // ═══════════════════════════════════════════════
  var UB_NEWS_PAGE=10;
  async function showUserNewsPage(ctx,page,edit) {
    var total=await News.countDocuments({isActive:{$ne:false}});
    var l=lang(ctx);
    if (!total) { var em=t('news_empty',l); if(edit)return ctx.editMessageText(em).catch(()=>ctx.reply(em)); return ctx.reply(em); }
    var tp=Math.ceil(total/UB_NEWS_PAGE); if(page<0)page=0; if(page>=tp)page=tp-1;
    var list=await News.find({isActive:{$ne:false}}).sort({createdAt:-1}).skip(page*UB_NEWS_PAGE).limit(UB_NEWS_PAGE);
    var hdr=(l==='uz'?'Yangiliklar':l==='en'?'News':'Новости')+' ('+total+' ta)';
    if(tp>1)hdr+='  |  '+(page+1)+'/'+tp;
    hdr+='\n\n'+(l==='uz'?'Birorta tanlang:':l==='en'?'Select one:':'Выберите:');
    var btns=list.map(n=>[Markup.button.callback((n.title||"Sarlavha yo'q")+'  •  '+new Date(n.createdAt).toLocaleDateString('ru-RU'),'ub_nws_'+n._id)]);
    var nav=[];
    if(page>0) nav.push(Markup.button.callback('◀️','ub_nws_pg_'+(page-1)));
    if(page<tp-1) nav.push(Markup.button.callback('▶️','ub_nws_pg_'+(page+1)));
    if(nav.length)btns.push(nav);
    if(edit)return ctx.editMessageText(hdr,Markup.inlineKeyboard(btns)).catch(()=>ctx.reply(hdr,Markup.inlineKeyboard(btns)));
    return ctx.reply(hdr,Markup.inlineKeyboard(btns));
  }

  bot.hears(['📰 Yangiliklar','📰 Новости','📰 News'], async (ctx) => {
    await notifySessionSavedIfNeeded(ctx);
    try{await showUserNewsPage(ctx,0,false);}catch(e){await ctx.reply("Yangiliklar yuklanmadi.").catch(()=>{});}
  });

  // TARTIB MUHIM: pg_ va back AVVAL, keyin id regex
  bot.action(/^ub_nws_pg_(\d+)$/, async (ctx) => { await ctx.answerCbQuery(); await showUserNewsPage(ctx,parseInt(ctx.match[1]),true); });
  bot.action('ub_nws_back', async (ctx) => { await ctx.answerCbQuery(); await showUserNewsPage(ctx,0,true); });
  bot.action(/^ub_nws_([a-f0-9]{24})$/, async (ctx) => {
    await ctx.answerCbQuery();
    var n=await News.findById(ctx.match[1]);
    if (!n) return ctx.editMessageText('Topilmadi.').catch(()=>{});
    var text=(n.title||'')+'\n'+new Date(n.createdAt).toLocaleDateString('ru-RU')+'\n\n'+(n.body||'');
    if (n.footer&&n.footer.trim()) text+='\n\n'+n.footer.trim();
    var back=Markup.inlineKeyboard([[Markup.button.callback('◀️ Orqaga','ub_nws_back')]]);
    try {
      if(n.mediaId&&n.mediaType==='photo') await ctx.replyWithPhoto(n.mediaId,{caption:text,reply_markup:back.reply_markup});
      else if(n.mediaId&&n.mediaType==='video') await ctx.replyWithVideo(n.mediaId,{caption:text,reply_markup:back.reply_markup});
      else await ctx.editMessageText(text,back).catch(()=>ctx.reply(text,back));
    }catch(e){await ctx.reply(text,back).catch(()=>{});}
  });

  // ═══════════════════════════════════════════════
  // ⭐ OBUNA TIZIMI
  // ═══════════════════════════════════════════════
  bot.hears(['⭐ Obuna','⭐ Подписка','⭐ Subscribe'], async (ctx) => {
    await notifySessionSavedIfNeeded(ctx);
    if (String(ctx.from.id)!==String(botConfig.ownerTelegramId)) return;
    await showSubMenu(ctx,false);
  });

  bot.action('sub_show_plans', async (ctx) => {
    await ctx.answerCbQuery();
    // Faqat egasi — boshqa foydalanuvchilar obuna menyusiga kira olmaydi
    if (String(ctx.from.id) !== String(botConfig.ownerTelegramId)) {
      return ctx.answerCbQuery("Bu bo'lim faqat bot egasi uchun.", true);
    }
    await showSubMenu(ctx, true);
  });

  async function showSubMenu(ctx,edit) {
    var uid=String(ctx.from.id); var l=lang(ctx);
    var fresh=await UserBot.findById(botConfig._id);
    var plan=fresh?(fresh.currentPlan||'free'):'free';
    var sub=await Subscription.findOne({telegramId:uid,status:{$in:['active','grace']}}).sort({activatedAt:-1});
    var msgText;
    if (!sub||plan==='free') {
      msgText=t('sub_current_free',l);
    } else if (sub.status==='grace') {
      msgText=t('sub_current_grace',l,PLAN_NAMES[sub.plan]||sub.plan,sub.graceEndsAt?sub.graceEndsAt.toLocaleDateString('ru-RU'):'—');
    } else {
      var dl=sub.expiresAt?Math.ceil((sub.expiresAt-new Date())/(1000*60*60*24)):0;
      msgText=t('sub_current_active',l,PLAN_NAMES[sub.plan]||sub.plan,sub.expiresAt?sub.expiresAt.toLocaleDateString('ru-RU'):'—',dl);
    }
    var btns=[
      [Markup.button.callback('⭐ Starter — 19,000/oy','sub_select_plan_starter')],
      [Markup.button.callback('🚀 Pro — 39,000/oy','sub_select_plan_pro')],
      [Markup.button.callback('💎 Premium — 59,000/oy','sub_select_plan_premium')],
      [Markup.button.callback(l==='uz'?'ℹ️ Tariflar taqqoslovi':l==='en'?'ℹ️ Compare plans':'ℹ️ Сравнение тарифов','sub_compare')],
      [Markup.button.callback(t('btn_close',l),'zone_close')]
    ];
    if (edit) await updateZone(ctx,msgText,Markup.inlineKeyboard(btns));
    else       await openZone(ctx,msgText,Markup.inlineKeyboard(btns));
  }

  bot.action('sub_compare', async (ctx) => {
    await ctx.answerCbQuery();
    var l=lang(ctx);
    await ctx.editMessageText(t('sub_compare',l),{
      parse_mode:'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('⭐ Starter','sub_select_plan_starter'),
         Markup.button.callback('🚀 Pro','sub_select_plan_pro'),
         Markup.button.callback('💎 Premium','sub_select_plan_premium')],
        [Markup.button.callback('◀️ '+(l==='uz'?'Orqaga':l==='en'?'Back':'Назад'),'sub_show_plans')]
      ]).reply_markup
    });
  });

  bot.action(/^sub_select_plan_(starter|pro|premium)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var selPlan=ctx.match[1]; var uid=String(ctx.from.id); var l=lang(ctx);
    var pending=await Subscription.findOne({telegramId:uid,status:'pending'});
    if (pending) return ctx.editMessageText(t('sub_pending_exists',l,pending.uniqueId));
    var uniqueId=await generateUniqueId(selPlan);
    var price=PLAN_PRICES[selPlan].discounted;
    var planName=PLAN_NAMES[selPlan];
    await Subscription.create({telegramId:uid,firstName:ctx.from.first_name||'',username:ctx.from.username||'',plan:selPlan,uniqueId,price,durationMonths:1,status:'pending'});
    await ctx.editMessageText(t('sub_order_created',l,planName,price,uniqueId,_cardNumber||"Admin dan so'rang"));
    var payLink=subscribeLink(selPlan,uniqueId);
    var payText=t('sub_order_text',l,planName,uniqueId);
    await ctx.reply(
      (l==='uz'?"📋 Quyidagi tugmani bosing — admin chatiga o'ting va tolov qilganingizni bildiring:":l==='en'?'📋 Press the button below — go to admin chat and confirm your payment:':'📋 Нажмите кнопку ниже — перейдите в чат админа и подтвердите оплату:')+'\n\n"'+payText+'"',
      Markup.inlineKeyboard([[Markup.button.url(t('btn_sub_pay',l),payLink)]])
    );
    try {
      await bot.telegram.sendMessage(process.env.SUPER_ADMIN_ID,
        "⭐ Yangi obuna so'rovi!\n\nFoydalanuvchi: "+(ctx.from.first_name||'')+(ctx.from.username?' (@'+ctx.from.username+')':'')+'\nTelegram ID: '+uid+'\nTarif: '+planName+'\nID: '+uniqueId+"\nNarx: "+price+" som/oy\n\nTasdiqlash: /activate "+uniqueId,
        {reply_markup:Markup.inlineKeyboard([[Markup.button.callback('✅ Tasdiqlash — '+uniqueId,'adm_activate_'+uniqueId)]]).reply_markup}
      );
    }catch(e){console.error('[Sub] Admin ga xabar xato:',e.message);}
  });

  bot.action(/^adm_activate_(.+)$/, async (ctx) => {
    if (String(ctx.from.id)!==String(process.env.SUPER_ADMIN_ID)) return ctx.answerCbQuery('Faqat admin!');
    await ctx.answerCbQuery('Tasdiqlanmoqda...');
    await activateSubscriptionById(ctx,ctx.match[1]);
  });

  async function activateSubscriptionById(ctx, uniqueId) {
    try {
      var sub=await Subscription.findOne({uniqueId,status:'pending'});
      if (!sub) { await ctx.editMessageText('❌ '+uniqueId+" — topilmadi yoki allaqachon faol."); return null; }
      var now=new Date();
      var expiresAt=new Date(now); expiresAt.setMonth(expiresAt.getMonth()+(sub.durationMonths||1));
      var graceEndsAt=new Date(expiresAt); graceEndsAt.setDate(graceEndsAt.getDate()+GRACE_DAYS);
      sub.status='active'; sub.activatedAt=now; sub.expiresAt=expiresAt; sub.graceEndsAt=graceEndsAt;
      sub.notified7d=false; sub.notified1d=false;
      await sub.save();
      await UserBot.findByIdAndUpdate(botConfig._id,{$set:{currentPlan:sub.plan}});
      // RAM yangilash — shu bot instance
      botConfig.currentPlan=sub.plan;
      var expires=expiresAt.toLocaleDateString('ru-RU');
      var planName=PLAN_NAMES[sub.plan]||sub.plan;
      try{ await bot.telegram.sendMessage(sub.telegramId,t('sub_activated','uz',planName,expires)); }catch(e){}
      await ctx.editMessageText('✅ '+uniqueId+' faollashtirildi!\n\nFoydalanuvchi: '+(sub.firstName||'')+(sub.username?' @'+sub.username:'')+'\nTarif: '+planName+'\nMuddat: '+expires+' gacha');
      return sub;
    } catch(err) { console.error('[Sub] Aktivlash xato:',err.message); await ctx.editMessageText('❌ Xato: '+err.message); return null; }
  }

  // ═══════════════════════════════════════════════
  // MEDIA HANDLERLARI
  // ═══════════════════════════════════════════════

  // ═══════════════════════════════════════════════
  // 📁 FAYLLARIM — AI Suhbatlar va Prezentatsiyalar
  // ═══════════════════════════════════════════════
  bot.hears(['📁 Fayllarim','📁 Мои файлы','📁 My Files'], async (ctx) => {
    await notifySessionSavedIfNeeded(ctx);
    var uid=String(ctx.from.id);
    var l=lang(ctx);
    var chatCount = await ChatHistory.findOne({botId:botConfig._id,userTelegramId:uid});
    var chatMsgs  = chatCount ? Math.floor((chatCount.messages||[]).length/2) : 0;
    var sessCount = await ChatSession.countDocuments({botId:botConfig._id,userTelegramId:uid,isActive:true});
    var pptCount  = await PptFile.countDocuments({botId:botConfig._id,userTelegramId:uid});
    var header = l==='uz'
      ? '📁 Mening Fayllarim\n\n💬 AI Suhbatlar: '+chatMsgs+' ta xabar, '+sessCount+' ta fayl\n🎨 Prezentatsiyalar: '+pptCount+' ta\n\nQaysi bo\'limni ochmoqchisiz?'
      : l==='en'
      ? '📁 My Files\n\n💬 AI Chats: '+chatMsgs+' messages, '+sessCount+' files\n🎨 Presentations: '+pptCount+'\n\nWhich section?'
      : '📁 Мои файлы\n\n💬 AI Беседы: '+chatMsgs+' сообщений, '+sessCount+' файлов\n🎨 Презентации: '+pptCount+'\n\nКакой раздел?';
    await openZone(ctx, header, Markup.inlineKeyboard([
      [Markup.button.callback(t('btn_ai_chats',l),'files_ai_chats')],
      [Markup.button.callback(t('btn_presentations',l),'files_ppts')],
      [Markup.button.callback(t('btn_close',l),'zone_close')]
    ]));
  });

  // ── AI SUHBATLAR ──
  bot.action('files_ai_chats', async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var l=lang(ctx);
    var hist = await ChatHistory.findOne({botId:botConfig._id,userTelegramId:uid});
    var sessions = await ChatSession.find({botId:botConfig._id,userTelegramId:uid,isActive:true}).sort({updatedAt:-1}).limit(15);
    var mainMsgs = hist ? Math.floor((hist.messages||[]).length/2) : 0;
    var header = l==='uz'
      ? '💬 AI Suhbatlar\n\nAsosiy xotira: '+mainMsgs+' ta suhbat\nSuhbat fayllari: '+sessions.length+' ta\n\nBirorini tanlang — yuklab oling:'
      : l==='en'
      ? '💬 AI Chats\n\nMain memory: '+mainMsgs+' messages\nSession files: '+sessions.length+'\n\nSelect one to download:'
      : '💬 AI Беседы\n\nГлавная память: '+mainMsgs+' сообщений\nФайлы бесед: '+sessions.length+'\n\nВыберите для скачивания:';
    var btns = [];
    // Asosiy xotira
    if (mainMsgs > 0) {
      var mainLabel = l==='uz' ? '📋 Asosiy suhbat ('+mainMsgs+' ta)' : l==='en' ? '📋 Main chat ('+mainMsgs+')' : '📋 Главный чат ('+mainMsgs+')';
      btns.push([Markup.button.callback(mainLabel, 'dl_main_chat')]);
    }
    // Suhbat fayllari
    sessions.forEach(function(s) {
      var cnt = Math.floor((s.messages||[]).length/2);
      var d   = new Date(s.updatedAt).toLocaleDateString('ru-RU');
      btns.push([Markup.button.callback('📄 '+s.title+' ('+cnt+') — '+d, 'dl_session_'+s._id)]);
    });
    btns.push([Markup.button.callback('◀️ '+(l==='uz'?'Orqaga':l==='en'?'Back':'Назад'), 'files_back')]);
    await ctx.editMessageText(header, Markup.inlineKeyboard(btns));
  });

  // Asosiy suhbatni yuklash
  bot.action('dl_main_chat', async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var l=lang(ctx);
    var hist = await ChatHistory.findOne({botId:botConfig._id,userTelegramId:uid});
    if (!hist||!hist.messages||!hist.messages.length) {
      return ctx.editMessageText(l==='uz'?'Suhbat tarixi bo\'sh.':l==='en'?'Chat history is empty.':'История пуста.');
    }
    var text = _buildChatMarkdown(hist.messages, botConfig.botName, l);
    var buf  = Buffer.from(text, 'utf8');
    var fname = 'suhbat_'+new Date().toISOString().slice(0,10)+'.txt';
    await ctx.replyWithDocument({source:buf, filename:fname},
      {caption: l==='uz'?'💬 Asosiy suhbat tarixi':l==='en'?'💬 Main chat history':'💬 История главного чата'});
  });

  // Suhbat faylini yuklash
  bot.action(/^dl_session_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var l=lang(ctx);
    var sess = await ChatSession.findOne({_id:ctx.match[1],botId:botConfig._id,userTelegramId:uid});
    if (!sess||!sess.messages||!sess.messages.length) {
      return ctx.answerCbQuery(l==='uz'?'Suhbat bo\'sh.':l==='en'?'Session is empty.':'Беседа пуста.', true);
    }
    var text = _buildChatMarkdown(sess.messages, botConfig.botName, l, sess.title);
    var buf  = Buffer.from(text, 'utf8');
    var fname = sess.title.replace(/[^\w\u0400-\u04FF ]/g,'_').slice(0,20)+'.txt';
    await ctx.replyWithDocument({source:buf, filename:fname},
      {caption: '💬 '+sess.title});
  });

  // ── PREZENTATSIYALAR ──
  bot.action('files_ppts', async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var l=lang(ctx);
    var ppts = await PptFile.find({botId:botConfig._id,userTelegramId:uid}).sort({createdAt:-1}).limit(20);
    if (!ppts.length) {
      var emptyMsg = l==='uz'?'🎨 Hali prezentatsiya yaratilmagan.\n\nYangi yaratish uchun 🎨 Prezentatsiya menyusiga o\'ting.'
        :l==='en'?'🎨 No presentations yet.\n\nGo to 🎨 Presentation menu to create one.'
        :'🎨 Презентаций пока нет.\n\nПерейдите в 🎨 Презентация для создания.';
      return ctx.editMessageText(emptyMsg, Markup.inlineKeyboard([[Markup.button.callback('◀️ '+(l==='uz'?'Orqaga':l==='en'?'Back':'Назад'),'files_back')]]));
    }
    var header = l==='uz'?'🎨 Prezentatsiyalaringiz ('+ppts.length+' ta):\n\nYuklash uchun tanlang:'
      :l==='en'?'🎨 Your presentations ('+ppts.length+'):\n\nSelect to download:'
      :'🎨 Ваши презентации ('+ppts.length+'):\n\nВыберите для скачивания:';
    var btns = ppts.map(function(p) {
      var d   = new Date(p.createdAt).toLocaleDateString('ru-RU');
      var tag = p.isPro ? '⭐ ' : '📄 ';
      var lbl = tag+p.topic.slice(0,22)+(p.topic.length>22?'..':'')+'  ('+p.slideCount+') — '+d;
      return [Markup.button.callback(lbl, 'dl_ppt_'+p._id)];
    });
    btns.push([Markup.button.callback('◀️ '+(l==='uz'?'Orqaga':l==='en'?'Back':'Назад'), 'files_back')]);
    await ctx.editMessageText(header, Markup.inlineKeyboard(btns));
  });

  // PPT yuklash — Telegram file_id orqali
  bot.action(/^dl_ppt_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var l=lang(ctx);
    var ppt = await PptFile.findOne({_id:ctx.match[1],botId:botConfig._id,userTelegramId:uid});
    if (!ppt) return ctx.answerCbQuery(l==='uz'?'Topilmadi.':l==='en'?'Not found.':'Не найдено.', true);
    try {
      await ctx.replyWithDocument(ppt.fileId,
        {caption:(ppt.isPro?'⭐ Professional':'📄 Oddiy')+' — '+ppt.topic+'\n📊 '+ppt.slideCount+' ta slayd'});
    } catch(e) {
      // file_id eskirgan bo'lsa xabar
      var errMsg = l==='uz'?'❌ Fayl topilmadi. Telegram da saqlanish muddati o\'tgan bo\'lishi mumkin.'
        :l==='en'?'❌ File not found. It may have expired on Telegram servers.'
        :'❌ Файл не найден. Срок хранения на серверах Telegram мог истечь.';
      await ctx.reply(errMsg);
    }
  });

  bot.action('files_back', async (ctx) => {
    await ctx.answerCbQuery();
    var uid=String(ctx.from.id);
    var l=lang(ctx);
    var chatCount = await ChatHistory.findOne({botId:botConfig._id,userTelegramId:uid});
    var chatMsgs  = chatCount ? Math.floor((chatCount.messages||[]).length/2) : 0;
    var sessCount = await ChatSession.countDocuments({botId:botConfig._id,userTelegramId:uid,isActive:true});
    var pptCount  = await PptFile.countDocuments({botId:botConfig._id,userTelegramId:uid});
    var header = l==='uz'
      ? '📁 Mening Fayllarim\n\n💬 AI Suhbatlar: '+chatMsgs+' ta xabar, '+sessCount+' ta fayl\n🎨 Prezentatsiyalar: '+pptCount+' ta\n\nQaysi bo\'limni ochmoqchisiz?'
      : l==='en'
      ? '📁 My Files\n\n💬 AI Chats: '+chatMsgs+' messages, '+sessCount+' files\n🎨 Presentations: '+pptCount+'\n\nWhich section?'
      : '📁 Мои файлы\n\n💬 AI Беседы: '+chatMsgs+' сообщений, '+sessCount+' файлов\n🎨 Презентации: '+pptCount+'\n\nКакой раздел?';
    await ctx.editMessageText(header, Markup.inlineKeyboard([
      [Markup.button.callback(t('btn_ai_chats',l),'files_ai_chats')],
      [Markup.button.callback(t('btn_presentations',l),'files_ppts')],
      [Markup.button.callback(t('btn_close',l),'zone_close')]
    ]));
  });

  // ── Markdown generator — suhbat fayli uchun ──
  function _buildChatMarkdown(messages, botName, l, title) {
    var lines = [];
    var header = title ? '# '+title : (l==='uz'?'# AI Suhbat Tarixi':l==='en'?'# AI Chat History':'# История чата AI');
    lines.push(header);
    lines.push('');
    lines.push(l==='uz'?'Sana: '+new Date().toLocaleDateString('ru-RU'):l==='en'?'Date: '+new Date().toLocaleDateString('en-US'):'Дата: '+new Date().toLocaleDateString('ru-RU'));
    lines.push('---');
    lines.push('');
    (messages||[]).forEach(function(m, i) {
      if (m.role==='user') {
        lines.push('**Siz:**');
        lines.push(m.content);
      } else {
        lines.push('');
        lines.push('**'+(botName||'AI')+':**');
        // HTML taglarni olib tashlaymiz
        lines.push((m.content||'').replace(/<[^>]+>/g,''));
      }
      lines.push('');
      if (i < messages.length-1) lines.push('---');
      lines.push('');
    });
    return lines.join('\n');
  }


  // ═══════════════════════════════════════════════
  // 🌐 WEB INTERFEYS — Telegram Mini App
  // ═══════════════════════════════════════════════
  ;



  // ═══════════════════════════════════════════════
  // 🏢 GURUH VA KANAL HANDLERLARI
  // ═══════════════════════════════════════════════

  // Bot guruhga qo'shilganda yoki chiqarilganda
  bot.on('my_chat_member', async (ctx) => {
    try {
      var chat   = ctx.chat;
      var update = ctx.update.my_chat_member;
      var newSt  = update.new_chat_member.status;
      var oldSt  = update.old_chat_member.status;
      var addedBy = String(update.from.id);

      if (chat.type !== 'group' && chat.type !== 'supergroup') return;

      if (['member','administrator'].includes(newSt) && ['left','kicked'].includes(oldSt)) {
        // Bot guruhga qo'shildi
        var existing = await GroupConfig.findOne({ chatId: String(chat.id), botId: botConfig._id });
        if (!existing) {
          await GroupConfig.create({
            chatId:        String(chat.id),
            chatTitle:     chat.title || '',
            chatType:      chat.type,
            botId:         botConfig._id,
            addedByUserId: addedBy,
            currentPlan:   'free',
            replyMode:     'mention',
            isActive:      true
          });
        } else {
          await GroupConfig.findOneAndUpdate(
            { chatId: String(chat.id), botId: botConfig._id },
            { $set: { isActive: true, chatTitle: chat.title || '' } }
          );
        }
        // Xush kelibsiz xabari
        try {
          var l = botConfig.language || 'uz';
          await ctx.reply(
            l==='uz'
              ? '👋 Salom! Men '+esc(botConfig.botName)+'.\n\nGuruhda ishlash uchun meni mention qiling: @'+botConfig.botUsername+'\n\n📊 Hozirgi tarif: Free (oyiga 100 ta xabar)\n💡 Ko\'proq uchun /groupplan'
              : l==='en'
              ? '👋 Hello! I am '+esc(botConfig.botName)+'.\n\nMention me to chat: @'+botConfig.botUsername+'\n\n📊 Current plan: Free (100 messages/month)\n💡 Upgrade: /groupplan'
              : '👋 Привет! Я '+esc(botConfig.botName)+'.\n\nОбращайтесь ко мне: @'+botConfig.botUsername+'\n\n📊 Тариф: Free (100 сообщений/мес)\n💡 Улучшить: /groupplan'
          );
        } catch(_) {}
      } else if (['left','kicked'].includes(newSt)) {
        // Bot guruhdan chiqarildi
        await GroupConfig.findOneAndUpdate(
          { chatId: String(chat.id), botId: botConfig._id },
          { $set: { isActive: false } }
        );
      }
    } catch(e) {
      console.error('[Group] my_chat_member xato:', e.message);
    }
  });

  // Guruh xabarlari — mention yoki reply bo'lsa javob beradi
  bot.on('message', async (ctx) => {
    try {
      var chatType = ctx.chat && ctx.chat.type;
      if (chatType !== 'group' && chatType !== 'supergroup') return;

      var text = ctx.message && (ctx.message.text || ctx.message.caption) || '';
      if (!text.trim()) return;

      var gCfg = await GroupConfig.findOne({ chatId: String(ctx.chat.id), botId: botConfig._id, isActive: true });
      if (!gCfg) return;

      // Mention yoki reply tekshiruvi
      var botUsername = botConfig.botUsername || '';
      var isMentioned = text.includes('@' + botUsername);
      var isReply     = !!(ctx.message.reply_to_message &&
                           ctx.message.reply_to_message.from &&
                           String(ctx.message.reply_to_message.from.id) === String(ctx.botInfo && ctx.botInfo.id));

      var replyMode = gCfg.replyMode || 'mention';
      var shouldReply = false;
      if (replyMode === 'mention') shouldReply = isMentioned;
      else if (replyMode === 'reply')   shouldReply = isReply;
      else if (replyMode === 'all')     shouldReply = true;
      if (!shouldReply) return;

      // Oylik reset
      var now = new Date().toISOString().slice(0, 7);
      if (gCfg.monthlyReset !== now) {
        await GroupConfig.findByIdAndUpdate(gCfg._id, {
          $set: { monthlyMessages: 0, monthlyReset: now }
        });
        gCfg.monthlyMessages = 0;
        gCfg.monthlyReset    = now;
      }

      // Limit tekshiruvi
      var gPlan  = gCfg.currentPlan || 'free';
      var gLimit = GROUP_PLAN_LIMITS[gPlan] ? GROUP_PLAN_LIMITS[gPlan].ai : 100;
      var gUsed  = gCfg.monthlyMessages || 0;

      if (gLimit !== Infinity && gUsed >= gLimit) {
        var l = botConfig.language || 'uz';
        return ctx.reply(
          l==='uz'
            ? '⚠️ Guruh limiti tugadi.\n\n'+PLAN_NAMES[gPlan]+' tarifida oyiga '+gLimit+' ta xabar. Tarifni yangilash uchun /groupplan yuboring.'
            : l==='en'
            ? '⚠️ Group limit reached.\n\n'+PLAN_NAMES[gPlan]+' plan: '+gLimit+' messages/month. Type /groupplan to upgrade.'
            : '⚠️ Лимит группы исчерпан.\n\n'+PLAN_NAMES[gPlan]+': '+gLimit+' сообщений/мес. Для улучшения: /groupplan',
          { reply_to_message_id: ctx.message.message_id }
        );
      }

      // Mention matnini tozalash
      var cleanText = text.replace(new RegExp('@' + botUsername, 'g'), '').trim();
      if (!cleanText) return;

      // AI ga yuborish
      await ctx.sendChatAction('typing');
      var cfg2 = botConfig.toObject ? botConfig.toObject() : Object.assign({}, botConfig);

      // Guruh xotirasini olish (chatId asosida)
      var gHistKey = 'group_' + ctx.chat.id;
      var gHist    = await (require('./models/ChatHistory')).findOne({
        botId: botConfig._id, userTelegramId: gHistKey
      });
      var gMsgs = (gHist && gHist.messages) ? gHist.messages.slice(-20) : [];

      var aiResult = await getAIResponse(cfg2, gMsgs, cleanText, ctx.from.first_name || "Do'st");
      var aiReply  = typeof aiResult === 'object' ? aiResult.text : aiResult;
      var useHTML  = typeof aiResult === 'object' ? aiResult.html : false;

      // Xotirani saqlash
      var newGMsgs = gMsgs.concat([
        { role: 'user', content: cleanText },
        { role: 'assistant', content: aiReply }
      ]);
      if (newGMsgs.length > 40) newGMsgs = newGMsgs.slice(-40);

      var GChatHistory = require('./models/ChatHistory');
      var gH2 = await GChatHistory.findOne({ botId: botConfig._id, userTelegramId: gHistKey });
      if (!gH2) gH2 = new GChatHistory({ botId: botConfig._id, userTelegramId: gHistKey, messages: [] });
      gH2.messages = newGMsgs; gH2.updatedAt = new Date();
      await gH2.save();

      // Counter
      await GroupConfig.findByIdAndUpdate(gCfg._id, { $inc: { monthlyMessages: 1 } });

      // Javob yuborish
      await sendLongMessage(ctx, aiReply, useHTML, { reply_to_message_id: ctx.message.message_id });

    } catch(e) {
      console.error('[Group] message xato:', e.message);
    }
  });

  // /grouplimit — guruh limitini ko'rish
  bot.command('grouplimit', async (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
    var gCfg = await GroupConfig.findOne({ chatId: String(ctx.chat.id), botId: botConfig._id });
    if (!gCfg) return;
    var l     = botConfig.language || 'uz';
    var plan  = gCfg.currentPlan || 'free';
    var lim   = GROUP_PLAN_LIMITS[plan] ? GROUP_PLAN_LIMITS[plan].ai : 100;
    var used  = gCfg.monthlyMessages || 0;
    var pct   = lim === Infinity ? 0 : Math.round((used / lim) * 100);
    var bar   = '█'.repeat(Math.floor(pct/10)) + '░'.repeat(10 - Math.floor(pct/10));
    ctx.reply(
      l==='uz'
        ? '📊 Guruh limiti\n\n'+bar+' '+pct+'%\n'+used+' / '+(lim===Infinity?'∞':lim)+' xabar\n\nTarif: '+PLAN_NAMES[plan]+'\n💡 Yangilash: /groupplan'
        : l==='en'
        ? '📊 Group usage\n\n'+bar+' '+pct+'%\n'+used+' / '+(lim===Infinity?'∞':lim)+' messages\n\nPlan: '+PLAN_NAMES[plan]+'\n💡 Upgrade: /groupplan'
        : '📊 Лимит группы\n\n'+bar+' '+pct+'%\n'+used+' / '+(lim===Infinity?'∞':lim)+' сообщений\n\nТариф: '+PLAN_NAMES[plan]+'\n💡 Улучшить: /groupplan',
      { reply_to_message_id: ctx.message.message_id }
    );
  });

  // /groupplan — guruh tarifini ko'rish va yangilash
  bot.command('groupplan', async (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
    var gCfg = await GroupConfig.findOne({ chatId: String(ctx.chat.id), botId: botConfig._id });
    if (!gCfg) return;
    var l    = botConfig.language || 'uz';
    var plan = gCfg.currentPlan || 'free';
    var txt  = l==='uz'
      ? '💳 Guruh tarifi: '+PLAN_NAMES[plan]+'\n\n⭐ Starter — 19,000/oy (1,000 xabar)\n🚀 Pro — 39,000/oy (5,000 xabar)\n💎 Premium — 59,000/oy (cheksiz)\n\nBarcha tarifda PPT va boshqa funksiyalar mavjud.'
      : l==='en'
      ? '💳 Group plan: '+PLAN_NAMES[plan]+'\n\n⭐ Starter — 19,000/mo (1,000 msgs)\n🚀 Pro — 39,000/mo (5,000 msgs)\n💎 Premium — 59,000/mo (unlimited)\n\nAll plans include PPT and other features.'
      : '💳 Тариф группы: '+PLAN_NAMES[plan]+'\n\n⭐ Starter — 19,000/мес (1,000 сообщ)\n🚀 Pro — 39,000/мес (5,000 сообщ)\n💎 Premium — 59,000/мес (безлимит)\n\nВо всех тарифах доступны PPT и другие функции.';

    await ctx.reply(txt, Markup.inlineKeyboard([
      [Markup.button.callback('⭐ Starter', 'grp_order_starter_'+ctx.chat.id),
       Markup.button.callback('🚀 Pro',     'grp_order_pro_'+ctx.chat.id)],
      [Markup.button.callback('💎 Premium', 'grp_order_premium_'+ctx.chat.id)]
    ]));
  });

  // Guruh tarif buyurtmasi
  bot.action(/^grp_order_(starter|pro|premium)_(-?\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    var selPlan = ctx.match[1];
    var chatId  = ctx.match[2];
    var uid     = String(ctx.from.id);
    var l       = botConfig.language || 'uz';

    // Pending bormi
    var pending = await GroupSubscription.findOne({ chatId, status: 'pending' });
    if (pending) {
      return ctx.reply(
        l==='uz' ? '⏳ Bu guruh uchun kutilayotgan tolov bor. ID: ' + pending.uniqueId
        : l==='en' ? '⏳ Pending payment exists. ID: ' + pending.uniqueId
        : '⏳ Есть ожидающий платёж. ID: ' + pending.uniqueId
      );
    }

    // UniqueId yaratish
    var prefix = 'G' + selPlan.toUpperCase().slice(0,3);
    var chars  = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    var uid2   = prefix + '-';
    for (var i = 0; i < 4; i++) uid2 += chars[Math.floor(Math.random() * chars.length)];

    var price    = GROUP_PLAN_PRICES[selPlan].discounted;
    var planName = PLAN_NAMES[selPlan];
    var gCfg     = await GroupConfig.findOne({ chatId, botId: botConfig._id });
    var chatTitle = gCfg ? gCfg.chatTitle : chatId;

    await GroupSubscription.create({
      chatId, chatTitle,
      botId:          botConfig._id,
      payerUserId:    uid,
      payerUsername:  ctx.from.username  || '',
      payerFirstName: ctx.from.first_name || '',
      plan:           selPlan,
      uniqueId:       uid2,
      price,
      status:         'pending'
    });

    // Admin ga xabar
    try {
      var cardNum = process.env.CARD_NUMBER || "Admin dan so'rang";
      await bot.telegram.sendMessage(
        process.env.SUPER_ADMIN_ID,
        '🏢 Guruh obuna sorovi!\n\nGuruh: ' + esc(chatTitle) + ' (' + chatId + ')\n' +
        'Tolovchi: ' + (ctx.from.first_name||'') + (ctx.from.username?' (@'+ctx.from.username+')':'') +
        '\nTarif: ' + planName + '\nID: ' + uid2 + '\nNarx: ' + price + ' som/oy\n\nTasdiqlash: /gactivate ' + uid2,
        { reply_markup: Markup.inlineKeyboard([[
          Markup.button.callback('✅ Tasdiqlash — ' + uid2, 'gadm_activate_' + uid2)
        ]]).reply_markup }
      );
    } catch(e) { console.error('[Group] Admin xabar xato:', e.message); }

    var orderMsg = '✅ Buyurtma yaratildi!\n\nID: ' + uid2 + '\nTarif: ' + planName + '\nNarx: ' + price + ' som/oy\n\n💳 Karta: ' + cardNum + '\n\nTolovdan keyin admin tasdiqlaydi.';
    await ctx.reply(orderMsg, { reply_to_message_id: ctx.callbackQuery.message.message_id });
  });

  // Admin: guruh obunani tasdiqlash
  bot.action(/^gadm_activate_(.+)$/, async (ctx) => {
    if (String(ctx.from.id) !== String(process.env.SUPER_ADMIN_ID)) return ctx.answerCbQuery('Faqat admin!');
    await ctx.answerCbQuery('Tasdiqlanmoqda...');
    var uniqueId = ctx.match[1];
    var sub = await GroupSubscription.findOne({ uniqueId });
    if (!sub) return ctx.editMessageText('Buyurtma topilmadi: ' + uniqueId);

    var now    = new Date();
    var expiry = new Date(now);
    expiry.setMonth(expiry.getMonth() + (sub.durationMonths || 1));

    await GroupSubscription.findByIdAndUpdate(sub._id, {
      $set: { status: 'active', activatedAt: now, expiresAt: expiry, graceEndsAt: new Date(expiry.getTime() + 3*24*60*60*1000) }
    });
    await GroupConfig.findOneAndUpdate(
      { chatId: sub.chatId, botId: sub.botId },
      { $set: { currentPlan: sub.plan } }
    );

    await ctx.editMessageText('✅ Tasdiqlandi! Guruh: ' + sub.chatTitle + ' → ' + PLAN_NAMES[sub.plan]);

    // Guruhga xabar
    try {
      await bot.telegram.sendMessage(sub.chatId, '✅ Obuna faollashtirildi! Tarif: ' + PLAN_NAMES[sub.plan]);
    } catch(e) {}
  });

  // ═══════════════════════════════════════════════
  // /adduser va /removeuser — whitelist boshqaruvi
  // ═══════════════════════════════════════════════
  bot.command('adduser', async (ctx) => {
    var uid = String(ctx.from.id);
    if (uid !== String(botConfig.ownerTelegramId)) return ctx.reply('Bu buyruq faqat egasi uchun.');
    var args = ctx.message.text.split(' ').slice(1);
    var target = (args[0]||'').trim();
    if (!target) return ctx.reply('Foydalanish: /adduser <telegram_id>\nMisol: /adduser 123456789');
    if (botConfig.allowedUsers.includes(target)) return ctx.reply('Bu foydalanuvchi allaqachon ro\'yxatda.');
    await UserBot.findByIdAndUpdate(botConfig._id,{$addToSet:{allowedUsers:target}});
    botConfig.allowedUsers.push(target);
    ctx.reply('✅ Foydalanuvchi '+target+' qo\'shildi.');
  });

  bot.command('removeuser', async (ctx) => {
    var uid = String(ctx.from.id);
    if (uid !== String(botConfig.ownerTelegramId)) return ctx.reply('Bu buyruq faqat egasi uchun.');
    var args = ctx.message.text.split(' ').slice(1);
    var target = (args[0]||'').trim();
    if (!target) return ctx.reply('Foydalanish: /removeuser <telegram_id>\nMisol: /removeuser 123456789');
    if (!botConfig.allowedUsers.includes(target)) return ctx.reply('Bu foydalanuvchi ro\'yxatda yo\'q.');
    await UserBot.findByIdAndUpdate(botConfig._id,{$pull:{allowedUsers:target}});
    botConfig.allowedUsers = botConfig.allowedUsers.filter(function(u){return u!==target;});
    ctx.reply('✅ Foydalanuvchi '+target+' o\'chirildi.');
  });

  bot.command('users', async (ctx) => {
    var uid = String(ctx.from.id);
    if (uid !== String(botConfig.ownerTelegramId)) return ctx.reply('Bu buyruq faqat egasi uchun.');
    var mode = botConfig.accessMode || 'private';
    var modeText = {private:'🔒 Shaxsiy',whitelist:'👥 Whitelist',open:'🌐 Ochiq'}[mode]||mode;
    var users = (botConfig.allowedUsers||[]).filter(function(u){return u!==uid;});
    var text = '👥 Foydalanuvchilar\n\n🔐 Rejim: '+modeText+'\n📋 Ruxsatlı: '+users.length+' ta\n\n';
    if (users.length) text += users.map(function(u,i){return (i+1)+'. '+u;}).join('\n');
    else text += 'Hali hech kim qo\'shilmagan.';
    text += '\n\n➕ Qo\'shish: /adduser <id>\n➖ O\'chirish: /removeuser <id>';
    ctx.reply(text);
  });



  bot.on('text', async (ctx) => {
    // Guruh xabarlari alohida handler da — faqat private
    if (ctx.chat && ctx.chat.type !== 'private') return;
    var text=ctx.message.text; var uid=String(ctx.from.id);
    if (!text||text.startsWith('/')) return;
    if (MENU_ITEMS_ALL.indexOf(text)!==-1) return;
    ctx.session=ctx.session||{};
    var step=ctx.session.step;

    var wizardSteps=['ppt_topic','ppt_manual_plan','ppt_description','prz_set_main','edit_bot_name','edit_bot_topics','new_session_title','persona_name','persona_emoji','persona_prompt','persona_desc'];
    var wizardLabels={ppt_topic:'🎨 Prezentatsiya — mavzu',ppt_manual_plan:'🎨 Prezentatsiya — reja',ppt_description:'🎨 Prezentatsiya — tasavvur',prz_set_main:'🎭 Promptizatsiya — prompt',edit_bot_name:'⚙️ Bot nomi',edit_bot_topics:'⚙️ Mavzular',new_session_title:'🗂 Yangi suhbat sarlavha',persona_name:'🧠 Model nom',persona_emoji:'🧠 Model emoji',persona_prompt:'🧠 Model prompt',persona_desc:'🧠 Model tavsif'};

    if (step&&wizardSteps.indexOf(step)!==-1) {
      var lower=text.trim().toLowerCase();
      if (lower==='bekor'||lower==='cancel'||lower==='отмена') {
        ctx.session.step=null; ctx.session.ppt=null; ctx.session.newPersona=null;
        return ctx.reply("Bekor qilindi ✓  Yozing — davom etamiz!");
      }
      var looksChat=text.length>60||text.includes('?')||(text.split(' ').length>8&&step.startsWith('ppt'));
      if (looksChat) {
        return ctx.reply('⚡ Hozir: '+(wizardLabels[step]||step)+'\n\n"'+text.slice(0,50)+(text.length>50?'...':'')+"\"\n\nBu xabar AI ga ketsinmi yoki jarayon uchunmi?",
          Markup.inlineKeyboard([
            [Markup.button.callback('✍️ Jarayon uchun','ctx_use_for_wizard_'+encodeURIComponent(text.slice(0,50)))],
            [Markup.button.callback('💬 AI ga yuborish (jarayonni bekor qilaman)','ctx_send_to_ai')],
            [Markup.button.callback('❌ Bekor','ctx_cancel_wizard')]
          ])
        );
      }
    }

    // WIZARD QADAMLARI
    if (step==='ppt_topic') {
      if (text.trim().length<3) return ctx.reply('Mavzu juda qisqa:');
      ctx.session.ppt=ctx.session.ppt||{}; ctx.session.ppt.topic=text.trim(); ctx.session.step='ppt_count';
      return ctx.reply('Mavzu: '+text.trim()+' ✓\n\nNechta slayd kerak?',Markup.inlineKeyboard([
        [Markup.button.callback('5 ta','ppt_n_5'),Markup.button.callback('7 ta','ppt_n_7'),Markup.button.callback('10 ta','ppt_n_10')],
        [Markup.button.callback('12 ta','ppt_n_12'),Markup.button.callback('15 ta','ppt_n_15')]
      ]));
    }
    if (step==='ppt_manual_plan') {
      var pl=text.trim().split('\n').map(l=>l.trim()).filter(Boolean);
      if (pl.length<2) return ctx.reply('Kamida 2 ta reja bandi kerak:');
      ctx.session.ppt=ctx.session.ppt||{}; ctx.session.ppt.plan=pl; ctx.session.step='ppt_description';
      return ctx.reply('Ajoyib! '+pl.length+' ta bandli reja tayyor ✅\n\nEndi tasavvurni yozing:',Markup.inlineKeyboard([[Markup.button.callback("⏭ Tasavvursiz davom",'ppt_desc_skip')]]));
    }
    if (step==='ppt_description') {
      ctx.session.ppt=ctx.session.ppt||{}; ctx.session.step=null;
      var _desc=text.trim();
      setImmediate(function(){ generatePresentation(ctx,_desc); });
      return;
    }
    if (step==='prz_set_main') {
      if (text.trim().length<10) return ctx.reply('Prompt juda qisqa. Kamida bir gap yozing:');
      botConfig.extraInstructions=text.trim();
      await UserBot.findByIdAndUpdate(botConfig._id,{$set:{extraInstructions:text.trim()}});
      ctx.session.step=null;
      return ctx.reply('✅ Prompt saqlandi!\n\n━━━━━━━━━━━━━━━━━━━\n"'+text.trim().slice(0,120)+(text.trim().length>120?'...':'')+'"',
        Markup.inlineKeyboard([[Markup.button.callback("👁 Ko'rish",'prz_view')],[Markup.button.callback("✏️ O'zgartirish",'prz_main')]]));
    }
    if (step==='edit_bot_name') {
      if (text.trim().length<2) return ctx.reply('Nom juda qisqa:');
      botConfig.botName=text.trim();
      await UserBot.findByIdAndUpdate(botConfig._id,{$set:{botName:text.trim()}});
      ctx.session.step=null; return ctx.reply('Bot nomi "'+text.trim()+"\" ga o'zgardi!");
    }
    if (step==='edit_bot_topics') {
      var nt=text.split(',').map(t2=>t2.trim()).filter(Boolean);
      if (!nt.length) return ctx.reply('Kamida 1 ta mavzu kiriting:');
      botConfig.topics=nt;
      await UserBot.findByIdAndUpdate(botConfig._id,{$set:{topics:nt}});
      ctx.session.step=null; return ctx.reply('Mavzular yangilandi: '+nt.join(', '));
    }
    if (step==='new_session_title') {
      ctx.session.step=null;
      if (!text.trim()) return ctx.reply("Sarlavha bo'sh:");
      await createSession(ctx,text.trim()); return;
    }
    if (step==='persona_name') {
      if (text.trim().length<2) return ctx.reply('Nom juda qisqa:');
      ctx.session.newPersona=ctx.session.newPersona||{}; ctx.session.newPersona.name=text.trim(); ctx.session.step='persona_emoji';
      return ctx.reply('Model: '+text.trim()+'\n\n2-qadam: Emoji (1 ta emoji yozing).\nMisol: 💼 🎭 📚');
    }
    if (step==='persona_emoji') {
      ctx.session.newPersona=ctx.session.newPersona||{}; ctx.session.newPersona.emoji=text.trim().slice(0,2)||'🤖'; ctx.session.step='persona_prompt';
      return ctx.reply('Emoji: '+ctx.session.newPersona.emoji+'\n\n3-qadam: Bu model qanday gapirsin?\n\nMisol: "Sen ishbilarmon maslahatchi sifatida gapirasan."');
    }
    if (step==='persona_prompt') {
      if (text.trim().length<10) return ctx.reply("Ta'rif juda qisqa:");
      ctx.session.newPersona=ctx.session.newPersona||{}; ctx.session.newPersona.prompt=text.trim(); ctx.session.step='persona_desc';
      return ctx.reply("4-qadam: Qisqa tavsif (ro'yxatda ko'rinadigan).\n\nMisol: \"Biznes va daromad bo'yicha maslahatchi.\"");
    }
    if (step==='persona_desc') {
      ctx.session.newPersona=ctx.session.newPersona||{}; ctx.session.newPersona.desc=text.trim(); ctx.session.step=null;
      var np=ctx.session.newPersona;
      await Persona.create({botId:botConfig._id,userTelegramId:uid,name:np.name,description:np.desc||'',systemPrompt:np.prompt,emoji:np.emoji,isBuiltin:false});
      ctx.session.newPersona={};
      return ctx.reply(np.emoji+' '+np.name+" modeli yaratildi!\n\nIshlatish uchun: Sozlamalar → Modellarni ko'rish",
        Markup.inlineKeyboard([[Markup.button.callback("🧠 Modellarimni ko'rish",'show_personas')]]) );
    }

    // RUXSAT — accessMode bo'yicha
    var isOwn      = uid === String(botConfig.ownerTelegramId);
    var accessMode = botConfig.accessMode || 'private';

    if (!isOwn) {
      if (accessMode === 'private') {
        return ctx.reply('🔒 Bu shaxsiy bot. Faqat egasi foydalana oladi.');
      } else if (accessMode === 'whitelist') {
        if (!botConfig.allowedUsers.includes(uid)) {
          return ctx.reply('🔒 Ruxsat yo\'q. Bot egasi sizga ruxsat berishi kerak.');
        }
      }
      // open — hamma kiradi
    }

    // NUDGE — sessiyasiz birinchi xabarda bir marta ko'rsatiladi
    if (!ctx.session.chatNudgeSent && !ctx.session.activeSessionId) {
      ctx.session.chatNudgeSent = true;
      await ctx.reply(t('chat_nudge', lang(ctx)));
      // Nudge yuborildi, lekin AI javob ham davom etadi
    }

    // AI LIMIT — private/whitelist: egasining limiti; open: cheksiz
    await getFreshConfig();
    var accessModeNow = botConfig.accessMode || 'private';
    if (isOwn || accessModeNow === 'whitelist') {
      var aiChk = await checkAILimit(botConfig, lang(ctx));
      if (!aiChk.allowed) {
        return ctx.reply(aiChk.msg, aiChk.keyboard || {});
      }
    }

    // FIX #6: typingInterval — try/catch tashqarisida var e'lon
    var typingInterval=null;
    try {
      await ctx.sendChatAction('typing');
      typingInterval=setInterval(()=>{ctx.sendChatAction('typing').catch(()=>{});},4000);

      var activePersonaPrompt=null;
      if (ctx.session.activePersonaId) {
        var p2=await Persona.findById(ctx.session.activePersonaId);
        if (p2&&p2.isActive) activePersonaPrompt=p2.systemPrompt;
        else ctx.session.activePersonaId=null;
      }

      var activeSess=null;
      if (ctx.session.activeSessionId) {
        activeSess=await ChatSession.findOne({_id:ctx.session.activeSessionId,botId:botConfig._id,userTelegramId:uid,isActive:true});
        if (!activeSess) ctx.session.activeSessionId=null;
      }

      var histMsgs=[];
      if (activeSess) { histMsgs=activeSess.messages; }
      else {
        var h3=await ChatHistory.findOne({botId:botConfig._id,userTelegramId:uid});
        if (!h3) h3=new ChatHistory({botId:botConfig._id,userTelegramId:uid,messages:[]});
        histMsgs=h3.messages;
      }

      var userMsg=text.toLowerCase().trim()==='davom'?'Yuqoridagi javobingizni davom ettir.':text;
      var cfg2=Object.assign({},botConfig.toObject?botConfig.toObject():botConfig);
      cfg2.activePersonaPrompt=activePersonaPrompt;

      var aiResult=await getAIResponse(cfg2,histMsgs,userMsg,ctx.from.first_name||'');
      // FIX #6: clearInterval har doim
      if (typingInterval){clearInterval(typingInterval);typingInterval=null;}

      var aiReply=typeof aiResult==='object'?aiResult.text:aiResult;
      var useHTML=typeof aiResult==='object'?aiResult.html:false;

      var newMsgs=histMsgs.concat([{role:'user',content:text},{role:'assistant',content:aiReply}]);
      if (newMsgs.length>30) newMsgs=newMsgs.slice(-30);

      if (activeSess) { activeSess.messages=newMsgs; activeSess.updatedAt=new Date(); await activeSess.save(); }
      else {
        var h4=await ChatHistory.findOne({botId:botConfig._id,userTelegramId:uid});
        if (!h4) h4=new ChatHistory({botId:botConfig._id,userTelegramId:uid,messages:[]});
        h4.messages=newMsgs; h4.updatedAt=new Date(); await h4.save();
      }

      if (isOwn) {
        await UserBot.findByIdAndUpdate(botConfig._id,{$inc:{totalMessages:1,monthlyMessages:1}});
        botConfig.monthlyMessages=(botConfig.monthlyMessages||0)+1;
      } else {
        await UserBot.findByIdAndUpdate(botConfig._id,{$inc:{totalMessages:1}});
      }

      // Uzun javobni bo'lib yuborish (Telegram 4096 belgi chegarasi)
      await sendLongMessage(ctx, aiReply, useHTML);

    } catch(err) {
      if (typingInterval){clearInterval(typingInterval);typingInterval=null;}
      console.error('['+botConfig.botUsername+'] xato:',err.message);
      await ctx.reply("Hozir biroz muammo bor. Qayta urinib ko'ring! 🔄").catch(()=>{});
    }
  });

  // ── SUHBAT YARATISH — launchUserBot ICHIDA ──
  async function createSession(ctx, title) {
    var uid=String(ctx.from.id); var isOwn=uid===String(botConfig.ownerTelegramId);
    if (isOwn) {
      await getFreshConfig();
      var chk=await checkSessionLimit(botConfig,lang(ctx));
      if (!chk.allowed) return ctx.reply(chk.msg,chk.keyboard||{});
      await UserBot.findByIdAndUpdate(botConfig._id,{$inc:{monthlySessions:1}});
      botConfig.monthlySessions=(botConfig.monthlySessions||0)+1;
    }
    var sess=await ChatSession.create({botId:botConfig._id,userTelegramId:uid,title,messages:[]});
    ctx.session=ctx.session||{}; ctx.session.activeSessionId=String(sess._id);
    var l=lang(ctx);
    var hp=isOwn&&!!(botConfig.extraInstructions&&botConfig.extraInstructions.trim());
    await ctx.reply(t('session_created',l,title),mainKeyboard(l,isOwn,hp));
  }

  bot.launch({dropPendingUpdates:true}).catch(err=>{
    var msg=err.message||'';
    if (msg.includes('409')) console.error('WARN @'+botConfig.botUsername+': 409 Conflict');
    else console.error('WARN @'+botConfig.botUsername+': '+msg);
  });

  bot.catch((err,ctx)=>{
    console.error('ERR @'+botConfig.botUsername+':',err.message);
    if(ctx&&ctx.reply) ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.").catch(()=>{});
  });

  console.log('✅ @'+botConfig.botUsername+' boti ishga tushdi');


  return bot;
}