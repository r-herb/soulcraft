// The superadmin's test panel: their own player account (the one the admin
// panel's Play button signs in) can try every feature at once - everything
// unlocked, Malaga straight away, test coins, the big mission's shortcuts,
// teleports around the city and to the bosses, god mode and the time of day.
// Only for that account (account.user.superLink); the server checks it too.
import { t, applyI18n } from '../i18n/index.js';
import { SVG } from './icons.js';
import { account, econ, storeProfile } from '../save/account.js';
import { SKINS } from '../entities/models.js';
import { PETS } from '../entities/pets.js';
import { SLOTS } from '../entities/avatar.js';
import { BOSS_ORDER } from '../bosses/bosses.js';
import { ARENAS } from '../world/structures.js';
import { PIECES, FINAL, heistId } from '../quest/heist.js';
import { MISSIONS } from '../quest/missions.js';
import { bankPoint } from '../world/city.js';
import { TARGET, fabId } from '../quest/fabrica.js';
import { ORO_TARGET, oroId } from '../quest/oro.js';
import { puertoId } from '../quest/puerto.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isTester = () => !!(account.user && account.user.superLink);
const PLACES = ['Plaza de la Constitución', 'Calle Larios', 'Catedral', 'Alcazaba', 'Gibralfaro', 'La Malagueta', 'Muelle Uno', 'Mercado de Atarazanas'];

// everything a player can earn, at once
export function unlockAll(profile) {
  profile.crystals = Math.max(profile.crystals || 0, 99999);
  profile.skins = [...new Set([...(profile.skins || []), ...SKINS.map((s) => s.id)])];
  profile.pets = [...new Set([...(profile.pets || []), ...PETS.map((p) => p.id)])];
  profile.avatar = { on: true, cfg: null, ...(profile.avatar || {}), unlocked: true };
  const items = [];
  for (const [slot, list] of Object.entries(SLOTS)) for (const it of list) if (it.price) items.push(slot + ':' + it.id);
  profile.avOwned = [...new Set([...(profile.avOwned || []), ...items])];
  // the achievements' items too, without pretending the achievements were done
  profile.testAll = true;
}

// a spot in the city: its tiles loaded first, then on the ground
async function teleport(g, x, z, near = 24) {
  g.ui.closeAll();
  g.ui.showLoading(t('test.going'));
  g.paused = true;
  try {
    if (g.city) await g.city.ensure(x, z, 64);
    const c = g.city ? g.city.openCellNear(Math.floor(x), Math.floor(z), near) || { x, z } : { x, z };
    g.player.pos.set(Math.floor(c.x) + 0.5, 126, Math.floor(c.z) + 0.5);
    g.player.vel.set(0, 0, 0); g.player.fallStart = null;
    await g.ensureLoaded();
    g.placeOnGround();
  } finally { g.ui.hideLoading(); g.paused = false; }
}

// the bank's plan needs its part of the city loaded
async function bankPlan(g) {
  let pl = g.heist.plan();
  if (pl) return pl;
  const q = g.missions.placeXZ('Banco de España');
  if (q) await g.city.ensure(q.x, q.z, 64);
  pl = g.heist.plan();
  return pl;
}

export function testPanel(args, ui) {
  const g = ui.game, running = !!(g && g.running);
  const malaga = running && g.missions && g.missions.active;
  const overworld = running && !g.isQuest && !malaga;
  const node = el(`<div class="screen ${running ? 'scrim' : 'solid'}" data-screen="testPanel">
    <div class="panel test-panel">
      <div class="panel-head"><h2 class="panel-title" data-i18n="test.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <p class="faint small" style="margin:0" data-i18n="test.info"></p>
      <div class="panel-body test-body">
        <section><h3 data-i18n="test.sAll"></h3><div class="test-row">
          <button class="btn primary" data-t="unlock" data-i18n="test.unlock"></button>
          ${account.available ? '<button class="btn gold" data-t="cash" data-i18n="test.cash"></button>' : ''}
        </div></section>
        <section><h3 data-i18n="test.sMalaga"></h3><div class="test-row">
          <button class="btn city-btn" data-t="malaga" data-i18n="test.malaga"></button>
          <button class="btn city-btn" data-t="malagaC" data-i18n="test.malagaCreative"></button>
        </div>
        ${malaga ? `<div class="test-row">${PLACES.map((p, i) => `<button class="btn small" data-tp="${i}">${esc(p)}</button>`).join('')}</div>` : ''}</section>
        ${malaga ? `<section><h3 data-i18n="test.sHeist"></h3><div class="test-row">
          <button class="btn small" data-t="bankFront" data-i18n="test.bankFront"></button>
          <button class="btn small" data-t="bankBack" data-i18n="test.bankBack"></button>
          <button class="btn small" data-t="pieces" data-i18n="test.pieces"></button>
          <button class="btn small" data-t="puzzle" data-i18n="test.puzzle"></button>
          <button class="btn small" data-t="tools" data-i18n="test.tools"></button>
          <button class="btn small ember" data-t="resetHeist" data-i18n="test.resetHeist"></button>
        </div></section>
        <section><h3 data-i18n="test.sFab"></h3><div class="test-row">
          <button class="btn small" data-t="toFinca" data-i18n="test.toFinca"></button>
          <button class="btn small" data-t="toFab" data-i18n="test.toFab"></button>
          ${['class', 'entry', 'siege', 'tunnel', 'escape'].map((k) => `<button class="btn small" data-fab="${k}">${esc(t('test.fabAct.' + k))}</button>`).join('')}
          <button class="btn small" data-t="fabPrint" data-i18n="test.fabPrint"></button>
          <button class="btn small ember" data-t="fabReset" data-i18n="test.fabReset"></button>
        </div></section>
        <section><h3 data-i18n="test.sOro"></h3><div class="test-row">
          <button class="btn small" data-t="toTermica" data-i18n="test.toTermica"></button>
          ${['class', 'rescue', 'entry', 'siege', 'pipe', 'sea'].map((k) => `<button class="btn small" data-oro="${k}">${esc(t('test.oroAct.' + k))}</button>`).join('')}
          <button class="btn small" data-t="oroMelt" data-i18n="test.oroMelt"></button>
          <button class="btn small ember" data-t="oroReset" data-i18n="test.oroReset"></button>
        </div></section>
        <section><h3 data-i18n="test.sPuerto"></h3><div class="test-row">
          <button class="btn small" data-t="toAlmacen" data-i18n="test.toAlmacen"></button>
          ${['plan', 'entry', 'safe', 'cell', 'escape'].map((k) => `<button class="btn small" data-pu="${k}">${esc(t('test.puertoAct.' + k))}</button>`).join('')}
          <button class="btn small" data-t="camsOff" data-i18n="test.camsOff"></button>
          <button class="btn small ember" data-t="puertoReset" data-i18n="test.puertoReset"></button>
        </div></section>
        <section><h3 data-i18n="test.sMissions"></h3><div class="test-row">
          <button class="btn small" data-t="missionsDone" data-i18n="test.missionsDone"></button>
          <button class="btn small ember" data-t="missionsReset" data-i18n="test.missionsReset"></button>
        </div></section>` : ''}
        ${running ? `<section><h3 data-i18n="test.sPlay"></h3><div class="test-row">
          <button class="btn small" data-t="god"></button>
          <button class="btn small" data-t="kit" data-i18n="test.kit"></button>
          <button class="btn small" data-t="day" data-i18n="dev.day"></button>
          <button class="btn small" data-t="night" data-i18n="dev.night"></button>
        </div></section>` : ''}
        ${overworld ? `<section><h3 data-i18n="test.sBosses"></h3><div class="test-row">
          <button class="btn small" data-t="realms" data-i18n="dev.unlock"></button>
          ${BOSS_ORDER.map((id) => `<button class="btn small" data-boss="${id}">${esc(t('boss.' + id))}</button>`).join('')}
        </div></section>` : ''}
        ${running && g.isQuest ? `<section><h3 data-i18n="title.quest"></h3><div class="test-row"><button class="btn small" data-t="questSkip" data-i18n="dev.questSkip"></button></div></section>` : ''}
      </div>
    </div></div>`);
  const profile = ui.app.profile;
  const save = () => storeProfile(profile);
  const godBtn = node.querySelector('[data-t="god"]');
  const label = () => { if (godBtn) godBtn.textContent = t('test.god', { state: t(g.player.god ? 'common.on' : 'common.off') }); };
  label();
  const act = {
    async unlock() { unlockAll(profile); await save(); if (g && g.applySkin) g.applySkin(); ui.toast(t('test.unlocked'), 'soul'); },
    async cash() { try { const r = await econ.testCash(); ui.toast(t('test.cashDone', { n: r.paid }), 'soul'); } catch { ui.toast(t('fr.err'), 'warn'); } },
    async malaga() { if (running) await g.save(true); ui.app.newCity({ city: 'malaga', name: t('test.worldName'), creative: false, difficulty: 'normal' }); },
    async malagaC() { if (running) await g.save(true); ui.app.newCity({ city: 'malaga', name: t('test.worldName'), creative: true, difficulty: 'normal' }); },
    async bankFront() { const pl = await bankPlan(g); if (!pl) return; const q = bankPoint(pl.P, -4, pl.mid); await teleport(g, q.x, q.z, 3); },
    async bankBack() { const pl = await bankPlan(g); if (!pl) return; const q = bankPoint(pl.P, pl.depth + 3, pl.mid); await teleport(g, q.x, q.z, 3); },
    pieces() {
      const H = g.heist, s = H.state(), M = g.missions, st = M.state();
      for (const k of s.tasks) { st.done[heistId(k)] = true; if (!s.got.includes(k)) s.got.push(k); }
      ui.toast(t('heist.piece', { n: s.got.length, total: PIECES }), 'soul');
      g.save(true);
    },
    puzzle() {
      act.pieces();
      const H = g.heist, s = H.state();
      s.placed = [...s.got];
      if (!s.map) { s.map = true; g.giveItem('heist_map', 1); }
      g.missions.track(FINAL.id, false);
      g.missions.guideCard(FINAL.id);
      ui.toast(t('heist.mapDone'), 'soul');
      g.save(true);
    },
    tools() {
      for (const [k, n] of [['guard_uniform', 1], ['sewer_key', 1], ['firecracker', 3], ['vault_code', 1]]) g.giveItem(k, n);
      ui.toast(t('test.toolsDone'), 'soul');
    },
    async resetHeist() {
      const H = g.heist, M = g.missions, st = M.state();
      H.returnDiamond(await bankPlan(g));
      for (const k of Object.keys(st.done)) if (k.startsWith('h_') || k === FINAL.id) delete st.done[k];
      for (const k of Object.keys(st.prog)) if (k.startsWith('h_') || k === FINAL.id) delete st.prog[k];
      g.inventory.remove('heist_map', g.inventory.count('heist_map'));
      profile.heist = null; profile.mayorAt = null;
      H.state();
      await save(); g.save(true);
      ui.toast(t('test.heistReset'), 'soul');
    },
    async toFinca() { const q = g.missions.placeXZ('Finca El Maestro'); if (q) await teleport(g, q.x, q.z); },
    async toFab() { const q = g.missions.placeXZ('La Tabacalera'); if (!q) return; await g.city.ensure(q.x, q.z, 64); const pl = g.fabrica.plan(); const f = pl ? bankPoint(pl.P, -4, pl.mid) : q; await teleport(g, f.x, f.z, 4); },
    fabPrint() { const s = g.fabrica.state(); if (s.act !== 4) { ui.toast(t('test.fabNotSiege'), 'warn'); return; } const pl = g.fabrica.plan(); while (s.printed < TARGET - 1) { s.printed++; if (pl) g.fabrica.placePallet(pl, s.printed); g.missions.event('fab_print'); } ui.toast(t('test.done'), 'soul'); },
    fabReset() { const M = g.missions, st = M.state(); for (const k of Object.keys(st.done)) if (k.startsWith('f_')) delete st.done[k]; for (const k of Object.keys(st.prog)) if (k.startsWith('f_')) delete st.prog[k]; profile.fabrica = null; g.fabrica.state(); g.inventory.remove('money_bag', g.inventory.count('money_bag')); g.save(true); ui.toast(t('test.done'), 'soul'); },
    async toTermica() { const q = g.missions.placeXZ('La Térmica'); if (!q) return; await g.city.ensure(q.x, q.z, 64); const pl = g.oro.plan(); const f = pl ? bankPoint(pl.P, -4, pl.mid) : q; await teleport(g, f.x, f.z, 4); },
    oroMelt() { const s = g.oro.state(); if (s.act !== 6) { ui.toast(t('test.fabNotSiege'), 'warn'); return; } while (s.melted < ORO_TARGET - 1) { s.melted++; g.missions.event('oro_melt'); } ui.toast(t('test.done'), 'soul'); },
    oroReset() { const M = g.missions, st = M.state(); for (const k of Object.keys(st.done)) if (k.startsWith('f2_')) delete st.done[k]; for (const k of Object.keys(st.prog)) if (k.startsWith('f2_')) delete st.prog[k]; profile.oro = null; g.oro.state(); for (const k of ['gold_sack', 'gold_bar', 'fake_order', 'police_uniform']) g.inventory.remove(k, g.inventory.count(k)); g.save(true); ui.toast(t('test.done'), 'soul'); },
    async toAlmacen() { const q = g.missions.placeXZ('Almacén del Puerto'); if (!q) return; await g.city.ensure(q.x, q.z, 64); const pl = g.puerto.plan(); const f = pl ? bankPoint(pl.P, -4, pl.mid) : q; await teleport(g, f.x, f.z, 4); },
    camsOff() { const s = g.puerto.state(); s.camsOff = 600; ui.toast(t('test.done'), 'soul'); },
    puertoReset() { const M = g.missions, st = M.state(); for (const k of Object.keys(st.done)) if (k.startsWith('f3_')) delete st.done[k]; for (const k of Object.keys(st.prog)) if (k.startsWith('f3_')) delete st.prog[k]; profile.puerto = null; g.puerto.state(); for (const k of ['stethoscope', 'cell_key']) g.inventory.remove(k, g.inventory.count(k)); g.save(true); ui.toast(t('test.done'), 'soul'); },
    missionsDone() { const st = g.missions.state(); for (const m of MISSIONS) st.done[m.id] = true; g.save(true); ui.toast(t('test.done'), 'soul'); },
    missionsReset() { const st = g.missions.state(); for (const m of MISSIONS) { delete st.done[m.id]; delete st.prog[m.id]; } st.track = 'tour'; g.save(true); ui.toast(t('test.done'), 'soul'); },
    god() { g.player.god = !g.player.god; label(); },
    kit() {
      for (const [k, n] of [['emberite_sword', 1], ['emberite_pickaxe', 1], ['emberite_helmet', 1], ['emberite_chestplate', 1], ['emberite_leggings', 1], ['emberite_boots', 1], ['shield', 1], ['bow', 1], ['arrow', 64], ['gold_pan', 1], ['roast', 16], ['torch', 32], ['planks', 64]]) g.giveItem(k, n);
      ui.toast(t('test.done'), 'soul');
    },
    day() { g.meta.time = 0.1; },
    night() { g.meta.time = 0.6; },
    realms() { g.meta.hasLantern = true; for (const id of BOSS_ORDER.slice(0, -1)) g.meta.bosses[id] = g.meta.bosses[id] || false; g.meta.devUnlock = true; ui.toast(t('test.done'), 'soul'); },
    questSkip() { if (g.quest) g.quest.devSkip(); },
  };
  node.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', async () => { ui.click(); b.disabled = true; try { await act[b.dataset.t](); } finally { b.disabled = false; } }));
  // La Fábrica: straight to an act (the earlier ones counted as done)
  const ACTS = { class: 1, entry: 3, siege: 4, tunnel: 5, escape: 6 };
  const BEFORE = { 1: ['maestro'], 3: ['maestro', 'class', 'monos', 'mascaras', 'camion', 'planos'], 4: ['maestro', 'class', 'monos', 'mascaras', 'camion', 'planos', 'entrada'], 5: ['maestro', 'class', 'monos', 'mascaras', 'camion', 'planos', 'entrada', 'asedio'], 6: ['maestro', 'class', 'monos', 'mascaras', 'camion', 'planos', 'entrada', 'asedio', 'tunel'] };
  node.querySelectorAll('[data-fab]').forEach((b) => b.addEventListener('click', async () => {
    ui.click();
    const act = ACTS[b.dataset.fab], s = g.fabrica.state(), st = g.missions.state();
    for (const k of BEFORE[act]) st.done[fabId(k)] = Date.now();
    s.act = act; if (!s.alias) s.alias = 'biznaga';
    if (act === 3) { st.prog[fabId('entrada')] = { step: 0, n: 0, seen: [] }; }
    if (act === 4) { await act_.toFab(); await g.fabrica.enterTest(); }
    if (act === 5) { s.printed = TARGET; await act_.toFab(); const pl = g.fabrica.plan(); if (pl) { for (let i = 1; i <= TARGET; i++) g.fabrica.placePallet(pl, i); g.fabrica.toLobby(pl); } }
    if (act === 6) g.giveItem('money_bag', TARGET);
    const next = g.missions.all().find((m) => m.fab && !g.missions.isDone(m.id));
    if (next) g.missions.track(next.id, false);
    g.save(true);
    ui.toast(t('test.done'), 'soul');
  }));
  const act_ = act;
  // season 3: straight to an act (seasons 1 and 2 and the earlier acts counted as done)
  const PACTS = { plan: 1, entry: 3, safe: 5, cell: 6, escape: 7 };
  const PKEYS = ['aviso', 'plan3', 'hacker', 'cerrajero', 'barquero', 'entrada3', 'sigilo', 'caja', 'celda'];
  const PBEFORE = { 1: 1, 3: 5, 5: 7, 6: 8, 7: 9 };
  node.querySelectorAll('[data-pu]').forEach((b) => b.addEventListener('click', async () => {
    ui.click();
    const f = g.fabrica.state(), o = g.oro.state();
    if (!f.done) { f.done = true; f.act = 7; if (!f.alias) f.alias = 'biznaga'; }
    if (!o.done) { o.done = true; o.act = 9; }
    const n = PACTS[b.dataset.pu], s = g.puerto.state(), st = g.missions.state();
    for (const k of PKEYS.slice(0, PBEFORE[n])) st.done[puertoId(k)] = Date.now();
    s.act = n;
    if (n >= 3 && !g.inventory.count('stethoscope')) g.giveItem('stethoscope', 1);
    if (n === 3) st.prog[puertoId('entrada3')] = { step: 0, n: 0, seen: [] };
    if (n >= 5) { await act_.toAlmacen(); await (s.act = 3, g.puerto.enterTest()); s.act = n; for (const k of PKEYS.slice(0, PBEFORE[n])) st.done[puertoId(k)] = Date.now(); const pl = g.puerto.plan(); if (pl) { const q = bankPoint(pl.P, pl.c0 + 5, pl.mid); g.player.pos.set(q.x + 0.5, pl.P.base + 1.05, q.z + 0.5); } }
    if (n === 6 && !g.inventory.count('cell_key')) g.giveItem('cell_key', 1);
    if (n === 7) s.escape = 150;
    const next = g.missions.all().find((m) => m.season === 3 && !g.missions.isDone(m.id));
    if (next) g.missions.track(next.id, false);
    g.save(true);
    ui.toast(t('test.done'), 'soul');
  }));
  // season 2: straight to an act (season 1 and the earlier acts counted as done)
  const OACTS = { class: 1, rescue: 3, entry: 5, siege: 6, pipe: 7, sea: 8 };
  const OKEYS = ['llamada', 'clase2', 'orden', 'uniforme', 'lancha', 'rescate', 'buzos', 'fundidor', 'turnos', 'entrada2', 'oro', 'desague'];
  const OBEFORE = { 1: 1, 3: 5, 5: 9, 6: 10, 7: 11, 8: 12 };
  node.querySelectorAll('[data-oro]').forEach((b) => b.addEventListener('click', async () => {
    ui.click();
    const f = g.fabrica.state();
    if (!f.done) { f.done = true; f.act = 7; if (!f.alias) f.alias = 'biznaga'; }
    const n = OACTS[b.dataset.oro], s = g.oro.state(), st = g.missions.state();
    for (const k of OKEYS.slice(0, OBEFORE[n])) st.done[oroId(k)] = Date.now();
    s.act = n;
    if (n === 3) { st.prog[oroId('rescate')] = { step: 0, n: 0, seen: [] }; for (const k of ['fake_order', 'police_uniform']) if (!g.inventory.count(k)) g.giveItem(k, 1); }
    if (n === 5) st.prog[oroId('entrada2')] = { step: 0, n: 0, seen: [] };
    if (n === 6) { await act_.toTermica(); await g.oro.enterTest(); }
    if (n === 7) { s.melted = ORO_TARGET; await act_.toTermica(); const pl = g.oro.plan(); if (pl) g.oro.toLobby(pl); }
    if (n === 8) { s.melted = ORO_TARGET; g.giveItem('gold_sack', ORO_TARGET); }
    const next = g.missions.all().find((m) => m.season === 2 && !g.missions.isDone(m.id));
    if (next) g.missions.track(next.id, false);
    g.save(true);
    ui.toast(t('test.done'), 'soul');
  }));
  node.querySelectorAll('[data-tp]').forEach((b) => b.addEventListener('click', async () => {
    ui.click();
    const q = g.missions.placeXZ(PLACES[Number(b.dataset.tp)]);
    if (q) await teleport(g, q.x, q.z);
  }));
  node.querySelectorAll('[data-boss]').forEach((b) => b.addEventListener('click', () => {
    ui.click();
    const id = b.dataset.boss;
    g.meta.devUnlock = true;
    ui.closeAll();
    g.travel(ARENAS[id].dim, id === 'whirlwindKing' ? 'chamber' : id);
  }));
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  return node;
}
