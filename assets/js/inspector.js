/* ClipLab Studio — right-hand inspector (properties of the selected clip) */
'use strict';

const INSP_TABS = {
  video: [['basic', 'Basic'], ['adjust', 'Adjust'], ['speed', 'Speed'], ['audio', 'Audio'], ['anim', 'Animation'], ['cutout', 'Mask & Cutout']],
  image: [['basic', 'Basic'], ['adjust', 'Adjust'], ['anim', 'Animation'], ['cutout', 'Mask & Cutout']],
  text: [['text', 'Text'], ['style', 'Style'], ['basic', 'Basic'], ['anim', 'Animation']],
  sticker: [['basic', 'Basic'], ['anim', 'Animation'], ['adjust', 'Effects']],
  audio: [['audio', 'Audio'], ['speed', 'Speed']],
};
const kfBindings = []; // live inputs whose values follow the playhead

function renderInspector() {
  const root = $('#inspector');
  const scroll = root.scrollTop;
  root.innerHTML = '';
  kfBindings.length = 0;
  const c = selClip();
  if (!c) {
    root.append(h('div', { class: 'insp-empty' },
      h('h3', {}, 'No clip selected'),
      h('p', {}, 'Click a clip on the timeline (or on the preview) to edit its position, speed, volume, colour, animation and more.'),
      h('p', { html: '<b>Shortcuts</b><br>Space – play/pause<br>S / Ctrl+B – split<br>Del – delete<br>Ctrl+D – duplicate<br>Ctrl+C / Ctrl+V – copy/paste<br>Ctrl+Z / Ctrl+Shift+Z – undo/redo<br>← / → – step one frame (Shift: 1s)<br>M – add marker<br>Ctrl+wheel – zoom timeline<br>Ctrl+S – save' })));
    return;
  }
  const tabs = INSP_TABS[c.type];
  if (!tabs.some(([k]) => k === S.inspTab)) S.inspTab = tabs[0][0];
  const typeLabel = { video: 'Video', image: 'Image', text: 'Text', sticker: 'Sticker', audio: 'Audio', effect: 'Effect' }[c.type];
  root.append(h('div', { class: 'insp-head' }, h('span', { class: 'badge' }, typeLabel), h('span', { class: 'title', title: clipLabel(c) }, clipLabel(c)),
    h('button', { class: 'btn sm', title: 'Delete clip', onclick: () => cmd('delete') }, iconEl('trash'))));
  const tabBar = h('div', { class: 'insp-tabs' });
  for (const [k, l] of tabs) tabBar.append(h('button', { class: S.inspTab === k ? 'active' : '', onclick: () => { S.inspTab = k; renderInspector(); } }, l));
  root.append(tabBar);
  const body = h('div', { class: 'insp-body' });
  ({ basic: inspBasic, adjust: inspAdjust, speed: inspSpeed, audio: inspAudio, anim: inspAnim, cutout: inspCutout, text: inspText, style: inspStyle, effect: typeof inspEffect === 'function' ? inspEffect : inspBasic }[S.inspTab])(body, c);
  root.append(body);
  hydrateIcons(root);
  root.scrollTop = scroll;
}

/* ---------- control builders ---------- */
function localT(c) { return S.time - c.start; }
function inClip(c) { return S.time >= c.start && S.time < clipEnd(c); }

/**
 * Slider + number field bound to a clip property.
 * opt: {kf: 'x'|..., mul: display multiplier, unit, onInput, onCommit}
 */
function slider(c, label, path, min, max, step, opt = {}) {
  const mul = opt.mul ?? 1;
  const getV = () => opt.kf && hasKf(c, opt.kf) ? kfValue(c, opt.kf, clamp(localT(c), 0, c.duration)) : getPath(c, path);
  const range = h('input', { type: 'range', min: min * mul, max: max * mul, step: step * mul });
  const num = h('input', { class: 'num', type: 'number', step: step * mul });
  const sync = () => { const v = getV() * mul; range.value = v; num.value = round(v, 2); };
  sync();
  const apply = (raw, final) => {
    let v = raw / mul;
    if (!opt.free) v = clamp(v, min, max);
    if (opt.kf && hasKf(c, opt.kf)) {
      if (!inClip(c)) { toast('Move the playhead inside the clip to edit keyframes'); sync(); return; }
      kfSet(c, opt.kf, localT(c), v);
    } else setPath(c, path, v);
    opt.onInput && opt.onInput(v);
    if (final) { opt.onCommit ? opt.onCommit(v) : commit({ keepInspector: true }); }
  };
  range.addEventListener('input', () => { num.value = round(+range.value, 2); apply(+range.value, false); });
  range.addEventListener('change', () => apply(+range.value, true));
  num.addEventListener('change', () => { range.value = num.value; apply(+num.value, true); });
  range.addEventListener('dblclick', () => { if (opt.def != null) { apply(opt.def * mul, true); sync(); } });
  let kfBtn = h('span');
  if (opt.kf) {
    const has = hasKf(c, opt.kf), on = has && inClip(c) && kfAt(c, opt.kf, localT(c));
    kfBtn = h('button', { class: 'kf-btn' + (on ? ' on' : has ? ' has' : ''), title: on ? 'Remove keyframe here' : 'Add keyframe at playhead', onclick: () => {
      if (!inClip(c)) return toast('Move the playhead inside the clip to add a keyframe');
      const lt = localT(c);
      if (kfAt(c, opt.kf, lt)) kfRemove(c, opt.kf, lt);
      else kfSet(c, opt.kf, lt, getV());
      commit();
    } }, on ? '◆' : '◇');
    kfBindings.push({ c, sync, kf: opt.kf, btn: kfBtn });
  }
  return h('div', { class: 'field', title: opt.def != null ? 'Double-click slider to reset' : '' }, h('label', {}, label + (opt.unit ? ` (${opt.unit})` : '')), range, num, kfBtn);
}
function selectField(c, label, path, options, onChange) {
  const sel = h('select', { style: { width: '100%' } }, ...Object.entries(options).map(([v, l]) => h('option', { value: v, selected: String(getPath(c, path)) === v }, l)));
  sel.onchange = () => { setPath(c, path, sel.value); onChange && onChange(sel.value); commit(); };
  return h('div', { class: 'field wide' }, h('label', {}, label), sel);
}
function colorField(c, label, path) {
  const v = getPath(c, path) || '#ffffff';
  const inp = h('input', { type: 'color', value: /^#[\da-f]{6}$/i.test(v) ? v : '#000000' });
  inp.oninput = () => setPath(c, path, inp.value);
  inp.onchange = () => commit({ keepInspector: true });
  return h('div', { class: 'field wide' }, h('label', {}, label), inp);
}
function toggleField(c, label, path, onChange) {
  const cb = h('input', { type: 'checkbox', checked: !!getPath(c, path) });
  cb.onchange = () => { setPath(c, path, cb.checked); onChange && onChange(cb.checked); commit(); };
  return h('label', { class: 'toggle', style: { margin: '4px 0 10px' } }, cb, label);
}
const secTitle = (t, right = null) => h('div', { class: 'sec-title' }, t, right);

/* ---------- tabs ---------- */
function inspBasic(b, c) {
  const W = P().width, H = P().height;
  b.append(secTitle('Transform', h('button', { class: 'btn sm', onclick: () => { c.transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }; for (const k of ['x', 'y', 'scale', 'rotation', 'opacity']) delete c.keyframes[k]; commit(); } }, 'Reset')));
  b.append(slider(c, 'Scale', 'transform.scale', 0.05, 8, 0.01, { kf: 'scale', mul: 100, unit: '%', def: 1 }));
  b.append(slider(c, 'Position X', 'transform.x', -W * 1.5, W * 1.5, 1, { kf: 'x', def: 0 }));
  b.append(slider(c, 'Position Y', 'transform.y', -H * 1.5, H * 1.5, 1, { kf: 'y', def: 0 }));
  b.append(slider(c, 'Rotation', 'transform.rotation', -360, 360, 0.5, { kf: 'rotation', unit: '°', def: 0 }));
  b.append(slider(c, 'Opacity', 'transform.opacity', 0, 1, 0.01, { kf: 'opacity', mul: 100, unit: '%', def: 1 }));
  b.append(h('p', { class: 'hint', style: { color: 'var(--text-3)', fontSize: '11.5px' } }, '◇ adds a keyframe at the playhead. With 2+ keyframes the value animates between them.'));

  if (c.type === 'video' || c.type === 'image') {
    b.append(secTitle('Fit'));
    const box = clipBox(c);
    const fill = Math.max(W / box.w, H / box.h);
    b.append(h('div', { class: 'row wrap' },
      h('button', { class: 'btn sm', onclick: () => { c.transform.scale = 1; c.transform.x = 0; c.transform.y = 0; commit(); } }, 'Fit'),
      h('button', { class: 'btn sm', onclick: () => { c.transform.scale = round(fill, 4); c.transform.x = 0; c.transform.y = 0; commit(); } }, 'Fill'),
      h('button', { class: 'btn sm', onclick: () => { c.flipH = !c.flipH; commit(); } }, '⇋ Flip H'),
      h('button', { class: 'btn sm', onclick: () => { c.flipV = !c.flipV; commit(); } }, '⇵ Flip V'),
      h('button', { class: 'btn sm', onclick: () => { c.transform.rotation = ((c.transform.rotation || 0) + 90) % 360; commit(); } }, '↻ 90°')));
  } else {
    b.append(h('div', { class: 'row wrap', style: { marginTop: '6px' } },
      h('button', { class: 'btn sm', onclick: () => { c.transform.x = 0; c.transform.y = 0; commit(); } }, 'Center'),
      h('button', { class: 'btn sm', onclick: () => { c.flipH = !c.flipH; commit(); } }, '⇋ Flip')));
  }
  b.append(secTitle('Blend'));
  b.append(selectField(c, 'Mode', 'blend', BLENDS));
  b.append(secTitle('Timing'));
  b.append(slider(c, 'Start', 'start', 0, Math.max(60, projectDuration() + 30), 0.01, { unit: 's', onCommit: () => { resolvePlacement(c, trackOf(c), 'free'); commit(); } }));
  if (c.type === 'image' || c.type === 'text' || c.type === 'sticker') b.append(slider(c, 'Duration', 'duration', 0.1, 600, 0.1, { unit: 's', onCommit: () => { rippleIfOverlap(c); commit(); } }));
}
function rippleIfOverlap(c) { const tr = trackOf(c); if (tr.clips.some(o => o !== c && overlaps(o, c))) rippleAfter(tr, c); }

function inspAdjust(b, c) {
  if (c.type !== 'sticker' && c.type !== 'text') {
    b.append(secTitle('Adjust', h('button', { class: 'btn sm', onclick: () => { c.adjust = { brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0, temperature: 0, vignette: 0 }; commit(); } }, 'Reset')));
    b.append(slider(c, 'Brightness', 'adjust.brightness', -1, 1, 0.01, { mul: 100, def: 0 }));
    b.append(slider(c, 'Contrast', 'adjust.contrast', -1, 1, 0.01, { mul: 100, def: 0 }));
    b.append(slider(c, 'Saturation', 'adjust.saturation', -1, 1, 0.01, { mul: 100, def: 0 }));
    b.append(slider(c, 'Temperature', 'adjust.temperature', -1, 1, 0.01, { mul: 100, def: 0 }));
    b.append(slider(c, 'Hue', 'adjust.hue', -180, 180, 1, { unit: '°', def: 0 }));
    b.append(slider(c, 'Vignette', 'adjust.vignette', 0, 1, 0.01, { mul: 100, def: 0 }));
  }
  b.append(slider(c, 'Blur', 'adjust.blur', 0, 60, 0.5, { def: 0 }));
  b.append(secTitle('Filter'));
  b.append(selectField(c, 'Preset', 'filter', Object.fromEntries(Object.entries(FILTERS).map(([k, v]) => [k, v.name]))));
  if (c.filter !== 'none') b.append(slider(c, 'Intensity', 'filterIntensity', 0, 1, 0.01, { mul: 100, unit: '%', def: 1 }));
  b.append(secTitle('Effect'));
  b.append(selectField(c, 'Effect', 'effect', EFFECTS));
  if (c.effect !== 'none') b.append(slider(c, 'Strength', 'effectStrength', 0.1, 2, 0.05, { mul: 100, unit: '%', def: 1 }));
}

function inspSpeed(b, c) {
  b.append(secTitle('Speed'));
  const span = srcSpan(c);
  const setSpeed = v => {
    v = clamp(v, 0.1, 100);
    const s = srcSpan(c), oldEnd = clipEnd(c);
    c.speed = round(v, 3);
    c.duration = s / (c.speed * curveAvg(curvePts(c)));
    magneticShift(c, oldEnd);
    for (const k of Object.keys(c.keyframes || {})) c.keyframes[k] = c.keyframes[k].filter(x => x.t <= c.duration);
    rippleIfOverlap(c);
    commit();
  };
  const chips = h('div', { class: 'chips', style: { marginBottom: '12px' } });
  for (const v of [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 5, 10]) chips.append(h('span', { class: 'chip' + (Math.abs(c.speed - v) < 0.001 ? ' active' : ''), onclick: () => setSpeed(v) }, v + 'x'));
  b.append(chips);
  const r = h('input', { type: 'range', min: -2.3, max: 2.3, step: 0.01, value: Math.log(c.speed) });
  const lbl = h('span', { class: 'num', style: { display: 'inline-block', textAlign: 'right', lineHeight: '26px' } }, c.speed.toFixed(2) + 'x');
  r.oninput = () => lbl.textContent = Math.exp(+r.value).toFixed(2) + 'x';
  r.onchange = () => setSpeed(Math.exp(+r.value));
  b.append(h('div', { class: 'field wide2', style: { gridTemplateColumns: '82px 1fr 60px' } }, h('label', {}, 'Custom'), r, lbl));
  b.append(h('p', { class: 'hint', style: { color: 'var(--text-3)', fontSize: '12px' } }, `Source length ${span.toFixed(2)}s → clip length ${c.duration.toFixed(2)}s.`));
  b.append(toggleField(c, 'Keep voice pitch (no chipmunk effect)', 'keepPitch'));
  if (c.keepPitch === undefined) c.keepPitch = true;
}

function inspAudio(b, c) {
  b.append(secTitle('Volume'));
  b.append(slider(c, 'Volume', 'volume', 0, 4, 0.01, { kf: 'volume', mul: 100, unit: '%', def: 1 }));
  b.append(slider(c, 'Fade in', 'fadeIn', 0, Math.min(10, c.duration), 0.05, { unit: 's', def: 0 }));
  b.append(slider(c, 'Fade out', 'fadeOut', 0, Math.min(10, c.duration), 0.05, { unit: 's', def: 0 }));
  b.append(toggleField(c, 'Mute this clip', 'muted'));
  if (c.type === 'video') b.append(h('button', { class: 'btn block', onclick: () => cmd('detachAudio') }, iconEl('music'), 'Extract audio to its own track'));
  b.append(h('p', { class: 'hint', style: { color: 'var(--text-3)', fontSize: '11.5px', marginTop: '10px' } }, 'Use ◇ on Volume to keyframe ducking (lower music under speech).'));
}

function inspAnim(b, c) {
  b.append(secTitle('In'));
  b.append(selectField(c, 'Animation', 'anim.in', c.type === 'text' ? ANIMS_IN : Object.fromEntries(Object.entries(ANIMS_IN).filter(([k]) => k !== 'typewriter'))));
  if (c.anim.in !== 'none') b.append(slider(c, 'Duration', 'anim.inDur', 0.1, Math.max(0.2, Math.min(5, c.duration)), 0.05, { unit: 's' }));
  b.append(secTitle('Out'));
  b.append(selectField(c, 'Animation', 'anim.out', ANIMS_OUT));
  if (c.anim.out !== 'none') b.append(slider(c, 'Duration', 'anim.outDur', 0.1, Math.max(0.2, Math.min(5, c.duration)), 0.05, { unit: 's' }));
  b.append(secTitle('Transition (from previous clip)'));
  b.append(selectField(c, 'Type', 'transition.type', TRANSITIONS));
  if (c.transition.type !== 'none') b.append(slider(c, 'Duration', 'transition.dur', 0.1, Math.max(0.2, Math.min(3, c.duration)), 0.05, { unit: 's' }));
  b.append(h('button', { class: 'btn block', style: { marginTop: '10px' }, onclick: () => { seek(Math.max(0, c.start - 0.3)); play(); } }, iconEl('play'), 'Preview from clip start'));
}

function inspCutout(b, c) {
  b.append(secTitle('Mask'));
  const chips = h('div', { class: 'chips', style: { marginBottom: '10px' } });
  for (const [k, l] of [['none', 'None'], ['circle', 'Circle'], ['round', 'Rounded'], ['band', 'Band'], ['heart', 'Heart'], ['star', 'Star']]) chips.append(h('span', { class: 'chip' + (c.mask.type === k ? ' active' : ''), onclick: () => { c.mask.type = k; commit(); } }, l));
  b.append(chips);
  if (c.mask.type !== 'none') {
    b.append(slider(c, 'Size', 'mask.size', 0.05, 1.5, 0.01, { mul: 100, unit: '%', def: 1 }));
    if (c.mask.type === 'round') b.append(slider(c, 'Corner', 'mask.radius', 0, 0.5, 0.01, { mul: 100, unit: '%' }));
  }
  b.append(secTitle('Crop', h('button', { class: 'btn sm', onclick: () => { c.crop = { l: 0, t: 0, r: 0, b: 0 }; commit(); } }, 'Reset')));
  b.append(slider(c, 'Left', 'crop.l', 0, 0.95, 0.005, { mul: 100, unit: '%', onInput: () => { if (c.crop.l + c.crop.r > 0.95) c.crop.l = 0.95 - c.crop.r; } }));
  b.append(slider(c, 'Right', 'crop.r', 0, 0.95, 0.005, { mul: 100, unit: '%', onInput: () => { if (c.crop.l + c.crop.r > 0.95) c.crop.r = 0.95 - c.crop.l; } }));
  b.append(slider(c, 'Top', 'crop.t', 0, 0.95, 0.005, { mul: 100, unit: '%', onInput: () => { if (c.crop.t + c.crop.b > 0.95) c.crop.t = 0.95 - c.crop.b; } }));
  b.append(slider(c, 'Bottom', 'crop.b', 0, 0.95, 0.005, { mul: 100, unit: '%', onInput: () => { if (c.crop.t + c.crop.b > 0.95) c.crop.b = 0.95 - c.crop.t; } }));
  b.append(secTitle('Chroma key (green screen)'));
  b.append(toggleField(c, 'Remove a colour', 'chroma.on'));
  if (c.chroma.on) {
    b.append(colorField(c, 'Key colour', 'chroma.color'));
    b.append(h('button', { class: 'btn sm', style: { marginBottom: '10px' }, onclick: () => { Picker.start(col => { c.chroma.color = col; commit(); }); } }, '🎯 Pick colour from preview'));
    b.append(slider(c, 'Strength', 'chroma.tol', 0, 1, 0.01, { mul: 100, def: 0.32 }));
    b.append(slider(c, 'Softness', 'chroma.soft', 0, 1, 0.01, { mul: 100, def: 0.1 }));
  }
}

function inspText(b, c) {
  const T = c.text;
  const ta = h('textarea', { class: 'inp', rows: 3, spellcheck: 'false' });
  ta.value = T.content;
  ta.oninput = () => { T.content = ta.value; };
  ta.onchange = () => commit({ keepInspector: true });
  b.append(secTitle('Content'), ta);
  b.append(secTitle('Font'));
  const fontSel = h('select', { style: { width: '100%' } }, ...FONTS.map(f => h('option', { value: f, selected: T.font === f, style: { fontFamily: `"${f}"` } }, f)));
  fontSel.onchange = () => { T.font = fontSel.value; document.fonts?.load(`${T.weight} 40px "${T.font}"`).finally(() => commit()); };
  b.append(h('div', { class: 'field wide' }, h('label', {}, 'Family'), fontSel));
  b.append(selectField(c, 'Weight', 'text.weight', { 300: 'Light', 400: 'Regular', 600: 'Semibold', 700: 'Bold', 900: 'Black' }, v => { T.weight = +v; }));
  b.append(slider(c, 'Size', 'text.size', 8, 500, 1, { unit: 'px' }));
  b.append(colorField(c, 'Colour', 'text.color'));
  const align = h('div', { class: 'seg' });
  for (const [k, l] of [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]) align.append(h('button', { class: T.align === k ? 'active' : '', onclick: () => { T.align = k; commit(); } }, l));
  const style = h('div', { class: 'seg' },
    h('button', { class: T.italic ? 'active' : '', style: { fontStyle: 'italic' }, onclick: () => { T.italic = !T.italic; commit(); } }, 'I'),
    h('button', { class: T.underline ? 'active' : '', style: { textDecoration: 'underline' }, onclick: () => { T.underline = !T.underline; commit(); } }, 'U'));
  b.append(h('div', { class: 'row', style: { margin: '4px 0 12px' } }, align, style));
  b.append(slider(c, 'Spacing', 'text.spacing', -10, 60, 0.5, { def: 0 }));
  b.append(slider(c, 'Line height', 'text.lineHeight', 0.7, 3, 0.05, { def: 1.2 }));
  b.append(secTitle('Quick styles'));
  const chips = h('div', { class: 'chips' });
  for (const pr of TEXT_PRESETS) chips.append(h('span', { class: 'chip', onclick: () => applyTextPreset(c, pr) }, pr.name));
  b.append(chips);
}

function inspStyle(b, c) {
  const T = c.text;
  b.append(secTitle('Outline'));
  b.append(toggleField(c, 'Stroke', 'text.stroke.on'));
  if (T.stroke.on) { b.append(colorField(c, 'Colour', 'text.stroke.color')); b.append(slider(c, 'Width', 'text.stroke.width', 0, 40, 0.5)); }
  b.append(secTitle('Shadow / glow'));
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
    b.append(colorField(c, 'Colour', 'text.bg.color'));
    b.append(slider(c, 'Opacity', 'text.bg.opacity', 0, 1, 0.01, { mul: 100, unit: '%' }));
    b.append(slider(c, 'Padding', 'text.bg.pad', 0, 120, 1));
    b.append(slider(c, 'Corner', 'text.bg.radius', 0, 120, 1));
  }
}

/** keep keyframed controls in step with the playhead */
function syncInspectorKeyframes() {
  if (!kfBindings.length) return;
  const ae = document.activeElement;
  for (const k of kfBindings) {
    if (ae && ae.closest && ae.closest('.field') && ae.closest('.field').contains(k.btn)) continue;
    if (hasKf(k.c, k.kf)) k.sync();
    const has = hasKf(k.c, k.kf), on = has && inClip(k.c) && kfAt(k.c, k.kf, localT(k.c));
    k.btn.className = 'kf-btn' + (on ? ' on' : has ? ' has' : '');
    k.btn.textContent = on ? '◆' : '◇';
  }
}

/* eyedropper on the preview canvas */
const Picker = {
  cb: null,
  start(cb) { this.cb = cb; $('#preview').style.cursor = 'crosshair'; toast('Click the colour on the preview to remove'); },
  pick(e) {
    if (!this.cb) return false;
    const cv = $('#preview');
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * cv.width), y = Math.floor((e.clientY - r.top) / r.height * cv.height);
    const sel = selClip();
    const was = sel?.chroma?.on;
    if (sel) sel.chroma.on = false;
    renderFrame(previewCtx, S.time, { ui: false });
    const d = previewCtx.getImageData(x, y, 1, 1).data;
    if (sel) sel.chroma.on = was;
    const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    const cb = this.cb; this.cb = null; cv.style.cursor = '';
    cb(hex);
    return true;
  },
};
