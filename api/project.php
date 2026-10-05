<?php
/**
 * GET  ?list=1               -> list projects (newest first)
 * GET  ?id=xxx               -> load project
 * POST {project:{...}}       -> save (creates id if missing)
 * POST {action:delete, id}   -> delete
 */
require __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['list'])) {
        $out = [];
        foreach (glob(PROJECT_DIR . '/*.json') as $file) {
            $p = json_file_read($file, null);
            if (!$p) continue;
            $out[] = [
                'id' => $p['id'] ?? basename($file, '.json'),
                'name' => $p['name'] ?? 'Untitled',
                'ratio' => $p['ratio'] ?? '16:9',
                'updated' => $p['updated'] ?? filemtime($file),
                'duration' => $p['durationCache'] ?? 0,
                'thumb' => $p['thumb'] ?? null,
            ];
        }
        usort($out, fn($a, $b) => $b['updated'] <=> $a['updated']);
        json_out(['ok' => true, 'projects' => $out]);
    }
    $id = safe_id($_GET['id'] ?? '');
    $file = PROJECT_DIR . "/$id.json";
    if (!$id || !is_file($file)) fail('Project not found', 404);
    json_out(['ok' => true, 'project' => json_file_read($file, null)]);
}

$body = read_json_body();

if (($body['action'] ?? '') === 'delete') {
    $id = safe_id($body['id'] ?? '');
    $file = PROJECT_DIR . "/$id.json";
    if ($id && is_file($file)) @unlink($file);
    json_out(['ok' => true]);
}

$p = $body['project'] ?? null;
if (!is_array($p)) fail('Missing project');
$id = safe_id($p['id'] ?? '');
if (!$id) $id = new_id('p_');
$p['id'] = $id;
$p['updated'] = time();
if (isset($p['thumb']) && (!is_string($p['thumb']) || strlen($p['thumb']) > 200000)) unset($p['thumb']);
json_file_write(PROJECT_DIR . "/$id.json", $p);
json_out(['ok' => true, 'id' => $id, 'updated' => $p['updated']]);
