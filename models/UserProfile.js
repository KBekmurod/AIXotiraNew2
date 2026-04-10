'use strict';
const mongoose = require('mongoose');

// ═══════════════════════════════════════════════
// USER PROFILE — Har bir foydalanuvchi uchun alohida
// plan, limitlar va obuna holati
// ═══════════════════════════════════════════════

const userProfileSchema = new mongoose.Schema({
  // ── IDENTIFIKATOR ──
  botId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', required: true },
  userTelegramId: { type: String, required: true },

  // ── OBUNA REJIMI ──
  // 'free' | 'starter' | 'pro' | 'premium'
  currentPlan:    { type: String, enum: ['free','starter','pro','premium'], default: 'free' },

  // ── OYLIK LIMITLAR ──
  monthlyMessages:  { type: Number, default: 0 },
  monthlyPpt:       { type: Number, default: 0 },
  monthlyPptPro:    { type: Number, default: 0 },
  monthlySessions:  { type: Number, default: 0 },
  monthlyReset:     { type: String, default: '' },  // 'YYYY-MM'

  // ── UMUMIY STATISTIKA ──
  totalMessages:  { type: Number, default: 0 },

  createdAt:      { type: Date, default: Date.now },
  updatedAt:      { type: Date, default: Date.now }
});

// Har bir bot + user juftligi unikal
userProfileSchema.index({ botId: 1, userTelegramId: 1 }, { unique: true });

module.exports = mongoose.model('UserProfile', userProfileSchema);
