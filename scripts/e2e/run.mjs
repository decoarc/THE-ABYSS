// E2E de consistência e reinício do gate I.
// Pré-requisitos: `pnpm api:up` e `pnpm build` (o script sobe o preview em E2E_PORT).
// Uso: node scripts/e2e/run.mjs   (E2E_NEGATE=1 inverte a asserção de consistência, para ver falhar)
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const exec = promisify(execFile);
const PORT = process.env.E2E_PORT ?? '4175';
const BASE = `http://localhost:${PORT}/`;
const COMPOSE = 'infra/compose/compose.yaml';
const NEGATE = process.env.E2E_NEGATE === '1';
const LIVE_TIMEOUT = 30_000;

async function waitHttp(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // ainda não subiu
    }
    await delay(300);
  }
  throw new Error(`sem resposta em ${url}`);
}

const live = (page) => page.waitForFunction(() => window.__abyss?.status() === 'live', null, { timeout: LIVE_TIMEOUT });

async function openWorld(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}?debug=1`, { waitUntil: 'load' });
  await live(page);
  return page;
}

const results = [];
async function scenario(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err: String(err.message ?? err) });
    console.log(`FAIL ${name}\n  ${err.message ?? err}`);
  }
}

await waitHttp('http://localhost:4000/api/health', 10_000);

const preview = spawn('pnpm', ['--filter', '@abyss/web', 'exec', 'vite', 'preview', '--port', PORT, '--strictPort'], {
  shell: true,
  stdio: 'ignore',
});

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  await waitHttp(BASE, 60_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  await scenario('duas abas veem o mesmo mundo', async () => {
    const a = await openWorld(context);
    const b = await openWorld(context);
    const worldA = await a.evaluate(() => window.__abyss.worldId());
    const worldB = await b.evaluate(() => window.__abyss.worldId());
    assert.equal(worldA, worldB, 'mesmo world_id');
    const rosterA = await a.evaluate(() => window.__abyss.roster());
    const rosterB = await b.evaluate(() => window.__abyss.roster());
    assert.deepEqual(rosterA, rosterB, 'mesma ordem e mesmos ids');
    await delay(1500);
    const lastA = await a.evaluate(() => window.__abyss.lastTick());
    const lastB = await b.evaluate(() => window.__abyss.lastTick());
    assert.ok(Math.abs(lastA - lastB) <= 2, `defasagem de ticks ${lastA} x ${lastB}`);
    // Um tick que as duas ainda têm no histórico recente.
    const tick = Math.min(lastA, lastB) - 3;
    const posA = await a.evaluate((t) => window.__abyss.positionsAt(t), tick);
    const posB = await b.evaluate((t) => window.__abyss.positionsAt(t), tick);
    assert.ok(posA && posB, `tick ${tick} ausente no histórico`);
    const same = JSON.stringify(posA) === JSON.stringify(posB);
    if (NEGATE) assert.ok(!same, 'NEGATE: esperava diferença (deve falhar)');
    else assert.ok(same, `posições diferem no tick ${tick}`);
    await a.close();
    await b.close();
  });

  await scenario('selecionar pelo índice seleciona o certo', async () => {
    const page = await openWorld(context);
    await page.getByRole('button', { name: /NO TERRÁRIO/ }).click();
    await page.getByRole('button', { name: /Membrana\s+9/ }).click();
    const pick = page.getByRole('button', { name: /^MBR-\d{4}$/ }).first();
    const id = (await pick.innerText()).trim();
    await pick.click();
    await delay(300);
    const sel = await page.evaluate(() => window.__abyss.selection());
    assert.equal(sel.id, id, 'selection.id igual ao id escolhido');
    assert.equal(sel.following, false, 'escolher pelo índice não segue');
    await page.getByText(`INDIVÍDUO · ${id}`).waitFor({ timeout: 5000 });
    await page.close();
  });

  await scenario('reinício reconecta com mundo novo, sem recarregar', async () => {
    const page = await openWorld(context);
    const before = await page.evaluate(() => window.__abyss.worldId());
    await page.evaluate(() => {
      window.__marker = 1;
    });
    await exec('docker', ['compose', '-f', COMPOSE, 'restart', 'api'], { timeout: 120_000 });
    await page.waitForFunction(
      (old) => window.__abyss?.status() === 'live' && window.__abyss.worldId() !== old,
      before,
      { timeout: LIVE_TIMEOUT },
    );
    const after = await page.evaluate(() => window.__abyss.worldId());
    assert.notEqual(after, before, 'world_id novo');
    const marker = await page.evaluate(() => window.__marker);
    assert.equal(marker, 1, 'a página não recarregou');
    await page.close();
  });
} finally {
  await browser.close();
  // No Windows, kill() só mata o shell: a árvore inteira precisa ir junto.
  if (process.platform === 'win32') await exec('taskkill', ['/PID', String(preview.pid), '/T', '/F']).catch(() => {});
  else preview.kill();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passaram`);
process.exitCode = failed === 0 ? 0 : 1;
