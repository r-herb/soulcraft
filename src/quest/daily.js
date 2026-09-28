// Daily tasks and seasonal events.
//
// Every calendar day brings three tasks (the same for everyone on that day),
// tracked in the profile so they follow the player between worlds and
// devices. They count in survival worlds only. Seasonal events are picked
// from the date; ?event=<id> forces one for testing.
import { t } from '../i18n/index.js';
import { hash3 } from '../world/noise.js';

const POOL = [
  { id: 'break', goals: [30, 50, 80], reward: 8 },
  { id: 'place', goals: [20, 40, 60], reward: 8 },
  { id: 'kill', goals: [3, 5, 8], reward: 12 },
  { id: 'ore', goals: [3, 6, 10], reward: 12 },
  { id: 'trade', goals: [2, 3, 4], reward: 10 },
  { id: 'craft', goals: [3, 6, 10], reward: 8 },
  { id: 'eat', goals: [2, 3, 5], reward: 6 },
  { id: 'walk', goals: [300, 600, 1000], reward: 8 },
  { id: 'night', goals: [1, 1, 1], reward: 12 },
];
export const ALL_BONUS = 20;

export const EVENTS = [
  // month is 1-12; ranges may wrap over the new year
  { id: 'bloom', from: [4, 1], to: [4, 20], particles: [1, 0.7, 0.85] },
  { id: 'harvest', from: [10, 15], to: [11, 5], particles: [1, 0.55, 0.2] },
  { id: 'frost', from: [12, 10], to: [1, 6], particles: [1, 1, 1] },
];

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inRange(d, from, to) {
  const v = (d.getMonth() + 1) * 100 + d.getDate();
  const a = from[0] * 100 + from[1], b = to[0] * 100 + to[1];
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
}

export function currentEvent(d = new Date()) {
  let forced = null;
  try { forced = new URLSearchParams(location.search).get('event'); } catch { /* no location */ }
  if (forced) return EVENTS.find((e) => e.id === forced) || null;
  return EVENTS.find((e) => inRange(d, e.from, e.to)) || null;
}

// The three tasks of a day, the same for everyone.
export function tasksFor(key) {
  const seed = key.split('-').reduce((a, n) => a * 37 + Number(n), 7);
  const picks = [];
  for (let i = 0; picks.length < 3 && i < 40; i++) {
    const def = POOL[Math.floor(hash3(seed, i, 11, 3) * POOL.length)];
    if (picks.some((p) => p.id === def.id)) continue;
    const goal = def.goals[Math.floor(hash3(seed, i, 12, 5) * def.goals.length)];
    picks.push({ id: def.id, goal, n: 0, reward: def.reward, claimed: false });
  }
  return picks;
}

// Today's state in the profile (rolled over when the day changes).
export function daily(profile) {
  const key = dayKey();
  if (!profile.daily || profile.daily.date !== key) profile.daily = { date: key, tasks: tasksFor(key), bonus: false };
  return profile.daily;
}

export function taskLabel(task) { return t('daily.' + task.id, { n: task.goal }); }

export function rewardFor(task, ev = currentEvent()) { return task.reward * (ev && ev.id === 'bloom' ? 2 : 1); }

export class DailyTracker {
  constructor(game) { this.game = game; this.walkAcc = 0; }

  // Count progress; returns nothing. Only survival worlds count.
  note(id, n = 1) {
    const g = this.game;
    if (!g.meta || g.isQuest || g.creative) return;
    const d = daily(g.profile);
    for (const task of d.tasks) {
      if (task.id !== id || task.n >= task.goal) continue;
      task.n = Math.min(task.goal, task.n + n);
      if (task.n >= task.goal) {
        g.ui.toast(t('daily.done', { task: taskLabel(task) }), 'soul');
        g.audio.sfx('levelup');
      }
    }
  }

  // Distance walked, counted in whole blocks.
  walked(dist) {
    this.walkAcc += dist;
    if (this.walkAcc >= 10) { const n = Math.floor(this.walkAcc); this.walkAcc -= n; this.note('walk', n); }
  }

  claim(i) {
    const g = this.game, d = daily(g.profile), task = d.tasks[i];
    if (!task || task.claimed || task.n < task.goal) return 0;
    task.claimed = true;
    let n = rewardFor(task);
    if (!d.bonus && d.tasks.every((x) => x.claimed)) { d.bonus = true; n += ALL_BONUS; }
    g.profile.crystals += n;
    g.profile.totalCrystals = (g.profile.totalCrystals || 0) + n;
    g.audio.sfx('crystal');
    return n;
  }

  get unclaimed() {
    const g = this.game;
    if (!g.profile) return 0;
    return daily(g.profile).tasks.filter((x) => x.n >= x.goal && !x.claimed).length;
  }
}
