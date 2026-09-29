// The world map: a top-down map of the city (from the city file) or of the
// overworld (from the terrain layout), with the player, the respawn point and
// villages or landmarks on it. Picking a place and confirming travels there;
// in survival that costs one of the player's lives (see Game.mapTravel).
import { t } from '../i18n/index.js';
import { SVG } from './icons.js';
import { SEA } from '../world/blocks.js';
import { Layout } from '../world/structures.js';
import { CITY_PLACES } from '../world/city.js';
import { MAX_LIVES } from '../player/lives.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

// ---------- the city picture (built once per city, 2 m per pixel) ----------
// The city's top view (built with the city: 4 blocks per pixel), or null
// until it has loaded; { img, x0, z0, step }.
export function cityPicture(city, onLoad) {
  if (!city._mapPic) {
    const o = city.header.overview;
    const img = new Image();
    city._mapPic = { img, x0: o.x0, z0: o.z0, step: o.step, ready: false, wait: [] };
    img.onload = () => { city._mapPic.ready = true; for (const fn of city._mapPic.wait) fn(); city._mapPic.wait = []; };
    img.src = `/city/${city.id}/${o.file}`;
  }
  const p = city._mapPic;
  if (!p.ready && onLoad) p.wait.push(onLoad);
  return p.ready ? p : null;
}

// ---------- overworld colours from the terrain layout ----------
const OW = { deep: rgb('#1f4690'), shallow: rgb('#3f7fd0'), sand: rgb('#dccf95'), desert: rgb('#e5d59c'), snow: rgb('#eef2f6'),
  grass: rgb('#5f9e3c'), high: rgb('#7c9a58'), rock: rgb('#8e8e8a'), village: rgb('#9b6b3e') };
export function owColour(L, x, z, h) {
  if (h < SEA) { const d = clamp((SEA - h) / 14, 0, 1); return OW.shallow.map((v, i) => v * (1 - d) + OW.deep[i] * d); }
  if (L.villageNear(x, z)) return OW.village;
  const biome = L.biome(x, z);
  if (h <= SEA + 1) return OW.sand;
  if (biome === 'desert') return OW.desert;
  if (biome === 'snow' || h > 90) return OW.snow;
  if (h > 74) return OW.rock;
  const k = clamp((h - SEA) / 30, 0, 1);
  return OW.grass.map((v, i) => v * (1 - k) + OW.high[i] * k);
}

export function worldMap(args, ui) {
  const g = ui.game;
  const city = g.city && g.meta.dim === 'city' ? g.city : null;
  const L = city ? null : Layout.get(g.meta.seed);
  const creative = !!g.creative;
  // the bus network layer (cities): all lines, or the lines of one stop
  const net = city && g.buses ? g.buses.net : null;
  let showBus = !!(net && args.busStop !== undefined);
  const stopLines = net && args.busStop !== undefined ? new Set(net.lines.filter((l) => l.stops.some((q) => q.s === args.busStop)).map((l) => l)) : null;
  function drawBuses() {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const l of net.lines) {
      const hi = !stopLines || stopLines.has(l);
      ctx.strokeStyle = l.colour; ctx.globalAlpha = hi ? 0.9 : 0.18; ctx.lineWidth = hi ? Math.max(2.5, st.s * 3) : 1.5;
      ctx.beginPath();
      l.pts.forEach(([x, z], i) => { const [sx, sy] = toScreen(x, z); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    net.stops.forEach((s, i) => {
      if (stopLines && !net.lines.some((l) => stopLines.has(l) && l.stops.some((q) => q.s === i))) return;
      const [sx, sy] = toScreen(s.x, s.z);
      ctx.fillStyle = i === args.busStop ? '#ffd36b' : '#ffffff'; ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 2;
      ctx.fillRect(sx - 3.5, sy - 3.5, 7, 7); ctx.strokeRect(sx - 3.5, sy - 3.5, 7, 7);
      if (st.s > 1.2 || i === args.busStop) label(s.x, s.z, s.name, '#cfe0ff');
    });
    // the buses on the road now
    for (const b of net.active()) {
      if (stopLines && !stopLines.has(b.line)) continue;
      const [sx, sy] = toScreen(b.x, b.z);
      ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '9px Tiny5, monospace'; ctx.textAlign = 'center'; ctx.fillText(b.line.ref, sx, sy + 3);
    }
    if (stopLines) {
      // a legend of the stop's lines
      let y = 14;
      ctx.textAlign = 'left'; ctx.font = '11px Tiny5, monospace';
      for (const l of stopLines) { ctx.fillStyle = l.colour; ctx.fillRect(8, y - 9, 22, 12); ctx.fillStyle = '#fff'; ctx.fillText(l.ref, 10, y); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,6,24,0.85)'; ctx.strokeText(l.to, 36, y); ctx.fillText(l.to, 36, y); y += 15; }
    }
  }
  const node = el(`<div class="screen scrim" data-screen="worldMap">
    <div class="panel wmap-panel">
      <div class="panel-head"><h2 class="panel-title">${esc(t(city ? 'wmap.cityTitle' : 'wmap.title', { name: city ? t('city.' + g.meta.city + '.name') : '' }))}</h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="wmap-bar"><span class="wmap-lives"></span><span class="faint wmap-hint"></span>${city ? (g.buses ? '<button class="btn small" data-act="buses" data-i18n="bus.lines"></button>' : '') : '<button class="btn small" data-act="soul" data-i18n="wmap.soulMap"></button>'}</div>
      <div class="wmap-view"><canvas></canvas>
        <div class="wmap-tools">
          <button class="btn small icon-btn" data-z="in" aria-label="+">+</button>
          <button class="btn small icon-btn" data-z="out" aria-label="-">-</button>
          <button class="btn small icon-btn" data-act="me" data-i18n-aria="wmap.me">${SVG.target || '&#9678;'}</button>
        </div>
      </div>
      <div class="wmap-confirm hidden"><span class="wmap-q"></span><div class="row"><button class="btn primary" data-act="go"></button><button class="btn" data-act="cancel" data-i18n="common.cancel"></button></div></div>
    </div></div>`);
  const view = node.querySelector('.wmap-view');
  const cv = node.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const confirm = node.querySelector('.wmap-confirm');

  // lives
  const livesEl = node.querySelector('.wmap-lives');
  if (creative) livesEl.textContent = t('wmap.freeTravel');
  else {
    let icons = '';
    for (let i = 0; i < MAX_LIVES; i++) icons += `<i class="life ${i < g.lives ? 'on' : ''}"></i>`;
    livesEl.innerHTML = `<b>${esc(t('wmap.lives'))}</b> ${icons}`;
  }
  node.querySelector('.wmap-hint').textContent = t(creative ? 'wmap.hintFree' : 'wmap.hint');

  // view state: centre (world blocks) and pixels per block
  const p = g.player.pos;
  const st = { cx: p.x, cz: p.z, s: 1, pick: null, W: 0, H: 0, dpr: Math.min(2, window.devicePixelRatio || 1) };
  let minS = 0.15, maxS = 8;

  // overworld: the terrain is sampled for the current view and cached
  let owPic = null, owKey = '', owTimer = 0;
  function renderOverworld() {
    const k = 3; // screen pixels per sample
    const sw = Math.ceil(st.W / k), sh = Math.ceil(st.H / k);
    const pic = document.createElement('canvas');
    pic.width = sw; pic.height = sh;
    const c2 = pic.getContext('2d');
    const img = c2.createImageData(sw, sh);
    const bpp = k / st.s; // blocks per sample
    const x0 = st.cx - st.W / 2 / st.s, z0 = st.cz - st.H / 2 / st.s;
    const hs = new Float32Array(sw * sh);
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) hs[j * sw + i] = L.height(Math.floor(x0 + i * bpp), Math.floor(z0 + j * bpp));
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const h = hs[j * sw + i];
      const c = owColour(L, Math.floor(x0 + i * bpp), Math.floor(z0 + j * bpp), h);
      const hn = hs[Math.max(0, j - 1) * sw + Math.max(0, i - 1)];
      const shade = h < SEA ? 1 : clamp(1 + (h - hn) * 0.06 / Math.max(0.5, bpp / 2), 0.7, 1.3);
      const o = (j * sw + i) * 4;
      img.data[o] = clamp(c[0] * shade, 0, 255); img.data[o + 1] = clamp(c[1] * shade, 0, 255); img.data[o + 2] = clamp(c[2] * shade, 0, 255); img.data[o + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
    owPic = { pic, cx: st.cx, cz: st.cz, s: st.s };
    owKey = `${st.cx},${st.cz},${st.s},${st.W},${st.H}`;
  }
  function scheduleOverworld() {
    clearTimeout(owTimer);
    owTimer = setTimeout(() => { if (owKey !== `${st.cx},${st.cz},${st.s},${st.W},${st.H}`) { renderOverworld(); draw(); } }, 120);
  }

  const toScreen = (x, z) => [(x - st.cx) * st.s + st.W / 2, (z - st.cz) * st.s + st.H / 2];
  const toWorld = (sx, sy) => [st.cx + (sx - st.W / 2) / st.s, st.cz + (sy - st.H / 2) / st.s];

  function marker(x, z, colour, r) {
    const [sx, sy] = toScreen(x, z);
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = colour; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#0b0a1f'; ctx.stroke();
  }
  function label(x, z, text, colour = '#fff') {
    const [sx, sy] = toScreen(x, z);
    if (sx < -60 || sy < -20 || sx > st.W + 60 || sy > st.H + 20) return;
    ctx.font = '11px Tiny5, monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,6,24,0.85)'; ctx.strokeText(text, sx, sy - 9);
    ctx.fillStyle = colour; ctx.fillText(text, sx, sy - 9);
  }

  function draw() {
    const { W, H } = st;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx.fillStyle = city ? '#2f6db3' : '#1f4690';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = st.s < 1;
    if (city) {
      const pic = cityPicture(city, () => draw());
      if (pic) { const [sx, sy] = toScreen(pic.x0, pic.z0); ctx.drawImage(pic.img, sx, sy, pic.img.width * pic.step * st.s, pic.img.height * pic.step * st.s); }
      if (showBus) drawBuses();
      for (const pl of CITY_PLACES[g.meta.city] || []) { const q = city.toXZ(pl.lat, pl.lon); marker(q.x, q.z, '#ffd36b', 3); label(q.x, q.z, pl.name); }
    } else if (owPic) {
      // the cached picture, moved and scaled to the current view
      const f = st.s / owPic.s;
      const [sx, sy] = toScreen(owPic.cx - (owPic.pic.width * 3 / owPic.s) / 2, owPic.cz - (owPic.pic.height * 3 / owPic.s) / 2);
      ctx.drawImage(owPic.pic, sx, sy, owPic.pic.width * 3 * f, owPic.pic.height * 3 * f);
      const [wx0, wz0] = toWorld(0, 0), [wx1, wz1] = toWorld(W, H);
      for (const v of L.villagesAround((wx0 + wx1) / 2, (wz0 + wz1) / 2, Math.max(wx1 - wx0, wz1 - wz0) / 2 + 40)) { marker(v.x, v.z, '#e0a45a', 4); label(v.x, v.z, t('wmap.village'), '#ffe6c0'); }
    }
    // the respawn point
    if (g.homeHere()) { marker(g.meta.home.x, g.meta.home.z, '#7cf0a0', 5); label(g.meta.home.x, g.meta.home.z, t('wmap.home'), '#b8ffd0'); }
    // other players
    if (g.net && g.net.players) for (const o of g.net.players.values()) { if (o.object && o.seen) { marker(o.object.position.x, o.object.position.z, '#b48cff', 4); label(o.object.position.x, o.object.position.z, o.name || '', '#e2d4ff'); } }
    // the player: an arrow pointing where they look
    const [px, py] = toScreen(p.x, p.z);
    const fx = -Math.sin(g.player.yaw), fz = -Math.cos(g.player.yaw);
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(fz, fx));
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, 6); ctx.lineTo(-3, 0); ctx.lineTo(-7, -6); ctx.closePath();
    ctx.fillStyle = '#5ce1e6'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#0b0a1f'; ctx.stroke(); ctx.restore();
    // the picked place
    if (st.pick) {
      const [sx, sy] = toScreen(st.pick.x + 0.5, st.pick.z + 0.5);
      ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 14, sy); ctx.lineTo(sx + 14, sy); ctx.moveTo(sx, sy - 14); ctx.lineTo(sx, sy + 14); ctx.stroke();
    }
    if (!city) scheduleOverworld();
  }

  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    st.W = w; st.H = h;
    cv.width = Math.round(w * st.dpr); cv.height = Math.round(h * st.dpr);
    if (city) minS = Math.min(st.W / city.area.w, st.H / city.area.d) * 0.9;
    draw();
  }

  // a place a player can stand on, near where they tapped
  function landing(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    // (a city tile far away may not be here yet: the trip finds the spot)
    if (city) return city.inArea(x, z) ? (city.loaded(x, z) ? city.openCellNear(x, z, 40) : { x, z }) : null;
    for (let r = 0; r <= 48; r += 2) for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (L.height(x + dx, z + dz) > SEA) return { x: x + dx, z: z + dz };
    }
    return null;
  }

  function pick(sx, sy) {
    const [wx, wz] = toWorld(sx, sy);
    const spot = landing(wx, wz);
    if (!spot) { ui.toast(t('wmap.cantLand'), 'warn'); return; }
    st.pick = spot;
    confirm.classList.remove('hidden');
    confirm.querySelector('.wmap-q').textContent = creative ? t('wmap.askFree') : g.lives > 0 ? t('wmap.ask', { n: g.lives, max: MAX_LIVES }) : t('wmap.noLives');
    const go = confirm.querySelector('[data-act="go"]');
    go.textContent = t('wmap.go');
    go.disabled = !creative && g.lives <= 0;
    draw();
  }

  // ---------- panning, zooming, picking ----------
  const ptrs = new Map();
  let drag = null, pinch = null;
  function zoomAt(f, sx = st.W / 2, sy = st.H / 2) {
    const [wx, wz] = toWorld(sx, sy);
    st.s = clamp(st.s * f, minS, maxS);
    st.cx = wx - (sx - st.W / 2) / st.s; st.cz = wz - (sy - st.H / 2) / st.s;
    draw();
  }
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 1) drag = { start: local(e), cx: st.cx, cz: st.cz, moved: false };
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: st.s }; if (drag) drag.moved = true; }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, local(e));
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt((pinch.s * d / pinch.d) / st.s, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    } else if (drag) {
      const [x, y] = local(e);
      if (Math.hypot(x - drag.start[0], y - drag.start[1]) > 6) drag.moved = true;
      if (drag.moved) { st.cx = drag.cx - (x - drag.start[0]) / st.s; st.cz = drag.cz - (y - drag.start[1]) / st.s; draw(); }
    }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      if (drag && !drag.moved && e.type === 'pointerup') pick(...local(e));
      drag = null;
    }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, ...local(e)); }, { passive: false });
  node.querySelector('[data-z="in"]').addEventListener('click', () => { ui.click(); zoomAt(1.5); });
  node.querySelector('[data-z="out"]').addEventListener('click', () => { ui.click(); zoomAt(1 / 1.5); });
  node.querySelector('[data-act="me"]').addEventListener('click', () => { ui.click(); st.cx = p.x; st.cz = p.z; draw(); });
  node.querySelector('[data-act="cancel"]').addEventListener('click', () => { ui.click(); st.pick = null; confirm.classList.add('hidden'); draw(); });
  node.querySelector('[data-act="go"]').addEventListener('click', () => { ui.click(); if (st.pick) g.mapTravel(st.pick.x, st.pick.z); });
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  const busBtn = node.querySelector('[data-act="buses"]');
  if (busBtn) busBtn.addEventListener('click', () => { ui.click(); showBus = !showBus; busBtn.classList.toggle('primary', showBus); draw(); });
  if (busBtn && showBus) busBtn.classList.add('primary');
  // live buses move: redraw every second while the layer is on
  const tick = setInterval(() => { if (!node.isConnected) { clearInterval(tick); return; } if (showBus) draw(); }, 1000);
  const soul = node.querySelector('[data-act="soul"]');
  if (soul) soul.addEventListener('click', () => { ui.click(); ui.open('map'); });

  // for tests and the dev panel: pick a world position directly
  node._pickWorld = (x, z) => { const [sx, sy] = toScreen(x, z); pick(sx, sy); };

  // first layout: about 600 blocks across, centred on the player
  requestAnimationFrame(() => {
    st.s = clamp((view.clientWidth || 600) / 600, 0.2, 4);
    if (net && args.busStop !== undefined) { const bs = net.stops[args.busStop]; st.cx = bs.x; st.cz = bs.z; st.s = clamp((view.clientWidth || 600) / 1400, 0.2, 4); }
    resize();
  });
  const ro = new ResizeObserver(() => resize());
  ro.observe(view);
  return node;
}
