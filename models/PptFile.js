'use strict';
const mongoose = require('mongoose');

// Yaratilgan prezentatsiyalar — Telegram file_id bilan
// file_id orqali qayta yuborish mumkin (yuklanmaydi)
const pptFileSchema = new mongoose.Schema({
  botId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', required: true },
  userTelegramId: { type: String, required: true },
  topic:          { type: String, default: '' },       // Prezentatsiya mavzusi
  fileName:       { type: String, default: '' },       // .pptx fayl nomi
  fileId:         { type: String, required: true },    // Telegram file_id
  isPro:          { type: Boolean, default: false },   // Professional rejim
  slideCount:     { type: Number, default: 0 },
  createdAt:      { type: Date, default: Date.now }
});

pptFileSchema.index({ botId: 1, userTelegramId: 1, createdAt: -1 });

module.exports = mongoose.model('PptFile', pptFileSchema);
