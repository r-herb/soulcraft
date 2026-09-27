// Chunk manager: requests generation and meshing from a worker pool, keeps
// voxel data on the main thread for physics, tracks player edits for saving.
import * as THREE from 'three';
import { CHUNK, HEIGHT, B, IS_SOLID, IS_OPAQUE } from '../world/blocks.js';
import { PAD } from './mesher.js';

const S = CHUNK;
const PW = S + PAD * 2;

export class WorkerPool {
  constructor(size) {
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.pending = new Map();
    this.nextId = 1;
    this.failed = false;
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.onMessage(w, e.data);
      w.onerror = (e) => { console.warn('worker error', e.message); this.failed = true; };
      this.workers.push(w);
      this.idle.push(w);
    }
  }
  get busy() { return this.pending.size + this.queue.length; }
  run(msg, transfer = []) {
    return new Promise((resolve, reject) => {
      msg.id = this.nextId++;
      this.queue.push({ msg, transfer, resolve, reject });
      this.pump();
    });
  }
  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop();
      const job = this.queue.shift();
      this.pending.set(job.msg.id, job);
      w.postMessage(job.msg, job.transfer);
    }
  }
  onMessage(w, data) {
    const job = this.pending.get(data.id);
    this.pending.delete(data.id);
    this.idle.push(w);
    if (job) {
      if (data.type === 'error') job.reject(new Error(data.message));
      else job.resolve(data);
    }
    this.pump();
  }
  dispose() { this.workers.forEach((w) => w.terminate()); this.workers = []; }
}

export const ckey = (cx, cz) => cx + ',' + cz;
const lidx = (x, y, z) => x + z * S + y * S * S;

export class World {
  constructor({ scene, pool, materials, seed, dim, edits }) {
    this.scene = scene;
    this.pool = pool;
    this.materials = materials;
    this.seed = seed;
    this.dim = dim;
    this.edits = edits || {}; // chunkKey -> { localIndex: id }
    this.chunks = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.genInFlight = 0;
    this.meshInFlight = 0;
    this.generation = 0; // bumps on dispose so late worker replies are ignored
    this.onBlockChange = null;
  }

  dispose() {
    this.generation++;
    for (const c of this.chunks.values()) this.freeMeshes(c);
    this.chunks.clear();
    this.scene.remove(this.group);
  }

  freeMeshes(c) {
    for (const m of [c.solid, c.water]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    c.solid = c.water = null;
  }

  chunkAt(x, z) { return this.chunks.get(ckey(Math.floor(x / S), Math.floor(z / S))); }

  getBlock(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0) return this.dim === 'void' ? B.air : B.coreite;
    if (y >= HEIGHT) return B.air;
    const c = this.chunks.get(ckey(Math.floor(x / S), Math.floor(z / S)));
    if (!c || !c.data) return -1; // unknown / not loaded
    return c.data[lidx(x - c.cx * S, y, z - c.cz * S)];
  }

  isSolidAt(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id < 0) return true; // treat unloaded as solid so nobody falls through
    return IS_SOLID[id] === 1;
  }

  setBlock(x, y, z, id, record = true) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0 || y >= HEIGHT) return false;
    const cx = Math.floor(x / S), cz = Math.floor(z / S);
    const c = this.chunks.get(ckey(cx, cz));
    if (!c || !c.data) return false;
    const li = lidx(x - cx * S, y, z - cz * S);
    const prev = c.data[li];
    if (prev === id) return false;
    c.data[li] = id;
    if (record) {
      const k = ckey(cx, cz);
      (this.edits[k] || (this.edits[k] = {}))[li] = id;
    }
    // Remesh every chunk whose padded volume contains this cell.
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const n = this.chunks.get(ckey(cx + ox, cz + oz));
      if (!n) continue;
      const lx = x - n.cx * S, lz = z - n.cz * S;
      if (lx >= -PAD && lx < S + PAD && lz >= -PAD && lz < S + PAD) { n.dirty = true; n.urgent = true; }
    }
    if (this.onBlockChange) this.onBlockChange(x, y, z, prev, id);
    return true;
  }

  // Is this cell open to the sky (for entity lighting and mob spawning)?
  skyExposed(x, y, z) {
    for (let yy = Math.floor(y) + 1; yy < HEIGHT; yy++) {
      const id = this.getBlock(x, yy, z);
      if (id > 0 && IS_OPAQUE[id]) return false;
    }
    return true;
  }

  topSolid(x, z) {
    for (let y = HEIGHT - 1; y > 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id > 0 && IS_SOLID[id]) return y;
    }
    return -1;
  }

  // Highest standing spot at or below y0: a solid block with two free cells above.
  groundBelow(x, y0, z) {
    for (let y = Math.min(HEIGHT - 3, Math.floor(y0)); y > 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id > 0 && IS_SOLID[id] && !IS_SOLID[this.getBlock(x, y + 1, z)] && !IS_SOLID[this.getBlock(x, y + 2, z)] && this.getBlock(x, y + 1, z) >= 0) return y;
    }
    return -1;
  }

  isReadyAround(x, z) {
    const c = this.chunkAt(x, z);
    return !!(c && c.data && c.solid !== undefined && c.meshed);
  }

  update(px, pz, radius, budget = { gen: 3, mesh: 2 }) {
    const pcx = Math.floor(px / S), pcz = Math.floor(pz / S);
    const want = radius + 1;
    // Unload far chunks
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > want + 1 || Math.abs(c.cz - pcz) > want + 1) {
        this.freeMeshes(c);
        this.chunks.delete(k);
      }
    }
    // Build a distance-sorted list of wanted chunks (cached per player chunk)
    if (!this.order || this.orderKey !== pcx + ',' + pcz + ',' + want) {
      const list = [];
      for (let dx = -want; dx <= want; dx++) for (let dz = -want; dz <= want; dz++) list.push([dx, dz, dx * dx + dz * dz]);
      list.sort((a, b) => a[2] - b[2]);
      this.order = list; this.orderKey = pcx + ',' + pcz + ',' + want;
    }
    const gen = this.generation;
    const maxGen = Math.max(1, this.pool.workers.length * 2);
    for (const [dx, dz] of this.order) {
      if (this.genInFlight >= maxGen || budget.gen <= 0) break;
      const cx = pcx + dx, cz = pcz + dz;
      const k = ckey(cx, cz);
      if (this.chunks.has(k)) continue;
      const c = { cx, cz, data: null, solid: null, water: null, dirty: false, meshing: false, meshed: false };
      this.chunks.set(k, c);
      this.genInFlight++; budget.gen--;
      this.pool.run({ type: 'gen', seed: this.seed, dim: this.dim, cx, cz }).then((r) => {
        this.genInFlight--;
        if (gen !== this.generation || this.chunks.get(k) !== c) return;
        c.data = r.data;
        const e = this.edits[k];
        if (e) for (const li in e) c.data[li] = e[li];
        c.dirty = true;
        // neighbours may now be meshable with correct borders
        for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
          const n = this.chunks.get(ckey(cx + ox, cz + oz));
          if (n && n !== c && n.meshed) n.dirty = true;
        }
      }).catch((err) => { this.genInFlight--; console.warn(err); });
    }
    // Mesh dirty chunks within radius whose neighbours are all present
    const maxMesh = Math.max(1, this.pool.workers.length);
    const candidates = [];
    for (const [dx, dz] of this.order) {
      if (Math.abs(dx) > radius || Math.abs(dz) > radius) continue;
      const c = this.chunks.get(ckey(pcx + dx, pcz + dz));
      if (!c || !c.data || !c.dirty || c.meshing) continue;
      candidates.push(c);
    }
    candidates.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
    for (const c of candidates) {
      if (this.meshInFlight >= maxMesh || budget.mesh <= 0) break;
      const vol = this.buildPadded(c.cx, c.cz);
      if (!vol) continue;
      c.dirty = false; c.urgent = false; c.meshing = true;
      this.meshInFlight++; budget.mesh--;
      this.pool.run({ type: 'mesh', vol }, [vol.buffer]).then((r) => {
        this.meshInFlight--;
        c.meshing = false;
        if (gen !== this.generation || this.chunks.get(ckey(c.cx, c.cz)) !== c) return;
        this.applyMesh(c, r);
      }).catch((err) => { this.meshInFlight--; c.meshing = false; console.warn(err); });
    }
  }

  buildPadded(cx, cz) {
    const ns = [];
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      const n = this.chunks.get(ckey(cx + ox, cz + oz));
      if (!n || !n.data) return null;
      ns.push(n.data);
    }
    const vol = new Uint8Array(PW * PW * HEIGHT);
    for (let y = 0; y < HEIGHT; y++) {
      const yo = y * PW * PW, so = y * S * S;
      for (let z = 0; z < PW; z++) {
        const wz = z - PAD; // -PAD..S+PAD-1
        const nz = wz < 0 ? 0 : wz >= S ? 2 : 1;
        const lz = wz - (nz - 1) * S;
        for (let x = 0; x < PW; x++) {
          const wx = x - PAD;
          const nx = wx < 0 ? 0 : wx >= S ? 2 : 1;
          const lx = wx - (nx - 1) * S;
          vol[x + z * PW + yo] = ns[nz * 3 + nx][lx + lz * S + so];
        }
      }
    }
    return vol;
  }

  applyMesh(c, r) {
    this.freeMeshes(c);
    const make = (g, mat) => {
      if (!g.idx.length) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
      geo.setAttribute('aUV', new THREE.BufferAttribute(g.uv, 3));
      geo.setAttribute('aLight', new THREE.BufferAttribute(g.light, 3));
      geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
      // tight bounds so frustum culling can drop chunks above/below the view too
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.position.set(c.cx * S, 0, c.cz * S);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.group.add(m);
      return m;
    };
    c.solid = make(r.solid, this.materials.solid);
    c.water = make(r.water, this.materials.water);
    if (c.water) c.water.renderOrder = 1;
    c.meshed = true;
  }

  loadedCount() { let n = 0; for (const c of this.chunks.values()) if (c.meshed) n++; return n; }

  // Voxel raycast (Amanatides & Woo). Returns hit block + face normal.
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const tdx = sx ? Math.abs(1 / dir.x) : Infinity, tdy = sy ? Math.abs(1 / dir.y) : Infinity, tdz = sz ? Math.abs(1 / dir.z) : Infinity;
    let tmx = sx > 0 ? (x + 1 - origin.x) * tdx : sx < 0 ? (origin.x - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - origin.y) * tdy : sy < 0 ? (origin.y - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - origin.z) * tdz : sz < 0 ? (origin.z - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 64; i++) {
      const id = this.getBlock(x, y, z);
      if (id > 0 && id !== B.water && id !== B.magma) return { x, y, z, id, nx, ny, nz, dist: t };
      if (tmx < tmy && tmx < tmz) { t = tmx; if (t > maxDist) break; x += sx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { t = tmy; if (t > maxDist) break; y += sy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { t = tmz; if (t > maxDist) break; z += sz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}
