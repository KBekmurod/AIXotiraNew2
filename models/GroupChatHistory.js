'use strict';
const mongoose = require('mongoose');

// ═══════════════════════════════════════════════
// GROUP CHAT HISTORY — Gruppa suhbat xotirasi
// Har bir (botId + chatId + userTelegramId) uchun
// alohida kontekst saqlanadi
// ═══════════════════════════════════════════════

const messageSchema = new mongoose.Schema({
  role:           { type: String, enum: ['user','assistant'], required: true },
  content:        { type: String, required: true },
  userName:       { type: String, default: '' },   // Kim yozgani (ko'rinish uchun)
  savedAt:        { type: Date, default: Date.now }
}, { _id: false });

const groupChatHistorySchema = new mongoose.Schema({
  botId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', required: true },
  chatId:         { type: String, required: true },         // Gruppa chat_id
  userTelegramId: { type: String, required: true },         // Xabar yozgan user

  // So'nggi 20 ta xabar saqlanadi (shaxsiy botda 30 ta)
  messages:       [messageSchema],
  updatedAt:      { type: Date, default: Date.now }
});

// Tezkor qidiruv
groupChatHistorySchema.index({ botId: 1, chatId: 1, userTelegramId: 1 }, { unique: true });
groupChatHistorySchema.index({ botId: 1, chatId: 1 });

module.exports = mongoose.model('GroupChatHistory', groupChatHistorySchema);
