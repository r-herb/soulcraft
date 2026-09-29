// The minimap in the HUD corner: the land around the player, north up, with
// the player's arrow, the respawn point and nearby landmarks. Tapping it opens
// the world map. Shown in the overworld and in cities.
import { SEA } from '../world/blocks.js';
import { Layout } from '../world/structures.js';
import { CITY_PLACES } from '../world/city.js';
import { cityPicture, owColour } from './worldmap.js';

const RANGE = 72; // blocks from the centre to the edge
const SAMPLES = 48; // overworld samples across

export class Minimap {
  constructor(root) {
    this.root = root;
    this.cv = root.querySelector('canvas');
    this.ctx = this.cv.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.t = 0;
    this.ow = null; // overworld picture: { pic, x, z, seed }
  }

  hide() { this.root.classList.add('hidden'); }

  update(g, dt) {
    const show = g.mapTravelOk && !g.player.dead;
    this.root.classList.toggle('hidden', !show);
    if (!show) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.2;
    const size = this.root.clientWidth || 110;
    if (this.cv.width !== Math.round(size * this.dpr)) { this.cv.width = this.cv.height = Math.round(size * this.dpr); }
    const ctx = this.ctx, p = g.player.pos;
    const s = size / (RANGE * 2); // pixels per block
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const toS = (x, z) => [(x - p.x) * s + size / 2, (z - p.z) * s + size / 2];
    const city = g.meta.dim === 'city' ? g.city : null;
    if (city) {
      ctx.fillStyle = '#2f6db3';
      ctx.fillRect(0, 0, size, size);
      const pic = cityPicture(city);
      if (pic) {
        const [sx, sy] = toS(pic.x0, pic.z0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pic.img, sx, sy, pic.img.width * pic.step * s, pic.img.height * pic.step * s);
      }
    } else {
      const L = Layout.get(g.meta.seed);
      // re-sample when the player has moved a fair way
      if (!this.ow || this.ow.L !== L || Math.hypot(this.ow.x - p.x, this.ow.z - p.z) > RANGE / 3) this.ow = this.sample(L, p.x, p.z);
      const o = this.ow, f = (RANGE * 3) / SAMPLES; // blocks per sample (the picture covers 1.5x the range each way)
      const [sx, sy] = toS(o.x - RANGE * 1.5, o.z - RANGE * 1.5);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(o.pic, sx, sy, SAMPLES * f * s, SAMPLES * f * s);
      for (const v of L.villagesAround(p.x, p.z, RANGE)) this.dot(...toS(v.x, v.z), '#e0a45a', 3);
    }
    if (city) for (const pl of CITY_PLACES[g.meta.city] || []) {
      const q = city.toXZ(pl.lat, pl.lon);
      const [x, y] = toS(q.x, q.z);
      if (x < -20 || y < -20 || x > size + 20 || y > size + 20) continue;
      this.dot(x, y, '#ffd36b', 2.5);
      ctx.font = '9px Tiny5, monospace'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,6,24,0.85)'; ctx.strokeText(pl.name, x, y - 5);
      ctx.fillStyle = '#fff'; ctx.fillText(pl.name, x, y - 5);
    }
    // the tracked mission's place
    const tg = city && g.missions && g.missions.target();
    if (tg) {
      let [x, y] = toS(tg.x, tg.z);
      const cx = size / 2, cy = size / 2, r = size / 2 - 7;
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d > r) { x = cx + (dx / d) * r; y = cy + (dy / d) * r; }
      ctx.fillStyle = '#ffd36b'; ctx.strokeStyle = 'rgba(8,6,24,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 2.6 : 6; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.stroke(); ctx.fill();
    }
    // bus stops and the buses on the road
    if (city && g.buses) {
      for (const st of g.buses.net.stops) {
        const [x, y] = toS(st.x, st.z);
        if (x < 0 || y < 0 || x > size || y > size) continue;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 2, 4, 4); ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 1; ctx.strokeRect(x - 2, y - 2, 4, 4);
      }
      for (const b of g.buses.net.active()) { const [x, y] = toS(b.x, b.z); if (x > -5 && y > -5 && x < size + 5 && y < size + 5) this.dot(x, y, '#c8102e', 3); }
    }
    if (g.homeHere()) { const h = g.meta.home; this.dot(...toS(h.x, h.z), '#7cf0a0', 3.5); }
    if (g.net && g.net.players) for (const o of g.net.players.values()) if (o.object && o.seen) this.dot(...toS(o.object.position.x, o.object.position.z), '#b48cff', 3);
    // the player
    const fx = -Math.sin(g.player.yaw), fz = -Math.cos(g.player.yaw);
    ctx.save(); ctx.translate(size / 2, size / 2); ctx.rotate(Math.atan2(fz, fx));
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, 4.5); ctx.lineTo(-2, 0); ctx.lineTo(-5, -4.5); ctx.closePath();
    ctx.fillStyle = '#5ce1e6'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#0b0a1f'; ctx.stroke(); ctx.restore();
  }

  dot(x, y, colour, r) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = colour; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#0b0a1f'; ctx.stroke();
  }

  sample(L, cx, cz) {
    const pic = document.createElement('canvas');
    pic.width = pic.height = SAMPLES;
    const c = pic.getContext('2d');
    const img = c.createImageData(SAMPLES, SAMPLES);
    const f = (RANGE * 3) / SAMPLES, x0 = cx - RANGE * 1.5, z0 = cz - RANGE * 1.5;
    const hs = new Float32Array(SAMPLES * SAMPLES);
    for (let j = 0; j < SAMPLES; j++) for (let i = 0; i < SAMPLES; i++) hs[j * SAMPLES + i] = L.height(Math.floor(x0 + i * f), Math.floor(z0 + j * f));
    for (let j = 0; j < SAMPLES; j++) for (let i = 0; i < SAMPLES; i++) {
      const h = hs[j * SAMPLES + i];
      const col = owColour(L, Math.floor(x0 + i * f), Math.floor(z0 + j * f), h);
      const hn = hs[Math.max(0, j - 1) * SAMPLES + Math.max(0, i - 1)];
      const shade = h < SEA ? 1 : Math.max(0.7, Math.min(1.3, 1 + (h - hn) * 0.05));
      const o = (j * SAMPLES + i) * 4;
      img.data[o] = col[0] * shade; img.data[o + 1] = col[1] * shade; img.data[o + 2] = col[2] * shade; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return { pic, x: cx, z: cz, L };
  }
}
