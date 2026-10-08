<?php
// POST api/mesajlar.php — a message or a quote request (JSON, sent by js/contact.js). The message is stored
// for the inbox (mesajlar/) and announced by e-mail. Same rules as the local preview (_dev/serve.ps1).

require __DIR__ . '/lib.php';

nilus_require_post();

$raw = file_get_contents('php://input', false, null, 0, NILUS_MAX_BODY + 1);
if ($raw === false || strlen($raw) > NILUS_MAX_BODY) nilus_json(413, array('ok' => false));
$in = json_decode($raw, true);
if (!is_array($in)) nilus_json(400, array('ok' => false));

// The form's trap field is invisible to people: whoever fills it is a bot. Accept and drop.
if (!empty($in['website'])) nilus_json(201, array('ok' => true));

nilus_rate_limit('mesaj', 20, 600);

$get = function ($key, $multiline = false) use ($in) {
  return isset($in[$key]) ? nilus_text($in[$key], $multiline) : '';
};
$name = $get('name');
$email = $get('email');
$company = $get('company');
$message = $get('message', true);

$valid = $name !== '' && nilus_len($name) <= 120
  && nilus_len($email) <= 200 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false
  && nilus_len($company) <= 160 && nilus_len($message) <= 4000;

// A quote request only has to say who is asking: event name, city, date, stand size and the note are all
// optional. A plain message needs its text.
$kind = 'message';
$brief = null;
if (isset($in['kind']) && $in['kind'] === 'brief') {
  $kind = 'brief';
  $brief = array('event' => $get('event'), 'city' => $get('city'), 'date' => $get('date'), 'size' => $get('size'));
  $valid = $valid && nilus_len($brief['event']) <= 160 && nilus_len($brief['city']) <= 80
    && ($brief['date'] === '' || preg_match('/^\d{4}-\d{2}-\d{2}$/', $brief['date'])) && nilus_len($brief['size']) <= 80;
} else {
  $valid = $valid && $message !== '';
}

$files = array();
$ids = isset($in['files']) && is_array($in['files']) ? $in['files'] : array();
foreach ($ids as $id) {
  $meta = nilus_upload_meta($id);
  if ($meta) $files[] = $meta; else $valid = false;
}
if (!$valid || count($files) > NILUS_MAX_FILES) nilus_json(422, array('ok' => false));

$record = array(
  'id' => nilus_id(),
  'date' => date('c'),
  'name' => $name, 'email' => $email, 'company' => $company, 'message' => $message,
  'files' => $files, 'read' => false, 'kind' => $kind, 'brief' => $brief, 'notified' => false,
);

/* ---------- e-mail notice ---------- */
$lines = array();
$lines[] = ($kind === 'brief' ? 'Teklif talebi' : 'Mesaj') . ' — nilus.com.tr';
$lines[] = '';
$lines[] = 'Ad Soyad: ' . $name;
if ($company !== '') $lines[] = 'Firma: ' . $company;
$lines[] = 'E-posta: ' . $email;
if ($brief) {
  $lines[] = '';
  if ($brief['event'] !== '') $lines[] = 'Etkinlik: ' . $brief['event']; // the form no longer asks for it
  $lines[] = 'Şehir: ' . ($brief['city'] !== '' ? $brief['city'] : '—');
  $lines[] = 'Etkinlik tarihi: ' . ($brief['date'] !== '' ? date('d.m.Y', strtotime($brief['date'])) : '—');
  $lines[] = 'Stand ölçüsü: ' . ($brief['size'] !== '' ? $brief['size'] : '—');
}
if ($message !== '') {
  $lines[] = '';
  $lines[] = $kind === 'brief' ? 'Notlar:' : 'Mesaj:';
  $lines[] = $message;
}
if ($files) {
  $lines[] = '';
  $lines[] = 'Ekli dosyalar (' . count($files) . '):';
  foreach ($files as $file) $lines[] = '  - ' . $file['name'];
  $lines[] = 'Dosyaları mesajlar sayfasından açabilirsiniz.';
}
$lines[] = '';
$lines[] = 'Tüm mesajlar: https://nilus.com.tr/mesajlar/';
$lines[] = 'Bu e-postayı yanıtlarsanız yanıtınız doğrudan gönderene gider.';

$encode = function ($text) {
  return '=?UTF-8?B?' . base64_encode($text) . '?=';
};
$subject = ($kind === 'brief' ? 'Teklif talebi: ' : 'Yeni mesaj: ') . $name . ($company !== '' ? ' (' . $company . ')' : '');
$headers = array(
  'From: ' . $encode('Nilus web sitesi') . ' <' . nilus_sender() . '>',
  'Reply-To: ' . $email, // validated above: a single address, no line breaks
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: base64', // safe for any mail server, whatever the text contains
);
$to = implode(', ', nilus_recipients());
$body = chunk_split(base64_encode(implode("\r\n", $lines)));
$headerText = implode("\r\n", $headers);

// The notice is handed straight to the hosting's own mail server. PHP's mail() is not used first: on this
// hosting it answers "sent" and the message never reaches the mail system (seen in cPanel's delivery report,
// 2026-10-08). It stays as a last resort, and its answer is not trusted.
$domain = substr(strrchr(nilus_sender(), '@'), 1);
$full = implode("\r\n", array_merge(array(
  'Date: ' . date('r'),
  'To: ' . $to,
  'Subject: ' . $encode($subject),
  'Message-ID: <' . $record['id'] . '@' . $domain . '>',
), $headers)) . "\r\n\r\n" . $body;
$problem = nilus_smtp_local(nilus_sender(), nilus_recipients(), $full);
$record['notified'] = $problem === '';
if ($problem !== '') {
  $fallback = @mail($to, $encode($subject), $body, $headerText);
  $record['notifyError'] = substr('smtp: ' . $problem . ' | mail(): ' . ($fallback ? 'accepted' : 'refused'), 0, 300);
}

nilus_locked(function () use ($record) {
  $list = nilus_purge_trash(nilus_messages()); // also the moment old deleted messages leave for good
  $list[] = $record;
  nilus_save_messages($list);
});

// "mail" says whether the mail server took the notice (the message itself is stored either way).
nilus_json(201, array('ok' => true, 'mail' => $record['notified']));
