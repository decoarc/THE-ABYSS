// E2E da persistência (gate P): o mundo volta da fotografia depois de um reinício normal, de uma queda
// (`kill -9`) e de uma parada longa, com o tempo congelado enquanto o servidor está fora.
// Pré-requisitos: `pnpm api:up` (dev) e `pnpm build` (o script sobe o preview).
// Não mexe na gênese nem apaga dados: só reinicia, derruba e sobe o `api`. Uma queda perde até ~1 min de
// mundo (é o que o cenário prova). Se o script for interrompido, ele sobe o `api` de novo antes de sair.
// Uso: node scripts/e2e/persistence.mjs   (E2E_NEGATE=1 inverte as asserções principais, para ver falhar;
//      E2E_PAUSE_S=300 é a parada longa, em segundos)
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { API, COMPOSE, exec, expectOk, openWorld, scenario, waitHttp, withPreview } from './harness.mjs';

const PAUSE_S = Number(process.env.E2E_PAUSE_S ?? 300);
const SNAPSHOT_S = 60;
const TICK_HZ = 10;

const dc = (...args) => exec('docker', ['compose', '-f', COMPOSE, ...args], { timeout: 300_000 });
const psql = async (sql) => {
  const { stdout } = await dc('exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'abyss_dev', '-tA', '-c', sql);
  return stdout.trim();
};
const stats = async () => (await fetch(`${API}/api/stats`)).json();
const upApi = async () => {
  await dc('up', '-d', 'api');
  await waitHttp(`${API}/api/health`, 180_000);
};
// Tick da fotografia carregada no último boot (log do api).
const restoredTick = async () => {
  const { stdout } = await dc('logs', '--tail', '400', 'api');
  const all = [...stdout.matchAll(/restaurado da fotografia do tick (\d+) \(epoch (\d+)\)/g)];
  if (all.length === 0) return null;
  const last = all[all.length - 1];
  return { tick: Number(last[1]), epoch: Number(last[2]) };
};

// Interrompido no meio de uma queda ou parada: o api volta a subir antes de sair.
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(s, () => {
    console.error(`\n${s}: subindo o api de novo antes de sair…`);
    upApi()
      .catch((err) => console.error(`o api não subiu: ${err.message ?? err}`))
      .finally(() => process.exit(130));
  });
}

// Vivos (sem fantasmas) com a idade no relógio do mundo, e o relógio do mundo agora.
const census = (page) =>
  page.evaluate(() => {
    const a = window.__abyss;
    const now = a.serverNow();
    const ages = {};
    for (const o of a.organisms()) {
      const v = a.vitals(o.id);
      if (v && v.dyingSinceMs === null) ages[o.id] = now - o.born_ms;
    }
    return { worldId: a.worldId(), tick: a.lastTick(), serverMs: now, ages };
  });

const reconnected = (page, oldWorld) =>
  page.waitForFunction((old) => window.__abyss?.status() === 'live' && window.__abyss.worldId() !== old, oldWorld, {
    timeout: 180_000,
  });

try {
  await withPreview(async (browser) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

    await scenario('reinício normal: mesmas criaturas, mesma idade, tick continua', async () => {
      const page = await openWorld(context);
      await delay(2000);
      const before = await census(page);
      const realBefore = Date.now();
      await dc('restart', 'api');
      await reconnected(page, before.worldId);
      await delay(1500);
      const after = await census(page);
      const realGap = Date.now() - realBefore;
      const worldGap = after.serverMs - before.serverMs;

      const ids = Object.keys(before.ages);
      const kept = ids.filter((id) => id in after.ages);
      const drift = kept.map((id) => after.ages[id] - before.ages[id] - worldGap);
      const worst = Math.max(...drift.map(Math.abs));
      console.log(
        `  ${kept.length}/${ids.length} criaturas de volta; mundo andou ${worldGap} ms em ${realGap} ms reais; ` +
          `pior desvio de idade ${worst} ms; tick ${before.tick} → ${after.tick}`,
      );
      expectOk(kept.length >= ids.length * 0.95, `criaturas de volta: ${kept.length}/${ids.length}`);
      expectOk(worst <= 2000, `idade = idade antes + tempo do mundo (± 2 s): pior ${worst} ms`);
      // Tempo congelado: o mundo anda bem menos que o relógio real durante o reinício.
      assert.ok(worldGap < realGap, `mundo andou ${worldGap} ms, real ${realGap} ms`);
      assert.ok(after.tick >= before.tick, `tick continua: ${before.tick} → ${after.tick}`);
      await page.close();
    });

    await scenario('queda (kill -9): perde no máximo ~1 min e não duplica contagens', async () => {
      const before = await stats();
      const maxId = Number((await psql('SELECT coalesce(max(id), 0) FROM death_counts')) || 0);
      await dc('kill', '-s', 'KILL', 'api');
      await upApi();
      const after = await stats();
      const loaded = await restoredTick();
      assert.ok(loaded, 'o api voltou de uma fotografia');
      const lost = before.tick - loaded.tick;
      console.log(`  tick antes ${before.tick}, fotografia ${loaded.tick} (perdeu ${lost} ticks), agora ${after.tick}`);
      expectOk(lost <= SNAPSHOT_S * TICK_HZ + 50, `perdeu ${lost} ticks (máx. ${SNAPSHOT_S * TICK_HZ} + margem)`);
      // Linhas gravadas antes da queda (id ≤ maxId) com tick depois da fotografia sobram só para extinções
      // gravadas depois dela.
      const dup = Number(
        await psql(
          `SELECT count(*) FROM death_counts d WHERE d.id <= ${maxId} AND d.epoch = ${loaded.epoch} AND d.tick > ${loaded.tick}
           AND d.species_id NOT IN (SELECT 'sp' || id FROM species WHERE extinct_at IS NOT NULL
                                    UNION SELECT id FROM branches WHERE extinct_at IS NOT NULL)`,
        ),
      );
      console.log(`  contagens depois da fotografia que sobraram: ${dup}`);
      expectOk(dup === 0, `contagens duplicadas: ${dup}`);
    });

    await scenario(`parada longa (${PAUSE_S} s): ninguém morre de velhice pela parada`, async () => {
      const a = await stats();
      await delay(60_000);
      const b = await stats();
      const rateBefore = b.deaths_total.old_age - a.deaths_total.old_age;
      const popBefore = b.population;
      await dc('stop', 'api');
      console.log(`  parado por ${PAUSE_S} s…`);
      await delay(PAUSE_S * 1000);
      await upApi();
      const c = await stats();
      await delay(60_000);
      const d = await stats();
      const rateAfter = d.deaths_total.old_age - c.deaths_total.old_age;
      const jump = c.deaths_total.old_age - b.deaths_total.old_age;
      console.log(
        `  velhice: ${rateBefore}/min antes, ${rateAfter}/min depois, ${jump} no boot; população ${popBefore} → ${c.population}`,
      );
      expectOk(rateAfter <= Math.max(2 * rateBefore, 2), `velhice depois ${rateAfter}/min vs. ${rateBefore}/min antes`);
      expectOk(jump <= Math.max(rateBefore, 2), `mortes por velhice no boot: ${jump}`);
      assert.ok(c.population >= popBefore * 0.9, `população ${popBefore} → ${c.population}`);
    });

    await context.close();
  });
} finally {
  // Seja qual for o resultado, o api fica no ar.
  await upApi().catch((err) => console.error(`o api não subiu: ${err.message ?? err}`));
}

