import { Color } from 'three';
import { PALETTE } from '../lib/palette';
import { MAP } from '../world/map';
import { planicieWeight, regionTint } from './regionTint';

const luminance = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
/** Quanto do total é azul: maior = mais frio. */
const blueShare = (c: Color) => c.b / (c.r + c.g + c.b);

const planicie = MAP.regions.find((r) => r.id === 'planicie')!;

it('no Jardim devolve exatamente a luz e a névoa aprovadas', () => {
  const t = regionTint(0, 0);
  expect(t.fog.equals(new Color(PALETTE.bg))).toBe(true);
  expect(t.sky.equals(new Color('#2c6f80'))).toBe(true);
  expect(t.ambient).toBe(0.5);
  // O quadro herói (câmera em [0, 8.2, 17.5]) também.
  const hero = regionTint(0, 17.5);
  expect(hero.fog.equals(new Color(PALETTE.bg))).toBe(true);
  expect(hero.sky.equals(new Color('#2c6f80'))).toBe(true);
  expect(hero.ambient).toBe(0.5);
});

it('na Planície é mais escuro e mais frio que no Jardim', () => {
  const j = regionTint(0, 0);
  const p = regionTint(planicie.center[0], planicie.center[1]);
  expect(luminance(p.fog)).toBeLessThan(luminance(j.fog));
  expect(luminance(p.sky)).toBeLessThan(luminance(j.sky));
  expect(p.ambient).toBeLessThan(j.ambient);
  expect(blueShare(p.fog)).toBeGreaterThan(blueShare(j.fog));
  expect(blueShare(p.sky)).toBeGreaterThan(blueShare(j.sky));
});

it('contínuo entre as regiões', () => {
  const STEP = 0.25;
  let prev = regionTint(-48, -30);
  const path: [number, number][] = [
    [-48, -30],
    [0, 0],
    [planicie.center[0], planicie.center[1]],
    [planicie.center[0] + planicie.radius + 20, planicie.center[1]],
  ];
  let worstColor = 0;
  let worstAmbient = 0;
  for (let s = 1; s < path.length; s++) {
    const [ax, az] = path[s - 1];
    const [bx, bz] = path[s];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / STEP);
    for (let i = 1; i <= n; i++) {
      const t = regionTint(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
      for (const k of ['fog', 'sky'] as const)
        worstColor = Math.max(
          worstColor,
          Math.abs(t[k].r - prev[k].r),
          Math.abs(t[k].g - prev[k].g),
          Math.abs(t[k].b - prev[k].b),
        );
      worstAmbient = Math.max(worstAmbient, Math.abs(t.ambient - prev.ambient));
      prev = t;
    }
  }
  // Sem degrau: em 0,25 unidade muda no máximo um décimo da diferença total Jardim → Planície
  // (a passagem mais curta é na borda do miolo do Jardim, r 26 → 32).
  const j = regionTint(0, 0);
  const p = regionTint(planicie.center[0], planicie.center[1]);
  const total = Math.max(...(['fog', 'sky'] as const).flatMap((k) => [j[k].r - p[k].r, j[k].g - p[k].g, j[k].b - p[k].b].map(Math.abs)));
  expect(worstColor).toBeLessThan(total / 10);
  expect(worstAmbient).toBeLessThan((j.ambient - p.ambient) / 10);
});

it('escreve em `out` sem alocar quando recebe um', () => {
  const out = { fog: new Color(), sky: new Color(), ambient: 0 };
  const { fog, sky } = out;
  const r = regionTint(planicie.center[0], planicie.center[1], out);
  expect(r).toBe(out);
  expect(r.fog).toBe(fog);
  expect(r.sky).toBe(sky);
  expect(r.ambient).toBeLessThan(0.5);
  // O mesmo `out` reaproveitado na costura e no Jardim continua dando os valores certos.
  expect(regionTint(27, -12, out)).toEqual(regionTint(27, -12));
  expect(regionTint(0, 0, out)).toEqual(regionTint(0, 0));
});

describe('planicieWeight', () => {
  /** Ponto a distância `r` da origem, na direção do centro da Planície. */
  const towardPlain = (r: number): [number, number] => {
    const [cx, cz] = planicie.center;
    const len = Math.hypot(cx, cz);
    return [(cx / len) * r, (cz / len) * r];
  };

  it('é exatamente 0 no miolo aprovado do Jardim', () => {
    for (let r = 0; r <= 26; r += 0.5)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
        // Em ponto flutuante cos·26, sin·26 pode cair um fio além de 26: só vale o que está dentro.
        if (Math.hypot(x, z) <= 26) expect(planicieWeight(x, z)).toBe(0);
      }
    expect(planicieWeight(...towardPlain(26))).toBe(0);
  });

  it('passa devagar de r 26 a ~40, só chegando ao platô bem dentro', () => {
    const w = (r: number) => planicieWeight(...towardPlain(r));
    // Na borda da passagem antiga (r 32) ainda é parcial.
    expect(w(32)).toBeGreaterThan(0.2);
    expect(w(32)).toBeLessThan(0.6);
    expect(w(36)).toBeLessThan(0.95);
    expect(w(42)).toBeGreaterThan(0.95);
    for (let r = 26; r < 42; r += 0.5) expect(w(r + 0.5)).toBeGreaterThanOrEqual(w(r));
  });
});
