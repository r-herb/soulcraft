// La Fábrica's seasons as the title screen shows them: where each one
// stands, and a season picked there to play. A season opens when the one
// before it is finished, or when it was picked on the title screen (the
// seasons before it are not needed; their rewards come only by playing
// them). A finished season picked again starts over: the coins and the
// crystals are given only the first time, the wardrobe's items stay.
import { t } from '../i18n/index.js';

export const SEASONS = [
  { n: 1, key: 'fabrica', prefix: 'f_', items: ['money_bag'], title: 'fab.hud.title' },
  { n: 2, key: 'oro', prefix: 'f2_', items: ['gold_sack', 'gold_bar', 'fake_order', 'police_uniform'], title: 'oro.hud.title' },
  { n: 3, key: 'puerto', prefix: 'f3_', items: ['stethoscope', 'cell_key'], title: 'puerto.hud.title' },
  { n: 4, key: 'aero', prefix: 'f4_', items: ['fake_passport', 'cargo_badge'], title: 'aero.hud.title' },
];

// finished at least once (a season played again is not done until its end, but stays cleared)
export const cleared = (p, key) => !!(p && p[key] && (p[key].done || p[key].cleared));
// season n is open to play
export const seasonOpen = (p, n) => n <= 1 || cleared(p, SEASONS[n - 2].key) || ((p && p.fabPick) || 0) >= n;
// the same in a game: a guest goes by the host's seasons
export function seasonOpenFor(g, n) {
  if (n <= 1) return true;
  if (g.net && !g.net.isHost) { const T = g.team || {}, prev = T[SEASONS[n - 2].key]; return !!(prev && (prev.done || prev.cleared)) || (T.fabPick || 0) >= n; }
  return seasonOpen(g.profile, n);
}
// new, playing (with its act) or done
export function seasonStatus(p, n) {
  const st = p && p[SEASONS[n - 1].key];
  if (!st) return 'new';
  if (st.done) return 'done';
  if (st.act > 0) return 'playing';
  return st.cleared ? 'done' : 'new';
}

// a season picked on the title screen, once its world is running: open it (or
// start it over if it was finished) and follow its first mission
export function pickSeason(g, n) {
  const p = g.profile, s = SEASONS[n - 1], M = g.missions;
  if (!s || !M) return;
  p.fabPick = Math.max(p.fabPick || 0, n);
  const st = p[s.key];
  if (st && st.done) {
    const ms = M.state();
    for (const k of Object.keys(ms.done)) if (k.startsWith(s.prefix)) delete ms.done[k];
    for (const k of Object.keys(ms.prog)) if (k.startsWith(s.prefix)) delete ms.prog[k];
    p[s.key] = null;
    const fresh = g[s.key].state();
    fresh.cleared = true;
    if (st.alias) fresh.alias = st.alias;
    for (const k of s.items) g.inventory.remove(k, g.inventory.count(k));
  }
  const first = M.all().find((m) => m.fab && (m.season || 1) === n && !M.isDone(m.id));
  if (first) M.track(first.id, false);
  g.ui.toast(t('seasons.started', { name: t(s.title) }), 'soul');
  g.save(true);
}
