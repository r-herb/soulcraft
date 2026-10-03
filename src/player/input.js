// Unified input: touch (virtual joystick, look-drag, buttons) and desktop
// (WASD, pointer-lock mouse look, mouse buttons, number keys).

const IS_MAC = /Mac/.test(navigator.platform || navigator.userAgent || '');

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
    // phones and tablets; a laptop with a touch screen still has a mouse or
    // touchpad as its main pointer, so it plays with the desktop controls
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    this.autoTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && !fine);
    this.touchMode = this.autoTouch;
    this.controls = 'auto'; // the player's choice in Settings
    this.wheelSlots = true; // scrolling changes the hotbar slot
    this.slotSteps = 0; // hotbar steps scrolled since the last frame
    this.onModeChange = null;
    this.pointerLocked = false;
    this.joy = null; // active joystick pointer
    this.lookPointers = new Map();
    this._bind();
  }

  // Settings: auto (follow the device, then whatever the player actually
  // uses), touch, or desktop (mouse and keyboard).
  setControls(pref) {
    this.controls = pref || 'auto';
    this.setTouchMode(this.controls === 'touch' ? true : this.controls === 'desktop' ? false : this.touchMode);
  }

  setTouchMode(v) {
    v = !!v;
    if (v === this.touchMode) return;
    this.touchMode = v;
    this.joy = null; this.lookPointers.clear();
    this.move.x = 0; this.move.z = 0;
    this.attackTouch = false; this.useTouch = false; this.jumpTouch = false;
    if (v) this.exitLock();
    if (this.onModeChange) this.onModeChange(v);
  }

  _bind() {
    // On "auto", a mouse click in the game switches a touch-mode device (a
    // laptop with a touch screen) to mouse and keyboard, and a finger
    // switches back: the controls follow what the player really uses.
    // only on devices that have a mouse or touchpad at all (not phones)
    const hasMouse = () => matchMedia('(any-pointer: fine)').matches;
    window.addEventListener('pointerdown', (e) => {
      if (this.controls !== 'auto') return;
      if (e.pointerType === 'mouse' && this.touchMode && hasMouse()) {
        const inGame = e.target === this.canvas || (e.target.closest && e.target.closest('.look-zone, .joy-zone'));
        this.setTouchMode(false);
        // the click that follows captures the pointer
        if (inGame && this.enabled) { e.preventDefault(); e.stopPropagation(); }
      } else if (e.pointerType === 'touch' && !this.touchMode) this.setTouchMode(true);
    }, true);

    const kd = (e) => {
      if (!this.enabled) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.code;
      // walking with the keyboard means a keyboard (and mouse) player
      if (this.touchMode && this.controls === 'auto' && hasMouse() && /^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(k)) this.setTouchMode(false);
      if (!this.keys.has(k)) {
        if (k === 'KeyE') this.pressed.add('inventory');
        if (k === 'Escape') this.pressed.add('pause');
        if (k === 'KeyQ') this.pressed.add('drop');
        if (k === 'KeyM') this.pressed.add('map');
        if (k === 'KeyH') this.pressed.add('help');
        if (k === 'KeyF') this.pressed.add('use');
        if (k === 'KeyV') this.pressed.add('flyspeed');
        if (k === 'KeyX') this.pressed.add('busstop');
        if (k === 'F3') { this.pressed.add('fps'); e.preventDefault(); }
        if (k === 'F5') { this.pressed.add('view'); e.preventDefault(); }
        if (k === 'KeyG') this.pressed.add('emote');
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
      // the first click only captures the pointer (see the click handler)
      if (!this.pointerLocked) return;
      // Ctrl+click is the right click on a Mac without a second button
      const right = e.button === 2 || (e.button === 0 && e.ctrlKey && IS_MAC);
      if (right) { this.use = true; this.pressed.add('use'); this._ctrlUse = e.button === 0; }
      else if (e.button === 0) { this.attack = true; this.pressed.add('attack'); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.attack = false; if (this._ctrlUse) { this.use = false; this._ctrlUse = false; } }
      if (e.button === 2) this.use = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Capture the pointer on a whole click, like Minecraft: Safari lets go
    // of a lock taken while the button is still down as soon as it is
    // released, so asking on mousedown made looking work only while pressed.
    this.canvas.addEventListener('click', () => {
      if (this.enabled && !this.touchMode && !this.pointerLocked) this.requestLock();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.lookDX += e.movementX * this.mouseLookScale * this.sensitivity;
      this.lookDY += e.movementY * this.mouseLookScale * this.sensitivity;
    });
    // Hotbar scrolling. A mouse wheel notch is one slot; a touchpad swipe
    // sends dozens of small events (and more as it coasts), so it moves one
    // slot per swipe and the rest of that swipe is ignored.
    let acc = 0, lastWheel = 0, swipeUsed = false, lastSwitch = 0;
    window.addEventListener('wheel', (e) => {
      if (!this.enabled || !this.pointerLocked || !this.wheelSlots) return;
      const now = e.timeStamp || performance.now(); // when the swipe produced it
      if (now - lastWheel > 180) { acc = 0; swipeUsed = false; } // a new swipe
      lastWheel = now;
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      if (Math.abs(dy) >= 50) {
        // a wheel notch
        if (now - lastSwitch > 60) { this.slotSteps += dy > 0 ? 1 : -1; lastSwitch = now; }
        return;
      }
      if (swipeUsed) return;
      acc += dy;
      if (Math.abs(acc) >= 30) { this.slotSteps += acc > 0 ? 1 : -1; swipeUsed = true; lastSwitch = now; }
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
    if (k.has('KeyW')) mz += 1;
    if (k.has('KeyS')) mz -= 1;
    if (k.has('KeyD')) mx += 1;
    if (k.has('KeyA')) mx -= 1;
    // arrow keys look around (for touchpads and anyone without a mouse)
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this._pollAt || now)) / 1000);
    this._pollAt = now;
    if (this.enabled) {
      const turn = 2.4 * dt * this.sensitivity;
      if (k.has('ArrowRight')) this.lookDX += turn;
      if (k.has('ArrowLeft')) this.lookDX -= turn;
      if (k.has('ArrowUp')) this.lookDY -= turn * 0.7;
      if (k.has('ArrowDown')) this.lookDY += turn * 0.7;
    }
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
      use: this.use || !!this.useTouch || this.keys.has('KeyF'),
      pressed: this.pressed,
      slotSteps: this.slotSteps,
    };
    this.slotSteps = 0;
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
