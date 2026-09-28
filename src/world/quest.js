// Treasure Quest layout: a hand-designed course of 12 levels, a final boss
// arena and the treasure vault, laid out along +x in the 'quest' realm.
// Pure data shared by the generator (worker) and the QuestManager (main
// thread): block boxes plus the positions each level's logic needs.
import { B } from './blocks.js';
import { mulberry32 } from './noise.js';

export const F = 40; // floor surface y (players stand at F + 1)
export const SPACING = 64;
export const QUEST_SEED = 424242;

const boxes = []; // [x0, y0, z0, x1, y1, z1, id, gateLevel]
function box(x0, y0, z0, x1, y1, z1, id, gate = -1) {
  boxes.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), id, gate]);
}
const ox = (i) => i * SPACING;

// Perfect maze (recursive backtracker) on a 21x9 character grid; every
// character becomes 2x2 blocks. Openings: S (row 5, col 0) and E (row 3, col 20).
function makeMaze(seed) {
  const W = 21, H = 9;
  const g = Array.from({ length: H }, () => Array(W).fill('W'));
  const rnd = mulberry32(seed);
  const stack = [[1, 1]];
  g[1][1] = ' ';
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]].filter(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      return nr > 0 && nr < H - 1 && nc > 0 && nc < W - 1 && g[nr][nc] === 'W';
    });
    if (!dirs.length) { stack.pop(); continue; }
    const [dr, dc] = dirs[Math.floor(rnd() * dirs.length)];
    g[r + dr / 2][c + dc / 2] = ' ';
    g[r + dr][c + dc] = ' ';
    stack.push([r + dr, c + dc]);
  }
  g[5][0] = 'S';
  g[3][W - 1] = 'E';
  // farthest open cell from S = the map's hiding place
  const dist = new Map([[5 + ',' + 0, 0]]);
  const q = [[5, 0]];
  let far = [5, 1], best = 0;
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = r + dr, nc = c + dc, k = nr + ',' + nc;
      if (nr < 0 || nc < 0 || nr >= H || nc >= W || g[nr][nc] === 'W' || dist.has(k)) continue;
      const d = dist.get(r + ',' + c) + 1;
      dist.set(k, d);
      q.push([nr, nc]);
      if (d > best && nc < W - 1) { best = d; far = [nr, nc]; }
    }
  }
  return { grid: g, far, reachesExit: dist.has(3 + ',' + (W - 1)) };
}

// grid char (row, col) -> world block rect
const cellX = (o, c) => o + 6 + c * 2;
const cellZ = (r) => -9 + r * 2;

function buildMaze(o, maze, wallH, id, roofed) {
  box(o + 6, F - 2, -10, o + 49, F, 9, B.ruin_stone);
  maze.grid.forEach((row, r) => row.forEach((ch, c) => {
    if (ch !== 'W') return;
    const x = cellX(o, c), z = cellZ(r);
    box(x, F + 1, z, x + 1, F + wallH, z + 1, id);
  }));
  // the strip between the maze and the exit tunnel
  box(o + 48, F + 1, -10, o + 49, F + wallH, 9, id);
  box(o + 48, F + 1, -3, o + 49, F + wallH, 2, B.air);
  if (roofed) box(o + 6, F + wallH + 1, -10, o + 49, F + wallH + 1, 9, B.ruin_stone);
}

export const LEVELS = [];
function level(i, def) { LEVELS[i] = { i, ox: ox(i), spawn: { x: ox(i) + 2.5, y: F + 1.05, z: 0.5 }, ...def }; }

// ---------- shared pieces ----------
function entry(i) {
  const o = ox(i);
  box(o, F - 2, -3, o + 5, F, 3, B.ruin_stone);
  box(o + 2, F, 0, o + 2, F, 0, B.checkpoint);
}
function exitTunnel(i, open = false) {
  const o = ox(i);
  box(o + 50, F - 2, -3, o + 63, F, 3, B.ruin_stone);
  box(o + 50, F + 1, -3, o + 63, F + 4, -3, B.ruin_stone);
  box(o + 50, F + 1, 3, o + 63, F + 4, 3, B.ruin_stone);
  box(o + 50, F + 5, -3, o + 63, F + 5, 3, B.ruin_stone);
  box(o + 51, F + 4, 0, o + 51, F + 4, 0, B.lamp_on);
  if (!open) box(o + 52, F + 1, -2, o + 52, F + 4, 2, B.quest_gate, i);
}
function walls(o, z0, z1, h = 4, x0 = o + 6, x1 = o + 49) {
  box(x0, F + 1, z0, x1, F + h, z0, B.ruin_stone);
  box(x0, F + 1, z1, x1, F + h, z1, B.ruin_stone);
  box(x0, F + 1, z0, x0, F + h, z1, B.ruin_stone);
  box(x1, F + 1, z0, x1, F + h, z1, B.ruin_stone);
  // doorways in and out along z = -2..2
  box(x0, F + 1, -2, x0, F + h, 2, B.air);
  box(x1, F + 1, -2, x1, F + h, 2, B.air);
}

// ---------- level 0: camp ----------
level(0, { kind: 'camp', spawn: { x: 0.5, y: F + 1.05, z: 0.5 } });
box(-8, F - 2, -8, 5, F, 8, B.ruin_stone);
box(-8, F, -8, 5, F, 8, B.grass);
box(-1, F + 1, 3, -1, F + 1, 3, B.ember_lamp);
box(-6, F + 1, -6, -6, F + 3, -6, B.log); box(-6, F + 4, -6, -6, F + 4, -6, B.torch);
box(-6, F + 1, 6, -6, F + 3, 6, B.log); box(-6, F + 4, 6, -6, F + 4, 6, B.torch);
box(-4, F + 1, -5, -2, F + 2, -3, B.wool);
box(6, F - 2, -2, 49, F, 2, B.ruin_stone); // path to the ruins
for (let x = 10; x < 50; x += 8) { box(x, F + 1, -2, x, F + 2, -2, B.log); box(x, F + 3, -2, x, F + 3, -2, B.torch); }
exitTunnel(0, true);

// ---------- level 1: map ruins (maze) ----------
const ruins = makeMaze(QUEST_SEED + 1);
level(1, { kind: 'map', mapAt: { x: cellX(ox(1), ruins.far[1]) + 1, y: F + 2.2, z: cellZ(ruins.far[0]) + 1 }, maze: ruins });
entry(1);
buildMaze(ox(1), ruins, 3, B.ruin_stone, false);
box(cellX(ox(1), ruins.far[1]), F + 1, cellZ(ruins.far[0]), cellX(ox(1), ruins.far[1]) + 1, F + 1, cellZ(ruins.far[0]) + 1, B.gold_brick);
exitTunnel(1);

// ---------- level 2: sky steps (parkour) ----------
{
  const o = ox(2);
  const stones = [];
  let x = o + 6, zc = 0, y = F;
  // gap, z shift, height change, size
  const steps = [[2, 0, 0, 3], [1, 0, 1, 3], [2, 2, 0, 2], [2, -2, 0, 2], [1, 0, 1, 2], [2, 0, 0, 2], [2, 2, -1, 2], [2, -2, 0, 2], [2, 0, -1, 2], [2, 0, 0, 2]];
  for (const [gap, dz, dy, size] of steps) {
    x += gap; zc += dz; y += dy;
    const z0 = zc - Math.floor(size / 2);
    stones.push({ x0: x, x1: x + size - 1, z0, z1: z0 + size - 1, y });
    x += size;
  }
  level(2, { kind: 'reach', reachX: o + 47, stones, voidY: F - 12 });
  entry(2);
  for (const s of stones) box(s.x0, s.y - 2, s.z0, s.x1, s.y, s.z1, B.ruin_stone);
  box(o + 48, F - 2, -3, o + 49, F, 3, B.ruin_stone);
  exitTunnel(2);
}

// ---------- level 3: arrow hall (dodge) ----------
{
  const o = ox(3);
  const traps = [];
  let k = 0;
  for (let x = o + 11; x <= o + 45; x += 5, k++) {
    const side = k % 2 ? 3 : -3;
    const y = F + 1 + (k % 3 === 2 ? 1 : 0);
    traps.push({ x, y, z: side, dir: -Math.sign(side), phase: (k * 0.55) % 2.2 });
  }
  level(3, { kind: 'reach', reachX: o + 47, traps });
  entry(3);
  box(o + 6, F - 2, -3, o + 49, F, 3, B.ruin_stone);
  box(o + 6, F + 1, -3, o + 49, F + 4, -3, B.ruin_stone);
  box(o + 6, F + 1, 3, o + 49, F + 4, 3, B.ruin_stone);
  for (const t of traps) box(t.x, t.y, t.z, t.x, t.y, t.z, B.trap);
  for (let x = o + 8; x < o + 49; x += 6) box(x, F + 4, 3, x, F + 4, 3, B.lamp_on);
  exitTunnel(3);
}

// ---------- level 4: monster den ----------
{
  const o = ox(4);
  level(4, {
    kind: 'den', enterX: o + 10,
    entryGate: [o + 6, F + 1, -2, o + 6, F + 4, 2],
    spawns: [['hollow', o + 38, -6], ['hollow', o + 40, 6], ['hollow', o + 44, 0], ['skitter', o + 34, 4], ['skitter', o + 34, -4], ['gloomshot', o + 46, -8]],
  });
  entry(4);
  box(o + 6, F - 2, -10, o + 49, F, 10, B.ruin_stone);
  walls(o, -10, 10, 5);
  for (const [px, pz] of [[o + 18, -5], [o + 18, 5], [o + 30, -5], [o + 30, 5]]) box(px, F + 1, pz, px + 1, F + 3, pz + 1, B.ruin_stone);
  for (let x = o + 10; x < o + 49; x += 8) { box(x, F + 5, -10, x, F + 5, -10, B.lamp_on); box(x, F + 5, 10, x, F + 5, 10, B.lamp_on); }
  exitTunnel(4);
}

// ---------- level 5: lever riddle ----------
{
  const o = ox(5);
  const levers = [o + 21, o + 25, o + 29, o + 33].map((x) => ({ x, y: F + 1, z: -5 }));
  const lamps = levers.map((l) => ({ x: l.x, y: F + 3, z: -8 }));
  level(5, { kind: 'levers', levers, lamps });
  entry(5);
  box(o + 6, F - 2, -8, o + 49, F, 8, B.ruin_stone);
  walls(o, -8, 8, 5);
  for (const l of levers) box(l.x, l.y, l.z, l.x, l.y, l.z, B.lever_off);
  for (const l of lamps) box(l.x, l.y, l.z, l.x, l.y, l.z, B.lamp_off);
  exitTunnel(5);
}

// ---------- level 6: crumbling bridge over magma ----------
{
  const o = ox(6);
  const crumbles = [];
  const segs = [[o + 6, o + 13, 'c'], [o + 14, o + 16, 's'], [o + 17, o + 23, 'c'], [o + 26, o + 32, 'c'], [o + 33, o + 35, 's'], [o + 36, o + 46, 'c']];
  level(6, { kind: 'reach', reachX: o + 47, crumbles, magmaY: F - 3 });
  entry(6);
  box(o + 6, F - 5, -6, o + 49, F - 4, 6, B.ruin_stone);
  box(o + 6, F - 3, -6, o + 49, F - 3, 6, B.magma);
  for (const [a, b, t] of segs) {
    if (t === 's') box(a, F - 3, -1, b, F, 1, B.ruin_stone);
    else for (let x = a; x <= b; x++) for (let z = 0; z <= 1; z++) { box(x, F, z, x, F, z, B.crumble); crumbles.push({ x, y: F, z }); }
  }
  box(o + 47, F - 3, -3, o + 49, F, 3, B.ruin_stone);
  exitTunnel(6);
}

// ---------- level 7: key grove ----------
{
  const o = ox(7);
  const keys = [{ x: o + 14.5, y: F + 1.3, z: 9.5 }, { x: o + 33.5, y: F - 0.7, z: 8.5 }, { x: o + 41.5, y: F + 5.3, z: -7.5 }];
  level(7, { kind: 'keys', keys });
  entry(7);
  box(o + 6, F - 3, -12, o + 49, F - 1, 12, B.dirt);
  box(o + 6, F, -12, o + 49, F, 12, B.grass);
  // hedge border and inner hedges
  box(o + 6, F + 1, -12, o + 49, F + 3, -12, B.leaves); box(o + 6, F + 1, 12, o + 49, F + 3, 12, B.leaves);
  box(o + 6, F + 1, -12, o + 6, F + 3, 12, B.leaves); box(o + 49, F + 1, -12, o + 49, F + 3, 12, B.leaves);
  box(o + 6, F + 1, -2, o + 6, F + 3, 2, B.air); box(o + 49, F + 1, -2, o + 49, F + 3, 2, B.air);
  box(o + 10, F + 1, 4, o + 22, F + 2, 4, B.leaves); box(o + 18, F + 1, 4, o + 18, F + 2, 11, B.leaves);
  box(o + 11, F + 1, 6, o + 11, F + 2, 11, B.leaves);
  box(o + 24, F + 1, -11, o + 24, F + 2, -3, B.leaves); box(o + 12, F + 1, -6, o + 23, F + 2, -6, B.leaves);
  // pond with a key at the bottom
  box(o + 29, F - 2, 5, o + 37, F, 11, B.sand);
  box(o + 30, F - 1, 6, o + 36, F, 10, B.water);
  // tower with a stair on its side
  box(o + 40, F + 1, -9, o + 42, F + 4, -7, B.ruin_stone);
  for (let s = 0; s < 4; s++) box(o + 36 + s, F + 1, -6, o + 36 + s, F + 1 + s, -6, B.ruin_stone);
  box(o + 39, F + 1, -7, o + 39, F + 4, -7, B.ruin_stone);
  // trees and flowers
  for (const [tx, tz] of [[o + 28, -9], [o + 45, 7], [o + 15, -9]]) {
    box(tx, F + 1, tz, tx, F + 4, tz, B.log);
    box(tx - 2, F + 4, tz - 2, tx + 2, F + 5, tz + 2, B.leaves); box(tx, F + 4, tz, tx, F + 4, tz, B.log);
  }
  for (let x = o + 8; x < o + 48; x += 3) if (x < o + 29 || x > o + 37) box(x, F + 1, ((x * 7) % 19) - 9, x, F + 1, ((x * 7) % 19) - 9, B.glowbell);
  exitTunnel(7);
}

// ---------- level 8: memory tiles ----------
{
  const o = ox(8);
  const tiles = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) tiles.push({ x0: o + 23 + i * 3, z0: -4 + j * 3 });
  level(8, { kind: 'memory', tiles, startX: o + 14 });
  entry(8);
  box(o + 6, F - 2, -8, o + 49, F, 8, B.ruin_stone);
  walls(o, -8, 8, 5);
  for (const t of tiles) box(t.x0, F, t.z0, t.x0 + 1, F, t.z0 + 1, B.tile_off);
  for (let x = o + 10; x < o + 49; x += 8) box(x, F + 5, -8, x, F + 5, -8, B.lamp_on);
  exitTunnel(8);
}

// ---------- level 9: shadow maze ----------
{
  const o = ox(9);
  const shadow = makeMaze(QUEST_SEED + 9);
  const patrols = [];
  const open = [];
  shadow.grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === ' ' && c > 4 && r % 2 === 1 && c % 2 === 1) open.push([r, c]); }));
  for (let k = 0; k < 3; k++) {
    const [r, c] = open[Math.floor((k + 1) * open.length / 4)];
    patrols.push({ x: cellX(o, c) + 1, z: cellZ(r) + 1, type: k === 1 ? 'skitter' : 'hollow' });
  }
  level(9, { kind: 'reach', reachX: o + 47, maze: shadow, patrols });
  entry(9);
  buildMaze(o, shadow, 3, B.duskstone, true);
  // a few dim lamps in the roof
  shadow.grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === ' ' && (r * 7 + c * 3) % 11 === 0) box(cellX(o, c), F + 4, cellZ(r), cellX(o, c), F + 4, cellZ(r), B.soul_ore); }));
  exitTunnel(9);
}

// ---------- level 10: jump pads ----------
{
  const o = ox(10);
  const pads = [{ x: o + 8, z: 0 }, { x: o + 21, z: 0 }, { x: o + 34, z: 0 }];
  level(10, { kind: 'reach', reachX: o + 47, pads, launch: { x: 8.5, y: 13.5, z: 0 } });
  entry(10);
  box(o + 6, F - 2, -2, o + 9, F, 2, B.ruin_stone);
  box(o + 15, F - 2, -3, o + 22, F, 3, B.ruin_stone);
  box(o + 28, F - 2, -3, o + 35, F, 3, B.ruin_stone);
  box(o + 41, F - 2, -3, o + 49, F, 3, B.ruin_stone);
  for (const p of pads) box(p.x, F, p.z - 1, p.x, F, p.z + 1, B.jump_pad);
  exitTunnel(10);
}

// ---------- level 11: builder's gap ----------
{
  const o = ox(11);
  level(11, { kind: 'build', reachX: o + 35, buildZone: { x0: o + 21, x1: o + 33, y0: F - 3, y1: F + 3, z0: -4, z1: 4 }, planks: 24 });
  entry(11);
  box(o + 6, F - 2, -3, o + 20, F, 3, B.ruin_stone);
  box(o + 34, F - 2, -3, o + 49, F, 3, B.ruin_stone);
  box(o + 20, F + 1, -3, o + 20, F + 2, -3, B.log); box(o + 20, F + 3, -3, o + 20, F + 3, -3, B.torch);
  box(o + 34, F + 1, 3, o + 34, F + 2, 3, B.log); box(o + 34, F + 3, 3, o + 34, F + 3, 3, B.torch);
  exitTunnel(11);
}

// ---------- level 12: the Hoard Golem ----------
{
  const o = ox(12);
  const cx = o + 28, r = 16;
  level(12, { kind: 'boss', arena: { x: cx, y: F, z: 0, r, dim: 'quest' }, entryGate: [o + 11, F + 1, -2, o + 11, F + 4, 2] });
  entry(12);
  box(o + 6, F - 2, -2, o + 12, F, 2, B.ruin_stone);
  for (let x = cx - r - 1; x <= cx + r + 1; x++) for (let z = -r - 1; z <= r + 1; z++) {
    const d = Math.hypot(x - cx, z);
    if (d <= r + 0.5) box(x, F - 2, z, x, F, z, Math.floor(d) % 5 === 0 ? B.gold_brick : B.ruin_stone);
    else if (d <= r + 1.5) box(x, F - 2, z, x, F + 5, z, B.ruin_stone);
  }
  box(o + 11, F + 1, -2, o + 12, F + 4, 2, B.air); // entrance
  box(o + 44, F + 1, -2, o + 49, F + 4, 2, B.air); // exit
  box(o + 44, F - 2, -2, o + 49, F, 2, B.ruin_stone);
  exitTunnel(12);
}

// ---------- level 13: the treasure vault ----------
{
  const o = ox(13);
  level(13, { kind: 'vault', chest: { x: o + 12, y: F + 1, z: 0 } });
  entry(13);
  box(o + 6, F - 2, -7, o + 19, F, 7, B.gold_brick);
  box(o + 6, F + 1, -7, o + 19, F + 6, -7, B.gold_brick); box(o + 6, F + 1, 7, o + 19, F + 6, 7, B.gold_brick);
  box(o + 19, F + 1, -7, o + 19, F + 6, 7, B.gold_brick); box(o + 6, F + 7, -7, o + 19, F + 7, 7, B.gold_brick);
  box(o + 6, F + 1, -6, o + 6, F + 6, 6, B.gold_brick); box(o + 6, F + 1, -2, o + 6, F + 4, 2, B.air);
  box(o + 12, F + 1, 0, o + 12, F + 1, 0, B.treasure_chest);
  for (const [x, z] of [[o + 9, -5], [o + 15, -5], [o + 9, 5], [o + 15, 5]]) { box(x, F + 1, z, x + 1, F + 2, z, B.gold_block); box(x, F + 6, z, x, F + 6, z, B.lamp_on); }
  box(o + 12, F + 6, 0, o + 12, F + 6, 0, B.soul_block);
}

// =================== Chapter 2: the Frozen Spire ===================
// Behind the vault a door opens once the first treasure is claimed, and a
// snowy path leads on to eight more levels, a new guardian and a vault.
export const CH2_FIRST = 14, CH2_LAST = 21, CH2_VAULT = 22;
{
  const o = ox(13);
  box(o + 19, F + 1, -2, o + 19, F + 4, 2, B.quest_gate, 13); // the vault's back door
  box(o + 20, F - 2, -2, o + 49, F, 2, B.frost_brick);
  box(o + 20, F, -2, o + 49, F, 2, B.snow);
  for (let x = o + 24; x < o + 50; x += 8) { box(x, F + 1, -3, x, F + 2, -3, B.frost_brick); box(x, F + 3, -3, x, F + 3, -3, B.glow_crystal); }
  exitTunnel(13, true);
}

// ---------- level 14: ice slide ----------
{
  const o = ox(14);
  const gaps = [[o + 17, o + 18], [o + 28, o + 29], [o + 39, o + 40]];
  level(14, { kind: 'reach', reachX: o + 47, gaps });
  entry(14);
  let x = o + 6;
  for (const [g0, g1] of [...gaps, [o + 50, o + 50]]) {
    box(x, F - 2, -2, g0 - 1, F - 1, 2, B.frost_brick);
    box(x, F, -2, g0 - 1, F, 2, B.ice);
    box(x, F + 1, -3, g0 - 1, F + 1, -3, B.frost_brick); box(x, F + 1, 3, g0 - 1, F + 1, 3, B.frost_brick);
    x = g1 + 1;
  }
  exitTunnel(14);
}

// ---------- level 15: blink bridge ----------
{
  const o = ox(15);
  const anchors = [[o + 6, o + 9], [o + 13, o + 14], [o + 19, o + 20], [o + 25, o + 26], [o + 32, o + 33], [o + 39, o + 40], [o + 47, o + 49]];
  const pads = [[o + 10, o + 12], [o + 15, o + 18], [o + 21, o + 24], [o + 27, o + 31], [o + 34, o + 38], [o + 41, o + 46]];
  const phases = [0, 1.3, 2.6, 0.7, 2.0, 3.3];
  const blinks = pads.map(([x0, x1], k) => ({ x0, x1, z0: -1, z1: 1, phase: phases[k] }));
  level(15, { kind: 'reach', reachX: o + 47, blinks, blinkPeriod: 4, blinkOn: 2.6 });
  entry(15);
  for (const [a, b] of anchors) box(a, F - 1, -1, b, F, 1, B.frost_brick);
  for (const bl of blinks) box(bl.x0, F, bl.z0, bl.x1, F, bl.z1, B.blink_on);
  for (const [a] of anchors.slice(1, -1)) box(a, F + 1, 1, a, F + 1, 1, B.glow_crystal);
  exitTunnel(15);
}

// ---------- level 16: updraft tower ----------
{
  const o = ox(16);
  const vents = [{ x0: o + 16, x1: o + 17, z0: -1, z1: 1, top: F + 14 }, { x0: o + 31, x1: o + 32, z0: -1, z1: 1, top: F + 20 }];
  level(16, { kind: 'reach', reachX: o + 47, vents });
  entry(16);
  box(o + 6, F - 2, -3, o + 49, F, 3, B.frost_brick);
  box(o + 6, F + 1, -4, o + 49, F + 22, -4, B.frost_brick);
  box(o + 6, F + 1, 4, o + 49, F + 22, 4, B.frost_brick);
  // two walls to fly over, each with a pool to land in behind it
  box(o + 18, F + 1, -3, o + 19, F + 10, 3, B.frost_brick);
  box(o + 20, F - 3, -3, o + 25, F, 3, B.water);
  box(o + 33, F + 1, -3, o + 34, F + 16, 3, B.frost_brick);
  box(o + 35, F - 3, -3, o + 40, F, 3, B.water);
  for (const v of vents) box(v.x0, F, v.z0, v.x1, F, v.z1, B.vent);
  for (let y = F + 4; y < F + 22; y += 6) { box(o + 10, y, -4, o + 10, y, -4, B.glow_crystal); box(o + 26, y, 4, o + 26, y, 4, B.glow_crystal); }
  box(o + 6, F + 1, -2, o + 6, F + 4, 2, B.air);
  box(o + 49, F + 1, -2, o + 49, F + 4, 2, B.air);
  exitTunnel(16);
}

// ---------- level 17: frost plates ----------
{
  const o = ox(17);
  const plates = [{ x: o + 10, z: -8 }, { x: o + 10, z: 8 }, { x: o + 44, z: 8 }, { x: o + 44, z: -8 }];
  level(17, { kind: 'plates', plates, plateTime: 20 });
  entry(17);
  box(o + 6, F - 2, -10, o + 49, F, 10, B.frost_brick);
  box(o + 6, F, -10, o + 49, F, 10, B.snow);
  walls(o, -10, 10, 5);
  for (let x = o + 6; x <= o + 49; x++) for (const z of [-10, 10]) if (x % 6 === 0) box(x, F + 5, z, x, F + 5, z, B.glow_crystal);
  // low walls to run around
  box(o + 16, F + 1, -10, o + 16, F + 2, -3, B.frost_brick); box(o + 16, F + 1, 3, o + 16, F + 2, 10, B.frost_brick);
  box(o + 27, F + 1, -6, o + 28, F + 2, 6, B.frost_brick);
  box(o + 38, F + 1, -10, o + 38, F + 2, -3, B.frost_brick); box(o + 38, F + 1, 3, o + 38, F + 2, 10, B.frost_brick);
  for (const pl of plates) box(pl.x, F, pl.z, pl.x, F, pl.z, B.plate_off);
  exitTunnel(17);
}

// ---------- level 18: frost jets ----------
{
  const o = ox(18);
  const rows = [o + 12, o + 18, o + 24, o + 30, o + 36, o + 42].map((x, k) => ({ x, phase: k * 0.5 }));
  level(18, { kind: 'reach', reachX: o + 47, jets: rows, jetPeriod: 3, z0: -3, z1: 3 });
  entry(18);
  box(o + 6, F - 2, -3, o + 49, F, 3, B.frost_brick);
  box(o + 6, F + 1, -4, o + 49, F + 4, -4, B.frost_brick);
  box(o + 6, F + 1, 4, o + 49, F + 4, 4, B.frost_brick);
  for (const r of rows) box(r.x, F, -3, r.x, F, 3, B.jet);
  for (let x = o + 9; x < o + 49; x += 6) box(x, F + 4, 4, x, F + 4, 4, B.lamp_on);
  exitTunnel(18);
}

// ---------- level 19: orb race ----------
{
  const o = ox(19);
  const orbs = [
    { x: o + 14.5, y: F + 1.4, z: -8.5 }, { x: o + 20.5, y: F + 4.4, z: 7.5 }, { x: o + 28.5, y: F + 1.4, z: 0.5 },
    { x: o + 34.5, y: F + 5.4, z: -7.5 }, { x: o + 41.5, y: F + 1.4, z: 9.5 }, { x: o + 45.5, y: F + 1.4, z: -2.5 },
  ];
  level(19, { kind: 'orbs', orbs, raceTime: 75, startX: o + 8 });
  entry(19);
  box(o + 6, F - 2, -12, o + 49, F, 12, B.frost_brick);
  box(o + 6, F, -12, o + 49, F, 12, B.snow);
  walls(o, -12, 12, 4);
  box(o + 24, F, -3, o + 32, F, 3, B.ice); // a slippery patch in the middle
  // a pillar with steps (orb 2) and a taller one (orb 4)
  box(o + 20, F + 1, 7, o + 21, F + 3, 8, B.frost_brick);
  for (let s = 0; s < 3; s++) box(o + 17 + s, F + 1, 7, o + 17 + s, F + 1 + s, 7, B.frost_brick);
  box(o + 34, F + 1, -8, o + 35, F + 4, -7, B.frost_brick);
  for (let s = 0; s < 4; s++) box(o + 30 + s, F + 1, -7, o + 30 + s, F + 1 + s, -7, B.frost_brick);
  for (const [tx, tz] of [[o + 12, 6], [o + 40, -5], [o + 26, 10]]) { box(tx, F + 1, tz, tx, F + 5, tz, B.log); box(tx - 1, F + 4, tz - 1, tx + 1, F + 7, tz + 1, B.pine_leaves); box(tx, F + 4, tz, tx, F + 6, tz, B.log); }
  exitTunnel(19);
}

// ---------- level 20: frost den ----------
{
  const o = ox(20);
  level(20, {
    kind: 'den', enterX: o + 10,
    entryGate: [o + 6, F + 1, -2, o + 6, F + 4, 2],
    spawns: [['frostSpirit', o + 36, -6], ['frostSpirit', o + 40, 6], ['frostSpirit', o + 44, 0], ['hollow', o + 38, 0], ['skitter', o + 34, 3], ['skitter', o + 34, -3]],
  });
  entry(20);
  box(o + 6, F - 2, -10, o + 49, F, 10, B.frost_brick);
  box(o + 6, F, -10, o + 49, F, 10, B.snow);
  walls(o, -10, 10, 5);
  // ice columns flush with the walls: no corners for monsters to get stuck in
  for (const [px, pz] of [[o + 18, -9], [o + 18, 8], [o + 30, -9], [o + 30, 8]]) box(px, F + 1, pz, px + 1, F + 3, pz + 1, B.ice);
  for (let x = o + 10; x < o + 49; x += 8) { box(x, F + 5, -10, x, F + 5, -10, B.glow_crystal); box(x, F + 5, 10, x, F + 5, 10, B.glow_crystal); }
  exitTunnel(20);
}

// ---------- level 21: the Frost Warden ----------
{
  const o = ox(21);
  const cx = o + 28, r = 16;
  level(21, { kind: 'boss', boss: 'frostWarden', arena: { x: cx, y: F, z: 0, r, dim: 'quest' }, entryGate: [o + 11, F + 1, -2, o + 11, F + 4, 2] });
  entry(21);
  box(o + 6, F - 2, -2, o + 12, F, 2, B.frost_brick);
  for (let x = cx - r - 1; x <= cx + r + 1; x++) for (let z = -r - 1; z <= r + 1; z++) {
    const d = Math.hypot(x - cx, z);
    if (d <= r + 0.5) box(x, F - 2, z, x, F, z, Math.floor(d) % 5 === 0 ? B.ice : B.frost_brick);
    else if (d <= r + 1.5) { box(x, F - 2, z, x, F + 5, z, B.frost_brick); if ((x + z) % 7 === 0) box(x, F + 6, z, x, F + 6, z, B.glow_crystal); }
  }
  box(o + 11, F + 1, -2, o + 12, F + 4, 2, B.air); // entrance
  box(o + 44, F + 1, -2, o + 49, F + 4, 2, B.air); // exit
  box(o + 44, F - 2, -2, o + 49, F, 2, B.frost_brick);
  exitTunnel(21);
}

// ---------- level 22: the crystal vault ----------
{
  const o = ox(22);
  level(22, { kind: 'vault', chest: { x: o + 12, y: F + 1, z: 0 } });
  entry(22);
  box(o + 6, F - 2, -7, o + 19, F, 7, B.frost_brick);
  box(o + 6, F + 1, -7, o + 19, F + 6, -7, B.frost_brick); box(o + 6, F + 1, 7, o + 19, F + 6, 7, B.frost_brick);
  box(o + 19, F + 1, -7, o + 19, F + 6, 7, B.frost_brick); box(o + 6, F + 7, -7, o + 19, F + 7, 7, B.soul_glass);
  box(o + 6, F + 1, -6, o + 6, F + 6, 6, B.frost_brick); box(o + 6, F + 1, -2, o + 6, F + 4, 2, B.air);
  box(o + 12, F + 1, 0, o + 12, F + 1, 0, B.treasure_chest);
  for (const [x, z] of [[o + 9, -5], [o + 15, -5], [o + 9, 5], [o + 15, 5]]) { box(x, F + 1, z, x, F + 1, z, B.soul_block); box(x, F + 2, z, x, F + 2, z, B.glow_crystal); }
}

export const LEVEL_COUNT = 12; // playable levels before the vault (1..12)
export const CH2_COUNT = CH2_LAST - CH2_FIRST + 1; // 8
export const QUEST_BOXES = boxes;
export const QUEST_SPAWN = LEVELS[0].spawn;

// Which level's area contains world x (by the level spacing)
export function levelAt(x) { return Math.max(0, Math.min(LEVELS.length - 1, Math.floor(x / SPACING))); }
