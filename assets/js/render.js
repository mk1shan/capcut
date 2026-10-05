/* ClipLab Studio — media loading, audio engine, playback sync and frame renderer */
'use strict';

/* ---------------- media assets ---------------- */
const Assets = {
  blobs: new Map(),    // mediaId -> Promise<objectURL>
  images: new Map(),   // mediaId -> HTMLImageElement
  peaks: new Map(),    // mediaId -> {pps, data:Float32Array} | 'loading' | 'none'
  thumbs: new Map(),   // mediaId -> dataURL

  blobUrl(m) {
    if (!this.blobs.has(m.id)) {
      this.blobs.set(m.id, fetch(m.url).then(r => {
        if (!r.ok) throw new Error('Missing file ' + m.name);
        return r.blob();
      }).then(b => URL.createObjectURL(b)).catch(e => { console.warn(e); return m.url; }));
    }
    return this.blobs.get(m.id);
  },
  image(m) {
    let img = this.images.get(m.id);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.src = m.url;
      img.onload = () => { if (!m.width) { m.width = img.naturalWidth; m.height = img.naturalHeight; } };
      this.images.set(m.id, img);
    }
    return img;
  },
  /** read duration/size + thumbnail; persists metadata to server */
  async probe(m) {
    if (m.type === 'image') {
      const img = this.image(m);
      if (!img.complete) await new Promise(r => { img.onload = r; img.onerror = r; });
      this.thumbs.set(m.id, m.url);
      if (!m.width || !m.height) {
        m.width = img.naturalWidth; m.height = img.naturalHeight;
        API.post('api/media.php', { action: 'update', id: m.id, width: m.width, height: m.height }).catch(() => {});
      }
      return;
    }
    const url = await this.blobUrl(m);
    const el = document.createElement(m.type === 'audio' ? 'audio' : 'video');
    el.preload = 'auto'; el.muted = true; el.src = url;
    await new Promise(res => { el.onloadedmetadata = res; el.onerror = res; setTimeout(res, 15000); });
    const dur = isFinite(el.duration) ? el.duration : 0;
    const changed = Math.abs((m.duration || 0) - dur) > 0.01 || (m.type === 'video' && (!m.width || !m.height));
    if (dur) m.duration = dur;
    if (m.type === 'video') {
      m.width = el.videoWidth; m.height = el.videoHeight;
      try {
        el.currentTime = Math.min(1, dur * 0.1 || 0);
        await new Promise(res => { el.onseeked = res; setTimeout(res, 4000); });
        const cv = document.createElement('canvas');
        const r = (m.width / m.height) || 16 / 9;
        cv.height = 90; cv.width = Math.round(90 * r);
        cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height);
        this.thumbs.set(m.id, cv.toDataURL('image/jpeg', 0.7));
      } catch (e) { /* ignore */ }
      if (dur && !m.audioChecked) m.audioChecked = true;
    }
    el.removeAttribute('src'); el.load();
    if (changed) API.post('api/media.php', { action: 'update', id: m.id, duration: m.duration, width: m.width || 0, height: m.height || 0 }).catch(() => {});
    this.loadPeaks(m);
  },
  async loadPeaks(m) {
    if (this.peaks.has(m.id) || m.type === 'image') return;
    if ((m.size || 0) > 400e6) { this.peaks.set(m.id, 'none'); return; }
    this.peaks.set(m.id, 'loading');
    try {
      const url = await this.blobUrl(m);
      const buf = await (await fetch(url)).arrayBuffer();
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const actx = new OAC(1, 2, 44100);
      const audio = await actx.decodeAudioData(buf);
      const ch = audio.getChannelData(0);
      const pps = 50;
      const n = Math.ceil(audio.duration * pps);
      const step = Math.max(1, Math.floor(ch.length / n));
      const data = new Float32Array(n);
      let max = 0.0001;
      for (let i = 0; i < n; i++) {
        let peak = 0;
        const s0 = i * step, s1 = Math.min(ch.length, s0 + step);
        for (let j = s0; j < s1; j += 4) { const v = Math.abs(ch[j]); if (v > peak) peak = v; }
        data[i] = peak; if (peak > max) max = peak;
      }
      for (let i = 0; i < n; i++) data[i] /= max;
      this.peaks.set(m.id, { pps, data });
      if (typeof renderTimeline === 'function') renderTimeline();
    } catch (e) {
      this.peaks.set(m.id, 'none'); // video without audio track, or undecodable
    }
  },
};

/* ---------------- audio engine ---------------- */
const AudioEngine = {
  ctx: null, master: null, dest: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.dest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.dest);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
};

/* per-clip media elements */
const ClipEls = new Map(); // clipId -> {el, mediaId, gain, src, ready}

function clipEl(c) {
  let e = ClipEls.get(c.id);
  if (e && e.mediaId === c.mediaId) return e;
  if (e) disposeClipEl(c.id);
  const m = mediaById(c.mediaId);
  if (!m) return null;
  const el = document.createElement(m.type === 'audio' ? 'audio' : 'video');
  el.preload = 'auto';
  el.playsInline = true;
  el.crossOrigin = 'anonymous';
  e = { el, mediaId: c.mediaId, gain: null, src: null };
  ClipEls.set(c.id, e);
  Assets.blobUrl(m).then(url => { el.src = url; el.load(); });
  return e;
}
function disposeClipEl(id) {
  const e = ClipEls.get(id);
  if (!e) return;
  try { e.el.pause(); } catch { }
  try { e.src && e.src.disconnect(); e.gain && e.gain.disconnect(); } catch { }
  e.el.removeAttribute('src');
  try { e.el.load(); } catch { }
  ClipEls.delete(id);
}
function connectAudio(e) {
  if (e.gain || !AudioEngine.ctx) return;
  try {
    e.src = AudioEngine.ctx.createMediaElementSource(e.el);
    e.gain = AudioEngine.ctx.createGain();
    e.gain.gain.value = 0;
    e.src.connect(e.gain);
    e.gain.connect(AudioEngine.master);
    e.el.volume = 1;
  } catch (err) { console.warn('audio connect', err); }
}
let lastGc = 0;
function gcClipEls() {
  const ids = new Set(allClips().map(x => x.c.id));
  for (const id of [...ClipEls.keys()]) if (!ids.has(id)) disposeClipEl(id);
}

function clipGain(c, t, track) {
  if (c.muted || track.muted) return 0;
  const local = t - c.start;
  let g = kfValue(c, 'volume', local);
  if (c.fadeIn > 0 && local < c.fadeIn) g *= clamp(local / c.fadeIn, 0, 1);
  if (c.fadeOut > 0 && local > c.duration - c.fadeOut) g *= clamp((c.duration - local) / c.fadeOut, 0, 1);
  return clamp(g, 0, 4);
}

/** keep every audio/video element in step with the timeline */
function syncMedia(t, playing) {
  const now = performance.now();
  if (now - lastGc > 2000) { gcClipEls(); lastGc = now; }
  const held = new Set();
  for (const tr of P().tracks) {
    if (tr.kind !== 'visual') continue;
    for (const c of tr.clips) {
      if (c.transition?.type && c.transition.type !== 'none' && t >= c.start && t < c.start + c.transition.dur) {
        const prev = tr.clips.find(o => o !== c && Math.abs(clipEnd(o) - c.start) < 0.05);
        if (prev) held.add(prev.id);
      }
    }
  }
  for (const tr of P().tracks) {
    for (const c of tr.clips) {
      if (!isAV(c)) continue;
      const e = clipEl(c);
      if (!e) continue;
      const el = e.el;
      connectAudio(e);
      if (typeof ensureVoice === 'function') ensureVoice(e, c);
      const active = t >= c.start && t < clipEnd(c) && !(tr.kind === 'visual' && tr.hidden && c.type !== 'video');
      const rate = clamp(rateAt(c, t - c.start) || 1, 0.0625, 16);
      if (active) {
        const target = srcAt(c, t - c.start);
        if (Math.abs(el.playbackRate - rate) > 0.001) el.playbackRate = rate;
        const keep = c.keepPitch !== false;
        if (el.preservesPitch !== keep) el.preservesPitch = keep;
        if (playing) {
          if (el.paused) {
            if (el.readyState >= 1) el.currentTime = target;
            el.play().catch(() => { });
          } else if (Math.abs(el.currentTime - target) > 0.35 && !el.seeking) {
            el.currentTime = target;
          }
        } else {
          if (!el.paused) el.pause();
          if (el.readyState >= 1 && !el.seeking && Math.abs(el.currentTime - target) > 0.02) el.currentTime = target;
        }
        const g = clipGain(c, t, tr);
        if (e.gain) e.gain.gain.setTargetAtTime(g, AudioEngine.ctx.currentTime, 0.015);
        else el.volume = clamp(g, 0, 1);
      } else {
        if (!el.paused) el.pause();
        if (e.gain) e.gain.gain.setTargetAtTime(0, AudioEngine.ctx.currentTime, 0.01); else el.volume = 0;
        if (held.has(c.id)) {
          const endT = srcAt(c, c.duration) - 0.05;
          if (el.readyState >= 1 && !el.seeking && Math.abs(el.currentTime - endT) > 0.08) el.currentTime = Math.max(0, endT);
        } else {
          const lead = c.start - t;
          if (lead > 0 && lead < 2 && el.readyState >= 1 && !el.seeking && Math.abs(el.currentTime - c.in) > 0.1) el.currentTime = c.in;
        }
      }
    }
  }
}
/** timeline time implied by the playing main-track video (keeps preview in sync on slow PCs) */
function masterClock(t) {
  const main = P().tracks.find(x => x.main);
  if (!main) return null;
  const c = main.clips.find(c => c.type === 'video' && t >= c.start && t < clipEnd(c));
  if (!c) return null;
  const el = ClipEls.get(c.id)?.el;
  if (!el || el.paused || el.seeking || el.readyState < 3 || curvePts(c)) return null;
  return c.start + (el.currentTime - c.in) / c.speed;
}
function pauseAllMedia() { for (const e of ClipEls.values()) if (!e.el.paused) e.el.pause(); }

/* ---------------- drawing helpers ---------------- */
const R = { scale: 1 }; // canvas px per project px during current render
const measureCtx = document.createElement('canvas').getContext('2d');
const easeOut = p => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
const easeInOut = p => (p = clamp(p, 0, 1), p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const backOut = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const prand = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

function sourceFor(c) {
  if (c.type === 'image') { const m = mediaById(c.mediaId); return m ? Assets.image(m) : null; }
  if (c.type === 'video') return ClipEls.get(c.id)?.el || null;
  return null;
}
function srcReady(src) {
  if (!src) return false;
  if (src instanceof HTMLVideoElement) return src.readyState >= 2 && src.videoWidth > 0;
  if (src instanceof HTMLImageElement) return src.complete && src.naturalWidth > 0;
  return true;
}
function srcDims(c, src) {
  if (src instanceof HTMLVideoElement && src.videoWidth) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement && src.naturalWidth) return [src.naturalWidth, src.naturalHeight];
  const m = mediaById(c.mediaId);
  return [m?.width || 1920, m?.height || 1080];
}
/** size (project px, before scale) of a media clip */
function mediaBox(c, src) {
  const [sw, sh] = srcDims(c, src);
  const W = P().width, H = P().height;
  const fit = Math.min(W / sw, H / sh);
  const fw = sw * fit, fh = sh * fit;
  const cr = c.crop;
  return { fw, fh, w: fw * (1 - cr.l - cr.r), h: fh * (1 - cr.t - cr.b), sw, sh };
}
function textFont(T) { return `${T.italic ? 'italic ' : ''}${T.weight} ${T.size}px "${T.font}", "Noto Sans Sinhala", sans-serif`; }
function textLayout(T, chars = 1) {
  measureCtx.font = textFont(T);
  if ('letterSpacing' in measureCtx) measureCtx.letterSpacing = (T.spacing || 0) + 'px';
  let content = T.content || '';
  if (chars < 1) content = [...content].slice(0, Math.floor([...content].length * chars)).join('');
  const lines = content.split('\n');
  const full = (T.content || '').split('\n');
  const widths = full.map(l => measureCtx.measureText(l || ' ').width);
  const lh = T.size * (T.lineHeight || 1.2);
  const w = Math.max(10, ...widths);
  const hgt = lh * full.length;
  return { lines, widths, lh, w, h: hgt };
}
/** unscaled content box of any visual clip */
function clipBox(c) {
  if (c.type === 'text') {
    const L = textLayout(c.text);
    const pad = c.text.bg?.on ? c.text.bg.pad * 2 : 0;
    return { w: L.w + pad, h: L.h + pad };
  }
  if (c.type === 'sticker') return { w: c.size || 200, h: c.size || 200 };
  if (c.type === 'effect') return { w: P().width, h: P().height };
  const b = mediaBox(c, sourceFor(c));
  return { w: b.w, h: b.h };
}

function animFx(type, p, isOut) {
  const W = P().width, H = P().height;
  const e = easeOut(p);
  const o = { a: 1, dx: 0, dy: 0, s: 1, r: 0, blur: 0, chars: 1 };
  if (isOut) { if (type === 'zoom-in') type = 'zoom-out'; else if (type === 'zoom-out') type = 'zoom-in'; }
  const dir = isOut ? -1 : 1;
  switch (type) {
    case 'fade': o.a = e; break;
    case 'slide-left': o.dx = -(1 - e) * W * 0.55; o.a = clamp(p * 2.5, 0, 1); break;
    case 'slide-right': o.dx = (1 - e) * W * 0.55; o.a = clamp(p * 2.5, 0, 1); break;
    case 'slide-up': o.dy = dir * (1 - e) * H * 0.45; o.a = clamp(p * 2.5, 0, 1); break;
    case 'slide-down': o.dy = -dir * (1 - e) * H * 0.45; o.a = clamp(p * 2.5, 0, 1); break;
    case 'zoom-in': o.s = 0.35 + 0.65 * e; o.a = e; break;
    case 'zoom-out': o.s = 1.8 - 0.8 * e; o.a = e; break;
    case 'pop': o.s = p <= 0 ? 0.001 : Math.max(0.001, isOut ? e : backOut(clamp(p, 0, 1))); o.a = clamp(p * 3, 0, 1); break;
    case 'spin': o.r = -(1 - e) * Math.PI * dir; o.s = 0.3 + 0.7 * e; o.a = e; break;
    case 'blur': o.blur = (1 - e) * 30; o.a = e; break;
    case 'typewriter': o.chars = clamp(p, 0, 1); break;
  }
  return o;
}
function mergeFx(a, b) { a.a *= b.a; a.dx += b.dx; a.dy += b.dy; a.s *= b.s; a.r += b.r; a.blur += b.blur; a.chars = Math.min(a.chars, b.chars); return a; }

function clipFx(c, local, t) {
  const o = { a: 1, dx: 0, dy: 0, s: 1, r: 0, blur: 0, chars: 1, post: [], extraFilter: '' };
  const A = c.anim || {};
  if (A.in && A.in !== 'none' && local < A.inDur) mergeFx(o, animFx(A.in, local / A.inDur, false));
  if (A.out && A.out !== 'none' && local > c.duration - A.outDur) mergeFx(o, animFx(A.out, (c.duration - local) / A.outDur, true));
  const k = c.effectStrength ?? 1;
  const prog = clamp(local / Math.max(0.01, c.duration), 0, 1);
  switch (c.effect) {
    case 'kenburns': o.s *= 1 + 0.18 * k * prog; break;
    case 'zoomout': o.s *= 1 + 0.18 * k * (1 - prog); break;
    case 'shake': o.dx += (Math.sin(t * 53) * 10 + Math.sin(t * 31) * 6) * k; o.dy += (Math.cos(t * 47) * 9 + Math.sin(t * 23) * 4) * k; o.r += Math.sin(t * 37) * 0.012 * k; break;
    case 'pulse': o.s *= 1 + 0.06 * k * Math.max(0, Math.sin(local * Math.PI * 4)); break;
    case 'spin': o.r += local * 0.5 * k; break;
    case 'blurpulse': o.blur += (0.5 + 0.5 * Math.sin(local * Math.PI * 2)) * 10 * k; break;
    case 'flicker': o.a *= 1 - 0.35 * k * prand(Math.floor(t * 14)); break;
    case 'flash': if (local < 0.45) o.post.push({ type: 'flash', a: (1 - local / 0.45) * k }); break;
    case 'glitch': o.post.push({ type: 'glitch', k }); break;
    case 'rgbsplit': o.post.push({ type: 'rgb', k }); break;
    case 'vignette': o.post.push({ type: 'vignette', k }); break;
    case 'oldfilm':
      o.extraFilter = `sepia(${0.6 * k}) contrast(1.1)`;
      o.a *= 1 - 0.12 * k * prand(Math.floor(t * 18));
      o.post.push({ type: 'vignette', k: k * 0.9 }, { type: 'scratches', k });
      break;
  }
  if (typeof applyLoopAnim === 'function') applyLoopAnim(c, local, t, o);
  return o;
}

function filterString(c, extraBlur, extraFilter, withPreset = true) {
  const a = c.adjust || {};
  const parts = [];
  if (withPreset && c.filter && FILTERS[c.filter]?.f) parts.push(FILTERS[c.filter].f);
  if (a.brightness) parts.push(`brightness(${1 + a.brightness})`);
  if (a.contrast) parts.push(`contrast(${1 + a.contrast})`);
  if (a.saturation) parts.push(`saturate(${1 + a.saturation})`);
  if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`);
  const blur = (a.blur || 0) + (extraBlur || 0);
  if (blur > 0.05) parts.push(`blur(${(blur * R.scale).toFixed(2)}px)`);
  if (extraFilter) parts.push(extraFilter);
  return parts.length ? parts.join(' ') : 'none';
}

/* chroma key processing on a per-clip offscreen canvas */
const chromaCanvases = new Map();
function chromaSource(c, src, sx, sy, sw, sh) {
  let cv = chromaCanvases.get(c.id);
  if (!cv) { cv = document.createElement('canvas'); chromaCanvases.set(c.id, cv); }
  const maxW = 960;
  const sc = Math.min(1, maxW / sw);
  const w = Math.max(1, Math.round(sw * sc)), hh = Math.max(1, Math.round(sh * sc));
  if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.clearRect(0, 0, w, hh);
  x.drawImage(src, sx, sy, sw, sh, 0, 0, w, hh);
  let img;
  try { img = x.getImageData(0, 0, w, hh); } catch { return cv; }
  const d = img.data;
  const key = hexToRgb(c.chroma.color);
  const tol = c.chroma.tol * 255 * 1.4, soft = Math.max(1, c.chroma.soft * 255 * 1.4);
  // compare in chroma space (YCbCr) so lighting changes matter less
  const kcb = -0.169 * key.r - 0.331 * key.g + 0.5 * key.b, kcr = 0.5 * key.r - 0.419 * key.g - 0.081 * key.b;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const cb = -0.169 * r - 0.331 * g + 0.5 * b, cr = 0.5 * r - 0.419 * g - 0.081 * b;
    const dist = Math.hypot(cb - kcb, cr - kcr);
    if (dist < tol) d[i + 3] = 0;
    else if (dist < tol + soft) {
      d[i + 3] = d[i + 3] * (dist - tol) / soft;
      // spill suppression
      if (key.g > key.r && key.g > key.b) d[i + 1] = Math.min(g, (r + b) / 2 + 20);
    }
  }
  x.putImageData(img, 0, 0);
  return cv;
}
function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex || '#00ff00');
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 255, b: 0 };
}
function hexA(hex, a) { const c = hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`; }

function maskPath(ctx, c, w, h) {
  const m = c.mask; if (!m || m.type === 'none') return false;
  const s = m.size ?? 1;
  ctx.beginPath();
  if (m.type === 'circle') ctx.ellipse(0, 0, (w / 2) * s, (h / 2) * s, 0, 0, Math.PI * 2);
  else if (m.type === 'round') roundRectPath(ctx, -w * s / 2, -h * s / 2, w * s, h * s, (m.radius ?? .15) * Math.min(w, h) * s);
  else if (m.type === 'band') ctx.rect(-w / 2, -h * s / 2 * 0.6, w, h * s * 0.6);
  else if (m.type === 'heart') heartPath(ctx, Math.min(w, h) * s);
  else if (m.type === 'star') starPath(ctx, Math.min(w, h) / 2 * s);
  ctx.clip();
  return true;
}
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function heartPath(ctx, size) {
  const s = size / 2;
  ctx.moveTo(0, s * 0.75);
  ctx.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.6, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.6, -s * 1.05, s * 1.2, -s * 0.1, 0, s * 0.75);
  ctx.closePath();
}
function starPath(ctx, r) {
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5;
    i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

/* last-good-frame cache for videos (avoids black flashes while a video seeks) */
const FrameCache = {
  map: new Map(),
  put(id, video) {
    let e = this.map.get(id);
    const w = Math.min(960, video.videoWidth), hh = Math.round(w * video.videoHeight / video.videoWidth);
    if (!e) { const cv = document.createElement('canvas'); e = { canvas: cv, ctx: cv.getContext('2d') }; this.map.set(id, e); }
    if (e.canvas.width !== w || e.canvas.height !== hh) { e.canvas.width = w; e.canvas.height = hh; }
    try { e.ctx.drawImage(video, 0, 0, w, hh); } catch { }
  },
  get(id) { return this.map.get(id); },
};

/* ---------------- clip drawing ---------------- */
/**
 * Draw one visual clip.
 * ov: optional overrides from transitions {a, dx, dy, s, r, blur, local}
 */
function drawClip(ctx, c, t, ov = null) {
  const local = ov?.local ?? (t - c.start);
  R.curLocal = local; R.curT = t;
  const fx = clipFx(c, local, t);
  if (ov) mergeFx(fx, { a: ov.a ?? 1, dx: ov.dx || 0, dy: ov.dy || 0, s: ov.s ?? 1, r: ov.r || 0, blur: ov.blur || 0, chars: 1 });
  const W = P().width, H = P().height;
  const x = kfValue(c, 'x', local), y = kfValue(c, 'y', local);
  const sc = kfValue(c, 'scale', local), rot = kfValue(c, 'rotation', local);
  const op = kfValue(c, 'opacity', local);
  const alpha = clamp(op * fx.a, 0, 1);
  if (alpha <= 0.001) return;

  let src = null, box;
  if (c.type === 'video' || c.type === 'image') {
    src = sourceFor(c);
    if (!srcReady(src)) {
      // video is seeking/buffering: reuse its last good frame instead of flashing black
      const fc = c.type === 'video' && FrameCache.get(c.id);
      if (!fc) return;
      box = mediaBox(c, src);
      src = fc.canvas;
      box = Object.assign({}, box, { sw: fc.canvas.width, sh: fc.canvas.height });
    } else {
      box = mediaBox(c, src);
      if (c.type === 'video' && !S.precise) FrameCache.put(c.id, src);
    }
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = c.blend || 'source-over';
  ctx.translate(W / 2 + x + fx.dx, H / 2 + y + fx.dy);
  ctx.rotate((rot * Math.PI) / 180 + fx.r);
  const s = Math.max(0.0001, sc * fx.s);
  ctx.scale(s * (c.flipH ? -1 : 1) * (fx.sx || 1), s * (c.flipV ? -1 : 1) * (fx.sy || 1));

  if (c.type === 'text') drawText(ctx, c, fx);
  else if (c.type === 'sticker') {
    ctx.filter = filterString(c, fx.blur, fx.extraFilter);
    const size = c.size || 200;
    ctx.font = `${size * 0.82}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.emoji, 0, size * 0.04);
  } else {
    const { w, h, sw, sh } = box;
    maskPath(ctx, c, w, h);
    const cr = c.crop;
    const sx = sw * cr.l, sy = sh * cr.t, sW = sw * (1 - cr.l - cr.r), sH = sh * (1 - cr.t - cr.b);
    let drawSrc = src, dsx = sx, dsy = sy, dsw = sW, dsh = sH;
    if (c.chroma?.on) {
      drawSrc = chromaSource(c, src, sx, sy, sW, sH);
      dsx = 0; dsy = 0; dsw = drawSrc.width; dsh = drawSrc.height;
    }
    const intensity = c.filterIntensity ?? 1;
    if (c.filter !== 'none' && intensity < 0.999) {
      ctx.filter = filterString(c, fx.blur, fx.extraFilter, false);
      ctx.drawImage(drawSrc, dsx, dsy, dsw, dsh, -w / 2, -h / 2, w, h);
      ctx.globalAlpha = alpha * intensity;
    }
    ctx.filter = filterString(c, fx.blur, fx.extraFilter, true);
    ctx.drawImage(drawSrc, dsx, dsy, dsw, dsh, -w / 2, -h / 2, w, h);
    ctx.filter = 'none';
    ctx.globalAlpha = alpha;
    // colour tints (preset + temperature)
    const tint = FILTERS[c.filter]?.tint;
    const temp = c.adjust?.temperature || 0;
    if (tint || Math.abs(temp) > 0.01) {
      ctx.globalCompositeOperation = 'soft-light';
      if (tint) { ctx.globalAlpha = alpha * intensity; ctx.fillStyle = tint.replace(/[\d.]+\)$/, m => Math.min(1, parseFloat(m) * 3) + ')'); ctx.fillRect(-w / 2, -h / 2, w, h); }
      if (Math.abs(temp) > 0.01) {
        ctx.globalAlpha = alpha * Math.min(1, Math.abs(temp));
        ctx.fillStyle = temp > 0 ? 'rgb(255,140,20)' : 'rgb(20,120,255)';
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
    }
    const vig = c.adjust?.vignette || 0;
    if (vig > 0.01) drawVignette(ctx, -w / 2, -h / 2, w, h, vig);
  }
  ctx.restore();

  for (const p of fx.post) postEffect(ctx, p, t);
}

function drawVignette(ctx, x, y, w, h, k) {
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.25, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${clamp(k, 0, 1) * 0.85})`);
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.restore();
}

function postEffect(ctx, p, t) {
  const cv = ctx.canvas, W = P().width, H = P().height;
  ctx.save();
  if (p.type === 'flash') { ctx.globalAlpha = clamp(p.a, 0, 1); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  else if (p.type === 'vignette') drawVignette(ctx, 0, 0, W, H, p.k);
  else if (p.type === 'glitch') {
    const n = Math.floor(t * 16);
    if (prand(n) < 0.55) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const slices = 3 + Math.floor(prand(n + 1) * 6);
      for (let i = 0; i < slices; i++) {
        const sy = prand(n * 7 + i) * cv.height, sh = (0.01 + prand(n * 3 + i) * 0.07) * cv.height;
        const off = (prand(n * 5 + i) - 0.5) * cv.width * 0.12 * p.k;
        ctx.drawImage(cv, 0, sy, cv.width, sh, off, sy, cv.width, sh);
      }
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.25 * p.k;
      ctx.fillStyle = prand(n + 9) > 0.5 ? '#ff0040' : '#00e5ff';
      ctx.fillRect(0, prand(n + 4) * cv.height, cv.width, cv.height * 0.04);
    }
  } else if (p.type === 'rgb') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const off = 6 * R.scale * p.k * (1 + Math.sin(t * 6));
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.35;
    ctx.drawImage(cv, off, 0); ctx.drawImage(cv, -off, 0);
  } else if (p.type === 'scratches') {
    const n = Math.floor(t * 20);
    ctx.strokeStyle = 'rgba(255,255,240,.25)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) if (prand(n + i * 11) > 0.6) {
      const x = prand(n * 13 + i) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (prand(n + i) - 0.5) * 20, H); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    for (let i = 0; i < 40; i++) ctx.fillRect(prand(n * 3 + i) * W, prand(n * 5 + i) * H, 3, 3);
  }
  ctx.restore();
}

function drawText(ctx, c, fx) {
  const T = c.text;
  const L = textLayout(T, fx.chars);
  ctx.font = textFont(T);
  if ('letterSpacing' in ctx) ctx.letterSpacing = (T.spacing || 0) + 'px';
  ctx.textBaseline = 'middle';
  ctx.textAlign = T.align === 'left' ? 'left' : T.align === 'right' ? 'right' : 'center';
  ctx.filter = filterString(c, fx.blur, fx.extraFilter);
  const top = -L.h / 2 + L.lh / 2;
  const ax = T.align === 'left' ? -L.w / 2 : T.align === 'right' ? L.w / 2 : 0;
  if (T.bg?.on) {
    const pad = T.bg.pad || 0;
    ctx.save();
    ctx.globalAlpha *= T.bg.opacity ?? 1;
    ctx.fillStyle = T.bg.color;
    ctx.beginPath();
    roundRectPath(ctx, -L.w / 2 - pad, -L.h / 2 - pad, L.w + pad * 2, L.h + pad * 2, T.bg.radius || 0);
    ctx.fill();
    ctx.restore();
  }
  L.lines.forEach((line, i) => {
    const y = top + i * L.lh;
    if (T.shadow?.on) {
      ctx.shadowColor = T.shadow.color; ctx.shadowBlur = (T.shadow.blur || 0) * R.scale;
      ctx.shadowOffsetX = (T.shadow.x || 0) * R.scale; ctx.shadowOffsetY = (T.shadow.y || 0) * R.scale;
    }
    if (T.stroke?.on && T.stroke.width > 0) {
      ctx.lineJoin = 'round'; ctx.miterLimit = 2;
      ctx.strokeStyle = T.stroke.color; ctx.lineWidth = T.stroke.width * 2;
      ctx.strokeText(line, ax, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = T.color;
    ctx.fillText(line, ax, y);
    ctx.shadowColor = 'transparent';
    if (T.underline && line) {
      const lw = ctx.measureText(line).width;
      const ux = ctx.textAlign === 'left' ? ax : ctx.textAlign === 'right' ? ax - lw : ax - lw / 2;
      ctx.fillRect(ux, y + T.size * 0.42, lw, Math.max(2, T.size * 0.06));
    }
  });
}

/* ---------------- transitions ---------------- */
function drawTransition(ctx, prev, cur, p, t) {
  const W = P().width, H = P().height;
  const e = easeInOut(p);
  const prevOv = { local: prev.duration - 0.001 };
  const type = cur.transition.type;
  const clipRect = (fn) => { ctx.save(); ctx.beginPath(); fn(); ctx.clip(); drawClip(ctx, cur, t); ctx.restore(); };
  switch (type) {
    case 'dissolve': drawClip(ctx, prev, t, prevOv); drawClip(ctx, cur, t, { a: e }); break;
    case 'black': case 'white': case 'flash':
      if (p < 0.5) drawClip(ctx, prev, t, prevOv); else drawClip(ctx, cur, t);
      ctx.save(); ctx.fillStyle = type === 'black' ? '#000' : '#fff';
      ctx.globalAlpha = type === 'flash' ? Math.pow(1 - Math.abs(p - 0.5) * 2, 2) : 1 - Math.abs(p - 0.5) * 2;
      ctx.fillRect(0, 0, W, H); ctx.restore(); break;
    case 'slide-left': drawClip(ctx, prev, t, prevOv); drawClip(ctx, cur, t, { dx: (1 - e) * W }); break;
    case 'slide-right': drawClip(ctx, prev, t, prevOv); drawClip(ctx, cur, t, { dx: -(1 - e) * W }); break;
    case 'slide-up': drawClip(ctx, prev, t, prevOv); drawClip(ctx, cur, t, { dy: (1 - e) * H }); break;
    case 'push-left': drawClip(ctx, prev, t, { ...prevOv, dx: -e * W }); drawClip(ctx, cur, t, { dx: (1 - e) * W }); break;
    case 'wipe-right': drawClip(ctx, prev, t, prevOv); clipRect(() => ctx.rect(0, 0, W * e, H)); break;
    case 'wipe-down': drawClip(ctx, prev, t, prevOv); clipRect(() => ctx.rect(0, 0, W, H * e)); break;
    case 'circle': drawClip(ctx, prev, t, prevOv); clipRect(() => ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * e, 0, Math.PI * 2)); break;
    case 'zoom-in': drawClip(ctx, cur, t, { a: e }); drawClip(ctx, prev, t, { ...prevOv, s: 1 + e * 0.6, a: 1 - e }); break;
    case 'zoom-out': drawClip(ctx, prev, t, prevOv); drawClip(ctx, cur, t, { s: 1.6 - 0.6 * e, a: e }); break;
    case 'spin': drawClip(ctx, prev, t, prevOv); drawClip(ctx, cur, t, { r: (1 - e) * Math.PI, s: Math.max(0.01, e), a: e }); break;
    case 'blur':
      if (p < 0.5) drawClip(ctx, prev, t, { ...prevOv, blur: p * 2 * 40 }); else drawClip(ctx, cur, t, { blur: (1 - p) * 2 * 40 }); break;
    default:
      if (!(typeof extraTransition === 'function' && extraTransition(ctx, prev, cur, p, t, type))) drawClip(ctx, cur, t);
  }
}

/* ---------------- full frame ---------------- */
function activeVisualClips(t) {
  const out = [];
  P().tracks.forEach((tr, ti) => {
    if (tr.kind !== 'visual' || tr.hidden) return;
    for (const c of tr.clips) if (c.type !== 'effect' && t >= c.start && t < clipEnd(c)) out.push({ c, tr, ti });
  });
  return out; // index 0 = top-most
}

function renderFrame(ctx, t, opts = {}) {
  const p = P();
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  R.scale = cw / p.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = p.background.mode === 'color' || p.background.mode === 'blur' ? p.background.color : '#000';
  ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(R.scale, 0, 0, R.scale, 0, 0);

  if (p.background.mode === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, p.width, p.height);
    g.addColorStop(0, p.background.color); g.addColorStop(1, p.background.color2 || '#222');
    ctx.fillStyle = g; ctx.fillRect(0, 0, p.width, p.height);
  }
  if (p.background.mode === 'blur') {
    const act = activeVisualClips(t).filter(x => x.c.type === 'video' || x.c.type === 'image');
    const base = act[act.length - 1];
    if (base) {
      const src = sourceFor(base.c);
      if (srcReady(src)) {
        const [sw, sh] = srcDims(base.c, src);
        const cover = Math.max(p.width / sw, p.height / sh) * 1.1;
        ctx.save();
        ctx.filter = `blur(${(p.background.blur * R.scale).toFixed(1)}px) brightness(0.85)`;
        ctx.drawImage(src, (p.width - sw * cover) / 2, (p.height - sh * cover) / 2, sw * cover, sh * cover);
        ctx.restore();
      }
    }
  }

  for (let i = p.tracks.length - 1; i >= 0; i--) {
    const tr = p.tracks[i];
    if (tr.kind !== 'visual' || tr.hidden) continue;
    for (const c of tr.clips) {
      if (t < c.start || t >= clipEnd(c)) continue;
      if (c.type === 'effect') { if (typeof applyEffectClip === 'function') applyEffectClip(ctx, c, t); continue; }
      const td = c.transition?.type !== 'none' ? Math.min(c.transition?.dur || 0, c.duration) : 0;
      const local = t - c.start;
      if (td > 0 && local < td) {
        const prev = tr.clips.find(o => o !== c && Math.abs(clipEnd(o) - c.start) < 0.05);
        if (prev) { drawTransition(ctx, prev, c, local / td, t); continue; }
        drawClip(ctx, c, t, { a: easeInOut(local / td) });
        continue;
      }
      drawClip(ctx, c, t);
    }
  }

  if (opts.ui) drawSelection(ctx, t);
}

/* selection gizmo on the preview */
function clipCorners(c, t) {
  const local = clamp(t - c.start, 0, c.duration);
  const W = P().width, H = P().height;
  const b = clipBox(c);
  const s = kfValue(c, 'scale', local), r = kfValue(c, 'rotation', local) * Math.PI / 180;
  const cx = W / 2 + kfValue(c, 'x', local), cy = H / 2 + kfValue(c, 'y', local);
  const hw = b.w * s / 2, hh = b.h * s / 2;
  const cos = Math.cos(r), sin = Math.sin(r);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
}
function drawSelection(ctx, t) {
  const c = selClip();
  if (!c || c.type === 'audio' || c.type === 'effect' || t < c.start || t >= clipEnd(c)) return;
  const tr = trackOf(c); if (!tr || tr.hidden) return;
  const pts = clipCorners(c, t);
  const lw = 2 / R.scale;
  ctx.save();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.strokeStyle = '#18d4c4'; ctx.lineWidth = lw;
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = '#fff';
  const hs = 7 / R.scale;
  for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, hs, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  // rotation handle
  const top = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  const ang = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) - Math.PI / 2;
  const rh = [top[0] + Math.cos(ang) * 34 / R.scale, top[1] + Math.sin(ang) * 34 / R.scale];
  ctx.beginPath(); ctx.moveTo(...top); ctx.lineTo(...rh); ctx.stroke();
  ctx.beginPath(); ctx.arc(rh[0], rh[1], hs, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function rotHandlePos(c, t) {
  const pts = clipCorners(c, t);
  const top = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  const ang = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) - Math.PI / 2;
  return [top[0] + Math.cos(ang) * 34 / R.scale, top[1] + Math.sin(ang) * 34 / R.scale];
}
function pointInClip(c, t, px, py) {
  const pts = clipCorners(c, t);
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function hitTest(px, py, t) {
  for (const { c } of activeVisualClips(t)) if (pointInClip(c, t, px, py)) return c;
  return null;
}
