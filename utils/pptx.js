'use strict';
const PptxGenJS = require('pptxgenjs');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');

// ═══════════════════════════════════════════════════════════
// PPTX GENERATOR v3 — Layout tizimi
// Har slaydning "type" maydoni asosida mos layout chiziladi.
// Oddiy rejim: minimalist, 1 rang.
// Pro rejim: premium dizayn, aksent elementlar, dark/light.
// ═══════════════════════════════════════════════════════════

var THEMES = {
  blue:   { bg:'1B2A4A', accent:'2E86AB', text:'FFFFFF', sub:'A8C6D9', light:'EBF4FA', dark:'142038', mid:'2C3E60' },
  green:  { bg:'1B3A2A', accent:'27AE60', text:'FFFFFF', sub:'A9DFBF', light:'E9F7EF', dark:'122A1C', mid:'2A5C3A' },
  red:    { bg:'3A1B1B', accent:'E74C3C', text:'FFFFFF', sub:'F1948A', light:'FDECEA', dark:'2A1010', mid:'5A2A2A' },
  navy:   { bg:'0D1B2A', accent:'00B4D8', text:'FFFFFF', sub:'90E0EF', light:'E0F7FA', dark:'080F17', mid:'1A2E40' },
  purple: { bg:'1A0A2E', accent:'9B59B6', text:'FFFFFF', sub:'D7BDE2', light:'F5EEF8', dark:'110620', mid:'2E1050' }
};

function autoTheme(topic) {
  var t = (topic || '').toLowerCase();
  if (t.match(/biznes|iqtisod|moliya|marketing|savdo/)) return THEMES.blue;
  if (t.match(/ta.lim|maktab|biologiya|kimyo|fizika|ekolog|ilm/)) return THEMES.green;
  if (t.match(/texnologiya|dastur|it|intellekt|robot|digital/)) return THEMES.navy;
  if (t.match(/ijod|san.at|musiqa|dizayn|adabiyot/)) return THEMES.purple;
  if (t.match(/sport|energiya|kuch|motivatsiya/)) return THEMES.red;
  return THEMES.blue;
}

// ─────────────────────────────────────────────────────────
// YORDAMCHI: shadow obyekti — SHART: har safar yangi obyekt
// ─────────────────────────────────────────────────────────
function mkShadow() {
  return { type:'outer', blur:8, offset:3, angle:135, color:'000000', opacity:0.12 };
}

// ═══════════════════════════════════════════════════════════
// ODDIY REJIM — layout turlari, minimalist dizayn
// ═══════════════════════════════════════════════════════════
function buildSimple(pptx, slides) {
  pptx.defineLayout({ name:'L169', width:10, height:5.625 });
  pptx.layout = 'L169';

  var DARK  = '2C3E50';
  var ACC   = '2980B9';
  var LIGHT = 'F4F6F8';
  var GRAY  = '7F8C8D';
  var TEXT  = '2C3E50';
  var total = slides.length;

  slides.forEach(function(slide, idx) {
    var s    = pptx.addSlide();
    var type = slide.type || (idx === 0 ? 'cover' : (slide.isEnd ? 'end' : 'text'));

    // ── COVER ──
    if (type === 'cover') {
      s.background = { color: DARK };
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:0.1, fill:{ color:ACC } });
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.08, h:5.625, fill:{ color:ACC } });

      s.addText(slide.title || '', {
        x:0.35, y:0.9, w:9.3, h:1.5,
        fontSize:32, bold:true, color:'FFFFFF', fontFace:'Calibri'
      });
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x:0.35, y:2.55, w:9.3, h:0.6,
          fontSize:14, color:'A0B8CC', italic:true, fontFace:'Calibri'
        });
      }
      s.addShape(pptx.ShapeType.rect, { x:0.35, y:3.25, w:4, h:0.05, fill:{ color:ACC } });
      if (slide.points && slide.points.length) {
        slide.points.slice(0, 6).forEach(function(p, i) {
          s.addText((i + 1) + '.  ' + p, {
            x:0.35, y:3.45 + i * 0.33, w:9.3, h:0.3,
            fontSize:11, color:'A0B8CC', fontFace:'Calibri'
          });
        });
      }
      s.addShape(pptx.ShapeType.rect, { x:0, y:5.42, w:10, h:0.205, fill:{ color:'1A2530' } });
      s.addText(String(idx + 1) + ' / ' + total, {
        x:0, y:5.44, w:9.8, h:0.16, fontSize:8, color:'5A6A7A', align:'right'
      });
      return;
    }

    // ── AGENDA ──
    if (type === 'agenda') {
      s.background = { color: LIGHT };
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:1.1, fill:{ color:DARK } });
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.08, h:1.1, fill:{ color:ACC } });
      s.addText(slide.title || 'Reja', {
        x:0.25, y:0.1, w:9.5, h:0.9, fontSize:24, bold:true, color:'FFFFFF', valign:'middle', fontFace:'Calibri'
      });
      if (slide.body) {
        s.addText(slide.body, {
          x:0.3, y:1.2, w:9.4, h:0.6, fontSize:12, color:GRAY, fontFace:'Calibri'
        });
      }
      var pts = slide.points || [];
      pts.slice(0, 6).forEach(function(p, i) {
        var yp = 1.95 + i * 0.58;
        s.addShape(pptx.ShapeType.rect, { x:0.3, y:yp, w:9.4, h:0.5, fill:{ color: i % 2 === 0 ? 'FFFFFF' : 'F0F3F7' } });
        s.addShape(pptx.ShapeType.rect, { x:0.3, y:yp, w:0.06, h:0.5, fill:{ color:ACC } });
        s.addText(p, { x:0.48, y:yp + 0.05, w:9.0, h:0.4, fontSize:11, color:TEXT, fontFace:'Calibri' });
      });
      _simpleFooter(s, pptx, idx, total, ACC);
      return;
    }

    // ── END ──
    if (type === 'end') {
      s.background = { color: DARK };
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:0.1, fill:{ color:ACC } });
      s.addText(slide.title || 'Xulosa', {
        x:0.5, y:0.5, w:9, h:1.0, fontSize:28, bold:true, color:'FFFFFF', align:'center', fontFace:'Calibri'
      });
      s.addShape(pptx.ShapeType.rect, { x:3, y:1.6, w:4, h:0.06, fill:{ color:ACC } });
      if (slide.summary) {
        s.addText(slide.summary, {
          x:0.8, y:1.85, w:8.4, h:3.2, fontSize:13, color:'A0B8CC', align:'center', fontFace:'Calibri'
        });
      }
      s.addShape(pptx.ShapeType.rect, { x:0, y:5.42, w:10, h:0.205, fill:{ color:'1A2530' } });
      return;
    }

    // Qolgan barcha slaydlar uchun umumiy header
    s.background = { color:'FFFFFF' };
    s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:1.1, fill:{ color:DARK } });
    s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.08, h:1.1, fill:{ color:ACC } });
    s.addText(slide.title || '', {
      x:0.25, y:0.1, w:9.0, h:0.9, fontSize:20, bold:true, color:'FFFFFF', valign:'middle', fontFace:'Calibri'
    });
    s.addText(String(idx + 1) + '/' + total, {
      x:9.0, y:0.1, w:0.8, h:0.3, fontSize:8, color:'A0B0C0', align:'right'
    });

    // ── TEXT ──
    if (type === 'text') {
      var yPos = 1.25;
      if (slide.body) {
        var bH = slide.points && slide.points.length ? 0.9 : 1.2;
        s.addText(slide.body, { x:0.3, y:yPos, w:9.4, h:bH, fontSize:11, color:TEXT, fontFace:'Calibri', wrap:true });
        yPos += bH + 0.05;
      }
      if (slide.points && slide.points.length) {
        var maxP = Math.min(slide.points.length, 5);
        var availH2 = 5.3 - yPos;
        var iH   = Math.min(0.56, availH2 / maxP);
        var fSz  = iH < 0.42 ? 9 : 11;
        slide.points.slice(0, maxP).forEach(function(p, i) {
          var yp = yPos + i * iH;
          if (yp + iH > 5.32) return;
          s.addShape(pptx.ShapeType.rect, { x:0.3, y:yp + 0.15, w:0.14, h:0.14, fill:{ color:ACC } });
          s.addText(p, { x:0.55, y:yp, w:9.1, h:iH, fontSize:fSz, color:TEXT, fontFace:'Calibri', wrap:true });
          if (i < maxP - 1) {
            s.addShape(pptx.ShapeType.rect, { x:0.3, y:yp + iH - 0.02, w:9.4, h:0.01, fill:{ color:'E8ECF0' } });
          }
        });
      }
      _simpleNote(s, pptx, slide.note, ACC);
      _simpleFooter(s, pptx, idx, total, ACC);
      return;
    }

    // ── TWO-COLUMN ──
    if (type === 'two-column') {
      var colW = 4.5;
      var col2x = 5.2;
      [[0.3, slide.leftTitle, slide.leftPoints], [col2x, slide.rightTitle, slide.rightPoints]].forEach(function(col) {
        var cx = col[0], ctitle = col[1], cpts = col[2] || [];
        s.addShape(pptx.ShapeType.rect, { x:cx, y:1.2, w:colW, h:4.2, fill:{ color:'F8FAFB' } });
        s.addShape(pptx.ShapeType.rect, { x:cx, y:1.2, w:colW, h:0.4, fill:{ color:ACC } });
        s.addText(ctitle || '', { x:cx + 0.1, y:1.22, w:colW - 0.2, h:0.36, fontSize:12, bold:true, color:'FFFFFF', fontFace:'Calibri' });
        cpts.slice(0, 5).forEach(function(p, i) {
          s.addText('• ' + p, { x:cx + 0.15, y:1.75 + i * 0.55, w:colW - 0.25, h:0.5, fontSize:11, color:TEXT, fontFace:'Calibri' });
        });
      });
      // Divider
      s.addShape(pptx.ShapeType.rect, { x:4.95, y:1.25, w:0.08, h:4.1, fill:{ color:'E0E6EF' } });
      _simpleNote(s, pptx, slide.note, ACC);
      _simpleFooter(s, pptx, idx, total, ACC);
      return;
    }

    // ── STATS ──
    if (type === 'stats') {
      if (slide.body) {
        s.addText(slide.body, { x:0.3, y:1.2, w:9.4, h:0.55, fontSize:12, color:GRAY, fontFace:'Calibri' });
      }
      var stats = slide.stats || [];
      var sCount = Math.min(stats.length, 4);
      var sW = sCount > 0 ? (9.4 / sCount) : 4.7;
      stats.slice(0, 4).forEach(function(st, i) {
        var sx = 0.3 + i * sW;
        s.addShape(pptx.ShapeType.rect, { x:sx, y:1.9, w:sW - 0.15, h:2.9, fill:{ color:'F4F6F8' } });
        s.addShape(pptx.ShapeType.rect, { x:sx, y:1.9, w:sW - 0.15, h:0.08, fill:{ color:ACC } });
        s.addText(String(st.value || ''), {
          x:sx, y:2.05, w:sW - 0.15, h:0.95,
          fontSize:30, bold:true, color:ACC, align:'center', fontFace:'Calibri'
        });
        s.addText(String(st.label || ''), {
          x:sx + 0.04, y:3.05, w:sW - 0.23, h:0.5,
          fontSize:11, bold:true, color:TEXT, align:'center', fontFace:'Calibri', wrap:true
        });
        if (st.desc) {
          s.addText(String(st.desc), {
            x:sx + 0.05, y:3.58, w:sW - 0.25, h:1.05,
            fontSize:9, color:GRAY, align:'center', fontFace:'Calibri', wrap:true
          });
        }
      });
      _simpleNote(s, pptx, slide.note, ACC);
      _simpleFooter(s, pptx, idx, total, ACC);
      return;
    }

    // ── TIMELINE ──
    if (type === 'timeline') {
      if (slide.body) {
        s.addText(slide.body, { x:0.3, y:1.2, w:9.4, h:0.5, fontSize:12, color:GRAY, fontFace:'Calibri' });
      }
      var steps = slide.steps || [];
      var stCount = Math.min(steps.length, 5);
      var stW = stCount > 0 ? (9.4 / stCount) : 3;
      // Aloqa chizig'i
      s.addShape(pptx.ShapeType.rect, { x:0.3 + stW * 0.5, y:2.55, w:9.4 - stW, h:0.05, fill:{ color:'D0D8E4' } });
      steps.slice(0, 5).forEach(function(st, i) {
        var sx = 0.3 + i * stW;
        var cx = sx + (stW - 0.15) / 2 - 0.25;
        // Doira
        s.addShape(pptx.ShapeType.ellipse, { x:cx, y:2.2, w:0.6, h:0.6, fill:{ color:ACC } });
        s.addText(String(st.num || (i + 1)), {
          x:cx, y:2.22, w:0.6, h:0.56, fontSize:14, bold:true, color:'FFFFFF', align:'center', fontFace:'Calibri'
        });
        s.addText(String(st.title || ''), {
          x:sx, y:3.0, w:stW - 0.15, h:0.45,
          fontSize:11, bold:true, color:TEXT, align:'center', fontFace:'Calibri'
        });
        if (st.desc) {
          s.addText(String(st.desc), {
            x:sx + 0.05, y:3.5, w:stW - 0.25, h:1.5,
            fontSize:9, color:GRAY, align:'center', fontFace:'Calibri', wrap:true
          });
        }
      });
      _simpleFooter(s, pptx, idx, total, ACC);
      return;
    }

    // ── TABLE ──
    if (type === 'table') {
      var yT = 1.2;
      if (slide.body) {
        s.addText(slide.body, { x:0.3, y:yT, w:9.4, h:0.5, fontSize:12, color:GRAY, fontFace:'Calibri' });
        yT += 0.58;
      }
      if (slide.tableTitle) {
        s.addText(slide.tableTitle, { x:0.3, y:yT, w:9.4, h:0.32, fontSize:12, bold:true, color:DARK, fontFace:'Calibri' });
        yT += 0.37;
      }
      if (slide.table && slide.table.length > 1) {
        var tRows = slide.table.map(function(row, ri) {
          return row.map(function(cell) {
            return { text: String(cell), options: {
              bold: ri === 0, fontSize: ri === 0 ? 10 : 9,
              color: ri === 0 ? 'FFFFFF' : TEXT,
              fill: ri === 0 ? { color:DARK } : (ri % 2 === 0 ? { color:'F0F4F8' } : { color:'FFFFFF' }),
              border: [{ pt:0.5, color:'D0D8E4' }]
            }};
          });
        });
        var tH = Math.min(3.0, 0.38 * tRows.length);
        s.addTable(tRows, { x:0.3, y:yT, w:9.4, h:tH, rowH:0.36, fontSize:9 });
        yT += tH + 0.08;
        if (slide.tableNote) {
          s.addText('* ' + slide.tableNote, { x:0.3, y:yT, w:9.4, h:0.25, fontSize:8, color:GRAY, italic:true });
        }
      }
      _simpleFooter(s, pptx, idx, total, ACC);
      return;
    }

    // ── QUOTE ──
    if (type === 'quote') {
      s.addShape(pptx.ShapeType.rect, { x:0.3, y:1.3, w:9.4, h:1.6, fill:{ color:'F0F4F8' } });
      s.addShape(pptx.ShapeType.rect, { x:0.3, y:1.3, w:0.1, h:1.6, fill:{ color:ACC } });
      s.addText('"', { x:0.5, y:1.1, w:0.8, h:0.9, fontSize:48, bold:true, color:ACC, fontFace:'Georgia' });
      if (slide.quote) {
        s.addText(slide.quote, {
          x:0.6, y:1.4, w:9.0, h:1.1,
          fontSize:16, bold:true, color:DARK, align:'center', fontFace:'Georgia', italic:true
        });
      }
      if (slide.quoteAuthor) {
        s.addText('— ' + slide.quoteAuthor, {
          x:0.3, y:3.0, w:9.4, h:0.35, fontSize:11, color:GRAY, align:'right', fontFace:'Calibri'
        });
      }
      if (slide.body) {
        s.addText(slide.body, { x:0.3, y:3.45, w:9.4, h:1.2, fontSize:11, color:TEXT, fontFace:'Calibri' });
      }
      _simpleNote(s, pptx, slide.note, ACC);
      _simpleFooter(s, pptx, idx, total, ACC);
      return;
    }

    // ── Fallback: text ──
    var yFb = 1.25;
    if (slide.body) {
      s.addText(slide.body, { x:0.3, y:yFb, w:9.4, h:1.2, fontSize:11, color:TEXT, fontFace:'Calibri' });
      yFb += 1.28;
    }
    if (slide.points && slide.points.length) {
      slide.points.slice(0, 5).forEach(function(p, i) {
        s.addText('• ' + p, { x:0.3, y:yFb + i * 0.5, w:9.4, h:0.46, fontSize:11, color:TEXT, fontFace:'Calibri' });
      });
    }
    _simpleNote(s, pptx, slide.note, ACC);
    _simpleFooter(s, pptx, idx, total, ACC);
  });
}

function _simpleNote(s, pptx, note, acc) {
  if (!note) return;
  s.addShape(pptx.ShapeType.rect, { x:0, y:5.28, w:10, h:0.25, fill:{ color:'EBF0F5' } });
  s.addText('💡  ' + note, { x:0.3, y:5.3, w:9.4, h:0.2, fontSize:9, color:'5D7083', italic:true, fontFace:'Calibri' });
}

function _simpleFooter(s, pptx, idx, total, acc) {
  s.addShape(pptx.ShapeType.rect, { x:0, y:5.55, w:10, h:0.075, fill:{ color:'D8E4EC' } });
}


// ═══════════════════════════════════════════════════════════
// PRO REJIM — premium dizayn, dark/light sandwich
// ═══════════════════════════════════════════════════════════
function buildProfessional(pptx, slides, theme, images) {
  pptx.defineLayout({ name:'L169', width:10, height:5.625 });
  pptx.layout = 'L169';

  // Rasmlarni kontent slaydlarga taqsimlash
  var imgMap = {};
  if (images && images.length) {
    var contentSlides = slides.filter(function(sl, si) {
      return si > 0 && !sl.isEnd && sl.type !== 'cover' && sl.type !== 'agenda' && sl.type !== 'end';
    });
    var contentIdxs = [];
    slides.forEach(function(sl, si) {
      if (si > 0 && !sl.isEnd && sl.type !== 'cover' && sl.type !== 'agenda' && sl.type !== 'end') {
        contentIdxs.push(si);
      }
    });

    images.forEach(function(img, imgI) {
      var imgPath  = typeof img === 'string' ? img : img.path;
      var imgTopic = typeof img === 'object' && img.topic ? img.topic.toLowerCase() : '';

      if (imgTopic) {
        var bestIdx   = -1;
        var bestScore = 0;
        contentIdxs.forEach(function(si) {
          if (imgMap[si]) return;
          var sl = slides[si];
          var title = (sl.title || '').toLowerCase();
          var body  = (sl.body  || '').toLowerCase();
          var words = imgTopic.split(/\s+/);
          var score = words.filter(function(w) {
            return w.length > 2 && (title.includes(w) || body.includes(w));
          }).length;
          if (score > bestScore) { bestScore = score; bestIdx = si; }
        });
        if (bestIdx >= 0) { imgMap[bestIdx] = imgPath; return; }
      }

      // Ketma-ket
      for (var j = 0; j < contentIdxs.length; j++) {
        if (!imgMap[contentIdxs[j]]) { imgMap[contentIdxs[j]] = imgPath; break; }
      }
    });
  }

  var total = slides.length;

  slides.forEach(function(slide, idx) {
    var s    = pptx.addSlide();
    var type = slide.type || (idx === 0 ? 'cover' : (slide.isEnd ? 'end' : 'text'));
    var hasImg = !!imgMap[idx];

    // ══════════════════════════════
    // COVER — dark, hero
    // ══════════════════════════════
    if (type === 'cover') {
      s.background = { color: theme.bg };

      // Chap aksent panel
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.4, h:5.625, fill:{ color:theme.accent } });
      // O'ng pastki dekorativ blok (5.625" dan chiqmasin)
      s.addShape(pptx.ShapeType.rect, { x:6.5, y:3.5, w:3.5, h:2.1, fill:{ color:theme.accent }, transparency:85 });
      s.addShape(pptx.ShapeType.rect, { x:7.5, y:4.2, w:2.5, h:1.4, fill:{ color:theme.accent }, transparency:72 });
      // Yuqori aksent chiziq
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:0.1, fill:{ color:theme.accent } });

      s.addText(slide.title || '', {
        x:0.7, y:0.7, w:9.0, h:1.7,
        fontSize:36, bold:true, color:theme.text, fontFace:'Calibri'
      });
      s.addShape(pptx.ShapeType.rect, { x:0.7, y:2.55, w:3.5, h:0.07, fill:{ color:theme.accent } });

      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x:0.7, y:2.75, w:8.8, h:0.55,
          fontSize:14, color:theme.sub, italic:true, fontFace:'Calibri'
        });
      }
      if (slide.points && slide.points.length) {
        slide.points.slice(0, 6).forEach(function(p, i) {
          s.addText('→  ' + p, {
            x:0.7, y:3.45 + i * 0.32, w:8.8, h:0.28,
            fontSize:11, color:theme.sub, fontFace:'Calibri'
          });
        });
      }
      // Brend footer
      s.addShape(pptx.ShapeType.rect, { x:0, y:5.38, w:10, h:0.245, fill:{ color:theme.accent }, transparency:50 });
      s.addText(String(idx + 1) + ' / ' + total, {
        x:0.3, y:5.4, w:9.4, h:0.18, fontSize:8, color:theme.sub, align:'right', fontFace:'Calibri'
      });
      return;
    }

    // ══════════════════════════════
    // AGENDA — light bg, numbered
    // ══════════════════════════════
    if (type === 'agenda') {
      s.background = { color: theme.light };
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:1.15, fill:{ color:theme.bg } });
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.4, h:1.15, fill:{ color:theme.accent } });
      s.addText(slide.title || 'Reja', {
        x:0.6, y:0.12, w:9.0, h:0.9,
        fontSize:24, bold:true, color:theme.text, valign:'middle', fontFace:'Calibri'
      });
      if (slide.body) {
        s.addText(slide.body, {
          x:0.4, y:1.25, w:9.2, h:0.52,
          fontSize:12, color:theme.mid, fontFace:'Calibri'
        });
      }
      var pts = slide.points || [];
      pts.slice(0, 6).forEach(function(p, i) {
        var yp = 1.88 + i * 0.58;
        s.addShape(pptx.ShapeType.rect, {
          x:0.4, y:yp, w:9.2, h:0.5,
          fill:{ color: i % 2 === 0 ? 'FFFFFF' : theme.light },
          shadow: mkShadow()
        });
        // Numara doirasi
        s.addShape(pptx.ShapeType.ellipse, { x:0.45, y:yp + 0.08, w:0.34, h:0.34, fill:{ color:theme.accent } });
        s.addText(String(i + 1), {
          x:0.45, y:yp + 0.1, w:0.34, h:0.28,
          fontSize:10, bold:true, color:'FFFFFF', align:'center', fontFace:'Calibri'
        });
        s.addText(p, {
          x:0.92, y:yp + 0.06, w:8.55, h:0.38,
          fontSize:11, color:theme.mid, fontFace:'Calibri'
        });
      });
      _proFooter(s, pptx, theme, idx, total);
      return;
    }

    // ══════════════════════════════
    // END — dark, impactful
    // ══════════════════════════════
    if (type === 'end' || slide.isEnd) {
      s.background = { color: theme.bg };
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:0.1, fill:{ color:theme.accent } });
      s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.4, h:5.625, fill:{ color:theme.accent } });

      s.addText(slide.title || 'Xulosa', {
        x:0.7, y:0.8, w:9.0, h:1.1,
        fontSize:30, bold:true, color:theme.text, align:'center', fontFace:'Calibri'
      });
      s.addShape(pptx.ShapeType.rect, { x:2.5, y:2.0, w:5, h:0.06, fill:{ color:theme.accent }, transparency:40 });

      if (slide.summary) {
        s.addText(slide.summary, {
          x:1.0, y:2.25, w:8.0, h:2.8,
          fontSize:13, color:theme.sub, align:'center', fontFace:'Calibri'
        });
      }
      s.addShape(pptx.ShapeType.rect, { x:0, y:5.38, w:10, h:0.245, fill:{ color:theme.accent }, transparency:50 });
      return;
    }

    // ══════════════════════════════
    // KONTENT SLAYDLAR — light bg
    // ══════════════════════════════
    s.background = { color: theme.light };

    // Sarlavha paneli
    s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:1.2, fill:{ color:theme.bg } });
    s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.4, h:1.2, fill:{ color:theme.accent } });

    // Raqam badge
    s.addShape(pptx.ShapeType.ellipse, { x:9.05, y:0.22, w:0.68, h:0.68, fill:{ color:theme.accent } });
    s.addText(String(idx), {
      x:9.05, y:0.26, w:0.68, h:0.6,
      fontSize:14, bold:true, color:'FFFFFF', align:'center', fontFace:'Calibri'
    });

    s.addText(slide.title || '', {
      x:0.6, y:0.15, w:8.25, h:0.9,
      fontSize:20, bold:true, color:theme.text, valign:'middle', fontFace:'Calibri'
    });

    // Rasm (agar bor bo'lsa)
    if (hasImg) {
      try {
        s.addImage({ path: imgMap[idx], x:6.2, y:1.35, w:3.55, h:3.5,
          sizing:{ type:'contain', w:3.55, h:3.5 } });
      } catch(e) { console.warn('[PPT-PRO] Rasm yuklanmadi:', e.message); }
    }
    var cW = hasImg ? 5.65 : 9.4;
    var y0 = 1.35;

    // ── TEXT ──
    if (type === 'text') {
      if (slide.body) {
        var bodyH = slide.points && slide.points.length ? 0.95 : 1.2;
        s.addShape(pptx.ShapeType.rect, { x:0.35, y:y0, w:cW, h:bodyH, fill:{ color:'FFFFFF' }, shadow: mkShadow() });
        s.addText(slide.body, {
          x:0.5, y:y0 + 0.07, w:cW - 0.25, h:bodyH - 0.1,
          fontSize:11, color:theme.mid, fontFace:'Calibri', wrap:true
        });
        y0 += bodyH + 0.08;
      }
      if (slide.points && slide.points.length) {
        var maxP = Math.min(slide.points.length, hasImg ? 4 : 5);
        var availH = 5.35 - y0;
        var iH   = Math.min(0.60, availH / maxP);
        var fSize = iH < 0.45 ? 9 : (maxP > 4 ? 10 : 11);
        slide.points.slice(0, maxP).forEach(function(p, i) {
          var yp = y0 + i * iH;
          if (yp + iH > 5.38) return;
          s.addShape(pptx.ShapeType.rect, { x:0.35, y:yp, w:cW, h:iH - 0.03, fill:{ color:'FFFFFF' }, shadow: mkShadow() });
          s.addShape(pptx.ShapeType.rect, { x:0.35, y:yp, w:0.07, h:iH - 0.03, fill:{ color:theme.accent } });
          s.addText(p, {
            x:0.55, y:yp + 0.04, w:cW - 0.3, h:iH - 0.1,
            fontSize:fSize, color:theme.mid, fontFace:'Calibri', wrap:true
          });
        });
      }
      _proNote(s, pptx, theme, slide.note);
      _proFooter(s, pptx, theme, idx, total);
      return;
    }

    // ── TWO-COLUMN ──
    if (type === 'two-column') {
      // Rasm bo'lsa: ikkala ustun kichrayadi, rasm pastki o'ngga joylashadi
      // Rasm yo'q: standart ikki teng ustun
      var tcW   = hasImg ? 4.35 : 4.55;   // har bir ustun kengligi
      var tcGap = hasImg ? 0.15 : 0.2;    // ustunlar orasidagi bo'shliq
      var col1x  = 0.35;
      var col2x2 = col1x + tcW + tcGap;
      var colW2  = tcW;

      [[col1x, slide.leftTitle, slide.leftPoints], [col2x2, slide.rightTitle, slide.rightPoints]].forEach(function(col) {
        var cx = col[0], ctitle = col[1], cpts = col[2] || [];
        var colH = hasImg ? 2.55 : 3.8;   // rasm bo'lsa ustun past bo'ladi
        s.addShape(pptx.ShapeType.rect, { x:cx, y:1.3, w:colW2, h:colH, fill:{ color:'FFFFFF' }, shadow: mkShadow() });
        s.addShape(pptx.ShapeType.rect, { x:cx, y:1.3, w:colW2, h:0.46, fill:{ color:theme.bg } });
        s.addText(ctitle || '', {
          x:cx + 0.12, y:1.32, w:colW2 - 0.24, h:0.42,
          fontSize:12, bold:true, color:theme.text, valign:'middle', fontFace:'Calibri'
        });
        var maxPts = hasImg ? 4 : 5;
        cpts.slice(0, maxPts).forEach(function(p, i) {
          var yp = 1.9 + i * 0.52;
          s.addShape(pptx.ShapeType.ellipse, { x:cx + 0.12, y:yp + 0.15, w:0.20, h:0.20, fill:{ color:theme.accent } });
          s.addText(p, { x:cx + 0.42, y:yp, w:colW2 - 0.52, h:0.48, fontSize:10, color:theme.mid, fontFace:'Calibri', wrap:true });
        });
      });

      // Divider
      var divX = col1x + colW2 + tcGap * 0.5 - 0.04;
      var divH = hasImg ? 2.55 : 3.7;
      s.addShape(pptx.ShapeType.rect, { x:divX, y:1.35, w:0.08, h:divH, fill:{ color:theme.accent }, transparency:60 });

      // Rasm — pastki qismda to'liq kenglikda
      if (hasImg) {
        try {
          var imgW = col2x2 + colW2 - col1x;   // ikkala ustun umumiy kengligi
          s.addImage({ path: imgMap[idx], x:col1x, y:3.95, w:imgW, h:1.55,
            sizing:{ type:'contain', w:imgW, h:1.55 } });
        } catch(e) { console.warn('[PPT-PRO] Two-column rasm yuklanmadi:', e.message); }
      }

      _proNote(s, pptx, theme, slide.note);
      _proFooter(s, pptx, theme, idx, total);
      return;
    }

    // ── STATS ──
    if (type === 'stats') {
      if (slide.body) {
        s.addText(slide.body, { x:0.35, y:1.3, w:cW, h:0.5, fontSize:12, color:theme.mid, fontFace:'Calibri' });
      }
      var stats = slide.stats || [];
      var stCnt = Math.min(stats.length, 4);
      var stW2  = stCnt > 0 ? (cW / stCnt) : cW;
      stats.slice(0, 4).forEach(function(st, i) {
        var sx = 0.35 + i * stW2;
        s.addShape(pptx.ShapeType.rect, {
          x:sx, y:1.95, w:stW2 - 0.18, h:2.85,
          fill:{ color: i % 2 === 0 ? theme.bg : theme.mid },
          shadow: mkShadow()
        });
        s.addText(String(st.value || ''), {
          x:sx, y:2.1, w:stW2 - 0.18, h:0.9,
          fontSize:32, bold:true, color:theme.accent, align:'center', fontFace:'Calibri'
        });
        s.addText(String(st.label || ''), {
          x:sx + 0.04, y:3.05, w:stW2 - 0.26, h:0.5,
          fontSize:11, bold:true, color:theme.text, align:'center', fontFace:'Calibri', wrap:true
        });
        if (st.desc) {
          s.addText(String(st.desc), {
            x:sx + 0.06, y:3.58, w:stW2 - 0.3, h:1.1,
            fontSize:9, color:theme.sub, align:'center', fontFace:'Calibri', wrap:true
          });
        }
      });
      _proNote(s, pptx, theme, slide.note);
      _proFooter(s, pptx, theme, idx, total);
      return;
    }

    // ── TIMELINE ──
    if (type === 'timeline') {
      if (slide.body) {
        s.addText(slide.body, { x:0.35, y:1.3, w:cW, h:0.5, fontSize:12, color:theme.mid, fontFace:'Calibri' });
      }
      var steps2  = slide.steps || [];
      var stCnt2  = Math.min(steps2.length, 5);
      var stW3    = stCnt2 > 0 ? (cW / stCnt2) : cW;
      // Connecting line
      if (stCnt2 > 1) {
        s.addShape(pptx.ShapeType.rect, {
          x: 0.35 + stW3 * 0.5,
          y: 2.5,
          w: cW - stW3,
          h: 0.06,
          fill:{ color:theme.accent }, transparency:55
        });
      }
      steps2.slice(0, 5).forEach(function(st, i) {
        var sx = 0.35 + i * stW3;
        var cx = sx + (stW3 - 0.15) / 2 - 0.3;
        s.addShape(pptx.ShapeType.ellipse, { x:cx, y:2.2, w:0.65, h:0.65, fill:{ color:theme.accent }, shadow: mkShadow() });
        s.addText(String(st.num || (i + 1)), {
          x:cx, y:2.22, w:0.65, h:0.6, fontSize:15, bold:true, color:'FFFFFF', align:'center', fontFace:'Calibri'
        });
        s.addShape(pptx.ShapeType.rect, {
          x:sx + 0.05, y:3.0, w:stW3 - 0.2, h:1.85,
          fill:{ color:'FFFFFF' }, shadow: mkShadow()
        });
        s.addText(String(st.title || ''), {
          x:sx + 0.06, y:3.04, w:stW3 - 0.22, h:0.46,
          fontSize:10, bold:true, color:theme.bg, align:'center', fontFace:'Calibri', wrap:true
        });
        if (st.desc) {
          s.addText(String(st.desc), {
            x:sx + 0.06, y:3.52, w:stW3 - 0.22, h:1.28,
            fontSize:9, color:theme.mid, align:'center', fontFace:'Calibri', wrap:true
          });
        }
      });
      _proFooter(s, pptx, theme, idx, total);
      return;
    }

    // ── TABLE ──
    if (type === 'table') {
      var yT2 = 1.3;
      if (slide.body) {
        s.addText(slide.body, { x:0.35, y:yT2, w:cW, h:0.5, fontSize:12, color:theme.mid, fontFace:'Calibri' });
        yT2 += 0.58;
      }
      if (slide.tableTitle) {
        s.addText(slide.tableTitle, { x:0.35, y:yT2, w:cW, h:0.34, fontSize:12, bold:true, color:theme.bg, fontFace:'Calibri' });
        yT2 += 0.39;
      }
      if (slide.table && slide.table.length > 1) {
        var tRows2 = slide.table.map(function(row, ri) {
          return row.map(function(cell) {
            return { text: String(cell), options: {
              bold: ri === 0, fontSize: ri === 0 ? 10 : 9,
              color: ri === 0 ? 'FFFFFF' : theme.mid,
              fill: ri === 0 ? { color:theme.bg } : (ri % 2 === 0 ? { color:theme.light } : { color:'FFFFFF' }),
              border: [{ pt:0.5, color:theme.accent }]
            }};
          });
        });
        var tH2 = Math.min(2.8, 0.36 * tRows2.length);
        s.addTable(tRows2, { x:0.35, y:yT2, w:cW, h:tH2, rowH:0.33, fontSize:9 });
        yT2 += tH2 + 0.08;
        if (slide.tableNote) {
          s.addText('📊 ' + slide.tableNote, {
            x:0.35, y:yT2, w:cW, h:0.25,
            fontSize:8, color:theme.accent, italic:true, fontFace:'Calibri'
          });
        }
      }
      _proFooter(s, pptx, theme, idx, total);
      return;
    }

    // ── QUOTE ──
    if (type === 'quote') {
      s.addShape(pptx.ShapeType.rect, {
        x:0.35, y:1.35, w:cW, h:1.75,
        fill:{ color:theme.bg }, shadow: mkShadow()
      });
      s.addShape(pptx.ShapeType.rect, { x:0.35, y:1.35, w:0.08, h:1.75, fill:{ color:theme.accent } });
      s.addText('\u201C', { x:0.5, y:1.1, w:0.9, h:1.0, fontSize:52, bold:true, color:theme.accent, fontFace:'Georgia' });
      if (slide.quote) {
        s.addText(slide.quote, {
          x:0.6, y:1.5, w:cW - 0.35, h:1.1,
          fontSize:16, bold:true, color:theme.text, align:'center', italic:true, fontFace:'Georgia'
        });
      }
      if (slide.quoteAuthor) {
        s.addText('— ' + slide.quoteAuthor, {
          x:0.35, y:3.18, w:cW, h:0.34,
          fontSize:11, color:theme.sub, align:'right', fontFace:'Calibri'
        });
      }
      if (slide.body) {
        s.addShape(pptx.ShapeType.rect, { x:0.35, y:3.62, w:cW, h:1.3, fill:{ color:'FFFFFF' }, shadow: mkShadow() });
        s.addText(slide.body, {
          x:0.5, y:3.7, w:cW - 0.3, h:1.15,
          fontSize:11, color:theme.mid, fontFace:'Calibri'
        });
      }
      _proNote(s, pptx, theme, slide.note);
      _proFooter(s, pptx, theme, idx, total);
      return;
    }

    // ── Fallback: text ──
    if (slide.body) {
      s.addShape(pptx.ShapeType.rect, { x:0.35, y:y0, w:cW, h:1.2, fill:{ color:'FFFFFF' }, shadow: mkShadow() });
      s.addText(slide.body, { x:0.5, y:y0 + 0.08, w:cW - 0.25, h:1.05, fontSize:11, color:theme.mid, fontFace:'Calibri' });
      y0 += 1.3;
    }
    if (slide.points && slide.points.length) {
      slide.points.slice(0, 5).forEach(function(p, i) {
        var yp = y0 + i * 0.62;
        s.addShape(pptx.ShapeType.rect, { x:0.35, y:yp, w:cW, h:0.58, fill:{ color:'FFFFFF' }, shadow: mkShadow() });
        s.addShape(pptx.ShapeType.rect, { x:0.35, y:yp, w:0.07, h:0.58, fill:{ color:theme.accent } });
        s.addText(p, { x:0.55, y:yp + 0.06, w:cW - 0.3, h:0.46, fontSize:11, color:theme.mid, fontFace:'Calibri' });
      });
    }
    _proNote(s, pptx, theme, slide.note);
    _proFooter(s, pptx, theme, idx, total);
  });
}

function _proNote(s, pptx, theme, note) {
  if (!note) return;
  s.addShape(pptx.ShapeType.rect, { x:0, y:5.22, w:10, h:0.3, fill:{ color:theme.light } });
  s.addText('💡  ' + note, {
    x:0.35, y:5.25, w:9.3, h:0.24,
    fontSize:9, color:theme.accent, italic:true, fontFace:'Calibri'
  });
}

function _proFooter(s, pptx, theme, idx, total) {
  s.addShape(pptx.ShapeType.rect, { x:0, y:5.55, w:10, h:0.075, fill:{ color:theme.bg } });
  s.addText(String(idx + 1) + ' / ' + total, {
    x:9.0, y:5.55, w:0.85, h:0.07, fontSize:7, color:theme.sub, align:'right'
  });
}


// ─────────────────────────────────────────────────────────
// ASOSIY FUNKSIYA
// ─────────────────────────────────────────────────────────
async function generatePptx(slides, options) {
  var isPro  = !!(options && options.professional);
  var topic  = (options && options.topic)   || '';
  var theme  = (options && options.theme && THEMES[options.theme]) || autoTheme(topic);
  var images = (options && options.images)  || [];

  var pptx   = new PptxGenJS();
  pptx.title   = topic || 'Prezentatsiya';
  pptx.subject = topic || 'Prezentatsiya';
  pptx.author  = '';

  if (isPro) buildProfessional(pptx, slides, theme, images);
  else       buildSimple(pptx, slides);

  var tmpFile = path.join(
    os.tmpdir(),
    'pptx_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.pptx'
  );
  await pptx.writeFile({ fileName: tmpFile });
  return tmpFile;
}

module.exports = { generatePptx, THEMES, autoTheme };
