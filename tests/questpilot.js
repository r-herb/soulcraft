// In-page autopilot for the Treasure Quest test. It plays with the normal
// controls (joystick move, jump, attack, use) and only reads the level
// layout to know where to go. Installed with page.evaluate(installPilot).
export function installPilot() {
  const g = window.__sc.game;
  const input = window.__sc.input;
  const LV = window.__sc.questLevels;
  const F = 40;
  const pilot = { target: null, resolve: null, reject: null, falls: 0, stuckT: 0, lastPos: null, jumpHold: 0, log: [] };
  window.__qp = pilot;

  const aimAt = (x, y, z) => {
    const e = g.player.eye;
    g.player.yaw = Math.atan2(-(x - e.x), -(z - e.z));
    g.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
  };
  const solidAt = (x, y, z) => { const id = g.world.getBlock(x, y, z); return id !== 0 && id !== 10 && id !== 29 && id !== 30; };

  setInterval(() => {
    const p = g.player;
    input.move.x = 0; input.move.z = 0; input.sprint = false;
    if (pilot.jumpHold > 0) { pilot.jumpHold--; input.jumpTouch = true; } else input.jumpTouch = false;
    const tg = pilot.target;
    if (!tg || !g.running || g.paused || p.dead) return;
    const dx = tg.x - p.pos.x, dz = tg.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < (tg.tol || 0.45) && (tg.y === undefined || Math.abs(p.pos.y - tg.y) < 1.2)) {
      pilot.target = null;
      const r = pilot.resolve; pilot.resolve = null;
      if (r) r(true);
      return;
    }
    g.player.yaw = Math.atan2(-dx, -dz);
    g.player.pitch = tg.pitch ?? 0;
    input.move.z = d > 1.2 ? 1 : tg.careful ? Math.max(0.12, d * 0.5) : Math.max(0.35, d);
    input.sprint = !!tg.sprint;
    // jump over gaps: ground ahead missing while we stand at an edge
    if (p.onGround && tg.jumpGaps) {
      const ax = p.pos.x + (dx / d) * 0.75, az = p.pos.z + (dz / d) * 0.75;
      const fy = Math.floor(p.pos.y - 0.05);
      if (!solidAt(Math.floor(ax), fy, Math.floor(az)) && !solidAt(Math.floor(ax), fy - 1, Math.floor(az))) pilot.jumpHold = 3;
    }
    // swim up and out of water unless we want to dive
    if (p.inWater && !tg.dive) pilot.jumpHold = 3;
    // climb: target higher than us and a block in front
    if (p.onGround && tg.y !== undefined && tg.y > p.pos.y + 0.5 && d < 3.2) pilot.jumpHold = 3;
    // fell off the course: the game put us back at the checkpoint
    const falls = g.meta.quest ? g.meta.quest.falls : 0;
    if (tg.retryOnFall && falls > pilot.falls) {
      pilot.falls = falls;
      pilot.target = null;
      const rj = pilot.reject; pilot.resolve = null; pilot.reject = null;
      if (rj) rj(new Error('fell'));
      return;
    }
    pilot.falls = falls;
    // stuck detection
    const moved = pilot.lastPos ? Math.hypot(p.pos.x - pilot.lastPos.x, p.pos.z - pilot.lastPos.z) : 1;
    pilot.lastPos = { x: p.pos.x, z: p.pos.z };
    pilot.stuckT = moved < 0.01 ? pilot.stuckT + 1 : 0;
    if (pilot.stuckT > 25 && p.onGround) { pilot.jumpHold = 4; pilot.stuckT = 0; pilot.stuckN = (pilot.stuckN || 0) + 1; }
    if (moved > 0.05) pilot.stuckN = 0;
    // still blocked after jumping (a wall or pillar): sidestep around it
    if (pilot.stuckN >= 2) { pilot.sideT = 18; pilot.side = Math.random() < 0.5 ? -1 : 1; pilot.stuckN = 0; }
    if (pilot.sideT > 0) { pilot.sideT--; input.move.x = pilot.side; input.move.z = 0.3; }
  }, 40);

  // Walk to a point; resolves when reached.
  pilot.go = (x, z, opts = {}) => new Promise((resolve, reject) => {
    pilot.target = { x, z, ...opts };
    const tm = setTimeout(() => { if (pilot.target && pilot.target.x === x && pilot.target.z === z) { pilot.target = null; const p = g.player.pos; const pl = g.player; reject(new Error(`pilot stuck going to ${x.toFixed(1)},${z.toFixed(1)} at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} (running=${g.running} paused=${g.paused} onGround=${pl.onGround} vel=${pl.vel.x.toFixed(2)},${pl.vel.y.toFixed(2)},${pl.vel.z.toFixed(2)} screens=${[...document.querySelectorAll('[data-screen]')].map((e) => e.dataset.screen).join('+')})`)); } }, opts.timeout || 90000);
    pilot.resolve = (v) => { clearTimeout(tm); pilot.reject = null; resolve(v); };
    pilot.reject = (e) => { clearTimeout(tm); reject(e); };
  });
  pilot.path = async (pts, opts = {}) => { for (const p of pts) await pilot.go(p[0], p[1], { ...opts, ...(p[2] || {}) }); };
  pilot.stop = () => { pilot.target = null; };
  // A jumping course: after a fall the game respawns us at the checkpoint,
  // so start the whole course again from there.
  pilot.course = async (pts, tries = 8) => {
    for (let i = 1; ; i++) {
      try { await pilot.path(pts, { retryOnFall: true }); return; } catch (e) {
        if (e.message !== 'fell') throw e;
        if (i >= tries) { const q = g.quality || {}; throw new Error(`fell ${i} times (fps ${g.fps}, quality ${q.mode} ${q.scale}, drops ${q.drops || 0})`); }
        pilot.log.push('fell, retrying the course');
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  };
  pilot.aimAt = aimAt;
  pilot.press = (k) => input.pressed.add(k);
  pilot.levels = LV;

  // BFS through a quest maze grid: world waypoints from S to a cell.
  pilot.mazePath = (L, to, from = [5, 0]) => {
    const grid = L.maze.grid, H = grid.length, W = grid[0].length;
    const start = from;
    const key = (r, c) => r + ',' + c;
    const prev = new Map([[key(...start), null]]);
    const q = [start];
    while (q.length) {
      const [r, c] = q.shift();
      if (r === to[0] && c === to[1]) break;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= H || nc >= W || grid[nr][nc] === 'W' || prev.has(key(nr, nc))) continue;
        prev.set(key(nr, nc), [r, c]);
        q.push([nr, nc]);
      }
    }
    const cells = [];
    for (let cur = to; cur; cur = prev.get(key(...cur))) cells.unshift(cur);
    return cells.map(([r, c]) => [L.ox + 6 + c * 2 + 1, -9 + r * 2 + 1]);
  };

  // Lights-out for the 4 levers: which to pull so every lamp ends up lit.
  pilot.leverPlan = () => {
    for (let m = 0; m < 16; m++) {
      const s = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) if (m & (1 << i)) for (const k of [i - 1, i, i + 1]) if (k >= 0 && k < 4) s[k] ^= 1;
      if (s.every(Boolean)) return [0, 1, 2, 3].filter((i) => m & (1 << i));
    }
    return [];
  };

  // Fight: chase the nearest quest monster (or the boss) and hit it.
  pilot.fight = (pred, maxMs = 240000) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (!g.running || g.paused || g.player.dead) return;
      const boss = g.bosses.active;
      const mobs = g.entities.list.filter((e) => e.questMob && !e.dead);
      if (pred()) { clearInterval(timer); pilot.target = null; resolve(true); return; }
      if (Date.now() - t0 > maxMs) {
        clearInterval(timer);
        const p = g.player.pos, f = (v) => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`;
        reject(new Error(`fight timeout at ${f(p)}; left: ${mobs.map((m) => `${m.type}@${f(m.pos)}`).join(' ')}`));
        return;
      }
      let tx, ty, tz;
      if (boss) { const c = boss.center(); tx = c.x; ty = c.y; tz = c.z; }
      else if (mobs.length) {
        const p = g.player.pos;
        mobs.sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
        tx = mobs[0].pos.x; ty = mobs[0].pos.y + mobs[0].h / 2; tz = mobs[0].pos.z;
      } else return;
      const d = Math.hypot(tx - g.player.pos.x, tz - g.player.pos.z);
      if (d > 2.4) pilot.target = { x: tx, z: tz, tol: 2.2 };
      else pilot.target = null;
      aimAt(tx, ty, tz);
      if (g.attackCooldown <= 0 && d < 4.5) input.pressed.add('attack');
    }, 60);
  });
  return true;
}
