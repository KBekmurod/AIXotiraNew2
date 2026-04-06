'use strict';

const Subscription = require('../models/Subscription');
const UserBot      = require('../models/UserBot');

const PLAN_NAMES = {
  free: 'Free', starter: 'Starter', pro: 'Pro', premium: 'Premium'
};

const PLAN_PRICES = {
  starter: { discounted: '19 000', original: '29 000' },
  pro:     { discounted: '39 000', original: '59 000' },
  premium: { discounted: '59 000', original: '99 000' }
};

// GET /api/subscription — hozirgi obuna holati
async function getSubscription(req, res) {
  try {
    var uid    = req.user.userId;
    var botDoc = await UserBot.findById(req.botId);
    var plan   = botDoc ? (botDoc.currentPlan || 'free') : 'free';

    var sub = await Subscription.findOne({
      telegramId: uid, status: { $in: ['active','grace','pending'] }
    }).sort({ activatedAt: -1 });

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
      currentPlan:  plan,
      planName:     PLAN_NAMES[plan] || plan,
      subscription: subInfo,
      plans: [
        { key: 'starter', name: 'Starter', price: PLAN_PRICES.starter },
        { key: 'pro',     name: 'Pro',     price: PLAN_PRICES.pro     },
        { key: 'premium', name: 'Premium', price: PLAN_PRICES.premium }
      ],
      cardNumber:   process.env.CARD_NUMBER || '',
      adminUsername: process.env.ADMIN_USERNAME || ''
    });
  } catch (e) {
    console.error('[API/subscription]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

module.exports = { getSubscription };
