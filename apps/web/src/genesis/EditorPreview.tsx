// Prévia do editor: um Canvas próprio com a criatura montada com os mesmos materiais e a mesma
// geometria do mundo. Os pontos da espinha são alças arrastáveis no plano lateral (x local = 0),
// as peças deslizam sobre o corpo (raycast + surfaceCoords) e a roda sobre um ponto muda a espessura.
//
// Espaços: a malha desenhada é a planta − centroidOffset(bp). Durante um arrasto o centróide anda
// junto com o ponto; para a alça não fugir do cursor, tudo é desenhado deslocado por uma "vista" que
// só se atualiza fora do arrasto: mundo = planta − vista.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { PALETTE } from '../lib/palette';
import { Effects } from '../scene/Effects';
import { clampDelta } from '../lib/motion';
import { isClick, type Point } from '../lib/pointer';
import { CRIADA_PULSE, criadaNucleus, useCriadaResources } from '../organisms/Criada';
import { Nucleus } from '../organisms/Nucleus';
import type { Blueprint } from '../services/wire';
import { centroidOffset, surfaceCoords, surfaceFrame } from './geometry';
import type { PreviewProps } from './CreationScreen';
import type { EditorAction } from './editor';

type Drag = { kind: 'point' | 'part'; index: number };

const HANDLE = 0.055;
const COLOR_IDLE = new THREE.Color(PALETTE.fg);
const COLOR_SELECTED = new THREE.Color(PALETTE.amber);
const WHEEL_STEP = 0.0008;

function Creature({ bp, view, bodyRef }: { bp: Blueprint; view: THREE.Vector3; bodyRef: RefObject<THREE.Mesh | null> }) {
  const res = useCriadaResources(bp);
  const pulse = useRef<number>(CRIADA_PULSE.min);
  const time = useRef(0);
  const { nucleus, nucleusAt } = useMemo(() => criadaNucleus(bp), [bp]);
  const glow = useMemo(() => new THREE.Color(bp.colors.glow), [bp.colors.glow]);
  // A malha vem centrada no centróide da planta; volta ao espaço da planta e desconta a vista.
  const offset = useMemo(() => centroidOffset(bp).sub(view).toArray() as [number, number, number], [bp, view]);

  useFrame((_, dt) => {
    time.current += clampDelta(dt);
    if (!res) return;
    const breath = (pulse.current - CRIADA_PULSE.min) / (CRIADA_PULSE.max - CRIADA_PULSE.min);
    const bu = res.body.uniforms;
    bu.uPulse.value = breath;
    bu.uFade.value = 1;
    (bu.uGlow.value as THREE.Color).copy(glow);
    const pu = res.parts.uniforms;
    pu.uTime.value = time.current;
    pu.uSwim.value = 0.25;
    pu.uFade.value = 1;
    (pu.uGlow.value as THREE.Color).copy(glow).multiplyScalar(0.8 + 0.4 * breath);
  });

  if (!res) return null;
  return (
    <group position={offset}>
      <group position={nucleusAt}>
        <Nucleus config={nucleus} pulseRef={pulse} haloScale={4} />
      </group>
      {bp.parts.length > 0 && <mesh geometry={res.geometry.parts} material={res.parts} renderOrder={1} />}
      <mesh ref={bodyRef} geometry={res.geometry.body} material={res.body} renderOrder={2} />
    </group>
  );
}

function Handle({
  position, selected, onDown, onWheel, onHover, ring,
}: {
  position: [number, number, number];
  selected: boolean;
  onDown: (e: ThreeEvent<PointerEvent>) => void;
  onWheel?: (e: ThreeEvent<WheelEvent>) => void;
  onHover: (over: boolean) => void;
  ring?: boolean;
}) {
  return (
    <mesh
      position={position}
      renderOrder={10}
      onPointerDown={onDown}
      onWheel={onWheel}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
    >
      {ring ? <octahedronGeometry args={[HANDLE * 0.9, 0]} /> : <sphereGeometry args={[HANDLE, 16, 12]} />}
      <meshBasicMaterial
        color={selected ? COLOR_SELECTED : COLOR_IDLE}
        transparent
        opacity={selected ? 0.95 : 0.6}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Arrasto com o mouse, fora do sistema de eventos do R3F: segue o cursor mesmo fora das alças. */
function useDrag(
  drag: Drag | null,
  setDrag: (d: Drag | null) => void,
  bp: Blueprint,
  view: THREE.Vector3,
  bodyRef: RefObject<THREE.Mesh | null>,
  dispatch: (a: EditorAction) => void,
) {
  const { camera, gl } = useThree();
  const latest = useRef({ bp, view, dispatch });
  latest.current = { bp, view, dispatch };

  useEffect(() => {
    if (!drag) return;
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const side = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const hit = new THREE.Vector3();
    const move = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const { bp: b, view: v, dispatch: send } = latest.current;
      if (drag.kind === 'point') {
        if (!ray.ray.intersectPlane(side, hit)) return;
        // Mundo → planta: local (0, x, y) + vista.
        send({ type: 'movePoint', index: drag.index, x: hit.y + v.y, y: hit.z + v.z });
      } else {
        const body = bodyRef.current;
        if (!body) return;
        const [first] = ray.intersectObject(body, false);
        if (!first) return;
        const { at, around } = surfaceCoords(b, first.point.clone().add(v));
        send({ type: 'movePart', index: drag.index, at, around });
      }
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag, setDrag, camera, gl, bodyRef]);
}

function Editable({ state, dispatch }: PreviewProps) {
  const { bp, selected } = state;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState(0);
  const bodyRef = useRef<THREE.Mesh>(null);

  // A vista acompanha o centróide, menos durante o arrasto.
  const live = useMemo(() => centroidOffset(bp), [bp]);
  const frozen = useRef(live);
  if (!drag) frozen.current = live;
  const view = drag ? frozen.current : live;

  useDrag(drag, setDrag, bp, view, bodyRef, dispatch);

  const onHover = (over: boolean) => setHover((h) => Math.max(0, h + (over ? 1 : -1)));
  const start = (d: Drag) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dispatch({ type: 'select', selected: d });
    setDrag(d);
  };

  const points = bp.body.spine.map(([x, y]) => [0, x - view.y, y - view.z] as [number, number, number]);
  const parts = bp.parts.map((p) => {
    const f = surfaceFrame(bp, p.at, p.around);
    return f.position.addScaledVector(f.normal, HANDLE).sub(view).toArray() as [number, number, number];
  });

  return (
    <>
      <Creature bp={bp} view={view} bodyRef={bodyRef} />
      {points.map((pos, i) => {
        const isSel = selected?.kind === 'point' && selected.index === i;
        return (
          <Handle
            key={`p${i}`}
            position={pos}
            selected={isSel}
            onHover={onHover}
            onDown={start({ kind: 'point', index: i })}
            onWheel={(e) => {
              e.stopPropagation();
              dispatch({ type: 'select', selected: { kind: 'point', index: i } });
              dispatch({ type: 'setThickness', index: i, r: bp.body.spine[i][2] - e.deltaY * WHEEL_STEP });
            }}
          />
        );
      })}
      {parts.map((pos, i) => (
        <Handle
          key={`q${i}`}
          ring
          position={pos}
          selected={selected?.kind === 'part' && selected.index === i}
          onHover={onHover}
          onDown={start({ kind: 'part', index: i })}
        />
      ))}
      <OrbitControls
        makeDefault
        enabled={!drag}
        enableZoom={hover === 0}
        enablePan={false}
        minDistance={1.6}
        maxDistance={9}
        target={[0, 0, 0]}
      />
    </>
  );
}

/** Canvas da prévia. Câmera de lado: com +z para cima, a frente da criatura (+y local) fica à direita. */
export function EditorPreview({ state, dispatch }: PreviewProps) {
  const downAt = useRef<Point | null>(null);
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [4.2, 0, 0.6], up: [0, 0, 1], fov: 38, near: 0.05, far: 60 }}
      style={{ position: 'absolute', inset: 0, background: PALETTE.bg, touchAction: 'none' }}
      onCreated={({ gl, scene }) => {
        scene.background = null;
        gl.setClearColor(PALETTE.bg);
        gl.domElement.addEventListener('pointerdown', (event) => {
          downAt.current = { x: event.clientX, y: event.clientY };
        });
      }}
      onPointerMissed={(event) => {
        const d = downAt.current;
        if (d && isClick(d, { x: event.clientX, y: event.clientY })) dispatch({ type: 'select', selected: null });
      }}
    >
      <fogExp2 attach="fog" args={[PALETTE.bg, 0.05]} />
      <Editable state={state} dispatch={dispatch} />
      {/* Mesmo bloom e vinheta do mundo: o núcleo e os ocelos brilham como lá. */}
      <Effects />
    </Canvas>
  );
}

