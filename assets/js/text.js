/* ClipLab Studio — text engine v2: fonts, gradient / outline / 3D / glow, per-letter & loop animations, templates */
'use strict';

/* ---------------- load Google Fonts (one stylesheet per family so a bad one can't break the rest) ---------------- */
(function loadFonts() {
  for (const [name, , w] of FONT_INFO) {
    if (w === null) continue;
    const fam = name.replace(/ /g, '+') + (w ? `:wght@${w}` : '');
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
    document.head.append(l);
  }
})();
const fontReady = new Set();
function ensureFont(T) {
  const key = `${T.weight} ${T.font}`;
  if (fontReady.has(key) || !document.fonts) return;
  fontReady.add(key);
  document.fonts.load(`${T.italic ? 'italic ' : ''}${T.weight} 40px "${T.font}"`).then(() => { if (typeof renderLeftPanel === 'function' && S.leftTab === 'text') renderLeftPanel(); }).catch(() => { });
}

/* ---------------- extended text model ---------------- */
function textDefaults() {
  return {
    fill: { type: 'solid', color2: '#ff3cac', color3: '', angle: 90 },
    stroke2: { on: false, color: '#ffffff', width: 6 },
    extrude: { on: false, color: '#7a1f00', depth: 12, angle: 45 },
    glow: { on: false, color: '#00e5ff', size: 25 },
    textCase: 'none',
  };
}
function normText(T) {
  const d = textDefaults();
  for (const k of Object.keys(d)) {
    if (T[k] === undefined) T[k] = deep(d[k]);
    else if (typeof d[k] === 'object') T[k] = Object.assign(deep(d[k]), T[k]);
  }
  return T;
}
const _defaultTextBase = defaultText;
// eslint-disable-next-line no-global-assign
defaultText = function () { return normText(_defaultTextBase()); };

Object.assign(ANIMS_IN, {
  'chars-rise': 'Letters rise', 'chars-fade': 'Letters fade', 'chars-pop': 'Letters pop', 'chars-drop': 'Letters drop',
  'chars-wave': 'Letters wave', 'chars-spin': 'Letters spin', 'chars-blur': 'Letters blur', 'words-pop': 'Word by word', 'words-rise': 'Words rise',
  bounce: 'Bounce in', 'flip-in': 'Flip in', 'stretch': 'Stretch in', 'shake-in': 'Shake in', 'swing-in': 'Swing in',
});
Object.assign(ANIMS_OUT, {
  'chars-fade': 'Letters fade', 'chars-fall': 'Letters fall', 'chars-shrink': 'Letters shrink', 'words-fade': 'Words fade', 'flip-in': 'Flip out', stretch: 'Squash out',
});
const ANIMS_LOOP = {
  none: 'None', float: 'Float', sway: 'Sway', pulse: 'Pulse', heartbeat: 'Heartbeat', shake: 'Shake', bounce: 'Bounce', spin: 'Spin',
  flicker: 'Flicker', swing: 'Swing', jelly: 'Jelly', wave: 'Wave (letters)', rainbow: 'Rainbow (letters)', glitch: 'Glitch (letters)', 'blink': 'Blink',
};
const CHAR_IN = new Set(['chars-rise', 'chars-fade', 'chars-pop', 'chars-drop', 'chars-wave', 'chars-spin', 'chars-blur', 'words-pop', 'words-rise', 'typewriter']);
const CHAR_OUT = new Set(['chars-fade', 'chars-fall', 'chars-shrink', 'words-fade']);
const CHAR_LOOP = new Set(['wave', 'rainbow', 'glitch']);

/* whole-clip animations that animFx doesn't know (works for text, stickers, media) */
function extraAnimFx(type, p, isOut, o) {
  const e = easeOut(p);
  switch (type) {
    case 'bounce': { const b = p < 1 ? Math.abs(Math.sin(p * Math.PI * 2.5)) * (1 - p) : 0; o.dy -= b * P().height * 0.15; o.a *= clamp(p * 4, 0, 1); break; }
    case 'flip-in': o.sx = Math.max(0.001, Math.abs(Math.cos((1 - e) * Math.PI / 2))); o.a *= e; break;
    case 'stretch': o.sx = 0.2 + 0.8 * backOut(clamp(p, 0, 1)); o.sy = 1.6 - 0.6 * e; o.a *= clamp(p * 3, 0, 1); break;
    case 'shake-in': o.dx += Math.sin(p * 40) * (1 - p) * 40; o.a *= clamp(p * 3, 0, 1); break;
    case 'swing-in': o.r += Math.sin(p * 12) * (1 - p) * 0.6; o.a *= clamp(p * 3, 0, 1); break;
  }
}
function applyLoopAnim(c, local, t, o) {
  const A = c.anim || {};
  if (A.in && !CHAR_IN.has(A.in) && local < A.inDur) extraAnimFx(A.in, local / A.inDur, false, o);
  if (A.out && !CHAR_OUT.has(A.out) && local > c.duration - A.outDur) extraAnimFx(A.out, (c.duration - local) / A.outDur, true, o);
  const L = A.loop; if (!L || L === 'none') return;
  const sp = A.loopSpeed || 1, k = A.loopAmount ?? 1, x = local * sp;
  switch (L) {
    case 'float': o.dy += Math.sin(x * Math.PI) * 18 * k; break;
    case 'sway': o.r += Math.sin(x * Math.PI) * 0.08 * k; break;
    case 'pulse': o.s *= 1 + Math.sin(x * Math.PI * 2) * 0.06 * k; break;
    case 'heartbeat': { const ph = (x % 1); o.s *= 1 + (ph < 0.15 ? Math.sin(ph / 0.15 * Math.PI) * 0.12 : ph > 0.25 && ph < 0.4 ? Math.sin((ph - 0.25) / 0.15 * Math.PI) * 0.08 : 0) * k; break; }
    case 'shake': o.dx += Math.sin(t * 60) * 6 * k; o.dy += Math.cos(t * 47) * 5 * k; break;
    case 'bounce': o.dy -= Math.abs(Math.sin(x * Math.PI * 1.5)) * 30 * k; break;
    case 'spin': o.r += x * Math.PI * 0.8; break;
    case 'flicker': o.a *= prand(Math.floor(t * 12)) > 0.15 * k ? 1 : 0.25; break;
    case 'blink': o.a *= Math.floor(x * 2) % 2 ? 0.15 : 1; break;
    case 'swing': o.r += Math.sin(x * Math.PI * 1.4) * 0.25 * k; break;
    case 'jelly': o.sx = 1 + Math.sin(x * Math.PI * 3) * 0.08 * k; o.sy = 1 - Math.sin(x * Math.PI * 3) * 0.08 * k; break;
  }
}

function applyCase(s, mode) {
  if (mode === 'upper') return s.toUpperCase();
  if (mode === 'lower') return s.toLowerCase();
  if (mode === 'title') return s.replace(/\b\w/g, m => m.toUpperCase());
  return s;
}

/* override: layout respects text case */
function textLayout(T, chars = 1) {
  measureCtx.font = textFont(T);
  if ('letterSpacing' in measureCtx) measureCtx.letterSpacing = (T.spacing || 0) + 'px';
  const full = applyCase(T.content || '', T.textCase).split('\n');
  const widths = full.map(l => measureCtx.measureText(l || ' ').width);
  const lh = T.size * (T.lineHeight || 1.2);
  return { lines: full, widths, lh, w: Math.max(10, ...widths), h: lh * full.length };
}

function textGradient(ctx, T, w, hh) {
  const a = ((T.fill.angle ?? 90) - 90) * Math.PI / 180;
  const dx = Math.cos(a) * w / 2, dy = Math.sin(a) * hh / 2;
  const g = ctx.createLinearGradient(-dx, -dy, dx, dy);
  g.addColorStop(0, T.color);
  if (T.fill.color3) g.addColorStop(0.5, T.fill.color3);
  g.addColorStop(1, T.fill.color2 || T.color);
  return g;
}

/** draw one run of text with every decoration layer */
function drawGlyphs(ctx, T, str, x, y, fill) {
  if (!str) return;
  const S_ = R.scale;
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  const sw = T.stroke?.on ? T.stroke.width : 0;
  // 3D extrusion
  if (T.extrude?.on && T.extrude.depth > 0) {
    const ang = (T.extrude.angle ?? 45) * Math.PI / 180;
    const steps = Math.min(60, Math.ceil(T.extrude.depth));
    ctx.save();
    ctx.fillStyle = T.extrude.color; ctx.strokeStyle = T.extrude.color;
    ctx.lineWidth = (sw + (T.stroke2?.on ? T.stroke2.width : 0)) * 2;
    for (let i = steps; i >= 1; i--) {
      const ox = Math.cos(ang) * i * (T.extrude.depth / steps), oy = Math.sin(ang) * i * (T.extrude.depth / steps);
      if (ctx.lineWidth > 0) ctx.strokeText(str, x + ox, y + oy);
      ctx.fillText(str, x + ox, y + oy);
    }
    ctx.restore();
  }
  // glow
  if (T.glow?.on) {
    ctx.save();
    ctx.shadowColor = T.glow.color; ctx.shadowBlur = T.glow.size * S_;
    ctx.fillStyle = T.glow.color;
    ctx.fillText(str, x, y); ctx.fillText(str, x, y);
    ctx.restore();
  }
  // drop shadow (on the outermost layer)
  const shadow = () => {
    if (T.shadow?.on) {
      ctx.shadowColor = T.shadow.color; ctx.shadowBlur = (T.shadow.blur || 0) * S_;
      ctx.shadowOffsetX = (T.shadow.x || 0) * S_; ctx.shadowOffsetY = (T.shadow.y || 0) * S_;
    }
  };
  const noShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };
  shadow();
  if (T.stroke2?.on && T.stroke2.width > 0) {
    ctx.strokeStyle = T.stroke2.color; ctx.lineWidth = (sw + T.stroke2.width) * 2;
    ctx.strokeText(str, x, y); noShadow();
  }
  if (sw > 0) { ctx.strokeStyle = T.stroke.color; ctx.lineWidth = sw * 2; ctx.strokeText(str, x, y); noShadow(); }
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
  noShadow();
}

/* override: full text renderer */
function drawText(ctx, c, fx) {
  const T = normText(c.text);
  ensureFont(T);
  const local = R.curLocal ?? 0, t = R.curT ?? 0;
  const L = textLayout(T);
  ctx.font = textFont(T);
  if ('letterSpacing' in ctx) ctx.letterSpacing = (T.spacing || 0) + 'px';
  ctx.textBaseline = 'middle';
  ctx.filter = filterString(c, fx.blur, fx.extraFilter);
  const top = -L.h / 2 + L.lh / 2;
  if (T.bg?.on) {
    const pad = T.bg.pad || 0;
    ctx.save();
    ctx.globalAlpha *= T.bg.opacity ?? 1;
    ctx.fillStyle = T.bg.color;
    ctx.beginPath();
    if (T.bg.perLine) L.lines.forEach((ln, i) => { const w = L.widths[i]; const lx = T.align === 'left' ? -L.w / 2 : T.align === 'right' ? L.w / 2 - w : -w / 2; roundRectPath(ctx, lx - pad, top + i * L.lh - L.lh / 2 - pad * 0.4, w + pad * 2, L.lh + pad * 0.8, T.bg.radius || 0); });
    else roundRectPath(ctx, -L.w / 2 - pad, -L.h / 2 - pad, L.w + pad * 2, L.h + pad * 2, T.bg.radius || 0);
    ctx.fill();
    ctx.restore();
  }
  const fill = T.fill?.type === 'gradient' ? textGradient(ctx, T, L.w, L.h) : T.color;
  const A = c.anim || {};
  const inP = A.in && A.in !== 'none' && A.inDur > 0 ? clamp(local / A.inDur, 0, 1) : 1;
  const outP = A.out && A.out !== 'none' && A.outDur > 0 ? clamp((c.duration - local) / A.outDur, 0, 1) : 1;
  const perChar = CHAR_IN.has(A.in) && inP < 1 || CHAR_OUT.has(A.out) && outP < 1 || CHAR_LOOP.has(A.loop);
  const lineX = i => T.align === 'left' ? -L.w / 2 : T.align === 'right' ? L.w / 2 - L.widths[i] : -L.widths[i] / 2;
  ctx.textAlign = 'left';

  if (!perChar) {
    L.lines.forEach((line, i) => {
      const y = top + i * L.lh;
      drawGlyphs(ctx, T, line, lineX(i), y, fill);
      if (T.underline && line) { ctx.fillStyle = fill; ctx.fillRect(lineX(i), y + T.size * 0.42, L.widths[i], Math.max(2, T.size * 0.06)); }
    });
    return;
  }

  // per-letter rendering
  const chars = [];
  let wordIdx = 0;
  L.lines.forEach((line, li) => {
    const arr = [...line];
    let prefix = '';
    arr.forEach((ch, j) => {
      const x = lineX(li) + ctx.measureText(prefix).width;
      prefix += ch;
      if (ch === ' ') wordIdx++;
      chars.push({ ch, x, y: top + li * L.lh, w: ctx.measureText(ch).width, word: wordIdx });
    });
    wordIdx++;
  });
  const N = Math.max(1, chars.length), W = Math.max(1, wordIdx);
  const stag = (i, n, p) => clamp((p - (i / n) * 0.65) / 0.35, 0, 1);
  chars.forEach((g, i) => {
    if (g.ch === ' ') return;
    let a = 1, dx = 0, dy = 0, s = 1, r = 0, color = null, blur = 0;
    if (inP < 1 && CHAR_IN.has(A.in)) {
      const pc = A.in.startsWith('words') ? stag(g.word, W, inP) : stag(i, N, inP), e = easeOut(pc);
      switch (A.in) {
        case 'typewriter': if (i >= Math.floor(inP * N)) a = 0; break;
        case 'chars-rise': case 'words-rise': dy = (1 - e) * T.size * 0.8; a = e; break;
        case 'chars-fade': a = e; break;
        case 'chars-pop': case 'words-pop': s = pc <= 0 ? 0 : backOut(pc); a = clamp(pc * 3, 0, 1); break;
        case 'chars-drop': dy = -(1 - e) * T.size * 1.2; a = e; break;
        case 'chars-wave': dy = Math.sin(pc * Math.PI) * -T.size * 0.5; a = clamp(pc * 2, 0, 1); break;
        case 'chars-spin': r = (1 - e) * Math.PI * 2; s = e; a = e; break;
        case 'chars-blur': blur = (1 - e) * 20; a = e; break;
      }
    }
    if (outP < 1 && CHAR_OUT.has(A.out)) {
      const pc = A.out.startsWith('words') ? stag(W - 1 - g.word, W, outP) : stag(N - 1 - i, N, outP), e = easeOut(pc);
      switch (A.out) {
        case 'chars-fade': case 'words-fade': a *= e; break;
        case 'chars-fall': dy += (1 - e) * T.size * 1.2; a *= e; r += (1 - e) * 0.6; break;
        case 'chars-shrink': s *= e; a *= e; break;
      }
    }
    const sp = A.loopSpeed || 1;
    if (A.loop === 'wave') dy += Math.sin(local * sp * 5 - i * 0.45) * T.size * 0.12;
    if (A.loop === 'rainbow') color = `hsl(${(i * 28 + local * sp * 160) % 360}, 95%, 60%)`;
    if (A.loop === 'glitch') { const n = Math.floor(t * 14); if (prand(n * 31 + i) > 0.85) { dx += (prand(n + i) - 0.5) * T.size * 0.3; color = prand(n * 7 + i) > 0.5 ? '#ff2a6d' : '#05d9e8'; } }
    if (a <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= a;
    if (blur > 0.1) ctx.filter = `blur(${(blur * R.scale).toFixed(1)}px)`;
    const cx = g.x + g.w / 2;
    ctx.translate(cx + dx, g.y + dy);
    if (r) ctx.rotate(r);
    if (s !== 1) ctx.scale(Math.max(0.001, s), Math.max(0.001, s));
    drawGlyphs(ctx, T, g.ch, -g.w / 2, 0, color || fill);
    ctx.restore();
  });
}

/* ---------------- 40+ text templates ---------------- */
(function moreTemplates() {
  const P_ = (name, t, extra = {}) => TEXT_PRESETS.push(Object.assign({ name, t }, extra));
  const sh = (c = 'rgba(0,0,0,0.55)', b = 12, x = 0, y = 5) => ({ on: true, color: c, blur: b, x, y });
  const off = { on: false };
  P_('Gradient pop', { font: 'Montserrat', weight: 900, size: 120, color: '#ff3cac', fill: { type: 'gradient', color2: '#2b86c5', color3: '#784ba0', angle: 90 }, shadow: sh() }, { anim: { in: 'chars-pop', inDur: 0.8 } });
  P_('Sunset', { font: 'Poppins', weight: 900, size: 120, color: '#ffd200', fill: { type: 'gradient', color2: '#f7971e', color3: '#ff512f', angle: 180 }, stroke: { on: true, color: '#3a0a00', width: 6 }, shadow: sh() });
  P_('Ocean', { font: 'Rubik', weight: 900, size: 116, color: '#00f2fe', fill: { type: 'gradient', color2: '#4facfe', angle: 180 }, stroke2: { on: true, color: '#ffffff', width: 6 }, shadow: off });
  P_('3D Retro', { font: 'Bungee', weight: 400, size: 110, color: '#ffe66d', extrude: { on: true, color: '#ff6b6b', depth: 14, angle: 45 }, stroke: { on: true, color: '#2d1b3d', width: 4 }, shadow: off });
  P_('3D Block', { font: 'Archivo Black', weight: 400, size: 120, color: '#ffffff', extrude: { on: true, color: '#1e3a8a', depth: 18, angle: 60 }, shadow: off });
  P_('3D Gold', { font: 'Cinzel', weight: 900, size: 110, color: '#fff3b0', fill: { type: 'gradient', color2: '#b8860b', color3: '#ffd700', angle: 180 }, extrude: { on: true, color: '#5c3d00', depth: 10, angle: 90 }, shadow: sh() });
  P_('Neon pink', { font: 'Monoton', weight: 400, size: 110, color: '#ffe3f6', glow: { on: true, color: '#ff2fb1', size: 35 }, shadow: off }, { anim: { loop: 'flicker' } });
  P_('Neon blue', { font: 'Audiowide', weight: 400, size: 100, color: '#e0fbff', glow: { on: true, color: '#00b3ff', size: 35 }, stroke: { on: true, color: '#00b3ff', width: 2 }, shadow: off });
  P_('Neon green', { font: 'Orbitron', weight: 900, size: 96, color: '#eaffea', glow: { on: true, color: '#39ff14', size: 30 }, shadow: off });
  P_('Double outline', { font: 'Luckiest Guy', weight: 400, size: 120, color: '#ffffff', stroke: { on: true, color: '#ff006e', width: 6 }, stroke2: { on: true, color: '#ffffff', width: 6 }, shadow: sh('rgba(0,0,0,0.5)', 0, 6, 8) });
  P_('Comic', { font: 'Bangers', weight: 400, size: 130, spacing: 3, color: '#ffde00', stroke: { on: true, color: '#000000', width: 8 }, extrude: { on: true, color: '#000000', depth: 8, angle: 45 }, shadow: off }, { anim: { in: 'pop', inDur: 0.5 } });
  P_('Cartoon', { font: 'Titan One', weight: 400, size: 116, color: '#7cf7ff', stroke: { on: true, color: '#1b1b3a', width: 8 }, stroke2: { on: true, color: '#ffffff', width: 6 }, shadow: off }, { anim: { loop: 'jelly' } });
  P_('Bubble', { font: 'Chewy', weight: 400, size: 120, color: '#ff9ed2', stroke: { on: true, color: '#ffffff', width: 10 }, shadow: sh('rgba(160,0,90,0.45)', 0, 0, 8) }, { anim: { in: 'bounce', inDur: 0.8 } });
  P_('Outline only', { font: 'Bebas Neue', weight: 400, size: 150, spacing: 6, color: 'rgba(0,0,0,0)', stroke: { on: true, color: '#ffffff', width: 3 }, shadow: off });
  P_('Subtitle box', { font: 'Inter', weight: 700, size: 56, color: '#ffffff', bg: { on: true, color: '#000000', opacity: 0.65, pad: 16, radius: 10 }, shadow: off }, { y: 0.34 });
  P_('TikTok caption', { font: 'Montserrat', weight: 900, size: 72, color: '#ffffff', stroke: { on: true, color: '#000000', width: 9 }, shadow: off }, { y: 0.2, anim: { in: 'words-pop', inDur: 0.6 } });
  P_('Highlight words', { font: 'Poppins', weight: 900, size: 70, color: '#111111', bg: { on: true, color: '#ffe500', opacity: 1, pad: 14, radius: 6, perLine: true }, shadow: off }, { anim: { in: 'words-rise', inDur: 0.7 } });
  P_('Hype', { font: 'Anton', weight: 400, size: 150, color: '#ffffff', fill: { type: 'gradient', color2: '#ffcc00', angle: 180 }, stroke: { on: true, color: '#e60023', width: 8 }, shadow: sh('rgba(0,0,0,0.6)', 0, 8, 10) }, { anim: { in: 'stretch', inDur: 0.5, loop: 'shake', loopAmount: 0.5 } });
  P_('Horror', { font: 'Creepster', weight: 400, size: 130, color: '#b30000', glow: { on: true, color: '#ff0000', size: 20 }, shadow: off }, { anim: { loop: 'flicker' } });
  P_('Retro game', { font: 'Press Start 2P', weight: 400, size: 64, color: '#fef08a', extrude: { on: true, color: '#c2410c', depth: 6, angle: 45 }, shadow: off }, { anim: { in: 'typewriter', inDur: 1.2 } });
  P_('Terminal', { font: 'VT323', weight: 400, size: 96, color: '#33ff66', glow: { on: true, color: '#00ff55', size: 15 }, shadow: off }, { anim: { in: 'typewriter', inDur: 1.5 } });
  P_('Typewriter', { font: 'Special Elite', weight: 400, size: 80, color: '#f5f0e1', shadow: sh('rgba(0,0,0,0.6)', 6, 2, 3) }, { anim: { in: 'typewriter', inDur: 1.5 } });
  P_('Handwritten', { font: 'Caveat', weight: 700, size: 120, color: '#ffffff', shadow: sh('rgba(0,0,0,0.5)', 10, 0, 3) }, { anim: { in: 'chars-fade', inDur: 1 } });
  P_('Signature', { font: 'Great Vibes', weight: 400, size: 140, color: '#fff7e6', shadow: sh('rgba(0,0,0,0.45)', 14, 0, 4) }, { anim: { in: 'chars-fade', inDur: 1.4 } });
  P_('Wedding', { font: 'Parisienne', weight: 400, size: 120, color: '#f8e1b5', fill: { type: 'gradient', color2: '#d4a373', angle: 90 }, shadow: sh('rgba(0,0,0,0.35)', 10, 0, 3) });
  P_('Luxury', { font: 'Cinzel', weight: 700, size: 90, spacing: 18, color: '#e9d8a6', fill: { type: 'gradient', color2: '#b08d57', color3: '#fff7d6', angle: 90 }, shadow: sh() }, { anim: { in: 'chars-blur', inDur: 1.2 } });
  P_('Minimal', { font: 'Raleway', weight: 400, size: 80, spacing: 22, color: '#ffffff', textCase: 'upper', shadow: off }, { anim: { in: 'chars-fade', inDur: 1 } });
  P_('Headline', { font: 'Oswald', weight: 700, size: 120, color: '#ffffff', textCase: 'upper', shadow: sh() }, { anim: { in: 'chars-rise', inDur: 0.7 } });
  P_('Breaking news', { font: 'Roboto', weight: 900, size: 58, color: '#ffffff', textCase: 'upper', bg: { on: true, color: '#d90429', opacity: 1, pad: 16, radius: 2 }, shadow: off, align: 'left' }, { x: -0.22, y: 0.36, anim: { in: 'slide-left', inDur: 0.5 } });
  P_('Subscribe', { font: 'Poppins', weight: 800, size: 64, color: '#ffffff', bg: { on: true, color: '#ff0000', opacity: 1, pad: 20, radius: 14 }, shadow: sh('rgba(0,0,0,0.4)', 12, 0, 6) }, { y: 0.32, anim: { in: 'pop', inDur: 0.5, loop: 'pulse' } });
  P_('Wave', { font: 'Fredoka', weight: 700, size: 110, color: '#ffffff', stroke: { on: true, color: '#5b21b6', width: 7 }, shadow: off }, { anim: { loop: 'wave' } });
  P_('Rainbow', { font: 'Baloo 2', weight: 800, size: 110, color: '#ffffff', stroke: { on: true, color: '#ffffff', width: 4 }, shadow: sh('rgba(0,0,0,0.4)', 8, 0, 4) }, { anim: { loop: 'rainbow' } });
  P_('Glitch', { font: 'Rubik Mono One', weight: 400, size: 90, color: '#ffffff', shadow: sh('#ff2a6d', 0, -4, 0) }, { anim: { loop: 'glitch' } });
  P_('Cyberpunk', { font: 'Orbitron', weight: 900, size: 96, color: '#fcee0a', stroke2: { on: true, color: '#00f0ff', width: 4 }, shadow: sh('#ff003c', 0, 6, 6) }, { anim: { in: 'chars-spin', inDur: 0.8 } });
  P_('Sticker', { font: 'Lilita One', weight: 400, size: 110, color: '#ff5d8f', stroke: { on: true, color: '#ffffff', width: 12 }, shadow: sh('rgba(0,0,0,0.35)', 6, 0, 8) }, { anim: { in: 'pop', inDur: 0.4, loop: 'sway' } });
  P_('Chalk', { font: 'Rock Salt', weight: 400, size: 80, color: '#f1f5f9', shadow: sh('rgba(255,255,255,0.3)', 8, 0, 0) });
  P_('Marker note', { font: 'Permanent Marker', weight: 400, size: 96, color: '#111111', bg: { on: true, color: '#fef3c7', opacity: 1, pad: 26, radius: 4 }, shadow: sh('rgba(0,0,0,0.35)', 16, 4, 8) }, { anim: { in: 'swing-in', inDur: 0.8 } });
  P_('Vlog title', { font: 'Pacifico', weight: 400, size: 120, color: '#ffffff', stroke2: { on: true, color: '#ff7aa2', width: 8 }, shadow: off }, { anim: { in: 'chars-drop', inDur: 1, loop: 'float' } });
  P_('Gaming', { font: 'Black Ops One', weight: 400, size: 110, color: '#ffffff', fill: { type: 'gradient', color2: '#9ca3af', angle: 180 }, extrude: { on: true, color: '#111827', depth: 8, angle: 90 }, stroke2: { on: true, color: '#22d3ee', width: 3 }, shadow: off }, { anim: { in: 'shake-in', inDur: 0.6 } });
  P_('Quote', { font: 'Playfair Display', weight: 700, italic: true, size: 80, color: '#ffffff', shadow: sh('rgba(0,0,0,0.6)', 14, 0, 4) }, { anim: { in: 'words-rise', inDur: 1.4 } });
  P_('Sale', { font: 'Alfa Slab One', weight: 400, size: 140, color: '#ffffff', fill: { type: 'gradient', color2: '#ffde59', angle: 180 }, extrude: { on: true, color: '#b91c1c', depth: 12, angle: 45 }, shadow: off }, { anim: { in: 'pop', inDur: 0.4, loop: 'heartbeat' } });
  P_('Countdown', { font: 'Bebas Neue', weight: 400, size: 300, color: '#ffffff', glow: { on: true, color: '#ffffff', size: 30 }, shadow: off, content: '3' }, { anim: { in: 'zoom-out', inDur: 0.4, out: 'fade', outDur: 0.3 } });
  P_('Sinhala bold', { font: 'Gemunu Libre', weight: 800, size: 110, color: '#ffffff', content: 'සුබ උපන්දිනයක්', stroke: { on: true, color: '#7c2d12', width: 8 }, fill: { type: 'gradient', color2: '#fde047', angle: 180 }, shadow: off });
  P_('Sinhala elegant', { font: 'Noto Serif Sinhala', weight: 700, size: 90, color: '#fff7e6', content: 'ආයුබෝවන්', shadow: sh('rgba(0,0,0,0.5)', 12, 0, 4) }, { anim: { in: 'chars-fade', inDur: 1.2 } });
  P_('Sinhala poster', { font: 'Stick No Bills', weight: 800, size: 120, color: '#ffffff', content: 'අලුත් වීඩියෝව', bg: { on: true, color: '#e11d48', opacity: 1, pad: 18, radius: 8 }, shadow: off });
})();

/* ---------------- text panel with live-rendered previews ---------------- */
const textPreviewCache = new Map();
function presetPreview(pr) {
  const key = pr.name + '|' + [...fontReady].length;
  if (textPreviewCache.has(key)) return textPreviewCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 220; cv.height = 130;
  const x = cv.getContext('2d');
  x.fillStyle = '#2a2d33'; x.fillRect(0, 0, cv.width, cv.height);
  const c = newClip('text', 0, 3, { text: Object.assign(defaultText(), deep(pr.t)) });
  normText(c.text);
  ensureFont(c.text);
  if (!pr.t.content) c.text.content = c.text.font.includes('Sinhala') ? 'අකුරු' : 'Aa Text';
  const L = textLayout(c.text);
  const pad = c.text.bg?.on ? c.text.bg.pad * 2 : 0;
  const extra = (c.text.extrude?.on ? c.text.extrude.depth : 0) + (c.text.glow?.on ? c.text.glow.size : 0) + 20;
  const sc = Math.min((cv.width - 16) / (L.w + pad + extra), (cv.height - 16) / (L.h + pad + extra));
  const oldScale = R.scale;
  R.scale = sc; R.curLocal = 99; R.curT = 0;
  x.save();
  x.translate(cv.width / 2, cv.height / 2);
  x.scale(sc, sc);
  const saveAnim = c.anim; c.anim = { in: 'none', out: 'none', loop: 'none' };
  drawText(x, c, { blur: 0, extraFilter: '', chars: 1 });
  c.anim = saveAnim;
  x.restore();
  R.scale = oldScale;
  textPreviewCache.set(key, cv);
  return cv;
}
function panelText(p) {
  p.append(h('h3', {}, 'Text'));
  p.append(h('button', { class: 'btn primary block', onclick: () => addText(), style: { marginBottom: '12px' } }, iconEl('plus'), 'Add text'));
  const sel = selClip();
  if (sel?.type === 'text') p.append(h('p', { class: 'hint' }, 'A text clip is selected — Shift+click a template to restyle it.'));
  p.append(h('h4', {}, `Templates (${TEXT_PRESETS.length})`));
  const grid = h('div', { class: 'preset-grid' });
  for (const pr of TEXT_PRESETS) {
    const card = h('div', { class: 'preset text-preset', title: pr.name + ' — click to add · Shift+click to restyle selected text', onclick: e => (e.shiftKey && selClip()?.type === 'text') ? applyTextPreset(selClip(), pr) : addText(pr) },
      h('div', { class: 'pv' }, presetPreview(pr)), pr.name);
    grid.append(card);
  }
  p.append(grid);
}
function applyTextPreset(c, pr) {
  const keep = c.text.content;
  c.text = normText(Object.assign(defaultText(), deep(pr.t)));
  if (!pr.t.content) c.text.content = keep;
  if (pr.anim) c.anim = Object.assign(c.anim, { in: 'none', out: 'none', loop: 'none' }, deep(pr.anim));
  commit();
}
function addText(preset = null) {
  const c = newClip('text', S.time, 3, { text: defaultText() });
  if (preset) {
    Object.assign(c.text, deep(preset.t));
    normText(c.text);
    if (preset.y) c.transform.y = P().height * preset.y;
    if (preset.x) c.transform.x = P().width * preset.x;
    if (preset.anim) Object.assign(c.anim, deep(preset.anim));
  }
  ensureFont(c.text);
  freeTrackFor(c).clips.push(c);
  S.selected = c.id;
  S.inspTab = 'text';
  commit();
  setTimeout(() => { const ta = $('#inspector textarea'); ta && (ta.focus(), ta.select()); }, 30);
}

/* ---------------- font picker ---------------- */
function fontPicker(c, onPick) {
  const T = c.text;
  const wrap = h('div', { class: 'font-picker' });
  const btn = h('button', { class: 'fp-btn', style: { fontFamily: `"${T.font}"` } }, T.font, h('span', { class: 'muted' }, '▾'));
  const pop = h('div', { class: 'fp-pop hidden' });
  const search = h('input', { class: 'inp', placeholder: 'Search fonts…', style: { width: '100%' } });
  const cats = ['All', 'Sans', 'Display', 'Serif', 'Script', 'Hand', 'Tech', 'Sinhala', 'System'];
  let cat = 'All';
  const catBar = h('div', { class: 'chips', style: { margin: '8px 0' } });
  const list = h('div', { class: 'fp-list' });
  const draw = () => {
    catBar.innerHTML = '';
    for (const k of cats) catBar.append(h('span', { class: 'chip' + (cat === k ? ' active' : ''), onclick: () => { cat = k; draw(); } }, k));
    list.innerHTML = '';
    const q = search.value.trim().toLowerCase();
    for (const [name, cg] of FONT_INFO) {
      if (cat !== 'All' && cg !== cat) continue;
      if (q && !name.toLowerCase().includes(q)) continue;
      const sample = cg === 'Sinhala' ? 'සිංහල අකුරු' : name;
      list.append(h('button', { class: 'fp-item' + (name === T.font ? ' active' : ''), style: { fontFamily: `"${name}"` }, onclick: () => { pop.classList.add('hidden'); onPick(name); } },
        h('span', {}, sample), h('small', {}, cg === 'Sinhala' ? name : cg)));
    }
  };
  search.oninput = draw;
  btn.onclick = e => { e.stopPropagation(); pop.classList.toggle('hidden'); if (!pop.classList.contains('hidden')) { draw(); search.focus(); } };
  pop.addEventListener('pointerdown', e => e.stopPropagation());
  document.addEventListener('pointerdown', () => pop.classList.add('hidden'));
  pop.append(search, catBar, list);
  wrap.append(btn, pop);
  return wrap;
}

/* ---------------- inspector overrides ---------------- */
function inspText(b, c) {
  const T = normText(c.text);
  const ta = h('textarea', { class: 'inp', rows: 3, spellcheck: 'false' });
  ta.value = T.content;
  ta.oninput = () => { T.content = ta.value; };
  ta.onchange = () => commit({ keepInspector: true });
  b.append(secTitle('Content'), ta);
  b.append(secTitle('Font'));
  b.append(h('div', { class: 'field wide' }, h('label', {}, 'Family'), fontPicker(c, name => { T.font = name; ensureFont(T); document.fonts?.load(`${T.weight} 40px "${name}"`).finally(() => commit()); })));
  b.append(selectField(c, 'Weight', 'text.weight', { 300: 'Light', 400: 'Regular', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' }, v => { T.weight = +v; }));
  b.append(slider(c, 'Size', 'text.size', 8, 600, 1, { unit: 'px' }));
  b.append(selectField(c, 'Case', 'text.textCase', { none: 'As typed', upper: 'UPPERCASE', lower: 'lowercase', title: 'Title Case' }));
  const align = h('div', { class: 'seg' });
  for (const [k, l] of [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]) align.append(h('button', { class: T.align === k ? 'active' : '', onclick: () => { T.align = k; commit(); } }, l));
  const style = h('div', { class: 'seg' },
    h('button', { class: T.italic ? 'active' : '', style: { fontStyle: 'italic' }, onclick: () => { T.italic = !T.italic; commit(); } }, 'I'),
    h('button', { class: T.underline ? 'active' : '', style: { textDecoration: 'underline' }, onclick: () => { T.underline = !T.underline; commit(); } }, 'U'));
  b.append(h('div', { class: 'row', style: { margin: '4px 0 12px' } }, align, style));
  b.append(slider(c, 'Spacing', 'text.spacing', -10, 80, 0.5, { def: 0 }));
  b.append(slider(c, 'Line height', 'text.lineHeight', 0.6, 3, 0.05, { def: 1.2 }));
  b.append(secTitle('Fill'));
  const seg = h('div', { class: 'seg', style: { marginBottom: '10px' } });
  for (const [k, l] of [['solid', 'Solid'], ['gradient', 'Gradient']]) seg.append(h('button', { class: T.fill.type === k ? 'active' : '', onclick: () => { T.fill.type = k; commit(); } }, l));
  b.append(seg);
  b.append(colorField(c, T.fill.type === 'gradient' ? 'Colour 1' : 'Colour', 'text.color'));
  if (T.fill.type === 'gradient') {
    b.append(colorField(c, 'Colour 2', 'text.fill.color2'));
    b.append(slider(c, 'Angle', 'text.fill.angle', 0, 360, 1, { unit: '°' }));
  }
  const sw = h('div', { class: 'chips', style: { marginTop: '6px' } });
  for (const col of ['#ffffff', '#000000', '#ffe500', '#ff3b30', '#ff2fb1', '#7c3aed', '#2563eb', '#00e5ff', '#22c55e', '#f97316']) sw.append(h('span', { class: 'chip', style: { width: '22px', height: '22px', padding: 0, background: col }, title: col, onclick: () => { T.color = col; commit(); } }));
  b.append(sw);
  b.append(secTitle('Templates'));
  b.append(h('p', { class: 'hint', style: { color: 'var(--text-3)', fontSize: '12px' } }, 'Open the Text tab on the left and Shift+click a template to restyle this text.'));
}

function inspStyle(b, c) {
  const T = normText(c.text);
  b.append(secTitle('Outline'));
  b.append(toggleField(c, 'Stroke', 'text.stroke.on'));
  if (T.stroke.on) { b.append(colorField(c, 'Colour', 'text.stroke.color')); b.append(slider(c, 'Width', 'text.stroke.width', 0, 40, 0.5)); }
  b.append(toggleField(c, 'Second outline', 'text.stroke2.on'));
  if (T.stroke2.on) { b.append(colorField(c, 'Colour', 'text.stroke2.color')); b.append(slider(c, 'Width', 'text.stroke2.width', 0, 40, 0.5)); }
  b.append(secTitle('Glow'));
  b.append(toggleField(c, 'Neon glow', 'text.glow.on'));
  if (T.glow.on) { b.append(colorField(c, 'Colour', 'text.glow.color')); b.append(slider(c, 'Size', 'text.glow.size', 2, 100, 1)); }
  b.append(secTitle('3D'));
  b.append(toggleField(c, '3D extrude', 'text.extrude.on'));
  if (T.extrude.on) { b.append(colorField(c, 'Colour', 'text.extrude.color')); b.append(slider(c, 'Depth', 'text.extrude.depth', 1, 60, 1)); b.append(slider(c, 'Angle', 'text.extrude.angle', 0, 360, 1, { unit: '°' })); }
  b.append(secTitle('Shadow'));
  b.append(toggleField(c, 'Shadow', 'text.shadow.on'));
  if (T.shadow.on) {
    const hex = /^#/.test(T.shadow.color) ? T.shadow.color : '#000000';
    const inp = h('input', { type: 'color', value: hex.slice(0, 7) });
    inp.oninput = () => T.shadow.color = inp.value;
    inp.onchange = () => commit({ keepInspector: true });
    b.append(h('div', { class: 'field wide' }, h('label', {}, 'Colour'), inp));
    b.append(slider(c, 'Blur', 'text.shadow.blur', 0, 80, 1));
    b.append(slider(c, 'Offset X', 'text.shadow.x', -50, 50, 1));
    b.append(slider(c, 'Offset Y', 'text.shadow.y', -50, 50, 1));
  }
  b.append(secTitle('Background'));
  b.append(toggleField(c, 'Background box', 'text.bg.on'));
  if (T.bg.on) {
    b.append(toggleField(c, 'Box per line', 'text.bg.perLine'));
    b.append(colorField(c, 'Colour', 'text.bg.color'));
    b.append(slider(c, 'Opacity', 'text.bg.opacity', 0, 1, 0.01, { mul: 100, unit: '%' }));
    b.append(slider(c, 'Padding', 'text.bg.pad', 0, 120, 1));
    b.append(slider(c, 'Corner', 'text.bg.radius', 0, 120, 1));
  }
}

function inspAnim(b, c) {
  b.append(secTitle('In'));
  const inOpts = Object.fromEntries(Object.entries(ANIMS_IN).filter(([k]) => c.type === 'text' || !CHAR_IN.has(k)));
  b.append(selectField(c, 'Animation', 'anim.in', inOpts));
  if (c.anim.in !== 'none') b.append(slider(c, 'Duration', 'anim.inDur', 0.1, Math.max(0.2, Math.min(5, c.duration)), 0.05, { unit: 's' }));
  b.append(secTitle('Out'));
  const outOpts = Object.fromEntries(Object.entries(ANIMS_OUT).filter(([k]) => c.type === 'text' || !CHAR_OUT.has(k)));
  b.append(selectField(c, 'Animation', 'anim.out', outOpts));
  if (c.anim.out !== 'none') b.append(slider(c, 'Duration', 'anim.outDur', 0.1, Math.max(0.2, Math.min(5, c.duration)), 0.05, { unit: 's' }));
  b.append(secTitle('Loop'));
  const loopOpts = Object.fromEntries(Object.entries(ANIMS_LOOP).filter(([k]) => c.type === 'text' || !CHAR_LOOP.has(k)));
  if (!c.anim.loop) c.anim.loop = 'none';
  b.append(selectField(c, 'Loop', 'anim.loop', loopOpts));
  if (c.anim.loop !== 'none') {
    if (c.anim.loopSpeed == null) c.anim.loopSpeed = 1;
    if (c.anim.loopAmount == null) c.anim.loopAmount = 1;
    b.append(slider(c, 'Speed', 'anim.loopSpeed', 0.1, 5, 0.05, { def: 1 }));
    b.append(slider(c, 'Amount', 'anim.loopAmount', 0.1, 3, 0.05, { def: 1 }));
  }
  if (c.type !== 'audio') {
    b.append(secTitle('Transition (from previous clip)'));
    b.append(selectField(c, 'Type', 'transition.type', TRANSITIONS));
    if (c.transition.type !== 'none') b.append(slider(c, 'Duration', 'transition.dur', 0.1, Math.max(0.2, Math.min(3, c.duration)), 0.05, { unit: 's' }));
  }
  b.append(h('button', { class: 'btn block', style: { marginTop: '10px' }, onclick: () => { seek(Math.max(0, c.start - 0.3)); play(); } }, iconEl('play'), 'Preview from clip start'));
}
