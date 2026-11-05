import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../../lib/motion';
import { createRng } from '../../lib/random';
import { useSceneSettings } from '../../settings';
import { MAP, type Sponge } from '../../world/map';
import { foggyShader } from '../glsl/material';
import { seabedHeight } from '../terrain';
import { SPONGE_BUCKETS, latticeGeometry, placeSponge } from './latticeGen';

/** Vidro: corpo violeta (PALETTE.violet), luz presa dentro mais clara e rosada. */
const BODY = '#8666c5';
const TRAPPED = '#b79cff';
/** Quanto do brilho sobra quando a câmera está dentro do cesto. */
const INSIDE_FADE = 0.12;

const vertex = /* glsl */ `
attribute float aHeight;
attribute vec2 aCyl;
uniform float uInsideFade;
varying vec3 vNormalW;
varying vec3 vView;
varying float vHeight;
varying float vInner;
varying float vFade;
varying float vPhase;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 axis = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vView = cameraPosition - world.xyz;
  // Lado de dentro do fio (virado para o eixo do cesto): é ele que pega a luz presa.
  vec2 toAxis = axis.xz - world.xz;
  vInner = clamp(dot(vNormalW.xz, toAxis / max(length(toAxis), 1e-4)), 0.0, 1.0);
  vHeight = aHeight;
  vPhase = fract(sin(dot(axis.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
  // Câmera dentro do cilindro da esponja (aCyl = raio, topo): o cesto inteiro fica translúcido.
  float d = distance(cameraPosition.xz, axis.xz);
  float inside = (1.0 - smoothstep(aCyl.x * 0.8, aCyl.x + 1.0, d))
    * (1.0 - smoothstep(aCyl.y - 0.3, aCyl.y + 1.0, cameraPosition.y));
  // Fio colado na lente não enche a tela.
  float near = smoothstep(0.3, 1.8, length(vView));
  vFade = mix(1.0, uInsideFade, inside) * mix(0.2, 1.0, near);
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform vec3 uBody;
uniform vec3 uTrapped;
uniform float uTime;
varying vec3 vNormalW;
varying vec3 vView;
varying float vHeight;
varying float vInner;
varying float vFade;
varying float vPhase;
#include <fog_pars_fragment>
void main() {
  float facing = abs(dot(normalize(vNormalW), normalize(vView)));
  float fresnel = pow(1.0 - facing, 2.0);
  // Luz fraca presa no bojo do cesto, respirando devagar e fora de fase entre esponjas.
  float trapped = exp(-pow((vHeight - 0.38) / 0.32, 2.0));
  float breath = 0.85 + 0.15 * sin(uTime * 0.25 + vPhase);
  float lip = smoothstep(0.92, 1.0, vHeight);
  // Cada cesto com o seu vidro, uns mais apagados que outros.
  float glass = 0.6 + 0.4 * fract(vPhase * 7.31);
  vec3 color = uBody * (0.05 + 0.26 * fresnel + 0.12 * lip) * glass
    + uTrapped * trapped * (0.05 + 0.4 * vInner) * breath;
  color *= vFade;
  // Aditivo: a névoa apaga o vidro (rumo ao preto) em vez de somar a cor dela.
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    color *= 1.0 - fogFactor;
  #endif
  gl_FragColor = vec4(color, 1.0);
}
`;

interface Bucket {
  geometry: THREE.BufferGeometry;
  sponges: Sponge[];
}

/**
 * Floresta de Esponjas de Vidro ("Treliça"): cestos de treliça violeta, assentados no chão e
 * ocupando o cilindro que o servidor usa para desviar. Um InstancedMesh por tamanho, sempre
 * desenhados, com o material criado na montagem (nada compila no meio do voo). Sem luzes da cena:
 * a luz presa dentro é emissão no shader, e a câmera dentro de um cesto o deixa translúcido pelo
 * próprio shader (`cameraPosition`), sem trocar material nem montar nada.
 */
export function Floresta() {
  const { q, motion } = useSceneSettings();

  const buckets = useMemo<Bucket[]>(() => {
    const out: Bucket[] = SPONGE_BUCKETS.map((shape) => ({
      geometry: latticeGeometry(shape, q.spongeDetail),
      sponges: [],
    }));
    for (const sp of MAP.sponges) out[placeSponge(sp, 0).bucket].sponges.push(sp);
    for (const b of out) {
      const cyl = new Float32Array(b.sponges.length * 2);
      b.sponges.forEach((sp, i) => {
        cyl[i * 2] = sp.r;
        cyl[i * 2 + 1] = sp.h;
      });
      b.geometry.setAttribute('aCyl', new THREE.InstancedBufferAttribute(cyl, 2));
    }
    return out;
  }, [q.spongeDetail]);

  const material = useMemo(
    () =>
      foggyShader({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        // Aditivo: vidro que nunca escurece o que está atrás (criaturas escondidas continuam visíveis).
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uInsideFade: { value: INSIDE_FADE },
          uBody: { value: new THREE.Color(BODY) },
          uTrapped: { value: new THREE.Color(TRAPPED) },
        },
      }),
    [],
  );

  useEffect(() => () => buckets.forEach((b) => b.geometry.dispose()), [buckets]);
  useEffect(() => () => material.dispose(), [material]);

  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  useLayoutEffect(() => {
    const rng = createRng(77);
    const matrix = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    buckets.forEach((b, k) => {
      const m = meshes.current[k];
      if (!m) return;
      b.sponges.forEach((sp, i) => {
        const place = placeSponge(sp, seabedHeight(sp.x, sp.z));
        p.set(sp.x, place.baseY, sp.z);
        // Só giro em torno do eixo: a casca continua dentro do cilindro.
        quat.setFromAxisAngle(up, rng() * Math.PI * 2);
        // Seção um pouco oval (só encolhe um eixo): a casca nunca passa de r.
        s.set(place.scaleXZ, place.scaleY, place.scaleXZ * (0.82 + rng() * 0.18));
        m.setMatrixAt(i, matrix.compose(p, quat, s));
      });
      m.instanceMatrix.needsUpdate = true;
    });
  }, [buckets]);

  useFrame((_, dt) => {
    material.uniforms.uTime.value += clampDelta(dt) * Math.max(motion, 0.15);
  });

  return (
    <>
      {buckets.map((b, k) => (
        <instancedMesh
          key={`${k}-${q.spongeDetail}`}
          ref={(m) => {
            meshes.current[k] = m;
          }}
          args={[b.geometry, material, b.sponges.length]}
          frustumCulled={false}
        />
      ))}
    </>
  );
}
