// Capturas da Parada 1 do S1 (Gênese de Espécies).
//
// Uso: node scripts/capture-s1.mjs <fase> [--url http://localhost:5173] [--api http://localhost:4000]
//        [--out docs/captures/s1/parada-1] [--gpu arc|rtx] [--minutes 6]
// Fases:
//   editor   as 8 plantas de scripts/capture-s1-plantas.json na prévia do editor (`#criar`), uma por
//            foto (editor-<n>-<slug>.png) e a folha de contato (editor-folha.png). A planta entra no
//            rascunho pelo próprio `onDraftChange` da tela (lido do React), sem mexer no código.
//   publish  publica as 8 pelo fluxo real: POST /api/genesis/submit com e-mails distintos, token
//            lido da caixa de dev (/dev/mailbox/json) e POST /api/genesis/confirm.
//   world    com `?debug=1`, cada espécie publicada de perto no mundo (mundo-<gpu>-<n>-<slug>.png);
//            depois, por até --minutes, procura um cardume junto e uma criatura com gancho dentro da
//            Floresta (cardume-<gpu>.png, floresta-gancho-<gpu>.png).
// GPU como no scripts/perf/measure.mjs: `arc` = GPU padrão + `?quality=low`; `rtx` =
// `--force_high_performance_gpu` + `?quality=high`. O renderizador lido do WebGL vai no log.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: 'http://localhost:5173' },
    api: { type: 'string', default: 'http://localhost:4000' },
    out: { type: 'string', default: 'docs/captures/s1/parada-1' },
    gpu: { type: 'string', default: 'arc' },
    minutes: { type: 'string', default: '6' },
  },
});
const phase = positionals[0] ?? 'editor';
await mkdir(values.out, { recursive: true });

const PLANTAS = JSON.parse(await readFile(new URL('./capture-s1-plantas.json', import.meta.url), 'utf8'));
const BASE_ARGS = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const GPU = {
  arc: { args: BASE_ARGS, quality: 'low' },
  rtx: { args: [...BASE_ARGS, '--force_high_performance_gpu'], quality: 'high' },
};
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fileOf = (prefix, i, p) => `${prefix}-${i + 1}-${slug(p.name)}.png`;

async function renderer(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconhecido';
  });
}

// --- editor ----------------------------------------------------------------------

async function editor() {
  const { args, quality } = GPU[values.gpu];
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${values.url}/?quality=${quality}#criar`);
  await page.waitForSelector('.gen-stage canvas', { timeout: 60_000 });
  console.log('renderer', await renderer(page));
  // A câmera da prévia nasce a 4,2 do centro, perto demais para corpos grandes (até 4 de comprimento):
  // afasta com a roda do mouse num canto vazio do palco, como a pessoa faria.
  await page.mouse.move(1250, 30);
  for (let k = 0; k < 6; k++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150);
  }
  const crops = [];
  for (const [i, p] of PLANTAS.entries()) {
    await page.evaluate((bp) => {
      // Sobe pelas fibras do React a partir da tela até o componente que recebe `onDraftChange`.
      const el = document.querySelector('.gen-root');
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      let f = el[key];
      while (f && !f.memoizedProps?.onDraftChange) f = f.return;
      if (!f) throw new Error('CreationScreen não encontrada');
      f.memoizedProps.onDraftChange((d) => ({ ...d, editor: { bp, selected: null } }));
    }, p.blueprint);
    await page.waitForTimeout(1500);
    const file = fileOf('editor', i, p);
    await page.screenshot({ path: join(values.out, file) });
    const stage = await page.screenshot({ clip: { x: 360, y: 0, width: 920, height: 720 } });
    crops.push({ b64: stage.toString('base64'), name: p.name });
    console.log('editor', file);
  }
  // Folha de contato: só o palco de cada foto (o painel fica de fora), 4 × 2.
  const sheet = await browser.newPage({ viewport: { width: 1840, height: 760 } });
  await sheet.setContent(`<!doctype html><html><body style="margin:0;background:#02080c;color:#dcebe8;font:13px ui-monospace,Consolas,monospace">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px">
    ${crops
      .map(
        (c, i) => `<figure style="margin:0"><img src="data:image/png;base64,${c.b64}" style="display:block;width:452px;height:354px">
          <figcaption style="padding:4px 2px">${i + 1}. ${c.name}</figcaption></figure>`,
      )
      .join('')}
    </div></body></html>`);
  await sheet.waitForTimeout(500);
  await sheet.screenshot({ path: join(values.out, 'editor-folha.png'), fullPage: true });
  console.log('editor-folha.png');
  await browser.close();
}

// --- publish ---------------------------------------------------------------------

async function publish() {
  const post = async (path, body) => {
    const r = await fetch(`${values.api}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const out = [];
  for (const [i, p] of PLANTAS.entries()) {
    const email = `parada1-s1-${i + 1}@example.com`;
    const s = await post('/api/genesis/submit', { email, name: p.name, blueprint: p.blueprint });
    if (s.status !== 202) throw new Error(`submit ${p.name}: ${s.status} ${JSON.stringify(s.json)}`);
    let token = null;
    for (let k = 0; k < 20 && !token; k++) {
      const box = JSON.stringify(await (await fetch(`${values.api}/dev/mailbox/json`)).json());
      // A caixa guarda as mensagens mais novas primeiro; o link leva `#confirmar=<token>`.
      const msgs = JSON.parse(box).data.filter((m) => JSON.stringify(m.to).includes(email));
      const m = msgs.length ? JSON.stringify(msgs[0]).match(/confirmar=([A-Za-z0-9_\-]+)/) : null;
      token = m?.[1] ?? null;
      if (!token) await new Promise((r) => setTimeout(r, 300));
    }
    if (!token) throw new Error(`sem token para ${email}`);
    const c = await post('/api/genesis/confirm', { token });
    console.log('publicada', p.name, c.status, JSON.stringify(c.json.species ?? c.json));
    out.push({ name: p.name, ...(c.json.species ?? {}) });
  }
}

// --- world -----------------------------------------------------------------------

async function world() {
  const { args, quality } = GPU[values.gpu];
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${values.url}/?debug=1&quality=${quality}`);
  await page.waitForFunction(() => window.__abyss?.status() === 'live', null, { timeout: 90_000 });
  await page.waitForTimeout(4000);
  console.log('gpu', values.gpu, 'renderer', await renderer(page));

  const snap = () =>
    page.evaluate(() => {
      const a = window.__abyss;
      const out = [];
      for (const o of a.organisms()) {
        const v = a.vitals(o.id);
        const p = a.position(o.id);
        if (!v || !p || v.dyingSinceMs !== null) continue;
        out.push({ id: o.id, sp: o.species, p });
      }
      const sp = a.species().map((s) => ({ id: s.id, name: s.name, r: s.body_radius, bp: s.blueprint, diet: s.diet }));
      return { orgs: out, sp };
    });
  const cam = (pos, look) => page.evaluate(([p, l]) => window.__abyss.setCamera(p, l), [pos, look]);
  const frame = (p, d, ang) => [[p[0] + Math.cos(ang) * d, p[1] + d * 0.3, p[2] + Math.sin(ang) * d], p];
  // Segue um organismo de lado: o rumo sai das posições sucessivas (suavizado) e a câmera fica
  // na perpendicular, um pouco acima, para a silhueta da planta aparecer como no editor.
  const track = async (id, d, ms, ang = 0.7) => {
    const t = Date.now();
    let prev = null;
    let head = null;
    while (Date.now() - t < ms) {
      const p = await page.evaluate((x) => window.__abyss.position(x), id);
      if (!p) return false;
      if (prev) {
        const v = [p[0] - prev[0], p[2] - prev[2]];
        const n = Math.hypot(v[0], v[1]);
        if (n > 1e-4) {
          const u = [v[0] / n, v[1] / n];
          head = head ? [head[0] * 0.8 + u[0] * 0.2, head[1] * 0.8 + u[1] * 0.2] : u;
        }
      }
      prev = p;
      const a = head ? Math.atan2(head[1], head[0]) + Math.PI / 2 : ang;
      await cam(...frame(p, d, a));
      await page.waitForTimeout(80);
    }
    return true;
  };

  const w0 = await snap();
  const g = values.gpu;
  for (const [i, pl] of PLANTAS.entries()) {
    const sp = w0.sp.filter((s) => s.name === pl.name && s.bp).at(-1);
    const org = sp && w0.orgs.find((o) => o.sp === sp.id);
    if (!org) {
      console.log('sem organismo vivo de', pl.name);
      continue;
    }
    await page.evaluate((id) => window.__abyss.select(id), org.id);
    // Raio no mundo = body_radius × 0,5 (creature_scale); a câmera fica a ~5 raios.
    const d = 1.1 + sp.r * 1.6;
    if (await track(org.id, d, 3500)) {
      await page.screenshot({ path: join(values.out, fileOf(`mundo-${g}`, i, pl)) });
      console.log('mundo', fileOf(`mundo-${g}`, i, pl), org.id);
    }
  }
  await page.evaluate(() => window.__abyss.select(null)).catch(() => {});

  // Cardume e Floresta: procura por até --minutes.
  const has = (bp, kind) => !!bp?.parts.some((p) => p.kind === kind);
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const FLORESTA = [-48, 0, -30];
  const got = { cardume: false, floresta: false };
  const end = Date.now() + Number(values.minutes) * 60_000;
  // O cardume só vale depois de as fundadoras se espalharem (nascem juntas).
  const cardumeFrom = Date.now() + 90_000;
  let lastPos = new Map();
  while (Date.now() < end && !(got.cardume && got.floresta)) {
    const w = await snap();
    const spOf = new Map(w.sp.map((s) => [s.id, s]));
    if (!got.cardume && Date.now() > cardumeFrom) {
      for (const s of w.sp.filter((s) => has(s.bp, 'cardume'))) {
        const os = w.orgs.filter((o) => o.sp === s.id);
        for (const o of os) {
          const near = os.filter((x) => Math.hypot(x.p[0] - o.p[0], x.p[1] - o.p[1], x.p[2] - o.p[2]) < 1.5 + s.r * 2);
          if (near.length >= 3) {
            const c = [0, 1, 2].map((k) => near.reduce((a, x) => a + x.p[k], 0) / near.length);
            await cam(...frame(c, 3 + s.r * 2.5, 0.9));
            await page.waitForTimeout(600);
            await page.screenshot({ path: join(values.out, `cardume-${g}.png`) });
            console.log('cardume', s.name, near.length, 'juntos');
            got.cardume = true;
            break;
          }
        }
        if (got.cardume) break;
      }
    }
    if (!got.floresta) {
      // Fuga para a Floresta: com gancho, fora dela, um predador perto e andando para o centro dela.
      const preds = w.orgs.filter((o) => spOf.get(o.sp)?.diet?.kind === 'predator' || (spOf.get(o.sp)?.diet?.prey ?? []).length);
      const ganchos = w.orgs.filter((o) => has(spOf.get(o.sp)?.bp, 'gancho'));
      for (const o of ganchos) {
        const before = lastPos.get(o.id);
        if (!before) continue;
        const v = [o.p[0] - before[0], o.p[2] - before[2]];
        const speed = Math.hypot(v[0], v[1]);
        const to = [FLORESTA[0] - o.p[0], FLORESTA[2] - o.p[2]];
        const dTo = Math.hypot(to[0], to[1]);
        const dot = speed > 0 ? (v[0] * to[0] + v[1] * to[1]) / (speed * dTo) : 0;
        const hunter = preds.find((h) => h.sp !== o.sp && dist2(h.p, o.p) < 8);
        const outside = dTo > 30;
        if (outside && hunter && dot > 0.7 && speed > 0.15) {
          await page.evaluate((id) => window.__abyss.select(id), o.id);
          for (let k = 0; k < 3; k++) {
            await track(o.id, 4.5, 1200);
            await page.screenshot({ path: join(values.out, `floresta-gancho-${g}-${k}.png`) });
          }
          console.log('floresta', spOf.get(o.sp).name, o.id, `predador ${hunter.id}`, `a ${dTo.toFixed(1)} do centro`, `rumo·centro ${dot.toFixed(2)}`);
          got.floresta = true;
          break;
        }
      }
      lastPos = new Map(w.orgs.map((o) => [o.id, o.p]));
    }
    await page.waitForTimeout(1000);
  }
  console.log('extras', JSON.stringify(got));
  await browser.close();
}

if (phase === 'editor') await editor();
else if (phase === 'publish') await publish();
else if (phase === 'world') await world();
else throw new Error(`fase desconhecida: ${phase}`);
