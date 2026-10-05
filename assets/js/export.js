/* ClipLab Studio — frame-accurate export with WebCodecs (H.264/AAC MP4) */
'use strict';

const PreciseExporter = {
  cancelled: false,
  audioCache: new Map(), // mediaId -> Promise<AudioBuffer|null>

  supported() {
    return 'VideoEncoder' in window && 'VideoFrame' in window && typeof Mp4Muxer !== 'undefined';
  },

  async pickVideo(w, hh, fps, bitrate) {
    const big = w * hh > 1920 * 1088;
    const cands = [
      ['avc', big ? 'avc1.640033' : 'avc1.640028'], ['avc', 'avc1.640033'], ['avc', 'avc1.4d0033'], ['avc', 'avc1.42003e'],
      ['vp9', 'vp09.00.41.08'], ['vp9', 'vp09.00.10.08'], ['av1', 'av01.0.08M.08'],
    ];
    for (const [mux, codec] of cands) {
      const cfg = { codec, width: w, height: hh, bitrate, framerate: fps, latencyMode: 'quality' };
      if (mux === 'avc') cfg.avc = { format: 'avc' };
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return { mux, cfg }; } catch { }
    }
    return null;
  },
  async pickAudio() {
    if (!('AudioEncoder' in window)) return null;
    for (const [mux, codec] of [['aac', 'mp4a.40.2'], ['opus', 'opus']]) {
      const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
      try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { mux, cfg }; } catch { }
    }
    return null;
  },

  decodeAudio(m) {
    if (!this.audioCache.has(m.id)) {
      this.audioCache.set(m.id, (async () => {
        try {
          const url = await Assets.blobUrl(m);
          const buf = await (await fetch(url)).arrayBuffer();
          const ctx = new OfflineAudioContext(2, 2, 48000);
          return await ctx.decodeAudioData(buf);
        } catch { return null; } // e.g. video without sound
      })());
    }
    return this.audioCache.get(m.id);
  },

  /** mix every audible clip offline into one stereo buffer */
  async renderAudio(dur) {
    const rate = 48000;
    const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(dur * rate)), rate);
    let any = false;
    for (const tr of P().tracks) {
      if (tr.muted) continue;
      for (const c of tr.clips) {
        if (!isAV(c) || c.muted) continue;
        const m = mediaById(c.mediaId); if (!m) continue;
        const buf = await this.decodeAudio(m);
        if (!buf) continue;
        any = true;
        const g = ctx.createGain();
        // gain curve: volume keyframes + fades, sampled at 100 Hz
        const n = Math.max(2, Math.ceil(c.duration * 100));
        const curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const local = (i / (n - 1)) * c.duration;
          let v = kfValue(c, 'volume', local);
          if (c.fadeIn > 0 && local < c.fadeIn) v *= local / c.fadeIn;
          if (c.fadeOut > 0 && local > c.duration - c.fadeOut) v *= Math.max(0, (c.duration - local) / c.fadeOut);
          curve[i] = clamp(v, 0, 4);
        }
        g.gain.setValueCurveAtTime(curve, c.start, Math.max(0.01, c.duration));
        let dest = ctx.destination;
        if (c.voice && c.voice !== 'none' && typeof buildVoice === 'function') {
          const v = buildVoice(ctx, c.voice); v.output.connect(ctx.destination); v.start(c.start); dest = v.input;
        }
        g.connect(dest);
        const play = (when, off, len, rate) => {
          if (off >= buf.duration || len <= 0) return;
          const src = ctx.createBufferSource();
          src.buffer = buf; src.playbackRate.value = rate;
          src.connect(g);
          src.start(when, off, Math.min(len, buf.duration - off));
        };
        if (curvePts(c)) {
          // speed curve: many short segments, each at its own rate
          const seg = 0.05;
          for (let u = 0; u < c.duration; u += seg) {
            const u2 = Math.min(c.duration, u + seg);
            play(c.start + u, srcAt(c, u), srcOffset(c, u2) - srcOffset(c, u), rateAt(c, (u + u2) / 2));
          }
        } else {
          play(c.start, Math.min(c.in, buf.duration), c.duration * c.speed, c.speed);
        }
      }
    }
    if (!any) return null;
    return ctx.startRendering();
  },

  /** put every needed <video> on the exact frame for time t */
  async seekAll(t) {
    const jobs = [];
    const need = (c, target) => {
      const e = clipEl(c); if (!e) return;
      const el = e.el;
      if (!el.paused) el.pause();
      jobs.push((async () => {
        if (el.readyState < 1) await new Promise(r => { el.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 8000); });
        const dur = isFinite(el.duration) ? el.duration : target + 1;
        const tt = clamp(target, 0, Math.max(0, dur - 0.001));
        if (Math.abs(el.currentTime - tt) < 0.0005 && el.readyState >= 2) return;
        await new Promise(r => {
          const done = () => { el.removeEventListener('seeked', done); clearTimeout(to); r(); };
          const to = setTimeout(done, 5000);
          el.addEventListener('seeked', done);
          el.currentTime = tt;
        });
      })());
    };
    for (const tr of P().tracks) {
      if (tr.kind !== 'visual' || tr.hidden) continue;
      for (const c of tr.clips) {
        if (c.type !== 'video') continue;
        if (t >= c.start && t < clipEnd(c)) need(c, srcAt(c, t - c.start) + 0.0001);
        else {
          // previous clip held on its last frame during a transition
          const nxt = tr.clips.find(o => o !== c && Math.abs(o.start - clipEnd(c)) < 0.05 && o.transition?.type !== 'none' && t >= o.start && t < o.start + o.transition.dur);
          if (nxt) need(c, srcAt(c, c.duration) - 0.04);
        }
      }
    }
    // background blur uses the bottom clip; already covered above
    await Promise.all(jobs);
  },

  async run(s, w, hh, ui) {
    this.cancelled = false;
    const p = P();
    const fps = s.fps;
    const dur = projectDuration();
    const total = Math.max(1, Math.round(dur * fps));
    const bitrate = Math.round(s.mbps * 1e6 * (w * hh) / (1920 * 1080));
    const vc = await this.pickVideo(w, hh, fps, bitrate);
    if (!vc) throw new Error('No supported video encoder in this browser');
    ui('Mixing audio…', 0);
    const audioBuf = await this.renderAudio(dur);
    const ac = audioBuf ? await this.pickAudio() : null;

    const target = new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({
      target,
      video: { codec: vc.mux, width: w, height: hh, frameRate: fps },
      audio: ac ? { codec: ac.mux, sampleRate: 48000, numberOfChannels: 2 } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encErr = null;
    const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => encErr = e });
    venc.configure(vc.cfg);

    if (ac) {
      const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: e => encErr = e });
      aenc.configure(ac.cfg);
      const L = audioBuf.getChannelData(0), R = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : L;
      const len = audioBuf.length, block = 4096;
      for (let i = 0; i < len; i += block) {
        const n = Math.min(block, len - i);
        const data = new Float32Array(n * 2);
        data.set(L.subarray(i, i + n), 0);
        data.set(R.subarray(i, i + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data });
        aenc.encode(ad); ad.close();
        if (aenc.encodeQueueSize > 20) await new Promise(r => setTimeout(r, 1));
      }
      await aenc.flush(); aenc.close();
    }

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = hh;
    const ctx = cv.getContext('2d', { willReadFrequently: false });
    const started = performance.now();
    pauseAllMedia();
    for (let i = 0; i < total; i++) {
      if (this.cancelled) break;
      if (encErr) throw encErr;
      const t = i / fps;
      S.time = t;
      await this.seekAll(t);
      renderFrame(ctx, t, { ui: false });
      const vf = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 2));
      if (i % 3 === 0) {
        previewCtx.setTransform(1, 0, 0, 1, 0, 0);
        previewCtx.drawImage(cv, 0, 0, previewCanvas.width, previewCanvas.height);
        updatePlayhead();
        const el = (performance.now() - started) / 1000;
        const eta = el / (i + 1) * (total - i - 1);
        ui(`Rendering frame ${i + 1} / ${total} · about ${eta < 60 ? Math.ceil(eta) + 's' : Math.ceil(eta / 60) + ' min'} left`, (i + 1) / total);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    if (this.cancelled) { try { venc.close(); } catch { } return null; }
    ui('Finalising file…', 1);
    await venc.flush(); venc.close();
    muxer.finalize();
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), codec: vc.mux, audio: ac?.mux || null };
  },
};
