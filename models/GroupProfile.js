'use strict';
const mongoose = require('mongoose');

// ═══════════════════════════════════════════════
// GROUP PROFILE — Har bir gruppa/kanal uchun
// alohida plan, limitlar va adminlar ro'yxati
// ═══════════════════════════════════════════════

const groupProfileSchema = new mongoose.Schema({
  // ── IDENTIFIKATOR ──
  botId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', required: true },
  chatId:         { type: String, required: true },   // Telegram chat_id (manfiy son)
  chatType:       { type: String, enum: ['group','supergroup','channel'], default: 'group' },
  chatTitle:      { type: String, default: '' },

  // ── OBUNA REJIMI ──
  currentPlan:    { type: String, enum: ['free','starter','pro','premium'], default: 'free' },

  // ── OYLIK LIMITLAR (umumiy gruppa uchun) ──
  monthlyMessages:  { type: Number, default: 0 },
  monthlyPpt:       { type: Number, default: 0 },
  monthlyReset:     { type: String, default: '' },   // 'YYYY-MM'

  // ── ADMINLAR (gruppa obunasini boshqaruvchilar) ──
  adminUserIds:   [{ type: String }],   // Telegram user_id lar

  // ── HOLAT ──
  isActive:       { type: Boolean, default: true },
  totalMessages:  { type: Number, default: 0 },

  createdAt:      { type: Date, default: Date.now },
  updatedAt:      { type: Date, default: Date.now }
});

// Har bir bot + chat juftligi unikal
groupProfileSchema.index({ botId: 1, chatId: 1 }, { unique: true });

module.exports = mongoose.model('GroupProfile', groupProfileSchema);
