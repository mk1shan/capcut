/* ClipLab Studio — always-visible custom scrollbars (Windows 11 Chrome hides native ones) */
'use strict';

function attachScrollbar(el) {
  if (!el || el._sb) return;
  const host = el.parentElement;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  el.classList.add('sb-hide-native');
  const track = document.createElement('div');
  track.className = 'sb-track';
  const thumb = document.createElement('div');
  thumb.className = 'sb-thumb';
  track.append(thumb);
  host.append(track);
  el._sb = track;

  const update = () => {
    const ch = el.clientHeight, sh = el.scrollHeight;
    const hostRect = host.getBoundingClientRect(), r = el.getBoundingClientRect();
    track.style.top = (r.top - hostRect.top + 4) + 'px';
    track.style.height = Math.max(0, ch - 8) + 'px';
    track.style.left = (r.right - hostRect.left - 12) + 'px';
    if (sh <= ch + 1) { track.style.display = 'none'; return; }
    track.style.display = 'block';
    const th = Math.max(36, (ch - 8) * ch / sh);
    const maxTop = (ch - 8) - th;
    thumb.style.height = th + 'px';
    thumb.style.transform = `translateY(${maxTop * (el.scrollTop / (sh - ch))}px)`;
  };
  el.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(el);
  new MutationObserver(() => requestAnimationFrame(update)).observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  window.addEventListener('resize', update);

  thumb.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    thumb.setPointerCapture(e.pointerId);
    track.classList.add('drag');
    const startY = e.clientY, startTop = el.scrollTop;
    const ratio = (el.scrollHeight - el.clientHeight) / Math.max(1, (el.clientHeight - 8) - thumb.offsetHeight);
    const move = ev => { el.scrollTop = startTop + (ev.clientY - startY) * ratio; };
    const up = () => { track.classList.remove('drag'); thumb.removeEventListener('pointermove', move); thumb.removeEventListener('pointerup', up); };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', up);
  });
  track.addEventListener('pointerdown', e => {
    if (e.target !== track) return;
    const r = thumb.getBoundingClientRect();
    el.scrollBy({ top: (e.clientY < r.top ? -1 : 1) * el.clientHeight * 0.9, behavior: 'smooth' });
  });
  update();
  el._sbUpdate = update;
}

document.addEventListener('DOMContentLoaded', () => {
  attachScrollbar(document.getElementById('leftPanel'));
  attachScrollbar(document.getElementById('inspector'));
});
if (document.readyState !== 'loading') {
  attachScrollbar(document.getElementById('leftPanel'));
  attachScrollbar(document.getElementById('inspector'));
}
