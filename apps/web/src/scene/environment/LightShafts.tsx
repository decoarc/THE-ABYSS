import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../../lib/motion';
import { useSceneSettings } from '../../settings';
import { SHAFTS, SHAFT_HEIGHT as HEIGHT } from './shaftLayout';

const shaftVertex = /* glsl */ `
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vY;
uniform float uTime;
uniform float uPhase;
void main() {
  vY = uv.y;
  vec3 p = position;
  // Ondulação lenta que cresce para baixo.
  p.x += sin(uTime * 0.25 + uPhase + uv.y * 2.0) * (1.0 - uv.y) * 0.6;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const shaftFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
uniform float uPhase;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vY;
void main() {
  // Mais denso no eixo do cone, sumindo nas bordas e nas pontas.
  float facing = pow(abs(dot(vNormalV, vViewDir)), 2.0);
  float vertical = smoothstep(0.0, 0.55, vY) * smoothstep(1.0, 0.75, vY);
  float breathe = 0.75 + 0.25 * sin(uTime * 0.18 + uPhase);
  gl_FragColor = vec4(uColor * facing * vertical * breathe * uStrength, 1.0);
}
`;

export function LightShafts() {
  const { motion } = useSceneSettings();
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.4, 1, HEIGHT, 24, 1, true), []);
  const materials = useMemo(
    () =>
      SHAFTS.map(
        (s, i) =>
          new THREE.ShaderMaterial({
            vertexShader: shaftVertex,
            fragmentShader: shaftFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            uniforms: {
              uTime: { value: 0 },
              uPhase: { value: i * 1.9 },
              uStrength: { value: s.strength },
              uColor: { value: new THREE.Color('#7fb8c4') },
            },
          }),
      ),
    [],
  );

  useFrame((_, dt) => {
    const step = clampDelta(dt) * motion;
    for (const m of materials) m.uniforms.uTime.value += step;
  });

  return (
    <>
      {SHAFTS.map((s, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={materials[i]}
          position={[s.x, HEIGHT / 2 - 1, s.z]}
          rotation={[0, 0, s.tilt]}
          scale={[s.radius, 1, s.radius]}
          renderOrder={2}
        />
      ))}
    </>
  );
}
