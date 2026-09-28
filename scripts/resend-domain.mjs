// Sets up soulcraft.8nomads.com as a Resend sending domain: registers it
// (if needed), creates the DNS records Resend asks for (DKIM and the
// bounce subdomain's SPF/MX) in the Cloudflare zone, and asks Resend to
// verify. Idempotent. The zone's own records (root SPF, MX) are untouched.
// Needs RESEND_API_KEY, CLOUDFLARE_API_TOKEN.
const RESEND = process.env.RESEND_API_KEY;
const CF = process.env.CLOUDFLARE_API_TOKEN;
const DOMAIN = process.env.MAIL_DOMAIN || 'soulcraft.8nomads.com';
const ZONE = process.env.ZONE_NAME || '8nomads.com';

if (!RESEND || !CF) { console.log('RESEND_API_KEY or CLOUDFLARE_API_TOKEN missing; skipping'); process.exit(0); }

async function resend(method, path, body) {
  const res = await fetch('https://api.resend.com' + path, { method, headers: { Authorization: 'Bearer ' + RESEND, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? '\n  -> The Resend API key needs "Full access" to manage domains.' : '';
    throw new Error(`Resend ${method} ${path} failed (${res.status}) ${json.message || ''}${hint}`);
  }
  return json;
}
async function cf(method, path, body) {
  const res = await fetch('https://api.cloudflare.com/client/v4' + path, { method, headers: { Authorization: 'Bearer ' + CF, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(`Cloudflare ${method} ${path} failed (${res.status}) ${(json.errors || []).map((e) => e.message).join('; ')}`);
  return json.result;
}

async function main() {
  const list = await resend('GET', '/domains');
  let dom = (list.data || []).find((d) => d.name === DOMAIN);
  if (!dom) { dom = await resend('POST', '/domains', { name: DOMAIN, region: 'eu-west-1' }); console.log(`Registered ${DOMAIN} with Resend`); }
  const full = await resend('GET', '/domains/' + dom.id);
  console.log(`Resend domain ${DOMAIN}: ${full.status}`);
  const zones = await cf('GET', `/zones?name=${encodeURIComponent(ZONE)}`);
  if (!zones.length) throw new Error(`zone ${ZONE} not found`);
  const zoneId = zones[0].id;
  for (const r of full.records || []) {
    const name = r.name.endsWith(ZONE) ? r.name : `${r.name}.${ZONE}`;
    const existing = await cf('GET', `/zones/${zoneId}/dns_records?type=${r.type}&name=${encodeURIComponent(name)}`);
    const content = r.value;
    if (existing.some((e) => e.content.replace(/^"|"$/g, '') === content.replace(/^"|"$/g, ''))) { console.log(`  ok  ${r.type} ${name}`); continue; }
    await cf('POST', `/zones/${zoneId}/dns_records`, { type: r.type, name, content, ttl: 1, proxied: false, ...(r.type === 'MX' ? { priority: Number(r.priority) || 10 } : {}) });
    console.log(`  add ${r.type} ${name}`);
  }
  if (full.status !== 'verified') {
    await resend('POST', `/domains/${dom.id}/verify`);
    console.log('Asked Resend to verify the records (this can take a few minutes; emails work once it is verified).');
  }
}

main().catch((e) => { console.log('::warning::' + e.message.split('\n')[0]); console.log(e.message); process.exit(0); });
