// The people of the central bank: tellers behind the counter of the Banco de
// España building, shown while the player is near it.
import { humanoid } from './models.js';
import { bankLayout, bankCoords, bankPoint } from '../world/city.js';

const NEAR = 90;
const TELLER = { skin: '#d9a066', hair: '#2b1d14', shirt: '#f2f2f2', shirt2: '#1d3557', pants: '#1d3557', accent: '#c9a227', eye: '#2a1a10' };

// the way the street side faces (the yaw a person turns to look out)
const FACE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

export class BankStaff {
  constructor(game) { this.game = game; this.people = []; }

  clear() { for (const p of this.people) this.game.scene.remove(p); this.people = []; }

  update() {
    const g = this.game, c = g.city;
    const P = c && g.meta && g.meta.dim === 'city' ? c.bankPlan() : null;
    if (!P) { if (this.people.length) this.clear(); return; }
    const pl = g.player.pos, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
    const near = Math.hypot(pl.x - cx, pl.z - cz) < NEAR + Math.max(P.x1 - P.x0, P.z1 - P.z0) / 2;
    if (!near) { if (this.people.length) this.clear(); return; }
    if (this.people.length) return;
    const { mid, depth } = bankCoords(P, P.door.x, P.door.z);
    const L = bankLayout(depth), base = P.base;
    for (const a of [mid - 4, mid + 4, mid - 9, mid + 9]) {
      const q = bankPoint(P, L.counter + 1, a);
      if (q.x <= P.x0 || q.x >= P.x1 || q.z <= P.z0 || q.z >= P.z1) continue;
      const rig = humanoid(TELLER, 'player', 0.95);
      rig.group.position.set(q.x + 0.5, base + 1, q.z + 0.5);
      rig.group.rotation.y = FACE[P.side];
      g.scene.add(rig.group);
      this.people.push(rig.group);
    }
  }
}
