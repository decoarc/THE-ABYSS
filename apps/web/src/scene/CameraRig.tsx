import { useEffect, useRef, type ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { useSceneSettings } from '../settings';
import { useSelection, useWorld } from '../services/WorldProvider';
import type { Vec3 } from '../services/wire';
import { CAMERA, fovForAspect } from './cameraConfig';
import { followTargetBounds, stepFollow, stepReturn } from './follow';

const INTRO_SECONDS = 3;
const finalPos = new THREE.Vector3(...CAMERA.position);
const startPos = finalPos.clone().multiplyScalar(1.45).add(new THREE.Vector3(0, 2.5, 0));

/** home: limites normais · following: acompanha o organismo · returning: volta ao quadro herói. */
type Mode = 'home' | 'following' | 'returning';

// Scratch fixo: nenhuma alocação por quadro.
const scratchTarget: Vec3 = [0, 0, 0];
const scratchCam: Vec3 = [0, 0, 0];
const scratchOrg: Vec3 = [0, 0, 0];
const scratchVel: Vec3 = [0, 0, 0];

function load(v: THREE.Vector3, out: Vec3) {
  out[0] = v.x;
  out[1] = v.y;
  out[2] = v.z;
}

function store(out: Vec3, v: THREE.Vector3) {
  v.set(out[0], out[1], out[2]);
}

export function CameraRig() {
  const { reducedMotion } = useSceneSettings();
  const { store: world } = useWorld();
  const { id, following } = useSelection();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const intro = useRef(reducedMotion ? INTRO_SECONDS : 0);
  const mode = useRef<Mode>('home');
  const followId = useRef<string | null>(null);

  useEffect(() => {
    camera.fov = fovForAspect(width / height);
    camera.updateProjectionMatrix();
  }, [camera, width, height]);

  useEffect(() => {
    camera.position.copy(intro.current >= INTRO_SECONDS ? finalPos : startPos);
  }, [camera]);

  // Limites de azimute são aplicados direto no controle, e não por prop: uma prop
  // reaplicada pelo React no meio do seguimento desfaria o afrouxamento.
  const setAzimuthLimits = (free: boolean) => {
    const c = controls.current;
    if (!c) return;
    c.minAzimuthAngle = free ? -Infinity : CAMERA.minAzimuthAngle;
    c.maxAzimuthAngle = free ? Infinity : CAMERA.maxAzimuthAngle;
  };

  useEffect(() => setAzimuthLimits(false), []);

  // Seguir liga o modo; soltar começa a volta ao quadro herói (instantânea com movimento reduzido).
  useEffect(() => {
    if (following && id !== null) {
      followId.current = id;
      mode.current = 'following';
      setAzimuthLimits(true);
      if (controls.current) controls.current.enabled = true;
    } else if (mode.current === 'following') {
      followId.current = null;
      mode.current = 'returning';
      if (controls.current) controls.current.enabled = false;
    }
    // Só reage a mudança de seleção; setAzimuthLimits lê apenas a referência do controle.
  }, [following, id]);

  useFrame((_, rawDelta) => {
    const dt = clampDelta(rawDelta);
    if (intro.current < INTRO_SECONDS) {
      intro.current = Math.min(INTRO_SECONDS, intro.current + dt);
      const t = intro.current / INTRO_SECONDS;
      const eased = 1 - (1 - t) ** 3;
      camera.position.lerpVectors(startPos, finalPos, eased);
      if (controls.current) controls.current.enabled = intro.current >= INTRO_SECONDS;
      return;
    }
    const c = controls.current;
    if (!c) return;
    // Com movimento reduzido, a taxa infinita encaixa de uma vez.
    const rate = reducedMotion ? Infinity : undefined;

    if (mode.current === 'following' && followId.current !== null) {
      if (!world.sample(followId.current, performance.now(), scratchOrg, scratchVel)) return;
      load(c.target, scratchTarget);
      load(camera.position, scratchCam);
      stepFollow(scratchTarget, scratchCam, scratchOrg, dt, rate);
      store(scratchTarget, c.target);
      store(scratchCam, camera.position);
    } else if (mode.current === 'returning') {
      load(c.target, scratchTarget);
      load(camera.position, scratchCam);
      const arrived = stepReturn(scratchTarget, scratchCam, dt, rate);
      store(scratchTarget, c.target);
      store(scratchCam, camera.position);
      if (arrived) {
        mode.current = 'home';
        setAzimuthLimits(false);
        c.enabled = true;
      }
    }
  });

  const clampTarget = () => {
    const c = controls.current;
    if (!c) return;
    const bounds = world.bounds();
    const box = mode.current === 'following' && bounds ? followTargetBounds(bounds) : CAMERA.targetBounds;
    const { x, y, z } = box;
    c.target.set(
      THREE.MathUtils.clamp(c.target.x, x[0], x[1]),
      THREE.MathUtils.clamp(c.target.y, y[0], y[1]),
      THREE.MathUtils.clamp(c.target.z, z[0], z[1]),
    );
  };

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={CAMERA.target}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.45}
      zoomSpeed={0.6}
      panSpeed={0.5}
      screenSpacePanning={false}
      minDistance={CAMERA.minDistance}
      maxDistance={CAMERA.maxDistance}
      minPolarAngle={CAMERA.minPolarAngle}
      maxPolarAngle={CAMERA.maxPolarAngle}
      onChange={clampTarget}
    />
  );
}
