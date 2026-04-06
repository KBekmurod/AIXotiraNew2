'use strict';

const ChatHistory = require('../models/ChatHistory');
const ChatSession = require('../models/ChatSession');
const UserBot     = require('../models/UserBot');
const { getAIResponse } = require('../utils/ai');

// ─────────────────────────────────────────
// GET /api/chat
// Asosiy suhbat tarixini qaytaradi
// ─────────────────────────────────────────
async function getChat(req, res) {
  try {
    var uid  = req.user.userId;
    var hist = await ChatHistory.findOne({ botId: req.botId, userTelegramId: uid });
    var messages = hist ? hist.messages : [];
    res.json({ messages });
  } catch (e) {
    console.error('[API/chat GET]', e.message);
    res.status(500).json({ error: 'Xato yuz berdi' });
  }
}

// ─────────────────────────────────────────
// POST /api/chat
// Body: { message, sessionId? }
// SSE stream bilan AI javob qaytaradi
// ─────────────────────────────────────────
async function postChat(req, res) {
  var uid        = req.user.userId;
  var firstName  = req.user.firstName || '';
  var userMsg    = (req.body && req.body.message) || '';
  var sessionId  = (req.body && req.body.sessionId) || null;

  if (!userMsg.trim()) {
    return res.status(400).json({ error: 'Xabar bo\'sh' });
  }

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
    var botDoc = req.botDoc;

    // Xotira olish
    var histMsgs = [];
    var activeSession = null;

    if (sessionId) {
      activeSession = await ChatSession.findOne({
        _id: sessionId, botId: req.botId, userTelegramId: uid, isActive: true
      });
      if (activeSession) histMsgs = activeSession.messages;
    }

    if (!activeSession) {
      var hist = await ChatHistory.findOne({ botId: req.botId, userTelegramId: uid });
      if (hist) histMsgs = hist.messages;
    }

    // AI ga yuborish
    send('start', { status: 'thinking' });

    var cfg = botDoc.toObject ? botDoc.toObject() : Object.assign({}, botDoc);
    var result = await getAIResponse(cfg, histMsgs, userMsg, firstName);
    var aiText = typeof result === 'object' ? result.text : result;
    var isHtml = typeof result === 'object' ? result.html : false;

    // Javobni stream qilish (har 50 belgi)
    var CHUNK = 50;
    for (var i = 0; i < aiText.length; i += CHUNK) {
      send('chunk', { text: aiText.slice(i, i + CHUNK) });
      await new Promise(function(r) { setTimeout(r, 10); });
    }

    // Xotirani yangilash
    var newMsgs = histMsgs.concat([
      { role: 'user',      content: userMsg },
      { role: 'assistant', content: aiText  }
    ]);
    if (newMsgs.length > 30) newMsgs = newMsgs.slice(-30);

    if (activeSession) {
      activeSession.messages  = newMsgs;
      activeSession.updatedAt = new Date();
      await activeSession.save();
    } else {
      var h = await ChatHistory.findOne({ botId: req.botId, userTelegramId: uid });
      if (!h) h = new ChatHistory({ botId: req.botId, userTelegramId: uid, messages: [] });
      h.messages  = newMsgs;
      h.updatedAt = new Date();
      await h.save();
    }

    // Counter
    if (req.isOwner) {
      await UserBot.findByIdAndUpdate(req.botId, { $inc: { totalMessages: 1, monthlyMessages: 1 } });
    } else {
      await UserBot.findByIdAndUpdate(req.botId, { $inc: { totalMessages: 1 } });
    }

    send('done', { html: isHtml });
    res.end();
  } catch (e) {
    console.error('[API/chat POST]', e.message);
    send('error', { message: 'Xato yuz berdi. Qayta urining.' });
    res.end();
  }
}

// ─────────────────────────────────────────
// DELETE /api/chat
// Asosiy suhbat tarixini tozalash
// ─────────────────────────────────────────
async function deleteChat(req, res) {
  try {
    var uid = req.user.userId;
    await ChatHistory.findOneAndUpdate(
      { botId: req.botId, userTelegramId: uid },
      { $set: { messages: [], updatedAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[API/chat DELETE]', e.message);
    res.status(500).json({ error: 'Xato yuz berdi' });
  }
}

module.exports = { getChat, postChat, deleteChat };
