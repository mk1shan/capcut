<?php
/**
 * GET  ?check=1   -> {ffmpeg: bool}
 * GET  ?list=1    -> list exported files
 * POST multipart: video=<blob>, name=<string>, format=mp4|webm|keep
 *   Saves the browser-rendered video. If an MP4 is requested and the browser produced WebM,
 *   it is converted with ffmpeg (when installed).
 */
require __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['check'])) json_out(['ok' => true, 'ffmpeg' => (bool)find_ffmpeg()]);
    if (isset($_GET['list'])) {
        $files = [];
        foreach (glob(EXPORT_DIR . '/*.{mp4,webm}', GLOB_BRACE) as $f) {
            $files[] = ['file' => basename($f), 'url' => 'exports/' . basename($f), 'size' => filesize($f), 'time' => filemtime($f)];
        }
        usort($files, fn($a, $b) => $b['time'] <=> $a['time']);
        json_out(['ok' => true, 'exports' => $files]);
    }
    fail('Bad request');
}

if (empty($_FILES['video']) || $_FILES['video']['error'] !== UPLOAD_ERR_OK) {
    fail('Video upload failed (check post_max_size / upload_max_filesize)');
}

$name = preg_replace('/[^\p{L}\p{N}_\- ]/u', '', $_POST['name'] ?? 'export');
$name = trim($name) ?: 'export';
$name = str_replace(' ', '_', mb_substr($name, 0, 60));
$format = $_POST['format'] ?? 'keep';
$mime = $_FILES['video']['type'] ?? '';
$srcExt = str_contains($mime, 'mp4') ? 'mp4' : 'webm';
$stamp = date('Ymd_His');
$base = "{$name}_{$stamp}";
$src = EXPORT_DIR . "/$base.$srcExt";
if (!move_uploaded_file($_FILES['video']['tmp_name'], $src)) fail('Could not save export', 500);

$result = ['ok' => true, 'converted' => false];
$fps = max(1, min(120, (int)($_POST['fps'] ?? 30)));

if (find_ffmpeg()) {
    $log = '';
    $target = EXPORT_DIR . "/$base.mp4";
    if ($format === 'mp4') {
        $tmpOut = $srcExt === 'mp4' ? EXPORT_DIR . "/{$base}_final.mp4" : $target;
        // Re-encode: fixes missing duration/seek index from MediaRecorder and gives a constant frame rate
        $ok = run_ffmpeg(['-y', '-i', $src, '-r', (string)$fps, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
            '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', $tmpOut], $log);
        if ($ok) {
            @unlink($src);
            if ($tmpOut !== $target) rename($tmpOut, $target);
            $src = $target;
            $srcExt = 'mp4';
            $result['converted'] = true;
        } else {
            $result['ffmpegLog'] = $log;
        }
    } elseif ($srcExt === 'webm') {
        // remux webm so it has a proper duration
        $fixed = EXPORT_DIR . "/{$base}_fixed.webm";
        if (run_ffmpeg(['-y', '-i', $src, '-c', 'copy', $fixed], $log)) {
            @unlink($src);
            rename($fixed, $src);
        }
    }
}

$file = basename($src);
$result['file'] = $file;
$result['url'] = 'exports/' . $file;
$result['size'] = filesize($src);
json_out($result);
