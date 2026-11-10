// E2E da gênese de espécies (gate S1): criar pela tela, confirmar pelo link do e-mail, ver no mundo.
// Pré-requisitos: `pnpm api:up` (dev, caixa em /dev/mailbox/json) e `pnpm build` (o script sobe o preview).
// ATENÇÃO: começa com o reset total da gênese (`mix abyss.reset --yes` + reinício da API), como o `pnpm api:reset`.
// Uso: node scripts/e2e/genesis.mjs   (E2E_NEGATE=1 inverte a asserção principal de cada cenário, para ver falhar)
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { API, BASE, COMPOSE, NEGATE, exec, expectOk, live, openWorld, restartApi, scenario, withPreview } from './harness.mjs';

const EMAIL = 'mesmo@email.com';
const EMAIL_AGAIN = '  Mesmo@Email.com';
const NAME = 'Gênese E2E';
const PLANTAS = JSON.parse(await readFile(new URL('../capture-s1-plantas.json', import.meta.url), 'utf8'));
// Outras duas espécies para os cenários de programas e reinício: plantas bem diferentes da primeira
// (Misto: raspador, cílios, ocelo, gancho, manchas; Sorteada 15: filtro, placa, cílios, aleta, listras).
const OTHERS = [PLANTAS[1], PLANTAS[7]];
// Data fixa da extinção marcada à mão no banco (como o Recorder grava).
const EXTINCT_AT = '2026-11-09T21:30:00.123Z';

// --- API, caixa de e-mail e banco ------------------------------------------------

async function mailFor(email) {
  const box = await (await fetch(`${API}/dev/mailbox/json`)).json();
  // A caixa guarda as mensagens mais novas primeiro.
  return box.data.filter((m) => JSON.stringify(m.to).toLowerCase().includes(email.trim().toLowerCase()));
}

/** Espera a caixa ter mais de `already` mensagens para o endereço; devolve a mais nova. */
async function nextMail(email, already) {
  for (let k = 0; k < 40; k++) {
    const msgs = await mailFor(email);
    if (msgs.length > already) return msgs[0];
    await delay(250);
  }
  throw new Error(`nenhum e-mail novo para ${email}`);
}

const linkOf = (msg) => JSON.stringify(msg).match(/https?:\/\/[^"\s<>\\]*#confirmar=[A-Za-z0-9_-]+/)?.[0] ?? null;

/** O link do e-mail aponta para o web_url do dev; aqui ele abre no preview, com `?debug=1`. */
function onPreview(link) {
  const u = new URL(link);
  const p = new URL(BASE);
  p.searchParams.set('debug', '1');
  p.hash = u.hash;
  return p.toString();
}

async function post(path, body) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

/** Publica pela API (envio, e-mail da caixa de dev, confirmação); devolve a espécie da resposta. */
async function publishViaApi(email, name, blueprint) {
  const before = (await mailFor(email)).length;
  const s = await post('/api/genesis/submit', { email, name, blueprint });
  assert.equal(s.status, 202, `envio de ${name}: ${s.status}`);
  const link = linkOf(await nextMail(email, before));
  assert.ok(link, `sem link para ${name}`);
  const c = await post('/api/genesis/confirm', { token: link.split('#confirmar=')[1] });
  assert.equal(c.json.status, 'published', `confirmação de ${name}: ${JSON.stringify(c.json)}`);
  return c.json.species;
}

async function sql(query) {
  const { stdout } = await exec('docker', ['compose', '-f', COMPOSE, 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'abyss_dev', '-tAc', query]);
  return stdout.trim();
}

const countOf = (page, spId) => page.evaluate((id) => window.__abyss.organisms().filter((o) => o.species === id).length, spId);

/** Espera `cond` virar verdade (sem lançar); devolve se virou. */
async function waitTrue(page, fn, arg, timeout) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 50 });
    return true;
  } catch {
    return false;
  }
}

// --- fio: todos os frames de WebSocket de todas as abas -------------------------------

/** Escuta os frames de cada aba do contexto: procura o e-mail e anota as espécies que chegaram por `sp`. */
function watchWire(context) {
  const wire = { frames: 0, emailHits: [], spByPage: new Map() };
  const needle = EMAIL.toLowerCase();
  context.on('page', (page) => {
    const sp = new Set();
    wire.spByPage.set(page, sp);
    page.on('websocket', (ws) => {
      const check = (dir) => ({ payload }) => {
        const text = typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf8');
        wire.frames++;
        if (text.toLowerCase().includes(needle)) wire.emailHits.push(`${dir}: ${text.slice(0, 160)}`);
        if (dir === 'recebido' && text.includes('"sp":[{')) {
          try {
            const [, , , event, body] = JSON.parse(text);
            if (event === 'tick') for (const s of body.sp ?? []) sp.add(s.id);
          } catch {
            // frame que não é JSON do Phoenix
          }
        }
      };
      ws.on('framereceived', check('recebido'));
      ws.on('framesent', check('enviado'));
    });
  });
  return wire;
}

// --- cenários ----------------------------------------------------------------------

console.log('reset da gênese (mix abyss.reset --yes) e reinício da API…');
await exec('docker', ['compose', '-f', COMPOSE, 'run', '--rm', 'api', 'mix', 'abyss.reset', '--yes'], { timeout: 300_000 });
await restartApi();

await withPreview(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const wire = watchWire(context);
  /** Estado que os cenários seguintes usam. */
  const S = { first: null, link: null, bp: null, second: null, others: [] };

  // A segunda aba abre antes da confirmação e fica aberta.
  const tabB = await openWorld(context);
  await tabB.evaluate(() => {
    window.__marker = 1;
  });
  const worldB = await tabB.evaluate(() => window.__abyss.worldId());

  await scenario('fluxo completo', async () => {
    const page = await openWorld(context);
    await page.getByRole('button', { name: 'CRIAR ESPÉCIE' }).click();
    await page.waitForFunction(() => window.location.hash === '#criar');
    await page.getByRole('form', { name: 'Criar espécie' }).waitFor();
    // Boca + 2 peças.
    for (const part of [/^Raspador/, /^Flagelo/, /^Ocelo/]) await page.getByRole('button', { name: part }).click();
    await page.getByLabel('E-mail').fill(EMAIL);
    await page.getByLabel('Nome da espécie').fill(NAME);
    const before = (await mailFor(EMAIL)).length;
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().endsWith('/api/genesis/submit') && r.method() === 'POST'),
      page.getByRole('button', { name: 'Liberar no abismo' }).click(),
    ]);
    S.bp = request.postDataJSON().blueprint;
    assert.deepEqual(
      S.bp.parts.map((p) => p.kind).sort(),
      ['flagelo', 'ocelo', 'raspador'],
      'planta enviada com boca + 2 peças',
    );
    await page.getByText('Enviamos um link para o seu e-mail').waitFor({ timeout: 10_000 });
    S.link = linkOf(await nextMail(EMAIL, before));
    assert.ok(S.link, 'o e-mail tem o link de confirmação');

    // Abre o link do e-mail numa aba nova, como o leitor de e-mail faria.
    const tabC = await context.newPage();
    const confirmed = tabC.waitForResponse((r) => r.url().endsWith('/api/genesis/confirm'));
    await tabC.goto(onPreview(S.link), { waitUntil: 'load' });
    S.first = (await (await confirmed).json()).species;
    assert.ok(S.first?.id, 'confirmação publicou');
    await tabC.getByText(`${NAME} foi liberada no abismo`).waitFor({ timeout: 10_000 });
    const t0 = Date.now();
    await live(tabC);
    const three = await waitTrue(tabC, (id) => window.__abyss.organisms().filter((o) => o.species === id).length === 3, S.first.id, Math.max(0, 3000 - (Date.now() - t0)));
    const ms = Date.now() - t0;
    const gotBp = await tabC.evaluate((id) => window.__abyss.blueprintOf(id), S.first.id);
    const sameBp = isDeepStrictEqual(gotBp, S.bp);
    if (!sameBp) console.log(`  enviada ${JSON.stringify(S.bp)}
  no mundo ${JSON.stringify(gotBp)}`);
    console.log(`  ${S.first.code} (${S.first.id}): 3 organismos ${three ? `em ${ms} ms depois do aviso` : 'NÃO chegaram em 3 s'}; planta igual ${sameBp}`);
    expectOk(three && sameBp, `3 organismos em ≤ 3 s (${three}) e planta igual à enviada (${sameBp})`);
    await page.close();
    await tabC.close();
  });

  await scenario('segunda aba vê a espécie nova sem recarregar', async () => {
    assert.ok(S.first, 'depende do fluxo completo');
    const three = await waitTrue(tabB, (id) => window.__abyss.organisms().filter((o) => o.species === id).length === 3, S.first.id, 5000);
    const sameBp = isDeepStrictEqual(await tabB.evaluate((id) => window.__abyss.blueprintOf(id), S.first.id), S.bp);
    const viaSp = wire.spByPage.get(tabB)?.has(S.first.id) ?? false;
    const marker = await tabB.evaluate(() => window.__marker);
    const sameWorld = (await tabB.evaluate(() => window.__abyss.worldId())) === worldB;
    console.log(`  3 organismos ${three}, planta igual ${sameBp}, chegou num tick com sp ${viaSp}, sem recarregar ${marker === 1}, mesmo mundo ${sameWorld}`);
    expectOk(three && sameBp && viaSp && marker === 1 && sameWorld, 'a aba aberta antes recebe sp e as 3, sem recarregar');
  });

  await scenario('mesmo e-mail não publica de novo', async () => {
    assert.ok(S.first, 'depende do fluxo completo');
    const speciesBefore = await sql('SELECT count(*) FROM species');
    const before = (await mailFor(EMAIL)).length;
    const s = await post('/api/genesis/submit', { email: EMAIL_AGAIN, name: 'Outra Vez', blueprint: S.bp });
    assert.deepEqual([s.status, s.json], [202, { status: 'sent' }], 'resposta genérica');
    const msg = JSON.stringify(await nextMail(EMAIL, before));
    const taken = msg.includes('já criou uma espécie') && !msg.includes('confirmar=');
    await delay(2000);
    const speciesAfter = await sql('SELECT count(*) FROM species');
    const tokens = await sql('SELECT count(*) FROM verification_tokens');
    const created = await tabB.evaluate(() => window.__abyss.species().filter((x) => x.blueprint).length);
    console.log(`  e-mail de "já criou" ${taken}; espécies no banco ${speciesBefore} -> ${speciesAfter}; tokens ${tokens}; criadas no mundo ${created}`);
    expectOk(taken && speciesAfter === speciesBefore && tokens === '0' && created === 1, 'o segundo envio só manda o e-mail de "já criou"');
  });

  await scenario('link usado duas vezes', async () => {
    assert.ok(S.link, 'depende do fluxo completo');
    const page = await context.newPage();
    const confirmed = page.waitForResponse((r) => r.url().endsWith('/api/genesis/confirm'));
    await page.goto(onPreview(S.link), { waitUntil: 'load' });
    const body = await (await confirmed).json();
    let shown = true;
    try {
      await page.getByText('Este link não vale mais').waitFor({ timeout: 10_000 });
    } catch {
      shown = false;
    }
    const count = await sql('SELECT count(*) FROM species');
    console.log(`  resposta ${JSON.stringify(body)}; aviso ${shown}; espécies no banco ${count}`);
    expectOk(shown && body.status === 'invalid' && count === '1', 'a segunda abertura mostra "Este link não vale mais"');
    await page.close();
  });

  await scenario('programas não crescem por espécie', async () => {
    assert.ok(S.first, 'depende do fluxo completo');
    const page = await context.newPage();
    // Assinatura de cada programa ligado, para dizer o que cresceu se crescer.
    await page.addInitScript(() => {
      const links = [];
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
        const orig = C.prototype.linkProgram;
        C.prototype.linkProgram = function (p) {
          const src = this.getAttachedShaders(p).map((s) => this.getShaderSource(s)).join('\n');
          const own = [...new Set([...src.matchAll(/uniform\s+\w+\s+(u[A-Z]\w*)/g)].map((m) => m[1]))].slice(0, 4);
          links.push([performance.now(), (src.match(/#define SHADER_TYPE ([^\n]*)/) ?? [])[1] ?? 'sem-tipo', own.join(',')]);
          return orig.call(this, p);
        };
      }
      window.__links = links;
    });
    await page.goto(`${BASE}?debug=1`, { waitUntil: 'load' });
    await live(page);
    await delay(4000); // a introdução termina
    // Segue uma criatura da espécie: a câmera fica nela e ela é desenhada.
    const follow = async (spId) => {
      const ok = await waitTrue(page, (id) => window.__abyss.organisms().some((o) => o.species === id), spId, 10_000);
      assert.ok(ok, `nenhum organismo de ${spId}`);
      await page.evaluate((id) => {
        const o = window.__abyss.organisms().find((x) => x.species === id);
        window.__abyss.select(o.id);
        window.__abyss.follow(true);
      }, spId);
    };
    // Aquecimento: segue uma criatura de cada espécie viva (as de teste e a 1ª criada), para a cena ver
    // os materiais de todas e o pedaço de mundo em volta delas; o que crescer depois é da 2ª e da 3ª.
    const tour = await page.evaluate(() => [...new Set(window.__abyss.organisms().map((o) => o.species))]);
    for (const id of tour) {
      await follow(id);
      await delay(2500);
    }
    await follow(S.first.id);
    await delay(5000);
    const first = await page.evaluate(() => [window.__abyss.programs(), performance.now()]);
    for (const p of OTHERS) {
      const sp = await publishViaApi(`e2e-${p.name.toLowerCase().replace(/\W+/g, '-')}@example.com`, p.name, p.blueprint);
      S.others.push(sp);
      await follow(sp.id);
      await delay(5000);
    }
    const after = await page.evaluate(() => window.__abyss.programs());
    const newLinks = await page.evaluate((t) => window.__links.filter(([at]) => at > t).map(([, type, own]) => `${type} [${own}]`), first[1]);
    const ids = await page.evaluate(() => window.__abyss.species().filter((s) => s.blueprint).map((s) => s.id));
    console.log(`  programas com a 1ª: ${first[0]}; com a 2ª e a 3ª: ${after}; espécies criadas no mundo ${ids.join(', ')}; ligados depois: ${newLinks.join(' | ') || 'nenhum'}`);
    assert.equal(ids.length, 3, 'três espécies criadas no mundo');
    expectOk(after <= first[0], `programas ${first[0]} -> ${after}`);
    await page.close();
  });

  await scenario('nada de e-mail no fio', async () => {
    assert.ok(S.first, 'depende do fluxo completo');
    console.log(`  ${wire.frames} frames vistos em ${wire.spByPage.size} abas; com o e-mail: ${wire.emailHits.length}`);
    for (const h of wire.emailHits.slice(0, 3)) console.log(`    ${h}`);
    expectOk(wire.frames > 100 && wire.emailHits.length === 0, `nenhum frame com o endereço (${wire.emailHits.length} com)`);
  });

  await scenario('reinício', async () => {
    assert.ok(S.others.length === 2, 'depende dos programas (três espécies)');
    const [alive1, alive2] = [S.first, S.others[0]];
    const dead = S.others[1];
    const deadName = OTHERS[1].name;
    await sql(`UPDATE species SET extinct_at = '${EXTINCT_AT}' WHERE id = ${Number(dead.id.slice(2))}`);
    const page = await openWorld(context);
    await page.getByRole('button', { name: /NO TERRÁRIO/ }).click();
    const check = async () => {
      const before = await page.evaluate(() => window.__abyss.worldId());
      await restartApi();
      await page.waitForFunction((old) => window.__abyss?.status() === 'live' && window.__abyss.worldId() !== old, before, { timeout: 60_000 });
      const back = await waitTrue(
        page,
        (ids) => ids.every((id) => window.__abyss.organisms().filter((o) => o.species === id).length === 3),
        [alive1.id, alive2.id],
        10_000,
      );
      const counts = [await countOf(page, alive1.id), await countOf(page, alive2.id), await countOf(page, dead.id)];
      const extinctMs = await page.evaluate((id) => window.__abyss.extinct()[id] ?? null, dead.id);
      const row = page.locator('button', { hasText: deadName }).filter({ hasText: 'extinta' });
      const text = (await row.count()) === 1 ? (await row.innerText()).replace(/\s+/g, ' ').trim() : null;
      return { back, counts, extinctMs, text };
    };
    const r1 = await check();
    const r2 = await check();
    console.log(`  1º reinício: ${JSON.stringify(r1)}`);
    console.log(`  2º reinício: ${JSON.stringify(r2)}`);
    const want = Date.parse(EXTINCT_AT);
    const ok = [r1, r2].every((r) => r.back && r.counts[2] === 0 && r.extinctMs === want && r.text) && r1.text === r2.text;
    expectOk(ok, 'vivas voltam com 3 cada; a extinta continua extinta, com a mesma data no índice');
    await page.close();
  });
});
