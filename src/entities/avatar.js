// Roblox-style avatars: a rounded figure with elbows and knees (upper and
// lower arms and legs, hands, feet, a two-part torso and a big round head),
// dressed from a catalog of faces, hair, hats, tops, pants, glasses and
// things worn on the back. The world stays voxel; only the players change.
//
// The avatar is unlocked with soul crystals or for free by any achievement;
// most items cost crystals, and the best ones come only from achievements
// (the mayor's crown, the robber's mask, the knight's helmet...). Nothing is
// sold for real money.
//
// A player's look travels as one short string: a classic skin id
// ('wanderer') or 'av:' followed by one base-36 character per slot.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { humanoid, animateWalk, skinColors, box } from './models.js';
import { ITEMS } from '../player/items.js';

export const TONES = ['#ffe0c4', '#f5c9a0', '#e0ac86', '#c68a5e', '#9a6440', '#6e4528', '#f5cd30', '#9fe0ff'];
export const COLORS = ['#e8443a', '#ff8a2a', '#f5cd30', '#5cc94a', '#1f9e6e', '#38b6e8', '#2f5fd6', '#2b2f5a', '#7a4fd6', '#e85aa8',
  '#ffffff', '#c9ccd2', '#6b6f78', '#22232a', '#8a5a2a', '#4d3421', '#e8c873', '#f0e6d2'];

// every slot: its items; price in crystals (0 = free), ach = only from that achievement
const I = (id, price = 0, ach = null) => ({ id, price, ach });
export const SLOTS = {
  face: [I('smile'), I('grin'), I('wink'), I('surprised'), I('smirk', 20), I('cool', 30), I('kawaii', 40), I('determined', 40)],
  hair: [I('none'), I('short'), I('spiky'), I('long'), I('ponytail', 20), I('bun', 20), I('afro', 40), I('mohawk', 40)],
  hat: [I('none'), I('cap'), I('beanie', 20), I('party', 30), I('headphones', 50), I('tophat', 60), I('sunhat', 0, 'malaga'), I('explorer', 0, 'treasure'),
    I('crown', 0, 'mayor'), I('knight', 0, 'bosses'), I('frost', 0, 'treasure2'), I('captain', 0, 'fabrica3')],
  top: [I('tee'), I('long'), I('tank'), I('striped', 20), I('star', 30), I('hoodie', 40), I('suit', 0, 'mayor'), I('robber', 0, 'heist'), I('knight', 0, 'bosses'), I('explorer', 0, 'treasure'), I('redsuit', 0, 'fabrica'), I('diver', 0, 'fabrica2')],
  pants: [I('jeans'), I('shorts'), I('skirt', 20), I('cargo', 20)],
  glasses: [I('none'), I('round', 20), I('goggles', 30), I('sun', 40), I('monocle', 60), I('mask', 0, 'heist'), I('grinmask', 0, 'fabrica'), I('goldmask', 0, 'fabrica2'), I('nightvision', 0, 'fabrica3')],
  back: [I('none'), I('backpack', 30), I('guitar', 60), I('cape', 80), I('jetpack', 150), I('dragon', 300), I('wings', 0, 'days'), I('icewings', 0, 'treasure2')],
};
// the order the slots travel in, colors between them
const CODE = ['tone', 'face', 'hair', 'hairC', 'hat', 'top', 'topC', 'pants', 'pantsC', 'glasses', 'back'];
export const AVATAR_PRICE = 150;
export const DEFAULT_AVATAR = { tone: 6, face: 'smile', hair: 'short', hairC: 15, hat: 'none', top: 'tee', topC: 6, pants: 'jeans', pantsC: 7, glasses: 'none', back: 'none' };

// ---------- achievements ----------
// what the player has done, read from the profile (it follows them between worlds)
export const ACHIEVEMENTS = [
  { id: 'malaga', test: (p) => Object.keys((p.missions && p.missions.done) || {}).filter((k) => !/^(h|f|f2|f3)_/.test(k)).length >= 5 },
  { id: 'treasure', test: (p) => !!(p.rewards && p.rewards.starfall) },
  { id: 'treasure2', test: (p) => !!(p.rewards && p.rewards.frostbrand) },
  { id: 'days', test: (p) => (p.bestDay || 0) >= 30 },
  { id: 'bosses', test: (p) => (p.bossesBeaten || []).length >= 5 },
  { id: 'heist', test: (p) => !!(p.heist && (p.heist.robbed || p.heist.traded)) },
  { id: 'mayor', test: (p) => !!p.mayorAt },
  { id: 'fabrica', test: (p) => !!(p.fabrica && p.fabrica.done) },
  { id: 'fabrica2', test: (p) => !!(p.oro && p.oro.done) },
  { id: 'fabrica3', test: (p) => !!(p.puerto && p.puerto.done) },
];
// (the superadmin's test account wears every achievement's items)
export const hasAch = (p, id) => { if (p.testAll) return true; const a = ACHIEVEMENTS.find((x) => x.id === id); return !!(a && a.test(p)); };
export const anyAch = (p) => ACHIEVEMENTS.some((a) => a.test(p));
export const avatarUnlocked = (p) => !!(p.avatar && p.avatar.unlocked) || anyAch(p);
export const itemOf = (slot, id) => (SLOTS[slot] || []).find((x) => x.id === id) || null;
export function owns(p, slot, id) {
  const it = itemOf(slot, id);
  if (!it) return false;
  if (it.ach) return hasAch(p, it.ach);
  return !it.price || (p.avOwned || []).includes(slot + ':' + id);
}
export function avatarOf(p) { return { ...DEFAULT_AVATAR, ...((p.avatar && p.avatar.cfg) || {}) }; }

// the string a player's look travels as
export function playerSkin(p) {
  if (p && p.avatar && p.avatar.on && avatarUnlocked(p)) return encodeAvatar(avatarOf(p));
  return (p && p.skin) || 'wanderer';
}
export function encodeAvatar(c) {
  return 'av:' + CODE.map((k) => {
    if (k === 'tone') return (c.tone | 0).toString(36);
    if (k.endsWith('C')) return (c[k] | 0).toString(36);
    return Math.max(0, SLOTS[k].findIndex((x) => x.id === c[k])).toString(36);
  }).join('');
}
export function decodeAvatar(s) {
  const c = { ...DEFAULT_AVATAR };
  if (typeof s !== 'string' || !s.startsWith('av:')) return c;
  CODE.forEach((k, i) => {
    const n = parseInt(s[3 + i] || '', 36);
    if (!Number.isFinite(n)) return;
    if (k === 'tone') { if (n < TONES.length) c.tone = n; } else if (k.endsWith('C')) { if (n < COLORS.length) c[k] = n; } else if (SLOTS[k][n]) c[k] = SLOTS[k][n].id;
  });
  return c;
}
export const isAvatar = (skin) => typeof skin === 'string' && skin.startsWith('av:');

// the first-person arm: the skin and the sleeve
export function armColors(skin) {
  if (!isAvatar(skin)) { const c = skinColors(skin); return { skin: c.skin, shirt: c.shirt }; }
  const c = decodeAvatar(skin), tone = TONES[c.tone];
  const sleeve = c.top === 'tank' || c.top === 'tee' ? tone : topColor(c);
  return { skin: tone, shirt: sleeve };
}
const topColor = (c) => ({ suit: '#22232a', robber: '#22232a', knight: '#c9ccd2', explorer: '#b9a06a', redsuit: '#c81e1e', diver: '#16181d' })[c.top] || COLORS[c.topC];

// ---------- the model ----------
const geoCache = new Map();
function rgeo(w, h, d, r = 0.06) {
  const k = [w, h, d, r].join();
  if (!geoCache.has(k)) { const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); geo.userData.shared = true; geoCache.set(k, geo); }
  return geoCache.get(k);
}
const matCache = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(k);
}
const part = (w, h, d, color, r) => new THREE.Mesh(rgeo(w, h, d, r), typeof color === 'string' ? mat(color) : color);
const mesh = (geo, color, opts) => new THREE.Mesh(geo, typeof color === 'string' ? mat(color, opts) : color);

// smooth decals (faces, prints) drawn on a canvas
const texCache = new Map();
function decal(key, w, h, draw) {
  if (!texCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return texCache.get(key);
}
function plane(w, h, tex) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false }));
}

export function drawFace(x, kind, s = 128) {
  const k = s / 128;
  x.save(); x.scale(k, k);
  x.fillStyle = '#1b1b22'; x.strokeStyle = '#1b1b22'; x.lineCap = 'round'; x.lineWidth = 6;
  const eye = (cx, cy, rx = 7, ry = 11) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill(); };
  const shine = (cx, cy) => { x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, 3, 0, Math.PI * 2); x.fill(); x.fillStyle = '#1b1b22'; };
  const smile = (y = 78, w = 26, d = 14) => { x.beginPath(); x.moveTo(64 - w, y); x.quadraticCurveTo(64, y + d * 2, 64 + w, y); x.stroke(); };
  if (kind === 'grin') {
    eye(44, 54); eye(84, 54);
    x.beginPath(); x.moveTo(36, 76); x.quadraticCurveTo(64, 110, 92, 76); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.fillRect(46, 77, 36, 7);
  } else if (kind === 'wink') {
    eye(44, 54); x.beginPath(); x.moveTo(74, 56); x.quadraticCurveTo(84, 46, 94, 56); x.stroke(); smile();
  } else if (kind === 'surprised') {
    eye(44, 52, 8, 12); eye(84, 52, 8, 12); x.beginPath(); x.ellipse(64, 88, 9, 12, 0, 0, Math.PI * 2); x.fill();
  } else if (kind === 'smirk') {
    eye(44, 54); eye(84, 54); x.beginPath(); x.moveTo(44, 84); x.quadraticCurveTo(70, 92, 88, 74); x.stroke();
  } else if (kind === 'cool') {
    x.beginPath(); x.moveTo(24, 46); x.lineTo(104, 46); x.lineTo(98, 64); x.quadraticCurveTo(84, 70, 70, 60); x.lineTo(58, 60); x.quadraticCurveTo(44, 70, 30, 64); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(36, 50, 10, 4); x.fillRect(80, 50, 10, 4); x.fillStyle = '#1b1b22';
    smile(80, 20, 9);
  } else if (kind === 'kawaii') {
    eye(44, 56, 10, 13); eye(84, 56, 10, 13); shine(40, 50); shine(80, 50);
    x.fillStyle = 'rgba(255,110,140,0.55)'; x.beginPath(); x.ellipse(30, 76, 10, 6, 0, 0, Math.PI * 2); x.ellipse(98, 76, 10, 6, 0, 0, Math.PI * 2); x.fill();
    x.lineWidth = 5; x.beginPath(); x.moveTo(56, 80); x.quadraticCurveTo(60, 86, 64, 80); x.quadraticCurveTo(68, 86, 72, 80); x.stroke();
  } else if (kind === 'determined') {
    eye(44, 58, 7, 9); eye(84, 58, 7, 9);
    x.beginPath(); x.moveTo(30, 40); x.lineTo(56, 48); x.moveTo(98, 40); x.lineTo(72, 48); x.stroke();
    x.beginPath(); x.moveTo(48, 88); x.lineTo(80, 88); x.stroke();
  } else { eye(44, 54); eye(84, 54); smile(); }
  x.restore();
}

// prints on the front of a top
function drawTop(x, kind, color, w, h) {
  if (kind === 'striped') { x.fillStyle = 'rgba(255,255,255,0.85)'; for (let y = 6; y < h; y += 22) x.fillRect(0, y, w, 9); }
  else if (kind === 'robber') { x.fillStyle = '#f2f2f2'; for (let y = 4; y < h; y += 20) x.fillRect(0, y, w, 9); }
  else if (kind === 'star') {
    x.fillStyle = '#ffffff'; x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 14 : 32; x.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
    x.closePath(); x.fill();
  } else if (kind === 'hoodie') {
    x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 4; x.strokeRect(w * 0.25, h * 0.58, w * 0.5, h * 0.3);
    x.strokeStyle = '#ffffff'; x.lineWidth = 3; x.beginPath(); x.moveTo(w * 0.42, 0); x.lineTo(w * 0.4, h * 0.3); x.moveTo(w * 0.58, 0); x.lineTo(w * 0.6, h * 0.3); x.stroke();
  } else if (kind === 'suit') {
    x.fillStyle = '#f4f4f4'; x.beginPath(); x.moveTo(w * 0.32, 0); x.lineTo(w * 0.5, h * 0.62); x.lineTo(w * 0.68, 0); x.fill();
    x.fillStyle = '#b31d2c'; x.beginPath(); x.moveTo(w * 0.46, 4); x.lineTo(w * 0.54, 4); x.lineTo(w * 0.56, h * 0.5); x.lineTo(w * 0.5, h * 0.58); x.lineTo(w * 0.44, h * 0.5); x.fill();
    // the mayor's sash
    x.strokeStyle = '#f6c667'; x.lineWidth = 12; x.beginPath(); x.moveTo(-4, 0); x.lineTo(w + 4, h); x.stroke();
  } else if (kind === 'knight') {
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(w * 0.1, h * 0.08, w * 0.8, h * 0.84);
    x.fillStyle = '#c0283a'; x.fillRect(w * 0.44, h * 0.18, w * 0.12, h * 0.6); x.fillRect(w * 0.26, h * 0.34, w * 0.48, h * 0.11);
  } else if (kind === 'explorer') {
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(w * 0.14, h * 0.2, w * 0.26, h * 0.22); x.fillRect(w * 0.6, h * 0.2, w * 0.26, h * 0.22);
    x.fillStyle = '#6b4a2f'; x.fillRect(0, h * 0.82, w, h * 0.1);
  } else if (kind === 'redsuit') {
    // the crew's jumpsuit: a zip down the front, a pocket, a name tag
    x.fillStyle = '#8a1010'; x.fillRect(w * 0.48, 0, w * 0.04, h);
    x.fillStyle = '#e8e8e8'; for (let y = 4; y < h; y += 8) x.fillRect(w * 0.47, y, w * 0.06, 2);
    x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(w * 0.15, h * 0.2, w * 0.22, h * 0.18);
    x.fillStyle = '#f4efe6'; x.fillRect(w * 0.62, h * 0.2, w * 0.24, h * 0.1);
  } else if (kind === 'diver') {
    // the wetsuit: yellow stripes down the sides, a zip, a gauge on the chest
    x.fillStyle = '#e8b830'; x.fillRect(0, 0, w * 0.08, h); x.fillRect(w * 0.92, 0, w * 0.08, h);
    x.fillStyle = '#3a3d45'; x.fillRect(w * 0.49, 0, w * 0.02, h * 0.7);
    x.fillStyle = '#c9ccd2'; x.beginPath(); x.arc(w * 0.72, h * 0.32, h * 0.12, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#16181d'; x.fillRect(w * 0.71, h * 0.24, 2, h * 0.09);
  } else if (kind === 'tank') {
    x.fillStyle = color; x.fillRect(w * 0.2, 0, w * 0.6, h); x.clearRect(w * 0.36, 0, w * 0.28, h * 0.18);
  }
  void color;
}

// The figure. Feet at y=0, facing +z, about 1.9 tall; the same rig fields as
// the classic humanoid (head, body, armL/R, legL/R) plus elbows and knees.
export function buildAvatar(cfg) {
  const c = { ...DEFAULT_AVATAR, ...cfg };
  const tone = TONES[c.tone] || TONES[6], hairC = COLORS[c.hairC] || COLORS[15], topC = topColor(c), pantsC = c.top === 'redsuit' ? '#b01818' : c.top === 'diver' ? '#16181d' : COLORS[c.pantsC] || COLORS[7]; // the jumpsuit is one piece
  const shoe = '#2b2b33';
  const g = new THREE.Group();
  const root = new THREE.Group(); g.add(root);
  const hips = new THREE.Group(); hips.position.y = 0.78; root.add(hips);
  const skirt = c.pants === 'skirt';
  const lower = part(0.62, 0.2, 0.32, skirt ? tone : pantsC, 0.06); lower.position.y = 0.08; hips.add(lower);
  if (skirt) { const s = mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.34, 16), pantsC); s.position.y = -0.02; s.scale.z = 0.7; hips.add(s); }
  const waist = new THREE.Group(); waist.position.y = 0.18; hips.add(waist);
  const upperColor = c.top === 'tank' ? tone : topC;
  const torso = part(0.7, 0.44, 0.34, upperColor, 0.08); torso.position.y = 0.22; waist.add(torso);
  // the print on the front
  if (['striped', 'robber', 'star', 'hoodie', 'suit', 'knight', 'explorer', 'tank', 'redsuit', 'diver'].includes(c.top)) {
    const p = plane(0.66, 0.42, decal('top:' + c.top + (c.top === 'tank' ? topC : ''), 128, 84, (x, w, h) => drawTop(x, c.top, COLORS[c.topC], w, h)));
    p.position.set(0, 0.22, 0.173); waist.add(p);
  }
  if (c.top === 'hoodie') { const hood = part(0.5, 0.18, 0.18, topC, 0.07); hood.position.set(0, 0.42, -0.16); waist.add(hood); }
  // head
  const neck = new THREE.Group(); neck.position.y = 0.44; waist.add(neck);
  const head = new THREE.Group(); head.position.y = 0.26; neck.add(head);
  head.add(part(0.52, 0.48, 0.5, tone, 0.16));
  const face = plane(0.42, 0.42, decal('face:' + c.face, 128, 128, (x) => drawFace(x, c.face)));
  face.position.set(0, -0.02, 0.252); head.add(face);
  if (c.hat !== 'knight') addHair(head, c.hair, hairC, c.hat !== 'none');
  addHat(head, c.hat, topC);
  addGlasses(head, c.glasses);
  // arms: shoulder, elbow, hand
  const sleeveUp = c.top === 'tank' ? tone : topC;
  const sleeveLow = c.top === 'tee' || c.top === 'tank' ? tone : topC;
  const hand = c.top === 'knight' ? '#9aa0a8' : tone;
  const mkArm = (side) => {
    const sh = new THREE.Group(); sh.position.set(side * 0.47, 0.38, 0); waist.add(sh);
    const up = part(0.22, 0.32, 0.22, sleeveUp, 0.07); up.position.y = -0.14; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const lo = part(0.2, 0.26, 0.2, sleeveLow, 0.07); lo.position.y = -0.12; el.add(lo);
    const hd = part(0.2, 0.13, 0.2, hand, 0.07); hd.position.y = -0.3; el.add(hd);
    return [sh, el];
  };
  const [armL, elbowL] = mkArm(-1), [armR, elbowR] = mkArm(1);
  // legs: hip, knee, foot
  const legUp = skirt ? tone : pantsC, legLow = c.pants === 'shorts' || skirt ? tone : pantsC;
  const mkLeg = (side) => {
    const hp = new THREE.Group(); hp.position.set(side * 0.16, 0.0, 0); hips.add(hp);
    const up = part(0.27, 0.4, 0.29, legUp, 0.07); up.position.y = -0.18; hp.add(up);
    if (c.pants === 'cargo') { const pk = part(0.06, 0.14, 0.16, pantsC === '#22232a' ? '#3a3b42' : pantsC, 0.02); pk.position.set(side * 0.15, -0.2, 0); hp.add(pk); }
    const kn = new THREE.Group(); kn.position.y = -0.38; hp.add(kn);
    const lo = part(0.25, 0.32, 0.27, legLow, 0.07); lo.position.y = -0.14; kn.add(lo);
    const ft = part(0.27, 0.1, 0.34, shoe, 0.045); ft.position.set(0, -0.35, 0.03); kn.add(ft);
    return [hp, kn];
  };
  const [legL, kneeL] = mkLeg(-1), [legR, kneeR] = mkLeg(1);
  const back = addBack(waist, c.back, topC);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, root, hips, waist, head, neck, body: torso, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, back, avatar: true, handR: elbowR, holdY: -0.32 };
}

function addHair(head, kind, color, hat) {
  if (kind === 'none') return;
  const add = (o, x, y, z) => { o.position.set(x, y, z); head.add(o); return o; };
  const cap = () => { add(part(0.56, 0.18, 0.54, color, 0.08), 0, 0.18, -0.01); add(part(0.56, 0.3, 0.14, color, 0.06), 0, 0.04, -0.21); };
  if (kind === 'afro') { const a = add(mesh(new THREE.SphereGeometry(0.4, 16, 12), color), 0, 0.14, -0.04); a.scale.set(1, hat ? 0.8 : 0.95, 1); return; }
  cap();
  if (kind === 'spiky' && !hat) for (let i = 0; i < 5; i++) { const s = add(mesh(new THREE.ConeGeometry(0.07, 0.18, 6), color), -0.18 + i * 0.09, 0.32, -0.04 + (i % 2) * 0.08); s.rotation.z = (i - 2) * -0.2; }
  if (kind === 'long') { add(part(0.58, 0.6, 0.14, color, 0.06), 0, -0.14, -0.22); add(part(0.08, 0.5, 0.36, color, 0.04), -0.28, -0.08, -0.06); add(part(0.08, 0.5, 0.36, color, 0.04), 0.28, -0.08, -0.06); }
  if (kind === 'ponytail') { const p = add(mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.42, 8), color), 0, -0.02, -0.32); p.rotation.x = 0.5; }
  if (kind === 'bun' && !hat) add(mesh(new THREE.SphereGeometry(0.13, 12, 10), color), 0, 0.33, -0.08);
  if (kind === 'mohawk' && !hat) add(part(0.1, 0.18, 0.5, color, 0.04), 0, 0.33, -0.02);
}

function addHat(head, kind, accent) {
  if (kind === 'none') return;
  const add = (o, x, y, z) => { o.position.set(x, y, z); head.add(o); return o; };
  const cyl = (r1, r2, h, col, seg = 20, o) => mesh(new THREE.CylinderGeometry(r1, r2, h, seg), col, o);
  if (kind === 'cap') { add(cyl(0.28, 0.29, 0.14, accent), 0, 0.27, 0); add(part(0.34, 0.03, 0.26, accent, 0.012), 0, 0.22, 0.3); add(part(0.06, 0.04, 0.06, '#ffffff', 0.02), 0, 0.35, 0); }
  else if (kind === 'beanie') { const b = add(mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent), 0, 0.15, 0); b.scale.y = 0.85; add(cyl(0.3, 0.3, 0.08, '#ffffff'), 0, 0.16, 0); add(mesh(new THREE.SphereGeometry(0.07, 10, 8), '#ffffff'), 0, 0.42, 0); }
  else if (kind === 'party') { add(cyl(0.001, 0.15, 0.34, accent, 14), 0, 0.41, 0); add(mesh(new THREE.SphereGeometry(0.05, 8, 6), '#f5cd30'), 0, 0.59, 0); }
  else if (kind === 'headphones') { const t = add(mesh(new THREE.TorusGeometry(0.29, 0.03, 6, 20, Math.PI), '#22232a'), 0, 0.02, 0); t.rotation.z = 0; for (const s of [-1, 1]) { const e = add(cyl(0.09, 0.09, 0.07, accent), s * 0.29, 0.0, 0); e.rotation.z = Math.PI / 2; } }
  else if (kind === 'tophat') { add(cyl(0.34, 0.34, 0.03, '#1b1b22', 24), 0, 0.25, 0); add(cyl(0.21, 0.21, 0.38, '#1b1b22'), 0, 0.44, 0); add(cyl(0.215, 0.215, 0.07, '#b31d2c'), 0, 0.3, 0); }
  else if (kind === 'sunhat') { add(cyl(0.5, 0.5, 0.025, '#e8c873', 28), 0, 0.23, 0); add(cyl(0.24, 0.26, 0.16, '#e8c873'), 0, 0.32, 0); add(cyl(0.265, 0.265, 0.05, '#e8443a'), 0, 0.27, 0); }
  else if (kind === 'captain') {
    // a white captain's cap: a flat top, a black peak, a gold anchor badge
    add(cyl(0.3, 0.27, 0.12, '#f4f4f4'), 0, 0.29, 0); add(cyl(0.33, 0.33, 0.04, '#f4f4f4'), 0, 0.36, 0);
    add(cyl(0.275, 0.275, 0.05, '#1b1b22'), 0, 0.24, 0); add(part(0.36, 0.03, 0.18, '#1b1b22', 0.012), 0, 0.22, 0.3);
    add(part(0.08, 0.08, 0.02, '#f6c667', 0.01), 0, 0.3, 0.29);
  }
  else if (kind === 'explorer') { const br = add(cyl(0.44, 0.44, 0.025, '#8a5a2a', 24), 0, 0.23, 0); br.rotation.x = 0.06; add(cyl(0.22, 0.25, 0.2, '#8a5a2a'), 0, 0.33, 0); add(cyl(0.255, 0.255, 0.05, '#3a2614'), 0, 0.27, 0); }
  else if (kind === 'crown') {
    const gold = mat('#f6c667', { emissive: '#5a4210', side: THREE.DoubleSide });
    add(mesh(new THREE.CylinderGeometry(0.25, 0.24, 0.1, 20, 1, true), gold), 0, 0.28, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(mesh(new THREE.ConeGeometry(0.05, 0.13, 6), gold), Math.sin(a) * 0.24, 0.39, Math.cos(a) * 0.24); add(mesh(new THREE.SphereGeometry(0.03, 6, 5), i % 2 ? '#e8443a' : '#38b6e8'), Math.sin(a) * 0.25, 0.28, Math.cos(a) * 0.25); }
  } else if (kind === 'knight') {
    add(part(0.6, 0.56, 0.58, '#c9ccd2', 0.18), 0, 0.02, 0);
    add(part(0.44, 0.05, 0.04, '#1b1b22', 0.02), 0, 0.04, 0.29);
    add(part(0.04, 0.2, 0.04, '#1b1b22', 0.02), 0, -0.08, 0.29);
    const pl = add(part(0.07, 0.2, 0.34, '#c0283a', 0.03), 0, 0.38, -0.04); pl.rotation.x = -0.25;
  } else if (kind === 'frost') {
    const ice = mat('#bff4ff', { emissive: '#2a6a80', transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 20, 1, true), ice), 0, 0.27, 0);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; add(mesh(new THREE.ConeGeometry(0.04, i % 2 ? 0.16 : 0.26, 5), ice), Math.sin(a) * 0.24, 0.36 + (i % 2 ? 0 : 0.05), Math.cos(a) * 0.24); }
  }
}

function addGlasses(head, kind) {
  if (kind === 'none') return;
  const add = (o, x, y, z) => { o.position.set(x, y, z); head.add(o); return o; };
  const z = 0.265;
  if (kind === 'round') { for (const s of [-1, 1]) add(mesh(new THREE.TorusGeometry(0.065, 0.012, 6, 16), '#22232a'), s * 0.1, 0.02, z); add(part(0.07, 0.015, 0.015, '#22232a', 0.006), 0, 0.03, z); }
  else if (kind === 'sun') { for (const s of [-1, 1]) add(part(0.17, 0.09, 0.025, '#111114', 0.02), s * 0.11, 0.02, z); add(part(0.36, 0.02, 0.02, '#111114', 0.008), 0, 0.055, z); }
  else if (kind === 'goggles') { add(mesh(new THREE.CylinderGeometry(0.272, 0.272, 0.07, 20, 1, true), '#3a2614', { side: THREE.DoubleSide }), 0, 0.03, 0); for (const s of [-1, 1]) { const l = add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14), '#f0a030', { emissive: '#3a2000' }), s * 0.1, 0.03, z); l.rotation.x = Math.PI / 2; } }
  else if (kind === 'nightvision') {
    // night-vision goggles: a strap, two tubes with green lenses
    add(mesh(new THREE.CylinderGeometry(0.272, 0.272, 0.07, 20, 1, true), '#1b1b22', { side: THREE.DoubleSide }), 0, 0.05, 0);
    for (const s of [-1, 1]) { const tb = add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 12), '#2b2d33'), s * 0.1, 0.04, z + 0.06); tb.rotation.x = Math.PI / 2; const l = add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), '#7dff8a', { emissive: '#1a6a2a' }), s * 0.1, 0.04, z + 0.15); l.rotation.x = Math.PI / 2; }
  }
  else if (kind === 'monocle') { add(mesh(new THREE.TorusGeometry(0.07, 0.013, 6, 16), '#f6c667'), 0.1, 0.02, z); const ch = add(part(0.01, 0.2, 0.01, '#f6c667', 0.004), 0.16, -0.08, z - 0.01); ch.rotation.z = 0.3; }
  else if (kind === 'grinmask' || kind === 'goldmask') {
    // a mask over the whole face (white, or gold for season 2): arched brows, a wide painted grin, a thin moustache
    const tex = decal(kind, 128, 128, (x) => {
      x.fillStyle = kind === 'goldmask' ? '#e8b830' : '#f4efe6'; x.beginPath(); x.ellipse(64, 66, 58, 60, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#1b1b22'; x.beginPath(); x.ellipse(42, 54, 9, 6, 0, 0, Math.PI * 2); x.ellipse(86, 54, 9, 6, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#1b1b22'; x.lineWidth = 4; x.beginPath(); x.moveTo(28, 40); x.quadraticCurveTo(42, 30, 56, 40); x.moveTo(72, 40); x.quadraticCurveTo(86, 30, 100, 40); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.moveTo(40, 82); x.quadraticCurveTo(52, 76, 64, 80); x.quadraticCurveTo(76, 76, 88, 82); x.stroke();
      x.fillStyle = '#c81e1e'; x.beginPath(); x.moveTo(36, 90); x.quadraticCurveTo(64, 116, 92, 90); x.quadraticCurveTo(64, 102, 36, 90); x.fill();
      x.fillStyle = 'rgba(232, 120, 120, 0.4)'; x.beginPath(); x.ellipse(30, 78, 9, 6, 0, 0, Math.PI * 2); x.ellipse(98, 78, 9, 6, 0, 0, Math.PI * 2); x.fill();
    });
    const m = plane(0.5, 0.5, tex); m.position.set(0, -0.01, z + 0.002); head.add(m);
  }
  else if (kind === 'mask') {
    // a band around the head; the front of a cylinder is where u is 0 (and 1)
    const tex = decal('mask', 512, 32, (x, w, h) => { x.fillStyle = '#121216'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.ellipse(29, 18, 13, 8, 0, 0, Math.PI * 2); x.ellipse(w - 29, 18, 13, 8, 0, 0, Math.PI * 2); x.fill(); });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.12, 32, 1, true), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5 })), 0, 0.03, 0);
  }
}

function wingGeo(big) {
  const s = new THREE.Shape(), k = big ? 1.25 : 1;
  s.moveTo(0, 0);
  s.bezierCurveTo(0.25 * k, 0.35 * k, 0.6 * k, 0.45 * k, 0.8 * k, 0.4 * k);
  s.bezierCurveTo(0.7 * k, 0.2 * k, 0.75 * k, 0.05 * k, 0.6 * k, -0.15 * k);
  s.bezierCurveTo(0.45 * k, -0.1 * k, 0.4 * k, -0.35 * k, 0.25 * k, -0.4 * k);
  s.bezierCurveTo(0.2 * k, -0.2 * k, 0.1 * k, -0.15 * k, 0, 0);
  return new THREE.ShapeGeometry(s, 10);
}

function addBack(waist, kind, accent) {
  if (kind === 'none') return null;
  const b = new THREE.Group(); b.position.set(0, 0.3, -0.17); waist.add(b);
  const add = (o, x, y, z) => { o.position.set(x, y, z); b.add(o); return o; };
  b.userData.kind = kind;
  if (kind === 'backpack') { add(part(0.46, 0.5, 0.2, '#d65a3a', 0.08), 0, -0.1, -0.1); add(part(0.36, 0.18, 0.06, '#b0442a', 0.04), 0, -0.24, -0.22); }
  else if (kind === 'guitar') {
    const gt = new THREE.Group(); gt.rotation.z = 0.7; b.add(gt); gt.position.set(0, -0.08, -0.06);
    const body = mat('#c8411c'); const g1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 18), body); g1.rotation.x = Math.PI / 2; g1.position.y = -0.2; gt.add(g1);
    const g2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 18), body); g2.rotation.x = Math.PI / 2; g2.position.y = 0.0; gt.add(g2);
    const nk = part(0.06, 0.5, 0.04, '#4d3421', 0.015); nk.position.y = 0.32; gt.add(nk);
  } else if (kind === 'cape') {
    const pv = new THREE.Group(); pv.position.set(0, 0.12, -0.02); b.add(pv);
    const cp = part(0.66, 0.95, 0.035, '#b31d2c', 0.015); cp.position.y = -0.47; pv.add(cp);
    const tr = part(0.68, 0.05, 0.04, '#f6c667', 0.015); tr.position.y = -0.93; pv.add(tr);
    b.userData.cape = pv;
  } else if (kind === 'jetpack') {
    for (const s of [-1, 1]) {
      add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.46, 14), '#c9ccd2'), s * 0.12, -0.12, -0.12);
      add(mesh(new THREE.ConeGeometry(0.1, 0.12, 14), '#e8443a'), s * 0.12, 0.17, -0.12);
      const f = add(mesh(new THREE.ConeGeometry(0.07, 0.3, 10), '#ffb02a', { emissive: '#ff6a00', transparent: true, opacity: 0.85 }), s * 0.12, -0.52, -0.12);
      f.rotation.x = Math.PI; f.visible = false; (b.userData.flames ||= []).push(f);
    }
  } else if (['wings', 'dragon', 'icewings'].includes(kind)) {
    const col = kind === 'wings' ? mat('#ffffff', { side: THREE.DoubleSide, emissive: '#303030' })
      : kind === 'dragon' ? mat('#5a2a8a', { side: THREE.DoubleSide })
        : mat('#bff4ff', { side: THREE.DoubleSide, emissive: '#2a6a80', transparent: true, opacity: 0.8 });
    const geo = wingGeo(kind === 'dragon');
    b.userData.wings = [];
    for (const s of [-1, 1]) {
      const pv = new THREE.Group(); pv.position.set(s * 0.08, 0.0, -0.04); b.add(pv);
      const w = new THREE.Mesh(geo, col); w.scale.x = s; pv.add(w);
      pv.rotation.y = s * 0.45;
      b.userData.wings.push(pv);
    }
  }
  return b;
}

// ---------- animation ----------
// st: { phase, amount (0..1 walking), air (-1..1 vertical speed sign), t (seconds),
//       emote: 'wave'|'dance'|'cheer'|null, emoteT (seconds into it) }
export function animateAvatar(rig, st) {
  const a = st.amount || 0, t = st.t || 0, s = Math.sin(st.phase || 0);
  const r = rig;
  // reset
  for (const k of ['armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR', 'waist']) r[k].rotation.set(0, 0, 0);
  r.root.position.y = 0; r.root.rotation.set(0, 0, 0);
  // idle: breathing and a slight sway of the arms
  const br = Math.sin(t * 2.2) * 0.025;
  r.armL.rotation.z = -0.07 - br; r.armR.rotation.z = 0.07 + br;
  r.elbowL.rotation.x = r.elbowR.rotation.x = -0.12;
  r.waist.position.y = 0.18 + br * 0.15;
  if (a > 0.02) {
    r.legL.rotation.x = s * 0.85 * a; r.legR.rotation.x = -s * 0.85 * a;
    r.kneeL.rotation.x = Math.max(0, -Math.sin((st.phase || 0) - 1.1)) * 1.1 * a;
    r.kneeR.rotation.x = Math.max(0, Math.sin((st.phase || 0) - 1.1)) * 1.1 * a;
    r.armL.rotation.x = -s * 0.75 * a; r.armR.rotation.x = s * 0.75 * a;
    r.elbowL.rotation.x = -0.25 - Math.max(0, s) * 0.5 * a; r.elbowR.rotation.x = -0.25 - Math.max(0, -s) * 0.5 * a;
    r.root.position.y = Math.abs(Math.cos(st.phase || 0)) * 0.04 * a;
  }
  if (st.air) {
    // the Roblox jump: arms up, one knee drawn in
    const up = st.air > 0 ? 2.5 : 2.85;
    r.armL.rotation.set(-up, 0, -0.25); r.armR.rotation.set(-up, 0, 0.25);
    r.elbowL.rotation.x = r.elbowR.rotation.x = -0.1;
    r.legL.rotation.x = -0.35; r.kneeL.rotation.x = 0.7; r.legR.rotation.x = 0.1; r.kneeR.rotation.x = 0.2;
  }
  const e = st.emote, et = st.emoteT || 0;
  if (e === 'wave') {
    r.armR.rotation.set(0, 0, 2.7); r.elbowR.rotation.set(0, 0, Math.sin(et * 9) * 0.55);
  } else if (e === 'dance') {
    const b = et * 6.5;
    r.root.position.y = Math.abs(Math.sin(b)) * 0.12;
    r.waist.rotation.y = Math.sin(b * 0.5) * 0.35;
    r.armL.rotation.set(-1.4 - Math.sin(b) * 1.1, 0, -0.4); r.armR.rotation.set(-1.4 + Math.sin(b) * 1.1, 0, 0.4);
    r.elbowL.rotation.x = r.elbowR.rotation.x = -0.9;
    r.legL.rotation.x = Math.max(0, Math.sin(b)) * -0.5; r.kneeL.rotation.x = Math.max(0, Math.sin(b)) * 0.9;
    r.legR.rotation.x = Math.max(0, -Math.sin(b)) * -0.5; r.kneeR.rotation.x = Math.max(0, -Math.sin(b)) * 0.9;
  } else if (e === 'cheer') {
    const b = et * 8;
    r.root.position.y = Math.max(0, Math.sin(b)) * 0.25;
    r.armL.rotation.set(-2.9, 0, -0.35 - Math.sin(b * 2) * 0.15); r.armR.rotation.set(-2.9, 0, 0.35 + Math.sin(b * 2) * 0.15);
    r.kneeL.rotation.x = r.kneeR.rotation.x = Math.max(0, -Math.sin(b)) * 0.5;
  }
  // things on the back move with the player
  const bk = r.back && r.back.userData;
  if (bk) {
    if (bk.cape) bk.cape.rotation.x = 0.08 + a * 0.55 + (st.air ? 0.4 : 0) + Math.sin(t * 3) * 0.04;
    if (bk.wings) { const f = st.air ? Math.sin(t * 14) * 0.5 : Math.sin(t * 1.6) * 0.12; bk.wings.forEach((w, i) => { w.rotation.y = (i ? 1 : -1) * (0.45 + f); }); }
    if (bk.flames) for (const f of bk.flames) { f.visible = !!st.air; f.scale.y = 0.8 + Math.random() * 0.4; }
  }
}

// ---------- a player figure: classic voxel or avatar ----------
// Used for other players and, in third-person view, for the player themselves.
export class Figure {
  constructor() { this.object = new THREE.Group(); this.skin = null; this.rig = null; this.heldItem = undefined; this.phase = 0; this.t = 0; this.emote = null; this.emoteT = 0; }

  build(skin) {
    if (this.rig) {
      this.object.remove(this.rig.group);
      // the shared rounded parts stay cached; the rest goes
      this.rig.group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    }
    this.rig = isAvatar(skin) ? buildAvatar(decodeAvatar(skin)) : humanoid(skinColors(skin));
    this.object.add(this.rig.group);
    this.skin = skin;
    this.heldItem = undefined; this.heldMesh = null;
  }

  setSkin(skin) { if (skin !== this.skin) this.build(skin); }

  setHeld(item) {
    if (item === this.heldItem || !this.rig) return;
    this.heldItem = item;
    const holder = this.rig.handR || this.rig.armR;
    if (this.heldMesh) { this.heldMesh.parent && this.heldMesh.parent.remove(this.heldMesh); this.heldMesh = null; }
    const def = item && ITEMS[item];
    if (!def) return;
    const tool = def.tool || def.weapon || def.damage;
    const m = tool ? box(0.08, 0.6, 0.08, def.weapon === 'bow' ? '#8a6238' : '#c9ccd2') : box(0.22, 0.22, 0.22, '#b08452');
    m.position.set(0, this.rig.holdY ?? -0.7, tool ? 0.2 : 0.12);
    if (tool) m.rotation.x = Math.PI / 2.4;
    holder.add(m);
    this.heldMesh = m;
  }

  setEmote(id) { if (id === this.emote) return; this.emote = id || null; this.emoteT = 0; }

  // speed: horizontal m/s; vy: vertical m/s; swing: seconds left of a swing (0.25 long)
  animate(dt, { speed = 0, vy = 0, pitch = 0, swing = 0 } = {}) {
    if (!this.rig) return;
    this.t += dt;
    const amount = Math.min(1, speed / 3);
    this.phase += dt * 9 * amount;
    if (this.emote) this.emoteT += dt;
    if (this.rig.avatar) {
      const air = Math.abs(vy) > 1.2 ? Math.sign(vy) : 0;
      animateAvatar(this.rig, { phase: this.phase, amount, air, t: this.t, emote: amount > 0.3 ? null : this.emote, emoteT: this.emoteT });
      this.rig.neck.rotation.x = -pitch * 0.5;
      if (swing > 0) { this.rig.armR.rotation.set(-1.7 * Math.sin((swing / 0.25) * Math.PI), 0, 0.1); this.rig.elbowR.rotation.x = -0.3; }
    } else {
      animateWalk(this.rig, this.phase, amount);
      this.rig.head.rotation.x = -pitch * 0.6;
      if (this.emote === 'wave' && amount < 0.3) this.rig.armR.rotation.set(0, 0, 2.7 + Math.sin(this.emoteT * 9) * 0.3);
      else if (this.emote === 'dance' && amount < 0.3) { const b = this.emoteT * 6.5; this.rig.armL.rotation.x = -1.4 - Math.sin(b); this.rig.armR.rotation.x = -1.4 + Math.sin(b); this.rig.group.position.y = Math.abs(Math.sin(b)) * 0.1; }
      else if (this.emote === 'cheer' && amount < 0.3) { this.rig.armL.rotation.set(-2.9, 0, 0); this.rig.armR.rotation.set(-2.9, 0, 0); this.rig.group.position.y = Math.max(0, Math.sin(this.emoteT * 8)) * 0.2; }
      else this.rig.group.position.y = 0;
      if (swing > 0) this.rig.armR.rotation.x = -1.6 * Math.sin((swing / 0.25) * Math.PI);
    }
  }
}
export const EMOTES = ['wave', 'dance', 'cheer'];
