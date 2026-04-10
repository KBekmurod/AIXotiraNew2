'use strict';

// ═══════════════════════════════════════════════
// INTERFEYS TILLARI: O'zbek / Rus / Ingliz
// Yangilangan: obuna tizimi, oylik limitlar, yangi menyu
// ═══════════════════════════════════════════════

const T = {

  // ── TIL TANLASH ──
  choose_lang: {
    uz: '🌐 Tilni tanlang:',
    ru: '🌐 Выберите язык:',
    en: '🌐 Choose language:'
  },

  // ── ASOSIY MENYU TUGMALARI ──
  btn_chat: {
    uz: '💬 Suhbat',
    ru: '💬 Чат',
    en: '💬 Chat'
  },
  btn_stats: {
    uz: '📊 Statistika',
    ru: '📊 Статистика',
    en: '📊 Statistics'
  },
  btn_sessions: {
    uz: '🗂 Suhbatlar',
    ru: '🗂 Беседы',
    en: '🗂 Sessions'
  },
  btn_settings: {
    uz: '⚙️ Sozlamalar',
    ru: '⚙️ Настройки',
    en: '⚙️ Settings'
  },
  btn_prompt: {
    uz: '🎭 Promptizatsiya',
    ru: '🎭 Промпты',
    en: '🎭 Prompts'
  },
  btn_ppt: {
    uz: '🎨 Prezentatsiya',
    ru: '🎨 Презентация',
    en: '🎨 Presentation'
  },
  btn_news: {
    uz: '📰 Yangiliklar',
    ru: '📰 Новости',
    en: '📰 News'
  },
  btn_clear: {
    uz: '🗑 Tozalash',
    ru: '🗑 Очистить',
    en: '🗑 Clear'
  },
  btn_subscribe: {
    uz: '⭐ Obuna',
    ru: '⭐ Подписка',
    en: '⭐ Subscribe'
  },
  btn_files: {
    uz: '📁 Fayllarim',
    ru: '📁 Мои файлы',
    en: '📁 My Files'
  },
  btn_ai_chats: {
    uz: '💬 AI Suhbatlar',
    ru: '💬 AI Беседы',
    en: '💬 AI Chats'
  },
  btn_presentations: {
    uz: '🎨 Prezentatsiyalar',
    ru: '🎨 Презентации',
    en: '🎨 Presentations'
  },
  btn_close: {
    uz: '✕ Yopish',
    ru: '✕ Закрыть',
    en: '✕ Close'
  },
  btn_back: {
    uz: '◀️ Orqaga',
    ru: '◀️ Назад',
    en: '◀️ Back'
  },
  btn_new_session: {
    uz: '📝 Yangi suhbat',
    ru: '📝 Новая беседа',
    en: '📝 New session'
  },
  btn_change_lang: {
    uz: '🌐 Tilni o\'zgartirish',
    ru: '🌐 Сменить язык',
    en: '🌐 Change language'
  },
  btn_continue: {
    uz: '▶️ Davom etish',
    ru: '▶️ Продолжить',
    en: '▶️ Continue'
  },

  // ── START / XUSH KELIBSIZ ──
  start_greeting: {
    uz: (name, title) => `Salom, ${name}! 👋\n\nMen sizning shaxsiy AI yordamchingizman.\n\nNima haqida gaplashamiz, ${title}?`,
    ru: (name, title) => `Привет, ${name}! 👋\n\nЯ ваш личный AI-ассистент.\n\nО чём поговорим, ${title}?`,
    en: (name, title) => `Hello, ${name}! 👋\n\nI'm your personal AI assistant.\n\nWhat shall we talk about, ${title}?`
  },

  // ── STATISTIKA ──
  stats_title: {
    uz: '📊 Statistika',
    ru: '📊 Статистика',
    en: '📊 Statistics'
  },
  stats_messages: {
    uz: (n) => `📨 Jami xabarlar: ${n} ta`,
    ru: (n) => `📨 Всего сообщений: ${n}`,
    en: (n) => `📨 Total messages: ${n}`
  },
  stats_sessions: {
    uz: (n) => `🗂 Suhbat fayllari: ${n} ta`,
    ru: (n) => `🗂 Файлов бесед: ${n}`,
    en: (n) => `🗂 Session files: ${n}`
  },
  stats_plan: {
    uz: (plan) => `⭐ Tarif: ${plan}`,
    ru: (plan) => `⭐ Тариф: ${plan}`,
    en: (plan) => `⭐ Plan: ${plan}`
  },
  stats_expires: {
    uz: (date) => `📅 Muddat: ${date} gacha`,
    ru: (date) => `📅 До: ${date}`,
    en: (date) => `📅 Until: ${date}`
  },
  stats_monthly_ai: {
    uz: (used, max) => `💬 AI xabarlar: ${used}/${max === Infinity ? '∞' : max}`,
    ru: (used, max) => `💬 AI сообщений: ${used}/${max === Infinity ? '∞' : max}`,
    en: (used, max) => `💬 AI messages: ${used}/${max === Infinity ? '∞' : max}`
  },
  stats_monthly_ppt: {
    uz: (used, max) => `🎨 Prezentatsiya: ${used}/${max === Infinity ? '∞' : max}`,
    ru: (used, max) => `🎨 Презентаций: ${used}/${max === Infinity ? '∞' : max}`,
    en: (used, max) => `🎨 Presentations: ${used}/${max === Infinity ? '∞' : max}`
  },

  // ── XOTIRANI TOZALASH ──
  clear_confirm: {
    uz: '🗑 Xotirani tozalash\n\nBarcha suhbat tarixi o\'chiriladi. Davom etasizmi?',
    ru: '🗑 Очистить память\n\nВся история переписки будет удалена. Продолжить?',
    en: '🗑 Clear memory\n\nAll chat history will be deleted. Continue?'
  },
  clear_done: {
    uz: '✅ Xotira tozalandi.',
    ru: '✅ Память очищена.',
    en: '✅ Memory cleared.'
  },
  btn_clear_yes: {
    uz: '🗑 Ha, o\'chirilsin',
    ru: '🗑 Да, удалить',
    en: '🗑 Yes, clear'
  },

  // ── SUHBATLAR ──
  sessions_empty: {
    uz: '🗂 Suhbat fayllari yo\'q.\n\n/yangi_suhbat [sarlavha] — yangi fayl yaratish',
    ru: '🗂 Файлов бесед нет.\n\n/yangi_suhbat [название] — создать новый файл',
    en: '🗂 No session files.\n\n/yangi_suhbat [title] — create new file'
  },
  session_created: {
    uz: (title) => `🗂 "${title}" suhbati yaratildi!\n\nEndi yozgan xabarlaringiz shu faylga saqlanadi.`,
    ru: (title) => `🗂 Беседа "${title}" создана!\n\nТеперь ваши сообщения сохраняются в этом файле.`,
    en: (title) => `🗂 Session "${title}" created!\n\nYour messages are now saved to this file.`
  },
  session_active: {
    uz: (title) => `✅ "${title}" fayli faollashtirildi.`,
    ru: (title) => `✅ Файл "${title}" активирован.`,
    en: (title) => `✅ File "${title}" activated.`
  },
  session_title_prompt: {
    uz: '📝 Yangi suhbat uchun sarlavha kiriting:',
    ru: '📝 Введите название новой беседы:',
    en: '📝 Enter a title for the new session:'
  },
  btn_new_session_create: {
    uz: '📝 Yangi suhbat yaratish',
    ru: '📝 Создать новую беседу',
    en: '📝 Create new session'
  },

  // ── SOZLAMALAR ──
  settings_title: {
    uz: '⚙️ Sozlamalar',
    ru: '⚙️ Настройки',
    en: '⚙️ Settings'
  },
  settings_title_label: {
    uz: (t) => `Murojaat: "${t}"`,
    ru: (t) => `Обращение: "${t}"`,
    en: (t) => `Title: "${t}"`
  },
  settings_title_prompt: {
    uz: 'Yangi murojaatni kiriting (masalan: do\'stim, ustozim, janob):',
    ru: 'Введите новое обращение (например: друг, учитель, господин):',
    en: 'Enter new title (e.g. friend, teacher, sir):'
  },
  settings_title_saved: {
    uz: (t) => `✅ Murojaat "${t}" ga o'zgartirildi.`,
    ru: (t) => `✅ Обращение изменено на "${t}".`,
    en: (t) => `✅ Title changed to "${t}".`
  },
  btn_change_title: {
    uz: '✏️ Murojaatni o\'zgartirish',
    ru: '✏️ Изменить обращение',
    en: '✏️ Change title'
  },

  // ── PREZENTATSIYA ──
  ppt_title: {
    uz: '🎨 Prezentatsiya yaratish',
    ru: '🎨 Создание презентации',
    en: '🎨 Create presentation'
  },
  ppt_mode_simple: {
    uz: '📄 Oddiy rejim faol.',
    ru: '📄 Обычный режим активен.',
    en: '📄 Simple mode active.'
  },
  ppt_mode_pro: {
    uz: '⭐ Pro rejim faol!',
    ru: '⭐ Pro режим активен!',
    en: '⭐ Pro mode active!'
  },
  ppt_question: {
    uz: 'Qanday prezentatsiya kerak?',
    ru: 'Какую презентацию создать?',
    en: 'What presentation do you need?'
  },
  ppt_topic_prompt: {
    uz: 'Mavzu nima haqida bo\'lsin?\n\n💡 Misol: Fotosintez, Sun\'iy intellekt, Marketing\n\n↓ Mavzuni yozing',
    ru: 'О чём будет презентация?\n\n💡 Пример: Фотосинтез, ИИ, Маркетинг\n\n↓ Введите тему',
    en: 'What is the topic?\n\n💡 Example: Photosynthesis, AI, Marketing\n\n↓ Enter topic'
  },
  ppt_creating: {
    uz: '🎨 Prezentatsiya yaratilmoqda...\n\nBu 1-2 daqiqa olishi mumkin. Kuting...',
    ru: '🎨 Создание презентации...\n\nЭто может занять 1-2 минуты. Подождите...',
    en: '🎨 Creating presentation...\n\nThis may take 1-2 minutes. Please wait...'
  },
  btn_ppt_simple: {
    uz: '📄 Oddiy prezentatsiya',
    ru: '📄 Обычная презентация',
    en: '📄 Simple presentation'
  },
  btn_ppt_pro: {
    uz: '⭐ Professional prezentatsiya',
    ru: '⭐ Профессиональная презентация',
    en: '⭐ Professional presentation'
  },
  btn_ppt_pro_locked: {
    uz: '⭐ Pro (obuna kerak)',
    ru: '⭐ Pro (нужна подписка)',
    en: '⭐ Pro (subscription needed)'
  },
  btn_ppt_diff: {
    uz: 'ℹ️ Farqi nima?',
    ru: 'ℹ️ В чём разница?',
    en: 'ℹ️ What\'s the difference?'
  },

  // ── OBUNA TIZIMI ──
  sub_title: {
    uz: '⭐ Obuna',
    ru: '⭐ Подписка',
    en: '⭐ Subscription'
  },
  sub_current_free: {
    uz: '📦 Joriy tarif: Free\n\nOylik limitlar:\n💬 AI xabarlar: 30 ta\n🎨 Prezentatsiya: 2 ta\n🗂 Suhbat fayllari: 2 ta\n🎭 Persona: yo\'q\n\nQuyida tarifni tanlang:',
    ru: '📦 Текущий тариф: Free\n\nЛимиты в месяц:\n💬 AI сообщений: 30\n🎨 Презентаций: 2\n🗂 Файлов бесед: 2\n🎭 Персон: нет\n\nВыберите тариф ниже:',
    en: '📦 Current plan: Free\n\nMonthly limits:\n💬 AI messages: 30\n🎨 Presentations: 2\n🗂 Session files: 2\n🎭 Personas: none\n\nChoose a plan below:'
  },
  sub_current_active: {
    uz: (plan, expires, daysLeft) =>
      `⭐ Joriy tarif: ${plan}\n📅 Muddat: ${expires} gacha (${daysLeft} kun)\n\nTarifni yangilash yoki yuksaltirish:`,
    ru: (plan, expires, daysLeft) =>
      `⭐ Текущий тариф: ${plan}\n📅 До: ${expires} (${daysLeft} дней)\n\nОбновить или повысить тариф:`,
    en: (plan, expires, daysLeft) =>
      `⭐ Current plan: ${plan}\n📅 Until: ${expires} (${daysLeft} days)\n\nRenew or upgrade:`
  },
  sub_current_grace: {
    uz: (plan, graceEnds) =>
      `⚠️ Obuna tugadi — Grace period\nTarif: ${plan}\nGrace tugash: ${graceEnds}\n\n3 kun ichida yangilamasangiz Free holatga tushib qolasiz!\n\nHoziroq yangilang:`,
    ru: (plan, graceEnds) =>
      `⚠️ Подписка истекла — Grace period\nТариф: ${plan}\nGrace до: ${graceEnds}\n\nЕсли не обновить за 3 дня, перейдёте на Free!\n\nОбновите сейчас:`,
    en: (plan, graceEnds) =>
      `⚠️ Subscription expired — Grace period\nPlan: ${plan}\nGrace ends: ${graceEnds}\n\nRenew within 3 days or you'll drop to Free!\n\nRenew now:`
  },
  sub_plan_info: {
    uz: (plan, discounted, original) =>
      `${plan}\n💰 ${discounted} so'm/oy\n~~${original} so'm~~ (chegirmali narx)`,
    ru: (plan, discounted, original) =>
      `${plan}\n💰 ${discounted} сум/мес\n~~${original} сум~~ (со скидкой)`,
    en: (plan, discounted, original) =>
      `${plan}\n💰 ${discounted} sum/month\n~~${original} sum~~ (discounted)`
  },
  sub_compare: {
    uz:
      '📊 <b>Tariflar taqqoslovi</b>\n\n' +
      '<pre>' +
      'Imkoniyat   Free  Start   Pro  Prem\n' +
      '──────────────────────────────────\n' +
      'AI suhbat    30    500   2000  5000\n' +
      'Oddiy PPT     2     15     50   100\n' +
      'Pro PPT       —      5     20    50\n' +
      'Suhbat f.     2     20     50     ∞\n' +
      'Persona       —      3     10     ∞\n' +
      '──────────────────────────────────\n' +
      'Narx/oy       —    19K    39K   59K\n' +
      '(asl narx)    —   (29K)  (59K) (99K)' +
      '</pre>',
    ru:
      '📊 <b>Сравнение тарифов</b>\n\n' +
      '<pre>' +
      'Возможность Free  Start   Pro  Prem\n' +
      '──────────────────────────────────\n' +
      'AI чат       30    500   2000  5000\n' +
      'PPT обычн.    2     15     50   100\n' +
      'PPT Pro        —      5     20    50\n' +
      'Файлы бес.    2     20     50     ∞\n' +
      'Персон         —      3     10     ∞\n' +
      '──────────────────────────────────\n' +
      'Цена/мес       —    19K    39K   59K\n' +
      '(реальная)     —   (29K)  (59K) (99K)' +
      '</pre>',
    en:
      '📊 <b>Plan Comparison</b>\n\n' +
      '<pre>' +
      'Feature     Free  Start   Pro  Prem\n' +
      '──────────────────────────────────\n' +
      'AI chat      30    500   2000  5000\n' +
      'Simple PPT    2     15     50   100\n' +
      'Pro PPT        —      5     20    50\n' +
      'Sessions      2     20     50     ∞\n' +
      'Personas       —      3     10     ∞\n' +
      '──────────────────────────────────\n' +
      'Price/mo       —    19K    39K   59K\n' +
      '(original)     —   (29K)  (59K) (99K)' +
      '</pre>'
  },

  sub_order_created: {
    uz: (plan, price, uniqueId, cardNumber) =>
      `⭐ Obuna buyurtmasi\n\n` +
      `Tarif: ${plan}\n` +
      `Narx: ${price} so'm/oy\n` +
      `Buyurtma ID: ${uniqueId}\n\n` +
      `💳 To\'lov rekviziti:\n${cardNumber}\n\n` +
      `To\'lov summasini va ID ni eslab qoling!`,
    ru: (plan, price, uniqueId, cardNumber) =>
      `⭐ Заявка на подписку\n\n` +
      `Тариф: ${plan}\n` +
      `Цена: ${price} сум/мес\n` +
      `ID заявки: ${uniqueId}\n\n` +
      `💳 Реквизиты для оплаты:\n${cardNumber}\n\n` +
      `Запомните сумму и ID!`,
    en: (plan, price, uniqueId, cardNumber) =>
      `⭐ Subscription Order\n\n` +
      `Plan: ${plan}\n` +
      `Price: ${price} sum/month\n` +
      `Order ID: ${uniqueId}\n\n` +
      `💳 Payment details:\n${cardNumber}\n\n` +
      `Remember the amount and ID!`
  },
  sub_order_text: {
    uz: (plan, uniqueId) => `${plan} obunani rasmiylashtirmoqchiman. ID: ${uniqueId}`,
    ru: (plan, uniqueId) => `Хочу оформить подписку ${plan}. ID: ${uniqueId}`,
    en: (plan, uniqueId) => `I want to subscribe to ${plan} plan. ID: ${uniqueId}`
  },
  btn_sub_pay: {
    uz: '💳 To\'lov amalga oshirish',
    ru: '💳 Оплатить',
    en: '💳 Pay now'
  },
  sub_pending_exists: {
    uz: (uniqueId) => `⏳ Kutilayotgan to\'lovingiz bor\n\nID: ${uniqueId}\n\nAdmin tasdiqlashini kuting.`,
    ru: (uniqueId) => `⏳ У вас есть ожидающий платёж\n\nID: ${uniqueId}\n\nОжидайте подтверждения.`,
    en: (uniqueId) => `⏳ You have a pending payment\n\nID: ${uniqueId}\n\nWait for admin confirmation.`
  },
  sub_activated: {
    uz: (plan, expires) =>
      `✅ ${plan} obuna faollashtirildi!\n\n📅 Muddat: ${expires} gacha\n\nEndi barcha imkoniyatlardan foydalaning! 🎉`,
    ru: (plan, expires) =>
      `✅ Подписка ${plan} активирована!\n\n📅 До: ${expires}\n\nТеперь доступны все возможности! 🎉`,
    en: (plan, expires) =>
      `✅ ${plan} plan activated!\n\n📅 Until: ${expires}\n\nAll features are now available! 🎉`
  },
  sub_expiry_7d: {
    uz: (plan, expires) =>
      `⏰ Eslatma: obunangiz 7 kun ichida tugaydi!\n\nTarif: ${plan}\nTugash: ${expires}\n\nYangilash uchun ⭐ Obuna menyusiga o\'ting.`,
    ru: (plan, expires) =>
      `⏰ Напоминание: подписка заканчивается через 7 дней!\n\nТариф: ${plan}\nДо: ${expires}\n\nПерейдите в меню ⭐ Подписка для продления.`,
    en: (plan, expires) =>
      `⏰ Reminder: subscription expires in 7 days!\n\nPlan: ${plan}\nExpires: ${expires}\n\nGo to ⭐ Subscribe menu to renew.`
  },
  sub_expiry_1d: {
    uz: (plan, expires) =>
      `🚨 Obunangiz ERTAGA tugaydi!\n\nTarif: ${plan}\nTugash: ${expires}\n\nHoziroq yangilang — ⭐ Obuna.`,
    ru: (plan, expires) =>
      `🚨 Подписка истекает ЗАВТРА!\n\nТариф: ${plan}\nДо: ${expires}\n\nОбновите сейчас — ⭐ Подписка.`,
    en: (plan, expires) =>
      `🚨 Subscription expires TOMORROW!\n\nPlan: ${plan}\nExpires: ${expires}\n\nRenew now — ⭐ Subscribe.`
  },
  sub_grace_started: {
    uz: (plan, graceEnds) =>
      `⚠️ Obunangiz tugadi!\n\nTarif: ${plan}\nGrace period: ${graceEnds} gacha\n\n3 kun ichida yangilamasangiz Free holatga tushib qolasiz.\n\nYangilash: ⭐ Obuna`,
    ru: (plan, graceEnds) =>
      `⚠️ Ваша подписка истекла!\n\nТариф: ${plan}\nGrace до: ${graceEnds}\n\nЕсли не обновите за 3 дня, перейдёте на Free.\n\nОбновить: ⭐ Подписка`,
    en: (plan, graceEnds) =>
      `⚠️ Your subscription has expired!\n\nPlan: ${plan}\nGrace until: ${graceEnds}\n\nRenew within 3 days or you'll drop to Free.\n\nRenew: ⭐ Subscribe`
  },
  sub_downgraded: {
    uz: '😔 Obuna tugadi. Hozir Free rejimdasiz.\n\nFree limitlar: 30 xabar/oy, 2 PPT/oy\n\nYangilash: ⭐ Obuna',
    ru: '😔 Подписка закончилась. Теперь вы на Free плане.\n\nLimitы Free: 30 сообщений/мес, 2 PPT/мес\n\nПродлить: ⭐ Подписка',
    en: '😔 Subscription ended. You are now on Free plan.\n\nFree limits: 30 messages/month, 2 PPT/month\n\nRenew: ⭐ Subscribe'
  },

  // ── LIMIT XABARLARI (yangilangan) ──
  limit_reached_ai: {
    uz: (plan, max) =>
      `🔒 Oylik AI limit tugadi!\n\n${plan} tarif: ${max} ta xabar/oy\n\nKeyingi oy yangilanadi.\nYoki obunani yuksaltiring → ⭐ Obuna`,
    ru: (plan, max) =>
      `🔒 Месячный лимит AI исчерпан!\n\nТариф ${plan}: ${max} сообщений/мес\n\nОбновится в следующем месяце.\nИли повысьте тариф → ⭐ Подписка`,
    en: (plan, max) =>
      `🔒 Monthly AI limit reached!\n\n${plan} plan: ${max} messages/month\n\nResets next month.\nOr upgrade → ⭐ Subscribe`
  },
  limit_reached_ppt: {
    uz: (plan, max) =>
      `🔒 Oylik prezentatsiya limiti tugadi!\n\n${plan} tarif: ${max} ta/oy\n\nKeyingi oy yangilanadi yoki obunani yuksaltiring → ⭐ Obuna`,
    ru: (plan, max) =>
      `🔒 Месячный лимит презентаций исчерпан!\n\nТариф ${plan}: ${max}/мес\n\nОбновится в следующем месяце или повысьте тариф → ⭐ Подписка`,
    en: (plan, max) =>
      `🔒 Monthly presentation limit reached!\n\n${plan} plan: ${max}/month\n\nResets next month or upgrade → ⭐ Subscribe`
  },
  limit_reached_ppt_pro: {
    uz: (plan) =>
      plan === 'free'
        ? '🔒 Pro prezentatsiya uchun kamida Starter obuna kerak.\n\n⭐ Obuna → tarifni tanlang'
        : `🔒 Oylik Pro prezentatsiya limiti tugadi!\n\nKeyingi oy yangilanadi yoki obunani yuksaltiring → ⭐ Obuna`,
    ru: (plan) =>
      plan === 'free'
        ? '🔒 Для Pro презентации нужна минимум Starter подписка.\n\n⭐ Подписка → выберите тариф'
        : `🔒 Месячный лимит Pro презентаций исчерпан!\n\nОбновится в следующем месяце или повысьте тариф → ⭐ Подписка`,
    en: (plan) =>
      plan === 'free'
        ? '🔒 Pro presentation requires at least Starter plan.\n\n⭐ Subscribe → choose plan'
        : `🔒 Monthly Pro presentation limit reached!\n\nResets next month or upgrade → ⭐ Subscribe`
  },
  limit_reached_session: {
    uz: (plan, max) =>
      `🔒 Oylik suhbat fayli limiti tugadi!\n\n${plan} tarif: ${max} ta/oy\n\nKeyingi oy yangilanadi yoki obunani yuksaltiring → ⭐ Obuna`,
    ru: (plan, max) =>
      `🔒 Месячный лимит файлов бесед исчерпан!\n\nТариф ${plan}: ${max}/мес\n\nОбновится в следующем месяце или повысьте тариф → ⭐ Подписка`,
    en: (plan, max) =>
      `🔒 Monthly session file limit reached!\n\n${plan} plan: ${max}/month\n\nResets next month or upgrade → ⭐ Subscribe`
  },
  limit_reached_persona: {
    uz: (plan, max) =>
      plan === 'free'
        ? '🔒 Free tarif uchun persona mavjud emas.\n\nObuna oling → ⭐ Obuna'
        : `🔒 Persona limiti tugadi!\n\n${plan} tarif: ${max} ta\n\nObunani yuksaltiring → ⭐ Obuna`,
    ru: (plan, max) =>
      plan === 'free'
        ? '🔒 На Free тарифе персоны недоступны.\n\nОформите подписку → ⭐ Подписка'
        : `🔒 Лимит персон исчерпан!\n\nТариф ${plan}: ${max}\n\nПовысьте тариф → ⭐ Подписка`,
    en: (plan, max) =>
      plan === 'free'
        ? '🔒 Personas not available on Free plan.\n\nSubscribe → ⭐ Subscribe'
        : `🔒 Persona limit reached!\n\n${plan} plan: ${max}\n\nUpgrade → ⭐ Subscribe`
  },

  // ── XATO XABARLARI ──
  error_general: {
    uz: 'Xato yuz berdi. Qayta urining.',
    ru: 'Произошла ошибка. Попробуйте ещё раз.',
    en: 'An error occurred. Please try again.'
  },
  error_ppt: {
    uz: '❌ Prezentatsiya yaratishda xato.\n\nQayta urining yoki mavzuni o\'zgartiring.',
    ru: '❌ Ошибка создания презентации.\n\nПопробуйте снова или измените тему.',
    en: '❌ Error creating presentation.\n\nTry again or change the topic.'
  },

  // ── YANGILIKLAR ──
  news_empty: {
    uz: '📰 Hozircha yangiliklar yo\'q.',
    ru: '📰 Пока новостей нет.',
    en: '📰 No news yet.'
  },

  // ── PROMPTIZATSIYA ──
  prompt_title: {
    uz: '🎭 Promptizatsiya\n\nBotingizga maxsus shaxs bering.',
    ru: '🎭 Промпты\n\nПридайте боту особую личность.',
    en: '🎭 Prompts\n\nGive your bot a special persona.'
  },

  // ── SUHBAT TIZIMI — YANGI ──

  // Tugma bosilganda: yangi sessiya ochildi
  chat_session_started: {
    uz: (title) => '💬 Yangi suhbat boshlandi!\n\n📂 Fayl: "'+title+'"\n\nSavolingizni yozing — javob beraman. ✍️\n\n💡 Boshqa tugmani bossangiz suhbat saqlanib, istalgan vaqt davom ettirishingiz mumkin.',
    ru: (title) => '💬 Новая беседа начата!\n\n📂 Файл: "'+title+'"\n\nЗадайте вопрос — отвечу. ✍️\n\n💡 Если нажмёте другую кнопку — беседа сохранится, можно продолжить в любое время.',
    en: (title) => '💬 New chat started!\n\n📂 File: "'+title+'"\n\nAsk your question — I\'ll answer. ✍️\n\n💡 Press another button anytime — chat saves automatically.'
  },

  // Sessiya davom ettirildi
  chat_session_resumed: {
    uz: (title, cnt) => '▶️ Suhbat davom etmoqda\n\n📂 "'+title+'" ('+cnt+' ta savol-javob)\n\nDavom eting — yozing! ✍️',
    ru: (title, cnt) => '▶️ Беседа продолжается\n\n📂 "'+title+'" ('+cnt+' вопрос-ответ)\n\nПродолжайте — пишите! ✍️',
    en: (title, cnt) => '▶️ Chat resumed\n\n📂 "'+title+'" ('+cnt+' exchanges)\n\nContinue — write! ✍️'
  },

  // Birinchi marta xabar yozganda nudge (bir marta)
  chat_nudge: {
    uz: '💡 Suhbatni papkaga saqlash uchun 💬 Suhbat tugmasini bosing.\n\nHozir ham javob beraman — suhbat xotirada saqlanadi.',
    ru: '💡 Чтобы сохранить беседу в папку — нажмите 💬 Чат.\n\nОтвечу и сейчас — беседа сохраняется в памяти.',
    en: '💡 To save chat in a folder — tap 💬 Chat button.\n\nI\'ll answer now too — chat is saved in memory.'
  },

  // Boshqa tugma bosilganda: suhbat saqlandi (bir marta)
  chat_saved_notice: {
    uz: (title) => '💾 Suhbat saqlandi: "'+title+'"\n\n▶️ Davom etish: 🗂 Suhbatlar → tanlang\n📥 Yuklab olish: 📁 Fayllarim → AI Suhbatlar',
    ru: (title) => '💾 Беседа сохранена: "'+title+'"\n\n▶️ Продолжить: 🗂 Беседы → выберите\n📥 Скачать: 📁 Мои файлы → AI Беседы',
    en: (title) => '💾 Chat saved: "'+title+'"\n\n▶️ Continue: 🗂 Sessions → select\n📥 Download: 📁 My Files → AI Chats'
  },

  // Bot sozlamalari (⚙️ Sozlamalar ichida)
  bot_settings_title: {
    uz: (botName, ln, pers, tops) => '🤖 Bot sozlamalari\n\nNom: '+botName+'\nTil: '+ln+'\nUslub: '+pers+'\nMavzular: '+tops,
    ru: (botName, ln, pers, tops) => '🤖 Настройки бота\n\nИмя: '+botName+'\nЯзык: '+ln+'\nСтиль: '+pers+'\nТемы: '+tops,
    en: (botName, ln, pers, tops) => '🤖 Bot settings\n\nName: '+botName+'\nLanguage: '+ln+'\nStyle: '+pers+'\nTopics: '+tops
  },

  // Suhbat tugmasi bosilganda — sessiyasiz holat (agar faol sessiya yo'q)
  chat_no_active: {
    uz: '💬 Suhbat\n\nYangi papkali suhbat yoki oddiy suhbat boshlang:',
    ru: '💬 Чат\n\nНачните новую беседу с папкой или обычный чат:',
    en: '💬 Chat\n\nStart a new folder chat or plain chat:'
  },

  btn_chat_new_session: {
    uz: '📂 Yangi papkali suhbat',
    ru: '📂 Новая беседа с папкой',
    en: '📂 New folder chat'
  },
  btn_chat_plain: {
    uz: '💬 Oddiy suhbat (saqlansiz)',
    ru: '💬 Обычный чат (без папки)',
    en: '💬 Plain chat (no folder)'
  },
  btn_bot_settings: {
    uz: '🤖 Bot sozlamalari',
    ru: '🤖 Настройки бота',
    en: '🤖 Bot settings'
  }
};

// ── ASOSIY FUNKSIYA ──
function t(key, lang, ...args) {
  var l = lang || 'ru';
  if (!T[key]) return key;
  var val = T[key][l] || T[key]['ru'] || T[key]['uz'] || key;
  if (typeof val === 'function') return val(...args);
  return val;
}

// ── KEYBOARD YASASH ──
// 4 holat:
//   isOwner + hasPrompt  → Promptizatsiya + Sozlamalar + Obuna
//   isOwner + !hasPrompt → Sozlamalar + Obuna (Promptizatsiya yo'q)
//   !isOwner             → Sozlamalar yo'q, Obuna yo'q (talabga ko'ra)
function mainKeyboard(lang, isOwner, hasPrompt) {
  var { Markup } = require('telegraf');
  var l = lang || 'ru';

  // Egasi + prompt bor: barcha tugmalar
  if (isOwner && hasPrompt) {
    return Markup.keyboard([
      [t('btn_chat', l),      t('btn_stats', l)],
      [t('btn_sessions', l),  t('btn_settings', l)],
      [t('btn_prompt', l),    t('btn_ppt', l)],
      [t('btn_news', l),      t('btn_subscribe', l)],
      [t('btn_files', l),     t('btn_clear', l)]
    ]).resize();
  }

  // Egasi + prompt yo'q: Sozlamalar bor, Promptizatsiya yo'q
  if (isOwner && !hasPrompt) {
    return Markup.keyboard([
      [t('btn_chat', l),      t('btn_stats', l)],
      [t('btn_sessions', l),  t('btn_settings', l)],
      [t('btn_ppt', l),       t('btn_news', l)],
      [t('btn_subscribe', l), t('btn_files', l)],
      [t('btn_clear', l)]
    ]).resize();
  }

  // Boshqa foydalanuvchilar — Sozlamalar yo'q, Obuna yo'q
  return Markup.keyboard([
    [t('btn_chat', l),     t('btn_stats', l)],
    [t('btn_sessions', l), t('btn_ppt', l)],
    [t('btn_files', l),    t('btn_news', l)],
    [t('btn_clear', l)]
  ]).resize();
}

// ── TIL ANIQLASH ──
function detectLang(telegramLangCode) {
  if (!telegramLangCode) return 'ru';
  if (telegramLangCode.startsWith('uz')) return 'uz';
  if (telegramLangCode.startsWith('en')) return 'en';
  return 'ru';
}

module.exports = { t, mainKeyboard, detectLang, LANGS: ['uz', 'ru', 'en'] };
