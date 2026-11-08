// Captura da Parada 1 do E2: um diretor que acompanha o mundo ao vivo pelo `window.__abyss`
// e grava stills + um vídeo contínuo, anotando em quais instantes cada momento aconteceu.
// Uso: node scripts/capture-e2.mjs [--url http://localhost:5173] [--out docs/captures/e2/parada-1] [--videos ../THE-ABYSS-capturas/e2/parada-1] [--minutes 20]
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5173' },
    out: { type: 'string', default: 'docs/captures/e2/parada-1' },
    videos: { type: 'string', default: '../THE-ABYSS-capturas/e2/parada-1' },
    minutes: { type: 'string', default: '20' },
    quality: { type: 'string', default: 'high' },
  },
});
await mkdir(values.out, { recursive: true });
await mkdir(values.videos, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: values.videos, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
const t0 = Date.now();
const rel = () => (Date.now() - t0) / 1000;
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${values.url}/?debug=1&quality=${values.quality}`);
await page.waitForSelector('canvas');
await page.waitForFunction(() => window.__abyss?.status() === 'live');
await page.waitForTimeout(4000);
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?';
});
console.log('renderer', renderer);

// Estado do mundo, lido numa só ida ao navegador.
const snap = () =>
  page.evaluate(() => {
    const a = window.__abyss;
    const sp = a.species();
    const out = [];
    for (const o of a.organisms()) {
      const v = a.vitals(o.id);
      const p = a.position(o.id);
      if (!v || !p) continue;
      out.push({ id: o.id, sp: o.species, p, e: v.energy, j: v.juvenile, d: v.dividing, ghost: v.dyingSinceMs !== null, mat: v.maturedAtMs, parent: o.parent, born: o.born_ms });
    }
    return { orgs: out, diet: Object.fromEntries(sp.map((s) => [s.id, s.diet])) };
  });
const cam = (pos, look) => page.evaluate(([p, l]) => window.__abyss.setCamera(p, l), [pos, look]);
const shot = (name) => page.screenshot({ path: join(values.out, name) });

const log = [];
const done = new Set();
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const frame = (p, d, ang = 0.6) => [[p[0] + Math.cos(ang) * d, p[1] + d * 0.35, p[2] + Math.sin(ang) * d], p];

let task = null;
const end = Date.now() + Number(values.minutes) * 60_000;
let lastRolling = 0;

function endTask(note) {
  log.push({ moment: task.kind, start: task.start, end: rel(), note });
  done.add(task.kind);
  console.log('FEITO', task.kind, note ?? '', task.start.toFixed(1), rel().toFixed(1));
  task = null;
}

while (Date.now() < end && done.size < 4) {
  await page.waitForTimeout(250);
  const w = await snap();
  const byId = new Map(w.orgs.map((o) => [o.id, o]));
  const living = w.orgs.filter((o) => !o.ghost);

  if (!task) {
    if (!done.has('a-predacao')) {
      for (const h of living) {
        const prey = w.diet[h.sp]?.prey ?? [];
        if (!prey.length) continue;
        const near = living
          .filter((o) => prey.includes(o.sp) && o.j && dist(o.p, h.p) < 4)
          .sort((x, y) => dist(x.p, h.p) - dist(y.p, h.p));
        const pick = near[0] ?? living.find((o) => prey.includes(o.sp) && dist(o.p, h.p) < 2.5);
        if (pick) {
          task = { kind: 'a-predacao', h: h.id, prey: pick.id, start: rel() - 1, t: Date.now() };
          break;
        }
      }
    }
    if (!task && !done.has('b-morte')) {
      const low = living.filter((o) => o.e < 0.06 && !o.j && !o.d).sort((x, y) => x.e - y.e)[0];
      if (low) task = { kind: 'b-morte', id: low.id, start: rel() - 1, t: Date.now() };
    }
    if (!task && !done.has('c-divisao')) {
      const dv = living.find((o) => o.d);
      if (dv) task = { kind: 'c-divisao', id: dv.id, start: rel() - 0.5, t: Date.now(), phase: 'stretch' };
    }
    if (!task && !done.has('d-amadurece')) {
      const old = living.filter((o) => o.j).sort((x, y) => x.born - y.born)[0];
      if (old) task = { kind: 'd-amadurece', id: old.id, start: rel() - 1, t: Date.now() };
    }
  }

  if (task) {
    const age = (Date.now() - task.t) / 1000;
    if (task.kind === 'a-predacao') {
      const h = byId.get(task.h);
      const p = byId.get(task.prey);
      if (!p || p.ghost) {
        if (h && !p) {
          await shot('a-predacao.png');
          endTask('presa sumiu junto ao predador');
        } else task = null;
        continue;
      }
      if (!h || dist(h.p, p.p) > 9 || age > 25) {
        task = null;
        continue;
      }
      const mid = [(h.p[0] + p.p[0]) / 2, (h.p[1] + p.p[1]) / 2, (h.p[2] + p.p[2]) / 2];
      const [cp, lk] = frame(mid, 3.2 + dist(h.p, p.p) * 0.5);
      await cam(cp, lk);
      if (Date.now() - lastRolling > 500) {
        lastRolling = Date.now();
        await shot('a-predacao-pre.png');
      }
    } else if (task.kind === 'b-morte') {
      const o = byId.get(task.id);
      if (!o) {
        task = null;
        continue;
      }
      const [cp, lk] = frame(o.p, 3);
      await cam(cp, lk);
      if (o.ghost) {
        await shot('b-morte-0.png');
        await page.waitForTimeout(400);
        await shot('b-morte-1.png');
        await page.waitForTimeout(400);
        await shot('b-morte-2.png');
        await page.waitForTimeout(900);
        endTask('fantasma ' + o.sp + ' e=' + o.e.toFixed(3));
      } else if (age > 150 || o.e > 0.25) task = null;
    } else if (task.kind === 'c-divisao') {
      const o = byId.get(task.id);
      if (!o) {
        task = null;
        continue;
      }
      const [cp, lk] = frame(o.p, 3);
      await cam(cp, lk);
      if (task.phase === 'stretch') {
        if (age > 1 && !task.s1) { task.s1 = 1; await shot('c-divisao-0.png'); }
        if (age > 5 && !task.s2) { task.s2 = 1; await shot('c-divisao-1.png'); }
      }
      if (!o.d) {
        task.phase = 'split';
        task.t2 = task.t2 ?? Date.now();
        if (!task.s3) { task.s3 = 1; await shot('c-divisao-2.png'); }
        if (Date.now() - task.t2 > 2500) {
          await shot('c-divisao-3.png');
          const kid = living.find((x) => x.parent === o.id && x.j);
          endTask(kid ? 'filho jovem ' + kid.id : 'sem filho visível');
        }
      } else if (age > 20) task = null;
    } else if (task.kind === 'd-amadurece') {
      const o = byId.get(task.id);
      if (!o) {
        task = null;
        continue;
      }
      const [cp, lk] = frame(o.p, 2.6);
      await cam(cp, lk);
      if (!task.shot0) { task.shot0 = 1; await shot('d-amadurece-0.png'); }
      if (!o.j && !task.matT) { task.matT = Date.now(); await shot('d-amadurece-1.png'); }
      if (task.matT && Date.now() - task.matT > 2000 && !task.m2) { task.m2 = 1; await shot('d-amadurece-2.png'); }
      if (task.matT && Date.now() - task.matT > 4500) {
        await shot('d-amadurece-3.png');
        endTask('adulto');
      } else if (age > 240 && !task.matT) task = null;
    }
  }
}
if (task) log.push({ moment: task.kind + ' (incompleto)', start: task.start, end: rel() });
await writeFile(join(values.videos, 'eventos.json'), JSON.stringify({ renderer, log, total: rel() }, null, 2));
const video = page.video();
await page.close();
await ctx.close();
await rename(await video.path(), join(values.videos, 'sessao-completa.webm')).catch(() => {});
await browser.close();
console.log(JSON.stringify(log, null, 1));
