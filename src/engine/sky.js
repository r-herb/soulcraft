// Sky colours, sun/moon, stars and per-realm atmosphere.
import * as THREE from 'three';

const DAY = new THREE.Color(0x8fd0ff);
const DUSK = new THREE.Color(0xf09a6a);
const NIGHT = new THREE.Color(0x0a0a26);

export const REALM_ATMOS = {
  overworld: null,
  emberdeep: { color: 0x3a0f0a, daylight: 0.0, minLight: 0.28, fogNear: 0.35, fogFar: 0.95 },
  void: { color: 0x120a26, daylight: 0.55, minLight: 0.2, fogNear: 0.5, fogFar: 1.0 },
  quest: { color: 0x8fd0ff, daylight: 1, minLight: 0.08, fogNear: 0.6, fogFar: 1.0 },
  soul: { color: 0x5aa9c4, daylight: 0.85, minLight: 0.15, fogNear: 0.45, fogFar: 1.0 },
};

// time: 0..1 through a full day; 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight
export function daylightAt(time) {
  const s = Math.sin(time * Math.PI * 2);
  return Math.max(0.12, Math.min(1, 0.5 + s * 0.9));
}
export function isNight(time) { return time > 0.54 && time < 0.96; }

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.color = new THREE.Color();
    const mk = (color, size) => {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const x = c.getContext('2d');
      x.fillStyle = color; x.fillRect(2, 2, 12, 12);
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(4, 4, 4, 4);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
      m.renderOrder = -1;
      return m;
    };
    this.sun = mk('#fff2a8', 30);
    this.moon = mk('#dfe8ff', 20);
    this.group = new THREE.Group();
    this.group.add(this.sun, this.moon);
    // stars
    const g = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 400; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pts.push(Math.cos(a) * r * 200, Math.abs(u) * 200, Math.sin(a) * r * 200);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.group.add(this.stars);
    scene.add(this.group);
  }

  update(time, camera, realm, uniforms, renderDist, scene) {
    const atm = REALM_ATMOS[realm];
    let daylight;
    if (atm) {
      this.color.setHex(atm.color);
      daylight = atm.daylight;
      uniforms.uMinLight.value = atm.minLight;
      this.group.visible = realm === 'void';
      this.sun.visible = this.moon.visible = false;
      this.stars.material.opacity = realm === 'void' ? 0.9 : 0;
    } else {
      this.group.visible = true;
      this.sun.visible = this.moon.visible = true;
      daylight = daylightAt(time);
      const s = Math.sin(time * Math.PI * 2);
      if (s > 0.25) this.color.copy(DAY);
      else if (s > -0.2) { const k = (s + 0.2) / 0.45; this.color.copy(NIGHT).lerp(DUSK, Math.min(1, k * 1.6)).lerp(DAY, Math.max(0, k * 1.6 - 0.6)); }
      else this.color.copy(NIGHT);
      // a city night is never pitch dark: the lamps, the shop windows, the glow of the town
      uniforms.uMinLight.value = realm === 'city' ? 0.14 : 0.07;
      this.stars.material.opacity = Math.max(0, -s * 1.4);
    }
    uniforms.uDaylight.value = daylight;
    uniforms.uFogColor.value.copy(this.color);
    const far = renderDist * 16;
    const fn = atm ? atm.fogNear : 0.55, ff = atm ? atm.fogFar : 0.95;
    uniforms.uFogNear.value = far * fn;
    uniforms.uFogFar.value = far * ff;
    scene.background = this.color;
    // orbit sun & moon around the camera
    this.group.position.copy(camera.position);
    const ang = time * Math.PI * 2;
    this.sun.position.set(Math.cos(ang) * 150, Math.sin(ang) * 150, -40);
    this.moon.position.set(-Math.cos(ang) * 150, -Math.sin(ang) * 150, -40);
    this.sun.lookAt(camera.position);
    this.moon.lookAt(camera.position);
    return daylight;
  }
}
