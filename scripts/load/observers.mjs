// Carga do gate I: N clientes Phoenix (sem renderizar) no canal world:main.
// Uso: node scripts/load/observers.mjs --clients 50 --seconds 1800 [--url ws://localhost:4000/socket]
//      [--max-jitter-ms 20] [--expect-observers 52] [--out captures/load]
// Sai com código 1 se algum critério do design §8 reprovar.
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

// O phoenix está em apps/web (pnpm não o expõe na raiz).
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { Socket } = require('phoenix');

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
  },
});

const clientCount = Number(args.clients);
const durationMs = Number(args.seconds) * 1000;
const maxJitterMs = Number(args['max-jitter-ms']);
const expectObservers = args['expect-observers'] ? Number(args['expect-observers']) : clientCount;
const httpBase = args.url.replace(/^ws/, 'http').replace(/\/socket$/, '');

const started = Date.now();
let closing = false;
let drops = 0;
let joinErrors = 0;
const clients = [];

/** Um cliente: conta ticks, lacunas na sequência e o intervalo entre chegadas. */
function openClient() {
  const socket = new Socket(args.url, {});
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

console.log(`carga: ${clientCount} clientes, ${args.seconds} s, ${args.url}, observers esperados ${expectObservers}`);
for (let i = 0; i < clientCount; i++) openClient();

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
const ok = criteria.every((c) => c.pass);

const summary = [
  `# Carga do gate I — ${new Date(started).toISOString()}`,
  '',
  `- Clientes: ${clientCount} · duração: ${args.seconds} s · população: ${finalSample?.stats?.population ?? 'n/a'}`,
  `- Ticks recebidos: ${receivedTicks} · lacunas (ticks perdidos): ${lostTicks}`,
  `- Intervalo entre ticks (clientes): p50 ${r1(percentile(allIntervals, 50))} ms · p99 ${r1(percentile(allIntervals, 99))} ms · máx ${r1(allIntervals.at(-1))} ms`,
  `- Quedas de conexão: ${drops} · erros de join: ${joinErrors}`,
  `- CPU (última amostra): ${finalSample?.cpu ?? 'n/a'} % · memória: ${r1(memLast)} MiB`,
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
await writeFile(join(outDir, `carga-${stamp}.json`), JSON.stringify({ criteria, samples }, null, 2));

process.exitCode = ok ? 0 : 1;
