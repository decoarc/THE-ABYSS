import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { percentile } from '../lib/frameStats';
import { useSceneSettings } from '../settings';

const WARMUP_MS = 5000;
const SAMPLE_MS = 10000;

export interface PerfReport {
  renderer: string;
  quality: string;
  dpr: number;
  width: number;
  height: number;
  /** Frame time em ms. */
  p50: number;
  p95: number;
  drawCalls: number;
  frames: number;
}

declare global {
  interface Window {
    __abyssPerf?: PerfReport;
  }
}

export function isPerfEnabled(search: string): boolean {
  return new URLSearchParams(search).get('perf') === '1';
}

/**
 * Mede frame time por 10 s depois de 5 s de aquecimento e publica o resultado no
 * console e em `window.__abyssPerf`. Montado só com `?perf=1`.
 */
export function PerfProbe() {
  const { quality } = useSceneSettings();
  const gl = useThree((s) => s.gl);
  const start = useRef(performance.now());
  const last = useRef(performance.now());
  const samples = useRef<number[]>([]);
  const calls = useRef<number[]>([]);
  const done = useRef(false);

  useEffect(() => {
    // Soma as chamadas de todos os passes do pós-processamento num mesmo quadro.
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);

  useFrame(() => {
    const now = performance.now();
    const frameMs = now - last.current;
    last.current = now;
    const drawCalls = gl.info.render.calls;
    gl.info.reset();
    if (done.current) return;

    const elapsed = now - start.current;
    if (elapsed < WARMUP_MS) return;
    samples.current.push(frameMs);
    calls.current.push(drawCalls);
    if (elapsed < WARMUP_MS + SAMPLE_MS) return;

    done.current = true;
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const canvas = gl.domElement;
    const report: PerfReport = {
      renderer: ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconhecido',
      quality,
      dpr: gl.getPixelRatio(),
      width: canvas.width,
      height: canvas.height,
      p50: percentile(samples.current, 50),
      p95: percentile(samples.current, 95),
      drawCalls: Math.round(percentile(calls.current, 50)),
      frames: samples.current.length,
    };
    window.__abyssPerf = report;
    console.info('[abyss-perf]', JSON.stringify(report));
  });

  return null;
}
