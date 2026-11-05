export interface FloraLook {
  /** Escala da mancha (0 some, 1 é a mancha cheia). */
  scale: number;
  /** Força do brilho das pontas e da borda, de 0 a 1. */
  glow: number;
}

/**
 * Aparência de uma mancha de flora pelo nível de crescimento (0 a 1).
 * A escala sobe rápido no começo (raiz 0,6): uma mancha recém-brotada já se lê como comida;
 * o brilho segue a raiz quadrada, mais lento, para a mancha cheia brilhar mais que a mordida.
 * `out` evita alocar no quadro.
 */
export function floraLook(level: number, out: FloraLook = { scale: 0, glow: 0 }): FloraLook {
  const l = Math.min(1, Math.max(0, level));
  out.scale = l ** 0.6;
  out.glow = Math.sqrt(l);
  return out;
}

/** Hash inteiro → [0, 1): variação fixa por mancha ou partícula (tamanho, giro, cor), igual em toda aba. */
export function hash01(i: number, salt: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
