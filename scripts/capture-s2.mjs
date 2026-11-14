// Capturas da Parada 1 do S2 (Evolução): ramos de olhar, árvore da espécie e índice com ramos.
//
// Uso: node scripts/capture-s2.mjs [--url http://localhost:4173] [--api http://localhost:4000]
//        [--out docs/captures/s2/parada-1] [--gpu arc|rtx|both]
// Pré-requisito: API com `ABYSS_TEST_SPECIES=false`, espécies semeadas e ao menos 1 ramo vivo
// (ver `/api/stats`, `branches_total`). GPU como no scripts/perf/measure.mjs: `arc` = GPU padrão +
// `?quality=low`; `rtx` = `--force_high_performance_gpu` + `?quality=high`.
// Por GPU produz: mae-<gpu>.png e ramo-<gpu>.png (de perto, nadando), mae-ramo-<gpu>.png (lado a lado),
// arvore-<gpu>.png (painel aberto), indice-<gpu>.png (índice com ramos aninhados), mundo-<gpu>.png.
// Escreve também captura-<gpu>.json com ids, renderizador e a árvore vista.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173' },
    api: { type: 'string', default: 'http://localhost:4000' },
    out: { type: 'string', default: 'docs/captures/s2/parada-1' },
    gpu: { type: 'string', default: 'both' },
  },
});
await mkdir(values.out, { recursive: true });

const BASE_ARGS = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const GPU = {
  arc: { args: BASE_ARGS, quality: 'low' },
  rtx: { args: [...BASE_ARGS, '--force_high_performance_gpu'], quality: 'high' },
};

async function renderer(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconhecido';
  });
}

async function run(g) {
  const { args, quality } = GPU[g];
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${values.url}/?debug=1&quality=${quality}`);
  await page.waitForFunction(() => window.__abyss?.status() === 'live', null, { timeout: 90_000 });
  await page.waitForTimeout(4000);
  const gpuName = await renderer(page);
  console.log('gpu', g, 'renderer', gpuName);

  const snap = () =>
    page.evaluate(() => {
      const a = window.__abyss;
      const orgs = [];
      for (const o of a.organisms()) {
        const v = a.vitals(o.id);
        const p = a.position(o.id);
        if (!v || !p || v.dyingSinceMs !== null) continue;
        orgs.push({ id: o.id, sp: o.species, p });
      }
      const sp = a.species().map((s) => ({ id: s.id, name: s.name, r: s.body_radius, parent: s.parent, root: s.root, ext: s.extinct_ms }));
      return { orgs, sp, extinct: a.extinct() };
    });
  const cam = (pos, look) => page.evaluate(([p, l]) => window.__abyss.setCamera(p, l), [pos, look]);
  const frame = (p, d, ang) => [[p[0] + Math.cos(ang) * d, p[1] + d * 0.3, p[2] + Math.sin(ang) * d], p];
  // Segue um organismo de lado (como no capture-s1): rumo pelas posições sucessivas, suavizado.
  const track = async (id, d, ms) => {
    const t = Date.now();
    let prev = null;
    let head = null;
    while (Date.now() - t < ms) {
      const p = await page.evaluate((x) => window.__abyss.position(x), id);
      if (!p) return false;
      if (prev) {
        const v = [p[0] - prev[0], p[2] - prev[2]];
        const n = Math.hypot(v[0], v[1]);
        if (n > 1e-4) {
          const u = [v[0] / n, v[1] / n];
          head = head ? [head[0] * 0.8 + u[0] * 0.2, head[1] * 0.8 + u[1] * 0.2] : u;
        }
      }
      prev = p;
      const a = head ? Math.atan2(head[1], head[0]) + Math.PI / 2 : 0.7;
      await cam(...frame(p, d, a));
      await page.waitForTimeout(80);
    }
    return true;
  };

  const w = await snap();
  const byId = new Map(w.sp.map((s) => [s.id, s]));
  const alive = (spId) => w.orgs.find((o) => o.sp === spId);
  const depth = (s) => {
    let n = 0;
    for (let c = s; c.parent && byId.has(c.parent) && n < 20; c = byId.get(c.parent)) n++;
    return n;
  };
  // Ramo vivo mais fundo cuja mãe também tenha organismo vivo; senão, só o ramo.
  const branches = w.sp.filter((s) => s.parent && !w.extinct[s.id] && alive(s.id));
  branches.sort((a, b) => depth(b) - depth(a));
  const br = branches.find((s) => alive(s.parent)) ?? branches[0];
  if (!br) throw new Error('nenhum ramo vivo');
  const mother = byId.get(br.parent);
  const log = { gpu: g, renderer: gpuName, branch: br.id, mother: mother?.id ?? null, depth: depth(br), root: br.root };
  console.log('ramo', br.id, 'mãe', mother?.id, 'profundidade', depth(br));

  const shoot = async (sp, file) => {
    const org = alive(sp.id);
    if (!org) return false;
    await page.evaluate((id) => window.__abyss.select(id), org.id);
    const d = 1.1 + sp.r * 1.6;
    if (!(await track(org.id, d, 3500))) return false;
    await page.screenshot({ path: join(values.out, file) });
    log[file] = org.id;
    console.log(file, org.id);
    return true;
  };
  const gotM = mother ? await shoot(mother, `mae-${g}.png`) : false;
  const gotB = await shoot(br, `ramo-${g}.png`);

  // Lado a lado: os dois recortes centrais numa folha.
  if (gotM && gotB) {
    const { readFile } = await import('node:fs/promises');
    const [a, b] = await Promise.all([readFile(join(values.out, `mae-${g}.png`)), readFile(join(values.out, `ramo-${g}.png`))]);
    const sheet = await browser.newPage({ viewport: { width: 1280, height: 400 } });
    await sheet.setContent(`<!doctype html><body style="margin:0;background:#02080c;color:#dcebe8;font:13px ui-monospace,Consolas,monospace">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px">
      <figure style="margin:0"><img src="data:image/png;base64,${a.toString('base64')}" style="width:100%;display:block"><figcaption>mãe · ${mother.name} (${mother.id})</figcaption></figure>
      <figure style="margin:0"><img src="data:image/png;base64,${b.toString('base64')}" style="width:100%;display:block"><figcaption>ramo · ${br.name} (${br.id})</figcaption></figure>
      </div></body>`);
    await sheet.setViewportSize({ width: 1280, height: 400 });
    await sheet.waitForTimeout(500);
    await sheet.screenshot({ path: join(values.out, `mae-ramo-${g}.png`), fullPage: true });
    await sheet.close();
  }

  // Árvore: seleciona o ramo, abre o botão da árvore e dá uma volta de câmera para o ramo ficar visível.
  const org = alive(br.id);
  await page.evaluate((id) => window.__abyss.select(id), org.id);
  await track(org.id, 1.1 + br.r * 1.6, 1500);
  await page.getByRole('button', { name: 'Árvore da espécie' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(values.out, `arvore-${g}.png`) });
  log.arvore = await page.getByRole('dialog', { name: 'Árvore da espécie' }).innerText();
  console.log('arvore\n' + log.arvore);
  // Árvore com mais ramos: a raiz da maior árvore (se diferente), para o caso de neto/extinto.
  await page.getByRole('button', { name: 'Árvore da espécie' }).click();

  // Índice com ramos: abre "NO TERRÁRIO" e afasta a câmera para ver o mundo.
  await page.evaluate(() => window.__abyss.select(null)).catch(() => {});
  const idx = page.getByRole('navigation', { name: 'Índice do terrário' });
  const toggle = idx.getByRole('button').first();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(values.out, `indice-${g}.png`) });
  log.indice = await idx.innerText();
  await writeFile(join(values.out, `captura-${g}.json`), JSON.stringify(log, null, 2));
  await browser.close();
}

for (const g of values.gpu === 'both' ? ['arc', 'rtx'] : [values.gpu]) await run(g);
