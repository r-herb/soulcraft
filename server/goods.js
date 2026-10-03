// Goods of the exchange (shared by the game and the API): base price in
// coins. Prices move with supply: players selling a good make it cheaper,
// buying makes it dearer.
export const GOODS = {
  sunfruit: 3, bread: 5, roast: 8, glow_stew: 12,
  log: 2, planks: 1, rubble: 1, sand: 1, glass: 3, charcoal: 2,
  iron_ingot: 12, gold_ingot: 30, emberite_ingot: 45, diamond: 80,
  // gems, in the real world's order of value, and gold from panning
  quartz: 3, amethyst: 6, topaz: 12, emerald: 35, sapphire: 45, ruby: 60, gold_nugget: 3,
  // the farm
  wheat: 2, tomato: 2, carrot: 2, orange: 2, egg: 2, wool: 4, raw_chicken: 4, raw_mutton: 5, raw_beef: 6,
};
// food shops (fixed prices) and restaurant meals (eaten on the spot, dearer
// than cooking the same dish yourself)
export const SHOP = { tomato: 2, orange: 2, rice: 3, sardine: 3, olive_oil: 4, flour: 2, bread: 6, charcoal: 3, wheat_seeds: 1, tomato_seeds: 1, carrot: 2, chicken_crate: 15, sheep_crate: 30, cow_crate: 45 };
export const MENU = { churros: { price: 8, food: 6 }, espetos: { price: 12, food: 8 }, gazpacho: { price: 14, food: 9 }, paella: { price: 22, food: 14 } };
// How much of a good one player may sell a day (to the exchange and on the
// market together): about what a busy day of honest play brings in. The
// backpack is the player's own save, so this is what stops made-up goods
// from flooding the city.
export const DAILY_CAP = {
  sunfruit: 128, bread: 64, roast: 64, glow_stew: 32,
  log: 256, planks: 512, rubble: 512, sand: 512, glass: 256, charcoal: 128,
  iron_ingot: 64, gold_ingot: 32, emberite_ingot: 16, diamond: 8,
  quartz: 64, amethyst: 48, topaz: 32, emerald: 16, sapphire: 12, ruby: 10, gold_nugget: 96,
  wheat: 256, tomato: 128, carrot: 128, orange: 128, egg: 64, wool: 64, raw_chicken: 32, raw_mutton: 32, raw_beef: 32,
};
export const capFor = (item) => DAILY_CAP[item] || 256;
// coins the city pays once for each finished city mission
export const MISSION_PAY = { deposit: 10, tour: 60, bus: 40, paella: 50, critic: 30 };
// the big mission's tasks (src/quest/heist.js): 25 coins each, and the
// twelve of them recorded are what the final payout asks for
export const HEIST_TASKS = ['airport', 'stadium', 'university', 'station', 'market', 'elpalo', 'pedregalejo', 'huelin', 'misericordia', 'gibralfaro', 'alcazaba', 'cathedral', 'muelle', 'limonar', 'jardin', 'merced', 'larios', 'parque'];
for (const k of HEIST_TASKS) MISSION_PAY['h_' + k] = 25;
// the Gran Diamante traded at the bank: the biggest sum the game pays, once a player
// what the superadmin's test button adds to their own player wallet
export const TEST_CASH = 10000;
// La Fábrica: what each bag of printed money pays at the end of the season (once per account, at most ten)
export const FAB_PER_BAG = 25000, FAB_MAX_BAGS = 10;
export const HEIST_PAY = 1000000;
export const HEIST_NEEDS = 12; // tasks done
export const HEIST_MIN_MS = 15 * 60 * 1000; // from the first task to the payout
export const START_CASH = 20;
export const BUS_FARE = 2;
// bus tickets: a single ride, or a bonobús card of ten rides
export const TICKETS = { single: { price: 2, rides: 1 }, bonobus: { price: 13, rides: 10 } };
const REF = 200;

// the mid price after `supply` units have been sold (negative: bought)
export function midPrice(item, supply) {
  const base = GOODS[item];
  const m = Math.max(0.25, Math.min(4, REF / Math.max(REF / 4, REF + supply)));
  return base * m;
}
export const buyPrice = (item, supply) => Math.max(1, Math.ceil(midPrice(item, supply) * 1.1));
export const sellPrice = (item, supply) => Math.max(1, Math.floor(midPrice(item, supply) * 0.9));

// the total for qty units, one by one (a big sale lowers its own price)
export function tradeTotal(item, supply, qty, side) {
  let total = 0, s = supply;
  for (let i = 0; i < qty; i++) {
    if (side === 'sell') { total += sellPrice(item, s); s++; } else { total += buyPrice(item, s); s--; }
  }
  return total;
}
