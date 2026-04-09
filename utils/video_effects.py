#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AIxotira Video Effects Engine
Rasm → Professional video (OpenCV + NumPy + Pillow + FFmpeg)
"""

import cv2
import numpy as np
import subprocess
import os
import sys
import json
import tempfile
import shutil
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw, ImageFont

# ═══════════════════════════════════════════
# ASOSIY KONFIGURATSIYA
# ═══════════════════════════════════════════
FPS       = 24
WIDTH     = 1280
HEIGHT    = 720
FONT_PATH = None  # Agar maxsus font bo'lsa

def load_image(path):
    """Rasmni yuklab, 1280x720 ga moslash"""
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Rasm yuklanmadi: {path}")
    # Aspect ratio saqlab resize
    h, w = img.shape[:2]
    ar = w / h
    if ar > WIDTH / HEIGHT:
        new_w = WIDTH
        new_h = int(WIDTH / ar)
    else:
        new_h = HEIGHT
        new_w = int(HEIGHT * ar)
    img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    # Canvas ga joylashtirish (letter/pillarbox)
    canvas = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    y_off = (HEIGHT - new_h) // 2
    x_off = (WIDTH  - new_w) // 2
    canvas[y_off:y_off+new_h, x_off:x_off+new_w] = img
    return canvas

# ═══════════════════════════════════════════
# FILTRLAR
# ═══════════════════════════════════════════

def filter_vintage(img):
    """Nostaljik sepia filtr"""
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    r, g, b = pil.split()
    r2 = r.point(lambda i: min(255, int(i*0.393 + 255*0.272 + 255*0.168)))
    g2 = g.point(lambda i: min(255, int(255*0.349 + i*0.686 + 255*0.131)))
    b2 = b.point(lambda i: min(255, int(255*0.272 + 255*0.534 + i*0.131)))
    sepia = Image.merge('RGB', (r2, g2, b2))
    sepia = ImageEnhance.Contrast(sepia).enhance(0.82)
    sepia = ImageEnhance.Brightness(sepia).enhance(0.92)
    return cv2.cvtColor(np.array(sepia), cv2.COLOR_RGB2BGR)

def filter_dramatic(img):
    """Dramatik qora-oq, yuqori kontrast"""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    pil = Image.fromarray(cv2.cvtColor(gray, cv2.COLOR_BGR2RGB))
    pil = ImageEnhance.Contrast(pil).enhance(1.6)
    pil = ImageEnhance.Brightness(pil).enhance(0.85)
    return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

def filter_warm(img):
    """Iliq sariq-qizil tonlar"""
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    r, g, b = pil.split()
    r2 = r.point(lambda i: min(255, int(i * 1.15)))
    g2 = g.point(lambda i: min(255, int(i * 1.05)))
    b2 = b.point(lambda i: max(0,   int(i * 0.85)))
    warm = Image.merge('RGB', (r2, g2, b2))
    warm = ImageEnhance.Saturation(warm).enhance(1.2)
    return cv2.cvtColor(np.array(warm), cv2.COLOR_RGB2BGR)

def filter_cool(img):
    """Sovuq ko'k-moviy tonlar"""
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    r, g, b = pil.split()
    r2 = r.point(lambda i: max(0,   int(i * 0.85)))
    g2 = g.point(lambda i: min(255, int(i * 1.05)))
    b2 = b.point(lambda i: min(255, int(i * 1.2)))
    cool = Image.merge('RGB', (r2, g2, b2))
    return cv2.cvtColor(np.array(cool), cv2.COLOR_RGB2BGR)

def filter_cinema(img):
    """Cinematic teal & orange"""
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    r, g, b = pil.split()
    r2 = r.point(lambda i: min(255, int(i * 1.1 + 10)))
    g2 = g.point(lambda i: min(255, int(i * 0.95)))
    b2 = b.point(lambda i: min(255, int(i * 0.9 + 15)))
    cinema = Image.merge('RGB', (r2, g2, b2))
    cinema = ImageEnhance.Contrast(cinema).enhance(1.15)
    cinema = ImageEnhance.Saturation(cinema).enhance(1.1)
    return cv2.cvtColor(np.array(cinema), cv2.COLOR_RGB2BGR)

def filter_none(img):
    return img

FILTERS = {
    'vintage':  filter_vintage,
    'dramatic': filter_dramatic,
    'warm':     filter_warm,
    'cool':     filter_cool,
    'cinema':   filter_cinema,
    'none':     filter_none
}

# ═══════════════════════════════════════════
# EFFEKTLAR
# ═══════════════════════════════════════════

def vignette(img, strength=0.65):
    """Chetlarni qoraytirish"""
    h, w = img.shape[:2]
    Y, X = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    dist = np.sqrt(((X - cx) / cx) ** 2 + ((Y - cy) / cy) ** 2)
    mask = np.clip(1.0 - dist * strength, 0.2, 1.0)
    return (img * mask[:, :, np.newaxis]).astype(np.uint8)

def film_grain(img, intensity=8):
    """Eski film donadorligi"""
    noise = np.random.randint(-intensity, intensity, img.shape, dtype=np.int16)
    return np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

def letterbox(img):
    """Kinematik qora chiziqlar (2.35:1)"""
    h = img.shape[0]
    bar = int(h * 0.08)
    result = img.copy()
    result[:bar, :] = 0
    result[h-bar:, :] = 0
    return result

def fade_frame(img, alpha):
    """Alpha miqdorida qoraytirish/yorqinlashtirish"""
    return (img * np.clip(alpha, 0, 1)).astype(np.uint8)

def add_text_overlay(img, text, position='bottom', size=1.0, color=(255,255,255), opacity=0.85):
    """Rasmga matn overlay qo'shish"""
    if not text:
        return img
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil)
    w, h = pil.size
    font_size = max(24, int(36 * size))
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if position == 'bottom':
        tx = (w - tw) // 2
        ty = h - th - 40
    elif position == 'top':
        tx = (w - tw) // 2
        ty = 30
    else:
        tx = (w - tw) // 2
        ty = (h - th) // 2
    # Soya
    draw.text((tx+2, ty+2), text, font=font, fill=(0, 0, 0))
    draw.text((tx, ty), text, font=font, fill=tuple(reversed(color)))
    return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

# ═══════════════════════════════════════════
# ANIMATSIYA GENERATORLARI
# ═══════════════════════════════════════════

def ease_inout(t):
    """Silliq harakatlanish (ease in-out)"""
    return t * t * (3 - 2 * t)

def gen_ken_burns(img, duration, fps, direction='zoom_in', pan='center'):
    """Ken Burns — zoom + pan animatsiyasi"""
    h, w = img.shape[:2]
    frames = []
    total = int(duration * fps)
    for i in range(total):
        t = ease_inout(i / max(total - 1, 1))
        if direction == 'zoom_in':
            scale = 1.0 + t * 0.18
        elif direction == 'zoom_out':
            scale = 1.18 - t * 0.18
        else:
            scale = 1.09
        nw = max(1, int(w / scale))
        nh = max(1, int(h / scale))
        if pan == 'left':
            x = int((w - nw) * t)
            y = (h - nh) // 2
        elif pan == 'right':
            x = int((w - nw) * (1 - t))
            y = (h - nh) // 2
        elif pan == 'up':
            x = (w - nw) // 2
            y = int((h - nh) * t)
        elif pan == 'down':
            x = (w - nw) // 2
            y = int((h - nh) * (1 - t))
        else:
            x = (w - nw) // 2
            y = (h - nh) // 2
        cropped = img[y:y+nh, x:x+nw]
        frames.append(cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR))
    return frames

def gen_parallax(img, duration, fps):
    """Parallax — qatlamli chuqurlik effekti"""
    h, w = img.shape[:2]
    # Yuz/markaziy ob'ekt va fon simulatsiyasi
    frames = []
    total = int(duration * fps)
    # Fon — sekin, old plan — tez siljiydigan
    for i in range(total):
        t = np.sin(i / total * np.pi * 2) * 0.5 + 0.5  # 0→1→0
        offset = int(t * 30)  # max 30px siljish
        # Rasmni kengaytirish va offset bilan kesish
        expanded = cv2.copyMakeBorder(img, 0, 0, 40, 40, cv2.BORDER_REPLICATE)
        x_start = 40 - offset
        frame = expanded[:, x_start:x_start + w]
        frame = cv2.resize(frame, (w, h))
        frames.append(frame)
    return frames

def gen_heartbeat(img, duration, fps):
    """Yurak urishi — asta-sekin zoom puls"""
    h, w = img.shape[:2]
    frames = []
    total = int(duration * fps)
    for i in range(total):
        t = i / total
        # Davliy zoom (sinusoidal)
        scale = 1.0 + np.sin(t * np.pi * 4) * 0.025  # ±2.5%
        nw = max(1, int(w / scale))
        nh = max(1, int(h / scale))
        x = (w - nw) // 2
        y = (h - nh) // 2
        cropped = img[y:y+nh, x:x+nw]
        frames.append(cv2.resize(cropped, (w, h)))
    return frames

# ═══════════════════════════════════════════
# ASOSIY VIDEO BUILDER
# ═══════════════════════════════════════════

def build_video(config):
    """
    config = {
      image_path: str,
      style: 'nostalgic'|'dramatic'|'warm'|'cool'|'cinema'|'happy',
      effects: ['ken_burns', 'vignette', 'grain', 'letterbox', ...],
      duration: int (soniya),
      text: str (ixtiyoriy),
      text_position: 'bottom'|'top'|'center',
      output_path: str,
      pan: 'center'|'left'|'right'|'up'|'down',
      zoom: 'in'|'out'|'pulse'
    }
    """
    img_path    = config.get('image_path')
    style       = config.get('style', 'warm')
    effects     = config.get('effects', ['ken_burns', 'vignette'])
    duration    = int(config.get('duration', 10))
    text        = config.get('text', '')
    text_pos    = config.get('text_position', 'bottom')
    output_path = config.get('output_path', '/tmp/output.mp4')
    pan         = config.get('pan', 'center')
    zoom        = config.get('zoom', 'in')

    # Rasm yuklash
    img = load_image(img_path)

    # Filtr qo'llash
    style_map = {
        'nostalgic': 'vintage',
        'dramatic':  'dramatic',
        'warm':      'warm',
        'happy':     'warm',
        'cool':      'cool',
        'cinema':    'cinema',
        'memorial':  'vintage'
    }
    flt_name = style_map.get(style, 'warm')
    img = FILTERS[flt_name](img)

    # Animatsiya kadrlarini generatsiya qilish
    if 'heartbeat' in effects:
        frames = gen_heartbeat(img, duration, FPS)
    elif 'parallax' in effects:
        frames = gen_parallax(img, duration, FPS)
    else:
        frames = gen_ken_burns(img, duration, FPS, direction=f'zoom_{zoom}', pan=pan)

    # Har kadrga effektlar
    processed = []
    total = len(frames)
    fade_dur = min(int(FPS * 1.2), total // 5)  # Fade 1.2s

    for i, f in enumerate(frames):
        # Vignette
        if 'vignette' in effects:
            f = vignette(f)
        # Film grain
        if 'grain' in effects:
            f = film_grain(f, intensity=6)
        # Letterbox
        if 'letterbox' in effects:
            f = letterbox(f)
        # Matn
        if text and i > fade_dur and i < total - fade_dur:
            t_alpha = min(1.0, (i - fade_dur) / (FPS * 0.5))
            if t_alpha >= 1.0:
                f = add_text_overlay(f, text, position=text_pos)
        # Fade in
        if i < fade_dur:
            alpha = i / fade_dur
            f = fade_frame(f, alpha)
        # Fade out
        elif i > total - fade_dur:
            alpha = (total - i) / fade_dur
            f = fade_frame(f, alpha)
        processed.append(f)

    # Kadrlarni diskka yozish
    tmp_dir = tempfile.mkdtemp()
    try:
        for idx, f in enumerate(processed):
            cv2.imwrite(f'{tmp_dir}/f{idx:05d}.png', f)

        # FFmpeg bilan MP4
        cmd = [
            'ffmpeg', '-y',
            '-framerate', str(FPS),
            '-i', f'{tmp_dir}/f%05d.png',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            output_path
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode != 0:
            raise RuntimeError(f"FFmpeg xato: {r.stderr.decode()[-300:]}")

        size = os.path.getsize(output_path)
        return {
            'ok': True,
            'path': output_path,
            'size': size,
            'frames': len(processed),
            'duration': duration
        }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ═══════════════════════════════════════════
# CLI ENTRY POINT (Node.js dan chaqiriladi)
# ═══════════════════════════════════════════
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'ok': False, 'error': 'Config JSON kerak'}))
        sys.exit(1)
    try:
        config = json.loads(sys.argv[1])
        result = build_video(config)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(1)
