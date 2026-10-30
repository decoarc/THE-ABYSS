// Captura de screenshots da cena para revisão visual.
// Uso: node scripts/capture.mjs [--url http://localhost:4173] [--quality high|low] [--out captures/] [--headed]
// Precisa de `pnpm build && pnpm preview` rodando (ou --url apontando para o dev server).
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173' },
    quality: { type: 'string', default: 'high' },
    out: { type: 'string', default: 'captures/' },
    headed: { type: 'boolean', default: false },
  },
});

const SETTLE_MS = 6000;
const SEQUENCE_FRAMES = 8;
const SEQUENCE_INTERVAL_MS = 500;

const browser = await chromium.launch({
  headless: !values.headed,
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'],
});

async function open({ width, height, reducedMotion = 'no-preference' }) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const url = new URL(values.url);
  url.searchParams.set('quality', values.quality);
  await page.goto(url.toString());
  await page.waitForSelector('canvas');
  await page.waitForTimeout(SETTLE_MS);
  return { page, errors };
}

await mkdir(values.out, { recursive: true });

// Renderer real: SwiftShader (software) não serve para avaliar a cena.
{
  const { page } = await open({ width: 320, height: 200 });
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconhecido';
  });
  console.log(`renderer: ${renderer}`);
  await page.close();
  if (/swiftshader/i.test(renderer)) {
    console.error('Renderer é SwiftShader (software). Rode de novo com --headed.');
    await browser.close();
    process.exit(1);
  }
}

const shots = [
  { name: 'desktop-1440x900.png', width: 1440, height: 900 },
  { name: 'desktop-2560x1600.png', width: 2560, height: 1600 },
  { name: 'narrow-390x844.png', width: 390, height: 844 },
  { name: 'reduced-motion-1440x900.png', width: 1440, height: 900, reducedMotion: 'reduce' },
];

let failed = false;
for (const shot of shots) {
  const { page, errors } = await open(shot);
  await page.screenshot({ path: join(values.out, shot.name) });
  console.log(`ok ${shot.name}`);
  if (shot.reducedMotion) {
    for (let i = 0; i < SEQUENCE_FRAMES; i++) {
      await page.screenshot({ path: join(values.out, `reduced-seq-${i}.png`) });
      await page.waitForTimeout(SEQUENCE_INTERVAL_MS);
    }
  }
  if (errors.length) {
    failed = true;
    console.error(`erros em ${shot.name}:\n  ${errors.join('\n  ')}`);
  }
  await page.close();
}

{
  const { page } = await open({ width: 1440, height: 900 });
  for (let i = 0; i < SEQUENCE_FRAMES; i++) {
    await page.screenshot({ path: join(values.out, `seq-${i}.png`) });
    await page.waitForTimeout(SEQUENCE_INTERVAL_MS);
  }
  console.log(`ok seq-0..${SEQUENCE_FRAMES - 1}.png`);
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
