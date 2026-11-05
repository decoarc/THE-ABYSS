// Carga do servidor: N clientes Phoenix (sem renderizar) no canal world:main, mais abas reais opcionais.
// Uso: node scripts/load/observers.mjs --clients 50 --seconds 1800 [--url ws://localhost:4000/socket]
//      [--max-jitter-ms 20] [--expect-observers 52] [--out captures/load]
//      [--tabs 2 --web-url http://localhost:4174/] [--warmup 600]
// --warmup S espera o mundo ter S segundos de vida (comida no teto) antes de abrir os clientes.
// Sai com código 1 se algum critério reprovar.
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

// O phoenix está em apps/web (pnpm não o expõe na raiz).
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { Socket, Serializer } = require('phoenix');

const exec = promisify(execFile);
const COMPOSE = fileURLToPath(new URL('../../infra/compose/compose.yaml', import.meta.url));
const TICK_MS = 100;
const STATS_EVERY_MS = 10_000;
const FIRST_MINUTES_MS = 10 * 60_000;

const { values: args } = parseArgs({
  options: {
    clients: { type: 'string', default: '50' },
    seconds: { type: 'string', default: '1800' },
    url: { type: 'string', default: 'ws://localhost:4000/socket' },
    'max-jitter-ms': { type: 'string', default: '20' },
    'expect-observers': { type: 'string' },
    out: { type: 'string', default: 'captures/load' },
    tabs: { type: 'string', default: '0' },
    'web-url': { type: 'string', default: 'http://localhost:4174/' },
    warmup: { type: 'string', default: '0' },
  },
});

const clientCount = Number(args.clients);
const durationMs = Number(args.seconds) * 1000;
const maxJitterMs = Number(args['max-jitter-ms']);
const tabCount = Number(args.tabs);
const warmupMs = Number(args.warmup) * 1000;
const expectObservers = args['expect-observers'] ? Number(args['expect-observers']) : clientCount + tabCount;
const httpBase = args.url.replace(/^ws/, 'http').replace(/\/socket$/, '');

let started = Date.now();
let closing = false;
let drops = 0;
let joinErrors = 0;
const clients = [];
/** Tamanho dos ticks no fio (JSON do canal, em bytes). */
const tickBytes = { total: 0, count: 0 };

/** Um cliente: conta ticks, lacunas na sequência e o intervalo entre chegadas. */
function openClient() {
  const socket = new Socket(args.url, {
    decode: (raw, callback) =>
      Serializer.decode(raw, (msg) => {
        if (msg.event === 'tick' && typeof raw === 'string') {
          tickBytes.total += Buffer.byteLength(raw);
          tickBytes.count++;
        }
        callback(msg);
      }),
  });
  const c = { last: -1, lost: 0, received: 0, intervals: [], lastAt: 0 };
  socket.onClose(() => {
    if (!closing) drops++;
  });
  socket.connect();
  const ch = socket.channel('world:main');
  ch.on('tick', (msg) => {
    if (msg.tick <= c.last) return;
    if (c.last >= 0 && msg.tick > c.last + 1) c.lost += msg.tick - c.last - 1;
    c.last = msg.tick;
    c.received++;
    const now = performance.now();
    if (c.lastAt > 0) c.intervals.push(now - c.lastAt);
    c.lastAt = now;
  });
  ch.join().receive('error', () => joinErrors++);
  clients.push({ socket, c });
}

async function statsSample() {
  const stats = await (await fetch(`${httpBase}/api/stats`)).json();
  let cpu = null;
  let mem = null;
  try {
    const id = (await exec('docker', ['compose', '-f', COMPOSE, 'ps', '-q', 'api'])).stdout.trim();
    const { stdout } = await exec('docker', ['stats', '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}', id]);
    const [c, usage] = stdout.trim().split('|');
    cpu = Number.parseFloat(c);
    // "123.4MiB / 4GiB": só o uso interessa, e ele pode vir em MiB ou GiB.
    const used = usage.split('/')[0].trim();
    mem = Number.parseFloat(used);
    if (/GiB/.test(used)) mem *= 1024;
  } catch {
    // docker indisponível: a amostra segue sem CPU/memória
  }
  return { t: Date.now() - started, stats, cpu, memMiB: mem };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const r1 = (v) => (v === null || v === undefined ? 'n/a' : Math.round(v * 100) / 100);

console.log(`carga: ${clientCount} clientes + ${tabCount} abas, ${args.seconds} s, ${args.url}, observers esperados ${expectObservers}`);

// Aquecimento: o mundo roda sozinho até a comida chegar ao teto.
let warmupStats = null;
for (;;) {
  const s = await (await fetch(`${httpBase}/api/stats`)).json();
  warmupStats = s;
  if (s.uptime_ms >= warmupMs) break;
  console.log(`aquecendo: ${Math.round(s.uptime_ms / 1000)} / ${warmupMs / 1000} s · partículas ${s.particles} · flora ${s.flora_level_sum}`);
  await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, warmupMs - s.uptime_ms + 500)));
}
started = Date.now();

// Abas reais (renderizando), como um visitante.
let browser = null;
if (tabCount > 0) {
  const { chromium } = require('playwright');
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  for (let i = 0; i < tabCount; i++) await (await context.newPage()).goto(args['web-url'], { waitUntil: 'load' });
}
for (let i = 0; i < clientCount; i++) openClient();
const firstSample = await statsSample();

const samples = [];
const sampleTimer = setInterval(async () => {
  try {
    samples.push(await statsSample());
  } catch (err) {
    console.log(`amostra falhou: ${err.message}`);
  }
}, STATS_EVERY_MS);

await new Promise((resolve) => setTimeout(resolve, durationMs));
clearInterval(sampleTimer);
closing = true;
const finalSample = await statsSample().catch(() => null);
if (finalSample) samples.push(finalSample);
for (const { socket } of clients) socket.disconnect();
if (browser) await browser.close();

// Agregados
const allIntervals = clients.flatMap(({ c }) => c.intervals).sort((a, b) => a - b);
const lostTicks = clients.reduce((s, { c }) => s + c.lost, 0);
const receivedTicks = clients.reduce((s, { c }) => s + c.received, 0);
const jitterSamples = samples.map((s) => s.stats.jitter_ms_p99).filter((v) => typeof v === 'number');
const jitterMax = jitterSamples.length ? Math.max(...jitterSamples) : null;
const lastObservers = finalSample?.stats?.observers ?? null;

// Memória: última amostra contra a mediana dos primeiros 10 min (só se a rodada durou ao menos 10 min).
const memFirst = samples.filter((s) => s.t <= FIRST_MINUTES_MS && s.memMiB !== null).map((s) => s.memMiB).sort((a, b) => a - b);
const memLast = [...samples].reverse().find((s) => s.memMiB !== null)?.memMiB ?? null;
const memMedian = percentile(memFirst, 50);
const memRun = durationMs >= FIRST_MINUTES_MS && memMedian !== null && memLast !== null;

const criteria = [
  { name: `jitter_ms_p99 máximo ≤ ${maxJitterMs} ms`, value: jitterMax, pass: jitterMax !== null && jitterMax <= maxJitterMs },
  {
    name: 'memória sem tendência de alta (última ≤ 1,10 × mediana dos 10 primeiros min)',
    value: memRun ? `${r1(memLast)} vs ${r1(memMedian)} MiB` : 'n/a (rodada curta)',
    pass: memRun ? memLast <= 1.1 * memMedian : true,
  },
  { name: 'zero quedas de conexão', value: drops, pass: drops === 0 && joinErrors === 0 },
  { name: `observers = ${expectObservers}`, value: lastObservers, pass: lastObservers === expectObservers },
];
// step_us_max é o máximo desde o boot do mundo: inclui a entrada dos clientes e não mede o regime.
// Só informativo; não é critério e não muda o código de saída.
const stepMs = (s) => (typeof s?.stats?.step_us_max === 'number' ? s.stats.step_us_max / 1000 : null);
const stepWarmupMs = typeof warmupStats?.step_us_max === 'number' ? warmupStats.step_us_max / 1000 : null;
const stepFirstMs = stepMs(firstSample);
const stepEndMs = stepMs(finalSample);
const ok = criteria.every((c) => c.pass);
const food = (s) =>
  s?.stats ? `partículas ${s.stats.particles} · flora ${s.stats.flora_level_sum} / ${s.stats.flora_patches}` : 'n/a';
const foodSamples = samples.filter((s) => typeof s.stats?.particles === 'number');
const range = (key) => {
  const v = foodSamples.map((s) => s.stats[key]);
  return v.length ? `${Math.min(...v)}–${Math.max(...v)}` : 'n/a';
};

const summary = [
  `# Carga do servidor — ${new Date(started).toISOString()}`,
  '',
  `- Clientes: ${clientCount} · abas reais: ${tabCount} · duração: ${args.seconds} s (depois de ${args.warmup} s de aquecimento) · população: ${finalSample?.stats?.population ?? 'n/a'}`,
  `- Comida no início: ${food(firstSample)} · no fim: ${food(finalSample)}`,
  `- Comida ao longo da medição: partículas ${range('particles')} · soma da flora ${range('flora_level_sum')}`,
  `- Comido na medição: flora ${(finalSample?.stats?.eaten_flora_total ?? 0) - (firstSample?.stats?.eaten_flora_total ?? 0)} mordidas · partículas ${(finalSample?.stats?.eaten_particles_total ?? 0) - (firstSample?.stats?.eaten_particles_total ?? 0)}`,
  `- Tamanho médio de um tick no fio: ${tickBytes.count ? Math.round(tickBytes.total / tickBytes.count) : 'n/a'} bytes (${tickBytes.count} ticks medidos)`,
  `- Ticks recebidos: ${receivedTicks} · lacunas (ticks perdidos): ${lostTicks}`,
  `- Intervalo entre ticks (clientes): p50 ${r1(percentile(allIntervals, 50))} ms · p99 ${r1(percentile(allIntervals, 99))} ms · máx ${r1(allIntervals.at(-1))} ms`,
  `- Quedas de conexão: ${drops} · erros de join: ${joinErrors}`,
  `- CPU (última amostra): ${finalSample?.cpu ?? 'n/a'} % · memória: ${r1(memLast)} MiB`,
  `- step_us_max (informativo, não é critério; máximo desde o boot, inclui a entrada dos ${expectObservers} clientes): fim do aquecimento ${r1(stepWarmupMs)} ms · depois da entrada ${r1(stepFirstMs)} ms · fim da medição ${r1(stepEndMs)} ms`,
  '',
  '| Critério | Valor | Resultado |',
  '| --- | --- | --- |',
  ...criteria.map((c) => `| ${c.name} | ${c.value ?? 'n/a'} | ${c.pass ? 'PASS' : 'FAIL'} |`),
  '',
  `**Resultado: ${ok ? 'PASS' : 'FAIL'}**`,
].join('\n');

console.log(summary);
const outDir = args.out;
await mkdir(outDir, { recursive: true });
const stamp = new Date(started).toISOString().replace(/[:.]/g, '-');
await writeFile(join(outDir, `carga-${stamp}.md`), summary + '\n');
await writeFile(join(outDir, `carga-${stamp}.json`), JSON.stringify({ criteria, tickBytes, samples }, null, 2));

process.exitCode = ok ? 0 : 1;
