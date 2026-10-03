// Web Push without a payload: the server signs a VAPID token (its own key
// pair, made once and kept in D1, so there is no secret to set up) and asks
// the browser's push service to wake the player's service worker, which
// then fetches what is waiting (/api/push/pending) and shows it.
import { b64u } from './lib.js';

const enc = new TextEncoder();
// push services the browsers use (nothing else is ever fetched)
const HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];
export function pushEndpointOk(endpoint) {
  try { const u = new URL(endpoint); return u.protocol === 'https:' && HOSTS.some((r) => r.test(u.hostname)) && endpoint.length < 1000; } catch { return false; }
}

export async function vapidKeys(db) {
  const row = await db.prepare("SELECT value FROM app_keys WHERE name = 'vapid'").first();
  if (row) return JSON.parse(row.value);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
  await db.prepare("INSERT OR IGNORE INTO app_keys (name, value) VALUES ('vapid', ?)").bind(JSON.stringify({ priv, pub })).run();
  return JSON.parse((await db.prepare("SELECT value FROM app_keys WHERE name = 'vapid'").first()).value);
}

async function vapidToken(keys, audience) {
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:soulcraft@8nomads.com' })));
  const key = await crypto.subtle.importKey('jwk', { ...keys.priv, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64u(new Uint8Array(sig));
}

// wake every browser the players signed in on; drop subscriptions that are gone
export async function wake(env, db, userIds) {
  if (!userIds.length) return 0;
  const { results } = await db.prepare(`SELECT endpoint FROM push_subs WHERE user_id IN (${userIds.map(() => '?').join(',')})`).bind(...userIds).all();
  if (!results.length) return 0;
  if (env.PUSH_TEST) { await db.prepare("INSERT OR REPLACE INTO app_keys (name, value) VALUES ('push_test_last', ?)").bind(JSON.stringify({ to: userIds, n: results.length, at: Date.now() })).run(); return results.length; }
  const keys = await vapidKeys(db);
  let sent = 0;
  await Promise.all(results.map(async ({ endpoint }) => {
    try {
      const jwt = await vapidToken(keys, new URL(endpoint).origin);
      const res = await fetch(endpoint, { method: 'POST', headers: { TTL: '60', Urgency: 'high', Authorization: `vapid t=${jwt}, k=${keys.pub}`, 'Content-Length': '0' }, signal: AbortSignal.timeout(6000) });
      if (res.status === 404 || res.status === 410) await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
      else if (res.ok) sent++;
    } catch { /* the push service did not answer */ }
  }));
  return sent;
}
