// Medição do orçamento da VPS (gate O): 3 GB de RAM e 30 GB de disco.
// Amostra a cada --every s, por --hours h: memória e CPU de cada serviço, passo do mundo e
// tamanho do banco e dos backups. Ao fim, projeta o disco em 1 ano.
// Uso (com o compose.prod.yaml de pé):
//   node scripts/vps/medir.mjs [--hours 6] [--every 300] [--api http://localhost:4000] [--out captures/vps]
// Junto com a carga (o COMPOSE_ENV_FILES dá ao compose os segredos do .env.prod):
//   ABYSS_COMPOSE=infra/compose/compose.prod.yaml COMPOSE_ENV_FILES=infra/compose/.env.prod \
//     node scripts/load/observers.mjs --clients 50 --seconds 1800 --warmup 600
// Sai com código 1 se algum limite estourar.
import { execFile } from 'node:child_process';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const exec = promisify(execFile);
const COMPOSE = fileURLToPath(new URL('../../infra/compose/compose.prod.yaml', import.meta.url));
const ENV_FILE = fileURLToPath(new URL('../../infra/compose/.env.prod', import.meta.url));
const SERVICES = ['api', 'db', 'backup', 'caddy'];
// Limites do compose.prod.yaml (MiB) e orçamento do passo (tick de 100 ms).
const MEM_LIMIT_MIB = { api: 1024, db: 768, backup: 256, caddy: 128 };
const STEP_BUDGET_US = 20_000;
const DISK_BUDGET_GB = 30;
// Fora do banco e dos backups: imagens, WAL e logs (estimativa, ver compose.prod.yaml).
const DISK_FIXED_GB = 3.5;

const { values: args } = parseArgs({
  options: {
    hours: { type: 'string', default: '6' },
    every: { type: 'string', default: '300' },
    api: { type: 'string', default: 'http://localhost:4000' },
    out: { type: 'string', default: 'captures/vps' },
  },
});
const hours = Number(args.hours);
const everyS = Number(args.every);

function compose(...rest) {
  return exec('docker', ['compose', '-f', COMPOSE, '--env-file', ENV_FILE, ...rest], { maxBuffer: 1 << 20 });
}

const UNITS = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, kB: 1e3, MB: 1e6, GB: 1e9 };
function toMiB(text) {
  const m = /([\d.]+)\s*([A-Za-z]+)/.exec(text);
  return m ? (Number(m[1]) * (UNITS[m[2]] ?? 1)) / 1024 ** 2 : NaN;
}

async function containerStats() {
  const out = {};
  for (const svc of SERVICES) {
    const id = (await compose('ps', '-q', svc)).stdout.trim();
    if (!id) {
      out[svc] = { mem: NaN, cpu: NaN };
      continue;
    }
    const { stdout } = await exec('docker', ['stats', '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}', id]);
    const [cpu, mem] = stdout.trim().split('|');
    out[svc] = { cpu: parseFloat(cpu), mem: toMiB(mem.split('/')[0]) };
  }
  return out;
}

async function sql(query) {
  const { stdout } = await compose('exec', '-T', 'db', 'psql', '-U', 'abyss', '-d', 'abyss', '-tAc', query);
  return stdout.trim();
}

async function backupsBytes() {
  const { stdout } = await compose('exec', '-T', 'backup', 'du', '-sb', '/backups');
  return Number(stdout.split(/\s/)[0]);
}

async function sample() {
  const stats = await (await fetch(`${args.api}/api/stats`)).json();
  return {
    at: new Date().toISOString(),
    containers: await containerStats(),
    stepMaxUs: stats.step_us_max,
    jitterP99: stats.jitter_ms_p99,
    population: stats.population,
    observers: stats.observers,
    dbBytes: Number(await sql("select pg_database_size('abyss')")),
    backupBytes: await backupsBytes(),
  };
}

const mib = (b) => (b / 1024 ** 2).toFixed(1);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await mkdir(args.out, { recursive: true });
const csv = join(args.out, `medicao-${stamp}.csv`);
await writeFile(
  csv,
  `at,${SERVICES.map((s) => `${s}_mib,${s}_cpu`).join(',')},step_us_max,jitter_p99_ms,population,observers,db_mib,backups_mib\n`,
);

const samples = [];
const endAt = Date.now() + hours * 3600_000;
console.log(`medindo por ${hours} h, a cada ${everyS} s -> ${csv}`);
while (true) {
  const s = await sample();
  samples.push(s);
  const row = [
    s.at,
    ...SERVICES.flatMap((svc) => [s.containers[svc].mem.toFixed(1), s.containers[svc].cpu.toFixed(1)]),
    s.stepMaxUs,
    s.jitterP99,
    s.population,
    s.observers,
    mib(s.dbBytes),
    mib(s.backupBytes),
  ];
  await appendFile(csv, row.join(',') + '\n');
  console.log(
    `${s.at}  api ${row[1]} MiB  db ${row[3]} MiB  passo máx ${s.stepMaxUs} us  pop ${s.population}  banco ${mib(s.dbBytes)} MiB`,
  );
  if (Date.now() + everyS * 1000 > endAt) break;
  await new Promise((r) => setTimeout(r, everyS * 1000));
}

// Resumo: picos de memória, pior passo e crescimento do banco projetado em 1 ano.
const first = samples[0];
const last = samples.at(-1);
const spanH = (Date.parse(last.at) - Date.parse(first.at)) / 3600_000;
const dbPerHour = spanH > 0 ? (last.dbBytes - first.dbBytes) / spanH : NaN;
const dbYearGB = (last.dbBytes + dbPerHour * 24 * 365) / 1e9;
// Os backups guardam BACKUP_KEEP (7) cópias do banco; o dump -Fc comprime, então 7× é o teto.
const diskYearGB = DISK_FIXED_GB + dbYearGB * 8;
const peak = (svc) => Math.max(...samples.map((s) => s.containers[svc].mem));
const stepMax = Math.max(...samples.map((s) => s.stepMaxUs));

const checks = [
  ...SERVICES.map((svc) => ({
    name: `memória ${svc} (pico ${peak(svc).toFixed(1)} de ${MEM_LIMIT_MIB[svc]} MiB, alvo < 80%)`,
    ok: peak(svc) < MEM_LIMIT_MIB[svc] * 0.8,
  })),
  { name: `passo máximo ${stepMax} us (orçamento ${STEP_BUDGET_US})`, ok: stepMax < STEP_BUDGET_US },
  {
    name: `disco em 1 ano ~${diskYearGB.toFixed(1)} GB (banco ${dbYearGB.toFixed(2)} GB × 8 + ${DISK_FIXED_GB} fixos; orçamento ${DISK_BUDGET_GB} GB, alvo < 70%)`,
    ok: diskYearGB < DISK_BUDGET_GB * 0.7,
  },
];

const md = [
  `# Medição da VPS — ${first.at} a ${last.at} (${spanH.toFixed(2)} h, ${samples.length} amostras)`,
  '',
  `Banco: ${mib(first.dbBytes)} → ${mib(last.dbBytes)} MiB (${(dbPerHour / 1024 ** 2).toFixed(2)} MiB/h). Backups: ${mib(last.backupBytes)} MiB.`,
  `População final ${last.population}, observadores ${last.observers}, jitter p99 ${last.jitterP99} ms.`,
  '',
  ...checks.map((c) => `- ${c.ok ? 'PASS' : 'FAIL'} ${c.name}`),
  '',
  `Amostras: \`${csv}\``,
].join('\n');
await writeFile(join(args.out, `medicao-${stamp}.md`), md + '\n');
console.log('\n' + md);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
