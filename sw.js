// The website's helper that keeps it working with no internet:
// 1. The app itself (page, code, fonts, intro) is kept, so the website opens offline. Online, the newest
//    version is fetched first, so updates arrive as usual.
// 2. Saved text and saved recordings (kept by the app in this browser's storage) are answered from storage,
//    including the "part of a file" requests a player makes while it plays or skips. The app asks for a saved
//    recording at ./saved-audio?u=<its address>; recordings' own servers are never touched by this helper.
const VERSION = 'iosaudio07';
const SHELL = 'msb-shell-' + VERSION;
const FILES = ["./", "index.html", "manifest.json", "icon.png", "js/app.js", "fonts/Ionicons.ttf", "media/intro-poster.jpg", "media/intro-quote.mp3", "media/intro.mp4"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('msb-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// A recording's address without the retry mark the player adds (?try=2), so a saved copy is found.
const key = (url) => {
  const u = new URL(url);
  u.searchParams.delete('try');
  return u.href;
};

async function fromStore(request, address = request.url) {
  const hit = await caches.match(key(address), { ignoreVary: true });
  if (!hit) return null;
  const range = request.headers.get('range');
  if (!range) return hit;
  // Answer just the part asked for, as a recording's own server would.
  const blob = await hit.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const size = blob.size;
  let start = m && m[1] ? +m[1] : 0;
  let end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - +m[2]); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Other sites. Safari's player needs the helper to pass archive.org's Bible reading along (archive.org sends
  // it on to one of its own servers, which Safari won't follow for a page with a helper unless it's passed
  // along). Every other site, such as the sermon recordings, is left alone, so the browser plays it straight
  // from its own server, exactly as it would with no helper.
  if (url.origin !== self.location.origin) {
    // A failed fetch (Safari: "Load failed") becomes a network error the player retries, not an uncaught error.
    if (url.hostname === 'archive.org' || url.hostname.endsWith('.archive.org')) e.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }
  // The test copy of the app in wagner-preview/ is left alone, so it never touches this app's kept files.
  if (url.pathname.includes('/wagner-preview/')) return;
  // A saved recording, asked for at ./saved-audio?u=<its usual address>: answered from storage, or from its
  // own server if it has gone from storage.
  if (url.pathname.endsWith('/saved-audio')) {
    const real = url.searchParams.get('u');
    e.respondWith(fromStore(req, real).then((r) => r || fetch(real, { headers: req.headers.get('range') ? { Range: req.headers.get('range') } : {} })).catch(() => Response.error()));
    return;
  }
  // The website's own files: the newest over the internet, or the kept copy when offline.
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok && (req.mode === 'navigate' || FILES.some((f) => f !== './' && url.pathname.endsWith('/' + f)))) {
          const copy = r.clone();
          caches.open(SHELL).then((c) => c.put(req.mode === 'navigate' ? './' : req, copy)).catch(() => {});
        }
        return r;
      })
      .catch(async () => (await fromStore(req)) || (req.mode === 'navigate' ? caches.match('./') : Response.error())),
  );
});
