<?php
/**
 * POST {id, start, end}  -> reversed copy of the used part of a media file (needs FFmpeg)
 */
require __DIR__ . '/../config.php';

if (!find_ffmpeg()) fail('Reverse needs FFmpeg. Install FFmpeg (or set FFMPEG_PATH in config.php) and restart the app.');
$body = read_json_body();
$id = safe_id($body['id'] ?? '');
$start = max(0, (float)($body['start'] ?? 0));
$end = (float)($body['end'] ?? 0);
$db = media_db();
$m = null;
foreach ($db as $x) if ($x['id'] === $id) { $m = $x; break; }
if (!$m) fail('Media not found', 404);
if ($m['type'] === 'image') fail('Images cannot be reversed');
$src = UPLOAD_DIR . '/' . basename($m['file']);
if ($end <= $start) $end = $start + 600;

$newId = new_id('m_');
$isAudio = $m['type'] === 'audio';
$out = $newId . ($isAudio ? '.m4a' : '.mp4');
$args = ['-y', '-ss', (string)$start, '-to', (string)$end, '-i', $src];
if ($isAudio) $args = array_merge($args, ['-af', 'areverse', '-c:a', 'aac', '-b:a', '192k']);
else $args = array_merge($args, ['-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']);
$args[] = UPLOAD_DIR . '/' . $out;
$log = '';
if (!run_ffmpeg($args, $log)) {
    // retry without audio (video with no sound track)
    $args2 = array_values(array_filter($args, fn($a) => $a !== 'areverse'));
    $i = array_search('-af', $args2); if ($i !== false) array_splice($args2, $i, 1);
    array_splice($args2, -1, 0, ['-an']);
    if (!run_ffmpeg($args2, $log)) fail('FFmpeg could not reverse this clip: ' . substr($log, -300), 500);
}
$entry = [
    'id' => $newId,
    'name' => 'reversed-' . $m['name'],
    'type' => $m['type'],
    'file' => $out,
    'url' => 'uploads/' . $out,
    'size' => filesize(UPLOAD_DIR . '/' . $out),
    'duration' => $end - $start,
    'width' => $m['width'] ?? 0,
    'height' => $m['height'] ?? 0,
    'created' => time(),
];
$db[] = $entry;
media_db_save($db);
json_out(['ok' => true, 'media' => $entry]);
