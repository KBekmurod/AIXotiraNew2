'use strict';
const mongoose = require('mongoose');

// Shaxsiyat (Persona) — foydalanuvchi yaratgan yoki tayyor model
const personaSchema = new mongoose.Schema({
  botId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', required: true },
  userTelegramId: { type: String, required: true },

  name:        { type: String, required: true },   // "Murabbiy", "Do'stim", "Doktor"
  description: { type: String, default: '' },      // foydalanuvchi tavsifi
  systemPrompt:{ type: String, required: true },   // AI ga beriladigan ko'rsatma
  emoji:       { type: String, default: '🤖' },    // belgisi
  isBuiltin:   { type: Boolean, default: false },  // tayyor modelmi
  isActive:    { type: Boolean, default: true },

  createdAt:   { type: Date, default: Date.now }
});

personaSchema.index({ botId: 1, userTelegramId: 1 });

module.exports = mongoose.model('Persona', personaSchema);
