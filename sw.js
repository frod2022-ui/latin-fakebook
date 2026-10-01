/* Latin Fake Book — offline support: app shell (refreshed in the background) + instrument samples (kept for good). */
const CACHE = 'lfb-shell-bef9d2468d';
const SAMPLES = 'lfb-samples-78b98b3b';
const SHELL = ["./","./index.html","./style.css","./core.js","./chords.js","./engine.js","./audio.js","./staff.js","./songs.js","./app.js","./manifest.webmanifest","./icon.svg","./icon-192.png","./icon-512.png","./apple-touch-icon.png","./samples/CREDITS.txt"];
const SAMPLE_FILES = ["./samples/bass/28.mp3","./samples/bass/31.mp3","./samples/bass/34.mp3","./samples/bass/37.mp3","./samples/bass/40.mp3","./samples/bass/43.mp3","./samples/bass/46.mp3","./samples/bass/49.mp3","./samples/bass/52.mp3","./samples/bass/55.mp3","./samples/bass/58.mp3","./samples/bass/61.mp3","./samples/flute/60.mp3","./samples/flute/64.mp3","./samples/flute/69.mp3","./samples/flute/72.mp3","./samples/flute/76.mp3","./samples/flute/81.mp3","./samples/flute/84.mp3","./samples/flute/88.mp3","./samples/flute/93.mp3","./samples/flute/96.mp3","./samples/guitar/40.mp3","./samples/guitar/43.mp3","./samples/guitar/46.mp3","./samples/guitar/49.mp3","./samples/guitar/52.mp3","./samples/guitar/55.mp3","./samples/guitar/58.mp3","./samples/guitar/61.mp3","./samples/guitar/64.mp3","./samples/guitar/67.mp3","./samples/guitar/70.mp3","./samples/guitar/73.mp3","./samples/guitar/76.mp3","./samples/guitar/79.mp3","./samples/guitar/82.mp3","./samples/guitar/85.mp3","./samples/perc/bell_1.mp3","./samples/perc/bell_2.mp3","./samples/perc/bell_acc.mp3","./samples/perc/clave_1.mp3","./samples/perc/clave_2.mp3","./samples/perc/clave_acc.mp3","./samples/perc/conga_open1.mp3","./samples/perc/conga_open2.mp3","./samples/perc/conga_slap.mp3","./samples/perc/conga_tap1.mp3","./samples/perc/conga_tap2.mp3","./samples/perc/guiro_long.mp3","./samples/perc/guiro_short1.mp3","./samples/perc/guiro_short2.mp3","./samples/perc/kick_1.mp3","./samples/perc/kick_2.mp3","./samples/perc/kick_acc.mp3","./samples/perc/quinto_open1.mp3","./samples/perc/quinto_open2.mp3","./samples/perc/quinto_tap.mp3","./samples/perc/tamb_shake.mp3","./samples/perc/tap_1.mp3","./samples/perc/tap_2.mp3","./samples/perc/tap_acc.mp3","./samples/perc/timbal_1.mp3","./samples/perc/timbal_2.mp3","./samples/perc/tumba_open1.mp3","./samples/perc/tumba_open2.mp3","./samples/piano/f102.mp3","./samples/piano/f105.mp3","./samples/piano/f24.mp3","./samples/piano/f27.mp3","./samples/piano/f30.mp3","./samples/piano/f33.mp3","./samples/piano/f36.mp3","./samples/piano/f39.mp3","./samples/piano/f42.mp3","./samples/piano/f45.mp3","./samples/piano/f48.mp3","./samples/piano/f51.mp3","./samples/piano/f54.mp3","./samples/piano/f57.mp3","./samples/piano/f60.mp3","./samples/piano/f63.mp3","./samples/piano/f66.mp3","./samples/piano/f69.mp3","./samples/piano/f72.mp3","./samples/piano/f75.mp3","./samples/piano/f78.mp3","./samples/piano/f81.mp3","./samples/piano/f84.mp3","./samples/piano/f87.mp3","./samples/piano/f90.mp3","./samples/piano/f93.mp3","./samples/piano/f96.mp3","./samples/piano/f99.mp3","./samples/piano/m102.mp3","./samples/piano/m105.mp3","./samples/piano/m24.mp3","./samples/piano/m27.mp3","./samples/piano/m30.mp3","./samples/piano/m33.mp3","./samples/piano/m36.mp3","./samples/piano/m39.mp3","./samples/piano/m42.mp3","./samples/piano/m45.mp3","./samples/piano/m48.mp3","./samples/piano/m51.mp3","./samples/piano/m54.mp3","./samples/piano/m57.mp3","./samples/piano/m60.mp3","./samples/piano/m63.mp3","./samples/piano/m66.mp3","./samples/piano/m69.mp3","./samples/piano/m72.mp3","./samples/piano/m75.mp3","./samples/piano/m78.mp3","./samples/piano/m81.mp3","./samples/piano/m84.mp3","./samples/piano/m87.mp3","./samples/piano/m90.mp3","./samples/piano/m93.mp3","./samples/piano/m96.mp3","./samples/piano/m99.mp3","./samples/piano/p102.mp3","./samples/piano/p105.mp3","./samples/piano/p24.mp3","./samples/piano/p27.mp3","./samples/piano/p30.mp3","./samples/piano/p33.mp3","./samples/piano/p36.mp3","./samples/piano/p39.mp3","./samples/piano/p42.mp3","./samples/piano/p45.mp3","./samples/piano/p48.mp3","./samples/piano/p51.mp3","./samples/piano/p54.mp3","./samples/piano/p57.mp3","./samples/piano/p60.mp3","./samples/piano/p63.mp3","./samples/piano/p66.mp3","./samples/piano/p69.mp3","./samples/piano/p72.mp3","./samples/piano/p75.mp3","./samples/piano/p78.mp3","./samples/piano/p81.mp3","./samples/piano/p84.mp3","./samples/piano/p87.mp3","./samples/piano/p90.mp3","./samples/piano/p93.mp3","./samples/piano/p96.mp3","./samples/piano/p99.mp3","./samples/vibes/52.mp3","./samples/vibes/55.mp3","./samples/vibes/58.mp3","./samples/vibes/61.mp3","./samples/vibes/64.mp3","./samples/vibes/67.mp3","./samples/vibes/70.mp3","./samples/vibes/73.mp3","./samples/vibes/76.mp3","./samples/vibes/79.mp3","./samples/vibes/82.mp3","./samples/vibes/85.mp3","./samples/vibes/88.mp3","./samples/vibes/91.mp3"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== SAMPLES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// After the first instruments load, the page asks us to fetch every remaining sample quietly so the whole band works offline.
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'cache-samples') return;
  e.waitUntil(caches.open(SAMPLES).then(async c => {
    const urls = SAMPLE_FILES.map(u => new URL(u, self.registration.scope).href);
    for (let i = 0; i < urls.length; i += 6) {
      await Promise.all(urls.slice(i, i + 6).map(async u => {
        if (await c.match(u)) return;
        try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch (err) { /* offline: try again next time */ }
      }));
    }
  }));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/samples/')) {
    e.respondWith(caches.open(SAMPLES).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
  }));
});
