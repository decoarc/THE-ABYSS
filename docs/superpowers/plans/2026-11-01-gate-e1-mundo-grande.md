# Gate E1 (Mundo grande) — Plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans, para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhar o progresso.

**Objetivo:** levar o mundo do gate I a um mapa grande com três regiões (Jardim, Planície da Neve Marinha, Floresta de Esponjas de Vidro), criaturas menores, câmera livre com ponto de partida aleatório, e flora e partículas canônicas no servidor, que as criaturas comem sem efeito nelas.

**Arquitetura:**
- **O mapa** (regiões, fontes, esponjas) é um JSON único em `shared/world/map-e1.json`, lido pelo servidor (montado no contêiner) e importado pelo cliente.
- **O servidor** continua com um único `Abyss.World.Server`, que avança o `Sim` puro a 10 Hz. O `Sim` passa a conter o mapa, a flora (manchas com nível 0..1) e as partículas (movimento determinístico). O snapshot leva o estado completo. Cada tick leva as posições dos organismos e **deltas** da comida: flora que mudou de nível, partículas novas e removidas. Uma lacuna de ticks força o resync.
- **O cliente:**
  - troca o leito único por um terreno em blocos do mapa inteiro, que preserva o Jardim aprovado;
  - troca a câmera órbita/herói por uma câmera livre (mais o Seguir);
  - desenha a flora e as partículas a partir de um store de comida.

**Stack:** a mesma do gate I: Elixir + Phoenix em Docker; React 19 + R3F 9 + three 0.187 + Vite 8 + Vitest 5; Playwright para o e2e e a medição; Node 24 para a carga.

**Spec:** `docs/superpowers/specs/2026-11-01-gate-e1-mundo-grande-design.md` (aprovado). Também: design do gate I (`docs/superpowers/specs/2026-10-31-gate-i-observacao-design.md`) e o SPEC (`SPEC (2).md` no working tree), §6–§7, §11.2 e §14.

## Global Constraints

- **Sem PostgreSQL/Ecto.** O mundo vive só em memória, e reiniciar o servidor recria tudo.
- Organismos, flora e partículas são **dados** dentro do processo do mundo. Nenhum processo OTP por entidade.
- Tudo roda via **Docker Compose**. Não há Elixir no host: todo `mix` roda no contêiner `api` (`pnpm api:test`).
- O envio é a **10 Hz**. São canônicos: posição e velocidade dos organismos, nível de cada mancha de flora, e nascimento, movimento e remoção de cada partícula. Toda animação de corpo e todo brilho são cosméticos.
- O cliente **nunca** envia estado. A única entrada dele é observar e selecionar.
- **Todo observador vê o mesmo mundo**, inclusive a comida. Só é permitido deixar de desenhar o que a névoa já esconde (distância maior que `CULL_DISTANCE = 55`).
- **No E1, comer não tem efeito na criatura.** Energia, fome, divisão, mutação, morte e predação são do E2. Filamento e Poliedro não comem.
- **Espécies de teste** ligadas por `test_species` (padrão `true` em dev e test). Com `false`, o mundo nasce sem organismos, só com flora e partículas.
- População padrão **150**, faixa aceita **5–400** (com `test_species: true`), configurável por `ABYSS_POPULATION`.
- Regiões com **raio entre 20 e 50**, medido na área nadável. Ponto de partida: Jardim (0, 0) raio 30, Floresta (−48, −30) raio 30, Planície (62, −28) raio 45.
- **O miolo do Jardim aprovado não muda:** fontes, corais, almofadas, tufos, raios de luz e quadro herói, e a altura do leito idêntica à atual para `hypot(x, z) ≤ 26`.
- **Criaturas em escala `creature_scale` = 0,5** (configurável, decidido na Parada 1). O raio de corpo efetivo é `body_radius × creature_scale`.
- **Câmera:**
  - WASD nada; segurar o botão esquerdo e arrastar olha, sem travar o cursor; Espaço sobe e Shift desce;
  - inércia suave; não atravessa o chão; borda do mapa macia;
  - WASD ou Esc soltam o Seguir, e a câmera fica onde está;
  - não existe mais volta ao quadro herói;
  - em tela de toque, órbita em torno do lugar atual mais o Seguir.
- **Orçamento de desempenho** (protótipo 2, 1920×1080, `?perf=1`): Intel Arc `?quality=low` com **p95 ≤ 33 ms**; RTX `high` com **p50 ≤ 16,7 ms**.
- **Interface:** sem mudança para o visitante além do necessário para a câmera. Textos em pt-BR. Totais de comida só em `/api/stats` e em `?debug=1`.
- **Verificação sem `rtk`:** `pnpm test`, `pnpm typecheck`, `pnpm build` e `pnpm api:test`. A fonte da verdade é o código de saída.
- **Commits** em pt-BR no estilo do repo (`feat:`, `art:`, `perf:`, `test:`, `docs:`), na branch **`gate-e`** (que também vai receber o E2).

## Review Focus

1. **Mundo vazio (`test_species: false`):** a página carrega sem erro, a câmera nasce perto de flora (ou no quadro herói, se não houver flora visível), o índice mostra 0 e a comida funciona sem organismos. Testes: Task 2 (`mundo vazio`), Task 4 (`pickSpawn sem organismos`), Task 7 (`comida sem organismos`).
2. **Tick que chega antes do snapshot, repetido ou com lacuna:** antes do primeiro snapshot o tick é ignorado (`'stale'`, sem loop de resync); um tick repetido é ignorado; uma lacuna (`tick ≠ último + 1`) força o resync, porque a comida chega em deltas. Testes: Task 8.
3. **Seguir uma criatura do outro lado do mapa, ou uma aba que volta do segundo plano com dt enorme:** a câmera viaja sem atravessar o chão nem passar da borda dura, e não teletransporta. Testes: Task 4 (`follow respeita o chão`, `dt grande é limitado`).
4. **Teclas com foco no painel ou janela que perde o foco:** Espaço com o botão "Seguir" focado não move a câmera; teclas dentro de `input`, `textarea` ou `contenteditable` são ignoradas; no `blur` da janela, todas as teclas são soltas, sem a câmera "correndo sozinha". Testes: Task 4.
5. **Delta de comida inconsistente:** remoção de partícula desconhecida, índice de flora fora da faixa ou partícula repetida são ignorados sem quebrar o store. Testes: Task 8.

---

## O mapa (`shared/world/map-e1.json`)

```json
{
  "id": "e1",
  "y_min": 1.5,
  "y_max": 8.0,
  "particle_rest_y": 0.3,
  "regions": [
    { "id": "jardim",   "center": [0, 0],     "radius": 30, "flora_patches": 160, "particle_share": 0.1 },
    { "id": "floresta", "center": [-48, -30], "radius": 30, "flora_patches": 30,  "particle_share": 0.1 },
    { "id": "planicie", "center": [62, -28],  "radius": 45, "flora_patches": 10,  "particle_share": 0.8 }
  ],
  "vents": [[0, 0], [-1.7, -1.1], [1.6, -1.4], [-0.8, 1.4]],
  "sponges": [ { "x": 0, "z": 0, "r": 1.2, "h": 4.0 } ]
}
```

- **`vents`:** as posições XZ de `VENTS` em `apps/web/src/scene/environment/layout.ts`.
- **`sponges`:** a lista é gerada uma vez pela Task 1 (≈70 esponjas dentro da Floresta, `r` de 0,8 a 2,2, `h` de 2,5 a 6, sem sobreposição) e versionada. O exemplo acima é só o formato.
- **`inside`:** um ponto está dentro do mapa se `max_i(radius_i − dist(p, center_i)) > 0`. Esse máximo é a **profundidade** (`edge_depth`).
- **Região de um ponto:** a de maior `radius_i − dist`.

## Parâmetros novos (`apps/api/config/config.exs`)

| Chave | Valor |
|---|---|
| `world.population` | 150 (5–400) |
| `world.test_species` | `true` (dev/test) |
| `world.creature_scale` | 0.5 |
| `world.map_path` | `"/shared/world/map-e1.json"` (`ABYSS_MAP_PATH`) |
| `food.flora_grow_s` | 90 (nível de 0 a 1 em 90 s, longe das fontes) |
| `food.vent_boost` | 2.0 (crescimento × (1 + 2·exp(−d²/(2·8²))), d = distância à fonte mais próxima) |
| `food.flora_bite` | 0.25 |
| `food.flora_min_edible` | 0.05 |
| `food.particle_cap` | 400 |
| `food.particle_rate` | 2.0 por segundo (divididas pelas regiões conforme `particle_share`) |
| `food.particle_life_s` | 180 (desaparece nos últimos 30 s, só no visual) |
| `food.particle_fall` | de 0.15 a 0.3 u/s, deriva horizontal de até 0.05 u/s; nasce em `y_max + 2` e repousa em `particle_rest_y` |

Dieta e percepção por espécie (`Abyss.World.Species`):

| espécie | `diet` | `perception` | `sated_s` |
|---|---|---|---|
| membrana | `:particles` | 6.0 | 20 |
| filamento | `:none` | — | — |
| casco | `:flora` | 4.0 | 30 |
| celula | `:flora` | 6.0 | 20 |
| poliedro | `:none` | — | — |

`eat_radius = body_radius_efetivo + 0.6`. A posição de uma partícula para comer usa `y` limitado a `≥ y_min`, para que as que estão no chão continuem alcançáveis.

## Formato no fio (acréscimos ao gate I)

- **Snapshot:**
  - `map_id: "e1"`
  - `creature_scale: 0.5`
  - `species[].body_radius` já efetivo
  - `bounds` vira `{ y_min, y_max }`, porque o raio é substituído pelo mapa
  - `flora: [[x, z, level], …]`, na ordem dos índices
  - `particles: [[id, x, y, z, vx, vy, vz, born_ms, life_ms], …]`, com `id` inteiro crescente
- **Tick:**
  - `f: [[idx, level], …]`: só as manchas cujo nível quantizado (passo de 0,02) mudou neste tick
  - `ps: [...]`: partículas novas, no mesmo formato do snapshot
  - `pr: [id, …]`: removidas (comidas ou expiradas)
- **Movimento da partícula:** `pos(t) = p0 + v·(t − born_ms)/1000` até `y` chegar a `particle_rest_y`. A partir daí ela fica parada nesse `y`. O cliente calcula o mesmo.

---

### Task 1: Mapa compartilhado

**Files:**
- Create: `shared/world/map-e1.json`, `scripts/map/gen-sponges.mjs`
- Create: `apps/api/lib/abyss/world/map.ex`, `apps/api/test/abyss/world/map_test.exs`
- Create: `apps/web/src/world/map.ts`, `apps/web/src/world/map.test.ts`
- Modify: `infra/compose/compose.yaml` (volume `../../shared:/shared:ro` no serviço `api`), `apps/api/config/config.exs` (`map_path`), `apps/api/config/runtime.exs` (`ABYSS_MAP_PATH`)

**Interfaces:**
- Produces (Elixir):
  - `Abyss.World.Map.load!(path) :: %Map{id, y_min, y_max, particle_rest_y, regions: [%{id: atom, center: {x, z}, radius, flora_patches, particle_share}], vents: [{x, z}], sponges: [%{x, z, r, h}]}`
  - `edge_depth(map, x, z) :: float`
  - `region_at(map, x, z) :: atom`
  - `inward(map, x, z) :: {dx, dz}` (unitário, rumo ao centro da região mais profunda)
- Produces (TS), em `world/map.ts`:
  - `MAP: WorldMap` (o JSON tipado)
  - `edgeDepth(x, z): number`
  - `regionAt(x, z): RegionId`
  - `regionWeights(x, z): Record<RegionId, number>` (somam 1, suaves; usados para misturar terreno e tinta)
  - `type RegionId = 'jardim' | 'floresta' | 'planicie'`

- [ ] **Step 1: Gerar as esponjas.** `gen-sponges.mjs` usa um RNG com semente fixa (31), cria ≈70 esponjas dentro da Floresta (`edge_depth > 3`, só na região `floresta`, sem sobreposição) e grava em `sponges` no JSON. Rode `node scripts/map/gen-sponges.mjs` e faça commit do JSON gerado.
- [ ] **Step 2: Testes que falham (Elixir), `map_test.exs`:**
  - `"carrega o mapa"`: 3 regiões e raios em 20..50.
  - `"edge_depth"`: em `{0, 0}` = 30.0; em `{62, -28}` = 45.0; em `{200, 200}` < 0.
  - `"region_at"`: `{0, 0}` → `:jardim`; `{62, -28}` → `:planicie`; `{-48, -30}` → `:floresta`.
  - `"inward aponta para dentro"`: em `{100, -28}`, `inward` tem `dx < 0`.
  - `"esponjas dentro da Floresta"`: toda esponja tem `region_at == :floresta`.
- [ ] **Step 3: Testes que falham (TS), `map.test.ts`:** os mesmos casos para `edgeDepth` e `regionAt`, mais `regionWeights` somando 1 (±1e-9) e com o Jardim valendo 1 em (0, 0).
- [ ] **Step 4: Rodar e ver falhar.** `pnpm api:test` e `pnpm test` → FAIL.
- [ ] **Step 5: Implementar** `map.ex` (com `Jason.decode!`) e `map.ts` (com `import map from '../../../../shared/world/map-e1.json'`). Se o Vite recusar o caminho, acrescente `server.fs.allow` com a raiz do repo em `vite.config.ts`.
- [ ] **Step 6: Rodar e ver passar.** Os dois comandos com exit 0, e também `pnpm typecheck` e `pnpm build`.
- [ ] **Step 7: Commit** — `feat: mapa compartilhado do gate E1`

### Task 2: Organismos no mapa grande

**Files:**
- Modify: `apps/api/lib/abyss/world/sim.ex`, `species.ex`, `server.ex`, `wire.ex`, `apps/api/config/config.exs`, `runtime.exs`
- Test: `apps/api/test/abyss/world/sim_test.exs`, `wire_test.exs`, `server_test.exs`

**Interfaces:**
- Consumes: `Abyss.World.Map` (Task 1).
- Produces:
  - `Sim.new(%{population, seed, now_ms, map: Map.t, creature_scale: float, test_species: boolean})`. O campo `exclusion` e o raio circular **saem**.
  - `Species.all()` com `diet`, `perception` e `sated_s` (tabela acima).
  - `Sim.body_radius(sim, species_id) :: float` (efetivo).
  - Snapshot com `map_id`, `creature_scale`, `bounds: %{y_min, y_max}`.

- [ ] **Step 1: Testes que falham** (substituem os de volume circular e de zona livre):
  - `"todos ficam no mapa"`: após 3000 passos, `edge_depth > -0.5` e `y_min ≤ y ≤ y_max` para todos, sem NaN.
  - `"não atravessam esponjas"`: após 3000 passos, nenhum organismo a menos de `r + raio_efetivo − 0.05` (no plano XZ) do centro de uma esponja com `y < h`.
  - `"distribui pela comida"`: com 150 e seed 7, a maioria das Células e dos Cascos nasce no Jardim, a maioria das Membranas na Planície, e Filamentos e Poliedros aparecem nas três regiões.
  - `"aceita 5..400"`: 400 funciona; 401 → `ArgumentError`.
  - `"mundo vazio"`: `test_species: false` → `organisms == []` e `step` funciona.
  - `"raio efetivo"`: `body_radius(sim, :membrana) == 1.1 * 0.5`.
  - Ajustar `"evita sobreposição"` para o raio efetivo.
  - Wire: o snapshot tem `map_id: "e1"`, `creature_scale: 0.5` e `bounds == %{y_min: 1.5, y_max: 8.0}`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
  - O spawn escolhe a região por espécie: dieta `:flora` → peso `flora_patches`; `:particles` → `particle_share`; `:none` → uniforme. Depois, um ponto uniforme na região com `edge_depth > 3`, fora das esponjas.
  - `edge_steer` vira: se `edge_depth < 3` → `inward × (3 − depth) × max_speed`. O clamp duro leva o ponto de volta a `edge_depth ≥ -0.5`.
  - Esponjas: steer de afastamento radial no XZ quando `d < r + raio + 1.0` e `y < h + 0.5`, e projeção dura para fora se entrar.
  - Remover `exclusion` do `config.exs`, do `Server` e do `Sim`.
  - `runtime.exs`: faixa de `ABYSS_POPULATION` passa a 5–400; acrescentar `ABYSS_TEST_SPECIES` (`"false"` desliga).
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: organismos no mapa grande do gate E1`

### Task 3: Terreno do mapa inteiro e criaturas menores no cliente

**Files:**
- Modify: `apps/web/src/scene/terrain.ts`, `Seabed.tsx`, `Stage.tsx`, `cameraConfig.ts` (`SEABED_RADIUS` sai), `environment/Particles.tsx`
- Modify: `apps/web/src/services/wire.ts`, `worldStore.ts` (`creatureScale()`, bounds novos)
- Modify: os cinco componentes em `apps/web/src/organisms/`, `SelectionRing.tsx`
- Create: `apps/web/src/scene/seabedTiles.ts`, `apps/web/src/scene/cull.ts`, `apps/web/src/scene/regions/Greybox.tsx`
- Test: `terrain.test.ts`, `seabedTiles.test.ts`, `cull.test.ts`, `worldStore.test.ts`

**Interfaces:**
- Consumes: `world/map.ts` (Task 1); `creature_scale` do snapshot (Task 2).
- Produces:
  - `seabedHeight(x, z): number` (mesma assinatura, agora para o mapa inteiro)
  - `legacyJardimHeight(x, z): number` (a fórmula atual, exportada para teste)
  - `seabedTiles(): { cx, cz, size }[]` (blocos de 30 × 30 cobrindo o retângulo das regiões mais 30 de margem)
  - `CULL_DISTANCE = 55`
  - `isCulled(camPos, pos): boolean`
  - `useCreatureCull(group, pose)`: esconde o grupo e pula o trabalho do quadro além de `CULL_DISTANCE`
  - `store.creatureScale(): number` (1 antes do snapshot)

- [ ] **Step 1: Testes que falham:**
  - `terrain.test.ts`:
    - `"Jardim intacto"`: `seabedHeight == legacyJardimHeight` em 200 pontos com `hypot ≤ 26`;
    - `"contínuo"`: numa grade de passo 0,5 sobre o mapa, nenhuma diferença acima de 0,25 entre vizinhos;
    - `"Planície mais plana"`: o desvio padrão da altura numa amostra da Planície é menor que no Jardim.
  - `seabedTiles.test.ts`: os blocos cobrem toda região com 30 de margem e não se sobrepõem.
  - `cull.test.ts`: 54 → visível; 56 → descartado.
  - `worldStore.test.ts`: `creatureScale()` lê o snapshot.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.**
  - **Terreno:** fórmula legada dentro do Jardim; perfis por região misturados com `regionWeights`. A Planície tem dunas baixas e largas; a Floresta tem relevo rochoso médio. A transição do Jardim começa em `hypot > 26`.
  - **Leito:** `Seabed` vira uma malha por bloco, com o mesmo shader e as mesmas cores, e resolução 64 (`high`) ou 40 (`low`) por bloco, via `QUALITY`.
  - **Neve ambiente:** a caixa da neve em `Particles.tsx` passa a acompanhar a câmera, com o mesmo `mod`.
  - **Greybox:** `Greybox.tsx` desenha esponjas como cilindros simples translúcidos a partir de `MAP.sponges`, até a Task 11.
  - **Criaturas:** cada um dos cinco aplica `store.creatureScale()` no grupo raiz e chama `useCreatureCull`. O Filamento escala largura e comprimento do corpo em vez de escalar o grupo, porque o corpo é desenhado em coordenadas de mundo. O anel usa o `body_radius` efetivo.
- [ ] **Step 4: Rodar e ver passar.** `pnpm test`, `pnpm typecheck` e `pnpm build` com exit 0.
- [ ] **Step 5: Commit** — `feat: terreno do mapa inteiro e criaturas menores`

### Task 4: Câmera livre, ponto de partida e Seguir

**Files:**
- Create: `apps/web/src/scene/freeFly.ts`, `freeFly.test.ts`, `spawnPoint.ts`, `spawnPoint.test.ts`, `flyInput.ts`, `flyInput.test.ts`
- Modify: `apps/web/src/scene/CameraRig.tsx` (reescrito), `follow.ts` (o `stepReturn` sai), `cameraConfig.ts`, `apps/web/src/App.tsx` (o Esc continua)
- Test: `follow.test.ts`

**Interfaces:**
- Consumes: `seabedHeight`, `edgeDepth` e `MAP` (Tasks 1 e 3); `store.sample` e `store.roster`; `stepFollow` (existente).
- Produces:
  - `FLY = { maxSpeed: 6, accel: 8, drag: 2.5, floorClearance: 1.2, ceiling: 16, edgeSoft: 6, edgeHard: -2, lookRadPerPx: 0.0035, pitchLimit: 1.35, maxDt: 0.1 }`
  - `stepFreeFly(s: FlyState, input: FlyInput, dt: number, env: FlyEnv): void`, com:
    - `FlyState = { pos: Vec3; vel: Vec3; yaw: number; pitch: number }`
    - `FlyInput = { forward: number; right: number; up: number }` (cada um em −1..1)
    - `FlyEnv = { floor(x, z): number; edgeDepth(x, z): number; inward(x, z): [number, number] }`
  - `constrainCamera(pos: Vec3, env: FlyEnv): void` (chão, teto e borda dura; usado também durante o Seguir)
  - `createFlyInput(target: Window): { read(): FlyInput; dispose(): void }`
  - `pickSpawn(rng, organisms: Vec3[], flora: [number, number, number][]): { pos: Vec3; lookAt: Vec3 }`

- [ ] **Step 1: Testes que falham:**
  - `freeFly.test.ts`:
    - `"acelera até maxSpeed"`;
    - `"para sozinho em ~2 s sem entrada"` (`|v| < 0.05`);
    - `"não atravessa o chão"` (descendo por 5 s, `y ≥ floor + 1.2`);
    - `"borda macia empurra de volta"` (partindo de `edge_depth = 1` em direção a fora, nunca passa de `edgeHard`, e depois de 5 s sem entrada volta a `depth > 0`);
    - `"pitch limitado"`;
    - `"dt grande é limitado"` (dt = 5 s produz o mesmo que `maxDt`).
  - `flyInput.test.ts`:
    - W e D → `forward 1, right 1`;
    - `"ignora input/textarea/contenteditable"`;
    - `"Espaço com botão focado não sobe"`;
    - `"blur solta as teclas"`.
  - `spawnPoint.test.ts`:
    - com organismos, o ponto fica a 7–11 do organismo escolhido, acima do chão, olhando para ele;
    - `"pickSpawn sem organismos"`: usa uma mancha com nível > 0,3;
    - sem nada, devolve o quadro herói (`CAMERA.position`, `CAMERA.target`).
  - `follow.test.ts`: `"follow respeita o chão"` (seguir um alvo a 100 unidades: a cada passo, depois de `constrainCamera`, `y ≥ floor + 1.2`). Remover os testes de `stepReturn`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.**
  - O `CameraRig` vira dois modos, `'free'` e `'following'`.
  - **Mouse:** arrastar com o botão esquerdo muda yaw e pitch (`pointerdown`/`move`/`up` no canvas, sem pointer lock). Clique curto continua selecionando, via o `isClick` existente.
  - **Seguir:** usa `stepFollow` e depois `constrainCamera`. Qualquer WASD/Espaço/Shift solta (`selection` mantém o id e desliga o `following`), e o Esc continua limpando.
  - **Partida:** no primeiro snapshot, `pickSpawn` com `Math.random`, com a introdução de 3 s descendo até o ponto (instantânea com movimento reduzido). Antes do snapshot, quadro herói parado.
  - **Toque** (`matchMedia('(pointer: coarse)')`): `OrbitControls` com alvo no ponto à frente da câmera; o alvo passa por `constrainCamera`; distância de 3 a 15.
- [ ] **Step 4: Rodar e ver passar.** `pnpm test`, `pnpm typecheck` e `pnpm build` com exit 0.
- [ ] **Step 5: Commit** — `feat: câmera livre e ponto de partida aleatório`

### Task 5: Parada 1 (escala e mapa em rascunho)

- [ ] **Step 1: Capturas.** Com `pnpm api:up` e `pnpm build && pnpm preview`, gravar em `docs/captures/e1/parada-1/`:
  - um vídeo de ~60 s nadando Jardim → Floresta → Planície;
  - 3 imagens 1920×1080, uma por região;
  - 1 imagem do Jardim no quadro herói (mesma pose de `CAMERA`) ao lado de `docs/captures/v2/desktop-1440x900.png`.
- [ ] **Step 2: Medir.** `?perf=1` no Jardim e no meio da Floresta, nos perfis `high` e `low`.
- [ ] **Step 3: Parar e perguntar ao autor**, uma pergunta por vez, com recomendação:
  - (a) o tamanho das criaturas (`creature_scale`);
  - (b) se o mapa parece grande o bastante (raios dentro de 20–50);
  - (c) a sensação da câmera.
- [ ] **Step 4:** aplicar os valores escolhidos em `config.exs` e `map-e1.json`, rodar `pnpm api:test` e `pnpm test`, e registrar a decisão no design (§7, "Parada 1"). Commit — `docs: decisão da Parada 1 do gate E1`.

### Task 6: Flora e partículas no servidor

**Files:**
- Create: `apps/api/lib/abyss/world/flora.ex`, `particles.ex`
- Test: `apps/api/test/abyss/world/flora_test.exs`, `particles_test.exs`
- Modify: `apps/api/config/config.exs` (bloco `:food`)

**Interfaces:**
- Consumes: `Abyss.World.Map`.
- Produces:
  - `Flora.new(map, rng, cfg) :: {%Flora{patches: tuple de %{x, z, level, rate}}, rng}`: manchas por região conforme `flora_patches`, longe das esponjas, com nível inicial uniforme em 0,3..1.
  - `Flora.step(flora, dt) :: {flora, changed :: [{idx, level_q}]}`, com `level_q` quantizado em 0,02.
  - `Flora.bite(flora, idx, amount) :: {flora, eaten :: float}`.
  - `Flora.edible_near(flora, {x, z}, range, min_level) :: idx | nil` (a mais próxima).
  - `Particles.new(map, cfg)`.
  - `Particles.step(p, dt, now_ms, rng) :: {p, spawned :: [particle], removed :: [id], rng}`.
  - `Particles.position(particle, now_ms) :: {x, y, z}`.
  - `Particles.take(p, id) :: {p, boolean}`.
  - `Particles.near(p, pos, range, now_ms) :: id | nil`.
  - `particle = %{id, p0, v, born_ms, life_ms}`.

- [ ] **Step 1: Testes que falham:**
  - `flora_test.exs`:
    - `"cresce até o teto"`: 1000 passos de 1 s sem mordidas → todo nível = 1.0 e nunca acima;
    - `"cresce mais perto da fonte"`: uma mancha a 2 da fonte cresce mais rápido que outra a 25;
    - `"mordida"`: `bite` de 0,25 em nível 0,6 → 0,35, e devolve 0,25; em 0,1 → 0, e devolve 0,1;
    - `"volta a crescer"`;
    - `"changed só quando o quantizado muda"`;
    - `"contagem por região"`: 160/30/10;
    - `"determinística pela seed"`.
  - `particles_test.exs`:
    - `"nunca passa do teto"`: 2000 s de passos → `count ≤ 400` o tempo todo;
    - `"nascem mais na Planície"`: ~80% (±10%) das nascidas com `region_at == :planicie`;
    - `"caem e repousam"`: `position` em `born + 1000 s` tem `y == particle_rest_y`;
    - `"expiram"`: uma partícula some em `removed` no passo em que `now ≥ born + life`;
    - `"take remove uma vez"`: a segunda chamada devolve `false`;
    - `"ids crescentes"`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.** A taxa de cada mancha é `1/flora_grow_s × (1 + vent_boost × exp(−d²/128))`. O nascimento de partículas é Poisson por passo (`rate × dt`), com a região sorteada por `particle_share` e o ponto uniforme dentro dela; o RNG é explícito.
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: flora e partículas canônicas no servidor`

### Task 7: Criaturas comendo, mundo e fio

**Files:**
- Modify: `apps/api/lib/abyss/world/sim.ex`, `organism.ex`, `server.ex`, `wire.ex`, `apps/api/lib/abyss_web/controllers/stats_controller.ex`
- Test: `sim_test.exs`, `wire_test.exs`, `server_test.exs`, `stats_controller_test.exs`

**Interfaces:**
- Consumes: Flora e Particles (Task 6); `Species` com `diet`, `perception`, `sated_s` (Task 2).
- Produces:
  - `%Sim{flora, particles, food_events}`, onde `food_events = %{changed: [...], spawned: [...], removed: [...]}` é do último passo.
  - `Organism` ganha `target: nil | {:flora, idx} | {:particle, id}` e `sated_left: float`.
  - `Wire.snapshot` com `flora` e `particles`; `Wire.tick` com `f`, `ps` e `pr` (formato acima).
  - `/api/stats` com `flora_patches`, `flora_level_sum`, `particles`, `eaten_flora_total`, `eaten_particles_total` e `particles_expired_total`.

- [ ] **Step 1: Testes que falham:**
  - `"Célula come flora"`: com uma Célula e uma mancha de nível 1 a 3 unidades, depois de 20 s o nível da mancha é < 1 e a Célula tem `sated_left > 0`.
  - `"Membrana come partícula"`: análogo, e a partícula aparece em `removed`.
  - `"Filamento não come"`.
  - `"saciada ignora comida"`: com `sated_left > 0`, nenhum `target`.
  - `"vai para a região da sua comida"`: Células começando na Planície, sem flora por perto, terminam 600 s depois com a distância média ao Jardim menor.
  - `"comida sem organismos"`: `test_species: false` → a flora cresce e as partículas nascem e expiram normalmente.
  - Wire: snapshot com `length(flora) == 200`; os ids de `ps`/`pr` batem com os eventos do passo; `f` só com os índices alterados.
  - Stats: as chaves novas presentes e numéricas.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
  - A cada passo, em ordem:
    1. `Flora.step`;
    2. `Particles.step`;
    3. para cada organismo com dieta e `sated_left ≤ 0`: se não tiver alvo, procura o mais próximo em `perception`;
    4. o desejo de ir ao alvo entra como steer, somado ao wander/borda/esponjas com peso `max_speed`;
    5. dentro de `eat_radius`: `Flora.bite(flora_bite)` ou `Particles.take`; depois `sated_left = sated_s` e o alvo é limpo;
    6. um alvo que sumiu também é limpo.
  - **Faminto e sem nada à vista:** deriva rumo ao centro da região mais rica na sua dieta, com peso `0.15 × max_speed`.
  - Busca linear (organismos × comida). Se o `step_us_max` passar de 20 ms com 150 organismos, introduza uma grade espacial de célula 8 e registre no commit.
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: criaturas comem flora e partículas (sem efeito no E1)`

### Task 8: Store de comida no cliente

**Files:**
- Create: `apps/web/src/services/foodStore.ts`, `foodStore.test.ts`
- Modify: `apps/web/src/services/wire.ts`, `worldStore.ts`, `worldStore.test.ts`, `debugBridge.ts`

**Interfaces:**
- Consumes: o formato no fio acima.
- Produces:
  - `createFoodStore(): FoodStore`, com:
    - `applySnapshot(s)`
    - `applyTick(t)`
    - `flora(): Float32Array` (`[x, z, level]` × n, nível atual)
    - `floraVersion(): number` (incrementa a cada mudança)
    - `particles(): ReadonlyMap<number, Particle>`
    - `particlePosition(p, serverMs, out: Vec3): void`
    - `particleAlpha(p, serverMs): number` (1 até `life − 30 s`, depois cai linearmente até 0)
    - `counts(): { floraSum: number; particles: number }`
    - `digestAt(tick): string | null` (histórico dos últimos 32 ticks)
  - `WorldStore.food(): FoodStore`. O `applyTick` do mundo chama `food.applyTick` depois de validar a sequência.
  - `AbyssDebug` ganha `foodDigestAt(tick)` e `foodCounts()`.

- [ ] **Step 1: Testes que falham:**
  - `foodStore.test.ts`:
    - snapshot → `flora()` e `particles()` iguais ao snapshot;
    - `f` atualiza só os índices citados e incrementa `floraVersion`;
    - `ps` acrescenta e `pr` remove;
    - `"ignora remoção de id desconhecido"`, `"ignora índice de flora fora da faixa"`, `"ignora partícula repetida"`;
    - `particlePosition` cai e repousa em `particle_rest_y`;
    - `particleAlpha` vale 1 em `born + 10 s` e ~0,5 em `born + 165 s` com `life = 180 s`;
    - `digestAt` igual em dois stores que receberam a mesma sequência.
  - `worldStore.test.ts`:
    - `"tick antes do snapshot é stale"` (sem resync);
    - `"lacuna força resync"`: tick `last + 2` → `'resync'`;
    - `"tick repetido é stale"`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.** O digest é `tick:` + a soma dos níveis com 2 casas + `:` + os ids das partículas vivas, ordenados e unidos por vírgula.
- [ ] **Step 4: Rodar e ver passar.** `pnpm test` e `pnpm typecheck` com exit 0.
- [ ] **Step 5: Commit** — `feat: store de comida no cliente`

### Task 9: Flora e partículas na cena

**Files:**
- Create: `apps/web/src/food/FloraPatches.tsx`, `apps/web/src/food/FoodParticles.tsx`, `apps/web/src/food/floraLook.ts`, `floraLook.test.ts`
- Modify: `apps/web/src/scene/Stage.tsx`, `apps/web/src/lib/quality.ts`

**Interfaces:**
- Consumes: `store.food()` (Task 8); `seabedHeight`; `CULL_DISTANCE`.
- Produces:
  - `floraLook(level): { scale: number; glow: number }`: monotônica; nível 0 → escala 0 (invisível); nível 1 → escala 1.
  - Os componentes `FloraPatches` e `FoodParticles`.

- [ ] **Step 1: Teste que falha** `floraLook.test.ts`: monotônica em 0..1, `floraLook(0).scale == 0` e `floraLook(1).scale == 1`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.**
  - **Flora:** cada mancha é um tufo luminoso **reconhecível como comida**, na linha do crescimento luminoso do chão do Jardim (`Tufts`/`Pads`), num único `InstancedMesh`. Fica assentada em `seabedHeight`. Escala e brilho vêm de `floraLook`, com uma transição suave de ~0,5 s quando o nível muda, e o comido "encolhe" à vista.
  - **Partículas:** um `Points` com tamanho e brilho próprios, ciano/âmbar dentro da paleta, com `particleAlpha`. Entram na fila de brilho do chão, como as criaturas.
  - O `y` desenhado é `max(y, seabedHeight + 0.05)`.
  - Nada além de `CULL_DISTANCE` é atualizado.
  - Teto de instâncias: 200 manchas e 400 partículas, iguais em `high` e `low` (no `low` só a geometria fica mais simples).
- [ ] **Step 4: Rodar e ver passar.** `pnpm test`, `pnpm typecheck` e `pnpm build` com exit 0. Abrir com a API no ar e conferir à vista que uma Célula se aproxima de uma mancha e a mancha encolhe.
- [ ] **Step 5: Commit** — `feat: flora e partículas na cena`

### Task 10: Arte da Planície ("Neve silenciosa") e Parada 2

**Files:**
- Create: `apps/web/src/scene/regions/Planicie.tsx`, `apps/web/src/scene/regionTint.ts`, `regionTint.test.ts`
- Modify: `Stage.tsx`, `terrain.ts` (dunas finais), `Lighting.tsx`

**Interfaces:**
- Produces: `regionTint(x, z): { fog: Color; sky: Color; ambient: number }`, misturado por `regionWeights`. O Jardim devolve exatamente os valores atuais (`PALETTE.bg`, `#2c6f80` etc.).

- [ ] **Step 1: Teste que falha** `regionTint.test.ts`: em (0, 0), igual aos valores atuais do Jardim; na Planície, mais escuro e mais frio (luminância menor que a do Jardim); contínuo entre regiões.
- [ ] **Step 2: Rodar e ver falhar**, implementar, e rodar e ver passar (`pnpm test`).
- [ ] **Step 3: Arte.**
  - **Chão:** sedimento claro e aberto, com dunas baixas e muito espaço negativo.
  - **Neve:** cai mais densa do alto; a neve ambiente da Planície é mais densa que a do Jardim.
  - **Luz:** vem principalmente das partículas de comida no chão.
  - A névoa e a luz seguem `regionTint` na posição da câmera.
  - Referência de clima: `.superpowers/brainstorm/1610-1793544738/content/regioes-e1.html`, opção A.
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` e `pnpm build` com exit 0. `?perf=1` no meio da Planície, nos perfis `high` e `low`, dentro do orçamento.
- [ ] **Step 5: Commit** — `art: Planície da Neve Marinha`
- [ ] **Step 6: Parada 2.** Gravar capturas e um vídeo de ~30 s em `docs/captures/e1/parada-2/`, parar e pedir o aceite ou os ajustes do autor, uma pergunta por vez. Aplicar, registrar no design (§7) e fazer commit — `docs: aceite da Parada 2 do gate E1`.

### Task 11: Arte da Floresta ("Treliça") e Parada 3

**Files:**
- Create: `apps/web/src/scene/regions/Floresta.tsx`, `apps/web/src/scene/regions/latticeGen.ts`, `latticeGen.test.ts`
- Modify: `Stage.tsx` (o `Greybox` sai)

**Interfaces:**
- Consumes: `MAP.sponges`; `regionTint`.
- Produces: `latticeGeometry(sponge, detail): BufferGeometry` (cesto entrelaçado cuja casca externa cabe no cilindro `r × h`).

- [ ] **Step 1: Teste que falha** `latticeGen.test.ts`: todo vértice tem distância XZ ao centro ≤ `r` e `y` em `0..h`; `detail` menor produz menos vértices.
- [ ] **Step 2: Rodar e ver falhar**, implementar, e rodar e ver passar.
- [ ] **Step 3: Arte.**
  - **Esponjas:** cestos em treliça, violeta translúcido, com luz fraca presa dentro. São instanciadas por tamanho e ficam assentadas no chão, ocupando exatamente o cilindro que o servidor usa para desviar.
  - **Densidade:** labirinto, mas navegável pela câmera. Se a câmera entrar numa esponja, a esponja fica translúcida em vez de bloquear.
  - Referência: esboço B das regiões.
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` e `pnpm build` com exit 0. `?perf=1` **no pior caso**, no meio da Floresta, com `high` e `low` dentro do orçamento.
- [ ] **Step 5: Commit** — `art: Floresta de Esponjas de Vidro`
- [ ] **Step 6: Parada 3.** Como a Parada 2, em `docs/captures/e1/parada-3/`, incluindo um trecho seguindo um Filamento através da Floresta. Commit — `docs: aceite da Parada 3 do gate E1`.

### Task 12: E2E, carga, desempenho, Parada 4 e pacote de aceite

**Files:**
- Modify: `scripts/e2e/run.mjs`, `scripts/load/observers.mjs`, `scripts/perf/measure.mjs`
- Create: `docs/GATE_E1_ACCEPTANCE.md`, `docs/captures/e1/…`

- [ ] **Step 1: E2E.**
  - **Novo cenário "duas abas, mesma comida":** num tick recente comum, `foodDigestAt(T)` é idêntico nas duas abas. Rode com `E2E_NEGATE=1` e veja falhar uma vez.
  - **Cenário "câmera livre":** segurar W por 2 s muda a posição da câmera, que fica acima do chão.
  - Os três cenários do gate I continuam passando.
  - Run: `pnpm api:up && pnpm e2e` → todos PASS.
- [ ] **Step 2: Carga.** 50 clientes, 2 abas, população 150 e a comida no teto (rodar 10 min antes de começar a medir), 1800 s.
  - Critérios do gate I: `jitter_ms_p99 ≤ 20`, memória sem tendência de alta, zero quedas e `observers = 52`.
  - Acrescentar o tamanho médio de um tick em bytes.
  - Relatório em `docs/captures/e1/carga-oficial.md`.
- [ ] **Step 3: Desempenho.** `measure.mjs` com dois cenários repetíveis, com semente fixa (`ABYSS_SEED`) e comida no teto:
  - um **percurso fixo** de câmera pelas três regiões, num parâmetro `?flypath=1` que dirige a câmera livre;
  - o **pior caso** parado no meio da Floresta.
  
  Medir Arc `low` e RTX `high`, salvar em `docs/captures/e1/perf.json` e conferir o orçamento.
- [ ] **Step 4: Parada 4 (comida).**
  - Vídeo de ~60 s em `docs/captures/e1/parada-4/`: flora crescendo e sendo comida no Jardim; partículas caindo, sendo comidas por Membranas e se apagando na Planície.
  - Junto, os números de `/api/stats` ao longo de 10 min, mostrando o teto da flora, o teto das partículas e o consumo.
  - Parar e pedir o aceite do autor (critérios 1 e 2).
- [ ] **Step 5: Pacote de aceite.** `docs/GATE_E1_ACCEPTANCE.md`, no formato de `docs/GATE_I_ACCEPTANCE.md`: como ver, capturas, a situação dos critérios 1–5 do design (§6), a carga, o desempenho, os desvios do plano e o aceite do autor com a data.
- [ ] **Step 6: Commit** — `perf: carga, desempenho e pacote de aceite do gate E1`
