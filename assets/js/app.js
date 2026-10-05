/* ClipLab Studio — commands, playback loop, preview interaction, projects, export, boot */
'use strict';

const previewCanvas = $('#preview');
const previewCtx = previewCanvas.getContext('2d', { willReadFrequently: false });

/* ---------------- refresh ---------------- */
refreshAll = function (opts = {}) {
  renderTimeline();
  if (!opts.keepInspector) renderInspector();
  else syncInspectorKeyframes();
  if (['effects', 'filters', 'transitions', 'media', 'audio'].includes(S.leftTab)) renderLeftPanel();
  $('#projectName').value = P().name;
  $('#ratioSelect').value = P().ratio;
  fitPreview();
};

function select(id, opts = {}) {
  if (S.selected === id) return;
  S.selected = id;
  const c = selClip();
  if (c && c.type === 'text' && !opts.keepTab) S.inspTab = S.inspTab && INSP_TABS.text.some(([k]) => k === S.inspTab) ? S.inspTab : 'text';
  $$('.clip').forEach(el => el.classList.toggle('selected', el.dataset.clip === id));
  renderInspector();
  if (['effects', 'filters', 'transitions'].includes(S.leftTab)) renderLeftPanel();
  $('#inspector').classList.toggle('show', !!id);
}

/* ---------------- preview sizing ---------------- */
function fitPreview() {
  const wrap = $('#previewWrap');
  const st = $('#stage');
  const pw = wrap.clientWidth - 28, ph = wrap.clientHeight - 28;
  const r = P().width / P().height;
  let w = pw, hh = pw / r;
  if (hh > ph) { hh = ph; w = ph * r; }
  w = Math.max(40, Math.floor(w)); hh = Math.max(40, Math.floor(hh));
  st.style.width = w + 'px'; st.style.height = hh + 'px';
  if (S.exporting) return;
  // internal resolution: crisp on HiDPI, capped for performance
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const scale = Math.min(1, (w * dpr) / P().width);
  const cw = Math.round(P().width * scale), ch = Math.round(P().height * scale);
  if (previewCanvas.width !== cw || previewCanvas.height !== ch) { previewCanvas.width = cw; previewCanvas.height = ch; }
}

/* ---------------- playback ---------------- */
let lastTs = null;
function play() {
  if (S.playing) return;
  AudioEngine.ensure();
  const d = projectDuration();
  if (S.time >= d - 0.01 && !Recorder.active) S.time = 0;
  S.playing = true;
  lastTs = null;
  $('#playBtn').innerHTML = icon('pause');
}
function pause() {
  if (!S.playing) return;
  S.playing = false;
  pauseAllMedia();
  $('#playBtn').innerHTML = icon('play');
  if (Recorder.active) Recorder.stop();
  if (S.selected) syncInspectorKeyframes();
}
function togglePlay() { S.playing ? pause() : play(); }
function seek(t) {
  S.time = clamp(t, 0, Math.max(projectDuration(), 0));
  updatePlayhead();
  syncInspectorKeyframes();
}
function frameDur() { return 1 / (P().fps || 30); }

function loop(ts) {
  if (S.precise) { lastTs = ts; requestAnimationFrame(loop); return; }
  if (S.playing) {
    const dt = lastTs == null ? 0 : Math.min(0.1, (ts - lastTs) / 1000);
    S.time += dt;
    const mc = masterClock(S.time);
    if (mc != null && Math.abs(mc - S.time) > 0.04 && Math.abs(mc - S.time) < 0.6) S.time += (mc - S.time) * 0.35;
    const d = projectDuration();
    if (S.time >= d && !Recorder.active) {
      S.time = d;
      if (S.exporting) Exporter.finish(); else pause();
    }
    if (!S.exporting && !dragPreview) ensurePlayheadVisibleSoft();
  }
  lastTs = ts;
  syncMedia(S.time, S.playing);
  if (!S.exporting) {
    renderFrame(previewCtx, S.time, { ui: !S.playing });
    updatePlayhead();
  } else {
    Exporter.frame();
  }
  if (S.playing && S.selected && (performance.now() % 200) < 20) syncInspectorKeyframes();
  requestAnimationFrame(loop);
}
function ensurePlayheadVisibleSoft() {
  const sc = $('#tlScroll');
  const x = timeToX(S.time);
  const visW = sc.clientWidth - HEAD_W;
  if (x > sc.scrollLeft + visW - 30) sc.scrollLeft = x - 60;
  else if (x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 60);
}

/* ---------------- preview interaction (move / scale / rotate) ---------------- */
let dragPreview = null;
function canvasToProject(e) {
  const r = previewCanvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * P().width, (e.clientY - r.top) / r.height * P().height];
}
previewCanvas.addEventListener('pointerdown', e => {
  if (Picker.pick(e)) return;
  if (S.playing) pause();
  const [px, py] = canvasToProject(e);
  let c = selClip();
  let mode = null;
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 16 / (previewCanvas.getBoundingClientRect().width / P().width);
  if (c && c.type !== 'audio' && c.type !== 'effect' && S.time >= c.start && S.time < clipEnd(c)) {
    if (near([px, py], rotHandlePos(c, S.time))) mode = 'rotate';
    else if (clipCorners(c, S.time).some(pt => near([px, py], pt))) mode = 'scale';
    else if (pointInClip(c, S.time, px, py)) mode = 'move';
  }
  if (!mode) {
    const hit = hitTest(px, py, S.time);
    if (hit) { select(hit.id); c = hit; mode = 'move'; }
    else { select(null); return; }
  }
  const local = clamp(S.time - c.start, 0, c.duration);
  const cx = P().width / 2 + kfValue(c, 'x', local), cy = P().height / 2 + kfValue(c, 'y', local);
  dragPreview = {
    c, mode, px, py, cx, cy,
    x0: kfValue(c, 'x', local), y0: kfValue(c, 'y', local), s0: kfValue(c, 'scale', local), r0: kfValue(c, 'rotation', local),
    d0: Math.hypot(px - cx, py - cy), a0: Math.atan2(py - cy, px - cx), moved: false,
  };
  previewCanvas.setPointerCapture(e.pointerId);
});
previewCanvas.addEventListener('pointermove', e => {
  const [px, py] = canvasToProject(e);
  if (!dragPreview) {
    const c = selClip();
    let cur = '';
    if (c && c.type !== 'audio' && c.type !== 'effect' && S.time >= c.start && S.time < clipEnd(c)) {
      const sc = previewCanvas.getBoundingClientRect().width / P().width;
      const near = (a) => Math.hypot(a[0] - px, a[1] - py) < 16 / sc;
      if (near(rotHandlePos(c, S.time))) cur = 'grab';
      else if (clipCorners(c, S.time).some(near)) cur = 'nwse-resize';
      else if (pointInClip(c, S.time, px, py)) cur = 'move';
    }
    if (!Picker.cb) previewCanvas.style.cursor = cur;
    return;
  }
  const d = dragPreview, c = d.c;
  d.moved = true;
  const set = (prop, v) => {
    if (hasKf(c, prop) && S.time >= c.start && S.time < clipEnd(c)) kfSet(c, prop, S.time - c.start, v);
    else c.transform[prop] = v;
  };
  if (d.mode === 'move') {
    let nx = d.x0 + (px - d.px), ny = d.y0 + (py - d.py);
    // snap to centre lines
    const th = 12 / (previewCanvas.getBoundingClientRect().width / P().width);
    if (Math.abs(nx) < th) nx = 0;
    if (Math.abs(ny) < th) ny = 0;
    set('x', Math.round(nx)); set('y', Math.round(ny));
  } else if (d.mode === 'scale') {
    const dist = Math.hypot(px - d.cx, py - d.cy);
    set('scale', round(clamp(d.s0 * dist / Math.max(1, d.d0), 0.02, 20), 4));
  } else if (d.mode === 'rotate') {
    const a = Math.atan2(py - d.cy, px - d.cx);
    const rotHandleBase = Math.atan2(-1, 0); // handle points "up"
    let deg = d.r0 + (a - d.a0) * 180 / Math.PI;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    else { const snapped = Math.round(deg / 90) * 90; if (Math.abs(deg - snapped) < 3) deg = snapped; }
    set('rotation', round(deg, 1));
  }
});
previewCanvas.addEventListener('pointerup', () => {
  if (dragPreview?.moved) commit({ keepInspector: true });
  dragPreview = null;
});
previewCanvas.addEventListener('wheel', e => {
  const c = selClip();
  if (!c || c.type === 'audio' || c.type === 'effect' || S.time < c.start || S.time >= clipEnd(c)) return;
  e.preventDefault();
  const f = e.deltaY < 0 ? 1.05 : 1 / 1.05;
  if (hasKf(c, 'scale')) kfSet(c, 'scale', S.time - c.start, kfValue(c, 'scale', S.time - c.start) * f);
  else c.transform.scale = round(clamp(c.transform.scale * f, 0.02, 20), 4);
  clearTimeout(previewCanvas._wt);
  previewCanvas._wt = setTimeout(() => commit({ keepInspector: true }), 300);
  syncInspectorKeyframes();
}, { passive: false });
previewCanvas.addEventListener('dblclick', () => { const c = selClip(); if (c?.type === 'text') { S.inspTab = 'text'; renderInspector(); setTimeout(() => $('#inspector textarea')?.focus(), 10); } });

/* ---------------- commands ---------------- */
function cmd(name) {
  const c = selClip();
  switch (name) {
    case 'play': return togglePlay();
    case 'home': pause(); return seek(0);
    case 'end': pause(); return seek(projectDuration());
    case 'prevFrame': pause(); return seek(S.time - frameDur());
    case 'nextFrame': pause(); return seek(S.time + frameDur());
    case 'undo': return undo();
    case 'redo': return redo();
    case 'save': return saveProject(true);
    case 'projects': return openProjects();
    case 'export': return Exporter.open();
    case 'snapshot': return snapshot();
    case 'fullscreen': return $('#stage').requestFullscreen?.();
    case 'split': return splitAtPlayhead();
    case 'delete': {
      if (!c) return toast('Select a clip first');
      const tr = trackOf(c);
      tr.clips.splice(tr.clips.indexOf(c), 1);
      if (tr.main) { // magnetic main track: close the gap
        const gap = c.duration;
        for (const o of tr.clips) if (o.start >= clipEnd(c) - 0.001) o.start -= gap;
      }
      S.selected = null;
      return commit();
    }
    case 'duplicate': {
      if (!c) return toast('Select a clip first');
      const d = deep(c); d.id = uid('c'); d.start = clipEnd(c);
      const tr = trackOf(c);
      tr.clips.push(d);
      resolvePlacement(d, tr, tr.main ? 'push' : 'free');
      S.selected = d.id;
      return commit();
    }
    case 'copy': if (!c) return; S.clipboard = deep(c); return toast('Clip copied');
    case 'paste': {
      if (!S.clipboard) return;
      const d = deep(S.clipboard); d.id = uid('c'); d.start = S.time;
      const tr = freeTrackFor(d);
      tr.clips.push(d); sortTrack(tr);
      S.selected = d.id;
      return commit();
    }
    case 'freeze': return freezeFrame();
    case 'detachAudio': {
      if (!c || c.type !== 'video') return toast('Select a video clip');
      const m = mediaById(c.mediaId);
      const a = newClip('audio', c.start, c.duration, { mediaId: c.mediaId, in: c.in, speed: c.speed, curve: c.curve, voice: c.voice, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, keepPitch: c.keepPitch });
      if (c.keyframes?.volume) a.keyframes.volume = deep(c.keyframes.volume);
      c.muted = true;
      freeTrackFor(a).clips.push(a);
      S.selected = a.id;
      commit();
      return toast('Audio extracted from ' + (m?.name || 'clip'), 'ok');
    }
    case 'muteClip': if (!c || !isAV(c)) return toast('Select a video or audio clip'); c.muted = !c.muted; return commit();
    case 'marker': P().markers.push({ t: round(S.time, 3) }); return commit();
    case 'addTrack': addTrack('visual'); return commit();
    case 'addAudioTrack': addTrack('audio'); return commit();
    case 'snap': S.snap = !S.snap; $('#snapBtn').classList.toggle('on', S.snap); return toast('Snapping ' + (S.snap ? 'on' : 'off'));
    case 'zoomIn': return setZoom(S.pps * 1.3);
    case 'zoomOut': return setZoom(S.pps / 1.3);
    case 'zoomFit': return zoomFit();
  }
}

function splitAtPlayhead() {
  let c = selClip();
  const t = S.time;
  if (!c || t <= c.start || t >= clipEnd(c)) {
    // fall back to clip under playhead on the main track (or any track)
    const hits = allClips().filter(x => t > x.c.start + 0.02 && t < clipEnd(x.c) - 0.02);
    const pick = hits.find(x => x.t.main) || hits[0];
    if (!pick) return toast('Move the playhead over a clip to split it');
    c = pick.c;
  }
  const local = t - c.start;
  if (local < 0.02 || local > c.duration - 0.02) return;
  const tr = trackOf(c);
  if (curvePts(c)) {
    // a speed curve can't be split in two; bake each half to its average speed
    const spanA = srcOffset(c, local), spanB = srcSpan(c) - spanA;
    const durA = local, durB = c.duration - local;
    const b0 = deep(c);
    c.curve = 'none'; c.speed = round(spanA / durA, 4);
    b0.curve = 'none'; b0.speed = round(spanB / durB, 4);
    b0.id = uid('c'); b0.start = t; b0.duration = durB; b0.in = c.in + spanA;
    c.duration = durA;
    b0.transition = { type: 'none', dur: c.transition.dur }; c.anim.out = 'none'; b0.anim.in = 'none';
    tr.clips.splice(tr.clips.indexOf(c) + 1, 0, b0);
    S.selected = b0.id; commit();
    return toast('Speed curve was converted to fixed speeds on each part');
  }
  const b = deep(c);
  b.id = uid('c');
  c.duration = local;
  b.start = t;
  b.duration -= local;
  if (isAV(c)) b.in = srcAt(c, local);
  b.transition = { type: 'none', dur: c.transition.dur };
  c.anim.out = 'none'; b.anim.in = 'none';
  c.fadeOut = 0; b.fadeIn = 0;
  // keyframes: keep each half's keys, add boundary keys to preserve values
  for (const k of Object.keys(c.keyframes || {})) {
    const all = c.keyframes[k];
    const vAt = kfValue({ ...c, keyframes: { [k]: all } }, k, local);
    c.keyframes[k] = all.filter(x => x.t <= local); c.keyframes[k].push({ t: local, v: vAt });
    b.keyframes[k] = [{ t: 0, v: vAt }, ...all.filter(x => x.t > local).map(x => ({ t: x.t - local, v: x.v }))];
  }
  tr.clips.splice(tr.clips.indexOf(c) + 1, 0, b);
  S.selected = b.id;
  commit();
}

async function freezeFrame() {
  const c = selClip();
  if (!c || c.type !== 'video' || S.time < c.start || S.time >= clipEnd(c)) return toast('Put the playhead over a selected video clip');
  const e = ClipEls.get(c.id);
  if (!e || e.el.readyState < 2) return toast('Video not ready yet');
  const cv = document.createElement('canvas');
  cv.width = e.el.videoWidth; cv.height = e.el.videoHeight;
  cv.getContext('2d').drawImage(e.el, 0, 0);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const [m] = await uploadFiles([new File([blob], `freeze-${fmtTime(S.time).replace(/[:.]/g, '-')}.png`, { type: 'image/png' })], 'image');
  if (!m) return;
  const t = S.time, tr = trackOf(c);
  S.selected = c.id;
  if (t > c.start + 0.02) splitAtPlayhead();
  const FREEZE = 3;
  for (const o of tr.clips) if (o.start >= t - 0.001) o.start += FREEZE;
  const f = newClip('image', t, FREEZE, { mediaId: m.id });
  f.transform = deep(c.transform); f.crop = deep(c.crop); f.filter = c.filter; f.adjust = deep(c.adjust); f.flipH = c.flipH; f.flipV = c.flipV;
  tr.clips.push(f); sortTrack(tr);
  S.selected = f.id;
  commit();
  toast('Freeze frame added (3s)', 'ok');
}

function snapshot() {
  const cv = document.createElement('canvas');
  cv.width = P().width; cv.height = P().height;
  renderFrame(cv.getContext('2d'), S.time, { ui: false });
  cv.toBlob(b => downloadBlob(b, `${P().name || 'frame'}-${fmtTime(S.time).replace(/[:.]/g, '-')}.png`), 'image/png');
}

/* ---------------- projects ---------------- */
let saveTimer = null;
function projectThumb() {
  try {
    const cv = document.createElement('canvas');
    const r = P().width / P().height;
    cv.height = 120; cv.width = Math.round(120 * r);
    renderFrame(cv.getContext('2d'), Math.min(S.time, Math.max(0, projectDuration() - 0.01)), { ui: false });
    return cv.toDataURL('image/jpeg', 0.6);
  } catch { return null; }
}
async function saveProject(manual = false) {
  if (S.saving) return;
  if (!manual && !S.dirty) return;
  if (!manual && !P().tracks.some(t => t.clips.length) && !P().id) return;
  S.saving = true;
  $('#saveStatus').textContent = 'Saving…';
  try {
    const data = deep(P());
    data.durationCache = projectDuration();
    data.thumb = projectThumb();
    const res = await API.post('api/project.php', { project: data });
    P().id = res.id;
    S.dirty = false;
    S.lastJSON = snapshotJSON();
    $('#saveStatus').textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    try { localStorage.setItem('cl_last_project', res.id); } catch { }
    if (manual) toast('Project saved', 'ok');
  } catch (e) {
    $('#saveStatus').textContent = 'Save failed';
    toast('Save failed: ' + e.message, 'err');
  } finally { S.saving = false; }
}
async function loadProject(id, silent = false) {
  try {
    const { project } = await API.get('api/project.php?id=' + encodeURIComponent(id));
    pause();
    S.project = migrateProject(project);
    S.selected = null; S.time = 0;
    initHistory();
    S.dirty = false;
    $('#saveStatus').textContent = 'Saved';
    try { localStorage.setItem('cl_last_project', id); } catch { }
    loadProjectFonts();
    refreshAll();
    zoomFit();
  } catch (e) { if (!silent) toast('Could not open project: ' + e.message, 'err'); else try { localStorage.removeItem('cl_last_project'); } catch { } }
}
function migrateProject(p) {
  const base = newProject();
  p = Object.assign({}, base, p);
  p.background = Object.assign({}, base.background, p.background || {});
  p.markers = p.markers || [];
  for (const t of p.tracks) for (const c of t.clips) {
    const d = newClip(c.type, 0, 1);
    for (const k of Object.keys(d)) if (c[k] === undefined) c[k] = d[k];
    for (const k of ['transform', 'crop', 'adjust', 'anim', 'transition', 'mask', 'chroma']) c[k] = Object.assign({}, d[k], c[k]);
    if (c.type === 'text') c.text = Object.assign(defaultText(), c.text);
  }
  if (!p.tracks.some(t => t.main)) { const v = p.tracks.find(t => t.kind === 'visual'); if (v) v.main = true; else p.tracks.unshift({ id: uid('t'), kind: 'visual', name: 'Main', main: true, clips: [] }); }
  return p;
}
function loadProjectFonts() {
  const fonts = new Set(allClips().filter(x => x.c.type === 'text').map(x => `${x.c.text.weight} 40px "${x.c.text.font}"`));
  for (const f of fonts) document.fonts?.load(f).catch(() => { });
}
function newProjectCmd() {
  if (S.dirty && !confirm('Start a new project? Unsaved changes will be lost.')) return;
  pause();
  S.project = newProject();
  S.selected = null; S.time = 0; S.dirty = false;
  initHistory();
  $('#saveStatus').textContent = 'Not saved';
  try { localStorage.removeItem('cl_last_project'); } catch { }
  refreshAll();
  Modal.close();
}
async function openProjects() {
  let list = [];
  try { list = (await API.get('api/project.php?list=1')).projects; } catch (e) { toast(e.message, 'err'); }
  Modal.open(card => {
    card.append(h('h2', {}, 'Projects'));
    card.append(h('div', { class: 'row', style: { marginBottom: '14px' } },
      h('button', { class: 'btn primary', onclick: newProjectCmd }, iconEl('plus'), 'New project'),
      h('button', { class: 'btn', onclick: async () => { await saveProject(true); Modal.close(); } }, iconEl('save'), 'Save current'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => openExports() }, iconEl('download'), 'Exported videos')));
    const wrap = h('div', { class: 'proj-list' });
    if (!list.length) wrap.append(h('p', { class: 'muted' }, 'No saved projects yet.'));
    for (const pr of list) {
      wrap.append(h('div', { class: 'proj-item' },
        h('div', { class: 'pt', style: pr.thumb ? { backgroundImage: `url("${pr.thumb}")` } : {} }),
        h('div', { class: 'pi' }, h('b', {}, pr.name + (pr.id === P().id ? '  (open)' : '')), h('small', {}, `${pr.ratio} · ${fmtTime(pr.duration, false)} · ${new Date(pr.updated * 1000).toLocaleString()}`)),
        h('button', { class: 'btn sm primary', onclick: async () => { if (S.dirty && pr.id !== P().id && !confirm('Open this project? Unsaved changes will be lost.')) return; Modal.close(); await loadProject(pr.id); } }, 'Open'),
        h('button', { class: 'btn sm danger', onclick: async () => { if (!confirm(`Delete project "${pr.name}"?`)) return; await API.post('api/project.php', { action: 'delete', id: pr.id }); if (pr.id === P().id) P().id = null; openProjects(); } }, iconEl('trash'))));
    }
    card.append(wrap);
    card.append(h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => Modal.close() }, 'Close')));
  });
}
async function openExports() {
  let list = [];
  try { list = (await API.get('api/export.php?list=1')).exports; } catch (e) { toast(e.message, 'err'); }
  Modal.open(card => {
    card.append(h('h2', {}, 'Exported videos'));
    card.append(h('p', { class: 'muted' }, 'Saved in the “exports” folder of the app.'));
    const wrap = h('div', { class: 'proj-list' });
    if (!list.length) wrap.append(h('p', { class: 'muted' }, 'Nothing exported yet.'));
    for (const f of list) wrap.append(h('div', { class: 'proj-item' },
      h('div', { class: 'pi' }, h('b', {}, f.file), h('small', {}, fmtSize(f.size) + ' · ' + new Date(f.time * 1000).toLocaleString())),
      h('a', { class: 'btn sm', href: f.url, target: '_blank' }, 'Play'),
      h('a', { class: 'btn sm primary', href: f.url, download: f.file }, 'Download')));
    card.append(wrap, h('div', { class: 'foot' }, h('button', { class: 'btn', onclick: () => openProjects() }, 'Back'), h('button', { class: 'btn', onclick: () => Modal.close() }, 'Close')));
  });
}

/* ---------------- export ---------------- */
const Exporter = {
  rec: null, chunks: [], canvas: null, ctx: null, settings: null, cancelled: false, startWall: 0,
  open() {
    const d = projectDuration();
    if (d <= 0) return toast('Add something to the timeline first');
    pause();
    const p = P();
    const types = [
      ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'], ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'], ['video/mp4', 'mp4'],
      ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'],
    ].filter(([t]) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!types.length) return toast('Your browser cannot record video. Use Chrome or Edge.', 'err');
    const nativeMp4 = types.some(([, e]) => e === 'mp4');
    Modal.open(card => {
      card.append(h('h2', {}, 'Export video'));
      const name = h('input', { class: 'inp', value: p.name || 'my-video', style: { width: '100%' } });
      const res = h('select', {}, ...[[480, '480p'], [720, '720p'], [1080, '1080p (recommended)'], [1440, '2K'], [2160, '4K']].map(([v, l]) => h('option', { value: v, selected: v === 1080 }, l)));
      const fps = h('select', {}, ...[24, 25, 30, 50, 60].map(f => h('option', { value: f, selected: f === p.fps }, f + ' fps')));
      const q = h('select', {}, h('option', { value: 4 }, 'Smaller file'), h('option', { value: 10, selected: true }, 'High'), h('option', { value: 20 }, 'Very high'), h('option', { value: 40 }, 'Maximum'));
      const fmtOpts = [];
      if (nativeMp4 || APP.ffmpeg) fmtOpts.push(h('option', { value: 'mp4', selected: true }, 'MP4 (H.264)'));
      fmtOpts.push(h('option', { value: 'webm' }, 'WebM'));
      const fmt = h('select', {}, ...fmtOpts);
      const precise = PreciseExporter.supported();
      const mode = h('select', {}, precise ? h('option', { value: 'precise', selected: true }, 'Precise · frame by frame (best quality)') : null, h('option', { value: 'fast' }, 'Fast · real-time recording'));
      const fmtRow = [h('label', {}, 'Format'), fmt];
      const syncMode = () => fmtRow.forEach(el => el.style.display = mode.value === 'precise' ? 'none' : '');
      mode.onchange = syncMode;
      card.append(h('div', { class: 'form-grid' },
        h('label', {}, 'File name'), name,
        h('label', {}, 'Resolution'), res,
        h('label', {}, 'Frame rate'), fps,
        h('label', {}, 'Quality'), q,
        h('label', {}, 'Render mode'), mode,
        ...fmtRow));
      syncMode();
      card.append(h('p', { class: 'muted', style: { fontSize: '12px', lineHeight: 1.5, marginTop: '14px' } },
        `Length ${fmtTime(d)} · ${p.ratio}. Precise mode renders every frame exactly and outputs MP4; Fast mode records in real time (keep the tab visible). ` +
        (APP.ffmpeg ? 'FFmpeg found: the result is re-encoded for best compatibility.' : (nativeMp4 ? '' : 'Tip: install FFmpeg to get MP4 output from this browser.'))));
      card.append(h('div', { class: 'foot' },
        h('button', { class: 'btn', onclick: () => Modal.close() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => this.start({ name: name.value.trim() || 'video', height: +res.value, fps: +fps.value, mbps: +q.value, format: fmt.value, mode: mode.value, types }) }, iconEl('download'), 'Export')));
    });
  },
  start(s) {
    const p = P();
    const short = Math.min(p.width, p.height);
    const k = s.height / short;
    const w = Math.round(p.width * k / 2) * 2, hh = Math.round(p.height * k / 2) * 2;
    this.settings = s;
    if (s.mode === 'precise') return this.startPrecise(s, w, hh);
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = hh;
    this.ctx = this.canvas.getContext('2d');
    const want = s.format === 'mp4' ? s.types.find(([, e]) => e === 'mp4') || s.types[0] : s.types.find(([, e]) => e === 'webm') || s.types[0];
    this.mime = want[0]; this.ext = want[1];
    AudioEngine.ensure();
    const stream = this.canvas.captureStream(s.fps);
    for (const t of AudioEngine.dest.stream.getAudioTracks()) stream.addTrack(t);
    this.chunks = [];
    this.cancelled = false;
    try {
      this.rec = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: s.mbps * 1e6 * (w * hh) / (1920 * 1080), audioBitsPerSecond: 192000 });
    } catch (e) { return toast('Recorder error: ' + e.message, 'err'); }
    this.rec.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = () => this.done();
    Modal.open(card => {
      card.append(h('h2', {}, 'Exporting…'));
      card.append(h('p', { class: 'muted' }, `${w}×${hh} · ${s.fps} fps · ${this.ext.toUpperCase()}`));
      card.append(h('div', { class: 'progress-bar' }, h('div', { id: 'expBar' })));
      card.append(h('p', { id: 'expTxt', class: 'muted' }, 'Preparing…'));
      card.append(h('div', { class: 'foot' }, h('button', { class: 'btn danger', onclick: () => this.cancel() }, 'Cancel')));
    }, { closable: false });
    S.selected = null; renderInspector();
    S.exporting = true;
    S.time = 0;
    syncMedia(0, false);
    // give media a moment to seek to the first frame
    setTimeout(() => {
      if (this.cancelled) return;
      renderFrame(this.ctx, 0, { ui: false });
      this.rec.start(500);
      this.startWall = performance.now();
      play();
    }, 700);
  },
  async startPrecise(s, w, hh) {
    pause();
    this.cancelled = false;
    S.selected = null; renderInspector();
    S.exporting = true; S.precise = true;
    Modal.open(card => {
      card.append(h('h2', {}, 'Exporting…'));
      card.append(h('p', { class: 'muted' }, `${w}×${hh} · ${s.fps} fps · MP4 · frame-accurate`));
      card.append(h('div', { class: 'progress-bar' }, h('div', { id: 'expBar' })));
      card.append(h('p', { id: 'expTxt', class: 'muted' }, 'Preparing…'));
      card.append(h('div', { class: 'foot' }, h('button', { class: 'btn danger', onclick: () => { this.cancelled = true; PreciseExporter.cancelled = true; } }, 'Cancel')));
    }, { closable: false });
    const ui = (txt, pct) => {
      const b = $('#expBar'); if (b) b.style.width = (pct * 100).toFixed(1) + '%';
      const t = $('#expTxt'); if (t) t.textContent = txt;
    };
    try {
      const r = await PreciseExporter.run(s, w, hh, ui);
      S.precise = false;
      if (!r) { this.cleanup(); Modal.close(); toast('Export cancelled'); return; }
      this.mime = 'video/mp4'; this.ext = 'mp4';
      this.chunks = [r.blob];
      // already a finished MP4: only ask the server to convert if the browser had no H.264 encoder
      s.format = (r.codec !== 'avc' || r.audio === 'opus') && APP.ffmpeg ? 'mp4' : 'keep';
      this.done();
    } catch (e) {
      console.error(e);
      S.precise = false;
      this.cleanup();
      Modal.close();
      toast('Precise export failed (' + e.message + '). Trying real-time export…', 'err', 6000);
      this.start(Object.assign({}, s, { mode: 'fast', format: APP.ffmpeg ? 'mp4' : s.format }));
    }
  },
  frame() {
    if (!this.ctx) return;
    renderFrame(this.ctx, S.time, { ui: false });
    // mirror into the preview (cheap) so the user sees progress
    previewCtx.setTransform(1, 0, 0, 1, 0, 0);
    previewCtx.drawImage(this.canvas, 0, 0, previewCanvas.width, previewCanvas.height);
    updatePlayhead();
    const d = projectDuration();
    const pct = clamp(S.time / d, 0, 1);
    const bar = $('#expBar'); if (bar) bar.style.width = (pct * 100).toFixed(1) + '%';
    const txt = $('#expTxt'); if (txt) txt.textContent = `${Math.round(pct * 100)}% · ${fmtTime(S.time)} / ${fmtTime(d)}`;
  },
  finish() {
    S.playing = false;
    pauseAllMedia();
    $('#playBtn').innerHTML = icon('play');
    setTimeout(() => this.rec && this.rec.state !== 'inactive' && this.rec.stop(), 250);
  },
  cancel() {
    this.cancelled = true;
    S.playing = false; pauseAllMedia();
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    this.cleanup();
    Modal.close();
    toast('Export cancelled');
  },
  cleanup() {
    S.exporting = false; S.precise = false;
    this.ctx = null; this.canvas = null;
    $('#playBtn').innerHTML = icon('play');
    fitPreview();
  },
  async done() {
    if (this.cancelled) return;
    const blob = new Blob(this.chunks, { type: this.mime.split(';')[0] });
    this.cleanup();
    const s = this.settings;
    const localName = `${s.name}.${this.ext}`;
    const needServer = APP.ffmpeg && s.format !== 'keep';
    Modal.open(card => {
      card.append(h('h2', {}, needServer ? 'Finishing…' : 'Export complete'));
      card.append(h('p', { class: 'muted', id: 'expTxt' }, needServer ? 'Saving and optimising the video with FFmpeg…' : `${fmtSize(blob.size)} · ${this.ext.toUpperCase()}`));
      card.append(h('div', { class: 'foot', id: 'expFoot' }, h('button', { class: 'btn', onclick: () => downloadBlob(blob, localName) }, 'Download now'), h('button', { class: 'btn', onclick: () => Modal.close() }, 'Close')));
    });
    // always store a copy in /exports on the server
    const fd = new FormData();
    fd.append('video', blob, localName);
    fd.append('name', s.name);
    fd.append('format', s.format);
    fd.append('fps', s.fps);
    try {
      const r = await API.upload('api/export.php', fd, pr => { const t = $('#expTxt'); if (t && pr < 1) t.textContent = `Saving to the app… ${Math.round(pr * 100)}%`; });
      const t = $('#expTxt');
      if (t) t.textContent = `Saved as exports/${r.file} (${fmtSize(r.size)})` + (r.converted ? ' — optimised with FFmpeg' : '');
      const head = $('#modalCard h2'); if (head) head.textContent = 'Export complete';
      const foot = $('#expFoot');
      if (foot) { foot.innerHTML = ''; foot.append(h('a', { class: 'btn', href: r.url, target: '_blank' }, 'Play'), h('a', { class: 'btn primary', href: r.url, download: r.file }, iconEl('download'), 'Download'), h('button', { class: 'btn', onclick: () => Modal.close() }, 'Close')); }
      toast('Export finished', 'ok');
    } catch (e) {
      const t = $('#expTxt'); if (t) t.textContent = 'Could not save on the server (' + e.message + '). Use “Download now”.';
    }
  },
};

/* ---------------- keyboard ---------------- */
window.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'textarea' || (tag === 'input' && !['range', 'checkbox', 'color'].includes(e.target.type)) || tag === 'select' || e.target.isContentEditable;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return cmd('save'); }
  if (typing || Modal.isOpen && !S.exporting && e.key !== 'Escape') return;
  if (e.key === 'Escape') { if (Modal.isOpen && !S.exporting) Modal.close(); else select(null); return; }
  if (S.exporting) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); return cmd('play'); }
  if (mod && k === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && k === 'y') { e.preventDefault(); return redo(); }
  if (mod && k === 'd') { e.preventDefault(); return cmd('duplicate'); }
  if (mod && k === 'c') return cmd('copy');
  if (mod && k === 'v') return cmd('paste');
  if (mod && k === 'b') { e.preventDefault(); return cmd('split'); }
  if (!mod && k === 's') return cmd('split');
  if (!mod && k === 'm') return cmd('marker');
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); return cmd('delete'); }
  if (k === 'arrowleft') { e.preventDefault(); pause(); return seek(S.time - (e.shiftKey ? 1 : frameDur())); }
  if (k === 'arrowright') { e.preventDefault(); pause(); return seek(S.time + (e.shiftKey ? 1 : frameDur())); }
  if (k === 'home') return cmd('home');
  if (k === 'end') return cmd('end');
  if (k === '+' || k === '=') return cmd('zoomIn');
  if (k === '-') return cmd('zoomOut');
});

/* ---------------- global wiring ---------------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cmd]');
  if (b) cmd(b.dataset.cmd);
});
document.addEventListener('pointerdown', () => AudioEngine.ensure(), { once: true });
$('#zoom').addEventListener('input', e => setZoom(+e.target.value));
$('#projectName').addEventListener('change', e => { P().name = e.target.value.trim() || 'Untitled project'; commit(); });
$('#fileInput').addEventListener('change', e => { if (e.target.files.length) uploadFiles(e.target.files); });
$('#srtInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  addCaptions(parseSrt(await f.text()));
  e.target.value = '';
});
const ratioSel = $('#ratioSelect');
for (const [k, [, , d]] of Object.entries(RATIOS)) ratioSel.append(h('option', { value: k, title: d }, k));
ratioSel.addEventListener('change', () => setRatio(ratioSel.value));

// drag files from the OS
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; $('#dropOverlay').classList.remove('hidden'); } });
window.addEventListener('dragleave', e => { if (e.dataTransfer.types.includes('Files') && --dragDepth <= 0) { dragDepth = 0; $('#dropOverlay').classList.add('hidden'); } });
window.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', e => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault(); dragDepth = 0; $('#dropOverlay').classList.add('hidden');
  const files = [...e.dataTransfer.files];
  const srt = files.filter(f => /\.(srt|vtt)$/i.test(f.name));
  srt.forEach(async f => addCaptions(parseSrt(await f.text())));
  const media = files.filter(f => !/\.(srt|vtt)$/i.test(f.name));
  if (media.length) { S.leftTab = media.every(f => f.type.startsWith('audio')) ? 'audio' : 'media'; renderSideTabs(); uploadFiles(media); }
});
window.addEventListener('resize', () => { fitPreview(); drawRuler(); });
new ResizeObserver(() => fitPreview()).observe($('#previewWrap'));
window.addEventListener('beforeunload', e => { if (S.dirty || S.exporting) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.exporting) toast('Keep this tab visible while exporting!', 'err', 6000); });

/* ---------------- boot ---------------- */
(async function boot() {
  hydrateIcons();
  try { const th = localStorage.getItem('cl_tlh'); if (th) document.documentElement.style.setProperty('--tl-h', th); } catch { }
  renderSideTabs();
  initTimelineEvents();
  FONTS.forEach(f => document.fonts?.load(`700 40px "${f}"`).catch(() => { }));
  try {
    S.media = (await API.get('api/media.php')).media.reverse();
  } catch (e) { toast('Server not reachable: ' + e.message, 'err', 8000); }
  S.media.forEach(m => Assets.probe(m).then(() => { renderLeftPanel(); renderTimeline(); }));
  initHistory();
  let last = null;
  try { last = localStorage.getItem('cl_last_project'); } catch { }
  if (last) await loadProject(last, true);
  refreshAll();
  renderLeftPanel();
  setInterval(() => saveProject(false), 15000);
  requestAnimationFrame(loop);
})();
