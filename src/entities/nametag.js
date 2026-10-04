// A name over a player's head, as in Roblox: big white letters with a dark
// outline, always facing the camera, seen through walls (so a friend can be
// found), getting smaller with distance. Admins' names are golden.
import * as THREE from 'three';

const FONT = '700 46px "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const TAG_H = 0.42; // world height of the letters' line

export function nameTag(name, gold = false) {
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  x.font = FONT;
  const w = Math.ceil(x.measureText(name).width) + 28, h = 64;
  c.width = w; c.height = h;
  x.font = FONT;
  x.textBaseline = 'middle'; x.textAlign = 'center';
  x.lineJoin = 'round';
  x.lineWidth = 9; x.strokeStyle = gold ? 'rgba(60, 36, 0, 0.95)' : 'rgba(0, 0, 0, 0.85)';
  x.strokeText(name, w / 2, h / 2 + 2);
  x.fillStyle = gold ? '#ffd65c' : '#ffffff';
  x.fillText(name, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  s.renderOrder = 20;
  s.scale.set((w / h) * TAG_H, TAG_H, 1);
  s.userData.name = name;
  return s;
}

// too far away: no name (it would only be a speck)
export const TAG_FAR = 90;
