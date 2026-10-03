// "My avatar": the wardrobe. A turning 3D preview (drag to turn it, try the
// emotes) beside the catalog, one tab per slot: skin tone, face, hair, hat,
// top, pants, glasses, back, and the achievements that unlock the best items.
// Tapping an item tries it on; owned items are worn at once, others show
// their price in soul crystals or the achievement they come from. Closing the
// wardrobe takes off whatever was only tried on. Also the emote picker.
import * as THREE from 'three';
import { t, applyI18n } from '../i18n/index.js';
import { SVG } from './icons.js';
import { storeProfile } from '../save/account.js';
import { SLOTS, TONES, COLORS, ACHIEVEMENTS, AVATAR_PRICE, EMOTES, buildAvatar, animateAvatar, avatarOf, avatarUnlocked, owns, itemOf } from '../entities/avatar.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TABS = ['tone', 'face', 'hair', 'hat', 'top', 'pants', 'glasses', 'back', 'ach'];
const COLOR_OF = { hair: 'hairC', top: 'topC', pants: 'pantsC', hat: 'topC' };
// what each achievement gives
const REWARDS = {};
for (const [slot, list] of Object.entries(SLOTS)) for (const it of list) if (it.ach) (REWARDS[it.ach] ||= []).push([slot, it.id]);

// A small three.js stage on its own canvas: the preview, and the thumbnails
// drawn with the same renderer into a corner and copied out.
class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1.5, 3, 2.5); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xb8a6ff, 0.8); rim.position.set(-2, 1.5, -2); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.rig = null; this.yaw = 0.5; this.t = 0; this.emote = null; this.emoteT = 0;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(80, Math.round(r.width)); this.h = Math.max(100, Math.round(r.height));
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix();
  }

  show(cfg) {
    if (this.rig) this.holder.remove(this.rig.group);
    this.rig = buildAvatar(cfg);
    this.holder.add(this.rig.group);
  }

  frame(dt, drag) {
    if (!this.rig) return;
    this.t += dt;
    if (!drag) this.yaw += dt * 0.35;
    if (this.emote) { this.emoteT += dt; if (this.emote !== 'dance' && this.emoteT > 3) this.emote = null; }
    animateAvatar(this.rig, { t: this.t, emote: this.emote, emoteT: this.emoteT });
    this.holder.rotation.y = this.yaw;
    this.camera.position.set(0, 1.25, 5.6); this.camera.lookAt(0, 0.98, 0);
    this.renderer.setViewport(0, 0, this.w, this.h);
    this.renderer.render(this.scene, this.camera);
  }

  // a thumbnail of one item: the head close up, or the whole figure
  thumb(cfg, slot, out) {
    const size = 72, pr = this.renderer.getPixelRatio();
    const keep = this.rig;
    const rig = buildAvatar(cfg);
    if (keep) this.holder.remove(keep.group);
    this.holder.add(rig.group);
    animateAvatar(rig, { t: 0 });
    const head = ['face', 'hair', 'hat', 'glasses', 'tone'].includes(slot);
    this.holder.rotation.y = slot === 'back' ? Math.PI + 0.5 : head ? 0.35 : 0.45;
    if (head) { this.camera.position.set(0, 1.72, 2.1); this.camera.lookAt(0, 1.66, 0); } else { this.camera.position.set(0, 1.1, 5.2); this.camera.lookAt(0, 0.95, 0); }
    const asp = this.camera.aspect; this.camera.aspect = 1; this.camera.updateProjectionMatrix();
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(0, 0, size, size); this.renderer.setViewport(0, 0, size, size);
    this.renderer.setClearColor(0x000000, 0); this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    const x = out.getContext('2d');
    out.width = out.height = size * pr;
    x.clearRect(0, 0, out.width, out.height);
    x.drawImage(this.canvas, 0, this.canvas.height - size * pr, size * pr, size * pr, 0, 0, out.width, out.height);
    this.renderer.setScissorTest(false);
    this.camera.aspect = asp; this.camera.updateProjectionMatrix();
    this.holder.remove(rig.group);
    if (keep) this.holder.add(keep.group);
  }

  dispose() { try { this.renderer.dispose(); this.renderer.forceContextLoss(); } catch { /* gone */ } }
}

export function wardrobe(args, ui) {
  const profile = ui.app.profile;
  const g = ui.game;
  profile.avatar = profile.avatar || { unlocked: false, on: false, cfg: null };
  profile.avOwned = profile.avOwned || [];
  if (g && g.noteProgress && g.running) g.noteProgress();
  const node = el(`<div class="screen ${g && g.running ? 'scrim' : 'solid'}" data-screen="wardrobe">
    <div class="panel wardrobe-panel">
      <div class="panel-head"><h2 class="panel-title" data-i18n="av.title"></h2>
        <span class="stat-chip crystal-chip"><span class="crystal-ico"></span><span class="bal"></span></span>
        <button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="wd-layout">
        <div class="wd-side">
          <canvas class="wd-stage"></canvas>
          <div class="wd-emotes">${EMOTES.map((e) => `<button class="btn small ghost" data-emote="${e}" data-i18n="av.emote.${e}"></button>`).join('')}</div>
          <label class="wd-on"><input type="checkbox" class="wd-toggle"><span data-i18n="av.wear"></span></label>
        </div>
        <div class="wd-main">
          <div class="wd-tabs" role="tablist">${TABS.map((k) => `<button role="tab" data-tab="${k}" data-i18n="av.tab.${k}"></button>`).join('')}</div>
          <div class="wd-body"></div>
          <div class="wd-foot"><span class="faint small wd-hint"></span><button class="btn primary wd-act hidden"></button></div>
        </div>
      </div>
    </div></div>`);
  const $ = (s) => node.querySelector(s);
  const stageCanvas = $('.wd-stage'), body = $('.wd-body'), hint = $('.wd-hint'), act = $('.wd-act');
  let stage = null, raf = 0, last = performance.now(), drag = null;
  let tab = args.tab || 'hair';
  let saved = avatarOf(profile);
  let cfg = { ...saved };
  let pick = null; // [slot, id] being tried on but not owned
  const thumbs = new Map();

  const save = async () => { profile.avatar.cfg = { ...saved }; if (g && g.applySkin) g.applySkin(); await storeProfile(profile); };
  const wearsAvatar = () => !!(profile.avatar.on && avatarUnlocked(profile));
  const restage = () => { if (stage) stage.show(cfg); };
  const achName = (id) => t('av.ach.' + id);
  const itemName = (slot, id) => t(`av.${slot}.${id}`);

  const thumbOf = (slot, id) => {
    const key = slot + ':' + id + ':' + (slot in COLOR_OF ? cfg[COLOR_OF[slot]] : '') + ':' + cfg.tone + ':' + (slot === 'hair' || slot === 'hat' ? cfg.hair + cfg.hat : '');
    const c = document.createElement('canvas');
    c.className = 'wd-thumb';
    if (!stage) return c;
    if (thumbs.has(key)) { const src = thumbs.get(key); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; }
    const try1 = { ...cfg, [slot]: id };
    // a hat thumbnail without hair, the hair without a hat
    if (slot === 'hat') try1.hair = 'short';
    if (slot === 'hair') try1.hat = 'none';
    stage.thumb(try1, slot, c);
    const keep = document.createElement('canvas'); keep.width = c.width; keep.height = c.height; keep.getContext('2d').drawImage(c, 0, 0);
    thumbs.set(key, keep);
    return c;
  };

  const footer = () => {
    act.classList.add('hidden'); act.onclick = null;
    $('.bal').textContent = profile.crystals;
    if (!avatarUnlocked(profile)) {
      hint.textContent = t('av.lockedHint', { n: AVATAR_PRICE });
      act.classList.remove('hidden');
      act.innerHTML = `${esc(t('av.unlock'))} <span class="crystal-ico"></span>${AVATAR_PRICE}`;
      act.onclick = async () => {
        if (profile.crystals < AVATAR_PRICE) { ui.toast(t('toast.noCrystals'), 'warn'); return; }
        profile.crystals -= AVATAR_PRICE;
        profile.avatar.unlocked = true; profile.avatar.on = true;
        ui.audio.sfx('levelup'); ui.toast(t('av.unlocked'), 'soul');
        await save(); draw();
      };
      return;
    }
    if (pick) {
      const [slot, id] = pick, it = itemOf(slot, id);
      if (it.ach) { hint.textContent = t('av.fromAch', { name: achName(it.ach) }); return; }
      hint.textContent = t('av.tryingOn', { name: itemName(slot, id) });
      act.classList.remove('hidden');
      act.innerHTML = `${esc(t('shop.buy'))} <span class="crystal-ico"></span>${it.price}`;
      act.onclick = async () => {
        if (profile.crystals < it.price) { ui.toast(t('toast.noCrystals'), 'warn'); return; }
        profile.crystals -= it.price;
        profile.avOwned.push(slot + ':' + id);
        saved[slot] = id; pick = null;
        ui.audio.sfx('levelup'); ui.toast(t('av.bought', { name: itemName(slot, id) }), 'soul');
        await save(); draw();
      };
      return;
    }
    hint.textContent = wearsAvatar() ? t('av.hint') : t('av.offHint');
  };

  const swatches = (key, list) => {
    const row = el('<div class="wd-swatches"></div>');
    list.forEach((col, i) => {
      const b = el(`<button class="wd-sw ${cfg[key] === i ? 'on' : ''}" style="background:${col}" aria-label="${esc(t('av.color', { n: i + 1 }))}"></button>`);
      b.addEventListener('click', async () => { ui.click(); cfg[key] = i; saved[key] = i; restage(); await save(); draw(); });
      row.appendChild(b);
    });
    return row;
  };

  const drawAch = () => {
    const list = el('<div class="wd-ach"></div>');
    for (const a of ACHIEVEMENTS) {
      const done = a.test(profile);
      const gives = (REWARDS[a.id] || []).map(([s, id]) => itemName(s, id)).join(', ');
      list.appendChild(el(`<div class="wd-ach-row ${done ? 'done' : ''}"><i>${done ? '&#10003;' : '&#9711;'}</i><div><b>${esc(achName(a.id))}</b><p class="faint small">${esc(t('av.achHow.' + a.id))}</p><p class="small wd-gives">${esc(t('av.gives', { items: gives }))}</p></div></div>`));
    }
    list.appendChild(el(`<p class="faint small">${esc(t('av.freeUnlock'))}</p>`));
    body.appendChild(list);
  };

  const draw = () => {
    node.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('.wd-toggle').checked = wearsAvatar();
    $('.wd-toggle').disabled = !avatarUnlocked(profile);
    body.innerHTML = '';
    if (tab === 'ach') drawAch();
    else if (tab === 'tone') body.appendChild(swatches('tone', TONES));
    else {
      const grid = el('<div class="wd-grid"></div>');
      for (const it of SLOTS[tab]) {
        const own = owns(profile, tab, it.id);
        const on = cfg[tab] === it.id;
        const card = el(`<button class="wd-card ${on ? 'sel' : ''} ${own ? '' : 'locked'}" data-item="${tab}:${it.id}"><span class="nm"></span><span class="pr"></span></button>`);
        card.prepend(thumbOf(tab, it.id));
        card.querySelector('.nm').textContent = itemName(tab, it.id);
        card.querySelector('.pr').innerHTML = saved[tab] === it.id ? esc(t('shop.equipped')) : own ? '&#10003;' : it.ach ? `&#9733; ${esc(achName(it.ach))}` : `<span class="crystal-ico"></span>${it.price}`;
        card.addEventListener('click', async () => {
          ui.click();
          cfg = { ...saved, [tab]: it.id };
          if (own) { saved[tab] = it.id; pick = null; await save(); } else pick = [tab, it.id];
          restage(); draw();
        });
        grid.appendChild(card);
      }
      body.appendChild(grid);
      if (COLOR_OF[tab] && tab !== 'hat') { body.appendChild(el(`<p class="small wd-label">${esc(t('av.colorOf.' + tab))}</p>`)); body.appendChild(swatches(COLOR_OF[tab], COLORS)); }
    }
    footer();
  };

  node.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    ui.click(); tab = b.dataset.tab;
    // leaving a tab takes off what was only tried on there
    if (pick) { cfg = { ...saved }; pick = null; restage(); }
    draw();
  }));
  node.querySelectorAll('[data-emote]').forEach((b) => b.addEventListener('click', () => { ui.click(); if (stage) { stage.emote = b.dataset.emote; stage.emoteT = 0; } }));
  $('.wd-toggle').addEventListener('change', async (e) => {
    ui.click();
    profile.avatar.on = e.target.checked;
    ui.toast(t(profile.avatar.on ? 'av.nowOn' : 'av.nowOff'), 'soul');
    await save(); draw();
  });
  stageCanvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: stage ? stage.yaw : 0 }; stageCanvas.setPointerCapture(e.pointerId); e.stopPropagation(); });
  stageCanvas.addEventListener('pointermove', (e) => { if (drag && stage) stage.yaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
  const endDrag = () => { drag = null; };
  stageCanvas.addEventListener('pointerup', endDrag); stageCanvas.addEventListener('pointercancel', endDrag);

  const close = () => { cancelAnimationFrame(raf); if (stage) stage.dispose(); stage = null; };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); close(); ui.back(); });
  const obs = new MutationObserver(() => { if (!node.isConnected) { close(); obs.disconnect(); } });
  setTimeout(() => obs.observe(document.getElementById('screens'), { childList: true }), 0);
  applyI18n(node);
  // the stage needs the canvas laid out first
  requestAnimationFrame(() => {
    if (!node.isConnected) return;
    try { stage = new Stage(stageCanvas); stage.show(cfg); } catch (e) { console.warn('wardrobe preview', e); }
    draw();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (stage) { if (stage.w !== Math.round(stageCanvas.getBoundingClientRect().width)) stage.resize(); stage.frame(dt, !!drag); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
  draw();
  return node;
}

// the emote picker: wave, dance, cheer
export function emotes(args, ui) {
  const g = ui.game;
  const node = el(`<div class="screen scrim" data-screen="emotes">
    <div class="panel emote-panel">
      <div class="panel-head"><h2 class="panel-title" data-i18n="av.emotes"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="emote-grid">${EMOTES.map((e) => `<button class="btn" data-emote="${e}" data-i18n="av.emote.${e}"></button>`).join('')}</div>
      <p class="faint small" data-i18n="av.emoteHint"></p>
    </div></div>`);
  node.querySelectorAll('[data-emote]').forEach((b) => b.addEventListener('click', () => { ui.click(); g.startEmote(b.dataset.emote); ui.closeAll(); }));
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  return node;
}
