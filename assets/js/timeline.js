/* ClipLab Studio — timeline: tracks, clips, ruler, drag/trim/snap */
'use strict';

const TL = { rowH: { visual: 58, audio: 46, main: 66 }, drag: null };
const HEAD_W = 132;

function trackRowHeight(tr) { return tr.main ? TL.rowH.main : tr.kind === 'audio' ? TL.rowH.audio : TL.rowH.visual; }
function timeToX(t) { return t * S.pps; }
function xToTime(x) { return x / S.pps; }

function timelineWidth() {
  const vis = $('#tlScroll').clientWidth - HEAD_W;
  return Math.max(vis, timeToX(projectDuration() + 30));
}

function renderTimeline() {
  const rows = $('#tlRows');
  const inner = $('#tlInner');
  inner.style.width = (timelineWidth() + HEAD_W) + 'px';
  rows.innerHTML = '';
  const anyClip = P().tracks.some(t => t.clips.length);
  P().tracks.forEach((tr, ti) => {
    const row = h('div', { class: 'tl-row' + (tr.main ? ' main' : '') + (tr.hidden ? ' hidden-track' : ''), 'data-track': tr.id, style: { height: trackRowHeight(tr) + 'px' } });
    const head = h('div', { class: 'tl-head' },
      iconEl(tr.kind === 'audio' ? 'audio' : tr.main ? 'video' : 'overlay'),
      h('span', { class: 'nm', title: tr.name }, tr.name),
    );
    const muteBtn = h('button', { class: tr.muted ? 'off' : '', title: tr.muted ? 'Unmute track' : 'Mute track', onclick: () => { tr.muted = !tr.muted; commit(); } }, iconEl(tr.muted ? 'volumeX' : 'volume'));
    head.append(muteBtn);
    if (tr.kind === 'visual') head.append(h('button', { class: tr.hidden ? 'off' : '', title: tr.hidden ? 'Show track' : 'Hide track', onclick: () => { tr.hidden = !tr.hidden; commit(); } }, iconEl(tr.hidden ? 'eyeOff' : 'eye')));
    if (!tr.main) head.append(h('button', { title: 'Delete track', onclick: () => deleteTrack(tr) }, iconEl('close')));
    const lane = h('div', { class: 'tl-lane' });
    for (const c of tr.clips) lane.append(clipNode(c, tr));
    row.append(head, lane);
    rows.append(row);
  });
  if (!anyClip) rows.append(h('div', { class: 'tl-empty' }, 'Import media on the left, then click + or drag it here to start editing.'));
  // markers
  $$('.tl-marker', inner).forEach(m => m.remove());
  for (const mk of P().markers) {
    const el = h('div', { class: 'tl-marker', title: 'Marker ' + fmtTime(mk.t) + ' (right-click to delete)', style: { left: (HEAD_W + timeToX(mk.t)) + 'px' } });
    el.addEventListener('click', e => { e.stopPropagation(); seek(mk.t); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); P().markers = P().markers.filter(x => x !== mk); commit(); });
    $('#tlRuler').parentElement.append(el);
  }
  drawRuler();
  updatePlayhead();
  $('#tDur').textContent = fmtTime(projectDuration());
}

function clipNode(c, tr) {
  const m = c.mediaId ? mediaById(c.mediaId) : null;
  const el = h('div', {
    class: `clip t-${c.type}` + (c.id === S.selected ? ' selected' : '') + (c.muted ? ' muted' : ''),
    'data-clip': c.id,
    style: { left: timeToX(c.start) + 'px', width: Math.max(4, timeToX(c.duration)) + 'px' },
    title: `${clipLabel(c)}\n${fmtTime(c.start)} → ${fmtTime(clipEnd(c))} (${c.duration.toFixed(2)}s)` + (c.speed !== 1 ? `\nSpeed ${c.speed}x` : ''),
  });
  if ((c.type === 'video' || c.type === 'image') && m) {
    const th = Assets.thumbs.get(m.id) || (c.type === 'image' ? m.url : null);
    if (th) el.append(h('div', { class: 'strip', style: { backgroundImage: `url("${th}")` } }));
  }
  if (c.type === 'video' || c.type === 'audio') {
    const pk = m && Assets.peaks.get(m.id);
    if (pk && pk.data) el.append(waveCanvas(c, pk));
  }
  let lbl = esc(clipLabel(c));
  const badges = [];
  if (c.speed !== 1) badges.push(c.speed + 'x');
  if (c.filter && c.filter !== 'none') badges.push('🎨');
  if (c.effect && c.effect !== 'none') badges.push('✨');
  if (c.chroma?.on) badges.push('🟩');
  el.append(h('div', { class: 'lbl', html: (badges.length ? `<b>${badges.join(' ')}</b>` : '') + lbl }));
  if (c.transition?.type && c.transition.type !== 'none') el.append(h('div', { class: 'tr', style: { width: timeToX(Math.min(c.transition.dur, c.duration)) + 'px' } }));
  // keyframe diamonds
  const kt = new Set();
  for (const k of Object.values(c.keyframes || {})) for (const key of k) kt.add(round(key.t, 2));
  for (const t of kt) el.append(h('div', { class: 'kf', style: { left: timeToX(t) + 'px' } }));
  el.append(h('div', { class: 'h l', 'data-h': 'l' }), h('div', { class: 'h r', 'data-h': 'r' }));
  el.addEventListener('pointerdown', e => onClipPointerDown(e, c));
  el.addEventListener('dblclick', () => { select(c.id); });
  el.addEventListener('contextmenu', e => { e.preventDefault(); select(c.id); clipContextMenu(e, c); });
  return el;
}

function waveCanvas(c, pk) {
  const w = Math.min(4000, Math.max(4, Math.round(timeToX(c.duration))));
  const cv = h('canvas', { class: 'wave' });
  cv.width = w; cv.height = 40;
  const x = cv.getContext('2d');
  x.fillStyle = c.type === 'audio' ? 'rgba(200,255,220,.85)' : 'rgba(170,240,255,.75)';
  const srcStart = c.in, srcSpan = c.duration * c.speed;
  for (let i = 0; i < w; i++) {
    const st = srcStart + (i / w) * srcSpan;
    const v = pk.data[Math.floor(st * pk.pps)] || 0;
    const hh = Math.max(1, v * 38 * Math.min(1.5, c.volume || 1));
    x.fillRect(i, (40 - hh) / 2, 1, hh);
  }
  return cv;
}

/* ---------------- ruler ---------------- */
function drawRuler() {
  const sc = $('#tlScroll');
  const cv = $('#rulerCanvas');
  const visW = sc.clientWidth - HEAD_W;
  const left = sc.scrollLeft;
  const dpr = window.devicePixelRatio || 1;
  cv.style.left = left + 'px';
  cv.style.width = visW + 'px';
  cv.width = Math.max(1, visW * dpr); cv.height = 26 * dpr;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  x.clearRect(0, 0, visW, 26);
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find(s => s * S.pps >= 70) || 600;
  const minor = step / 5;
  const t0 = xToTime(left), t1 = xToTime(left + visW);
  x.strokeStyle = '#4a4f57'; x.fillStyle = '#8a8f98'; x.font = '10.5px Inter, sans-serif'; x.textBaseline = 'top';
  x.beginPath();
  for (let i = Math.floor(t0 / minor); i * minor <= t1 + minor; i++) {
    const t = Math.round(i * minor * 1000) / 1000;
    const px = Math.round(timeToX(t) - left) + 0.5;
    const major = i % 5 === 0;
    x.moveTo(px, major ? 14 : 20); x.lineTo(px, 26);
    if (major) x.fillText(step < 1 ? fmtTime(t) : fmtTime(t, false), px + 4, 4);
  }
  x.stroke();
}

function updatePlayhead() {
  const ph = $('#playhead');
  ph.style.left = (HEAD_W + timeToX(S.time)) + 'px';
  $('#tCur').textContent = fmtTime(S.time);
}

function ensurePlayheadVisible() {
  const sc = $('#tlScroll');
  const x = timeToX(S.time);
  const visW = sc.clientWidth - HEAD_W;
  if (x < sc.scrollLeft || x > sc.scrollLeft + visW - 40) sc.scrollLeft = Math.max(0, x - visW * 0.2);
}

/* ---------------- snapping ---------------- */
function snapPoints(excludeId) {
  const pts = [0, S.time];
  for (const { c } of allClips()) if (c.id !== excludeId) pts.push(c.start, clipEnd(c));
  for (const m of P().markers) pts.push(m.t);
  return pts;
}
function snapTime(t, pts, alt = null) {
  if (!S.snap) return { t, snapped: null };
  const th = 8 / S.pps;
  let best = null, bd = th;
  for (const p of pts) {
    const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; }
  }
  return best == null ? { t, snapped: null } : { t: best, snapped: best };
}
function showSnapLine(t) {
  let l = $('#snapLine');
  if (t == null) { l && l.remove(); return; }
  if (!l) { l = h('div', { class: 'snap-line', id: 'snapLine' }); $('#tlInner').append(l); }
  l.style.left = (HEAD_W + timeToX(t)) + 'px';
}

/* ---------------- clip interactions ---------------- */
function onClipPointerDown(e, c) {
  if (e.button !== 0) return;
  e.stopPropagation();
  const handle = e.target.dataset.h;
  if (S.selected !== c.id) select(c.id, { noScroll: true });
  const el = e.currentTarget;
  const tr = trackOf(c);
  const startX = e.clientX, startY = e.clientY;
  const orig = { start: c.start, duration: c.duration, in: c.in, trackId: tr.id };
  const pts = snapPoints(c.id);
  let moved = false;
  let targetTrack = tr;
  const kfShift = handle === 'l';

  const onMove = ev => {
    const dx = ev.clientX - startX;
    if (!moved && Math.abs(dx) < 3 && Math.abs(ev.clientY - startY) < 3) return;
    moved = true;
    const dt = xToTime(dx);
    if (!handle) {
      el.classList.add('dragging');
      let ns = Math.max(0, orig.start + dt);
      // snap either edge
      const s1 = snapTime(ns, pts), s2 = snapTime(ns + c.duration, pts);
      if (s1.snapped != null && (s2.snapped == null || Math.abs(s1.t - ns) <= Math.abs(s2.t - (ns + c.duration)))) { ns = s1.t; showSnapLine(s1.snapped); }
      else if (s2.snapped != null) { ns = s2.t - c.duration; showSnapLine(s2.snapped); }
      else showSnapLine(null);
      c.start = Math.max(0, ns);
      el.style.left = timeToX(c.start) + 'px';
      // vertical: find row under pointer
      const rowEl = document.elementsFromPoint(ev.clientX, ev.clientY).find(n => n.classList?.contains('tl-row'));
      if (rowEl) {
        const t2 = P().tracks.find(t => t.id === rowEl.dataset.track);
        if (t2 && t2 !== targetTrack && compatible(c, t2)) {
          targetTrack = t2;
          rowEl.querySelector('.tl-lane').append(el);
        }
      }
    } else if (handle === 'l') {
      const maxShift = c.type === 'video' || c.type === 'audio' ? orig.in / c.speed : Infinity;
      let ns = orig.start + dt;
      const sn = snapTime(ns, pts); ns = sn.t; showSnapLine(sn.snapped);
      let shift = ns - orig.start;
      shift = clamp(shift, -Math.min(maxShift, orig.start), orig.duration - 0.1);
      c.start = orig.start + shift;
      c.duration = orig.duration - shift;
      if (isAV(c)) c.in = orig.in + shift * c.speed;
      el.style.left = timeToX(c.start) + 'px';
      el.style.width = timeToX(c.duration) + 'px';
    } else if (handle === 'r') {
      let ne = orig.start + orig.duration + dt;
      const sn = snapTime(ne, pts); ne = sn.t; showSnapLine(sn.snapped);
      let nd = ne - orig.start;
      const maxD = isAV(c) ? (srcDurationOf(c) - c.in) / c.speed : Infinity;
      c.duration = clamp(nd, 0.1, maxD);
      el.style.width = timeToX(c.duration) + 'px';
    }
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    showSnapLine(null);
    el.classList.remove('dragging');
    if (!moved) return;
    if (kfShift && c.keyframes) {
      const shift = c.start - orig.start;
      for (const k of Object.keys(c.keyframes)) {
        c.keyframes[k] = c.keyframes[k].map(x => ({ t: x.t - shift, v: x.v })).filter(x => x.t >= -0.001 && x.t <= c.duration + 0.001);
        if (!c.keyframes[k].length) delete c.keyframes[k];
      }
    }
    if (handle === 'r' && c.keyframes) {
      for (const k of Object.keys(c.keyframes)) { c.keyframes[k] = c.keyframes[k].filter(x => x.t <= c.duration + 0.001); if (!c.keyframes[k].length) delete c.keyframes[k]; }
    }
    // magnetic main track: trimming closes the gap instead of leaving a hole
    if (tr.main && targetTrack === tr && handle === 'r') magneticShift(c, orig.start + orig.duration);
    if (tr.main && targetTrack === tr && handle === 'l') {
      const shift = c.start - orig.start;
      c.start = orig.start;
      for (const o of tr.clips) if (o !== c && o.start >= orig.start + orig.duration - 0.001) o.start = Math.max(0, o.start - shift);
    }
    // move to target track
    if (targetTrack !== tr) { tr.clips.splice(tr.clips.indexOf(c), 1); targetTrack.clips.push(c); }
    resolvePlacement(c, targetTrack, handle ? 'push' : 'free');
    commit();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function compatible(c, tr) { return (c.type === 'audio') === (tr.kind === 'audio'); }

function overlaps(a, b) { return a.start < clipEnd(b) - 0.001 && b.start < clipEnd(a) - 0.001; }

/** after a move/resize: make sure clip does not overlap others on its track */
function resolvePlacement(c, tr, mode = 'free') {
  const others = tr.clips.filter(o => o !== c);
  if (!others.some(o => overlaps(o, c))) { sortTrack(tr); return; }
  if (mode === 'push') { rippleAfter(tr, c); return; }
  // free move: move clip to another compatible track without overlap, or a new one
  tr.clips.splice(tr.clips.indexOf(c), 1);
  const target = freeTrackFor(c, tr);
  target.clips.push(c);
  sortTrack(target);
}
function sortTrack(tr) { tr.clips.sort((a, b) => a.start - b.start); }
function rippleAfter(tr, c) {
  sortTrack(tr);
  let end = clipEnd(c);
  for (const o of tr.clips) {
    if (o === c || o.start < c.start) continue;
    if (o.start < end) o.start = end;
    end = clipEnd(o);
  }
}
/** find (or create) a track where clip fits without overlapping */
function freeTrackFor(c, prefer = null) {
  const kind = c.type === 'audio' ? 'audio' : 'visual';
  const cands = P().tracks.filter(t => t.kind === kind && t !== prefer && !(t.main && c.type !== 'video' && c.type !== 'image'));
  if (prefer && prefer.kind === kind && !prefer.clips.some(o => o !== c && overlaps(o, c))) return prefer;
  // prefer overlay tracks nearest the main track
  for (const t of cands) if (!t.clips.some(o => o !== c && overlaps(o, c))) return t;
  return addTrack(kind, c.type === 'text' ? 'Text' : c.type === 'sticker' ? 'Sticker' : c.type === 'effect' ? 'Effects' : null);
}
function addTrack(kind, label = null) {
  const p = P();
  if (kind === 'audio') {
    const n = p.tracks.filter(t => t.kind === 'audio').length + 1;
    const t = { id: uid('t'), kind: 'audio', name: 'Audio ' + n, muted: false, hidden: false, clips: [] };
    p.tracks.push(t);
    return t;
  }
  const n = p.tracks.filter(t => t.kind === 'visual' && !t.main).length + 1;
  const t = { id: uid('t'), kind: 'visual', name: (label || 'Overlay') + ' ' + n, muted: false, hidden: false, clips: [] };
  // new visual tracks go on top (top row = front-most layer)
  p.tracks.unshift(t);
  return t;
}
function deleteTrack(tr) {
  if (tr.clips.length && !confirm(`Delete "${tr.name}" and its ${tr.clips.length} clip(s)?`)) return;
  P().tracks = P().tracks.filter(t => t !== tr);
  if (S.selected && !findClip(S.selected)) S.selected = null;
  commit();
}
function mainTrack() { return P().tracks.find(t => t.main); }

/* ---------------- ruler / lane scrubbing ---------------- */
function initTimelineEvents() {
  const sc = $('#tlScroll');
  sc.addEventListener('scroll', () => drawRuler());
  const scrubFrom = (e) => {
    const rect = $('#tlRuler').getBoundingClientRect();
    const move = ev => {
      const x = ev.clientX - rect.left + 0; // ruler rect already accounts for scroll
      let t = Math.max(0, xToTime(x));
      if (S.snap && ev.shiftKey) t = snapTime(t, snapPoints(null)).t;
      seek(t);
    };
    move(e);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  $('#tlRuler').addEventListener('pointerdown', e => { if (S.playing) pause(); scrubFrom(e); });
  $('#tlRows').addEventListener('pointerdown', e => {
    if (e.target.closest('.clip') || e.target.closest('.tl-head')) return;
    if (S.playing) pause();
    select(null);
    scrubFrom(e);
  });
  // ctrl + wheel zoom
  sc.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rect = sc.getBoundingClientRect();
    const mx = e.clientX - rect.left - HEAD_W + sc.scrollLeft;
    const tAt = xToTime(mx);
    setZoom(S.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    sc.scrollLeft = timeToX(tAt) - (e.clientX - rect.left - HEAD_W);
  }, { passive: false });

  // drag media from library onto lanes
  const rows = $('#tlRows');
  rows.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('text/cliplab-media')) return;
    e.preventDefault();
    $$('.tl-row.drop-ok').forEach(r => r.classList.remove('drop-ok'));
    e.target.closest('.tl-row')?.classList.add('drop-ok');
  });
  rows.addEventListener('dragleave', e => { if (!rows.contains(e.relatedTarget)) $$('.tl-row.drop-ok').forEach(r => r.classList.remove('drop-ok')); });
  rows.addEventListener('drop', e => {
    const id = e.dataTransfer.getData('text/cliplab-media');
    $$('.tl-row.drop-ok').forEach(r => r.classList.remove('drop-ok'));
    if (!id) return;
    e.preventDefault();
    const m = mediaById(id); if (!m) return;
    const lane = e.target.closest('.tl-row')?.querySelector('.tl-lane');
    const rect = (lane || rows).getBoundingClientRect();
    const t = Math.max(0, xToTime(e.clientX - rect.left));
    const trId = e.target.closest('.tl-row')?.dataset.track;
    addMediaClip(m, { start: snapTime(t, snapPoints(null)).t, trackId: trId });
  });

  // timeline height splitter
  const sp = $('#splitter');
  sp.addEventListener('pointerdown', e => {
    const startY = e.clientY;
    const startH = $('#timeline').getBoundingClientRect().height;
    sp.classList.add('drag');
    const move = ev => {
      const nh = clamp(startH - (ev.clientY - startY), 140, window.innerHeight - 260);
      document.documentElement.style.setProperty('--tl-h', nh + 'px');
      fitPreview();
    };
    const up = () => { sp.classList.remove('drag'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); try { localStorage.setItem('cl_tlh', getComputedStyle(document.documentElement).getPropertyValue('--tl-h')); } catch { } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function setZoom(pps) {
  S.pps = clamp(pps, 5, 400);
  $('#zoom').value = S.pps;
  renderTimeline();
}
function zoomFit() {
  const d = Math.max(5, projectDuration());
  setZoom(($('#tlScroll').clientWidth - HEAD_W - 40) / d);
  $('#tlScroll').scrollLeft = 0;
}

/* ---------------- context menu ---------------- */
function clipContextMenu(e, c) {
  $('#ctxMenu')?.remove();
  const items = [
    ['Split at playhead', () => cmd('split')],
    ['Duplicate', () => cmd('duplicate')],
    ['Copy', () => cmd('copy')],
    ['Delete', () => cmd('delete')],
  ];
  if (c.type === 'video') items.push(['Extract audio', () => cmd('detachAudio')], ['Freeze frame', () => cmd('freeze')]);
  if (isAV(c)) items.push([c.muted ? 'Unmute' : 'Mute', () => cmd('muteClip')]);
  if (c.type !== 'audio') items.push(['Reset transform', () => { c.transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }; c.keyframes = {}; commit(); }]);
  const menu = h('div', { id: 'ctxMenu', style: { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', zIndex: 300, background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: '8px', padding: '4px', minWidth: '170px', boxShadow: '0 10px 30px rgba(0,0,0,.5)' } });
  for (const [label, fn] of items) {
    menu.append(h('div', {
      style: { padding: '7px 10px', borderRadius: '5px', cursor: 'pointer' },
      onmouseenter: ev => ev.target.style.background = 'var(--bg-4)', onmouseleave: ev => ev.target.style.background = '',
      onclick: () => { menu.remove(); fn(); },
    }, label));
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  if (r.bottom > innerHeight) menu.style.top = (innerHeight - r.height - 6) + 'px';
  if (r.right > innerWidth) menu.style.left = (innerWidth - r.width - 6) + 'px';
  setTimeout(() => window.addEventListener('pointerdown', function off(ev) { if (!menu.contains(ev.target)) { menu.remove(); window.removeEventListener('pointerdown', off); } }), 0);
}
