import { describe, expect, it } from 'vitest';
import { adoptPose, requestCameraPose, takeCameraPose } from './cameraPose';
import { forwardOf, type FlyState } from './freeFly';

describe('cameraPose', () => {
  it('entrega a pose pedida uma única vez', () => {
    requestCameraPose([1, 2, 3], [4, 5, 6]);
    expect(takeCameraPose()).toEqual({ pos: [1, 2, 3], lookAt: [4, 5, 6] });
    expect(takeCameraPose()).toBeNull();
  });

  it('adota posição, zera a velocidade e passa a olhar para o alvo', () => {
    const s: FlyState = { pos: [0, 0, 0], vel: [3, 2, 1], yaw: 0, pitch: 0 };
    adoptPose(s, { pos: [10, 5, 10], lookAt: [10, 5, 0] });
    expect(s.pos).toEqual([10, 5, 10]);
    expect(s.vel).toEqual([0, 0, 0]);
    const f = forwardOf(s.yaw, s.pitch, [0, 0, 0]);
    expect(f[2]).toBeCloseTo(-1);
    expect(f[0]).toBeCloseTo(0);
  });
});
