// The sermon relay: passes Brother Branham's recordings from Voice Of God Recordings' own server to the
// website unchanged, adding only the permission a browser needs to let the website keep a copy.
// It serves nothing else: only recordings on VGR's audio server, and only to the website.
const SOURCE = 'https://d21kl6o5a7faj0.cloudfront.net/repo/';
const ORIGINS = ['https://kenji97works.github.io', 'http://localhost:8152'];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Not allowed', { status: 405, headers: cors });
    const u = new URL(request.url).searchParams.get('u') || '';
    if (!u.startsWith(SOURCE) || !/^[\w\/.-]+\.m4a$/.test(u.slice(SOURCE.length))) return new Response('Not found', { status: 404, headers: cors });
    const headers = {};
    const range = request.headers.get('Range');
    if (range) headers.Range = range;
    const r = await fetch(u, { method: request.method, headers });
    const out = new Headers(r.headers);
    for (const [k, v] of Object.entries(cors)) out.set(k, v);
    out.set('Content-Type', 'audio/mp4');
    out.delete('Content-Disposition');
    return new Response(r.body, { status: r.status, headers: out });
  },
};
