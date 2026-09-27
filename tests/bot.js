// An in-page bot that plays a boss fight with the real game mechanics:
// aims (with arrow drop and target lead), parries glowing shells, throws
// wind charges, melees when close. Used by bosses.spec.js.
export function installBot() {
  const g = window.__sc.game;
  const input = window.__sc.input;
  const THREE_V = (x, y, z) => g.player.pos.clone().set(x, y, z);
  const last = new Map();
  const bot = { on: true, shots: 0, parries: 0, hits: 0 };
  window.__bot = bot;

  const selectItem = (key) => {
    const i = g.inventory.slots.findIndex((s) => s && s.item === key);
    if (i < 0) return false;
    if (i > 8) { const t = g.inventory.slots[0]; g.inventory.slots[0] = g.inventory.slots[i]; g.inventory.slots[i] = t; g.selectSlot(0); }
    else if (g.inventory.selected !== i) g.selectSlot(i);
    return true;
  };
  const aimAt = (p) => {
    const e = g.player.eye;
    const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
    g.player.yaw = Math.atan2(-dx, -dz);
    g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  };
  const velOf = (key, pos) => {
    const now = performance.now();
    const prev = last.get(key);
    last.set(key, { p: pos.clone(), t: now });
    if (!prev || now - prev.t > 500 || now === prev.t) return THREE_V(0, 0, 0);
    return pos.clone().sub(prev.p).multiplyScalar(1000 / (now - prev.t));
  };
  // aim a projectile with speed s and gravity grav at a moving target
  const lead = (key, target, s, grav) => {
    const v = velOf(key, target);
    const e = g.player.eye;
    let t = target.distanceTo(e) / s;
    const p = target.clone().addScaledVector(v, t);
    t = p.distanceTo(e) / s;
    p.y += 0.5 * grav * t * t;
    return p;
  };

  const tick = () => {
    if (!bot.on || !g.running || g.paused || g.player.dead) return;
    const b = g.bosses.active;
    input.move.x = 0; input.move.z = 0; input.attack = false;
    if (!b) return;
    const eye = g.player.eye;
    // 1. parry glowing shells heading our way
    const shell = g.entities.list.find((e) => e.deflectable && !e.dead && e.pos.distanceTo(eye) < 4);
    if (shell) {
      selectItem('emberite_sword') || selectItem('iron_sword');
      aimAt(shell.pos);
      input.pressed.add('attack');
      bot.parries++;
      return;
    }
    const c = b.center();
    const flat = Math.hypot(c.x - g.player.pos.x, c.z - g.player.pos.z);
    // 2. melee when the boss is in reach
    const reach = g.entities.raycast(eye, g.player.lookDir(), 5) === b;
    const near = flat < 4.2 && Math.abs(c.y - eye.y) < 4.5;
    if (near) {
      selectItem('emberite_sword') || selectItem('iron_sword');
      aimAt(c);
      if (g.attackCooldown <= 0 && reach) { input.pressed.add('attack'); bot.hits++; }
      input.attack = true;
      return;
    }
    // 3. void crystals first
    const crystal = g.entities.list.find((e) => e.isCrystal && !e.dead);
    if (crystal) {
      selectItem('bow');
      aimAt(lead('crystal', crystal.pos.clone().setY(crystal.pos.y + 0.7), 34, 14));
      // back off so the shot is not blocked by the pillar top
      const cd = Math.hypot(crystal.pos.x - g.player.pos.x, crystal.pos.z - g.player.pos.z);
      const fromCentre = Math.hypot(g.player.pos.x - b.arena.x, g.player.pos.z - b.arena.z);
      if (cd < 11 && fromCentre < 20) input.move.z = -1;
      if (g.useCooldown <= 0) { input.pressed.add('use'); bot.shots++; }
      return;
    }
    if (b.id === 'whirlwindKing') {
      if (g.inventory.count('wind_charge') < 8) g.giveItem('wind_charge', 16);
      selectItem('wind_charge');
      aimAt(lead('boss', c, 22, 3));
      if (flat > 9) input.move.z = 1;
      if (g.useCooldown <= 0) { input.pressed.add('use'); bot.shots++; }
      return;
    }
    // the dragon: arrows while it flies
    if (b.id === 'voidDragon' && b.state !== 'perch') {
      if (g.inventory.count('arrow') < 16) g.giveItem('arrow', 64);
      selectItem('bow');
      aimAt(lead('boss', c, 34, 14));
      if (g.useCooldown <= 0) { input.pressed.add('use'); bot.shots++; }
      return;
    }
    // otherwise walk in
    aimAt(c);
    g.player.pitch = 0;
    input.move.z = 1;
  };
  bot.timer = setInterval(tick, 40);
  return true;
}
