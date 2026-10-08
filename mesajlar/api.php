<?php
// The inbox's data (used by mesajlar/index.php). Answers only when this folder is password-protected.
//   GET  api.php                 → all messages, newest first
//   GET  api.php?dosya=<id>      → one attachment (pictures inline, everything else as a download)
//   POST api.php?okundu=<id>     → mark a message as read

require dirname(__DIR__) . '/api/lib.php';

if (!nilus_inbox_protected(__DIR__)) nilus_json(403, array('ok' => false, 'error' => 'unprotected'));

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

if ($method === 'GET' && isset($_GET['dosya'])) {
  $meta = nilus_upload_meta($_GET['dosya']);
  if (!$meta) { http_response_code(404); exit; }
  $file = nilus_data_dir() . '/uploads/' . $meta['id'];
  $dot = strrpos($meta['name'], '.');
  $ext = $dot === false ? '' : strtolower(substr($meta['name'], $dot + 1));
  $types = nilus_image_types();
  header('X-Content-Type-Options: nosniff');
  header('Cache-Control: private, no-store');
  header('Content-Length: ' . filesize($file));
  if (isset($types[$ext])) {
    header('Content-Type: ' . $types[$ext]);
  } else {
    header('Content-Type: application/octet-stream');
    header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode($meta['name']));
  }
  readfile($file);
  exit;
}

if ($method === 'POST' && isset($_GET['okundu'])) {
  // A custom header cannot be sent by a form on another site, so this only comes from the inbox page itself.
  if (!isset($_SERVER['HTTP_X_REQUESTED_WITH']) || $_SERVER['HTTP_X_REQUESTED_WITH'] !== 'nilus') nilus_json(400, array('ok' => false));
  $id = (string) $_GET['okundu'];
  if (!preg_match(NILUS_ID_PATTERN, $id)) nilus_json(400, array('ok' => false));
  $found = nilus_locked(function () use ($id) {
    $list = nilus_messages();
    $hit = false;
    foreach ($list as $i => $m) {
      if (isset($m['id']) && $m['id'] === $id) { $list[$i]['read'] = true; $hit = true; }
    }
    if ($hit) nilus_save_messages($list);
    return $hit;
  });
  nilus_json($found ? 200 : 404, array('ok' => $found));
}

if ($method === 'GET') {
  nilus_json(200, array_reverse(nilus_messages()));
}

nilus_json(405, array('ok' => false));
