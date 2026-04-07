'use strict';

const ChatHistory = require('../models/ChatHistory');
const ChatSession = require('../models/ChatSession');
const UserBot     = require('../models/UserBot');
const { getAIResponse } = require('../utils/ai');
const {
  resetMonthlyIfNeeded,
  checkAILimit,
  limitError,
  validateMessage
} = require('./helpers');

async function getChat(req, res) {
  try {
    var uid       = req.user.userId;
    var sessionId = req.query.sessionId || null;
    if (sessionId) {
      var sess = await ChatSession.findOne({
        _id: sessionId, botId: req.botId, userTelegramId: uid, isActive: true
      });
      if (!sess) return res.status(404).json({ error: 'Sessiya topilmadi' });
      return res.json({ messages: sess.messages || [], sessionTitle: sess.title });
    }
    var hist = await ChatHistory.findOne({ botId: req.botId, userTelegramId: uid });
    res.json({ messages: hist ? hist.messages : [], sessionTitle: null });
  } catch (e) {
    console.error('[API/chat GET]', e.message);
    res.status(500).json({ error: 'Xato yuz berdi' });
  }
}

async function postChat(req, res) {
  var uid       = req.user.userId;
  var firstName = req.user.firstName || '';
  var userMsg   = (req.body && req.body.message) || '';
  var sessionId = (req.body && req.body.sessionId) || null;

  var msgCheck = validateMessage(userMsg);
  if (!msgCheck.ok) return res.status(400).json({ error: msgCheck.error });

  try {
    var botDoc = await UserBot.findById(req.botId);
    if (!botDoc) return res.status(503).json({ error: 'Bot topilmadi' });
    await resetMonthlyIfNeeded(botDoc);

    var lc = checkAILimit(botDoc);
    if (!lc.allowed) return limitError(res, lc);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    function send(ev, data) { res.write('event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n'); }

    var histMsgs = [], activeSess = null;
    if (sessionId) {
      activeSess = await ChatSession.findOne({ _id: sessionId, botId: req.botId, userTelegramId: uid, isActive: true });
      if (activeSess) histMsgs = activeSess.messages;
    }
    if (!activeSess) {
      var hist = await ChatHistory.findOne({ botId: req.botId, userTelegramId: uid });
      if (hist) histMsgs = hist.messages;
    }

    send('start', { status: 'thinking' });

    var cfg    = botDoc.toObject ? botDoc.toObject() : Object.assign({}, botDoc);
    var result = await getAIResponse(cfg, histMsgs, userMsg, firstName);
    var aiText = typeof result === 'object' ? result.text : result;
    var isHtml = typeof result === 'object' ? result.html : false;

    var CHUNK = 60;
    for (var i = 0; i < aiText.length; i += CHUNK) {
      send('chunk', { text: aiText.slice(i, i + CHUNK) });
      await new Promise(function(r) { setTimeout(r, 8); });
    }

    var newMsgs = histMsgs.concat([
      { role: 'user',      content: userMsg },
      { role: 'assistant', content: aiText  }
    ]);
    if (newMsgs.length > 30) newMsgs = newMsgs.slice(-30);

    if (activeSess) {
      activeSess.messages = newMsgs; activeSess.updatedAt = new Date(); await activeSess.save();
    } else {
      var h = await ChatHistory.findOne({ botId: req.botId, userTelegramId: uid });
      if (!h) h = new ChatHistory({ botId: req.botId, userTelegramId: uid, messages: [] });
      h.messages = newMsgs; h.updatedAt = new Date(); await h.save();
    }

    await UserBot.findByIdAndUpdate(req.botId, { $inc: { totalMessages: 1, monthlyMessages: 1 } });
    send('done', { html: isHtml });
    res.end();
  } catch (e) {
    console.error('[API/chat POST]', e.message);
    try { res.write('event: error\ndata: ' + JSON.stringify({ message: 'Xato yuz berdi.' }) + '\n\n'); res.end(); } catch(_) {}
  }
}

async function deleteChat(req, res) {
  try {
    var uid = req.user.userId;
    await ChatHistory.findOneAndUpdate(
      { botId: req.botId, userTelegramId: uid },
      { $set: { messages: [], updatedAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Xato' });
  }
}

module.exports = { getChat, postChat, deleteChat };
