// Gems, ranked as in the real world from cheap to precious: quartz,
// amethyst, topaz, emerald, sapphire, ruby, diamond. The precious ones are
// rarer and lie deeper. Ores grow in the stone underground (also under
// Malaga), hidden caches in the city hold a handful, and panning in water
// turns up gold nuggets.
import { B } from './blocks.js';
import { hash3 } from './noise.js';

export const GEMS = ['quartz', 'amethyst', 'topaz', 'emerald', 'sapphire', 'ruby', 'diamond'];

// ore blobs: a band of the ore hash, and the highest y it grows at
const BANDS = [
  ['ruby_ore', 0.48, 0.49, 22], ['sapphire_ore', 0.49, 0.505, 26], ['emerald_ore', 0.505, 0.525, 32],
  ['topaz_ore', 0.525, 0.55, 40], ['amethyst_ore', 0.55, 0.59, 50], ['quartz_ore', 0.59, 0.65, 64],
];
export function gemOre(h, y) {
  for (const [k, a, b, top] of BANDS) if (h >= a && h < b) return y < top ? B[k] : 0;
  return 0;
}

// how often each gem turns up in a cache or a rock (out of 100)
const WEIGHTS = [['quartz', 30], ['amethyst', 22], ['topaz', 16], ['emerald', 11], ['sapphire', 9], ['ruby', 7], ['diamond', 5]];
export function pickGem(r) {
  let x = r * 100;
  for (const [g, w] of WEIGHTS) { if (x < w) return g; x -= w; }
  return 'quartz';
}

// a scattered gem in the city's underground (single blocks, no blobs)
export function cityGemAt(x, y, z) {
  if (hash3(x, y, z, 77) >= 0.0035) return 0;
  const g = pickGem(hash3(x, y, z, 78));
  return B[g + '_ore'];
}

// what a cache holds: 2 to 4 gems, sometimes gold nuggets
export function cacheLoot(rand = Math.random) {
  const out = {};
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) { const g = pickGem(rand()); out[g] = (out[g] || 0) + 1; }
  if (rand() < 0.5) out.gold_nugget = 1 + Math.floor(rand() * 4);
  return out;
}

// one pan of sand and water: a gold nugget about one time in four, now and
// then a small gem
export function panLoot(rand = Math.random) {
  const r = rand();
  if (r < 0.25) return 'gold_nugget';
  if (r < 0.29) return rand() < 0.7 ? 'quartz' : 'amethyst';
  return null;
}
