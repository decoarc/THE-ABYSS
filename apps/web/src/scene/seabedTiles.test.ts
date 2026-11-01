import { MAP } from '../world/map';
import { seabedTiles } from './seabedTiles';

const tiles = seabedTiles();
const inside = (x: number, z: number) =>
  tiles.some((t) => Math.abs(x - t.cx) <= t.size / 2 && Math.abs(z - t.cz) <= t.size / 2);

it('blocos de 30 × 30', () => {
  expect(tiles.length).toBeGreaterThan(0);
  for (const t of tiles) expect(t.size).toBe(30);
});

it('cobrem toda região com 30 de margem', () => {
  for (const r of MAP.regions) {
    const reach = r.radius + 30;
    for (let x = r.center[0] - reach; x <= r.center[0] + reach; x += 1)
      for (let z = r.center[1] - reach; z <= r.center[1] + reach; z += 1) expect(inside(x, z)).toBe(true);
  }
});

it('não se sobrepõem', () => {
  for (let i = 0; i < tiles.length; i++)
    for (let k = i + 1; k < tiles.length; k++) {
      const a = tiles[i], b = tiles[k];
      const ox = (a.size + b.size) / 2 - Math.abs(a.cx - b.cx);
      const oz = (a.size + b.size) / 2 - Math.abs(a.cz - b.cz);
      expect(ox <= 1e-9 || oz <= 1e-9).toBe(true);
    }
});
