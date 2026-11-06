// E2E de consistência e reinício do gate I, mais a comida e a câmera livre do gate E1.
// Pré-requisitos: `pnpm api:up` e `pnpm build` (o script sobe o preview em E2E_PORT).
// Uso: node scripts/e2e/run.mjs   (E2E_NEGATE=1 inverte as asserções de consistência, para ver falhar)
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

const E2_WAIT_MS = Number(process.env.E2E_WAIT_S ?? 120) * 1000;
const FOLLOW_TIMEOUT_MS = Number(process.env.E2E_FOLLOW_S ?? 300) * 1000;
const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

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

  await scenario('duas abas veem a mesma comida', async () => {
    const a = await openWorld(context);
    const b = await openWorld(context);
    await delay(1500);
    const lastA = await a.evaluate(() => window.__abyss.lastTick());
    const lastB = await b.evaluate(() => window.__abyss.lastTick());
    const tick = Math.min(lastA, lastB) - 3;
    // Resumo canônico do tick: soma da flora e ids das partículas vivas.
    const digestA = await a.evaluate((t) => window.__abyss.foodDigestAt(t), tick);
    const digestB = await b.evaluate((t) => window.__abyss.foodDigestAt(t), tick);
    assert.ok(digestA && digestB, `tick ${tick} ausente no histórico da comida`);
    const countsA = await a.evaluate(() => window.__abyss.foodCounts());
    assert.ok(countsA.particles > 0 && countsA.floraSum > 0, `comida vazia: ${JSON.stringify(countsA)}`);
    const same = digestA === digestB;
    if (NEGATE) assert.ok(!same, 'NEGATE: esperava diferença (deve falhar)');
    else assert.ok(same, `comida difere no tick ${tick}:
  ${digestA.slice(0, 120)}
  ${digestB.slice(0, 120)}`);
    await a.close();
    await b.close();
  });

  await scenario('câmera livre: W nada e a câmera fica acima do chão', async () => {
    const page = await openWorld(context);
    await delay(4000); // a introdução (3 s) termina
    const before = await page.evaluate(() => window.__abyss.camera());
    await page.keyboard.down('w');
    await delay(2000);
    await page.keyboard.up('w');
    await delay(200);
    const after = await page.evaluate(() => window.__abyss.camera());
    const moved = Math.hypot(...after.pos.map((v, i) => v - before.pos[i]));
    if (NEGATE) assert.ok(moved <= 2, `NEGATE: esperava a câmera parada (deve falhar), andou ${moved.toFixed(2)} u`);
    else assert.ok(moved > 2, `a câmera andou só ${moved.toFixed(2)} u`);
    assert.ok(after.pos[1] > after.floor, `câmera em y ${after.pos[1].toFixed(2)}, leito em ${after.floor.toFixed(2)}`);
    await page.close();
  });

  await scenario('selecionar pelo índice seleciona o certo', async () => {
    const page = await openWorld(context);
    await page.getByRole('button', { name: /NO TERRÁRIO/ }).click();
    await page.getByRole('button', { name: /Membrana\s+\d+/ }).click();
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

  await scenario('duas abas concordam depois de 120 s (vivos, extintas, gen/parent)', async () => {
    const a = await openWorld(context);
    const b = await openWorld(context);
    await delay(E2_WAIT_MS);
    // Tentativas: cada uma compara um tick que as duas ainda guardam no histórico; `extinct()` não é
    // alinhado por tick, então uma divergência só reprova se persistir nas três.
    let lastProblem = '';
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      await delay(500);
      const lastA = await a.evaluate(() => window.__abyss.lastTick());
      const lastB = await b.evaluate(() => window.__abyss.lastTick());
      const tick = Math.min(lastA, lastB) - 3;
      const snap = (page) =>
        page.evaluate((t) => {
          const pos = window.__abyss.positionsAt(t);
          if (!pos) return null;
          const info = Object.fromEntries(window.__abyss.organisms().map((o) => [o.id, [o.gen, o.parent, o.species]]));
          return { ids: Object.keys(pos).sort(), ext: window.__abyss.extinct(), info };
        }, tick);
      const [sa, sb] = await Promise.all([snap(a), snap(b)]);
      assert.ok(sa && sb, `tick ${tick} ausente no histórico`);
      const sameIds = JSON.stringify(sa.ids) === JSON.stringify(sb.ids);
      const sameExt = JSON.stringify(sa.ext) === JSON.stringify(sb.ext);
      const shared = sa.ids.filter((id) => sb.info[id]);
      // Sorteio com semente fixa por tentativa, só para variar os ids entre as rodadas.
      const picks = [...shared].sort((x, y) => hash(x + attempt) - hash(y + attempt)).slice(0, 10);
      const sameInfo = picks.every((id) => JSON.stringify(sa.info[id]) === JSON.stringify(sb.info[id]));
      assert.ok(sa.ids.length >= 5, `poucos vivos: ${sa.ids.length}`);
      assert.equal(picks.length, Math.min(10, shared.length));
      const agree = sameIds && sameExt && sameInfo;
      lastProblem = `ids ${sameIds} (${sa.ids.length} x ${sb.ids.length}), extintas ${sameExt}, gen/parent ${sameInfo}`;
      console.log(`  tick ${tick}: ${lastProblem}; gens máx ${Math.max(...Object.values(sa.info).map((v) => v[0]))}`);
      if (NEGATE) assert.ok(!agree, 'NEGATE: esperava diferença (deve falhar)');
      ok = agree;
    }
    assert.ok(ok, `abas divergem: ${lastProblem}`);
    await a.close();
    await b.close();
  });

  await scenario('seguir quem morre: sem erro, o Seguir solta e o painel fecha', async () => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
    await page.goto(`${BASE}?debug=1`, { waitUntil: 'load' });
    await live(page);
    await delay(4000); // a introdução termina
    const until = Date.now() + FOLLOW_TIMEOUT_MS;
    let victim = null;
    let died = false;
    let deathMode = '';
    let repickAt = Date.now() + 30_000;
    while (Date.now() < until && !died) {
      if (!victim) {
        victim = await page.evaluate(() => {
          const b = window.__abyss;
          const pos = b.positionsAt(b.lastTick() - 1) ?? {};
          const alive = Object.keys(pos)
            .map((id) => [id, b.vitals(id)])
            .filter(([, v]) => v && v.dyingSinceMs === null)
            .sort((x, y) => x[1].energy - y[1].energy);
          if (!alive.length) return null;
          b.select(alive[0][0]);
          b.follow(true);
          return alive[0][0];
        });
        if (!victim) {
          await delay(500);
          continue;
        }
        const st = await page.evaluate(() => window.__abyss.selection());
        assert.deepEqual(st, { id: victim, following: true }, 'seguindo');
      }
      await delay(250);
      const state = await page.evaluate((id) => {
        const b = window.__abyss;
        const v = b.vitals(id);
        const living = Object.hasOwn(b.positionsAt(b.lastTick() - 1) ?? { [id]: 1 }, id);
        return { v, living, sel: b.selection() };
      }, victim);
      if (state.v && state.v.dyingSinceMs !== null) deathMode = 'fantasma (fome ou velhice)';
      if (!state.v || !state.living) {
        died = true;
        if (!deathMode) deathMode = 'sumiu na hora (predação) ou já fora do roster';
      } else if (Date.now() > repickAt && state.v.energy > 0.4) {
        // Este se recuperou: solta e escolhe quem está pior agora.
        await page.evaluate(() => window.__abyss.follow(false));
        victim = null;
        repickAt = Date.now() + 30_000;
      }
    }
    assert.ok(died, `${victim} não morreu em ${FOLLOW_TIMEOUT_MS / 1000} s`);
    console.log(`  ${victim}: ${deathMode}`);
    // Painel fecha e o Seguir solta (depois do desfazer, no máximo ~DISSOLVE_MS + folga).
    await page.waitForFunction(
      () => window.__abyss.selection().id === null && window.__abyss.selection().following === false,
      null,
      { timeout: 6000 },
    );
    assert.equal(await page.getByText(`INDIVÍDUO · ${victim}`).count(), 0, 'painel fechado');
    await delay(1500);
    if (NEGATE) assert.ok(errors.length > 0, 'NEGATE: esperava erros no console (deve falhar)');
    else assert.deepEqual(errors, [], 'erros no console');
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
