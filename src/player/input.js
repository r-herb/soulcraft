// Unified input: touch (virtual joystick, look-drag, buttons) and desktop
// (WASD, pointer-lock mouse look, mouse buttons, number keys).

export class Input {
  constructor(root, canvas) {
    this.root = root;
    this.canvas = canvas;
    this.move = { x: 0, z: 0 };
    this.lookDX = 0;
    this.lookDY = 0;
    this.jump = false;
    this.sprint = false;
    this.attack = false; // held
    this.use = false; // held
    this.pressed = new Set(); // one-shot actions: use, attack, inventory, pause, slot0-8, drop, map
    this.enabled = true;
    this.keys = new Set();
    this.sensitivity = 1;
    this.touchLookScale = 0.0055;
    this.mouseLookScale = 0.0024;
    this.touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.pointerLocked = false;
    this.joy = null; // active joystick pointer
    this.lookPointers = new Map();
    this._bind();
  }

  _bind() {
    const kd = (e) => {
      if (!this.enabled) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.code;
      if (!this.keys.has(k)) {
        if (k === 'KeyE') this.pressed.add('inventory');
        if (k === 'Escape') this.pressed.add('pause');
        if (k === 'KeyQ') this.pressed.add('drop');
        if (k === 'KeyM') this.pressed.add('map');
        if (k === 'KeyF') this.pressed.add('use');
        if (k === 'F3') { this.pressed.add('fps'); e.preventDefault(); }
        if (/^Digit[1-9]$/.test(k)) this.pressed.add('slot' + (Number(k.slice(5)) - 1));
      }
      this.keys.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(k)) e.preventDefault();
    };
    const ku = (e) => { this.keys.delete(e.code); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => { this.keys.clear(); this.attack = false; this.use = false; });

    // Mouse / pointer lock on desktop
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touchMode) return;
      if (!this.pointerLocked) { this.requestLock(); return; }
      if (e.button === 0) { this.attack = true; this.pressed.add('attack'); }
      if (e.button === 2) { this.use = true; this.pressed.add('use'); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.attack = false;
      if (e.button === 2) this.use = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.lookDX += e.movementX * this.mouseLookScale * this.sensitivity;
      this.lookDY += e.movementY * this.mouseLookScale * this.sensitivity;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.pressed.add(e.deltaY > 0 ? 'nextSlot' : 'prevSlot');
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (was && !this.pointerLocked && this.enabled) this.pressed.add('lockLost');
    });
  }

  requestLock() {
    if (this.touchMode) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* not allowed right now */ }
  }
  exitLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ } }

  // Touch controls are DOM elements built by the HUD; it hands them here.
  attachTouch({ lookZone, joyZone, joyBase, joyKnob, buttons }) {
    const opts = { passive: false };
    joyZone.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.joy) return;
      e.preventDefault();
      joyZone.setPointerCapture?.(e.pointerId);
      const r = joyZone.getBoundingClientRect();
      this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
      joyBase.style.left = (e.clientX - r.left) + 'px';
      joyBase.style.top = (e.clientY - r.top) + 'px';
      joyBase.classList.add('active');
      joyKnob.style.transform = 'translate(-50%,-50%)';
    }, opts);
    const joyMove = (e) => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      e.preventDefault();
      const max = joyBase.offsetWidth * 0.42 || 50;
      let dx = e.clientX - this.joy.x, dy = e.clientY - this.joy.y;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx *= max / d; dy *= max / d; }
      joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const nx = dx / max, ny = dy / max;
      const mag = Math.hypot(nx, ny);
      const dead = 0.12;
      const k = mag < dead ? 0 : (mag - dead) / (1 - dead) / (mag || 1);
      this.move.x = nx * k;
      this.move.z = -ny * k;
      this.sprint = mag > 0.95;
    };
    const joyEnd = (e) => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      this.joy = null;
      this.move.x = 0; this.move.z = 0; this.sprint = false;
      joyBase.classList.remove('active');
      joyKnob.style.transform = 'translate(-50%,-50%)';
    };
    joyZone.addEventListener('pointermove', joyMove, opts);
    joyZone.addEventListener('pointerup', joyEnd);
    joyZone.addEventListener('pointercancel', joyEnd);

    lookZone.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      lookZone.setPointerCapture?.(e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }, opts);
    lookZone.addEventListener('pointermove', (e) => {
      const p = this.lookPointers.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      this.lookDX += (e.clientX - p.x) * this.touchLookScale * this.sensitivity;
      this.lookDY += (e.clientY - p.y) * this.touchLookScale * this.sensitivity;
      p.x = e.clientX; p.y = e.clientY;
    }, opts);
    const lookEnd = (e) => { this.lookPointers.delete(e.pointerId); };
    lookZone.addEventListener('pointerup', lookEnd);
    lookZone.addEventListener('pointercancel', lookEnd);

    for (const [name, el] of Object.entries(buttons)) {
      if (!el) continue;
      el.addEventListener('pointerdown', (e) => {
        if (!this.enabled) return;
        e.preventDefault(); e.stopPropagation();
        el.setPointerCapture?.(e.pointerId);
        el.classList.add('pressed');
        if (name === 'jump') this.jumpTouch = true;
        else if (name === 'down') this.downTouch = true;
        else if (name === 'attack') { this.attackTouch = true; this.pressed.add('attack'); }
        else if (name === 'use') { this.useTouch = true; this.pressed.add('use'); }
        else this.pressed.add(name);
        this.onButton?.(name);
      }, opts);
      const up = () => {
        el.classList.remove('pressed');
        if (name === 'jump') this.jumpTouch = false;
        if (name === 'down') this.downTouch = false;
        if (name === 'attack') this.attackTouch = false;
        if (name === 'use') this.useTouch = false;
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    }
  }

  // Called once per frame by the game.
  poll() {
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    const keyboard = mx !== 0 || mz !== 0;
    const move = keyboard ? { x: mx, z: mz } : { x: this.move.x, z: this.move.z };
    const len = Math.hypot(move.x, move.z);
    if (len > 1) { move.x /= len; move.z /= len; }
    const out = {
      move,
      lookDX: this.lookDX,
      lookDY: this.lookDY,
      jump: k.has('Space') || !!this.jumpTouch,
      down: k.has('ShiftLeft') || k.has('KeyC') || !!this.downTouch,
      sprint: keyboard ? (k.has('ShiftLeft') || k.has('ControlLeft')) : this.sprint,
      attack: this.attack || !!this.attackTouch,
      use: this.use || !!this.useTouch,
      pressed: this.pressed,
    };
    this.lookDX = 0; this.lookDY = 0;
    this.pressed = new Set();
    return out;
  }

  reset() {
    this.keys.clear();
    this.move.x = this.move.z = 0;
    this.attack = this.use = false;
    this.jumpTouch = this.attackTouch = this.useTouch = this.downTouch = false;
    this.joy = null;
    this.lookPointers.clear();
    this.pressed = new Set();
    this.lookDX = this.lookDY = 0;
  }
}
