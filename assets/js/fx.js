/* ClipLab Studio — effect clips (CapCut-style effects track), extra transitions, extra filters, voice effects */
'use strict';

/* ---------------- shared offscreen canvases ---------------- */
const FXTmp = {
  pool: new Map(),
  get(name, w, hh) {
    let e = this.pool.get(name);
    if (!e) { const cv = document.createElement('canvas'); e = { canvas: cv, ctx: cv.getContext('2d') }; this.pool.set(name, e); }
    if (e.canvas.width !== w || e.canvas.height !== hh) { e.canvas.width = w; e.canvas.height = hh; }
    e.ctx.setTransform(1, 0, 0, 1, 0, 0); e.ctx.globalAlpha = 1; e.ctx.globalCompositeOperation = 'source-over'; e.ctx.filter = 'none';
    return e;
  },
};
/** copy of what has been drawn so far */
function snap(ctx, name = 'snap') {
  const cv = ctx.canvas;
  const t = FXTmp.get(name, cv.width, cv.height);
  t.ctx.clearRect(0, 0, cv.width, cv.height);
  t.ctx.drawImage(cv, 0, 0);
  return t.canvas;
}
/** redraw the composite through a transform / filter */
function recomposite(ctx, fn, { clear = '#000' } = {}) {
  const src = snap(ctx);
  const cv = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (clear) { ctx.fillStyle = clear; ctx.fillRect(0, 0, cv.width, cv.height); }
  fn(src, cv.width, cv.height);
  ctx.restore();
}
let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d'); const d = x.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  return grainTile = cv;
}
function heartShape(x, cx, cy, s) {
  x.beginPath();
  x.moveTo(cx, cy + s * 0.35);
  x.bezierCurveTo(cx - s * 0.6, cy - s * 0.05, cx - s * 0.3, cy - s * 0.55, cx, cy - s * 0.2);
  x.bezierCurveTo(cx + s * 0.3, cy - s * 0.55, cx + s * 0.6, cy - s * 0.05, cx, cy + s * 0.35);
  x.closePath();
}
function star4(x, cx, cy, r) {
  x.beginPath();
  for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.22 : r, a = i * Math.PI / 4; i ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  x.closePath();
}
const PALETTE = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff70a6', '#00f5d4', '#ffffff'];

/* ---------------- effect definitions ---------------- */
// fn(ctx, W, H, o) with W/H in canvas pixels; o = {p, local, dur, k, t, s}  (s = canvas px per project px)
const FX = {};
const fx = (key, name, cat, icon, fn) => FX[key] = { name, cat, icon, fn };

// Basic
fx('push-in', 'Zoom in', 'Basic', '🔍', (ctx, W, H, o) => recomposite(ctx, (src) => { const z = 1 + 0.25 * o.k * easeInOut(o.p); ctx.drawImage(src, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z); }));
fx('pull-out', 'Zoom out', 'Basic', '🔭', (ctx, W, H, o) => recomposite(ctx, (src) => { const z = 1 + 0.25 * o.k * (1 - easeInOut(o.p)); ctx.drawImage(src, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z); }));
fx('zoom-pulse', 'Zoom pulse', 'Basic', '💓', (ctx, W, H, o) => recomposite(ctx, (src) => { const z = 1 + 0.08 * o.k * Math.abs(Math.sin(o.local * Math.PI * 2)); ctx.drawImage(src, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z); }));
fx('shake', 'Shake', 'Basic', '📳', (ctx, W, H, o) => recomposite(ctx, (src) => { const a = 14 * o.k * o.s * 3; const z = 1.04; ctx.drawImage(src, (W - W * z) / 2 + Math.sin(o.t * 53) * a, (H - H * z) / 2 + Math.cos(o.t * 41) * a, W * z, H * z); }));
fx('earthquake', 'Earthquake', 'Basic', '🌋', (ctx, W, H, o) => recomposite(ctx, (src) => { const a = 30 * o.k * o.s * 3; const z = 1.1; const n = Math.floor(o.t * 30); ctx.filter = `blur(${2 * o.k}px)`; ctx.drawImage(src, (W - W * z) / 2 + (prand(n) - .5) * a, (H - H * z) / 2 + (prand(n + 7) - .5) * a, W * z, H * z); }));
fx('swing', 'Swing', 'Basic', '🎐', (ctx, W, H, o) => recomposite(ctx, (src) => { ctx.translate(W / 2, H / 2); ctx.rotate(Math.sin(o.local * Math.PI * 1.5) * 0.06 * o.k); ctx.scale(1.12, 1.12); ctx.drawImage(src, -W / 2, -H / 2); }));
fx('3d-flip', '3D flip', 'Basic', '🔄', (ctx, W, H, o) => recomposite(ctx, (src) => { const c = Math.cos(o.p * Math.PI * 2 * o.k); ctx.translate(W / 2, H / 2); ctx.scale(Math.max(0.02, Math.abs(c)), 1); ctx.drawImage(src, -W / 2, -H / 2); }));
fx('blur', 'Blur', 'Basic', '🌫️', (ctx, W, H, o) => recomposite(ctx, (src) => { ctx.filter = `blur(${(14 * o.k * o.s * 2).toFixed(1)}px)`; ctx.drawImage(src, 0, 0); }));
fx('focus-in', 'Focus in', 'Basic', '🎯', (ctx, W, H, o) => recomposite(ctx, (src) => { const b = Math.max(0, 1 - o.local / Math.min(1.2, o.dur)) * 24 * o.k * o.s * 2; ctx.filter = b > .2 ? `blur(${b.toFixed(1)}px)` : 'none'; ctx.drawImage(src, 0, 0); }));
fx('flash', 'Flash', 'Basic', '⚡', (ctx, W, H, o) => { const a = Math.max(0, 1 - (o.local % 1) / 0.35) * o.k; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); });
fx('strobe', 'Strobe', 'Basic', '💡', (ctx, W, H, o) => { if (Math.floor(o.local * 8) % 2) return; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.55 * o.k; ctx.fillStyle = Math.floor(o.local * 4) % 2 ? '#000' : '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); });
fx('dip-black', 'Fade to black', 'Basic', '⬛', (ctx, W, H, o) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = clamp(1 - Math.abs(o.p * 2 - 1), 0, 1) * o.k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); });
fx('dip-white', 'Fade to white', 'Basic', '⬜', (ctx, W, H, o) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = clamp(1 - Math.abs(o.p * 2 - 1), 0, 1) * o.k; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); });
fx('letterbox', 'Cinema bars', 'Basic', '🎬', (ctx, W, H, o) => { const e = easeOut(Math.min(1, o.local / 0.6)) * Math.min(1, (o.dur - o.local) / 0.6 + 0.0001 > 1 ? 1 : easeOut((o.dur - o.local) / 0.6)); const bh = H * 0.12 * o.k * e; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); ctx.restore(); });
fx('vignette', 'Vignette', 'Basic', '◉', (ctx, W, H, o) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.55); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.85 * clamp(o.k, 0, 1.2)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); });
fx('spotlight', 'Spotlight', 'Basic', '🔦', (ctx, W, H, o) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const cx = W / 2 + Math.sin(o.local * 1.3) * W * 0.25, cy = H / 2 + Math.cos(o.local * 0.9) * H * 0.15; const g = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.1, cx, cy, Math.min(W, H) * 0.45); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.85 * clamp(o.k, 0, 1)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); });

// Retro
fx('vhs', 'VHS', 'Retro', '📼', (ctx, W, H, o) => {
  recomposite(ctx, (src) => {
    const n = Math.floor(o.t * 24), off = (3 + prand(n) * 3) * o.k * o.s * 2;
    ctx.filter = 'saturate(1.3) contrast(1.05)';
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.35;
    ctx.drawImage(src, off, 0); ctx.drawImage(src, -off, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // tracking band
    const by = ((o.t * 0.35) % 1.2 - 0.1) * H, bh = H * 0.05;
    ctx.drawImage(src, 0, by, W, bh, (prand(n + 3) - 0.5) * W * 0.04, by, W, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, by, W, bh);
  }, { clear: null });
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  const step = Math.max(2, Math.round(3 * o.s * 2));
  for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
  ctx.font = `${Math.round(H * 0.05)}px "VT323", monospace`; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
  ctx.textBaseline = 'top'; ctx.fillText('PLAY ▶', W * 0.05, H * 0.06);
  ctx.textAlign = 'right'; ctx.fillText(fmtTime(o.t), W * 0.95, H * 0.06);
  ctx.restore();
});
fx('old-film', 'Old film', 'Retro', '🎞️', (ctx, W, H, o) => {
  recomposite(ctx, (src) => { ctx.filter = `sepia(${0.75 * o.k}) contrast(1.1) brightness(${1 - 0.12 * prand(Math.floor(o.t * 18))})`; ctx.drawImage(src, 0, 0); });
  FX.vignette.fn(ctx, W, H, Object.assign({}, o, { k: 0.9 }));
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const n = Math.floor(o.t * 20);
  ctx.strokeStyle = 'rgba(255,250,230,0.35)'; ctx.lineWidth = Math.max(1, W / 900);
  for (let i = 0; i < 3; i++) if (prand(n + i * 11) > 0.55) { const x = prand(n * 13 + i) * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (prand(n + i) - .5) * 30, H); ctx.stroke(); }
  ctx.fillStyle = 'rgba(20,10,0,0.35)';
  for (let i = 0; i < 25; i++) { const r = prand(n * 5 + i) * 3 * (W / 900) + 1; ctx.beginPath(); ctx.arc(prand(n * 3 + i) * W, prand(n * 7 + i) * H, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
});
fx('crt', 'CRT TV', 'Retro', '📺', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(0,0,0,${0.28 * o.k})`;
  const step = Math.max(2, Math.round(H / 270));
  for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
  ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = 'rgba(80,255,120,0.08)'; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  FX.vignette.fn(ctx, W, H, Object.assign({}, o, { k: 1.1 }));
});
fx('grain', 'Film grain', 'Retro', '🌾', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.35 * o.k;
  const g = grain(), n = Math.floor(o.t * 24);
  ctx.translate(-prand(n) * 256, -prand(n + 1) * 256);
  ctx.fillStyle = ctx.createPattern(g, 'repeat'); ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
});
fx('8mm', '8mm camera', 'Retro', '📹', (ctx, W, H, o) => {
  recomposite(ctx, (src) => { ctx.filter = `sepia(0.3) saturate(1.2) contrast(1.08) brightness(${1 - 0.1 * prand(Math.floor(o.t * 16))})`; const j = (prand(Math.floor(o.t * 16)) - .5) * H * 0.006; ctx.drawImage(src, 0, j); });
  FX.grain.fn(ctx, W, H, o);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(255,150,50,0.25)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  FX.vignette.fn(ctx, W, H, Object.assign({}, o, { k: 1 }));
});
fx('bw', 'Black & white', 'Retro', '◑', (ctx, W, H, o) => recomposite(ctx, (src) => { ctx.filter = `grayscale(${o.k}) contrast(1.1)`; ctx.drawImage(src, 0, 0); }));
fx('sepia-fade', 'Memory', 'Retro', '🟤', (ctx, W, H, o) => recomposite(ctx, (src) => { ctx.filter = `sepia(${easeInOut(o.p) * o.k}) contrast(${1 - 0.1 * o.p}) brightness(${1 + 0.05 * o.p})`; ctx.drawImage(src, 0, 0); }));
fx('pixel-retro', '8-bit', 'Retro', '👾', (ctx, W, H, o) => { FX.pixelate.fn(ctx, W, H, Object.assign({}, o, { k: 0.8 * o.k })); recomposite(ctx, (src) => { ctx.filter = 'saturate(1.6) contrast(1.4)'; ctx.drawImage(src, 0, 0); }); });

// Light
fx('light-leak', 'Light leak', 'Light', '🌅', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen';
  const blobs = [['255,120,40', 0.0], ['255,60,120', 1.7], ['255,200,80', 3.1]];
  for (const [col, ph] of blobs) {
    const cx = W * (0.5 + 0.55 * Math.sin(o.local * 0.7 + ph)), cy = H * (0.4 + 0.4 * Math.cos(o.local * 0.5 + ph));
    const r = Math.max(W, H) * 0.55;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${col},${0.55 * o.k})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
});
fx('lens-flare', 'Lens flare', 'Light', '☀️', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen';
  const sx = W * (0.15 + 0.7 * o.p), sy = H * 0.2, cx = W / 2, cy = H / 2;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.min(W, H) * 0.35);
  g.addColorStop(0, `rgba(255,255,240,${0.95 * o.k})`); g.addColorStop(0.15, `rgba(255,220,150,${0.5 * o.k})`); g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const cols = ['120,200,255', '255,140,220', '150,255,180', '255,210,120'];
  [0.4, 0.7, 1.2, 1.6].forEach((f, i) => {
    const x = sx + (cx - sx) * f * 2, y = sy + (cy - sy) * f * 2, r = Math.min(W, H) * (0.03 + i * 0.025);
    ctx.fillStyle = `rgba(${cols[i]},${0.25 * o.k})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
});
fx('dreamy', 'Dreamy glow', 'Light', '✨', (ctx, W, H, o) => { const src = snap(ctx); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55 * clamp(o.k, 0, 1.5); ctx.filter = `blur(${(Math.max(W, H) / 60).toFixed(1)}px) brightness(1.1)`; ctx.drawImage(src, 0, 0); ctx.restore(); });
fx('bloom', 'Bloom', 'Light', '🌟', (ctx, W, H, o) => { const src = snap(ctx); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * clamp(o.k, 0, 1.5); ctx.filter = `blur(${(Math.max(W, H) / 90).toFixed(1)}px) brightness(1.4) contrast(1.6)`; ctx.drawImage(src, 0, 0); ctx.restore(); });
fx('bokeh', 'Bokeh', 'Light', '🔆', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 26; i++) {
    const r = Math.min(W, H) * (0.03 + prand(i * 3) * 0.07), x = (prand(i) * W + Math.sin(o.local * 0.4 + i) * W * 0.05), y = (prand(i + 50) * H - o.local * H * 0.03 * (1 + prand(i)) + H) % H;
    const col = PALETTE[i % 6];
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, hexA(col, 0.4 * o.k)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
});
fx('sparkle', 'Sparkles', 'Light', '💫', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
  for (let i = 0; i < 40 * o.k; i++) {
    const tw = Math.max(0, Math.sin(o.local * (2 + prand(i) * 4) + i * 1.7));
    if (tw < 0.2) continue;
    star4(ctx, prand(i * 7) * W, prand(i * 13) * H, Math.min(W, H) * 0.02 * tw * (0.5 + prand(i)));
    ctx.globalAlpha = tw; ctx.fill();
  }
  ctx.restore();
});
fx('sun-rays', 'Sun rays', 'Light', '🌞', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen';
  ctx.translate(W * 0.85, -H * 0.1); ctx.rotate(o.local * 0.08);
  const R_ = Math.hypot(W, H) * 1.2;
  for (let i = 0; i < 14; i++) {
    ctx.rotate(Math.PI * 2 / 14);
    const g = ctx.createLinearGradient(0, 0, R_, 0); g.addColorStop(0, `rgba(255,240,200,${0.35 * o.k})`); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R_, -R_ * 0.05); ctx.lineTo(R_, R_ * 0.05); ctx.fill();
  }
  ctx.restore();
});
fx('rainbow-light', 'Rainbow light', 'Light', '🌈', (ctx, W, H, o) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'soft-light'; const g = ctx.createLinearGradient(0, 0, W, H); for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsla(${(i * 60 + o.local * 90) % 360},100%,60%,${0.6 * o.k})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); });

// Party / particles
const fall = (o, i, speed, H) => ((prand(i * 3 + 1) * H + o.local * speed * (0.6 + prand(i) * 0.8)) % (H * 1.2)) - H * 0.1;
fx('confetti', 'Confetti', 'Party', '🎉', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const n = Math.round(90 * o.k), sz = Math.min(W, H) * 0.018;
  for (let i = 0; i < n; i++) {
    const x = prand(i) * W + Math.sin(o.local * 2 + i) * W * 0.02, y = fall(o, i, H * 0.35, H);
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.local * (2 + prand(i) * 4) + i);
    ctx.scale(1, Math.abs(Math.cos(o.local * 4 + i)));
    ctx.fillStyle = PALETTE[i % PALETTE.length]; ctx.fillRect(-sz / 2, -sz / 4, sz, sz / 2); ctx.restore();
  }
  ctx.restore();
});
fx('hearts', 'Hearts', 'Party', '💕', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 30 * o.k; i++) {
    const s = Math.min(W, H) * (0.03 + prand(i * 9) * 0.04), x = prand(i) * W + Math.sin(o.local * 1.5 + i) * W * 0.03;
    const y = H - fall(o, i, H * 0.25, H);
    ctx.globalAlpha = 0.85; ctx.fillStyle = ['#ff4d6d', '#ff8fab', '#ff0a54', '#ffb3c6'][i % 4];
    heartShape(ctx, x, y, s); ctx.fill();
  }
  ctx.restore();
});
fx('snow', 'Snow', 'Party', '❄️', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff';
  for (let i = 0; i < 160 * o.k; i++) {
    const r = Math.min(W, H) * (0.002 + prand(i * 5) * 0.005), x = (prand(i) * W + Math.sin(o.local + i) * W * 0.02), y = fall(o, i, H * 0.12, H);
    ctx.globalAlpha = 0.5 + prand(i * 2) * 0.5; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
});
fx('rain', 'Rain', 'Party', '🌧️', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(20,30,50,${0.25 * o.k})`; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(200,220,255,0.55)'; ctx.lineWidth = Math.max(1, W / 1200);
  ctx.beginPath();
  for (let i = 0; i < 220 * o.k; i++) { const x = prand(i) * W * 1.2 - W * 0.1, y = fall(o, i, H * 1.6, H), l = H * 0.04; ctx.moveTo(x, y); ctx.lineTo(x - l * 0.2, y + l); }
  ctx.stroke();
  ctx.restore();
});
fx('bubbles', 'Bubbles', 'Party', '🫧', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineWidth = Math.max(1.5, W / 700);
  for (let i = 0; i < 35 * o.k; i++) {
    const r = Math.min(W, H) * (0.015 + prand(i * 3) * 0.04), x = prand(i) * W + Math.sin(o.local * 2 + i) * W * 0.02, y = H - fall(o, i, H * 0.2, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.fillStyle = 'rgba(180,230,255,0.12)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
});
fx('fireworks', 'Fireworks', 'Party', '🎆', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
  for (let b = 0; b < 4; b++) {
    const period = 1.6, ph = (o.local + b * 0.4) % period, burst = Math.floor((o.local + b * 0.4) / period) * 10 + b;
    const cx = W * (0.2 + prand(burst) * 0.6), cy = H * (0.15 + prand(burst + 3) * 0.35), col = PALETTE[burst % 7];
    const rad = Math.min(W, H) * 0.25 * easeOut(ph / period), fade = 1 - ph / period;
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * Math.PI * 2, x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad + ph * ph * H * 0.05;
      ctx.fillStyle = hexA(col, fade * o.k); ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, W / 500), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
});
fx('emoji-rain', 'Emoji rain', 'Party', '😂', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const em = ['😂', '🔥', '❤️', '😍', '💯', '✨', '🎉', '👍'];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 28 * o.k; i++) {
    const s = Math.min(W, H) * (0.04 + prand(i * 3) * 0.04);
    ctx.font = `${s}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(em[i % em.length], prand(i) * W, fall(o, i, H * 0.3, H));
  }
  ctx.restore();
});
fx('stars-fall', 'Falling stars', 'Party', '🌠', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff7c2'; ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 12;
  for (let i = 0; i < 40 * o.k; i++) { star4(ctx, prand(i) * W, fall(o, i, H * 0.25, H), Math.min(W, H) * (0.01 + prand(i * 4) * 0.015)); ctx.fill(); }
  ctx.restore();
});

// Distortion
fx('glitch', 'Glitch', 'Distort', '⚠️', (ctx, W, H, o) => {
  const n = Math.floor(o.t * 16); if (prand(n) > 0.6 + 0.3 * (1 - clamp(o.k, 0, 1))) return;
  const src = snap(ctx); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 6; i++) { const sy = prand(n * 7 + i) * H, sh = (0.01 + prand(n * 3 + i) * 0.08) * H, off = (prand(n * 5 + i) - .5) * W * 0.14 * o.k; ctx.drawImage(src, 0, sy, W, sh, off, sy, W, sh); }
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.3;
  ctx.drawImage(src, 8 * o.k * o.s * 3, 0); ctx.restore();
});
fx('rgb-split', 'RGB split', 'Distort', '🌈', (ctx, W, H, o) => { const src = snap(ctx); const off = (4 + 4 * Math.sin(o.t * 5)) * o.k * o.s * 3; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.45; ctx.drawImage(src, off, 0); ctx.drawImage(src, -off, 0); ctx.restore(); });
fx('pixelate', 'Pixelate', 'Distort', '🟪', (ctx, W, H, o) => {
  const src = snap(ctx); const px = Math.max(2, Math.round(Math.min(W, H) / (90 / Math.max(0.2, o.k))));
  const t = FXTmp.get('pix', Math.ceil(W / px), Math.ceil(H / px)); t.ctx.drawImage(src, 0, 0, t.canvas.width, t.canvas.height);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(t.canvas, 0, 0, W, H); ctx.restore();
});
fx('mirror-h', 'Mirror', 'Distort', '🪞', (ctx, W, H) => { const src = snap(ctx); ctx.save(); ctx.setTransform(-1, 0, 0, 1, W, 0); ctx.drawImage(src, 0, 0, W / 2, H, 0, 0, W / 2, H); ctx.restore(); });
fx('mirror-v', 'Mirror vertical', 'Distort', '🔃', (ctx, W, H) => { const src = snap(ctx); ctx.save(); ctx.setTransform(1, 0, 0, -1, 0, H); ctx.drawImage(src, 0, 0, W, H / 2, 0, 0, W, H / 2); ctx.restore(); });
fx('kaleido', 'Kaleidoscope', 'Distort', '❇️', (ctx, W, H) => {
  const src = snap(ctx); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const hw = W / 2, hh = H / 2;
  ctx.drawImage(src, 0, 0, hw, hh, 0, 0, hw, hh);
  ctx.setTransform(-1, 0, 0, 1, W, 0); ctx.drawImage(src, 0, 0, hw, hh, 0, 0, hw, hh);
  ctx.setTransform(1, 0, 0, -1, 0, H); ctx.drawImage(src, 0, 0, hw, hh, 0, 0, hw, hh);
  ctx.setTransform(-1, 0, 0, -1, W, H); ctx.drawImage(src, 0, 0, hw, hh, 0, 0, hw, hh);
  ctx.restore();
});
fx('wave-distort', 'Wave', 'Distort', '🌊', (ctx, W, H, o) => { const src = snap(ctx); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const sl = Math.max(2, Math.round(H / 120)); for (let y = 0; y < H; y += sl) { const off = Math.sin(y / H * 12 + o.local * 4) * W * 0.02 * o.k; ctx.drawImage(src, 0, y, W, sl, off, y, W, sl); } ctx.restore(); });
fx('zoom-blur', 'Zoom blur', 'Distort', '💨', (ctx, W, H, o) => { const src = snap(ctx); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); for (let i = 1; i <= 6; i++) { const z = 1 + i * 0.02 * o.k; ctx.globalAlpha = 0.18; ctx.drawImage(src, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z); } ctx.restore(); });
fx('invert', 'Invert', 'Distort', '🔳', (ctx, W, H, o) => recomposite(ctx, (src) => { ctx.filter = `invert(${o.k > 0.5 ? 1 : o.k * 2})`; ctx.drawImage(src, 0, 0); }));
fx('negative-flash', 'Negative flash', 'Distort', '⚫', (ctx, W, H, o) => { if (Math.floor(o.local * 6) % 3) return; recomposite(ctx, (src) => { ctx.filter = 'invert(1)'; ctx.drawImage(src, 0, 0); }); });
fx('hue-cycle', 'Color cycle', 'Distort', '🎨', (ctx, W, H, o) => recomposite(ctx, (src) => { ctx.filter = `hue-rotate(${(o.local * 120 * o.k) % 360}deg) saturate(1.4)`; ctx.drawImage(src, 0, 0); }));
fx('posterize', 'Pop art', 'Distort', '🖼️', (ctx, W, H, o) => recomposite(ctx, (src) => { ctx.filter = `contrast(${1 + 1.5 * o.k}) saturate(${1 + 1.5 * o.k})`; ctx.drawImage(src, 0, 0); }));
const splitN = (n, m) => (ctx, W, H) => { const src = snap(ctx); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) ctx.drawImage(src, i * W / n, j * H / m, W / n, H / m); ctx.restore(); };
fx('split-2', 'Split 2', 'Split', '◫', (ctx, W, H) => { const src = snap(ctx); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); if (W >= H) { ctx.drawImage(src, W / 4, 0, W / 2, H, 0, 0, W / 2, H); ctx.drawImage(src, W / 4, 0, W / 2, H, W / 2, 0, W / 2, H); } else { ctx.drawImage(src, 0, H / 4, W, H / 2, 0, 0, W, H / 2); ctx.drawImage(src, 0, H / 4, W, H / 2, 0, H / 2, W, H / 2); } ctx.restore(); });
fx('split-3', 'Split 3', 'Split', '▥', (ctx, W, H) => { const src = snap(ctx); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); for (let i = 0; i < 3; i++) { if (W >= H) ctx.drawImage(src, W / 3, 0, W / 3, H, i * W / 3, 0, W / 3, H); else ctx.drawImage(src, 0, H / 3, W, H / 3, 0, i * H / 3, W, H / 3); } ctx.restore(); });
fx('split-4', 'Split 4', 'Split', '⊞', splitN(2, 2));
fx('split-9', 'Split 9', 'Split', '▦', splitN(3, 3));
fx('split-16', 'Split 16', 'Split', '▩', splitN(4, 4));

// Frames & overlays
fx('rec', 'REC camera', 'Frames', '🔴', (ctx, W, H, o) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const m = Math.min(W, H) * 0.06, L_ = Math.min(W, H) * 0.08, lw = Math.max(2, Math.min(W, H) / 220);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(m, m + L_); ctx.lineTo(m, m); ctx.lineTo(m + L_, m);
  ctx.moveTo(W - m - L_, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + L_);
  ctx.moveTo(m, H - m - L_); ctx.lineTo(m, H - m); ctx.lineTo(m + L_, H - m);
  ctx.moveTo(W - m - L_, H - m); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m, H - m - L_);
  ctx.stroke();
  const fs = Math.min(W, H) * 0.045;
  ctx.font = `700 ${fs}px Inter, sans-serif`; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  if (Math.floor(o.local * 2) % 2 === 0) { ctx.fillStyle = '#ff2d2d'; ctx.beginPath(); ctx.arc(m * 1.6 + fs * 0.3, m * 1.6, fs * 0.32, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.fillText('REC', m * 1.6 + fs * 0.85, m * 1.6);
  ctx.textAlign = 'right'; ctx.fillText(fmtTime(o.local, false), W - m * 1.6, m * 1.6);
  ctx.textAlign = 'left'; ctx.font = `600 ${fs * 0.7}px Inter, sans-serif`; ctx.fillText('4K  60FPS', m * 1.6, H - m * 1.6);
  ctx.textAlign = 'right'; ctx.fillText('▮▮▮▯', W - m * 1.6, H - m * 1.6);
  ctx.textAlign = 'center'; ctx.globalAlpha = 0.8; ctx.font = `300 ${fs * 1.4}px Inter, sans-serif`; ctx.fillText('+', W / 2, H / 2);
  ctx.restore();
});
fx('countdown', 'Countdown 3-2-1', 'Frames', '3️⃣', (ctx, W, H, o) => {
  const n = Math.max(1, 3 - Math.floor(o.p * 3)), ph = (o.p * 3) % 1;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.min(W, H) / 80;
  const r = Math.min(W, H) * 0.28;
  ctx.beginPath(); ctx.arc(W / 2, H / 2, r, -Math.PI / 2, -Math.PI / 2 + ph * Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${r * 1.2 * (1.2 - 0.2 * easeOut(ph))}px "Bebas Neue", Impact, sans-serif`; ctx.globalAlpha = 1 - ph * 0.3;
  ctx.fillText(String(n), W / 2, H / 2 + r * 0.05);
  ctx.restore();
});
fx('border', 'White border', 'Frames', '🖼️', (ctx, W, H, o) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const b = Math.min(W, H) * 0.035 * o.k; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); ctx.fillRect(0, 0, b, H); ctx.fillRect(W - b, 0, b, H); ctx.restore(); });
fx('film-frame', 'Film strip', 'Frames', '🎞', (ctx, W, H) => {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vertical = H > W, b = (vertical ? W : H) * 0.09;
  ctx.fillStyle = '#0b0b0b';
  if (vertical) { ctx.fillRect(0, 0, b, H); ctx.fillRect(W - b, 0, b, H); } else { ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); }
  ctx.fillStyle = '#f5f5f5';
  const hole = b * 0.42, gap = hole * 2;
  if (vertical) for (let y = gap / 2; y < H; y += gap) { roundRectPath(ctx, b * 0.29, y, hole, hole * 0.7, hole * 0.15); roundRectPath(ctx, W - b * 0.71, y, hole, hole * 0.7, hole * 0.15); }
  else for (let x = gap / 2; x < W; x += gap) { ctx.beginPath(); roundRectPath(ctx, x, b * 0.29, hole * 0.7, hole, hole * 0.15); roundRectPath(ctx, x, H - b * 0.71, hole * 0.7, hole, hole * 0.15); ctx.fill(); }
  if (vertical) ctx.fill();
  ctx.restore();
});
fx('cinematic', 'Cinematic look', 'Frames', '🎥', (ctx, W, H, o) => {
  recomposite(ctx, (src) => { ctx.filter = 'contrast(1.15) saturate(1.15)'; ctx.drawImage(src, 0, 0); });
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(0,140,150,0.35)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  FX.letterbox.fn(ctx, W, H, o);
});

/* register the effect clip type */
const EFFECT_CATS = ['Basic', 'Retro', 'Light', 'Party', 'Distort', 'Split', 'Frames'];

function applyEffectClip(ctx, c, t) {
  const def = FX[c.fx]; if (!def) return;
  const local = t - c.start;
  const cv = ctx.canvas;
  ctx.save();
  try {
    def.fn(ctx, cv.width, cv.height, { p: clamp(local / Math.max(0.01, c.duration), 0, 1), local, dur: c.duration, k: c.fxStrength ?? 1, t, s: R.scale });
  } catch (e) { console.warn('effect', c.fx, e); }
  ctx.restore();
}

/* ---------------- extra transitions ---------------- */
Object.assign(TRANSITIONS, {
  'whip-left': 'Whip pan left', 'whip-right': 'Whip pan right', 'swipe-up': 'Push up', glitch: 'Glitch', pixelate: 'Pixelate', rotate: 'Rotate',
  'cross-zoom': 'Cross zoom', squeeze: 'Squeeze', flip: '3D flip', blinds: 'Blinds', diamond: 'Diamond', heart: 'Heart', clock: 'Clock wipe',
  'split-open': 'Split open', shutter: 'Shutter', 'tv-off': 'TV switch', 'rgb-shift': 'RGB shift', 'zoom-spin': 'Zoom spin',
});
function layerOf(name, draw) {
  const main = R._ctx.canvas;
  const l = FXTmp.get(name, main.width, main.height);
  l.ctx.clearRect(0, 0, main.width, main.height);
  l.ctx.setTransform(R.scale, 0, 0, R.scale, 0, 0);
  draw(l.ctx);
  return l.canvas;
}
function extraTransition(ctx, prev, cur, p, t, type) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const e = easeInOut(p);
  R._ctx = ctx;
  const prevOv = { local: prev.duration - 0.001 };
  const A = layerOf('trA', x => drawClip(x, prev, t, prevOv));
  const B = layerOf('trB', x => drawClip(x, cur, t));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const img = (cv, x = 0, y = 0, w = W, hh = H) => ctx.drawImage(cv, x, y, w, hh);
  const clipThen = (path, under, over) => { img(under); ctx.save(); ctx.beginPath(); path(); ctx.clip(); img(over); ctx.restore(); };
  const ghost = (cv, dx, n = 6) => { for (let i = 0; i < n; i++) { ctx.globalAlpha = 0.22; img(cv, dx * (i / n)); } ctx.globalAlpha = 1; };
  switch (type) {
    case 'whip-left': case 'whip-right': {
      const dir = type === 'whip-left' ? -1 : 1;
      if (p < 0.5) { const d = dir * W * easeInOut(p * 2) * 0.9; ghost(A, d); }
      else { const d = -dir * W * (1 - easeInOut((p - 0.5) * 2)) * 0.9; ghost(B, d); }
      break;
    }
    case 'swipe-up': img(A, 0, -H * e); img(B, 0, H * (1 - e)); break;
    case 'glitch': {
      const src = p < 0.5 ? A : B; img(src);
      const n = Math.floor(t * 30), k = 1 - Math.abs(p - 0.5) * 2;
      for (let i = 0; i < 8; i++) { const sy = prand(n * 7 + i) * H, sh = (0.02 + prand(n + i) * 0.1) * H; ctx.drawImage(prand(i + n) > 0.5 ? A : B, 0, sy, W, sh, (prand(n * 3 + i) - .5) * W * 0.2 * k, sy, W, sh); }
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.4 * k; ctx.drawImage(src, 10 * k * R.scale * 3, 0); break;
    }
    case 'pixelate': {
      const src = p < 0.5 ? A : B, k = 1 - Math.abs(p - 0.5) * 2, px = Math.max(1, Math.round(k * Math.min(W, H) / 12));
      const tmp = FXTmp.get('trpix', Math.max(1, Math.ceil(W / px)), Math.max(1, Math.ceil(H / px)));
      tmp.ctx.drawImage(src, 0, 0, tmp.canvas.width, tmp.canvas.height);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(tmp.canvas, 0, 0, W, H); break;
    }
    case 'rotate': case 'zoom-spin': {
      const spin = type === 'zoom-spin';
      ctx.translate(W / 2, H / 2);
      if (p < 0.5) { const q = easeInOut(p * 2); ctx.rotate(q * Math.PI * (spin ? 1 : 0.5)); const z = spin ? 1 + q * 1.5 : 1 - q * 0.4; ctx.scale(z, z); ctx.globalAlpha = 1 - q * (spin ? 0.3 : 1); ctx.drawImage(A, -W / 2, -H / 2); }
      else { const q = easeInOut((p - 0.5) * 2); ctx.rotate(-(1 - q) * Math.PI * (spin ? 1 : 0.5)); const z = spin ? 2.5 - q * 1.5 : 0.6 + q * 0.4; ctx.scale(z, z); ctx.globalAlpha = spin ? 0.7 + q * 0.3 : q; ctx.drawImage(B, -W / 2, -H / 2); }
      break;
    }
    case 'cross-zoom': {
      const src = p < 0.5 ? A : B, q = p < 0.5 ? easeInOut(p * 2) : 1 - easeInOut((p - 0.5) * 2);
      for (let i = 0; i < 7; i++) { const z = 1 + q * 0.6 * (i / 6); ctx.globalAlpha = i ? 0.2 : 1; ctx.drawImage(src, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z); }
      ctx.globalAlpha = q * 0.5; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); break;
    }
    case 'squeeze': img(A, 0, 0, W * (1 - e), H); img(B, W * (1 - e), 0, W * e, H); break;
    case 'flip': {
      ctx.translate(W / 2, H / 2);
      if (p < 0.5) { ctx.scale(Math.max(0.01, Math.cos(e * Math.PI)), 1); ctx.drawImage(A, -W / 2, -H / 2); }
      else { ctx.scale(Math.max(0.01, -Math.cos(e * Math.PI)), 1); ctx.drawImage(B, -W / 2, -H / 2); }
      break;
    }
    case 'blinds': clipThen(() => { const n = 10, bh = H / n; for (let i = 0; i < n; i++) ctx.rect(0, i * bh, W, bh * e); }, A, B); break;
    case 'diamond': clipThen(() => { const r = (W + H) * 0.6 * e; ctx.moveTo(W / 2, H / 2 - r); ctx.lineTo(W / 2 + r, H / 2); ctx.lineTo(W / 2, H / 2 + r); ctx.lineTo(W / 2 - r, H / 2); ctx.closePath(); }, A, B); break;
    case 'heart': clipThen(() => heartShape(ctx, W / 2, H / 2, Math.max(W, H) * 2.6 * e), A, B); break;
    case 'clock': clipThen(() => { ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e); ctx.closePath(); }, A, B); break;
    case 'split-open': img(B); ctx.drawImage(A, 0, 0, W / 2, H, -W / 2 * e, 0, W / 2, H); ctx.drawImage(A, W / 2, 0, W / 2, H, W / 2 + W / 2 * e, 0, W / 2, H); break;
    case 'shutter': { const q = 1 - Math.abs(p - 0.5) * 2, bh = H / 2 * easeInOut(q); img(p < 0.5 ? A : B); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); break; }
    case 'tv-off': {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (p < 0.5) { const q = easeInOut(p * 2); const hh = Math.max(2, H * (1 - q)); ctx.filter = `brightness(${1 + q * 2})`; ctx.drawImage(A, 0, (H - hh) / 2, W, hh); }
      else { const q = easeInOut((p - 0.5) * 2); const hh = Math.max(2, H * q); ctx.filter = `brightness(${3 - q * 2})`; ctx.drawImage(B, 0, (H - hh) / 2, W, hh); }
      break;
    }
    case 'rgb-shift': { const k = 1 - Math.abs(p - 0.5) * 2; img(A); ctx.globalAlpha = e; img(B); ctx.globalAlpha = 0.5 * k; ctx.globalCompositeOperation = 'screen'; ctx.drawImage(B, 30 * k * R.scale * 3, 0); ctx.drawImage(A, -30 * k * R.scale * 3, 0); break; }
    default: ctx.restore(); return false;
  }
  ctx.restore();
  return true;
}

/* ---------------- extra filters ---------------- */
Object.assign(FILTERS, {
  clear: { name: 'Clear', f: 'contrast(1.08) saturate(1.1) brightness(1.03)' },
  food: { name: 'Food', f: 'saturate(1.45) contrast(1.08) brightness(1.06)', tint: 'rgba(255,170,60,.08)' },
  portrait: { name: 'Portrait', f: 'brightness(1.06) contrast(0.95) saturate(1.05)', tint: 'rgba(255,190,170,.1)' },
  glow: { name: 'Soft glow', f: 'brightness(1.12) contrast(0.9) saturate(1.1)' },
  forest: { name: 'Forest', f: 'saturate(1.2) hue-rotate(-12deg) contrast(1.05)', tint: 'rgba(30,140,60,.12)' },
  autumn: { name: 'Autumn', f: 'sepia(.3) saturate(1.5) hue-rotate(-10deg)', tint: 'rgba(220,90,20,.12)' },
  winter: { name: 'Winter', f: 'saturate(.75) brightness(1.08) contrast(1.05)', tint: 'rgba(120,180,255,.18)' },
  summer: { name: 'Summer', f: 'saturate(1.35) brightness(1.08)', tint: 'rgba(255,200,0,.1)' },
  lomo: { name: 'Lomo', f: 'contrast(1.35) saturate(1.4) brightness(.92)' },
  kodak: { name: 'Kodak', f: 'contrast(1.12) saturate(1.2) sepia(.15) brightness(1.04)', tint: 'rgba(255,170,90,.08)' },
  fuji: { name: 'Fuji', f: 'contrast(1.05) saturate(1.05) hue-rotate(-6deg)', tint: 'rgba(40,180,130,.08)' },
  polaroid: { name: 'Polaroid', f: 'contrast(.9) brightness(1.1) saturate(.85) sepia(.2)' },
  matte: { name: 'Matte', f: 'contrast(.78) brightness(1.1) saturate(.9)' },
  dusk: { name: 'Dusk', f: 'contrast(1.1) saturate(1.2) brightness(.92)', tint: 'rgba(130,60,170,.16)' },
  neon: { name: 'Neon night', f: 'contrast(1.3) saturate(1.8) brightness(.9)', tint: 'rgba(255,0,170,.12)' },
  mint: { name: 'Mint', f: 'saturate(.95) brightness(1.06)', tint: 'rgba(80,255,190,.12)' },
  peach: { name: 'Peach', f: 'brightness(1.06) saturate(1.1)', tint: 'rgba(255,150,120,.16)' },
  lavender: { name: 'Lavender', f: 'brightness(1.05) saturate(.95)', tint: 'rgba(180,140,255,.16)' },
  cine: { name: 'Cine', f: 'contrast(1.2) saturate(.9) brightness(.95)', tint: 'rgba(0,110,130,.14)' },
  bleach: { name: 'Bleach bypass', f: 'saturate(.45) contrast(1.4) brightness(1.02)' },
  sunset2: { name: 'Golden hour', f: 'saturate(1.3) contrast(1.05)', tint: 'rgba(255,120,30,.18)' },
  silver: { name: 'Silver', f: 'grayscale(.85) contrast(1.25) brightness(1.08)' },
  infrared: { name: 'Infrared', f: 'hue-rotate(180deg) saturate(1.6) invert(.1)' },
  dramatic_bw: { name: 'Dramatic B&W', f: 'grayscale(1) contrast(1.9) brightness(.85)' },
  cold_blue: { name: 'Deep blue', f: 'saturate(1.1) contrast(1.1) brightness(.95)', tint: 'rgba(0,60,200,.22)' },
  pastel: { name: 'Pastel', f: 'saturate(.7) brightness(1.15) contrast(.9)', tint: 'rgba(255,200,230,.1)' },
});

/* ---------------- voice effects ---------------- */
const VOICE_FX = {
  none: 'None', echo: 'Echo', reverb: 'Reverb (room)', hall: 'Big hall', robot: 'Robot', telephone: 'Telephone', radio: 'Old radio',
  megaphone: 'Megaphone', lofi: 'Lo-fi', underwater: 'Underwater', deep: 'Deep bass', bright: 'Bright', vinyl: 'Vinyl',
};
const _irCache = new Map();
function impulse(actx, seconds, decay) {
  const key = actx.sampleRate + ':' + seconds + ':' + decay;
  if (_irCache.has(key) && _irCache.get(key).ctx === actx) return _irCache.get(key).buf;
  const len = Math.floor(actx.sampleRate * seconds), buf = actx.createBuffer(2, len, actx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  _irCache.set(key, { ctx: actx, buf });
  return buf;
}
function distCurve(amount) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + amount) * x / (1 + amount * Math.abs(x)); } return c; }
/** returns {input, output, start(t)} */
function buildVoice(actx, type) {
  const input = actx.createGain(), output = actx.createGain();
  const filt = (t, f, q = 0.7, g = 0) => { const b = actx.createBiquadFilter(); b.type = t; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; };
  const chain = (...nodes) => { nodes.reduce((a, b) => (a.connect(b), b)); return nodes; };
  let start = () => { };
  switch (type) {
    case 'echo': { const d = actx.createDelay(2), fb = actx.createGain(), wet = actx.createGain(); d.delayTime.value = 0.28; fb.gain.value = 0.42; wet.gain.value = 0.6; input.connect(output); input.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(output); break; }
    case 'reverb': case 'hall': { const cv = actx.createConvolver(); cv.buffer = impulse(actx, type === 'hall' ? 3.5 : 1.4, type === 'hall' ? 2.2 : 3); const wet = actx.createGain(); wet.gain.value = type === 'hall' ? 0.8 : 0.55; input.connect(output); input.connect(cv); cv.connect(wet); wet.connect(output); break; }
    case 'robot': { const ring = actx.createGain(); ring.gain.value = 0; const osc = actx.createOscillator(); osc.frequency.value = 55; osc.type = 'square'; osc.connect(ring.gain); const d = actx.createDelay(); d.delayTime.value = 0.012; const fb = actx.createGain(); fb.gain.value = 0.5; input.connect(ring); ring.connect(d); d.connect(fb); fb.connect(d); d.connect(output); ring.connect(output); start = t => { try { osc.start(t); } catch { } }; break; }
    case 'telephone': chain(input, filt('highpass', 500), filt('lowpass', 3000), filt('peaking', 1500, 1, 8), output); break;
    case 'radio': { const sh = actx.createWaveShaper(); sh.curve = distCurve(4); chain(input, filt('highpass', 350), filt('lowpass', 4000), sh, output); output.gain.value = 0.8; break; }
    case 'megaphone': { const sh = actx.createWaveShaper(); sh.curve = distCurve(12); chain(input, filt('highpass', 800), filt('peaking', 2200, 2, 12), sh, filt('lowpass', 5000), output); output.gain.value = 0.7; break; }
    case 'lofi': { const sh = actx.createWaveShaper(); sh.curve = distCurve(2); chain(input, filt('lowpass', 3200), filt('highpass', 120), sh, output); break; }
    case 'underwater': chain(input, filt('lowpass', 450, 4), output); output.gain.value = 1.4; break;
    case 'deep': chain(input, filt('lowshelf', 180, 0.7, 10), filt('highshelf', 3500, 0.7, -8), output); break;
    case 'bright': chain(input, filt('highshelf', 3000, 0.7, 9), filt('lowshelf', 150, 0.7, -4), output); break;
    case 'vinyl': { const sh = actx.createWaveShaper(); sh.curve = distCurve(1.5); chain(input, filt('lowpass', 6000), filt('highpass', 90), filt('peaking', 900, 0.8, 4), sh, output); break; }
    default: input.connect(output);
  }
  return { input, output, start };
}
/** keep a playing element's audio routed through its voice effect */
function ensureVoice(e, c) {
  if (!e.src || !e.gain) return;
  const want = c.voice || 'none';
  if (e.voiceKey === want) return;
  try { e.src.disconnect(); } catch { }
  if (e.voice) { try { e.voice.output.disconnect(); } catch { } }
  if (want === 'none') { e.src.connect(e.gain); e.voice = null; }
  else { e.voice = buildVoice(AudioEngine.ctx, want); e.voice.start(0); e.src.connect(e.voice.input); e.voice.output.connect(e.gain); }
  e.voiceKey = want;
}

/* ---------------- inspector: effect clips ---------------- */
INSP_TABS.effect = [['effect', 'Effect']];
function inspEffect(b, c) {
  b.append(secTitle('Effect'));
  const groups = {};
  for (const [k, d] of Object.entries(FX)) (groups[d.cat] ??= {})[k] = `${d.icon} ${d.name}`;
  const sel = h('select', { style: { width: '100%' } });
  for (const cat of EFFECT_CATS) { const og = h('optgroup', { label: cat }); for (const [k, l] of Object.entries(groups[cat] || {})) og.append(h('option', { value: k, selected: c.fx === k }, l)); sel.append(og); }
  sel.onchange = () => { c.fx = sel.value; commit(); };
  b.append(h('div', { class: 'field wide' }, h('label', {}, 'Type'), sel));
  if (c.fxStrength == null) c.fxStrength = 1;
  b.append(slider(c, 'Strength', 'fxStrength', 0.1, 2, 0.05, { mul: 100, unit: '%', def: 1 }));
  b.append(slider(c, 'Duration', 'duration', 0.2, 600, 0.1, { unit: 's', onCommit: () => { rippleIfOverlap(c); commit(); } }));
  b.append(h('p', { class: 'hint', style: { color: 'var(--text-3)', fontSize: '12px', lineHeight: 1.5 } }, 'Effects apply to everything on the tracks below this one, for as long as the effect clip lasts. Drag its edges to change the timing.'));
}

/* ---------------- effects panel (adds effect clips like CapCut) ---------------- */
let fxCat = 'Basic';
function panelEffects(p) {
  p.append(h('h3', {}, 'Effects'));
  p.append(h('p', { class: 'hint' }, 'Click an effect to drop it on the timeline at the playhead. It affects every layer below it.'));
  const bar = h('div', { class: 'chips', style: { marginBottom: '10px' } });
  for (const cat of EFFECT_CATS) bar.append(h('span', { class: 'chip' + (fxCat === cat ? ' active' : ''), onclick: () => { fxCat = cat; renderLeftPanel(); } }, cat));
  p.append(bar);
  const g = h('div', { class: 'preset-grid' });
  const cur = selClip();
  for (const [k, d] of Object.entries(FX)) {
    if (d.cat !== fxCat) continue;
    g.append(h('div', { class: 'preset' + (cur?.type === 'effect' && cur.fx === k ? ' active' : ''), title: d.name + (cur?.type === 'effect' ? ' · Shift+click to replace the selected effect' : ''), onclick: e => {
      if (e.shiftKey && cur?.type === 'effect') { cur.fx = k; return commit(); }
      addEffect(k);
    } }, h('div', { class: 'pv', style: { fontSize: '26px' } }, d.icon), d.name));
  }
  p.append(g);
  p.append(h('h4', {}, 'Clip effects'));
  p.append(h('p', { class: 'hint' }, 'To put a quick effect on one clip only (shake, glitch, slow zoom…), select the clip and use Adjust → Effect on the right.'));
}
function addEffect(key) {
  const c = newClip('effect', S.time, 3, { fx: key, fxStrength: 1 });
  const tr = freeTrackFor(c);
  tr.clips.push(c); sortTrack(tr);
  S.selected = c.id;
  commit();
  toast(`${FX[key].name} added`, 'ok', 1500);
}
