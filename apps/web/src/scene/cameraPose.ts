import type { Vec3 } from '../services/wire';
import { aim, type FlyState } from './freeFly';

/** Pose pedida de fora (só pelo `?debug=1`): onde a câmera fica e para onde olha. */
export interface PoseRequest {
  pos: Vec3;
  lookAt: Vec3;
}

let pending: PoseRequest | null = null;

/** Registra uma pose para a câmera livre adotar no próximo quadro. */
export function requestCameraPose(pos: Vec3, lookAt: Vec3): void {
  pending = { pos: [...pos], lookAt: [...lookAt] };
}

/** Entrega e limpa a pose pendente, se houver. */
export function takeCameraPose(): PoseRequest | null {
  const r = pending;
  pending = null;
  return r;
}

/** A câmera livre adota a pose: posição, olhar e velocidade zerada. */
export function adoptPose(state: FlyState, req: PoseRequest): void {
  state.pos = [...req.pos];
  state.vel = [0, 0, 0];
  aim(state.pos, req.lookAt, state);
}

/** Onde a câmera está agora, e quanto do percurso fixo (`?flypath=1`) já andou. Só leitura de fora. */
export interface CameraReadout {
  pos: Vec3;
  /** Segundos desde o início do percurso fixo; null fora dele. */
  pathS: number | null;
}

const readout: CameraReadout = { pos: [0, 0, 0], pathS: null };

/** A câmera publica a pose a cada quadro (sem alocar). */
export function publishCamera(pos: Vec3, pathS: number | null): void {
  readout.pos[0] = pos[0];
  readout.pos[1] = pos[1];
  readout.pos[2] = pos[2];
  readout.pathS = pathS;
}

/** Cópia da última pose publicada. */
export function readCamera(): CameraReadout {
  return { pos: [...readout.pos], pathS: readout.pathS };
}
