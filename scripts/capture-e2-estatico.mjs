// Parada 1 do E2, momentos que não dependem de um evento: brilhos diferentes, vista de cima e Poliedro de perto.
// Uso: node scripts/capture-e2-estatico.mjs [--url http://localhost:5173] [--out docs/captures/e2/parada-1] [--videos ../THE-ABYSS-capturas/e2/parada-1]
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5173' },
    out: { type: 'string', default: 'docs/captures/e2/parada-1' },
    videos: { type: 'string', default: '../THE-ABYSS-capturas/e2/parada-1' },
  },
});
await mkdir(values.out, { recursive: true });
await mkdir(values.videos, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'],
});

async function session(name, fn) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: values.videos, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  await page.goto(`${values.url}/?debug=1&quality=high`);
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => window.__abyss?.status() === 'live');
  await page.waitForTimeout(3000);
  const video = page.video();
  try {
    await fn(page);
  } finally {
    await page.close();
    await ctx.close();
    await rename(await video.path(), join(values.videos, `${name}.webm`));
  }
}

const snap = (page) =>
  page.evaluate(() => {
    const a = window.__abyss;
    return a
      .organisms()
      .map((o) => ({ id: o.id, sp: o.species, v: a.vitals(o.id), p: a.position(o.id) }))
      .filter((o) => o.v && o.p && o.v.dyingSinceMs === null)
      .map((o) => ({ id: o.id, sp: o.sp, e: o.v.energy, j: o.v.juvenile, p: o.p }));
  });
const cam = (page, pos, look) => page.evaluate(([p, l]) => window.__abyss.setCamera(p, l), [pos, look]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// e: um grupo da mesma espécie com a maior diferença de energia entre vizinhos
await session('e-brilhos', async (page) => {
  let best = null;
  for (let tries = 0; tries < 6 && !best; tries++) {
    const w = (await snap(page)).filter((o) => !o.j);
    let score = 0;
    for (const o of w) {
      const group = w.filter((x) => x.sp === o.sp && dist(x.p, o.p) < 7);
      if (group.length < 3) continue;
      const es = group.map((g) => g.e);
      const spread = Math.max(...es) - Math.min(...es);
      if (spread > score) { score = spread; best = { sp: o.sp, center: o.p, spread, es }; }
    }
    if (!best || best.spread < 0.35) { best = null; await page.waitForTimeout(5000); }
  }
  if (!best) { console.log('e: sem grupo com contraste'); return; }
  console.log('e:', best.sp, best.spread.toFixed(2), best.es.map((x) => x.toFixed(2)).join(' '));
  for (let i = 0; i < 12; i++) {
    const w = (await snap(page)).filter((o) => o.sp === best.sp && dist(o.p, best.center) < 9);
    if (w.length) {
      const c = [0, 1, 2].map((k) => w.reduce((s, o) => s + o.p[k], 0) / w.length);
      await cam(page, [c[0] + 5, c[1] + 2, c[2] + 5], c);
    }
    if (i === 3) await page.screenshot({ path: join(values.out, 'e-brilhos.png') });
    await page.waitForTimeout(700);
  }
  console.log('e energias finais', (await snap(page)).filter((o) => o.sp === best.sp && dist(o.p, best.center) < 9).map((o) => o.e.toFixed(2)).join(' '));
});

// f: a câmera livre tem teto em y=16 (CameraRig), então "de cima" é a 16 de altura, olhando para baixo, sobre cada região
await session('f-vista-de-cima', async (page) => {
  const views = [
    ['jardim', [0, 16, 0.5], [0, 0, 0]],
    ['floresta', [-48, 16, -29.5], [-48, 0, -30]],
    ['planicie', [62, 16, -27.5], [62, 0, -28]],
    ['obliqua', [7, 16, 45], [7, 0, -25]],
  ];
  for (const [name, pos, look] of views) {
    await cam(page, pos, look);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(values.out, `f-vista-de-cima-${name}.png`) });
    console.log('f', name);
  }
  const w = await snap(page);
  const REG = { jardim: [0, 0, 30], floresta: [-48, -30, 30], planicie: [62, -28, 45] };
  const tab = {};
  for (const o of w) {
    let r = 'fora', best = -1e9;
    for (const [k, [cx, cz, rad]] of Object.entries(REG)) {
      const d = rad - Math.hypot(o.p[0] - cx, o.p[2] - cz);
      if (d > best) { best = d; r = d > 0 ? k : 'fora'; }
    }
    tab[r] ??= {};
    tab[r][o.sp] = (tab[r][o.sp] ?? 0) + 1;
  }
  console.log('distribuição', JSON.stringify(tab));
});

// g: Poliedro adulto com energia alta, de perto
await session('g-poliedro', async (page) => {
  let pick = null;
  for (let tries = 0; tries < 10 && !pick; tries++) {
    pick = (await snap(page)).filter((o) => o.sp === 'poliedro' && !o.j).sort((a, b) => b.e - a.e)[0];
    if (!pick) await page.waitForTimeout(3000);
  }
  if (!pick) { console.log('g: sem poliedro cheio'); return; }
  console.log('g:', pick.id, pick.e.toFixed(2));
  for (let i = 0; i < 12; i++) {
    const o = (await snap(page)).find((x) => x.id === pick.id);
    if (o) {
      const d = i < 6 ? 2.2 : 1.3;
      await cam(page, [o.p[0] + d * 0.8, o.p[1] + d * 0.3, o.p[2] + d * 0.6], o.p);
    }
    if (i === 4) await page.screenshot({ path: join(values.out, 'g-poliedro-0.png') });
    if (i === 10) await page.screenshot({ path: join(values.out, 'g-poliedro-1.png') });
    await page.waitForTimeout(700);
  }
});

await browser.close();
