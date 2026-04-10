'use strict';

const express = require('express');
const path    = require('path');

const { verifyHandler }   = require('./api/auth');
const { authMiddleware }  = require('./api/middleware');
const { getChat, postChat, deleteChat } = require('./api/chat');
const { getSessions, getSession, createSession, deleteSession } = require('./api/sessions');
const { getStats }        = require('./api/stats');
const { getNews, getOneNews } = require('./api/news');
const { getPpts, createPpt, deletePpt } = require('./api/ppt');
const { getSubscription, createOrder, cancelOrder } = require('./api/subscription');
const {
  getBotSettings, updateBotSettings,
  getPersonas, createPersona, deletePersona,
  clearMemory, updateLanguage
} = require('./api/settings');

var app = express();

// ── MIDDLEWARE ──
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS — Telegram Mini App uchun
app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── STATIK FAYLLAR — webapp/ (hozircha o'chirilgan) ──
// app.use(express.static(path.join(__dirname, 'webapp')));

// ── AUTH ──
app.post('/api/auth/verify', verifyHandler);

// ── HIMOYALANGAN API ENDPOINTLAR ──
app.use('/api', authMiddleware);

// Foydalanuvchi ma'lumotlari
app.get('/api/user/info', function(req, res) {
  var botDoc = req.botDoc;
  res.json({
    userId:    req.user.userId,
    firstName: req.user.firstName,
    isOwner:   req.isOwner,
    botName:   botDoc.botName,
    language:  botDoc.language || 'uz',
    plan:      botDoc.currentPlan || 'free'
  });
});

// Suhbat (asosiy xotira)
app.get('/api/chat',    getChat);
app.post('/api/chat',   postChat);
app.delete('/api/chat', deleteChat);

// Suhbat fayllari
app.get('/api/sessions',        getSessions);
app.get('/api/sessions/:id',    getSession);
app.post('/api/sessions',       createSession);
app.delete('/api/sessions/:id', deleteSession);

// Statistika
app.get('/api/stats', getStats);

// Yangiliklar
app.get('/api/news',     getNews);
app.get('/api/news/:id', getOneNews);

// Prezentatsiya
app.get('/api/ppt',           getPpts);
app.post('/api/ppt',          createPpt);
app.delete('/api/ppt/:id',    deletePpt);

// Obuna
app.get('/api/subscription',           getSubscription);
app.post('/api/subscription',          createOrder);
app.delete('/api/subscription/pending', cancelOrder);

// Sozlamalar — bot
app.get('/api/settings/bot',     getBotSettings);
app.patch('/api/settings/bot',   updateBotSettings);

// Sozlamalar — persona
app.get('/api/settings/personas',          getPersonas);
app.post('/api/settings/personas',         createPersona);
app.delete('/api/settings/personas/:id',   deletePersona);

// Sozlamalar — til va tozalash
app.patch('/api/settings/language', updateLanguage);
app.post('/api/settings/clear',     clearMemory);

// SPA fallback — barcha noma'lum GET so'rovlar index.html ga
app.get('*', function(req, res) {
  res.status(404).json({ error: 'Web interface not available' });
});

// ── ISHGA TUSHIRISH ──
function start() {
  var PORT = process.env.PORT || 3000;
  app.listen(PORT, function() {
    console.log('[Server] ✅ Express server ishga tushdi: port ' + PORT);
    // console.log('[Server] WebApp URL: disabled');
  });
}

module.exports = { start, app };
