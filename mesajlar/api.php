<?php
// The inbox's data (used by mesajlar/index.php). Answers only when this folder is password-protected.
//   GET  api.php                   → { messages, trash, keepHours }, each list newest first
//   GET  api.php?dosya=<id>        → one attachment (pictures inline, everything else as a download)
//   POST api.php?okundu=<id>       → mark a message as read
//   POST api.php?sil=<id>          → move a message to the bin
//   POST api.php?tumunusil=1       → move every message to the bin
//   POST api.php?gerial=<id>       → take a message back out of the bin
//   POST api.php?tumunugerial=1    → take everything back out of the bin
// Nothing is destroyed by a click: a deleted message waits in the bin for NILUS_TRASH_SECONDS (two days), so a
// mistake can be undone; after that it is removed for good together with its attachments (nilus_purge_trash).

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

if ($method === 'POST') {
  // A custom header cannot be sent by a form on another site, so these only come from the inbox page itself.
  if (!isset($_SERVER['HTTP_X_REQUESTED_WITH']) || $_SERVER['HTTP_X_REQUESTED_WITH'] !== 'nilus') nilus_json(400, array('ok' => false));

  // One message (by id) or all of them ($id === null); $change edits a message and says whether it applied.
  $apply = function ($id, $change) {
    return nilus_locked(function () use ($id, $change) {
      $list = nilus_purge_trash(nilus_messages());
      $hits = 0;
      foreach ($list as $i => $m) {
        if ($id !== null && (!isset($m['id']) || $m['id'] !== $id)) continue;
        $changed = call_user_func($change, $m);
        if ($changed !== null) { $list[$i] = $changed; $hits++; }
      }
      if ($hits) nilus_save_messages($list);
      return $hits;
    });
  };
  $idOf = function ($key) {
    $id = (string) $_GET[$key];
    if (!preg_match(NILUS_ID_PATTERN, $id)) nilus_json(400, array('ok' => false));
    return $id;
  };
  $toBin = function ($m) {
    if (!empty($m['deleted'])) return null;
    $m['deleted'] = date('c');
    return $m;
  };
  $fromBin = function ($m) {
    if (empty($m['deleted'])) return null;
    unset($m['deleted']);
    return $m;
  };
  $markRead = function ($m) {
    if (!empty($m['read'])) return null;
    $m['read'] = true;
    return $m;
  };

  $hits = null;
  if (isset($_GET['okundu'])) $hits = $apply($idOf('okundu'), $markRead);
  elseif (isset($_GET['sil'])) $hits = $apply($idOf('sil'), $toBin);
  elseif (isset($_GET['gerial'])) $hits = $apply($idOf('gerial'), $fromBin);
  elseif (isset($_GET['tumunusil'])) $hits = $apply(null, $toBin);
  elseif (isset($_GET['tumunugerial'])) $hits = $apply(null, $fromBin);
  if ($hits === null) nilus_json(400, array('ok' => false));
  nilus_json(200, array('ok' => true, 'count' => $hits));
}

if ($method === 'GET') {
  $list = nilus_locked(function () {
    return nilus_purge_trash(nilus_messages());
  });
  $messages = array();
  $trash = array();
  foreach (array_reverse($list) as $m) {
    if (empty($m['deleted'])) $messages[] = $m; else $trash[] = $m;
  }
  nilus_json(200, array('messages' => $messages, 'trash' => $trash, 'keepHours' => (int) (NILUS_TRASH_SECONDS / 3600)));
}

nilus_json(405, array('ok' => false));
