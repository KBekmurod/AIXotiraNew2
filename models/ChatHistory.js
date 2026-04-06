'use strict';
const mongoose = require('mongoose');

// Bu model - botning "xotirasi"
// Har bir foydalanuvchi uchun suhbat tarixi saqlanadi
const messageSchema = new mongoose.Schema({
  role:    { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  savedAt: { type: Date, default: Date.now }
}, { _id: false });

const chatHistorySchema = new mongoose.Schema({
  botId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', required: true },
  userTelegramId: { type: String, required: true },
  // Xotira - so'nggi 30 ta xabar saqlanadi
  messages:       [messageSchema],
  updatedAt:      { type: Date, default: Date.now }
});

// Har bir bot + user juftligi uchun bitta xotira
chatHistorySchema.index({ botId: 1, userTelegramId: 1 }, { unique: true });

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
