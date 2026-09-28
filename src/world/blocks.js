// Block registry. Pure data, shared by the worker (meshing, generation) and
// the main thread (physics, inventory, UI).

export const CHUNK = 16;
export const HEIGHT = 128;
export const SEA = 38;

// Atlas tile names, in atlas order. atlas.js paints each one procedurally.
export const TILES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'rubble', 'sand', 'log_side', 'log_top',
  'leaves', 'planks', 'glass', 'water', 'coreite', 'char_ore', 'iron_ore', 'gold_ore',
  'soul_ore', 'duskstone', 'dusk_soul_ore', 'torch', 'brick', 'magma', 'ashstone', 'emberite_ore',
  'soul_soil', 'voidstone', 'spiritstone', 'chamber_brick', 'chamber_lamp', 'ember_lamp', 'glowbell', 'tallgrass',
  'path', 'crafting_top', 'crafting_side', 'void_crystal', 'basalt', 'soul_glass', 'spirit_tree', 'spirit_leaves',
  'snow', 'wool_blue', 'vault', 'iron_block', 'gold_block', 'emberite_block', 'soul_block', 'ember_moss',
  // Treasure Quest
  'ruin_stone', 'ruin_top', 'quest_gate', 'checkpoint', 'jump_pad', 'crumble', 'lever_off', 'lever_on',
  'lamp_off', 'lamp_on', 'tile_off', 'tile_lit', 'tile_ok', 'trap', 'trap_lit', 'chest_side',
  'chest_top', 'gold_brick',
  // biomes and caves
  'sandstone_top', 'sandstone_side', 'cactus_top', 'cactus_side', 'dry_bush', 'ice', 'pine_leaves', 'glow_crystal',
  // Treasure Quest chapter 2
  'blink_on', 'blink_off', 'plate_off', 'plate_on', 'jet', 'jet_lit', 'vent', 'frost_brick',
];
export const TILE = Object.fromEntries(TILES.map((n, i) => [n, i]));
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = Math.ceil(TILES.length / ATLAS_COLS);

// shape: 'cube' | 'cross' | 'torch' | 'liquid'
// layer: 0 opaque, 1 cutout (alpha test), 2 translucent
function def(id, key, o) {
  const t = o.tex;
  const tex = typeof t === 'string' ? { top: t, side: t, bottom: t } : t;
  return {
    id, key,
    shape: o.shape || 'cube',
    solid: o.solid !== undefined ? o.solid : true,
    opaque: o.opaque !== undefined ? o.opaque : (o.shape || 'cube') === 'cube' && !o.layer,
    layer: o.layer || 0,
    light: o.light || 0,
    hardness: o.hardness !== undefined ? o.hardness : 1,
    tool: o.tool || null, // 'pick' | 'axe' | 'shovel'
    tier: o.tier || 0, // minimum pick tier to get drops
    drop: o.drop, // item key or null (defaults to self)
    replaceable: !!o.replaceable,
    hurts: o.hurts || 0,
    tex: tex && { top: TILE[tex.top], side: TILE[tex.side], bottom: TILE[tex.bottom] },
  };
}

const LIST = [
  def(0, 'air', { solid: false, opaque: false, replaceable: true, hardness: 0 }),
  def(1, 'grass', { tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, hardness: 0.6, tool: 'shovel', drop: 'dirt' }),
  def(2, 'dirt', { tex: 'dirt', hardness: 0.5, tool: 'shovel' }),
  def(3, 'stone', { tex: 'stone', hardness: 1.5, tool: 'pick', tier: 1, drop: 'rubble' }),
  def(4, 'rubble', { tex: 'rubble', hardness: 1.8, tool: 'pick', tier: 1 }),
  def(5, 'sand', { tex: 'sand', hardness: 0.5, tool: 'shovel' }),
  def(6, 'log', { tex: { top: 'log_top', side: 'log_side', bottom: 'log_top' }, hardness: 1.2, tool: 'axe' }),
  def(7, 'leaves', { tex: 'leaves', layer: 1, opaque: false, hardness: 0.2, drop: 'none' }),
  def(8, 'planks', { tex: 'planks', hardness: 1, tool: 'axe' }),
  def(9, 'glass', { tex: 'glass', layer: 1, opaque: false, hardness: 0.3 }),
  def(10, 'water', { tex: 'water', shape: 'liquid', layer: 2, solid: false, opaque: false, replaceable: true, hardness: -1 }),
  def(11, 'coreite', { tex: 'coreite', hardness: -1 }),
  def(12, 'char_ore', { tex: 'char_ore', hardness: 2, tool: 'pick', tier: 1, drop: 'charcoal' }),
  def(13, 'iron_ore', { tex: 'iron_ore', hardness: 2.5, tool: 'pick', tier: 2, drop: 'iron_ingot' }),
  def(14, 'gold_ore', { tex: 'gold_ore', hardness: 2.5, tool: 'pick', tier: 3, drop: 'gold_ingot' }),
  def(15, 'soul_ore', { tex: 'soul_ore', hardness: 2.5, tool: 'pick', tier: 1, drop: 'soul_crystal', light: 9 }),
  def(16, 'duskstone', { tex: 'duskstone', hardness: 2.5, tool: 'pick', tier: 1 }),
  def(17, 'dusk_soul_ore', { tex: 'dusk_soul_ore', hardness: 3, tool: 'pick', tier: 1, drop: 'soul_crystal', light: 11 }),
  def(18, 'torch', { tex: 'torch', shape: 'torch', layer: 1, solid: false, opaque: false, light: 14, hardness: 0 }),
  def(19, 'brick', { tex: 'brick', hardness: 2, tool: 'pick', tier: 1 }),
  def(20, 'magma', { tex: 'magma', shape: 'liquid', layer: 0, solid: false, opaque: false, light: 15, hardness: -1, hurts: 4, replaceable: true }),
  def(21, 'ashstone', { tex: 'ashstone', hardness: 1.2, tool: 'pick', tier: 1 }),
  def(22, 'emberite_ore', { tex: 'emberite_ore', hardness: 4, tool: 'pick', tier: 3, drop: 'emberite_shard', light: 7 }),
  def(23, 'soul_soil', { tex: 'soul_soil', hardness: 0.6, tool: 'shovel' }),
  def(24, 'voidstone', { tex: 'voidstone', hardness: 3, tool: 'pick', tier: 1 }),
  def(25, 'spiritstone', { tex: 'spiritstone', hardness: 1.5, tool: 'pick', tier: 1, light: 3 }),
  def(26, 'chamber_brick', { tex: 'chamber_brick', hardness: -1 }),
  def(27, 'chamber_lamp', { tex: 'chamber_lamp', hardness: -1, light: 14 }),
  def(28, 'ember_lamp', { tex: 'ember_lamp', hardness: 0.6, light: 15 }),
  def(29, 'glowbell', { tex: 'glowbell', shape: 'cross', layer: 1, solid: false, opaque: false, hardness: 0, light: 6, replaceable: true }),
  def(30, 'tallgrass', { tex: 'tallgrass', shape: 'cross', layer: 1, solid: false, opaque: false, hardness: 0, replaceable: true, drop: 'none' }),
  def(31, 'path', { tex: { top: 'path', side: 'dirt', bottom: 'dirt' }, hardness: 0.6, tool: 'shovel', drop: 'dirt' }),
  def(32, 'workbench', { tex: { top: 'crafting_top', side: 'crafting_side', bottom: 'planks' }, hardness: 1.2, tool: 'axe' }),
  def(33, 'void_crystal', { tex: 'void_crystal', hardness: -1, light: 15 }),
  def(34, 'basalt', { tex: 'basalt', hardness: 2, tool: 'pick', tier: 1 }),
  def(35, 'soul_glass', { tex: 'soul_glass', layer: 1, opaque: false, hardness: 0.3, light: 8 }),
  def(36, 'spirit_log', { tex: { top: 'log_top', side: 'spirit_tree', bottom: 'log_top' }, hardness: 1.2, tool: 'axe' }),
  def(37, 'spirit_leaves', { tex: 'spirit_leaves', layer: 1, opaque: false, hardness: 0.2, light: 5, drop: 'none' }),
  def(38, 'snow', { tex: 'snow', hardness: 0.3, tool: 'shovel' }),
  def(39, 'wool', { tex: 'wool_blue', hardness: 0.6 }),
  def(40, 'vault', { tex: 'vault', hardness: -1, light: 10 }),
  def(41, 'iron_block', { tex: 'iron_block', hardness: 3, tool: 'pick', tier: 2 }),
  def(42, 'gold_block', { tex: 'gold_block', hardness: 3, tool: 'pick', tier: 2 }),
  def(43, 'emberite_block', { tex: 'emberite_block', hardness: 4, tool: 'pick', tier: 3, light: 6 }),
  def(44, 'soul_block', { tex: 'soul_block', hardness: 2, tool: 'pick', tier: 1, light: 12 }),
  def(45, 'ember_moss', { tex: { top: 'ember_moss', side: 'ashstone', bottom: 'ashstone' }, hardness: 1, tool: 'pick', drop: 'ashstone' }),
  // Treasure Quest blocks (the quest world does not allow breaking)
  def(46, 'ruin_stone', { tex: { top: 'ruin_top', side: 'ruin_stone', bottom: 'ruin_top' }, hardness: 2, tool: 'pick', tier: 1 }),
  def(47, 'quest_gate', { tex: 'quest_gate', layer: 1, opaque: false, hardness: -1, light: 4 }),
  def(48, 'checkpoint', { tex: { top: 'checkpoint', side: 'ruin_stone', bottom: 'ruin_top' }, hardness: -1, light: 10 }),
  def(49, 'jump_pad', { tex: { top: 'jump_pad', side: 'ruin_stone', bottom: 'ruin_top' }, hardness: -1, light: 8 }),
  def(50, 'crumble', { tex: 'crumble', hardness: -1 }),
  def(51, 'lever_off', { tex: { top: 'ruin_top', side: 'lever_off', bottom: 'ruin_top' }, hardness: -1 }),
  def(52, 'lever_on', { tex: { top: 'ruin_top', side: 'lever_on', bottom: 'ruin_top' }, hardness: -1, light: 6 }),
  def(53, 'lamp_off', { tex: 'lamp_off', hardness: -1 }),
  def(54, 'lamp_on', { tex: 'lamp_on', hardness: -1, light: 15 }),
  def(55, 'tile_off', { tex: { top: 'tile_off', side: 'ruin_stone', bottom: 'ruin_top' }, hardness: -1 }),
  def(56, 'tile_lit', { tex: { top: 'tile_lit', side: 'ruin_stone', bottom: 'ruin_top' }, hardness: -1, light: 14 }),
  def(57, 'tile_ok', { tex: { top: 'tile_ok', side: 'ruin_stone', bottom: 'ruin_top' }, hardness: -1, light: 12 }),
  def(58, 'trap', { tex: { top: 'ruin_top', side: 'trap', bottom: 'ruin_top' }, hardness: -1 }),
  def(59, 'trap_lit', { tex: { top: 'ruin_top', side: 'trap_lit', bottom: 'ruin_top' }, hardness: -1, light: 12 }),
  def(60, 'treasure_chest', { tex: { top: 'chest_top', side: 'chest_side', bottom: 'chest_top' }, hardness: -1, light: 8 }),
  def(61, 'gold_brick', { tex: 'gold_brick', hardness: 3, tool: 'pick', tier: 2, light: 4 }),
  // biomes (desert, snow) and caves
  def(62, 'sandstone', { tex: { top: 'sandstone_top', side: 'sandstone_side', bottom: 'sandstone_top' }, hardness: 1.2, tool: 'pick', tier: 1 }),
  def(63, 'cactus', { tex: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' }, hardness: 0.5, hurts: 1 }),
  def(64, 'dry_bush', { tex: 'dry_bush', shape: 'cross', layer: 1, solid: false, opaque: false, hardness: 0, replaceable: true, drop: 'stick' }),
  def(65, 'ice', { tex: 'ice', hardness: 0.5, tool: 'pick', drop: 'none' }),
  def(66, 'pine_leaves', { tex: 'pine_leaves', layer: 1, opaque: false, hardness: 0.2, drop: 'none' }),
  // Treasure Quest chapter 2 (the quest world does not allow breaking)
  def(68, 'blink_on', { tex: 'blink_on', hardness: -1, light: 10 }),
  def(69, 'blink_off', { tex: 'blink_off', layer: 1, solid: false, opaque: false, hardness: -1 }),
  def(70, 'plate_off', { tex: { top: 'plate_off', side: 'frost_brick', bottom: 'frost_brick' }, hardness: -1 }),
  def(71, 'plate_on', { tex: { top: 'plate_on', side: 'frost_brick', bottom: 'frost_brick' }, hardness: -1, light: 12 }),
  def(72, 'jet', { tex: { top: 'jet', side: 'frost_brick', bottom: 'frost_brick' }, hardness: -1 }),
  def(73, 'jet_lit', { tex: { top: 'jet_lit', side: 'frost_brick', bottom: 'frost_brick' }, hardness: -1, light: 11 }),
  def(74, 'vent', { tex: { top: 'vent', side: 'frost_brick', bottom: 'frost_brick' }, hardness: -1, light: 6 }),
  def(75, 'frost_brick', { tex: 'frost_brick', hardness: 2, tool: 'pick', tier: 1 }),
  def(67, 'glow_crystal', { tex: 'glow_crystal', shape: 'cross', layer: 1, solid: false, opaque: false, hardness: 0.8, light: 12 }),
];

export const BLOCKS = [];
for (const b of LIST) BLOCKS[b.id] = b;
export const B = Object.fromEntries(LIST.map((b) => [b.key, b.id]));

// Flat lookup tables for the hot paths (meshing, physics, lighting).
export const IS_SOLID = new Uint8Array(256);
export const IS_OPAQUE = new Uint8Array(256);
export const LIGHT_EMIT = new Uint8Array(256);
export const LAYER = new Uint8Array(256);
export const SHAPE = new Uint8Array(256); // 0 none,1 cube,2 cross,3 torch,4 liquid
export const TEX_TOP = new Uint8Array(256);
export const TEX_SIDE = new Uint8Array(256);
export const TEX_BOTTOM = new Uint8Array(256);
const SHAPES = { cube: 1, cross: 2, torch: 3, liquid: 4 };
for (const b of LIST) {
  IS_SOLID[b.id] = b.solid ? 1 : 0;
  IS_OPAQUE[b.id] = b.opaque ? 1 : 0;
  LIGHT_EMIT[b.id] = b.light;
  LAYER[b.id] = b.layer;
  SHAPE[b.id] = b.id === 0 ? 0 : SHAPES[b.shape];
  if (b.tex) { TEX_TOP[b.id] = b.tex.top; TEX_SIDE[b.id] = b.tex.side; TEX_BOTTOM[b.id] = b.tex.bottom; }
}
