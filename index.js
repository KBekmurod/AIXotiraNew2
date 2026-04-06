'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { adminBot, loadActiveBots, activeBots } = require('./super-admin');
const scheduler = require('./scheduler');

// ═══════════════════════════════════════════════
// MUHIT TEKSHIRUVI
// ═══════════════════════════════════════════════
var required = [
  'MONGODB_URI',
  'SUPER_ADMIN_BOT_TOKEN',
  'SUPER_ADMIN_ID',
  'ADMIN_USERNAME',
  'CARD_NUMBER',
  'INDIVIDUAL_BOT_TOKEN'   // DB da UserBot yo'q bo'lsa ishga tushirishda xabar berish uchun
];

var missing = required.filter(function(key) { return !process.env[key]; });
if (missing.length) {
  console.error('❌ .env da quyidagi maydonlar etishmayapti:');
  missing.forEach(function(key) { console.error('   ' + key); });
  process.exit(1);
}

// ═══════════════════════════════════════════════
// ASOSIY ISHGA TUSHIRISH
// ═══════════════════════════════════════════════
async function main() {
  // 1. MongoDB
  console.log('[Main] MongoDB ulanmoqda...');
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser:    true,
    useUnifiedTopology: true
  });
  console.log('[Main] ✅ MongoDB ulandi');

  // 2. Individual bot(lar) yuklanadi
  // Agar DB da UserBot yo'q bo'lsa — ENV token bilan avtomatik yaratiladi
  var UserBot = require('./models/UserBot');
  var existingBot = await UserBot.findOne({ isActive: true });
  if (!existingBot && process.env.INDIVIDUAL_BOT_TOKEN) {
    console.log('[Main] DB da bot topilmadi — yangi yozuv yaratilmoqda...');
    await UserBot.create({
      botToken:        process.env.INDIVIDUAL_BOT_TOKEN,
      botUsername:     'individual_bot',
      botName:         'AI Yordamchi',
      ownerTelegramId: process.env.SUPER_ADMIN_ID,
      ownerName:       'Admin',
      isActive:        true,
      currentPlan:     'free',
      allowedUsers:    [],
      maxUsers:        50,
      language:        'uz',
      personality:     'friendly',
      topics:          [],
      extraInstructions: '',
      userTitle:       "do'stim",
      totalMessages:   0,
      monthlyReset:    ''
    });
    console.log('[Main] ✅ Yangi bot yozuvi yaratildi. botUsername ni DB da yangilang!');
  }

  console.log('[Main] Botlar yuklanmoqda...');
  await loadActiveBots();
  console.log('[Main] ' + activeBots.size + ' ta bot yuklandi');

  // 3. Scheduler ni birinchi bot bilan bog'lash
  if (activeBots.size > 0) {
    var firstBot = null;
    for (var [, rb] of activeBots) { firstBot = rb; break; }
    if (firstBot && firstBot.botConfig) {
      scheduler.setBot(firstBot, firstBot.botConfig);
      console.log('[Main] Scheduler bot bilan bog\'landi: @' + firstBot.botConfig.botUsername);
    }
  } else {
    console.warn('[Main] ⚠️ Faol bot topilmadi. DB da UserBot yozuvi borligini tekshiring.');
  }

  // 4. Admin bot
  adminBot.launch({ dropPendingUpdates: true });
  console.log('[Main] ✅ Admin bot ishga tushdi');

  // 5. Scheduler
  scheduler.start();

  // 6. Express server (Mini App + API)
  var server = require('./server');
  server.start();

  console.log('\n✅ Tizim to\'liq ishga tushdi!\n');
}

main().catch(function(err) {
  console.error('❌ Tizim xatosi:', err);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', async function() {
  console.log('\n[Main] SIGINT — to\'xtatilmoqda...');
  adminBot.stop('SIGINT');
  scheduler.stop();
  for (var [, rb] of activeBots) { try { rb.stop('SIGINT'); } catch(_) {} }
  await mongoose.disconnect();
  process.exit(0);
});
process.once('SIGTERM', async function() {
  console.log('\n[Main] SIGTERM — to\'xtatilmoqda...');
  adminBot.stop('SIGTERM');
  scheduler.stop();
  for (var [, rb] of activeBots) { try { rb.stop('SIGTERM'); } catch(_) {} }
  await mongoose.disconnect();
  process.exit(0);
});
