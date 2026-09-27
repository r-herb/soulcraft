// Makes sure the D1 database "soulcraft" (player accounts and cloud saves)
// exists, then writes its id into wrangler.toml so that `wrangler d1
// migrations apply --remote` and `wrangler pages deploy` bind the right
// database. Idempotent: safe to run on every deploy. Needs
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
import { readFileSync, writeFileSync } from 'node:fs';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const NAME = process.env.D1_NAME || 'soulcraft';
const HINT = '\n  -> The API token is missing the permission "Account > D1 > Edit". Edit it at https://dash.cloudflare.com/profile/api-tokens and add that permission (the token value stays the same).';

if (!token || !account) {
  console.error('::error::CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set as repository secrets.');
  process.exit(1);
}

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}` + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok || json.success === false) {
    const errs = (json.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ');
    const denied = res.status === 401 || res.status === 403 || (json.errors || []).some((e) => [10000, 9109, 7003].includes(e.code));
    throw new Error(`${method} ${path} failed (${res.status}) ${errs}${denied ? HINT : ''}`);
  }
  return json.result;
}

async function main() {
  const list = await cf('GET', `/d1/database?name=${encodeURIComponent(NAME)}`);
  let db = (list || []).find((d) => d.name === NAME);
  if (db) console.log(`D1 database "${NAME}" exists (${db.uuid})`);
  else {
    db = await cf('POST', '/d1/database', { name: NAME });
    console.log(`Created D1 database "${NAME}" (${db.uuid})`);
  }
  const toml = readFileSync('wrangler.toml', 'utf8');
  const next = toml.replace(/database_id = "[^"]*"/, `database_id = "${db.uuid}"`);
  if (next === toml && !toml.includes(db.uuid)) throw new Error('wrangler.toml has no database_id line to fill in');
  writeFileSync('wrangler.toml', next);
  console.log('wrangler.toml now points at the production database');
}

main().catch((e) => { console.error('::error::' + e.message.split('\n')[0]); console.error(e.message); process.exit(1); });
