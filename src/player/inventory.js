// 36-slot inventory (0-8 hotbar) plus a 3x3 crafting grid and the four
// armor slots (head, chest, legs, feet). Armor and shields keep their wear
// (dmg: hits taken).
import { maxStack, ITEMS, ARMOR_SLOTS } from './items.js';

const keep = (s) => (s && s.item && s.count > 0 ? { item: s.item, count: s.count, ...(s.dmg ? { dmg: s.dmg } : {}) } : null);

export class Inventory {
  constructor(data) {
    this.slots = new Array(36).fill(null);
    this.grid = new Array(9).fill(null);
    this.armor = new Array(4).fill(null);
    this.selected = 0;
    this.onChange = null;
    if (data) this.load(data);
  }
  load(d) {
    this.slots = (d.slots || []).slice(0, 36).map(keep);
    while (this.slots.length < 36) this.slots.push(null);
    this.armor = [0, 1, 2, 3].map((i) => keep((d.armor || [])[i]));
    this.selected = d.selected || 0;
    this.grid = new Array(9).fill(null);
  }
  toJSON() { return { slots: this.slots, armor: this.armor, selected: this.selected }; }

  // armor: the points worn (each up to 20 in all), and the slot an item goes in
  get armorPoints() { return this.armor.reduce((n, s) => n + (s && ITEMS[s.item] ? ITEMS[s.item].points || 0 : 0), 0); }
  get toughness() { return this.armor.reduce((n, s) => n + (s && ITEMS[s.item] ? ITEMS[s.item].tough || 0 : 0), 0); }
  static armorSlot(item) { const d = ITEMS[item]; return d && d.armor ? ARMOR_SLOTS.indexOf(d.armor) : -1; }
  // put on the piece held in the hotbar (swapping what was worn)
  equipHeld() {
    const s = this.slots[this.selected], i = s ? Inventory.armorSlot(s.item) : -1;
    if (i < 0) return false;
    this.slots[this.selected] = this.armor[i];
    this.armor[i] = s;
    this.changed();
    return true;
  }
  // wear from one blow: each piece worn takes a hit; worn-out pieces break (returned)
  wearArmor() {
    const broke = [];
    this.armor.forEach((s, i) => {
      if (!s) return;
      s.dmg = (s.dmg || 0) + 1;
      if (s.dmg >= (ITEMS[s.item].dura || 1)) { broke.push(s.item); this.armor[i] = null; }
    });
    if (broke.length) this.changed();
    return broke;
  }
  changed() { this.onChange && this.onChange(); }

  get held() { return this.slots[this.selected]; }

  count(item) {
    let n = 0;
    for (const s of this.slots) if (s && s.item === item) n += s.count;
    return n;
  }

  // Returns how many could NOT be added.
  add(item, count = 1) {
    const max = maxStack(item);
    for (let pass = 0; pass < 2 && count > 0; pass++) {
      // hotbar first when creating new stacks
      const order = [...Array(36).keys()];
      for (const i of order) {
        const s = this.slots[i];
        if (pass === 0 && s && s.item === item && s.count < max) {
          const k = Math.min(count, max - s.count);
          s.count += k; count -= k;
        } else if (pass === 1 && !s) {
          const k = Math.min(count, max);
          this.slots[i] = { item, count: k }; count -= k;
        }
        if (count <= 0) break;
      }
    }
    this.changed();
    return count;
  }

  remove(item, count = 1) {
    for (let i = 35; i >= 0 && count > 0; i--) {
      const s = this.slots[i];
      if (s && s.item === item) {
        const k = Math.min(count, s.count);
        s.count -= k; count -= k;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.changed();
    return count === 0;
  }

  consumeHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    this.changed();
  }

  // Grid helpers
  returnGrid() {
    for (let i = 0; i < 9; i++) if (this.grid[i]) { this.add(this.grid[i].item, this.grid[i].count); this.grid[i] = null; }
    this.changed();
  }

  // Fill the grid with the recipe's ingredients from the inventory.
  autofill(rec) {
    this.returnGrid();
    const ox = rec.w < 3 ? 0 : 0;
    for (let y = 0; y < rec.h; y++) for (let x = 0; x < rec.w; x++) {
      const it = rec.rows[y][x];
      if (!it) continue;
      if (!this.remove(it, 1)) { this.returnGrid(); return false; }
      this.grid[y * 3 + x + ox] = { item: it, count: 1 };
    }
    this.changed();
    return true;
  }
}
