'use strict';
const mongoose = require('mongoose');

const videoFileSchema = new mongoose.Schema({
  botId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot', required: true },
  userTelegramId: { type: String, required: true },

  // Video ma'lumotlari
  style:          { type: String, default: 'warm' },
  mood:           { type: String, default: '' },
  duration:       { type: Number, default: 10 },
  effects:        [{ type: String }],
  textOverlay:    { type: String, default: '' },

  // Telegram file_id (qayta yuborish uchun)
  fileId:         { type: String, default: '' },
  fileName:       { type: String, default: '' },

  createdAt: { type: Date, default: Date.now }
});

videoFileSchema.index({ botId: 1, userTelegramId: 1 });

module.exports = mongoose.model('VideoFile', videoFileSchema);
