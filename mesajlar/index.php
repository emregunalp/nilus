<?php
// The inbox: every message and quote request sent from the site, newest first. This folder must be
// password-protected in cPanel (Directory Privacy); until it is, nothing is shown.
require dirname(__DIR__) . '/api/lib.php';

header('Cache-Control: private, no-store');
header('X-Robots-Tag: noindex, nofollow');
$version = function ($file) {
  $time = @filemtime(dirname(__DIR__) . '/css/' . $file);
  return $time ? $time : 1;
};

if (!nilus_inbox_protected(__DIR__)) {
  http_response_code(403);
  ?><!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Mesajlar — Nilus</title>
  <link rel="stylesheet" href="../css/fonts.css?v=<?php echo $version('fonts.css'); ?>">
  <link rel="stylesheet" href="../css/base.css?v=<?php echo $version('base.css'); ?>">
</head>
<body>
  <main style="max-width: 640px; margin: 0 auto; padding: 72px var(--gutter);">
    <p class="eyebrow"><span class="neon-dot" aria-hidden="true"></span>Nilus · site mesajları</p>
    <h1 style="margin-top: 14px; font: 350 2.4rem/1.05 var(--font-display); letter-spacing: -.025em;">Bu sayfa henüz şifreyle korunmuyor.</h1>
    <p style="margin-top: 20px; line-height: 1.65;">Mesajlar yalnızca bu klasör şifrelendikten sonra gösterilir. cPanel'de <strong>Directory Privacy</strong> bölümünden <strong>public_html/mesajlar</strong> klasörünü seçip bir kullanıcı adı ve şifre belirleyin; ardından bu sayfayı yenileyin.</p>
  </main>
</body>
</html>
<?php
  exit;
}
?>
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Gelen mesajlar — Nilus</title>
  <link rel="icon" href="../assets/favicon.svg?v=2" type="image/svg+xml">
  <link rel="stylesheet" href="../css/fonts.css?v=<?php echo $version('fonts.css'); ?>">
  <link rel="stylesheet" href="../css/base.css?v=<?php echo $version('base.css'); ?>">
  <style>
    /* Inbox for the site's message forms. Not linked from the site; this folder is password-protected. */
    .inbox { max-width: 920px; margin: 0 auto; padding: 48px var(--gutter) 96px; }
    .inbox-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 20px 32px; padding-bottom: 28px; border-bottom: 1px solid var(--ink); }
    .inbox-title { margin-top: 14px; font: 350 clamp(2.2rem, 1.4rem + 3vw, 3.8rem)/1 var(--font-display); letter-spacing: -.025em; }
    .inbox-tools { display: flex; align-items: center; gap: 16px; }
    .inbox-count { font: 500 var(--fs-mono)/1.4 var(--font-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2); }
    .inbox-tools .btn { cursor: pointer; }
    .inbox-list { display: grid; }
    .inbox-empty { padding: 56px 0; color: var(--ink-2); }
    .msg { position: relative; display: grid; gap: 14px; padding: 28px 0 30px 22px; border-bottom: 1px solid var(--line); }
    .msg::before { content: ''; position: absolute; left: 0; top: 36px; width: 8px; height: 8px; border-radius: 50%; background: transparent; border: 1px solid rgba(27, 25, 22, .3); }
    .msg.is-new::before { background: var(--neon-pink); border-color: var(--neon-pink); box-shadow: 0 0 0 3px rgba(255, 47, 185, .14), 0 0 12px 1px rgba(255, 47, 185, .7); }
    .msg-top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 24px; }
    .msg-name { font: 400 1.45rem/1.15 var(--font-display); letter-spacing: -.015em; }
    .msg-date { font: 400 .72rem/1.4 var(--font-mono); letter-spacing: .06em; color: var(--ink-2); }
    .msg-from { display: flex; flex-wrap: wrap; gap: 4px 18px; font: 400 .8rem/1.5 var(--font-mono); letter-spacing: .02em; color: var(--ink-2); }
    .msg-who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; }
    .msg-warn { font: 400 .72rem/1.4 var(--font-mono); letter-spacing: .02em; color: #B0247F; }
    .msg-tag { padding: 5px 9px 4px; border: 1px solid var(--ink); border-radius: 999px; font: 500 .62rem/1 var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
    .msg-brief { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px 24px; margin: 0; padding: 16px 18px; border: 1px solid var(--line); border-radius: var(--radius); background: rgba(247, 244, 238, .7); }
    .msg-brief dt { font: 500 .62rem/1.2 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--ink-2); }
    .msg-brief dd { margin: 6px 0 0; font: 500 1rem/1.35 var(--font-body); overflow-wrap: anywhere; }
    .msg-text { max-width: 68ch; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
    .msg-files { display: flex; flex-wrap: wrap; align-items: stretch; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .msg-files a { display: block; height: 100%; text-decoration: none; border: 1px solid rgba(27, 25, 22, .16); border-radius: var(--radius); overflow: hidden; background: var(--lacquer); transition: border-color .3s var(--ease); }
    .msg-files a:hover { border-color: var(--ink); }
    .msg-files img { width: 168px; height: 126px; object-fit: cover; }
    .msg-files .doc { display: grid; align-content: center; gap: 6px; width: 168px; min-height: 126px; padding: 14px; }
    .msg-files .doc-ext { font: 500 .68rem/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--neon-pink); }
    .msg-files .doc-name { font: 500 .86rem/1.3 var(--font-body); overflow-wrap: anywhere; }
    .msg-files .doc-size { font: 400 .68rem/1 var(--font-mono); color: var(--ink-2); }
    .msg-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 4px; }
    .msg-actions button { cursor: pointer; }
    .msg:not(.is-new) .msg-read { display: none; }
    .msg-actions .msg-delete { margin-left: auto; color: #B0247F; border-color: rgba(176, 36, 127, .35); }
    .msg-actions .msg-delete:hover { border-color: #B0247F; }
    .msg.is-trashed { opacity: .82; }
    .msg.is-trashed::before { border-style: dashed; }
    /* the bin: closed by default, at the end of the list */
    .inbox-bin { margin-top: 56px; border-top: 1px solid var(--ink); }
    .inbox-bin summary { display: flex; align-items: baseline; gap: 12px; padding: 22px 0; cursor: pointer; list-style: none; }
    .inbox-bin summary::-webkit-details-marker { display: none; }
    .inbox-bin summary::after { content: '+'; margin-left: auto; font: 300 1.4rem/1 var(--font-body); color: var(--ink-2); }
    .inbox-bin[open] summary::after { content: '–'; }
    .bin-title { font: 400 1.45rem/1.15 var(--font-display); letter-spacing: -.015em; }
    .bin-count { font: 500 var(--fs-mono)/1.4 var(--font-mono); letter-spacing: .1em; color: var(--ink-2); }
    .bin-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px 24px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
    .bin-head .btn { cursor: pointer; }
    .bin-note { max-width: 60ch; font-size: .9rem; line-height: 1.6; color: var(--ink-2); }
    /* delete everything: last thing on the page, small, away from the other buttons */
    .inbox-foot { margin-top: 96px; padding-top: 22px; border-top: 1px solid var(--line); }
    .inbox-clear { cursor: pointer; color: #B0247F; border-color: rgba(176, 36, 127, .35); }
    .inbox-clear:hover { border-color: #B0247F; }
  </style>
</head>
<body>
  <main class="inbox">
    <header class="inbox-head">
      <div>
        <p class="eyebrow"><span class="neon-dot" aria-hidden="true"></span>Nilus · site mesajları</p>
        <h1 class="inbox-title">Gelen mesajlar</h1>
      </div>
      <div class="inbox-tools">
        <p class="inbox-count" role="status">Yükleniyor…</p>
        <button type="button" class="btn btn-ghost btn-small" id="refresh">Yenile</button>
      </div>
    </header>
    <div class="inbox-list" id="list"></div>

    <!-- Deleted messages wait here for two days before they are removed for good (api.php). -->
    <details class="inbox-bin" id="bin" hidden>
      <summary><span class="bin-title">Silinenler</span><span class="bin-count" id="bin-count"></span></summary>
      <div class="bin-head">
        <p class="bin-note" id="bin-note"></p>
        <button type="button" class="btn btn-ghost btn-small" id="restore-all">Tümünü geri al</button>
      </div>
      <div class="inbox-list" id="bin-list"></div>
    </details>

    <!-- At the very end of the page on purpose, far from "Yenile": it is not a button to hit by accident. -->
    <footer class="inbox-foot" id="foot" hidden>
      <button type="button" class="btn btn-ghost btn-small inbox-clear" id="clear">Tüm mesajları sil</button>
    </footer>
  </main>

  <script type="module">
    const ENDPOINT = 'api.php';
    const list = document.getElementById('list');
    const count = document.querySelector('.inbox-count');
    const bin = document.getElementById('bin');
    const binList = document.getElementById('bin-list');
    const binCount = document.getElementById('bin-count');
    const binNote = document.getElementById('bin-note');
    const foot = document.getElementById('foot');
    const dateFormat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
    const dayFormat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' });
    let keepHours = 48;
    let activeCount = 0;

    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    const formatSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
    const keepText = () => (keepHours % 24 === 0 ? `${keepHours / 24} gün` : `${keepHours} saat`);

    /** One change on the server (mark read, delete, restore…), then the lists are read again. */
    async function change(query, button) {
      if (button) button.disabled = true;
      try {
        const response = await fetch(`${ENDPOINT}?${query}`, { method: 'POST', headers: { 'X-Requested-With': 'nilus' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await load();
      } catch (err) {
        console.error('[nilus] işlem yapılamadı', err);
        alert('İşlem yapılamadı. Sayfayı yenileyip yeniden deneyin.');
        if (button) button.disabled = false;
      }
    }

    // Photos show as thumbnails that open full size; other files are download links.
    function attachments(files) {
      const ul = el('ul', 'msg-files');
      for (const file of files) {
        const li = el('li');
        const link = el('a');
        link.href = `${ENDPOINT}?dosya=${file.id}`;
        if (file.image) {
          link.target = '_blank';
          link.rel = 'noopener';
          const img = el('img');
          img.src = link.href;
          img.alt = file.name;
          img.loading = 'lazy';
          link.append(img);
        } else {
          link.download = file.name;
          const doc = el('span', 'doc');
          doc.append(el('span', 'doc-ext', file.name.split('.').pop()), el('span', 'doc-name', file.name), el('span', 'doc-size', formatSize(file.size)));
          link.append(doc);
        }
        li.append(link);
        ul.append(li);
      }
      return ul;
    }

    // A quote request (kind "brief") carries the event details from the contact form.
    function briefBlock(brief) {
      const dl = el('dl', 'msg-brief');
      const day = new Date(`${brief.date}T00:00`);
      const rows = [
        ...(brief.event ? [['Etkinlik', brief.event]] : []), // older requests; the form no longer asks for it
        ['Şehir', brief.city || '—'],
        ['Tarih', !brief.date ? '—' : Number.isNaN(day.getTime()) ? brief.date : dayFormat.format(day)],
        ['Stand ölçüsü', brief.size || '—'],
      ];
      for (const [label, value] of rows) {
        const row = el('div');
        row.append(el('dt', '', label), el('dd', '', value));
        dl.append(row);
      }
      return dl;
    }

    /** How long a deleted message still has before it is removed for good. */
    function timeLeft(deleted) {
      const hours = keepHours - (Date.now() - new Date(deleted).getTime()) / 3600000;
      if (!(hours > 0)) return 'Kısa süre içinde kalıcı olarak silinecek.';
      if (hours < 1) return 'Bir saatten kısa süre sonra kalıcı olarak silinecek.';
      return hours < 24 ? `Yaklaşık ${Math.round(hours)} saat sonra kalıcı olarak silinecek.` : `Yaklaşık ${Math.round(hours / 24)} gün sonra kalıcı olarak silinecek.`;
    }

    function messageItem(m, trashed) {
      const item = el('article', trashed ? 'msg is-trashed' : m.read ? 'msg' : 'msg is-new');
      const top = el('div', 'msg-top');
      const isBrief = m.kind === 'brief' && m.brief;
      const who = el('div', 'msg-who');
      who.append(el('h2', 'msg-name', m.name));
      if (isBrief) who.append(el('span', 'msg-tag', 'Teklif talebi'));
      top.append(who, el('time', 'msg-date', dateFormat.format(new Date(m.date))));
      const from = el('p', 'msg-from');
      from.append(el('span', '', m.email));
      if (m.company) from.append(el('span', '', m.company));
      const actions = el('div', 'msg-actions');
      const reply = el('a', 'btn btn-small', 'E-postayla yanıtla');
      reply.href = `mailto:${encodeURIComponent(m.email)}`;
      actions.append(reply);
      if (trashed) {
        const restore = el('button', 'btn btn-ghost btn-small', 'Geri al');
        restore.type = 'button';
        restore.addEventListener('click', () => change(`gerial=${m.id}`, restore));
        actions.append(restore);
      } else {
        const read = el('button', 'btn btn-ghost btn-small msg-read', 'Okundu olarak işaretle');
        read.type = 'button';
        read.addEventListener('click', () => change(`okundu=${m.id}`, read));
        const remove = el('button', 'btn btn-ghost btn-small msg-delete', 'Sil');
        remove.type = 'button';
        remove.addEventListener('click', () => {
          if (confirm(`${m.name} adlı kişiden gelen mesaj silinsin mi?\n\n${keepText()} boyunca sayfanın altındaki "Silinenler" bölümünden geri alabilirsiniz.`)) change(`sil=${m.id}`, remove);
        });
        actions.append(read, remove);
      }
      item.append(top, from);
      if (trashed) item.append(el('p', 'msg-warn', timeLeft(m.deleted)));
      if (isBrief) item.append(briefBlock(m.brief));
      if (m.message) item.append(el('p', 'msg-text', m.message));
      if (m.files?.length) item.append(attachments(m.files));
      if (m.notified === false) item.append(el('p', 'msg-warn', `Bu mesaj için bildirim e-postası gönderilemedi.${m.notifyError ? ` (${m.notifyError})` : ''}`));
      item.append(actions);
      return item;
    }

    function render({ messages = [], trash = [], keepHours: hours = 48 }) {
      keepHours = hours;
      activeCount = messages.length;
      const unread = messages.filter((m) => !m.read).length;
      count.textContent = messages.length ? `${messages.length} mesaj · ${unread} yeni` : 'Mesaj yok';
      list.replaceChildren(...(messages.length
        ? messages.map((m) => messageItem(m, false))
        : [el('p', 'inbox-empty', trash.length ? 'Gelen kutusu boş. Silinen mesajlar aşağıda duruyor.' : 'Henüz mesaj gelmedi. Sitedeki formdan gönderilen mesajlar burada görünür.')]));
      foot.hidden = !messages.length;
      bin.hidden = !trash.length;
      binCount.textContent = String(trash.length);
      binNote.textContent = `Silinen mesajlar burada ${keepText()} bekler, sonra ekleriyle birlikte kalıcı olarak silinir. O zamana kadar geri alabilirsiniz.`;
      binList.replaceChildren(...trash.map((m) => messageItem(m, true)));
    }

    async function load() {
      try {
        const response = await fetch(ENDPOINT, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        render(await response.json());
      } catch (err) {
        console.error('[nilus] mesajlar okunamadı', err);
        count.textContent = 'Mesajlar okunamadı';
        list.replaceChildren(el('p', 'inbox-empty', 'Mesajlar okunamadı. Sayfayı yenileyip yeniden deneyin.'));
      }
    }

    document.getElementById('refresh').addEventListener('click', load);
    document.getElementById('restore-all').addEventListener('click', (e) => change('tumunugerial=1', e.currentTarget));
    // Deleting everything asks twice.
    document.getElementById('clear').addEventListener('click', (e) => {
      const n = activeCount;
      if (!n) return;
      if (!confirm(`Gelen kutusundaki ${n} mesajın TÜMÜ silinsin mi?`)) return;
      if (!confirm(`Emin misiniz?\n\n${n} mesajın hepsi silinecek. ${keepText()} boyunca "Silinenler" bölümünden geri alabilirsiniz; sonra ekleriyle birlikte kalıcı olarak silinir.`)) return;
      change('tumunusil=1', e.currentTarget);
    });
    load();
  </script>
</body>
</html>
