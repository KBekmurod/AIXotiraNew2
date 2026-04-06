'use strict';

// ═══════════════════════════════════════════════════════════
// PREZENTATSIYA AI PROMPT KONFIGURATSIYASI v3
// Yangilik: har slayd uchun layout turi (type) qo'shildi.
// Oddiy va Pro rejim bir xil AI prompt — faqat pptx.js da
// vizual darajasi farq qiladi.
// ═══════════════════════════════════════════════════════════

function buildPptPrompt(opts) {
  var topic     = opts.topic       || '';
  var N         = parseInt(opts.slideCount) || 7;
  var plan      = opts.plan        || null;
  var desc      = opts.description || '';
  var lang      = opts.language    || 'uz';
  var isPro     = opts.isPro       || false;

  var contentN  = N - 2;

  var langRule = {
    uz: "BARCHA matnlar faqat O'ZBEK tilida. To'g'ri grammatika, ravon va tushunarli uslub.",
    ru: "ВСЕ тексты только на РУССКОМ. Грамотно, профессионально, без ошибок.",
    en: "ALL texts in ENGLISH only. Professional, grammatically correct."
  }[lang] || "BARCHA matnlar faqat O'ZBEK tilida.";

  var planLines;
  if (plan && plan.length > 0) {
    var adjustedPlan = plan.slice(0, contentN);
    while (adjustedPlan.length < contentN) {
      adjustedPlan.push('Qo\'shimcha ' + (adjustedPlan.length + 1) + '-bo\'lim');
    }
    planLines = adjustedPlan;
  } else {
    planLines = null;
  }

  var layoutGuide = [
    'LAYOUT TURLARI — har slaydga mos birini tanlash SHART:',
    '',
    '  "cover"      -> Faqat 1-slayd (muqova). title, subtitle, points.',
    '  "agenda"     -> Faqat 2-slayd (reja). title:"Reja", body, points (har band izoh bilan).',
    '  "text"       -> Ko\'p matn kerak bo\'lganda. body (5+ gap) + points (5-6 ta).',
    '  "two-column" -> Ikki ustunli taqqoslash. leftTitle+leftPoints, rightTitle+rightPoints.',
    '  "stats"      -> Raqamlar va statistika. stats massiv [{value, label, desc}] (3-4 ta).',
    '  "timeline"   -> Jarayon/bosqich. steps massiv [{num, title, desc}] (3-5 ta).',
    '  "table"      -> Jadval kerak bo\'lganda. tableTitle, table[][], tableNote.',
    '  "quote"      -> Kuchli iqtibos yoki asosiy g\'oya. quote, quoteAuthor, body.',
    '  "end"        -> Faqat oxirgi slayd (xulosa). title, summary, isEnd:true.',
    '',
    'QOIDALAR:',
    '  - "cover" faqat 1-slaydda, "agenda" faqat 2-slaydda, "end" faqat oxirida.',
    '  - Kontent slaydlarda layoutlar ARALASH bo\'lsin — xilma-xillik shart.',
    '  - BIR XIL layoutni ketma-ket 2 martadan ortiq ishlatma.',
    '  - Mavzuga qarab eng mos layoutni tanla.',
  ].join('\n');

  var structureDesc = [
    'SLAYD TUZILMASI — QATIY ' + N + ' TA SLAYD:',
    '',
    '  1-slayd  -> type:"cover"  (muqova)',
    '  2-slayd  -> type:"agenda" (reja)',
  ];
  for (var i = 1; i <= contentN; i++) {
    var pName = planLines ? planLines[i - 1] : (i + '-bo\'lim');
    structureDesc.push('  ' + (i + 2) + '-slayd  -> ' + pName + ' (mos layout tanlang)');
  }
  structureDesc.push('  ' + N + '-slayd  -> type:"end" (xulosa, isEnd:true)');
  structureDesc.push('');
  structureDesc.push('JAMI: AYNAN ' + N + ' ta slayd!');

  if (planLines) {
    structureDesc.push('');
    structureDesc.push('FOYDALANUVCHI REJASI:');
    planLines.forEach(function(p, i) {
      structureDesc.push('  ' + (i + 1) + '. ' + p + ' -> ' + (i + 3) + '-slayd');
    });
  }

  var contentRules = [
    'HAR SLAYD UCHUN KONTENT TALABLARI:',
    '',
    'cover: title(5-8 soz), subtitle(1 kuchli gap), points(' + contentN + ' ta bolim nomi)',
    'agenda: title:"Reja", body(2-3 gap), points(har bolim + 10-15 sozlik izoh)',
    'text: title(4-7 soz), body(5+ gap 70+ soz), points(5-6 ta har biri 12-18 soz), note(20-30 soz)',
    'two-column: title, leftTitle, leftPoints(3-4 ta), rightTitle, rightPoints(3-4 ta), note',
    'stats: title, body(2 gap), stats[{value,label,desc}](3-4 ta), note(manba)',
    'timeline: title, body(1-2 gap), steps[{num,title,desc}](3-5 ta bosqich)',
    'table: title, body(1-2 gap), tableTitle, table[[sarlavha],[qator]...], tableNote',
    'quote: title, quote(1 kuchli gap), quoteAuthor(ixtiyoriy), body(3-4 gap), note',
    'end: title("Xulosa"), summary(4-5 gap), isEnd:true',
  ].join('\n');

  var visionRule = desc
    ? 'FOYDALANUVCHI TASAVVURI:\n"' + desc + '"\nAynan shunday bo\'lsin.'
    : 'STANDART: Professional, xilma-xil layoutlar, boy kontent.';

  var jsonExample = [
    'JSON FORMATI — FAQAT MASSIV:',
    '[',
    '  {"type":"cover","title":"Mavzu","subtitle":"Nima uchun muhim","points":["1-bolim","2-bolim","3-bolim"]},',
    '  {"type":"agenda","title":"Reja","body":"Ushbu prezentatsiyada...","points":["1. Bolim - izoh","2. Bolim - izoh"]},',
    '  {"type":"text","title":"Bolim","body":"5+ gap...","points":["nuqta 1","nuqta 2","nuqta 3","nuqta 4","nuqta 5"],"note":"fakt"},',
    '  {"type":"stats","title":"Raqamlar","body":"Kirish...","stats":[{"value":"68%","label":"Stress kamayadi","desc":"6 daqiqada"},{"value":"2x","label":"Tezroq","desc":"Aktiv usul"}],"note":"Manba"},',
    '  {"type":"two-column","title":"Taqqoslash","leftTitle":"A","leftPoints":["1","2","3"],"rightTitle":"B","rightPoints":["1","2","3"],"note":"Xulosa"},',
    '  {"type":"timeline","title":"Jarayon","body":"Kirish","steps":[{"num":"1","title":"Bosqich","desc":"izoh"},{"num":"2","title":"Bosqich","desc":"izoh"}]},',
    '  {"type":"table","title":"Jadval","body":"izoh","tableTitle":"Sarlavha","table":[["Ustun1","Ustun2"],["Q1","Q2"]],"tableNote":"Manba"},',
    '  {"type":"quote","title":"Goya","quote":"Bilim kuch.","quoteAuthor":"F.Bekon","body":"3-4 gap...","note":"fakt"},',
    '  {"type":"end","title":"Xulosa","summary":"4-5 gap...","isEnd":true}',
    ']',
  ].join('\n');

  return [
    'PROFESSIONAL PREZENTATSIYA YARATISH',
    '',
    'MAVZU: "' + topic + '"',
    'TIL: ' + langRule,
    '',
    structureDesc.join('\n'),
    '',
    layoutGuide,
    '',
    visionRule,
    '',
    contentRules,
    '',
    'QATIY QOIDALAR:',
    '1. AYNAN ' + N + ' ta slayd.',
    '2. Har slaydda "type" maydoni SHART.',
    '3. Ketma-ket bir xil layout TAKRORLANMASIN.',
    '4. Har kontent slaydda kamida 60 soz.',
    '5. Raqamlar, foizlar, statistika qosh.',
    '6. Faqat JSON massiv — boshqa hech narsa yozma.',
    '',
    jsonExample,
  ].join('\n');
}

module.exports = { buildPptPrompt };
