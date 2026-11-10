// Peças comuns dos e2e (`run.mjs` e `genesis.mjs`): preview do build, navegador, cenários e o E2E_NEGATE.
import { spawn, execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

export const exec = promisify(execFile);
export const PORT = process.env.E2E_PORT ?? '4175';
export const BASE = `http://localhost:${PORT}/`;
export const API = 'http://localhost:4000';
export const COMPOSE = 'infra/compose/compose.yaml';
export const NEGATE = process.env.E2E_NEGATE === '1';
export const LIVE_TIMEOUT = 30_000;

export async function waitHttp(url, timeoutMs) {
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

export const live = (page) => page.waitForFunction(() => window.__abyss?.status() === 'live', null, { timeout: LIVE_TIMEOUT });

export async function openWorld(context, query = '') {
  const page = await context.newPage();
  await page.goto(`${BASE}?debug=1${query}`, { waitUntil: 'load' });
  await live(page);
  return page;
}

/**
 * Asserção principal de um cenário, invertida com E2E_NEGATE=1 (para ver o cenário falhar uma vez
 * antes de confiar no verde).
 */
export function expectOk(ok, message) {
  if (NEGATE) assert.ok(!ok, `NEGATE: esperava o contrário (deve falhar): ${message}`);
  else assert.ok(ok, message);
}

const results = [];
export async function scenario(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err: String(err.message ?? err) });
    console.log(`FAIL ${name}\n  ${err.message ?? err}`);
  }
}

/** Reinicia a API e espera o /api/health responder de novo. */
export async function restartApi() {
  await exec('docker', ['compose', '-f', COMPOSE, 'restart', 'api'], { timeout: 120_000 });
  await waitHttp(`${API}/api/health`, 120_000);
}

/**
 * Sobe o preview do build em E2E_PORT e um Chromium com WebGL; roda `body(browser)` e derruba tudo.
 * Sai com 1 se algum cenário falhou.
 */
export async function withPreview(body) {
  await waitHttp(`${API}/api/health`, 10_000);
  const preview = spawn('pnpm', ['--filter', '@abyss/web', 'exec', 'vite', 'preview', '--port', PORT, '--strictPort'], {
    shell: true,
    stdio: 'ignore',
  });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  try {
    await waitHttp(BASE, 60_000);
    await body(browser);
  } finally {
    await browser.close();
    // No Windows, kill() só mata o shell: a árvore inteira precisa ir junto.
    if (process.platform === 'win32') await exec('taskkill', ['/PID', String(preview.pid), '/T', '/F']).catch(() => {});
    else preview.kill();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passaram${NEGATE ? ' (E2E_NEGATE=1: todos devem falhar)' : ''}`);
  process.exitCode = failed === 0 ? 0 : 1;
}
