// Item registry. Every placeable block is also an item with the same key.
import { BLOCKS, B } from '../world/blocks.js';

export const ITEMS = {};

const NOT_ITEMS = new Set(['air', 'water', 'magma', 'coreite', 'chamber_brick', 'chamber_lamp', 'void_crystal', 'vault',
  'quest_gate', 'checkpoint', 'jump_pad', 'crumble', 'lever_off', 'lever_on', 'lamp_off', 'lamp_on',
  'tile_off', 'tile_lit', 'tile_ok', 'trap', 'trap_lit', 'treasure_chest']);
for (const b of BLOCKS) {
  if (!b || NOT_ITEMS.has(b.key)) continue;
  ITEMS[b.key] = { key: b.key, block: b.id, stack: 64, kind: 'block' };
}

function item(key, o = {}) { ITEMS[key] = { key, stack: 64, kind: 'item', ...o }; }

item('stick');
item('charcoal');
item('fiber');
item('iron_ingot');
item('gold_ingot');
item('emberite_shard');
item('emberite_ingot');
item('soul_crystal', { currency: true });
item('arrow');
item('wind_charge', { stack: 16, throwable: 'wind' });
item('bone_dust');
item('void_scale', { stack: 16 });
item('shell_fragment', { stack: 16 });
item('whirl_core', { stack: 16 });
item('ember_heart', { stack: 16 });
item('storm_crown', { stack: 1 });
item('void_lantern', { stack: 1, special: 'map' });
// food: value in half-drumsticks, heal on eat
item('sunfruit', { food: 4 });
item('bread', { food: 5 });
item('glow_stew', { food: 8, stack: 8 });
item('roast', { food: 7 });
item('soul_heart', { stack: 8, heart: true });
// tools & weapons: damage in half-hearts
const tool = (key, o) => item(key, { stack: 1, ...o });
tool('wood_pickaxe', { tool: 'pick', tier: 1, speed: 2, damage: 2 });
tool('stone_pickaxe', { tool: 'pick', tier: 2, speed: 3.5, damage: 3 });
tool('iron_pickaxe', { tool: 'pick', tier: 3, speed: 5.5, damage: 4 });
tool('emberite_pickaxe', { tool: 'pick', tier: 4, speed: 8, damage: 5 });
tool('stone_axe', { tool: 'axe', tier: 2, speed: 4, damage: 4 });
tool('stone_shovel', { tool: 'shovel', tier: 2, speed: 4, damage: 2 });
tool('wood_sword', { weapon: 'sword', damage: 4 });
tool('stone_sword', { weapon: 'sword', damage: 5 });
tool('iron_sword', { weapon: 'sword', damage: 6 });
tool('gold_sword', { weapon: 'sword', damage: 6, emberBonus: 6 });
tool('emberite_sword', { weapon: 'sword', damage: 8, emberBonus: 8 });
tool('bow', { weapon: 'bow', damage: 5 });
tool('spear', { weapon: 'spear', damage: 7, throwable: 'spear' });
// Treasure Quest
item('treasure_map', { stack: 1, special: 'treasureMap' });
item('golden_key', { stack: 3, questKey: true });
tool('starfall_blade', { weapon: 'sword', damage: 12, emberBonus: 6, legendary: true });

export function itemDef(key) { return ITEMS[key]; }
export function maxStack(key) { return ITEMS[key] ? ITEMS[key].stack : 64; }

// What a broken block drops (item key or null).
export function blockDrop(id, rand = Math.random) {
  const b = BLOCKS[id];
  if (!b) return null;
  if (b.drop === 'none') {
    if (id === B.leaves && rand() < 0.06) return 'sunfruit';
    if (id === B.leaves && rand() < 0.08) return 'stick';
    if (id === B.tallgrass && rand() < 0.35) return 'fiber';
    return null;
  }
  return b.drop || b.key;
}
