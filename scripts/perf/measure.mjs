// Medição de desempenho, 1920×1080. Roda cada cenário em navegador novo, sequencialmente,
// para não competir por GPU.
//
// Uso: node scripts/perf/measure.mjs <url-base> [outDir] [--suite e1|gate-i] [--only <trecho do rótulo>]
//   e1 (padrão): mapa grande do gate E1, dois cenários repetíveis em cada GPU e perfil:
//     - "percurso": `?flypath=1` leva a câmera livre pelas três regiões (duas voltas; mede cada volta);
//     - "floresta": câmera parada no pior quadro da Floresta (5 s de aquecimento, 10 s medidos).
//     Pré-requisitos: API com semente fixa (`ABYSS_SEED`) no ar há ≥ 10 min (comida no teto) e o preview em <url-base>.
//     Grava <outDir>/perf.json (padrão docs/captures/e1) e sai com 1 se o orçamento reprovar.
//   e2: o mesmo percurso e a mesma Floresta com o mundo no teto (ABYSS_POPULATION=250), mais a contagem de
//     programas de shader (`renderer.info.programs`) antes e depois de 2 min de nascimentos. Grava <outDir>/perf.json
//     (padrão docs/captures/e2/parada-2).
//   gate-i: os cenários parados do gate I (`?perf=1`), em <outDir>/perf-60-organismos.json.
//
// Além de p50/p95, cada janela conta quadros > 33 ms e > 50 ms, tarefas longas e quantos
// programas WebGL foram ligados (cada link é um shader compilado: os travamentos da Parada 1).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { suite: { type: 'string', default: 'e1' }, only: { type: 'string', default: '' } },
});
const base = positionals[0] ?? 'http://localhost:4174/';
const BASE_ARGS = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const HP_ARGS = [...BASE_ARGS, '--force_high_performance_gpu'];
const NO_VSYNC = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

// --- gate I: cenários parados com ?perf=1 ---------------------------------------

async function gateI(outDir) {
  const scenarios = [
    { label: 'GPU padrão · high', quality: 'high', args: BASE_ARGS },
    { label: 'GPU padrão · low', quality: 'low', args: BASE_ARGS },
    { label: 'GPU alto desempenho · high', quality: 'high', args: HP_ARGS },
    { label: 'GPU alto desempenho · low', quality: 'low', args: HP_ARGS },
    // Sem vsync: a taxa de quadros deixa de ser limitada pelo monitor, e o número mostra o trabalho da GPU.
    { label: 'GPU padrão · high · sem vsync', quality: 'high', args: [...BASE_ARGS, ...NO_VSYNC] },
    { label: 'GPU alto desempenho · high · sem vsync', quality: 'high', args: [...HP_ARGS, ...NO_VSYNC] },
  ];
  await mkdir(outDir, { recursive: true });
  const results = [];
  for (const s of scenarios) {
    const browser = await chromium.launch({ args: s.args });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto(`${base}?perf=1&quality=${s.quality}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__abyssPerf !== undefined, null, { timeout: 90_000 });
    const report = await page.evaluate(() => window.__abyssPerf);
    results.push({ scenario: s.label, ...report });
    console.log(`${s.label}: ${JSON.stringify(report)}`);
    await browser.close();
  }
  await writeFile(join(outDir, 'perf-60-organismos.json'), JSON.stringify(results, null, 2));
  console.log('gravado em', join(outDir, 'perf-60-organismos.json'));
}

// --- gate E1: percurso fixo e pior caso da Floresta --------------------------------

/** Pior quadro da Floresta medido na Task 11: baixo, olhando através das esponjas. */
const FLORESTA_POSE = [[-46, 2, -16], [-61.3, 1.5, -28.9]];
const FLORESTA_WARMUP_MS = 5000;
const FLORESTA_SAMPLE_MS = 10_000;
const LAPS = 2;

/** Gravador instalado antes da página: quadros por rAF, tarefas longas e links de programas WebGL. */
function installRecorder() {
  const frames = [];
  let last = 0;
  const loop = (t) => {
    if (last) frames.push([t, t - last]);
    last = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const longtasks = [];
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => longtasks.push([e.startTime, e.duration]))).observe({
      type: 'longtask',
      buffered: true,
    });
  } catch {
    // sem suporte a longtask: a lista fica vazia
  }
  // Cada link é um programa compilado. A assinatura diz qual material: o tipo do three
  // (SHADER_TYPE), o nome (se houver), os uniforms próprios do projeto (uTime, uFoodPos…),
  // as luzes pontuais e se é instanciado.
  const links = [];
  const define = (src, key) => (src.match(new RegExp(`#define ${key}[ \\t]*([^\\n]*)`)) ?? [])[1]?.trim() ?? '';
  const signature = (src) => {
    const type = define(src, 'SHADER_TYPE') || 'sem-tipo';
    const name = define(src, 'SHADER_NAME');
    const own = [...new Set([...src.matchAll(/uniform\s+\w+\s+(u[A-Z]\w*)/g)].map((m) => m[1]))].slice(0, 5);
    // O three troca NUM_POINT_LIGHTS pelo número no texto: `pointLights[ 4 ]`.
    const lights = (src.match(/pointLights\[\s*(\d+)\s*\]/) ?? [])[1] ?? '0';
    const inst = src.includes('#define USE_INSTANCING') ? ' inst' : '';
    return `${type}${name ? `/${name}` : ''}${own.length ? ` [${own.join(',')}]` : ''} pl${lights}${inst}`;
  };
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
    const orig = C.prototype.linkProgram;
    C.prototype.linkProgram = function (p) {
      const src = this.getAttachedShaders(p).map((s) => this.getShaderSource(s)).join('\n');
      links.push([performance.now(), signature(src)]);
      return orig.call(this, p);
    };
  }
  window.__perfRec = { frames, longtasks, links };
}

function rendererName() {
  const gl = document.querySelector('canvas')?.getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconhecido';
}

const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

function quantile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** Resumo de uma janela [from, to) do relógio da página. */
function summarize(rec, from, to) {
  const dts = rec.frames.filter(([t]) => t >= from && t < to).map(([, d]) => d);
  const sorted = [...dts].sort((a, b) => a - b);
  const longtasks = rec.longtasks.filter(([t]) => t >= from && t < to);
  const links = rec.links.filter(([t]) => t >= from && t < to);
  return {
    seconds: r1((to - from) / 1000),
    frames: dts.length,
    p50: r1(quantile(sorted, 50)),
    p95: r1(quantile(sorted, 95)),
    p99: r1(quantile(sorted, 99)),
    max: r1(sorted.at(-1)),
    over33: dts.filter((d) => d > 33).length,
    over50: dts.filter((d) => d > 50).length,
    longTasks: longtasks.length,
    longTaskMaxMs: r1(Math.max(0, ...longtasks.map(([, d]) => d))),
    programLinks: links.length,
    // Cada link com o instante (s desde o início da janela) e a duração do quadro em que caiu.
    links: links.map(([t, shader]) => {
      const frame = rec.frames.find(([ft, d]) => ft >= t && ft - d <= t);
      return { atS: r1((t - from) / 1000), shader, frameMs: r1(frame?.[1]) };
    }),
    // Os quadros > 50 ms e o instante em que terminaram (s desde o início da janela).
    slowFrames: rec.frames
      .filter(([t, d]) => t >= from && t < to && d > 50)
      .map(([t, d]) => ({ atS: r1((t - from) / 1000), ms: r1(d) })),
  };
}

async function apiStats() {
  try {
    const s = await (await fetch('http://localhost:4000/api/stats')).json();
    const keep = ['world_id', 'uptime_ms', 'population', 'births_total', 'deaths_total', 'flora_patches', 'flora_level_sum', 'particles', 'step_us_max'];
    return Object.fromEntries(keep.map((k) => [k, s[k]]));
  } catch {
    return null;
  }
}

async function openLive(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(installRecorder);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__abyss?.status() === 'live', null, { timeout: 90_000 });
  return page;
}

async function runPath(browser, quality) {
  const page = await openLive(browser, `${base}?debug=1&flypath=1&quality=${quality}`);
  await page.waitForFunction(() => window.__abyss.camera().pathS !== null, null, { timeout: 60_000 });
  const lapS = await page.evaluate(() => window.__abyss.camera().lapS);
  // Início do percurso no relógio da página.
  const start = await page.evaluate(() => performance.now() - window.__abyss.camera().pathS * 1000);
  const food = await page.evaluate(() => window.__abyss.foodCounts());
  const programsStart = await page.evaluate(() => window.__abyss.programs());
  await page.waitForFunction((end) => window.__abyss.camera().pathS >= end, LAPS * lapS + 0.2, {
    timeout: (LAPS * lapS + 60) * 1000,
    polling: 500,
  });
  const rec = await page.evaluate(() => window.__perfRec);
  const laps = Array.from({ length: LAPS }, (_, i) =>
    summarize(rec, start + i * lapS * 1000, start + (i + 1) * lapS * 1000),
  );
  return {
    renderer: await page.evaluate(rendererName),
    lapS: r1(lapS),
    food,
    programs: { start: programsStart, end: await page.evaluate(() => window.__abyss.programs()) },
    programLinksBeforePath: rec.links.filter(([t]) => t < start).length,
    laps,
  };
}

async function runFloresta(browser, quality) {
  const page = await openLive(browser, `${base}?debug=1&quality=${quality}`);
  // Algumas vezes, para vencer a introdução que ainda possa estar rodando.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(([p, l]) => window.__abyss.setCamera(p, l), FLORESTA_POSE);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(FLORESTA_WARMUP_MS);
  const from = await page.evaluate(() => performance.now());
  const programsStart = await page.evaluate(() => window.__abyss.programs());
  await page.waitForTimeout(FLORESTA_SAMPLE_MS);
  const to = await page.evaluate(() => performance.now());
  const rec = await page.evaluate(() => window.__perfRec);
  return {
    renderer: await page.evaluate(rendererName),
    pose: FLORESTA_POSE,
    food: await page.evaluate(() => window.__abyss.foodCounts()),
    programs: { start: programsStart, end: await page.evaluate(() => window.__abyss.programs()) },
    window: summarize(rec, from, to),
  };
}

/** Programas de shader antes e depois de 2 min com nascimentos acontecendo (não pode crescer). */
async function programsOverBirths(gpuArgs) {
  const browser = await chromium.launch({ args: gpuArgs });
  try {
    const page = await openLive(browser, `${base}?debug=1&flypath=1&quality=high`);
    // Dá uma volta inteira do percurso para a cena ver todos os materiais, depois mede.
    const lapS = await page.evaluate(() => window.__abyss.camera().lapS);
    await page.waitForFunction((end) => window.__abyss.camera().pathS >= end, lapS + 0.5, { timeout: (lapS + 60) * 1000, polling: 500 });
    const before = { programs: await page.evaluate(() => window.__abyss.programs()), api: await apiStats() };
    await page.waitForTimeout(120_000);
    const after = { programs: await page.evaluate(() => window.__abyss.programs()), api: await apiStats() };
    const stats = await (await fetch('http://localhost:4000/api/stats')).json();
    const births = (after.api?.births_total ?? stats.births_total) - (before.api?.births_total ?? 0);
    return { renderer: await page.evaluate(rendererName), before, after, birthsDuring: births, birthsTotal: stats.births_total, deathsTotal: stats.deaths_total };
  } finally {
    await browser.close();
  }
}

async function e1(outDir) {
  const gpus = [
    { gpu: 'GPU padrão (Intel Arc)', key: 'arc', args: BASE_ARGS },
    { gpu: 'GPU alto desempenho (RTX)', key: 'rtx', args: HP_ARGS },
  ];
  const runs = [];
  for (const scenario of ['percurso', 'floresta']) {
    for (const g of gpus) {
      const variants = [
        { quality: 'low', vsync: true },
        { quality: 'high', vsync: true },
        // Sem vsync: o trabalho real da GPU, no perfil do orçamento de cada uma.
        { quality: g.key === 'arc' ? 'low' : 'high', vsync: false },
      ];
      for (const v of variants) {
        const label = `${scenario} · ${g.gpu} · ${v.quality}${v.vsync ? '' : ' · sem vsync'}`;
        if (opts.only && !label.includes(opts.only)) continue;
        const browser = await chromium.launch({ args: v.vsync ? g.args : [...g.args, ...NO_VSYNC] });
        try {
          const stats = await apiStats();
          const result = scenario === 'percurso' ? await runPath(browser, v.quality) : await runFloresta(browser, v.quality);
          runs.push({ label, scenario, gpu: g.key, quality: v.quality, vsync: v.vsync, api: stats, ...result, apiEnd: await apiStats() });
          const w = result.laps ?? [result.window];
          console.log(
            `${label}: ` +
              w
                .map((x) => `p50 ${x.p50} p95 ${x.p95} max ${x.max} >33 ${x.over33} >50 ${x.over50} longas ${x.longTasks} links ${x.programLinks}`)
                .join(' | '),
          );
          for (const [i, x] of w.entries()) {
            const where = result.laps ? `volta ${i + 1}` : 'janela';
            for (const l of x.links) console.log(`  ${where} +${l.atS} s: ${l.shader} (quadro de ${l.frameMs} ms)`);
          }
        } finally {
          await browser.close();
        }
      }
    }
  }

  // Janelas medidas depois do aquecimento: as voltas a partir da 2ª (a 1ª vê cada material pela
  // primeira vez e compila; fica registrada à parte, em laps[0]) e a Floresta depois dos seus 5 s.
  const measured = (r) => (r.laps ? r.laps.slice(1) : [r.window]);
  // Orçamento do protótipo 2, com vsync (como o visitante vê).
  const windows = (gpu, quality) =>
    runs.filter((r) => r.gpu === gpu && r.quality === quality && r.vsync).flatMap(measured);
  const flight = runs.filter((r) => r.vsync).flatMap(measured);
  const arcLow = windows('arc', 'low');
  const rtxHigh = windows('rtx', 'high');
  const budget = [
    { name: 'Arc low: p95 ≤ 33 ms', value: Math.max(...arcLow.map((w) => w.p95)), pass: arcLow.every((w) => w.p95 <= 33) },
    { name: 'RTX high: p50 ≤ 16,7 ms', value: Math.max(...rtxHigh.map((w) => w.p50)), pass: rtxHigh.every((w) => w.p50 <= 16.7) },
  ];
  const targets = [
    { name: 'depois do aquecimento: 0 programas ligados', value: flight.reduce((s, w) => s + w.programLinks, 0), pass: flight.every((w) => w.programLinks === 0) },
    { name: 'depois do aquecimento: 0 quadros > 50 ms', value: flight.reduce((s, w) => s + w.over50, 0), pass: flight.every((w) => w.over50 === 0) },
  ];
  for (const c of [...budget, ...targets]) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name} (${c.value})`);

  await mkdir(outDir, { recursive: true });
  const out = join(outDir, 'perf.json');
  const programsRun = opts.suite === 'e2' && !opts.only ? await programsOverBirths(HP_ARGS) : null;
  if (programsRun) {
    const grew = programsRun.after.programs > programsRun.before.programs;
    targets.push({ name: 'programas de shader não crescem em 2 min de nascimentos', value: `${programsRun.before.programs} -> ${programsRun.after.programs} (nascimentos ${programsRun.birthsDuring})`, pass: !grew });
    console.log(`${grew ? 'FAIL' : 'PASS'} programas ${programsRun.before.programs} -> ${programsRun.after.programs}, nascimentos ${programsRun.birthsDuring}`);
  }
  const meta = { date: new Date().toISOString(), base, seed: process.env.ABYSS_SEED ?? null, viewport: '1920×1080' };
  await writeFile(out, JSON.stringify({ meta, budget, targets, programsRun, runs }, null, 2));
  console.log('gravado em', out);
  process.exitCode = budget.every((c) => c.pass) ? 0 : 1;
}

// Depois das constantes acima (o await no topo roda antes das declarações que vêm depois dele).
if (opts.suite === 'gate-i') await gateI(positionals[1] ?? 'captures/perf');
else await e1(positionals[1] ?? (opts.suite === 'e2' ? 'docs/captures/e2/parada-2' : 'docs/captures/e1'));
