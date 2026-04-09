'use strict';

const fs    = require('fs');
const fetch = require('node-fetch');

function parseKeys(envVar) {
  return (process.env[envVar] || '').split(',').map(function(k){return k.trim();}).filter(Boolean);
}
function pickKey(keys) {
  if (!keys.length) return null;
  return keys[Math.floor(Math.random() * keys.length)];
}

var VALID_STYLES  = ['nostalgic','dramatic','warm','cool','cinema','happy','memorial'];
var VALID_EFFECTS = ['ken_burns','vignette','grain','letterbox','parallax','heartbeat'];

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') return getDefaultPlan();
  if (!VALID_STYLES.includes(plan.style))    plan.style    = 'warm';
  if (!Array.isArray(plan.effects) || !plan.effects.length) plan.effects = ['ken_burns','vignette'];
  plan.effects = plan.effects.filter(function(e){return VALID_EFFECTS.includes(e);});
  if (!plan.effects.length) plan.effects = ['ken_burns','vignette'];
  if (!['in','out'].includes(plan.zoom))     plan.zoom     = 'in';
  if (!['center','left','right','up','down'].includes(plan.pan)) plan.pan = 'center';
  plan.duration      = Math.min(15, Math.max(8, parseInt(plan.duration) || 10));
  plan.text          = plan.text || '';
  plan.text_position = plan.text_position || 'bottom';
  plan.description   = plan.description || '';
  plan.mood          = plan.mood || '';
  return plan;
}

function extractJSON(raw) {
  var match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch(e) { return null; }
}

function buildSystemPrompt(langHint) {
  return 'You are a professional video director AI. Create a video effect plan.\n' +
    'Return ONLY valid JSON (no markdown, no extra text):\n' +
    '{"style":"nostalgic","effects":["ken_burns","vignette"],"zoom":"in","pan":"center","duration":10,"text":"","text_position":"bottom","description":"brief description","mood":"brief mood"}\n\n' +
    'Rules (language for description/mood: ' + langHint + '):\n' +
    '- style: nostalgic|dramatic|warm|cool|cinema|happy|memorial\n' +
    '- effects: always include ken_burns or parallax AND vignette\n' +
    '- For old/family photos: nostalgic + grain\n' +
    '- For portraits: zoom in + heartbeat\n' +
    '- For landscapes: zoom out + parallax\n' +
    '- For celebrations: happy + warm\n' +
    '- duration: 8-15 seconds\n' +
    '- zoom: in or out\n' +
    '- pan: center|left|right|up|down';
}

// ─── PROVIDER 1: GEMINI VISION ───
async function callGeminiVision(imagePath, userPrompt, lang) {
  var keys = parseKeys('GEMINI_API_KEY');
  if (!keys.length) return null;
  var key      = pickKey(keys);
  var imgData  = fs.readFileSync(imagePath);
  var b64      = imgData.toString('base64');
  var mime     = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  var langHint = lang === 'uz' ? 'uzbek' : lang === 'ru' ? 'russian' : 'english';

  var body = {
    system_instruction: { parts: [{ text: buildSystemPrompt(langHint) }] },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: mime, data: b64 } },
        { text: userPrompt ? 'User request: "' + userPrompt + '"' : 'Create the best video for this image.' }
      ]
    }],
    generationConfig: { maxOutputTokens: 512, temperature: 0.35 }
  };

  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key;
    var res = await fetch(url, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body), timeout: 25000
    });
    if (!res.ok) { console.warn('[VideoAI] Gemini:', res.status); return null; }
    var data = await res.json();
    var raw  = data.candidates && data.candidates[0] &&
               data.candidates[0].content && data.candidates[0].content.parts &&
               data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text || '';
    var plan = extractJSON(raw);
    if (!plan) return null;
    console.log('[VideoAI] Gemini Vision ishlatildi');
    return { plan: validatePlan(plan), source: 'gemini' };
  } catch(e) { console.warn('[VideoAI] Gemini xato:', e.message); return null; }
}

// ─── PROVIDER 2: DEEPSEEK R1 (matn orqali) ───
async function callDeepSeekR1(userPrompt, lang) {
  var keys = parseKeys('DEEPSEEK_API_KEY');
  if (!keys.length) return null;
  var key     = pickKey(keys);
  var langHint = lang === 'uz' ? 'uzbek' : lang === 'ru' ? 'russian' : 'english';
  var prompt  = buildSystemPrompt(langHint) + '\n\nUser describes the image: "' + (userPrompt || 'beautiful photo') + '"\nReturn JSON only.';

  try {
    var res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {'Authorization':'Bearer '+key,'Content-Type':'application/json'},
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages: [{role:'user',content:prompt}],
        max_tokens: 512, temperature: 0.3, stream: false
      }),
      timeout: 30000
    });
    if (!res.ok) { console.warn('[VideoAI] DeepSeek R1:', res.status); return null; }
    var data = await res.json();
    var raw  = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
    var plan = extractJSON(raw);
    if (!plan) return null;
    console.log('[VideoAI] DeepSeek R1 ishlatildi (fallback)');
    return { plan: validatePlan(plan), source: 'deepseek_r1' };
  } catch(e) { console.warn('[VideoAI] DeepSeek R1 xato:', e.message); return null; }
}

// ─── PROVIDER 3: WISGATE ───
async function callWisGateText(userPrompt, lang) {
  var keys    = parseKeys('WISGATE_API_KEYS');
  var baseUrl = (process.env.WISGATE_BASE_URL || '').replace(/\/$/, '');
  if (!keys.length || !baseUrl) return null;
  var key     = pickKey(keys);
  var model   = (process.env.WISGATE_MODEL || 'deepseek-v3').split(',')[0].trim();
  var langHint = lang === 'uz' ? 'uzbek' : lang === 'ru' ? 'russian' : 'english';
  var prompt  = buildSystemPrompt(langHint) + '\n\nUser describes: "' + (userPrompt || 'beautiful photo') + '"\nReturn JSON only.';

  try {
    var res = await fetch(baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: {'Authorization':'Bearer '+key,'Content-Type':'application/json'},
      body: JSON.stringify({ model: model, messages:[{role:'user',content:prompt}], max_tokens:512, temperature:0.3 }),
      timeout: 30000
    });
    if (!res.ok) return null;
    var data = await res.json();
    var raw  = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
    var plan = extractJSON(raw);
    if (!plan) return null;
    console.log('[VideoAI] WisGate ishlatildi (fallback)');
    return { plan: validatePlan(plan), source: 'wisgate' };
  } catch(e) { console.warn('[VideoAI] WisGate xato:', e.message); return null; }
}

// ─── PROVIDER 4: GROQ ───
async function callGroqText(userPrompt, lang) {
  var keys = parseKeys('GROQ_API_KEY');
  if (!keys.length) return null;
  var key     = pickKey(keys);
  var langHint = lang === 'uz' ? 'uzbek' : lang === 'ru' ? 'russian' : 'english';
  var prompt  = buildSystemPrompt(langHint) + '\n\nUser describes: "' + (userPrompt || 'beautiful photo') + '"\nReturn JSON only.';

  try {
    var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {'Authorization':'Bearer '+key,'Content-Type':'application/json'},
      body: JSON.stringify({ model:'llama-3.1-8b-instant', messages:[{role:'user',content:prompt}], max_tokens:512, temperature:0.3 }),
      timeout: 20000
    });
    if (!res.ok) return null;
    var data = await res.json();
    var raw  = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
    var plan = extractJSON(raw);
    if (!plan) return null;
    console.log('[VideoAI] Groq ishlatildi (fallback)');
    return { plan: validatePlan(plan), source: 'groq' };
  } catch(e) { console.warn('[VideoAI] Groq xato:', e.message); return null; }
}

// ─── ASOSIY FUNKSIYA — kaskad fallback ───
async function analyzeImageForVideo(imagePath, userPrompt, lang) {
  // 1. Gemini Vision — rasm ko'radi
  var result = await callGeminiVision(imagePath, userPrompt, lang);
  if (result) return { ok:true, plan:result.plan, source:result.source };

  // 2. DeepSeek R1 — prompt orqali
  console.log('[VideoAI] Gemini ishlamadi → DeepSeek R1...');
  if (userPrompt && userPrompt.trim()) {
    result = await callDeepSeekR1(userPrompt, lang);
    if (result) return { ok:true, plan:result.plan, source:result.source, fallback:true };
  }

  // 3. WisGate
  result = await callWisGateText(userPrompt, lang);
  if (result) return { ok:true, plan:result.plan, source:result.source, fallback:true };

  // 4. Groq
  result = await callGroqText(userPrompt, lang);
  if (result) return { ok:true, plan:result.plan, source:result.source, fallback:true };

  // 5. Default — hamma ishlamasa
  console.warn('[VideoAI] Barcha providerlar ishlamadi → standart reja');
  return { ok:true, plan:getDefaultPlan(userPrompt), source:'default', fallback:true };
}

function getPlanByMood(mood) {
  var plans = {
    nostalgic: { style:'nostalgic', effects:['ken_burns','vignette','grain'],     zoom:'in',  pan:'center', duration:12, text:'', text_position:'bottom', description:'Nostaljik xotira video', mood:'Nostaljik' },
    dramatic:  { style:'dramatic',  effects:['ken_burns','vignette','letterbox'],  zoom:'in',  pan:'left',   duration:10, text:'', text_position:'bottom', description:'Dramatik kino uslub',    mood:'Dramatik'  },
    happy:     { style:'happy',     effects:['ken_burns','vignette'],              zoom:'out', pan:'center', duration:8,  text:'', text_position:'bottom', description:'Baxtli va yorqin',       mood:'Baxtli'    },
    cinema:    { style:'cinema',    effects:['ken_burns','vignette','letterbox'],  zoom:'in',  pan:'right',  duration:12, text:'', text_position:'bottom', description:'Kinematik uslub',        mood:'Kino'      },
    memorial:  { style:'memorial',  effects:['ken_burns','vignette','grain','heartbeat'], zoom:'in', pan:'center', duration:15, text:'', text_position:'bottom', description:'Xotira video', mood:'Eslatma' },
    cool:      { style:'cool',      effects:['ken_burns','vignette'],              zoom:'out', pan:'center', duration:10, text:'', text_position:'bottom', description:'Sovuq tonlar',           mood:'Sovuq'     }
  };
  return plans[mood] || getDefaultPlan();
}

function getDefaultPlan(prompt) {
  return { style:'warm', effects:['ken_burns','vignette'], zoom:'in', pan:'center', duration:10, text:'', text_position:'bottom', description:prompt||'Chiroyli video', mood:'Ijobiy' };
}

module.exports = { analyzeImageForVideo, getPlanByMood, getDefaultPlan };
