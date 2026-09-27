// 36-slot inventory (0-8 hotbar) plus a 3x3 crafting grid.
import { maxStack } from './items.js';

export class Inventory {
  constructor(data) {
    this.slots = new Array(36).fill(null);
    this.grid = new Array(9).fill(null);
    this.selected = 0;
    this.onChange = null;
    if (data) this.load(data);
  }
  load(d) {
    this.slots = (d.slots || []).slice(0, 36).map((s) => (s && s.item && s.count > 0 ? { item: s.item, count: s.count } : null));
    while (this.slots.length < 36) this.slots.push(null);
    this.selected = d.selected || 0;
    this.grid = new Array(9).fill(null);
  }
  toJSON() { return { slots: this.slots, selected: this.selected }; }
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
