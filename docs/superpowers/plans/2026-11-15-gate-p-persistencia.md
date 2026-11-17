# Gate P (Persistência) — Plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans, para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhar o progresso.

**Objetivo:** o mundo volta exatamente de onde parou (reinício, queda, deploy sem mudança de regra), com o tempo congelado enquanto o servidor está fora; cada extinção fica registrada com causa (última morte, predador, divisão dos últimos 30 min); um buscador leva a câmera até a espécie; a árvore conta a história; o banco tem backup com ensaio de restauração.

**Arquitetura:**
- **Relógio do mundo.** O `Sim` já recebe o relógio do `Server` (`Sim.step/3`). O `Server` passa a usar `world_ms = hora real − clock_offset_ms`. Tudo dentro do `Sim` (idades, fases, partículas, varredura) é relógio do mundo. Datas que saem para o banco e para a tela (nascimento de ramo, extinção) são convertidas para hora real na fronteira (`Server` nos callbacks, `Wire` em `species_info`/`x`).
- **Fotografia.** `Abyss.World.Snapshot` codifica o `Sim` (sem o mapa e sem o catálogo, que vêm do disco) com duas versões, formato e regras, mais checksum. Um processo `Abyss.World.Saver` grava em `world_snapshots` sem atrasar o tick (a cada `snapshot_s`, padrão 60, e no desligamento).
- **Volta.** No boot, `Abyss.World.Boot` carrega a fotografia válida mais recente e reconcilia com o banco (`Abyss.World.Reconcile`, puro). O banco manda em quais espécies/ramos existem e quando se extinguiram; a fotografia manda nas criaturas. Fotografia ausente/incompatível = recomeço (comportamento de hoje) com novo `epoch` e evento `restart` em `world_events`.
- **História.** Mortes de espécies criadas são contadas por intervalo de 5 min (relógio do mundo) em `death_counts`, com `epoch` e `tick`; extinções ganham causa, predador e o instante no relógio do mundo. `Abyss.History` responde a busca e a árvore anotada pela API; o cliente ganha o buscador e a árvore com história.

**Stack:** a do S2 (Elixir 1.20 + Phoenix 1.8 + Ecto/PostgreSQL 17 em Docker; React 19 + R3F 9 + three 0.187 + Vite 8 + Vitest 5; Playwright; Node 24). Nada novo, exceto a extensão `unaccent` do Postgres (já vem na imagem `postgres:17-alpine`).

**Spec:** `docs/superpowers/specs/2026-11-15-gate-p-persistencia-design.md` (aprovado em 2026-11-15). Também: design e plano do S2 (`docs/superpowers/specs/2026-11-13-gate-s2-evolucao-design.md`, `docs/superpowers/plans/2026-11-13-gate-s2-evolucao.md`) e `docs/GATE_S2_ACCEPTANCE.md`. Esboço da tela: `.superpowers/brainstorm/2438-1794794284/content/historia-onde.html` (opção A).

## Global Constraints

- Tudo o que E1, E2, S1 e S2 fixaram continua: um processo dono do mundo, nenhum processo por entidade, `mix` só no contêiner, 10 Hz, o cliente nunca envia estado, todo observador vê o mesmo mundo.
- **`Sim` puro:** não lê `Application` env nem relógio; o relógio entra por `Sim.step/3`.
- **O tick nunca espera o banco.** Gravação de história por `cast` no `Recorder`; fotografia codificada e gravada fora do `World.Server`. Única espera permitida: o desligamento (até `shutdown_save_ms`, padrão 10 000).
- **Orçamento de desempenho do S2 mantido:** `step_us_max` ≤ 20 ms com 250 organismos (pelo `sim_perf_test`); Arc `low` p95 ≤ 33 ms e RTX `high` p50 ≤ 16,7 ms; programas de shader fixos.
- **Valores do design:** fotografia a cada **60 s** (`snapshot_s`), **3** guardadas; intervalos de mortes de **5 min** (300 000 ms do mundo); reta final = **30 min** (1 800 000 ms do mundo) antes da extinção; backup a cada **6 h**, **7** guardados.
- **Tempo congelado:** servidor fora do ar não avança o mundo; nada de recuperar tempo.
- **Deploy (design §5.6):** `@format_version` sobe quando só entram campos (a carga completa com o padrão do struct); `@rules_version` sobe quando muda regra ou significado de campo (versão diferente = recomeço). As duas constantes ficam em `Abyss.World.Snapshot`, com um comentário dizendo quando subir cada uma.
- **Privacidade:** API nova só leitura e sem e-mail; logs só com ids. "Um e-mail = uma espécie" intacto.
- **Textos em pt-BR**, inclusive os da tela: "Nenhuma espécie com esse nome", "causa não registrada", "mundo recomeçado em", "todos passaram para ramos". Commits em pt-BR (`feat:`, `test:`, `docs:`, `chore:`, `perf:`) na branch `gate-p`, sem push.
- **Verificação sem `rtk`:** `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm api:test`, `pnpm e2e`. O código de saída é a fonte da verdade (`cmd; echo "exit=$?"`). `mix test` no contêiner vivo precisa de `-e ABYSS_TEST_SPECIES=true -e ABYSS_MUTATION_BOOST=1`.

## Review Focus

1. **Volta depois de uma parada longa** (6 h fora): nenhuma criatura morre de velhice, nenhuma partícula expira em massa e a varredura de ramos não dispara atrasada no primeiro passo. Teste: Task 6 (`volta depois de 6 h não mata por velhice`).
2. **Banco fora do ar ou gravação lenta** durante o mundo: o tick continua, uma fotografia em andamento não é sobreposta por outra, e o erro vai para o log só com ids. Teste: Task 5 (`gravação ocupada descarta a próxima`, `banco fora não derruba o mundo`).
3. **Fotografia corrompida ou cortada** (queda no meio da escrita): o boot pula para a anterior válida. Teste: Task 6 (`checksum ruim cai para a anterior`).
4. **Busca com texto estranho:** vazio, 1 letra, `%`, `_`, acento, maiúsculas e 500 caracteres. Nada quebra; `%` e `_` são literais; acima de 64 caracteres o texto é cortado. Teste: Task 7 (`busca escapa curingas e ignora acento`).
5. **Predador que não está no banco:** espécie de teste (id atom) ou ramo podado do `Sim`. O nome vem da tabela de espécies de teste ou do banco; se não existir, aparece "predador desconhecido". Teste: Task 7 (`nome do predador de teste e de ramo`).

---

## Formatos

**`life_events` (novo campo e campo novo de extinção, Task 1):**
- `dead_by: [{species_id, cause, predator_species_id | nil}]`, com `cause :: :starvation | :old_age | :predation`. Vale para todas as espécies, na ordem de `deaths`.
- `extinct_causes: %{species_id => {cause | :branched, predator_species_id | nil}}`: a última morte da espécie no passo da extinção. `:branched` = nenhuma morte dela no passo (todos passaram para ramos).

**Extinção para o `Recorder` (Task 2):** `%{id: String.t, at_ms: integer (real), world_ms: integer, epoch: pos_integer, cause: atom, predator: String.t | nil}`.

**Tabelas novas (migrations nas Tasks 3, 5 e 6):**
- `species` e `branches` ganham: `extinct_cause text`, `extinct_predator_id text`, `extinct_world_ms bigint`, `extinct_epoch integer`.
- `death_counts`: `id`, `species_id text` (id do `Sim`: `"sp3"`, `"sp3.1"`), `epoch integer`, `bucket_ms bigint` (início do intervalo no relógio do mundo, múltiplo de 300 000), `cause text`, `predator_id text null`, `n integer`, `tick bigint` (último tick contado nesta linha). Índice `(species_id, epoch, bucket_ms)` e `(epoch, tick)`. Linhas só são inseridas (sem upsert); a leitura soma.
- `world_snapshots`: `id`, `epoch integer`, `tick bigint`, `world_ms bigint`, `saved_at utc_datetime_usec` (hora real), `format_version integer`, `rules_version integer`, `checksum binary` (SHA-256 do `data`), `data bytea`.
- `world_events`: `id`, `kind text` (`"restart"` | `"pause"`), `epoch integer`, `at utc_datetime_usec`, `until utc_datetime_usec null`, `meta map`.

**API (Task 7), JSON:**
- `GET /api/species/search?q=` → `200 {"results": [{"id": "sp3.1", "name": "Lumina · Floresta", "root": "sp3", "alive": true}]}`. Até 20 resultados, vivas primeiro e depois por nome.
- `GET /api/species/:root_id/history` → `200 {"root": Node, "restarts": [iso8601]}` ou `404`. `Node = {"id", "name", "born_at": iso|null, "region": str|null, "diff": {"flagelo": 1, "placa": -1}, "extinct": null | {"at": iso, "cause": "starvation"|"old_age"|"predation"|"branched"|null, "predator": {"id", "name"}|null, "final": [{"cause", "predator_name"|null, "share": 0.7}]}, "children": [Node]}`. `cause: null` = extinção de antes do P.

---

### Task 1: Causa da morte e predador no `Sim`

**Files:**
- Modify: `apps/api/lib/abyss/world/sim.ex` (`@no_life`, tipo `t`, `catch_prey`, `step/3`, `bury`, `detect_extinct`)
- Test: `apps/api/test/abyss/world/sim_death_cause_test.exs`

**Interfaces:**
- Produces: `sim.life_events.dead_by` e `sim.life_events.extinct_causes` (seção Formatos). `food.prey_eaten` vira `%{presa_id => espécie_do_caçador}`; todo `MapSet.member?(…prey_eaten…)` vira `Map.has_key?`.

- [ ] **Step 1: Testes que falham** (`Sim.new` com `catalog: nil`, espécies de teste e semente fixa, como os testes de ecologia do E2):
  - `"predação registra a espécie do caçador"`: depois de um passo com uma caça bem-sucedida, `dead_by` tem `{presa.species, :predation, caçador.species}`.
  - `"fome e velhice não têm predador"`: organismo com `energy: 0` → `{sp, :starvation, nil}`; adulto além de `adult_life_s` → `{sp, :old_age, nil}`.
  - `"extinção guarda a última morte"`: o último organismo de uma espécie morre de fome → `extinct_causes[sp] == {:starvation, nil}`.
  - `"extinção sem morte é :branched"`: chamar o caminho em que a varredura passa todos para um ramo (reusar o cenário do teste de ramos do S2) → `extinct_causes[mãe] == {:branched, nil}`.
  - `"eco_totals.deaths não muda"`: as contagens por espécie e causa continuam as do S2.
- [ ] **Step 2:** `docker compose -f infra/compose/compose.yaml run --rm api mix test test/abyss/world/sim_death_cause_test.exs` → FAIL.
- [ ] **Step 3:** implementar. `catch_prey` grava `Map.put(food.prey_eaten, id, o.species)`. `bury` monta `dead_by` com o predador. `extinct_causes` é montado em `step/3` depois de `detect_extinct`, a partir do `dead_by` do passo (última entrada daquela espécie; se não houver, `:branched`).
- [ ] **Step 4:** o arquivo novo e `pnpm api:test` → PASS (toda a suíte do S2 continua verde).
- [ ] **Step 5:** commit `feat: causa da morte com predador e causa da extinção no Sim`.

### Task 2: Relógio do mundo no `Server` e datas reais na fronteira

**Files:**
- Modify: `apps/api/lib/abyss/world/server.ex`, `apps/api/lib/abyss/world/wire.ex`, `apps/api/lib/abyss/genesis/recorder.ex` (`record/1` com o formato novo), `apps/api/lib/abyss/application.ex`
- Test: `apps/api/test/abyss/world/server_clock_test.exs`, `apps/api/test/abyss/world/wire_test.exs` (casos novos)

**Interfaces:**
- Consumes: Task 1 (`life_events.extinct_causes`, `dead_by`).
- Produces:
  - Opções do `Server`: `clock_offset_ms` (padrão 0), `epoch` (padrão 1), `on_deaths` (`([{species_id, cause, predator | nil}], world_ms :: integer, tick :: integer, epoch -> any)`, só espécies criadas, id string, e só quando a lista não é vazia), `restore` (Task 6; aqui ainda não usada).
  - `on_extinct` passa a receber a lista de mapas de extinção da seção Formatos (só criadas). `on_branch` recebe as espécies com `born_ms` em hora real.
  - `species_loader`: os `born_ms` e os ms de extinção que chegam são hora real; o `Server` converte para o relógio do mundo (`− offset`) antes do `Sim.add_species`.
  - `Wire.meta` ganha `offset_ms`. `species_info.born_ms`, `species_info.extinct_ms` e `x` do tick saem em hora real (`+ offset`). `server_ms`, os `born_ms` dos organismos e os tempos das partículas continuam no relógio do mundo.
  - `Server.clock(server) :: %{world_ms: integer, offset_ms: integer, epoch: pos_integer, tick: non_neg_integer}` (para testes e para o `Saver`).
- [ ] **Step 1: Testes que falham:**
  - `server_clock_test.exs`, `"offset atrasa o relógio do mundo"`: `Server` anônimo com `clock_offset_ms: 3_600_000`; `snapshot().server_ms` ≈ agora − 3 600 000 (± 1 000).
  - `"extinção chega em hora real com causa"`: `step` injetado devolve um `Sim` com `life_events.extinct = [{"sp1", w}]` e `extinct_causes`; `on_extinct` recebe `%{id: "sp1", world_ms: w, at_ms: w + offset, epoch: 1, cause: …, predator: …}`.
  - `"espécie carregada converte para o relógio do mundo"`: loader com ramo `born_ms: R` → no `Sim`, `born_ms == R − offset`; no `Wire.snapshot`, `born_ms == R`.
  - `"on_deaths só com criadas"`: `dead_by` com espécie de teste (atom) e criada → o callback recebe só a criada, com `world_ms`, `tick` e `epoch`.
- [ ] **Step 2:** rodar os dois arquivos → FAIL.
- [ ] **Step 3:** implementar. `Recorder.record/1` lê `at_ms` do mapa novo (as colunas de causa entram na Task 3). Em `application.ex`, ligar `on_deaths: &Abyss.Genesis.Recorder.record_deaths/4` só a partir da Task 3 (aqui o padrão é `fn _, _, _, _ -> :ok end`).
- [ ] **Step 4:** `pnpm api:test` → PASS.
- [ ] **Step 5:** commit `feat: relógio do mundo no Server e datas reais no fio e no banco`.

### Task 3: Causas e contagem de mortes no banco

**Files:**
- Create: `apps/api/priv/repo/migrations/20261116000001_create_death_history.exs` (colunas novas em `species`/`branches`, tabela `death_counts`), `apps/api/lib/abyss/genesis/death_count.ex` (schema)
- Modify: `apps/api/lib/abyss/genesis/recorder.ex`, `species_record.ex`, `branch_record.ex`, `apps/api/lib/abyss/application.ex`, `apps/api/lib/abyss/genesis.ex` (`reset!/0` inclui `death_counts`)
- Test: `apps/api/test/abyss/genesis/recorder_test.exs` (casos novos)

**Interfaces:**
- Consumes: Task 2 (formatos de `on_extinct` e `on_deaths`).
- Produces:
  - `Recorder.record_deaths(dead_by, world_ms, tick, epoch) :: :ok` (cast). Acumula em memória por `{species_id, epoch, bucket_ms, cause, predator}`.
  - `Recorder.flush_deaths() :: :ok` (cast): insere o acumulado (uma linha por chave, `tick` = último tick acumulado) e zera. Também roda sozinho a cada 10 s e dentro de `sync/1`.
  - `record/1` grava `extinct_at`, `extinct_cause`, `extinct_predator_id`, `extinct_world_ms`, `extinct_epoch`, e faz `flush_deaths` antes, para a reta final daquela extinção já estar no banco.
- [ ] **Step 1: Testes que falham** (`DataCase`, Recorder iniciado no teste):
  - `"mortes somam por intervalo de 5 min"`: `record_deaths` em `world_ms` 0, 299 999 e 300 000 + `sync` → duas linhas de bucket (0 e 300 000) com as somas certas.
  - `"predador fica na linha"`: duas causas de predação com predadores diferentes → linhas separadas.
  - `"extinção grava causa e reta final antes"`: `record_deaths` e depois `record([%{… cause: :predation, predator: "sp2"}])` + `sync` → `species.extinct_cause == "predation"`, `extinct_predator_id == "sp2"`, e as linhas de `death_counts` já existem.
  - `"reset apaga death_counts"`.
- [ ] **Step 2:** `mix test test/abyss/genesis/recorder_test.exs` (no contêiner) → FAIL.
- [ ] **Step 3:** implementar. Ligar `on_deaths` em `application.ex`.
- [ ] **Step 4:** `pnpm api:test` → PASS.
- [ ] **Step 5:** commit `feat: causa da extinção e contagem de mortes por intervalo no banco`.

### Task 4: Codificação da fotografia

**Files:**
- Create: `apps/api/lib/abyss/world/snapshot.ex`
- Test: `apps/api/test/abyss/world/snapshot_test.exs`

**Interfaces:**
- Produces:
  - `Snapshot.encode(Sim.t) :: binary`: `:erlang.term_to_binary(…, [:compressed])` de um mapa com o `Sim` sem `bounds.map`, sem `catalog` e com `life_events`/`food_events` vazios, mais o `map.id`.
  - `Snapshot.decode(binary, %{map: WMap.t, catalog: map | nil, mutation_boost: number}) :: {:ok, Sim.t} | {:error, :rules | :format | :map}`. Reatacha mapa e catálogo, refaz o que derivar do mapa (`bounds.map`, `sponge_grid` se for preciso) e completa campos ausentes do `Sim`, de cada `Organism` e de cada espécie com o padrão do struct (`struct/2` sobre um struct novo).
  - `Snapshot.checksum(binary) :: binary` (SHA-256).
  - `Snapshot.format_version() :: pos_integer`, `Snapshot.rules_version() :: pos_integer` (`@format_version 1`, `@rules_version 1`, com o comentário da regra §5.6).
- [ ] **Step 1: Testes que falham:**
  - `"ida e volta continua o mesmo mundo"`: um `Sim` de semente fixa com 2 espécies criadas e mutação, 300 passos; `decode(encode(sim))`; os dois avançam mais 100 passos e ficam iguais (organismos, rng, tick, flora, partículas).
  - `"regras diferentes recusam"`: binário com `rules_version` diferente → `{:error, :rules}`.
  - `"mapa diferente recusa"`: `map.id` diferente → `{:error, :map}`.
  - `"formato antigo com campo a menos é completado"`: monta o binário de um `Sim` cujo mapa de organismo não tem um campo (simulado tirando a chave antes de codificar) → `decode` dá o organismo com o padrão do struct, e o mundo avança 10 passos sem erro.
  - `"tamanho com 250 organismos"`: registra o tamanho e o tempo de `encode` no output do teste (sem asserção de limite; o número vai para o aceite).
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** commit `feat: codificação versionada da fotografia do mundo`.

### Task 5: Gravação periódica e no desligamento

**Files:**
- Create: `apps/api/priv/repo/migrations/20261116000002_create_world_snapshots.exs`, `apps/api/lib/abyss/world/snapshot_record.ex` (schema), `apps/api/lib/abyss/world/saver.ex`
- Modify: `apps/api/lib/abyss/world/server.ex` (timer de fotografia, `Process.flag(:trap_exit, true)`, `terminate/2`), `apps/api/lib/abyss/application.ex` (Saver antes do Server), `apps/api/config/*.exs` + `runtime.exs` (`snapshot_s` de `ABYSS_SNAPSHOT_S`, padrão 60; `shutdown_save_ms` 10 000), `infra/compose/compose.yaml` (`command` com `exec mix phx.server`, para o SIGTERM chegar à VM; `stop_grace_period: 30s`), `apps/api/lib/abyss/genesis.ex` (`reset!/0` inclui `world_snapshots`)
- Test: `apps/api/test/abyss/world/saver_test.exs`, `server_snapshot_test.exs`

**Interfaces:**
- Consumes: Task 4 (`Snapshot.encode/1`, `checksum/1`, versões), Task 2 (`Server.clock/1`), Task 3 (`Recorder.flush_deaths/0`).
- Produces:
  - `Saver.save(%{sim: Sim.t, epoch: pos_integer, world_ms: integer, saved_at: DateTime.t}) :: :ok | :busy` (call curta: aceita e codifica/grava num `Task` próprio; se uma gravação está em andamento, devolve `:busy` e descarta).
  - `Saver.save_sync(same, timeout) :: :ok | {:error, term}` (para o desligamento).
  - `Saver.latest(n \\ 3) :: [SnapshotRecord.t]`, da mais nova para a mais velha. Depois de gravar, apaga as que passam de 3.
  - `Server`: a cada `snapshot_s`, chama `Recorder.flush_deaths()` e depois `Saver.save/1` (o `cast` de flush entra na fila antes; a fronteira de contagem fica exata). Em `terminate/2`: flush, `Recorder.sync`, `Saver.save_sync(…, shutdown_save_ms)`.
- [ ] **Step 1: Testes que falham:**
  - `"grava a cada intervalo e guarda 3"`: `Server` com `snapshot_s: 0.2`; depois de ~1 s há exatamente 3 linhas e o `tick` da mais nova é crescente.
  - `"gravação ocupada descarta a próxima"`: `Saver` com gravação lenta injetada (opção `writer` para teste) → segunda chamada devolve `:busy` e só uma linha é escrita.
  - `"desligamento grava"`: `GenServer.stop(server, :shutdown)` → uma linha nova com o `tick` final.
  - `"banco fora não derruba o mundo"`: `writer` que levanta exceção → o `Server` continua avançando e o log tem só o tick.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `pnpm api:test` → PASS; `pnpm api:up`, `docker compose -f infra/compose/compose.yaml stop api` e conferir no log e em `world_snapshots` que a parada gravou.
- [ ] **Step 5:** commit `feat: fotografia do mundo a cada minuto e no desligamento`.

### Task 6: Volta do servidor e reconciliação

**Files:**
- Create: `apps/api/priv/repo/migrations/20261116000003_create_world_events.exs`, `apps/api/lib/abyss/world/world_event.ex` (schema), `apps/api/lib/abyss/world/reconcile.ex` (puro), `apps/api/lib/abyss/world/boot.ex`
- Modify: `apps/api/lib/abyss/world/server.ex` (`init` com `restore`), `apps/api/lib/abyss/application.ex`, `apps/api/lib/abyss/genesis.ex` (`boot_species/0` passa a devolver também `born_at`/`extinct_at` reais e os campos de extinção; `reset!/0` inclui `world_events`)
- Test: `apps/api/test/abyss/world/reconcile_test.exs`, `boot_test.exs`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  - `Reconcile.apply(sim :: Sim.t, db :: %{live: [Species.t], extinct: [{Species.t, real_ms}]}, saved_at_ms :: integer, offset_ms :: integer) :: Sim.t`, com as regras do design §6.4: espécie viva no banco e ausente no `Sim` → `add_species(founders: 3)` (raiz ou ramo); extinta no banco e com organismos no `Sim` → retira os organismos e marca extinta no ms do mundo `real − offset`; extinta no banco e ausente no `Sim` → `add_species(founders: 0, extinct_ms: …)`.
  - `Boot.load(%{map: WMap.t, catalog: map | nil, mutation_boost: number}) :: {:restored, %{sim: Sim.t, offset_ms: integer, epoch: pos_integer, snapshot_tick: integer, saved_at_ms: integer}} | {:fresh, %{epoch: pos_integer, reason: :none | :rules | :format | :map | :checksum}}`. Tenta as 3 mais recentes por ordem; `offset_ms = agora_real − world_ms_da_fotografia`; grava `world_events` `"pause"` (de `saved_at` até agora). No `:fresh` com fotografia existente: `epoch = maior epoch + 1` e evento `"restart"`. Sem nenhuma fotografia: `epoch = 1`, sem evento.
  - Descarte de contagens: em `:restored`, apaga `death_counts` com `epoch == snapshot.epoch` e `tick > snapshot_tick`, exceto de `species_id` cuja extinção no banco tem `extinct_at > saved_at`.
  - `Server.init`: com a opção `boot: &Boot.load/1` (padrão em `application.ex`), usa o `Sim` restaurado (`Reconcile.apply` com `boot_species/0`) e passa `clock_offset_ms`/`epoch`; no `:fresh`, faz o que faz hoje. Tick e relógio do mundo continuam do ponto salvo.
- [ ] **Step 1: Testes que falham:**
  - `reconcile_test.exs`: `"espécie criada depois da fotografia nasce com 3"`; `"ramo gravado depois da fotografia volta com 3 da planta dele"`; `"extinção gravada depois vale a do banco"` (organismos retirados, `sim.extinct` com o ms do mundo); `"nada a reconciliar não muda o Sim"`.
  - `boot_test.exs` (`DataCase`):
    - `"volta da fotografia mais nova"`: grava duas e `load` devolve a de maior `tick`.
    - `"checksum ruim cai para a anterior"`: corrompe o `data` da mais nova.
    - `"regras diferentes recomeçam com epoch novo e evento"`.
    - `"volta depois de 6 h não mata por velhice"`: fotografia com `saved_at` 6 h atrás → `offset_ms` ≈ 6 h; o primeiro `Sim.step/3` com `agora − offset` tem `dead_by` sem `:old_age` além do normal (compara com o mesmo `Sim` dado um passo sem a parada) e nenhuma expiração em massa de partículas.
    - `"queda descarta contagens depois da fotografia, menos as de extinção"`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `pnpm api:test` → PASS; ao vivo: `pnpm api:up`, esperar 2 min, `docker compose … restart api` → `/api/stats` mostra o `tick` continuando do ponto salvo e a mesma população.
- [ ] **Step 5:** commit `feat: o mundo volta da fotografia e se reconcilia com o banco`.

### Task 7: API de busca e história

**Files:**
- Create: `apps/api/priv/repo/migrations/20261116000004_enable_unaccent.exs` (`CREATE EXTENSION IF NOT EXISTS unaccent`), `apps/api/lib/abyss/history.ex`, `apps/api/lib/abyss_web/controllers/species_controller.ex`
- Modify: `apps/api/lib/abyss_web/router.ex`, `apps/api/lib/abyss/genesis/rate_limit.ex` (chave nova `:search`, 60 por minuto por IP)
- Test: `apps/api/test/abyss/history_test.exs`, `apps/api/test/abyss_web/controllers/species_controller_test.exs`

**Interfaces:**
- Consumes: Task 3 (colunas e `death_counts`), Task 6 (`world_events` `"restart"`), `Blueprint.part_delta/2` (S2), `Abyss.World.Species.all/0` (nomes das espécies de teste).
- Produces: `History.search(q :: String.t) :: [map]` e `History.tree(root_id :: String.t) :: {:ok, map} | :not_found`, nos formatos da seção API. A reta final soma `death_counts` da espécie com `epoch == extinct_epoch` e `bucket_ms` em `[extinct_world_ms − 1_800_000, extinct_world_ms]`; `share` arredondado a 2 casas, ordenado do maior para o menor. `cause: "branched"` não tem `final`. O nome do predador vem do banco (raiz ou ramo), de `Species.all/0` (teste) ou é `"predador desconhecido"`. `restarts` são as datas de `"restart"` dentro da vida da raiz.
- [ ] **Step 1: Testes que falham:**
  - `history_test.exs`: `"busca acha raiz e ramo, vivas primeiro"`; `"busca escapa curingas e ignora acento"` (`"lúmina"` acha `"Lumina"`; `"%"` não acha tudo; `""` e `"a"` devolvem `[]`; 500 caracteres não quebram); `"árvore com diferenças de peças"` (ramo com +2 ocelos → `diff == %{"ocelo" => 2}`); `"reta final por predador"` (contagens 5 predação por sp2, 2 por sp7, 3 fome → shares 0.5/0.2/0.3); `"nome do predador de teste e de ramo"`; `"extinção antiga sem causa"` → `cause: nil`; `"recomeço aparece na raiz viva"`.
  - `species_controller_test.exs`: `"search devolve JSON sem e-mail"` (o corpo não contém `@` nem `email`); `"history 404 para id desconhecido"`; `"busca limitada por IP"` (61ª requisição → 429).
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar (`unaccent(lower(name)) LIKE unaccent(lower($1))` com `\`, `%`, `_` escapados; texto cortado em 64; mínimo 2 caracteres).
- [ ] **Step 4:** `pnpm api:test` → PASS.
- [ ] **Step 5:** commit `feat: API de busca e de história da espécie`.

### Task 8: Buscador no cliente

**Files:**
- Create: `apps/web/src/services/speciesApi.ts`, `apps/web/src/ui/SpeciesSearch.tsx`, `apps/web/src/ui/SpeciesSearch.test.tsx`, `apps/web/src/services/lineageUi.ts` (estado compartilhado "árvore aberta / raiz pedida")
- Modify: `apps/web/src/lib/lineage.ts` (+ `nearestLiving`), `apps/web/src/lib/lineage.test.ts`, `apps/web/src/ui/LineageButton.tsx` (abre/fecha pelo `lineageUi`), `apps/web/src/App.tsx`
- Test: os dois `.test` acima

**Interfaces:**
- Consumes: Task 7 (API); `readCamera()` de `scene/cameraPose.ts`; `store.sample`, `store.roster`, `store.vitals`; `selection.select(id)` (seguir, como hoje).
- Produces:
  - `searchSpecies(q: string): Promise<SearchResult[]>` e `fetchHistory(rootId: string): Promise<HistoryTree | null>` em `speciesApi.ts` (base `API_URL` de `genesis/genesisApi.ts`; tipos espelham a seção API). Erro de rede lança.
  - `nearestLiving(store, speciesIds: ReadonlySet<string>, from: Vec3, localMs: number): string | null` — o vivo (sem fantasmas) mais próximo de `from` entre as espécies dadas.
  - `lineageUi`: `open(rootId: string | null)`, `close()`, `useLineageUi(): { open: boolean; rootId: string | null }`.
  - Comportamento ao escolher um resultado (design §5.3): viva → `select(nearestLiving({id}))`; extinta → descendentes vivos (ids que começam com `id + "."`, presentes na store) → `select(nearestLiving(descendentes))` e `lineageUi.open(root)`; nenhum vivo → só `lineageUi.open(root)`. Busca com 2+ caracteres, espera 250 ms depois da última tecla; resultado vazio → "Nenhuma espécie com esse nome" logo abaixo do campo, que some ao digitar de novo. Erro de rede → "Não foi possível falar com o abismo." no mesmo lugar.
- [ ] **Step 1: Testes que falham** (Vitest, `fetch` falso, store de `test-utils/world.tsx`):
  - `lineage.test.ts`: `"nearestLiving escolhe o mais perto e ignora fantasmas"`.
  - `SpeciesSearch.test.tsx`: `"viva: seleciona a mais próxima"`; `"extinta com ramo vivo: segue o ramo e abre a árvore da raiz"`; `"linhagem extinta: só abre a árvore"`; `"nome inexistente mostra o aviso e ele some ao digitar"`; `"1 letra não busca"`.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** implementar. Posição: `position: fixed; left: 16px; top: 16px; width: 240px`, mesmo fundo/borda/fonte mono dos painéis (`rgba(2,10,16,0.72)`, `1px solid rgba(220,235,232,0.3)`); lista de até 20 resultados, ramos com o nome completo.
- [ ] **Step 4:** `pnpm test; echo "exit=$?"` e `pnpm typecheck; echo "exit=$?"` → 0.
- [ ] **Step 5:** commit `feat: buscador de espécies que leva a câmera até elas`.

### Task 9: Árvore com história

**Files:**
- Modify: `apps/web/src/ui/LineageTree.tsx`, `apps/web/src/ui/LineageTree.test.tsx`, `apps/web/src/lib/format.ts` (+ `formatCause`, `formatDiff`)
- Test: `LineageTree.test.tsx`, `apps/web/src/lib/format.test.ts`

**Interfaces:**
- Consumes: Task 8 (`fetchHistory`, `lineageUi.rootId`), `buildLineage`/`useLiving` (contagem de vivos ao vivo).
- Produces: a árvore da opção A. A raiz vem de `lineageUi.rootId` ou da seleção, como hoje. Com a história carregada, cada nó mostra: nome; vivo → contagem da store; ramo → `nasceu dd/mm · +flagelo −placa` (`formatDiff`); extinto → `✕ extinta dd/mm hh:mm`, `última morte: fome | velhice | predação por <nome> | todos passaram para ramos | causa não registrada` (`formatCause`) e, se houver `final`, `últimos 30 min: 50% predação por Garra, 30% fome`. Raiz com `restarts` → linha `mundo recomeçado em dd/mm`. A história é buscada de novo quando muda o conjunto de espécies ou extintas da raiz na store. Sem história (rede/404), a árvore funciona como hoje.
- [ ] **Step 1: Testes que falham:**
  - `format.test.ts`: `formatDiff({flagelo: 1, placa: -1}) === "+flagelo −placa"` (sinal de menos U+2212, peças em ordem alfabética); `formatCause` para as 5 causas.
  - `LineageTree.test.tsx`: `"nó extinto mostra causa e reta final"`; `"ramo mostra nascimento e diferenças"`; `"extinção antiga mostra causa não registrada"`; `"sem história mostra a árvore de hoje"`; `"abre pela raiz pedida no lineageUi"`.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** implementar, com as linhas secundárias em `opacity: 0.6` e o ✕/extinção na cor de alerta suave do esboço (`#e6b8a0`).
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck`, `pnpm build` → exit 0.
- [ ] **Step 5:** commit `feat: árvore da espécie conta ramos e extinções com causa`.

### Task 10: Parada 1 (buscador e história ao vivo)

- [ ] **Step 1:** mundo de referência do S2 (10 criadas `Random.blueprint`, sem espécies de teste, `ABYSS_MUTATION_BOOST` do S2 para ver ramos e extinções em pouco tempo); deixar rodar até haver pelo menos um ramo e uma extinção com causa. Capturas em `docs/captures/p/parada-1/` (busca com resultados, aviso de nome inexistente, árvore com ramo e extinção) com README.
- [ ] **Step 2:** levar ao autor: buscador, os quatro casos de busca, árvore com história. Registrar a resposta e os pedidos no ledger. Ajustes pedidos viram passos desta Task antes da Task 11.

### Task 11: Backup e ensaio de restauração

**Files:**
- Create: `infra/backup/backup.sh` (loop: `pg_dump -Fc` a cada `BACKUP_EVERY_S`, padrão 21 600; guarda os 7 mais novos em `/backups`), `scripts/backup/restore.sh <arquivo>` (para o `api`, `pg_restore --clean --if-exists` no `abyss_dev`, sobe o `api`), `docs/captures/p/backup/README.md` (ensaio)
- Modify: `infra/compose/compose.yaml` (serviço `backup` com `postgres:17-alpine`, volume `db_backups`, `depends_on: db`), `package.json` (`"api:backup:now"` e `"api:restore"`)

- [ ] **Step 1:** subir com `BACKUP_EVERY_S=30` e conferir que surgem arquivos e que o 8º apaga o mais velho.
- [ ] **Step 2: Ensaio:** com o mundo rodando, anotar `tick`, população e espécies; fazer backup; apagar o volume `db_data` (`docker compose … down -v` só do `db`); restaurar; subir → `/api/stats` mostra o mundo da fotografia do backup (mesma população e espécies; `tick` do momento do backup). Registrar os números no README.
- [ ] **Step 3:** commit `chore: backup agendado do banco e ensaio de restauração`.

### Task 12: e2e de persistência, desempenho e carga

**Files:**
- Create: `scripts/e2e/persistence.mjs`
- Modify: `package.json` (`e2e` inclui `node scripts/e2e/persistence.mjs`), `scripts/e2e/run.mjs` (caso de busca)

- [ ] **Step 1:** `persistence.mjs` (contra o compose ao vivo, com o restore seguro a sinais do S2):
  - **Reinício normal:** guarda ids, idades e posições de todos; `docker compose … restart api`; depois do resync, os mesmos ids existem, idade de cada um = idade antes ± 2 s, `tick` continua.
  - **Queda:** `docker compose … kill -s KILL api`; `up`; a diferença de `tick` para antes é ≤ 60 s × 10 Hz + margem; nenhuma contagem de `death_counts` com `tick` > o da fotografia carregada (fora das extinções).
  - **Parada longa:** `stop api`, esperar 5 min, `up`; a taxa de mortes por velhice no primeiro minuto não passa a média do minuto antes da parada × 2.
  - **Deploy com campo novo:** o teste de unidade da Task 4 cobre; aqui só registrar no aceite.
- [ ] **Step 2:** caso de busca no `run.mjs`: digitar o nome de uma espécie viva → `__abyss` mostra seleção de um organismo dela; nome inexistente → aviso visível.
- [ ] **Step 3:** desempenho: `sim_perf_test` (orçamento 20 ms), perf das 2 GPUs parado e voando como no S2, e o tempo do `Server` por tick com a fotografia ligada (`step_us_max` e jitter p99 em `/api/stats`, sem pico no segundo da fotografia). Carga do S2 com 50 observadores. Números em `docs/captures/p/perf/README.md`.
- [ ] **Step 4:** `pnpm e2e; echo "exit=$?"` → 0.
- [ ] **Step 5:** commit `test: e2e de reinício, queda e parada longa; desempenho do gate P`.

### Task 13: Parada 2 e pacote de aceite

- [ ] **Step 1:** escrever `docs/GATE_P_ACCEPTANCE.md` no molde do S2: o que foi entregue, provas da seção 8 do design (cada uma com comando e resultado), números de desempenho, tamanho e tempo da fotografia, ensaio de backup, desvios e pontos em aberto (herdados: tick de 12,1 kB e broadcast de ~20 ms → O; "metade da tela preta"; M2; M5 `ABYSS_MUTATION_BOOST` em prod → O; backup fora da máquina → O).
- [ ] **Step 2:** Parada 2: o autor revê o pacote e assiste a uma demonstração de reinício e de queda; registrar a aprovação explícita (único critério que fecha o gate).
- [ ] **Step 3:** commit `docs: aceite do gate P`.
