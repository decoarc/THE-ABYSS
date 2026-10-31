# Gate I (Observação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um servidor Elixir/Phoenix com autoridade sobre um único mundo contínuo de 30–60 organismos das cinco espécies fundadoras, transmitido em tempo real ao cliente R3F existente, onde o visitante seleciona, inspeciona e segue indivíduos.

**Architecture:** Um único processo `Abyss.World.Server` mantém o mundo como dados (sem processo por organismo, SPEC §11.2) e avança uma simulação pura e determinística (`Abyss.World.Sim`) a 10 Hz. A cada tick, faz um broadcast do estado completo pelo endpoint Phoenix (fastlane: codificado uma vez só). O cliente entra no canal `world:main`, recebe um snapshot na resposta do join e depois os ticks. Um store fora do React guarda um buffer por organismo e interpola com atraso de renderização. Os componentes de criatura passam a ser instâncias guiadas por `id`, e a animação do corpo continua cosmética.

**Tech Stack:** Elixir + Phoenix (Channels, sem Ecto/HTML/assets/mailer) em Docker; React 19 + R3F 9 + three 0.187 + Vite 8 + Vitest 5 (existentes); pacote npm `phoenix` (cliente de Channels); Playwright (existente na raiz) para e2e; Node 24 (WebSocket global) para o teste de carga.

**Spec:** `docs/superpowers/specs/2026-10-31-gate-i-observacao-design.md` (aprovado). Também: SPEC (`SPEC (2).md` no working tree) §9.1–9.3, §11.2, §13.

## Global Constraints

- Backend Elixir + Phoenix + Channels. **Sem PostgreSQL/Ecto** no gate I: o mundo vive só em memória e reiniciar recria do zero.
- Organismos são dados num processo de mundo. **Nenhum processo OTP por organismo.**
- Tudo roda localmente via **Docker Compose**. Não há Elixir instalado no host: todo comando `mix` roda no contêiner `api`.
- Envio canônico entre **5 e 10 Hz** (este plano fixa 10 Hz, configurável). São canônicos posição, direção e velocidade. Toda animação de corpo é cosmética e calculada no cliente.
- População **configurável**, padrão 45, faixa aceita 5–200. Observadores-alvo: 50.
- O cliente **nunca** envia posições. A única entrada do cliente é observar/selecionar (SPEC §9.3).
- Todo observador vê **a mesma população**. O perfil `low` simplifica a geometria e nunca esconde indivíduos.
- Selecionar **nunca** move a câmera. Só "Seguir" move. Os limites da câmera só se afrouxam durante o Seguir, e ao soltar a câmera volta suavemente ao quadro herói.
- As criaturas mantêm a escala aprovada. O mundo é maior que o enquadramento, e a vista inicial continua sendo o quadro herói (`CAMERA` em `cameraConfig.ts`).
- Visual intacto: cada criatura isolada com a qualidade do protótipo 2, a atmosfera inalterada e o quadro inicial lendo como composição. A densidade pode mudar.
- Orçamento de desempenho do protótipo 2: **p95 ≤ 33 ms** na Intel Arc em `?quality=low`, e **p50 ≤ 16,7 ms** na RTX em `high`, a 1920×1080 (medido com `?perf=1`).
- Textos de interface em pt-BR. Estilos inline com `PALETTE`, como em `src/ui/DemoBadge.tsx`. Título serifado e metadados em mono.
- Verificação sem `rtk`: `pnpm test`, `pnpm typecheck`, `pnpm build` e `docker compose ... run --rm api mix test`. A fonte da verdade é o código de saída.
- Commits em pt-BR no estilo do repo (`feat:`, `docs:`, `perf:`, `art:`), na branch `gate-i`.

## Review Focus

1. **Reinício do servidor com a aba aberta:** a página volta sozinha a "ao vivo" com o mundo novo (`world_id` novo). A seleção de um id que deixou de existir é limpa e o Seguir solta. Testes: Task 6 (`resync on new world_id`), Task 8 (`clears selection when id leaves roster`) e Task 11 (e2e de reinício).
2. **Tick fora de ordem, repetido ou de outro mundo:** um tick com `tick ≤ último` é ignorado, e um tick com `world_id` diferente ou com contagem diferente do roster força o resync. Testes: Task 5.
3. **Aba em segundo plano ou travada por segundos e depois retomada:** a interpolação não "voa" até a posição final nem extrapola sem limite (no máximo 300 ms), e o buffer não cresce sem fim. Testes: Task 5 (`clamps extrapolation`, `bounded buffer`).
4. **Arrastar a câmera e soltar sobre um organismo ou no vazio:** não seleciona nem limpa a seleção (limiar de 4 px). Testes: Task 8 (`isClick`).
5. **Espécie desconhecida ou organismo sem dados ainda:** o cliente ignora a espécie sem componente e esconde a instância sem amostra, sem quebrar a cena. Testes: Task 7 (`skips unknown species`) e Task 5 (`sample returns false for unknown id`).

---

## Parâmetros do mundo (valores iniciais, todos em `config/config.exs`, ajustáveis na Parada 1)

| Chave | Valor |
|---|---|
| `population` | 45 (5–200) |
| `tick_hz` | 10 |
| `seed` | `nil` → aleatório na partida; inteiro → determinístico |
| `radius` (raio horizontal do volume, centro na origem) | 18.0 |
| `y_min` / `y_max` | 1.5 / 8.0 |
| margem de borda (steering de volta) | 3.0 |

Espécies (ordem fixa; o código vira prefixo do id, `MBR-0001`):

| id | código | nome | `max_speed` u/s | `wander` rad/√s | `turn_rate` 1/s | `body_radius` | extra |
|---|---|---|---|---|---|---|---|
| `membrana` | MBR | Membrana | 0.25 | 0.35 | 0.6 | 1.1 | — |
| `filamento` | FIL | Filamento | 0.9 | 0.8 | 1.5 | 0.5 | — |
| `casco` | CAS | Casco | 0.06 | 0.2 | 0.4 | 1.2 | — |
| `celula` | CEL | Célula | 0.35 | 0.25 | 1.0 | 1.0 | `run_s: {8,14}`, `pause_s: 3` (para, vira ~π, volta) |
| `poliedro` | POL | Poliedro | 0.08 | 0.2 | 0.4 | 1.3 | — |

Os valores derivam das velocidades do protótipo (`apps/web/src/organisms/creatureConfig.ts`).

## Formato no fio (JSON)

Resposta do join `world:main` (snapshot):
```json
{ "world_id": "9f2c…", "tick": 1234, "tick_hz": 10, "server_ms": 1793449845123,
  "bounds": { "radius": 18.0, "y_min": 1.5, "y_max": 8.0 },
  "species": [{ "id": "membrana", "code": "MBR", "name": "Membrana", "body_radius": 1.1 }],
  "organisms": [{ "id": "MBR-0001", "species": "membrana", "born_ms": 1793449000000,
                  "p": [1.234, 4.5, -2.0], "v": [0.1, 0.0, 0.05] }] }
```
Push `"tick"`: `{ "world_id": "9f2c…", "tick": 1235, "server_ms": …, "o": [[x,y,z,vx,vy,vz], …] }`. Os números são arredondados a 3 casas e `o` segue **a mesma ordem** de `organisms` do snapshot (o roster é imutável no gate I).

---

### Task 1: App Phoenix em Docker Compose

**Files:**
- Create: `apps/api/` (gerado por `mix phx.new`), `apps/api/Dockerfile.dev`, `infra/compose/compose.yaml`
- Create: `apps/api/lib/abyss_web/controllers/health_controller.ex`, `apps/api/test/abyss_web/controllers/health_controller_test.exs`
- Modify: `package.json` (scripts da raiz), `.gitignore`

**Interfaces:**
- Produces: app OTP `:abyss`, módulos `Abyss` / `AbyssWeb`, `AbyssWeb.Endpoint` na porta 4000, `Abyss.PubSub`, `GET /api/health` → `{"ok": true}`; scripts `pnpm api:test`, `pnpm api:up`, `pnpm api:down`.

- [ ] **Step 1: Dockerfile e compose.** `apps/api/Dockerfile.dev` a partir da imagem oficial `elixir` com a tag estável atual fixada (Elixir 1.x/OTP 27+; registre a tag exata no commit), com `mix local.hex --force && mix local.rebar --force` e `WORKDIR /app`. `infra/compose/compose.yaml` com o serviço `api`: build `../../apps/api` (Dockerfile.dev), volume `../../apps/api:/app`, volumes nomeados para `/app/deps` e `/app/_build`, porta `4000:4000`, `command: mix phx.server`, `MIX_ENV=dev`.
- [ ] **Step 2: Gerar o projeto dentro do contêiner.**
  Run: `docker compose -f infra/compose/compose.yaml run --rm --no-deps api sh -c "mix archive.install hex phx_new --force && mix phx.new . --app abyss --module Abyss --no-ecto --no-html --no-assets --no-mailer --no-gettext --no-dashboard --install"`
  Expected: `apps/api/mix.exs` contendo `app: :abyss`.
- [ ] **Step 3: Escutar fora do contêiner.** Em `config/dev.exs`, `http: [ip: {0, 0, 0, 0}, port: 4000]` e `check_origin: ["//localhost", "//127.0.0.1"]`.
- [ ] **Step 4: Teste que falha.** `test/abyss_web/controllers/health_controller_test.exs`: `test "GET /api/health", %{conn: conn}` com `assert json_response(get(conn, "/api/health"), 200) == %{"ok" => true}`.
- [ ] **Step 5: Rodar e ver falhar.** Run: `docker compose -f infra/compose/compose.yaml run --rm api mix test` → FAIL (sem rota).
- [ ] **Step 6: Implementar** `HealthController.show/2` e a rota `get "/health", HealthController, :show` no escopo `/api` do router.
- [ ] **Step 7: Rodar e ver passar.** Mesmo comando → `0 failures`.
- [ ] **Step 8: Scripts da raiz.** `"api:test": "docker compose -f infra/compose/compose.yaml run --rm api mix test"`, `"api:up": "docker compose -f infra/compose/compose.yaml up -d api"`, `"api:down": "docker compose -f infra/compose/compose.yaml down"`. `pnpm api:up`, depois `curl -s localhost:4000/api/health` → `{"ok":true}`, depois `pnpm api:down`. Acrescente `apps/api/_build/`, `apps/api/deps/` e `apps/api/.elixir_ls/` ao `.gitignore`.
- [ ] **Step 9: Commit** — `feat: app Phoenix do gate I em Docker Compose`

### Task 2: Núcleo da simulação (puro, determinístico)

**Files:**
- Create: `apps/api/lib/abyss/world/species.ex`, `apps/api/lib/abyss/world/organism.ex`, `apps/api/lib/abyss/world/sim.ex`
- Test: `apps/api/test/abyss/world/sim_test.exs`
- Modify: `apps/api/config/config.exs` (bloco `config :abyss, :world, …` com a tabela acima)

**Interfaces:**
- Produces:
  - `Abyss.World.Species.all() :: [%{id: atom, code: String.t, name: String.t, max_speed: float, wander: float, turn_rate: float, body_radius: float, run_s: {number, number} | nil, pause_s: number | nil}]`, na ordem da tabela.
  - `%Abyss.World.Organism{id: String.t, species: atom, born_ms: integer, pos: {f,f,f}, vel: {f,f,f}, yaw: float, pitch: float, mode: :run | :pause, mode_left: float}`
  - `Abyss.World.Sim.new(opts :: %{population: pos_integer, seed: integer, radius: float, y_min: float, y_max: float, now_ms: integer}) :: %Sim{organisms: [Organism.t], rng: :rand.state, tick: 0, bounds: map}`
  - `Abyss.World.Sim.step(sim, dt :: float) :: sim` (incrementa `tick`)

- [ ] **Step 1: Testes que falham** em `sim_test.exs`, com `opts = %{population: 45, seed: 7, radius: 18.0, y_min: 1.5, y_max: 8.0, now_ms: 0}`:
  - `"distribui a população pelas espécies"`: 45 → 9 de cada; os ids da Membrana são `"MBR-0001".."MBR-0009"`; com `population: 47` → contagens `[10, 10, 9, 9, 9]` na ordem da tabela.
  - `"rejeita população fora de 5..200"`: `assert_raise ArgumentError` para 4 e 201.
  - `"é determinístico pela seed"`: `new(opts)` com 100 passos de `step(_, 0.1)` produz dois resultados iguais (`==`); `seed: 8` dá posições diferentes.
  - `"todos ficam no volume"`: após 3000 passos, `x²+z² ≤ radius²` e `y_min ≤ y ≤ y_max` para todos, sem NaN.
  - `"respeita max_speed"`: a cada passo, `|vel| ≤ max_speed * 1.001`.
  - `"evita sobreposição"`: após 600 passos, cada par (a, b) tem distância `≥ 0.5 * (ra + rb)`.
  - `"cada espécie mantém seu ritmo"`: o deslocamento médio em 600 passos do Filamento é `> 5×` o do Casco.
  - `"Célula pausa e volta"`: em 300 passos alguma Célula passa por `mode: :pause` com `|vel| < 0.05`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL (módulos inexistentes).
- [ ] **Step 3: Implementar `Species`, `Organism` e `Sim`.** O RNG é explícito (`:rand.seed_s(:exsss, seed)`), passado em sequência na ordem do roster, sem RNG global. O spawn é uniforme no volume, afastado da borda pela margem. Passo por organismo (algoritmo, porque a assinatura não o determina):
  ```
  yaw  += normal(rng) * wander * sqrt(dt);  pitch = clamp(pitch*0.98 + normal*0.3*wander*sqrt(dt), -0.35, 0.35)
  speed_alvo = max_speed (Célula em :pause → 0; ao entrar em :pause, yaw += π; mode_left sorteado em run_s / pause_s)
  desejada = speed_alvo * dir(yaw, pitch)
  + steer_borda: se r_horiz > radius - 3 → componente radial para dentro ∝ (r_horiz-(radius-3)); idem y fora de [y_min+0.5, y_max-0.5]
  + separação: para cada vizinho com d < ra+rb+0.5 → empurra ∝ (ra+rb+0.5-d)/d
  vel = lerp(vel, desejada, min(1, turn_rate*dt)); clamp |vel| ≤ max_speed
  pos += vel*dt; clamp duro ao volume
  ```
  A separação é O(n²), aceitável até 200.
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: simulação de movimento do mundo (pura, com seed)`

### Task 3: Processo do mundo com relógio e estatísticas

**Files:**
- Create: `apps/api/lib/abyss/world/server.ex`, `apps/api/lib/abyss/world/wire.ex`, `apps/api/lib/abyss/world/observers.ex`
- Modify: `apps/api/lib/abyss/application.ex`
- Test: `apps/api/test/abyss/world/server_test.exs`, `apps/api/test/abyss/world/wire_test.exs`

**Interfaces:**
- Consumes: `Sim.new/1`, `Sim.step/2`, `Species.all/0` (Task 2).
- Produces:
  - `Abyss.World.Wire.snapshot(sim, meta :: %{world_id: String.t, tick_hz: pos_integer, server_ms: integer}) :: map` e `Wire.tick(sim, meta) :: map`, no formato "no fio" acima.
  - `Abyss.World.Server.start_link(opts)` (opts: o mapa do mundo + `name`, `broadcast: (map -> any)`); `Server.snapshot(server \\ __MODULE__) :: map`; `Server.stats(server \\ __MODULE__) :: %{world_id, tick, tick_hz, population, uptime_ms, jitter_ms_p50, jitter_ms_p99, step_us_max, observers}`.
  - `Abyss.World.Observers.track(pid) :: :ok` (monitora o pid) e `Observers.count() :: non_neg_integer`.
  - O `world_id` é aleatório a cada partida (16 bytes hex).

- [ ] **Step 1: Testes que falham.**
  - `wire_test`: `"snapshot tem roster, espécies e bounds"` checa as chaves exatas do formato e `length(organisms) == population`; `"tick segue a ordem do snapshot e arredonda a 3 casas"`: `o` tem o mesmo comprimento, e cada número é igual a `Float.round(_, 3)`.
  - `server_test` (start com `name: nil` e `broadcast: &send(test_pid, {:tick, &1})`, `tick_hz: 50`, `seed: 1`): `"emite ticks crescentes com o mesmo world_id"` (`assert_receive` de 3 ticks com `tick` estritamente crescente); `"snapshot coerente com o tick seguinte"` (o `world_id` é igual, e o `tick` do snapshot é menor que o do próximo broadcast); `"stats mede jitter"` (após ~1 s, `tick > 0`, `jitter_ms_p99` é número `≥ 0`); `"Observers conta e esquece pids mortos"`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.** Agendamento sem deriva: `next_at = start_mono + n * interval_ms` via `Process.send_after(self(), :tick, max(0, next_at - now), [])`. Jitter = `now - next_at` no disparo, guardado num anel dos últimos 600, com p50/p99 calculados em `stats/1`. `step_us` vem de `:timer.tc`. `snapshot/1` é um `GenServer.call`. Em `application.ex`, inicie `Abyss.World.Observers` e `{Abyss.World.Server, Application.fetch_env!(:abyss, :world) ++ [name: Abyss.World.Server, broadcast: &AbyssWeb.Endpoint.broadcast!("world:main", "tick", &1)]}` **depois** do Endpoint. Em `config/test.exs`, desligue o Server global (`config :abyss, start_world: false`) e faça `application.ex` respeitar essa flag. Os testes iniciam o próprio Server.
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: processo do mundo com relógio e estatísticas`

### Task 4: Canal `world:main` e `/api/stats`

**Files:**
- Create: `apps/api/lib/abyss_web/channels/world_socket.ex`, `apps/api/lib/abyss_web/channels/world_channel.ex`, `apps/api/lib/abyss_web/controllers/stats_controller.ex`
- Modify: `apps/api/lib/abyss_web/endpoint.ex` (`socket "/socket", AbyssWeb.WorldSocket, websocket: true, longpoll: false`), router (`get "/stats", StatsController, :show`)
- Test: `apps/api/test/abyss_web/channels/world_channel_test.exs`, `apps/api/test/abyss_web/controllers/stats_controller_test.exs`

**Interfaces:**
- Consumes: `Server.snapshot/1`, `Server.stats/1`, `Observers.track/1` (Task 3).
- Produces: o socket público em `ws://localhost:4000/socket/websocket` (anônimo, sem params), o tópico `"world:main"` (join → `{:ok, snapshot}`) e o push `"tick"`; `GET /api/stats` → o JSON de `Server.stats/1`.

- [ ] **Step 1: Testes que falham** (usando `Phoenix.ChannelTest`, com um Server iniciado no setup e `broadcast` apontando para `AbyssWeb.Endpoint.broadcast!/3`):
  - `"join devolve snapshot"`: `{:ok, reply, _} = subscribe_and_join(socket(AbyssWeb.WorldSocket), AbyssWeb.WorldChannel, "world:main")` com `reply.world_id` binário e `length(reply.organisms) == 45`.
  - `"recebe ticks do mesmo mundo"`: `assert_push "tick", %{world_id: ^id, o: o}` com `length(o) == 45`.
  - `"rejeita outros mundos"`: o join em `"world:outro"` → `{:error, %{reason: "unknown_world"}}`.
  - `"canal é só leitura"`: `push(socket, "move", %{})` → `assert_reply ref, :error, %{reason: "read_only"}`.
  - `"conta observadores"`: após o join, `Observers.count() == 1`.
  - `stats_controller_test`: `"GET /api/stats"` traz as chaves `tick`, `jitter_ms_p99` e `observers`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar** o socket (`connect/3` aceita tudo, `id/1` → `nil`), o canal (`join("world:main", _, socket)` chama `Observers.track(self())` e responde com o snapshot; `handle_in(_, _, socket)` → `{:reply, {:error, %{reason: "read_only"}}, socket}`) e o controller. O canal não precisa de `handle_info` porque o broadcast do endpoint vai direto (fastlane).
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Fumaça manual.** `pnpm api:up`, depois `curl -s localhost:4000/api/stats` mostra `tick` crescendo entre duas chamadas.
- [ ] **Step 6: Commit** — `feat: canal world:main e estatísticas`

### Task 5: Store do mundo no cliente com interpolação

**Files:**
- Create: `apps/web/src/services/wire.ts`, `apps/web/src/services/interpolate.ts`, `apps/web/src/services/worldStore.ts`
- Test: `apps/web/src/services/interpolate.test.ts`, `apps/web/src/services/worldStore.test.ts`

**Interfaces:**
- Produces:
  - `wire.ts`: tipos `Vec3 = [number, number, number]`, `SpeciesInfo {id; code; name; body_radius}`, `OrganismInfo {id; species; born_ms; p: Vec3; v: Vec3}`, `WorldSnapshot`, `TickMessage` (espelham o formato "no fio").
  - `interpolate.ts`: `hermite(p0: Vec3, v0: Vec3, t0: number, p1: Vec3, v1: Vec3, t1: number, t: number, out: Vec3): Vec3` (tempos em ms, velocidades em u/s).
  - `worldStore.ts`: `type ConnectionStatus = 'connecting' | 'live'`; `createWorldStore(): WorldStore` com `applySnapshot(s: WorldSnapshot, localMs: number): void`, `applyTick(t: TickMessage, localMs: number): 'ok' | 'stale' | 'resync'`, `roster(): readonly OrganismInfo[]`, `species(): readonly SpeciesInfo[]`, `worldId(): string | null`, `bounds(): WorldSnapshot['bounds'] | null`, `sample(id: string, localMs: number, outPos: Vec3, outVel: Vec3): boolean`, `serverNow(localMs: number): number`, `status(): ConnectionStatus`, `setStatus(s: ConnectionStatus): void`, `subscribe(fn: () => void): () => void`. As notificações saem só em snapshot e mudança de status, nunca por tick.
  - Constantes: `RENDER_DELAY_TICKS = 2` (atraso = 2 / tick_hz s), `MAX_EXTRAPOLATE_MS = 300` e `BUFFER_SAMPLES = 8` por organismo.

- [ ] **Step 1: Testes que falham.**
  - `interpolate.test`: `"hermite com velocidade coerente é linear"`: p0 `[0,0,0]` com v `[1,0,0]` em t0=0 e p1 `[0.1,0,0]` em t1=100 → em t=50, x≈0.05 (`toBeCloseTo(0.05, 6)`); `"acerta as pontas"`: t=t0 → p0 e t=t1 → p1.
  - `worldStore.test` (as mensagens carregam `server_ms` coerente com `localMs`):
    - `"snapshot define roster e espécies"`.
    - `"interpola entre ticks com atraso de renderização"`: um organismo em x=0 no tick 1 e em x=0.1 no tick 2 (100 ms depois), com v=1. Em `localMs` = recepção do tick 2 + 150 ms (atraso de 200 ms), `sample` dá x≈0.05.
    - `"ignora tick velho"` → `'stale'` e a amostra não muda.
    - `"world_id diferente pede resync"` e `"contagem diferente do roster pede resync"` → `'resync'`.
    - `"clamps extrapolation"`: sem ticks novos por 5 s, a posição é igual à de `MAX_EXTRAPOLATE_MS` além da última amostra.
    - `"bounded buffer"`: após 1000 ticks, o buffer interno de cada organismo tem `≤ BUFFER_SAMPLES` (exponha `debugBufferSize(id)` só para teste).
    - `"sample returns false for unknown id"`.
    - `"subscribe não dispara por tick"`: notifica no snapshot e no `setStatus`, mas não no `applyTick`.
    - `"serverNow usa o menor atraso observado"`: com mensagens chegando com atrasos de 40, 10 e 30 ms, `serverNow(local)` usa o offset de 10 ms.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @abyss/web test` → FAIL.
- [ ] **Step 3: Implementar.** O offset do relógio é o mínimo de `localMs - server_ms` nas últimas 20 mensagens. O tempo de render é `serverNow(localMs) - 2000 / tick_hz`. Antes da primeira amostra ou depois da última, extrapole com `v` limitado a `MAX_EXTRAPOLATE_MS`. Os buffers são anéis de `Float64Array`, para evitar alocação por quadro.
- [ ] **Step 4: Rodar e ver passar.** `pnpm --filter @abyss/web test` → PASS.
- [ ] **Step 5: Commit** — `feat: store do mundo no cliente com interpolação`

### Task 6: Conexão com o canal e provider React

**Files:**
- Create: `apps/web/src/services/worldConnection.ts`, `apps/web/src/services/WorldProvider.tsx`, `apps/web/src/services/selection.ts`
- Modify: `apps/web/package.json` (deps `phoenix`, dev `@types/phoenix`), `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`
- Test: `apps/web/src/services/worldConnection.test.ts`, `apps/web/src/services/selection.test.ts`

**Interfaces:**
- Consumes: `WorldStore` (Task 5).
- Produces:
  - `connectWorld(store: WorldStore, opts: { url: string; socketFactory?: (url: string) => SocketLike }): () => void`. `SocketLike` é o subconjunto de `phoenix.Socket` usado: `connect()`, `disconnect()`, `onOpen`, `onError`, `onClose` e `channel(topic)`, que devolve `{ join(): Push; on(ev, cb); leave() }`.
  - `createSelection(): Selection` com `get(): { id: string | null; following: boolean }`, `select(id: string): void` (sempre zera `following`), `clear(): void`, `setFollowing(on: boolean): void` (ignorado sem id) e `subscribe(fn): () => void`.
  - `WorldProvider({ url, children })` e os hooks `useWorld(): { store: WorldStore; selection: Selection }`, `useRoster(): readonly OrganismInfo[]`, `useConnectionStatus(): ConnectionStatus` e `useSelection(): { id; following }` (via `useSyncExternalStore`).
  - URL: `import.meta.env.VITE_WORLD_URL ?? 'ws://localhost:4000/socket'`.

- [ ] **Step 1: Testes que falham** (com um `SocketLike` falso que permite disparar `ok` do join, eventos `tick`, `onClose` e `onOpen`):
  - `"join ok aplica snapshot e fica live"`.
  - `"tick vai para o store"`.
  - `"queda do socket volta a connecting"`.
  - `"resync on new world_id"`: um tick de outro `world_id` faz `leave()` no canal atual e abre um novo `join`, e o snapshot novo substitui o roster.
  - `"o retorno do join depois da reconexão troca o mundo"`: o segundo `ok` com outro `world_id` substitui o roster.
  - `"desmontar desconecta"`.
  - `selection.test`: `"select zera following"`, `"setFollowing sem id é ignorado"`, `"clear limpa tudo"`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @abyss/web test` → FAIL.
- [ ] **Step 3: Implementar.** A reconexão fica a cargo do `phoenix.Socket` (backoff padrão), e o canal faz rejoin sozinho. O `WorldProvider` cria store e selection uma vez (`useState`) e conecta num `useEffect`. Envolva a cena em `App.tsx` com `<WorldProvider url={…}>`. Em `App.test.tsx`, injete um `socketFactory` inerte (prop opcional `socketFactory` em `App` e `WorldProvider`) para o teste não abrir rede.
- [ ] **Step 4: Rodar e ver passar** `pnpm --filter @abyss/web test` e `pnpm --filter @abyss/web typecheck` → exit 0.
- [ ] **Step 5: Commit** — `feat: conexão com o canal do mundo`

### Task 7: Criaturas como instâncias guiadas pelo servidor

**Files:**
- Create: `apps/web/src/organisms/instancePhase.ts`, `apps/web/src/organisms/trail.ts`, `apps/web/src/organisms/creatureGlow.ts`, `apps/web/src/organisms/useOrganismPose.ts`
- Modify: `Membrana.tsx`, `Filamento.tsx`, `Casco.tsx`, `Celula.tsx`, `Poliedro.tsx`, `Creatures.tsx`, `creatureConfig.ts` (+ test), `apps/web/src/scene/floorGlow.ts` (+ test), `apps/web/src/lib/quality.ts` (+ test)
- Delete: `apps/web/src/organisms/paths.ts` e `paths.test.ts`, se ficarem sem uso
- Test: `instancePhase.test.ts`, `trail.test.ts`, `creatureGlow.test.ts`, `Creatures.test.tsx`

**Interfaces:**
- Consumes: `useWorld()`, `useRoster()` (Task 6) e `store.sample` (Task 5).
- Produces:
  - `phaseOf(id: string): number` em [0, 1), estável (FNV-1a); a animação do corpo usa `t + phaseOf(id) * 1000`.
  - `createTrail(capacity: number): { push(tMs: number, p: Vec3): void; at(tMs: number, out: Vec3): Vec3 }` (interpola linearmente e limita ao ponto mais antigo).
  - `useOrganismPose(id: string): { pos: THREE.Vector3; vel: THREE.Vector3; has: { current: boolean } }`: refs atualizadas num `useFrame` a partir de `store.sample(id, performance.now(), …)`. O componente esconde o grupo (`visible = false`) enquanto `has` é falso.
  - `creatureGlow.ts`: `requestCreatureGlow(id, color, x, y, z, radius, intensity)`; `pickNearest(reqs, target: Vec3, n: number)` (pura); componente `<CreatureGlows />` que, no início de cada quadro, escreve os 5 pedidos do quadro anterior mais próximos do alvo da câmera nos slots `FLOOR_SLOTS.creatures` (8–12) e limpa os demais.
  - Cada criatura passa a ser `Membrana({ id }: { id: string })` etc. O `Creatures()` mapeia o roster por `species` → componente.
  - `QUALITY` ganha `filamentoSegments` (high 90, low 48) e `celulaGranules` (high 14, low 8).

- [ ] **Step 1: Testes que falham.**
  - `instancePhase.test`: o resultado é estável para o mesmo id, `0 ≤ phase < 1`, e `"MBR-0001"` ≠ `"MBR-0002"`.
  - `trail.test`: com push em t=0 (x=0) e t=100 (x=1), `at(50)` → x=0.5 e `at(-500)` → x=0; a capacidade é respeitada.
  - `creatureGlow.test`: `pickNearest` devolve os n mais próximos, em ordem; com n maior que a quantidade de pedidos, devolve todos.
  - `Creatures.test` (com um provider de store falso, sem Canvas, testando só o mapeamento exportado `componentFor(species)`): `"skips unknown species"` → `componentFor('lula') === null`, e as cinco espécies conhecidas têm componente.
  - `quality.test`: os novos campos têm os valores acima. `floorGlow.test`: `FLOOR_SLOTS.creatures === 8`, e os slots por espécie deixam de existir.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @abyss/web test` → FAIL.
- [ ] **Step 3: Implementar os helpers** e trocar a origem do movimento em cada criatura, mantendo intacta a animação do corpo:
  - **Membrana:** posição = pose. A rotação lenta continua cosmética.
  - **Filamento:** a cabeça vem da pose. A cada quadro, faça push no trail, e `spine[i] = trail.at(now - i * C.lag * 1000)` substitui `lissajousPath`. Os segmentos vêm de `q.filamentoSegments`, e a geometria é recriada se o perfil mudar.
  - **Casco:** posição = pose + deriva cosmética existente. Os "ajustes" de rotação continuam.
  - **Célula:** posição = pose, com o eixo longo orientado à velocidade (slerp, só quando `|v| > 0.02`). A rolagem continua. Os grânulos vêm de `q.celulaGranules`.
  - **Poliedro:** posição = pose + bob cosmético. O giro continua.
  - Em `creatureConfig.ts`, remova `driftRadius`, `driftSpeed`, `path`, `position`, `from`, `to`, `speed` e `turnSeconds`. Troque `setCreatureGlow(FLOOR_SLOTS.x, …)` por `requestCreatureGlow(id, …)`, preservando cor, raio e intensidade por espécie. Coloque `<CreatureGlows />` dentro de `Creatures`.
  - Verifique se existe algum cardume decorativo (`grep -ri "cardume\|school\|fish" apps/web/src`; no levantamento do plano não havia nenhum). Se existir, remova.
- [ ] **Step 4: Rodar e ver passar** `pnpm --filter @abyss/web test`, `pnpm --filter @abyss/web typecheck` e `pnpm build` → exit 0.
- [ ] **Step 5: Ver rodando.** Rode `pnpm api:up` e `pnpm dev`, e abra `http://localhost:5173`: aparecem 45 organismos em movimento contínuo, sem trancos visíveis. Com o servidor parado, a cena aparece sem organismos.
- [ ] **Step 6: Commit** — `feat: criaturas como instâncias guiadas pelo servidor`
- [ ] **Step 7: PARADA 1 com o autor (escala e densidade).** Capture o quadro herói (`node scripts/capture.mjs` com a API no ar) e meça `?perf=1` nos dois perfis. Mostre ao autor as capturas, a contagem visível no quadro inicial e os números de desempenho. Pergunte, **uma decisão por vez e com recomendação**: o quadro inicial lê como composição? `population` e `radius` precisam de ajuste? Aplique os valores aprovados em `config/config.exs` e faça commit (`art: densidade do gate I aprovada`). Não avance sem o aceite.

### Task 8: Seleção (clique, Esc, vazio, anel)

**Files:**
- Create: `apps/web/src/organisms/SelectionRing.tsx`, `apps/web/src/lib/pointer.ts`
- Modify: as cinco criaturas (handlers no grupo raiz), `apps/web/src/App.tsx` (`onPointerMissed` e tecla Esc), `apps/web/src/services/WorldProvider.tsx`
- Test: `apps/web/src/lib/pointer.test.ts`, `apps/web/src/services/WorldProvider.test.tsx`

**Interfaces:**
- Consumes: `Selection` (Task 6), `useOrganismPose` e `SpeciesInfo.body_radius` (Tasks 5 e 7).
- Produces: `isClick(down: {x; y}, up: {x; y}, thresholdPx = 4): boolean`; `<SelectionRing />`, que desenha um anel fino aditivo virado para a câmera, com raio `body_radius * 1.4`, sobre o organismo selecionado, e não aparece sem seleção.

- [ ] **Step 1: Testes que falham.**
  - `pointer.test`: deslocamento de 3 px → `true`; de 5 px → `false`.
  - `WorldProvider.test`: `"clears selection when id leaves roster"`: com `MBR-0003` selecionado e seguido, um snapshot novo sem esse id faz `selection.get()` virar `{ id: null, following: false }`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @abyss/web test` → FAIL.
- [ ] **Step 3: Implementar.**
  - **Grupo raiz de cada criatura:** `onClick` faz `select(id)` se `e.delta <= 4` e chama `e.stopPropagation()`. `onPointerOver` e `onPointerOut` alternam `document.body.style.cursor` entre `pointer` e `''`.
  - **Clique no vazio:** o `Canvas` guarda a posição do `pointerdown`, e `onPointerMissed` só chama `clear()` se `isClick` for verdadeiro.
  - **Esc:** um listener de `keydown` em `window` chama `clear()` quando a tecla é Esc.
  - **Roster:** no `WorldProvider`, a cada mudança do roster, limpe a seleção se o id selecionado não estiver mais nele.
- [ ] **Step 4: Rodar e ver passar.** `pnpm --filter @abyss/web test` e `typecheck` → exit 0.
- [ ] **Step 5: Commit** — `feat: seleção de organismos`

### Task 9: Painel de inspeção, índice e aviso de conexão

**Files:**
- Create: `apps/web/src/ui/InspectPanel.tsx`, `apps/web/src/ui/SpeciesIndex.tsx`, `apps/web/src/ui/ConnectionNotice.tsx`, `apps/web/src/lib/format.ts`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/lib/format.test.ts`, `apps/web/src/ui/InspectPanel.test.tsx`, `apps/web/src/ui/SpeciesIndex.test.tsx`, `apps/web/src/ui/ConnectionNotice.test.tsx`

**Interfaces:**
- Consumes: os hooks da Task 6 e `store.sample`/`serverNow` da Task 5.
- Produces:
  - `formatAge(ms: number): string`: `< 60 s` → `"há menos de 1 min"`; `< 60 min` → `"há N min"`; senão `"há H h M min"`.
  - `formatPosition(p: Vec3): string` → `"12.4 · 3.1 · -8.0"` (1 casa).

Texto exato do painel, de cima para baixo: o rótulo mono `INDIVÍDUO · {id}`; o título serifado com o nome da espécie; as linhas mono `ESPÉCIE`, `SURGIU` e `POSIÇÃO` (a posição atualiza a 4 Hz); os botões `SEGUIR` / `DEIXAR DE SEGUIR` e `✕` (`aria-label="Fechar"`). Índice: o botão recolhido `NO TERRÁRIO · {total}`; aberto, uma linha por espécie (`{nome}  {contagem}`) que expande os ids. O id selecionado leva `●` e `aria-current="true"`. O índice fica recolhido por padrão, no canto inferior esquerdo, acima do `DemoBadge` (que permanece, porque o texto continua verdadeiro). O painel fica à direita, transparente (`rgba` de `PALETTE.bg`), com borda fina. Aviso: `conectando…`, mono, centralizado embaixo, com `role="status"`, visível só quando o status é `'connecting'`.

- [ ] **Step 1: Testes que falham.**
  - `format.test`: 30 s → `"há menos de 1 min"`; 14 min → `"há 14 min"`; 125 min → `"há 2 h 5 min"`; `[12.44, 3.06, -8]` → `"12.4 · 3.1 · -8.0"`.
  - `InspectPanel.test`: sem seleção não renderiza nada; com `MBR-0042` mostra `INDIVÍDUO · MBR-0042` e `Membrana`; `SEGUIR` faz `following` virar true e o rótulo virar `DEIXAR DE SEGUIR`; `Fechar` limpa a seleção.
  - `SpeciesIndex.test`: mostra `NO TERRÁRIO · 45`; abrir e clicar em `Membrana` lista os 9 ids; clicar num id o seleciona sem ligar `following`.
  - `ConnectionNotice.test`: aparece em `'connecting'` e some em `'live'`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @abyss/web test` → FAIL.
- [ ] **Step 3: Implementar** os três componentes e montá-los em `App.tsx`, fora do `Canvas`.
- [ ] **Step 4: Rodar e ver passar.** `pnpm --filter @abyss/web test` e `typecheck` → exit 0.
- [ ] **Step 5: Commit** — `feat: painel de inspeção, índice e aviso de conexão`

### Task 10: Seguir com a câmera e voltar ao quadro herói

**Files:**
- Create: `apps/web/src/scene/follow.ts`
- Modify: `apps/web/src/scene/CameraRig.tsx`, `apps/web/src/scene/cameraConfig.ts`
- Test: `apps/web/src/scene/follow.test.ts`

**Interfaces:**
- Consumes: `useSelection()`, `useOrganismPose`-like sampling via `store.sample`, `store.bounds()`.
- Produces:
  - `followTargetBounds(b: { radius; y_min; y_max }): { x: [n, n]; y: [n, n]; z: [n, n] }`, com a caixa do volume do mundo.
  - `stepFollow(target: Vec3, cam: Vec3, org: Vec3, dt: number, rate = 2.5): void`: move `target` em direção a `org` com fator `1 - exp(-rate * dt)` e desloca `cam` pelo mesmo delta (preserva o enquadramento relativo).
  - `stepReturn(target, cam, dt, k): boolean`: aproxima o par de `CAMERA.target` e `CAMERA.position` em ~1,5 s e devolve true quando chega (distância < 0,01).
  - `CAMERA.returnSeconds = 1.5`.

- [ ] **Step 1: Testes que falham.** `follow.test`:
  - `"followTargetBounds cobre o mundo"`: `radius` 18 → `x: [-18, 18]` e `y: [1.5, 8]`.
  - `"stepFollow preserva o deslocamento câmera–alvo"`.
  - `"stepFollow converge"`: com o organismo parado, após 5 s simulados o alvo fica a menos de 0,01 dele.
  - `"stepReturn chega ao quadro herói"` em ≤ 2 s simulados.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @abyss/web test` → FAIL.
- [ ] **Step 3: Implementar no `CameraRig`.**
  - **Seguindo:** `minAzimuthAngle = -Infinity`, `maxAzimuthAngle = Infinity`, e o `clampTarget` passa a usar `followTargetBounds`. Distância e polar continuam. Aplique `stepFollow` a cada quadro.
  - **Ao soltar:** desligue os controles, aplique `stepReturn` até chegar e só então restaure os limites de `CAMERA` e reative os controles. Isso evita o salto do clamp de azimute.
  - **Intro:** o intro inicial continua como está.
  - **Movimento reduzido:** com `reducedMotion`, as duas transições são instantâneas.
- [ ] **Step 4: Rodar e ver passar.** `pnpm --filter @abyss/web test` e `typecheck` → exit 0.
- [ ] **Step 5: Commit** — `feat: seguir organismo com a câmera`
- [ ] **Step 6: PARADA 2 com o autor (sensação do movimento).** Grave um vídeo curto (por exemplo, a sequência do `scripts/capture.mjs` estendida, ou uma gravação de tela) com: quadro herói, seleção, Seguir por ~20 s com Filamento e Célula, e soltar. Mostre ao autor e pergunte, uma decisão por vez e com recomendação, se o movimento parece vivo e se algo está duro. Ajustes de parâmetros de espécie (tabela acima) ou da interpolação entram aqui, com commit `art: movimento do gate I aprovado`. Não avance sem o aceite.

### Task 11: E2E de consistência e reinício

**Files:**
- Create: `apps/web/src/services/debugHook.ts`, `scripts/e2e/gate-i.spec.mjs` (Playwright test runner), `playwright.config.mjs` (raiz)
- Modify: `apps/web/src/services/WorldProvider.tsx` (instala o hook só com `?debug=1`), `package.json` (`"e2e": "playwright test"`)

**Interfaces:**
- Consumes: `WorldStore`, `Selection`.
- Produces: com `?debug=1`, `window.__abyss = { worldId(), roster(): string[], lastTick(): number, positionsAt(tick): Record<string, Vec3> | null, status(), select(id), selection() }`. `positionsAt` devolve as posições cruas recebidas naquele tick (o store guarda os últimos 50 ticks crus, mas só quando o debug está ligado).

- [ ] **Step 1: Escrever os testes e2e.** Pré-requisitos: `pnpm api:up` e `pnpm build && pnpm preview` (o `webServer` do config sobe o preview na 4173). Testes:
  - `"duas abas veem o mesmo mundo"`: duas páginas em `/?debug=1`, ambas `status() === 'live'`. Os `worldId()` são iguais e os `roster()` são iguais (mesma ordem e mesmos ids). Para um tick T recebido pelas duas, `positionsAt(T)` é idêntico. O `lastTick()` das duas difere em ≤ 2 (critério 1: defasagem menor que uma fração de segundo a 10 Hz).
  - `"selecionar pelo índice seleciona o certo"`: abrir o índice, clicar em `Membrana` e no primeiro id. O `selection().id` é igual a esse id e o painel mostra `INDIVÍDUO · {id}`.
  - `"reinício reconecta com mundo novo"`: guarde `worldId()`, rode `docker compose -f infra/compose/compose.yaml restart api` via `child_process` e espere até 30 s por `status() === 'live'` com `worldId()` diferente. A página não pode recarregar (marque `window.__marker = 1` antes e confira que continua lá depois).
- [ ] **Step 2: Rodar.** Run: `pnpm e2e` → os 3 testes PASS. Para garantir que um verde é confiável, troque temporariamente a asserção de igualdade de `positionsAt` por desigualdade, veja falhar e desfaça.
- [ ] **Step 3: Commit** — `test: e2e de consistência e reinício do gate I`

### Task 12: Carga medida, desempenho e pacote de aceite

**Files:**
- Create: `scripts/load/observers.mjs`, `docs/GATE_I_ACCEPTANCE.md`
- Modify: `package.json` (`"load": "node scripts/load/observers.mjs"`)

**Interfaces:**
- Consumes: o socket público (Task 4) e `/api/stats`.
- Produces: `node scripts/load/observers.mjs --clients 50 --seconds 1800 --url ws://localhost:4000/socket`, que abre N clientes `phoenix.Socket` sem renderizar (o Node 24 tem `WebSocket` global), coleta o intervalo entre ticks por cliente, quedas de conexão e ticks perdidos (lacunas na sequência), e consulta `/api/stats` a cada 10 s (`jitter_ms_p99`, `step_us_max`, `observers`) e `docker stats --no-stream` para CPU e memória. No fim, imprime um resumo em Markdown e termina com exit 1 se reprovar.

Critério de aprovação (design §8): 30 min com 60 organismos (`population: 60`) e 50 clientes, mais 2 navegadores reais abertos; `jitter_ms_p99 < 0.2 × 100 ms = 20 ms`; memória do contêiner sem tendência de alta (a última amostra fica a no máximo 10% acima da mediana dos 10 primeiros minutos); zero quedas de conexão; `observers` igual a 52.

- [ ] **Step 1: Escrever o script.** Teste-o primeiro com `--clients 2 --seconds 20` e confira o resumo. Depois, para ver falhar, rode com o limite de jitter forçado a 0 (`--max-jitter-ms 0`) e confira exit 1.
- [ ] **Step 2: Rodada oficial.** Com `population: 60` (via env `ABYSS_POPULATION` lida em `config/runtime.exs`, padrão do config), a API no ar e 2 abas de `pnpm preview` abertas, rode `pnpm load -- --clients 50 --seconds 1800`. Expected: exit 0.
- [ ] **Step 3: Desempenho do cliente.** Com 60 organismos, meça `?perf=1` nos mesmos cenários da tabela de `docs/VISUAL_ACCEPTANCE.md` (RTX high e Intel Arc low, 1920×1080). Se o orçamento estourar, reduza primeiro a geometria do perfil `low` (sem esconder indivíduos) e depois a `population`. Registre o motivo.
- [ ] **Step 4: Pacote de aceite.** Escreva `docs/GATE_I_ACCEPTANCE.md` no estilo de `VISUAL_ACCEPTANCE.md`, com:
  - como rodar (`pnpm api:up`, `pnpm dev` ou `pnpm build && pnpm preview`);
  - os critérios 1–6 do design, cada um com sua evidência (saída do `pnpm e2e`, `pnpm test`, `pnpm api:test`, resumo da carga e tabela de desempenho);
  - capturas do quadro herói e do painel/índice;
  - o vídeo da Parada 2;
  - a linha "**Aceite do autor:** pendente".
- [ ] **Step 5: Commit** — `perf: carga e pacote de aceite do gate I`
- [ ] **Step 6: Critério 5 com o autor.** Apresente o pacote e peça a comparação com o protótipo 2 aprovado. Registre o aceite (ou os ajustes pedidos) em `GATE_I_ACCEPTANCE.md` e faça commit.
