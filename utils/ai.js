'use strict';
const fetch = require('node-fetch');
const { buildSystemPrompt } = require('./prompt');

// ═══════════════════════════════════════════════════════════
// AI PROVIDER ZANJIRI
//
// 0. WisGate      — BIRINCHI (barcha modellar, OpenAI format)
// 1. DeepSeek     — 2-chi (yuqori sifat)
// 2. OpenAI       — 3-chi (GPT-4o mini)
// 3. Groq         — 4-chi (tez, bepul)
// 4. OpenRouter   — 5-chi (ko'p bepul model)
// 5. Gemini       — 6-chi (bepul zaxira)
//
// .env:
//   WISGATE_API_KEYS=key1,key2         ← vergul bilan bir nechta
//   WISGATE_BASE_URL=https://...       ← WisGate endpoint
//   WISGATE_MODEL=deepseek-v3          ← asosiy model
//   DEEPSEEK_API_KEY=key1,key2
//   OPENAI_API_KEY=key1,key2
//   GROQ_API_KEY=key1,key2,key3
//   OPENROUTER_API_KEY=key1,key2
//   GEMINI_API_KEY=key1,key2,key3
// ═══════════════════════════════════════════════════════════

// DeepSeek modellari
var DEEPSEEK_MODELS = [
  'deepseek-chat',       // DeepSeek V3 — asosiy, eng yaxshi
  'deepseek-reasoner'    // DeepSeek R1 — murakkab savollar uchun
];

// OpenAI modellari (arzondan qimmatga)
var OPENAI_MODELS = [
  'gpt-4o-mini',   // arzon, tez, yaxshi sifat
  'gpt-4o'         // eng yuqori sifat, qimmatroq
];

// Groq modellari
var GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'mixtral-8x7b-32768'
];

// OpenRouter modellari
var OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'deepseek/deepseek-r1:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-7b-instruct:free'
];

var _providers = {
  wisgate:    { keys: [], idx: 0 },
  deepseek:   { keys: [], idx: 0 },
  openai:     { keys: [], idx: 0 },
  groq:       { keys: [], idx: 0 },
  openrouter: { keys: [], idx: 0 },
  gemini:     { keys: [], idx: 0 }
};
var _cooldowns = {};

// ─────────────────────────────────────────
// KEY YUKLASH
// ─────────────────────────────────────────
function loadKeys() {
  function parse(env) {
    return (process.env[env] || '').split(',').map(function(k) { return k.trim(); }).filter(Boolean);
  }
  _providers.wisgate.keys    = parse('WISGATE_API_KEYS');
  _providers.deepseek.keys   = parse('DEEPSEEK_API_KEY');
  _providers.openai.keys     = parse('OPENAI_API_KEY');
  _providers.groq.keys       = parse('GROQ_API_KEY');
  _providers.openrouter.keys = parse('OPENROUTER_API_KEY');
  _providers.gemini.keys     = parse('GEMINI_API_KEY');

  var total = _providers.wisgate.keys.length + _providers.deepseek.keys.length +
              _providers.openai.keys.length + _providers.groq.keys.length +
              _providers.openrouter.keys.length + _providers.gemini.keys.length;

  if (total === 0) {
    console.error('[AI] ❌ Hech qanday API key topilmadi! .env faylini tekshiring.');
    return;
  }
  console.log('[AI] Keys yuklandi:');
  if (_providers.wisgate.keys.length)    console.log('     WisGate:    ' + _providers.wisgate.keys.length + ' ta key');
  if (_providers.deepseek.keys.length)   console.log('     DeepSeek:   ' + _providers.deepseek.keys.length + ' ta key');
  if (_providers.openai.keys.length)     console.log('     OpenAI:     ' + _providers.openai.keys.length + ' ta key');
  if (_providers.groq.keys.length)       console.log('     Groq:       ' + _providers.groq.keys.length + ' ta key');
  if (_providers.openrouter.keys.length) console.log('     OpenRouter: ' + _providers.openrouter.keys.length + ' ta key');
  if (_providers.gemini.keys.length)     console.log('     Gemini:     ' + _providers.gemini.keys.length + ' ta key');
}

function isOnCooldown(provider, key, model) {
  return Date.now() < (_cooldowns[provider + ':' + key + ':' + (model||'')] || 0);
}

function setCooldown(provider, key, model, ms) {
  _cooldowns[provider + ':' + key + ':' + (model||'')] = Date.now() + (ms || 65000);
  console.warn('[AI] ' + provider + (model ? '/' + model.split('/').pop() : '') +
               ' sovitildi (' + Math.round((ms||65000)/1000) + 's)');
}

function getNextKey(providerName) {
  var p   = _providers[providerName];
  var now = Date.now();
  for (var i = 0; i < p.keys.length; i++) {
    var idx = p.idx % p.keys.length;
    p.idx   = (idx + 1) % p.keys.length;
    var key = p.keys[idx];
    if (now >= (_cooldowns[providerName + ':' + key + ':'] || 0)) return key;
  }
  return null;
}

// ─────────────────────────────────────────
// MARKDOWN → TELEGRAM HTML
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// MARKDOWN → TELEGRAM HTML (to'liq, xavfsiz)
// Barcha oddiy matn ham esc() qilinadi — < > & belgilari xato bermaydi
// ─────────────────────────────────────────

function processInline(text) {
  var result = '';
  var j = 0;
  while (j < text.length) {
    // Inline kod: `...`
    if (text[j] === '`') {
      var end = text.indexOf('`', j + 1);
      if (end > j) {
        result += '<code>' + esc(text.slice(j + 1, end)) + '</code>';
        j = end + 1;
        continue;
      }
    }
    // Bold: **...**
    if (text.slice(j, j + 2) === '**') {
      var end2 = text.indexOf('**', j + 2);
      if (end2 > j + 1) {
        result += '<b>' + processInline(text.slice(j + 2, end2)) + '</b>';
        j = end2 + 2;
        continue;
      }
    }
    // Italic: *...* (** emas)
    if (text[j] === '*' && text.slice(j, j + 2) !== '**') {
      var end3 = text.indexOf('*', j + 1);
      if (end3 > j + 1) {
        result += '<i>' + processInline(text.slice(j + 1, end3)) + '</i>';
        j = end3 + 1;
        continue;
      }
    }
    // Italic: _..._
    if (text[j] === '_') {
      var end4 = text.indexOf('_', j + 1);
      if (end4 > j + 1) {
        result += '<i>' + processInline(text.slice(j + 1, end4)) + '</i>';
        j = end4 + 1;
        continue;
      }
    }
    // Link: [text](url)
    if (text[j] === '[') {
      var lm2 = text.slice(j).match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
      if (lm2) {
        result += '<a href="' + lm2[2] + '">' + esc(lm2[1]) + '</a>';
        j += lm2[0].length;
        continue;
      }
    }
    // Oddiy belgi — xavfsiz escape
    result += esc(text[j]);
    j++;
  }
  return result;
}

function convertToHTML(text) {
  if (!text) return '';
  var lines   = text.split('\n');
  var result  = [];
  var inCode  = false;
  var codeBuf = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    // Kod bloki: ``` ... ```
    if (line.trim().startsWith('```')) {
      if (!inCode) {
        inCode  = true;
        codeBuf = [];
      } else {
        inCode = false;
        // Kod ichidagi matn to'liq escape qilinadi
        result.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>');
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    // Sarlavhalar: ## Matn
    var hm = line.match(/^#{1,6}\s+(.+)/);
    if (hm) {
      result.push('\n<b>' + esc(hm[1]) + '</b>');
      continue;
    }

    // Ro'yxat: - yoki * yoki +
    var lm = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (lm) {
      var indent = lm[1] ? '  ' : '';
      result.push(indent + '• ' + processInline(lm[2]));
      continue;
    }

    // Raqamli ro'yxat: 1. 2. 3.
    var nm = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (nm) {
      result.push((nm[1]||'') + nm[2] + '. ' + processInline(nm[3]));
      continue;
    }

    // Bo'sh qator
    if (!line.trim()) { result.push(''); continue; }

    // Oddiy matn — inline parse + escape
    result.push(processInline(line));
  }

  // Kod bloki yopilmagan bo'lsa
  if (inCode && codeBuf.length > 0) {
    result.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>');
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function esc(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─────────────────────────────────────────
// PROVIDER CHAQIRUVLARI
// ─────────────────────────────────────────

// WisGate — OpenAI-compatible gateway (barcha modellar)
async function callWisGate(apiKey, model, messages) {
  var baseUrl = (process.env.WISGATE_BASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) return { status: 500 };
  var res = await fetch(baseUrl + '/chat/completions', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model, messages: messages, max_tokens: 2048, temperature: 0.7, stream: false })
  });
  var data = await res.json();
  if (res.status === 429) return { status: 429 };
  if (res.status === 402) return { status: 402 };
  if (!res.ok) {
    console.error('[WisGate/' + model + '] ' + (data && data.error && data.error.message || res.status));
    return { status: res.status };
  }
  var raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { status: 200, text: raw };
}

// DeepSeek — api.deepseek.com (OpenAI format)
async function callDeepSeek(apiKey, model, messages) {
  var res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model, messages: messages, max_tokens: 2048, temperature: 0.7, stream: false })
  });
  var data = await res.json();
  if (res.status === 429) return { status: 429 };
  if (res.status === 402) return { status: 402 }; // kredit tugagan
  if (!res.ok) {
    console.error('[DeepSeek/' + model + '] ' + (data && data.error && data.error.message || res.status));
    return { status: res.status };
  }
  var raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
  // DeepSeek R1 <think> blokini olib tashla
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { status: 200, text: raw };
}

// OpenAI — api.openai.com
async function callOpenAI(apiKey, model, messages) {
  var res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model, messages: messages, max_tokens: 2048, temperature: 0.7 })
  });
  var data = await res.json();
  if (res.status === 429) return { status: 429 };
  if (res.status === 402 || res.status === 403) return { status: 402 }; // kredit tugagan
  if (!res.ok) {
    console.error('[OpenAI/' + model + '] ' + (data && data.error && data.error.message || res.status));
    return { status: res.status };
  }
  var raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
  return { status: 200, text: raw };
}

// Groq
async function callGroq(apiKey, model, messages) {
  var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model, messages: messages, max_tokens: 2048, temperature: 0.7, stream: false })
  });
  var data = await res.json();
  if (res.status === 429) return { status: 429 };
  if (res.status === 400 || res.status === 404) {
    console.error('[Groq/' + model + '] ' + (data && data.error && data.error.message || res.status));
    return { status: 400 };
  }
  if (!res.ok) {
    console.error('[Groq/' + model + '] ' + (data && data.error && data.error.message || res.status));
    return { status: res.status };
  }
  var raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
  return { status: 200, text: raw };
}

// OpenRouter
async function callOpenRouter(apiKey, model, messages) {
  var res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json',
      'HTTP-Referer': 'https://t.me/bot', 'X-Title': 'AI Bot'
    },
    body: JSON.stringify({ model: model, messages: messages, max_tokens: 2048, temperature: 0.7 })
  });
  var data = await res.json();
  if (res.status === 429) return { status: 429 };
  if (res.status === 404) return { status: 404 };
  if (!res.ok) {
    console.error('[OpenRouter/' + model.split('/').pop() + '] ' + (data && data.error && data.error.message || res.status));
    return { status: res.status };
  }
  var raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { status: 200, text: raw };
}

// Gemini
async function callGemini(apiKey, messages, systemPrompt) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
  var contents = messages.filter(function(m) { return m.role !== 'system'; })
    .map(function(m) { return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }; });
  if (!contents.length) contents = [{ role: 'user', parts: [{ text: messages[messages.length-1].content }] }];
  var res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: contents,
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
    })
  });
  var data = await res.json();
  if (res.status === 429) return { status: 429 };
  if (res.status === 403) return { status: 403 };
  if (!res.ok) { console.error('[Gemini] ' + (data && data.error && data.error.message || res.status)); return { status: res.status }; }
  var candidate = data.candidates && data.candidates[0];
  if (!candidate || candidate.finishReason === 'SAFETY') return { status: 400 };
  var raw = candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text || '';
  return { status: 200, text: raw };
}

// ─────────────────────────────────────────
// YORDAMCHI: provider chaqiruvi
// ─────────────────────────────────────────
async function tryProvider(name, models, callFn, extra) {
  if (_providers[name].keys.length === 0) {
    console.log('[AI] ' + name + ' key yo\'q, o\'tkazib yuborildi.');
    return null;
  }
  for (var ki = 0; ki < _providers[name].keys.length; ki++) {
    var key = getNextKey(name);
    if (!key) { console.warn('[AI] ' + name + ': barcha keylar soviyotgan.'); break; }
    for (var mi = 0; mi < models.length; mi++) {
      var model = models[mi];
      if (isOnCooldown(name, key, model)) continue;
      try {
        console.log('[AI] ' + name + '/' + model.split('/').pop() + ' urinish...');
        var res = extra ? await callFn(key, model, extra) : await callFn(key, model);
        console.log('[AI] ' + name + '/' + model.split('/').pop() + ' status:', res.status);
        if (res.status === 429) { setCooldown(name, key, model, 65000); continue; }
        if (res.status === 402) { setCooldown(name, key, model, 3600000); continue; } // kredit tugagan
        if (res.status === 403) { setCooldown(name, key, model, 300000); continue; }
        if (res.status === 404 || res.status === 400) { setCooldown(name, key, model, 3600000); continue; }
        if (res.status !== 200) continue;
        if (res.text && res.text.trim()) {
          console.log('[AI] ✅ ' + name + ' javob berdi.');
          return res.text;
        }
      } catch (e) { console.error('[' + name + '] Tarmoq xato:', e.message); }
    }
  }
  console.warn('[AI] ' + name + ' ishlamadi.');
  return null;
}

// ─────────────────────────────────────────
// ASOSIY FUNKSIYA
// Tartib: DeepSeek → OpenAI → Groq → OpenRouter → Gemini
// ─────────────────────────────────────────
async function getAIResponse(botConfig, conversationHistory, userMessage, userName) {
  var total = _providers.wisgate.keys.length + _providers.deepseek.keys.length +
              _providers.openai.keys.length + _providers.groq.keys.length +
              _providers.openrouter.keys.length + _providers.gemini.keys.length;
  if (total === 0) loadKeys();

  total = _providers.wisgate.keys.length + _providers.deepseek.keys.length +
          _providers.openai.keys.length + _providers.groq.keys.length +
          _providers.openrouter.keys.length + _providers.gemini.keys.length;
  if (total === 0) return { text: "AI konfiguratsiya xatosi. Admin bilan bog'laning.", html: false };

  var systemPrompt  = buildSystemPrompt(botConfig, userName);
  var recentHistory = (conversationHistory || []).slice(-20);
  var messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory.map(function(m) { return { role: m.role, content: m.content }; }),
    { role: 'user', content: userMessage }
  ];

  var result;

  // 0. WisGate — birinchi navbat
  if (_providers.wisgate.keys.length > 0) {
    var wgModels = (process.env.WISGATE_MODEL || 'deepseek-v3').split(',').map(function(m) { return m.trim(); });
    result = await tryProvider('wisgate', wgModels, function(key, model) {
      return callWisGate(key, model, messages);
    });
    if (result) return { text: convertToHTML(result), html: true };
  }

  // 1. DeepSeek
  result = await tryProvider('deepseek', DEEPSEEK_MODELS, function(key, model) {
    return callDeepSeek(key, model, messages);
  });
  if (result) return { text: convertToHTML(result), html: true };

  // 2. OpenAI
  result = await tryProvider('openai', OPENAI_MODELS, function(key, model) {
    return callOpenAI(key, model, messages);
  });
  if (result) return { text: convertToHTML(result), html: true };

  // 3. Groq
  result = await tryProvider('groq', GROQ_MODELS, function(key, model) {
    return callGroq(key, model, messages);
  });
  if (result) return { text: convertToHTML(result), html: true };

  // 4. OpenRouter
  result = await tryProvider('openrouter', OPENROUTER_MODELS, function(key, model) {
    return callOpenRouter(key, model, messages);
  });
  if (result) return { text: convertToHTML(result), html: true };

  // 5. Gemini
  if (_providers.gemini.keys.length > 0) {
    for (var g = 0; g < _providers.gemini.keys.length; g++) {
      var gKey = getNextKey('gemini');
      if (!gKey) break;
      try {
        console.log('[AI] Gemini urinish ' + (g+1) + '/' + _providers.gemini.keys.length);
        var gRes = await callGemini(gKey, messages, systemPrompt);
        console.log('[AI] Gemini status:', gRes.status);
        if (gRes.status === 429) { setCooldown('gemini', gKey, '', 65000); continue; }
        if (gRes.status === 403) { setCooldown('gemini', gKey, '', 300000); continue; }
        if (gRes.status !== 200) continue;
        if (gRes.text && gRes.text.trim()) {
          console.log('[AI] ✅ Gemini javob berdi.');
          return { text: convertToHTML(gRes.text), html: true };
        }
      } catch (e) { console.error('[Gemini] Tarmoq xato:', e.message); }
    }
    console.warn('[AI] Gemini ishlamadi.');
  } else { console.log('[AI] Gemini key yo\'q, o\'tkazib yuborildi.'); }

  console.error('[AI] ❌ Barcha providerlar ishlamadi!');
  return { text: "Xizmat hozir band. Bir daqiqadan so'ng qayta yozing.", html: false };
}

// ─────────────────────────────────────────
// PPT UCHUN ALOHIDA FUNKSIYA
// System prompt yo'q, max_tokens oshirilgan
// ─────────────────────────────────────────
async function getPptAIResponse(prompt) {
  var total = _providers.deepseek.keys.length + _providers.openai.keys.length +
              _providers.groq.keys.length + _providers.openrouter.keys.length +
              _providers.gemini.keys.length;
  if (total === 0) loadKeys();

  var messages = [{ role: 'user', content: prompt }];

  // 0. WisGate — birinchi navbat (katta JSON uchun ham ishlaydi)
  if (_providers.wisgate.keys.length > 0) {
    var wgKey = getNextKey('wisgate');
    var wgModel = (process.env.WISGATE_MODEL || 'deepseek-v3').split(',')[0].trim();
    if (wgKey && !isOnCooldown('wisgate', wgKey, wgModel)) {
      try {
        var wgRes = await callWisGate(wgKey, wgModel, messages);
        if (wgRes.status === 429) { setCooldown('wisgate', wgKey, wgModel, 65000); }
        else if (wgRes.status === 402) { setCooldown('wisgate', wgKey, wgModel, 3600000); }
        else if (wgRes.status === 200 && wgRes.text && wgRes.text.trim()) {
          console.log('[PPT-AI] ✅ WisGate javob berdi.');
          return wgRes.text;
        }
      } catch (e) { console.error('[PPT-AI] WisGate xato:', e.message); }
    }
  }

  // 1. DeepSeek — katta JSON uchun ideal
  if (_providers.deepseek.keys.length > 0) {
    var dKey = getNextKey('deepseek');
    if (dKey && !isOnCooldown('deepseek', dKey, 'deepseek-chat')) {
      try {
        var res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + dKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'deepseek-chat', messages: messages, max_tokens: 8000, temperature: 0.2, stream: false })
        });
        var data = await res.json();
        if (res.status === 429) { setCooldown('deepseek', dKey, 'deepseek-chat', 65000); }
        else if (res.ok && data.choices && data.choices[0] && data.choices[0].message.content) {
          console.log('[PPT-AI] ✅ DeepSeek javob berdi.');
          return data.choices[0].message.content;
        }
      } catch (e) { console.error('[PPT-AI] DeepSeek xato:', e.message); }
    }
  }

  // 2. OpenAI
  if (_providers.openai.keys.length > 0) {
    var oKey = getNextKey('openai');
    if (oKey && !isOnCooldown('openai', oKey, 'gpt-4o-mini')) {
      try {
        var res2 = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + oKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: messages, max_tokens: 8000, temperature: 0.2 })
        });
        var data2 = await res2.json();
        if (res2.status === 429) { setCooldown('openai', oKey, 'gpt-4o-mini', 65000); }
        else if (res2.ok && data2.choices && data2.choices[0] && data2.choices[0].message.content) {
          console.log('[PPT-AI] ✅ OpenAI javob berdi.');
          return data2.choices[0].message.content;
        }
      } catch (e) { console.error('[PPT-AI] OpenAI xato:', e.message); }
    }
  }

  // 3. Groq
  if (_providers.groq.keys.length > 0) {
    var qKey = getNextKey('groq');
    var qmodel = GROQ_MODELS[0];
    if (qKey && !isOnCooldown('groq', qKey, qmodel)) {
      try {
        var res3 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + qKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: qmodel, messages: messages, max_tokens: 8000, temperature: 0.2, stream: false })
        });
        var data3 = await res3.json();
        if (res3.status === 429) { setCooldown('groq', qKey, qmodel, 65000); }
        else if (res3.ok && data3.choices && data3.choices[0] && data3.choices[0].message.content) {
          console.log('[PPT-AI] ✅ Groq javob berdi.');
          return data3.choices[0].message.content;
        }
      } catch (e) { console.error('[PPT-AI] Groq xato:', e.message); }
    }
  }

  // 4. OpenRouter
  if (_providers.openrouter.keys.length > 0) {
    var orKey = getNextKey('openrouter');
    if (orKey) {
      var orModels = ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free'];
      for (var mi = 0; mi < orModels.length; mi++) {
        if (isOnCooldown('openrouter', orKey, orModels[mi])) continue;
        try {
          var oRes = await callOpenRouter(orKey, orModels[mi], messages);
          if (oRes.status === 429) { setCooldown('openrouter', orKey, orModels[mi], 65000); continue; }
          if (oRes.status === 404) { setCooldown('openrouter', orKey, orModels[mi], 3600000); continue; }
          if (oRes.status === 200 && oRes.text) {
            console.log('[PPT-AI] ✅ OpenRouter javob berdi.');
            return oRes.text;
          }
        } catch (e) { console.error('[PPT-AI] OpenRouter xato:', e.message); }
      }
    }
  }

  // 5. Gemini
  if (_providers.gemini.keys.length > 0) {
    var gemKey = getNextKey('gemini');
    if (gemKey && !isOnCooldown('gemini', gemKey, '')) {
      try {
        var gRes2 = await callGemini(gemKey, messages, 'Sen prezentatsiya kontent generatorisan. Faqat JSON qaytargil.');
        if (gRes2.status === 200 && gRes2.text) {
          console.log('[PPT-AI] ✅ Gemini javob berdi.');
          return gRes2.text;
        }
        if (gRes2.status === 429) setCooldown('gemini', gemKey, '', 65000);
      } catch (e) { console.error('[PPT-AI] Gemini xato:', e.message); }
    }
  }

  return null;
}

module.exports = { getAIResponse, getPptAIResponse };
