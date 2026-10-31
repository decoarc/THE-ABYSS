// Medição de desempenho do gate I com 60 organismos (?perf=1), 1920×1080.
// Uso: node captures/perf/measure.mjs <url-base> [--out captures/perf]
// Roda cada cenário em navegador novo, sequencialmente, para não competir por GPU.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4174/';
const outDir = process.argv[3] ?? 'captures/perf';
const BASE_ARGS = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const scenarios = [
  { label: 'GPU padrão · high', quality: 'high', args: BASE_ARGS },
  { label: 'GPU padrão · low', quality: 'low', args: BASE_ARGS },
  { label: 'GPU alto desempenho · high', quality: 'high', args: [...BASE_ARGS, '--force_high_performance_gpu'] },
  { label: 'GPU alto desempenho · low', quality: 'low', args: [...BASE_ARGS, '--force_high_performance_gpu'] },
  // Sem vsync: a taxa de quadros deixa de ser limitada pelo monitor, e o número mostra o trabalho da GPU.
  { label: 'GPU padrão · high · sem vsync', quality: 'high', args: [...BASE_ARGS, '--disable-gpu-vsync', '--disable-frame-rate-limit'] },
  { label: 'GPU alto desempenho · high · sem vsync', quality: 'high', args: [...BASE_ARGS, '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'] },
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
