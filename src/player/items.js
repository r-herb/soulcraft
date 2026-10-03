// Item registry. Every placeable block is also an item with the same key.
import { BLOCKS, B } from '../world/blocks.js';

export const ITEMS = {};

const NOT_ITEMS = new Set(['farmland', 'wheat_0', 'wheat_1', 'wheat_2', 'wheat_3', 'tomato_0', 'tomato_1', 'tomato_2', 'tomato_3', 'carrot_0', 'carrot_1', 'carrot_2', 'carrot_3', 'orange_0', 'orange_1', 'orange_2', 'orange_3', 'air', 'water', 'magma', 'coreite', 'chamber_brick', 'chamber_lamp', 'void_crystal', 'vault',
  'quest_gate', 'checkpoint', 'jump_pad', 'crumble', 'lever_off', 'lever_on', 'lamp_off', 'lamp_on',
  'tile_off', 'tile_lit', 'tile_ok', 'trap', 'trap_lit', 'treasure_chest',
  'blink_on', 'blink_off', 'plate_off', 'plate_on', 'jet', 'jet_lit', 'vent',
  'bank_counter', 'bank_stone', 'bank_sign', 'vault_door', 'vault_floor', 'bank_lamp', 'gem_cache', 'gem_cache_open', 'weak_wall', 'grand_diamond', 'vault_gold', 'sewer_grate',
  'soft_earth', 'factory_door', 'fab_sign', 'money_press', 'money_press_on', 'paper_stack', 'ink_barrel', 'red_phone', 'cash_pallet']);
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
item('diamond');
// gems, cheap to precious (see src/world/gems.js), and gold from panning
for (const g of ['quartz', 'amethyst', 'topaz', 'emerald', 'sapphire', 'ruby']) item(g, { gem: true });
ITEMS.diamond.gem = true;
item('gold_nugget');
item('gold_pan', { stack: 1, special: 'pan' });
// the Gran Diamante from the vault of the Banco de España
item('grand_diamond', { stack: 1 });
item('heist_map', { stack: 1, special: 'heistMap' });
// the other ways into the vault (from the big mission's informants)
item('guard_uniform', { stack: 1, special: 'uniform' });
item('firecracker', { stack: 8, special: 'firecracker' });
item('sewer_key', { stack: 1 });
item('vault_code', { stack: 1 });
// La Fábrica: paper and ink for the presses, the printed money in bags
item('paper_roll', { stack: 16 });
item('ink_can', { stack: 16 });
item('money_bag', { stack: 16 });
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
// Malaga's kitchen: ingredients from the food shops, dishes cooked at a workbench
item('tomato', { food: 2 });
// farming and livestock
item('wheat_seeds', { plant: 'wheat' });
item('tomato_seeds', { plant: 'tomato' });
// a pip from the leaves of a tree: it grows into an orange bush that fruits again and again
item('orange_seed', { plant: 'orange' });
item('wheat');
item('egg', { stack: 16 });
item('raw_chicken', { food: 2 });
item('raw_mutton', { food: 2 });
item('raw_beef', { food: 3 });
item('chicken_crate', { stack: 4, animal: 'chicken' });
item('sheep_crate', { stack: 4, animal: 'sheep' });
item('cow_crate', { stack: 4, animal: 'cow' });
item('orange', { food: 3 });
item('carrot', { food: 3, plant: 'carrot' });
item('rice');
item('sardine', { food: 1 });
item('olive_oil', { stack: 16 });
item('flour');
item('espetos', { food: 7 });
item('gazpacho', { food: 8, stack: 8 });
item('paella', { food: 10, stack: 8 });
item('churros', { food: 5 });
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
// armor (as in the classic game): armor points per piece, durability in hits
// taken; leather from cows, then iron, gold, diamond and emberite
export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'];
const ARMOR = {
  leather: { points: [1, 3, 2, 1], dura: [55, 80, 75, 65] },
  gold: { points: [2, 5, 3, 1], dura: [77, 112, 105, 91] },
  iron: { points: [2, 6, 5, 2], dura: [165, 240, 225, 195] },
  diamond: { points: [3, 8, 6, 3], dura: [363, 528, 495, 429] },
  emberite: { points: [3, 8, 6, 3], dura: [407, 592, 555, 481], tough: 3 },
};
const PIECES = ['helmet', 'chestplate', 'leggings', 'boots'];
item('leather');
for (const [m, a] of Object.entries(ARMOR)) PIECES.forEach((p, i) => tool(`${m}_${p}`, { armor: ARMOR_SLOTS[i], points: a.points[i], dura: a.dura[i], tough: a.tough || 0, material: m }));
// a shield: held and raised (hold use) it stops blows from the front
tool('shield', { shield: true, dura: 336 });
// Treasure Quest
item('treasure_map', { stack: 1, special: 'treasureMap' });
item('golden_key', { stack: 3, questKey: true });
tool('starfall_blade', { weapon: 'sword', damage: 12, emberBonus: 6, legendary: true });
item('frost_orb', { stack: 8, questKey: true });
tool('frostbrand', { weapon: 'sword', damage: 14, emberBonus: 8, legendary: true });

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
