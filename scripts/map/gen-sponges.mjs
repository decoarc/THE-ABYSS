// Gera as esponjas da Floresta em shared/world/map-e1.json (semente fixa 31).
// Uso: node scripts/map/gen-sponges.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../../shared/world/map-e1.json', import.meta.url));
const map = JSON.parse(readFileSync(path, 'utf8'));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const depthOf = (x, z) => {
  let best = { depth: -Infinity, id: null };
  for (const r of map.regions) {
    const d = r.radius - Math.hypot(x - r.center[0], z - r.center[1]);
    if (d > best.depth) best = { depth: d, id: r.id };
  }
  return best;
};

const rand = mulberry32(31);
const floresta = map.regions.find((r) => r.id === 'floresta');
const TARGET = 70;
const sponges = [];
for (let tries = 0; sponges.length < TARGET && tries < 20000; tries++) {
  const ang = rand() * Math.PI * 2;
  const rad = Math.sqrt(rand()) * floresta.radius;
  const x = floresta.center[0] + Math.cos(ang) * rad;
  const z = floresta.center[1] + Math.sin(ang) * rad;
  const r = 0.4 + rand() * 0.8;
  const h = 0.8 + rand() * 1.7;
  const { depth, id } = depthOf(x, z);
  if (id !== 'floresta' || depth <= 3) continue;
  if (sponges.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + r + 0.3)) continue;
  sponges.push({ x: +x.toFixed(2), z: +z.toFixed(2), r: +r.toFixed(2), h: +h.toFixed(2) });
}

map.sponges = sponges;
writeFileSync(path, JSON.stringify(map, null, 2) + '\n');
console.log(`esponjas: ${sponges.length}`);
