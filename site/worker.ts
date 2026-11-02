/* Frontend worker in front of the static assets (Phase 5 launch): country landing pages thehole.world/<cc> with a live rank in the
   link preview, sitemap.xml and robots.txt. Everything else is the SPA from ./dist. */
import { ANTI } from '../src/antipodes';

interface Env { ASSETS: Fetcher; API_BASE?: string }
interface Compact { total: number; rows: Array<[string, number, number]> }
const API = 'https://api.thehole.world';
const ccOf = (path: string) => { const m = /^\/([a-z]{2})\/?$/i.exec(path); const cc = m ? m[1].toUpperCase() : null; return cc && ANTI[cc] ? cc : null; };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
function name(cc: string) { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc; } catch { return cc; } }
function fmt(m: number) { return m >= 1000 ? Math.round(m / 1000).toLocaleString('en-US') + ' km' : Math.round(m) + ' m'; }

async function world(env: Env): Promise<Compact | null> {
  try { const r = await fetch((env.API_BASE || API) + '/api/world', { cf: { cacheTtl: 15, cacheEverything: true } }); return r.ok ? await r.json() as Compact : null; } catch { return null; }
}
/* the SPA's index.html with the OG tags rewritten for one country */
async function countryPage(req: Request, env: Env, cc: string): Promise<Response> {
  const [page, w] = await Promise.all([env.ASSETS.fetch(new Request(new URL('/', req.url), req)), world(env)]);
  let html = await page.text();
  const rows = w ? w.rows : []; const i = rows.findIndex(r => r[0] === cc); const row = i >= 0 ? rows[i] : null;
  const rank = i >= 0 ? i + 1 : 0, meters = row ? row[1] : 0, above = i > 0 ? rows[i - 1][0] : null;
  const n = name(cc); const site = new URL(req.url).origin;
  const title = rank ? `${n} is #${rank} in the world at digging through the Earth` : `Dig through the Earth for ${n}`;
  const desc = rank
    ? `${fmt(meters)} dug for ${n} so far${above ? `, ${name(above)} is one place above` : ''}. Every meter you dig counts. Free, no sign-up.`
    : `Nobody from ${n} has started digging yet. Be the first: every meter counts for your country. Free, no sign-up.`;
  const img = `${API}/og?d=${Math.round(meters)}&c=${cc}`;
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} · The Hole World</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${site}/${cc.toLowerCase()}`)
    .replace(/(<meta property="og:image" content=")[^"]*/, `$1${img}`)
    .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta name="twitter:image" content=")[^"]*/, `$1${img}`)
    .replace('</head>', `<link rel="canonical" href="${site}/${cc.toLowerCase()}"><script>window.__landingCC=${JSON.stringify(cc)}</script></head>`);
  const h = new Headers(page.headers); h.set('content-type', 'text/html; charset=utf-8'); h.set('cache-control', 'public, max-age=60'); h.delete('content-length');
  return new Response(html, { status: 200, headers: h });
}
function sitemap(origin: string) {
  const urls = ['/'].concat(Object.keys(ANTI).map(cc => '/' + cc.toLowerCase()));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${origin}${u}</loc><changefreq>hourly</changefreq><priority>${u === '/' ? '1.0' : '0.7'}</priority></url>`).join('\n')}\n</urlset>\n`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.hostname.startsWith('www.')) return Response.redirect(url.origin.replace('//www.', '//') + url.pathname + url.search, 301);
    if (url.pathname === '/sitemap.xml') return sitemap(url.origin);
    if (url.pathname === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
    const cc = req.method === 'GET' ? ccOf(url.pathname) : null;
    if (cc) return countryPage(req, env, cc);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
