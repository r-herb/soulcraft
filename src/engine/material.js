// The single chunk shader: one atlas, per-vertex sky/block light + AO,
// day/night via a uniform, distance fog. With the shaders setting on
// (uFx = 1): leaves, grass and crops sway in the wind, water ripples and
// glints in the sun, and the light takes a warm tint at sunrise and sunset.
import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, TILE } from '../world/blocks.js';

// atlas tiles that sway in the wind (leaves and plants)
const WAVE_TILES = ['leaves', 'pine_leaves', 'spirit_leaves', 'tallgrass', 'dry_bush', 'glowbell', 'wheat_1', 'wheat_2', 'wheat_3', 'tomato_2', 'tomato_3', 'orange_2', 'orange_3']
  .map((k) => TILE[k]).filter((v) => v !== undefined);
while (WAVE_TILES.length < 16) WAVE_TILES.push(-1);

const vertexShader = /* glsl */`
attribute vec3 aUV;
attribute vec3 aLight;
uniform float uDaylight;
uniform float uMinLight;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform float uFx;
uniform float uWater;
uniform float uWave[16];
varying vec3 vUV;
varying float vBright;
varying float vWarm;
varying float vFog;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  if (uFx > 0.5) {
    float tile = floor(aUV.z + 0.5);
    bool wave = false;
    for (int i = 0; i < 16; i++) if (abs(uWave[i] - tile) < 0.5) wave = true;
    // the top of a plant or leaves moves; the base of a plant stays
    if (wave && fract(aUV.y) > 0.01) {
      float ph = uTime * 1.6 + wp.x * 0.35 + wp.z * 0.27;
      wp.x += sin(ph) * 0.06; wp.z += cos(ph * 0.8) * 0.05;
    }
    // water: slow ripples on the surface
    if (uWater > 0.5) wp.y += (sin(uTime * 1.3 + wp.x * 0.7) + cos(uTime * 1.1 + wp.z * 0.6)) * 0.025 - 0.05;
  }
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  vUV = aUV;
  float sky = aLight.x * uDaylight;
  float blk = aLight.y;
  float l = max(sky, blk);
  float b = pow(0.8, (1.0 - l) * 15.0);
  vBright = max(b, uMinLight) * aLight.z;
  vWarm = clamp((blk - sky) * 1.4, 0.0, 1.0);
  vFog = smoothstep(uFogNear, uFogFar, length(mv.xyz));
}`;

const fragmentShader = /* glsl */`
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform float uAlphaTest;
uniform float uOpacity;
uniform vec3 uFogColor;
uniform float uTime;
uniform float uFx;
uniform float uWater;
uniform float uDaylight;
uniform float uDusk;
varying vec3 vUV;
varying float vBright;
varying float vWarm;
varying float vFog;
varying vec3 vWorld;
void main() {
  float tile = floor(vUV.z + 0.5);
  float col = mod(tile, uGrid.x);
  float row = floor(tile / uGrid.x);
  vec2 f = clamp(fract(vUV.xy), 0.002, 0.998);
  vec2 uv = vec2((col + f.x) / uGrid.x, (row + 1.0 - f.y) / uGrid.y);
  vec4 c = texture2D(uAtlas, uv);
  if (c.a < uAlphaTest) discard;
  vec3 tint = mix(vec3(1.0), vec3(1.12, 0.92, 0.7), vWarm * 0.6);
  vec3 rgb = c.rgb * vBright * tint;
  float a = c.a * uOpacity;
  if (uFx > 0.5) {
    // golden light at sunrise and sunset, a cool blue at night
    rgb *= mix(vec3(1.0), vec3(1.12, 0.94, 0.78), uDusk * 0.7);
    rgb = mix(rgb, rgb * vec3(0.82, 0.9, 1.15), (1.0 - uDaylight) * 0.5);
    if (uWater > 0.5) {
      // glints that drift with the ripples, and deeper colour farther out
      float g = sin(vWorld.x * 2.1 + uTime * 2.0) * sin(vWorld.z * 1.7 - uTime * 1.6);
      rgb += vec3(0.9, 0.95, 1.0) * smoothstep(0.82, 1.0, g) * 0.35 * uDaylight;
      rgb = mix(rgb, rgb * vec3(0.7, 0.85, 1.0), 0.25);
      a = min(1.0, a + 0.05);
    }
  }
  rgb = mix(rgb, uFogColor, vFog);
  gl_FragColor = vec4(rgb, a);
}`;

export function createAtlasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  return tex;
}

export function createChunkMaterials(texture) {
  const shared = {
    uAtlas: { value: texture },
    uGrid: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
    uDaylight: { value: 1 },
    uMinLight: { value: 0.06 },
    uFogNear: { value: 40 },
    uFogFar: { value: 60 },
    uFogColor: { value: new THREE.Color(0x9fd4ff) },
    uTime: { value: 0 },
    uFx: { value: 1 },
    uDusk: { value: 0 },
    uWave: { value: WAVE_TILES },
  };
  const solid = new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlphaTest: { value: 0.5 }, uOpacity: { value: 1 }, uWater: { value: 0 } },
    vertexShader, fragmentShader,
  });
  const water = new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlphaTest: { value: 0.01 }, uOpacity: { value: 0.85 }, uWater: { value: 1 } },
    vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  return { solid, water, uniforms: shared };
}
