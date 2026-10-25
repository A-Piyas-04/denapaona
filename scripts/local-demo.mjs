// Local demo without a Supabase project — for looking at the app, never deploy.
//
//   npm run demo            reuse the demo database if it exists
//   npm run demo -- --reset start from a fresh, re-seeded database
//
// Runs the real migrations on PostgreSQL 16 + PostgREST in Docker (with the
// test shim standing in for Supabase's auth schema), serves a stand-in for
// Supabase Auth with a "pick a demo user" page instead of Google sign-in,
// and starts Vite pointed at it.  Requires Docker.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NET = 'hn-demo';
const PG = 'hn-demo-pg';
const REST_NAME = 'hn-demo-rest';
const REST_PORT = 54340;
const GATEWAY_PORT = 54341;
const APP_PORT = 5173;
const SECRET = 'local-demo-jwt-secret-at-least-32-characters-long';
const reset = process.argv.includes('--reset');

function docker(args, { input, quiet = false, allowFail = false } = {}) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8' });
  if (r.status !== 0 && !allowFail) {
    throw new Error(`docker ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  }
  if (!quiet && r.stderr && r.status === 0) process.stderr.write(filterNoise(r.stderr));
  return r;
}
const filterNoise = (s) => s.split('\n').filter((l) => l && !/NOTICE/.test(l)).map((l) => l + '\n').join('');
const psql = (sql, db = 'hn') =>
  docker(['exec', '-i', PG, 'psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-X', '-tA'], { input: sql });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const running = (name) => docker(['ps', '--format', '{{.Names}}'], { quiet: true }).stdout.split('\n').includes(name);
const exists = (name) => docker(['ps', '-a', '--format', '{{.Names}}'], { quiet: true }).stdout.split('\n').includes(name);

if (spawnSync('docker', ['info'], { encoding: 'utf8' }).status !== 0) {
  console.error('Docker is not running. Start Docker Desktop, wait for it to be ready, then run `npm run demo` again.');
  process.exit(1);
}

// ── database ─────────────────────────────────────────────────────────────
docker(['network', 'create', NET], { quiet: true, allowFail: true });
if (reset) docker(['rm', '-f', PG, REST_NAME], { quiet: true, allowFail: true });

let fresh = false;
if (!exists(PG)) {
  console.log('── starting PostgreSQL 16');
  docker(['run', '-d', '--name', PG, '--network', NET, '-e', 'POSTGRES_PASSWORD=demo', 'postgres:16-alpine']);
  fresh = true;
} else if (!running(PG)) {
  docker(['start', PG], { quiet: true });
}
// -h 127.0.0.1: the image's init-time server listens on the socket only.
while (spawnSync('docker', ['exec', PG, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-q']).status !== 0) await sleep(500);

const ready = psql(`select 1 from pg_database where datname = 'hn'`, 'postgres').stdout.trim() === '1'
  && psql(`select to_regclass('t.demo_ready') is not null`).stdout.trim() === 't';
if (!fresh && !ready) {
  console.log('── previous setup was incomplete, rebuilding');
  fresh = true;
}

if (fresh) {
  console.log('── applying shim and migrations');
  psql('drop database if exists hn', 'postgres');
  psql('create database hn', 'postgres');
  const dir = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.sql')).sort().map((f) => path.join(d, f));
  for (const f of [...dir(path.join(ROOT, 'supabase/tests/shim')), ...dir(path.join(ROOT, 'supabase/migrations'))]) {
    console.log(`   ${path.basename(f)}`);
    psql(fs.readFileSync(f, 'utf8'));
  }
  psql(`do $$ begin
          if not exists (select 1 from pg_roles where rolname = 'authenticator') then
            create role authenticator login password 'auth' noinherit; end if;
        end $$;
        grant anon, authenticated to authenticator;`);

  console.log('── seeding demo users and a group');
  psql(`do $$
  declare arif uuid; sami uuid; rafi uuid; nadia uuid; g uuid; code text;
  begin
    arif  := t.new_user('Arif');  sami := t.new_user('Sami');
    rafi  := t.new_user('Rafi');  nadia := t.new_user('Nadia');
    perform t.new_user('Tania');  -- not in the group: try joining with the invite link

    perform t.login(arif);
    g := public.create_group('Hall 3 Friends');
    select invite_code into code from public.groups where id = g;
    perform t.login(sami);  perform public.join_group(code);
    perform t.login(rafi);  perform public.join_group(code);
    perform t.login(nadia); perform public.join_group(code);

    -- ৳1,200 dinner, Arif paid, split Arif/Sami/Rafi
    perform t.login(arif);
    perform public.add_expense(g, arif, 120000, 'Dinner at Star', jsonb_build_array(
      jsonb_build_object('user_id', arif, 'share', 40000),
      jsonb_build_object('user_id', sami, 'share', 40000),
      jsonb_build_object('user_id', rafi, 'share', 40000)));
    -- ৳900 hotel, Rafi paid, split Rafi/Sami/Nadia
    perform t.login(rafi);
    perform public.add_expense(g, rafi, 90000, 'Hotel night', jsonb_build_array(
      jsonb_build_object('user_id', rafi,  'share', 30000),
      jsonb_build_object('user_id', sami,  'share', 30000),
      jsonb_build_object('user_id', nadia, 'share', 30000)));
    -- ৳450 taxi, Sami paid, split Arif/Sami/Nadia
    perform t.login(sami);
    perform public.add_expense(g, sami, 45000, 'Taxi to station', jsonb_build_array(
      jsonb_build_object('user_id', arif,  'share', 15000),
      jsonb_build_object('user_id', sami,  'share', 15000),
      jsonb_build_object('user_id', nadia, 'share', 15000)));
    perform t.login(null);
  end $$;
  create table t.demo_ready ();`);
}

// ── PostgREST ────────────────────────────────────────────────────────────
if (!running(REST_NAME)) {
  docker(['rm', '-f', REST_NAME], { quiet: true, allowFail: true });
  console.log('── starting PostgREST');
  docker(['run', '-d', '--name', REST_NAME, '--network', NET, '-p', `${REST_PORT}:3000`,
    '-e', `PGRST_DB_URI=postgres://authenticator:auth@${PG}:5432/hn`,
    '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon',
    '-e', `PGRST_JWT_SECRET=${SECRET}`, 'postgrest/postgrest:v12.2.3']);
}
for (;;) {
  try { if ((await fetch(`http://localhost:${REST_PORT}/`)).ok) break; } catch { /* starting */ }
  await sleep(500);
}

// ── stand-in for the Supabase gateway + Auth ─────────────────────────────
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function mint(id, email) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub: id, role: 'authenticated', aud: 'authenticated', email, exp: Math.floor(Date.now() / 1000) + 30 * 86400 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const users = () => psql(`select id || '|' || display_name || '|' || coalesce(email, '') from public.profiles order by created_at`)
  .stdout.trim().split('\n').filter(Boolean).map((l) => { const [id, name, email] = l.split('|'); return { id, name, email }; });
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range, content-profile',
};

http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const url = new URL(req.url, 'http://x');

    if (url.pathname === '/') {
      const list = users().map((u) =>
        `<li><a href="/login/${u.id}">${esc(u.name)}</a> <small>${esc(u.email)}</small></li>`).join('');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta charset="utf-8"><title>HishebNama demo sign-in</title>
<style>body{font:16px system-ui;max-width:28rem;margin:3rem auto;padding:0 1rem}li{margin:.6rem 0}a{font-weight:600;color:#0f766e}small{color:#64748b}</style>
<h1>Sign in as a demo user</h1>
<p>Local demo only. Stands in for Google sign-in. Open a private window to be a second user at the same time.</p>
<ul>${list}</ul>`);
    }

    const login = url.pathname.match(/^\/login\/([0-9a-f-]{36})$/);
    if (login) {
      const u = users().find((x) => x.id === login[1]);
      if (!u) { res.writeHead(404); return res.end('no such user'); }
      const hash = new URLSearchParams({
        access_token: mint(u.id, u.email), refresh_token: 'local-demo', token_type: 'bearer',
        expires_in: String(30 * 86400), expires_at: String(Math.floor(Date.now() / 1000) + 30 * 86400),
      });
      res.writeHead(302, { location: `http://localhost:${APP_PORT}/auth/callback#${hash}` });
      return res.end();
    }

    if (url.pathname.startsWith('/rest/v1')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = { ...req.headers };
      delete headers.host; delete headers['content-length'];
      const upstream = await fetch(`http://localhost:${REST_PORT}${url.pathname.slice('/rest/v1'.length)}${url.search}`, {
        method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined,
      });
      const out = Buffer.from(await upstream.arrayBuffer());
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
        return res.end(JSON.stringify({ id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.email, app_metadata: {}, user_metadata: {} }));
      } catch {
        res.writeHead(401, cors); return res.end();
      }
    }

    res.writeHead(url.pathname.startsWith('/auth') ? 204 : 404, cors);
    res.end();
  } catch (e) {
    res.writeHead(500, cors); res.end(String(e));
  }
}).listen(GATEWAY_PORT);

// ── Vite ─────────────────────────────────────────────────────────────────
const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(APP_PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, VITE_SUPABASE_URL: `http://localhost:${GATEWAY_PORT}`, VITE_SUPABASE_ANON_KEY: 'local-demo' },
});
vite.stdout.on('data', (d) => {
  if (/ready in/.test(d.toString())) {
    console.log(`
── demo running
   1. Sign in:  http://localhost:${GATEWAY_PORT}   (pick Arif, Sami, Rafi, Nadia or Tania)
   2. App:      http://localhost:${APP_PORT}
   Data is kept between runs; \`npm run demo -- --reset\` starts over.  Ctrl+C to stop.
`);
  }
});
const stop = () => { vite.kill(); docker(['stop', REST_NAME, PG], { quiet: true, allowFail: true }); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', (code) => { if (code) process.exit(code); });
