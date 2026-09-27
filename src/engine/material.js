// The single chunk shader: one atlas, per-vertex sky/block light + AO,
// day/night via a uniform, distance fog.
import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS } from '../world/blocks.js';

const vertexShader = /* glsl */`
attribute vec3 aUV;
attribute vec3 aLight;
uniform float uDaylight;
uniform float uMinLight;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vUV;
varying float vBright;
varying float vWarm;
varying float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
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
varying vec3 vUV;
varying float vBright;
varying float vWarm;
varying float vFog;
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
  rgb = mix(rgb, uFogColor, vFog);
  gl_FragColor = vec4(rgb, c.a * uOpacity);
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
  };
  const solid = new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlphaTest: { value: 0.5 }, uOpacity: { value: 1 } },
    vertexShader, fragmentShader,
  });
  const water = new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlphaTest: { value: 0.01 }, uOpacity: { value: 0.85 } },
    vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  return { solid, water, uniforms: shared };
}
