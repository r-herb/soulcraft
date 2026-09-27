// Chunk generation for all four realms. Runs inside the mesh worker.
import { CHUNK, HEIGHT, SEA, B } from './blocks.js';
import { Layout, CHAMBER, ARENAS } from './structures.js';
import { Noise, hash3 } from './noise.js';
import { QUEST_BOXES } from './quest.js';

const S = CHUNK;
const idx = (x, y, z) => x + z * S + y * S * S;

const noiseCache = new Map();
function noises(seed) {
  let n = noiseCache.get(seed);
  if (!n) {
    n = { a: new Noise(seed + 101), b: new Noise(seed + 202), c: new Noise(seed + 303) };
    noiseCache.set(seed, n);
  }
  return n;
}

// Trilinear-interpolated 3D noise sampled every 4 blocks - caves and islands
// do not need per-block precision and this is ~16x cheaper.
function sampleGrid(noise, ox, oz, fx, fy, fz, offset = 0) {
  const nx = S / 4 + 1, ny = HEIGHT / 4 + 1;
  const g = new Float32Array(nx * nx * ny);
  for (let y = 0; y < ny; y++) for (let z = 0; z < nx; z++) for (let x = 0; x < nx; x++) {
    g[x + z * nx + y * nx * nx] = noise.noise3((ox + x * 4) / fx + offset, (y * 4) / fy, (oz + z * 4) / fz);
  }
  return (x, y, z) => {
    const gx = x / 4, gy = y / 4, gz = z / 4;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), z0 = Math.floor(gz);
    const tx = gx - x0, ty = gy - y0, tz = gz - z0;
    const x1 = Math.min(x0 + 1, nx - 1), y1 = Math.min(y0 + 1, ny - 1), z1 = Math.min(z0 + 1, nx - 1);
    const at = (a, b, c) => g[a + c * nx + b * nx * nx];
    const c00 = at(x0, y0, z0) * (1 - tx) + at(x1, y0, z0) * tx;
    const c10 = at(x0, y1, z0) * (1 - tx) + at(x1, y1, z0) * tx;
    const c01 = at(x0, y0, z1) * (1 - tx) + at(x1, y0, z1) * tx;
    const c11 = at(x0, y1, z1) * (1 - tx) + at(x1, y1, z1) * tx;
    const c0 = c00 * (1 - ty) + c10 * ty, c1 = c01 * (1 - ty) + c11 * ty;
    return c0 * (1 - tz) + c1 * tz;
  };
}

function oreAt(seed, x, y, z, stoneId) {
  // Ore blobs: each 6x6x6 cell may hold one blob of one ore type.
  const cx = Math.floor(x / 6), cy = Math.floor(y / 6), cz = Math.floor(z / 6);
  const h = hash3(seed, cx, cy, cz);
  let type = 0, r = 1.3;
  if (stoneId === B.duskstone) {
    if (h < 0.1) { type = B.dusk_soul_ore; r = 1.2; }
    else if (h < 0.22) { type = B.gold_ore; r = 1.2; }
    else if (h < 0.4) { type = B.iron_ore; r = 1.4; }
  } else {
    if (h < 0.04 && y < 40) { type = B.soul_ore; r = 1.1; }
    else if (h < 0.1 && y < 34) { type = B.gold_ore; r = 1.1; }
    else if (h < 0.26 && y < 60) { type = B.iron_ore; r = 1.4; }
    else if (h < 0.48) { type = B.char_ore; r = 1.6; }
  }
  if (!type) return 0;
  const px = cx * 6 + 1 + hash3(seed, cx, cy, cz + 9) * 4;
  const py = cy * 6 + 1 + hash3(seed, cx, cy + 9, cz) * 4;
  const pz = cz * 6 + 1 + hash3(seed, cx + 9, cy, cz) * 4;
  const d = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2 + (z + 0.5 - pz) ** 2;
  return d < r * r + hash3(seed, x, y, z) * 0.9 ? type : 0;
}

export function generateChunk(seed, dim, cx, cz, extra) {
  const data = new Uint8Array(S * S * HEIGHT);
  if (dim === 'quest') genQuest(cx, cz, data, extra);
  else if (dim === 'emberdeep') genEmberdeep(seed, cx, cz, data);
  else if (dim === 'void') genVoid(seed, cx, cz, data);
  else if (dim === 'soul') genSoul(seed, cx, cz, data);
  else genOverworld(seed, cx, cz, data);
  return data;
}

function genOverworld(seed, cx, cz, data) {
  const L = Layout.get(seed);
  const N = noises(seed);
  const ox = cx * S, oz = cz * S;
  const cave1 = sampleGrid(N.a, ox, oz, 38, 22, 38);
  const cave2 = sampleGrid(N.b, ox, oz, 38, 22, 38, 50);
  const cavern = sampleGrid(N.c, ox, oz, 70, 26, 70);
  const heights = new Int16Array(S * S);
  const inChamberX = (wx) => wx >= CHAMBER.x + CHAMBER.x0 - 2 && wx <= CHAMBER.x + CHAMBER.x1 + 2;
  const inChamberZ = (wz) => wz >= CHAMBER.z + CHAMBER.z0 - 2 && wz <= CHAMBER.z + CHAMBER.z1 + 2;

  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const wx = ox + x, wz = oz + z;
    const h = L.height(wx, wz);
    heights[x + z * S] = h;
    const village = L.villageNear(wx, wz);
    const snowy = h > 74;
    const beach = h <= SEA + 1;
    const nearChamber = Math.abs(wx - CHAMBER.x) < 40 && Math.abs(wz - CHAMBER.z) < 40;
    for (let y = 0; y <= Math.max(h, SEA); y++) {
      let id;
      if (y === 0) id = B.coreite;
      else if (y > h) id = B.water;
      else if (y === h) id = beach ? B.sand : snowy ? B.snow : B.grass;
      else if (y > h - 4) id = beach ? B.sand : B.dirt;
      else if (y < 16 + ((hash3(seed, wx, 3, wz) * 3) | 0)) id = B.duskstone;
      else id = B.stone;
      if ((id === B.stone || id === B.duskstone) && y > 1) {
        const ore = oreAt(seed, wx, y, wz, id);
        if (ore) id = ore;
      }
      // caves
      if (y > 1 && y <= h && !village && !nearChamber && id !== B.water) {
        const underSea = h < SEA + 3 && y > h - 5;
        if (!underSea) {
          const a = cave1(x, y, z), b = cave2(x, y, z);
          const worm = a * a + b * b < 0.012 * (y < h - 6 ? 1.6 : 0.8);
          const big = y < 34 && cavern(x, y, z) > 0.5;
          if (worm || big) id = y < 8 ? B.magma : B.air;
        }
      }
      data[idx(x, y, z)] = id;
    }
    if (village) carveVillageColumn(L, village, wx, wz, x, z, h, data);
    if (inChamberX(wx) && inChamberZ(wz)) carveChamberColumn(wx, wz, x, z, data);
    carveChamberStairs(wx, wz, x, z, h, data);
  }
  // Trees and plants, which may spill in from neighbour columns.
  for (let z = -3; z < S + 3; z++) for (let x = -3; x < S + 3; x++) {
    const wx = ox + x, wz = oz + z;
    const r = hash3(seed, wx, 1, wz);
    if (r > 0.014) {
      if (x >= 0 && z >= 0 && x < S && z < S) {
        const h = heights[x + z * S];
        if (data[idx(x, h, z)] === B.grass && data[idx(x, h + 1, z)] === B.air) {
          const p = hash3(seed, wx, 2, wz);
          if (p < 0.08) data[idx(x, h + 1, z)] = B.tallgrass;
          else if (p < 0.095) data[idx(x, h + 1, z)] = B.glowbell;
        }
      }
      continue;
    }
    const h = x >= 0 && z >= 0 && x < S && z < S ? heights[x + z * S] : L.height(wx, wz);
    if (h <= SEA + 1 || h > 80) continue;
    if (L.villageNear(wx, wz)) continue;
    if (Math.abs(wx - CHAMBER.x) < 44 && Math.abs(wz - CHAMBER.z) < 70) continue;
    const th = 4 + Math.floor(hash3(seed, wx, 5, wz) * 3);
    for (let ly = -2; ly <= 1; ly++) {
      const rad = ly >= 0 ? 1 : 2;
      for (let lz = -rad; lz <= rad; lz++) for (let lx = -rad; lx <= rad; lx++) {
        if (Math.abs(lx) === rad && Math.abs(lz) === rad && (ly === 1 || hash3(seed, wx + lx, ly, wz + lz) < 0.5)) continue;
        const px = x + lx, pz = z + lz, py = h + th + ly;
        if (px < 0 || pz < 0 || px >= S || pz >= S || py >= HEIGHT) continue;
        const i = idx(px, py, pz);
        if (data[i] === B.air || data[i] === B.tallgrass) data[i] = B.leaves;
      }
    }
    if (x >= 0 && z >= 0 && x < S && z < S) {
      if (data[idx(x, h, z)] !== B.grass) continue;
      data[idx(x, h, z)] = B.dirt;
      for (let t = 1; t <= th; t++) data[idx(x, h + t, z)] = B.log;
    }
  }
}

function carveVillageColumn(L, v, wx, wz, x, z, h, data) {
  // Well
  const dx = wx - v.x, dz = wz - v.z;
  if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) {
    const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
    for (let y = v.y - 3; y <= v.y + 4; y++) data[idx(x, y, z)] = B.air;
    if (edge) {
      data[idx(x, v.y, z)] = B.brick; data[idx(x, v.y + 1, z)] = B.brick;
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) { data[idx(x, v.y + 2, z)] = B.log; data[idx(x, v.y + 3, z)] = B.log; }
      data[idx(x, v.y + 4, z)] = B.planks;
      for (let y = v.y - 4; y < v.y; y++) data[idx(x, y, z)] = B.brick;
    } else {
      for (let y = v.y - 3; y <= v.y; y++) data[idx(x, y, z)] = B.water;
      data[idx(x, v.y - 4, z)] = B.brick;
      data[idx(x, v.y + 4, z)] = B.planks;
    }
    if (dx === 0 && dz === 0) data[idx(x, v.y + 5, z)] = B.torch;
    return;
  }
  for (const hs of v.houses) {
    if (wx < hs.x0 || wx > hs.x1 || wz < hs.z0 || wz > hs.z1) continue;
    const y0 = v.y;
    const wall = wx === hs.x0 || wx === hs.x1 || wz === hs.z0 || wz === hs.z1;
    const corner = (wx === hs.x0 || wx === hs.x1) && (wz === hs.z0 || wz === hs.z1);
    for (let y = y0 + 1; y <= y0 + 7; y++) data[idx(x, y, z)] = B.air;
    for (let y = y0 - 3; y < y0; y++) if (data[idx(x, y, z)] === B.air) data[idx(x, y, z)] = B.dirt;
    data[idx(x, y0, z)] = wall ? B.rubble : B.planks;
    if (wall) {
      for (let y = y0 + 1; y <= y0 + 3; y++) data[idx(x, y, z)] = corner ? B.log : B.planks;
      const mid = wx === hs.cx || wz === hs.cz;
      if (mid && !corner) data[idx(x, y0 + 2, z)] = B.glass;
      if (wx === hs.door.x && wz === hs.door.z) { data[idx(x, y0 + 1, z)] = B.air; data[idx(x, y0 + 2, z)] = B.air; }
    } else if (wx === hs.cx && wz === hs.cz) {
      data[idx(x, y0 + 1, z)] = hs.bench ? B.workbench : B.air;
    }
    // stepped roof
    const inset = Math.min(wx - hs.x0, hs.x1 - wx, wz - hs.z0, hs.z1 - wz);
    const ry = y0 + 4 + Math.min(inset, 2);
    data[idx(x, ry, z)] = inset >= 2 ? B.brick : B.brick;
    if (inset === 1 && wx === hs.cx) data[idx(x, y0 + 3, z)] = B.torch;
    return;
  }
  // Paths from the well to each door
  for (const hs of v.houses) {
    const ax = v.x, az = v.z, bx = hs.door.x, bz = hs.door.z;
    const lx = bx - ax, lz = bz - az;
    const len2 = lx * lx + lz * lz;
    const t = Math.max(0, Math.min(1, ((wx - ax) * lx + (wz - az) * lz) / len2));
    const d = Math.hypot(wx - (ax + lx * t), wz - (az + lz * t));
    if (d < 1.1 && data[idx(x, h, z)] === B.grass) { data[idx(x, h, z)] = B.path; if (data[idx(x, h + 1, z)] !== B.air) data[idx(x, h + 1, z)] = B.air; return; }
  }
  // lamp posts
  if ((wx - v.x) % 9 === 0 && (wz - v.z) % 9 === 0 && Math.hypot(dx, dz) < 24 && data[idx(x, h, z)] === B.grass) {
    data[idx(x, h + 1, z)] = B.log; data[idx(x, h + 2, z)] = B.log; data[idx(x, h + 3, z)] = B.torch;
  }
}

function carveChamberColumn(wx, wz, x, z, data) {
  const C = CHAMBER;
  const lx = wx - C.x, lz = wz - C.z;
  const outer = lx < C.x0 || lx > C.x1 || lz < C.z0 || lz > C.z1;
  for (let y = C.floor - 2; y <= C.ceil + 2; y++) {
    const i = idx(x, y, z);
    if (outer || y <= C.floor || y >= C.ceil) { data[i] = B.chamber_brick; continue; }
    data[i] = B.air;
  }
  if (outer) return;
  const ax = Math.abs(lx), az = Math.abs(lz);
  // lamps in the ceiling grid
  if (ax % 6 === 3 && az % 6 === 3) data[idx(x, C.ceil, z)] = B.chamber_lamp;
  // pillars
  if ((ax === 12 || ax === 13) && (az === 12 || az === 13)) {
    for (let y = C.floor + 1; y < C.ceil; y++) data[idx(x, y, z)] = B.chamber_brick;
    data[idx(x, C.floor + 9, z)] = B.chamber_lamp;
  }
  // central monument dais
  if (ax <= 4 && az <= 4) { data[idx(x, C.floor + 1, z)] = B.chamber_brick; if (ax <= 2 && az <= 2) data[idx(x, C.floor + 2, z)] = B.chamber_brick; }
  // wind charge vaults along the walls
  if ((ax === 18 && az % 8 === 0) || (az === 18 && ax % 8 === 0)) data[idx(x, C.floor + 1, z)] = B.vault;
  // wall trims
  if (ax === 22 - 0 || az === 22) data[idx(x, C.floor + 5, z)] = B.chamber_lamp;
}

// A 3-wide staircase from the surface down into the chamber's north wall.
function carveChamberStairs(wx, wz, x, z, h, data) {
  const C = CHAMBER;
  const lx = wx - C.x, lz = wz - C.z;
  if (lx < -2 || lx > 2) return;
  const start = C.z0 - 1; // chamber north wall at z0
  if (lz > start) return;
  const k = start - lz; // distance north of the wall
  const floorY = C.floor + k;
  if (floorY > h + 3) return;
  const wall = lx === -2 || lx === 2;
  for (let y = floorY; y <= floorY + 5; y++) {
    const i = idx(x, y, z);
    if (y === floorY || (wall && y < Math.min(h, floorY + 5)) || (y === floorY + 5 && y < h)) {
      data[i] = B.chamber_brick;
    } else if (!wall && y < floorY + 5) data[i] = B.air;
  }
  if (!wall && k % 6 === 0 && floorY + 5 < h) data[idx(x, floorY + 5, z)] = B.chamber_lamp;
  if (wall && k % 6 === 3 && floorY + 2 < h) data[idx(x, floorY + 2, z)] = B.chamber_lamp;
  if (k === 0 && !wall) for (let y = floorY + 1; y < floorY + 5; y++) data[idx(x, y, z)] = B.air;
}

function genEmberdeep(seed, cx, cz, data) {
  const N = noises(seed + 7);
  const ox = cx * S, oz = cz * S;
  const pillars = sampleGrid(N.c, ox, oz, 30, 40, 30);
  const A = ARENAS.emberWarden;
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const wx = ox + x, wz = oz + z;
    let floor = Math.floor(34 + N.a.fbm2(wx / 60, wz / 60, 4) * 12);
    let ceil = Math.floor(98 - N.b.fbm2(wx / 50, wz / 50, 3) * 12);
    const ad = Math.hypot(wx - A.x, wz - A.z);
    const arena = ad <= A.r;
    const bridge = Math.abs(wx - A.x) <= 1 && wz > A.z && ad <= A.r + 6;
    const moat = ad > A.r && ad <= A.r + 3 && !bridge;
    if (arena) { floor = A.y; ceil = Math.max(ceil, 90); }
    else if (bridge) { floor = A.y; ceil = Math.max(ceil, 80); }
    else if (moat) floor = 30;
    else if (ad < A.r + 16) floor = Math.round(floor * ((ad - A.r - 3) / 13) + (A.y - 1) * (1 - (ad - A.r - 3) / 13));
    for (let y = 0; y < HEIGHT; y++) {
      let id = B.air;
      if (y === 0 || y >= 126) id = B.coreite;
      else if (y <= floor) {
        id = B.ashstone;
        if (y === floor && !arena) id = hash3(seed, wx, y, wz) < 0.35 ? B.ember_moss : hash3(seed, wx, 4, wz) < 0.2 ? B.soul_soil : B.ashstone;
        if (arena && y === floor) id = (Math.floor(ad) % 6 === 0) ? B.ember_lamp : B.basalt;
        else if (arena && y > floor - 3) id = B.basalt;
        const hh = hash3(seed, wx, y, wz);
        if (!arena && y < floor - 1 && hh < 0.012) id = B.emberite_ore;
        else if (!arena && y < floor - 1 && hh < 0.05) id = B.basalt;
      } else if (y >= ceil) id = B.ashstone;
      else if (y <= 31 && !arena) id = B.magma;
      else if (!arena && !moat && ad > A.r + 8 && pillars(x, y, z) > 0.55) id = B.basalt;
      if (!arena && id === B.ashstone && y >= ceil && y === ceil && hash3(seed, wx, y, wz) < 0.03) id = B.ember_lamp;
      data[idx(x, y, z)] = id;
    }
  }
}

function genVoid(seed, cx, cz, data) {
  const N = noises(seed + 13);
  const ox = cx * S, oz = cz * S;
  const isl = sampleGrid(N.a, ox, oz, 40, 20, 40);
  const A = ARENAS.voidDragon;
  const pillarsPos = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pillarsPos.push({ x: Math.round(A.x + Math.cos(a) * 17), z: Math.round(A.z + Math.sin(a) * 17), h: 8 + (i % 3) * 4 });
  }
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const wx = ox + x, wz = oz + z;
    const d = Math.hypot(wx - A.x, wz - A.z);
    const edgeNoise = N.b.noise2(wx / 12, wz / 12) * 3;
    if (d < A.r + edgeNoise) {
      const depth = Math.floor((1 - d / (A.r + 4)) * 22 + N.c.noise2(wx / 8, wz / 8) * 3) + 2;
      for (let y = A.y - depth; y <= A.y; y++) data[idx(x, y, z)] = B.voidstone;
      for (const p of pillarsPos) {
        const pd = Math.hypot(wx - p.x, wz - p.z);
        if (pd <= 1.6) {
          for (let y = A.y + 1; y <= A.y + p.h; y++) data[idx(x, y, z)] = B.voidstone;
          if (pd < 0.5) data[idx(x, A.y + p.h + 1, z)] = B.void_crystal;
        }
      }
    } else if (d > A.r + 14) {
      // scattered small islands
      for (let y = 30; y < 90; y++) {
        const v = isl(x, y, z) - Math.abs(y - 58) / 50;
        if (v > 0.42) data[idx(x, y, z)] = v > 0.5 ? B.voidstone : B.voidstone;
      }
    }
  }
}

function genSoul(seed, cx, cz, data) {
  const N = noises(seed + 21);
  const ox = cx * S, oz = cz * S;
  const A1 = ARENAS.shellKing, A2 = ARENAS.soulStorm;
  const heights = new Int16Array(S * S);
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const wx = ox + x, wz = oz + z;
    let h = Math.floor(50 + N.a.fbm2(wx / 70, wz / 70, 4) * 8);
    const d1 = Math.hypot(wx - A1.x, wz - A1.z), d2 = Math.hypot(wx - A2.x, wz - A2.z);
    const blend = (d, A) => {
      if (d <= A.r) return A.y;
      if (d < A.r + 14) { const t = (d - A.r) / 14; return Math.round(A.y * (1 - t) + h * t); }
      return h;
    };
    h = d1 < d2 ? blend(d1, A1) : blend(d2, A2);
    heights[x + z * S] = h;
    for (let y = 0; y <= h; y++) {
      let id = y === 0 ? B.coreite : y > h - 3 ? B.soul_soil : B.spiritstone;
      if (y === h) id = hash3(seed, wx, 9, wz) < 0.3 ? B.soul_soil : B.spiritstone;
      if ((d1 <= A1.r || d2 <= A2.r) && y === h) {
        const d = d1 <= A1.r ? d1 : d2, A = d1 <= A1.r ? A1 : A2;
        id = Math.abs(d - (A.r - 1)) < 0.8 ? B.soul_block : B.spiritstone;
      }
      if (y < h - 3 && hash3(seed, wx, y, wz) < 0.01) id = B.dusk_soul_ore;
      data[idx(x, y, z)] = id;
    }
    // spires ringing the storm arena
    if (Math.abs(d2 - (A2.r + 2)) < 1 && ((Math.atan2(wz - A2.z, wx - A2.x) + Math.PI) * 6 / Math.PI) % 1 < 0.12) {
      for (let y = h + 1; y < h + 12; y++) data[idx(x, y, z)] = B.soul_glass;
    }
  }
  // spirit trees
  for (let z = -2; z < S + 2; z++) for (let x = -2; x < S + 2; x++) {
    const wx = ox + x, wz = oz + z;
    if (hash3(seed, wx, 31, wz) > 0.008) continue;
    if (Math.hypot(wx - A1.x, wz - A1.z) < A1.r + 6 || Math.hypot(wx - A2.x, wz - A2.z) < A2.r + 6) continue;
    const inside = x >= 0 && z >= 0 && x < S && z < S;
    const h = inside ? heights[x + z * S] : Math.floor(50 + N.a.fbm2(wx / 70, wz / 70, 4) * 8);
    const th = 5 + Math.floor(hash3(seed, wx, 33, wz) * 3);
    for (let ly = -1; ly <= 1; ly++) for (let lz = -2; lz <= 2; lz++) for (let lx = -2; lx <= 2; lx++) {
      if (Math.abs(lx) + Math.abs(lz) > 3 - Math.max(0, ly)) continue;
      const px = x + lx, pz = z + lz, py = h + th + ly;
      if (px < 0 || pz < 0 || px >= S || pz >= S) continue;
      if (data[idx(px, py, pz)] === B.air) data[idx(px, py, pz)] = B.spirit_leaves;
    }
    if (inside) for (let t = 1; t <= th; t++) data[idx(x, h + t, z)] = B.spirit_log;
  }
}

// The Treasure Quest course: hand-built boxes, in order (later boxes win).
// Gates of levels already solved are left open.
function genQuest(cx, cz, data, extra) {
  const x0 = cx * S, z0 = cz * S, x1 = x0 + S - 1, z1 = z0 + S - 1;
  const solved = new Set((extra && extra.solved) || []);
  for (const b of QUEST_BOXES) {
    if (b[3] < x0 || b[0] > x1 || b[5] < z0 || b[2] > z1) continue;
    const id = b[7] >= 0 && solved.has(b[7]) ? B.air : b[6];
    const ax = Math.max(b[0], x0), bx = Math.min(b[3], x1);
    const az = Math.max(b[2], z0), bz = Math.min(b[5], z1);
    for (let y = Math.max(0, b[1]); y <= Math.min(HEIGHT - 1, b[4]); y++) {
      for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) data[idx(x - x0, y, z - z0)] = id;
    }
  }
}
