import type { Vec3 } from '../services/wire';

export interface Trail {
  push(tMs: number, p: Vec3): void;
  /** Posição em `tMs`, interpolada linearmente; fora do intervalo, limita à ponta mais próxima. */
  at(tMs: number, out: Vec3): Vec3;
}

/** Histórico circular de posições (t, x, y, z) com capacidade fixa: os mais antigos saem primeiro. */
export function createTrail(capacity: number): Trail {
  const cap = Math.max(1, Math.floor(capacity));
  const data = new Float64Array(cap * 4);
  let head = 0; // próxima escrita
  let count = 0;
  // Posição no array da i-ésima amostra, da mais antiga (0) à mais nova.
  const slot = (i: number) => ((head - count + i + cap) % cap) * 4;

  return {
    push(tMs, p) {
      // Tempo repetido ou para trás: atualiza a amostra mais nova em vez de empilhar.
      if (count > 0) {
        const last = slot(count - 1);
        if (tMs <= data[last]) {
          data[last + 1] = p[0];
          data[last + 2] = p[1];
          data[last + 3] = p[2];
          return;
        }
      }
      const o = head * 4;
      data[o] = tMs;
      data[o + 1] = p[0];
      data[o + 2] = p[1];
      data[o + 3] = p[2];
      head = (head + 1) % cap;
      if (count < cap) count++;
    },

    at(tMs, out) {
      if (count === 0) {
        out[0] = out[1] = out[2] = 0;
        return out;
      }
      const first = slot(0);
      const last = slot(count - 1);
      let k = -1;
      if (tMs <= data[first]) k = first;
      else if (tMs >= data[last]) k = last;
      if (k >= 0) {
        out[0] = data[k + 1];
        out[1] = data[k + 2];
        out[2] = data[k + 3];
        return out;
      }
      // Busca binária pelo segmento [a, b] com t(a) <= tMs < t(b).
      let lo = 0, hi = count - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (data[slot(mid)] <= tMs) lo = mid;
        else hi = mid;
      }
      const a = slot(lo), b = slot(hi);
      const u = (tMs - data[a]) / (data[b] - data[a]);
      out[0] = data[a + 1] + (data[b + 1] - data[a + 1]) * u;
      out[1] = data[a + 2] + (data[b + 2] - data[a + 2]) * u;
      out[2] = data[a + 3] + (data[b + 3] - data[a + 3]) * u;
      return out;
    },
  };
}
