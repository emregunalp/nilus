// Message forms (contact section + bottom-right message box): attachments are uploaded first, then the message is
// posted as JSON to the form's data-endpoint (api/mesajlar.php on the site, the same address on the local preview
// server); the inbox is mesajlar/. If the endpoint is unreachable the visitor is pointed to the e-mail address instead.
// The contact form can also send a quote request (kind "brief": event, city, date, stand size); its radio switch
// shows the parts of the form marked with the matching data-kind. It also asks for the company, which is required
// there; the message box has no such field.

import { t } from './i18n.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FALLBACK_EMAIL = 'info@nilus.com.tr';
const UPLOAD_ENDPOINT = 'api/dosyalar.php';
// Keep in step with api/lib.php and _dev/serve.ps1 (file count, size and type limits).
const MAX_FILES = 5;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'txt', 'dwg', 'ai', 'psd'];

const extensionOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const formatSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function initForm(form) {
  const status = form.querySelector('.form-status');
  const submit = form.querySelector('button[type="submit"]');
  const { name, email, message, company, website, kind } = form.elements;
  const brief = kind ? { event: form.elements.event, city: form.elements.city, date: form.elements.date, size: form.elements.size } : null;
  const picker = form.querySelector('input[type="file"]');
  const fileList = form.querySelector('.file-list');
  const isBrief = () => Boolean(kind) && kind.value === 'brief';
  const who = company ? [name, company, email] : [name, email];
  const required = () => (isBrief() ? [...who, brief.date] : [...who, message]);
  const fields = [...who, message, ...(brief ? [brief.date] : [])];
  let files = [];

  const say = (text, kind = '') => {
    status.textContent = text;
    status.classList.toggle('is-ok', kind === 'ok');
    status.classList.toggle('is-error', kind === 'error');
  };
  const mark = (field, invalid) => (invalid ? field.setAttribute('aria-invalid', 'true') : field.removeAttribute('aria-invalid'));
  const isInvalid = (field) => (field === email ? !EMAIL_PATTERN.test(field.value.trim()) : !field.value.trim());

  function renderFiles() {
    if (!fileList) return;
    fileList.replaceChildren(...files.map((file) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'file-name';
      label.textContent = file.name;
      const size = document.createElement('span');
      size.className = 'file-size';
      size.textContent = formatSize(file.size);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', t(`${file.name} dosyasını kaldır`, `Remove ${file.name}`));
      remove.addEventListener('click', () => { files = files.filter((f) => f !== file); renderFiles(); });
      li.append(label, size, remove);
      return li;
    }));
  }

  picker?.addEventListener('change', () => {
    const rejected = [];
    for (const file of picker.files) {
      if (!ALLOWED_EXT.includes(extensionOf(file.name))) rejected.push(`${file.name}: ${t('bu dosya türü desteklenmiyor', 'this file type is not supported')}`);
      else if (file.size > MAX_FILE_BYTES) rejected.push(`${file.name}: ${t('15 MB sınırını aşıyor', 'larger than the 15 MB limit')}`);
      else if (files.length >= MAX_FILES) rejected.push(`${file.name}: ${t(`en fazla ${MAX_FILES} dosya eklenebilir`, `no more than ${MAX_FILES} files can be added`)}`);
      else files.push(file);
    }
    picker.value = '';
    renderFiles();
    say(rejected.join(' · '), rejected.length ? 'error' : '');
  });

  fields.forEach((field) => field.addEventListener('input', () => mark(field, false)));

  function syncKind() {
    form.querySelectorAll('[data-kind]').forEach((el) => { el.hidden = el.dataset.kind !== kind.value; });
    fields.forEach((field) => mark(field, false));
  }
  if (kind) {
    form.addEventListener('change', (e) => { if (e.target.name === 'kind') { syncKind(); say(''); } });
    syncKind();
  }

  async function upload(file) {
    const response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
    });
    if (!response.ok) throw new Error(`upload HTTP ${response.status}`);
    return (await response.json()).id;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const asBrief = isBrief();
    const problems = required().filter(isInvalid);
    fields.forEach((field) => mark(field, problems.includes(field)));
    if (problems.length) {
      const last = asBrief ? t('etkinlik tarihini', 'the date of the event') : t('mesajınızı', 'your message');
      say(company
        ? t(`Lütfen adınızı, firmanızı, geçerli bir e-posta adresini ve ${last} yazın.`, `Please enter your name, your company, a valid e-mail address and ${last}.`)
        : t(`Lütfen adınızı, geçerli bir e-posta adresini ve ${last} yazın.`, `Please enter your name, a valid e-mail address and ${last}.`), 'error');
      problems[0].focus();
      return;
    }
    submit.disabled = true;
    try {
      const ids = [];
      for (const [i, file] of files.entries()) {
        say(t(`Dosyalar yükleniyor (${i + 1}/${files.length})…`, `Uploading files (${i + 1}/${files.length})…`));
        ids.push(await upload(file));
      }
      say(t('Gönderiliyor…', 'Sending…'));
      const response = await fetch(form.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.value.trim(),
          email: email.value.trim(),
          company: company ? company.value.trim() : '',
          message: message.value.trim(),
          files: ids,
          website: website ? website.value : '',
          ...(asBrief && {
            kind: 'brief',
            event: brief.event.value.trim(),
            city: brief.city.value.trim(),
            date: brief.date.value,
            size: brief.size.value.trim(),
          }),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      form.reset();
      if (kind) syncKind();
      files = [];
      renderFiles();
      say(asBrief
        ? t('Talebiniz bize ulaştı. En kısa sürede dönüş yapacağız.', 'We have received your request and will get back to you shortly.')
        : t('Mesajınız bize ulaştı. En kısa sürede dönüş yapacağız.', 'We have received your message and will get back to you shortly.'), 'ok');
    } catch (err) {
      console.error('[nilus] mesaj gönderilemedi', err);
      // The short code at the end says where it failed (file upload or message, and the server's answer), so that
      // a visitor's "it did not send" can be traced.
      const text = String(err?.message || '');
      const status = /HTTP (\d+)/.exec(text)?.[1];
      const code = `${text.startsWith('upload') ? t('dosya', 'file') : t('mesaj', 'message')} ${status || t('bağlantı', 'connection')}`;
      say(status === '429'
        ? t('Kısa sürede çok fazla gönderim yapıldı. Lütfen birkaç dakika sonra yeniden deneyin.', 'Too many submissions in a short time. Please try again in a few minutes.')
        : t(`Mesaj gönderilemedi. Lütfen ${FALLBACK_EMAIL} adresine yazın. (${code})`, `The message could not be sent. Please write to ${FALLBACK_EMAIL}. (${code})`), 'error');
    } finally {
      submit.disabled = false;
    }
  });
}

function initHelpbox() {
  const box = document.getElementById('helpbox');
  if (!box) return;
  const toggle = box.querySelector('.helpbox-toggle');
  const panel = box.querySelector('.helpbox-panel');
  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('input')?.focus();
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  box.querySelector('.helpbox-close')?.addEventListener('click', () => { setOpen(false); toggle.focus(); });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); }
  });
}

/**
 * "Telefonu göster": the number is kept out of the HTML (number harvesters read pages, they do not press buttons).
 * data-k carries its ten digits after the leading 0, each as a letter: digit d → letter number (3d + 4) mod 10.
 */
function initPhoneReveal() {
  document.querySelectorAll('.phone-reveal[data-k]').forEach((button) => {
    button.addEventListener('click', () => {
      const d = [...button.dataset.k].map((ch) => (((ch.charCodeAt(0) - 97 - 4 + 10) * 7) % 10)).join('');
      const link = document.createElement('a');
      link.href = `tel:+90${d}`;
      const spaced = `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
      link.textContent = t(`0${spaced}`, `+90 ${spaced}`);
      button.replaceWith(link);
      link.focus();
    });
  });
}

document.querySelectorAll('form[data-endpoint]').forEach(initForm);
initPhoneReveal();
initHelpbox();
