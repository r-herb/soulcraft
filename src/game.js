// Game orchestrator: renderer, world, player, interaction, entities, bosses,
// time of day, travel between realms, saving.
import * as THREE from 'three';
import { buildAtlas } from './engine/atlas.js';
import { createAtlasTexture, createChunkMaterials } from './engine/material.js';
import { World, WorkerPool } from './engine/world.js';
import { Sky, isNight } from './engine/sky.js';
import { Player, EYE, FLY_GEARS } from './player/player.js';
import { cacheLoot, panLoot } from './world/gems.js';
import { Inventory } from './player/inventory.js';
import { ITEMS, blockDrop } from './player/items.js';
import { BLOCKS, B, SHAPE } from './world/blocks.js';
import { Layout, DIM_SPAWNS, BOSS_SPAWNS, ARENAS, CHAMBER } from './world/structures.js';
import { EntityManager } from './entities/entities.js';
import { Pet, PET } from './entities/pets.js';
import { DailyTracker, currentEvent } from './quest/daily.js';
import { BossManager, BOSS_ORDER } from './bosses/bosses.js';
import { HeldItem } from './player/held.js';
import { Figure, playerSkin, ACHIEVEMENTS } from './entities/avatar.js';
import { settings } from './save/settings.js';
import { saveWorld } from './save/db.js';
import { slot, pushSave, storeProfile, newWorldId } from './save/account.js';
import { t } from './i18n/index.js';
import { setIconAtlas } from './ui/icons.js';
import { itemName } from './ui/hud.js';
import { QuestManager, newQuestState } from './quest/questManager.js';
import { QUEST_SEED, QUEST_SPAWN } from './world/quest.js';
import { CityData } from './world/city.js';
import { MAX_LIVES } from './player/lives.js';
import { BusNet } from './world/bus.js';
import { BusManager } from './entities/buses.js';
import { Farm, harvestOf, isCrop, HATCH_SECONDS } from './world/farm.js';
import { Livestock } from './entities/livestock.js';
import { Missions } from './quest/missions.js';
import { Heist } from './quest/heist.js';

// real-city data, loaded once per city
const cityCache = new Map();
export function loadCityData(id) {
  if (!cityCache.has(id)) cityCache.set(id, CityData.load(id).catch((e) => { cityCache.delete(id); throw e; }));
  return cityCache.get(id);
}

const busCache = new Map();
function loadBusNet(id) {
  if (!busCache.has(id)) busCache.set(id, BusNet.load(id));
  return busCache.get(id);
}

const DAY_SECONDS = 600; // one full day-night cycle
const REACH = 5;

export class Game {
  constructor({ canvas, ui, audio, input, profile }) {
    this.canvas = canvas;
    this.ui = ui;
    this.audio = audio;
    this.input = input;
    this.profile = profile;
    this.running = false;
    this.paused = true;
    this.world = null;
    this.meta = null;
    this.clock = new THREE.Clock(false);
    this.fps = 0;
    this._frames = 0; this._fpsT = 0;
    this.mobile = input.touchMode;
    this.tmpV = new THREE.Vector3();
    this.target = null;
    this.breaking = null;
    this.attackCooldown = 0;
    this.useCooldown = 0;
    this.autosaveT = 0;
    this.stepT = 0;
  }

  // ---------- setup ----------
  initRenderer() {
    THREE.ColorManagement.enabled = false;
    let renderer;
    renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.mobile, powerPreference: 'high-performance', alpha: false, stencil: false });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    // shader compile checks stall the first frames; only worth it in dev
    renderer.debug.checkShaderErrors = !!import.meta.env.DEV;
    this.renderer = renderer;
    this.quality = { mode: 'auto', scale: 0, rdCap: 0 };
    this.applyPixelRatio();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 400);
    this.scene.add(this.camera);
    this.sky = new Sky(this.scene);
    this.buildTextures(settings().textures);
    const hw = navigator.hardwareConcurrency || 4;
    this.pool = new WorkerPool(Math.max(1, Math.min(this.mobile ? 2 : 3, hw - 1)));
    // target outline
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x05040f, transparent: true, opacity: 0.75 }));
    this.outline.visible = false;
    this.scene.add(this.outline);
    // crack overlay
    this.crackTex = makeCrackTexture();
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.crack.visible = false;
    this.scene.add(this.crack);
    // lights for entity materials
    this.ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.sunLight.position.set(0.4, 1, 0.3);
    this.scene.add(this.ambient, this.sunLight);
    this.held = new HeldItem(this);
    // the player's own figure, seen in the third-person views
    this.selfFig = new Figure();
    this.selfFig.object.visible = false;
    this.scene.add(this.selfFig.object);
    this.thirdPerson = 0; // 0 first person, 1 behind, 2 in front
    this.emote = null;
    this.entities = new EntityManager(this);
    this.farm = new Farm(this);
    this.livestock = new Livestock(this);
    this.missions = new Missions(this);
    this.heist = new Heist(this);
    this.daily = new DailyTracker(this);
    this.event = currentEvent();
    this.bosses = new BossManager(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  buildTextures(style) {
    this.atlasCanvas = buildAtlas(style);
    setIconAtlas(this.atlasCanvas);
    if (this.atlasTex) {
      this.atlasTex.image = this.atlasCanvas;
      this.atlasTex.needsUpdate = true;
    } else {
      this.atlasTex = createAtlasTexture(this.atlasCanvas);
      this.materials = createChunkMaterials(this.atlasTex);
    }
  }

  // ---------- quality ----------
  // "auto" starts a little under the screen's density and adapts: the
  // resolution drops when frames run slow (weak phones are limited by
  // pixels, not by JS) and climbs back when there is headroom; at the
  // lowest resolution it also trims the view distance. "low" and "high"
  // are fixed.
  qualityLimits() {
    const dpr = window.devicePixelRatio || 1;
    const mode = settings().quality || 'auto';
    const max = Math.min(dpr, mode === 'high' || !this.mobile ? 2 : 1.5);
    const min = Math.min(max, this.mobile ? 0.6 : 0.75);
    return { mode, max, min };
  }

  applyPixelRatio() {
    const { mode, max, min } = this.qualityLimits();
    const q = this.quality;
    if (mode === 'low') { q.scale = Math.min(max, this.mobile ? 0.75 : 1); q.rdCap = 3; }
    else if (mode === 'high') { q.scale = max; q.rdCap = 0; }
    else q.scale = Math.max(min, Math.min(max, q.scale || (this.mobile ? Math.min(max, 1.25) : max)));
    q.mode = mode;
    this.renderer.setPixelRatio(q.scale);
    if (this.camera) this.resize();
  }

  // Render distance actually used: the setting, capped by the quality mode.
  viewDistance() {
    const rd = settings().renderDistance;
    return this.quality.rdCap ? Math.min(rd, this.quality.rdCap) : rd;
  }

  adaptQuality() {
    const q = this.quality;
    if (q.mode !== 'auto' || !this.running || this.paused) { q.frames = 0; q.t0 = 0; return; }
    const now = performance.now();
    if (!q.t0) { q.t0 = now; q.frames = 0; return; }
    q.frames++;
    const span = now - q.t0;
    if (span < 2000) return;
    const fps = (q.frames * 1000) / span;
    q.t0 = now; q.frames = 0; q.fps = Math.round(fps);
    const { max, min } = this.qualityLimits();
    if (fps < 40) {
      q.calm = 0;
      if (q.scale > min + 0.01) { q.scale = Math.max(min, q.scale * 0.85); q.drops = (q.drops || 0) + 1; this.renderer.setPixelRatio(q.scale); this.resize(); }
      else if (fps < 28) {
        q.slow = (q.slow || 0) + 1;
        if (q.slow >= 2 && this.viewDistance() > 2) { q.rdCap = this.viewDistance() - 1; q.slow = 0; }
      }
    } else if (fps > 55) {
      q.slow = 0;
      q.calm = (q.calm || 0) + span;
      // raise slowly, and stop trying after a few drops: every change costs
      // a hitch, so a device near the limit should settle, not flip-flop
      if (q.calm >= 8000 && (q.drops || 0) < 3) {
        q.calm = 0;
        if (q.rdCap && q.rdCap < settings().renderDistance) q.rdCap++;
        else if (q.rdCap) q.rdCap = 0;
        else if (q.scale < max - 0.01) { q.scale = Math.min(max, q.scale * 1.1); this.renderer.setPixelRatio(q.scale); this.resize(); }
      }
    } else { q.slow = 0; q.calm = 0; }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  // ---------- world lifecycle ----------
  newMeta({ name, seed, difficulty, creative = false }) {
    return {
      version: 1, worldId: newWorldId(), name, seed, difficulty: creative ? 'peaceful' : difficulty, creative: !!creative,
      dim: 'overworld', time: 0.02, day: 1, playTime: 0,
      edits: {}, player: null, inventory: null,
      bosses: { voidDragon: false, shellKing: false, whirlwindKing: false, emberWarden: false, soulStorm: false },
      villagers: {},
      stats: { broken: 0, placed: 0, kills: 0, deaths: 0, crystals: 0 },
      tutorial: {}, victory: false, hasLantern: false,
    };
  }

  // A world in a real city (see src/world/city.js): the map comes from the
  // city file, not from a seed.
  newCityMeta({ city, name, creative = false, difficulty = 'normal' }) {
    const m = this.newMeta({ name, seed: 7, difficulty, creative });
    m.city = city;
    m.dim = 'city';
    return m;
  }

  // realms with a sky, day and night (the generated overworld and cities)
  get outdoors() { return !!this.meta && (this.meta.dim === 'overworld' || this.meta.dim === 'city'); }

  newQuestMeta() {
    const m = this.newMeta({ name: t('quest.name'), seed: QUEST_SEED, difficulty: 'normal' });
    m.mode = 'quest';
    m.dim = 'quest';
    m.quest = newQuestState();
    return m;
  }

  get isQuest() { return !!(this.meta && this.meta.mode === 'quest'); }
  // creative worlds: no damage or hunger, flying, instant mining, endless blocks, no crystals
  get creative() { return !!(this.meta && this.meta.creative && !this.isQuest); }
  // the save slot of the running world
  get saveBase() { return this.isQuest ? 'quest' : 'w-' + this.meta.worldId; }

  async start(meta, onProgress = () => {}) {
    this.meta = meta;
    if (meta.mode !== 'quest' && !meta.worldId) meta.worldId = newWorldId();
    this.quest = meta.mode === 'quest' ? new QuestManager(this) : null;
    this.layout = Layout.get(meta.seed);
    this.city = meta.city ? await loadCityData(meta.city) : null;
    if (this.buses) this.buses.clear();
    if (this.heist) this.heist.clear();
    const busNet = this.city ? await loadBusNet(meta.city) : null;
    this.buses = busNet ? new BusManager(this, busNet) : null;
    this.player = new Player();
    this.inventory = new Inventory(meta.inventory);
    this.inventory.onChange = () => this.ui.hud && this.ui.hud.refreshHotbar();
    if (!meta.inventory) { if (this.quest) this.giveQuestKit(); else if (this.creative) this.giveCreativeKit(); else this.giveStarterKit(); }
    this.ui.hud && this.ui.hud.el.classList.toggle('creative', this.creative);
    // the Treasure Quest's blade follows the player into every normal world
    if (!this.quest && this.profile.rewards && this.profile.rewards.starfall && !meta.starfallGiven) { meta.starfallGiven = true; this.inventory.add('starfall_blade', 1); }
    if (!this.quest && this.profile.rewards && this.profile.rewards.frostbrand && !meta.frostbrandGiven) { meta.frostbrandGiven = true; this.inventory.add('frostbrand', 1); }
    const p = meta.player;
    if (p) {
      this.player.pos.set(p.x, p.y, p.z);
      this.player.yaw = p.yaw || 0; this.player.pitch = p.pitch || 0;
      this.player.health = p.health ?? 20; this.player.maxHealth = p.maxHealth || 20;
      this.player.food = p.food ?? 20;
    } else if (this.quest) {
      this.player.pos.set(QUEST_SPAWN.x, QUEST_SPAWN.y, QUEST_SPAWN.z);
      this.player.yaw = -Math.PI / 2; // down the course (+x)
    } else if (this.city) {
      const s = this.city.spawnPoint();
      this.player.pos.set(s.x, s.y, s.z);
    } else {
      const s = this.layout.spawnPoint();
      this.player.pos.set(s.x, s.y, s.z);
      this.player.yaw = Math.PI; // face the village well
    }
    this.player.autoJump = settings().autoJump;
    await this.loadRealm(meta.dim, onProgress, !p && !this.quest);
    this.running = true;
    this.paused = false;
    this.clock.start();
    this.ui.hud.show(this);
    this.bosses.restore();
    this.startLoop();
  }

  giveQuestKit() {
    this.inventory.add('iron_sword', 1);
    this.inventory.add('bow', 1);
    this.inventory.add('arrow', 32);
    this.inventory.add('roast', 8);
    this.inventory.add('sunfruit', 6);
  }

  giveCreativeKit() {
    for (const [k, n] of [['planks', 64], ['stone', 64], ['brick', 64], ['glass', 64], ['torch', 64], ['log', 64], ['ember_lamp', 64], ['wool', 64]]) {
      if (ITEMS[k]) this.inventory.add(k, n);
    }
  }

  giveStarterKit() {
    this.inventory.add('wood_pickaxe', 1);
    this.inventory.add('wood_sword', 1);
    this.inventory.add('torch', 8);
    this.inventory.add('planks', 16);
    this.inventory.add('sunfruit', 4);
  }

  async loadRealm(dim, onProgress, findGround = false) {
    if (this.world) this.world.dispose();
    if (this.world && this.meta.dim) this.livestock.parkAll();
    this.entities.clear();
    if (this.buses) this.buses.clear();
    if (this.heist) this.heist.clear();
    this.bosses.clearActive();
    this.meta.dim = dim;
    if (!this.meta.edits[dim]) this.meta.edits[dim] = {};
    this.world = new World({ scene: this.scene, pool: this.pool, materials: this.materials, seed: this.meta.seed, dim, edits: this.meta.edits[dim] });
    if (this.quest) { this.world.genExtra = () => this.quest.genExtra(); this.quest.reset(); }
    if (this.city && dim === 'city') { this.world.genExtra = (cx, cz) => this.city.slice(cx, cz); this.world.genReady = (cx, cz) => this.city.readyFor(cx, cz); }
    this.world.onBlockChange = (x, y, z, prev, id) => {
      this.entities.onBlockChange(x, y, z, prev, id);
      this.farm.onBlockChange(x, y, z, prev, id);
      if (this.net) this.net.blockChanged(x, y, z, id);
    };
    const rd = this.viewDistance();
    const need = (2 * Math.min(rd, 2) + 1) ** 2;
    const t0 = performance.now();
    // Pump chunk loading until the area around the player is meshed.
    await new Promise((resolve) => {
      const tick = () => {
        this.world.update(this.player.pos.x, this.player.pos.z, rd, { gen: 8, mesh: 4 });
        const pcx = Math.floor(this.player.pos.x / 16), pcz = Math.floor(this.player.pos.z / 16);
        let done = 0;
        for (let dx = -Math.min(rd, 2); dx <= Math.min(rd, 2); dx++) for (let dz = -Math.min(rd, 2); dz <= Math.min(rd, 2); dz++) {
          const c = this.world.chunks.get((pcx + dx) + ',' + (pcz + dz));
          if (c && c.meshed) done++;
        }
        onProgress(done / need);
        if (done >= need || performance.now() - t0 > 25000) resolve();
        else setTimeout(tick, 16);
      };
      tick();
    });
    if (findGround) this.placeOnGround();
    this.entities.onRealmLoaded();
  }

  placeOnGround(scanY = 126) {
    const p = this.player.pos;
    const top = this.world.groundBelow(p.x, scanY, p.z);
    if (top > 0) p.y = top + 1.05;
    this.player.vel.set(0, 0, 0);
    this.player.fallStart = null;
  }

  bossName(id) { return t('boss.' + id); }

  // atlas tile of a block's side (for break particles)
  blockTile(id) { const b = BLOCKS[id]; return b && b.tex ? b.tex.side : 0; }

  async travel(dim, where) {
    // a shared world stays in the overworld, a city world in its city
    if (this.net) { this.ui.toast(t('mp.noTravel'), 'warn'); return; }
    if (this.city) { this.ui.toast(t('city.noTravel'), 'warn'); return; }
    this.ui.showLoading(t('toast.travel', { name: t('realm.' + (where === 'chamber' ? 'chamber' : dim)) }));
    this.paused = true;
    this.audio.sfx('portal');
    let spawn, scanY = 126;
    if (dim === 'overworld') {
      if (where === 'chamber') { spawn = { x: CHAMBER.x + 0.5, y: CHAMBER.floor + 1.1, z: CHAMBER.z + CHAMBER.z0 + 3.5 }; scanY = CHAMBER.floor + 2; }
      else spawn = this.layout.spawnPoint();
    } else {
      spawn = BOSS_SPAWNS[where] || DIM_SPAWNS[dim];
      scanY = spawn.scanY;
    }
    this.player.pos.set(spawn.x, spawn.y || 100, spawn.z);
    this.player.vel.set(0, 0, 0);
    this.player.fallStart = null;
    // face the arena / into the chamber
    this.player.yaw = where === 'chamber' ? Math.PI : 0;
    this.player.pitch = 0;
    await this.loadRealm(dim, (f) => this.ui.setLoading(f), false);
    this.placeOnGround(scanY);
    if (where !== 'chamber' && where) { const a = ARENAS[where]; if (a) this.player.yaw = Math.atan2(-(a.x - this.player.pos.x), -(a.z - this.player.pos.z)); }
    this.ui.hideLoading();
    this.paused = false;
    this.bosses.onArrive(dim, where);
    this.save(true);
  }

  stop() {
    if (this.net) this.net.leave();
    this.running = false;
    this.paused = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.world) { this.world.dispose(); this.world = null; }
    this.entities.clear();
    if (this.buses) this.buses.clear();
    if (this.heist) this.heist.clear();
    this.bosses.clearActive();
    this.ui.hud.hide();
    this.input.exitLock();
  }

  // ---------- saving ----------
  serialize() {
    const p = this.player;
    return {
      ...this.meta,
      animals: this.livestock.snapshot(),
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.health, maxHealth: p.maxHealth, food: p.food },
      inventory: this.inventory.toJSON(),
    };
  }

  // a guest in someone else's world: the host keeps the guest's things
  get isGuest() { return !!(this.meta && this.meta.guest); }

  async save(silent = false) {
    if (!this.meta || !this.player) return false;
    if (this.isGuest) {
      if (this.net) this.net.sendGuestSave();
      await storeProfile(this.profile);
      if (!silent) this.ui.toast(t('mp.savedByHost'), 'ok');
      return true;
    }
    // return crafting grid contents so nothing is lost
    if (this.inventory.grid.some(Boolean)) this.inventory.returnGrid();
    const base = this.saveBase;
    const rec = this.serialize();
    rec.savedAt = Date.now();
    const ok = await saveWorld(rec, slot(base), true);
    pushSave(base, rec);
    await storeProfile(this.profile);
    if (!silent || !ok) this.ui.toast(ok ? t(silent ? 'toast.autosaved' : 'toast.saved') : t('toast.saveFailed'), ok ? 'ok' : 'warn');
    return ok;
  }

  // ---------- loop ----------
  startLoop() {
    if (this.raf) return;
    const frame = () => {
      this.raf = requestAnimationFrame(frame);
      try { this.frame(); } catch (e) { console.error(e); }
    };
    this.raf = requestAnimationFrame(frame);
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    this._frames++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = Math.round(this._frames / this._fpsT); this._frames = 0; this._fpsT = 0; }
    const inp = this.input.poll();
    if (this.running && !this.paused && this.world) {
      this.update(dt, inp);
    } else if (this.running && this.world) {
      this.world.update(this.player.pos.x, this.player.pos.z, this.viewDistance(), { gen: 2, mesh: 1 });
      // a shared world goes on while this player is in a menu
      if (this.net) this.netTick(dt);
    }
    if (this.world) this.render(dt);
    this.adaptQuality();
  }

  // Paused in a shared world: time, monsters and the other players go on.
  netTick(dt) {
    const m = this.meta;
    if (this.net.isHost && this.outdoors) {
      m.time += dt / DAY_SECONDS;
      if (m.time >= 1) { m.time -= 1; m.day++; }
    }
    this.entities.update(dt);
    this.net.update(dt);
  }

  update(dt, inp) {
    const m = this.meta;
    const pl = this.player;
    this.handlePressed(inp);
    if (this.paused) return;
    if (this.creative) this.flyControl(inp);
    if (!this._movedOnce && (inp.move.x || inp.move.z)) { this._movedOnce = true; setTimeout(() => this.ui.tutorialDone('move'), 1500); }
    m.playTime += dt;
    if (this.outdoors) {
      const before = m.time;
      m.time += dt / DAY_SECONDS;
      if (m.time >= 1) {
        m.time -= 1; m.day++; this.ui.toast(t('toast.dayBegins', { n: m.day })); this.entities.onNewDay(); if (!pl.dead) this.daily.note('night');
        if (this.lives < MAX_LIVES) { m.lives = this.lives + 1; this.ui.toast(t('wmap.lifeBack', { n: m.lives, max: MAX_LIVES })); }
      }
      if (!isNight(before) && isNight(m.time)) {
        this.ui.toast(t('toast.nightFalls'), 'warn');
        this.ui.tutorial('night');
      }
    }
    const rd = this.viewDistance();
    this.world.update(pl.pos.x, pl.pos.z, rd, { gen: this.mobile ? 2 : 3, mesh: this.mobile ? 1 : 2 });
    // don't simulate physics until the chunk under the player exists
    const here = this.world.chunkAt(pl.pos.x, pl.pos.z);
    if (here && here.data) {
      // fixed-size physics steps, so jumps carry the same way at any frame rate
      const n = Math.min(6, Math.ceil(dt * 60 - 0.01));
      const still = n > 1 ? { ...inp, lookDX: 0, lookDY: 0 } : inp;
      if (this.buses && this.buses.riding) { pl.yaw -= inp.lookDX; pl.pitch = Math.max(-1.55, Math.min(1.55, pl.pitch - inp.lookDY)); }
      else for (let i = 0; i < n; i++) pl.update(dt / n, i ? still : inp, this.world, this);
    }
    else { pl.yaw -= inp.lookDX; pl.pitch = Math.max(-1.55, Math.min(1.55, pl.pitch - inp.lookDY)); }
    if (this.buses && this.meta.dim === 'city') { this.buses.update(dt, inp); this.buses.afterPlayer(inp); }
    this.environmentDamage(dt);
    this.hunger(dt);
    this.interact(dt, inp);
    this.entities.update(dt);
    this.farm.update(dt);
    this.livestock.update(dt);
    this.missions.update(dt);
    this.heist.update(dt);
    if (this.city && this.meta.dim === 'city') { this._tileT = (this._tileT || 0) - dt; if (this._tileT <= 0) { this._tileT = 1; this.city.ensure(pl.pos.x, pl.pos.z, 200); } }
    this.petTick(dt);
    if (pl.moving) this.daily.walked(Math.hypot(pl.vel.x, pl.vel.z) * dt);
    this._progT = (this._progT || 0) - dt;
    if (this._progT <= 0) { this._progT = 5; this.noteProgress(); }
    // an emote ends when the player moves; a wave and a cheer after a few seconds
    if (this.emote) { this.emote.t += dt; if (pl.moving || pl.dead || (this.emote.id !== 'dance' && this.emote.t > 3)) this.emote = null; }
    this.eventTick(dt);
    this.bosses.update(dt);
    if (this.net) this.net.update(dt);
    if (this.quest) this.quest.update(dt);
    // footsteps
    if (pl.moving) { this.stepT -= dt; if (this.stepT <= 0) { this.audio.sfx('step'); this.stepT = 0.38; } }
    // music mood
    this.audio.setMode(this.bosses.active ? 'boss' : (this.outdoors && isNight(m.time)) ? 'night' : 'calm');
    // autosave every minute
    this.autosaveT += dt;
    if (this.autosaveT > 60) { this.autosaveT = 0; this.save(true); }
    this.ui.hud.update(this, dt);
  }

  handlePressed(inp) {
    if (inp.slotSteps) this.selectSlot((((this.inventory.selected + inp.slotSteps) % 9) + 9) % 9);
    const P = inp.pressed;
    if (!P.size) return;
    if (P.has('pause') || P.has('lockLost')) { if (!this.paused) this.ui.openPause(); return; }
    if (P.has('inventory')) { this.ui.openInventory(); return; }
    if (P.has('map')) { this.ui.openMap(); return; }
    if (P.has('help')) { this.ui.open('help'); return; }
    if (P.has('fps')) this.ui.toggleFps();
    if (P.has('view')) this.cycleView();
    if (P.has('emote')) { this.ui.open('emotes'); return; }
    // J: the guide on the card, else the missions (the mouse stays in the game)
    if (P.has('guide')) { if (this.ui.hud.guideAction) this.ui.hud.guideAction(); else if (this.missions.active) this.ui.open('missions'); return; }
    for (let i = 0; i < 9; i++) if (P.has('slot' + i)) this.selectSlot(i);
    if (P.has('nextSlot')) this.selectSlot((this.inventory.selected + 1) % 9);
    if (P.has('prevSlot')) this.selectSlot((this.inventory.selected + 8) % 9);
    if (P.has('drop')) {
      const h = this.inventory.held;
      if (h) { const k = h.item; this.inventory.consumeHeld(1); this.entities.dropItem(k, 1, this.player.eye.add(this.player.lookDir().multiplyScalar(1)), this.player.lookDir().multiplyScalar(5)); }
    }
  }

  // The achievements behind the avatar's best items: the bosses beaten and the
  // longest survival follow the player between worlds (in the profile); a
  // newly reached achievement is announced once.
  noteProgress() {
    const pr = this.profile, m = this.meta;
    if (!pr || !m) return;
    let changed = false;
    if (!this.creative && !this.isQuest) {
      const b = new Set(pr.bossesBeaten || []);
      for (const id of BOSS_ORDER) if (m.bosses && m.bosses[id] && !b.has(id)) { b.add(id); changed = true; }
      if (changed) pr.bossesBeaten = [...b];
      if (!this.isGuest && (m.day || 0) > (pr.bestDay || 0)) { pr.bestDay = m.day; changed = true; }
    }
    const seen = new Set(pr.achSeen || []);
    for (const a of ACHIEVEMENTS) {
      if (seen.has(a.id) || !a.test(pr)) continue;
      seen.add(a.id); changed = true;
      this.ui.toast(t('av.achNew', { name: t('av.ach.' + a.id) }), 'soul');
    }
    if (changed) { pr.achSeen = [...seen]; storeProfile(pr); }
  }

  // the player's look: a classic skin or the avatar
  applySkin() {
    const skin = playerSkin(this.profile);
    this.held.setSkin(skin);
    this.selfFig.setSkin(skin);
  }

  // first person, behind the player, in front of them
  cycleView() {
    this.thirdPerson = (this.thirdPerson + 1) % 3;
  }

  // wave, dance, cheer: seen in the third-person view and by the other players
  startEmote(id) {
    this.emote = id ? { id, t: 0 } : null;
    if (id && !this.thirdPerson) this.thirdPerson = 2;
  }

  selectSlot(i) {
    this.inventory.selected = i;
    this.ui.hud.refreshHotbar();
    this.audio.sfx('click');
  }

  // ---------- interaction ----------
  interact(dt, inp) {
    const pl = this.player;
    // on a bus: no mining or building, the use button is the bus's action
    if (this.buses && this.buses.riding) {
      this.outline.visible = false; this.target = null; this.targetEntity = null;
      if (inp.pressed.has('use')) this.buses.action();
      return;
    }
    const eye = pl.eye;
    const dir = pl.lookDir();
    this.attackCooldown -= dt;
    this.useCooldown -= dt;
    const hit = pl.dead ? null : this.world.raycast(eye, dir, REACH);
    const ent = pl.dead ? null : this.entities.raycast(eye, dir, hit ? Math.min(hit.dist, REACH) : REACH);
    this.target = hit;
    this.targetEntity = ent;
    if (hit && !ent) {
      this.outline.visible = true;
      this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      const s = SHAPE[hit.id];
      this.outline.scale.set(1, s === 3 ? 0.65 : 1, 1);
      if (s === 3) this.outline.position.y = hit.y + 0.33;
    } else this.outline.visible = false;

    // glowing boss shells close in front are knocked back on attack
    if (inp.pressed.has('attack') && this.bosses.active && this.entities.autoParry(eye, dir)) { this.held.swing(); this.attackCooldown = 0.3; }
    // attacking entities takes priority over mining
    if (ent && (inp.pressed.has('attack') || (inp.attack && this.attackCooldown <= 0))) {
      if (this.attackCooldown <= 0) {
        this.attackCooldown = 0.45;
        this.held.swing();
        this.entities.playerHit(ent, this.meleeDamage(ent), dir);
      }
      this.resetBreaking();
    } else if (inp.attack && hit && (!this.quest || this.quest.canBreak(hit))) {
      this.mine(dt, hit);
    } else {
      if (inp.pressed.has('attack')) this.held.swing();
      this.resetBreaking();
    }
    // a shield is raised while use is held down
    const heldDef = this.inventory.held && ITEMS[this.inventory.held.item];
    this.blocking = !!(heldDef && heldDef.shield && inp.use && !pl.dead);
    if (this.blocking) return;
    if (inp.pressed.has('use') || (inp.use && this.useCooldown <= 0 && this.inventory.held && ITEMS[this.inventory.held.item]?.block !== undefined)) {
      if (this.useCooldown <= 0) this.use(hit, ent, dir, inp.pressed.has('use'));
    }
  }

  meleeDamage(ent) {
    const h = this.inventory.held;
    const def = h && ITEMS[h.item];
    let dmg = def && def.damage ? def.damage : 1;
    if (ent && ent.emberWarden && def && def.emberBonus) dmg += def.emberBonus;
    return dmg;
  }

  breakTime(id) {
    const b = BLOCKS[id];
    if (!b || b.hardness < 0) return this.player.god ? 0.15 : Infinity;
    if (this.player.god || this.creative) return 0.05;
    const h = this.inventory.held;
    const def = h && ITEMS[h.item];
    const rightTool = def && def.tool && def.tool === b.tool;
    const canHarvest = !b.tier || (def && def.tool === 'pick' && def.tier >= b.tier);
    const speed = rightTool ? def.speed : 1;
    return Math.max(0.05, b.hardness * (canHarvest ? 1 : 3) / speed);
  }

  mine(dt, hit) {
    if (this.mineDelay > 0) { this.mineDelay -= dt; return; }
    const key = hit.x + ',' + hit.y + ',' + hit.z;
    if (!this.breaking || this.breaking.key !== key) this.breaking = { key, t: 0, total: this.breakTime(hit.id), sfx: 0 };
    const br = this.breaking;
    if (!isFinite(br.total)) { this.crack.visible = false; return; }
    br.t += dt;
    br.sfx -= dt;
    if (br.sfx <= 0) { this.audio.sfx('dig'); br.sfx = 0.25; this.held.swing(); }
    const stage = Math.min(9, Math.floor((br.t / br.total) * 10));
    this.crack.visible = true;
    this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    this.crackTex.offset.x = stage / 10;
    if (br.t >= br.total) {
      this.breakBlock(hit);
      this.resetBreaking();
      this.mineDelay = 0.25;
    }
  }

  resetBreaking() { this.breaking = null; this.crack.visible = false; }

  breakBlock(hit) {
    const b = BLOCKS[hit.id];
    const h = this.inventory.held;
    const def = h && ITEMS[h.item];
    const canHarvest = !b.tier || (def && def.tool === 'pick' && def.tier >= b.tier) || this.player.god;
    this.world.setBlock(hit.x, hit.y, hit.z, B.air);
    this.meta.stats.broken++;
    this.daily.note('break');
    if (b.key.endsWith('_ore')) this.daily.note('ore');
    this.audio.sfx('break');
    this.vibrate(15);
    this.entities.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, b.tex ? b.tex.side : 0);
    if (this.creative) { this.ui.tutorialDone('break'); return; }
    if (!canHarvest) { this.ui.toast(t('toast.needTool'), 'warn'); return; }
    if (isCrop(hit.id)) {
      for (const [item, n] of harvestOf(hit.id)) this.entities.dropItem(item, n, new THREE.Vector3(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5));
      this.ui.tutorialDone('break');
      return;
    }
    const drop = blockDrop(hit.id);
    if (drop === 'soul_crystal') {
      this.addCrystals(hit.id === B.dusk_soul_ore ? 2 : 1);
    } else if (drop) {
      this.entities.dropItem(drop, 1, new THREE.Vector3(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5));
    }
    // leaves of a tree now and then drop an orange pip
    if (hit.id === B.leaves && Math.random() < 0.08) this.entities.dropItem('orange_seed', 1, new THREE.Vector3(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5));
    // blocks that can't float (plants/torches) above the broken one pop off
    const above = this.world.getBlock(hit.x, hit.y + 1, hit.z);
    if (above > 0 && (SHAPE[above] === 2 || SHAPE[above] === 3)) {
      this.world.setBlock(hit.x, hit.y + 1, hit.z, B.air);
      if (isCrop(above)) for (const [item, n] of harvestOf(above)) this.entities.dropItem(item, n, new THREE.Vector3(hit.x + 0.5, hit.y + 1.4, hit.z + 0.5));
      const d = isCrop(above) ? null : blockDrop(above);
      if (d) this.entities.dropItem(d, 1, new THREE.Vector3(hit.x + 0.5, hit.y + 1.4, hit.z + 0.5));
    }
    this.ui.tutorialDone('break');
  }

  // eat something worth `food` half-drumsticks; false when already full
  hungry() { return this.player.food < 20 || this.player.health < this.player.maxHealth; }
  feed(food) {
    if (!this.hungry()) return false;
    this.player.food = Math.min(20, this.player.food + food);
    this.player.saturation = Math.min(this.player.food, this.player.saturation + food * 0.6);
    this.player.health = Math.min(this.player.maxHealth, this.player.health + Math.ceil(food / 2));
    this.daily.note('eat');
    this.audio.sfx('eat');
    return true;
  }

  use(hit, ent, dir, fresh) {
    const h = this.inventory.held;
    const def = h && ITEMS[h.item];
    if (this.quest && hit && fresh && this.quest.interact(hit)) { this.useCooldown = 0.3; return; }
    // city buses: board one standing at a stop, read the timetable at a stop sign
    if (fresh && this.buses && this.buses.tryBoard()) { this.useCooldown = 0.3; return; }
    // a cash machine; in the city the counter of the central bank does the rest
    if (fresh && hit && hit.id === B.atm) { this.ui.open('bank', { atm: this.meta.dim === 'city' }); this.useCooldown = 0.3; return; }
    if (fresh && hit && hit.id === B.bank_counter) { this.ui.open('bank'); this.missions.event('bank'); this.useCooldown = 0.3; return; }
    if (fresh && hit && hit.id === B.market_stall) { this.ui.open('foodShop'); this.useCooldown = 0.3; return; }
    if (fresh && hit && hit.id === B.restaurant) { this.ui.open('restaurant'); this.useCooldown = 0.3; return; }
    if (fresh && hit && hit.id === B.bus_stop && this.buses) { this.ui.open('busStop', { x: hit.x, z: hit.z }); this.useCooldown = 0.3; return; }
    if (def && def.special === 'treasureMap' && fresh) { this.ui.open('treasureMap'); this.useCooldown = 0.3; return; }
    // armor in hand goes on (swapping what was worn)
    if (def && def.armor && fresh) { if (this.inventory.equipHeld()) { this.audio.sfx('place'); this.ui.toast(t('toast.armorOn', { item: itemName(h ? h.item : '') })); } this.useCooldown = 0.3; return; }
    // gems: open a hidden cache, pan for gold in water
    // the heist: the Gran Diamante in the vault, the bank's plan
    if (fresh && hit && hit.id === B.grand_diamond) { this.heist.takeDiamond(hit); this.useCooldown = 0.3; return; }
    if (def && def.special === 'heistMap' && fresh) { this.ui.open('heistMap'); this.useCooldown = 0.3; return; }
    // the other ways into the vault: the sewer's hatches, the coded vault door, the uniform, firecrackers
    if (fresh && hit && hit.id === B.sewer_grate) { this.heist.useGrate(hit); this.useCooldown = 0.4; return; }
    if (fresh && hit && hit.id === B.vault_door) { this.heist.openVaultDoor(hit); this.useCooldown = 0.4; return; }
    if (def && def.special === 'uniform' && fresh) { this.heist.wearUniform(); this.useCooldown = 0.4; return; }
    if (def && def.special === 'firecracker' && fresh) { this.heist.firecracker(); this.useCooldown = 0.6; return; }
    if (fresh && hit && hit.id === B.gem_cache) { this.openCache(hit); this.useCooldown = 0.3; return; }
    if (def && def.special === 'pan' && fresh) { this.pan(); this.useCooldown = 1.2; return; }
    // farm 2: ripe oranges picked, eggs from a nest box, eggs into an incubator
    if (fresh && hit && hit.id === B.orange_3) {
      const n = this.farm.pick(hit.x, hit.y, hit.z);
      if (n) { this.giveItem('orange', n); this.audio.sfx('pickup'); this.held.swing(); this.ui.toast(t('farm.picked', { n }), 'ok'); }
      this.useCooldown = 0.3; return;
    }
    if (fresh && hit && hit.id === B.nest_box && !(def && def.block !== undefined)) {
      const n = this.farm.collect(hit.x, hit.y, hit.z);
      if (n) { this.giveItem('egg', n); this.audio.sfx('pickup'); }
      this.ui.toast(n ? t('farm.eggs', { n }) : t('farm.nestEmpty'));
      this.useCooldown = 0.3; return;
    }
    if (fresh && hit && hit.id === B.incubator && !(def && def.block !== undefined)) {
      if (h && h.item === 'egg') {
        if (this.farm.incubate(hit.x, hit.y, hit.z)) { if (!this.creative) this.inventory.consumeHeld(1); this.audio.sfx('place'); this.ui.toast(t('farm.incubating', { n: this.farm.incubator(hit.x, hit.y, hit.z).eggs.length })); }
        else this.ui.toast(t('farm.incubatorFull'), 'warn');
      } else {
        const inc = this.farm.incubator(hit.x, hit.y, hit.z), n = inc ? inc.eggs.length : 0;
        const left = n ? Math.max(0, Math.ceil(HATCH_SECONDS - ((this.meta.playTime || 0) - Math.min(...inc.eggs)))) : 0;
        this.ui.toast(n ? t('farm.incubatorState', { n, s: left }) : t('farm.incubatorHint'));
      }
      this.useCooldown = 0.3; return;
    }
    // farm animals take their food; crates release an animal; seeds are planted
    if (ent && ent.passive && fresh) { this.livestock.feed(ent); this.useCooldown = 0.3; return; }
    if (def && def.animal && fresh) { if (this.livestock.release(def.animal, hit)) this.useCooldown = 0.3; return; }
    if (def && def.plant && fresh && hit && !(def.food && !(hit.ny === 1))) {
      if (hit.ny === 1 && this.farm.plant(hit.x, hit.y, hit.z, def.plant)) {
        if (!this.creative) this.inventory.consumeHeld(1);
        this.audio.sfx('place'); this.held.swing(); this.useCooldown = 0.25;
        return;
      }
      if (!def.food) { this.ui.toast(t('farm.plantHint')); this.useCooldown = 0.3; return; }
    }
    // villagers
    if (ent && ent.villager && fresh) { this.ui.openTrade(ent); this.useCooldown = 0.3; return; }
    // workbench opens crafting
    if (hit && hit.id === B.workbench && fresh && !(def && def.block !== undefined)) { this.ui.openInventory(); this.useCooldown = 0.3; return; }
    if (def && def.food && fresh) {
      if (!this.feed(def.food)) { this.ui.toast(t('toast.fullHealth')); return; }
      this.missions.event('eat', { item: h.item });
      this.inventory.consumeHeld(1);
      this.useCooldown = 0.4;
      return;
    }
    if (def && def.heart && fresh) {
      if (this.player.maxHealth >= 40) return;
      this.player.maxHealth += 2; this.player.health = this.player.maxHealth;
      this.inventory.consumeHeld(1);
      this.ui.toast(t('toast.newHeart'), 'soul');
      this.audio.sfx('levelup');
      this.useCooldown = 0.4;
      return;
    }
    if (def && def.special === 'map' && fresh) { this.ui.open(this.isQuest ? 'treasureMap' : 'map'); this.useCooldown = 0.3; return; }
    if (def && def.weapon === 'bow' && fresh) {
      const free = this.player.god || this.creative;
      if (this.inventory.count('arrow') <= 0 && !free) { this.ui.toast(t('desc.bow'), 'warn'); return; }
      if (!free) this.inventory.remove('arrow', 1);
      this.entities.shoot('arrow', this.player.eye, dir, 34, def.damage, 'player');
      this.audio.sfx('shoot'); this.held.swing();
      this.useCooldown = 0.7;
      return;
    }
    if (def && def.throwable && fresh) {
      const kind = def.throwable;
      if (!this.creative) this.inventory.consumeHeld(1);
      this.entities.shoot(kind, this.player.eye, dir, kind === 'wind' ? 22 : 26, def.damage || 0, 'player');
      this.audio.sfx('throw'); this.held.swing();
      this.useCooldown = 0.5;
      return;
    }
    // Bridge assist in the quest's build zone: looking down past the edge
    // places the block next to the last one, no side-face aiming needed.
    if (def && def.block !== undefined && this.quest && fresh) {
      const cell = this.quest.bridgeCell(this.player.eye, dir, hit);
      if (cell) hit = { x: cell.x, y: cell.y - 1, z: cell.z, nx: 0, ny: 1, nz: 0, id: 0, assist: true };
    }
    // "use" on a block with nothing placeable in hand: say how to place
    if (fresh && hit && !(def && def.block !== undefined) && !(def && (def.food || def.heart || def.special || def.weapon === 'bow' || def.throwable))) {
      const now = performance.now();
      if (now - (this._placeHintAt || 0) > 8000) { this._placeHintAt = now; this.ui.toast(t(this.input.touchMode ? 'toast.pickBlock' : 'toast.pickBlockDesktop')); }
      return;
    }
    if (def && def.block !== undefined && hit) {
      const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
      const cur = this.world.getBlock(x, y, z);
      if (cur < 0 || !BLOCKS[cur].replaceable) return;
      if (this.quest && !this.quest.canPlace(x, y, z)) { if (fresh) this.ui.toast(t('quest.noBuild'), 'warn'); this.useCooldown = 0.4; return; }
      if (y < 1 || y > 126) return;
      const nb = BLOCKS[def.block];
      if (nb.solid && (this.player.intersectsBlock(x, y, z) || this.entities.occupies(x, y, z))) return;
      if ((nb.shape === 'cross' || nb.shape === 'torch') && !BLOCKS[this.world.getBlock(x, y - 1, z)]?.solid) return;
      this.world.setBlock(x, y, z, def.block);
      if (!this.creative) this.inventory.consumeHeld(1);
      this.meta.stats.placed++;
      this.daily.note('place');
      this.audio.sfx('place');
      this.held.swing();
      this.vibrate(8);
      this.useCooldown = this.input.touchMode ? 0.28 : 0.2;
      this.ui.tutorialDone('place');
    }
  }

  // Seasonal event touches: drifting snow, petals or embers around the player.
  eventTick(dt) {
    const ev = this.event;
    if (!ev || !this.outdoors || this.isQuest) return;
    this._evAcc = (this._evAcc || 0) + dt * (this.mobile ? 14 : 28);
    const p = this.player.pos, [r, g, b] = ev.particles;
    while (this._evAcc >= 1) {
      this._evAcc -= 1;
      const x = p.x + (Math.random() - 0.5) * 24, z = p.z + (Math.random() - 0.5) * 24, y = p.y + 4 + Math.random() * 8;
      if (ev.id === 'harvest') this.entities.particles.drift(x, p.y + Math.random() * 3, z, r, g, b, (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, 5);
      else this.entities.particles.drift(x, y, z, r, g, b, (Math.random() - 0.5) * (ev.id === 'bloom' ? 1.2 : 0.4), -(0.8 + Math.random() * 0.8), (Math.random() - 0.5) * 0.6, 7);
    }
  }

  // Keep the chosen companion in the world (it is cleared with the other
  // entities on travel, so it comes back here).
  petTick(dt) {
    this._petT = (this._petT || 0) - dt;
    if (this._petT > 0) return;
    this._petT = 1;
    const want = !this.quest && this.profile.pet && PET[this.profile.pet] ? this.profile.pet : null;
    const have = this.pet && !this.pet.dead && this.entities.list.includes(this.pet) ? this.pet : null;
    if (have && have.kind === want) return;
    if (have) { have.dead = true; this.pet = null; }
    if (!want) return;
    const c = this.world.chunkAt(this.player.pos.x, this.player.pos.z);
    if (!c || !c.data) return;
    this.pet = this.entities.add(new Pet(this, want, this.player.pos.x, this.player.pos.y, this.player.pos.z));
    this.pet.teleportNear();
  }

  // Creative flight: double-tap jump (or the touch fly button) toggles it.
  flyControl(inp) {
    const p = this.player;
    const now = performance.now();
    let toggle = inp.pressed.has('fly');
    if (inp.jump && !this._jumpWas) {
      if (now - (this._jumpAt || 0) < 320) { toggle = true; this._jumpAt = 0; } else this._jumpAt = now;
    }
    this._jumpWas = inp.jump;
    if (toggle) {
      p.fly = !p.fly;
      p.vel.y = 0;
      this.ui.toast(t(p.fly ? 'toast.flyOn' : 'toast.flyOff'));
    }
    // flight speed gears (V or the gear button): 1x, 2.5x, 5x, 10x
    if (inp.pressed.has('flyspeed')) {
      p.flyGear = ((p.flyGear || 0) + 1) % FLY_GEARS.length;
      const g = FLY_GEARS[p.flyGear];
      const lbl = this.ui.hud && this.ui.hud.el.querySelector('.act.flyspeed .gear');
      if (lbl) lbl.textContent = `${g}x`;
      this.ui.toast(t('toast.flySpeed', { n: g }));
    }
  }

  // ---------- health ----------
  vibrate(ms) {
    if (!settings().vibration) return;
    try { navigator.vibrate && navigator.vibrate(ms); } catch { /* unsupported */ }
  }

  // the shield held and raised (use held down), facing where the blow comes from
  shieldBlocks(source, knockDir) {
    const p = this.player, h = this.inventory.held, def = h && ITEMS[h.item];
    if (!def || !def.shield || !this.blocking) return false;
    let from = null;
    if (source && source.pos) from = { x: source.pos.x - p.pos.x, z: source.pos.z - p.pos.z };
    else if (knockDir) from = { x: -knockDir.x, z: -knockDir.z };
    if (from) {
      const look = p.lookDir(), L = Math.hypot(from.x, from.z) || 1;
      if ((look.x * from.x + look.z * from.z) / (Math.hypot(look.x, look.z) * L || 1) < 0.2) return false; // from behind or the side
    }
    h.dmg = (h.dmg || 0) + 1;
    if (h.dmg >= def.dura) { this.inventory.slots[this.inventory.selected] = null; this.inventory.changed(); this.ui.toast(t('toast.armorBroke', { item: itemName(h.item) }), 'warn'); }
    this.audio.sfx('deflect');
    this.held.swing();
    return true;
  }

  damagePlayer(amount, cause = 'generic', source = null, knockDir = null) {
    const p = this.player;
    if (p.dead || amount <= 0) return false;
    if (p.god) return false;
    if (this.creative && cause !== 'void') return false;
    if (p.invuln > 0 && cause !== 'magma' && cause !== 'void') return false;
    const diff = this.meta.difficulty;
    if (cause === 'mob' || cause === 'boss') amount = Math.ceil(amount * (diff === 'hard' ? 1.4 : diff === 'peaceful' ? 0.5 : 1));
    const fight = cause === 'mob' || cause === 'boss' || cause === 'guard' || cause === 'cactus';
    // a raised shield stops a blow from the front
    if (fight && cause !== 'cactus' && this.shieldBlocks(source, knockDir)) return false;
    // armor (as in the classic game): each point takes 4% off, less against big hits, up to 80%
    if (fight) {
      const inv = this.inventory, pts = inv.armorPoints;
      if (pts > 0) {
        const eff = Math.max(pts / 5, pts - (4 * amount) / (inv.toughness + 8));
        amount = Math.max(amount > 0 ? 0.5 : 0, amount * (1 - Math.min(20, eff) / 25));
        for (const k of inv.wearArmor()) { this.ui.toast(t('toast.armorBroke', { item: itemName(k) }), 'warn'); this.audio.sfx('break'); }
      }
    }
    p.health -= amount;
    p.invuln = 0.5;
    p.hurtTime = 0.3;
    if (knockDir) { p.knock.set(knockDir.x * 7, 5.5, knockDir.z * 7); }
    this.audio.sfx('hurt');
    this.vibrate(40);
    this.ui.hud.flashHurt();
    if (p.health <= 0) { p.health = 0; this.die(cause, source); }
    return true;
  }

  die(cause, source) {
    const p = this.player;
    p.dead = true;
    this.meta.stats.deaths++;
    // what ends a life, for the admin's statistics
    const causes = this.meta.stats.causes || (this.meta.stats.causes = {});
    causes[cause] = (causes[cause] || 0) + 1;
    if (this.quest) this.quest.noteFail();
    if (this.heist) this.heist.onDeath();
    this.audio.sfx('death');
    this.resetBreaking();
    this.input.exitLock();
    this.ui.openDeath(cause, source);
  }

  async respawn() {
    const p = this.player;
    p.dead = false;
    p.health = p.maxHealth;
    p.food = Math.max(p.food, 14);
    p.vel.set(0, 0, 0);
    p.fallStart = null;
    // Respawn at the realm's entry point; bosses reset their fight.
    const dim = this.meta.dim;
    this.bosses.onPlayerDeath();
    if (this.quest) {
      this.quest.toCheckpoint();
    } else if (this.homeHere()) {
      const h = this.meta.home; p.pos.set(h.x + 0.5, 126, h.z + 0.5); await this.ensureLoaded(); this.placeOnGround();
    } else if (dim === 'city' && this.city) {
      const s = this.city.spawnPoint(); p.pos.set(s.x, s.y, s.z); await this.ensureLoaded(); this.placeOnGround();
    } else if (dim === 'overworld') {
      const inChamber = Math.abs(p.pos.x - CHAMBER.x) < 30 && Math.abs(p.pos.z - CHAMBER.z) < 30 && p.pos.y < CHAMBER.ceil + 2;
      if (inChamber) { p.pos.set(CHAMBER.x + 0.5, CHAMBER.floor + 1.1, CHAMBER.z + CHAMBER.z0 + 3.5); }
      else { const s = this.layout.spawnPoint(); p.pos.set(s.x, s.y, s.z); await this.ensureLoaded(); this.placeOnGround(); }
    } else {
      // respawn at the arena of the fight in progress, else the realm entry
      const near = Object.entries(BOSS_SPAWNS).find(([id]) => ARENAS[id].dim === dim && Math.hypot(p.pos.x - ARENAS[id].x, p.pos.z - ARENAS[id].z) < 60);
      const s = near ? near[1] : DIM_SPAWNS[dim];
      p.pos.set(s.x, 100, s.z);
      await this.ensureLoaded();
      this.placeOnGround(s.scanY);
    }
    await this.ensureLoaded();
    this.paused = false;
    this.bosses.onArrive(dim, null, true);
  }

  // ---------- the world map: travel to a place picked on it ----------
  get lives() { return this.meta.lives ?? MAX_LIVES; }
  // the world map works in the overworld and in cities
  get mapTravelOk() { return !this.isQuest && (this.meta.dim === 'overworld' || this.meta.dim === 'city'); }
  homeHere() { const h = this.meta.home; return !!(h && h.dim === this.meta.dim && !this.isQuest); }

  // Moves the player to column (x, z) and makes it the respawn point. Costs a
  // life in survival. Returns false when it cannot go.
  async mapTravel(x, z) {
    if (!this.mapTravelOk || this.player.dead) return false;
    const free = !!this.creative;
    if (!free && this.lives <= 0) { this.ui.toast(t('wmap.noLives'), 'warn'); return false; }
    if (!free) this.meta.lives = this.lives - 1;
    this.ui.closeAll();
    this.ui.showLoading(t('wmap.travelling'));
    this.paused = true;
    this.audio.sfx('portal');
    const p = this.player;
    if (this.city && this.meta.dim === 'city') {
      // the tiles there first, then a spot off buildings and the sea
      await this.city.ensure(x, z, 64);
      const c = this.city.openCellNear(Math.floor(x), Math.floor(z), 48);
      if (!c) { if (!free) this.meta.lives = this.lives + 1; this.ui.hideLoading(); this.paused = false; this.ui.toast(t('wmap.cantLand'), 'warn'); return false; }
      x = c.x; z = c.z;
    }
    p.pos.set(Math.floor(x) + 0.5, 126, Math.floor(z) + 0.5);
    p.vel.set(0, 0, 0);
    p.fallStart = null;
    await this.ensureLoaded();
    this.placeOnGround();
    this.meta.home = { dim: this.meta.dim, x: Math.floor(x), z: Math.floor(z) };
    this.ui.hideLoading();
    this.save(true);
    this.ui.toast(free ? t('wmap.arrived') : t('wmap.arrivedLives', { n: this.lives, max: MAX_LIVES }));
    return true;
  }

  async ensureLoaded() {
    for (let i = 0; i < 200; i++) {
      this.world.update(this.player.pos.x, this.player.pos.z, this.viewDistance(), { gen: 8, mesh: 4 });
      const c = this.world.chunkAt(this.player.pos.x, this.player.pos.z);
      if (c && c.meshed) return;
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  environmentDamage(dt) {
    const p = this.player;
    if (p.dead) return;
    if (p.inMagma) { this._magmaT = (this._magmaT || 0) - dt; if (this._magmaT <= 0) { this._magmaT = 0.5; this.damagePlayer(4, 'magma'); } }
    // cactus prickles on touch
    this._cactusT = Math.max(0, (this._cactusT || 0) - dt);
    if (!this._cactusT && this.touching(B.cactus)) { this._cactusT = 0.6; this.damagePlayer(1, 'cactus'); }
    if (p.pos.y < -8) { if (this.meta.dim === 'void' || p.pos.y < -30) this.damagePlayer(999, 'void'); }
  }

  // Is the player's body touching a block of this type (sides or below)?
  touching(id) {
    const p = this.player.pos, w = this.world, r = 0.36;
    for (const y of [p.y + 0.2, p.y + 1.1]) {
      if (w.getBlock(p.x + r, y, p.z) === id || w.getBlock(p.x - r, y, p.z) === id || w.getBlock(p.x, y, p.z + r) === id || w.getBlock(p.x, y, p.z - r) === id) return true;
    }
    return w.getBlock(p.x, p.y - 0.05, p.z) === id;
  }

  hunger(dt) {
    const p = this.player;
    if (p.dead) return;
    if (this.creative) { p.food = 20; p.health = p.maxHealth; return; }
    if (this.quest) { p.food = 20; this._regenT = (this._regenT || 0) + dt; if (this._regenT > 2.5) { this._regenT = 0; if (p.health < p.maxHealth) p.health++; } return; }
    const drain = (p.moving ? 0.018 : 0.008) * (this.meta.difficulty === 'peaceful' ? 0.3 : 1);
    p.saturation -= drain * dt * 2.5;
    if (p.saturation < 0) { p.saturation = 0; p.food = Math.max(0, p.food - drain * dt * 2.5); }
    this._regenT = (this._regenT || 0) + dt;
    if (this._regenT > (this.meta.difficulty === 'peaceful' ? 1.5 : 3.5)) {
      this._regenT = 0;
      if (p.food >= 14 && p.health < p.maxHealth) { p.health = Math.min(p.maxHealth, p.health + 1); p.food = Math.max(0, p.food - 0.4); }
      else if (p.food <= 0 && p.health > 2) this.damagePlayer(1, 'generic');
    }
  }

  addCrystals(n) {
    if (this.creative) return;
    this.profile.crystals += n;
    this.profile.totalCrystals = (this.profile.totalCrystals || 0) + n;
    this.meta.stats.crystals += n;
    this.audio.sfx('crystal');
    this.ui.toast(t(n === 1 ? 'toast.crystal' : 'toast.crystals', { n }), 'soul');
  }

  // a hidden gem cache: a handful of gems (and gold), once
  openCache(hit) {
    this.world.setBlock(hit.x, hit.y, hit.z, B.gem_cache_open);
    const loot = cacheLoot();
    for (const [item, n] of Object.entries(loot)) this.giveItem(item, n);
    this.audio.sfx('crystal');
    this.entities.burst(hit.x + 0.5, hit.y + 1, hit.z + 0.5, 0);
    this.ui.toast(t('gems.cache', { list: Object.entries(loot).map(([k, n]) => `${n}x ${itemName(k)}`).join(', ') }), 'soul');
    this.missions.event('cache');
    return loot;
  }

  // panning: standing in water (or right by it) with a gold pan
  pan(rand = Math.random) {
    const p = this.player.pos, w = this.world;
    let water = this.player.inWater;
    for (let dz = -1; dz <= 1 && !water; dz++) for (let dx = -1; dx <= 1 && !water; dx++) for (const dy of [-1, 0]) if (w.getBlock(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz) === B.water) water = true;
    if (!water) { this.ui.toast(t('gems.panNoWater'), 'warn'); return null; }
    this.audio.sfx('step');
    const got = panLoot(rand);
    if (got) { this.giveItem(got, 1); this.audio.sfx('pickup'); this.ui.toast(t('gems.panFound', { item: itemName(got) }), 'ok'); this.missions.event('pan', { item: got }); }
    else this.ui.toast(t('gems.panNothing'));
    return got;
  }

  giveItem(item, count = 1) {
    const left = this.inventory.add(item, count);
    if (left > 0) this.entities.dropItem(item, left, this.player.eye.clone());
  }

  // ---------- rendering ----------
  render(dt) {
    const p = this.player;
    const cam = this.camera;
    let bob = 0;
    const third = this.thirdPerson && !p.dead && !(this.buses && this.buses.riding);
    if (p.moving && !third) bob = Math.sin(p.walkPhase * 2) * 0.05;
    cam.position.set(p.pos.x, p.pos.y + EYE + bob + (p.dead ? -1.2 : 0), p.pos.z);
    cam.rotation.set(0, 0, 0);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = p.yaw;
    cam.rotation.x = p.pitch;
    cam.rotation.z = p.dead ? 0.6 : (p.hurtTime > 0 ? Math.sin(p.hurtTime * 40) * 0.03 : 0);
    if (third) this.thirdPersonCamera(cam, p);
    this.selfFig.object.visible = !!third;
    if (third) this.updateSelfFig(dt, p);
    const rd = this.viewDistance();
    cam.far = rd * 16 + 48;
    cam.updateProjectionMatrix();
    const daylight = this.sky.update(this.meta.time, cam, this.meta.dim, this.materials.uniforms, rd, this.scene);
    // the shaders: time for the wind and the ripples, the warm light of dawn and dusk
    const U = this.materials.uniforms;
    U.uTime.value = (U.uTime.value + dt) % 3600;
    U.uFx.value = settings().shaders === false ? 0 : 1;
    U.uDusk.value = this.meta.dim === 'overworld' || this.meta.dim === 'city' ? Math.max(0, 1 - Math.abs(daylight - 0.45) / 0.3) : 0;
    this.ambient.intensity = 0.35 + daylight * 0.5;
    this.sunLight.intensity = 0.2 + daylight * 0.5;
    this.scene.fog = null;
    this.held.update(dt);
    this.entities.render(dt);
    this.renderer.render(this.scene, cam);
  }

  // The camera pulled back behind the player (or in front, looking back at
  // them), stopped short of any wall in between.
  thirdPersonCamera(cam, p) {
    const front = this.thirdPerson === 2;
    const dir = p.lookDir();
    if (front) { dir.negate(); cam.rotation.y = p.yaw + Math.PI; cam.rotation.x = -p.pitch; }
    const from = cam.position.clone();
    let d = 0.3;
    const want = 4;
    for (; d < want; d += 0.1) {
      const x = from.x - dir.x * d, y = from.y - dir.y * d, z = from.z - dir.z * d;
      const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id && BLOCKS[id] && BLOCKS[id].solid) break;
    }
    d = Math.max(0.3, d - 0.3);
    cam.position.set(from.x - dir.x * d, from.y - dir.y * d, from.z - dir.z * d);
  }

  updateSelfFig(dt, p) {
    const f = this.selfFig;
    if (!f.rig) this.applySkin();
    const h = this.inventory.held;
    f.setHeld(h ? h.item : null);
    f.setEmote(this.emote ? this.emote.id : null);
    const sw = this.held.swingT > 0 ? this.held.swingT : 0;
    f.animate(dt, { speed: p.moving ? Math.hypot(p.vel.x, p.vel.z) : 0, vy: p.onGround ? 0 : p.vel.y, pitch: p.pitch, swing: sw });
    f.object.position.copy(p.pos);
    f.object.rotation.set(0, p.yaw + Math.PI, 0);
  }

  realmStatus() {
    // Which bosses are available on the Soul Map.
    const b = this.meta.bosses;
    const status = {};
    let prevDone = true;
    for (const id of BOSS_ORDER) {
      if (b[id]) status[id] = 'done';
      else if (prevDone && (id !== 'voidDragon' || this.meta.hasLantern || this.inventory.count('void_lantern') > 0)) status[id] = 'ready';
      else status[id] = 'locked';
      prevDone = prevDone && b[id];
    }
    return status;
  }

  arenaFor(id) { return ARENAS[id]; }
}

function makeCrackTexture() {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 16;
  const x = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lines = [];
  for (let i = 0; i < 26; i++) lines.push([Math.floor(rnd() * 16), Math.floor(rnd() * 16), rnd() < 0.5 ? 1 : 0]);
  for (let s = 0; s < 10; s++) {
    const n = Math.floor(((s + 1) / 10) * lines.length);
    x.fillStyle = 'rgba(0,0,0,0.75)';
    for (let i = 0; i < n; i++) {
      const [lx, ly, dirn] = lines[i];
      for (let k = 0; k < 3 + (s >> 1); k++) {
        const px = dirn ? lx + k : lx, py = dirn ? ly : ly + k;
        if (px < 16 && py < 16) x.fillRect(s * 16 + px, py, 1, 1);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.repeat.set(0.1, 1);
  return tex;
}
