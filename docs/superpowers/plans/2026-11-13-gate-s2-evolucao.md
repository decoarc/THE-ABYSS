# Gate S2 (Evolução) — Plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans, para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhar o progresso.

**Objetivo:** os filhos das espécies criadas nascem às vezes com a planta diferente; quando um jeito novo de peças se firma num grupo, nasce um ramo (subespécie) com nome, lugar no índice e na árvore, extinção própria e caça entre ramos, e a evolução é visível em 30–60 min de mundo.

**Arquitetura:**
- **Genoma por organismo.** Cada organismo de espécie criada aponta para um genoma (`genome`, inteiro) guardado uma vez no `Sim` (`genomes`), com a planta e as características dela (`Traits.species`). As regras do `Sim` leem as características do organismo pelo genoma, não mais pela espécie. A mutação acontece em `newborn` (`Abyss.Genesis.Mutation.child/3`).
- **Ramo = espécie.** Um ramo é uma espécie registrada em tempo de execução (`Sim.add_species`), com `parent`, `root`, `region` e `born_ms`. Assim caça "de outra espécie", extinção, fio, índice e reinício do S1 valem para ramos sem caminho novo. Os ids codificam a ancestralidade: `sp3` → `sp3.1` → `sp3.1.2`. Uma varredura periódica no `Sim` (`scan_branches`) cria os ramos e passa os membros para eles.
- **Fio:** o genoma vai uma vez (snapshot `genomes`, tick `g`), o organismo leva só o id (`g`); `rb` muda a espécie de quem passou para um ramo. **Banco:** tabela `branches`. **Cliente:** a `Criada` desenha pela planta do genoma; botão da árvore + fluxograma; índice com ramos.

**Stack:** a do S1 (Elixir 1.20 + Phoenix 1.8 + Ecto/PostgreSQL 17 em Docker; React 19 + R3F 9 + three 0.187 + Vite 8 + Vitest 5; Playwright; Node 24). Nada novo.

**Spec:** `docs/superpowers/specs/2026-11-13-gate-s2-evolucao-design.md` (aprovado em 2026-11-13). Também: design e plano do S1 (`docs/superpowers/specs/2026-11-08-gate-s1-genese-design.md`, `docs/superpowers/plans/2026-11-10-gate-s1-genese.md`, cujas seções Catálogo, Planta, Banco e Fio descrevem o formato atual) e `docs/GATE_S1_ACCEPTANCE.md` ("Desvios e pontos em aberto").

## Global Constraints

- Tudo o que E1, E2 e S1 fixaram continua: mundo em memória, nenhum processo por entidade, `mix` só no contêiner, 10 Hz, o cliente nunca envia estado, todo observador vê o mesmo mundo.
- **`Sim` puro:** não lê `Application` env. O catálogo entra por `Sim.new(%{catalog: Catalog.t | nil})`; com `nil` (padrão) não há mutação nem ramos (os testes antigos não mudam).
- **Nenhuma regra testa id ou nome de espécie.** "Outra espécie" = `o.species` diferente; ramos-irmãos e mãe são outras espécies. Dentro do mesmo ramo nunca há caça (sem canibalismo, que fica fora do S2).
- **Espécies de teste** (`ABYSS_TEST_SPECIES`) não têm genoma: não mutam, não ramificam, seguem iguais.
- **Diferença de peças** conta entradas de `parts` por `kind` (uma entrada espelhada conta 1). Corpo, cores, padrão, posição, tamanho e ângulo não contam.
- **Regra de ramo** (valores iniciais em `:ecology`, ajustáveis na Task 8): `branch_scan_s: 10`, `branch_diff: 2`, `branch_min: 5`, `branch_inherited: 3`.
- **Mutação pode passar do orçamento** (`budget`), mas nunca dos limites estruturais: exatamente uma boca, `parts_max`, `max` por tipo, faixas de corpo, `part_size`, `part_angle`, `max_bytes`.
- **Teto `pop_cap` 250 não muda.** O orçamento de desempenho do E2 continua: `step_us_max` ≤ 20 ms com 250 organismos; Arc `low` p95 ≤ 33 ms e RTX `high` p50 ≤ 16,7 ms, parado e voando; programas de shader não crescem com genomas novos.
- **Privacidade e "um e-mail = uma espécie"** do S1 intactos: ramos não têm criadora nem e-mail e não ocupam linha em `species`.
- **Mundo de referência** para ritmo e equilíbrio: 10 espécies criadas `Random.blueprint`, sem espécies de teste. Com 50 criadas, só desempenho e "algum ramo aparece".
- **Textos em pt-BR.** Commits em pt-BR (`feat:`, `art:`, `perf:`, `test:`, `docs:`, `chore:`) na branch `gate-s2`, sem push.
- **Verificação sem `rtk`:** `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm api:test`, `pnpm e2e`. O código de saída é a fonte da verdade.

## Review Focus

1. **Organismo trocado de ramo no meio de uma caça ou divisão:** o caçador que perseguia um irmão do mesmo grupo continua coerente (se viraram o mesmo ramo, a caça é abandonada no passo seguinte; nenhuma presa do próprio ramo é comida), e a divisão em curso termina com o filho no ramo novo. Teste: Task 3 (`passar para o ramo encerra caça a irmão do mesmo ramo`, `divisão em curso nasce no ramo novo`).
2. **Cliente que perde ticks com `g`/`rb`/`sp`** (aba em segundo plano): nascido com genoma desconhecido não quebra nem é desenhado errado (usa a planta da espécie até o resync); `rb` de organismo desconhecido é ignorado; repetidos não duplicam. Teste: Task 6 (`genoma desconhecido desenha a planta da espécie`, `rb desconhecido é ignorado`).
3. **Mãe extinta com ramos vivos, inclusive depois de um reinício e da poda das 100 extintas:** o nó da mãe continua existindo (extinto, com data) para a árvore não perder a raiz. Testes: Task 3 (`poda nunca tira ancestral de espécie viva`) e Task 5 (`boot traz ancestrais extintos de ramos vivos`).
4. **Mutação que gera planta inválida para o desenho** (boca dupla, peça além de `max`, `max_bytes`): nunca acontece, em milhares de gerações encadeadas. Teste: Task 1 (`10 mil gerações encadeadas continuam válidas`).
5. **Snapshot inchando com genomas** (250 vivos, todos com genoma diferente): genomas sem vivos saem do `Sim` e do snapshot. Testes: Task 2 (`genoma sem vivos é coletado`) e Task 10 (tamanho do snapshot registrado).

---

## Mutação (bloco novo em `shared/genesis/catalog-s1.json`)

Valores iniciais escolhidos pelo construtor (§8 do design), **ajustados na Task 8 e na Parada 1**; cada mudança vai para o ledger.

```json
"mutation": {
  "part_p": 0.06,
  "mouth_share": 0.1,
  "ops": { "add": 0.4, "remove": 0.3, "swap": 0.3 },
  "drift_p": 0.5,
  "drift": { "spine_xy": 0.04, "spine_r": 0.02, "hue": 0.02, "pattern_p": 0.03 }
}
```

- Por nascimento, com probabilidade `part_p`, uma mutação de peça. Dentro dela, com `mouth_share` é **troca de boca** (por outra boca); senão sorteia `ops`: **add** (tipo não-boca sorteado, `at`/`around`/`size`/`angle` uniformes nas faixas, `mirror` 50% se o tipo permite), **remove** (uma entrada não-boca sorteada), **swap** (o `kind` de uma entrada não-boca vira outro tipo não-boca; `mirror` vira `false` se o novo tipo não permite). Se a operação sorteada estoura um limite estrutural ou não tem alvo, não há mutação de peça neste nascimento.
- Com probabilidade `drift_p`, deriva: cada ponto da espinha anda até `±spine_xy` em x/y e `±spine_r` em r (reordenando nada: se `x` deixaria de ser crescente, aquele ponto não anda), as duas cores giram o matiz até `±hue` (fração da volta, HSL, mesma saturação e luz), e com `pattern_p` o padrão troca. Tudo depois limitado às faixas do catálogo e arredondado a 3 casas (para filhos irmãos repetirem genoma com frequência).

---

### Task 1: Mutação da planta

**Files:**
- Modify: `shared/genesis/catalog-s1.json` (bloco `mutation`), `apps/api/lib/abyss/genesis/catalog.ex`, `blueprint.ex`, `apps/web/src/genesis/blueprint.ts` (tipo `Catalog` com `mutation?` opcional; o editor não usa)
- Create: `apps/api/lib/abyss/genesis/mutation.ex`
- Test: `apps/api/test/abyss/genesis/mutation_test.exs`, `blueprint_test.exs`

**Interfaces:**
- Produces:
  - `Blueprint.validate(term, Catalog.t, opts \\ []) :: {:ok, map} | {:error, [String.t]}`; `opts[:budget] == false` pula só a checagem de orçamento.
  - `Blueprint.part_delta(a :: map, b :: map) :: %{String.t => integer}` — `count_b(kind) − count_a(kind)` por entrada de `parts`, só os não-zero.
  - `Blueprint.part_distance(delta) :: non_neg_integer` — `max(Σ positivos, Σ |negativos|)` (troca = 1, acréscimo = 1, dois acréscimos = 2).
  - `Mutation.child(bp :: map, Catalog.t, :rand.state) :: {map, mutated :: boolean, :rand.state}` — `mutated` é true só quando houve mutação **de peça**.

- [ ] **Step 1: Testes que falham:**
  - `blueprint_test.exs`: `"distância de peças"` — troca de flagelo por aleta: delta `%{"flagelo" => -1, "aleta" => 1}`, distância 1; +2 ocelos: distância 2; troca + acréscimo: 2; plantas iguais: `%{}` e 0. `"budget: false aceita planta cara mas não planta quebrada"`.
  - `mutation_test.exs`:
    - `"10 mil gerações encadeadas continuam válidas"` — a partir de 20 `Random.blueprint` (semente fixa), 500 gerações de `child` cada: toda planta passa `validate(…, budget: false)`, tem exatamente uma boca e serializa em ≤ `max_bytes`.
    - `"frequência de mutação de peça"` — 20.000 filhos de uma planta: fração `mutated` em `part_p ± 0.01`; trocas de boca ≈ `part_p × mouth_share` (± 0,005).
    - `"deriva não muda peças"` — com `part_p: 0`, `part_delta(pai, filho) == %{}` sempre, e com `drift_p: 1` as cores ou a espinha mudam em > 90% dos filhos.
    - `"determinística"` — mesmo estado do `:rand`, mesmo filho.
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar** `Mutation.child/3` pelas regras da seção Mutação e as funções de `Blueprint`. `Catalog.load!` lê `mutation` (chaves atômicas como o resto do topo).
- [ ] **Step 4:** `pnpm api:test` → `0 failures`; `pnpm typecheck` e `pnpm test` → exit 0.
- [ ] **Step 5: Commit** — `feat: mutação da planta (peças e deriva de corpo e cor)`

### Task 2: Genoma por organismo no `Sim`

**Files:**
- Modify: `apps/api/lib/abyss/world/organism.ex`, `sim.ex`, `eco.ex`, `server.ex`, `apps/api/config/config.exs` e `runtime.exs` (`ABYSS_MUTATION_BOOST`, só medição e paradas, como `ABYSS_FOOD_BOOST`)
- Test: `apps/api/test/abyss/world/sim_test.exs`, `sim_perf_test.exs`

**Interfaces:**
- Consumes: `Mutation.child/3`, `Traits.species/3` (Task 1 e S1).
- Produces:
  - `Organism` ganha `genome: pos_integer | nil` e `mutated: boolean` (padrão `false`).
  - `Sim` ganha `catalog: Catalog.t | nil`, `genomes: %{pos_integer => %{bp: map, traits: Species.t}}`, `genome_index: %{map => pos_integer}`, `next_genome: pos_integer`. `Sim.new` aceita `catalog` e `mutation_boost` (multiplica `part_p`, padrão 1).
  - `Sim.genome(sim, gid) :: map | nil` (a planta).
  - Fundadoras de espécie com `blueprint` recebem o genoma da planta da espécie. `newborn` de pai com genoma chama `Mutation.child` (com o `rng` do passo) e acha-ou-cria o genoma; `traits` do genoma = `Traits.species(bp, cat, %{id: sp.id, code: sp.code, name: sp.name})`.
  - Todas as 12 leituras `spec(bounds, o.species)` de características de um organismo passam por `traits_of(sim_or_bounds, o) :: Species.t`, que devolve as do genoma (ou da espécie, sem genoma) **com `id == o.species`**.
  - `life_events.genomes :: [{pos_integer, map}]` — genomas criados no passo, em ordem de id.
  - Coleta: genomas sem nenhum organismo vivo saem de `genomes`/`genome_index` a cada `branch_scan_s` (junto da varredura da Task 3; aqui, num `collect_genomes/1` chamado no mesmo ponto do passo).
  - `Server` e `Eco` passam `catalog: Catalog.get()` e `mutation_boost` (`ABYSS_MUTATION_BOOST`, padrão 1; `mix abyss.eco --mutation-boost K`).

- [ ] **Step 1: Testes que falham** (`sim_test.exs`, mundo com `catalog`):
  - `"filho herda o genoma do pai sem mutação"` — com `part_p: 0, drift_p: 0`: filho tem o mesmo `genome` e `mutated: false`.
  - `"filho mutado tem genoma e características próprias"` — catálogo com `part_p: 1`, `mouth_share: 0`, `ops` só `add` de flagelo (catálogo de teste): o filho tem genoma novo, `life_events.genomes` traz a planta, e `traits_of` do filho tem `max_speed` maior que o do pai.
  - `"características vêm do genoma"` — dois organismos da mesma espécie com genomas de placa 0 e 2: só o de 2 escapa em `escapes?` com `escape` do genoma.
  - `"espécies de teste não têm genoma"` — mundo só com as 5 de teste por 600 passos: todo `genome == nil`, `genomes == %{}`.
  - `"genoma sem vivos é coletado"` — após o único portador morrer e passar `branch_scan_s`, `Sim.genome(sim, gid) == nil`.
  - `"sem catálogo, nada muda"` — `catalog: nil` com espécie criada: filhos sem mutação, mesmo comportamento do S1 (o `sim_test` do S1 inteiro passa).
  - `sim_perf_test.exs`: `"250 organismos com 250 genomas diferentes"` dentro do orçamento (`step_us` p99 ≤ 20 ms).
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.** O `rng` de `complete_divisions` passa a ser o do passo (encadeado), mantendo o determinismo.
- [ ] **Step 4:** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: genoma por organismo e mutação no nascimento`

### Task 3: Ramos no `Sim`

**Files:**
- Modify: `apps/api/lib/abyss/world/species.ex` (tipo e as 5 de teste: `parent: nil`, `root: <id>`, `region: nil`, `born_ms: nil`), `sim.ex`, `apps/api/lib/abyss/genesis.ex` (`species_from_record` preenche `parent: nil`, `root: "sp<N>"`, `born_ms` = `published_at`), `apps/api/config/config.exs` (`:ecology` com as 4 chaves `branch_*`)
- Create: `apps/api/lib/abyss/world/branching.ex` (a varredura, pura, chamada pelo `Sim`)
- Test: `apps/api/test/abyss/world/branching_test.exs`, `sim_test.exs`

**Interfaces:**
- Consumes: `genomes`, `traits_of`, `Organism.mutated` (Task 2); `Blueprint.part_delta/2`, `part_distance/1` (Task 1).
- Produces:
  - `Species.t` ganha `parent: String.t | nil`, `root: atom | String.t`, `region: String.t | nil`, `born_ms: integer | nil`.
  - `Branching.scan(sim) :: {sim, [Species.t], [{org_id :: String.t, species_id :: String.t}]}` — chamado no `step` a cada `branch_scan_s` de mundo (pelo `now_ms`), depois da remoção dos mortos e antes de `detect_extinct`.
  - `life_events.branches :: [Species.t]` (também somados a `life_events.species`, para o fio mandar em `sp`) e `life_events.rebranch :: [{org_id, species_id}]`.
  - `eco_stats` ganha `branches_total`.

Algoritmo (por espécie viva com `blueprint`, na ordem de `species_list`; **no máximo um ramo novo por espécie por varredura**):

```
R = sp.blueprint
membros = vivos com species == sp.id e genome != nil
grupos = agrupar membros por part_delta(R, planta do genoma), só distância >= branch_diff
qualifica: tamanho >= branch_min e (membros com mutated == false) >= branch_inherited
escolhido = maior grupo; empate: menor delta pela ordem de termos do Erlang
ramo:
  k      = 1 + nº de espécies registradas cujo parent == sp.id
  id     = "#{sp.id}.#{k}"; code = "#{sp.code}.#{k}"
  region = região (Map.region_at) com mais membros; empate pela ordem de map.regions
  name   = "#{nome da raiz} · #{Jardim|Floresta|Planície}", com " 2", " 3"… se já existe
           espécie de mesma raiz com esse nome (viva ou extinta)
  planta = a do genoma mais frequente no grupo (empate: menor gid)
  Species = Traits.species(planta, cat, %{id, code, name}) + parent: sp.id, root: sp.root,
            region, born_ms: now_ms
registrar com add_species(founders: 0) contando como "já teve indivíduos" (para a extinção);
os membros do grupo passam a species = id do ramo (ids de organismo não mudam).
```

  - **Poda:** `prune_extinct` nunca remove uma espécie extinta que seja ancestral (prefixo de id seguido de `.`) de uma espécie registrada viva.

- [ ] **Step 1: Testes que falham** (`branching_test.exs`, mundos montados à mão com genomas):
  - `"ramo nasce exatamente no limiar"` — 4 vivos com o mesmo delta de distância 2 (3 sem `mutated`): nada; o 5º: ramo `"sp1.1"`, código `"S01.1"`, os 5 passam para ele, `life_events.rebranch` lista os 5.
  - `"distância 1 não forma ramo"` — 8 vivos com uma troca só.
  - `"jeitos diferentes não se juntam"` — 3 com `+2 ocelo` e 3 com `+2 placa`: nada.
  - `"tem que ter passado de pais para filhos"` — 5 iguais, só 2 sem `mutated`: nada; 3 sem `mutated`: ramo.
  - `"nome pela região e repetidos numerados"` — maioria na Floresta: `"<raiz> · Floresta"`; segundo ramo da mesma raiz na Floresta: `"<raiz> · Floresta 2"`.
  - `"ramo de ramo"` — membros de `sp1.1` divergindo da planta de referência de `sp1.1`: nasce `"sp1.1.1"` com `parent: "sp1.1"`, `root: "sp1"`.
  - `"um ramo por espécie por varredura"` — dois grupos qualificados: só o maior nasce; o outro na varredura seguinte.
  - `sim_test.exs`: `"ramos-irmãos se caçam, o mesmo ramo não"` — predador de `sp1.1` encosta num menor de `sp1.2` (comido) e num menor de `sp1.1` (não).
  - `sim_test.exs`: `"passar para o ramo encerra caça a irmão do mesmo ramo"` e `"divisão em curso nasce no ramo novo"` (filho com `species == "sp1.1"` e id `"S01.1-0001"`).
  - `sim_test.exs`: `"mãe extinta, ramo vivo"` — todos os da mãe passam para o ramo: `extinct["sp1"]` tem o ms, o ramo continua.
  - `sim_test.exs`: `"poda nunca tira ancestral de espécie viva"` — 120 extintas criadas, `sp1` extinta entre as mais antigas e `sp1.1` viva: `sp1` continua em `Sim.species/1`.
  - `sim_test.exs`: `"varredura determinística"` — mesma semente, mesmos ramos nos mesmos ticks.
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar** `Branching.scan/1` e as mudanças no `Sim`. Nomes das regiões num mapa fixo no `Branching` (`"jardim" => "Jardim"`, `"floresta" => "Floresta"`, `"planicie" => "Planície"`; região desconhecida usa o id).
- [ ] **Step 4:** `pnpm api:test` → `0 failures`; `sim_perf_test` dentro do orçamento com a varredura.
- [ ] **Step 5: Commit** — `feat: ramos (subespécies) nascem por diferença de peças herdada`

### Task 4: Fio e `Server`

**Files:**
- Modify: `apps/api/lib/abyss/world/wire.ex`, `server.ex`
- Test: `apps/api/test/abyss/world/wire_test.exs`, `server_test.exs`

**Interfaces:**
- Consumes: `life_events.genomes`, `.branches`, `.rebranch`, `Sim.genome/2` (Tasks 2–3).
- Produces (fio):
  - `species_info` ganha `parent` (string ou null), `root` (string), `region` (string ou null), `born_ms` (inteiro ou null).
  - `organism` ganha `g` (genoma ou null).
  - Snapshot ganha `genomes: [[gid, blueprint]]` de todos os genomas com vivos. As extintas do snapshot seguem a regra do S1 (vivas + 100 extintas mais recentes) **mais os ancestrais extintos de espécies vivas**.
  - Tick ganha `g: [[gid, blueprint]]` (genomas novos do passo) e `rb: [[org_id, species_id]]`. Ordem de aplicação no cliente: `sp`, `g`, `b`, `rb`, `d`, `x`.
  - `Server.start_link` aceita `on_branch: ([Species.t] -> any)`, chamado com `life_events.branches` a cada tick não vazio (como `on_extinct`).

- [ ] **Step 1: Testes que falham:**
  - `wire_test.exs`: `"genoma vai uma vez"` — num tick com um filho mutado, `g` traz `[gid, planta]` e `b` traz `g: gid`; no tick seguinte, `g == []`. `"snapshot leva os genomas vivos"`. `"ramo no fio"` — `sp` com `parent`, `root`, `region`, `born_ms`; `rb` com os membros. `"ancestral extinto vai no snapshot"`. `"fio sem e-mail"` do S1 continua passando com ramos.
  - `server_test.exs`: `"on_branch recebe o ramo"`.
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: genomas e ramos no fio`

### Task 5: Banco, reinício e reset

**Files:**
- Create: `apps/api/priv/repo/migrations/20261113000001_create_branches.exs`, `apps/api/lib/abyss/genesis/branch_record.ex`
- Modify: `apps/api/lib/abyss/genesis.ex` (`boot_species`, `reset!`), `recorder.ex` (nascimento e extinção de ramos), `apps/api/lib/abyss/application.ex` (liga `on_branch` ao `Recorder`)
- Test: `apps/api/test/abyss/genesis/boot_test.exs`, `schema_test.exs`

**Interfaces:**
- Consumes: `Species.t` de ramo (Task 3), `on_branch` (Task 4).
- Produces:
  - Tabela `branches`: `id` text **PK** (id do `Sim`, ex. `"sp3.1"`), `root_species_id` → `species` (`on_delete: :delete_all`), `parent_id` text, `name`, `code` text **unique**, `blueprint` jsonb, `region` text null, `born_at`, `extinct_at` null; índices em `root_species_id` e `extinct_at`.
  - `Recorder.record_branches([Species.t]) :: :ok` (cast; insere com `on_conflict: :nothing`); `Recorder.record/1` passa a gravar também a extinção de ids de ramo (`"sp<N>.<…>"` → `branches.extinct_at`).
  - `boot_species/0` devolve o mesmo formato `%{live: [...], extinct: [...]}`, agora com ramos: vivos = raízes e ramos com `extinct_at` nulo; extintos = os 100 mais recentes (raízes e ramos juntos) **mais todo ancestral extinto de um vivo**. Ordem: pais antes de filhos (raízes por id, depois ramos por `born_at`, `id`). O `Server` já registra vivos com 3 fundadoras da planta de referência e extintos com `extinct_ms`.
  - `reset!/0` trunca também `branches`.

- [ ] **Step 1: Testes que falham** (`boot_test.exs`):
  - `"ramo vivo volta com 3 da própria planta"` — raiz viva e ramo vivo no banco: o boot registra os dois, com 3 fundadoras cada; as do ramo têm genoma igual à planta do ramo.
  - `"mãe extinta não volta, ramo vivo sim"`.
  - `"boot traz ancestrais extintos de ramos vivos"` — `sp1` extinta há muito (fora das 100 mais recentes) e `sp1.1.1` viva: `sp1` e `sp1.1` vêm em `extinct`.
  - `"ordem: pai antes do filho"`.
  - `"extinção de ramo é gravada"` e `"nascimento de ramo é gravado uma vez"` (dois casts iguais, uma linha).
  - `"reset apaga ramos"`.
  - `schema_test.exs`: `"código de ramo único"`.
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: ramos no banco e no reinício`

### Task 6: Cliente — fio, store, genoma no desenho e árvore em dados

**Files:**
- Modify: `apps/web/src/services/wire.ts`, `worldStore.ts`, `apps/web/src/organisms/Criada.tsx`
- Create: `apps/web/src/lib/lineage.ts`
- Test: `apps/web/src/services/worldStore.life.test.ts`, `apps/web/src/lib/lineage.test.ts`

**Interfaces:**
- Consumes: o fio da Task 4.
- Produces:
  - Tipos: `SpeciesInfo` + `parent: string | null`, `root: string`, `region: string | null`, `born_ms: number | null`; `OrganismInfo` + `g: number | null`; `WorldSnapshot.genomes: [number, Blueprint][]`; `TickMessage.g: [number, Blueprint][]`, `TickMessage.rb: [string, string][]`.
  - `store.genome(gid: number): Blueprint | undefined`. O snapshot substitui o mapa de genomas; `g` acrescenta. `rb` muda `species` do organismo no roster (notifica).
  - `Criada`: planta = `store.genome(org.g)` ou, sem ela, a da espécie (Review Focus 2).
  - `lineage.ts`:
    - `interface LineageNode { species: SpeciesInfo; living: number; extinctMs: number | null; children: LineageNode[] }`
    - `buildLineage(species: readonly SpeciesInfo[], livingBySpecies: ReadonlyMap<string, number>, extinct: ReadonlyMap<string, number>, rootId: string): LineageNode | null` — filhos pela ordem de `born_ms` e depois `id`.
    - `rootOf(species: readonly SpeciesInfo[], speciesId: string): string | null`.
    - `firstLiving(roster, speciesId): string | null` — o organismo vivo de menor id do ramo.

- [ ] **Step 1: Testes que falham:**
  - `worldStore.life.test.ts`: `"g antes de b: o nascido acha o genoma"`, `"genoma desconhecido desenha a planta da espécie"` (teste da função que a `Criada` usa para escolher a planta), `"rb muda a espécie no roster"`, `"rb desconhecido é ignorado"`, `"g repetido não duplica"`, `"snapshot troca os genomas"`.
  - `lineage.test.ts`: `"árvore de três níveis na ordem de nascimento"`, `"mãe extinta com ramo vivo"`, `"raiz de um ramo profundo"`, `"espécie de teste é raiz de si mesma"`.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm test` e `pnpm typecheck` → exit 0.
- [ ] **Step 5: Commit** — `feat: cliente com genomas, ramos e árvore em dados`

### Task 7: Botão da árvore, fluxograma e índice com ramos

**Files:**
- Create: `apps/web/src/ui/LineageButton.tsx`, `apps/web/src/ui/LineageTree.tsx`
- Modify: `apps/web/src/ui/SpeciesIndex.tsx`, `apps/web/src/App.tsx`
- Test: `apps/web/src/ui/LineageTree.test.tsx`, `SpeciesIndex.test.tsx`

**Interfaces:**
- Consumes: `buildLineage`, `rootOf`, `firstLiving` (Task 6); `selection.select(id)` e `useSelection()` existentes.
- Produces: `<LineageButton />` montado no `App` junto do `CreateButton`.

Comportamento e textos (arte seguindo `docs/ART_DIRECTION.md` e o estilo dos painéis atuais: mono 12 px, `PALETTE.fg`, fundo `rgba(2,10,16,0.72)`):
- Botão fixo acima do "CRIAR ESPÉCIE" (`right: 16`, `bottom: 52`), só com um ícone de árvore em SVG inline (traço fino, sem texto), `aria-label="Árvore da espécie"`, `aria-expanded`.
- Painel: `role="dialog"`, `aria-label="Árvore da espécie"`, à direita, `max-height: 60vh`, rolagem vertical e horizontal (`overflow: auto`). Cabeçalho: `"<nome da raiz> (criada em <dd/mm>)"` (`born_ms`; sem data nas de teste: só o nome) e botão `"fechar"`.
- Árvore da raiz da espécie do organismo selecionado. Sem seleção: título `"Escolha uma espécie"` e a lista das raízes com algum vivo na árvore; escolher uma mostra a árvore dela.
- Fluxograma: um nó por espécie, filhos indentados com ligações em traço fino (`├──`/`└──` desenhados em SVG ou bordas CSS). Texto do nó: nome; à direita `"<n> vivos"` (`"1 vivo"`) ou `"extinta · <dd/mm>"` (`formatExtinctDate`).
- Clicar num nó com vivos chama `selection.select(firstLiving(...))` (a câmera vai como no índice). Nó extinto não é clicável.
- Índice: cada raiz seguida dos seus ramos em profundidade, indentados 10 px por nível; um ramo extinto aparece se estiver nos dados.

- [ ] **Step 1: Testes que falham** (`LineageTree.test.tsx`, store de teste com raiz, dois ramos e um neto):
  - `"abre e fecha pelo botão"`, `"mostra a árvore da espécie selecionada"`, `"sem seleção pede para escolher"`, `"clicar num ramo vivo seleciona um vivo dele"`, `"ramo extinto mostra a data e não é clicável"`, `"singular: 1 vivo"`.
  - `SpeciesIndex.test.tsx`: `"ramos aparecem embaixo da mãe"`.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck`, `pnpm build` → exit 0.
- [ ] **Step 5: Commit** — `feat: botão da árvore, fluxograma da espécie e índice com ramos`

### Task 8: Equilíbrio e ritmo (calibração)

**Files:**
- Modify: `apps/api/lib/abyss/eco.ex`, `apps/api/lib/mix/tasks/abyss.eco.ex` (`--test-species`/`--no-test-species`, `--mutation-boost`; CSV com `branches_total`, `trees_alive`, `pop_<raiz>` somando a árvore), e os valores em `shared/genesis/catalog-s1.json` (`mutation` e peças), `apps/api/config/config.exs` (`:ecology`, `:food`) conforme a calibração
- Create: `docs/captures/s2/calibracao/README.md` (tabelas antes e depois, comandos e sementes)
- Test: `apps/api/test/abyss/eco_run_test.exs`

**Metas** (mundo de referência: `mix abyss.eco --minutes 90 --genesis 10 --no-test-species`, sementes 1–5):
1. Primeiro ramo: mediana entre 30 e 60 min de mundo; nenhuma semente sem ramo até 90 min.
2. No minuto 60: mediana ≥ 6 de 10 árvores com algum vivo.
3. Algum predador criado (boca `mandibula` na árvore) vivo no minuto 60 em ≥ 3 de 5 sementes.
4. Nenhuma árvore passa de 60% da população no minuto 90 em mais de 1 semente.
5. Com `--genesis 50 --no-test-species --minutes 90` (sementes 1–3): algum ramo em cada.

- [ ] **Step 1:** `eco_run_test.exs`: `"--genesis 3 --no-test-species com ramos no CSV, repetível"` (mesma semente, mesmo CSV; colunas novas presentes). `pnpm api:test` → FAIL; implementar as opções e colunas; → `0 failures`.
- [ ] **Step 2:** rodar as corridas da meta com os valores atuais e registrar a tabela "antes" no README.
- [ ] **Step 3:** ajustar (ordem sugerida: ritmo de vida e metabolismo das criadas, comida, custo/efeito da mandíbula, `part_p`) até cumprir as metas; cada rodada com os valores exatos no README e no ledger. Se alguma meta não fechar depois de 3 rodadas, parar e levar ao autor na Parada 1 com os números.
- [ ] **Step 4:** `pnpm api:test` → `0 failures` (fixtures de características do S1 regeradas se o catálogo mudou, com nota no README).
- [ ] **Step 5: Commit** — `perf: equilíbrio e ritmo da evolução calibrados`

### Task 9: Parada 1 (ramos de olhar e árvore)

**Files:** `docs/captures/s2/parada-1/` (capturas e README)

- [ ] **Step 1:** subir `pnpm api:up` com `ABYSS_TEST_SPECIES=false`, `ABYSS_MUTATION_BOOST=8` e 10 espécies semeadas (`mix abyss.seed_species` do S1); esperar ramos; capturar: mãe e ramo lado a lado (nas duas GPUs, `?quality=low` e `high`), o fluxograma aberto com um neto e um ramo extinto, o índice com ramos.
- [ ] **Step 2:** apresentar ao autor (com a tabela da Task 8) e perguntar: os ramos se distinguem da mãe de olhar? A árvore está clara? O ritmo parece certo? Registrar as respostas e os ajustes pedidos no ledger; ajustes viram commits próprios antes da Task 10.

### Task 10: e2e, desempenho e carga

**Files:**
- Modify: `scripts/e2e/run.mjs` (ou um `scripts/e2e/evolution.mjs` chamado por `pnpm e2e`), `apps/web/src/ui/PerfProbe.tsx` se precisar
- Create: `docs/captures/s2/perf/README.md`

- [ ] **Step 1:** e2e `evolução`: mundo com `ABYSS_MUTATION_BOOST` alto e semeadura; espera `/api/stats` `branches_total ≥ 1` (timeout 10 min); abre o botão da árvore, vê o ramo, clica, confere a seleção no painel. `pnpm e2e` → exit 0.
- [ ] **Step 2:** desempenho com 250 organismos de genomas distintos (50 criadas, `ABYSS_MUTATION_BOOST` alto por 20 min antes de medir): Arc `low` e RTX `high`, parado e `?flypath`; contagem de programas de shader igual antes e depois de 100 genomas novos; `step_us_max` e `sim_perf_test`; tamanho do snapshot (bytes) e bytes/s do tick. Registrar tudo no README.
- [ ] **Step 3:** `pnpm load` (carga de observadores do E2) com ramos nascendo: PASS.
- [ ] **Step 4: Commit** — `test: e2e e desempenho da evolução`

### Task 11: Parada 2 e pacote de aceite

**Files:** Create `docs/GATE_S2_ACCEPTANCE.md` (mesmo formato do `GATE_S1_ACCEPTANCE.md`: tabela dos 8 critérios do design §9 com evidência, desvios, pendências)

- [ ] **Step 1:** escrever o pacote com as evidências das Tasks 1–10.
- [ ] **Step 2:** Parada 2: o autor revê o pacote e o mundo; registrar a aprovação explícita (único critério que fecha o gate).
- [ ] **Step 3: Commit** — `docs: aceite do gate S2`
