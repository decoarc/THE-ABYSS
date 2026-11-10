// Materiais das espécies criadas: um código só para toda planta (sem `defines`, sem variação de
// compilação). A planta muda só valores de uniforms, então o three reaproveita o mesmo programa.
import * as THREE from 'three';
import { foggyShader } from '../scene/glsl/material';
import { SNOISE } from '../scene/glsl/noise';
import type { Blueprint, Pattern } from '../services/wire';
import { PART_KINDS } from './geometry';

export const PATTERN_INDEX: Record<Pattern, number> = { liso: 0, manchas: 1, listras: 2, aneis: 3 };

// A cor escolhida vira o tom da pele, mas a pele continua do fundo do mar: um pouco dessaturada
// e com luminância limitada (a Célula, #3f5a4a, fica abaixo do limite e não muda de cara).
const TAME = /* glsl */ `
vec3 tame(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 0.7);
  return l > 0.12 ? c * (0.12 / l) : c;
}
`;

const K = (kind: (typeof PART_KINDS)[number]) => `${PART_KINDS.indexOf(kind)}.0`;

const bodyVertex = /* glsl */ `
attribute float aAlong;
attribute float aAround;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vLocal;
varying float vAround;
#include <fog_pars_vertex>
void main() {
  vLocal = position;
  vAround = aAround;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const bodyFragment = /* glsl */ `
uniform vec3 uSkin;
uniform vec3 uGlow;
uniform float uPattern;
uniform float uPulse;
uniform float uFade;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vLocal;
varying float vAround;
#include <fog_pars_fragment>
${SNOISE}
${TAME}
// 0 liso, 1 manchas, 2 listras ao longo, 3 anéis: máscara 0..1 das marcas.
float patternMask() {
  if (uPattern < 0.5) return 0.0;
  if (uPattern < 1.5) return smoothstep(0.3, 0.6, snoise(vLocal * 4.5));
  if (uPattern < 2.5) return smoothstep(0.55, 0.9, 0.5 + 0.5 * cos(vAround * 6.0));
  return smoothstep(0.6, 0.92, 0.5 + 0.5 * cos(vLocal.y * 9.0));
}
void main() {
  vec3 n = normalize(vNormalV);
  float facing = abs(dot(n, normalize(vViewDir)));
  float rim = 1.0 - facing;
  // Pele cerosa como a da Célula, com as marcas mais escuras e um resto de luz nelas.
  float mottle = snoise(vLocal * 3.0) * 0.5 + 0.5;
  vec3 tone = tame(uSkin);
  vec3 skin = tone * (0.6 + 0.5 * mottle) * (0.45 + 0.4 * max(n.y, 0.0));
  float mark = patternMask();
  skin = mix(skin, skin * 0.45 + uGlow * 0.05, mark * 0.75);
  // Luz do núcleo atravessando a parede, mais forte onde ela é vista de frente.
  vec3 inner = uGlow * facing * facing * (0.1 + 0.2 * uPulse);
  vec3 sheen = mix(tone, vec3(0.81, 0.9, 0.78), 0.65) * pow(rim, 3.0) * 0.35;
  float alpha = clamp(0.5 + rim * 0.45, 0.0, 1.0);
  gl_FragColor = vec4(skin + inner + sheen, alpha * uFade);
  #include <fog_fragment>
}
`;

const partsVertex = /* glsl */ `
uniform float uTime;
uniform float uSwim;
attribute float aKind;
attribute float aT;
attribute float aPhase;
attribute float aLum;
attribute vec3 aBend;
varying float vT;
varying float vLum;
varying vec3 vNormalV;
varying vec3 vViewDir;
#include <fog_pars_vertex>
float isKind(float k) { return 1.0 - step(0.5, abs(aKind - k)); }
void main() {
  float t = aT;
  float w = 0.0;
  // Flagelo: onda da raiz à ponta, mais rápida nadando.
  w += isKind(${K('flagelo')}) * sin(uTime * (3.5 + 8.0 * uSwim) - t * 7.0 + aPhase) * t;
  // Cílios: a fase anda pela fileira.
  w += isKind(${K('cilios')}) * sin(uTime * (4.0 + 5.0 * uSwim) - aPhase) * t;
  // Aleta: bate.
  w += isKind(${K('aleta')}) * sin(uTime * (1.5 + 2.5 * uSwim) + aPhase) * t * t;
  // Mandíbula: abre e fecha devagar.
  w += isKind(${K('mandibula')}) * (0.5 + 0.5 * sin(uTime * 0.7 + aPhase)) * t;
  // Filtro e cardume: balanço lento.
  w += isKind(${K('filtro')}) * sin(uTime * 1.3 + aPhase) * t;
  w += isKind(${K('cardume')}) * sin(uTime * 1.1 - t * 3.0 + aPhase) * t;
  vec3 p = position + aBend * w;
  vT = t;
  vLum = aLum;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const partsFragment = /* glsl */ `
uniform vec3 uSkin;
uniform vec3 uGlow;
uniform float uFade;
varying float vT;
varying float vLum;
varying vec3 vNormalV;
varying vec3 vViewDir;
#include <fog_pars_fragment>
${TAME}
void main() {
  float facing = abs(dot(normalize(vNormalV), normalize(vViewDir)));
  float rim = 1.0 - facing;
  // Mais escuras e dessaturadas que o corpo; pontas um pouco mais claras.
  vec3 tone = tame(uSkin);
  float grey = dot(tone, vec3(0.299, 0.587, 0.114));
  vec3 base = mix(tone, vec3(grey), 0.45) * 0.6 * (0.7 + 0.5 * vT);
  vec3 col = base * (0.55 + 0.45 * facing) + base * rim * 0.4;
  // Ocelos e pontos do cardume brilham com a cor da espécie.
  col = mix(col, uGlow * 1.6, vLum);
  float alpha = mix(0.88 - 0.3 * vT, 1.0, vLum) * uFade;
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

export function createBodyMaterial(): THREE.ShaderMaterial {
  return foggyShader({
    vertexShader: bodyVertex,
    fragmentShader: bodyFragment,
    transparent: true,
    uniforms: {
      uSkin: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uPattern: { value: 0 },
      uPulse: { value: 0 },
      uFade: { value: 1 },
    },
  });
}

export function createPartsMaterial(): THREE.ShaderMaterial {
  return foggyShader({
    vertexShader: partsVertex,
    fragmentShader: partsFragment,
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSwim: { value: 0 },
      uGlow: { value: new THREE.Color() },
      uSkin: { value: new THREE.Color() },
      uFade: { value: 1 },
    },
  });
}

/** Põe as cores e o padrão da planta nos uniforms (`uGlow` aqui é a cor base, sem a energia). */
export function applyBlueprint(m: THREE.ShaderMaterial, bp: Blueprint): void {
  (m.uniforms.uSkin.value as THREE.Color).set(bp.colors.body);
  (m.uniforms.uGlow.value as THREE.Color).set(bp.colors.glow);
  if (m.uniforms.uPattern) m.uniforms.uPattern.value = PATTERN_INDEX[bp.pattern] ?? 0;
}
