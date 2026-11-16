// E2E da evolução (gate S2): um ramo (sub-espécie) aparece na árvore da espécie e se seleciona por ela.
// Pré-requisitos: `pnpm api:up` (dev) e `pnpm build` (o script sobe o preview).
// ATENÇÃO: este cenário esvazia a gênese (`mix abyss.reset --yes`). Para não destruir o mundo de dev, o script faz
// pg_dump do banco antes e o restaura ao fim (também se falhar ou for interrompido por Ctrl+C/SIGTERM), reiniciando a
// API; se o restore falhar, o dump fica no disco e o script imprime os comandos de recuperação. (O run.mjs não mexe no banco.)
// O ramo não espera nascer na natureza (com boost alto nenhum ramo se firma; com 1,5 leva ~30 min): o
// script grava um ramo no banco (`mix abyss.seed_branch`, planta da raiz + 2 peças) e reinicia a API,
// que no boot o restaura e faz nascer as fundadoras.
// Uso: node scripts/e2e/evolution.mjs   (E2E_NEGATE=1 inverte a asserção principal, para ver falhar)
import { spawn } from 'node:child_process';
import { mkdtempSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { API, COMPOSE, exec, expectOk, openWorld, restartApi, scenario, waitHttp, withPreview } from './harness.mjs';

const mix = (...args) => exec('docker', ['compose', '-f', COMPOSE, 'run', '--rm', 'api', 'mix', ...args], { timeout: 300_000 });
const BRANCH_TIMEOUT_MS = Number(process.env.E2E_BRANCH_S ?? 600) * 1000;

const dumpDir = mkdtempSync(join(tmpdir(), 'abyss-e2e-'));
const dumpFile = join(dumpDir, 'abyss_dev.dump');
const dc = (args, { stdin, stdout } = {}) =>
  new Promise((resolve, reject) => {
    const fdIn = stdin ? openSync(stdin, 'r') : 'ignore';
    const fdOut = stdout ? openSync(stdout, 'w') : 'ignore';
    const p = spawn('docker', ['compose', '-f', COMPOSE, ...args], { stdio: [fdIn, fdOut, 'inherit'] });
    p.on('exit', (code) => {
      if (stdin) closeSync(fdIn);
      if (stdout) closeSync(fdOut);
      code === 0 ? resolve() : reject(new Error(`docker compose ${args.join(' ')} saiu com ${code}`));
    });
  });
console.log(`dump do banco de dev em ${dumpFile}…`);
await dc(['exec', '-T', 'db', 'pg_dump', '-U', 'postgres', '-Fc', 'abyss_dev'], { stdout: dumpFile });

const recoveryHelp = () =>
  [
    '',
    `!!! O banco de dev NÃO foi restaurado. O mundo está só no dump: ${dumpFile}`,
    '!!! Para recuperar (na raiz do repositório):',
    `  docker compose -f ${COMPOSE} stop api`,
    `  docker compose -f ${COMPOSE} exec -T db psql -U postgres -c "DROP DATABASE abyss_dev WITH (FORCE)" -c "CREATE DATABASE abyss_dev"`,
    `  docker compose -f ${COMPOSE} exec -T db pg_restore -U postgres -d abyss_dev < "${dumpFile}"`,
    `  docker compose -f ${COMPOSE} start api`,
    '',
  ].join('\n');

// A API volta a subir mesmo se o restore falhar; o dump só é apagado se o restore deu certo.
async function restoreDb() {
  console.log('restaurando o banco de dev…');
  let ok = false;
  try {
    await dc(['stop', 'api']);
    await dc(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-c', 'DROP DATABASE abyss_dev WITH (FORCE)', '-c', 'CREATE DATABASE abyss_dev']);
    await dc(['exec', '-T', 'db', 'pg_restore', '-U', 'postgres', '-d', 'abyss_dev'], { stdin: dumpFile });
    ok = true;
  } finally {
    if (!ok) console.error(recoveryHelp());
    try {
      await dc(['start', 'api']);
      await waitHttp(`${API}/api/health`, 120_000);
    } catch (err) {
      console.error(`a API não voltou a subir: ${err.message ?? err}`);
    }
  }
  rmSync(dumpDir, { recursive: true, force: true });
  console.log('banco de dev restaurado.');
}

// Uma restauração só, chamada pelo fim normal ou por um sinal (Ctrl+C, SIGTERM, terminal fechando).
let restoring = null;
const restoreOnce = () => (restoring ??= restoreDb());
const onSignal = (sig) => {
  console.error(`\n${sig}: interrompido; restaurando o banco de dev antes de sair (não interrompa de novo)…`);
  for (const s of SIGNALS) {
    process.removeAllListeners(s);
    process.on(s, () => console.error('restauração em curso; aguarde.'));
  }
  restoreOnce()
    .catch((err) => console.error(`restauração falhou: ${err.message ?? err}`))
    .finally(() => process.exit(130));
};
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
for (const s of SIGNALS) process.once(s, onSignal);

let testError = null;
try {
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
    // O painel do indivíduo sai da frente enquanto a árvore está aberta e volta, com a escolha, ao fechá-la.
    assert.equal(await page.getByText(`INDIVÍDUO · ${sel.id}`).count(), 0, 'painel escondido com a árvore aberta');
    await dialog.getByRole('button', { name: 'fechar', exact: true }).click();
    await page.getByText(`INDIVÍDUO · ${sel.id}`).waitFor({ timeout: 5000 });
    await page.close();
  });
});
} catch (err) {
  testError = err;
}

// O erro do teste não some atrás de um erro do restore: os dois aparecem, e o do teste é o relançado.
try {
  await restoreOnce();
} catch (err) {
  console.error(`restauração falhou: ${err.message ?? err}`);
  if (!testError) throw err;
}
if (testError) throw testError;
