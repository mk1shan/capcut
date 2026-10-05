/* ClipLab Studio — cut & edit tools: delete left/right (Q/W), split all, remove gaps, beats, remove silence,
   reverse, replace, speed curves, voice effects */
'use strict';

/* ---------------- target clip helpers ---------------- */
function clipAtPlayhead(preferSel = true) {
  const t = S.time;
  const c = selClip();
  if (preferSel && c && t > c.start + 0.02 && t < clipEnd(c) - 0.02) return c;
  const hits = allClips().filter(x => t > x.c.start + 0.02 && t < clipEnd(x.c) - 0.02);
  return (hits.find(x => x.t.main) || hits[0])?.c || null;
}

/** Q — delete everything in the clip left of the playhead */
function deleteLeft() {
  const c = clipAtPlayhead();
  if (!c) return toast('Put the playhead over a clip');
  S.selected = c.id;
  splitAtPlayhead();
  const right = S.selected;
  S.selected = c.id;
  cmd('delete');
  S.selected = right;
  const r = findClip(right)?.c; if (r) seek(r.start);
  renderInspector();
}
/** W — delete everything in the clip right of the playhead */
function deleteRight() {
  const c = clipAtPlayhead();
  if (!c) return toast('Put the playhead over a clip');
  S.selected = c.id;
  splitAtPlayhead();
  cmd('delete');
  S.selected = c.id;
  renderInspector();
}
function splitAll() {
  const t = S.time;
  const ids = allClips().filter(x => t > x.c.start + 0.02 && t < clipEnd(x.c) - 0.02).map(x => x.c.id);
  if (!ids.length) return toast('Nothing under the playhead to split');
  for (const id of ids) { S.selected = id; splitAtPlayhead(); }
  S.selected = null; renderInspector();
  toast(`Split ${ids.length} clip(s)`, 'ok');
}
function removeGaps() {
  const c = selClip();
  const tr = c ? trackOf(c) : mainTrack();
  sortTrack(tr);
  let t = tr.main ? 0 : (tr.clips[0]?.start || 0);
  let moved = 0;
  for (const x of tr.clips) { if (Math.abs(x.start - t) > 0.001) moved++; x.start = t; t = clipEnd(x); }
  commit();
  toast(moved ? `Closed gaps on “${tr.name}”` : 'No gaps on this track', moved ? 'ok' : '');
}

/* ---------------- beats ---------------- */
async function peaksFor(c) {
  const m = mediaById(c.mediaId);
  if (!m) return null;
  let pk = Assets.peaks.get(m.id);
  if (!pk || pk === 'loading') { Assets.peaks.delete(m.id); await Assets.loadPeaks(m); pk = Assets.peaks.get(m.id); }
  return pk && pk.data ? pk : null;
}
function detectBeats(pk, from, to, sens = 1) {
  const d = pk.data, pps = pk.pps, out = [];
  const i0 = Math.max(1, Math.floor(from * pps)), i1 = Math.min(d.length - 1, Math.ceil(to * pps));
  const win = Math.round(pps * 0.6);
  let last = -1e9;
  for (let i = i0; i < i1; i++) {
    let mean = 0, n = 0;
    for (let j = Math.max(0, i - win); j < Math.min(d.length, i + win); j++) { mean += d[j]; n++; }
    mean /= n || 1;
    const rise = d[i] - d[i - 1];
    if (d[i] > mean * (1.25 + 0.35 / sens) && d[i] > 0.2 && rise > 0.05 && d[i] >= d[i + 1] && (i - last) / pps > 0.22) { out.push(i / pps); last = i; }
  }
  return out;
}
async function beatsTool() {
  const c = selClip();
  if (!c || !isAV(c)) return toast('Select a music (or video) clip first');
  const pk = await peaksFor(c);
  if (!pk) return toast('Could not read the audio of this clip', 'err');
  Modal.open(card => {
    card.append(h('h2', {}, 'Beat sync'));
    card.append(h('p', { class: 'muted', style: { lineHeight: 1.5 } }, 'Finds the beats in the selected clip. Add yellow markers to snap to, or let the editor cut your main-track video on the beat automatically.'));
    const sens = h('input', { type: 'range', min: 0.3, max: 3, step: 0.1, value: 1 });
    const every = h('select', {}, ...[1, 2, 4].map(v => h('option', { value: v }, v === 1 ? 'Every beat' : `Every ${v} beats`)));
    card.append(h('div', { class: 'form-grid' }, h('label', {}, 'Sensitivity'), sens, h('label', {}, 'Use'), every));
    const info = h('p', { class: 'muted', style: { marginTop: '12px' } });
    const calc = () => {
      const src = detectBeats(pk, c.in, c.in + srcSpan(c), +sens.value);
      const tl = src.map(s => c.start + (s - c.in) / c.speed).filter((_, i) => i % +every.value === 0);
      info.textContent = `${tl.length} beats found.`;
      return tl;
    };
    sens.oninput = calc; every.onchange = calc; calc();
    card.append(info);
    card.append(h('div', { class: 'foot' },
      h('button', { class: 'btn', onclick: () => Modal.close() }, 'Cancel'),
      h('button', { class: 'btn', onclick: () => { P().markers = P().markers.filter(m => !m.auto); for (const t of calc()) P().markers.push({ t: round(t, 3), auto: true }); Modal.close(); commit(); toast('Beat markers added', 'ok'); } }, iconEl('flag'), 'Add markers'),
      h('button', { class: 'btn primary', onclick: () => { cutOnBeats(calc()); Modal.close(); } }, iconEl('split'), 'Cut main track on beats')));
  });
}
function cutOnBeats(times) {
  const main = mainTrack();
  let n = 0;
  for (const t of times) {
    const c = main.clips.find(x => t > x.start + 0.05 && t < clipEnd(x) - 0.05);
    if (!c) continue;
    const keep = S.time; S.time = t; S.selected = c.id; splitAtPlayhead(); S.time = keep; n++;
  }
  P().markers = P().markers.filter(m => !m.auto);
  for (const t of times) P().markers.push({ t: round(t, 3), auto: true });
  commit();
  toast(n ? `Cut ${n} times on the beat — now add transitions or effects!` : 'No main-track clips under the beats', n ? 'ok' : '');
}

/* ---------------- remove silences (auto jump cut) ---------------- */
async function silenceTool() {
  const c = selClip();
  if (!c || !isAV(c)) return toast('Select a video or audio clip with speech');
  if (curvePts(c)) return toast('Remove the speed curve first');
  const pk = await peaksFor(c);
  if (!pk) return toast('Could not read the audio of this clip', 'err');
  Modal.open(card => {
    card.append(h('h2', {}, 'Remove silences'));
    card.append(h('p', { class: 'muted', style: { lineHeight: 1.5 } }, 'Cuts out the quiet parts of the selected clip (pauses, breaths) and closes the gaps — the “jump cut” style used in talking-head videos.'));
    const th = h('input', { type: 'range', min: 0.02, max: 0.4, step: 0.01, value: 0.08 });
    const minS = h('input', { type: 'range', min: 0.2, max: 3, step: 0.1, value: 0.6 });
    const pad = h('input', { type: 'range', min: 0, max: 0.5, step: 0.02, value: 0.12 });
    const info = h('p', { class: 'muted', style: { marginTop: '12px' } });
    card.append(h('div', { class: 'form-grid' }, h('label', {}, 'Quiet level'), th, h('label', {}, 'Min. pause (s)'), minS, h('label', {}, 'Keep padding (s)'), pad));
    card.append(info);
    const calc = () => {
      const keeps = findSpeech(pk, c.in, c.in + srcSpan(c), +th.value, +minS.value, +pad.value);
      const kept = keeps.reduce((a, [s, e]) => a + e - s, 0);
      info.textContent = `${keeps.length} parts kept · removes ${(srcSpan(c) - kept).toFixed(1)}s of ${srcSpan(c).toFixed(1)}s`;
      return keeps;
    };
    [th, minS, pad].forEach(i => i.oninput = calc); calc();
    card.append(h('div', { class: 'foot' },
      h('button', { class: 'btn', onclick: () => Modal.close() }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: () => { applyKeeps(c, calc()); Modal.close(); } }, 'Remove silences')));
  });
}
function findSpeech(pk, from, to, th, minSil, pad) {
  const d = pk.data, pps = pk.pps;
  const i0 = Math.floor(from * pps), i1 = Math.min(d.length, Math.ceil(to * pps));
  const sil = [];
  let s = null;
  for (let i = i0; i < i1; i++) {
    const quiet = d[i] < th;
    if (quiet && s === null) s = i;
    if ((!quiet || i === i1 - 1) && s !== null) { const e = quiet ? i + 1 : i; if ((e - s) / pps >= minSil) sil.push([s / pps, e / pps]); s = null; }
  }
  const keeps = [];
  let cur = from;
  for (const [a, b] of sil) {
    const ka = cur, kb = Math.min(to, a + pad);
    if (kb - ka > 0.08) keeps.push([ka, kb]);
    cur = Math.max(from, b - pad);
  }
  if (to - cur > 0.08) keeps.push([cur, to]);
  return keeps;
}
function applyKeeps(c, keeps) {
  if (!keeps.length) return toast('Everything is silent at this level — lower “Quiet level”');
  const tr = trackOf(c);
  const oldEnd = clipEnd(c);
  const idx = tr.clips.indexOf(c);
  tr.clips.splice(idx, 1);
  let t = c.start;
  const parts = keeps.map(([a, b], i) => {
    const p = deep(c);
    p.id = uid('c'); p.in = a; p.start = t; p.duration = (b - a) / c.speed; p.keyframes = {};
    if (i > 0) { p.transition = { type: 'none', dur: 0.5 }; p.anim.in = 'none'; p.fadeIn = 0; }
    if (i < keeps.length - 1) { p.anim.out = 'none'; p.fadeOut = 0; }
    t += p.duration;
    return p;
  });
  tr.clips.splice(idx, 0, ...parts);
  const removed = oldEnd - t;
  for (const o of tr.clips) if (!parts.includes(o) && o.start >= oldEnd - 0.001) o.start -= removed;
  S.selected = parts[0].id;
  commit();
  toast(`Removed ${removed.toFixed(1)}s of silence`, 'ok');
}

/* ---------------- reverse / replace ---------------- */
async function reverseClip() {
  const c = selClip();
  if (!c || !isAV(c)) return toast('Select a video or audio clip');
  if (!APP.ffmpeg) return toast('Reverse needs FFmpeg installed on this PC (see README)', 'err', 6000);
  const span = srcSpan(c);
  toast('Reversing… this can take a moment', '', 6000);
  try {
    const r = await API.post('api/reverse.php', { id: c.mediaId, start: c.in, end: c.in + span });
    const m = r.media;
    S.media.unshift(m);
    await Assets.probe(m);
    c.mediaId = m.id; c.in = 0;
    if (c.curve && c.curve !== 'none') { const pts = SPEED_CURVES[c.curve].pts; const rev = Object.entries(SPEED_CURVES).find(([, v]) => JSON.stringify(v.pts) === JSON.stringify(pts?.map(([x, y]) => [1 - x, y]).reverse())); c.curve = rev ? rev[0] : 'none'; }
    disposeClipEl(c.id);
    commit();
    renderLeftPanel();
    toast('Clip reversed', 'ok');
  } catch (e) { toast(e.message, 'err', 7000); }
}
function replaceClip() {
  const c = selClip();
  if (!c || !c.mediaId) return toast('Select a video, image or audio clip');
  const kind = c.type;
  const list = S.media.filter(m => (kind === 'audio' ? m.type === 'audio' : m.type !== 'audio'));
  Modal.open(card => {
    card.append(h('h2', {}, 'Replace clip'));
    card.append(h('p', { class: 'muted' }, 'Keeps the position, length, effects and animations — swaps only the footage.'));
    const g = h('div', { class: 'media-grid', style: { maxHeight: '50vh', overflow: 'auto' } });
    for (const m of list) {
      const th = Assets.thumbs.get(m.id);
      g.append(h('div', { class: 'media-card', onclick: () => {
        c.mediaId = m.id; c.type = m.type === 'image' ? 'image' : m.type;
        c.in = 0;
        if (m.type !== 'image' && m.duration) c.duration = Math.min(c.duration, m.duration / c.speed);
        disposeClipEl(c.id); Modal.close(); commit();
      } }, h('div', { class: 'thumb', style: th ? { backgroundImage: `url("${th}")` } : {} }, th ? '' : iconEl(m.type === 'audio' ? 'music' : 'video')), h('div', { class: 'meta' }, h('span', {}, m.name))));
    }
    card.append(g, h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => Modal.close() }, 'Cancel')));
  });
}

/* ---------------- speed curve + voice + tools in the inspector ---------------- */
function setCurve(c, name) {
  const span = srcSpan(c), oldEnd = clipEnd(c);
  c.curve = name;
  c.duration = span / (c.speed * curveAvg(curvePts(c)));
  for (const k of Object.keys(c.keyframes || {})) c.keyframes[k] = c.keyframes[k].filter(x => x.t <= c.duration);
  magneticShift(c, oldEnd);
  rippleIfOverlap(c);
  commit();
}
const _inspSpeed = inspSpeed;
inspSpeed = function (b, c) {
  _inspSpeed(b, c);
  b.append(secTitle('Speed curve'));
  const g = h('div', { class: 'chips', style: { marginBottom: '8px' } });
  for (const [k, v] of Object.entries(SPEED_CURVES)) g.append(h('span', { class: 'chip' + ((c.curve || 'none') === k ? ' active' : ''), onclick: () => setCurve(c, k) }, v.name));
  b.append(g);
  const pts = curvePts(c);
  if (pts) {
    const cv = h('canvas', { width: 280, height: 70, style: { width: '100%', height: '70px', background: 'var(--bg-3)', borderRadius: '8px' } });
    const x = cv.getContext('2d');
    const maxY = Math.max(...pts.map(p => p[1]), 1);
    x.strokeStyle = '#3a3e45'; x.beginPath(); const y1 = 65 - (1 / maxY) * 60; x.moveTo(0, y1); x.lineTo(280, y1); x.stroke();
    x.strokeStyle = '#18d4c4'; x.lineWidth = 2; x.beginPath();
    for (let i = 0; i <= 280; i++) { const v = curveMul(pts, i / 280); const y = 65 - (v / maxY) * 60; i ? x.lineTo(i, y) : x.moveTo(i, y); }
    x.stroke();
    b.append(cv, h('p', { class: 'hint', style: { color: 'var(--text-3)', fontSize: '11.5px' } }, 'Line above the grey 1× mark = faster, below = slow motion.'));
  }
};
const _inspAudio = inspAudio;
inspAudio = function (b, c) {
  _inspAudio(b, c);
  b.append(secTitle('Voice effect'));
  const g = h('div', { class: 'chips', style: { marginBottom: '8px' } });
  for (const [k, v] of Object.entries(VOICE_FX)) g.append(h('span', { class: 'chip' + ((c.voice || 'none') === k ? ' active' : ''), onclick: () => { c.voice = k; commit(); } }, v));
  b.append(g);
  b.append(secTitle('Tools'));
  b.append(h('div', { class: 'row wrap' },
    h('button', { class: 'btn sm', onclick: beatsTool }, '🥁 Beat sync'),
    h('button', { class: 'btn sm', onclick: silenceTool }, '✂️ Remove silences'),
    h('button', { class: 'btn sm', onclick: reverseClip }, '⏪ Reverse')));
};
const _inspBasic = inspBasic;
inspBasic = function (b, c) {
  _inspBasic(b, c);
  if (c.mediaId) {
    b.append(secTitle('Clip tools'));
    const row = h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', onclick: replaceClip }, '🔁 Replace'));
    if (c.type === 'video') row.append(
      h('button', { class: 'btn sm', onclick: reverseClip }, '⏪ Reverse'),
      h('button', { class: 'btn sm', onclick: () => cmd('freeze') }, '❄️ Freeze'),
      h('button', { class: 'btn sm', onclick: silenceTool }, '✂️ Remove silences'),
      h('button', { class: 'btn sm', onclick: () => cmd('detachAudio') }, '🎵 Extract audio'));
    b.append(row);
  }
};

/* ---------------- toolbar buttons + shortcuts ---------------- */
(function addToolbar() {
  const bar = document.querySelector('.tl-toolbar');
  const dup = bar.querySelector('[data-cmd="duplicate"]');
  const mk = (title, label, fn) => { const b = h('button', { title, style: { width: 'auto', padding: '0 7px', fontSize: '12px', fontWeight: 600 }, onclick: fn }, label); return b; };
  const items = [
    h('span', { class: 'sep' }),
    mk('Delete left of playhead (Q)', '⇤Q', deleteLeft),
    mk('Delete right of playhead (W)', 'W⇥', deleteRight),
    mk('Split every track at the playhead', '✂ all', splitAll),
    mk('Remove gaps on the track', '⇥⇤', removeGaps),
    mk('Beat sync: find beats / cut on beat', '🥁', beatsTool),
    mk('Remove silences (auto jump cut)', '🔇✂', silenceTool),
    mk('Reverse clip', '⏪', reverseClip),
  ];
  dup.after(...items);
})();
window.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'select' || (tag === 'input' && !['range', 'checkbox', 'color'].includes(e.target.type)) || Modal.isOpen || S.exporting) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'q') { e.preventDefault(); deleteLeft(); }
  else if (k === 'w') { e.preventDefault(); deleteRight(); }
});
