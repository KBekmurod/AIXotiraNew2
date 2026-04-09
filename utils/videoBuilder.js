'use strict';

const { execFile } = require('child_process');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');

var PYTHON_SCRIPT = path.join(__dirname, 'video_effects.py');

// ─────────────────────────────────────────
// Python skriptni chaqirish
// ─────────────────────────────────────────
function runPython(config) {
  return new Promise(function(resolve, reject) {
    var configJson = JSON.stringify(config);
    var timeout    = 120000; // 2 daqiqa

    execFile('python3', [PYTHON_SCRIPT, configJson], {
      timeout:  timeout,
      maxBuffer: 10 * 1024 * 1024
    }, function(err, stdout, stderr) {
      if (err) {
        console.error('[VideoBuilder] Python xato:', stderr.slice(0, 500));
        return reject(new Error('Video yaratishda xato: ' + (stderr.slice(0, 200) || err.message)));
      }
      try {
        var result = JSON.parse(stdout.trim());
        if (!result.ok) {
          return reject(new Error(result.error || 'Python xato'));
        }
        resolve(result);
      } catch(e) {
        reject(new Error('Python chiqishi noto\'g\'ri: ' + stdout.slice(0, 200)));
      }
    });
  });
}

// ─────────────────────────────────────────
// Rasmdan video yaratish
// ─────────────────────────────────────────
async function buildVideoFromImage(imagePath, plan, outputDir) {
  var outDir  = outputDir || os.tmpdir();
  var outPath = path.join(outDir, 'video_' + Date.now() + '.mp4');

  var config = Object.assign({}, plan, {
    image_path:  imagePath,
    output_path: outPath
  });

  console.log('[VideoBuilder] Boshlandi:', config.style, config.effects, config.duration + 's');
  var startTime = Date.now();

  var result = await runPython(config);

  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('[VideoBuilder] Tayyor:', elapsed + 's,', Math.round(result.size / 1024) + 'KB');

  // Fayl tekshiruvi
  if (!fs.existsSync(outPath)) {
    throw new Error('Video fayl yaratilmadi');
  }
  var stat = fs.statSync(outPath);
  if (stat.size < 1000) {
    fs.unlinkSync(outPath);
    throw new Error('Video fayl juda kichik (yaratishda xato bo\'ldi)');
  }
  if (stat.size > 50 * 1024 * 1024) {
    fs.unlinkSync(outPath);
    throw new Error('Video fayl juda katta (50MB dan oshdi)');
  }

  return {
    path:     outPath,
    size:     stat.size,
    duration: plan.duration,
    style:    plan.style,
    elapsed:  elapsed
  };
}

// ─────────────────────────────────────────
// Vaqtincha fayllarni tozalash
// ─────────────────────────────────────────
function cleanupFiles(filePaths) {
  (filePaths || []).forEach(function(fp) {
    try {
      if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch(e) {
      console.warn('[VideoBuilder] Cleanup xato:', fp, e.message);
    }
  });
}

// ─────────────────────────────────────────
// Telegram uchun video hajm tekshiruvi
// ─────────────────────────────────────────
function checkVideoSize(filePath) {
  if (!fs.existsSync(filePath)) return { ok: false, error: 'Fayl topilmadi' };
  var size = fs.statSync(filePath).size;
  var MB   = size / (1024 * 1024);
  if (MB > 50) return { ok: false, error: 'Video 50MB dan oshdi (' + MB.toFixed(1) + 'MB)' };
  return { ok: true, size: size, mb: MB.toFixed(1) };
}

module.exports = {
  buildVideoFromImage,
  cleanupFiles,
  checkVideoSize
};
