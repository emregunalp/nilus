<?php
// Shared code of the site's message system (PHP side, for the cPanel hosting).
//   api/mesajlar.php   POST  a message or a quote request from the contact form / the "Bize yazın" box
//   api/dosyalar.php   POST  one attachment (raw body, X-File-Name header) → { id }
//   mesajlar/          the inbox; that folder must be password-protected (cPanel → Directory Privacy)
// Messages and attachments are kept OUTSIDE the website folder (next to public_html), so they are never
// served as files and a site update never touches them. Nothing private is written in this repository.
// The local preview (_dev/serve.ps1) implements the same two POST addresses for testing without PHP.

date_default_timezone_set('Europe/Istanbul');

define('NILUS_MAX_BODY', 20000);
define('NILUS_MAX_FILE_BYTES', 15 * 1024 * 1024);
define('NILUS_MAX_FILES', 5);
define('NILUS_MAX_STORE_BYTES', 400 * 1024 * 1024); // all attachments together
define('NILUS_ID_PATTERN', '/^[0-9a-f]{32}$/');
define('NILUS_TRASH_SECONDS', 2 * 86400); // how long a message deleted in the inbox can still be taken back

function nilus_allowed_ext() {
  return array('jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'txt', 'dwg', 'ai', 'psd');
}

/** Types sent back as pictures by the inbox; everything else is offered as a download. */
function nilus_image_types() {
  return array('jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif');
}

/** Who is told about a new message. Written in pieces so address harvesters reading the public source skip them. */
function nilus_recipients() {
  $domain = 'nilus' . '.com' . '.tr';
  return array('info' . '@' . $domain, 'berk' . '@' . $domain);
}

function nilus_sender() {
  return 'info' . '@' . 'nilus' . '.com' . '.tr';
}

/** A new 32-character id (messages, attachments). */
function nilus_id() {
  return bin2hex(function_exists('random_bytes') ? random_bytes(16) : openssl_random_pseudo_bytes(16));
}

function nilus_json($status, $payload) {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  header('X-Content-Type-Options: nosniff');
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function nilus_len($text) {
  return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
}

/** Trimmed text without control characters (line breaks are kept only when $multiline). */
function nilus_text($value, $multiline = false) {
  if (!is_string($value) && !is_numeric($value)) return '';
  $text = (string) $value;
  $text = str_replace("\r\n", "\n", $text);
  $text = preg_replace($multiline ? '/[\x00-\x09\x0B-\x1F\x7F]/' : '/[\x00-\x1F\x7F]/', '', $text);
  return trim((string) $text);
}

/**
 * The private folder for messages and attachments: next to the website folder when the hosting allows it,
 * otherwise data/ inside it (never served: it carries its own deny rule and is not part of the repository).
 */
function nilus_data_dir() {
  static $dir = null;
  if ($dir !== null) return $dir;
  $site = dirname(__DIR__);
  $candidates = array(dirname($site) . '/nilus-veri', $site . '/data');
  foreach ($candidates as $candidate) {
    if (!is_dir($candidate)) @mkdir($candidate, 0700, true);
    if (is_dir($candidate) && is_writable($candidate)) {
      $guard = $candidate . '/.htaccess';
      if (!is_file($guard)) {
        @file_put_contents($guard, "<IfModule mod_rewrite.c>\n  RewriteEngine On\n  RewriteRule ^ - [F,L]\n</IfModule>\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n");
      }
      if (!is_dir($candidate . '/uploads')) @mkdir($candidate . '/uploads', 0700, true);
      $dir = $candidate;
      return $dir;
    }
  }
  nilus_json(500, array('ok' => false, 'error' => 'storage'));
}

/** Runs $work while holding the store's lock (one writer at a time). */
function nilus_locked($work) {
  $lock = fopen(nilus_data_dir() . '/kilit', 'c');
  if (!$lock) nilus_json(500, array('ok' => false, 'error' => 'lock'));
  flock($lock, LOCK_EX);
  try {
    $result = call_user_func($work);
  } catch (Exception $e) {
    flock($lock, LOCK_UN);
    fclose($lock);
    throw $e;
  }
  flock($lock, LOCK_UN);
  fclose($lock);
  return $result;
}

function nilus_read_json($file, $fallback) {
  if (!is_file($file)) return $fallback;
  $data = json_decode((string) file_get_contents($file), true);
  return is_array($data) ? $data : $fallback;
}

function nilus_write_json($file, $data) {
  $tmp = $file . '.yeni';
  file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
  rename($tmp, $file);
}

function nilus_messages() {
  return nilus_read_json(nilus_data_dir() . '/mesajlar.json', array());
}

function nilus_save_messages($list) {
  nilus_write_json(nilus_data_dir() . '/mesajlar.json', array_values($list));
}

/**
 * Messages deleted in the inbox carry a "deleted" time and wait in the bin; once that is older than
 * NILUS_TRASH_SECONDS they are removed for good, with their attachments. Takes the full list and returns what
 * remains (saving it when something was removed). Call it while holding the lock (nilus_locked).
 */
function nilus_purge_trash($list) {
  $keep = array();
  $removed = false;
  $now = time();
  foreach ($list as $m) {
    $deleted = !empty($m['deleted']) ? strtotime((string) $m['deleted']) : false;
    if ($deleted && $now - $deleted > NILUS_TRASH_SECONDS) {
      $removed = true;
      $files = isset($m['files']) && is_array($m['files']) ? $m['files'] : array();
      foreach ($files as $file) {
        if (isset($file['id']) && is_string($file['id']) && preg_match(NILUS_ID_PATTERN, $file['id'])) {
          @unlink(nilus_data_dir() . '/uploads/' . $file['id']);
          @unlink(nilus_data_dir() . '/uploads/' . $file['id'] . '.meta.json');
        }
      }
      continue;
    }
    $keep[] = $m;
  }
  if ($removed) nilus_save_messages($keep);
  return $keep;
}

function nilus_upload_meta($id) {
  if (!is_string($id) || !preg_match(NILUS_ID_PATTERN, $id)) return null;
  $meta = nilus_read_json(nilus_data_dir() . '/uploads/' . $id . '.meta.json', null);
  return is_array($meta) && is_file(nilus_data_dir() . '/uploads/' . $id) ? $meta : null;
}

/**
 * At most $limit requests of one kind from one address within $window seconds; answers 429 beyond that.
 * Addresses are stored hashed.
 */
function nilus_rate_limit($kind, $limit, $window) {
  $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
  $key = $kind . ':' . substr(hash('sha256', 'nilus|' . $ip), 0, 24);
  $allowed = nilus_locked(function () use ($key, $limit, $window) {
    $file = nilus_data_dir() . '/hiz.json';
    $now = time();
    $log = nilus_read_json($file, array());
    foreach ($log as $k => $times) {
      $recent = array();
      foreach ((array) $times as $t) { if ($now - (int) $t < 3600) $recent[] = (int) $t; }
      if ($recent) $log[$k] = $recent; else unset($log[$k]);
    }
    $mine = isset($log[$key]) ? $log[$key] : array();
    $inWindow = 0;
    foreach ($mine as $t) { if ($now - $t < $window) $inWindow++; }
    $ok = $inWindow < $limit;
    if ($ok) { $mine[] = $now; $log[$key] = $mine; }
    nilus_write_json($file, $log);
    return $ok;
  });
  if (!$allowed) nilus_json(429, array('ok' => false, 'error' => 'rate'));
}

function nilus_require_post() {
  if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    nilus_json(405, array('ok' => false));
  }
}

/**
 * The inbox must only answer behind the folder's password. True when the web server has authenticated the
 * visitor, or when the folder's own access rules demand a login (then no request reaches PHP without one).
 * PHP_AUTH_USER is deliberately not trusted: without a server-side rule anyone can send that header.
 */
function nilus_inbox_protected($folder) {
  foreach (array('REMOTE_USER', 'REDIRECT_REMOTE_USER') as $key) {
    if (!empty($_SERVER[$key])) return true;
  }
  $rules = @file_get_contents($folder . '/.htaccess');
  return is_string($rules) && preg_match('/^\s*AuthType\s+\S+/mi', $rules) && preg_match('/^\s*Require\s+(valid-user|user\s+\S+)/mi', $rules);
}

/**
 * Hands a complete message (headers, blank line, body) to this hosting's own mail server over SMTP. No login is
 * involved: the recipients are the domain's own mailboxes, and a mail server takes mail for its own mailboxes
 * from anyone — this is how every outside sender reaches them. Returns '' when the server took the message,
 * otherwise a short note of the step that failed and the server's answer.
 */
function nilus_smtp_local($from, $recipients, $message) {
  if (!function_exists('stream_socket_client')) return 'no sockets';
  $socket = null;
  $error = '';
  foreach (array('127.0.0.1', 'localhost', 'mail.' . substr(strrchr($from, '@'), 1)) as $host) {
    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client('tcp://' . $host . ':25', $errno, $errstr, 6);
    if ($socket) break;
    $error = $host . ': ' . $errstr;
  }
  if (!$socket) return 'connect ' . $error;
  stream_set_timeout($socket, 12);

  // One command, one reply; a reply may run over several lines ("250-…" continues, "250 …" ends).
  $say = function ($command, $expect) use ($socket) {
    if ($command !== null) fwrite($socket, $command . "\r\n");
    $reply = '';
    while (($line = fgets($socket, 600)) !== false) {
      $reply .= $line;
      if (strlen($line) < 4 || $line[3] !== '-') break;
    }
    if ($reply === '') return 'no reply';
    return substr($reply, 0, 3) === $expect ? '' : trim(substr($reply, 0, 160));
  };

  $steps = array(array(null, '220', 'greeting'), array('EHLO ' . substr(strrchr($from, '@'), 1), '250', 'EHLO'), array('MAIL FROM:<' . $from . '>', '250', 'MAIL FROM'));
  foreach ($recipients as $to) $steps[] = array('RCPT TO:<' . $to . '>', '250', 'RCPT TO');
  $steps[] = array('DATA', '354', 'DATA');
  $failure = '';
  foreach ($steps as $step) {
    $answer = $say($step[0], $step[1]);
    if ($answer !== '') { $failure = $step[2] . ': ' . $answer; break; }
  }
  if ($failure === '') {
    // A line that starts with a dot is doubled (SMTP's own rule); a dot alone on a line ends the message.
    $data = preg_replace('/^\./m', '..', str_replace("\r\n", "\n", $message));
    fwrite($socket, str_replace("\n", "\r\n", $data) . "\r\n.\r\n");
    $answer = $say(null, '250');
    if ($answer !== '') $failure = 'end of message: ' . $answer;
  }
  @fwrite($socket, "QUIT\r\n");
  @fclose($socket);
  return $failure;
}
