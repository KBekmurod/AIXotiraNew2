'use strict';
const mongoose = require('mongoose');

// Suhbat fayli — har bir mavzu bo'yicha alohida suhbat
const messageSchema = new mongoose.Schema({
  role:    { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  savedAt: { type: Date, default: Date.now }
}, { _id: false });

const chatSessionSchema = new mongoose.Schema({
  botId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', required: true },
  userTelegramId: { type: String, required: true },

  title:      { type: String, required: true },   // "Ish rejasi", "Sog'liq", "Ingliz tili"
  personaId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Persona', default: null },
  messages:   [messageSchema],
  isActive:   { type: Boolean, default: true },   // false = arxivda

  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now }
});

chatSessionSchema.index({ botId: 1, userTelegramId: 1, updatedAt: -1 });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
