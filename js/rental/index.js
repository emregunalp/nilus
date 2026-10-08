// Rental section: each layout card gets a turnable 3D model on top of its picture. The 3D code is only fetched
// when the cards come near the screen; if it cannot start (no WebGL), the pictures simply stay.

const hosts = [...document.querySelectorAll('.rental-view[data-layout]')];
const isShot = document.documentElement.classList.contains('is-shot');

if (hosts.length && !isShot && typeof IntersectionObserver === 'function') {
  const watcher = new IntersectionObserver(async (entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    watcher.disconnect();
    try {
      const { mountRentalViews } = await import('./viewer.js');
      await mountRentalViews(hosts, { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
    } catch (err) {
      console.warn('[nilus] kiralık stand 3D görünümü açılamadı → çizimler kalıyor', err?.message || err);
    }
  }, { rootMargin: '900px 0px' });
  hosts.forEach((host) => watcher.observe(host));
}
