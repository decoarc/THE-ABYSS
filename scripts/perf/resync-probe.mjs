// Sonda do ressincronismo forçado: quadros e links de programas em volta do remontar de todos os organismos.
// Uso: node scripts/perf/resync-probe.mjs <url-base> [--arc]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:4174/';
const args = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', ...(process.argv.includes('--arc') ? [] : ['--force_high_performance_gpu'])];
const browser = await chromium.launch({ args });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(() => {
  const frames = [];
  const links = [];
  let last = 0;
  const loop = (t) => { if (last) frames.push([t, t - last]); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  for (const C of [WebGL2RenderingContext]) {
    const o = C.prototype.linkProgram;
    C.prototype.linkProgram = function (p) {
      const src = this.getAttachedShaders(p).map((s) => this.getShaderSource(s)).join('\n');
      links.push([performance.now(), (src.match(/#define SHADER_TYPE[ \t]*(\S*)/) ?? [])[1] ?? '?', (src.match(/uniform\s+\w+\s+(u[A-Z]\w*)/) ?? [])[1] ?? '']);
      return o.call(this, p);
    };
  }
  window.__rec = { frames, links };
});
const page = await ctx.newPage();
await page.goto(`${base}?debug=1&flypath=1&quality=high`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__abyss?.status() === 'live', null, { timeout: 90000 });
const lapS = await page.evaluate(() => window.__abyss.camera().lapS);
await page.waitForFunction((e) => window.__abyss.camera().pathS >= e, lapS + 0.5, { timeout: 120000, polling: 500 });
const p0 = await page.evaluate(() => window.__abyss.programs());
const t0 = await page.evaluate(() => performance.now());
const removed = await page.evaluate(() => window.__abyss.forceResync());
await page.waitForFunction(() => window.__abyss.status() === 'live' && window.__abyss.roster().length > 200, null, { timeout: 30000, polling: 50 });
await page.waitForTimeout(20000);
const out = await page.evaluate((t0) => {
  const { frames, links } = window.__rec;
  const after = frames.filter(([t]) => t >= t0);
  const ds = after.map(([, d]) => d).sort((a, b) => a - b);
  return {
    programs: window.__abyss.programs(),
    frames: ds.length, p50: ds[Math.floor(ds.length / 2)], p95: ds[Math.floor(ds.length * 0.95)], max: ds.at(-1),
    over33: ds.filter((d) => d > 33).length, over50: ds.filter((d) => d > 50).length,
    slow: after.filter(([, d]) => d > 33).map(([t, d]) => [Math.round(t - t0), Math.round(d)]),
    links: links.filter(([t]) => t >= t0).map(([t, ty, u]) => [Math.round(t - t0), ty, u]),
  };
}, t0);
console.log(JSON.stringify({ removed, programsBefore: p0, ...out }));
await browser.close();
