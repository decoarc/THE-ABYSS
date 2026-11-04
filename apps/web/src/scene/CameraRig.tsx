import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { isClick, type Point } from '../lib/pointer';
import { useSceneSettings } from '../settings';
import { useSelection, useWorld } from '../services/WorldProvider';
import type { WorldStore } from '../services/worldStore';
import type { Vec3 } from '../services/wire';
import { CAMERA, fovForAspect } from './cameraConfig';
import { stepFollow } from './follow';
import { createFlyInput } from './flyInput';
import { WORLD_ENV, aim, constrainCamera, forwardOf, look, stepFreeFly, wasConstrained, type FlyInput, type FlyState } from './freeFly';
import { pickSpawn } from './spawnPoint';
import { adoptPose, takeCameraPose } from './cameraPose';

const INTRO_SECONDS = 3;
/** A introdução começa este tanto acima do ponto de partida e desce até ele. */
const INTRO_RISE = 5;
/** ...e um pouco mais afastada do que a câmera olha (fração da distância). */
const INTRO_BACK = 0.5;
/** Ao começar a seguir, o alvo nasce à frente da câmera, a esta distância do organismo no máximo. */
const FOLLOW_DISTANCE: [number, number] = [4, 10];

/** free: nada com WASD e olha arrastando · following: acompanha o organismo selecionado. */
type Mode = 'free' | 'following';

const TOUCH_QUERY = '(pointer: coarse)';

function isTouchScreen(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(TOUCH_QUERY).matches;
}

/** Descida da introdução: de `from` até `to`, olhando para `lookAt`. */
interface Intro {
  from: Vec3;
  to: Vec3;
  lookAt: Vec3;
  t: number;
}

/** Manchas de flora como [x, z, nível]; só roda ao nascer, então a alocação não pesa. */
function floraPatches(flora: Float32Array): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < flora.length; i += 3) out.push([flora[i], flora[i + 1], flora[i + 2]]);
  return out;
}

/** Sorteia o ponto de partida perto de vida, com o roster e a flora do snapshot. */
function beginIntro(world: WorldStore, reducedMotion: boolean): Intro {
  const spawn = pickSpawn(
    Math.random,
    world.roster().map((o) => o.p),
    floraPatches(world.food().flora()),
  );
  const { pos: to, lookAt } = spawn;
  const from: Vec3 = [
    to[0] + (to[0] - lookAt[0]) * INTRO_BACK,
    to[1] + INTRO_RISE,
    to[2] + (to[2] - lookAt[2]) * INTRO_BACK,
  ];
  constrainCamera(from, WORLD_ENV);
  // Com movimento reduzido, a introdução já começa terminada.
  return { from, to, lookAt, t: reducedMotion ? INTRO_SECONDS : 0 };
}

/** Avança a introdução e escreve a posição em `out`. Devolve true quando terminou. */
function stepIntro(intro: Intro, dt: number, out: Vec3): boolean {
  intro.t = Math.min(INTRO_SECONDS, intro.t + dt);
  const eased = 1 - (1 - intro.t / INTRO_SECONDS) ** 3;
  for (let i = 0; i < 3; i++) out[i] = intro.from[i] + (intro.to[i] - intro.from[i]) * eased;
  constrainCamera(out, WORLD_ENV);
  return intro.t >= INTRO_SECONDS;
}

/** FOV que preserva a largura do enquadramento em telas estreitas. */
function useFov(camera: THREE.PerspectiveCamera) {
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  useEffect(() => {
    camera.fov = fovForAspect(width / height);
    camera.updateProjectionMatrix();
  }, [camera, width, height]);
}

/** Câmera do visitante: nado livre no computador; órbita em torno do lugar atual na tela de toque. */
export function CameraRig() {
  const [touch] = useState(isTouchScreen);
  return touch ? <TouchRig /> : <FreeRig />;
}

// Scratch fixo: nenhuma alocação por quadro.
const scratchOrg: Vec3 = [0, 0, 0];
const scratchVel: Vec3 = [0, 0, 0];
const scratchDir: Vec3 = [0, 0, 0];
const NO_INPUT: FlyInput = { forward: 0, right: 0, up: 0 };

function FreeRig() {
  const { reducedMotion } = useSceneSettings();
  const { store: world, selection } = useWorld();
  const { id, following } = useSelection();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const canvas = useThree((s) => s.gl.domElement);
  useFov(camera);

  const fly = useRef<FlyState>(aim(CAMERA.position, CAMERA.target, { pos: [...CAMERA.position], vel: [0, 0, 0], yaw: 0, pitch: 0 }));
  const mode = useRef<Mode>('free');
  const followId = useRef<string | null>(null);
  /** Ponto que a câmera olha ao seguir; null até o primeiro quadro do seguimento. */
  const followTarget = useRef<Vec3 | null>(null);
  const intro = useRef<Intro | null>(null);
  const introDone = useRef(false);
  const dragged = useRef(false);
  const input = useRef<ReturnType<typeof createFlyInput> | null>(null);

  useEffect(() => {
    const keys = createFlyInput(window);
    input.current = keys;
    return () => {
      keys.dispose();
      input.current = null;
    };
  }, []);

  // Arrastar com o botão esquerdo olha (sem travar o cursor); ao seguir, gira em volta do organismo.
  // Um clique curto (isClick) não gira: ele continua selecionando.
  useEffect(() => {
    let down: Point | null = null;
    let last: Point = { x: 0, y: 0 };
    let looking = false;

    const onMove = (event: PointerEvent) => {
      if (!down) return;
      const now = { x: event.clientX, y: event.clientY };
      if (!looking && isClick(down, now)) return;
      looking = true;
      dragged.current = true;
      const s = fly.current;
      const target = mode.current === 'following' ? followTarget.current : null;
      if (target) {
        const dist = Math.hypot(s.pos[0] - target[0], s.pos[1] - target[1], s.pos[2] - target[2]);
        look(s, now.x - last.x, now.y - last.y);
        const f = forwardOf(s.yaw, s.pitch, scratchDir);
        for (let i = 0; i < 3; i++) s.pos[i] = target[i] - f[i] * dist;
        constrainCamera(s.pos, WORLD_ENV);
      } else {
        look(s, now.x - last.x, now.y - last.y);
      }
      last = now;
    };
    const onUp = () => {
      down = null;
      looking = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      down = { x: event.clientX, y: event.clientY };
      last = down;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };
    canvas.addEventListener('pointerdown', onDown);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      onUp();
    };
  }, [canvas]);

  // Seguir liga o modo; soltar (WASD, Esc, outra seleção) deixa a câmera onde está.
  useEffect(() => {
    if (following && id !== null) {
      mode.current = 'following';
      followId.current = id;
      followTarget.current = null;
    } else {
      // Ao soltar, a câmera para onde está (sem deriva herdada do seguimento).
      if (mode.current === 'following') fly.current.vel = [0, 0, 0];
      mode.current = 'free';
      followId.current = null;
      followTarget.current = null;
    }
  }, [following, id]);

  useEffect(() => {
    camera.position.set(...CAMERA.position);
    camera.lookAt(...CAMERA.target);
  }, [camera]);

  useFrame((_, rawDelta) => {
    const dt = clampDelta(rawDelta);
    const s = fly.current;
    const keys = input.current?.read() ?? NO_INPUT;
    const swimming = keys.forward !== 0 || keys.right !== 0 || keys.up !== 0;

    // Pose pedida pelo ?debug=1: encerra a introdução e o seguimento e fica onde foi posta.
    const posed = takeCameraPose();
    if (posed) {
      adoptPose(s, posed);
      constrainCamera(s.pos, WORLD_ENV);
      introDone.current = true;
      intro.current = null;
      if (mode.current === 'following') selection.setFollowing(false);
      mode.current = 'free';
      followTarget.current = null;
      camera.position.set(s.pos[0], s.pos[1], s.pos[2]);
      camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
      return;
    }

    // Antes do primeiro snapshot: quadro herói parado.
    if (!introDone.current) {
      if (world.worldId() === null) return;
      if (!intro.current) {
        intro.current = beginIntro(world, reducedMotion);
        dragged.current = false; // arrasto de antes do snapshot não conta
      }
      // Nadar ou arrastar durante a descida devolve o controle ali mesmo.
      const interrupted = swimming || dragged.current;
      const done = interrupted || stepIntro(intro.current, dt, s.pos);
      if (!interrupted) aim(s.pos, intro.current.lookAt, s);
      if (done) {
        introDone.current = true;
        intro.current = null;
      }
    } else if (mode.current === 'following' && followId.current !== null) {
      if (swimming) {
        // WASD/Espaço/Shift soltam a criatura: a seleção fica, o seguimento sai.
        mode.current = 'free';
        followTarget.current = null;
        selection.setFollowing(false);
        s.vel[0] = s.vel[1] = s.vel[2] = 0; // parte do repouso, sem velocidade de antes do seguimento
        stepFreeFly(s, keys, dt, WORLD_ENV);
      } else if (world.sample(followId.current, performance.now(), scratchOrg, scratchVel)) {
        let target = followTarget.current;
        if (!target) {
          // O alvo nasce no ponto que a câmera já olha: o giro até o organismo é suave.
          const d = Math.hypot(scratchOrg[0] - s.pos[0], scratchOrg[1] - s.pos[1], scratchOrg[2] - s.pos[2]);
          const reach = Math.min(FOLLOW_DISTANCE[1], Math.max(FOLLOW_DISTANCE[0], d));
          const f = forwardOf(s.yaw, s.pitch, scratchDir);
          target = [s.pos[0] + f[0] * reach, s.pos[1] + f[1] * reach, s.pos[2] + f[2] * reach];
          followTarget.current = target;
        }
        // Com movimento reduzido, a taxa infinita encaixa de uma vez.
        stepFollow(target, s.pos, scratchOrg, dt, reducedMotion ? Infinity : undefined);
        constrainCamera(s.pos, WORLD_ENV);
        aim(s.pos, target, s);
      }
    } else {
      stepFreeFly(s, keys, dt, WORLD_ENV);
    }

    camera.position.set(s.pos[0], s.pos[1], s.pos[2]);
    camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
  });

  return null;
}

/** Tela de toque: órbita em torno do lugar atual (o ponto de partida, depois onde o Seguir soltou). */
function TouchRig() {
  const { reducedMotion } = useSceneSettings();
  const { store: world } = useWorld();
  const { id, following } = useSelection();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useFov(camera);

  const mode = useRef<Mode>('free');
  const followId = useRef<string | null>(null);
  const intro = useRef<Intro | null>(null);
  const introDone = useRef(false);
  const scratchTarget = useRef<Vec3>([0, 0, 0]);
  const scratchCam = useRef<Vec3>([0, 0, 0]);

  useEffect(() => {
    camera.position.set(...CAMERA.position);
  }, [camera]);

  useEffect(() => {
    if (following && id !== null) {
      mode.current = 'following';
      followId.current = id;
    } else {
      mode.current = 'free';
      followId.current = null;
    }
  }, [following, id]);

  useFrame((_, rawDelta) => {
    const dt = clampDelta(rawDelta);
    const c = controls.current;
    if (!c) return;
    const target = scratchTarget.current;
    const cam = scratchCam.current;

    if (!introDone.current) {
      c.enabled = false;
      if (world.worldId() === null) return;
      intro.current ??= beginIntro(world, reducedMotion);
      const done = stepIntro(intro.current, dt, cam);
      camera.position.set(cam[0], cam[1], cam[2]);
      c.target.set(...intro.current.lookAt);
      camera.lookAt(c.target);
      if (done) {
        introDone.current = true;
        intro.current = null;
        c.enabled = true;
      }
      return;
    }

    if (mode.current === 'following' && followId.current !== null) {
      if (!world.sample(followId.current, performance.now(), scratchOrg, scratchVel)) return;
      target[0] = c.target.x;
      target[1] = c.target.y;
      target[2] = c.target.z;
      cam[0] = camera.position.x;
      cam[1] = camera.position.y;
      cam[2] = camera.position.z;
      stepFollow(target, cam, scratchOrg, dt, reducedMotion ? Infinity : undefined);
      constrainCamera(cam, WORLD_ENV);
      c.target.set(target[0], target[1], target[2]);
      camera.position.set(cam[0], cam[1], cam[2]);
    }
  });

  // Gesto do visitante: o centro da órbita e a câmera ficam no volume nadável.
  // Ao seguir, o centro é o próprio organismo e só a câmera é contida.
  const constrain = () => {
    const c = controls.current;
    if (!c) return;
    const p = scratchCam.current;
    if (mode.current === 'free') {
      p[0] = c.target.x;
      p[1] = c.target.y;
      p[2] = c.target.z;
      if (wasConstrained(constrainCamera(p, WORLD_ENV))) c.target.set(p[0], p[1], p[2]);
    }
    p[0] = camera.position.x;
    p[1] = camera.position.y;
    p[2] = camera.position.z;
    if (wasConstrained(constrainCamera(p, WORLD_ENV))) camera.position.set(p[0], p[1], p[2]);
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
      onChange={constrain}
    />
  );
}
