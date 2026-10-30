import { useEffect, useRef, type ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { useSceneSettings } from '../settings';
import { CAMERA, fovForAspect } from './cameraConfig';

const INTRO_SECONDS = 3;
const finalPos = new THREE.Vector3(...CAMERA.position);
const startPos = finalPos.clone().multiplyScalar(1.45).add(new THREE.Vector3(0, 2.5, 0));

export function CameraRig() {
  const { reducedMotion } = useSceneSettings();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const intro = useRef(reducedMotion ? INTRO_SECONDS : 0);

  useEffect(() => {
    camera.fov = fovForAspect(width / height);
    camera.updateProjectionMatrix();
  }, [camera, width, height]);

  useEffect(() => {
    camera.position.copy(intro.current >= INTRO_SECONDS ? finalPos : startPos);
  }, [camera]);

  useFrame((_, rawDelta) => {
    if (intro.current >= INTRO_SECONDS) return;
    intro.current = Math.min(INTRO_SECONDS, intro.current + clampDelta(rawDelta));
    const t = intro.current / INTRO_SECONDS;
    const eased = 1 - (1 - t) ** 3;
    camera.position.lerpVectors(startPos, finalPos, eased);
    if (controls.current) controls.current.enabled = intro.current >= INTRO_SECONDS;
  });

  const clampTarget = () => {
    const c = controls.current;
    if (!c) return;
    const { x, y, z } = CAMERA.targetBounds;
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
      minAzimuthAngle={CAMERA.minAzimuthAngle}
      maxAzimuthAngle={CAMERA.maxAzimuthAngle}
      onChange={clampTarget}
    />
  );
}
