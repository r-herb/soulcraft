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

// 5 x 7 digits for the house-number plaques
const DIGITS = [
  ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
];

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
  sandstone_top: (p) => { p.noise(['#dcc98a', '#d4bf7c', '#e4d399']); p.border('#b89e5c'); },
  sandstone_side: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const band = y < 4 ? '#e4d399' : y % 5 === 0 ? '#b89e5c' : '#d4bf7c';
      p.set(x, y, shade(hex(band), 0.93 + p.r() * 0.1));
    }
  },
  cactus_side: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) p.set(x, y, shade(hex(x % 4 === 1 ? '#2f7a34' : '#3f9a44'), 0.9 + p.r() * 0.15));
    for (let k = 0; k < 10; k++) { const x = (Math.floor(p.r() * 4) * 4 + 1) % T, y = Math.floor(p.r() * T); p.set(x, y, hex('#e8e0b8')); }
  },
  cactus_top: (p) => { p.noise(['#4aa84e', '#3f9a44']); p.border('#2f7a34'); p.set(7, 7, hex('#f6a6c8')); p.set(8, 7, hex('#f6a6c8')); p.set(7, 8, hex('#f6a6c8')); },
  dry_bush: (p) => {
    p.clear();
    const c = hex('#8a6a3a');
    for (let k = 0; k < 6; k++) {
      let x = 8, y = 15;
      const dx = (p.r() - 0.5) * 1.4;
      for (let s = 0; s < 9; s++) { p.set(Math.round(x), y, shade(c, 0.85 + p.r() * 0.3)); x += dx; y -= 1; }
    }
  },
  ice: (p) => { p.noise(['#a8d8f0', '#9accea', '#b6e2f6']); for (let k = 0; k < 4; k++) { const x = Math.floor(p.r() * 12), y = Math.floor(p.r() * 12); for (let i = 0; i < 4; i++) p.set(x + i, y + i, hex('#e6f6ff')); } },
  pine_leaves: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (p.r() < 0.15) p.set(x, y, [0, 0, 0], 0);
      else if (y < 4 && p.r() < 0.7) p.set(x, y, shade(hex('#f4f8fb'), 0.92 + p.r() * 0.08));
      else p.set(x, y, shade(hex(p.r() < 0.35 ? '#1f5a3a' : '#2a6e46'), 0.85 + p.r() * 0.25));
    }
  },
  // real cities
  asphalt: (p) => { p.noise(['#4a4b50', '#434449', '#515257', '#3e3f44']); p.speckle('#6a6b70', 10); },
  paving: (p) => {
    p.noise(['#bdb8ae', '#c4bfb5', '#b6b1a7']);
    const m = hex('#8f8a80');
    for (let i = 0; i < T; i++) { p.set(i, 0, m); p.set(i, 8, m); p.set(0, i, m); p.set(8, i, m); }
  },
  marble: (p) => {
    p.noise(['#ece5d6', '#e6ddcb', '#f2ece0']);
    const v = hex('#cfc4ad');
    let x = Math.floor(p.r() * 6);
    for (let y = 0; y < T; y++) { p.set(x, y, v); if (p.r() < 0.4) x = Math.min(T - 1, x + 1); }
    for (let i = 0; i < T; i++) { p.set(i, 0, hex('#d8cfbb')); p.set(0, i, hex('#d8cfbb')); }
  },
  plaster_white: (p) => { p.noise(['#f1f0ea', '#ebe9e2', '#f6f5f0']); p.speckle('#dcdad2', 6); },
  plaster_cream: (p) => { p.noise(['#ecdcb8', '#e6d4ad', '#f1e3c4']); p.speckle('#d6c297', 6); },
  plaster_ochre: (p) => { p.noise(['#e2b36e', '#dba965', '#e8bd7c']); p.speckle('#c69350', 6); },
  plaster_terra: (p) => { p.noise(['#cf8a6c', '#c78063', '#d69677']); p.speckle('#b06b50', 6); },
  roof_tiles: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const row = Math.floor(y / 4), wave = Math.sin(((x + (row % 2) * 2) / 4) * Math.PI);
      const edge = y % 4 === 3;
      p.set(x, y, shade(hex(edge ? '#8a3f24' : '#c1603c'), (0.85 + wave * 0.12) * (0.95 + p.r() * 0.1)));
    }
  },
  window: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) p.set(x, y, shade(hex(y < 7 ? '#5f86a8' : '#3f5f80'), 0.92 + p.r() * 0.1));
    const f = hex('#f0efe8');
    for (let i = 0; i < T; i++) { p.set(i, 0, f); p.set(i, T - 1, f); p.set(0, i, f); p.set(T - 1, i, f); p.set(i, 7, f); p.set(7, i, f); }
    p.set(3, 3, hex('#b8d4ea')); p.set(4, 2, hex('#b8d4ea')); p.set(11, 3, hex('#b8d4ea'));
  },
  limestone: (p) => { p.bricks('#d9ccb0', '#b8a987', 16, 8); p.speckle('#c8b996', 8); },
  concrete: (p) => { p.noise(['#b4b5b8', '#adaeb1', '#bbbcbf']); p.speckle('#9c9da0', 5); },
  road_paint: (p) => { p.noise(['#f2f1ea', '#e8e7df', '#f7f6f0']); p.speckle('#c9c8c0', 5); },
  paint_dark: (p) => { p.noise(['#27324a', '#2d3953', '#222c42']); p.speckle('#3d4a66', 5); },
  ...Object.fromEntries(Array.from({ length: 10 }, (_, d) => ['num_' + d, (p) => {
    p.noise(['#f4f3ee', '#eeede6']);
    p.border('#2f5fb3');
    const rows = DIGITS[d];
    // each digit pixel is 2 x 2 texels
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (rows[y][x] === '#') for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) p.set(3 + x * 2 + a, 1 + y * 2 + b, hex('#1f4fa8'));
  }])),
  frost_brick: (p) => { p.bricks('#9cc4dc', '#5f89a6', 8, 4); p.speckle('#e6f6ff', 5); },
  blink_on: (p) => { p.noise(['#b98bff', '#c9a2ff', '#a678f0']); p.border('#6d45d6'); for (let i = 4; i < 12; i++) { p.set(i, 4, hex('#f0e6ff')); p.set(i, 11, hex('#f0e6ff')); p.set(4, i, hex('#f0e6ff')); p.set(11, i, hex('#f0e6ff')); } },
  blink_off: (p) => { p.clear(); for (let i = 0; i < 16; i += 2) { p.set(i, 0, hex('#b98bff'), 150); p.set(i, 15, hex('#b98bff'), 150); p.set(0, i, hex('#b98bff'), 150); p.set(15, i, hex('#b98bff'), 150); } },
  plate_off: (p) => { p.noise(['#5f89a6', '#6f99b6']); p.border('#3a5a78'); for (let i = 4; i < 12; i++) for (let j = 4; j < 12; j++) p.set(i, j, hex('#8aa9c0')); },
  plate_on: (p) => { p.noise(['#5f89a6', '#6f99b6']); p.border('#3a5a78'); for (let i = 3; i < 13; i++) for (let j = 3; j < 13; j++) p.set(i, j, hex(p.glow ? '#dffcff' : '#9af6ff')); },
  jet: (p) => { painters.frost_brick(p); for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11], [7, 7], [8, 8]]) { p.set(x, y, hex('#1f3a5a')); p.set(x + 1, y, hex('#1f3a5a')); } },
  jet_lit: (p) => { painters.frost_brick(p); for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11], [7, 7], [8, 8]]) { p.set(x, y, hex('#e6fbff')); p.set(x + 1, y, hex('#9af6ff')); } },
  vent: (p) => { p.noise(['#3a5a78', '#2e4a66']); for (let i = 1; i < 15; i += 3) for (let j = 1; j < 15; j++) p.set(i, j, hex('#bff7ec')); p.border('#1f3a5a'); },
  glow_crystal: (p) => {
    p.clear();
    const cs = [p.glow ? '#b6fbff' : '#8feaff', '#5fd0f0', '#c9a2ff', '#ffffff'].map(hex);
    for (const [x0, w, h] of [[2, 3, 9], [6, 4, 13], [11, 3, 8]]) {
      for (let y = T - h; y < T; y++) for (let x = x0; x < x0 + w; x++) {
        const tip = y - (T - h) < Math.abs(x - x0 - (w - 1) / 2);
        if (!tip) p.set(x, y, cs[(x + y) % 3 === 0 ? 3 : Math.floor(p.r() * 3)]);
      }
    }
  },
  wool_blue: (p) => { p.noise(['#3b5bd6', '#3452c4', '#4466e0']); },
  vault: (p) => { painters.chamber_brick(p); for (let x = 4; x < 12; x++) for (let y = 4; y < 12; y++) p.set(x, y, hex(p.r() < 0.5 ? '#9ff6e0' : '#62d9c0')); p.border('#2b3530'); },
  iron_block: (p) => { p.noise(['#d6d9de', '#c8ccd2']); p.border('#9aa0a8'); },
  gold_block: (p) => { p.noise(['#f6d25a', '#f0c23a']); p.border('#b8871e'); },
  emberite_block: (p) => { p.noise(['#d9562a', '#e86a36', '#b8401c']); p.border('#5a2415'); p.speckle('#ffc07a', 5); },
  soul_block: (p) => { p.noise(['#58e1f0', '#7ff3ff', '#3cc6d8']); p.border('#1f7c8c'); p.speckle('#ffffff', 5); },
  ember_moss: (p) => { p.noise(['#b8371f', '#d24a24', '#9c2c18']); p.speckle('#ff9a4a', 6); },
  // Treasure Quest
  ruin_stone: (p) => { p.bricks('#8f8a74', '#5e5a4a', 8, 5); p.speckle('#6f8f4a', 5); },
  ruin_top: (p) => { p.noise(['#9a957e', '#8a8570', '#a6a18a']); p.speckle('#6f8f4a', 4); for (let i = 0; i < 16; i++) p.set(i, 7, hex('#6e6a58')); },
  quest_gate: (p) => {
    p.clear();
    for (let x = 1; x < 16; x += 4) for (let y = 0; y < 16; y++) { p.set(x, y, hex('#c9a24a')); p.set(x + 1, y, hex('#8a6a24')); }
    for (let x = 0; x < 16; x++) { p.set(x, 3, hex('#c9a24a')); p.set(x, 12, hex('#c9a24a')); }
  },
  checkpoint: (p) => { p.noise(['#2e5a8a', '#3a6aa0']); p.border('#1f3a5a'); for (let i = 4; i < 12; i++) for (let j = 4; j < 12; j++) if (Math.abs(i - 7.5) + Math.abs(j - 7.5) < 4.5) p.set(i, j, hex(p.glow ? '#b6fbff' : '#7ff3ff')); },
  jump_pad: (p) => { p.noise(['#3a8a3a', '#2f7a2c']); p.border('#1e4a1e'); for (let k = 0; k < 3; k++) for (let i = 0; i < 5; i++) { p.set(5 + i, 3 + k * 4 + i, hex('#b6ff7a')); p.set(10 - i, 3 + k * 4 + i, hex('#b6ff7a')); } },
  crumble: (p) => { p.noise(['#c9b27a', '#b89f66', '#d6c28c']); for (let k = 0; k < 5; k++) { let x = Math.floor(p.r() * 16), y = Math.floor(p.r() * 16); for (let i = 0; i < 6; i++) { p.set(x, y, hex('#6e5a34')); x += p.r() < 0.5 ? 1 : 0; y += 1; } } },
  lever_off: (p) => { painters.ruin_stone(p); for (let y = 4; y < 13; y++) { p.set(7, y, hex('#6b4a2f')); p.set(8, y, hex('#6b4a2f')); } for (let x = 6; x < 10; x++) for (let y = 11; y < 14; y++) p.set(x, y, hex('#3a3a40')); for (let x = 6; x < 10; x++) for (let y = 3; y < 6; y++) p.set(x, y, hex('#a1523e')); },
  lever_on: (p) => { painters.ruin_stone(p); for (let y = 4; y < 13; y++) { p.set(7, y, hex('#6b4a2f')); p.set(8, y, hex('#6b4a2f')); } for (let x = 6; x < 10; x++) for (let y = 2; y < 5; y++) p.set(x, y, hex('#3a3a40')); for (let x = 6; x < 10; x++) for (let y = 11; y < 14; y++) p.set(x, y, hex('#7fe36a')); },
  lamp_off: (p) => { p.noise(['#3a3530', '#45403a']); p.border('#1e1a16'); for (let i = 3; i < 13; i++) for (let j = 3; j < 13; j++) p.set(i, j, hex((i + j) % 4 ? '#5a4a30' : '#4a3a24')); },
  lamp_on: (p) => { p.noise(['#ffd36b', '#ffe08a']); p.border('#8a5b2a'); p.speckle('#fff8d0', 8); },
  tile_off: (p) => { p.noise(['#4a4f6a', '#565b78']); p.border('#2e3248'); },
  tile_lit: (p) => { p.noise(['#b98bff', '#d7b8ff']); p.border('#6d45d6'); p.speckle('#ffffff', 6); },
  tile_ok: (p) => { p.noise(['#6fe39a', '#8ff0b0']); p.border('#2a8a4a'); },
  trap: (p) => { painters.ruin_stone(p); for (let x = 5; x < 11; x++) for (let y = 5; y < 11; y++) p.set(x, y, hex('#1e1a16')); p.set(7, 7, hex('#3a3530')); p.set(8, 8, hex('#3a3530')); },
  trap_lit: (p) => { painters.ruin_stone(p); for (let x = 5; x < 11; x++) for (let y = 5; y < 11; y++) p.set(x, y, hex('#ff5a3a')); p.set(7, 7, hex('#ffd08a')); p.set(8, 8, hex('#ffd08a')); },
  chest_side: (p) => { p.noise(['#8a5a2a', '#7a4e24']); p.border('#3a2410'); for (let x = 0; x < 16; x++) p.set(x, 6, hex('#d8a22e')); for (let x = 6; x < 10; x++) for (let y = 5; y < 9; y++) p.set(x, y, hex('#ffe08a')); },
  chest_top: (p) => { p.noise(['#8a5a2a', '#7a4e24']); p.border('#d8a22e'); p.speckle('#ffe08a', 3); },
  gold_brick: (p) => { p.bricks('#f0c23a', '#a8781c', 8, 4); p.speckle('#fff4b0', 5); },
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
