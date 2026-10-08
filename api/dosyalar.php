<?php
// POST api/dosyalar.php — one attachment for a message: the file is the raw request body, its name comes
// URL-encoded in the X-File-Name header. Answers { ok, id }; the id is then listed in the message itself.
// Attachments are only ever read back through the password-protected inbox (mesajlar/api.php).

require __DIR__ . '/lib.php';

nilus_require_post();

$length = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
if ($length <= 0 || $length > NILUS_MAX_FILE_BYTES) nilus_json(413, array('ok' => false));

$name = isset($_SERVER['HTTP_X_FILE_NAME']) ? rawurldecode($_SERVER['HTTP_X_FILE_NAME']) : '';
$name = preg_replace('~^.*[\\\\/]~', '', nilus_text($name)); // file name only, whatever path came with it
$dot = strrpos($name, '.');
$ext = $dot === false ? '' : strtolower(substr($name, $dot + 1));
if ($name === '' || nilus_len($name) > 150 || !in_array($ext, nilus_allowed_ext(), true)) nilus_json(415, array('ok' => false));

nilus_rate_limit('dosya', 80, 600);

$dir = nilus_data_dir() . '/uploads';

// Attachments nobody sent a message with (the visitor gave up) are removed after a day; the store has a ceiling.
$used = 0;
$referenced = null;
foreach ((glob($dir . '/*.meta.json') ?: array()) as $metaFile) {
  $id = basename($metaFile, '.meta.json');
  $file = $dir . '/' . $id;
  $size = is_file($file) ? (int) filesize($file) : 0;
  if (time() - (int) filemtime($metaFile) > 86400) {
    if ($referenced === null) {
      $referenced = array();
      foreach (nilus_messages() as $m) {
        foreach ((isset($m['files']) && is_array($m['files']) ? $m['files'] : array()) as $f) {
          if (isset($f['id'])) $referenced[$f['id']] = true;
        }
      }
    }
    if (!isset($referenced[$id])) { @unlink($file); @unlink($metaFile); continue; }
  }
  $used += $size;
}
if ($used + $length > NILUS_MAX_STORE_BYTES) nilus_json(507, array('ok' => false, 'error' => 'full'));

$id = nilus_id();
$target = $dir . '/' . $id;
$in = fopen('php://input', 'rb');
$out = fopen($target, 'wb');
if (!$in || !$out) nilus_json(500, array('ok' => false));
$total = 0;
while (!feof($in)) {
  $chunk = fread($in, 81920);
  if ($chunk === false || $chunk === '') break;
  $total += strlen($chunk);
  if ($total > NILUS_MAX_FILE_BYTES) break;
  fwrite($out, $chunk);
}
fclose($in);
fclose($out);
if ($total <= 0 || $total > NILUS_MAX_FILE_BYTES) {
  @unlink($target);
  nilus_json(413, array('ok' => false));
}

$types = nilus_image_types();
nilus_write_json($target . '.meta.json', array('id' => $id, 'name' => $name, 'size' => $total, 'image' => isset($types[$ext])));

nilus_json(201, array('ok' => true, 'id' => $id));
