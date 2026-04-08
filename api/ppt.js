'use strict';

const PptFile  = require('../models/PptFile');
const UserBot  = require('../models/UserBot');
const { getPptAIResponse } = require('../utils/ai');
const { generatePptx }    = require('../utils/pptx');
const { buildPptPrompt }  = require('../utils/pptPrompt');
const fs   = require('fs');
const {
  resetMonthlyIfNeeded,
  checkPptLimit,
  limitError,
  limitErrorSSE
} = require('./helpers');

async function getPpts(req, res) {
  try {
    var uid  = req.user.userId;
    var list = await PptFile.find({ botId: req.botId, userTelegramId: uid })
      .sort({ createdAt: -1 }).limit(20);
    res.json({ ppts: list });
  } catch (e) {
    res.status(500).json({ error: 'Xato' });
  }
}

async function createPpt(req, res) {
  var uid        = req.user.userId;
  var body       = req.body || {};
  var topic      = (body.topic       || '').trim();
  var slideCount = parseInt(body.slideCount) || 5;
  var isPro      = !!body.isPro;
  var description = (body.description || '').trim();
  var theme       = body.theme  || null;
  var manualPlan  = body.plan   || null;

  if (!topic) return res.status(400).json({ error: 'Mavzu kerak' });

  // Limit tekshiruvi — SSE ochishdan OLDIN (barcha foydalanuvchilar)
  try {
    var botDoc = await UserBot.findById(req.botId);
    if (!botDoc) return res.status(503).json({ error: 'Bot topilmadi' });
    await resetMonthlyIfNeeded(botDoc);

    // PPT limit faqat bot egasi uchun tekshiriladi
    if (req.isOwner) {
      var lc = checkPptLimit(botDoc, isPro);
      if (!lc.allowed) return limitError(res, lc);
    }
  } catch(e) {
    return res.status(500).json({ error: 'Xato' });
  }

  // SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  function send(ev, data) { res.write('event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n'); }

  try {
    send('start', { status: 'ai_generating', topic });

    var botDoc2 = req.botDoc;
    var lang    = botDoc2 ? (botDoc2.language || 'uz') : 'uz';
    var aiPrompt = buildPptPrompt({ topic, slideCount, plan: manualPlan, description, language: lang, isPro });

    var rawText = (await getPptAIResponse(aiPrompt) || '')
      .replace(/<[^>]+>/g, ' ').replace(/```[\w]*\n?/g, '').trim();

    var si = rawText.indexOf('['), ei = rawText.lastIndexOf(']');
    if (si === -1 || ei === -1) {
      send('status', { message: 'AI qayta urinmoqda...' });
      rawText = (await getPptAIResponse('FAQAT JSON massiv qaytargil:\n' + aiPrompt) || '')
        .replace(/<[^>]+>/g, ' ').replace(/```[\w]*\n?/g, '').trim();
      si = rawText.indexOf('['); ei = rawText.lastIndexOf(']');
    }

    if (si === -1 || ei === -1) {
      send('error', { message: 'AI JSON qaytarmadi. Mavzuni o\'zgartirib qayta urining.' });
      return res.end();
    }

    var jsonStr = rawText.slice(si, ei + 1)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*?)'/g, ': "$1"');

    var slides;
    try { slides = JSON.parse(jsonStr); }
    catch(e) { slides = JSON.parse(jsonStr.split('\n').map(function(l){return l.trim();}).join('\n')); }

    if (!Array.isArray(slides) || slides.length < 2) {
      send('error', { message: 'Slaydlar yetarli emas. Qayta urining.' });
      return res.end();
    }

    if (slides.length !== slideCount) {
      var endSl = slides[slides.length - 1], hasEnd = endSl && endSl.isEnd;
      if (hasEnd) slides.pop();
      while (slides.length < slideCount - 1) {
        slides.push({ type:'text', title: topic+' — '+slides.length+'-qism',
          body: topic+' mavzusining muhim jihatlari.',
          points: ['Asosiy tushunchalar','Amaliy misollar','Xulosa'] });
      }
      if (hasEnd || slides.length === slideCount - 1) {
        slides.push(endSl || { title:'Xulosa', summary:'Prezentatsiya yakunlandi.', isEnd:true });
      }
      while (slides.length > slideCount) slides.splice(slides.length - 2, 1);
    }

    send('status', { message: 'PPTX yaratilmoqda...' });

    var filePath = await generatePptx(slides, {
      professional: isPro, topic,
      theme: (theme && theme !== 'auto') ? theme : null,
      images: []
    });

    var stat = fs.statSync(filePath);
    if (stat.size > 25 * 1024 * 1024) {
      fs.unlinkSync(filePath);
      send('error', { message: 'Fayl 25MB dan oshdi.' });
      return res.end();
    }

    var fileData = fs.readFileSync(filePath);
    var base64   = fileData.toString('base64');
    var fileName = topic.replace(/[^\w\u0400-\u04FF ]/g, '_').slice(0, 25).trim() + '.pptx';
    fs.unlinkSync(filePath);

    var pptRec = await PptFile.create({
      botId: req.botId, userTelegramId: uid,
      topic, fileName, fileId: 'webapp_' + Date.now(),
      isPro, slideCount: slides.length
    });

    // Counter — faqat bot egasi uchun
    if (req.isOwner) {
      if (isPro) {
        await UserBot.findByIdAndUpdate(req.botId, { $inc: { monthlyPptPro: 1 } });
      } else {
        await UserBot.findByIdAndUpdate(req.botId, { $inc: { monthlyPpt: 1 } });
      }
    }

    send('done', { fileName, base64, slideCount: slides.length, isPro, pptId: String(pptRec._id) });
    res.end();
  } catch (e) {
    console.error('[API/ppt POST]', e.message);
    send('error', { message: 'Xato: ' + e.message });
    res.end();
  }
}

async function deletePpt(req, res) {
  try {
    var uid = req.user.userId;
    await PptFile.findOneAndDelete({ _id: req.params.id, botId: req.botId, userTelegramId: uid });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Xato' });
  }
}

module.exports = { getPpts, createPpt, deletePpt };
