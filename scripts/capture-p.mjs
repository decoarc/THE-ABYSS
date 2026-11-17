// Capturas da Parada 1 do gate P (Persistência): buscador de espécies e árvore com história.
//
// Uso: node scripts/capture-p.mjs [--url http://localhost:4173] [--out docs/captures/p/parada-1]
//        [--gpu arc|rtx] [--query <prefixo>]
// Pré-requisito: API no ar com espécies criadas, ao menos 1 ramo e 1 extinção (ver /api/stats);
// `pnpm build` e o preview servindo a web. GPU como no capture-s2: `arc` = GPU padrão + `?quality=low`;
// `rtx` = `--force_high_performance_gpu` + `?quality=high`.
// Produz: busca-resultados.png, busca-inexistente.png, busca-segue.png, arvore-historia.png,
// arvore-rolagem.png, busca-extinta-descendente.png e busca-extinta-sem.png (quando houver) e
// captura.json (renderizador, nomes buscados, texto da árvore).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173' },
    out: { type: 'string', default: 'docs/captures/p/parada-1' },
    gpu: { type: 'string', default: 'rtx' },
    query: { type: 'string', default: 'seme' },
  },
});
await mkdir(values.out, { recursive: true });

const BASE_ARGS = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const GPU = {
  arc: { args: BASE_ARGS, quality: 'low' },
  rtx: { args: [...BASE_ARGS, '--force_high_performance_gpu'], quality: 'high' },
};
const { args, quality } = GPU[values.gpu];

// Barras de rolagem visíveis (o Playwright as esconde por padrão): a árvore usa a barra do tema.
const browser = await chromium.launch({ args, ignoreDefaultArgs: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${values.url}/?debug=1&quality=${quality}`);
await page.waitForFunction(() => window.__abyss?.status() === 'live', null, { timeout: 90_000 });
await page.waitForTimeout(4000);

const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconhecido';
});
const world = await page.evaluate(() => {
  const a = window.__abyss;
  const living = new Map();
  for (const o of a.organisms()) {
    const v = a.vitals(o.id);
    if (v && v.dyingSinceMs === null) living.set(o.species, (living.get(o.species) ?? 0) + 1);
  }
  return {
    species: a.species().map((s) => ({ id: s.id, name: s.name, parent: s.parent, root: s.root, living: living.get(s.id) ?? 0 })),
    extinct: a.extinct(),
  };
});

const box = page.getByRole('search');
const input = page.getByLabel('Buscar espécie');
const search = async (q) => {
  await input.fill(q);
  await page.waitForTimeout(900);
};
const log = { renderer, gpu: values.gpu };

// 1. Resultados.
await search(values.query);
await page.screenshot({ path: join(values.out, 'busca-resultados.png') });
log.resultados = await box.innerText();

// 2. Nome inexistente.
await search('Lumna inexistente');
await page.screenshot({ path: join(values.out, 'busca-inexistente.png') });
log.inexistente = await box.innerText();

// 3. Ramo vivo: a câmera vai até a criatura e segue.
const branch = world.species.find((s) => s.parent && s.living > 0 && !world.extinct[s.id]);
const target = branch ?? world.species.find((s) => s.living > 0);
await search(target.name);
await box.getByRole('button', { name: target.name, exact: true }).first().click();
await page.waitForTimeout(3500);
await page.screenshot({ path: join(values.out, 'busca-segue.png') });
log.segue = { species: target.id, name: target.name, selection: await page.evaluate(() => window.__abyss.selection()) };

// 4. Árvore com história: a raiz de uma linhagem com extinção (se houver), senão a do ramo.
const withExtinct = world.species.find((s) => world.extinct[s.id] && s.root !== s.id) ?? world.species.find((s) => world.extinct[s.id]);
const rootId = withExtinct?.root ?? target.root;
const root = world.species.find((s) => s.id === rootId);
await search(root.name);
await box.getByRole('button', { name: new RegExp(`^${root.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click();
await page.waitForTimeout(800);
const dialog = page.getByRole('dialog', { name: 'Árvore da espécie' });
if (!(await dialog.isVisible())) await page.getByRole('button', { name: 'Árvore da espécie' }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(values.out, 'arvore-historia.png') });
log.arvore = { root: rootId, texto: await dialog.innerText() };
// Recorte da árvore rolada até o meio: a barra de rolagem do tema.
await dialog.evaluate((el) => el.scrollTo(0, (el.scrollHeight - el.clientHeight) / 2));
await page.waitForTimeout(300);
await dialog.screenshot({ path: join(values.out, 'arvore-rolagem.png') });

// 5–6. Raiz extinta: com descendente vivo (a câmera segue o descendente e a árvore abre) e sem (só a árvore).
const pickExtinctRoot = async (withLiving, file) => {
  const roots = world.species.filter((s) => s.root === s.id && world.extinct[s.id]);
  const lineageLiving = (r) => world.species.some((s) => s.root === r.id && s.living > 0);
  const r = roots.find((x) => lineageLiving(x) === withLiving);
  if (!r) return { nenhuma: true };
  const close = dialog.getByRole('button', { name: 'fechar', exact: true });
  if (await close.isVisible()) await close.click();
  await search(r.name);
  await box.getByRole('button', { name: new RegExp(`^${r.name}(\\s+extinta.*)?$`) }).first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(values.out, file) });
  const tree = (await dialog.isVisible()) ? await dialog.innerText() : null;
  return { root: r.id, name: r.name, selection: await page.evaluate(() => window.__abyss.selection()), arvore: tree };
};
log.extintaComDescendente = await pickExtinctRoot(true, 'busca-extinta-descendente.png');
log.extintaSemDescendente = await pickExtinctRoot(false, 'busca-extinta-sem.png');

await writeFile(join(values.out, 'captura.json'), JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));
await browser.close();
