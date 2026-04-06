'use strict';

const ChatSession = require('../models/ChatSession');
const UserBot     = require('../models/UserBot');

// GET /api/sessions — ro'yxat
async function getSessions(req, res) {
  try {
    var uid  = req.user.userId;
    var list = await ChatSession.find({
      botId: req.botId, userTelegramId: uid, isActive: true
    }).sort({ updatedAt: -1 }).limit(20);
    res.json({ sessions: list });
  } catch (e) {
    res.status(500).json({ error: 'Xato' });
  }
}

// GET /api/sessions/:id — bitta session xabarlari
async function getSession(req, res) {
  try {
    var uid  = req.user.userId;
    var sess = await ChatSession.findOne({
      _id: req.params.id, botId: req.botId, userTelegramId: uid, isActive: true
    });
    if (!sess) return res.status(404).json({ error: 'Topilmadi' });
    res.json({ session: sess });
  } catch (e) {
    res.status(500).json({ error: 'Xato' });
  }
}

// POST /api/sessions — yangi yaratish
async function createSession(req, res) {
  try {
    var uid   = req.user.userId;
    var title = (req.body && req.body.title) || '';
    if (!title.trim()) return res.status(400).json({ error: 'Sarlavha kerak' });

    // Limit tekshiruvi (egasi uchun)
    if (req.isOwner) {
      var botDoc = await UserBot.findById(req.botId);
      var LIMITS = { free:2, starter:20, pro:50, premium:Infinity };
      var plan   = botDoc ? (botDoc.currentPlan || 'free') : 'free';
      var limit  = LIMITS[plan] || 2;
      var used   = botDoc ? (botDoc.monthlySessions || 0) : 0;
      if (limit !== Infinity && used >= limit) {
        return res.status(403).json({ error: 'Oylik sessiya limiti tugadi', code: 'LIMIT' });
      }
      await UserBot.findByIdAndUpdate(req.botId, { $inc: { monthlySessions: 1 } });
    }

    var now   = new Date();
    var dd    = String(now.getDate()).padStart(2,'0');
    var mm    = String(now.getMonth()+1).padStart(2,'0');
    var hh    = String(now.getHours()).padStart(2,'0');
    var min   = String(now.getMinutes()).padStart(2,'0');
    var autoTitle = title || ('Suhbat '+dd+'.'+mm+' '+hh+':'+min);

    var sess = await ChatSession.create({
      botId: req.botId, userTelegramId: uid,
      title: autoTitle, messages: []
    });
    res.json({ session: sess });
  } catch (e) {
    res.status(500).json({ error: 'Xato' });
  }
}

// DELETE /api/sessions/:id
async function deleteSession(req, res) {
  try {
    var uid = req.user.userId;
    await ChatSession.findOneAndDelete({
      _id: req.params.id, botId: req.botId, userTelegramId: uid
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Xato' });
  }
}

module.exports = { getSessions, getSession, createSession, deleteSession };
