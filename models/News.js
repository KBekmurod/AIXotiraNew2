'use strict';
const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
  title:     { type: String, required: true },          // sarlavha
  body:      { type: String, required: true },          // asosiy matn
  mediaId:   { type: String, default: '' },             // Telegram file_id (rasm)
  mediaType: { type: String, enum: ['photo','video','none'], default: 'none' },
  footer:    { type: String, default: '' },             // teglar yoki linklar (ixtiyoriy)
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

newsSchema.index({ createdAt: -1 });

module.exports = mongoose.model('News', newsSchema);
