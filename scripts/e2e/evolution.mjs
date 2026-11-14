// E2E da evolução (gate S2): um ramo (sub-espécie) aparece na árvore da espécie e se seleciona por ela.
// Pré-requisitos: `pnpm api:up` (dev) e `pnpm build` (o script sobe o preview).
// ATENÇÃO: começa com o reset total da gênese (`mix abyss.reset --yes`), como o e2e:genesis.
// O ramo não espera nascer na natureza (com boost alto nenhum ramo se firma; com 1,5 leva ~30 min): o
// script grava um ramo no banco (`mix abyss.seed_branch`, planta da raiz + 2 peças) e reinicia a API,
// que no boot o restaura e faz nascer as fundadoras.
// Uso: node scripts/e2e/evolution.mjs   (E2E_NEGATE=1 inverte a asserção principal, para ver falhar)
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { API, COMPOSE, exec, expectOk, openWorld, restartApi, scenario, withPreview } from './harness.mjs';

const mix = (...args) => exec('docker', ['compose', '-f', COMPOSE, 'run', '--rm', 'api', 'mix', ...args], { timeout: 300_000 });
const BRANCH_TIMEOUT_MS = Number(process.env.E2E_BRANCH_S ?? 600) * 1000;

console.log('reset da gênese, semeadura de 1 espécie e de 1 ramo, reinício da API…');
await mix('abyss.reset', '--yes');
await mix('abyss.seed_species', '--count', '1', '--seed', '3');
await mix('abyss.seed_branch', '--root', '1');
await restartApi();

await withPreview(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  await scenario('o ramo restaurado nasce no mundo (stats e roster)', async () => {
    const until = Date.now() + BRANCH_TIMEOUT_MS;
    let pop = {};
    while (Date.now() < until) {
      pop = (await (await fetch(`${API}/api/stats`)).json()).population_by_species ?? {};
      if ((pop['sp1.1'] ?? 0) > 0) break;
      await delay(1000);
    }
    expectOk((pop['sp1.1'] ?? 0) > 0, `sp1.1 sem vivos em /api/stats: ${JSON.stringify(pop)}`);
  });

  await scenario('a árvore mostra o ramo; clicar nele seleciona um vivo do ramo', async () => {
    const page = await openWorld(context);
    await delay(4000); // a introdução termina
    await page.getByRole('button', { name: 'Árvore da espécie' }).click();
    const dialog = page.getByRole('dialog', { name: 'Árvore da espécie' });
    await dialog.getByRole('button', { name: /Semente 1/ }).first().click(); // escolhe a raiz
    const branch = dialog.getByRole('button', { name: /Semente 1 · Jardim/ });
    await branch.waitFor({ timeout: 10_000 });
    assert.ok(await branch.isEnabled(), 'ramo com vivos é clicável');
    await branch.click();
    await delay(300);
    const sel = await page.evaluate(() => {
      const a = window.__abyss;
      const id = a.selection().id;
      return { id, species: a.organisms().find((o) => o.id === id)?.species ?? null, following: a.selection().following };
    });
    expectOk(sel.species === 'sp1.1', `seleção fora do ramo: ${JSON.stringify(sel)}`);
    await page.getByText(`INDIVÍDUO · ${sel.id}`).waitFor({ timeout: 5000 });
    await page.close();
  });
});
