'use strict';

// ═══════════════════════════════════════════════════════════
// GROUP PPT HANDLER — Gruppada prezentatsiya yaratish
//
// Trigger: /ppt <mavzu>  yoki  @bot_username ppt <mavzu>
//
// Gruppa prezentatsiya limiti:
//   GroupProfile.monthlyPpt → tugasa UserProfile.monthlyPpt
// ═══════════════════════════════════════════════════════════

const GroupProfile        = require('../models/GroupProfile');
const UserProfile         = require('../models/UserProfile');
const UserBot             = require('../models/UserBot');
const PptFile             = require('../models/PptFile');
const { getPptAIResponse } = require('./ai');
const { generatePptx }    = require('./pptx');
const { buildPptPrompt }  = require('./pptPrompt');
const fs   = require('fs');
const path = require('path');

const PLAN_LIMITS = {
  free:    { ppt: 2  },
  starter: { ppt: 15 },
  pro:     { ppt: 50 },
  premium: { ppt: 100}
};

function monthStr() { return new Date().toISOString().slice(0, 7); }

// ── PPT limit tekshiruvi (gruppa → user zanjiri) ──
async function checkGroupPptLimit(botId, chatId, uid) {
  var groupProfile = await GroupProfile.findOne({ botId, chatId });
  if (!groupProfile) return { allowed: false, source: 'none' };

  // Oylik reset
  if (groupProfile.monthlyReset !== monthStr()) {
    await GroupProfile.findByIdAndUpdate(groupProfile._id, {
      $set: { monthlyPpt: 0, monthlyReset: monthStr() }
    });
    groupProfile.monthlyPpt = 0;
  }

  var groupPlan = groupProfile.currentPlan || 'free';
  var groupLim  = PLAN_LIMITS[groupPlan].ppt;

  if ((groupProfile.monthlyPpt || 0) < groupLim) {
    return { allowed: true, source: 'group', groupProfile };
  }

  // User profilega o'tish
  var userProfile = await UserProfile.findOne({ botId, userTelegramId: String(uid) });
  if (!userProfile) return { allowed: false, source: 'user_none', groupProfile };

  var userPlan = userProfile.currentPlan || 'free';
  var userLim  = PLAN_LIMITS[userPlan].ppt;

  if ((userProfile.monthlyPpt || 0) < userLim) {
    return { allowed: true, source: 'user', groupProfile, userProfile };
  }

  return { allowed: false, source: 'both_exceeded', groupProfile, userProfile };
}

// ── PPT trigger tekshiruvi ──
// /ppt <mavzu>  yoki  @bot ppt <mavzu>
function isPptTrigger(text, botUsername) {
  if (!text) return null;
  var t = text.trim();

  // /ppt buyrug'i
  var cmdMatch = t.match(/^\/ppt(?:@\S+)?\s*(.*)/i);
  if (cmdMatch) return cmdMatch[1].trim() || null;

  // @mention + ppt
  if (botUsername) {
    var mentionRe = new RegExp('@' + botUsername.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\s+ppt\\s*(.*)', 'i');
    var mMatch = t.match(mentionRe);
    if (mMatch) return mMatch[1].trim() || null;
  }

  return false; // trigger emas
}

// ═══════════════════════════════════════════════
// ASOSIY PPT HANDLER
// ═══════════════════════════════════════════════
async function handleGroupPpt(ctx, botConfig, botUsername) {
  var msg  = ctx.message;
  if (!msg) return;

  var text     = (msg.text || msg.caption || '').trim();
  var topic    = isPptTrigger(text, botUsername);

  if (topic === false) return; // Bu PPT trigger emas

  var chatId   = String(ctx.chat.id);
  var uid      = String(ctx.from.id);
  var lang     = 'ru';

  // Mavzu bo'sh
  if (!topic) {
    var helpMsg = lang === 'uz'
      ? '🎨 Mavzu yozing:\n/ppt <mavzu>\n\nMisol: /ppt Sun\'iy intellekt'
      : lang === 'en'
      ? '🎨 Write a topic:\n/ppt <topic>\n\nExample: /ppt Artificial Intelligence'
      : '🎨 Напишите тему:\n/ppt <тема>\n\nПример: /ppt Искусственный интеллект';
    try { await ctx.reply(helpMsg, { reply_to_message_id: msg.message_id }); } catch(_) {}
    return;
  }

  // Limit tekshiruvi
  var lim = await checkGroupPptLimit(botConfig._id, chatId, uid);
  if (!lim.allowed) {
    var limMsg = lang === 'uz'
      ? '⚠️ Prezentatsiya limiti tugadi.\n\nShaxsiy botga o\'tib obuna oling.'
      : lang === 'en'
      ? '⚠️ Presentation limit reached.\n\nSubscribe via the personal bot.'
      : '⚠️ Лимит презентаций исчерпан.\n\nОформите подписку в личном боте.';
    try { await ctx.reply(limMsg, { reply_to_message_id: msg.message_id }); } catch(_) {}
    return;
  }

  // Yaratilmoqda xabari
  var buildingMsg = lang === 'uz'
    ? '🎨 Prezentatsiya yaratilmoqda...\n\n📌 ' + topic + '\n\nAI kontent yozmoqda... ⏳'
    : lang === 'en'
    ? '🎨 Creating presentation...\n\n📌 ' + topic + '\n\nAI writing content... ⏳'
    : '🎨 Создание презентации...\n\n📌 ' + topic + '\n\nAI пишет контент... ⏳';

  var sentMsg = null;
  try { sentMsg = await ctx.reply(buildingMsg, { reply_to_message_id: msg.message_id }); } catch(_) {}

  try {
    var slideCount = 5;
    var aiPrompt   = buildPptPrompt({
      topic,
      slideCount,
      plan: null,
      description: '',
      language: botConfig.language || 'ru',
      isPro: false
    });

    var rawText = (await getPptAIResponse(aiPrompt) || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/```[\w]*\n?/g, '')
      .trim();

    var si = rawText.indexOf('['), ei = rawText.lastIndexOf(']');
    if (si === -1 || ei === -1 || ei <= si) {
      rawText = ((await getPptAIResponse('FAQAT JSON massiv qaytargil:\n' + aiPrompt)) || '')
        .replace(/<[^>]+>/g, ' ').replace(/```[\w]*\n?/g, '').trim();
      si = rawText.indexOf('['); ei = rawText.lastIndexOf(']');
    }
    if (si === -1 || ei === -1) throw new Error('AI JSON qaytarmadi.');

    var jsonStr = rawText.slice(si, ei + 1)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +\n/g, '\n')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*?)'/g, ': "$1"');

    var slides;
    try { slides = JSON.parse(jsonStr); }
    catch(e) { slides = JSON.parse(jsonStr.split('\n').map(function(l){return l.trim();}).join('\n')); }

    if (!Array.isArray(slides) || slides.length < 2) throw new Error('Slaydlar yetarli emas.');

    // Slayd sonini to'g'rilash
    while (slides.length < slideCount - 1) {
      slides.push({
        type: 'text',
        title: topic + ' — ' + slides.length,
        body: topic + ' mavzusining asosiy jihatlari.',
        points: ['Asosiy tushunchalar', 'Amaliy misollar', 'Xulosalar']
      });
    }
    if (slides.length === slideCount - 1) {
      slides.push({ title: 'Xulosa', summary: 'Prezentatsiya yakunlandi.', isEnd: true });
    }
    while (slides.length > slideCount) slides.splice(slides.length - 2, 1);

    var filePath = await generatePptx(slides, {
      professional: false,
      topic,
      theme: null,
      images: []
    });

    var stat = fs.statSync(filePath);
    if (stat.size > 25 * 1024 * 1024) {
      fs.unlinkSync(filePath);
      throw new Error('Fayl 25 MB dan oshdi.');
    }

    var fn = topic.replace(/[^\w\u0400-\u04FF ]/g, '_').slice(0, 25).trim() + '.pptx';
    var caption = (lang === 'uz'
      ? '🎉 Tayyor! 📄 Prezentatsiya\n\n📌 ' + topic + '\n📊 ' + slides.length + ' ta slayd\n\nPowerPoint yoki Google Slides da oching. 🚀'
      : lang === 'en'
      ? '🎉 Done! 📄 Presentation\n\n📌 ' + topic + '\n📊 ' + slides.length + ' slides\n\nOpen in PowerPoint or Google Slides. 🚀'
      : '🎉 Готово! 📄 Презентация\n\n📌 ' + topic + '\n📊 ' + slides.length + ' слайдов\n\nОткройте в PowerPoint или Google Slides. 🚀');

    var sentDoc = await ctx.replyWithDocument(
      { source: filePath, filename: fn },
      { caption, reply_to_message_id: msg.message_id }
    );

    // file_id saqlash
    try {
      var tgFileId = sentDoc && sentDoc.document && sentDoc.document.file_id;
      if (tgFileId) {
        await PptFile.create({
          botId: botConfig._id,
          userTelegramId: uid,
          topic, fileName: fn, fileId: tgFileId,
          isPro: false, slideCount: slides.length
        });
      }
    } catch(saveErr) { console.warn('[GroupPPT] file_id saqlash xato:', saveErr.message); }

    try { fs.unlinkSync(filePath); } catch(_) {}

    // Counter yangilash
    if (lim.source === 'group') {
      await GroupProfile.findByIdAndUpdate(lim.groupProfile._id, { $inc: { monthlyPpt: 1 } });
    } else if (lim.source === 'user' && lim.userProfile) {
      await UserProfile.findByIdAndUpdate(lim.userProfile._id, { $inc: { monthlyPpt: 1 } });
    }
    await UserBot.findByIdAndUpdate(botConfig._id, { $inc: { totalMessages: 1 } });

    // Yaratilmoqda xabarini o'chirish
    if (sentMsg) {
      try { await ctx.telegram.deleteMessage(chatId, sentMsg.message_id); } catch(_) {}
    }

  } catch(err) {
    console.error('[GroupPPT] Xato:', err.message);
    var errMsg2 = lang === 'uz'
      ? '❌ Xatolik: ' + err.message + '\n\nQayta urinib ko\'ring.'
      : lang === 'en'
      ? '❌ Error: ' + err.message + '\n\nPlease try again.'
      : '❌ Ошибка: ' + err.message + '\n\nПопробуйте ещё раз.';
    try { await ctx.reply(errMsg2, { reply_to_message_id: msg.message_id }); } catch(_) {}
    if (sentMsg) {
      try { await ctx.telegram.deleteMessage(chatId, sentMsg.message_id); } catch(_) {}
    }
  }
}

module.exports = { handleGroupPpt, isPptTrigger, checkGroupPptLimit };
