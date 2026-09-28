// First-person arm and held item, attached to the camera.
import * as THREE from 'three';
import { iconCanvas } from '../ui/icons.js';
import { skinColors } from '../entities/models.js';

export class HeldItem {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.position.set(0.42, -0.42, -0.62);
    game.camera.add(this.group);
    const mat = (c) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false });
    this.armMat = mat(0xd9a57a);
    this.sleeveMat = mat(0x3b5bd6);
    this.arm = new THREE.Group();
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.2), this.armMat);
    hand.position.set(0, 0, -0.08);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.3), this.sleeveMat);
    sleeve.position.set(0, 0, 0.16);
    this.arm.add(hand, sleeve);
    this.arm.rotation.set(0.25, 0.25, 0);
    this.group.add(this.arm);
    this.itemTex = new THREE.CanvasTexture(document.createElement('canvas'));
    this.itemTex.magFilter = THREE.NearestFilter;
    this.itemTex.minFilter = THREE.NearestFilter;
    this.item = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: this.itemTex, transparent: true, alphaTest: 0.3, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.item.position.set(-0.02, 0.12, -0.2);
    this.item.rotation.set(0, -0.6, 0.15);
    this.group.add(this.item);
    this.group.traverse((o) => { o.renderOrder = 100; o.frustumCulled = false; });
    this.swingT = 0;
    this.currentKey = undefined;
    this.bobT = 0;
    this.lightMul = 1;
  }

  setSkin(id) {
    const c = skinColors(id);
    this.armMat.color.set(c.skin);
    this.sleeveMat.color.set(c.shirt);
  }

  swing() { if (this.swingT <= 0) { this.swingT = 0.25; this.swings = ((this.swings || 0) + 1) % 1000; } }

  update(dt) {
    const inv = this.game.inventory;
    const h = inv && inv.held;
    const key = h ? h.item : null;
    if (key !== this.currentKey) {
      this.currentKey = key;
      if (key) {
        this.itemTex.image = iconCanvas(key, 32);
        this.itemTex.needsUpdate = true;
        this.item.visible = true;
      } else this.item.visible = false;
    }
    const p = this.game.player;
    if (p.moving) this.bobT += dt * 9; else this.bobT *= 0.9;
    let sx = 0, sy = 0, rx = 0;
    if (this.swingT > 0) {
      this.swingT -= dt;
      const k = Math.sin((1 - Math.max(0, this.swingT) / 0.25) * Math.PI);
      sx = -k * 0.12; sy = k * 0.08; rx = -k * 0.9;
    }
    this.group.position.set(0.42 + sx + Math.sin(this.bobT) * 0.015, -0.42 + sy - Math.abs(Math.cos(this.bobT)) * 0.02, -0.62);
    this.group.rotation.x = rx;
    this.group.visible = !p.dead;
  }
}
