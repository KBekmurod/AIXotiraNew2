'use strict';
const mongoose = require('mongoose');

// ═══════════════════════════════════════════════
// SUBSCRIPTION MODEL
// Yangilangan: 4 plan, grace period, notifikatsiya flaglari
// ═══════════════════════════════════════════════

const subscriptionSchema = new mongoose.Schema({
  // ── FOYDALANUVCHI ──
  telegramId:     { type: String, required: true },
  firstName:      { type: String, default: '' },
  username:       { type: String, default: '' },

  // ── QAYSI BOT UCHUN ──
  botId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', default: null },

  // ── TARIF ──
  // 'starter' | 'pro' | 'premium'
  plan:           { type: String, enum: ['starter','pro','premium'], required: true },

  // ── HOLAT ──
  // pending  → to'lov kutilmoqda
  // active   → faol, vaqt o'tmoqda
  // grace    → muddat tugadi, 3 kun grace period
  // expired  → to'liq tugagan, free ga tushdi
  status:         { type: String, enum: ['pending','active','grace','expired'], default: 'pending' },

  // ── UNIKAL ID (to'lov uchun) ──
  // Format: STARTER-A3F9, PRO-K7M2, PREMIUM-X9Q1
  uniqueId:       { type: String, required: true, unique: true },

  // ── NARX VA MUDDAT ──
  price:          { type: String, default: '' },
  durationMonths: { type: Number, default: 1 },

  // ── VAQT BELGILARI ──
  createdAt:      { type: Date, default: Date.now },
  activatedAt:    { type: Date, default: null },
  expiresAt:      { type: Date, default: null },
  graceEndsAt:    { type: Date, default: null },  // expiresAt + 3 kun

  // ── ESLATMA FLAGLARI (scheduler uchun) ──
  notified7d:     { type: Boolean, default: false }, // 7 kun oldin eslatma yuborildimi
  notified1d:     { type: Boolean, default: false }  // 1 kun oldin eslatma yuborildimi
});

// Tezkor qidiruv uchun indekslar
subscriptionSchema.index({ telegramId: 1, status: 1 });
subscriptionSchema.index({ status: 1, expiresAt: 1 });
subscriptionSchema.index({ status: 1, graceEndsAt: 1 });

// Obuna faolmi?
subscriptionSchema.methods.isCurrentlyActive = function () {
  return (this.status === 'active' || this.status === 'grace') &&
         this.expiresAt &&
         new Date() < this.expiresAt;
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
