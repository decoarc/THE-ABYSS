# Gate E2 (Ecologia) — Plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans, para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhar o progresso.

**Objetivo:** fechar o ciclo de alimentação no mundo do E1. Comer dá energia e viver gasta. O adulto cheio se divide e gera um jovem menor, que depois vira adulto. Caçadores comem presas menores, e as presas fogem para a Floresta. A criatura morre de fome, predação ou velhice, e a extinção é permanente. Tudo isso sai de características genéricas da espécie e fica legível na tela.

**Arquitetura:**
- **Servidor:** o `Sim` continua puro e determinístico. A tabela de espécies deixa de ser global: entra em `Sim.new/1` (padrão `Species.all()`) e o resto do `Sim` consulta só essa tabela. O ciclo de vida (energia, fases, divisão, morte, predação, fuga, cardume) roda dentro de `step/3`. Os módulos novos são `Abyss.World.Life`, com as regras puras de energia, fase e divisão, e `Abyss.World.Hunt`, com predação, fuga e cardume. O `Sim` só orquestra.
- **Fio:** o tick passa a levar nascimentos (`b`), mortes (`d`) e extinções (`x`). Cada linha de `o` ganha energia e flags. A ordem de `o` é a lista do servidor depois de aplicar `d` e `b`, e o cliente reproduz essa mesma ordem.
- **Cliente:** o `worldStore` aplica `d` e `b`, mantém um "fantasma" de quem morreu de fome ou de velhice enquanto o corpo se desfaz, e expõe a vitalidade (energia, fase, divisão). Um hook compartilhado (`useVitals`) alimenta brilho, tamanho e esticar/desfazer nos cinco componentes. O painel e o índice ganham os campos novos.

**Stack:** a mesma do E1 (Elixir + Phoenix em Docker; React 19 + R3F 9 + three 0.187 + Vite 8 + Vitest 5; Playwright; Node 24).

**Spec:** `docs/superpowers/specs/2026-11-05-gate-e2-ecologia-design.md` (aprovado em 2026-11-05). Também: design e plano do E1 (`docs/superpowers/specs/2026-11-01-gate-e1-mundo-grande-design.md`, `docs/superpowers/plans/2026-11-01-gate-e1-mundo-grande.md`) e o SPEC §7.

## Global Constraints

- Tudo o que o E1 fixou continua valendo: sem banco, mundo só em memória, nenhum processo por entidade, `mix` só no contêiner (`pnpm api:test`), 10 Hz, o cliente nunca envia estado, e todo observador vê o mesmo mundo.
- **Nenhuma regra do `Sim`, do `Life` ou do `Hunt` testa o id ou o nome de uma espécie.** Tudo sai das características (§ Espécies). O teste `"espécie inventada"` (Task 5) garante isso.
- **Sem mutação:** o jovem herda exatamente as características do pai.
- **Equilíbrio não é aceite.** Uma extinção na cadeia de teste não é defeito.
- **Teto de proteção de 250 organismos** (`pop_cap`, configurável, no máximo 400). No teto, a divisão espera e o adulto continua cheio. Ninguém é removido nem reposto. População inicial na faixa 5..`pop_cap`, e `ABYSS_POPULATION` aceita 5..250.
- **Visual:** caça silenciosa (sem rastro nem brilho de caça); morte por fome ou velhice que se desfaz devagar em partículas, sem clarão; divisão que estica e se parte, com o filho menor; brilho proporcional à energia, apagado e tremeluzindo com fome.
- **Morte por predação não deixa corpo.** A presa some ao ser comida (direção 1-A). Só fome e velhice geram o desfazer e as partículas (direção 2-A).
- **A contagem de luzes e de materiais por espécie não muda com nascimentos e mortes.** A reserva fixa de 4 luzes continua, e nenhum efeito novo cria luz.
- **Orçamento:** `step_us_max` ≤ 20 ms com 250 organismos. No cliente vale o mesmo orçamento do E1 (Arc `low` p95 ≤ 33 ms; RTX `high` p50 ≤ 16,7 ms), medido parado e voando (`?flypath`).
- **Produção:** com `test_species: false`, nada quebra. O painel e o índice ficam vazios, e as medições ficam zeradas.
- **Textos em pt-BR.** Commits em pt-BR (`feat:`, `art:`, `perf:`, `test:`, `docs:`) na branch `gate-e`.
- **Verificação sem `rtk`:** `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm api:test` e `pnpm e2e`. O código de saída é a fonte da verdade.

## Review Focus

1. **Seguir ou selecionar alguém que morre:** a câmera fica onde está, o Seguir solta, o painel fecha depois do desfazer e nada lança erro. Se a morte for por predação, o painel fecha no mesmo tick. Testes: Task 7 (`seleção sobrevive ao fantasma`, `predação solta na hora`).
2. **Tick perdido com nascimentos e mortes:** se `d` ou `b` se perdem, o roster diverge. Uma lacuna força resync (como no E1). Se, depois de aplicar `d` e `b`, `o.length` diferir do roster, também há resync, e nunca uma linha aplicada ao organismo errado. Testes: Task 7 (`lacuna com nascimento força resync`, `contagem divergente força resync`).
3. **Último indivíduo morre no mesmo tick em que nasce o filho dele:** a espécie não pode ser marcada extinta. A extinção só é decidida no fim do passo, depois das divisões. Teste: Task 5 (`nascimento no último tick salva a espécie`).
4. **Teto atingido com muitos adultos cheios:** nenhum nascimento passa de 250, e o adulto que espera não perde energia de divisão nem fica preso esticado. Teste: Task 3 (`teto segura a divisão`).
5. **Aba em segundo plano voltando com dezenas de nascimentos e mortes acumulados:** os componentes montados e desmontados de uma vez não podem quebrar nem recompilar shaders. Teste: Task 7 (`muitos nascimentos num tick`) e a medição voando da Task 11, com o mundo no teto.

---

## Espécies (características genéricas)

O mapa de `Abyss.World.Species` passa a ter este formato. `diet` deixa de aceitar `:none`.

| Campo | Tipo | Uso |
|---|---|---|
| `diet` | `:flora \| :particles \| {:prey, [species_id]}` | o que come |
| `perception` | float | alcance para comida, presa e ameaça (obrigatório para todas) |
| `sated_s` | número | pausa depois de comer (ritmo do E1) |
| `school` | boolean | anda em grupo |
| `shelter` | boolean | foge para região com `cover > 0` |
| `burst` | float | multiplicador de `max_speed` ao caçar ou fugir |
| `energy_max` | float | energia cheia |
| `metabolism` | float | gasto por segundo parado |
| `mature_s` | número | tempo de jovem até adulto |
| `adult_life_s` | número | vida máxima depois de adulto |

Valores iniciais das espécies de teste. Os campos do E1 não mudam. **Todos estes valores podem ser ajustados na Parada 1**, e cada mudança é registrada no ledger.

| Espécie | diet | perception | school | shelter | burst | metabolism | mature_s | adult_life_s |
|---|---|---|---|---|---|---|---|---|
| Membrana | `:particles` | 6 | false | false | 1.0 | 0.30 | 150 | 900 |
| Filamento | `{:prey, [:celula]}` | 7 | false | true | 1.6 | 0.60 | 120 | 700 |
| Casco | `:flora` | 4 | false | false | 1.0 | 0.25 | 180 | 1200 |
| Célula | `:flora` | 6 | true | true | 1.8 | 0.50 | 90 | 600 |
| Poliedro | `{:prey, [:filamento, :celula]}` | 5 | false | false | 2.5 | 0.40 | 200 | 1000 |

`energy_max` = 100 para todas.

## Parâmetros novos (`config :abyss, :ecology`)

| Chave | Valor | Significado |
|---|---|---|
| `pop_cap` | 250 | teto de proteção |
| `swim_cost` | 1.5 | gasto = `metabolism × (1 + swim_cost × (|v|/max_speed)²)` por s |
| `flora_energy` | 80 | energia por nível de flora comido (mordida de 0,25 → 20) |
| `particle_energy` | 15 | energia por partícula |
| `prey_base` / `prey_yield` | 25 / 0.5 | ganho do caçador = `prey_base + prey_yield × energia da presa` |
| `hunt_below` | 0.7 | o caçador só caça com energia < 0,7 × `energy_max` |
| `give_up_s` | 8 | o caçador desiste depois de 8 s de perseguição |
| `divide_s` | 2.0 | duração da fase "dividindo" (o esticar) |
| `split_parent` / `split_child` | 0.5 / 0.35 | fração de `energy_max` com que pai e filho saem da divisão |
| `juvenile_scale` | 0.45 | raio do jovem = raio adulto × 0,45 durante toda a fase jovem |
| `school_range` / `school_weight` | 4.0 / 0.3 | cardume: alcance e peso (× `max_speed`) |
| `corpse_particles` | `{3, 4.0}` | partículas do corpo = `round(3 + 4 × raio efetivo)` |
| `founder_energy` | `{0.5, 0.8}` | energia inicial dos fundadores (fração de `energy_max`, uniforme) |
| `founder_age` | 0.5 | os fundadores começam adultos, com idade adulta uniforme em 0..0,5 × `adult_life_s` |

Mapa: `shared/world/map-e1.json` ganha `"cover": 0.5` na região `floresta`. `Abyss.World.Map` lê esse campo, com padrão 0. Dentro de uma região com `cover` c, a presa é percebida a `perception × (1 − c)` e o caçador persegue a `burst × (1 − c/2)`.

## Fio (formato novo)

- **Snapshot:**
  - `species[]` ganha `diet` (`{"kind":"flora"|"particles"|"prey","prey":[ids]}`) e `extinct_ms` (`null` ou número).
  - `organisms[]` ganha `e` (energia 0..1, com 2 casas), `stage` (`"juvenile"|"adult"`), `dividing` (bool), `gen` (inteiro, fundador = 1) e `parent` (`null` ou id).
  - Ganha também `juvenile_scale`.
- **Tick:**
  - `o` com linhas `[x, y, z, vx, vy, vz, e, flags]`, em que `flags` tem bit 1 = jovem e bit 2 = dividindo;
  - `b`: lista de organismos completos no formato do snapshot;
  - `d`: lista `[id, cause]`, com `cause` ∈ `"starvation"|"predation"|"old_age"`;
  - `x`: lista `[species_id, extinct_ms]`.
- **Ordem:** o servidor remove os mortos, acrescenta os nascidos no fim, e `o` segue essa lista. O cliente aplica `d`, depois `b`, depois `o`.

---

### Task 1: Espécies genéricas e tabela injetável

**Files:**
- Modify: `apps/api/lib/abyss/world/species.ex`, `sim.ex`, `wire.ex`, `map.ex`; `shared/world/map-e1.json`; `apps/api/config/config.exs` (bloco `:ecology`)
- Test: `apps/api/test/abyss/world/sim_test.exs`, `map_test.exs`, `species_test.exs` (novo)

**Interfaces:**
- Produces:
  - `Species.t` no formato da seção Espécies;
  - `Sim.new/1` aceita `species: [Species.t]` (padrão `Species.all()`) e `ecology: map` (padrão: bloco `:ecology`);
  - `sim.bounds.species :: %{atom => Species.t}`; helper privado `spec(bounds, id)` no lugar de todo `Species.get!` dentro do `Sim`;
  - `Sim.species(sim) :: [Species.t]` na ordem dada;
  - `WMap` com `region.cover :: float`.

- [ ] **Step 1: Testes que falham.**
  - `species_test.exs`: `"toda espécie tem as características do E2"` (todos os campos da tabela presentes; `perception` numérico; `diet` válido; toda presa listada existe).
  - `map_test.exs`: `"floresta tem cover 0.5, as outras 0"`.
  - `sim_test.exs`: `"usa a tabela injetada"`. Um `Sim.new` com `species: [uma espécie inventada :zz]` gera só organismos `:zz`, com id `"ZZZ-0001"`, e `Sim.step` roda 100 vezes sem erro.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.** Preencher a tabela com os valores iniciais. O Filamento e o Poliedro passam a ter `perception`. No E1, quem tinha `diet: :none` não procurava comida; enquanto a Task 4 não existir, `{:prey, _}` continua sem forrageio, e o comportamento atual fica igual. `bounds.max_r` e `richest` saem da tabela injetada. `Wire` usa `Sim.species/1`.
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`, com os testes do E1 intactos.
- [ ] **Step 5: Commit** — `feat: espécies com características genéricas e tabela injetável`

### Task 2: Energia, fases, fome e velhice

**Files:**
- Create: `apps/api/lib/abyss/world/life.ex`
- Modify: `organism.ex`, `sim.ex`, `particles.ex`
- Test: `apps/api/test/abyss/world/life_test.exs` (novo), `sim_test.exs`, `particles_test.exs`

**Interfaces:**
- Consumes: tabela e `ecology` (Task 1).
- Produces:
  - `Organism` ganha `energy: float`, `stage: :juvenile | :adult`, `stage_ms: integer` (nascimento do jovem ou instante em que virou adulto), `generation: pos_integer`, `parent_id: String.t | nil`, `dividing_left: float` (0 = não está dividindo).
  - `Life.drain(o, sp, eco, dt) :: float`, que devolve a energia nova pela fórmula `swim_cost`.
  - `Life.gain(o, sp, amount) :: Organism.t`, limitado a `energy_max`.
  - `Life.advance_stage(o, sp, now_ms) :: Organism.t`: jovem com `now_ms − stage_ms ≥ mature_s × 1000` vira adulto, com `stage_ms = now_ms`.
  - `Life.death_cause(o, sp, now_ms) :: nil | :starvation | :old_age`.
  - `Life.radius(o, sp, scale, eco) :: float`: raio efetivo, × `juvenile_scale` se jovem. Passa a ser o raio usado em separação, esponjas e comer.
  - `Particles.add_corpse(p, pos, n, now_ms, rng) :: {p, [particle], rng}`: `n` partículas no ponto, com velocidade horizontal para fora (0,1..0,2 u/s), queda `particle_fall` e vida `particle_life_s`. **Ignoram o teto**, mas contam nele (o nascimento natural para enquanto estiver acima).
  - `sim.life_events :: %{deaths: [{id, cause}], births: [Organism.t], extinct: [{species_id, ms}]}` do último passo, vazio por padrão.
  - `sim.eco_totals :: %{births: %{sp => n}, deaths: %{sp => %{cause => n}}, hunts_ok: n, hunts_abandoned: n, cap_holds: n}`.

- [ ] **Step 1: Testes que falham.**
  - `life_test.exs`:
    - `"parado gasta metabolism por segundo"`: `drain` com v = 0 e dt = 1 → `energy − metabolism`;
    - `"nadando no máximo gasta 2,5×"`: v = `max_speed` → `metabolism × 2.5`;
    - `"gain não passa do máximo"`;
    - `"jovem vira adulto em mature_s"`: em `mature_s − 0,1` s continua jovem; em `mature_s` vira adulto e `stage_ms` é atualizado;
    - `"jovem não morre de velhice"`: jovem com idade enorme → `death_cause == nil`;
    - `"adulto morre de velhice"`: `now − stage_ms ≥ adult_life_s × 1000` → `:old_age`;
    - `"energia zero é fome"`: → `:starvation`, com prioridade sobre a velhice;
    - `"raio do jovem"`: `radius` = adulto × 0,45.
  - `sim_test.exs`:
    - `"fundadores são adultos com energia e idade sorteadas"` (faixas `founder_energy` e `founder_age`, `generation == 1`, `parent_id == nil`);
    - `"comer dá energia"`: uma Célula com energia 50 junto de flora nível 1, depois de 5 s, tem mais energia que um controle sem flora;
    - `"morre de fome e vira partículas"`: uma Célula com energia 0,1, sem comida, some da lista em poucos ticks, aparece em `life_events.deaths` com `:starvation`, e `food_events.spawned` ganha `round(3 + 4 × r)` partículas perto da posição dela;
    - `"morre de velhice"`: análogo, com `:old_age`;
    - `"forrageia até encher"`: uma criatura com energia < `energy_max` e `sated_left ≤ 0` procura comida; com energia cheia, não procura.
  - `particles_test.exs`: `"corpo ignora o teto mas conta nele"`: com o estoque no teto, `add_corpse` de 5 → `count == cap + 5`, e o próximo `step` não faz nascer nenhuma natural.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.** Ordem dentro de `step/3`, depois da comida do E1:
  1. o movimento existente;
  2. `drain` pela velocidade nova;
  3. `advance_stage`;
  4. `death_cause`: os mortos saem da lista, e fome e velhice chamam `add_corpse` (os ids das partículas entram em `food_events.spawned`);
  5. contadores.

  Comer chama `Life.gain` (flora: nível comido × `flora_energy`; partícula: `particle_energy`). A condição de forrageio do E1 passa de "`sated_left ≤ 0`" para "`sated_left ≤ 0` e energia < `energy_max`".
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: energia, fases jovem/adulto, morte por fome e velhice`

### Task 3: Divisão e teto de população

**Files:**
- Modify: `life.ex`, `sim.ex`
- Test: `life_test.exs`, `sim_test.exs`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `Life.wants_divide?(o, sp) :: boolean`: adulto, `energy ≥ energy_max` e `dividing_left == 0`.
  - `Sim` com `next_seq :: %{species_id => pos_integer}`. O id do filho é `"#{code}-#{seq com 4 dígitos}"`, continuando depois dos fundadores. O id nunca se repete, nem depois de uma morte.
  - O filho nasce com `stage: :juvenile`, `stage_ms: now`, `generation: pai + 1`, `parent_id: pai.id`, `energy: split_child × energy_max`, na posição do pai mais um deslocamento de `r_pai` na direção de `yaw` + π/2, e com a velocidade do pai.

- [ ] **Step 1: Testes que falham.**
  - `"divide quando enche"`: um adulto com energia cheia entra em `dividing_left = divide_s`; durante esse tempo não procura comida e nada a 30% da velocidade; quando o tempo zera, nasce um filho com os campos acima, e o pai fica com `split_parent × energy_max`. O filho aparece em `life_events.births`, e `eco_totals.births` conta.
  - `"jovem não divide"`: jovem com energia cheia nunca entra em `dividing`.
  - `"filho herda as características"`: mesma espécie, sem campo alterado.
  - `"ids não se repetem"`: 50 divisões e mortes intercaladas → ids únicos e `seq` crescente por espécie.
  - `"teto segura a divisão"`: um mundo com `pop_cap` = 20 e 20 adultos cheios → depois de 10 s, `length(organisms) == 20`, `eco_totals.cap_holds > 0` e todos com `dividing_left == 0`. Quem espera continua com energia cheia e tenta de novo assim que abre espaço.
  - `"população inicial respeita o teto"`: `population` > `pop_cap` → `ArgumentError`; `pop_cap` > 400 → `ArgumentError`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.** A divisão só começa se `length(organisms) + divisões em curso < pop_cap`; se não couber, conta um `cap_hold`. Os nascidos entram no fim da lista no mesmo passo em que `dividing_left` chega a 0. Em `runtime.exs`, `ABYSS_POPULATION` passa a aceitar 5..250.
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: divisão com jovem e teto de proteção de 250`

### Task 4: Predação, fuga, abrigo e cardume

**Files:**
- Create: `apps/api/lib/abyss/world/hunt.ex`
- Modify: `sim.ex`
- Test: `apps/api/test/abyss/world/hunt_test.exs` (novo), `sim_test.exs`

**Interfaces:**
- Consumes: Tasks 1–3; `Grid` (grade de organismos já montada por tick).
- Produces:
  - `Hunt.can_eat?(hunter_sp, hunter_r, prey_sp, prey_r) :: boolean`: `prey_sp.id` está em `{:prey, list}` **e** `prey_r < hunter_r` (estritamente).
  - `Hunt.perceived_range(range, region_cover) :: float`, que devolve `range × (1 − cover)` da região da presa.
  - `Hunt.threat(o, sp, r, grid, bounds) :: {x, y, z} | nil`: posição do caçador mais próximo, dentro de `perception`, que poderia comê-lo.
  - `Hunt.flee_steer(o, sp, threat_pos, bounds) :: vec`: afasta-se da ameaça a `max_speed × burst`; se `shelter`, mistura 50% na direção do centro da região com `cover > 0` mais próxima.
  - `Hunt.school_steer(o, sp, grid, eco) :: vec`: coesão e alinhamento com os da mesma espécie dentro de `school_range`, com peso `school_weight × max_speed`; zero se `school == false`.
  - `Organism.target` aceita `{:prey, id}`, e o `Organism` ganha `chase_left: float`.

- [ ] **Step 1: Testes que falham.**
  - `hunt_test.exs`:
    - `"só come o que é menor"`: Filamento adulto × Célula adulta → `false`; Filamento × Célula jovem → `true`; Poliedro × Filamento adulto → `true`; Célula × Célula → `false` (não está na dieta);
    - `"floresta esconde"`: `perceived_range(7, 0.5) == 3.5`;
    - `"cardume aproxima"`: duas Células a 3 u → `school_steer` aponta uma para a outra; Casco → zero.
  - `sim_test.exs`:
    - `"caçador come presa jovem"`: Filamento com energia 30 e Célula jovem a 3 u, em mar aberto → em ≤ 15 s a Célula some com `:predation`, sem partículas novas de corpo; o Filamento ganha `prey_base + prey_yield × e`; `hunts_ok` conta;
    - `"caçador cheio não caça"`: energia ≥ `hunt_below` → nenhum alvo `{:prey, _}`;
    - `"presa foge"`: uma Célula jovem que percebe um Filamento faminto se afasta dele (a distância aumenta nos primeiros 2 s);
    - `"desiste"`: uma presa mais rápida e nunca alcançada → depois de `give_up_s`, o alvo é limpo e `hunts_abandoned` conta;
    - `"abrigo ajuda"`: com a mesma semente, uma Célula jovem perseguida dentro da Floresta sobrevive em média mais tempo que outra em mar aberto (20 sementes; média dentro > média fora).
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
  - O caçador faminto escolhe a presa válida mais próxima pela grade de organismos e persegue a `max_speed × burst` (× `1 − cover/2` dentro de cover).
  - A captura acontece com `dist ≤ r_h + r_p + @eat_margin`. A presa capturada é marcada no acumulador do passo e removida no fim. Uma presa só pode ser comida uma vez por passo; quem processa primeiro, na ordem da lista, fica com ela.
  - A fuga e o cardume entram no `desired` com os outros steers. A presa em fuga também nada a `max_speed × burst`, o que gasta mais energia pela fórmula `swim_cost`.
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: predação pelo porte, fuga para o abrigo e cardume`

### Task 5: Extinção, medições e experimento repetível

**Files:**
- Create: `apps/api/lib/mix/tasks/abyss.eco.ex`
- Modify: `sim.ex`, `server.ex`, `apps/api/lib/abyss_web/controllers/stats_controller.ex` (via `Server.stats`)
- Test: `sim_test.exs`, `apps/api/test/abyss/world/eco_run_test.exs` (novo), `stats_controller_test.exs`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `sim.extinct :: %{species_id => ms}`. Uma espécie entra no fim do passo em que a contagem chega a 0, se já teve indivíduos. Ela nunca sai, e o evento aparece em `life_events.extinct`.
  - `Sim.eco_stats(sim) :: map` com `population_by_species`, `births_total`, `deaths_total` (`%{starvation, predation, old_age}`), `hunts_ok`, `hunts_abandoned`, `cap_holds` e `extinct` (`%{id => ms}`), mesclado em `/api/stats`.
  - `Abyss.Eco.run(opts) :: [row]`, uma linha por minuto simulado (`%{minute, pop: %{sp => n}, births, deaths}`), com passo fixo de 0,1 s e `now_ms` derivado do passo.
  - `mix abyss.eco --seed N --minutes M [--population P]`, que imprime essas linhas em CSV.

- [ ] **Step 1: Testes que falham.**
  - `"extinção é permanente"`: matar (energia 0) todos os Casco → `extinct.casco` tem o ms do passo; 600 s depois continua lá e não há nenhum Casco.
  - `"nascimento no último tick salva a espécie"`: o último adulto morre de velhice no mesmo passo em que termina a divisão dele → a espécie não fica extinta.
  - `"espécie inventada"`: uma tabela só com `:aa` (`:flora`) e `:bb` (`{:prey, [:aa]}`, maior), com nomes e códigos inventados → em 30 min simulados, com a semente 7, há pelo menos uma predação `bb→aa`, um nascimento de cada e nenhuma referência a espécie de teste.
  - `eco_run_test.exs`: `"mesma semente, mesmo resultado"`: `Abyss.Eco.run(seed: 7, minutes: 10)` duas vezes → listas idênticas; com a semente 8 → diferentes.
  - `eco_run_test.exs`: `"cadeia de teste acontece"`: `run(seed: 7, minutes: 30)` → `deaths_total.predation > 0`, `births_total > 0` e `deaths_total.starvation + old_age > 0`. **Não** se exige sobrevivência de nenhuma espécie.
  - `stats_controller_test.exs`: as chaves novas presentes e numéricas; `extinct` é um mapa.
  - `"mundo vazio sem medições"`: `test_species: false` → `population_by_species == %{}`, totais 0 e `extinct == %{}`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.** A extinção é verificada uma vez por passo, depois de mortes **e** nascimentos. `Abyss.Eco.run` chama `Sim.new` com o mapa de `/shared/world/map-e1.json` e os blocos de config, e depois `Sim.step(sim, 0.1)`.
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`; `docker compose -f infra/compose/compose.yaml run --rm api mix abyss.eco --seed 7 --minutes 5` imprime 5 linhas.
- [ ] **Step 5: Commit** — `feat: extinção permanente, medições e experimento repetível`

### Task 6: Fio do E2

**Files:**
- Modify: `apps/api/lib/abyss/world/wire.ex`
- Test: `wire_test.exs`, `world_channel_test.exs`

**Interfaces:**
- Consumes: `life_events`, `extinct`, campos do `Organism` (Tasks 2–5).
- Produces: o formato da seção Fio.

- [ ] **Step 1: Testes que falham.**
  - `"tick com nascimento e morte"`: num passo com uma morte e um nascimento, `d == [[id, "starvation"]]`, `b` traz o filho completo, e `length(o) == length(sim.organisms)`, na mesma ordem.
  - `"flags"`: jovem → bit 1; dividindo → bit 2; adulto parado → 0.
  - `"energia quantizada"`: `e` com 2 casas, em 0..1.
  - `"snapshot leva dieta e extinção"`: Filamento → `diet == %{kind: "prey", prey: ["celula"]}`; espécie extinta → `extinct_ms` numérico.
  - `world_channel_test.exs`: o join devolve um snapshot com `juvenile_scale`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar.** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: nascimentos, mortes, energia e extinção no fio`

### Task 7: Store do cliente com vida e morte

**Files:**
- Modify: `apps/web/src/services/wire.ts`, `worldStore.ts`, `selectionSync.ts`
- Test: `apps/web/src/services/worldStore.test.ts`, `selectionSync.test.ts`

**Interfaces:**
- Consumes: formato da seção Fio.
- Produces:
  - Tipos `OrganismInfo` com `e`, `stage`, `dividing`, `gen` e `parent`; `SpeciesInfo` com `diet` e `extinct_ms`; `TickRow` com 8 números; `TickMessage` com `b`, `d` e `x`.
  - `WorldStore.vitals(id, out: Vitals) :: boolean`, em que `Vitals = { energy: number; juvenile: boolean; dividing: boolean; maturedAtMs: number | null; dyingSinceMs: number | null }` e `maturedAtMs` é o instante local em que o bit de jovem caiu.
  - `WorldStore.extinct(): ReadonlyMap<string, number>`.
  - `DISSOLVE_MS = 1500`: quem morre por `starvation` ou `old_age` continua no `roster()` como fantasma, com `dyingSinceMs`, parado na última posição, por `DISSOLVE_MS`, e depois sai. Quem morre por `predation` sai do roster no mesmo tick.
  - `roster()` muda de identidade (e notifica) só quando alguém entra ou sai.

- [ ] **Step 1: Testes que falham.**
  - `"nascimento entra no fim"`: um tick com `b` → `roster()` termina com o filho, e `sample(filho)` funciona.
  - `"predação some na hora"`, `"fome vira fantasma e sai depois de DISSOLVE_MS"` (`sample` devolve a última posição, parada).
  - `"lacuna com nascimento força resync"`: tick `n+2` → `'resync'`.
  - `"contagem divergente força resync"`: depois de aplicar `d` e `b`, `o.length ≠ vivos` → `'resync'`, sem escrever em nenhum ring.
  - `"muitos nascimentos num tick"`: 60 em `b` → todos amostráveis, e uma notificação só.
  - `"extinção"`: `x` → `extinct().get('casco')` com o ms; um snapshot posterior mantém o valor pelo `extinct_ms`.
  - `"vitals"`: energia e flags do último tick; `maturedAtMs` preenchido no tick em que o bit 1 cai.
  - `selectionSync.test.ts`: `"seleção sobrevive ao fantasma"` (o painel continua até o fantasma sair, depois `clear`, e o Seguir é solto já na morte); `"predação solta na hora"`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.** Mortos saem de `rings`/`index`, e o índice é reconstruído na ordem nova. O fantasma guarda só `{pos, vel = 0, info, dyingSinceMs}` fora dos rings. Ao receber a morte, `selectionSync` chama `selection.setFollowing(false)` e a câmera fica onde está.
- [ ] **Step 4: Rodar e ver passar.** `pnpm test` → PASS; `pnpm typecheck` → exit 0.
- [ ] **Step 5: Commit** — `feat: cliente acompanha nascimentos, mortes e extinções`

### Task 8: Leitura visual do ciclo

**Files:**
- Create: `apps/web/src/organisms/vitals.ts`, `vitals.test.ts`, `useVitals.ts`
- Modify: `Nucleus.tsx`, `Membrana.tsx`, `Filamento.tsx`, `Casco.tsx`, `Celula.tsx`, `Poliedro.tsx`, `SelectionRing.tsx`
- Test: `vitals.test.ts`

**Interfaces:**
- Consumes: `WorldStore.vitals` e `juvenile_scale` do snapshot (Task 7).
- Produces (funções puras em `vitals.ts`):
  - `energyGlow(energy: number, t: number): number`: `0.35 + 0.65 × energy`; abaixo de 0,25, multiplicado por um tremeluzir `0.6 + 0.4 × sin²(…)` com período de ~2,4 s.
  - `lifeScale(v: Vitals, nowMs: number, juvenileScale: number): number`: jovem → `juvenileScale`; até `GROW_MS = 4000` depois de `maturedAtMs`, sobe suavemente (smoothstep) até 1; adulto → 1.
  - `stretch(v: Vitals, nowMs: number): number`: dividindo → alongamento de 1 a 1,8 ao longo de `divide_s` (o cliente usa 2000 ms); fora disso → 1.
  - `dissolve(v: Vitals, nowMs: number): number`: 1 → 0 em `DISSOLVE_MS` depois de `dyingSinceMs`.
  - `useVitals(id): { glow, scale, stretch, fade }`, refs atualizadas por quadro e lidas antes do `useFrame` do componente (mesma regra do `useOrganismPose`).

- [ ] **Step 1: Testes que falham** (`vitals.test.ts`):
  - `energyGlow(1, t) == 1` e `energyGlow(0.5, t) == 0.675`;
  - abaixo de 0,25 o valor oscila e fica ≤ `0.35 + 0.65 × e`;
  - `lifeScale` do jovem == 0,45; 2 s depois de amadurecer fica entre 0,45 e 1; aos 4 s == 1;
  - `stretch` = 1 fora da divisão e chega a 1,8 no fim;
  - `dissolve` = 1 na morte, 0 em `DISSOLVE_MS`, e monotônico.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.**
  - O `Nucleus` recebe a prop `glowRef` e multiplica a intensidade.
  - Cada componente multiplica a escala do grupo por `scale`, alonga no eixo da velocidade por `stretch` (encolhendo os outros dois eixos em `1/√stretch`) e aplica `fade` à opacidade e ao brilho.
  - O `SelectionRing` usa o raio × `scale`.
  - As partículas do corpo já chegam por `ps`: não há efeito novo de partícula.
  - Nenhum material ou luz novo por instância.
- [ ] **Step 4: Rodar e ver passar.** `pnpm test` → PASS; `pnpm typecheck` → exit 0; `pnpm build` → exit 0.
- [ ] **Step 5: Commit** — `art: brilho da energia, jovem, divisão e desfazer`

### Task 9: Painel e índice

**Files:**
- Modify: `apps/web/src/ui/InspectPanel.tsx`, `SpeciesIndex.tsx`, `apps/web/src/lib/format.ts`
- Test: `InspectPanel.test.tsx`, `SpeciesIndex.test.tsx`, `format.test.ts`

**Interfaces:**
- Consumes: `vitals`, `extinct()`, `SpeciesInfo.diet`, `OrganismInfo.gen/parent` (Task 7).
- Produces: `formatDiet(diet, species): string` e `formatExtinctDate(ms): string` em `format.ts`.

- [ ] **Step 1: Testes que falham.**
  - Painel, nesta ordem: ESPÉCIE, FASE ("jovem"/"adulto"), ENERGIA (percentual inteiro, atualizado a 4 Hz como a posição), GERAÇÃO, COME, NASCEU DE ("—" para fundador, senão o id do pai), SURGIU, POSIÇÃO.
  - `formatDiet`: `flora` → "flora"; `particles` → "partículas"; `prey` → os nomes das presas, separados por " e " (Poliedro → "Filamento e Célula").
  - Índice: uma espécie extinta continua listada, com "extinta · dd/mm hh:mm" no lugar da contagem, sem lista de indivíduos; "NO TERRÁRIO" conta só os vivos e não os fantasmas.
  - `"mundo vazio"`: índice com "NO TERRÁRIO · 0" e sem grupos.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar**, no estilo atual do painel (mesmo `row` e `label`).
- [ ] **Step 4: Rodar e ver passar.** `pnpm test` → PASS; `pnpm typecheck` → exit 0.
- [ ] **Step 5: Commit** — `feat: painel com energia, fase, geração e dieta; extintas no índice`

### Task 10: Parada 1 (o ciclo na tela)

- [ ] **Step 1:** subir o mundo (`pnpm api:up`, `pnpm dev`) com `ABYSS_SEED=7` e gravar capturas em `docs/captures/e2/parada-1/`. Os vídeos ficam fora do git, em `../THE-ABYSS-capturas/e2/`, como no E1. Mostrar:
  - um Filamento comendo uma Célula jovem;
  - uma morte por fome se desfazendo;
  - uma divisão;
  - um jovem virando adulto;
  - bandos com brilhos diferentes;
  - uma vista de cima das três regiões com a distribuição.
- [ ] **Step 2:** rodar `mix abyss.eco --seed 7 --minutes 30` e anexar a tabela ao ledger.
- [ ] **Step 3: Parada com o autor.** Apresentar as capturas e a tabela e perguntar, uma decisão por vez, sobre a leitura de cada momento e a cadeia nas regiões. Ajustar os valores das espécies de teste e do bloco `:ecology` conforme o que for decidido; cada ajuste é registrado no ledger e nos testes afetados.
- [ ] **Step 4:** `pnpm api:test`, `pnpm test`, `pnpm typecheck` → exit 0.
- [ ] **Step 5: Commit** — `art: ajustes da Parada 1 do E2` (e `docs:` com a aprovação do autor).

### Task 11: e2e, desempenho e carga no teto

**Files:**
- Modify: `scripts/e2e/run.mjs`, `scripts/perf/measure.mjs`, `scripts/load/observers.mjs`, `apps/api/test/abyss/world/sim_perf_test.exs`

- [ ] **Step 1: e2e.**
  - `"duas abas concordam"`: com `ABYSS_SEED=7`, depois de 120 s, as duas abas têm o mesmo conjunto de ids vivos, o mesmo `extinct()` e os mesmos `gen`/`parent` para 10 ids sorteados.
  - `"seguir quem morre"`: seguir um indivíduo até ele morrer → nenhum erro no console e o painel fecha.
- [ ] **Step 2: Perf no servidor.** `sim_perf_test.exs` com 250 organismos e o ciclo ligado → `step_us_max ≤ 20 ms` em 600 passos.
- [ ] **Step 3: Medição no cliente** com o mundo no teto (`ABYSS_POPULATION=250`), parado e com `?flypath`, nas duas GPUs, dentro do orçamento. Registrar também a contagem de programas de shader antes e depois de 2 min de nascimentos: ela não pode crescer.
- [ ] **Step 4: Carga** com o mesmo número de observadores do E1 → PASS.
- [ ] **Step 5: Commit** — `perf: e2e, medição e carga do E2 com 250 organismos`

### Task 12: Parada 2 e pacote de aceite

**Files:**
- Create: `docs/GATE_E2_ACCEPTANCE.md`

- [ ] **Step 1:** escrever o pacote no formato do `GATE_E1_ACCEPTANCE.md`: os critérios 1–9 do design, com evidência de cada um (capturas, tabela do `abyss.eco`, números de perf e carga, testes), mais os desvios e os ajustes de valores feitos na Parada 1.
- [ ] **Step 2: Parada 2 com o autor:** o mundo ao vivo mais o pacote. O critério 9 (aprovação explícita) fecha o gate.
- [ ] **Step 3: Commit** — `docs: aceite do gate E2`
