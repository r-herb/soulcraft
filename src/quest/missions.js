// City missions (Malaga): small goals that show the city and its life -
// a walk past the landmarks, a bus ride to the beach, cooking a paella,
// eating out, and a first bank deposit. Progress is the player's own (in
// the profile, so it follows them between Malaga worlds); a finished
// mission pays soul crystals (survival) and coins from the city (signed-in
// players, once each). One mission is tracked on the HUD, with the way to
// its next place.
// Played together (a room): the host's game keeps the shared progress (the
// host's own missions and big mission), the guests send what they do to the
// host, the host sends the state back, and each player gets the rewards of
// every mission the team finishes.
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
  // a guest in a friend's world plays the host's (team) missions
  get guest() { const n = this.game.net; return !!(n && !n.isHost); }
  get host() { const n = this.game.net; return !!(n && n.isHost); }
  state() {
    const g = this.game;
    if (this.guest) return (g.team && g.team.missions) || (g.team = { missions: { done: {}, prog: {}, track: 'tour' }, heist: null }).missions;
    const pr = g.profile;
    if (!pr.missions) pr.missions = { done: {}, prog: {}, track: 'tour' };
    return pr.missions;
  }
  prog(id) { const s = this.state(); return (s.prog[id] = s.prog[id] || { step: 0, n: 0, seen: [] }); }
  isDone(id) { return !!this.state().done[id]; }
  // follow a mission; its guide opens the first time
  track(id, guide = true) { if (this.guest) this.localTrack = id; else this.state().track = id; if (guide) this.showGuide(id); }
  // a mission's guide (what to do, step by step), once per mission unless asked for
  showGuide(id, force = false) {
    const g = this.game, pr = g.profile;
    if (!pr || !this.byId(id)) return;
    const seen = pr.guidesSeen || (pr.guidesSeen = {});
    if (seen['m:' + id] && !force) return;
    seen['m:' + id] = true;
    g.ui.open('missionHelp', { id });
  }
  // every step of a mission, as text
  stepsOf(m) {
    if (m.tour) return m.tour.map((n, i) => t('mis.tour.step', { place: n, n: i, total: m.tour.length }));
    return m.steps.map((st, i) => (m.heist || m.final ? heistStep(st) : t(`mis.${m.id}.s${i}`, { n: 0, total: st.n || 1 })));
  }
  // the kind of tips a mission's guide gives
  guideKey(m) { return m.final ? 'final' : m.heist ? 'task' : m.id; }
  get tracked() { const s = this.state(), all = this.all(), id = this.guest ? this.localTrack || s.track : s.track; const m = all.find((x) => x.id === id); return m && !this.isDone(m.id) ? m : all.find((x) => !this.isDone(x.id)) || null; }

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

  near(name, r, at = null) {
    const pl = place(name);
    if (!pl || !this.active) return false;
    const q = this.game.city.toXZ(pl.lat, pl.lon), p = at || this.game.player.pos;
    return Math.hypot(q.x - p.x, q.z - p.z) <= r;
  }
  // the host: near for anyone in the team
  nearAnyone(name, r) {
    if (this.near(name, r)) return true;
    const n = this.game.net;
    if (n && n.isHost) for (const rp of n.players.values()) if (rp.seen && this.near(name, r, rp.pos)) return true;
    return false;
  }

  // something happened in the game: move the missions on (a guest tells the host)
  event(ev, data = {}, at = null) {
    if (!this.active) return;
    if (this.guest) { const p = this.game.player.pos; this.game.net.send({ t: 'mev', ev, data, x: p.x, z: p.z }); return; }
    const before = JSON.stringify(this.state());
    this.apply(ev, data, at);
    if (this.host && JSON.stringify(this.state()) !== before) this.dirty = true;
  }

  apply(ev, data, at) {
    // a guest handed an informant what was asked for
    if (ev === 'gave') {
      const m = this.byId(data.id), st = m && m.steps && m.steps[this.prog(m.id).step];
      if (st && st.ev === 'reach' && st.give && !this.isDone(m.id)) { this.game.ui.toast(t('heist.met'), 'ok'); this.advance(m); }
      return;
    }
    // the big mission's final steps also mark how far the heist has come
    const H = this.game.heist;
    if (H) { const hs = H.state(); if (ev === 'diamond') hs.robbed = true; else if (ev === 'escape') hs.escaped = true; }
    for (const m of this.all()) {
      if (this.isDone(m.id) || !m.steps) continue;
      const pr = this.prog(m.id), st = m.steps[pr.step];
      if (!st || st.ev !== ev) continue;
      if (st.item && data.item !== st.item) continue;
      if (st.near && !this.near(st.near, st.r, at)) continue;
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
    // the first time in Malaga: a card that opens the city guide
    const prof = this.game.profile;
    if (prof && !this._cityCard && !(prof.guidesSeen && prof.guidesSeen.city)) {
      this._cityCard = true;
      const seen = () => { (prof.guidesSeen || (prof.guidesSeen = {})).city = true; };
      this.game.ui.hud.showGuideCard(t('guide.city.card'), t('guide.city.open'), () => { seen(); this.game.ui.open('cityGuide'); }, seen);
    }
    // steps that ask to reach a place (meeting an informant), some with something to hand over
    const g = this.game;
    for (const m of this.all()) {
      if (!m.steps || this.isDone(m.id)) continue;
      const st = m.steps[this.prog(m.id).step];
      if (this.guest) {
        // the host decides; a guest hands over what an informant asks for and tells the host
        this.gave = this.gave || {};
        if (st && st.ev === 'reach' && st.give && !this.gave[m.id] && this.near(st.near, st.r) && g.inventory.count(st.give) > 0) {
          g.inventory.remove(st.give, 1); this.gave[m.id] = true;
          g.net.send({ t: 'mev', ev: 'gave', data: { id: m.id } });
        }
        continue;
      }
      if (!st || st.ev !== 'reach' || !(st.give ? this.near(st.near, st.r) : this.nearAnyone(st.near, st.r))) continue;
      if (st.give) {
        if (g.inventory.count(st.give) < 1) { if (this.asked !== m.id) { this.asked = m.id; g.ui.toast(t('heist.bring', { item: itemName(st.give) }), 'warn'); } continue; }
        g.inventory.remove(st.give, 1);
      }
      if (m.heist) g.ui.toast(t('heist.met'), 'ok');
      this.advance(m);
      this.dirty = true;
    }
    // the host sends the team's state when it changed (and now and then)
    this.syncT = (this.syncT || 0) + 1;
    if (this.host && (this.dirty || this.syncT >= 10)) this.sendTeam();
    if (this.guest) return;
    // the tour: reaching each landmark (anyone in the team)
    const m = missionById('tour');
    if (this.isDone('tour')) return;
    const pr = this.prog('tour');
    for (const name of m.tour) {
      if (pr.seen.includes(name) || !this.nearAnyone(name, m.r)) continue;
      pr.seen.push(name);
      this.dirty = true;
      if (pr.seen.length >= m.tour.length) this.complete(m);
      else this.game.ui.toast(t('mis.tour.reached', { place: name, n: pr.seen.length, total: m.tour.length }), 'soul');
    }
  }

  // ---------- played together ----------
  sendTeam(to = undefined) {
    const n = this.game.net;
    if (!n || !n.isHost) return;
    this.dirty = false; this.syncT = 0;
    n.send({ t: 'team', to, missions: this.state(), heist: this.game.heist ? this.game.heist.state() : null });
  }
  // messages of the room about the missions
  onNet(msg, from) {
    const g = this.game;
    if (msg.t === 'mev' && this.host) this.event(msg.ev, msg.data || {}, { x: msg.x, z: msg.z });
    else if (msg.t === 'team' && this.guest) g.team = { missions: msg.missions, heist: msg.heist };
    else if (msg.t === 'hplace' && this.host && g.heist) { if (g.heist.place(msg.key, msg.slot)) this.sendTeam(); }
    else if (msg.t === 'mdone' && this.guest) this.rewardMine(this.byId(msg.id) || { id: msg.id, key: msg.key, heist: !!msg.key, reward: msg.reward, steps: [] }, true);
  }

  // a mission finished: the rewards for this player (and the others are told)
  rewardMine(m, fromHost = false) {
    const g = this.game;
    g.audio.sfx('levelup');
    if (!g.creative) g.addCrystals(m.reward.crystals);
    const paid = !!(account.user && account.available);
    const gains = [!g.creative && t('mis.gainCrystals', { n: m.reward.crystals }), paid && m.reward.coins && t('mis.gainCoins', { n: m.reward.coins })].filter(Boolean);
    g.ui.toast(t('mis.complete', { name: missionName(m) }) + (gains.length ? ' ' + gains.join(', ') : ''), 'ok');
    if (paid && m.reward.coins) econ.mission(m.id).catch(() => { /* offline: the coins stay unpaid */ });
    if (m.heist && g.heist && fromHost) g.ui.toast(t('heist.piece', { n: ((g.team && g.team.heist && g.team.heist.got.length) || 0) + 1, total: 12 }), 'soul');
    // the team's heist done: everyone becomes a mayor (each paid on their own account)
    if (m.final && g.heist && (fromHost || !g.heist.state().traded)) g.heist.teamMayor();
  }

  complete(m) {
    const g = this.game, s = this.state();
    s.done[m.id] = Date.now();
    if (this.host) { this.game.net.send({ t: 'mdone', id: m.id, key: m.key || null, reward: m.reward }); this.dirty = true; }
    this.rewardMine(m);
    if (m.heist && g.heist) g.heist.gotPiece(m.key);
    g.save(true);
    // the next mission followed: a card for its guide
    const next = this.tracked;
    if (next && !this.guest) this.guideCard(next.id);
  }

  // a card on the HUD that opens a mission's guide (if it was never seen)
  guideCard(id) {
    const g = this.game, pr = g.profile, m = this.byId(id);
    if (!m || (pr.guidesSeen && pr.guidesSeen['m:' + id])) return;
    g.ui.hud.showGuideCard(t('guide.card', { name: missionName(m) }), t('guide.how'), () => this.showGuide(id, true));
  }
}
