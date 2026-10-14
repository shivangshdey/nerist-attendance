// Cloudflare Worker in front of the dashboard.
//  - Password login: a signed cookie, 30 days. Nothing in public/ is served without it.
//  - /api/moves: the classes you moved on the dashboard (KV). The sync job reads them
//    with SYNC_TOKEN so reminders follow your times.
//  - Moving a class re-queues its ntfy reminder straight away, without waiting for a sync.
//
// Secrets: DASH_PASSWORD, SESSION_SECRET, SYNC_TOKEN, NTFY_TOPIC (optional).

import { applyMoves, pruneMoves, planDay, reminderId } from '../public/lib/attendance.js';
import { reminderBody } from '../scripts/reminders.mjs';
import { loginPage } from './login.js';

const COOKIE = 'att_session';
const SESSION_DAYS = 30;
const MAX_FAILS = 8;           // per IP, per 15 minutes
const NTFY = 'https://ntfy.sh';
const enc = new TextEncoder();

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = (s) => crypto.subtle.digest('SHA-256', enc.encode(s));
const same = async (a, b) => crypto.subtle.timingSafeEqual(await sha256(a), await sha256(b));

async function sign(env, payload) {
  // The password is part of the key, so changing it signs everyone out.
  const key = await crypto.subtle.importKey('raw', enc.encode(`${env.SESSION_SECRET}|${env.DASH_PASSWORD}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

async function signedIn(request, env) {
  const raw = (request.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  const [exp, sig] = (raw?.slice(COOKIE.length + 1) || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, await sign(env, exp));
}

const syncAuthed = async (request, env) => !!env.SYNC_TOKEN && same(request.headers.get('Authorization') || '', `Bearer ${env.SYNC_TOKEN}`);

const html = (body, status = 200, headers = {}) => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...headers },
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/* ------------------------------------------------------------------ login */

async function login(request, env) {
  if (!env.DASH_PASSWORD || !env.SESSION_SECRET) return html(loginPage('The dashboard password isn’t set up yet.'), 503);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const failKey = `fail:${ip}`;
  const fails = Number(await env.KV.get(failKey)) || 0;
  if (fails >= MAX_FAILS) return html(loginPage('Too many tries. Wait 15 minutes.'), 429);

  const form = await request.formData();
  if (!(await same(String(form.get('password') || ''), env.DASH_PASSWORD))) {
    await env.KV.put(failKey, String(fails + 1), { expirationTtl: 900 });
    return html(loginPage('Wrong password.'), 401);
  }
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  const cookie = `${COOKIE}=${exp}.${await sign(env, exp)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
  return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': cookie } });
}

const logout = () => new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });

/* ------------------------------------------------------------------ moves */

const readMoves = async (env) => (await env.KV.get('moves', 'json')) || {};

/**
 * body: { id, from, start, end } to move a class, or { id, reset: true } to put it back.
 * Returns every move, after the change.
 */
async function saveMove(request, env, ctx) {
  const b = await request.json().catch(() => null);
  const iso = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString();
  if (!b || b.id == null) return json({ error: 'missing id' }, 400);
  const moves = pruneMoves(await readMoves(env));
  const before = moves[b.id];
  const from = iso(b.from), start = iso(b.start), end = iso(b.end);
  if (b.reset || (from && from === start)) delete moves[b.id]; // back at the portal's time
  else if (!from || !start || !end || end <= start) return json({ error: 'bad times' }, 400);
  else moves[b.id] = { from, start, end };
  await env.KV.put('moves', JSON.stringify(moves));
  ctx.waitUntil(requeue(request, env, b.id, before?.start || b.from, moves).catch((e) => console.error('requeue', e.message)));
  return json(moves);
}

/** Pull the reminder at the class's old time and queue one at its new time, with fresh numbers. */
async function requeue(request, env, id, oldStart, moves) {
  if (!env.NTFY_TOPIC || !oldStart) return;
  const origin = new URL(request.url).origin;
  const data = await (await env.ASSETS.fetch(new Request(`${origin}/data/attendance.json`))).json();
  const now = Date.now();
  const future = applyMoves(data.schedule, moves).filter((c) => !c.status && Date.parse(c.start) > now && Date.parse(c.start) - now < 3 * 864e5);
  const plan = planDay(future, data.courses, data.threshold);
  const cls = (data.schedule || []).find((c) => String(c.id) === String(id));
  if (!cls) return;
  const oldId = reminderId({ ...cls, start: oldStart });
  const o = plan.find((c) => String(c.id) === String(id));
  if (!o || reminderId(o) !== oldId) {
    await fetch(`${NTFY}/${encodeURIComponent(env.NTFY_TOPIC)}/${oldId}`, { method: 'DELETE' });
  }
  if (o && Date.parse(o.start) - 10 * 60000 - now > 20_000) {
    await fetch(NTFY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reminderBody(o, { topic: env.NTFY_TOPIC, click: `${origin}/` })) });
  }
}

/* ------------------------------------------------------------------ router */

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === '/login' && method === 'POST') return login(request, env);
    if (pathname === '/logout') return logout();

    if (pathname === '/api/moves') {
      if (method === 'GET' && (await syncAuthed(request, env) || await signedIn(request, env))) return json(await readMoves(env));
      if (method === 'POST' && await signedIn(request, env)) return saveMove(request, env, ctx);
      return json({ error: 'not signed in' }, 401);
    }

    if (!(await signedIn(request, env))) {
      const page = method === 'GET' && (request.headers.get('Accept') || '').includes('text/html');
      return page ? html(loginPage()) : new Response('Not signed in', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    if (pathname === '/login') return Response.redirect(new URL('/', request.url), 303);

    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'private, no-cache');
    out.headers.set('X-Robots-Tag', 'noindex');
    return out;
  },
};
