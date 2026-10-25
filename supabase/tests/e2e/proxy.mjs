// Minimal stand-in for the Supabase gateway, for local end-to-end runs only.
//   /rest/v1/*     → PostgREST (the real thing, enforcing the real RLS)
//   /auth/v1/user  → decodes the bearer JWT (tokens are minted by e2e/run.sh)
//   everything else under /auth or /realtime → harmless stubs
// Never deploy this.  It verifies nothing about tokens beyond what PostgREST
// itself verifies on /rest/v1 — which is exactly the production trust model.
import http from 'node:http';

const PORT = Number(process.env.PROXY_PORT ?? 54331);
const REST = process.env.REST_URL ?? 'http://localhost:54330';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range, content-profile',
};

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x');

  if (url.pathname.startsWith('/rest/v1')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = { ...req.headers };
    delete headers.host; delete headers['content-length'];
    const upstream = await fetch(REST + url.pathname.slice('/rest/v1'.length) + url.search, {
      method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const out = Buffer.from(await upstream.arrayBuffer());
    if (upstream.status >= 400) console.log(upstream.status, req.method, decodeURIComponent(url.pathname + url.search), out.toString().slice(0, 300));
    const h = { ...cors };
    upstream.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) h[k] = v; });
    res.writeHead(upstream.status, h);
    return res.end(out);
  }

  if (url.pathname === '/auth/v1/user') {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    try {
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      res.writeHead(200, { ...cors, 'content-type': 'application/json' });
      return res.end(JSON.stringify({ id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.email, user_metadata: {} }));
    } catch {
      res.writeHead(401, cors); return res.end();
    }
  }

  res.writeHead(url.pathname.startsWith('/auth') ? 204 : 404, cors);
  res.end();
}).listen(PORT, () => console.log(`e2e proxy on :${PORT} → ${REST}`));
