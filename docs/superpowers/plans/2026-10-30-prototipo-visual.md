# The Abyss — Protótipo Visual: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma cena 3D local (Hydrothermal Garden) com o ambiente da referência e 4 criaturas abstratas com núcleo luminoso, pronta para revisão estética do autor.

**Architecture:** App Vite + React + R3F em `apps/web`. Lógica pura (aleatoriedade com semente, presets de qualidade, geradores de geometria, boids, estatísticas de frame) em módulos testáveis sem WebGL; componentes R3F finos por cima. Animação via `useFrame` + refs, nunca estado React por frame.

**Tech Stack:** pnpm 10, Node 24, Vite, React 19, TypeScript (strict), three, @react-three/fiber, @react-three/drei, @react-three/postprocessing, vitest + @testing-library/react + jsdom, Playwright (só script de captura).

**Spec:** `docs/superpowers/specs/2026-10-30-prototipo-visual-design.md` (recorte de `SPEC.md`). Ler os dois antes de começar.

## Global Constraints

- Paleta base: background `#020A10`, deep navy `#071821`, muted teal `#123C47`, cyan `#49D6D3`, violet `#8666C5`, thermal amber `#D8753B`, foreground `#DCEBE8`.
- Sem interface editorial (título, metadados, rótulos, painel Environment, dicas). Só cena + selo de demonstração + estados de carregamento/erro/sem-WebGL.
- Selo, texto exato: `Demonstração visual — não é um ecossistema real`.
- Criaturas não podem ler como peixe, água-viva ou raia. Todas têm núcleo; bioluminescência concentrada no núcleo; corpo e movimento distintos por criatura.
- Tudo procedural em código; nenhum asset binário de modelo. Sem backend, sem `apps/api/`.
- Nada de `setState` dentro de `useFrame`.
- Delta de frame sempre passado por `clampDelta` antes de alimentar simulação/animação.
- Verificações (`pnpm typecheck`, `pnpm test`, `pnpm build`) rodam **sem** `rtk`; vale o exit code.
- Commits: o autor ainda não fez nenhum commit. Antes da Task 1, confirmar com o autor que commits por task estão liberados; trabalhar no branch `prototipo-visual`.

## Review Focus

1. **Aba em segundo plano e volta:** delta gigante no primeiro frame não pode teletransportar criaturas nem explodir boids → `clampDelta` (Task 1) + teste de boids com dt grande (Task 8).
2. **`?quality=` inválido ou ausente:** deve cair em `high` sem erro → teste em Task 1.
3. **Navegador sem WebGL / contexto perdido:** mensagem estática legível, sem tela preta muda → teste em Task 2.
4. **Janela estreita (retrato, ~390px):** cena continua enquadrada, câmera não mostra borda → teste de config em Task 3 + captura em Task 9.
5. **`prefers-reduced-motion`:** movimento não essencial quase parado → teste de `motionScale` em Task 1, verificação visual em Task 9.

---

## Estrutura de arquivos

```
pnpm-workspace.yaml, package.json (root: scripts que delegam para apps/web)
.gitignore                       # node_modules, dist, .superpowers/, captures/
assets/references/hydrothermal-garden-reference.jpg   # movido da raiz
apps/web/
  index.html, vite.config.ts, tsconfig.json, package.json
  src/main.tsx, src/App.tsx
  src/lib/random.ts        # RNG com semente
  src/lib/quality.ts       # presets + parse da query
  src/lib/motion.ts        # clampDelta, motionScale
  src/lib/palette.ts       # tokens de cor
  src/lib/frameStats.ts    # p50/p95
  src/ui/                  # DemoBadge, LoadingOverlay, Fallback (sem-WebGL/erro)
  src/scene/               # Stage, cameraConfig, CameraRig, Lighting, Seabed, Effects
  src/scene/environment/   # Vents, Rocks, LightShafts, Particles, Corals, Pads, Tufts, coralGen.ts
  src/organisms/           # creatureConfig.ts, Nucleus, Membrana, Filamento, Casco, Esporos, boids.ts
  src/settings.tsx         # SceneSettingsContext
scripts/capture.mjs        # Playwright: screenshots
docs/ART_DIRECTION.md, docs/VISUAL_ACCEPTANCE.md, docs/captures/
```

Testes ficam ao lado do código: `*.test.ts(x)`.

---

### Task 1: Scaffold + lógica base

**Files:**
- Create: arquivos raiz do workspace, `apps/web/*` (Vite React TS), `src/lib/{random,quality,motion,palette}.ts` + testes
- Move: imagem de referência da raiz → `assets/references/hydrothermal-garden-reference.jpg`

**Interfaces:**
- Produces:
  - `createRng(seed: number): () => number` — determinístico, valores em `[0, 1)` (mulberry32).
  - `type QualityLevel = 'high' | 'low'`
  - `interface QualitySettings { maxDpr: number; particleCount: number; sporeCount: number; tuftCount: number; rockCount: number; postprocessing: boolean }`
  - `QUALITY: Record<QualityLevel, QualitySettings>` — `high`: maxDpr 1.5, particles 1500, spores 160, tufts 600, rocks 120, post true; `low`: maxDpr 1, particles 400, spores 60, tufts 200, rocks 50, post true (valores iniciais; recalibrar na Task 10).
  - `parseQuality(search: string): QualityLevel`
  - `clampDelta(dt: number): number` — limita a `[0, 0.05]`.
  - `motionScale(reduced: boolean): number` — `1` ou `0.08`.
  - `PALETTE` com as chaves `bg, navy, teal, cyan, violet, amber, fg` (Global Constraints).
- Root scripts: `pnpm dev`, `pnpm build`, `pnpm preview`, `pnpm test`, `pnpm typecheck`.

- [ ] **Step 1:** Criar branch `prototipo-visual` (após commit inicial de `SPEC.md` + `docs/`, se o autor liberar). Scaffold do workspace e de `apps/web`, instalar deps, `.gitignore`, mover a imagem.
- [ ] **Step 2: Testes que falham**
```ts
// random.test.ts
it('é determinístico por semente', () => { const a = createRng(42), b = createRng(42); expect([a(),a(),a()]).toEqual([b(),b(),b()]); });
it('fica em [0,1)', () => { const r = createRng(7); for (let i=0;i<10000;i++){ const v=r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1);} });
it('sementes diferentes divergem', () => expect(createRng(1)()).not.toBe(createRng(2)()));
// quality.test.ts
it('lê low', () => expect(parseQuality('?quality=low')).toBe('low'));
it('padrão high quando ausente', () => expect(parseQuality('')).toBe('high'));
it('padrão high quando inválido', () => expect(parseQuality('?quality=ultra')).toBe('high'));
it('low nunca excede high', () => { for (const k of ['maxDpr','particleCount','sporeCount','tuftCount','rockCount'] as const) expect(QUALITY.low[k]).toBeLessThanOrEqual(QUALITY.high[k]); });
// motion.test.ts
it('clampDelta corta aba em segundo plano', () => expect(clampDelta(12)).toBe(0.05));
it('clampDelta não aceita negativo', () => expect(clampDelta(-1)).toBe(0));
it('clampDelta preserva frame normal', () => expect(clampDelta(0.016)).toBe(0.016));
it('motionScale reduzido', () => expect(motionScale(true)).toBe(0.08));
```
- [ ] **Step 3:** `pnpm test` → FAIL (módulos inexistentes).
- [ ] **Step 4:** Implementar os módulos.
- [ ] **Step 5:** `pnpm test; echo "exit=$?"` → exit=0. `pnpm typecheck` → exit=0. `pnpm dev` abre página vazia sem erro no console.
- [ ] **Step 6:** Commit `chore: scaffold apps/web e lógica base`.

### Task 2: Casca do app (Canvas, estados, selo, settings)

**Files:**
- Create: `src/App.tsx`, `src/settings.tsx`, `src/ui/{DemoBadge,LoadingOverlay,Fallback}.tsx`, `src/ui/Fallback.test.tsx`, `src/App.test.tsx`
- Create: `src/lib/webgl.ts`

**Interfaces:**
- Consumes: `parseQuality`, `QUALITY`, `motionScale`, `PALETTE`.
- Produces:
  - `detectWebGL(): boolean` — tenta `canvas.getContext('webgl2') ?? getContext('webgl')`.
  - `interface SceneSettings { quality: QualityLevel; q: QualitySettings; motion: number; reducedMotion: boolean }`; `SceneSettingsProvider`, `useSceneSettings(): SceneSettings`. `reducedMotion` vem de `matchMedia('(prefers-reduced-motion: reduce)')` com listener.
  - `App({ webglAvailable?: boolean })` — default `detectWebGL()`. Renderiza `<Canvas dpr={[1, q.maxDpr]}>` com `<Stage/>` (placeholder vazio nesta task) dentro de `<Suspense>`, `LoadingOverlay` enquanto carrega, `DemoBadge` sempre, `Fallback` se sem WebGL, se o Canvas lançar erro (error boundary) ou em `webglcontextlost`.
- Visual: fundo `PALETTE.bg` no `body` e no Canvas; selo pequeno, canto inferior esquerdo, fonte mono 11px, cor `fg` a ~55% de opacidade.

- [ ] **Step 1: Testes que falham** (`jsdom`)
```tsx
it('sem WebGL mostra fallback e selo', () => {
  render(<App webglAvailable={false} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/WebGL/);
  expect(screen.getByText('Demonstração visual — não é um ecossistema real')).toBeInTheDocument();
});
it('Fallback de erro mostra mensagem legível', () => {
  render(<Fallback reason="error" />);
  expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível/i);
});
```
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** Implementar. Textos: sem WebGL → `Seu navegador não suporta WebGL, necessário para ver The Abyss.`; erro/contexto perdido → `Não foi possível renderizar a cena. Recarregue a página.`
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` → exit=0. `pnpm dev`: tela `#020A10` com selo.
- [ ] **Step 5:** Commit `feat: casca do app com estados e selo de demonstração`.

### Task 3: Palco — câmera, luz, névoa, leito, pós-processamento

**Files:**
- Create: `src/scene/{Stage,cameraConfig,CameraRig,Lighting,Seabed,Effects}.tsx|ts`, `src/scene/cameraConfig.test.ts`

**Interfaces:**
- Consumes: `useSceneSettings`, `PALETTE`, `createRng`.
- Produces:
  - `SEABED_RADIUS: number` (sugestão 60).
  - `CAMERA: { position: [number,number,number]; target: [number,number,number]; fov: number; minDistance: number; maxDistance: number; minPolarAngle: number; maxPolarAngle: number; minAzimuthAngle: number; maxAzimuthAngle: number; targetBounds: { x: [number,number]; y: [number,number]; z: [number,number] } }`
  - `fovForAspect(aspect: number): number` — FOV vertical que mantém a largura do enquadramento herói em telas estreitas; nunca abaixo de `CAMERA.fov`, nunca acima de 75.
  - `Stage` monta: `CameraRig`, `Lighting`, `<fogExp2>` cor `PALETTE.bg`, `Seabed`, `Effects` e, nas próximas tasks, ambiente e criaturas.
- `Seabed`: plano circular de raio `SEABED_RADIUS`, deslocamento por ruído suave (relevo raso), material escuro azul-esverdeado; névoa precisa engolir a borda.
- `CameraRig`: drei `OrbitControls` com os limites de `CAMERA`, damping; após cada mudança, clampa `target` em `targetBounds`. Sem zoom pelo scroll da página (a página não rola; usar `wheel` só dentro do canvas). Entrada lenta (~3 s) da posição inicial afastada até `CAMERA.position`, pulada se `reducedMotion`. A cada resize aplica `fovForAspect(width/height)` à câmera.
- `Lighting`: ambiente muito baixo, uma luz direcional fria e fraca de cima, ponto de luz âmbar na posição da chaminé herói (origem do mundo).
- `Effects`: Bloom com `luminanceThreshold` alto (≈0.6) e `mipmapBlur`, Vignette leve; só se `q.postprocessing`.

- [ ] **Step 1: Testes que falham**
```ts
it('zoom máximo + alvo extremo não ultrapassa a borda escondida pela névoa', () => {
  const farX = Math.max(...CAMERA.targetBounds.x.map(Math.abs));
  const farZ = Math.max(...CAMERA.targetBounds.z.map(Math.abs));
  expect(Math.hypot(farX, farZ) + CAMERA.maxDistance).toBeLessThan(SEABED_RADIUS * 0.8);
});
it('não deixa olhar por baixo do leito', () => expect(CAMERA.maxPolarAngle).toBeLessThan(Math.PI / 2));
it('tela retrato aumenta o FOV', () => expect(fovForAspect(390/844)).toBeGreaterThan(fovForAspect(16/9)));
it('FOV limitado', () => { expect(fovForAspect(0.2)).toBeLessThanOrEqual(75); expect(fovForAspect(3)).toBeGreaterThanOrEqual(CAMERA.fov); });
```
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` → exit=0. `pnpm dev`: leito escuro sumindo na névoa; girar/zoom não revela borda.
- [ ] **Step 5:** Commit `feat: palco com câmera limitada, luz, névoa e leito`.

### Task 4: Ambiente mineral — chaminés, rochas, raios de luz, partículas

**Files:**
- Create: `src/scene/environment/{Vents,Rocks,LightShafts,Particles}.tsx`, `src/scene/environment/layout.ts`, `layout.test.ts`

**Interfaces:**
- Consumes: `createRng`, `useSceneSettings`, `PALETTE`, `SEABED_RADIUS`, `clampDelta`.
- Produces:
  - `interface VentSpec { position: [number,number,number]; height: number; radius: number; hero: boolean }`; `VENTS: VentSpec[]` — 3 ou 4, exatamente 1 com `hero: true` na origem, os demais a < 6 unidades dela.
  - `scatter(rng, count, opts: { minR: number; maxR: number; avoid: { center: [number,number]; radius: number }[] }): [number, number][]` — pontos XZ no anel, fora das zonas `avoid`.
- Chaminés: colunas irregulares de poucos polígonos, escuras, com fissuras emissivas âmbar (shader: faixa de ruído vertical) e brilho no topo; pluma de partículas quentes subindo e se apagando.
- Rochas: instanciadas (`q.rockCount`), icosaedros deformados, escuras.
- Raios de luz: 3–5 planos/cones aditivos verticais muito fracos, ondulando devagar.
- Partículas: `q.particleCount` pontos em 3 camadas de profundidade, deriva com corrente lenta (`motion` multiplica a velocidade).

- [ ] **Step 1: Testes que falham**
```ts
it('exatamente uma chaminé herói na origem', () => { const h = VENTS.filter(v => v.hero); expect(h).toHaveLength(1); expect(h[0].position[0]).toBe(0); expect(h[0].position[2]).toBe(0); });
it('3 a 4 chaminés', () => { expect(VENTS.length).toBeGreaterThanOrEqual(3); expect(VENTS.length).toBeLessThanOrEqual(4); });
it('scatter respeita anel e zonas evitadas', () => {
  const pts = scatter(createRng(1), 500, { minR: 3, maxR: 40, avoid: [{ center: [0,0], radius: 5 }] });
  expect(pts).toHaveLength(500);
  for (const [x,z] of pts) { const r = Math.hypot(x,z); expect(r).toBeGreaterThanOrEqual(5); expect(r).toBeLessThanOrEqual(40); }
});
```
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes + typecheck exit=0; `pnpm dev` mostra chaminé herói central com fissuras âmbar.
- [ ] **Step 5:** Commit `feat: chaminés, rochas, raios de luz e partículas`.

### Task 5: Flora — corais ramificados, almofadas, tufos

**Files:**
- Create: `src/scene/environment/{coralGen.ts,coralGen.test.ts,Corals.tsx,Pads.tsx,Tufts.tsx}`

**Interfaces:**
- Consumes: `createRng`, `scatter`, `VENTS`, `useSceneSettings`, `PALETTE`.
- Produces:
  - `interface Segment { start: [number,number,number]; end: [number,number,number]; radius: number; depth: number }`
  - `generateCoral(rng: () => number, p: { depth: number; branchAngle: number; lengthDecay: number; radius: number; height: number }): Segment[]` — ramificação recursiva em 3D (2–3 filhos por nó); raio e comprimento decaem com a profundidade.
- Corais: 4–6 exemplares em 2–3 variedades (ciano, violeta, rosado escuro), cada um um único `BufferGeometry` mesclado de tubos; emissivo fraco mais forte nas pontas; balanço por shader de vértice proporcional à altura × `motion`.
- Almofadas: discos achatados com borda arredondada, emissivo ciano/violeta, pulsação lenta defasada.
- Tufos: instanciados (`q.tuftCount`), pequenos feixes de hastes com ponta luminosa ciano/âmbar, agrupados em manchas perto das chaminés.

- [ ] **Step 1: Testes que falham**
```ts
it('determinístico', () => expect(generateCoral(createRng(3), P)).toEqual(generateCoral(createRng(3), P)));
it('raio nunca cresce com a profundidade', () => { const s = generateCoral(createRng(3), P); for (const a of s) for (const b of s) if (b.depth > a.depth) expect(b.radius).toBeLessThanOrEqual(a.radius); });
it('respeita profundidade máxima', () => expect(Math.max(...generateCoral(createRng(3), P).map(s => s.depth))).toBeLessThanOrEqual(P.depth));
it('nada abaixo do chão', () => { for (const s of generateCoral(createRng(3), P)) expect(Math.min(s.start[1], s.end[1])).toBeGreaterThanOrEqual(0); });
```
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes + typecheck exit=0; flora visível e balançando.
- [ ] **Step 5:** Commit `feat: corais, almofadas e tufos`.

### Task 6: Base das criaturas + Núcleo + Membrana

**Files:**
- Create: `src/organisms/{creatureConfig.ts,creatureConfig.test.ts,Nucleus.tsx,Membrana.tsx,Creatures.tsx}`

**Interfaces:**
- Consumes: `useSceneSettings`, `PALETTE`, `clampDelta`.
- Produces:
  - `interface NucleusConfig { color: string; radius: number; pulseHz: number; pulseMin: number; pulseMax: number }`
  - `nucleusPulse(t: number, n: NucleusConfig): number` — senoide suavizada em `[pulseMin, pulseMax]`.
  - `Nucleus({ config }: { config: NucleusConfig })` — esfera emissiva intensa (acima do threshold do bloom) + halo sprite aditivo; intensidade = `nucleusPulse`. Expõe a intensidade atual via `ref` para o corpo reagir.
  - `interface MembranaConfig { nucleus: NucleusConfig; radius: number; wobble: number; thickness: number; driftRadius: number; driftSpeed: number }`, `MEMBRANA: MembranaConfig`.
  - `Creatures` monta todas as criaturas (as próximas tasks adicionam aqui).
- Membrana: icosfera densa deslocada por ruído 3D no vertex shader; fragment com efeito Fresnel (borda ciano, centro quase transparente, violeta tênue), sem escrita em profundidade, blending normal; corpo expande/contrai sincronizado ao pulso do núcleo. Deriva lenta em órbita larga perto da chaminé herói, altura ~3–5. Tamanho herói (a maior criatura).

- [ ] **Step 1: Testes que falham**
```ts
it('pulso fica no intervalo', () => { for (let t=0;t<20;t+=0.013){ const v = nucleusPulse(t, MEMBRANA.nucleus); expect(v).toBeGreaterThanOrEqual(MEMBRANA.nucleus.pulseMin); expect(v).toBeLessThanOrEqual(MEMBRANA.nucleus.pulseMax);} });
it('pulso tem período 1/pulseHz', () => { const n = MEMBRANA.nucleus; expect(nucleusPulse(0.3, n)).toBeCloseTo(nucleusPulse(0.3 + 1/n.pulseHz, n), 6); });
```
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes + typecheck exit=0; Membrana visível, respirando, núcleo puxando o bloom sem estourar a cena.
- [ ] **Step 5:** Commit `feat: núcleo e criatura Membrana`.

### Task 7: Filamento e Casco

**Files:**
- Create: `src/organisms/{Filamento.tsx,Casco.tsx,paths.ts,paths.test.ts}`; Modify: `creatureConfig.ts`, `Creatures.tsx`

**Interfaces:**
- Consumes: `Nucleus`, `NucleusConfig`, `nucleusPulse`, `clampDelta`, `useSceneSettings`.
- Produces:
  - `lissajousPath(t: number, p: { ax: number; ay: number; az: number; fx: number; fy: number; fz: number; center: [number,number,number] }): [number,number,number]`
  - `FILAMENTO`, `CASCO` configs (cada uma com `nucleus: NucleusConfig`).
- Filamento: núcleo na cabeça percorrendo `lissajousPath` amplo pelo meio da cena; corpo = tubo/fita que segue o histórico de posições da cabeça (buffer circular de ~60 amostras), afinando até a cauda; ondulação lateral senoidal; emissivo forte perto da cabeça decaindo até zero na cauda (influência aprovada do rascunho 2D).
- Casco: poliedro facetado (ex.: dodecaedro com vértices perturbados e faces levemente afastadas), material opaco escuro e fosco; núcleo dentro, luz vazando pelas frestas entre faces (faces encolhidas em direção ao próprio centro). Movimento: pairar quase parado, rotação lenta em eixo que muda devagar, "ajuste" brusco curto a cada 6–12 s.

- [ ] **Step 1: Testes que falham**
```ts
it('caminho limitado pela amplitude', () => { for (let t=0;t<100;t+=0.1){ const [x,y,z] = lissajousPath(t, LP); expect(Math.abs(x - LP.center[0])).toBeLessThanOrEqual(LP.ax); expect(Math.abs(y - LP.center[1])).toBeLessThanOrEqual(LP.ay); expect(Math.abs(z - LP.center[2])).toBeLessThanOrEqual(LP.az);} });
it('Filamento fica acima do leito', () => { const p = FILAMENTO.path; expect(p.center[1] - p.ay).toBeGreaterThan(0.5); });
it('núcleos com cores ou ritmos distintos', () => { const ns = [MEMBRANA, FILAMENTO, CASCO].map(c => `${c.nucleus.color}@${c.nucleus.pulseHz}`); expect(new Set(ns).size).toBe(3); });
```
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes + typecheck exit=0; os três se movendo de jeitos claramente diferentes.
- [ ] **Step 5:** Commit `feat: criaturas Filamento e Casco`.

### Task 8: Cardume de esporos (boids)

**Files:**
- Create: `src/organisms/{boids.ts,boids.test.ts,Esporos.tsx}`; Modify: `creatureConfig.ts`, `Creatures.tsx`

**Interfaces:**
- Consumes: `createRng`, `clampDelta`, `useSceneSettings`, `NucleusConfig`.
- Produces:
  - `interface BoidState { pos: Float32Array; vel: Float32Array; count: number }` (xyz intercalado)
  - `interface BoidParams { bounds: { min: [number,number,number]; max: [number,number,number] }; maxSpeed: number; neighborRadius: number; separation: number; alignment: number; cohesion: number; burstChance: number }`
  - `createBoids(count: number, rng: () => number, p: BoidParams): BoidState`
  - `stepBoids(s: BoidState, dt: number, p: BoidParams, rng: () => number): void` — muta in place; grade espacial simples para vizinhos; força de retorno suave perto dos limites; "arrancadas" ocasionais (`burstChance`) seguidas de pausa.
  - `ESPOROS: { nucleus: NucleusConfig; boids: BoidParams }`
- Visual: `InstancedMesh` de `q.sporeCount` criaturas mínimas: núcleo emissivo pequeno + casca translúcida fina; cor por instância variando entre cyan e amber de baixa saturação; orientação pela velocidade. `dt` passa por `clampDelta` e é multiplicado por `motion`.

- [ ] **Step 1: Testes que falham**
```ts
it('ninguém foge dos limites em 2000 passos', () => { const s = createBoids(100, createRng(9), P); const r = createRng(10); for (let i=0;i<2000;i++) stepBoids(s, 1/60, P, r); for (let i=0;i<s.count;i++) for (let k=0;k<3;k++){ const v = s.pos[i*3+k]; expect(v).toBeGreaterThanOrEqual(P.bounds.min[k]-1); expect(v).toBeLessThanOrEqual(P.bounds.max[k]+1);} });
it('velocidade nunca passa do máximo', () => { /* mesmo loop; |vel| <= maxSpeed * 1.001 */ });
it('dt grande não explode (aba em segundo plano)', () => { const s = createBoids(100, createRng(9), P); stepBoids(s, 5, P, createRng(1)); expect([...s.pos].every(Number.isFinite)).toBe(true); });
it('determinístico com mesma semente', () => { /* duas execuções idênticas → pos iguais */ });
```
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes + typecheck exit=0; cardume se movendo em grupo, sem parecer peixes.
- [ ] **Step 5:** Commit `feat: cardume de esporos`.

### Task 9: Captura e iteração de arte

**Files:**
- Create: `scripts/capture.mjs`, `docs/ART_DIRECTION.md`, `docs/captures/*.png`; Modify: qualquer arquivo de cena/criatura para calibração

**Interfaces:**
- `node scripts/capture.mjs [--url http://localhost:4173] [--quality high|low] [--out captures/]` — Playwright Chromium com `--enable-gpu --use-angle=d3d11 --ignore-gpu-blocklist`; registra no console o `UNMASKED_RENDERER_WEBGL` e **aborta se for SwiftShader** (aí rodar com `headless: false`). Espera 6 s de cena estável. Captura: `desktop-1440x900.png`, `desktop-2560x1600.png`, `narrow-390x844.png`, `reduced-motion-1440x900.png` (`reducedMotion: 'reduce'`), e uma sequência de 8 quadros a 0.5 s em 1440×900 para avaliar movimento.

- [ ] **Step 1:** Escrever o script; `pnpm build && pnpm preview` + `node scripts/capture.mjs` → 4 PNGs + sequência em `captures/`, renderer não-SwiftShader no log.
- [ ] **Step 2:** Comparar `desktop-1440x900.png` lado a lado com a referência (proporção 16:10 igual). Avaliar contra os critérios 1–5 do design §9: preto profundo com formas legíveis, núcleos e flora claros sem superexposição, âmbar subordinado, primeiro plano/meio/fundo, foco herói, movimentos distintos.
- [ ] **Step 3:** Ajustar luz, névoa, bloom, cores, câmera e posicionamento; recapturar. Repetir até os critérios estarem atendidos na avaliação do próprio implementador. Problema de *forma* que código não resolve → anotar como candidato a Blender, não forçar.
- [ ] **Step 4:** Verificar `narrow-390x844.png` (enquadrado, sem borda) e `reduced-motion` (sequência quase estática).
- [ ] **Step 5:** Escrever `docs/ART_DIRECTION.md`: paleta final, decisões de luz/névoa/bloom, material de cada criatura e flora. Copiar capturas finais para `docs/captures/`.
- [ ] **Step 6:** `pnpm test`, `pnpm typecheck`, `pnpm build` → exit=0. Commit `art: calibração visual e direção de arte`.

### Task 10: Desempenho e pacote de revisão

**Files:**
- Create: `src/lib/frameStats.ts`, `frameStats.test.ts`, `src/ui/PerfProbe.tsx`, `docs/VISUAL_ACCEPTANCE.md`; Modify: `App.tsx`, `quality.ts` (recalibração)

**Interfaces:**
- Produces:
  - `percentile(samples: number[], p: number): number` (interpolação linear; array vazio → `NaN`)
  - `PerfProbe` — ativo só com `?perf=1`: coleta frame times por 10 s após 5 s de aquecimento, então escreve no console e em `window.__abyssPerf` `{ renderer, quality, dpr, width, height, p50, p95, drawCalls }` (`gl.info.render.calls`).

- [ ] **Step 1: Testes que falham**
```ts
it('p50 de 1..100', () => expect(percentile(Array.from({length:100},(_,i)=>i+1), 50)).toBeCloseTo(50.5));
it('p95', () => expect(percentile(Array.from({length:100},(_,i)=>i+1), 95)).toBeCloseTo(95.05));
it('vazio é NaN', () => expect(percentile([], 50)).toBeNaN());
it('não muta a entrada', () => { const a=[3,1,2]; percentile(a,50); expect(a).toEqual([3,1,2]); });
```
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes exit=0.
- [ ] **Step 5:** Medir em 1920×1080 com `?perf=1`: RTX 4070 (`high`) e Intel Arc (`low`; forçar GPU integrada em Configurações do Windows → Gráficos para o navegador). Ajustar `QUALITY` se `low` na Arc ficar com p95 > 33 ms ou `high` na RTX com p50 > 16.7 ms. Sem alegar meta não medida.
- [ ] **Step 6:** Escrever `docs/VISUAL_ACCEPTANCE.md`: tabela de medições (GPU, navegador, resolução, DPR, preset, p50, p95, draw calls), lista de desvios em relação à referência, candidatos a Blender (se houver), links para `docs/captures/`.
- [ ] **Step 7:** `pnpm test`, `pnpm typecheck`, `pnpm build` → exit=0. Commit `perf: medição e pacote de revisão visual`.
- [ ] **Step 8:** Apresentar ao autor: capturas, `pnpm preview` rodando e o documento de aceite. **A etapa só fecha com aprovação explícita dele.**
