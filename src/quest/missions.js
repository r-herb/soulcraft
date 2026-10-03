// City missions (Malaga): small goals that show the city and its life -
// a walk past the landmarks, a bus ride to the beach, cooking a paella,
// eating out, and a first bank deposit. Progress is the player's own (in
// the profile, so it follows them between Malaga worlds); a finished
// mission pays soul crystals (survival) and coins from the city (signed-in
// players, once each). One mission is tracked on the HUD, with the way to
// its next place.
import { t } from '../i18n/index.js';
import { CITY_PLACES } from '../world/city.js';
import { account, econ } from '../save/account.js';
import { itemName } from '../ui/hud.js';

// the text of a heist step (generic: the place, the item)
function heistStep(st) {
  if (!st) return '';
  if (st.text) return t('heist.s.' + st.text);
  if (st.ev === 'reach') return st.give ? t('heist.s.give', { place: st.near, item: itemName(st.give) }) : t('heist.s.reach', { place: st.near });
  if (st.ev === 'buy') return t('heist.s.buy', { item: itemName(st.item) });
  if (st.ev === 'getoff') return t('heist.s.getoff', { place: st.near });
  return t('heist.s.' + st.ev);
}

const place = (name) => (CITY_PLACES.malaga || []).find((p) => p.name === name);

// steps: { ev, n?, item?, near?, r?, distinct? } done in order
export const MISSIONS = [
  { id: 'deposit', reward: { coins: 10, crystals: 5 }, steps: [{ ev: 'deposit' }] },
  { id: 'tour', reward: { coins: 60, crystals: 20 }, tour: ['Plaza de la Constitución', 'Catedral', 'Alcazaba', 'Gibralfaro', 'La Malagueta'], r: 30 },
  { id: 'bus', reward: { coins: 40, crystals: 10 }, steps: [{ ev: 'board' }, { ev: 'stop', n: 2 }, { ev: 'getoff', near: 'La Malagueta', r: 220 }] },
  { id: 'paella', reward: { coins: 50, crystals: 15 }, steps: [{ ev: 'buy', item: 'rice' }, { ev: 'craft', item: 'paella' }, { ev: 'eat', item: 'paella', near: 'La Malagueta', r: 120 }] },
  { id: 'critic', reward: { coins: 30, crystals: 10 }, steps: [{ ev: 'meal', n: 3, distinct: true }] },
];
export const missionById = (id) => MISSIONS.find((m) => m.id === id);
// a mission's name: the city missions, the heist's tasks and its final
export const missionName = (m) => (m.final ? t('heist.final') : m.heist ? t('heist.task.' + m.key) : t('mis.' + m.id));

export class Missions {
  constructor(game) { this.game = game; this.t = 0; }
  get active() { const g = this.game; return !!(g.meta && g.meta.dim === 'city' && g.meta.city === 'malaga' && g.city); }
  // the city missions, then the heist's tasks (and its final once the plan is whole)
  all() { return this.game.heist ? MISSIONS.concat(this.game.heist.missions()) : MISSIONS; }
  byId(id) { return this.all().find((m) => m.id === id); }
  placeXZ(name) { const pl = place(name); return pl && this.game.city ? this.game.city.toXZ(pl.lat, pl.lon) : null; }
  state() {
    const pr = this.game.profile;
    if (!pr.missions) pr.missions = { done: {}, prog: {}, track: 'tour' };
    return pr.missions;
  }
  prog(id) { const s = this.state(); return (s.prog[id] = s.prog[id] || { step: 0, n: 0, seen: [] }); }
  isDone(id) { return !!this.state().done[id]; }
  track(id) { this.state().track = id; }
  get tracked() { const s = this.state(), all = this.all(); const m = all.find((x) => x.id === s.track); return m && !this.isDone(m.id) ? m : all.find((x) => !this.isDone(x.id)) || null; }

  // where a mission's current step wants the player to go (or null)
  target(m = this.tracked) {
    if (!m || !this.active) return null;
    const city = this.game.city, pr = this.prog(m.id);
    let name = null;
    if (m.tour) name = m.tour.find((n) => !pr.seen.includes(n));
    else { const st = m.steps[pr.step]; name = st && st.near; }
    const pl = name && place(name);
    if (!pl) return null;
    const q = city.toXZ(pl.lat, pl.lon);
    return { name, x: q.x, z: q.z };
  }

  // the text for a mission's current step
  stepText(m) {
    const pr = this.prog(m.id);
    if (this.isDone(m.id)) return t('mis.done');
    if (m.tour) { const next = m.tour.find((n) => !pr.seen.includes(n)); return t('mis.tour.step', { place: next, n: pr.seen.length, total: m.tour.length }); }
    const st = m.steps[pr.step];
    if (m.heist || m.final) return heistStep(st);
    return t(`mis.${m.id}.s${pr.step}`, { n: pr.n, total: st.n || 1 });
  }

  near(name, r) {
    const pl = place(name);
    if (!pl || !this.active) return false;
    const q = this.game.city.toXZ(pl.lat, pl.lon), p = this.game.player.pos;
    return Math.hypot(q.x - p.x, q.z - p.z) <= r;
  }

  // something happened in the game: move the missions on
  event(ev, data = {}) {
    if (!this.active) return;
    for (const m of this.all()) {
      if (this.isDone(m.id) || !m.steps) continue;
      const pr = this.prog(m.id), st = m.steps[pr.step];
      if (!st || st.ev !== ev) continue;
      if (st.item && data.item !== st.item) continue;
      if (st.near && !this.near(st.near, st.r)) continue;
      if (st.distinct) { const key = data.key || ''; if (pr.seen.includes(key)) continue; pr.seen.push(key); }
      pr.n++;
      if (pr.n < (st.n || 1)) { this.game.ui.toast(`${missionName(m)}: ${this.stepText(m)}`); continue; }
      this.advance(m);
    }
    // getting off anywhere else than the goal starts the bus mission over
    if (ev === 'getoff') { const pr = this.prog('bus'); if (!this.isDone('bus') && pr.step >= 1) { pr.step = 0; pr.n = 0; } }
  }

  // the next step of a mission (or the mission done)
  advance(m) {
    const pr = this.prog(m.id);
    pr.step++; pr.n = 0; pr.seen = [];
    if (pr.step >= m.steps.length) this.complete(m);
    else this.game.ui.toast(`${missionName(m)}: ${this.stepText(m)}`, 'soul');
  }

  update(dt) {
    this.t += dt;
    if (this.t < 1) return;
    this.t = 0;
    if (!this.active) return;
    // steps that ask to reach a place (meeting an informant), some with something to hand over
    const g = this.game;
    for (const m of this.all()) {
      if (!m.steps || this.isDone(m.id)) continue;
      const st = m.steps[this.prog(m.id).step];
      if (!st || st.ev !== 'reach' || !this.near(st.near, st.r)) continue;
      if (st.give) {
        if (g.inventory.count(st.give) < 1) { if (this.asked !== m.id) { this.asked = m.id; g.ui.toast(t('heist.bring', { item: itemName(st.give) }), 'warn'); } continue; }
        g.inventory.remove(st.give, 1);
      }
      if (m.heist) g.ui.toast(t('heist.met'), 'ok');
      this.advance(m);
    }
    // the tour: reaching each landmark
    const m = missionById('tour');
    if (this.isDone('tour')) return;
    const pr = this.prog('tour');
    for (const name of m.tour) {
      if (pr.seen.includes(name) || !this.near(name, m.r)) continue;
      pr.seen.push(name);
      if (pr.seen.length >= m.tour.length) this.complete(m);
      else this.game.ui.toast(t('mis.tour.reached', { place: name, n: pr.seen.length, total: m.tour.length }), 'soul');
    }
  }

  complete(m) {
    const g = this.game, s = this.state();
    s.done[m.id] = Date.now();
    g.audio.sfx('levelup');
    if (!g.creative) g.addCrystals(m.reward.crystals);
    const paid = !!(account.user && account.available);
    const gains = [!g.creative && t('mis.gainCrystals', { n: m.reward.crystals }), paid && m.reward.coins && t('mis.gainCoins', { n: m.reward.coins })].filter(Boolean);
    g.ui.toast(t('mis.complete', { name: missionName(m) }) + (gains.length ? ' ' + gains.join(', ') : ''), 'ok');
    if (paid && m.reward.coins) econ.mission(m.id).catch(() => { /* offline: the coins stay unpaid */ });
    if (m.heist && g.heist) g.heist.gotPiece(m.key);
    g.save(true);
  }
}
