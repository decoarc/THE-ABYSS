# Gate S1 (Gênese de Espécies) — Plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans, para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhar o progresso.

**Objetivo:** qualquer visitante monta uma espécie com peças numa tela separada, confirma pelo e-mail e vê 3 criaturas dela nascendo no mundo, desenhadas em 3D exatamente como montou e vivendo sozinhas na ecologia do E2.

**Arquitetura:**
- **Planta da criatura (`blueprint`)**: um JSON versionado (`v: 1`) com corpo, peças, cores e padrão. É o dado único que o editor edita, o servidor valida e converte em características (`Traits`) e o cliente desenha. Os números do catálogo (custos, efeitos, limites) ficam num JSON compartilhado, `shared/genesis/catalog-s1.json`, lido pelos dois lados (como o mapa do E1). Fixtures compartilhadas garantem que custo e características batem nos dois lados.
- **Servidor:** um contexto novo, `Abyss.Genesis`, com catálogo, planta, características, envio, confirmação, rate limit e persistência. Usa PostgreSQL + Ecto e Swoosh (caixa local em dev). O `Sim` continua puro: ganha espécies registradas em tempo de execução (`Sim.add_species/3`), uma dieta nova (`:predator`, que caça qualquer menor de outra espécie) e a defesa por placa (`escape`). O fio leva as espécies novas no tick (`sp`) e a planta em `species[].blueprint`.
- **Cliente:** um único desenho procedural (`organisms/Criada.tsx`) monta qualquer criatura a partir da planta: um tubo para o corpo e uma malha com todas as peças juntas. São dois shaders fixos, com tudo o que varia vindo por atributos e uniforms, então a contagem de programas não cresce por espécie. A tela de criação (`#criar`) usa o mesmo desenho na prévia.

**Stack:** a do E2 (Elixir 1.20 + Phoenix 1.8 em Docker; React 19 + R3F 9 + drei 10 + three 0.187 + Vite 8 + Vitest 5; Playwright; Node 24), mais `ecto_sql` + `postgrex` + `swoosh` e o serviço `db` (`postgres:17-alpine`) no compose.

**Spec:** `docs/superpowers/specs/2026-11-08-gate-s1-genese-design.md` (aprovado em 2026-11-08). Também: SPEC §5.3, §6.4, §10.3, §12 e §14; o design do E2 (`docs/superpowers/specs/2026-11-05-gate-e2-ecologia-design.md`); `docs/ART_DIRECTION.md`. Esboço da tela: `.superpowers/brainstorm/285-1794168589/content/tela-criacao.html` (arrumação A).

## Global Constraints

- Tudo o que o E1 e o E2 fixaram continua valendo: mundo só em memória, nenhum processo por entidade, `mix` só no contêiner, 10 Hz, o cliente nunca envia estado do mundo e todo observador vê o mesmo mundo.
- **Nenhuma regra do `Sim`, do `Life` ou do `Hunt` testa o id ou o nome de uma espécie.** A mandíbula caça "qualquer criatura menor de outra espécie". As espécies de teste mantêm a lista de presas pelo nome (`{:prey, [...]}`) e não caçam as criadas.
- **Sem canibalismo:** `:predator` nunca caça a própria espécie.
- **Sem mutação:** os filhos herdam a planta e as características do pai. O formato da planta já permite isso no S2 (cada organismo pode ter a sua, mas no S1 todos usam a da espécie).
- **Um e-mail = uma espécie, para sempre**, garantido por restrição única no banco, dentro de transação, sobre o e-mail normalizado (`String.trim |> String.downcase`). A extinção não libera o e-mail. Só o reset total apaga.
- **O e-mail nunca aparece** no fio, no snapshot, no `/api/stats`, no painel, no índice, nas respostas HTTP ou nos logs.
- **Respostas genéricas:** o envio responde igual (`202 {"status":"sent"}`) tanto para um e-mail novo quanto para um já usado. A diferença vai só no conteúdo do e-mail.
- **Token de verificação:** 32 bytes aleatórios em base64url, guardados só como SHA-256. Vale 30 min e é de uso único (a linha é apagada ao confirmar).
- **Fundadoras:** 3 adultas, num ponto sorteado do mapa (sem relação com a dieta), entrando mesmo acima de `pop_cap`.
- **Espécie criada é imutável.** Não há comando nem tela de remoção. Só o reset total (`pnpm api:reset`) apaga espécies e libera e-mails.
- **Programas de shader:** os materiais das criadas usam o mesmo `vertexShader`/`fragmentShader` para qualquer planta, sem `defines` por espécie. A reserva fixa de 4 luzes do E1 continua.
- **Orçamento de desempenho do E2:** `step_us_max` ≤ 20 ms com 250 organismos. No cliente, Arc `low` p95 ≤ 33 ms e RTX `high` p50 ≤ 16,7 ms, medidos parado e voando (`?flypath`). Meta nova: 50 espécies criadas diferentes vivas juntas.
- **Produção (`test_species: false`):** o mundo começa vazio e nada quebra.
- **Textos em pt-BR.** Commits em pt-BR (`feat:`, `art:`, `perf:`, `test:`, `docs:`, `chore:`) na branch `gate-s`, sem push.
- **Verificação sem `rtk`:** `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm api:test` e `pnpm e2e`. O código de saída é a fonte da verdade.

## Review Focus

1. **Corrida na confirmação:** o mesmo link aberto duas vezes ao mesmo tempo, dois links do mesmo e-mail confirmados juntos, ou o mesmo endereço com maiúsculas diferentes. O resultado é exatamente uma espécie e um `"taken"`/`"invalid"` genérico para o outro. Testes: Task 8 (`mesmo token em paralelo publica uma vez`, `dois tokens do mesmo e-mail em paralelo publicam uma vez`, `maiúsculas e espaços são o mesmo e-mail`).
2. **E-mail vazando por um caminho lateral:** erros de changeset, logs de requisição do Phoenix, `/api/stats`, snapshot e tick. Testes: Task 9 (`o e-mail não aparece nos logs`, `422 não ecoa o e-mail`) e Task 5 (`fio sem e-mail`).
3. **Cliente que perde o tick com `sp`** (aba em segundo plano, entrou entre o registro e o passo): o nascido de espécie desconhecida não quebra nem é desenhado errado, o resync traz a espécie, e `sp` repetida não duplica. Testes: Task 11 (`sp repetida não duplica`, `nascido de espécie desconhecida não quebra`).
4. **Planta hostil ou malformada** (NaN, tipos errados, chaves a mais, listas enormes, corpo de 1 MB, boca dupla, peça fora do catálogo): a resposta é `422` com motivo, nunca um crash nem uma espécie publicada. Testes: Task 1 (`lixo aleatório nunca valida nem quebra`) e Task 9 (`corpo grande é recusado`).
5. **Confirmação com o mundo no teto (250):** as 3 entram mesmo assim, as divisões esperam até o mundo voltar abaixo do teto, e ninguém é removido. Teste: Task 4 (`fundadoras entram acima do teto`).

---

## Catálogo S1 (`shared/genesis/catalog-s1.json`)

São os valores iniciais escolhidos pelo construtor (§8 do design). **Todos podem ser ajustados na Parada 1 e na Task 14**, e cada mudança é registrada no ledger.

```json
{
  "version": 1,
  "budget": 24,
  "max_bytes": 8192,
  "body": {
    "points": [3, 6], "length_max": 4.0, "bend_max": 1.2, "r": [0.12, 0.9],
    "radius": [0.4, 1.6], "cost_per_radius": 4
  },
  "parts_max": 14,
  "part_size": [0.5, 1.6],
  "part_angle": [-0.8, 0.8],
  "patterns": ["liso", "manchas", "listras", "aneis"],
  "diminish": 0.7,
  "base": { "max_speed": 0.15, "turn_rate": 0.5, "burst": 1.0, "perception": 4.0,
            "wander": 0.3, "sated_s": 12, "energy_max": 100.0, "escape": 0.0 },
  "caps": { "max_speed": 0.9, "turn_rate": 1.8, "burst": 2.5, "perception": 10.0, "escape": 0.6 },
  "metabolism": { "base": 0.04, "per_radius2": 0.06 },
  "life": { "mature_s": [60, 60], "adult_life_s": [500, 400] },
  "parts": {
    "raspador":  { "group": "boca", "cost": 2, "step": 0, "max": 1, "mirror": false, "metab": 0.010, "diet": "flora" },
    "filtro":    { "group": "boca", "cost": 2, "step": 0, "max": 1, "mirror": false, "metab": 0.010, "diet": "particles" },
    "mandibula": { "group": "boca", "cost": 5, "step": 0, "max": 1, "mirror": false, "metab": 0.020, "diet": "predator" },
    "flagelo":   { "group": "movimento", "cost": 3, "step": 1, "max": 4, "mirror": true,  "metab": 0.020, "effect": { "max_speed": 0.12 } },
    "cilios":    { "group": "movimento", "cost": 2, "step": 1, "max": 4, "mirror": true,  "metab": 0.015, "effect": { "burst": 0.3 } },
    "aleta":     { "group": "movimento", "cost": 2, "step": 1, "max": 4, "mirror": true,  "metab": 0.010, "effect": { "turn_rate": 0.35 } },
    "ocelo":     { "group": "sentidos", "cost": 2, "step": 1, "max": 4, "mirror": true,  "metab": 0.010, "effect": { "perception": 1.5 } },
    "cardume":   { "group": "comportamento", "cost": 2, "step": 0, "max": 1, "mirror": false, "metab": 0.005, "effect": { "school": true } },
    "gancho":    { "group": "comportamento", "cost": 2, "step": 0, "max": 1, "mirror": false, "metab": 0.005, "effect": { "shelter": true } },
    "placa":     { "group": "defesa", "cost": 3, "step": 1, "max": 4, "mirror": true,  "metab": 0.015, "effect": { "escape": 0.15, "speed_factor": 0.9 } }
  }
}
```

**Regras de conta** (iguais no Elixir e no TypeScript):
- **Instâncias:** uma peça com `mirror: true` conta como 2 instâncias do seu tipo (uma de cada lado). `max` e `parts_max` contam instâncias.
- **Custo** da k-ésima instância de um tipo (k = 1, 2, …): `cost + step × (k − 1)`. O custo do corpo é `ceil(cost_per_radius × body_radius)`. O total precisa ser ≤ `budget`.
- **`body_radius`:** raio da esfera que envolve o corpo, ou seja, `max(|pᵢ − centróide| + rᵢ)` sobre os pontos `(x, y)` da espinha, limitado a `body.radius`.
- **Efeito numérico** da k-ésima instância: `effect × diminish^(k − 1)`, somado à base e limitado por `caps`. `speed_factor` multiplica `max_speed` uma vez por placa, depois do limite.
- **`metabolism`** = `base + per_radius2 × body_radius² + Σ metab de cada instância`.
- **Ritmo de vida (escolha do construtor: derivado do corpo):** `mature_s = 60 + 60 × body_radius` e `adult_life_s = 500 + 400 × body_radius`.
- **Dieta:** vem da boca, e é obrigatória exatamente uma (`group: "boca"`).

## Planta (`blueprint`, v1)

```json
{
  "v": 1,
  "body": { "spine": [[-0.3, 0.0, 0.35], [0.0, 0.0, 0.45], [0.3, 0.0, 0.35]] },
  "parts": [ { "kind": "flagelo", "at": 0.05, "around": 1.57, "size": 1.0, "angle": 0.2, "mirror": true } ],
  "colors": { "glow": "#7fe9dd", "body": "#3f5a4a" },
  "pattern": "manchas"
}
```

- `spine`: de 3 a 6 pontos `[x, y, r]`, da cauda para a cabeça. `x` é estritamente crescente, `x_último − x_primeiro ≤ length_max`, `|y| ≤ bend_max` e `r` fica em `body.r`. O exemplo acima é o "núcleo luminoso" inicial do editor (sem boca, ainda inválido para publicar).
- `parts[]`: `kind` precisa existir no catálogo; `at` ∈ [0, 1] ao longo da espinha (0 = cauda); `around` ∈ [−π, π] em volta do eixo (0 = topo, +π/2 = lado direito); `size` e `angle` nas faixas do catálogo; `mirror` só vale para tipos com `mirror: true`. O espelho usa `−around`.
- `colors`: `#rrggbb` minúsculo. `pattern` precisa estar em `patterns`.
- Nenhuma chave a mais. Números finitos. JSON serializado com no máximo `max_bytes`.
- **Nome da espécie (escolha do construtor):** `String.trim`, de 2 a 32 grafemas e sem caracteres de controle. Nomes repetidos são permitidos, e o código da espécie distingue.
- **Ids das criadas:** a espécie tem id `"sp<id do banco>"` (string, nunca átomo) e código `"S" <> base36(id do banco)` em maiúsculas, com pelo menos 2 dígitos (`S01`, `S0A`, `S2Z`…). Os organismos ficam `"S01-0001"`.

## Banco

| Tabela | Colunas |
|---|---|
| `creators` | `id`, `email_normalized` text **unique**, `inserted_at` |
| `species` | `id`, `creator_id` → creators **unique**, `name`, `code` **unique**, `blueprint` jsonb, `ruleset` text (`"s1"`), `published_at`, `extinct_at` null, índice em `extinct_at` |
| `verification_tokens` | `id`, `token_hash` bytea **unique**, `email_normalized`, `name`, `blueprint` jsonb, `expires_at`, `inserted_at` |

## Fio (mudanças)

- `species[]` (snapshot e `sp`) ganha `blueprint` (a planta, ou `null` nas de teste). `diet.kind` ganha `"predator"` (com `prey: []`). O snapshot leva as espécies vivas mais as **100 extintas mais recentes**.
- O tick ganha `sp: SpeciesInfo[]`, com as espécies registradas desde o tick anterior. É idempotente por `id` e é aplicado **antes** de `b`.
- As fundadoras chegam em `b` no tick seguinte ao registro, antes dos nascidos por divisão do mesmo tick.

---

### Task 0: Arrumação

**Files:** `SPEC.md`

- [ ] **Step 1:** `git mv "SPEC (2).md" SPEC.md` (o conteúdo é idêntico ao versionado; o OneDrive tinha renomeado). Conferir com `git status` que o SPEC sumiu da lista de mudanças. `docs/VISUAL_ACCEPTANCE.md` (alteração antiga, de antes do S1) fica como está até o autor decidir.

### Task 1: Catálogo, planta e custo (servidor)

**Files:**
- Create: `shared/genesis/catalog-s1.json` (o JSON da seção Catálogo), `shared/genesis/fixtures/blueprints.json`, `apps/api/lib/abyss/genesis/catalog.ex`, `blueprint.ex`, `random.ex`
- Modify: `apps/api/config/config.exs` (`config :abyss, :catalog_path, "/shared/genesis/catalog-s1.json"`)
- Test: `apps/api/test/abyss/genesis/blueprint_test.exs`

**Interfaces:**
- Produces:
  - `Catalog.load!(path) :: Catalog.t` (mapa com chaves atômicas para os campos do topo e strings para os tipos de peça); `Catalog.get() :: Catalog.t`, que carrega o de `:catalog_path` uma vez e guarda em `:persistent_term`.
  - `Blueprint.validate(term, Catalog.t) :: {:ok, map} | {:error, [String.t]}`. O mapa normalizado tem chaves string e floats (pronto para jsonb e para o fio). Os erros são frases curtas em pt-BR (ex.: `"precisa de exatamente uma boca"`).
  - `Blueprint.cost(map, Catalog.t) :: non_neg_integer`; `Blueprint.body_radius(map, Catalog.t) :: float`; `Blueprint.instances(map) :: %{String.t => pos_integer}`.
  - `Random.blueprint(:rand.state, Catalog.t) :: {map, :rand.state}`, que gera sempre uma planta válida e dentro do orçamento (corpo, boca sorteada, peças até onde o orçamento deixa, cores e padrão).
  - `fixtures/blueprints.json`: lista de `{"name", "blueprint", "valid", "cost", "traits"}` com pelo menos 8 casos (o núcleo inicial sem boca, uma de cada boca, quatro flagelos, espelho em `cardume` (inválido), estouro de orçamento, `x` fora de ordem, chave a mais). `traits` é preenchido na Task 2.

- [ ] **Step 1: Testes que falham** em `blueprint_test.exs`:
  - `"fixtures: validade e custo batem"`: para cada fixture, `validate` dá `{:ok, _}` sse `valid`, e `cost` é igual a `cost`.
  - `"espelho conta duas instâncias e custo cresce"`: com 2 flagelos espelhados (4 instâncias), o custo das peças é `3+4+5+6 = 18`.
  - `"precisa de exatamente uma boca"`: sem boca e com duas bocas dá `{:error, ["precisa de exatamente uma boca"]}`.
  - `"lixo aleatório nunca valida nem quebra"`: 2.000 termos gerados (mapas com tipos trocados, `:nan` como string, listas de 10⁴ itens, chaves extras, binários aleatórios) dão `{:error, _}` sem exceção.
  - `"planta aleatória sempre válida"`: 2.000 `Random.blueprint` (semente fixa) validam, e `cost ≤ budget`.
  - `"tamanho máximo"`: uma planta cujo `Jason.encode!` passa de `max_bytes` é recusada.
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar** `Catalog`, `Blueprint` e `Random` com as regras da seção Catálogo. A validação é manual, sem Ecto, recusando qualquer chave fora do formato. Antes de olhar o resto, mede o tamanho com `:erlang.external_size` / `Jason.encode`.
- [ ] **Step 4:** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: catálogo de peças e planta da criatura (validação e custo)`

### Task 2: Peças viram características

**Files:**
- Create: `apps/api/lib/abyss/genesis/traits.ex`
- Modify: `apps/api/lib/abyss/world/species.ex` (as 5 de teste ganham `escape: 0.0`, `blueprint: nil`; `Species.t` ganha `id: atom | String.t`, `escape: float`, `blueprint: map | nil` e `diet` aceita `:predator`); `shared/genesis/fixtures/blueprints.json` (preencher `traits`)
- Test: `apps/api/test/abyss/genesis/traits_test.exs`, `species_test.exs`

**Interfaces:**
- Consumes: `Blueprint`, `Catalog` (Task 1).
- Produces: `Traits.species(blueprint, Catalog.t, %{id: String.t, code: String.t, name: String.t}) :: Species.t`, com todos os campos do E2 mais `escape` e `blueprint`; `run_s: nil`, `pause_s: nil`; `diet` ∈ `:flora | :particles | :predator`.

- [ ] **Step 1: Testes que falham:**
  - `"fixtures: características batem"`: para cada fixture válida, os campos `max_speed`, `turn_rate`, `burst`, `perception`, `escape`, `metabolism`, `body_radius`, `mature_s`, `adult_life_s`, `school`, `shelter` e `diet` batem com `traits` (floats com tolerância de 1e-9).
  - `"cada peça muda alguma característica"`: para cada tipo, somar uma instância à planta base muda pelo menos um campo de comportamento (anti-meta "peça que só enfeita").
  - `"placa freia e protege"`: uma placa dá `escape` 0,15 e `max_speed` × 0,9.
  - `"ninguém é o melhor em tudo"`: entre 5.000 plantas aleatórias, nenhuma tem ao mesmo tempo `max_speed ≥ 0,6`, `perception ≥ 8`, `burst ≥ 2,0` e `escape ≥ 0,3`.
  - `species_test.exs`: `"toda espécie de teste tem escape 0 e blueprint nil"`.
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar** `Traits.species/3` pelas regras de conta e preencher `traits` nas fixtures com a saída verificada à mão em 2 casos.
- [ ] **Step 4:** `pnpm api:test` → `0 failures`, com os testes do E2 intactos.
- [ ] **Step 5: Commit** — `feat: características derivadas das peças`

### Task 3: Caçador de "qualquer menor" e defesa por placa

**Files:**
- Modify: `apps/api/lib/abyss/world/hunt.ex`, `sim.ex`
- Test: `apps/api/test/abyss/world/hunt_test.exs`, `sim_test.exs`

**Interfaces:**
- Produces:
  - `Hunt.can_eat?/4` aceita o caçador `%{diet: :predator, id: hid}`: come quando `prey.id != hid` e `prey_r < hunter_r`.
  - `Hunt.escapes?(escape :: float, hunter_id, prey_id, now_ms) :: boolean`, sorteio determinístico: `:erlang.phash2({hunter_id, prey_id, now_ms}, 1_000_000) / 1_000_000 < escape`.
  - No `Sim`, `forage` manda `:predator` para `hunt`. `bounds.hunted` vira `:all` quando existe algum `:predator` (senão, o `MapSet` atual). No contato, se `escapes?`, o caçador fica com `target: nil` e `gave_up: {prey_id, now + give_up_s}`, a presa não é comida, e `eco_totals.hunts_escaped` soma 1 (também em `eco_stats`).

- [ ] **Step 1: Testes que falham:**
  - `hunt_test.exs`: `"predador come menor de outra espécie"`, `"predador não come a própria espécie"` (jovem menor da mesma espécie → false) e `"caçador de teste não come espécie criada"` (`{:prey, [:celula]}` contra `"sp1"` → false).
  - `hunt_test.exs`: `"escape é determinístico e proporcional"`: `escapes?(0.0, …)` é sempre false, `escapes?(1.0, …)` é sempre true, e com 0,3 sobre 10.000 pares a fração fica em 0,3 ± 0,02.
  - `sim_test.exs`: `"presa com placa escapa do bote"`. Um predador faminto encosta numa presa com `escape: 1.0`: depois do passo a presa continua viva, `hunts_escaped == 1` e o caçador ignora essa presa por `give_up_s`.
  - `sim_test.exs`: `"quem pode ser caçado foge de predador"`. Com um `:predator` no mundo, uma presa menor dentro da percepção ganha velocidade de fuga (`|v|` > `max_speed`).
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.** O caçador lê o `escape` da presa pela grade (`spec(bounds, psp).escape`).
- [ ] **Step 4:** `pnpm api:test` → `0 failures` (o teste `"espécie inventada"` do E2 continua passando).
- [ ] **Step 5: Commit** — `feat: mandíbula caça qualquer menor e placa dá chance de escape`

### Task 4: Espécies registradas em tempo de execução e fundadoras

**Files:**
- Modify: `apps/api/lib/abyss/world/sim.ex`, `lib/abyss/eco.ex`, `lib/mix/tasks/abyss.eco.ex`
- Test: `apps/api/test/abyss/world/sim_test.exs`, `eco_run_test.exs`

**Interfaces:**
- Consumes: `Species.t` com id string (Task 2); `Random.blueprint`, `Traits.species` (Tasks 1–2).
- Produces:
  - `Sim.add_species(sim, Species.t, opts) :: Sim.t`, com `opts`: `founders: non_neg_integer` (padrão 3) e `extinct_ms: integer | nil`. Registra a espécie em `bounds.species`/`species_list` (no fim) e põe a espécie em `sim.pending_species`. Com `founders > 0`, sorteia uma região (peso 1 para cada uma, sem relação com a dieta) e um ponto no disco dela, e cria as fundadoras a até 1,5 desse ponto (fora das esponjas), com `stage: :adult`, `stage_ms: now_ms`, energia `0.9 × energy_max`, `generation: 1` e ids `"<code>-0001"`… Elas vão para `sim.pending_founders`. Com `extinct_ms`, a espécie entra direto em `sim.extinct`, sem organismos. Registrar um id que já existe é no-op.
  - No `step/3`, `pending_founders` entra na lista **sem passar pelo passo e sem contar o teto**: `new_orgs ++ pending_founders ++ births`. `life_events` ganha `species: [Species.t]` (o `pending_species` do passo), e `life_events.births` vira `pending_founders ++ births`. Os dois `pending` se esvaziam.
  - `bounds.max_r` passa a usar `max(maior raio da tabela, catálogo body.radius máximo = 1.6) × scale`, para a grade de esponjas e a separação não mudarem quando chega uma espécie maior. `bounds.hunted` é recalculado no `add_species`.
  - **Poda:** quando uma espécie criada (id string) se extingue, o `Sim` mantém em `bounds` só as 100 extintas criadas mais recentes. As de teste nunca são podadas.
  - `Abyss.Eco.run/1` e `mix abyss.eco` aceitam `--genesis N`, que soma N espécies `Random.blueprint` (semente da corrida), 3 fundadoras cada. O CSV ganha as colunas delas (`pop_sp1`…).

- [ ] **Step 1: Testes que falham** (`sim_test.exs`):
  - `"fundadoras nascem adultas, juntas, no tick seguinte"`: depois de `add_species` + `step`, `life_events.species` tem a espécie, `life_events.births` começa pelas 3 fundadoras (adultas, energia 90), e elas estão a até 3,0 umas das outras.
  - `"fundadoras entram acima do teto"`: com `pop_cap: 20` e 20 organismos, `add_species` + `step` deixa 23. Nos 50 passos seguintes, nenhum nascimento por divisão acontece enquanto a população for ≥ 20.
  - `"ordem do fio: fundadoras antes dos filhos"`: num passo com uma divisão concluída e fundadoras pendentes, `organisms` termina com `[…, f1, f2, f3, filho]`.
  - `"extinta registrada não volta"`: `add_species(sp, extinct_ms: 123, founders: 0)` → `sim.extinct["sp9"] == 123` e nenhum organismo.
  - `"poda das extintas criadas"`: 120 espécies criadas registradas e extintas deixam 100 em `Sim.species/1`, e as 5 de teste continuam.
  - `"registrar duas vezes não duplica"`.
  - `eco_run_test.exs`: `"--genesis 5 roda 10 min sem erro e é repetível"` (mesma semente, mesmo CSV).
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm api:test` → `0 failures`; `sim_perf_test` dentro do orçamento.
- [ ] **Step 5: Commit** — `feat: espécies registradas em tempo de execução com 3 fundadoras`

### Task 5: Fio e Server com espécies criadas

**Files:**
- Modify: `apps/api/lib/abyss/world/wire.ex`, `server.ex`
- Test: `apps/api/test/abyss/world/wire_test.exs`, `server_test.exs`

**Interfaces:**
- Consumes: `Sim.add_species/3`, `life_events.species` (Task 4).
- Produces:
  - `Wire`: ids de espécie com `to_string/1` (átomo ou string). `species[]` ganha `blueprint`. A dieta `:predator` vira `%{kind: "predator", prey: []}`. O snapshot leva as vivas + as 100 extintas mais recentes (por `extinct_ms` decrescente). O tick ganha `sp: [species_info]`.
  - `Server.add_species(server, Species.t) :: :ok` (call), que aplica `Sim.add_species(sim, sp, founders: 3)`.
  - Opções novas de `Server.start_link`: `species_loader: (-> %{live: [Species.t], extinct: [{Species.t, integer}]})`, chamado no `init` (as vivas entram com 3 fundadoras e as extintas com `extinct_ms`); `on_extinct: ([{String.t, integer}] -> any)`, chamado depois de cada passo só com as extinções de ids string, se houver alguma. Padrões: `fn -> %{live: [], extinct: []} end` e `fn _ -> :ok end`.

- [ ] **Step 1: Testes que falham:**
  - `wire_test.exs`: `"espécie criada no snapshot e no tick"`. Depois de `add_species`, o snapshot tem `species` com `id: "sp1"`, `blueprint` igual ao da planta e `diet.kind == "predator"`. O tick seguinte tem `sp` com ela e `b` com as 3 fundadoras.
  - `wire_test.exs`: `"snapshot leva só 100 extintas"`, com 130 criadas extintas → 100 extintas no snapshot, as mais recentes.
  - `wire_test.exs`: `"fio sem e-mail"`. Com uma espécie cujo mapa de origem tinha um campo `email: "a@b.c"` (o `Traits` não deve copiá-lo), o JSON de snapshot e tick não contém `"@"`.
  - `server_test.exs`: `"add_species chega aos observadores"` (o broadcast do tick seguinte tem `sp` e as fundadoras), `"species_loader no boot"` (2 vivas → 6 organismos; 1 extinta → no `extinct`) e `"on_extinct só com criadas"`.
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: espécies criadas no fio e no servidor do mundo`

### Task 6: Banco, e-mail e infraestrutura de dev

**Files:**
- Modify: `apps/api/mix.exs` (deps `{:ecto_sql, "~> 3.13"}`, `{:postgrex, ">= 0.0.0"}`, `{:swoosh, "~> 1.19"}`; alias `test: ["ecto.create --quiet", "ecto.migrate --quiet", "test"]`), `config/config.exs`, `dev.exs`, `test.exs`, `runtime.exs` (`DATABASE_URL`; em prod obrigatório), `lib/abyss/application.ex` (`Abyss.Repo` antes do mundo), `lib/abyss_web/router.ex` (`/dev/mailbox` com `Plug.Swoosh.MailboxPreview` sob `dev_routes`), `infra/compose/compose.yaml` (serviço `db` `postgres:17-alpine` com healthcheck `pg_isready`, volume `db_data`; `api` com `depends_on: db: condition: service_healthy` e `DATABASE_URL=ecto://postgres:postgres@db/abyss_dev`), `package.json` (raiz: `api:up` sobe `db` e `api`)
- Create: `apps/api/lib/abyss/repo.ex`, `lib/abyss/mailer.ex`, `priv/repo/migrations/20261110000001_create_genesis.exs`, `lib/abyss/genesis/creator.ex`, `species_record.ex`, `verification_token.ex` (schemas), `test/support/data_case.ex`
- Test: `apps/api/test/abyss/genesis/schema_test.exs`

**Interfaces:**
- Produces: `Abyss.Repo`; `Abyss.Mailer` (Swoosh; `Local` em dev, `Test` em test, `api_client: false`); schemas `Creator`, `SpeciesRecord` (tabela `species`) e `VerificationToken` com as colunas da seção Banco; `Abyss.DataCase` com sandbox. O banco de teste é `abyss_test` (com `MIX_TEST_PARTITION`), e o `test.exs` lê o host do `DATABASE_URL` trocando o nome do banco.

- [ ] **Step 1: Testes que falham** (`schema_test.exs`):
  - `"e-mail normalizado é único em creators"` (o segundo insert dá erro de restrição).
  - `"um criador tem no máximo uma espécie"` (o segundo `species` com o mesmo `creator_id` dá erro de restrição).
  - `"code é único"`.
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.** A migração cria as restrições **no banco** (`unique_index`), não só no changeset.
- [ ] **Step 4:** `pnpm api:down && pnpm api:up`, depois `pnpm api:test` → `0 failures`. `curl -s localhost:4000/api/health` responde, e `http://localhost:4000/dev/mailbox` abre.
- [ ] **Step 5: Commit** — `chore: PostgreSQL, Ecto e Swoosh no ambiente de dev`

### Task 7: Pedido de criação (envio do link)

**Files:**
- Create: `apps/api/lib/abyss/genesis.ex` (contexto), `lib/abyss/genesis/rate_limit.ex`, `lib/abyss/genesis/email.ex`
- Modify: `config/config.exs` (bloco `:genesis`), `lib/abyss/application.ex` (`RateLimit` na árvore)
- Test: `apps/api/test/abyss/genesis/submit_test.exs`, `rate_limit_test.exs`

**Interfaces:**
- Consumes: `Blueprint.validate`, `Catalog.get` (Task 1); schemas e `Mailer` (Task 6).
- Produces:
  - `config :abyss, :genesis, token_ttl_s: 1800, web_url: "http://localhost:5173", limits: [submit_ip: {10, 600}, submit_email: {3, 3600}, confirm_ip: {20, 600}]`.
  - `Genesis.normalize_email(String.t) :: {:ok, String.t} | :error` (trim + downcase; até 254 caracteres; precisa casar `~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
  - `Genesis.validate_name(String.t) :: {:ok, String.t} | {:error, String.t}`.
  - `Genesis.submit(%{"email" => _, "name" => _, "blueprint" => _}, ip :: tuple) :: {:ok, :sent} | {:error, :rate_limited} | {:error, %{field => [String.t]}}`. Se o e-mail ainda não tem espécie, grava o `VerificationToken` (hash SHA-256) e manda o e-mail com `"#{web_url}/#confirmar=#{token}"`. Se já tem, manda o e-mail "este e-mail já criou uma espécie" e não grava token. As duas saídas retornam `{:ok, :sent}`. Em cada envio, apaga os tokens vencidos.
  - `RateLimit.hit(key :: term, {max, window_s}) :: :ok | :limited` (ETS, janela fixa, dono é um GenServer).
  - `Email.verify(to, url)` e `Email.already_used(to)`, com textos em pt-BR, remetente `{"The Abyss", "nao-responda@the-abyss.local"}`, assunto `"Confirme a sua espécie no The Abyss"`.

- [ ] **Step 1: Testes que falham:**
  - `submit_test.exs`: `"envia link com token que só existe como hash"`. O e-mail enviado (`Swoosh.TestAssertions`) tem a URL `#confirmar=`. O token da URL não aparece em nenhuma coluna, e `:crypto.hash(:sha256, token)` está em `token_hash`.
  - `"e-mail já usado recebe resposta igual"`: `{:ok, :sent}` nos dois casos. O segundo e-mail é o de "já criou", e nenhum token novo é gravado.
  - `"planta e nome inválidos dão erro por campo sem e-mail"`: `{:error, %{"blueprint" => [_], "name" => [_]}}`, e o mapa de erro não contém o endereço.
  - `"limite por e-mail"`: o 4º envio do mesmo e-mail (com maiúsculas diferentes) em 1 h dá `{:error, :rate_limited}`. `"limite por rede"`: o 11º do mesmo IP também.
  - `rate_limit_test.exs`: `"janela vence e libera"` (com `window_s` 1 e o relógio injetável).
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.** Nunca chamar `Logger` com o e-mail ou com o token.
- [ ] **Step 4:** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: pedido de criação com link de verificação por e-mail`

### Task 8: Confirmação e publicação no mundo

**Files:**
- Modify: `apps/api/lib/abyss/genesis.ex`
- Test: `apps/api/test/abyss/genesis/confirm_test.exs`

**Interfaces:**
- Consumes: `submit` (Task 7); `Traits.species` (Task 2); `Server.add_species/2` (Task 5).
- Produces:
  - `Genesis.confirm(token :: String.t, opts) :: {:ok, %{id: String.t, name: String.t, code: String.t}} | {:error, :invalid | :taken}`. `opts[:world]` é o servidor (padrão `Abyss.World.Server`; se não houver processo, a publicação no banco vale e o mundo a carrega no próximo boot).
  - Numa transação: `DELETE FROM verification_tokens WHERE token_hash = $1 AND expires_at > now() RETURNING *` (é o uso único). Depois, `insert creators … on_conflict: :nothing` + busca, e `insert species`. A violação de `species_creator_id_index` vira `{:error, :taken}`. Depois de `commit`, apaga os outros tokens do mesmo e-mail e chama `Server.add_species` com `Traits.species(bp, catalog, %{id: "sp#{id}", code: code, name: name})`.
  - `Genesis.species_from_record(SpeciesRecord.t) :: Species.t` (reusado na Task 10).

- [ ] **Step 1: Testes que falham** (`confirm_test.exs`, com um `Server` próprio do teste; os testes em paralelo usam o sandbox em modo compartilhado, `async: false`):
  - `"confirmar publica e faz nascer 3"`: `{:ok, %{id: "sp" <> _}}`. Depois de 2 ticks, o snapshot do servidor tem 3 organismos da espécie.
  - `"token vencido, desconhecido ou usado dá :invalid"`.
  - `"mesmo token em paralelo publica uma vez"`: 2 `Task.async` com o mesmo token → exatamente um `{:ok, _}` e um `{:error, :invalid}`, e 1 linha em `species`.
  - `"dois tokens do mesmo e-mail em paralelo publicam uma vez"`: dois `submit` (com o rate limit folgado no teste) e duas confirmações em paralelo → um `{:ok, _}` e um `{:error, :taken}`.
  - `"maiúsculas e espaços são o mesmo e-mail"`: confirmar `" Ana@X.com"` e depois `"ana@x.com "` → o segundo dá `:taken`.
  - `"extinção não libera o e-mail"`: com a espécie marcada extinta no banco, um novo envio + confirmação do mesmo e-mail → `:taken` (o envio nem gera token).
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: confirmação de uso único publica a espécie e faz nascer 3`

### Task 9: API HTTP, CORS e privacidade nos logs

**Files:**
- Create: `apps/api/lib/abyss_web/controllers/genesis_controller.ex`, `lib/abyss_web/plugs/cors.ex`
- Modify: `lib/abyss_web/router.ex`, `lib/abyss_web/endpoint.ex` (CORS antes do router; `Plug.Parsers` com `length: 16_384`), `config/config.exs` (`config :phoenix, :filter_parameters, ["password", "email", "token"]`; `config :abyss, :web_origins, ["http://localhost:5173", "http://localhost:4173", "http://localhost:4175"]`)
- Test: `apps/api/test/abyss_web/controllers/genesis_controller_test.exs`

**Interfaces:**
- Consumes: `Genesis.submit/2`, `Genesis.confirm/2`.
- Produces:
  - `POST /api/genesis/submit` com `{email, name, blueprint}` → `202 {"status":"sent"}` | `422 {"status":"invalid","errors":{campo:[...]}}` | `429 {"status":"slow_down"}`.
  - `POST /api/genesis/confirm` com `{token}` → `200 {"status":"published","species":{"id","name","code"}}` | `200 {"status":"invalid"}` | `200 {"status":"taken"}` | `429`.
  - `GET /api/genesis/catalog` → o catálogo (o cliente usa o JSON importado, mas o e2e confere que é o mesmo).
  - `AbyssWeb.Plugs.Cors`: responde ao `OPTIONS` com `204` e põe `access-control-allow-origin` só para as origens de `:web_origins`.

- [ ] **Step 1: Testes que falham:**
  - `"submit válido responde 202 e genérico"` (corpo exatamente `{"status":"sent"}`, tanto para um e-mail novo quanto para um usado).
  - `"422 não ecoa o e-mail"` (o corpo da resposta não contém o endereço).
  - `"corpo grande é recusado"`: um corpo de 1 MB dá `413` (ou o erro do `Plug.Parsers`), sem nenhuma linha nova no banco.
  - `"o e-mail não aparece nos logs"`: com `Logger.configure(level: :debug)` e `capture_log`, um submit e um confirm completos não deixam o endereço nem o token no log.
  - `"CORS só para as origens do web"`: um preflight de `http://localhost:5173` tem o header; um de `http://evil.test` não tem.
  - `"stats sem e-mail"`: depois de publicar, `GET /api/stats` não contém `"@"`.
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm api:test` → `0 failures`.
- [ ] **Step 5: Commit** — `feat: API de criação com CORS e e-mail fora dos logs`

### Task 10: Reinício, extinção no banco, reset total e semeadura de medição

**Files:**
- Create: `apps/api/lib/abyss/genesis/recorder.ex`, `lib/mix/tasks/abyss.reset.ex`, `lib/mix/tasks/abyss.seed_species.ex`
- Modify: `lib/abyss/genesis.ex`, `lib/abyss/application.ex` (o `Server` recebe `species_loader: &Genesis.boot_species/0` e `on_extinct: &Genesis.Recorder.record/1`), `package.json` raiz (`"api:reset": "docker compose -f infra/compose/compose.yaml run --rm api mix abyss.reset --yes && docker compose -f infra/compose/compose.yaml restart api"`)
- Test: `apps/api/test/abyss/genesis/boot_test.exs`, `test/mix/abyss_reset_test.exs`

**Interfaces:**
- Produces:
  - `Genesis.boot_species() :: %{live: [Species.t], extinct: [{Species.t, integer}]}`: as vivas (`extinct_at IS NULL`) e as 100 extintas mais recentes (ms de `extinct_at`).
  - `Genesis.Recorder.record([{String.t, integer}]) :: :ok` (cast). Grava `extinct_at` só onde ainda está nulo, sem bloquear o tick.
  - `mix abyss.reset --yes`: `TRUNCATE species, creators, verification_tokens RESTART IDENTITY`. Sem `--yes`, imprime o aviso e sai com código 1.
  - `mix abyss.seed_species --count N --seed S`: só com `config :abyss, :allow_seed, true` (dev). Insere N criadores `seed-<i>@seed.invalid` e N espécies com `Random.blueprint`. Em prod, recusa.

- [ ] **Step 1: Testes que falham:**
  - `boot_test.exs`: `"vivas voltam e extintas continuam extintas, com data"`: 2 vivas e 1 extinta no banco → `boot_species` devolve 2 em `live` e 1 em `extinct`, com o ms certo. Um `Server` iniciado com esse loader tem 6 organismos e `extinct["sp3"]` = esse ms.
  - `"só 100 extintas no boot"`.
  - `"extinção é gravada"`: `Recorder.record([{"sp1", ms}])` → `extinct_at` preenchido; repetir não muda a data.
  - `abyss_reset_test.exs`: `"reset sem --yes não apaga"` e `"reset com --yes libera o e-mail"` (depois dele, `submit` + `confirm` do mesmo e-mail publicam).
- [ ] **Step 2:** `pnpm api:test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm api:test` → `0 failures`. À mão: `docker compose … run --rm api mix abyss.seed_species --count 3 --seed 1`, depois `restart api` → `/api/stats` mostra 3 espécies `sp*` com 3 cada.
- [ ] **Step 5: Commit** — `feat: reinício com espécies vivas, extinção no banco e reset total`

### Task 11: Cliente: fio, store, planta e textos

**Files:**
- Create: `apps/web/src/genesis/blueprint.ts`, `apps/web/src/genesis/blueprint.test.ts`
- Modify: `apps/web/src/services/wire.ts`, `services/worldStore.ts`, `lib/format.ts`, `services/debugBridge.ts`
- Test: `services/worldStore.life.test.ts`, `lib/format.test.ts`

**Interfaces:**
- Consumes: `shared/genesis/catalog-s1.json` e `shared/genesis/fixtures/blueprints.json` (importados como o mapa em `world/map.ts`).
- Produces:
  - `wire.ts`: `Blueprint`, `BlueprintPart`, `PartKind`, `Pattern`; `SpeciesInfo.blueprint: Blueprint | null`; `diet.kind` com `'predator'`; `TickMessage.sp: SpeciesInfo[]`.
  - `genesis/blueprint.ts`: `CATALOG`, `blueprintCost(bp): number`, `bodyRadius(bp): number`, `instances(bp): Record<PartKind, number>`, `validateBlueprint(bp): string[]` (mesmas frases do servidor), `previewTraits(bp)` (mesmos campos e contas do `Traits`), `nextInstanceCost(bp, kind): number | null` (null se não cabe, por `max`, `parts_max` ou orçamento), `INITIAL_BLUEPRINT` (o núcleo luminoso da seção Planta).
  - Store: `applyTick` aplica `sp` (substitui por id, senão acrescenta; nova identidade de `species()`), antes de `b`. Um nascido de espécie desconhecida entra no roster normalmente (o desenho decide).
  - `formatDiet`: `'predator'` → `"criaturas menores"`.
  - `debugBridge`: `blueprintOf(speciesId): Blueprint | null`.

- [ ] **Step 1: Testes que falham:**
  - `blueprint.test.ts`: `"fixtures: validade, custo e características batem com o servidor"` (as mesmas fixtures da Task 1/2, com tolerância de 1e-9); `"nextInstanceCost respeita max, espelho e orçamento"`.
  - `worldStore.life.test.ts`: `"sp acrescenta espécie antes dos nascidos"`, `"sp repetida não duplica"` e `"nascido de espécie desconhecida não quebra"`.
  - `format.test.ts`: `"predador"`.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pnpm test` e `pnpm typecheck` → exit 0.
- [ ] **Step 5: Commit** — `feat: cliente entende espécies criadas e a planta`

### Task 12: Desenho procedural das criadas

**Files:**
- Create: `apps/web/src/genesis/geometry.ts`, `genesis/geometry.test.ts`, `genesis/materials.ts`, `genesis/materials.test.ts`, `organisms/Criada.tsx`
- Modify: `organisms/Creatures.tsx`, `organisms/Creatures.test.tsx`

**Interfaces:**
- Consumes: `Blueprint` e `bodyRadius` (Task 11); `useOrganismPose`, `useVitals`, `useSelectable`, `useCreatureCull`, `requestCreatureGlow`, `Nucleus`, `foggyShader` (existentes).
- Produces:
  - `buildBodyGeometry(bp): THREE.BufferGeometry`: um tubo ao longo de uma Catmull-Rom pela espinha (`x` → +y local, frente = +y, como a Célula; `y` → +z local para cima), com o raio interpolado entre os pontos e as pontas fechadas. Atributos `aAlong` (0..1) e `aAround` (−π..π).
  - `surfaceFrame(bp, at, around): { position: Vector3; normal: Vector3; tangent: Vector3 }` e o inverso `surfaceCoords(bp, point: Vector3): { at: number; around: number }` (para o editor arrastar peças).
  - `buildPartsGeometry(bp): THREE.BufferGeometry`: todas as instâncias (já espelhadas) fundidas numa malha, cada tipo com a sua forma-modelo fixa (raspador = disco de dentes; filtro = leque de cerdas; mandíbula = duas pinças; flagelo = fio longo afinando; cílios = fileira de fios curtos; aleta = lâmina plana; ocelo = esfera com íris; cardume = filamento fino com pontos; gancho = arco; placa = escama facetada), posicionadas por `surfaceFrame` e escaladas por `size`, com inclinação por `angle`. Atributos `aKind` (índice do tipo), `aT` (0 = raiz, 1 = ponta) e `aPhase`.
  - `geometryCache`: `acquire(bp): { body; parts }` / `release(bp)`, com chave `JSON.stringify(bp)`, contagem de referências e `dispose` ao chegar a zero.
  - `createBodyMaterial(): THREE.ShaderMaterial` e `createPartsMaterial(): THREE.ShaderMaterial`, com o mesmo código para toda planta. Uniforms do corpo: `uSkin`, `uGlow`, `uPattern` (0 liso, 1 manchas, 2 listras ao longo, 3 anéis), `uPulse`, `uFade`. Uniforms das peças: `uTime`, `uSwim` (|v|/max), `uGlow`, `uSkin`, `uFade`. O vertex shader das peças anima por `aKind`: o flagelo ondula da raiz à ponta e mais rápido com `uSwim`; os cílios fazem uma onda em fileira; a aleta bate; a mandíbula abre e fecha devagar. Os ocelos brilham com `uGlow`.
  - `Criada({ id })`: o padrão da `Celula` (pose, orientação pela velocidade, vitais, seleção, cull, brilho no chão com a cor `glow`), com o `Nucleus` no centróide da espinha, o corpo translúcido por cima e as peças. Não pede luz própria.
  - `componentFor(species: SpeciesInfo | undefined)`: as 5 de teste pelo id, qualquer espécie com `blueprint` → `Criada`, senão `null`.

- [ ] **Step 1: Testes que falham:**
  - `geometry.test.ts`: `"corpo cobre a espinha"` (o raio da bounding sphere fica a 5% de `bodyRadius(bp)`); `"espelho gera peça simétrica"` (a malha com `mirror` tem o dobro de vértices daquele tipo e é simétrica em x); `"surfaceCoords inverte surfaceFrame"` (ida e volta com erro < 0,02 em 200 pontos); `"plantas diferentes, contagem de vértices finita"` (100 `Random`-like plantas → corpo + peças < 20.000 vértices cada).
  - `materials.test.ts`: `"mesmo programa para qualquer planta"`: dois materiais criados para plantas com cores, padrões e peças diferentes têm `vertexShader`, `fragmentShader` e `defines` idênticos.
  - `Creatures.test.tsx`: `"espécie com blueprint usa Criada"` e `"espécie sem desenho é ignorada"`.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.** A arte segue `docs/ART_DIRECTION.md`: pele translúcida com Fresnel, núcleo acima do limiar do bloom e nada saturado demais fora do núcleo.
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` e `pnpm build` → exit 0. À mão: com `seed_species --count 5` e restart, `pnpm dev` mostra 5 criaturas diferentes nadando, e `?debug=1` → `__abyss.programs()` não muda depois que a segunda espécie criada aparece.
- [ ] **Step 5: Commit** — `art: desenho procedural das espécies criadas`

### Task 13: Tela de criação, botão no mundo e confirmação

**Files:**
- Create: `apps/web/src/genesis/editor.ts`, `genesis/editor.test.ts`, `genesis/genesisApi.ts`, `genesis/genesisApi.test.ts`, `genesis/route.ts`, `genesis/route.test.ts`, `genesis/CreationScreen.tsx`, `genesis/CreationScreen.test.tsx`, `genesis/EditorPreview.tsx`, `ui/CreateButton.tsx`, `ui/GenesisNotice.tsx`
- Modify: `apps/web/src/App.tsx`, `App.test.tsx`

**Interfaces:**
- Consumes: `blueprint.ts` (Task 11); `geometry.ts`, `materials.ts` e `geometryCache` (Task 12); `POST /api/genesis/*` (Task 9).
- Produces:
  - `route.ts`: `parseRoute(hash): { kind: 'world' } | { kind: 'create' } | { kind: 'confirm'; token: string }` (`''`, `'#criar'`, `'#confirmar=<token>'`) e `useRoute()` (escuta `hashchange`).
  - `editor.ts`: reducer puro `editorReducer(state, action)`, com `state = { bp: Blueprint; selected: { kind: 'point' | 'part'; index: number } | null }`. Ações: `addPart(kind)` (cabeça para bocas e ocelos, cauda para flagelos, meio para o resto; recusa se `nextInstanceCost` for null), `movePart(i, at, around)`, `setPartSize`, `setPartAngle`, `toggleMirror`, `removePart`, `movePoint(i, x, y)`, `setThickness(i, r)`, `addPoint` (entre o selecionado e o seguinte), `removePoint`, `setColor('glow' | 'body', hex)`, `setPattern`, `select`. Todo valor é limitado às faixas do catálogo, e nenhuma ação leva a uma planta fora do orçamento.
  - `genesisApi.ts`: `API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'`; `submitSpecies({ email, name, blueprint }): Promise<'sent' | 'slow_down' | { errors: Record<string, string[]> }>`; `confirmSpecies(token): Promise<'invalid' | 'taken' | { published: { id: string; name: string; code: string } }>`.
  - `CreationScreen`: arrumação A. À esquerda (cerca de 360 px): e-mail, nome, peças por grupo (cada botão com nome, efeito em 3 palavras e custo da próxima instância; desabilitado quando não cabe), controles da seleção (tamanho, ângulo, espelho, remover; ou espessura e remover ponto), cores (`<input type="color">`), padrão, "O que ela faz" (de `previewTraits`: come, velocidade, arranque, giro, percepção, defesa, gasto), barra de orçamento `usados / 24`, os erros de `validateBlueprint` e o botão "Liberar no abismo". À direita: `EditorPreview`. No topo, "← Voltar ao abismo" (volta sem publicar; o rascunho fica no estado do `App` enquanto a página estiver aberta).
  - `EditorPreview`: um `<Canvas>` próprio com a criatura (mesmos materiais e geometria) e `OrbitControls` do drei, começando de lado. Os pontos da espinha aparecem como alças arrastáveis no plano lateral, e as peças se arrastam sobre o corpo por raycast + `surfaceCoords`. A roda sobre um ponto muda a espessura.
  - Depois de enviar: "Enviamos um link para o seu e-mail. Ele vale por 30 minutos." (`slow_down`: "Muitas tentativas. Espere alguns minutos e tente de novo.")
  - `CreateButton`: no canto inferior direito, "CRIAR ESPÉCIE", no estilo dos botões do `InspectPanel`, leva a `#criar`.
  - Rota `confirm`: chama `confirmSpecies` uma vez, troca o hash por `''` e mostra o `GenesisNotice` sobre o mundo por 8 s: `published` → "‹nome› foi liberada no abismo. Procure por ela no índice."; `taken` → "Este e-mail já criou uma espécie."; `invalid` → "Este link não vale mais. Monte de novo e peça outro link."
  - Com a rota `create`, o `Canvas` do mundo é desmontado e o `WorldProvider` continua conectado.

- [ ] **Step 1: Testes que falham:**
  - `editor.test.ts`: `"começa no núcleo luminoso"`; `"não deixa passar do orçamento"` (adicionar flagelos até recusar: o custo nunca passa de 24); `"limites do corpo"` (`movePoint` não deixa `x` fora de ordem nem o comprimento passar de 4); `"espelho só onde o catálogo deixa"`; `"remover ponto mantém pelo menos 3"`.
  - `route.test.ts`: as três rotas e um hash estranho → `world`.
  - `genesisApi.test.ts` (com `fetch` falso): mapeia `202`, `422`, `429` e os três status de confirmação.
  - `CreationScreen.test.tsx`: `"Liberar desabilitado sem boca"`; `"envio mostra a mensagem do link"`; `"erros do servidor aparecem no campo"`.
  - `App.test.tsx`: `"botão leva à criação e voltar preserva o rascunho"` e `"confirmação mostra o aviso e volta ao mundo"`.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3: Implementar.** Teclado: todos os controles do painel são operáveis por teclado (SPEC §11.1); arrastar no 3D é só com o mouse. Esc no editor não volta ao mundo (evita perder o foco do formulário).
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` e `pnpm build` → exit 0. À mão: montar uma criatura, enviar, abrir `localhost:4000/dev/mailbox`, clicar no link, voltar ao mundo e achar as 3 pelo índice.
- [ ] **Step 5: Commit** — `feat: tela de criação, botão no mundo e confirmação pelo link`

### Task 14: Parada 1 (variedade, reconhecimento e calibração)

**Files:**
- Create: `scripts/capture-s1.mjs`; `docs/captures/s1/parada-1/`
- Modify: `shared/genesis/catalog-s1.json` (só os ajustes aprovados), ledger

- [ ] **Step 1: Calibração.** `mix abyss.eco --seed 1..5 --minutes 60 --genesis 20` com as espécies de teste e sem elas (`test_species: false`). Registrar no ledger, para cada corrida: espécies vivas no minuto 60, se alguma passou de 60% da população (o sinal de "melhor em tudo"), e mortes por causa. Se uma espécie típica (corpo de raio ~1, boca, 2–3 peças de movimento) não chegar a se dividir uma vez em 20 min, ajustar `metabolism.base` ou `per_radius2` e repetir. Equilíbrio não é aceite.
- [ ] **Step 2: Capturas** (`scripts/capture-s1.mjs`, Playwright com `?debug=1`): 8 plantas bem diferentes (as fixtures mais 4 de `Random`, semente fixa) lado a lado na prévia do editor e a mesma espécie nadando no mundo, de perto, nas duas GPUs (Arc `low`, RTX `high`); a placa escapando de um bote (`hunts_escaped` > 0 numa corrida com predador e presa com placa); um cardume e uma fuga para a Floresta com gancho.
- [ ] **Step 3: Parada com o autor.** O autor monta 3 a 5 criaturas no editor. Uma pergunta por vez: (1) dá para fazer espécies bem diferentes entre si? (anti-meta principal); (2) a criatura no mundo é reconhecível como a do editor?; (3) cada peça se lê no comportamento?; (4) números do catálogo (orçamento, custos, chance da placa e freio). Registrar cada decisão no ledger.
- [ ] **Step 4: Commit** — `art: ajustes da Parada 1 do S1` e `docs: aprovação da Parada 1 do S1`

### Task 15: e2e, desempenho com 50 espécies e carga

**Files:**
- Create: `scripts/e2e/genesis.mjs`
- Modify: `package.json` raiz (`"e2e:genesis": "pnpm build && node scripts/e2e/genesis.mjs"`), `scripts/perf/measure.mjs`, `scripts/load/observers.mjs`
- Create: `docs/captures/s1/perf/`

- [ ] **Step 1: e2e** (`genesis.mjs`; antes, `pnpm api:reset`; o e-mail sai de `GET localhost:4000/dev/mailbox/json`). Cenários:
  - `fluxo completo`: botão → `#criar` → montar (boca + 2 peças) → enviar → abrir o link do e-mail → o aviso aparece, e em ≤ 3 s o roster (`__abyss.organisms()`) tem 3 organismos da espécie nova, com `blueprintOf` igual à planta enviada.
  - `segunda aba vê a espécie nova sem recarregar`: uma aba aberta antes da confirmação recebe `sp` e as 3.
  - `mesmo e-mail não publica de novo`: o segundo envio com `"  Mesmo@Email.com"` → o e-mail de "já criou", e nenhuma espécie nova.
  - `link usado duas vezes`: a segunda abertura mostra "Este link não vale mais".
  - `nada de e-mail no fio`: durante o fluxo, nenhum frame do WebSocket (`page.on('websocket')`) contém o endereço.
  - `programas não crescem por espécie`: com `__abyss.programs()` medido 5 s depois de a 1ª espécie criada aparecer, a 2ª e a 3ª não aumentam o número.
  - `reinício`: `docker compose restart api` → as espécies vivas voltam com 3 cada; uma marcada extinta continua extinta, com a mesma data no índice.
  - Ver cada cenário falhar uma vez (`E2E_NEGATE=1`) antes de confiar no verde.
- [ ] **Step 2:** `pnpm e2e` (o do E2) e `pnpm e2e:genesis` → exit 0.
- [ ] **Step 3: Desempenho.** `pnpm api:reset`, `seed_species --count 50 --seed 7`, `restart api` (150 organismos de 50 espécies criadas, mais as de teste até o teto com `ABYSS_FOOD_BOOST=2.0`). `measure.mjs` nas duas GPUs, parado e voando; `step_us_max` do `/api/stats`; `sim_perf_test` com 50 espécies criadas a 250. Para caber na RAM da máquina, medir o cliente sem os clientes de carga e rodar a carga 50+2 (`observers.mjs`) separada (lição do E2).
- [ ] **Step 4: Commit** — `test: e2e da gênese` e `perf: medição com 50 espécies criadas`

### Task 16: Parada 2 e pacote de aceite

**Files:**
- Create: `docs/GATE_S1_ACCEPTANCE.md`

- [ ] **Step 1:** escrever o pacote no formato do `GATE_E2_ACCEPTANCE.md`: os critérios 1–8 do design (§9), cada um com a evidência (teste, captura ou medição) e o status; desvios; pendências para o S2 e para o backlog.
- [ ] **Step 2: Parada 2 com o autor:** o mundo ao vivo, o fluxo completo feito por ele com um e-mail real na caixa local, e o pacote. O critério 8 só fecha com a aprovação explícita dele.
- [ ] **Step 3: Commit** — `docs: aceite do gate S1`
