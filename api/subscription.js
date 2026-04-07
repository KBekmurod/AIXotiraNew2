'use strict';

const Subscription = require('../models/Subscription');
const UserBot      = require('../models/UserBot');
const { generateUniqueId, PLAN_NAMES, PLAN_PRICES } = require('./helpers');

// GET /api/subscription
async function getSubscription(req, res) {
  try {
    var uid    = req.user.userId;
    var botDoc = await UserBot.findById(req.botId);
    var plan   = botDoc ? (botDoc.currentPlan || 'free') : 'free';

    var sub = await Subscription.findOne({
      telegramId: uid, status: { $in: ['active','grace','pending'] }
    }).sort({ createdAt: -1 });

    var subInfo = null;
    if (sub) {
      var dl = sub.expiresAt ? Math.ceil((sub.expiresAt - new Date()) / (1000*60*60*24)) : 0;
      subInfo = {
        plan:      sub.plan,
        planName:  PLAN_NAMES[sub.plan] || sub.plan,
        status:    sub.status,
        uniqueId:  sub.uniqueId,
        expiresAt: sub.expiresAt ? sub.expiresAt.toLocaleDateString('ru-RU') : null,
        daysLeft:  dl > 0 ? dl : 0
      };
    }

    res.json({
      currentPlan:   plan,
      planName:      PLAN_NAMES[plan] || plan,
      subscription:  subInfo,
      plans: [
        { key: 'starter', name: 'Starter', price: PLAN_PRICES.starter },
        { key: 'pro',     name: 'Pro',     price: PLAN_PRICES.pro     },
        { key: 'premium', name: 'Premium', price: PLAN_PRICES.premium }
      ],
      adminUsername: process.env.ADMIN_USERNAME || ''
    });
  } catch (e) {
    console.error('[API/subscription GET]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

// POST /api/subscription — buyurtma yaratish
// Body: { plan: 'starter'|'pro'|'premium' }
async function createOrder(req, res) {
  try {
    var uid      = req.user.userId;
    var selPlan  = (req.body && req.body.plan) || '';
    var validPlans = ['starter','pro','premium'];

    if (!validPlans.includes(selPlan)) {
      return res.status(400).json({ error: 'Noto\'g\'ri tarif' });
    }

    // Pending buyurtma bormi?
    var pending = await Subscription.findOne({ telegramId: uid, status: 'pending' });
    if (pending) {
      return res.status(409).json({
        error:    'Kutilayotgan to\'lovingiz bor',
        code:     'PENDING_EXISTS',
        uniqueId: pending.uniqueId,
        plan:     pending.plan
      });
    }

    // Allaqachon faol obuna bormi?
    var active = await Subscription.findOne({ telegramId: uid, status: { $in: ['active','grace'] } });
    if (active && active.plan === selPlan) {
      return res.status(409).json({
        error: 'Bu tarif allaqachon faol',
        code:  'ALREADY_ACTIVE'
      });
    }

    var uniqueId  = await generateUniqueId(selPlan);
    var price     = PLAN_PRICES[selPlan].discounted;
    var planName  = PLAN_NAMES[selPlan];
    var firstName = req.user.firstName || '';
    var username  = req.user.username  || '';

    await Subscription.create({
      telegramId:     uid,
      firstName:      firstName,
      username:       username,
      plan:           selPlan,
      uniqueId:       uniqueId,
      price:          price,
      durationMonths: 1,
      status:         'pending'
    });

    // Admin botiga xabar
    try {
      var adminId = process.env.SUPER_ADMIN_ID;
      if (adminId) {
        var adminMsg = '\u2B50 Yangi obuna so\'rovi (WebApp)\n\n' +
          'Foydalanuvchi: ' + firstName + (username ? ' (@' + username + ')' : '') + '\n' +
          'Telegram ID: ' + uid + '\n' +
          'Tarif: ' + planName + '\n' +
          'ID: ' + uniqueId + '\n' +
          'Narx: ' + price + ' so\'m/oy\n\n' +
          'Tasdiqlash: /activate ' + uniqueId;

        var tgUrl = 'https://api.telegram.org/bot' + process.env.INDIVIDUAL_BOT_TOKEN +
          '/sendMessage';
        var fetch2 = require('node-fetch');
        await fetch2(tgUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id:      adminId,
            text:         adminMsg,
            reply_markup: {
              inline_keyboard: [[{
                text:          '\u2705 Tasdiqlash — ' + uniqueId,
                callback_data: 'adm_activate_' + uniqueId
              }]]
            }
          })
        });
      }
    } catch(e) {
      console.warn('[Sub] Admin ga xabar xato:', e.message);
    }

    var payText = planName + ' obunani rasmiylashtirmoqchiman. ID: ' + uniqueId;
    var payLink = 'https://t.me/' + (process.env.ADMIN_USERNAME || '') +
      '?text=' + encodeURIComponent(payText);

    res.json({
      ok:       true,
      uniqueId: uniqueId,
      plan:     selPlan,
      planName: planName,
      price:    price,
      payLink:  payLink,
      payText:  payText,
      cardNumber: process.env.CARD_NUMBER || ''
    });
  } catch (e) {
    console.error('[API/subscription POST]', e.message);
    res.status(500).json({ error: 'Xato: ' + e.message });
  }
}

// DELETE /api/subscription/pending — pending buyurtmani bekor qilish
async function cancelOrder(req, res) {
  try {
    var uid = req.user.userId;
    var sub = await Subscription.findOneAndDelete({ telegramId: uid, status: 'pending' });
    if (!sub) return res.status(404).json({ error: 'Pending buyurtma topilmadi' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Xato' });
  }
}

module.exports = { getSubscription, createOrder, cancelOrder };
