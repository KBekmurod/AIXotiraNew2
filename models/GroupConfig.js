'use strict';
const mongoose = require('mongoose');

const groupConfigSchema = new mongoose.Schema({
  // Guruh ma'lumotlari
  chatId:        { type: String, required: true, unique: true },
  chatTitle:     { type: String, default: '' },
  chatType:      { type: String, enum: ['group','supergroup'], default: 'group' },

  // Qaysi bot va kim ulagan
  botId:         { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', required: true },
  addedByUserId: { type: String, required: true }, // ulagan admin Telegram ID

  // Obuna
  currentPlan:   { type: String, enum: ['free','starter','pro','premium'], default: 'free' },

  // Javob rejimi
  // 'mention'  — faqat @bot mention
  // 'reply'    — faqat reply
  // 'all'      — barcha xabarlarga
  replyMode:     { type: String, enum: ['mention','reply','all'], default: 'mention' },

  // Oylik statistika
  monthlyMessages: { type: Number, default: 0 },
  monthlyReset:    { type: String,  default: '' },

  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

groupConfigSchema.index({ botId: 1 });
groupConfigSchema.index({ chatId: 1, botId: 1 });

module.exports = mongoose.model('GroupConfig', groupConfigSchema);
