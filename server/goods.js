// Goods of the exchange (shared by the game and the API): base price in
// coins. Prices move with supply: players selling a good make it cheaper,
// buying makes it dearer.
export const GOODS = {
  sunfruit: 3, bread: 5, roast: 8, glow_stew: 12,
  log: 2, planks: 1, rubble: 1, sand: 1, glass: 3, charcoal: 2,
  iron_ingot: 12, gold_ingot: 30, emberite_ingot: 45, diamond: 80,
};
// food shops (fixed prices) and restaurant meals (eaten on the spot, dearer
// than cooking the same dish yourself)
export const SHOP = { tomato: 2, orange: 2, rice: 3, sardine: 3, olive_oil: 4, flour: 2, bread: 6, charcoal: 3 };
export const MENU = { churros: { price: 8, food: 6 }, espetos: { price: 12, food: 8 }, gazpacho: { price: 14, food: 9 }, paella: { price: 22, food: 14 } };
export const START_CASH = 20;
export const BUS_FARE = 2;
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
