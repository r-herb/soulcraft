// Chunk lighting + greedy meshing. Runs in the worker.
//
// Input is a padded volume: the chunk plus PAD blocks of each neighbour on
// all four sides, so light can flow in from neighbours and faces on the
// chunk border can be culled correctly.
import { CHUNK, HEIGHT, IS_OPAQUE, LIGHT_EMIT, LAYER, SHAPE, TEX_TOP, TEX_SIDE, TEX_BOTTOM, B } from '../world/blocks.js';

export const PAD = 8;
const W = CHUNK + PAD * 2;
const H = HEIGHT;
const SX = 1, SZ = W, SY = W * W;
const VOL = W * W * H;

const WATER = B.water, LEAVES = B.leaves, SPIRIT_LEAVES = B.spirit_leaves;
const AO_CURVE = [0.42, 0.62, 0.8, 1];
// face shade per direction: +x,-x,+y,-y,+z,-z
const FACE_SHADE = [0.82, 0.82, 1.0, 0.55, 0.68, 0.68];

let sky = new Uint8Array(VOL);
let blk = new Uint8Array(VOL);
let queue = new Int32Array(VOL * 2);

function computeLight(vol) {
  sky.fill(0); blk.fill(0);
  let qh = 0, qt = 0;
  // Sky columns
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    let level = 15;
    for (let y = H - 1; y >= 0; y--) {
      const i = x + z * SZ + y * SY;
      const id = vol[i];
      if (IS_OPAQUE[id]) break;
      if (id === WATER || id === LEAVES || id === SPIRIT_LEAVES) level = Math.max(0, level - 2);
      sky[i] = level;
      if (level <= 0) break;
    }
  }
  // Seed sky spreading from lit cells next to darker open cells
  for (let y = 0; y < H; y++) for (let z = 1; z < W - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = x + z * SZ + y * SY;
    const s = sky[i];
    if (s < 2) continue;
    if ((!IS_OPAQUE[vol[i + 1]] && sky[i + 1] < s - 1) || (!IS_OPAQUE[vol[i - 1]] && sky[i - 1] < s - 1) ||
      (!IS_OPAQUE[vol[i + SZ]] && sky[i + SZ] < s - 1) || (!IS_OPAQUE[vol[i - SZ]] && sky[i - SZ] < s - 1) ||
      (y > 0 && !IS_OPAQUE[vol[i - SY]] && sky[i - SY] < s - 1)) {
      queue[qt++] = i;
    }
  }
  qh = propagate(vol, sky, 0, qt);
  // Block light
  qt = 0;
  for (let i = 0; i < VOL; i++) {
    const e = LIGHT_EMIT[vol[i]];
    if (e) { blk[i] = e; queue[qt++] = i; }
  }
  propagate(vol, blk, 0, qt);
  return qh;
}

function propagate(vol, L, qh, qt) {
  while (qh < qt) {
    const i = queue[qh++];
    const lv = L[i] - 1;
    if (lv <= 0) continue;
    const x = i % W, z = ((i / W) | 0) % W, y = (i / SY) | 0;
    if (x > 0) { const j = i - 1; if (L[j] < lv && !IS_OPAQUE[vol[j]]) { L[j] = lv; queue[qt++] = j; } }
    if (x < W - 1) { const j = i + 1; if (L[j] < lv && !IS_OPAQUE[vol[j]]) { L[j] = lv; queue[qt++] = j; } }
    if (z > 0) { const j = i - SZ; if (L[j] < lv && !IS_OPAQUE[vol[j]]) { L[j] = lv; queue[qt++] = j; } }
    if (z < W - 1) { const j = i + SZ; if (L[j] < lv && !IS_OPAQUE[vol[j]]) { L[j] = lv; queue[qt++] = j; } }
    if (y > 0) { const j = i - SY; if (L[j] < lv && !IS_OPAQUE[vol[j]]) { L[j] = lv; queue[qt++] = j; } }
    if (y < H - 1) { const j = i + SY; if (L[j] < lv && !IS_OPAQUE[vol[j]]) { L[j] = lv; queue[qt++] = j; } }
    if (qt >= queue.length - 8) { queue.copyWithin(0, qh, qt); qt -= qh; qh = 0; }
  }
  return qh;
}

class Buf {
  constructor() { this.pos = []; this.uv = []; this.light = []; this.idx = []; this.n = 0; }
  quad(p, uv, tile, lights, flip) {
    const b = this.n;
    for (let k = 0; k < 4; k++) {
      this.pos.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
      this.uv.push(uv[k * 2], uv[k * 2 + 1], tile);
      this.light.push(lights[k * 3], lights[k * 3 + 1], lights[k * 3 + 2]);
    }
    if (flip) this.idx.push(b + 1, b + 2, b + 3, b + 1, b + 3, b);
    else this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n += 4;
  }
  out() {
    return {
      pos: new Float32Array(this.pos), uv: new Float32Array(this.uv), light: new Float32Array(this.light),
      idx: this.n > 16000 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
    };
  }
}

// Does face of block a (toward neighbour b) need drawing?
function faceVisible(a, b) {
  if (b === 0) return true;
  if (IS_OPAQUE[b]) return false;
  if (a === b) return false; // hide faces between two water, glass or leaf blocks
  return true;
}

const DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export function meshChunk(vol) {
  computeLight(vol);
  const solid = new Buf();
  const water = new Buf();
  const x0 = PAD, x1 = PAD + CHUNK;
  // Greedy meshing per face direction.
  const mask1 = new Int32Array(W * H);
  const mask2 = new Uint32Array(W * H);
  const cornerLight = new Float32Array(12);

  for (let f = 0; f < 6; f++) {
    const [dx, dy, dz] = DIRS[f];
    const axis = dx ? 0 : dy ? 1 : 2;
    // u, v axes of the face plane
    const ua = axis === 0 ? 2 : 0;
    const va = axis === 1 ? 2 : 1;
    const dimLen = axis === 1 ? H : CHUNK;
    const uLen = ua === 1 ? H : CHUNK;
    const vLen = va === 1 ? H : CHUNK;
    const nOff = dx * SX + dy * SY + dz * SZ;
    const uOff = ua === 0 ? SX : ua === 1 ? SY : SZ;
    const vOff = va === 0 ? SX : va === 1 ? SY : SZ;
    for (let s = 0; s < dimLen; s++) {
      let any = false;
      for (let v = 0; v < vLen; v++) for (let u = 0; u < uLen; u++) {
        const c = [0, 0, 0];
        c[axis] = s; c[ua] = u; c[va] = v;
        const x = c[0] + PAD, y = c[1], z = c[2] + PAD;
        const i = x + z * SZ + y * SY;
        const m = u + v * uLen;
        mask1[m] = 0;
        const id = vol[i];
        const shape = SHAPE[id];
        if (shape !== 1 && shape !== 4) continue;
        const ny = y + dy;
        let nb = 0;
        if (ny < 0) nb = 1; else if (ny >= H) nb = 0; else nb = vol[i + nOff];
        if (!faceVisible(id, nb)) continue;
        if (shape === 4 && f === 2 && ny < H && vol[i + nOff] === id) continue;
        // corner AO + light
        let packed = 0, aoBits = 0;
        const ni = ny < 0 || ny >= H ? i : i + nOff;
        const sL = ny >= H ? 15 : sky[ni], bL = ny >= H ? 0 : blk[ni];
        for (let k = 0; k < 4; k++) {
          const su = (k === 1 || k === 2) ? 1 : -1;
          const sv = (k >= 2) ? 1 : -1;
          let ao = 3, ls = sL, lb = bL, cnt = 1;
          if (ny >= 0 && ny < H && shape === 1) {
            const a = ni + su * uOff, b = ni + sv * vOff, cc = ni + su * uOff + sv * vOff;
            const inA = inRange(a), inB = inRange(b), inC = inRange(cc);
            const oa = inA && IS_OPAQUE[vol[a]] ? 1 : 0;
            const ob = inB && IS_OPAQUE[vol[b]] ? 1 : 0;
            const oc = inC && IS_OPAQUE[vol[cc]] ? 1 : 0;
            ao = oa && ob ? 0 : 3 - (oa + ob + oc);
            if (!oa && inA) { ls += sky[a]; lb += blk[a]; cnt++; }
            if (!ob && inB) { ls += sky[b]; lb += blk[b]; cnt++; }
            if (!oc && inC && !(oa && ob)) { ls += sky[cc]; lb += blk[cc]; cnt++; }
          }
          const qs = Math.round(ls / cnt), qb = Math.round(lb / cnt);
          packed |= ((qs & 15) | ((qb & 15) << 4)) << (k * 8);
          aoBits |= ao << (k * 2);
        }
        const tile = f === 2 ? TEX_TOP[id] : f === 3 ? TEX_BOTTOM[id] : TEX_SIDE[id];
        mask1[m] = 1 + tile + (aoBits << 8) + (id << 16);
        mask2[m] = packed >>> 0;
        any = true;
      }
      if (!any) continue;
      // Greedy merge
      for (let v = 0; v < vLen; v++) for (let u = 0; u < uLen;) {
        const m = u + v * uLen;
        const k1 = mask1[m];
        if (!k1) { u++; continue; }
        const k2 = mask2[m];
        const id = k1 >>> 16;
        const liquid = SHAPE[id] === 4;
        let w = 1;
        while (u + w < uLen && mask1[m + w] === k1 && mask2[m + w] === k2) w++;
        let h = 1;
        outer: while (v + h < vLen) {
          for (let k = 0; k < w; k++) {
            const mm = m + k + h * uLen;
            if (mask1[mm] !== k1 || mask2[mm] !== k2) break outer;
          }
          h++;
        }
        for (let hh = 0; hh < h; hh++) for (let k = 0; k < w; k++) mask1[m + k + hh * uLen] = 0;
        emitQuad(liquid && id === WATER ? water : solid, f, axis, ua, va, s, u, v, w, h, k1, k2, id, vol, cornerLight);
        u += w;
      }
    }
  }
  // Special shapes: cross plants and torches
  for (let y = 0; y < H; y++) for (let z = x0; z < x1; z++) for (let x = x0; x < x1; x++) {
    const i = x + z * SZ + y * SY;
    const id = vol[i];
    const shape = SHAPE[id];
    if (shape !== 2 && shape !== 3) continue;
    const ls = sky[i] / 15, lb = Math.max(blk[i], LIGHT_EMIT[id]) / 15;
    const px = x - PAD, pz = z - PAD;
    const tile = TEX_SIDE[id];
    if (shape === 2) {
      const L = [ls, lb, 0.9, ls, lb, 0.9, ls, lb, 0.9, ls, lb, 0.9];
      const a = 0.15, b = 0.85;
      crossQuad(solid, [px + a, y, pz + a, px + b, y, pz + b, px + b, y + 1, pz + b, px + a, y + 1, pz + a], tile, L);
      crossQuad(solid, [px + a, y, pz + b, px + b, y, pz + a, px + b, y + 1, pz + a, px + a, y + 1, pz + b], tile, L);
    } else {
      torchBox(solid, px, y, pz, tile, ls, lb);
    }
  }
  return { solid: solid.out(), water: water.out() };
}

function inRange(i) { return i >= 0 && i < VOL; }

function emitQuad(buf, f, axis, ua, va, s, u, v, w, h, k1, k2, id, vol, L) {
  const tile = (k1 & 255) - 1;
  const aoBits = (k1 >>> 8) & 255;
  const dir = f % 2 === 0 ? 1 : -1;
  const plane = s + (dir > 0 ? 1 : 0);
  const liquid = SHAPE[id] === 4;
  const corners = [[u, v], [u + w, v], [u + w, v + h], [u, v + h]];
  const p = new Array(12);
  const uv = new Array(8);
  for (let k = 0; k < 4; k++) {
    const c = [0, 0, 0];
    c[axis] = plane; c[ua] = corners[k][0]; c[va] = corners[k][1];
    if (liquid && axis === 1 && dir > 0) c[1] -= 0.14;
    p[k * 3] = c[0]; p[k * 3 + 1] = c[1]; p[k * 3 + 2] = c[2];
    // texture coords: sides use (horizontal, y), top/bottom use (x, z)
    if (axis === 1) { uv[k * 2] = c[0]; uv[k * 2 + 1] = c[2]; }
    else if (axis === 0) { uv[k * 2] = dir > 0 ? -c[2] : c[2]; uv[k * 2 + 1] = c[1]; }
    else { uv[k * 2] = dir > 0 ? c[0] : -c[0]; uv[k * 2 + 1] = c[1]; }
  }
  // Corner order in the mask: k=0 (-u,-v), 1 (+u,-v), 2 (+u,+v), 3 (-u,+v)
  const shade = FACE_SHADE[f];
  const aos = [];
  for (let k = 0; k < 4; k++) {
    const ao = (aoBits >> (k * 2)) & 3;
    aos.push(ao);
    const lp = (k2 >>> (k * 8)) & 255;
    L[k * 3] = (lp & 15) / 15;
    L[k * 3 + 1] = (lp >> 4) / 15;
    L[k * 3 + 2] = shade * AO_CURVE[ao];
  }
  // Winding: make the quad face outward.
  let order = [0, 1, 2, 3];
  // Cross product of (p1-p0) x (p3-p0) should point along the normal.
  const ax = p[3] - p[0], ay = p[4] - p[1], az = p[5] - p[2];
  const bx = p[9] - p[0], by = p[10] - p[1], bz = p[11] - p[2];
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const dot = nx * DIRS[f][0] + ny * DIRS[f][1] + nz * DIRS[f][2];
  if (dot < 0) order = [0, 3, 2, 1];
  const P = [], UV = [], LL = [];
  for (const k of order) {
    P.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
    UV.push(uv[k * 2], uv[k * 2 + 1]);
    LL.push(L[k * 3], L[k * 3 + 1], L[k * 3 + 2]);
  }
  const a0 = aos[order[0]], a1 = aos[order[1]], a2 = aos[order[2]], a3 = aos[order[3]];
  buf.quad(P, UV, tile, LL, a0 + a2 < a1 + a3);
}

function crossQuad(buf, p, tile, L) {
  const uv = [0, 0, 1, 0, 1, 1, 0, 1];
  buf.quad(p, uv, tile, L, false);
  // back side
  const q = [p[3], p[4], p[5], p[0], p[1], p[2], p[9], p[10], p[11], p[6], p[7], p[8]];
  buf.quad(q, [1, 0, 0, 0, 0, 1, 1, 1], tile, L, false);
}

function torchBox(buf, x, y, z, tile, ls, lb) {
  const a = 7 / 16, b = 9 / 16, top = 10 / 16;
  const L = (s) => [ls, lb, s, ls, lb, s, ls, lb, s, ls, lb, s];
  const faces = [
    [[x + b, y, z + a, x + b, y, z + b, x + b, y + top, z + b, x + b, y + top, z + a], 0.9],
    [[x + a, y, z + b, x + a, y, z + a, x + a, y + top, z + a, x + a, y + top, z + b], 0.9],
    [[x + a, y, z + b, x + b, y, z + b, x + b, y + top, z + b, x + a, y + top, z + b], 0.8],
    [[x + b, y, z + a, x + a, y, z + a, x + a, y + top, z + a, x + b, y + top, z + a], 0.8],
  ];
  for (const [p, s] of faces) buf.quad(p, [a, 0, b, 0, b, top, a, top], tile, L(s), false);
  buf.quad([x + a, y + top, z + a, x + a, y + top, z + b, x + b, y + top, z + b, x + b, y + top, z + a],
    [a, 1 - 9 / 16, a, 1 - 7 / 16, b, 1 - 7 / 16, b, 1 - 9 / 16], tile, L(1), false);
}
