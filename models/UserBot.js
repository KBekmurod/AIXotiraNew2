'use strict';
const mongoose = require('mongoose');

// ═══════════════════════════════════════════════
// USERBOT MODEL
// Yangilangan: currentPlan, oylik limitlar
// Olib tashlandi: isActivated, trialUsed*, daily*
// ═══════════════════════════════════════════════

const userBotSchema = new mongoose.Schema({
  // ── BOT MA'LUMOTLARI ──
  ownerTelegramId:   { type: String, required: true },
  ownerName:         { type: String, default: '' },
  botToken:          { type: String, required: true },
  botUsername:       { type: String, required: true },
  botName:           { type: String, required: true },
  userTitle:         { type: String, default: "do'stim" },

  // ── KONTENT SOZLAMALARI ──
  topics:            [{ type: String }],
  personality:       { type: String, enum: ['friendly','professional','funny','strict'], default: 'friendly' },
  language:          { type: String, enum: ['uz','ru','en'], default: 'uz' },
  extraInstructions: { type: String, default: '' },

  // ── FOYDALANUVCHILAR ──
  allowedUsers:      [{ type: String }],
  maxUsers:          { type: Number, default: 50 },
  totalMessages:     { type: Number, default: 0 },
  isActive:          { type: Boolean, default: true },

  // ── OBUNA REJIMI ──
  // 'free' | 'starter' | 'pro' | 'premium'
  currentPlan:       { type: String, enum: ['free','starter','pro','premium'], default: 'free' },

  // ── OYLIK LIMITLAR ──
  // Har oy 1-sanada (YYYY-MM o'zgarganda) reset bo'ladi
  monthlyMessages:   { type: Number, default: 0 },   // AI suhbat xabarlari
  monthlyPpt:        { type: Number, default: 0 },   // Oddiy prezentatsiya
  monthlyPptPro:     { type: Number, default: 0 },   // Professional prezentatsiya
  monthlySessions:   { type: Number, default: 0 },   // Suhbat fayllari
  monthlyReset:      { type: String, default: '' },  // 'YYYY-MM' formatda oxirgi reset oyi

  createdAt:         { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserBot', userBotSchema);
