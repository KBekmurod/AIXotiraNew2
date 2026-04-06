'use strict';

const PptFile  = require('../models/PptFile');
const UserBot  = require('../models/UserBot');
const { getPptAIResponse } = require('../utils/ai');
const { generatePptx }    = require('../utils/pptx');
const { buildPptPrompt }  = require('../utils/pptPrompt');
const fs   = require('fs');
const path = require('path');

const PLAN_LIMITS = {
  free:    { ppt: 2,   pptPro: 0  },
  starter: { ppt: 15,  pptPro: 5  },
  pro:     { ppt: 50,  pptPro: 20 },
  premium: { ppt: 100, pptPro: 50 }
};

// GET /api/ppt — foydalanuvchi prezentatsiyalari ro'yxati
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

// POST /api/ppt — yangi prezentatsiya (SSE stream)
// Body: { topic, slideCount, isPro, description, plan?, theme? }
async function createPpt(req, res) {
  var uid   = req.user.userId;
  var body  = req.body || {};
  var topic      = (body.topic       || '').trim();
  var slideCount = parseInt(body.slideCount) || 5;
  var isPro      = !!body.isPro;
  var description = (body.description || '').trim();
  var theme       = body.theme || null;
  var manualPlan  = body.plan || null; // [ "band1", "band2", ... ]

  if (!topic) return res.status(400).json({ error: 'Mavzu kerak' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  function send(event, data) {
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  }

  try {
    // Limit tekshiruvi (faqat egasi)
    if (req.isOwner) {
      var botDoc = await UserBot.findById(req.botId);
      var plan   = botDoc ? (botDoc.currentPlan || 'free') : 'free';
      var lims   = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

      if (isPro) {
        if (lims.pptPro === 0) {
          send('error', { message: 'Pro prezentatsiya ushbu tarifdа mavjud emas', code: 'PLAN' });
          return res.end();
        }
        if ((botDoc.monthlyPptPro || 0) >= lims.pptPro) {
          send('error', { message: 'Oylik Pro PPT limiti tugadi', code: 'LIMIT' });
          return res.end();
        }
      } else {
        if ((botDoc.monthlyPpt || 0) >= lims.ppt) {
          send('error', { message: 'Oylik PPT limiti tugadi', code: 'LIMIT' });
          return res.end();
        }
      }
    }

    send('start', { status: 'ai_generating', topic });

    // AI prompt
    var botDoc2 = req.botDoc;
    var lang    = botDoc2 ? (botDoc2.language || 'uz') : 'uz';
    var aiPrompt = buildPptPrompt({
      topic, slideCount, plan: manualPlan, description,
      language: lang, isPro
    });

    var rawText = (await getPptAIResponse(aiPrompt) || '')
      .replace(/<[^>]+>/g, ' ').replace(/```[\w]*\n?/g, '').trim();

    var si = rawText.indexOf('[');
    var ei = rawText.lastIndexOf(']');

    if (si === -1 || ei === -1) {
      // Ikkinchi urinish
      send('status', { message: 'AI qayta urinmoqda...' });
      rawText = (await getPptAIResponse('FAQAT JSON massiv qaytargil:\n' + aiPrompt) || '')
        .replace(/<[^>]+>/g, ' ').replace(/```[\w]*\n?/g, '').trim();
      si = rawText.indexOf('[');
      ei = rawText.lastIndexOf(']');
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
    catch(e) {
      slides = JSON.parse(jsonStr.split('\n').map(function(l){return l.trim();}).join('\n'));
    }

    if (!Array.isArray(slides) || slides.length < 2) {
      send('error', { message: 'Slaydlar yetarli emas. Qayta urining.' });
      return res.end();
    }

    // Slaydlar sonini moslashtirish
    if (slides.length !== slideCount) {
      var endSl  = slides[slides.length - 1];
      var hasEnd = endSl && endSl.isEnd;
      if (hasEnd) slides.pop();
      while (slides.length < slideCount - 1) {
        slides.push({
          type: 'text', title: topic + ' — ' + slides.length + '-qism',
          body: topic + ' mavzusining muhim jihatlari.',
          points: ['Asosiy tushunchalar', 'Amaliy misollar', 'Xulosa']
        });
      }
      if (hasEnd || slides.length === slideCount - 1) {
        slides.push(endSl || { title: 'Xulosa', summary: 'Prezentatsiya yakunlandi.', isEnd: true });
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

    // Base64 ga o'girib yuboramiz (Mini App yuklab oladi)
    var fileData = fs.readFileSync(filePath);
    var base64   = fileData.toString('base64');
    var fileName = topic.replace(/[^\w\u0400-\u04FF ]/g, '_').slice(0, 25).trim() + '.pptx';

    fs.unlinkSync(filePath);

    // DB ga saqlaymiz (file_id yo'q — webapp orqali yuklab olinadi)
    var pptRec = await PptFile.create({
      botId:          req.botId,
      userTelegramId: uid,
      topic,
      fileName,
      fileId:     'webapp_' + Date.now(), // placeholder
      isPro,
      slideCount: slides.length
    });

    // Counter
    if (req.isOwner) {
      if (isPro) await UserBot.findByIdAndUpdate(req.botId, { $inc: { monthlyPptPro: 1 } });
      else        await UserBot.findByIdAndUpdate(req.botId, { $inc: { monthlyPpt: 1 } });
    }

    send('done', {
      fileName,
      base64,
      slideCount: slides.length,
      isPro,
      pptId: String(pptRec._id)
    });
    res.end();

  } catch (e) {
    console.error('[API/ppt POST]', e.message);
    send('error', { message: 'Xato: ' + e.message });
    res.end();
  }
}

module.exports = { getPpts, createPpt };
