// Rental section: the layout cards get a turnable 3D model on top of the catalogue drawing. The 3D code is only
// fetched when the section comes near the screen; if it cannot start (no WebGL), the drawings simply stay.

const hosts = [...document.querySelectorAll('.rental-view[data-layout]')];
const isShot = document.documentElement.classList.contains('is-shot');

if (hosts.length && !isShot && typeof IntersectionObserver === 'function') {
  const watcher = new IntersectionObserver(async (entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    watcher.disconnect();
    try {
      const { mountRentalViews } = await import('./viewer.js');
      mountRentalViews(hosts, { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
    } catch (err) {
      console.warn('[nilus] kiralık stand 3D görünümü açılamadı → çizimler kalıyor', err?.message || err);
    }
  }, { rootMargin: '900px 0px' });
  hosts.forEach((host) => watcher.observe(host));
}
