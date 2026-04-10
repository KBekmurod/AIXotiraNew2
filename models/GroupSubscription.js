'use strict';
const mongoose = require('mongoose');

const groupSubscriptionSchema = new mongoose.Schema({
  chatId:         { type: String, required: true },
  chatTitle:      { type: String, default: '' },
  botId:          { type: mongoose.Schema.Types.ObjectId, ref: 'UserBot' },

  // Kim to'ladi (guruh admini)
  payerUserId:    { type: String, default: '' },
  payerUsername:  { type: String, default: '' },
  payerFirstName: { type: String, default: '' },

  plan:           { type: String, enum: ['starter','pro','premium'], required: true },
  status:         { type: String, enum: ['pending','active','grace','expired'], default: 'pending' },

  uniqueId:       { type: String, required: true, unique: true },
  price:          { type: String, default: '' },
  durationMonths: { type: Number, default: 1 },

  createdAt:    { type: Date, default: Date.now },
  activatedAt:  { type: Date, default: null },
  expiresAt:    { type: Date, default: null },
  graceEndsAt:  { type: Date, default: null },

  notified7d: { type: Boolean, default: false },
  notified1d: { type: Boolean, default: false }
});

groupSubscriptionSchema.index({ chatId: 1, status: 1 });
groupSubscriptionSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('GroupSubscription', groupSubscriptionSchema);
