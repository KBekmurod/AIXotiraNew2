'use strict';

const express = require('express');
const path    = require('path');

const { verifyHandler }   = require('./api/auth');
const { authMiddleware }  = require('./api/middleware');
const { getChat, postChat, deleteChat } = require('./api/chat');
const { getSessions, getSession, createSession, deleteSession } = require('./api/sessions');
const { getStats }        = require('./api/stats');
const { getNews, getOneNews } = require('./api/news');
const { getPpts, createPpt }  = require('./api/ppt');
const { getSubscription } = require('./api/subscription');

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

// ── STATIK FAYLLAR — webapp/ ──
app.use(express.static(path.join(__dirname, 'webapp')));

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
app.get('/api/ppt',  getPpts);
app.post('/api/ppt', createPpt);

// Obuna
app.get('/api/subscription', getSubscription);

// SPA fallback — barcha noma'lum GET so'rovlar index.html ga
app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'webapp', 'index.html'));
});

// ── ISHGA TUSHIRISH ──
function start() {
  var PORT = process.env.PORT || 3000;
  app.listen(PORT, function() {
    console.log('[Server] ✅ Express server ishga tushdi: port ' + PORT);
    console.log('[Server] WebApp URL: ' + (process.env.WEBAPP_URL || 'http://localhost:' + PORT));
  });
}

module.exports = { start, app };
