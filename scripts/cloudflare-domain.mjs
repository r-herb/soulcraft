// Attaches soulcraft.8nomads.com to the Cloudflare Pages project and makes
// sure a proxied CNAME points at the project's pages.dev host. Idempotent:
// safe to run on every deploy. Needs CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ACCOUNT_ID in the environment.
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const PROJECT = process.env.PAGES_PROJECT || 'soulcraft';
const DOMAIN = process.env.CUSTOM_DOMAIN || 'soulcraft.8nomads.com';
const ZONE = process.env.ZONE_NAME || '8nomads.com';
const WAIT = process.argv.includes('--wait');

if (!token || !account) {
  console.error('::error::CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set as repository secrets.');
  process.exit(1);
}

const PERMISSION_HINT = {
  pages: 'Account > Cloudflare Pages > Edit',
  zone: `Zone > Zone > Read (for ${ZONE})`,
  dns: `Zone > DNS > Edit (for ${ZONE})`,
};

async function cf(method, path, body, need) {
  const res = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok || json.success === false) {
    const errs = (json.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ');
    const denied = res.status === 403 || res.status === 401 || (json.errors || []).some((e) => [10000, 9109, 7003].includes(e.code));
    const hint = denied && need ? `\n  -> The API token is missing the permission "${PERMISSION_HINT[need]}". Edit it at https://dash.cloudflare.com/profile/api-tokens and add that permission.` : '';
    const err = new Error(`${method} ${path} failed (${res.status}) ${errs}${hint}`);
    err.status = res.status; err.json = json;
    throw err;
  }
  return json.result;
}

async function main() {
  const project = await cf('GET', `/accounts/${account}/pages/projects/${PROJECT}`, null, 'pages');
  const target = project.subdomain || `${PROJECT}.pages.dev`;
  console.log(`Pages project "${PROJECT}" serves ${target}`);

  // 1. custom domain on the project
  const domains = await cf('GET', `/accounts/${account}/pages/projects/${PROJECT}/domains`, null, 'pages');
  if (!domains.some((d) => d.name === DOMAIN)) {
    await cf('POST', `/accounts/${account}/pages/projects/${PROJECT}/domains`, { name: DOMAIN }, 'pages');
    console.log(`Added custom domain ${DOMAIN}`);
  } else console.log(`Custom domain ${DOMAIN} already attached`);

  // 2. proxied CNAME in the zone
  const zones = await cf('GET', `/zones?name=${encodeURIComponent(ZONE)}`, null, 'zone');
  if (!zones.length) throw new Error(`Zone ${ZONE} not found for this token.\n  -> Add "${PERMISSION_HINT.zone}" to the token.`);
  const zoneId = zones[0].id;
  const records = await cf('GET', `/zones/${zoneId}/dns_records?name=${encodeURIComponent(DOMAIN)}`, null, 'dns');
  const cname = records.find((r) => r.type === 'CNAME');
  if (!records.length) {
    await cf('POST', `/zones/${zoneId}/dns_records`, { type: 'CNAME', name: DOMAIN, content: target, proxied: true, ttl: 1, comment: 'Soulcraft (Cloudflare Pages)' }, 'dns');
    console.log(`Created proxied CNAME ${DOMAIN} -> ${target}`);
  } else if (cname && cname.content === target) {
    console.log(`CNAME ${DOMAIN} -> ${target} already exists`);
    if (!cname.proxied) { await cf('PATCH', `/zones/${zoneId}/dns_records/${cname.id}`, { proxied: true }, 'dns'); console.log('Turned on proxying'); }
  } else {
    console.log(`::warning::${DOMAIN} already has DNS records (${records.map((r) => r.type + ' ' + r.content).join(', ')}); left unchanged.`);
  }

  // 3. wait until Cloudflare has validated the domain and issued the certificate
  if (WAIT) {
    for (let i = 0; i < 60; i++) {
      const d = await cf('GET', `/accounts/${account}/pages/projects/${PROJECT}/domains/${DOMAIN}`, null, 'pages');
      console.log(`domain status: ${d.status}${d.validation_data ? ' (validation: ' + d.validation_data.status + ')' : ''}`);
      if (d.status === 'active') return;
      await new Promise((r) => setTimeout(r, 10000));
    }
    throw new Error(`${DOMAIN} did not become active within 10 minutes - check the Pages project's Custom domains tab.`);
  }
}

main().catch((e) => { console.error('::error::' + e.message); process.exit(1); });
