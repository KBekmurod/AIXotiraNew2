'use strict';
const mongoose = require('mongoose');

// Broadcast — admin tomonidan foydalanuvchilarga yuboriladigan reklama xabarlari
// Nofaol holda yaratiladi — admin tayyor bo'lganda yuboradi
const broadcastSchema = new mongoose.Schema({
  title:     { type: String, required: true },          // admin uchun ichki nom
  body:      { type: String, required: true },          // asosiy matn
  mediaId:   { type: String, default: '' },             // Telegram file_id (rasm)
  mediaType: { type: String, enum: ['photo','video','none'], default: 'none' },
  footer:    { type: String, default: '' },             // teglar yoki linklar (ixtiyoriy)
  status:    { type: String, enum: ['pending', 'sent'], default: 'pending' },
  sentAt:    { type: Date, default: null },
  sentCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

broadcastSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Broadcast', broadcastSchema);
