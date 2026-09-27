// Web Worker: world generation and chunk meshing off the main thread.
import { generateChunk } from '../world/generator.js';
import { meshChunk } from './mesher.js';

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'gen') {
      const data = generateChunk(m.seed, m.dim, m.cx, m.cz, m.extra);
      self.postMessage({ id: m.id, type: 'gen', data }, [data.buffer]);
    } else if (m.type === 'mesh') {
      const r = meshChunk(m.vol);
      const t = [r.solid.pos.buffer, r.solid.uv.buffer, r.solid.light.buffer, r.solid.idx.buffer,
        r.water.pos.buffer, r.water.uv.buffer, r.water.light.buffer, r.water.idx.buffer];
      self.postMessage({ id: m.id, type: 'mesh', solid: r.solid, water: r.water }, t);
    }
  } catch (err) {
    self.postMessage({ id: m.id, type: 'error', message: String(err && err.stack || err) });
  }
};
