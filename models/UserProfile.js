'use strict';
const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
  botId:             { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', required: true },
  userTelegramId:    { type: String, required: true },

  // Telegram ma'lumotlari
  firstName:         { type: String, default: '' },
  telegramUsername:  { type: String, default: '' },
  joinedAt:          { type: Date, default: Date.now },

  // Management
  isBlocked:         { type: Boolean, default: false },
  blockedAt:         { type: Date, default: null },
  blockedReason:     { type: String, default: '' },

  // Obuna
  currentPlan:       { type: String, enum: ['free','starter','pro','premium'], default: 'free' },

  // Oylik limitlar
  monthlyMessages:   { type: Number, default: 0 },
  monthlyPpt:        { type: Number, default: 0 },
  monthlyPptPro:     { type: Number, default: 0 },
  monthlySessions:   { type: Number, default: 0 },
  monthlyReset:      { type: String, default: '' },

  // Statistika
  totalMessages:     { type: Number, default: 0 },

  // Variant B - Shaxsiy AI sozlamalari
  // null = botConfig (global) ishlatiladi
  customBotName:     { type: String, default: null },
  customPersonality: { type: String, enum: ['friendly','professional','funny','strict',null], default: null },
  customTopics:      [{ type: String }],
  customExtra:       { type: String, default: null },
  customUserTitle:   { type: String, default: null },
  customLanguage:    { type: String, enum: ['uz','ru','en',null], default: null },

  createdAt:         { type: Date, default: Date.now },
  updatedAt:         { type: Date, default: Date.now }
});

userProfileSchema.index({ botId: 1, userTelegramId: 1 }, { unique: true });
userProfileSchema.index({ botId: 1, isBlocked: 1 });

module.exports = mongoose.model('UserProfile', userProfileSchema);
