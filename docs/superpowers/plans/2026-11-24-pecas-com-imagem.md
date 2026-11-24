# Peças com imagem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seção Peças da tela de criação vira uma grade de cartões (3 por linha) com a foto 3D de cada peça.

**Architecture:** Um módulo `genesis/partThumbnails.ts` monta, para cada tipo de peça, uma planta com só aquela peça, gera a geometria com `buildPartsGeometry` e o material com `createPartsMaterial`, e fotografa tudo num `WebGLRenderer` fora da tela. As 10 imagens viram data URLs, guardadas em memória para o resto da página. Um hook `usePartThumbnails()` entrega essas imagens ao `CreationScreen`. Sem WebGL, o hook devolve `null` e os cartões aparecem só com o texto.

**Tech Stack:** React 19, three.js, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-24-pecas-com-imagem-design.md`

## Global Constraints

- Cor das fotos fixa, da paleta do menu: brilho `PALETTE.cyan` (`#49D6D3`). A cor da espécie não entra.
- Um único renderizador, descartado depois de gerar as 10 imagens. As imagens são geradas uma vez por carregamento da página.
- `<img alt="">`: o nome no cartão é o rótulo acessível do botão.
- Os títulos de grupo continuam; cada grupo tem a sua grade de 3 colunas, alinhada à esquerda.
- O cartão continua sendo o botão de adicionar a peça: mesmo `onClick` e mesmo `disabled`, e "—" quando não cabe mais nenhuma.
- As verificações rodam sem `rtk`: `pnpm test` e `pnpm typecheck` em `apps/web`, e o resultado é dado pelo código de saída.

## Review Focus

- Navegador sem WebGL, ou falha ao criar o contexto: a tela abre normalmente, os cartões aparecem sem foto e nada é lançado (teste na Task 1).
- Peça espelhável (aleta, cílios…): a foto mostra uma instância só (`mirror: false`), para o enquadramento não variar (teste na Task 1).
- Nome acessível do botão: precisa continuar casando com `/Boca-filtro/`, `/Mandíbula/` etc., como nos testes que já existem (Task 2: os testes atuais têm que continuar passando).
- Abrir e fechar a tela de criação várias vezes não pode gerar as fotos de novo nem vazar contextos WebGL, por causa do cache do módulo (teste na Task 1).
- Painel estreito (360px) e mobile (largura total): o efeito quebra linha dentro do cartão sem estourar a largura (checagem visual na Task 3).

---

### Task 1: Gerador das fotos das peças

**Files:**
- Create: `apps/web/src/genesis/partThumbnails.ts`
- Test: `apps/web/src/genesis/partThumbnails.test.ts`

**Interfaces:**
- Consumes: `PART_KINDS`, `buildPartsGeometry(bp)` de `./geometry`; `createPartsMaterial()`, `applyBlueprint(m, bp)` de `./materials`; `INITIAL_BLUEPRINT`, `CATALOG` de `./blueprint`; `PALETTE` de `../lib/palette`.
- Produces:
  - `export type PartThumbnails = Record<PartKind, string>` (data URL por tipo)
  - `export function thumbnailBlueprint(kind: PartKind): Blueprint`
  - `export function renderPartThumbnails(): PartThumbnails | null`
  - `export function usePartThumbnails(): PartThumbnails | null`
  - `export function resetPartThumbnailsCache(): void` (só para testes)

- [ ] **Step 1: Write the failing tests**

```ts
it('thumbnailBlueprint: só a peça pedida, sem espelho, com as cores do menu', () => {
  for (const kind of PART_KINDS) {
    const bp = thumbnailBlueprint(kind);
    expect(bp.parts).toHaveLength(1);
    expect(bp.parts[0].kind).toBe(kind);
    expect(bp.parts[0].mirror).toBe(false);
    expect(bp.colors.glow.toLowerCase()).toBe(PALETTE.cyan.toLowerCase());
    expect(bp.body.spine).toEqual(INITIAL_BLUEPRINT.body.spine);
  }
});

it('renderPartThumbnails devolve null sem WebGL e não lança', () => {
  // jsdom não tem contexto webgl
  expect(() => renderPartThumbnails()).not.toThrow();
  expect(renderPartThumbnails()).toBeNull();
});

it('usePartThumbnails tenta gerar uma vez só por página', () => {
  resetPartThumbnailsCache();
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
  const a = renderHook(() => usePartThumbnails());
  a.unmount();
  const b = renderHook(() => usePartThumbnails());
  expect(b.result.current).toBeNull();
  const webglCalls = spy.mock.calls.filter(([t]) => String(t).startsWith('webgl'));
  expect(webglCalls.length).toBeLessThanOrEqual(1);
});
```

(Se o `WebGLRenderer` testar o contexto `webgl2` e depois o `webgl` na mesma tentativa, troque a contagem por "a segunda montagem não faz nenhuma chamada nova". O que importa é a falha também ficar no cache.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/genesis/partThumbnails.test.ts` (em `apps/web`)
Expected: FAIL, módulo não existe.

- [ ] **Step 3: Implement in `partThumbnails.ts`**

- `thumbnailBlueprint(kind)`: espinha de `INITIAL_BLUEPRINT`; uma peça com `at: 0.5`, `around: 0`, `size` no meio de `CATALOG.part_size`, `angle: 0`, `mirror: false`; `colors: { glow: PALETTE.cyan, body: PALETTE.teal }`; `pattern: 'liso'`.
- `renderPartThumbnails()`: dentro de um `try/catch` que devolve `null`, crie um canvas de 128×128 e `new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })` com fundo transparente. Para cada `kind`: geometria com `buildPartsGeometry`, material com `createPartsMaterial()` mais `applyBlueprint` (`uTime` e `uBeat` em 0, `uFade` 1), e uma `PerspectiveCamera` de fov 38. Enquadre pela `computeBoundingBox()` da geometria: não use a bounding sphere, que já vem com a folga de +0.3. A câmera fica de lado e um pouco acima, olhando para o centro da caixa, a uma distância que faça a maior dimensão ocupar uns 80% do quadro. Depois de `render`, guarde `canvas.toDataURL('image/png')` e descarte a geometria e o material. Ao final, `renderer.dispose()` e `renderer.forceContextLoss()`.
- `usePartThumbnails()`: cache no nível do módulo (`undefined` = ainda não tentou). Na primeira chamada, gere as fotos dentro de um `useEffect`, para não travar a primeira pintura, e guarde o resultado (também `null`). Nas seguintes, devolva o cache direto.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test src/genesis/partThumbnails.test.ts; echo "exit=$?"`
Expected: exit=0.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/src/genesis/partThumbnails.ts apps/web/src/genesis/partThumbnails.test.ts
rtk git commit -m "feat: fotos 3D das peças para a tela de criação"
```

### Task 2: Grade de cartões na seção Peças

**Files:**
- Modify: `apps/web/src/genesis/CreationScreen.tsx` (CSS `.gen-part`, ~linha 60; seção Peças, ~linhas 253-282)
- Test: `apps/web/src/genesis/CreationScreen.test.tsx`

**Interfaces:**
- Consumes: `usePartThumbnails(): PartThumbnails | null` da Task 1.

- [ ] **Step 1: Write the failing tests**

No topo do arquivo de teste, mocke o módulo com uma variável controlável:

```ts
let thumbs: Record<string, string> | null = null;
vi.mock('./partThumbnails', () => ({ usePartThumbnails: () => thumbs }));
afterEach(() => { thumbs = null; });

it('cartão de peça mostra a foto quando existe', () => {
  thumbs = Object.fromEntries(PART_KINDS.map((k) => [k, `data:image/png;base64,${k}`]));
  render(<Harness />);
  const btn = screen.getByRole('button', { name: /Raspador/ });
  const img = btn.querySelector('img');
  expect(img).not.toBeNull();
  expect(img!.getAttribute('src')).toBe('data:image/png;base64,raspador');
  expect(img!.getAttribute('alt')).toBe('');
});

it('sem fotos, o cartão aparece só com o texto', () => {
  render(<Harness />);
  const btn = screen.getByRole('button', { name: /Raspador/ });
  expect(btn.querySelector('img')).toBeNull();
  expect(btn).toHaveTextContent('come a flora');
  expect(btn).toHaveTextContent('+');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/genesis/CreationScreen.test.tsx`
Expected: o teste da foto FALHA (não há `img`).

- [ ] **Step 3: Implement**

- Em cada grupo, troque o contêiner das peças (`flex column`) por uma grade de `grid-template-columns: repeat(3, minmax(0, 1fr))` com `gap: 6px`.
- O `.gen-part` vira um cartão em coluna: a área da foto em cima, quadrada, com `aspect-ratio: 1`, até 64px e centralizada (um `<img alt="">` quando houver foto, ou um espaço vazio da mesma altura quando não houver, para os cartões ficarem alinhados). Embaixo vêm o nome (12px), o efeito (10px, `opacity: 0.65`, quebrando linha) e o custo em ciano (`+N` ou `—`). Mantenha a borda, o hover em ciano e o estado `disabled` que já existem.

- [ ] **Step 4: Run all web tests and typecheck**

Run: `pnpm test; echo "exit=$?"` e `pnpm typecheck; echo "exit=$?"`
Expected: os dois com exit=0, incluindo os testes antigos que buscam os botões por `/Boca-filtro/` e `/Mandíbula/`.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/src/genesis/CreationScreen.tsx apps/web/src/genesis/CreationScreen.test.tsx
rtk git commit -m "feat: peças em grade de cartões com imagem na tela de criação"
```

### Task 3: Ajuste visual no navegador

**Files:**
- Modify (só se preciso): `apps/web/src/genesis/partThumbnails.ts` (enquadramento/ângulo), `apps/web/src/genesis/CreationScreen.tsx` (tamanhos)

- [ ] **Step 1:** Suba o app (`pnpm dev` em `apps/web`), abra a tela de criação e tire screenshots com 360px de painel (desktop) e em largura mobile (≤760px).
- [ ] **Step 2:** Confira que as 10 peças aparecem reconhecíveis e centralizadas, sem cortes nem peça minúscula, que o efeito não estoura o cartão e que o "—" aparece nas peças esgotadas. Ajuste o enquadramento por tipo só se alguma peça destoar.
- [ ] **Step 3:** Rode de novo `pnpm test; echo "exit=$?"` e `pnpm typecheck; echo "exit=$?"`: exit=0 nos dois.
- [ ] **Step 4: Commit** (se houve ajuste)

```bash
rtk git add -u apps/web/src/genesis
rtk git commit -m "fix: enquadramento das fotos das peças"
```
