/* ClipLab Studio — left side panels (media, audio, text, stickers, effects, filters, transitions, captions, canvas) */
'use strict';

const LEFT_TABS = [
  ['media', 'Media', 'media'], ['audio', 'Audio', 'audio'], ['text', 'Text', 'text'], ['stickers', 'Stickers', 'sticker'],
  ['effects', 'Effects', 'effects'], ['filters', 'Filters', 'filters'], ['transitions', 'Transitions', 'transitions'],
  ['captions', 'Captions', 'captions'], ['canvas', 'Canvas', 'canvas'],
];
const Uploads = []; // in-progress uploads {id, name, progress}

function renderSideTabs() {
  const nav = $('#sideTabs');
  nav.innerHTML = '';
  for (const [id, label, ic] of LEFT_TABS) {
    nav.append(h('button', { class: S.leftTab === id ? 'active' : '', onclick: () => { S.leftTab = id; renderSideTabs(); renderLeftPanel(); } }, iconEl(ic), label));
  }
}

function renderLeftPanel() {
  const p = $('#leftPanel');
  const scroll = p.scrollTop;
  p.innerHTML = '';
  const fn = { media: panelMedia, audio: panelAudio, text: panelText, stickers: panelStickers, effects: panelEffects, filters: panelFilters, transitions: panelTransitions, captions: panelCaptions, canvas: panelCanvas }[S.leftTab];
  fn && fn(p);
  hydrateIcons(p);
  p.scrollTop = scroll;
}

function needSel(types = null) {
  const c = selClip();
  if (!c) { toast('Select a clip on the timeline first'); return null; }
  if (types && !types.includes(c.type)) { toast('This option works on ' + types.join(' / ') + ' clips'); return null; }
  return c;
}

/* ---------------- media ---------------- */
function usedMediaIds() { return new Set(allClips().map(x => x.c.mediaId).filter(Boolean)); }

function mediaCard(m, used) {
  const th = Assets.thumbs.get(m.id);
  const card = h('div', { class: 'media-card' + (used.has(m.id) ? ' in-use' : ''), draggable: 'true', title: m.name + (m.width ? `\n${m.width}×${m.height}` : '') + `\n${fmtSize(m.size || 0)}` });
  const thumb = h('div', { class: 'thumb', style: th ? { backgroundImage: `url("${th}")` } : {} });
  if (!th) thumb.append(iconEl(m.type === 'audio' ? 'music' : m.type === 'image' ? 'image' : 'video'));
  card.append(thumb);
  if (m.type !== 'image' && m.duration) card.append(h('span', { class: 'dur' }, fmtTime(m.duration, false)));
  card.append(h('div', { class: 'meta' }, h('span', {}, m.name)));
  const actions = h('div', { class: 'actions' },
    h('button', { title: m.type === 'audio' ? 'Add to timeline at playhead' : 'Add to main track', onclick: e => { e.stopPropagation(); addMediaClip(m); } }, iconEl('plus')),
  );
  if (m.type !== 'audio') actions.append(h('button', { title: 'Add as overlay (picture-in-picture) at playhead', onclick: e => { e.stopPropagation(); addMediaClip(m, { overlay: true }); } }, iconEl('overlay')));
  actions.append(h('div', { style: { flex: 1 } }), h('button', { class: 'del', title: 'Delete from library', onclick: e => { e.stopPropagation(); deleteMedia(m); } }, iconEl('trash')));
  card.append(actions);
  card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/cliplab-media', m.id); e.dataTransfer.effectAllowed = 'copy'; });
  card.addEventListener('dblclick', () => addMediaClip(m));
  return card;
}
function uploadCards(kind) {
  return Uploads.filter(u => (kind === 'audio') === (u.kind === 'audio')).map(u =>
    h('div', { class: 'media-card uploading' },
      h('div', { class: 'thumb' }, Math.round(u.progress * 100) + '%'),
      h('div', { class: 'meta' }, h('span', {}, u.name)),
      h('div', { class: 'progress', style: { width: (u.progress * 100) + '%' } })));
}

function panelMedia(p) {
  p.append(h('h3', {}, 'Media'));
  p.append(h('div', { class: 'dropzone', onclick: () => pickFiles() }, iconEl('upload'), h('div', {}, h('b', {}, 'Import'), ' videos, photos or audio'), h('div', { class: 'muted', style: { fontSize: '11.5px', marginTop: '4px' } }, 'or drag files anywhere into the window')));
  const used = usedMediaIds();
  const list = S.media.filter(m => m.type !== 'audio');
  const grid = h('div', { class: 'media-grid' }, ...uploadCards('visual'), ...list.map(m => mediaCard(m, used)));
  p.append(grid);
  if (!list.length && !Uploads.length) p.append(h('p', { class: 'hint' }, 'Your imported videos and images will appear here. Click + to add a clip to the main track, or the overlay button to stack it on top (picture-in-picture).'));
}

function panelAudio(p) {
  p.append(h('h3', {}, 'Audio'));
  p.append(h('div', { class: 'row', style: { marginBottom: '10px' } },
    h('button', { class: 'btn primary', onclick: () => pickFiles('audio') }, iconEl('upload'), 'Import music'),
    Recorder.active
      ? h('button', { class: 'btn rec', onclick: () => Recorder.stop() }, h('span', { class: 'rec-dot' }), 'Stop recording')
      : h('button', { class: 'btn', onclick: () => Recorder.start() }, iconEl('mic'), 'Voiceover')));
  p.append(h('p', { class: 'hint' }, 'Voiceover records your microphone while the timeline plays, and drops the recording at the playhead. To use a video\'s sound separately, select the clip and use “Extract audio”.'));
  const used = usedMediaIds();
  const list = S.media.filter(m => m.type === 'audio');
  const wrap = h('div', { class: 'proj-list' });
  for (const u of Uploads.filter(u => u.kind === 'audio')) wrap.append(h('div', { class: 'proj-item' }, h('div', { class: 'pi' }, h('b', {}, u.name), h('small', {}, 'Uploading ' + Math.round(u.progress * 100) + '%'))));
  for (const m of list) {
    const item = h('div', { class: 'proj-item', draggable: 'true' },
      h('div', { style: { width: '34px', height: '34px', borderRadius: '8px', background: 'var(--audio)', display: 'grid', placeItems: 'center', flex: 'none' } }, iconEl('music')),
      h('div', { class: 'pi' }, h('b', { title: m.name }, m.name), h('small', {}, (m.duration ? fmtTime(m.duration, false) : '…') + (used.has(m.id) ? ' · in use' : ''))),
      h('button', { class: 'btn sm', title: 'Preview', onclick: e => { e.stopPropagation(); previewAudio(m, e.currentTarget); } }, '▶'),
      h('button', { class: 'btn sm', title: 'Add at playhead', onclick: () => addMediaClip(m) }, iconEl('plus')),
      h('button', { class: 'btn sm danger', title: 'Delete', onclick: () => deleteMedia(m) }, iconEl('trash')));
    item.addEventListener('dragstart', e => e.dataTransfer.setData('text/cliplab-media', m.id));
    wrap.append(item);
  }
  p.append(wrap);
  if (!list.length) p.append(h('p', { class: 'hint' }, 'No audio yet. Import MP3, WAV, M4A, AAC, OGG or FLAC files.'));
}
let audioPreviewEl = null;
function previewAudio(m, btn) {
  if (audioPreviewEl && !audioPreviewEl.paused && audioPreviewEl.dataset.id === m.id) { audioPreviewEl.pause(); btn.textContent = '▶'; return; }
  audioPreviewEl?.pause();
  audioPreviewEl = new Audio(m.url); audioPreviewEl.dataset.id = m.id;
  audioPreviewEl.play(); btn.textContent = '❚❚';
  audioPreviewEl.onended = () => btn.textContent = '▶';
}

/* ---------------- text ---------------- */
function panelText(p) {
  p.append(h('h3', {}, 'Text'));
  p.append(h('button', { class: 'btn primary block', onclick: () => addText(), style: { marginBottom: '12px' } }, iconEl('plus'), 'Add text'));
  p.append(h('h4', {}, 'Styles'));
  const grid = h('div', { class: 'preset-grid' });
  for (const pr of TEXT_PRESETS) {
    const T = Object.assign(defaultText(), deep(pr.t));
    const style = {
      fontFamily: `"${T.font}"`, fontWeight: T.weight, fontStyle: T.italic ? 'italic' : 'normal', color: T.color,
      letterSpacing: Math.min(3, (T.spacing || 0) / 4) + 'px',
      textShadow: T.shadow?.on ? `${(T.shadow.x || 0) / 3}px ${(T.shadow.y || 0) / 3}px ${(T.shadow.blur || 0) / 3}px ${T.shadow.color}` : 'none',
      WebkitTextStroke: T.stroke?.on ? `${Math.min(2, T.stroke.width / 5)}px ${T.stroke.color}` : '',
      background: T.bg?.on ? T.bg.color : 'transparent', padding: T.bg?.on ? '2px 8px' : 0, borderRadius: T.bg?.on ? '4px' : 0,
    };
    grid.append(h('div', { class: 'preset text-preset', title: 'Click to add · Shift+click to apply to selected text', onclick: e => (e.shiftKey && selClip()?.type === 'text') ? applyTextPreset(selClip(), pr) : addText(pr) },
      h('div', { class: 'pv', style: { background: '#2a2d33' } }, h('span', { style }, pr.t.content ? 'අ' : 'Aa')), pr.name));
  }
  p.append(grid);
  p.append(h('p', { class: 'hint' }, 'Tip: Shift+click a style to apply it to the selected text clip. Sinhala fonts (Noto Sans Sinhala, Abhaya Libre) are included.'));
}
function applyTextPreset(c, pr) {
  const keep = c.text.content;
  c.text = Object.assign(defaultText(), deep(pr.t));
  c.text.content = keep;
  commit();
}

/* ---------------- stickers ---------------- */
function panelStickers(p) {
  p.append(h('h3', {}, 'Stickers'));
  p.append(h('p', { class: 'hint' }, 'Click a sticker to drop it at the playhead. Resize and rotate it on the preview.'));
  const g = h('div', { class: 'sticker-grid' });
  for (const s of STICKERS) g.append(h('button', { onclick: () => addSticker(s), title: 'Add ' + s }, s));
  p.append(g);
  p.append(h('h4', {}, 'Custom'));
  const inp = h('input', { class: 'inp', placeholder: 'Paste any emoji…', style: { width: '100%' } });
  p.append(h('div', { class: 'row' }, inp, h('button', { class: 'btn', onclick: () => inp.value.trim() && addSticker(inp.value.trim()) }, 'Add')));
  p.append(h('p', { class: 'hint' }, 'For PNG stickers or logos, import the image in Media and add it as an overlay.'));
}

/* ---------------- effects / filters / transitions ---------------- */
function selThumb() {
  const c = selClip();
  if (c && c.mediaId) return Assets.thumbs.get(c.mediaId) || null;
  const first = S.media.find(m => m.type !== 'audio' && Assets.thumbs.get(m.id));
  return first ? Assets.thumbs.get(first.id) : null;
}
function presetThumb(th, style = {}) {
  return th ? h('img', { src: th, style }) : h('div', { style: Object.assign({ width: '100%', height: '100%', background: 'linear-gradient(135deg,#ff7a59,#ffd36b 45%,#3fc1c9 75%,#364f6b)' }, style) });
}

function panelEffects(p) {
  const c = selClip();
  p.append(h('h3', {}, 'Effects'));
  p.append(h('p', { class: 'hint' }, c && c.type !== 'audio' ? 'Applies to the selected clip.' : 'Select a video, image, text or sticker clip, then pick an effect.'));
  const g = h('div', { class: 'preset-grid' });
  const emo = { none: '⦸', kenburns: '🔍', shake: '📳', pulse: '💓', flash: '⚡', glitch: '👾', flicker: '💡', vignette: '◉', oldfilm: '🎞️', blurpulse: '🌫️', rgbsplit: '🌈', spin: '🌀', zoomout: '🔭' };
  for (const [k, name] of Object.entries(EFFECTS)) {
    g.append(h('div', { class: 'preset' + (c?.effect === k ? ' active' : ''), onclick: () => { const cc = needSel(['video', 'image', 'text', 'sticker']); if (!cc) return; cc.effect = k; commit(); } },
      h('div', { class: 'pv', style: { fontSize: '26px' } }, emo[k] || '✨'), name));
  }
  p.append(g);
  if (c && c.type !== 'audio' && c.effect !== 'none') {
    p.append(h('h4', {}, 'Strength'));
    const r = h('input', { type: 'range', min: 0.1, max: 2, step: 0.05, value: c.effectStrength ?? 1 });
    r.oninput = () => { c.effectStrength = +r.value; };
    r.onchange = () => commit();
    p.append(r);
  }
}

function panelFilters(p) {
  const c = selClip();
  p.append(h('h3', {}, 'Filters'));
  p.append(h('p', { class: 'hint' }, c && (c.type === 'video' || c.type === 'image') ? 'Applies to the selected clip. Fine-tune in Adjust on the right.' : 'Select a video or image clip, then pick a filter.'));
  const th = selThumb();
  const g = h('div', { class: 'preset-grid' });
  for (const [k, f] of Object.entries(FILTERS)) {
    const pv = h('div', { class: 'pv', style: { position: 'relative' } }, presetThumb(th, { filter: f.f || 'none' }));
    if (f.tint) pv.append(h('div', { style: { position: 'absolute', inset: 0, background: f.tint.replace(/[\d.]+\)$/, m => Math.min(1, parseFloat(m) * 2.5) + ')'), mixBlendMode: 'soft-light' } }));
    g.append(h('div', { class: 'preset' + (c?.filter === k ? ' active' : ''), onclick: () => { const cc = needSel(['video', 'image', 'text', 'sticker']); if (!cc) return; cc.filter = k; commit(); } }, pv, f.name));
  }
  p.append(g);
  if (c && c.filter && c.filter !== 'none') {
    p.append(h('h4', {}, 'Intensity'));
    const r = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: c.filterIntensity ?? 1 });
    r.oninput = () => { c.filterIntensity = +r.value; };
    r.onchange = () => commit();
    p.append(r);
  }
  p.append(h('button', { class: 'btn block', style: { marginTop: '12px' }, onclick: () => { const cc = needSel(); if (!cc) return; for (const { c: o } of allClips()) if (o.type === 'video' || o.type === 'image') { o.filter = cc.filter; o.filterIntensity = cc.filterIntensity; } commit(); toast('Filter applied to all clips', 'ok'); } }, 'Apply this filter to all clips'));
}

function panelTransitions(p) {
  const c = selClip();
  p.append(h('h3', {}, 'Transitions'));
  p.append(h('p', { class: 'hint' }, 'A transition plays at the START of the selected clip, blending in from the clip right before it on the same track. Select the second clip of a cut.'));
  const g = h('div', { class: 'preset-grid' });
  const emo = { none: '⦸', dissolve: '◐', black: '⬛', white: '⬜', 'slide-left': '⇠', 'slide-right': '⇢', 'slide-up': '⇡', 'push-left': '⇇', 'wipe-right': '▶', 'wipe-down': '▼', circle: '◯', 'zoom-in': '⊕', 'zoom-out': '⊖', spin: '↻', blur: '≋', flash: '✦' };
  for (const [k, name] of Object.entries(TRANSITIONS)) {
    g.append(h('div', { class: 'preset' + (c?.transition?.type === k ? ' active' : ''), onclick: () => { const cc = needSel(['video', 'image', 'text', 'sticker']); if (!cc) return; cc.transition.type = k; commit(); seek(cc.start); } },
      h('div', { class: 'pv', style: { fontSize: '26px' } }, emo[k]), name));
  }
  p.append(g);
  if (c && c.transition && c.transition.type !== 'none') {
    p.append(h('h4', {}, 'Duration: ' + c.transition.dur.toFixed(1) + 's'));
    const r = h('input', { type: 'range', min: 0.1, max: Math.max(0.2, Math.min(3, c.duration)), step: 0.1, value: c.transition.dur });
    r.oninput = () => { c.transition.dur = +r.value; r.previousSibling && (p.querySelector('h4:last-of-type').textContent = 'Duration: ' + (+r.value).toFixed(1) + 's'); };
    r.onchange = () => commit();
    p.append(r);
  }
  p.append(h('button', { class: 'btn block', style: { marginTop: '12px' }, onclick: () => {
    const cc = needSel(); if (!cc) return;
    const tr = trackOf(cc);
    tr.clips.forEach(o => { if (tr.clips.some(x => x !== o && Math.abs(clipEnd(x) - o.start) < 0.05)) o.transition = deep(cc.transition); });
    commit(); toast('Transition applied to every cut on this track', 'ok');
  } }, 'Apply to all cuts on this track'));
}

/* ---------------- captions ---------------- */
function panelCaptions(p) {
  p.append(h('h3', {}, 'Captions'));
  p.append(h('div', { class: 'row wrap', style: { marginBottom: '10px' } },
    h('button', { class: 'btn primary', onclick: () => $('#srtInput').click() }, iconEl('srt'), 'Import SRT / VTT'),
    h('button', { class: 'btn', onclick: () => exportSrt() }, iconEl('download'), 'Export SRT')));
  p.append(h('h4', {}, 'Script to captions'));
  p.append(h('p', { class: 'hint' }, 'Paste your script — one caption per line. Captions are placed one after another from the playhead. Then fine-tune timing by dragging on the timeline.'));
  const ta = h('textarea', { class: 'inp', rows: 7, placeholder: 'Line one of the caption\nLine two…' });
  const per = h('input', { class: 'inp', type: 'number', min: 0.5, max: 20, step: 0.1, value: 2.5, style: { width: '80px' } });
  const styleSel = h('select', {}, ...TEXT_PRESETS.map((pr, i) => h('option', { value: i, selected: pr.name === 'Caption' }, pr.name)));
  const auto = h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: true }), 'Timing by word count');
  p.append(ta, h('div', { class: 'row wrap', style: { margin: '8px 0' } }, h('span', { class: 'muted' }, 'Seconds/line'), per, h('span', { class: 'muted' }, 'Style'), styleSel), auto);
  p.append(h('button', { class: 'btn primary block', style: { marginTop: '8px' }, onclick: () => {
    const lines = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) return toast('Paste some lines first');
    const pr = TEXT_PRESETS[+styleSel.value];
    const items = []; let t = S.time;
    for (const l of lines) {
      const d = auto.querySelector('input').checked ? clamp(l.split(/\s+/).length * 0.42 + 0.4, 1, 8) : +per.value;
      items.push({ start: t, end: t + d, text: l }); t += d;
    }
    addCaptions(items, pr);
  } }, 'Generate captions'));
  p.append(h('p', { class: 'hint', style: { marginTop: '14px' } }, 'Automatic speech-to-text needs an AI transcription service, which this offline app does not include. Generate an SRT with a free tool (e.g. a Whisper app) and import it here.'));
}
function parseSrt(text) {
  const items = [];
  const blocks = text.replace(/\r/g, '').replace(/^WEBVTT.*\n/, '').split(/\n\s*\n/);
  const ts = s => { const m = /(?:(\d+):)?(\d+):(\d+)[,.](\d+)/.exec(s); if (!m) return null; return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 10 ** m[4].length; };
  for (const b of blocks) {
    const lines = b.split('\n').filter(l => l.trim() !== '');
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const [a, z] = lines[i].split('-->');
    const start = ts(a), end = ts(z);
    if (start == null || end == null) continue;
    const textLines = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '');
    if (textLines.trim()) items.push({ start, end, text: textLines });
  }
  return items;
}
function addCaptions(items, preset = TEXT_PRESETS.find(p => p.name === 'Caption')) {
  if (!items.length) return toast('No captions found', 'err');
  const tr = addTrack('visual', 'Captions');
  for (const it of items) {
    const c = newClip('text', it.start, Math.max(0.2, it.end - it.start), { text: Object.assign(defaultText(), deep(preset.t), { content: it.text }) });
    c.transform.y = P().height * 0.33;
    tr.clips.push(c);
  }
  sortTrack(tr);
  commit();
  toast(`Added ${items.length} captions`, 'ok');
}
function exportSrt() {
  const tracks = P().tracks.filter(t => t.kind === 'visual' && t.clips.some(c => c.type === 'text'));
  if (!tracks.length) return toast('No text clips to export');
  const tr = tracks.find(t => /caption/i.test(t.name)) || tracks[0];
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const ts = s => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(Math.floor(s % 60))},${pad(Math.round((s % 1) * 1000), 3)}`;
  const txt = tr.clips.filter(c => c.type === 'text').sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(clipEnd(c))}\n${c.text.content}\n`).join('\n');
  downloadBlob(new Blob([txt], { type: 'text/plain' }), (P().name || 'captions') + '.srt');
}

/* ---------------- canvas ---------------- */
function panelCanvas(p) {
  const pr = P();
  p.append(h('h3', {}, 'Canvas'));
  p.append(h('h4', {}, 'Aspect ratio'));
  const g = h('div', { class: 'preset-grid' });
  for (const [k, [w, hh, desc]] of Object.entries(RATIOS)) {
    const box = 46, bw = w > hh ? box : box * w / hh, bh = w > hh ? box * hh / w : box;
    g.append(h('div', { class: 'preset' + (pr.ratio === k ? ' active' : ''), title: desc, onclick: () => setRatio(k) },
      h('div', { class: 'pv', style: { background: 'transparent' } }, h('div', { style: { width: bw + 'px', height: bh + 'px', border: '2px solid var(--text-2)', borderRadius: '3px' } })),
      h('b', {}, k), h('div', { class: 'muted', style: { fontSize: '10px', padding: '0 4px' } }, desc.split('·')[1] || desc)));
  }
  p.append(g);

  p.append(h('h4', {}, 'Background'));
  const seg = h('div', { class: 'seg' });
  for (const [k, l] of [['color', 'Color'], ['blur', 'Blur'], ['gradient', 'Gradient']]) {
    seg.append(h('button', { class: pr.background.mode === k ? 'active' : '', onclick: () => { pr.background.mode = k; commit(); } }, l));
  }
  p.append(seg);
  const col = h('input', { type: 'color', value: pr.background.color });
  col.oninput = () => { pr.background.color = col.value; };
  col.onchange = () => commit();
  p.append(h('div', { class: 'field wide', style: { marginTop: '10px' } }, h('label', {}, pr.background.mode === 'gradient' ? 'From' : 'Color'), col));
  if (pr.background.mode === 'gradient') {
    const col2 = h('input', { type: 'color', value: pr.background.color2 || '#3a1c71' });
    col2.oninput = () => { pr.background.color2 = col2.value; };
    col2.onchange = () => commit();
    p.append(h('div', { class: 'field wide' }, h('label', {}, 'To'), col2));
  }
  if (pr.background.mode === 'blur') {
    const r = h('input', { type: 'range', min: 5, max: 120, value: pr.background.blur });
    r.oninput = () => { pr.background.blur = +r.value; };
    r.onchange = () => commit();
    p.append(h('div', { class: 'field wide' }, h('label', {}, 'Blur'), r));
    p.append(h('p', { class: 'hint' }, 'Fills empty space with a blurred copy of the main clip — great for putting landscape videos in a 9:16 frame.'));
  }
  const swatches = h('div', { class: 'chips', style: { marginTop: '6px' } });
  for (const cl of ['#000000', '#ffffff', '#111827', '#1f2937', '#18d4c4', '#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#8338ec']) {
    swatches.append(h('div', { class: 'chip', title: cl, style: { width: '24px', height: '24px', padding: 0, background: cl }, onclick: () => { pr.background.color = cl; commit(); } }));
  }
  p.append(swatches);

  p.append(h('h4', {}, 'Frame rate'));
  const fps = h('select', {}, ...[24, 25, 30, 50, 60].map(f => h('option', { value: f, selected: pr.fps === f }, f + ' fps')));
  fps.onchange = () => { pr.fps = +fps.value; commit(); };
  p.append(fps);
  p.append(h('p', { class: 'hint' }, `Project size: ${pr.width} × ${pr.height}px`));
}

function setRatio(k) {
  const pr = P();
  const [w, hh] = RATIOS[k];
  pr.ratio = k; pr.width = w; pr.height = hh;
  commit();
  fitPreview();
}

/* ---------------- adding clips ---------------- */
async function addMediaClip(m, opts = {}) {
  if (m.type !== 'image' && !m.duration) {
    toast('Reading media…');
    await Assets.probe(m);
  }
  const type = m.type;
  const dur = type === 'image' ? 5 : (m.duration || 5);
  const c = newClip(type, 0, dur, { mediaId: m.id });
  let tr = null;
  if (opts.trackId) {
    tr = P().tracks.find(t => t.id === opts.trackId);
    if (tr && !compatible(c, tr)) tr = null;
  }
  if (tr) {
    c.start = opts.start ?? S.time;
    tr.clips.push(c);
    resolvePlacement(c, tr, 'free');
  } else if (type === 'audio') {
    c.start = opts.start ?? S.time;
    freeTrackFor(c).clips.push(c);
  } else if (opts.overlay) {
    c.start = opts.start ?? S.time;
    c.transform.scale = 0.5;
    freeTrackFor(c).clips.push(c);
  } else {
    const main = mainTrack();
    c.start = main.clips.reduce((e, x) => Math.max(e, clipEnd(x)), 0);
    main.clips.push(c);
  }
  S.selected = c.id;
  commit();
  if (!opts.overlay && type !== 'audio' && !opts.trackId) seek(c.start);
  ensurePlayheadVisible();
}
function addText(preset = null) {
  const c = newClip('text', S.time, 3, { text: defaultText() });
  if (preset) {
    Object.assign(c.text, deep(preset.t));
    if (preset.y) c.transform.y = P().height * preset.y;
    if (preset.x) c.transform.x = P().width * preset.x;
  }
  document.fonts?.load(`${c.text.weight} 40px "${c.text.font}"`).catch(() => { });
  freeTrackFor(c).clips.push(c);
  S.selected = c.id;
  S.inspTab = 'text';
  commit();
  setTimeout(() => { const ta = $('#inspector textarea'); ta && (ta.focus(), ta.select()); }, 30);
}
function addSticker(emoji) {
  const c = newClip('sticker', S.time, 3, { emoji, size: 200 });
  freeTrackFor(c).clips.push(c);
  S.selected = c.id;
  commit();
}

/* ---------------- upload ---------------- */
function pickFiles(kind = null) {
  const inp = $('#fileInput');
  inp.accept = kind === 'audio' ? 'audio/*,.m4a,.flac,.opus' : 'video/*,image/*,audio/*,.mkv,.mov,.avi,.wmv,.flv,.3gp,.m4a,.flac,.opus';
  inp.value = '';
  inp.click();
}
async function uploadFiles(files, kindHint = null) {
  const jobs = [...files].map(async f => {
    const kind = kindHint || (f.type.startsWith('audio') ? 'audio' : f.type.startsWith('image') ? 'image' : 'video');
    const u = { id: uid('u'), name: f.name, progress: 0, kind };
    Uploads.push(u);
    renderLeftPanel();
    const fd = new FormData();
    fd.append('file', f, f.name);
    if (kindHint) fd.append('kind', kindHint);
    let lastDraw = 0;
    try {
      const res = await API.upload('api/upload.php', fd, pr => {
        u.progress = pr;
        if (performance.now() - lastDraw > 150) { lastDraw = performance.now(); renderLeftPanel(); }
      });
      const m = res.media;
      S.media.unshift(m);
      Uploads.splice(Uploads.indexOf(u), 1);
      renderLeftPanel();
      await Assets.probe(m);
      renderLeftPanel();
      if (res.media.transcoded) toast(`${f.name} was converted to MP4`, 'ok');
      return m;
    } catch (e) {
      Uploads.splice(Uploads.indexOf(u), 1);
      renderLeftPanel();
      toast(`${f.name}: ${e.message}`, 'err', 6000);
      return null;
    }
  });
  return Promise.all(jobs);
}
async function deleteMedia(m) {
  const n = allClips().filter(x => x.c.mediaId === m.id).length;
  if (!confirm(n ? `"${m.name}" is used by ${n} clip(s). Delete it and remove those clips?` : `Delete "${m.name}" from the library?`)) return;
  try {
    await API.post('api/media.php', { action: 'delete', id: m.id });
    S.media = S.media.filter(x => x !== m);
    if (n) { for (const t of P().tracks) t.clips = t.clips.filter(c => c.mediaId !== m.id); if (S.selected && !findClip(S.selected)) S.selected = null; commit(); }
    renderLeftPanel();
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- voiceover recorder ---------------- */
const Recorder = {
  active: false, rec: null, chunks: [], startT: 0, stream: null,
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { return toast('Microphone permission denied', 'err'); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : {});
    this.chunks = [];
    this.startT = S.time;
    this.rec.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = async () => {
      this.stream.getTracks().forEach(t => t.stop());
      const type = this.rec.mimeType || 'audio/webm';
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File(this.chunks, `voiceover-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${ext}`, { type });
      const [m] = await uploadFiles([file], 'audio');
      if (m) await addMediaClip(m, { start: this.startT });
    };
    this.rec.start(200);
    this.active = true;
    renderLeftPanel();
    play();
    toast('Recording… speak now', 'ok');
  },
  stop() {
    if (!this.active) return;
    this.active = false;
    pause();
    this.rec.stop();
    renderLeftPanel();
  },
};

function downloadBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
