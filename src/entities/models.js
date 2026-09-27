// Voxel-style models built from boxes, with small procedural face textures.
import * as THREE from 'three';

const matCache = new Map();
export function lambert(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(k);
}

const faceCache = new Map();
export function faceTexture(kind, base, eye) {
  const k = kind + base + eye;
  if (faceCache.has(k)) return faceCache.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 8, 8);
  if (kind === 'villager') {
    x.fillStyle = '#ffffff'; x.fillRect(1, 3, 2, 1); x.fillRect(5, 3, 2, 1);
    x.fillStyle = eye; x.fillRect(2, 3, 1, 1); x.fillRect(5, 3, 1, 1);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(3, 4, 2, 2);
    x.fillStyle = '#7a3b2a'; x.fillRect(3, 6, 2, 1);
  } else if (kind === 'hollow') {
    x.fillStyle = '#05040f'; x.fillRect(1, 2, 2, 2); x.fillRect(5, 2, 2, 2);
    x.fillStyle = eye; x.fillRect(1, 3, 1, 1); x.fillRect(6, 3, 1, 1);
    x.fillStyle = '#05040f'; x.fillRect(2, 5, 4, 1); x.fillRect(3, 6, 1, 1);
  } else if (kind === 'player') {
    x.fillStyle = '#ffffff'; x.fillRect(1, 3, 2, 2); x.fillRect(5, 3, 2, 2);
    x.fillStyle = eye; x.fillRect(2, 3, 1, 2); x.fillRect(5, 3, 1, 2);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(3, 6, 2, 1);
  } else if (kind === 'ghost') {
    x.fillStyle = eye; x.fillRect(1, 2, 2, 3); x.fillRect(5, 2, 2, 3);
    x.fillStyle = '#05040f'; x.fillRect(3, 6, 2, 1);
  } else if (kind === 'eyes') {
    x.fillStyle = eye; x.fillRect(1, 2, 2, 1); x.fillRect(5, 2, 2, 1); x.fillRect(0, 4, 1, 1); x.fillRect(7, 4, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  faceCache.set(k, tex);
  return tex;
}

export function box(w, h, d, color, faceTex = null, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  let mat = lambert(color, opts);
  if (faceTex) {
    const f = new THREE.MeshLambertMaterial({ map: faceTex, ...opts });
    // +x,-x,+y,-y,+z(front),-z
    mat = [mat, mat, mat, mat, f, mat];
  }
  return new THREE.Mesh(geo, mat);
}

// Humanoid rig: feet at y=0, faces +z.
export function humanoid(c, faceKind = 'player', scale = 1) {
  const g = new THREE.Group();
  const s = scale;
  const head = box(0.5 * s, 0.5 * s, 0.5 * s, c.skin, faceTexture(faceKind, c.skin, c.eye || '#1f2a6b'));
  head.position.y = 1.55 * s;
  const hair = box(0.54 * s, 0.14 * s, 0.54 * s, c.hair);
  hair.position.y = 0.24 * s;
  head.add(hair);
  const body = box(0.5 * s, 0.7 * s, 0.28 * s, c.shirt);
  body.position.y = 0.95 * s;
  const mkLimb = (w, h, color, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = box(w, h, w, color);
    m.position.y = -h / 2;
    pivot.add(m);
    return pivot;
  };
  const armL = mkLimb(0.2 * s, 0.68 * s, c.shirt2 || c.shirt, -0.36 * s, 1.28 * s);
  const armR = mkLimb(0.2 * s, 0.68 * s, c.shirt2 || c.shirt, 0.36 * s, 1.28 * s);
  const legL = mkLimb(0.22 * s, 0.62 * s, c.pants, -0.13 * s, 0.62 * s);
  const legR = mkLimb(0.22 * s, 0.62 * s, c.pants, 0.13 * s, 0.62 * s);
  // hands
  for (const a of [armL, armR]) { const h = box(0.19 * s, 0.14 * s, 0.19 * s, c.skin); h.position.y = -0.68 * s; a.add(h); }
  if (c.accent) {
    const belt = box(0.52 * s, 0.08 * s, 0.3 * s, c.accent);
    belt.position.y = 0.66 * s;
    g.add(belt);
  }
  g.add(head, body, armL, armR, legL, legR);
  return { group: g, head, body, armL, armR, legL, legR };
}

export function animateWalk(rig, phase, amount) {
  const a = Math.sin(phase) * 0.8 * amount;
  rig.legL.rotation.x = a; rig.legR.rotation.x = -a;
  rig.armL.rotation.x = -a * 0.8; rig.armR.rotation.x = a * 0.8;
}

export const SKINS = [
  { id: 'wanderer', price: 0, c: { skin: '#d9a57a', hair: '#4d3421', shirt: '#3b5bd6', pants: '#2b2f5a', eye: '#1f2a6b', accent: '#6b4a2f' } },
  { id: 'moss', price: 40, c: { skin: '#c99670', hair: '#3d7a2a', shirt: '#4c9a3a', pants: '#4d3421', eye: '#2c5a1f', accent: '#b08452' } },
  { id: 'ember', price: 80, c: { skin: '#e0ac86', hair: '#c8411c', shirt: '#ff7a2e', pants: '#5a2f2c', eye: '#8a1c1c', accent: '#ffd08a' } },
  { id: 'frost', price: 80, c: { skin: '#f0d0b8', hair: '#e6eef4', shirt: '#9fd4ff', pants: '#3a5a8a', eye: '#2a6ad6', accent: '#ffffff' } },
  { id: 'gold', price: 150, c: { skin: '#b97a55', hair: '#2b1d12', shirt: '#f6c667', shirt2: '#c9ccd2', pants: '#8a6238', eye: '#3a2a10', accent: '#d8a22e' } },
  { id: 'void', price: 200, c: { skin: '#b9a6e8', hair: '#231d36', shirt: '#332a4d', pants: '#1c172c', eye: '#b98bff', accent: '#9a6bff' } },
  { id: 'spirit', price: 300, c: { skin: '#e8fbff', hair: '#7ff3ff', shirt: '#dcf0f7', pants: '#6cc6d8', eye: '#1f9fb8', accent: '#7ff3ff' } },
  { id: 'storm', price: 500, c: { skin: '#8a6a52', hair: '#f0f7fa', shirt: '#231f57', shirt2: '#44d6e8', pants: '#0e0c2b', eye: '#7ff3ff', accent: '#f6c667' } },
];
export function skinColors(id) { return (SKINS.find((s) => s.id === id) || SKINS[0]).c; }

// Flat front-view skin portrait for shop cards.
export function drawSkinPortrait(canvas, id) {
  const c = skinColors(id);
  const x = canvas.getContext('2d');
  canvas.width = 16; canvas.height = 16;
  x.clearRect(0, 0, 16, 16);
  x.fillStyle = c.hair; x.fillRect(4, 0, 8, 2);
  x.fillStyle = c.skin; x.fillRect(4, 2, 8, 5);
  x.fillStyle = '#fff'; x.fillRect(5, 3, 2, 2); x.fillRect(9, 3, 2, 2);
  x.fillStyle = c.eye; x.fillRect(6, 3, 1, 2); x.fillRect(9, 3, 1, 2);
  x.fillStyle = c.shirt; x.fillRect(4, 7, 8, 5);
  x.fillStyle = c.shirt2 || c.shirt; x.fillRect(2, 7, 2, 5); x.fillRect(12, 7, 2, 5);
  x.fillStyle = c.skin; x.fillRect(2, 12, 2, 1); x.fillRect(12, 12, 2, 1);
  x.fillStyle = c.accent || c.pants; x.fillRect(4, 11, 8, 1);
  x.fillStyle = c.pants; x.fillRect(4, 12, 3, 4); x.fillRect(9, 12, 3, 4);
}
