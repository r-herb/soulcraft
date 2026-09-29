// Shaped crafting recipes for the 3x3 grid, plus matching and auto-fill.
import { maxStack } from './items.js';

const K = {
  L: 'log', P: 'planks', S: 'stick', C: 'charcoal', R: 'rubble', I: 'iron_ingot', G: 'gold_ingot',
  E: 'emberite_ingot', e: 'emberite_shard', F: 'fiber', D: 'sand', A: 'ashstone', W: 'glowbell', g: 'glass',
  s: 'spiritstone', V: 'void_scale', T: 'stone', w: 'wool',
  t: 'tomato', r: 'rice', f: 'sardine', O: 'olive_oil', u: 'flour',
};

function r(id, pattern, out, count = 1, extra = {}) {
  const rows = pattern.map((row) => row.split('').map((c) => (c === ' ' ? null : K[c])));
  return { id, rows, out, count, w: rows[0].length, h: rows.length, ...extra };
}

export const RECIPES = [
  r('planks', ['L'], 'planks', 4),
  r('stick', ['P', 'P'], 'stick', 4),
  r('workbench', ['PP', 'PP'], 'workbench'),
  r('torch', ['C', 'S'], 'torch', 4),
  r('wood_pickaxe', ['PPP', ' S ', ' S '], 'wood_pickaxe'),
  r('stone_pickaxe', ['RRR', ' S ', ' S '], 'stone_pickaxe'),
  r('iron_pickaxe', ['III', ' S ', ' S '], 'iron_pickaxe'),
  r('emberite_pickaxe', ['EEE', ' S ', ' S '], 'emberite_pickaxe'),
  r('stone_axe', ['RR', 'RS', ' S'], 'stone_axe'),
  r('stone_shovel', ['R', 'S', 'S'], 'stone_shovel'),
  r('wood_sword', ['P', 'P', 'S'], 'wood_sword'),
  r('stone_sword', ['R', 'R', 'S'], 'stone_sword'),
  r('iron_sword', ['I', 'I', 'S'], 'iron_sword'),
  r('gold_sword', ['G', 'G', 'S'], 'gold_sword'),
  r('emberite_sword', ['E', 'E', 'S'], 'emberite_sword'),
  r('bow', [' SF', 'S F', ' SF'], 'bow'),
  r('arrow', ['R', 'S', 'F'], 'arrow', 4),
  r('spear', ['  I', ' S ', 'S  '], 'spear'),
  r('emberite_ingot', ['ee', 'eG'], 'emberite_ingot'),
  r('glass', ['DD', 'DD'], 'glass', 4),
  r('sandstone', ['D', 'D'], 'sandstone', 2),
  r('brick', ['RD', 'DR'], 'brick', 4),
  r('ember_lamp', ['A', 'C', 'A'], 'ember_lamp', 2),
  r('glow_stew', ['WW', 'PP'], 'glow_stew'),
  // Malaga's kitchen (the charcoal is the fire)
  r('espetos', ['f', 'S', 'C'], 'espetos'),
  r('gazpacho', ['tt', 'tO'], 'gazpacho'),
  r('paella', ['rfr', 'tOt', ' C '], 'paella', 2),
  r('churros', ['uu', 'OC'], 'churros', 2),
  r('iron_block', ['III', 'III', 'III'], 'iron_block'),
  r('gold_block', ['GGG', 'GGG', 'GGG'], 'gold_block'),
  r('void_lantern', ['gIg', 'ICI', 'gIg'], 'void_lantern', 1, { crystals: 12 }),
  r('soul_glass', ['gs', 'sg'], 'soul_glass', 2),
];

// grid: array of 9 {item,count}|null (3x3, row-major)
export function matchRecipe(grid) {
  let minX = 3, minY = 3, maxX = -1, maxY = -1;
  for (let i = 0; i < 9; i++) if (grid[i]) {
    const x = i % 3, y = Math.floor(i / 3);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  for (const rec of RECIPES) {
    if (rec.w !== w || rec.h !== h) continue;
    let ok = true;
    for (let y = 0; y < h && ok; y++) for (let x = 0; x < w; x++) {
      const need = rec.rows[y][x];
      const have = grid[(minY + y) * 3 + minX + x];
      if ((need || null) !== (have ? have.item : null)) { ok = false; break; }
    }
    if (ok) return rec;
  }
  return null;
}

export function recipeNeeds(rec) {
  const need = {};
  for (const row of rec.rows) for (const c of row) if (c) need[c] = (need[c] || 0) + 1;
  return need;
}

export function canAfford(rec, inv, crystals = 0) {
  const need = recipeNeeds(rec);
  for (const k in need) if (inv.count(k) < need[k]) return false;
  if (rec.crystals && crystals < rec.crystals) return false;
  return true;
}

export { maxStack };
