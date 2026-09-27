// Procedural 16x16 pixel-art texture atlas. Every texture in the game is
// painted here in code; no image files. Two styles: 'classic' and 'glow'
// (Soul Glow - deeper shadows and luminous accents).
import { TILES, ATLAS_COLS, ATLAS_ROWS } from '../world/blocks.js';
import { mulberry32, hashString } from '../world/noise.js';

export const T = 16;

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function shade(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }

class Painter {
  constructor(img, ox, oy, seed, glow) {
    this.img = img; this.ox = ox; this.oy = oy; this.r = mulberry32(seed); this.glow = glow;
    this.W = img.width;
  }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    const i = ((this.oy + y) * this.W + this.ox + x) * 4;
    const d = this.img.data;
    d[i] = Math.max(0, Math.min(255, c[0])); d[i + 1] = Math.max(0, Math.min(255, c[1]));
    d[i + 2] = Math.max(0, Math.min(255, c[2])); d[i + 3] = a;
  }
  get(x, y) {
    const i = ((this.oy + y) * this.W + this.ox + x) * 4;
    const d = this.img.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }
  noise(palette, amount = 1) {
    const cs = palette.map(hex);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const t = this.r();
      const c = cs[Math.min(cs.length - 1, Math.floor(t * cs.length * amount) % cs.length)];
      this.set(x, y, shade(c, 0.94 + this.r() * 0.12));
    }
  }
  speckle(color, n, size = 1) {
    const c = hex(color);
    for (let k = 0; k < n; k++) {
      const x = Math.floor(this.r() * T), y = Math.floor(this.r() * T);
      for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) this.set(x + a, y + b, c);
    }
  }
  blobs(colors, n, glowColor) {
    const cs = colors.map(hex);
    for (let k = 0; k < n; k++) {
      const x = 2 + Math.floor(this.r() * 11), y = 2 + Math.floor(this.r() * 11);
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
      for (const [a, b] of pts) if (this.r() < 0.85) this.set(x + a, y + b, cs[Math.floor(this.r() * cs.length)]);
      this.set(x, y, cs[cs.length - 1]);
      if (this.glow && glowColor) for (const [a, b] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const p = this.get(x + a, y + b);
        if (p[3]) this.set(x + a, y + b, mix(p, hex(glowColor), 0.35));
      }
    }
  }
  bricks(base, mortar, bw = 8, bh = 4) {
    const b = hex(base), m = hex(mortar);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const row = Math.floor(y / bh);
      const off = row % 2 ? bw / 2 : 0;
      const edge = y % bh === 0 || (x + off) % bw === 0;
      this.set(x, y, edge ? m : shade(b, 0.9 + this.r() * 0.2));
    }
  }
  border(color, a = 255) { const c = hex(color); for (let i = 0; i < T; i++) { this.set(i, 0, c, a); this.set(i, T - 1, c, a); this.set(0, i, c, a); this.set(T - 1, i, c, a); } }
  clear() { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) this.set(x, y, [0, 0, 0], 0); }
}

const painters = {
  grass_top: (p) => { p.noise(['#4c9a3a', '#58ad42', '#3f8a33', '#63b84b']); if (p.glow) p.speckle('#8df07a', 5); },
  grass_side: (p) => {
    painters.dirt(p);
    const g = ['#4c9a3a', '#58ad42', '#3f8a33'].map(hex);
    for (let x = 0; x < T; x++) {
      const d = 3 + Math.floor(p.r() * 3);
      for (let y = 0; y < d; y++) p.set(x, y, g[Math.floor(p.r() * 3)]);
    }
  },
  dirt: (p) => { p.noise(['#7a5236', '#6b4630', '#86603f', '#5e3d29']); p.speckle('#9a7650', 6); },
  stone: (p) => { p.noise(['#7d7f86', '#72747b', '#888a91', '#6a6c73']); p.speckle('#5c5e65', 10, 2); },
  rubble: (p) => {
    p.noise(['#6e7077', '#7d7f86']);
    for (let k = 0; k < 7; k++) {
      const x = Math.floor(p.r() * 14), y = Math.floor(p.r() * 14), c = shade(hex('#8f9198'), 0.8 + p.r() * 0.4);
      for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) p.set(x + a, y + b, c);
      for (let a = 0; a < 4; a++) p.set(x + a, y + 3, hex('#4d4f55'));
    }
  },
  sand: (p) => { p.noise(['#e2d196', '#d9c687', '#ead9a2']); p.speckle('#c9b271', 8); },
  log_side: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const stripe = (x + Math.floor(p.r() * 2)) % 4 === 0;
      p.set(x, y, shade(hex(stripe ? '#4d3421' : '#6b4a2f'), 0.9 + p.r() * 0.15));
    }
  },
  log_top: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const ring = Math.floor(d) % 3 === 0;
      p.set(x, y, d > 6.5 ? hex('#4d3421') : shade(hex(ring ? '#9c7a4e' : '#b8935f'), 0.92 + p.r() * 0.1));
    }
  },
  leaves: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (p.r() < 0.18) p.set(x, y, [0, 0, 0], 0);
      else p.set(x, y, shade(hex(p.r() < 0.3 ? '#2f7a2c' : '#3d9137'), 0.85 + p.r() * 0.25));
    }
  },
  planks: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const edge = y % 4 === 3 || (x === (Math.floor(y / 4) % 2 ? 11 : 4) && true);
      p.set(x, y, edge ? hex('#6e4d2c') : shade(hex('#b08452'), 0.9 + p.r() * 0.15));
    }
  },
  glass: (p) => {
    p.clear();
    p.border('#cfefff', 230);
    for (let i = 3; i < 7; i++) p.set(i, 9 - i, hex('#ffffff'), 200);
    for (let i = 9; i < 12; i++) p.set(i, 21 - i, hex('#ffffff'), 160);
  },
  water: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const w = Math.sin((x + y * 0.5) * 0.9) * 0.5 + 0.5;
      p.set(x, y, mix(hex('#2a5fbf'), hex('#3f86e0'), w * 0.6 + p.r() * 0.2), 190);
    }
  },
  coreite: (p) => { p.noise(['#2b2b30', '#3c3c42', '#1f1f23', '#505058']); },
  char_ore: (p) => { painters.stone(p); p.blobs(['#1d1d22', '#2c2c33', '#101014'], 4); },
  iron_ore: (p) => { painters.stone(p); p.blobs(['#d8a98a', '#c48f6e', '#e8c0a4'], 4); },
  gold_ore: (p) => { painters.stone(p); p.blobs(['#f2c94c', '#e0a92e', '#fff08a'], 4, '#fff6b0'); },
  soul_ore: (p) => { painters.stone(p); p.blobs(['#44d6e8', '#7ff3ff', '#b6fbff'], 4, '#7ff3ff'); },
  duskstone: (p) => { p.noise(['#3e3a4a', '#474257', '#35313f', '#4f4a61']); for (let y = 0; y < T; y += 4) for (let x = 0; x < T; x++) if (p.r() < 0.4) p.set(x, y, hex('#2b2835')); },
  dusk_soul_ore: (p) => { painters.duskstone(p); p.blobs(['#44d6e8', '#9a6bff', '#b6fbff'], 5, '#7ff3ff'); },
  torch: (p) => {
    p.clear();
    for (let y = 6; y < 16; y++) for (let x = 7; x < 9; x++) p.set(x, y, hex('#7a5530'));
    for (let y = 6; y < 8; y++) for (let x = 7; x < 9; x++) p.set(x, y, hex('#ffd36b'));
    p.set(7, 6, hex('#fff4c0')); p.set(8, 7, hex('#ff9a3c'));
    for (let y = 7; y < 10; y++) for (let x = 7; x < 9; x++) p.set(x, y, hex('#ffe08a'));
  },
  brick: (p) => p.bricks('#a1523e', '#d8c7b3'),
  magma: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const w = Math.sin(x * 0.8 + p.r()) * Math.cos(y * 0.7) * 0.5 + 0.5;
      p.set(x, y, mix(hex('#e8471c'), hex('#ffc23d'), w));
    }
  },
  ashstone: (p) => { p.noise(['#5a2f2c', '#6b3834', '#4b2724', '#7a423b']); p.speckle('#3a1d1b', 8); },
  emberite_ore: (p) => { painters.ashstone(p); p.blobs(['#ff7a2e', '#ffb14a', '#c8411c'], 4, '#ffd08a'); },
  soul_soil: (p) => { p.noise(['#4a3b33', '#3e3029', '#56463c']); p.speckle('#5ee6f0', p.glow ? 5 : 2); },
  voidstone: (p) => { p.noise(['#2a2340', '#231d36', '#332a4d', '#1c172c']); p.speckle('#6b54b8', 4); },
  spiritstone: (p) => { p.noise(['#cfe6f0', '#bcd8e6', '#dcf0f7']); p.speckle(p.glow ? '#6cf2ff' : '#a6cbd9', 6); },
  chamber_brick: (p) => p.bricks('#6a7a73', '#3f4b46', 8, 8),
  chamber_lamp: (p) => { p.noise(['#f6c667', '#ffd98a']); p.border('#8a5b2a'); for (let i = 3; i < 13; i++) { p.set(i, 7, hex('#fff3c4')); p.set(7, i, hex('#fff3c4')); } },
  ember_lamp: (p) => { p.noise(['#ff9a3c', '#ffb85c', '#f07a26']); p.border('#5a2f2c'); p.speckle('#fff0b0', 6); },
  glowbell: (p) => {
    p.clear();
    for (let y = 8; y < 16; y++) p.set(8, y, hex('#3d9137'));
    p.set(7, 12, hex('#3d9137')); p.set(9, 11, hex('#3d9137'));
    for (const [x, y] of [[7, 5], [8, 5], [9, 5], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [7, 7], [8, 7], [9, 7]]) p.set(x, y, hex('#8feaff'));
    p.set(8, 6, hex('#ffffff'));
  },
  tallgrass: (p) => {
    p.clear();
    for (let k = 0; k < 7; k++) {
      const x = 2 + Math.floor(p.r() * 12), h = 5 + Math.floor(p.r() * 9);
      for (let y = T - h; y < T; y++) p.set(x, y, shade(hex('#4f9e3c'), 0.8 + p.r() * 0.3));
    }
  },
  path: (p) => { p.noise(['#9c8457', '#8a7349', '#a88f60']); },
  crafting_top: (p) => { painters.planks(p); p.border('#4d3421'); for (let i = 2; i < 14; i++) { p.set(i, 8, hex('#4d3421')); p.set(8, i, hex('#4d3421')); } },
  crafting_side: (p) => { painters.planks(p); for (let x = 3; x < 7; x++) for (let y = 3; y < 7; y++) p.set(x, y, hex('#9aa0a8')); for (let x = 9; x < 13; x++) p.set(x, 5, hex('#6e4d2c')); },
  void_crystal: (p) => { p.noise(['#b98bff', '#d7b8ff', '#8c5cf0']); p.border('#3a2566'); p.speckle('#ffffff', 4); },
  basalt: (p) => { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) p.set(x, y, shade(hex(x % 5 === 0 ? '#2b2b30' : '#44444b'), 0.9 + p.r() * 0.2)); },
  soul_glass: (p) => { p.clear(); p.border('#6cf2ff', 240); for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (p.r() < 0.12) p.set(x, y, hex('#9af6ff'), 150); },
  spirit_tree: (p) => { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) p.set(x, y, shade(hex(x % 4 === 0 ? '#d9e8f0' : '#f0f7fa'), 0.85 + p.r() * 0.15)); p.speckle('#6cf2ff', 3); },
  spirit_leaves: (p) => { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { if (p.r() < 0.2) p.set(x, y, [0, 0, 0], 0); else p.set(x, y, shade(hex(p.r() < 0.4 ? '#6cf2ff' : '#a7f7ff'), 0.8 + p.r() * 0.25)); } },
  snow: (p) => { p.noise(['#f4f8fb', '#e6eef4', '#ffffff']); },
  wool_blue: (p) => { p.noise(['#3b5bd6', '#3452c4', '#4466e0']); },
  vault: (p) => { painters.chamber_brick(p); for (let x = 4; x < 12; x++) for (let y = 4; y < 12; y++) p.set(x, y, hex(p.r() < 0.5 ? '#9ff6e0' : '#62d9c0')); p.border('#2b3530'); },
  iron_block: (p) => { p.noise(['#d6d9de', '#c8ccd2']); p.border('#9aa0a8'); },
  gold_block: (p) => { p.noise(['#f6d25a', '#f0c23a']); p.border('#b8871e'); },
  emberite_block: (p) => { p.noise(['#d9562a', '#e86a36', '#b8401c']); p.border('#5a2415'); p.speckle('#ffc07a', 5); },
  soul_block: (p) => { p.noise(['#58e1f0', '#7ff3ff', '#3cc6d8']); p.border('#1f7c8c'); p.speckle('#ffffff', 5); },
  ember_moss: (p) => { p.noise(['#b8371f', '#d24a24', '#9c2c18']); p.speckle('#ff9a4a', 6); },
};

export function buildAtlas(style = 'classic') {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * T;
  canvas.height = ATLAS_ROWS * T;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  const glow = style === 'glow';
  TILES.forEach((name, i) => {
    const p = new Painter(img, (i % ATLAS_COLS) * T, Math.floor(i / ATLAS_COLS) * T, hashString(name), glow);
    (painters[name] || ((q) => q.noise(['#ff00ff'])))(p);
    if (glow) {
      // Soul Glow: slightly cooler, higher-contrast palette
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const c = p.get(x, y);
        if (!c[3]) continue;
        const l = (c[0] + c[1] + c[2]) / 3;
        const k = l > 150 ? 1.12 : 0.86;
        p.set(x, y, [c[0] * k * 0.95, c[1] * k, c[2] * k * 1.1], c[3]);
      }
    }
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Draw a small isometric block icon from atlas tiles, for inventory slots.
export function drawBlockIcon(ctx, atlas, tex, size) {
  const src = (t) => [(t % ATLAS_COLS) * T, Math.floor(t / ATLAS_COLS) * T];
  ctx.imageSmoothingEnabled = false;
  const s = size;
  const [tx, ty] = src(tex.top), [sx, sy] = src(tex.side);
  // top
  ctx.save();
  ctx.setTransform(s / 32, s / 64, -s / 32, s / 64, s / 2, s * 0.06);
  ctx.drawImage(atlas, tx, ty, T, T, 0, 0, 16, 16);
  ctx.restore();
  // left
  ctx.save();
  ctx.setTransform(s / 32, s / 64, 0, s / 30, s * 0.0, s * 0.31);
  ctx.drawImage(atlas, sx, sy, T, T, 0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, 16, 16);
  ctx.restore();
  // right
  ctx.save();
  ctx.setTransform(s / 32, -s / 64, 0, s / 30, s / 2, s * 0.56);
  ctx.drawImage(atlas, sx, sy, T, T, 0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.fillRect(0, 0, 16, 16);
  ctx.restore();
}

export function drawFlatTile(ctx, atlas, t, size) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, (t % ATLAS_COLS) * T, Math.floor(t / ATLAS_COLS) * T, T, T, 0, 0, size, size);
}
