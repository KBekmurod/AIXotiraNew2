'use strict';

const UserBot     = require('../models/UserBot');
const Persona     = require('../models/Persona');
const ChatHistory = require('../models/ChatHistory');
const { checkPersonaLimit, limitError } = require('./helpers');

const BUILTIN_PERSONAS = [
  { key:'teacher',  name:'O\'qituvchi',   emoji:'📚', desc:'Sabr bilan tushuntiradi', prompt:'Sen tajribali o\'qituvchisan. Har bir narsani oddiy va tushunarli qilib tushuntirib berasan.' },
  { key:'coach',    name:'Murabbiy',      emoji:'💪', desc:'Motivatsiya beradi',       prompt:'Sen hayot murabbiyisan. Odamlarni maqsadlariga erishishga undaysan, doim ijobiy va qo\'llab-quvvatlovchi bo\'lasan.' },
  { key:'doctor',   name:'Shifokor',      emoji:'🩺', desc:'Sog\'liq maslahat',        prompt:'Sen tibbiy maslahatchi sifatida javob berasan. Har doim professionallik bilan yondashasan.' },
  { key:'lawyer',   name:'Huquqshunos',   emoji:'⚖️', desc:'Yuridik maslahat',         prompt:'Sen huquqiy maslahatchi sifatida ishlaasan. Qonuniy savollar bo\'yicha aniq va ishonchli javob berasan.' },
  { key:'friend',   name:'Do\'st',        emoji:'😊', desc:'Samimiy suhbat',           prompt:'Sen yaqin do\'st sifatida gaplashasan. Isimni ishlat, hazil qil, quvnoq bo\'l.' },
  { key:'analyst',  name:'Tahlilchi',     emoji:'📊', desc:'Chuqur tahlil',            prompt:'Sen analitik fikrlovchisan. Har bir savolni chuqur tahlil qilib, mantiqiy javob berasan.' }
];

// ─────────────────────────────────────────
// GET /api/settings/bot — bot ma'lumotlari
// ─────────────────────────────────────────
async function getBotSettings(req, res) {
  try {
    var botDoc = await UserBot.findById(req.botId);
    if (!botDoc) return res.status(404).json({ error: 'Bot topilmadi' });

    res.json({
      botName:           botDoc.botName,
      personality:       botDoc.personality || 'friendly',
      extraInstructions: req.isOwner ? (botDoc.extraInstructions || '') : undefined,
      language:          botDoc.language || 'uz',
      accessMode:        req.isOwner ? (botDoc.accessMode || 'private') : undefined,
      allowedUsersCount: req.isOwner ? (botDoc.allowedUsers || []).length : undefined,
      isOwner:           req.isOwner
    });
  } catch (e) {
    console.error('[API/settings/bot GET]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

// ─────────────────────────────────────────
// PATCH /api/settings/bot — bot sozlamalarini yangilash (faqat egasi)
// Body: { botName?, personality?, extraInstructions? }
// ─────────────────────────────────────────
async function updateBotSettings(req, res) {
  if (!req.isOwner) return res.status(403).json({ error: 'Faqat egasi o\'zgartira oladi' });

  try {
    var body    = req.body || {};
    var update  = {};
    var allowed = ['botName', 'personality', 'extraInstructions', 'accessMode'];
    var persVals = ['friendly', 'professional', 'funny', 'strict'];

    allowed.forEach(function(key) {
      if (body[key] !== undefined) {
        if (key === 'personality' && !persVals.includes(body[key])) return;
        if (key === 'botName' && !body[key].trim()) return;
        if (key === 'accessMode' && !['private','whitelist','open'].includes(body[key])) return;
        update[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
      }
    });

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'O\'zgartirish yo\'q' });
    }

    var botDoc = await UserBot.findByIdAndUpdate(req.botId, { $set: update }, { new: true });
    res.json({
      ok: true,
      botName:           botDoc.botName,
      personality:       botDoc.personality,
      extraInstructions: botDoc.extraInstructions
    });
  } catch (e) {
    console.error('[API/settings/bot PATCH]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

// ─────────────────────────────────────────
// GET /api/settings/personas — persona ro'yxati
// ─────────────────────────────────────────
async function getPersonas(req, res) {
  try {
    var uid  = req.user.userId;
    var list = await Persona.find({
      botId: req.botId, userTelegramId: uid, isActive: true
    }).sort({ createdAt: -1 });

    res.json({ personas: list, builtins: BUILTIN_PERSONAS });
  } catch (e) {
    console.error('[API/settings/personas GET]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

// ─────────────────────────────────────────
// POST /api/settings/personas — yangi persona yaratish
// Body: { name, emoji, systemPrompt, description } yoki { builtinKey }
// ─────────────────────────────────────────
async function createPersona(req, res) {
  try {
    var uid  = req.user.userId;
    var body = req.body || {};

    // Limit tekshiruvi
    var botDoc = await UserBot.findById(req.botId);
    var plan = botDoc ? (botDoc.currentPlan || 'free') : 'free';
    var used = await Persona.countDocuments({ botId: req.botId, userTelegramId: uid, isActive: true });
    var lc   = checkPersonaLimit(botDoc, used);
    if (!lc.allowed) return limitError(res, lc);

    var personaData;

    if (body.builtinKey) {
      var bp = BUILTIN_PERSONAS.find(function(p) { return p.key === body.builtinKey; });
      if (!bp) return res.status(404).json({ error: 'Tayyor model topilmadi' });
      // Allaqachon qo'shilganmi?
      var exists = await Persona.findOne({ botId: req.botId, userTelegramId: uid, name: bp.name, isActive: true });
      if (exists) return res.status(409).json({ error: 'Bu model allaqachon qo\'shilgan' });
      personaData = { botId: req.botId, userTelegramId: uid, name: bp.name, emoji: bp.emoji, description: bp.desc, systemPrompt: bp.prompt, isBuiltin: true };
    } else {
      if (!body.name || !body.systemPrompt) return res.status(400).json({ error: 'Nom va prompt kerak' });
      personaData = {
        botId: req.botId, userTelegramId: uid,
        name: body.name.trim(), emoji: (body.emoji || '🤖').slice(0,2),
        description: (body.description || '').trim(),
        systemPrompt: body.systemPrompt.trim(),
        isBuiltin: false
      };
    }

    var persona = await Persona.create(personaData);
    res.json({ ok: true, persona });
  } catch (e) {
    console.error('[API/settings/personas POST]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

// ─────────────────────────────────────────
// DELETE /api/settings/personas/:id
// ─────────────────────────────────────────
async function deletePersona(req, res) {
  try {
    var uid = req.user.userId;
    await Persona.findOneAndDelete({
      _id: req.params.id, botId: req.botId, userTelegramId: uid
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[API/settings/personas DELETE]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

// ─────────────────────────────────────────
// GET /api/settings/active-persona — faol persona
// ─────────────────────────────────────────
async function getActivePersona(req, res) {
  // Session-based emas — faqat info
  res.json({ activePersonaId: null }); // WebApp da session orqali boshqariladi
}

// ─────────────────────────────────────────
// POST /api/settings/clear — xotirani tozalash
// ─────────────────────────────────────────
async function clearMemory(req, res) {
  try {
    var uid = req.user.userId;
    await ChatHistory.findOneAndUpdate(
      { botId: req.botId, userTelegramId: uid },
      { $set: { messages: [], updatedAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[API/settings/clear]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

// ─────────────────────────────────────────
// PATCH /api/settings/language — til o'zgartirish
// Body: { language: 'uz'|'ru'|'en' }
// ─────────────────────────────────────────
async function updateLanguage(req, res) {
  try {
    var lang = (req.body && req.body.language) || '';
    if (!['uz','ru','en'].includes(lang)) {
      return res.status(400).json({ error: 'Noto\'g\'ri til kodi' });
    }
    // WebApp da faqat UI tili — bot tili egasi o'zgartiradi
    res.json({ ok: true, language: lang });
  } catch (e) {
    res.status(500).json({ error: 'Xato' });
  }
}

module.exports = {
  getBotSettings, updateBotSettings,
  getPersonas, createPersona, deletePersona,
  clearMemory, updateLanguage
};
