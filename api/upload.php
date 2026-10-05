<?php
/**
 * POST multipart: file=<file>, kind=(optional hint: video|image|audio)
 * Returns the new media entry.
 */
require __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST only', 405);

if (empty($_FILES['file'])) {
    $limit = ini_get('post_max_size');
    fail("No file received. The file may be larger than the PHP limit (post_max_size = $limit). Start the app with start.bat to raise it.");
}

$f = $_FILES['file'];
if ($f['error'] !== UPLOAD_ERR_OK) {
    $errors = [
        UPLOAD_ERR_INI_SIZE => 'File is larger than upload_max_filesize (' . ini_get('upload_max_filesize') . ')',
        UPLOAD_ERR_FORM_SIZE => 'File too large',
        UPLOAD_ERR_PARTIAL => 'Upload was interrupted',
        UPLOAD_ERR_NO_FILE => 'No file',
        UPLOAD_ERR_NO_TMP_DIR => 'Server has no temp folder',
        UPLOAD_ERR_CANT_WRITE => 'Cannot write to disk',
    ];
    fail($errors[$f['error']] ?? 'Upload error ' . $f['error']);
}

$origName = basename($f['name']);
$ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
$hint = $_POST['kind'] ?? '';

if (in_array($ext, IMAGE_EXT, true)) $type = 'image';
elseif (in_array($ext, AUDIO_EXT, true)) $type = 'audio';
elseif (in_array($ext, VIDEO_EXT, true)) $type = 'video';
else fail("Unsupported file type .$ext");

// webm can be audio-only (voiceover recordings)
if ($ext === 'webm' && $hint === 'audio') $type = 'audio';

$id = new_id('m_');
$fileName = $id . '.' . $ext;
$dest = UPLOAD_DIR . '/' . $fileName;
if (!move_uploaded_file($f['tmp_name'], $dest)) fail('Could not save the file', 500);

$transcoded = false;
if ($type === 'video' && in_array($ext, TRANSCODE_EXT, true) && find_ffmpeg()) {
    $mp4 = $id . '.mp4';
    $log = '';
    if (run_ffmpeg(['-y', '-i', $dest, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', UPLOAD_DIR . '/' . $mp4], $log)) {
        @unlink($dest);
        $fileName = $mp4;
        $transcoded = true;
    }
}

$entry = [
    'id' => $id,
    'name' => $origName,
    'type' => $type,
    'file' => $fileName,
    'url' => 'uploads/' . $fileName,
    'size' => filesize(UPLOAD_DIR . '/' . $fileName),
    'duration' => $type === 'image' ? 5 : 0,
    'width' => 0,
    'height' => 0,
    'created' => time(),
    'transcoded' => $transcoded,
];

$db = media_db();
$db[] = $entry;
media_db_save($db);

json_out(['ok' => true, 'media' => $entry]);
