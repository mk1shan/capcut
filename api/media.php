<?php
/**
 * GET                      -> list media
 * POST {action:update, id, duration, width, height}
 * POST {action:delete, id}
 */
require __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $list = array_values(array_filter(media_db(), fn($m) => is_file(UPLOAD_DIR . '/' . $m['file'])));
    json_out(['ok' => true, 'media' => $list]);
}

$body = read_json_body();
$id = safe_id($body['id'] ?? '');
$action = $body['action'] ?? '';
$db = media_db();
$idx = null;
foreach ($db as $i => $m) if ($m['id'] === $id) { $idx = $i; break; }
if ($idx === null) fail('Media not found', 404);

if ($action === 'update') {
    foreach (['duration', 'width', 'height'] as $k) {
        if (isset($body[$k]) && is_numeric($body[$k])) $db[$idx][$k] = (float)$body[$k];
    }
    if (isset($body['name'])) $db[$idx]['name'] = mb_substr(strip_tags((string)$body['name']), 0, 200);
    media_db_save($db);
    json_out(['ok' => true, 'media' => $db[$idx]]);
}

if ($action === 'delete') {
    $file = UPLOAD_DIR . '/' . basename($db[$idx]['file']);
    if (is_file($file)) @unlink($file);
    array_splice($db, $idx, 1);
    media_db_save($db);
    json_out(['ok' => true]);
}

fail('Unknown action');
