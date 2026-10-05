<?php
/**
 * ClipLab Studio - configuration & helpers
 */
define('APP_NAME', 'ClipLab Studio');
define('APP_VERSION', '1.1.0');
define('ROOT', __DIR__);
define('UPLOAD_DIR', ROOT . '/uploads');
define('EXPORT_DIR', ROOT . '/exports');
define('DATA_DIR', ROOT . '/data');
define('PROJECT_DIR', DATA_DIR . '/projects');
define('MEDIA_DB', DATA_DIR . '/media.json');
define('MAX_UPLOAD_MB', 4096);

// Optional: set full path to ffmpeg.exe here if it is not in PATH
// e.g. 'C:\\ffmpeg\\bin\\ffmpeg.exe'
define('FFMPEG_PATH', getenv('FFMPEG_PATH') ?: '');

foreach ([UPLOAD_DIR, EXPORT_DIR, DATA_DIR, PROJECT_DIR] as $d) {
    if (!is_dir($d)) @mkdir($d, 0775, true);
}

const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'flv', '3gp', 'ogv'];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus', 'weba'];
// formats browsers can't play natively -> transcoded with ffmpeg on upload (if available)
const TRANSCODE_EXT = ['mkv', 'avi', 'wmv', 'flv', '3gp'];

function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $msg, int $code = 400): void
{
    json_out(['ok' => false, 'error' => $msg], $code);
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '[]', true);
    return is_array($data) ? $data : [];
}

function new_id(string $prefix = ''): string
{
    return $prefix . bin2hex(random_bytes(6));
}

function safe_id(?string $id): string
{
    return preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)$id);
}

/** Read a JSON file with a shared lock */
function json_file_read(string $path, $default = [])
{
    if (!is_file($path)) return $default;
    $fp = fopen($path, 'rb');
    if (!$fp) return $default;
    flock($fp, LOCK_SH);
    $raw = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    $data = json_decode($raw, true);
    return $data === null ? $default : $data;
}

/** Write a JSON file atomically with an exclusive lock */
function json_file_write(string $path, $data): bool
{
    $fp = fopen($path, 'c+b');
    if (!$fp) return false;
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return true;
}

function media_db(): array
{
    return json_file_read(MEDIA_DB, []);
}

function media_db_save(array $list): void
{
    json_file_write(MEDIA_DB, array_values($list));
}

/** Locate ffmpeg; returns command path or null */
function find_ffmpeg(): ?string
{
    static $cached = false;
    if ($cached !== false) return $cached;
    $candidates = array_filter([
        FFMPEG_PATH,
        'ffmpeg',
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
    ]);
    if (!function_exists('exec')) return $cached = null;
    foreach ($candidates as $c) {
        $out = [];
        $code = 1;
        @exec(escapeshellarg($c) . ' -version 2>&1', $out, $code);
        if ($code === 0) return $cached = $c;
    }
    return $cached = null;
}

function run_ffmpeg(array $args, ?string &$log = null): bool
{
    $ff = find_ffmpeg();
    if (!$ff) return false;
    $cmd = escapeshellarg($ff) . ' ' . implode(' ', array_map('escapeshellarg', $args)) . ' 2>&1';
    $out = [];
    $code = 1;
    @set_time_limit(0);
    exec($cmd, $out, $code);
    $log = implode("\n", array_slice($out, -20));
    return $code === 0;
}
