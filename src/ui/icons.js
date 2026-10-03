// Procedural item icons (16x16 pixel sprites), pixel hearts, and the SVG
// glyphs used on HUD buttons.
import { ITEMS } from '../player/items.js';
import { BLOCKS, TILE } from '../world/blocks.js';
import { drawBlockIcon, drawFlatTile } from '../engine/atlas.js';

let atlasCanvas = null;
const cache = new Map();
export function setIconAtlas(canvas) { atlasCanvas = canvas; cache.clear(); }

function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
function line(ctx, x0, y0, x1, y1, c, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    ctx.fillStyle = c; ctx.fillRect(x, y, w, w);
  }
}
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function outline(ctx) {
  // 1px dark outline around opaque pixels for readability
  const d = ctx.getImageData(0, 0, 16, 16);
  const out = ctx.createImageData(16, 16);
  out.data.set(d.data);
  const a = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15 ? 0 : d.data[(y * 16 + x) * 4 + 3]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (a(x, y)) continue;
    if (a(x + 1, y) || a(x - 1, y) || a(x, y + 1) || a(x, y - 1)) {
      const i = (y * 16 + x) * 4;
      out.data[i] = 10; out.data[i + 1] = 8; out.data[i + 2] = 24; out.data[i + 3] = 200;
    }
  }
  ctx.putImageData(out, 0, 0);
}

const MAT = {
  wood: ['#b08452', '#7a5530'], stone: ['#9a9ca3', '#62646b'], iron: ['#e6e9ee', '#9aa0a8'],
  gold: ['#ffe08a', '#d8a22e'], emberite: ['#ff8a3d', '#b8401c'],
  leather: ['#a0663a', '#6b4022'], diamond: ['#7ff3f0', '#2aa9b8'],
};
// armor pieces and the shield
function helmet(c, m) { const [a, b] = MAT[m]; rect(c, 3, 4, 10, 4, a); rect(c, 3, 8, 3, 3, a); rect(c, 10, 8, 3, 3, a); rect(c, 4, 5, 8, 1, '#ffffff55'); rect(c, 3, 7, 10, 1, b); }
function chestplate(c, m) { const [a, b] = MAT[m]; rect(c, 2, 3, 4, 4, a); rect(c, 10, 3, 4, 4, a); rect(c, 4, 5, 8, 9, a); rect(c, 6, 3, 4, 2, '#00000000'); rect(c, 7, 6, 2, 7, b); rect(c, 5, 6, 1, 1, '#ffffff66'); }
function leggings(c, m) { const [a, b] = MAT[m]; rect(c, 4, 3, 8, 3, a); rect(c, 4, 6, 3, 8, a); rect(c, 9, 6, 3, 8, a); rect(c, 4, 5, 8, 1, b); }
function boots(c, m) { const [a, b] = MAT[m]; rect(c, 3, 8, 3, 5, a); rect(c, 10, 8, 3, 5, a); rect(c, 2, 12, 4, 2, b); rect(c, 10, 12, 4, 2, b); }
const ARMOR_DRAW = {};
for (const m of ['leather', 'gold', 'iron', 'diamond', 'emberite']) Object.assign(ARMOR_DRAW, { [`${m}_helmet`]: (c) => helmet(c, m), [`${m}_chestplate`]: (c) => chestplate(c, m), [`${m}_leggings`]: (c) => leggings(c, m), [`${m}_boots`]: (c) => boots(c, m) });

function sword(ctx, m) {
  const [a, b] = MAT[m];
  line(ctx, 4, 11, 12, 3, a, 2);
  line(ctx, 5, 11, 12, 4, b);
  px(ctx, 13, 2, a);
  line(ctx, 2, 9, 6, 13, '#4d3421', 2);
  line(ctx, 1, 13, 3, 11, '#6b4a2f', 2);
  px(ctx, 1, 14, '#2b1d12');
}
function pick(ctx, m) {
  const [a, b] = MAT[m];
  line(ctx, 3, 13, 11, 5, '#7a5530', 2);
  line(ctx, 3, 3, 13, 3, a, 2);
  line(ctx, 3, 3, 1, 6, a, 2);
  line(ctx, 13, 3, 14, 6, a, 2);
  line(ctx, 4, 4, 12, 4, b);
}
function axe(ctx, m) {
  const [a, b] = MAT[m];
  line(ctx, 3, 13, 11, 5, '#7a5530', 2);
  rect(ctx, 9, 2, 4, 5, a); rect(ctx, 12, 3, 2, 3, b); rect(ctx, 8, 4, 2, 2, b);
}
function shovel(ctx, m) {
  const [a, b] = MAT[m];
  line(ctx, 3, 13, 10, 6, '#7a5530', 2);
  rect(ctx, 10, 2, 4, 4, a); rect(ctx, 9, 4, 2, 3, a); rect(ctx, 12, 3, 1, 2, b);
}
function ingot(ctx, a, b) {
  rect(ctx, 3, 7, 11, 5, a); rect(ctx, 4, 6, 9, 1, a); rect(ctx, 3, 11, 11, 1, b); rect(ctx, 5, 7, 5, 1, '#ffffff66');
}
function gem(ctx, a, b) {
  rect(ctx, 6, 3, 4, 10, a); rect(ctx, 4, 5, 8, 6, a); rect(ctx, 7, 4, 2, 3, '#ffffff'); rect(ctx, 5, 10, 6, 1, b); rect(ctx, 6, 12, 4, 1, b);
}

const DRAW = {
  stick: (c) => line(c, 4, 13, 12, 3, '#8a6238', 2),
  charcoal: (c) => { rect(c, 4, 5, 8, 7, '#2a2a30'); rect(c, 5, 4, 5, 1, '#3c3c44'); rect(c, 6, 6, 2, 2, '#55555e'); },
  fiber: (c) => { line(c, 5, 14, 7, 3, '#6fbf4a'); line(c, 8, 14, 9, 4, '#4f9e3c'); line(c, 10, 14, 12, 5, '#6fbf4a'); },
  iron_ingot: (c) => ingot(c, '#dfe3e8', '#9aa0a8'),
  gold_ingot: (c) => ingot(c, '#ffd65c', '#c48f2e'),
  diamond: (c) => gem(c, '#7ff3f0', '#2aa9b8'),
  quartz: (c) => gem(c, '#f4f4f4', '#bdbdbd'),
  amethyst: (c) => gem(c, '#b57edc', '#6c3483'),
  topaz: (c) => gem(c, '#f8c471', '#b9770e'),
  emerald: (c) => gem(c, '#2ecc71', '#1e8449'),
  sapphire: (c) => gem(c, '#5b8def', '#1a3f8a'),
  ruby: (c) => gem(c, '#f1467a', '#8a1238'),
  grand_diamond: (c) => { gem(c, '#b6fbff', '#2aa9b8'); rect(c, 2, 7, 2, 2, '#ffffff'); rect(c, 12, 4, 2, 2, '#ffffff'); px(c, 13, 12, '#ffffff'); },
  guard_uniform: (c) => { rect(c, 4, 3, 8, 11, '#2f4f6f'); rect(c, 2, 4, 3, 6, '#2f4f6f'); rect(c, 11, 4, 3, 6, '#2f4f6f'); rect(c, 7, 3, 2, 5, '#d6e4ff'); px(c, 5, 6, '#ffd65c'); px(c, 10, 6, '#ffd65c'); rect(c, 4, 11, 8, 1, '#111111'); },
  firecracker: (c) => { rect(c, 6, 5, 4, 9, '#d24a24'); rect(c, 6, 7, 4, 1, '#ffd65c'); rect(c, 6, 11, 4, 1, '#ffd65c'); line(c, 8, 5, 10, 2, '#8a6238'); px(c, 11, 1, '#ffb02a'); px(c, 10, 1, '#fff08a'); },
  sewer_key: (c) => { rect(c, 3, 3, 5, 5, '#9aa0a8'); rect(c, 4, 4, 3, 3, '#3b3f45'); rect(c, 7, 5, 7, 2, '#9aa0a8'); rect(c, 11, 7, 1, 3, '#9aa0a8'); rect(c, 13, 7, 1, 2, '#9aa0a8'); },
  vault_code: (c) => { rect(c, 3, 2, 10, 12, '#f0e6d2'); rect(c, 3, 2, 10, 2, '#d24a24'); for (const y of [6, 8, 10]) line(c, 5, y, 11, y, '#5a4a3a'); px(c, 11, 12, '#d24a24'); },
  heist_map: (c) => { rect(c, 2, 3, 12, 10, '#1f4e9c'); rect(c, 3, 4, 10, 8, '#2a62bd'); line(c, 4, 6, 12, 6, '#d6e4ff'); line(c, 6, 4, 6, 11, '#d6e4ff'); line(c, 9, 8, 11, 10, '#ff5a6e', 2); line(c, 11, 8, 9, 10, '#ff5a6e', 2); },
  orange_seed: (c) => { for (const [x, y] of [[5, 7], [9, 6], [7, 10], [11, 10]]) { rect(c, x, y, 2, 3, '#f2e3b5'); px(c, x, y, '#fff6d8'); } },
  ...ARMOR_DRAW,
  leather: (c) => { rect(c, 3, 4, 10, 9, '#a0663a'); rect(c, 4, 5, 8, 7, '#b5784a'); px(c, 3, 4, '#00000000'); line(c, 5, 7, 10, 7, '#8a5530'); },
  shield: (c) => { rect(c, 3, 2, 10, 9, '#b08452'); rect(c, 4, 11, 8, 2, '#b08452'); rect(c, 6, 13, 4, 1, '#b08452'); rect(c, 7, 2, 2, 12, '#9aa0a8'); rect(c, 3, 5, 10, 2, '#9aa0a8'); rect(c, 7, 5, 2, 2, '#e6e9ee'); },
  gold_nugget: (c) => { rect(c, 5, 7, 6, 5, '#e8b93a'); rect(c, 6, 6, 4, 1, '#ffd65c'); rect(c, 7, 8, 2, 2, '#fff1b0'); px(c, 4, 9, '#c48f2e'); px(c, 11, 10, '#c48f2e'); },
  gold_pan: (c) => { rect(c, 2, 8, 12, 3, '#9aa0a8'); rect(c, 3, 11, 10, 1, '#6b7078'); rect(c, 4, 7, 8, 1, '#c9ccd2'); px(c, 7, 9, '#ffd65c'); px(c, 9, 9, '#ffd65c'); line(c, 13, 8, 15, 6, '#7a5530', 2); },
  coin: (c) => { rect(c, 4, 3, 8, 10, '#e8b93a'); rect(c, 3, 4, 10, 8, '#e8b93a'); rect(c, 5, 5, 6, 6, '#ffd65c'); rect(c, 7, 6, 2, 4, '#c48f2e'); },
  emberite_ingot: (c) => ingot(c, '#ff8a3d', '#a8381a'),
  emberite_shard: (c) => { line(c, 5, 12, 10, 3, '#ff8a3d', 2); line(c, 8, 12, 12, 6, '#ffb14a', 2); },
  soul_crystal: (c) => gem(c, '#7ff3ff', '#1f9fb8'),
  arrow: (c) => { line(c, 3, 13, 12, 4, '#8a6238'); rect(c, 11, 3, 3, 3, '#c9ccd2'); line(c, 2, 12, 4, 14, '#f0f0f0'); px(c, 3, 11, '#f0f0f0'); },
  wind_charge: (c) => { rect(c, 4, 4, 8, 8, '#bff7ec'); rect(c, 5, 5, 6, 6, '#7fe3d2'); line(c, 6, 8, 9, 6, '#ffffff'); line(c, 7, 10, 10, 8, '#ffffff'); },
  bone_dust: (c) => { rect(c, 4, 8, 8, 4, '#e8e2d0'); rect(c, 6, 6, 4, 2, '#f4efe0'); },
  void_scale: (c) => { rect(c, 4, 4, 8, 8, '#6d45d6'); rect(c, 5, 5, 6, 6, '#9a6bff'); rect(c, 6, 6, 2, 2, '#d7b8ff'); },
  shell_fragment: (c) => { rect(c, 3, 6, 10, 6, '#b6fbff'); rect(c, 4, 5, 8, 1, '#7ff3ff'); line(c, 5, 11, 8, 6, '#1f9fb8'); line(c, 8, 11, 11, 6, '#1f9fb8'); },
  whirl_core: (c) => { rect(c, 4, 4, 8, 8, '#7fe3d2'); rect(c, 6, 6, 4, 4, '#ffffff'); },
  ember_heart: (c) => heartShape(c, '#ff7a2e', '#ffd08a'),
  storm_crown: (c) => { rect(c, 3, 8, 10, 4, '#f6c667'); px(c, 3, 6, '#f6c667'); px(c, 3, 7, '#f6c667'); rect(c, 7, 5, 2, 3, '#f6c667'); px(c, 12, 6, '#f6c667'); px(c, 12, 7, '#f6c667'); rect(c, 7, 9, 2, 2, '#7ff3ff'); },
  void_lantern: (c) => { rect(c, 5, 4, 6, 9, '#3a2566'); rect(c, 6, 5, 4, 7, '#b98bff'); rect(c, 7, 6, 2, 4, '#ffffff'); rect(c, 7, 2, 2, 2, '#9aa0a8'); },
  sunfruit: (c) => { rect(c, 4, 5, 8, 8, '#ff9a3c'); rect(c, 5, 4, 6, 10, '#ff9a3c'); rect(c, 6, 6, 2, 2, '#ffe08a'); rect(c, 8, 2, 1, 3, '#4d3421'); rect(c, 9, 2, 2, 1, '#58ad42'); },
  bread: (c) => { rect(c, 2, 7, 12, 5, '#c98a3e'); rect(c, 3, 6, 10, 1, '#dea35a'); line(c, 5, 7, 6, 9, '#8a5a24'); line(c, 9, 7, 10, 9, '#8a5a24'); },
  glow_stew: (c) => { rect(c, 3, 8, 10, 5, '#7a5530'); rect(c, 3, 7, 10, 2, '#7ff3ff'); px(c, 6, 7, '#ffffff'); px(c, 10, 8, '#b6fbff'); },
  wheat_seeds: (c) => { for (const [x, y] of [[5, 6], [8, 5], [10, 8], [6, 10], [9, 11], [12, 12], [4, 12]]) { rect(c, x, y, 2, 2, '#c9b25a'); px(c, x, y, '#e8d27a'); } },
  tomato_seeds: (c) => { rect(c, 4, 4, 8, 9, '#f2eee4'); rect(c, 5, 6, 6, 4, '#e0342a'); px(c, 7, 11, '#c9b25a'); px(c, 9, 11, '#c9b25a'); },
  wheat: (c) => { for (const x of [5, 8, 11]) { line(c, x, 14, x, 6, '#caa648'); rect(c, x - 1, 3, 2, 4, '#f2d77a'); } line(c, 4, 11, 12, 11, '#8a6a3a'); },
  carrot: (c) => { line(c, 5, 12, 11, 5, '#f08a24', 3); rect(c, 10, 2, 2, 3, '#58ad42'); rect(c, 12, 3, 2, 2, '#4c9a3a'); },
  egg: (c) => { rect(c, 5, 5, 6, 8, '#f4ecd8'); rect(c, 6, 3, 4, 2, '#f4ecd8'); rect(c, 4, 7, 8, 4, '#f4ecd8'); px(c, 6, 6, '#ffffff'); },
  raw_chicken: (c) => { rect(c, 4, 5, 8, 6, '#f2b8a8'); rect(c, 10, 9, 4, 2, '#f2b8a8'); rect(c, 13, 8, 1, 4, '#f0e6d0'); },
  raw_mutton: (c) => { rect(c, 4, 5, 8, 7, '#d8584a'); rect(c, 5, 6, 3, 2, '#f0d0c0'); line(c, 11, 11, 14, 14, '#f0e6d0', 2); },
  raw_beef: (c) => { rect(c, 3, 5, 10, 7, '#c0392b'); rect(c, 5, 7, 3, 2, '#f0d0c0'); rect(c, 9, 6, 2, 2, '#e8a090'); },
  chicken_crate: (c) => { rect(c, 2, 7, 12, 7, '#a8753a'); line(c, 2, 10, 13, 10, '#7a5226'); rect(c, 6, 3, 4, 4, '#f4f4f4'); px(c, 9, 3, '#e0342a'); px(c, 10, 5, '#f2b632'); },
  sheep_crate: (c) => { rect(c, 2, 7, 12, 7, '#a8753a'); line(c, 2, 10, 13, 10, '#7a5226'); rect(c, 4, 3, 7, 4, '#f0f0f0'); rect(c, 10, 3, 3, 3, '#3a3a3a'); },
  cow_crate: (c) => { rect(c, 2, 7, 12, 7, '#a8753a'); line(c, 2, 10, 13, 10, '#7a5226'); rect(c, 4, 3, 7, 4, '#f4f4f4'); rect(c, 6, 3, 2, 2, '#3a2a1a'); rect(c, 10, 2, 3, 4, '#5a3a24'); },
  tomato: (c) => { rect(c, 4, 6, 8, 7, '#e0342a'); rect(c, 3, 7, 10, 5, '#e0342a'); rect(c, 5, 7, 2, 2, '#ff8a7a'); rect(c, 6, 4, 4, 2, '#3f9a3a'); px(c, 8, 3, '#2e7a2c'); },
  orange: (c) => { rect(c, 4, 5, 8, 8, '#ff8c1a'); rect(c, 3, 6, 10, 6, '#ff8c1a'); rect(c, 5, 6, 2, 2, '#ffc27a'); rect(c, 8, 3, 3, 2, '#3f9a3a'); },
  rice: (c) => { rect(c, 4, 4, 8, 10, '#e8dcc0'); rect(c, 4, 4, 8, 2, '#c2a878'); for (let i = 0; i < 6; i++) px(c, 5 + (i * 3) % 6, 8 + (i % 3) * 2, '#ffffff'); },
  sardine: (c) => { rect(c, 3, 7, 9, 3, '#9fb4c8'); rect(c, 4, 6, 7, 1, '#6f879e'); line(c, 12, 8, 14, 6, '#6f879e'); line(c, 12, 8, 14, 10, '#6f879e'); px(c, 4, 8, '#111111'); },
  olive_oil: (c) => { rect(c, 6, 5, 4, 9, '#b8b83a'); rect(c, 7, 2, 2, 3, '#4d6b2a'); rect(c, 6, 8, 4, 3, '#e8e070'); },
  flour: (c) => { rect(c, 4, 5, 8, 9, '#f2eee4'); rect(c, 5, 3, 6, 2, '#d8d0bc'); rect(c, 6, 8, 4, 3, '#c9a06a'); },
  espetos: (c) => { line(c, 2, 13, 14, 3, '#8a6a3a'); rect(c, 5, 8, 5, 2, '#7a8c9a'); rect(c, 8, 6, 5, 2, '#7a8c9a'); px(c, 6, 8, '#3a2a1a'); px(c, 9, 6, '#3a2a1a'); },
  gazpacho: (c) => { rect(c, 3, 8, 10, 5, '#e8e0d0'); rect(c, 4, 7, 8, 2, '#e04a2a'); px(c, 6, 7, '#6fbf4a'); px(c, 9, 8, '#f0f0a0'); },
  paella: (c) => { rect(c, 2, 8, 12, 4, '#3a3a3a'); rect(c, 3, 7, 10, 3, '#f2b632'); px(c, 5, 8, '#e0342a'); px(c, 9, 7, '#e0342a'); px(c, 7, 8, '#6fbf4a'); px(c, 11, 8, '#9fb4c8'); line(c, 1, 9, 0, 9, '#3a3a3a'); },
  churros: (c) => { line(c, 3, 12, 11, 4, '#c98a3e', 2); line(c, 6, 13, 13, 6, '#dea35a', 2); px(c, 5, 10, '#f2e6c8'); px(c, 9, 8, '#f2e6c8'); },
  roast: (c) => { rect(c, 4, 5, 8, 7, '#a8452a'); rect(c, 5, 6, 3, 2, '#d8744a'); line(c, 11, 11, 14, 14, '#f0e6d0', 2); },
  soul_heart: (c) => heartShape(c, '#7ff3ff', '#ffffff'),
  wood_pickaxe: (c) => pick(c, 'wood'), stone_pickaxe: (c) => pick(c, 'stone'), iron_pickaxe: (c) => pick(c, 'iron'), emberite_pickaxe: (c) => pick(c, 'emberite'),
  stone_axe: (c) => axe(c, 'stone'), stone_shovel: (c) => shovel(c, 'stone'),
  wood_sword: (c) => sword(c, 'wood'), stone_sword: (c) => sword(c, 'stone'), iron_sword: (c) => sword(c, 'iron'),
  gold_sword: (c) => sword(c, 'gold'), emberite_sword: (c) => sword(c, 'emberite'),
  bow: (c) => { line(c, 4, 2, 11, 5, '#8a6238', 2); line(c, 11, 5, 12, 11, '#8a6238', 2); line(c, 12, 11, 5, 14, '#8a6238', 2); line(c, 4, 3, 5, 13, '#e8e8e8'); },
  treasure_map: (c) => { rect(c, 2, 3, 12, 10, '#e8d5a0'); rect(c, 2, 3, 12, 1, '#c9a86a'); rect(c, 2, 12, 12, 1, '#c9a86a'); line(c, 4, 10, 7, 7, '#8a5a2a'); line(c, 7, 7, 9, 9, '#8a5a2a'); line(c, 10, 5, 12, 7, '#d24a24'); line(c, 12, 5, 10, 7, '#d24a24'); },
  golden_key: (c) => { rect(c, 3, 3, 5, 5, '#ffd65c'); rect(c, 4, 4, 3, 3, '#8a6a24'); line(c, 7, 7, 13, 13, '#ffd65c', 2); rect(c, 11, 12, 2, 2, '#ffd65c'); rect(c, 12, 10, 2, 2, '#ffd65c'); },
  frost_orb: (c) => { rect(c, 5, 4, 6, 8, '#9af6ff'); rect(c, 4, 5, 8, 6, '#9af6ff'); rect(c, 6, 5, 3, 3, '#ffffff'); rect(c, 9, 9, 2, 2, '#5fb8e0'); },
  frostbrand: (c) => { line(c, 4, 11, 13, 2, '#e6fbff', 2); line(c, 5, 11, 13, 3, '#9af6ff'); px(c, 14, 1, '#ffffff'); px(c, 9, 5, '#ffffff'); px(c, 11, 4, '#bfe6f5'); line(c, 2, 9, 6, 13, '#6aa9c8', 2); line(c, 1, 13, 3, 11, '#1f3a5a', 2); px(c, 1, 14, '#9af6ff'); },
  starfall_blade: (c) => { line(c, 4, 11, 13, 2, '#b6fbff', 2); line(c, 5, 11, 13, 3, '#7ff3ff'); px(c, 14, 1, '#ffffff'); px(c, 10, 3, '#ffffff'); px(c, 12, 6, '#fff08a'); line(c, 2, 9, 6, 13, '#f6c667', 2); line(c, 1, 13, 3, 11, '#6d45d6', 2); px(c, 1, 14, '#b98bff'); },
  spear: (c) => { line(c, 2, 14, 11, 5, '#7a5530', 2); rect(c, 11, 2, 3, 3, '#dfe3e8'); rect(c, 12, 3, 2, 2, '#9aa0a8'); px(c, 14, 1, '#ffffff'); },
};

function heartShape(c, a, hi) {
  const rows = ['.XX..XX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...'];
  rows.forEach((r, y) => r.split('').forEach((ch, x) => { if (ch === 'X') rect(c, 2 + x * 1.5 | 0, 3 + y * 1.5 | 0, 2, 2, a); }));
  rect(c, 4, 5, 2, 2, hi);
}

export function iconCanvas(key, size = 32) {
  const ck = key + '@' + size;
  if (cache.has(ck)) return cache.get(ck);
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const def = ITEMS[key];
  if (def && def.block !== undefined && atlasCanvas) {
    const b = BLOCKS[def.block];
    if (b.shape === 'cross' || b.shape === 'torch') drawFlatTile(ctx, atlasCanvas, b.tex.side, size);
    else drawBlockIcon(ctx, atlasCanvas, b.tex, size);
  } else if (DRAW[key]) {
    const s = document.createElement('canvas');
    s.width = 16; s.height = 16;
    const sc = s.getContext('2d');
    DRAW[key](sc);
    outline(sc);
    ctx.drawImage(s, 0, 0, size, size);
  } else {
    ctx.fillStyle = '#ff00ff'; ctx.fillRect(size / 4, size / 4, size / 2, size / 2);
  }
  cache.set(ck, cv);
  return cv;
}

export function iconInto(el, key, size = 32) {
  const src = iconCanvas(key, size);
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  cv.getContext('2d').drawImage(src, 0, 0);
  el.appendChild(cv);
  return cv;
}

export function iconDataURL(key, size = 32) { return iconCanvas(key, size).toDataURL(); }

// Pixel heart / food sprites (full, half, empty) as data URLs.
const spriteCache = {};
export function statSprite(kind, state) {
  const k = kind + state;
  if (spriteCache[k]) return spriteCache[k];
  const c = document.createElement('canvas');
  c.width = 9; c.height = 9;
  const x = c.getContext('2d');
  const heart = ['.XX.XX...', 'XXXXXXX..', 'XXXXXXX..', '.XXXXX...', '..XXX....', '...X.....'];
  const food = ['....XX...', '...XXXX..', '..XXXXX..', '..XXXX...', '.XXX.....', 'XX.......', 'X........'];
  const shape = kind === 'heart' ? heart : food;
  const full = kind === 'heart' ? (state.startsWith('soul') ? '#7ff3ff' : '#ff4d6d') : '#e0a24a';
  const empty = '#1b1636';
  shape.forEach((row, yy) => row.split('').forEach((ch, xx) => {
    if (ch !== 'X') return;
    let col = empty;
    if (state === 'full' || state === 'soulfull') col = full;
    else if ((state === 'half' || state === 'soulhalf') && xx < 4) col = full;
    x.fillStyle = '#05040f'; x.fillRect(xx, yy + 1, 1, 1);
    x.fillStyle = col; x.fillRect(xx, yy, 1, 1);
  }));
  if (state !== 'empty') { x.fillStyle = '#ffffffaa'; x.fillRect(1, 1, 1, 1); }
  spriteCache[k] = c.toDataURL();
  return spriteCache[k];
}

export const SVG = {
  view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="7" r="3.2"/><path d="M6.5 20v-3.5a5.5 5.5 0 0 1 11 0V20"/><path d="M2.5 12.5l2-2M21.5 12.5l-2-2"/></svg>',
  emote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M8 14.5c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4"/><path d="M9 9.5v.5M15 9.5v.5"/></svg>',
  shirt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 1.8-2 3-4 3s-3.5-1.2-4-3z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  fly: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4c-2 3-6 4-10 4 2 3 5 5 8 5l2 7 2-7c3 0 6-2 8-5-4 0-8-1-10-4z"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l8-9h-5V4H9v8H4z"/></svg>',
  jump: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l8 9h-5v8H9v-8H4z"/></svg>',
  attack: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h12l3 3-3 3H3l2-3zM9 11h3v10H9z"/></svg>',
  use: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l9 5v10l-9 5-9-5V7z" opacity="0.9"/><path d="M12 12l9-5M12 12v10M12 12L3 7" stroke="#05040f" stroke-width="1.5" fill="none"/></svg>',
  inv: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M8.5 9a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.2-1.5 2.3v.5"/><path d="M12 18.5v.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 5l14 14M19 5L5 19"/></svg>',
  crystal: '<svg viewBox="0 0 12 12"><path d="M6 0l4 4-4 8-4-8z" fill="#7ff3ff"/><path d="M6 0l1 4-1 8" fill="#b6fbff"/></svg>',
  phone: '<svg viewBox="0 0 64 64" fill="none" stroke="#7ff3ff" stroke-width="4"><rect x="18" y="6" width="28" height="52" rx="4"/><path d="M28 50h8"/></svg>',
};
