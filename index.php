<?php
require __DIR__ . '/config.php';
$hasFfmpeg = find_ffmpeg() ? 'true' : 'false';
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= APP_NAME ?></title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%2318d4c4'/><path d='M12 9l12 7-12 7z' fill='%23111'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/editor.css?v=<?= APP_VERSION ?>">
</head>
<body>
<div class="app" id="app">
  <header class="topbar">
    <div class="brand"><span class="logo">▶</span><span>ClipLab</span><em>Studio</em></div>
    <input id="projectName" class="project-name" value="Untitled project" spellcheck="false" title="Project name">
    <div class="spacer"></div>
    <span id="saveStatus" class="save-status">Not saved</span>
    <button class="tb-btn" data-cmd="undo" title="Undo (Ctrl+Z)"><i data-i="undo"></i></button>
    <button class="tb-btn" data-cmd="redo" title="Redo (Ctrl+Shift+Z)"><i data-i="redo"></i></button>
    <button class="tb-btn" data-cmd="projects" title="Projects"><i data-i="folder"></i><span>Projects</span></button>
    <button class="tb-btn" data-cmd="save" title="Save (Ctrl+S)"><i data-i="save"></i><span>Save</span></button>
    <button class="tb-btn primary" data-cmd="export"><i data-i="download"></i><span>Export</span></button>
  </header>

  <main class="workspace" id="workspace">
    <aside class="left">
      <nav class="side-tabs" id="sideTabs"></nav>
      <section class="panel" id="leftPanel"></section>
    </aside>

    <section class="center">
      <div class="preview-wrap" id="previewWrap">
        <div class="stage" id="stage">
          <canvas id="preview"></canvas>
        </div>
      </div>
      <div class="player-bar">
        <div class="time"><span id="tCur">00:00.00</span> <span class="muted">/ <span id="tDur">00:00.00</span></span></div>
        <div class="transport">
          <button data-cmd="home" title="Go to start (Home)"><i data-i="skipBack"></i></button>
          <button data-cmd="prevFrame" title="Previous frame (←)"><i data-i="chevL"></i></button>
          <button data-cmd="play" class="play" id="playBtn" title="Play / Pause (Space)"><i data-i="play"></i></button>
          <button data-cmd="nextFrame" title="Next frame (→)"><i data-i="chevR"></i></button>
          <button data-cmd="end" title="Go to end (End)"><i data-i="skipFwd"></i></button>
        </div>
        <div class="pb-right">
          <select id="ratioSelect" title="Aspect ratio"></select>
          <button data-cmd="snapshot" title="Save current frame as PNG"><i data-i="camera"></i></button>
          <button data-cmd="fullscreen" title="Fullscreen preview"><i data-i="maximize"></i></button>
        </div>
      </div>
    </section>

    <aside class="right" id="inspector"></aside>
  </main>

  <div class="splitter" id="splitter" title="Drag to resize timeline"></div>

  <section class="timeline" id="timeline">
    <div class="tl-toolbar">
      <button data-cmd="split" title="Split (S / Ctrl+B)"><i data-i="split"></i></button>
      <button data-cmd="delete" title="Delete (Del)"><i data-i="trash"></i></button>
      <button data-cmd="duplicate" title="Duplicate (Ctrl+D)"><i data-i="copy"></i></button>
      <span class="sep"></span>
      <button data-cmd="freeze" title="Freeze frame (3s)"><i data-i="freeze"></i></button>
      <button data-cmd="detachAudio" title="Extract audio from video"><i data-i="music"></i></button>
      <button data-cmd="muteClip" title="Mute / unmute clip"><i data-i="volume"></i></button>
      <button data-cmd="marker" title="Add marker (M)"><i data-i="flag"></i></button>
      <span class="sep"></span>
      <button data-cmd="addTrack" title="Add overlay track"><i data-i="layers"></i></button>
      <button data-cmd="addAudioTrack" title="Add audio track"><i data-i="audioTrack"></i></button>
      <div class="spacer"></div>
      <button data-cmd="snap" id="snapBtn" class="on" title="Snapping"><i data-i="magnet"></i></button>
      <button data-cmd="zoomOut" title="Zoom out (-)"><i data-i="minus"></i></button>
      <input type="range" id="zoom" min="5" max="400" value="60" title="Timeline zoom">
      <button data-cmd="zoomIn" title="Zoom in (+)"><i data-i="plus"></i></button>
      <button data-cmd="zoomFit" title="Fit timeline"><i data-i="fit"></i></button>
    </div>
    <div class="tl-scroll" id="tlScroll">
      <div class="tl-inner" id="tlInner">
        <div class="tl-ruler-row">
          <div class="tl-corner"></div>
          <div class="tl-ruler" id="tlRuler"><canvas id="rulerCanvas"></canvas></div>
        </div>
        <div id="tlRows" class="tl-rows"></div>
        <div class="tl-playhead" id="playhead"><div class="ph-head"></div></div>
      </div>
    </div>
  </section>
</div>

<div id="modal" class="modal hidden"><div class="modal-card" id="modalCard"></div></div>
<div id="toasts" class="toasts"></div>
<div id="dropOverlay" class="drop-overlay hidden"><div>Drop files to import</div></div>
<input type="file" id="fileInput" multiple hidden accept="video/*,image/*,audio/*,.mkv,.mov,.avi,.wmv,.flv,.3gp,.m4a,.flac,.opus">
<input type="file" id="srtInput" accept=".srt,.vtt" hidden>

<script>
window.APP = { ffmpeg: <?= $hasFfmpeg ?>, version: "<?= APP_VERSION ?>" };
</script>
<script src="assets/js/core.js?v=<?= APP_VERSION ?>"></script>
<script src="assets/js/render.js?v=<?= APP_VERSION ?>"></script>
<script src="assets/js/timeline.js?v=<?= APP_VERSION ?>"></script>
<script src="assets/js/panels.js?v=<?= APP_VERSION ?>"></script>
<script src="assets/js/inspector.js?v=<?= APP_VERSION ?>"></script>
<script src="assets/js/text.js?v=<?= APP_VERSION ?>"></script>
<script src="assets/js/fx.js?v=<?= APP_VERSION ?>"></script>
<script src="assets/js/tools.js?v=<?= APP_VERSION ?>"></script>
<script src="assets/vendor/mp4-muxer.js?v=5.2.2"></script>
<script src="assets/js/export.js?v=<?= APP_VERSION ?>"></script>
<script src="assets/js/app.js?v=<?= APP_VERSION ?>"></script>
<script src="assets/js/scrollbars.js?v=<?= APP_VERSION ?>"></script>
</body>
</html>
