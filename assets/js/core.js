/* ClipLab Studio — core: utils, state, API, icons, project model, history */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = (p = 'c') => p + '_' + Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const deep = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function fmtTime(s, ms = true) {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), f = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` + (ms ? `.${String(f).padStart(2, '0')}` : '');
}
function fmtSize(b) {
  if (b > 1e9) return (b / 1e9).toFixed(1) + ' GB';
  if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
  return Math.max(1, Math.round(b / 1e3)) + ' KB';
}
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

/* ---------------- icons (stroke SVG) ---------------- */
const ICONS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  save: '<path d="M5 3h11l3 3v13a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M7 3v6h8V3M7 21v-7h10v7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  skipBack: '<path d="M18 6v12L9 12zM6 6v12"/>',
  skipFwd: '<path d="M6 6v12l9-6zM18 6v12"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  split: '<path d="M12 3v18"/><path d="M8 7L4 12l4 5M16 7l4 5-4 5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  freeze: '<path d="M12 2v20M4 6l16 12M20 6L4 18"/><path d="M9 3l3 3 3-3M9 21l3-3 3 3"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  volumeX: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  audioTrack: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10"/>',
  magnet: '<path d="M6 4v8a6 6 0 0012 0V4"/><path d="M6 8h4M14 8h4"/><path d="M10 4v8a2 2 0 004 0V4"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  fit: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>',
  audio: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  sticker: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 007 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>',
  effects: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  filters: '<circle cx="9" cy="10" r="5.5"/><circle cx="15" cy="10" r="5.5"/><circle cx="12" cy="15" r="5.5"/>',
  transitions: '<rect x="2.5" y="6" width="8" height="12" rx="1.5"/><rect x="13.5" y="6" width="8" height="12" rx="1.5"/><path d="M9 12h6M13 10l2 2-2 2"/>',
  captions: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 10.5a2 2 0 100 3M17 10.5a2 2 0 100 3"/>',
  canvas: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 20V9"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6A17 17 0 002 12s3.5 7 10 7a9.6 9.6 0 004.4-1"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  overlay: '<rect x="3" y="3" width="13" height="13" rx="2"/><rect x="8" y="8" width="13" height="13" rx="2"/>',
  srt: '<path d="M6 4h9l4 4v12H6z"/><path d="M15 4v4h4M9 13h7M9 16h5"/>',
  wand: '<path d="M4 20L16 8M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6z"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
function hydrateIcons(root = document) {
  $$('i[data-i]', root).forEach(i => { if (!i.firstChild) i.innerHTML = icon(i.dataset.i); });
}
function iconEl(name) { const i = document.createElement('i'); i.dataset.i = name; i.innerHTML = icon(name); return i; }

/* ---------------- API ---------------- */
const API = {
  async get(url) {
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json().catch(() => ({ ok: false, error: 'Bad server response' }));
    if (!j.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ ok: false, error: 'Bad server response' }));
    if (!j.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
  upload(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      x.onload = () => {
        let j; try { j = JSON.parse(x.responseText); } catch { j = { ok: false, error: 'Server error (' + x.status + ')' }; }
        j.ok ? resolve(j) : reject(new Error(j.error || 'Upload failed'));
      };
      x.onerror = () => reject(new Error('Network error'));
      x.send(formData);
    });
  },
};

/* ---------------- toast / modal ---------------- */
function toast(msg, type = '', ms = 3200) {
  const t = h('div', { class: 'toast ' + type }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}
const Modal = {
  open(build, { closable = true } = {}) {
    const card = $('#modalCard');
    card.innerHTML = '';
    build(card);
    hydrateIcons(card);
    $('#modal').classList.remove('hidden');
    $('#modal').onclick = e => { if (closable && e.target.id === 'modal') Modal.close(); };
  },
  close() { $('#modal').classList.add('hidden'); $('#modalCard').innerHTML = ''; },
  get isOpen() { return !$('#modal').classList.contains('hidden'); },
};

/* ---------------- constants ---------------- */
const RATIOS = {
  '16:9': [1920, 1080, 'Landscape · YouTube'],
  '9:16': [1080, 1920, 'Portrait · TikTok / Reels / Shorts'],
  '1:1': [1080, 1080, 'Square · Instagram'],
  '4:5': [1080, 1350, 'Instagram feed'],
  '4:3': [1440, 1080, 'Classic 4:3'],
  '3:4': [1080, 1440, 'Portrait 3:4'],
  '21:9': [2520, 1080, 'Cinematic'],
};
const FONT_INFO = [
  // [name, category, weights to load]
  ['Poppins', 'Sans', '400;600;700;900'], ['Montserrat', 'Sans', '400;700;900'], ['Inter', 'Sans', '400;700;900'], ['Roboto', 'Sans', '400;700;900'],
  ['Open Sans', 'Sans', '400;700;800'], ['Lato', 'Sans', '400;700;900'], ['Raleway', 'Sans', '400;700;900'], ['Nunito', 'Sans', '400;700;900'],
  ['Rubik', 'Sans', '400;700;900'], ['Work Sans', 'Sans', '400;700;900'], ['Kanit', 'Sans', '400;700;900'], ['Quicksand', 'Sans', '400;700'],
  ['Comfortaa', 'Sans', '400;700'], ['Fredoka', 'Sans', '400;700'], ['Baloo 2', 'Sans', '400;700;800'], ['Barlow Condensed', 'Sans', '400;700;900'],
  ['Oswald', 'Display', '400;700'], ['Bebas Neue', 'Display', ''], ['Anton', 'Display', ''], ['Archivo Black', 'Display', ''], ['Teko', 'Display', '400;700'],
  ['Fjalla One', 'Display', ''], ['Staatliches', 'Display', ''], ['Passion One', 'Display', '400;700;900'], ['Lilita One', 'Display', ''],
  ['Bangers', 'Display', ''], ['Bungee', 'Display', ''], ['Bungee Shade', 'Display', ''], ['Luckiest Guy', 'Display', ''], ['Titan One', 'Display', ''],
  ['Chewy', 'Display', ''], ['Righteous', 'Display', ''], ['Russo One', 'Display', ''], ['Black Ops One', 'Display', ''], ['Alfa Slab One', 'Display', ''],
  ['Ultra', 'Display', ''], ['Rubik Mono One', 'Display', ''], ['Monoton', 'Display', ''], ['Creepster', 'Display', ''], ['Abril Fatface', 'Display', ''],
  ['Orbitron', 'Tech', '400;700;900'], ['Audiowide', 'Tech', ''], ['Press Start 2P', 'Tech', ''], ['VT323', 'Tech', ''], ['Special Elite', 'Tech', ''],
  ['Space Mono', 'Tech', '400;700'],
  ['Playfair Display', 'Serif', '400;700;900'], ['Merriweather', 'Serif', '400;700;900'], ['Lora', 'Serif', '400;700'], ['Cinzel', 'Serif', '400;700;900'],
  ['Cormorant Garamond', 'Serif', '400;700'], ['DM Serif Display', 'Serif', ''], ['Libre Baskerville', 'Serif', '400;700'],
  ['Pacifico', 'Script', ''], ['Lobster', 'Script', ''], ['Dancing Script', 'Script', '400;700'], ['Great Vibes', 'Script', ''], ['Satisfy', 'Script', ''],
  ['Sacramento', 'Script', ''], ['Kaushan Script', 'Script', ''], ['Yellowtail', 'Script', ''], ['Allura', 'Script', ''], ['Parisienne', 'Script', ''],
  ['Caveat', 'Hand', '400;700'], ['Shadows Into Light', 'Hand', ''], ['Indie Flower', 'Hand', ''], ['Permanent Marker', 'Hand', ''], ['Amatic SC', 'Hand', '400;700'],
  ['Gloria Hallelujah', 'Hand', ''], ['Patrick Hand', 'Hand', ''], ['Rock Salt', 'Hand', ''],
  ['Noto Sans Sinhala', 'Sinhala', '400;700;900'], ['Noto Serif Sinhala', 'Sinhala', '400;700;900'], ['Abhaya Libre', 'Sinhala', '400;700;800'],
  ['Yaldevi', 'Sinhala', '400;700'], ['Gemunu Libre', 'Sinhala', '400;700;800'], ['Stick No Bills', 'Sinhala', '400;700;800'],
  ['Arial', 'System', null], ['Georgia', 'System', null], ['Impact', 'System', null], ['Courier New', 'System', null], ['Times New Roman', 'System', null], ['Comic Sans MS', 'System', null],
];
const FONTS = FONT_INFO.map(f => f[0]);
const BLENDS = { 'source-over': 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', darken: 'Darken', lighten: 'Lighten', 'color-dodge': 'Color dodge', 'color-burn': 'Color burn', 'hard-light': 'Hard light', 'soft-light': 'Soft light', difference: 'Difference', exclusion: 'Exclusion', luminosity: 'Luminosity' };

const FILTERS = {
  none: { name: 'None', f: '' },
  vivid: { name: 'Vivid', f: 'saturate(1.55) contrast(1.12)' },
  warm: { name: 'Warm', f: 'saturate(1.2) sepia(.18)', tint: 'rgba(255,130,20,.13)' },
  cool: { name: 'Cool', f: 'saturate(1.05) brightness(1.03)', tint: 'rgba(30,120,255,.14)' },
  golden: { name: 'Golden', f: 'sepia(.35) saturate(1.4) contrast(1.05)', tint: 'rgba(255,190,40,.1)' },
  teal: { name: 'Teal & Orange', f: 'contrast(1.15) saturate(1.25)', tint: 'rgba(0,140,150,.12)' },
  fade: { name: 'Fade', f: 'contrast(.82) brightness(1.08) saturate(.8)' },
  film: { name: 'Film', f: 'contrast(1.12) saturate(.85) sepia(.18)' },
  vintage: { name: 'Vintage', f: 'sepia(.55) contrast(1.08) brightness(.95) saturate(.85)' },
  drama: { name: 'Drama', f: 'contrast(1.45) saturate(1.15) brightness(.9)' },
  moody: { name: 'Moody', f: 'contrast(1.2) brightness(.82) saturate(.75)', tint: 'rgba(20,30,60,.18)' },
  pink: { name: 'Pastel Pink', f: 'brightness(1.08) saturate(1.1)', tint: 'rgba(255,90,170,.12)' },
  cyber: { name: 'Cyber', f: 'saturate(1.7) hue-rotate(18deg) contrast(1.2)', tint: 'rgba(150,0,255,.1)' },
  bw: { name: 'B&W', f: 'grayscale(1) contrast(1.1)' },
  noir: { name: 'Noir', f: 'grayscale(1) contrast(1.65) brightness(.88)' },
  sepia: { name: 'Sepia', f: 'sepia(1)' },
  invert: { name: 'Invert', f: 'invert(1)' },
};
const EFFECTS = {
  none: 'None', kenburns: 'Slow zoom', shake: 'Shake', pulse: 'Pulse', flash: 'Flash in', glitch: 'Glitch',
  flicker: 'Flicker', vignette: 'Vignette', oldfilm: 'Old film', blurpulse: 'Blur pulse', rgbsplit: 'RGB split', spin: 'Slow spin', zoomout: 'Zoom out',
};
const ANIMS_IN = { none: 'None', fade: 'Fade in', 'slide-left': 'Slide from left', 'slide-right': 'Slide from right', 'slide-up': 'Slide up', 'slide-down': 'Slide down', 'zoom-in': 'Zoom in', 'zoom-out': 'Zoom out', pop: 'Pop', spin: 'Spin', blur: 'Blur in', typewriter: 'Typewriter (text)' };
const ANIMS_OUT = { none: 'None', fade: 'Fade out', 'slide-left': 'Slide to left', 'slide-right': 'Slide to right', 'slide-up': 'Slide up', 'slide-down': 'Slide down', 'zoom-in': 'Zoom in', 'zoom-out': 'Zoom out', pop: 'Shrink', spin: 'Spin', blur: 'Blur out' };
const TRANSITIONS = {
  none: 'None', dissolve: 'Dissolve', black: 'Dip to black', white: 'Dip to white', 'slide-left': 'Slide left', 'slide-right': 'Slide right',
  'slide-up': 'Slide up', 'push-left': 'Push left', 'wipe-right': 'Wipe right', 'wipe-down': 'Wipe down', circle: 'Circle open',
  'zoom-in': 'Zoom in', 'zoom-out': 'Zoom out', spin: 'Spin', blur: 'Blur', flash: 'Flash',
};
const STICKERS = '😀 😂 🤣 😍 🥰 😎 🤩 😭 😡 🤯 🥳 😱 🤔 🙄 😴 🤑 👍 👎 👏 🙌 🙏 💪 👀 ✌️ 🤝 👉 👈 👆 👇 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 🔥 ✨ ⭐ 🌟 💥 💫 ⚡ 🎉 🎊 🎁 🎈 🏆 🥇 📌 📍 ✅ ❌ ⚠️ ❗ ❓ 💡 💬 💭 🔔 🎵 🎶 🎬 🎥 📸 📱 💻 🛒 💰 💸 📈 📉 🚀 ⏰ 🌈 ☀️ 🌙 ⛅ 🌧️ ❄️ 🌊 🌸 🌹 🍀 🌴 🍕 🍔 🍟 🍩 🍰 ☕ 🍹 🐶 🐱 🦁 🐼 🦋 🐬 🇱🇰 ➡️ ⬅️ ⬆️ ⬇️ 🔴 🟢 🔵 🟡'.split(' ');

const TEXT_PRESETS = [
  { name: 'Default', t: { font: 'Poppins', weight: 700, color: '#ffffff', size: 96, shadow: { on: true, color: 'rgba(0,0,0,0.6)', blur: 10, x: 0, y: 4 } } },
  { name: 'Title', t: { font: 'Montserrat', weight: 900, color: '#ffffff', size: 140, spacing: 4, shadow: { on: true, color: 'rgba(0,0,0,0.5)', blur: 20, x: 0, y: 6 } } },
  { name: 'Caption', t: { font: 'Poppins', weight: 700, color: '#ffffff', size: 64, stroke: { on: true, color: '#000000', width: 8 }, shadow: { on: false } }, y: 0.32 },
  { name: 'Yellow pop', t: { font: 'Montserrat', weight: 900, color: '#ffe11f', size: 88, stroke: { on: true, color: '#000000', width: 10 }, shadow: { on: true, color: 'rgba(0,0,0,0.8)', blur: 0, x: 4, y: 6 } } },
  { name: 'Box label', t: { font: 'Poppins', weight: 600, color: '#111111', size: 60, bg: { on: true, color: '#ffffff', opacity: 1, pad: 22, radius: 14 }, shadow: { on: false } } },
  { name: 'Neon', t: { font: 'Permanent Marker', weight: 400, color: '#7dfcff', size: 110, shadow: { on: true, color: '#00e5ff', blur: 30, x: 0, y: 0 }, stroke: { on: true, color: '#ffffff', width: 2 } } },
  { name: 'Cinema', t: { font: 'Bebas Neue', weight: 400, color: '#f3f3f3', size: 150, spacing: 14, shadow: { on: false } } },
  { name: 'Script', t: { font: 'Pacifico', weight: 400, color: '#ffffff', size: 110, shadow: { on: true, color: 'rgba(0,0,0,0.45)', blur: 12, x: 0, y: 4 } } },
  { name: 'Red banner', t: { font: 'Anton', weight: 400, color: '#ffffff', size: 84, bg: { on: true, color: '#e8263b', opacity: 1, pad: 18, radius: 4 }, shadow: { on: false } } },
  { name: 'Elegant', t: { font: 'Playfair Display', weight: 700, italic: true, color: '#fff7e8', size: 100, shadow: { on: true, color: 'rgba(0,0,0,0.5)', blur: 16, x: 0, y: 3 } } },
  { name: 'Sinhala', t: { font: 'Noto Sans Sinhala', weight: 700, color: '#ffffff', size: 90, content: 'ආයුබෝවන්', stroke: { on: true, color: '#000000', width: 6 } } },
  { name: 'Lower third', t: { font: 'Inter', weight: 700, color: '#ffffff', size: 54, align: 'left', bg: { on: true, color: '#111111', opacity: .8, pad: 20, radius: 8 }, shadow: { on: false } }, x: -0.25, y: 0.33 },
];

/* ---------------- project model ---------------- */
function defaultText() {
  return {
    content: 'Your text', font: 'Poppins', size: 96, weight: 700, italic: false, color: '#ffffff', align: 'center',
    spacing: 0, lineHeight: 1.2, underline: false,
    stroke: { on: false, color: '#000000', width: 6 },
    shadow: { on: true, color: 'rgba(0,0,0,0.6)', blur: 10, x: 0, y: 4 },
    bg: { on: false, color: '#000000', opacity: 0.6, pad: 20, radius: 12 },
  };
}
function newClip(type, start, duration, extra = {}) {
  return Object.assign({
    id: uid('c'), type, start, duration, in: 0, speed: 1,
    volume: 1, fadeIn: 0, fadeOut: 0, muted: false,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    flipH: false, flipV: false,
    crop: { l: 0, t: 0, r: 0, b: 0 },
    adjust: { brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0, temperature: 0, vignette: 0 },
    filter: 'none', filterIntensity: 1,
    effect: 'none', effectStrength: 1,
    anim: { in: 'none', inDur: 0.5, out: 'none', outDur: 0.5 },
    transition: { type: 'none', dur: 0.6 },
    mask: { type: 'none', size: 1, radius: 0.15 },
    chroma: { on: false, color: '#00ff00', tol: 0.32, soft: 0.1 },
    blend: 'source-over',
    keyframes: {},
  }, extra);
}
function newProject() {
  return {
    id: null, name: 'Untitled project', ratio: '16:9', width: 1920, height: 1080, fps: 30,
    background: { mode: 'color', color: '#000000', blur: 40 },
    tracks: [
      { id: uid('t'), kind: 'visual', name: 'Main', main: true, muted: false, hidden: false, clips: [] },
      { id: uid('t'), kind: 'audio', name: 'Audio 1', muted: false, hidden: false, clips: [] },
    ],
    markers: [],
  };
}

/* ---------------- global state ---------------- */
const S = {
  project: newProject(),
  media: [],
  selected: null,       // clip id
  time: 0,
  playing: false,
  pps: 60,              // timeline pixels per second
  snap: true,
  history: [], future: [], lastJSON: null,
  dirty: false, saving: false,
  clipboard: null,
  exporting: false,
  leftTab: 'media',
  inspTab: null,
};
const P = () => S.project;

function allClips() { return P().tracks.flatMap(t => t.clips.map(c => ({ c, t }))); }
function findClip(id) {
  for (const t of P().tracks) { const c = t.clips.find(c => c.id === id); if (c) return { c, t }; }
  return null;
}
function selClip() { return S.selected ? findClip(S.selected)?.c || null : null; }
function trackOf(clip) { return P().tracks.find(t => t.clips.includes(clip)); }
function mediaById(id) { return S.media.find(m => m.id === id); }
function projectDuration() {
  let d = 0;
  for (const t of P().tracks) for (const c of t.clips) d = Math.max(d, c.start + c.duration);
  return d;
}
function clipEnd(c) { return c.start + c.duration; }
function isAV(c) { return c.type === 'video' || c.type === 'audio'; }
function srcDurationOf(c) { const m = mediaById(c.mediaId); return m && m.type !== 'image' ? (m.duration || Infinity) : Infinity; }
function clipLabel(c) {
  if (c.type === 'text') return (c.text.content || 'Text').split('\n')[0];
  if (c.type === 'sticker') return c.emoji;
  if (c.type === 'effect') return (typeof FX !== 'undefined' && FX[c.fx]) ? FX[c.fx].icon + ' ' + FX[c.fx].name : 'Effect';
  return mediaById(c.mediaId)?.name || c.type;
}

/* ---- speed curves: map clip-local time -> source time ---- */
const SPEED_CURVES = {
  none: { name: 'None', pts: null },
  montage: { name: 'Montage', pts: [[0, 1], [0.15, 1], [0.3, 4], [0.45, 4], [0.55, 0.4], [0.7, 0.4], [0.85, 3], [1, 1]] },
  hero: { name: 'Hero time', pts: [[0, 2.5], [0.35, 2.5], [0.45, 0.25], [0.65, 0.25], [0.75, 2.5], [1, 2.5]] },
  bullet: { name: 'Bullet time', pts: [[0, 3], [0.3, 3], [0.4, 0.15], [0.7, 0.15], [0.8, 3], [1, 3]] },
  jump: { name: 'Jump cut', pts: [[0, 1], [0.4, 1], [0.45, 6], [0.55, 6], [0.6, 1], [1, 1]] },
  flashin: { name: 'Flash in', pts: [[0, 6], [0.35, 4], [0.6, 1], [1, 1]] },
  flashout: { name: 'Flash out', pts: [[0, 1], [0.4, 1], [0.65, 4], [1, 6]] },
  rampup: { name: 'Ramp up', pts: [[0, 0.4], [1, 3]] },
  rampdown: { name: 'Ramp down', pts: [[0, 3], [1, 0.4]] },
  pulse: { name: 'Pulse', pts: [[0, 1], [0.2, 3], [0.3, 0.5], [0.5, 3], [0.6, 0.5], [0.8, 3], [1, 1]] },
};
function curveMul(pts, x) {
  if (!pts) return 1;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x <= x1) return lerp(y0, y1, (x - x0) / Math.max(1e-6, x1 - x0));
  }
  return pts[pts.length - 1][1];
}
function curveAvg(pts) {
  if (!pts) return 1;
  let a = 0; const n = 400;
  for (let i = 0; i < n; i++) a += curveMul(pts, (i + 0.5) / n);
  return a / n;
}
const _curveTables = new Map();
function curveTable(pts) {
  const key = JSON.stringify(pts);
  let tb = _curveTables.get(key);
  if (!tb) {
    const n = 1000; tb = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) tb[i] = tb[i - 1] + curveMul(pts, (i - 0.5) / n) / n;
    _curveTables.set(key, tb);
  }
  return tb;
}
function curvePts(c) { return c.curve && c.curve !== 'none' ? (SPEED_CURVES[c.curve]?.pts || null) : null; }
/** source-time offset (seconds into the media from c.in) at clip-local time */
function srcOffset(c, local) {
  const pts = curvePts(c);
  if (!pts) return local * c.speed;
  const x = clamp(local / Math.max(1e-6, c.duration), 0, 1);
  const tb = curveTable(pts), n = tb.length - 1, f = x * n, i = Math.floor(f);
  const v = i >= n ? tb[n] : tb[i] + (tb[i + 1] - tb[i]) * (f - i);
  return v * c.duration * c.speed;
}
function srcAt(c, local) { return c.in + srcOffset(c, local); }
function rateAt(c, local) { return c.speed * curveMul(curvePts(c), clamp(local / Math.max(1e-6, c.duration), 0, 1)); }
function srcSpan(c) { return srcOffset(c, c.duration); }

/** main track is magnetic: when a clip's length changes, later clips follow */
function magneticShift(c, oldEnd) {
  const tr = P().tracks.find(t => t.clips.includes(c));
  if (!tr || !tr.main) return;
  const d = c.start + c.duration - oldEnd;
  if (Math.abs(d) < 1e-6) return;
  for (const o of tr.clips) if (o !== c && o.start >= oldEnd - 0.001) o.start = Math.max(0, o.start + d);
}

/* path helpers for inspector bindings */
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] ??= {}), o); t[last] = v; }

/* ---------------- history ---------------- */
function snapshotJSON() { return JSON.stringify(P()); }
function initHistory() { S.history = []; S.future = []; S.lastJSON = snapshotJSON(); }
/** call after any (batch of) mutations */
function commit(opts = {}) {
  const now = snapshotJSON();
  if (now === S.lastJSON) { if (!opts.silent) refreshAll(opts); return; }
  S.history.push(S.lastJSON);
  if (S.history.length > 150) S.history.shift();
  S.future = [];
  S.lastJSON = now;
  markDirty();
  refreshAll(opts);
}
function undo() {
  if (!S.history.length) return toast('Nothing to undo');
  S.future.push(S.lastJSON);
  S.lastJSON = S.history.pop();
  S.project = JSON.parse(S.lastJSON);
  if (S.selected && !findClip(S.selected)) S.selected = null;
  markDirty(); refreshAll();
}
function redo() {
  if (!S.future.length) return toast('Nothing to redo');
  S.history.push(S.lastJSON);
  S.lastJSON = S.future.pop();
  S.project = JSON.parse(S.lastJSON);
  if (S.selected && !findClip(S.selected)) S.selected = null;
  markDirty(); refreshAll();
}
function markDirty() {
  S.dirty = true;
  const el = $('#saveStatus'); if (el) el.textContent = 'Unsaved changes';
}

/* refreshAll is replaced by app.js once all modules are loaded */
let refreshAll = () => {};

/* ---------------- keyframes ---------------- */
const KF_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity', 'volume'];
function kfValue(clip, prop, local) {
  const keys = clip.keyframes?.[prop];
  const base = prop === 'volume' ? clip.volume : clip.transform[prop];
  if (!keys || !keys.length) return base;
  if (local <= keys[0].t) return keys[0].v;
  if (local >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (local >= a.t && local <= b.t) {
      const p = (local - a.t) / Math.max(1e-6, b.t - a.t);
      const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // ease in-out
      return lerp(a.v, b.v, e);
    }
  }
  return base;
}
function kfSet(clip, prop, local, value) {
  clip.keyframes ??= {};
  const keys = clip.keyframes[prop] ??= [];
  local = round(clamp(local, 0, clip.duration), 3);
  const k = keys.find(k => Math.abs(k.t - local) < 0.02);
  if (k) k.v = value; else keys.push({ t: local, v: value });
  keys.sort((a, b) => a.t - b.t);
}
function kfAt(clip, prop, local) { return (clip.keyframes?.[prop] || []).find(k => Math.abs(k.t - local) < 0.02); }
function kfRemove(clip, prop, local) {
  const keys = clip.keyframes?.[prop]; if (!keys) return;
  const i = keys.findIndex(k => Math.abs(k.t - local) < 0.02);
  if (i >= 0) keys.splice(i, 1);
  if (!keys.length) delete clip.keyframes[prop];
}
function hasKf(clip, prop) { return !!clip.keyframes?.[prop]?.length; }
