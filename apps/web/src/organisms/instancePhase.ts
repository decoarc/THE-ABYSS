/**
 * Fase estável de uma instância em [0, 1), a partir do id (FNV-1a de 32 bits).
 * A animação cosmética do corpo usa `t + phaseOf(id) * 1000`: instâncias da mesma
 * espécie nunca respiram nem giram em sincronia.
 */
export function phaseOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}
