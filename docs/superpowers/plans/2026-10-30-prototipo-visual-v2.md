# The Abyss — Protótipo Visual 2: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir a cena do protótipo 1 com luz no chão (poças, sedimento, pedras, brilho da vida no leito), Filamento redesenhado, duas criaturas sólidas novas (Célula e Poliedro) e sem os Esporos.

**Architecture:** Mesmo app `apps/web`. Lógica pura nova (layout dos raios, poças, registro de brilhos no chão, pulso viajante, pose da Célula, giro do Poliedro) em módulos testáveis sem WebGL; o leito ganha shader próprio que lê esses dados. Animação continua por `useFrame` + refs.

**Tech Stack:** a mesma da v1 (Vite, React 19, TS strict, three, R3F, drei, postprocessing, vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-10-30-prototipo-visual-v2-design.md` (e a da v1, `2026-10-30-prototipo-visual-design.md`, para regras que continuam valendo).

## Global Constraints

- Todas as regras da v1 continuam: paleta, sem interface editorial, selo `Demonstração visual — não é um ecossistema real`, tudo procedural, nada de `setState` em `useFrame`, todo delta por `clampDelta`, verificações sem `rtk`, exit code manda.
- Elenco final: Membrana, Filamento, Casco, Célula, Poliedro. Esporos removidos (com `boids.ts` e `sporeCount`).
- Toda criatura tem núcleo que pulsa; cor+frequência de núcleo distintas entre as cinco.
- Chão mais visível sem perder o terço de cima quase preto; âmbar continua acento.
- Desempenho: Arc `low` p95 ≤ 33 ms; RTX `high` p50 ≤ 16,7 ms.
- A v1 continua recuperável pela tag `prototipo-1`; capturas da v2 vão em `docs/captures/v2/` sem apagar as da v1.
- Branch `prototipo-visual`, commit por task, sem push.

## Review Focus

1. **Aba em segundo plano e volta** com as criaturas novas: Célula e Poliedro não podem saltar → `cellPose` testado com `t` grande (Task 4); ambos usam `clampDelta`.
2. **Mais fontes de brilho no chão do que o shader suporta:** excesso é ignorado, sem erro → teste do registro (Task 2).
3. **`prefers-reduced-motion`:** Célula, flagelos, pulsos do Filamento e giro do Poliedro a `motion` → verificado em captura (Task 6).
4. **Preset `low` na Intel Arc** com material de cristal (transmissão) do Poliedro: pode custar caro → medição (Task 7); se estourar, `low` troca para material sem transmissão (flag `crystal` em `QualitySettings`, Task 5).
5. **Janela estreita (390px):** as cinco criaturas e as poças continuam enquadradas → captura (Task 6).

---

## Estrutura de arquivos

```
src/lib/quality.ts                      # remove sporeCount; rockCount maior; adiciona crystal
src/scene/environment/shaftLayout.ts    # SHAFTS (puro) + shaftPool()
src/scene/floorGlow.ts                  # registro de fontes de brilho no chão (puro)
src/scene/Seabed.tsx                    # shader próprio: sedimento, poças, brilhos
src/scene/environment/{LightShafts,Rocks}.tsx   # lêem SHAFTS / mais pedras médias
src/organisms/pulse.ts                  # travelingPulse (puro)
src/organisms/{Celula,Poliedro}.tsx, cellPose.ts
src/organisms/creatureConfig.ts         # remove ESPOROS; FILAMENTO novo; CELULA, POLIEDRO
remover: src/organisms/{Esporos.tsx,boids.ts,boids.test.ts}
```

---

### Task 1: Remover Esporos e preparar layout dos raios

**Files:**
- Delete: `src/organisms/Esporos.tsx`, `src/organisms/boids.ts`, `src/organisms/boids.test.ts`
- Modify: `src/organisms/creatureConfig.ts` (remove `EsporosConfig`, `ESPOROS`, import de `boids`), `src/organisms/Creatures.tsx`, `src/lib/quality.ts`, `src/lib/quality.test.ts`
- Create: `src/scene/environment/shaftLayout.ts`, `shaftLayout.test.ts`; Modify: `LightShafts.tsx` (importa `SHAFTS`)

**Interfaces:**
- Produces:
  - `QualitySettings` sem `sporeCount`, com `crystal: boolean`; `high`: rockCount 280, crystal true; `low`: rockCount 120, crystal true (recalibrar na Task 7).
  - `interface ShaftSpec { x: number; z: number; tilt: number; radius: number; strength: number }`; `SHAFTS: ShaftSpec[]` (os 4 da v1); `SHAFT_HEIGHT = 26`.
  - `shaftFootprint(s: ShaftSpec): [number, number]` — ponto XZ onde o eixo inclinado do raio toca y=0 (o cone gira `tilt` em Z em torno do centro a `SHAFT_HEIGHT/2 - 1`).
  - `shaftPool(x: number, z: number): number` — soma de gaussianas nas pegadas, peso `strength/0.06`, sigma = `radius`; em `[0, 1]` (saturar).

- [ ] **Step 1: Testes que falham**
```ts
it('pegada de raio vertical fica embaixo dele', () => expect(shaftFootprint({ x: 2, z: -3, tilt: 0, radius: 2, strength: 0.05 })).toEqual([2, -3]));
it('inclinação desloca a pegada em x', () => expect(shaftFootprint({ x: 0, z: 0, tilt: 0.1, radius: 2, strength: 0.05 })[0]).not.toBeCloseTo(0));
it('poça máxima na pegada e some longe', () => { const [x, z] = shaftFootprint(SHAFTS[0]); expect(shaftPool(x, z)).toBeGreaterThan(shaftPool(x + 6, z)); expect(shaftPool(200, 200)).toBeLessThan(1e-3); });
it('poça nunca passa de 1', () => { for (let x = -20; x <= 20; x += 0.5) for (let z = -25; z <= 10; z += 0.5) expect(shaftPool(x, z)).toBeLessThanOrEqual(1); });
// quality.test.ts: a lista de chaves do teste "low nunca excede high" perde 'sporeCount'
```
- [ ] **Step 2:** `pnpm test` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar; remover Esporos e o que só ele usava. `pnpm typecheck` não pode acusar referência pendente.
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` → exit=0; cena abre sem cardume.
- [ ] **Step 5:** Commit `refactor: remove esporos e extrai layout dos raios de luz`.

### Task 2: Luz no chão — sedimento, poças, brilho da vida, pedras

**Files:**
- Create: `src/scene/floorGlow.ts`, `floorGlow.test.ts`
- Modify: `src/scene/Seabed.tsx` (shader próprio via `foggyShader`), `src/scene/environment/Rocks.tsx`, `Corals.tsx`, `Pads.tsx` (registram brilho estático)

**Interfaces:**
- Consumes: `shaftPool`/`SHAFTS`/`shaftFootprint`, `seabedHeight`, `terrainNoise`, `foggyShader`, `SNOISE`.
- Produces:
  - `MAX_FLOOR_GLOWS = 16`
  - `interface FloorGlow { x: number; z: number; radius: number; color: [number, number, number]; intensity: number }`
  - `createFloorGlowStore(): { set(slot: number, g: FloorGlow): void; clear(slot: number): void; pack(pos: Float32Array, col: Float32Array): number }` — `pos` tem 4 floats por slot (x, z, radius, intensity), `col` 3 por slot; `pack` devolve quantos slots ativos escreveu; slot fora de `[0, MAX)` é ignorado.
  - `floorGlows` — instância única do store, usada pelo leito e por quem emite.
  - Slots: 0–7 estáticos (corais e manchas de almofadas, alocados na ordem de montagem), 8–15 criaturas (Membrana 8, Filamento 9, Casco 10, Célula 11, Poliedro 12).
- Leito: shader com (a) sedimento: tom base entre `navy` e `teal` modulado por ruído fino de 2 escalas e manchas largas; (b) luz difusa fraca de cima × normal; (c) `+ shaftPool`-equivalente no shader (uniform array das pegadas, mesmo falloff) em cor `#7fb8c4`, intensidade máxima ≈ 0,35; (d) soma dos brilhos com falloff `(1 - d/r)^2`; (e) névoa. Poças e brilhos só em XZ (chão inteiro), não iluminam pedras.
- Pedras: distribuição com mais pedras médias (tamanho típico 0,25–0,6), cor mais escura que o sedimento claro.

- [ ] **Step 1: Testes que falham**
```ts
it('pack devolve só os slots ativos', () => { const s = createFloorGlowStore(); s.set(0, G); s.set(3, G); const p = new Float32Array(64), c = new Float32Array(48); expect(s.pack(p, c)).toBe(2); });
it('slot fora do intervalo é ignorado', () => { const s = createFloorGlowStore(); s.set(MAX_FLOOR_GLOWS, G); s.set(-1, G); expect(s.pack(new Float32Array(64), new Float32Array(48))).toBe(0); });
it('clear libera o slot', () => { const s = createFloorGlowStore(); s.set(2, G); s.clear(2); expect(s.pack(new Float32Array(64), new Float32Array(48))).toBe(0); });
it('pack escreve posição e cor', () => { const s = createFloorGlowStore(); s.set(5, { x: 1, z: 2, radius: 3, color: [0.1, 0.2, 0.3], intensity: 0.5 }); const p = new Float32Array(64), c = new Float32Array(48); s.pack(p, c); expect([...p.slice(0, 4)]).toEqual([1, 2, 3, 0.5]); expect([...c.slice(0, 3)].map((v) => +v.toFixed(3))).toEqual([0.1, 0.2, 0.3]); });
```
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes + typecheck exit=0; captura mostra poças sob os raios e chão legível sem clarear o terço de cima.
- [ ] **Step 5:** Commit `feat: luz no chão com sedimento, poças e brilho da vida`.

### Task 3: Filamento redesenhado

**Files:**
- Create: `src/organisms/pulse.ts`, `pulse.test.ts`; Modify: `creatureConfig.ts` (`FILAMENTO`), `Filamento.tsx`

**Interfaces:**
- Produces:
  - `travelingPulse(u: number, t: number, p: { speed: number; spacing: number; width: number }): number` — trem de pulsos em `[0, 1]` ao longo de `u ∈ [0,1]` (0 = cabeça), movendo-se para a cauda a `speed` (u/s), um pulso a cada `spacing` de `u`, largura `width`. Mesma fórmula reproduzida no shader.
  - `FilamentoConfig` ganha `pulses: { speed: number; spacing: number; width: number }`; `FILAMENTO`: `width` 0.42, `flatness` 0.22, comprimento do corpo ≈ 4,5 (ajustar `lag`/`segments`), `pulses: { speed: 0.35, spacing: 0.3, width: 0.06 }`. Escreve brilho no chão no slot 9.
- Visual: corpo brilha no comprimento todo (base `mix(1, 0.3, u)`), pulsos somados por cima, cauda ainda afina; ondulação lateral maior e mais lenta; nucleus maior que na v1.

- [ ] **Step 1: Testes que falham**
```ts
const P = { speed: 0.35, spacing: 0.3, width: 0.06 };
it('fica em [0,1]', () => { for (let u = 0; u <= 1; u += 0.01) for (let t = 0; t < 5; t += 0.1) { const v = travelingPulse(u, t, P); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); } });
it('pulso anda em direção à cauda', () => { const peak = (t: number) => { let best = 0, at = 0; for (let u = 0; u <= P.spacing; u += 0.001) { const v = travelingPulse(u, t, P); if (v > best) { best = v; at = u; } } return at; }; expect(peak(0.2)).toBeGreaterThan(peak(0.1)); });
it('periódico no espaço', () => expect(travelingPulse(0.1, 1, P)).toBeCloseTo(travelingPulse(0.1 + P.spacing, 1, P), 6));
```
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes + typecheck exit=0; Filamento lê como linha de luz larga, não ponto com rabo.
- [ ] **Step 5:** Commit `feat: filamento maior com pulsos viajando pelo corpo`.

### Task 4: Célula

**Files:**
- Create: `src/organisms/cellPose.ts`, `cellPose.test.ts`, `src/organisms/Celula.tsx`; Modify: `creatureConfig.ts`, `Creatures.tsx`

**Interfaces:**
- Consumes: `Nucleus`, `NucleusConfig`, `clampDelta`, `floorGlows` (slot 11).
- Produces:
  - `interface CelulaConfig { nucleus: NucleusConfig; length: number; radius: number; granules: number; flagella: number; from: [number,number,number]; to: [number,number,number]; speed: number; turnSeconds: number; rollSpeed: number }`
  - `CELULA`: corpo ~1,6 de comprimento, raio ~0,38, 14 grânulos, 3 flagelos, trajeto no meio-plano esquerdo (ex.: `from [-7.5, 2.4, 1.5]`, `to [-2.5, 2.9, 5.5]`), `speed` 0.35, `turnSeconds` 3.
  - `cellPose(t: number, c: CelulaConfig): { position: [number,number,number]; heading: [number,number,number]; roll: number }` — vai e volta entre `from` e `to` (ping-pong), desacelerando e virando suavemente perto das pontas durante `turnSeconds`; `heading` unitário; `roll = t * rollSpeed`.
- Visual: cápsula (`CapsuleGeometry`) cerosa, translúcida grossa (alpha ~0,85): base esverdeada-oliva escura, luz do núcleo tingindo de dentro (mais forte onde a parede é fina, `facing^2`), brilho especular suave; grânulos (instanciados, escuros, alguns levemente emissivos) dentro, desenhados antes do corpo; flagelos = tubos finos na traseira ondulando senoidalmente. Não pode ler como pílula: corpo levemente irregular (ruído baixo), proporção não perfeita.

- [ ] **Step 1: Testes que falham**
```ts
it('fica entre as pontas', () => { for (let t = 0; t < 200; t += 0.37) { const { position: p } = cellPose(t, CELULA); for (let k = 0; k < 3; k++) { expect(p[k]).toBeGreaterThanOrEqual(Math.min(CELULA.from[k], CELULA.to[k]) - 1e-6); expect(p[k]).toBeLessThanOrEqual(Math.max(CELULA.from[k], CELULA.to[k]) + 1e-6); } } });
it('heading unitário', () => { for (let t = 0; t < 60; t += 0.5) expect(Math.hypot(...cellPose(t, CELULA).heading)).toBeCloseTo(1, 5); });
it('não salta: velocidade limitada', () => { for (let t = 0; t < 60; t += 0.05) { const a = cellPose(t, CELULA).position, b = cellPose(t + 0.05, CELULA).position; expect(Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]) / 0.05).toBeLessThanOrEqual(CELULA.speed * 1.05); } });
it('t muito grande continua finito', () => expect(cellPose(1e6, CELULA).position.every(Number.isFinite)).toBe(true));
```
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes + typecheck exit=0; Célula visível, sólida e orgânica.
- [ ] **Step 5:** Commit `feat: criatura Célula`.

### Task 5: Poliedro

**Files:**
- Create: `src/organisms/Poliedro.tsx`; Modify: `creatureConfig.ts`, `creatureConfig.test.ts`, `paths.test.ts` (teste de núcleos distintos passa a cobrir os cinco), `Creatures.tsx`

**Interfaces:**
- Consumes: `Nucleus`, `useSceneSettings().q.crystal`, `floorGlows` (slot 12).
- Produces:
  - `interface PoliedroConfig { nucleus: NucleusConfig; radius: number; position: [number,number,number]; spinAxis: [number,number,number]; spinSpeed: number; bob: number }`
  - `POLIEDRO`: dodecaedro inteiro, `radius` 1.2 (maior que `CASCO.radius`), posição no alto à esquerda (ex.: `[-5.5, 5.4, -4.5]`), `spinSpeed` 0.18 rad/s constante, eixo fixo levemente inclinado.
- Visual: dodecaedro liso de arestas nítidas (`flatShading`). Com `q.crystal`: `MeshPhysicalMaterial` cristal fosco (transmission ~0,9, roughness ~0,35, thickness ~1,2, ior ~1,45, tom frio leve) com o núcleo dentro, faces pegando as luzes da cena; sem `crystal`: `MeshStandardMaterial` pedra polida escura com emissivo fraco da cor do núcleo. Giro perfeitamente regular; sobe e desce `bob` bem devagar.

- [ ] **Step 1: Testes que falham**
```ts
it('núcleos das cinco criaturas distintos', () => { const ns = [MEMBRANA, FILAMENTO, CASCO, CELULA, POLIEDRO].map((c) => `${c.nucleus.color}@${c.nucleus.pulseHz}`); expect(new Set(ns).size).toBe(5); });
it('Poliedro maior que o Casco', () => expect(POLIEDRO.radius).toBeGreaterThan(CASCO.radius));
it('Poliedro acima do leito', () => expect(POLIEDRO.position[1] - POLIEDRO.radius - POLIEDRO.bob).toBeGreaterThan(1));
```
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** testes + typecheck exit=0; Poliedro lê como forma geométrica sólida, distinta do Casco.
- [ ] **Step 5:** Commit `feat: criatura Poliedro`.

### Task 6: Composição e calibração de arte

**Files:**
- Modify: arquivos de cena/criatura para calibração; `docs/ART_DIRECTION.md` (seção "v2"); Create: `docs/captures/v2/*.png`

- [ ] **Step 1:** `pnpm build && pnpm preview` + `node scripts/capture.mjs --out captures/v2/`; comparar `desktop-1440x900.png` com a referência e com `docs/captures/desktop-1440x900.png` (v1).
- [ ] **Step 2:** Ajustar até, na avaliação do implementador: chão legível com poças (critério do autor), terço de cima escuro, âmbar subordinado, cinco criaturas distintas de longe (nenhum par lendo igual), Célula sem cara de pílula/larva, Casco sem ficar escondido no canto. Problema de forma que código não resolve → anotar como candidato a Blender.
- [ ] **Step 3:** Conferir `narrow-390x844.png` e `reduced-motion` (diferença entre quadros da sequência reduzida bem menor que a normal).
- [ ] **Step 4:** Atualizar `docs/ART_DIRECTION.md` (seção v2: chão, Filamento, Célula, Poliedro, remoção dos Esporos); copiar capturas finais para `docs/captures/v2/`.
- [ ] **Step 5:** `pnpm test`, `pnpm typecheck`, `pnpm build` → exit=0. Commit `art: calibração do protótipo 2`.

### Task 7: Desempenho e pacote de revisão v2

**Files:**
- Modify: `docs/VISUAL_ACCEPTANCE.md` (seção v2), `src/lib/quality.ts` se preciso

- [ ] **Step 1:** Medir com `?perf=1` em 1920×1080, DPR 1 e 1,5: RTX `high` (`--force_high_performance_gpu`) e Arc `high`/`low`. Se Arc `low` p95 > 33 ms ou RTX `high` p50 > 16,7 ms, ajustar `QUALITY` (primeiro `crystal: false` no `low`) e medir de novo.
- [ ] **Step 2:** Seção v2 em `VISUAL_ACCEPTANCE.md`: tabela de medições, comparação v1×v2 com links das capturas, desvios restantes em relação à referência, candidatos a Blender.
- [ ] **Step 3:** `pnpm test`, `pnpm typecheck`, `pnpm build` → exit=0. Commit `perf: medição e pacote de revisão do protótipo 2`; tag local `prototipo-2`.
- [ ] **Step 4:** Apresentar ao autor. A etapa só fecha com aprovação explícita dele.
