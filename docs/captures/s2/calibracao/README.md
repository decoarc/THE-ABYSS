# Calibração do gate S2: equilíbrio e ritmo da evolução

Task 8. Fizemos três rodadas formais, partindo da melhor variante exploratória. Os valores commitados são os da **rodada 3**. Ela cumpre as metas 1, 3 e 5 e falha por pouco nas metas 2 e 4. Veja "Pendências para o autor".

## Comandos e sementes

Mundo de referência (CLI real, sem as espécies de teste):

```
docker compose -f infra/compose/compose.yaml run --rm api \
  mix abyss.eco --seed S --minutes 90 --genesis 10 --no-test-species   # S = 1..5
docker compose -f infra/compose/compose.yaml run --rm api \
  mix abyss.eco --seed S --minutes 90 --genesis 50 --no-test-species   # S = 1..3 (meta 5)
```

As corridas de cada rodada rodaram com um container por vez, depois de checar a memória, sem corridas simultâneas. Os CSVs ficaram fora do repositório. As colunas usadas são estas:
- `branches_total`: o primeiro minuto com valor > 0 é o 1º ramo.
- `trees_alive`: lida no minuto 60.
- `predators`: vivos de dieta predadora pelo genoma, no minuto 60.
- `pop_<raiz>` ÷ `alive`: lida no minuto 90, dá a maior árvore.

## Metas

1. 1º ramo: mediana entre 30 e 60 min, e nenhuma semente sem ramo até 90.
2. Minuto 60: mediana ≥ 6 de 10 árvores com algum vivo.
3. Predador vivo no minuto 60 em ≥ 3 de 5 sementes.
4. Nenhuma árvore acima de 60% da população no minuto 90, em mais de 1 semente.
5. `--genesis 50`, sementes 1–3: algum ramo em cada uma.

## Antes (valores do commit 467fa8d)

| semente | 1º ramo (min) | ramos@90 | árvores vivas @60 | predadores @60 | maior árvore @90 | vivos @30/60/90 |
|---|---|---|---|---|---|---|
| 1 | 78 | 1 | 1 | 0 | sp5 100% | 51/181/227 |
| 2 | 88 | 1 | 4 | 0 | sp5 56% | 196/197/232 |
| 3 | 61 | 7 | 2 | 0 | sp1 98% | 178/227/249 |
| 4 | — | 0 | 2 | 0 | sp7 71% | 215/232/248 |
| 5 | 87 | 1 | 2 | 0 | sp2 77% | 59/112/208 |

`--genesis 50`: s1 0 ramos, s2 2 ramos (1º no min 53), s3 0 ramos.

| meta | resultado |
|---|---|
| 1 | mediana 87, 1 semente sem ramo: FALHA |
| 2 | mediana 2: FALHA |
| 3 | 0/5: FALHA |
| 4 | 4 sementes: FALHA |
| 5 | 1 de 3: FALHA |

## Exploração (antes das rodadas)

A exploração rodou em processo, com sobrescritas do catálogo e da config, sem mudar nada no repositório. Ela apontou três alavancas:
- **Deriva configurável.** `@drift_weight` (fixo em 0,15 no `sim.ex`) passou para `:ecology` como `drift_weight`, com padrão 0,15 se a chave faltar. Com 0,8, quem nasce longe da comida da sua dieta chega a ela antes de morrer.
- **Vida que cresce menos com o raio.** `adult_life_s` [1500, 300] no lugar de [500, 400], e `per_radius2` menor. Isso tira a vantagem das espécies de raio 1,6, que tomavam o teto de 250.
- **Predador que vê e aguenta.** A mandíbula ganha `effect.perception`, e `hunt_below` sobe.

## Rodada 1

Valores mudados (de → para):
- Catálogo, metabolismo:
  - `metabolism.base` 0,04 → 0,02
  - `metabolism.per_radius2` 0,06 → 0,04
  - `metab` das peças × 0,5: raspador e filtro 0,005, flagelo 0,010, cílios 0,0075, aleta 0,005, ocelo 0,005, cardume e gancho 0,0025, placa 0,0075
  - mandíbula `metab` 0,010 → 0,0 (não negativo)
- Catálogo, mandíbula: `effect.perception` 5,0 (novo)
- Catálogo, base: `energy_max` 100 → 150 e `max_speed` 0,15 → 0,25
- Catálogo, vida e mutação: `life.adult_life_s` [500, 400] → [1500, 300] e `mutation.part_p` 0,06 → 0,3
- `:food`: `flora_grow_s` 180 → 600 e `particle_rate` 2,0 → 3,0
- `:ecology`, caça: `prey_base` 25 → 50 e `hunt_below` 0,7 → 0,95
- `:ecology`, deriva: `drift_weight` 0,15 → 0,8
- `:ecology`, ramos: `branch_min` 5 → 4 e `branch_inherited` 3 → 2

| semente | 1º ramo (min) | ramos@90 | árvores vivas @60 | predadores @60 | maior árvore @90 | vivos @30/60/90 |
|---|---|---|---|---|---|---|
| 1 | 35 | 9 | 5 | 44 | sp1 40% | 144/210/169 |
| 2 | 26 | 3 | 6 | 0 | sp1 33% | 197/250/249 |
| 3 | 25 | 5 | 4 | 0 | sp2 55% | 137/189/247 |
| 4 | 37 | 4 | 6 | 0 | sp7 54% | 235/250/248 |
| 5 | 27 | 17 | 3 | 13 | sp10 52% | 213/107/249 |

| meta | resultado |
|---|---|
| 1 | mediana 27, todas com ramo: FALHA (cedo demais) |
| 2 | mediana 5: FALHA |
| 3 | 2/5: FALHA |
| 4 | 0 sementes: OK |

Os predadores morrem de fome entre os minutos 10 e 15. Eles perseguem a `max_speed × burst`, e com `swim_cost` 1,5 o gasto chega a ~10× o metabolismo.

## Rodada 2

Mudanças sobre a rodada 1:
- `mutation.part_p` 0,3 → 0,22
- mandíbula `effect.perception` 5,0 → 6,0
- `swim_cost` 1,5 → 0,8
- `give_up_s` 15 → 10

| semente | 1º ramo (min) | ramos@90 | árvores vivas @60 | predadores @60 | maior árvore @90 | vivos @30/60/90 |
|---|---|---|---|---|---|---|
| 1 | 45 | 7 | 1 | 0 | sp3 100% | 5/103/131 |
| 2 | 49 | 1 | 6 | 2 | sp1 37% | 250/249/250 |
| 3 | — | 0 | 6 | 1 | sp2 59% | 203/250/248 |
| 4 | 72 | 3 | 7 | 0 | sp7 55% | 249/248/250 |
| 5 | 25 | 5 | 4 | 0 | sp3 46% | 178/248/250 |

| meta | resultado |
|---|---|
| 1 | mediana 49, 1 semente sem ramo: FALHA |
| 2 | mediana 6: OK |
| 3 | 2/5: FALHA |
| 4 | 1 semente: OK |

Na semente 1, os predadores comem quase tudo até o minuto 30 (boom-bust).

## Rodada 3 (valores finais, commitados)

Mudanças sobre a rodada 2:
- `mutation.part_p` 0,22 → 0,27
- `prey_base` 50 → 80
- `prey_yield` 0,5 → 0,8

| semente | 1º ramo (min) | ramos@90 | árvores vivas @60 | predadores @60 | maior árvore @90 | vivos @30/60/90 |
|---|---|---|---|---|---|---|
| 1 | 66 | 4 | 1 | 1 | sp2 100% | 16/132/248 |
| 2 | 11 | 6 | 7 | 19 | sp1 42% | 249/249/250 |
| 3 | 33 | 7 | 6 | 2 | sp2 37% | 176/249/249 |
| 4 | 64 | 4 | 5 | 1 | sp7 47% | 249/250/247 |
| 5 | 50 | 3 | 3 | 25 | sp3 60,2% (150/249) | 154/249/249 |

`--genesis 50`:
- s1: 8 ramos, 1º no min 35, 10 árvores vivas
- s2: 1 ramo, 1º no min 69, 19 árvores vivas
- s3: 12 ramos, 1º no min 17, 7 árvores vivas

| meta | antes | rodada 3 |
|---|---|---|
| 1 | mediana 87, 1 sem ramo | mediana 50, todas com ramo: **OK** |
| 2 | mediana 2 | mediana 5: FALHA (alvo 6) |
| 3 | 0/5 | 5/5: **OK** |
| 4 | 4 sementes | 2 sementes (s1 100% depois de boom-bust; s5 60,2%): FALHA |
| 5 | 1 de 3 | 3 de 3: **OK** |

A rodada 3 ficou como final. Ela melhora todas as metas em relação ao "antes" e cumpre as três de evolução e predação (1, 3, 5). A rodada 2 cumpria a 2 e a 4, mas perdia a 1 e a 3.

## Pendências para o autor

- **Semente 1 em boom-bust.** Os predadores comem quase todas as presas até o minuto 30, e a árvore que sobra volta sozinha (100% no minuto 90). Mais ganho por presa resolve a meta 3 e piora esse caso.
- **Predador pequeno só come juvenil.** `Hunt.can_eat?` exige `prey_r < hunter_r`. Como muitas criadas têm raio 1,6, um predador de raio ~0,6 só tem presa entre os jovens (`juvenile_scale` 0,45). A maior parte das extinções até o minuto 25 é desses predadores. Mudar a regra de porte é mecânica, não número.
- **Fundadoras sorteadas sem relação com a dieta** (decisão do S1). A deriva 0,8 compensa em parte. A meta 2 oscila entre 5 e 6 conforme a rodada.

## Testes e fixtures

- O catálogo mudou: as `traits` das fixtures válidas em `shared/genesis/fixtures/blueprints.json` foram regeradas com `Traits.species` no catálogo novo (9 entradas).
- Testes que fixavam números da calibração passaram a ler o catálogo ou a config:
  - `traits_test`: `max_speed`, `energy_max`
  - `life_test`: `1 + swim_cost`
  - `flora_test`: passo de `flora_grow_s / 15`
  - `sim_test`: ganho limitado a `energy_max`, e caçador cheio a 100
- Outros testes fixam o próprio número, porque medem a regra e não a calibração:
  - `mutation_test`: `part_p` 0,06
  - `branching_test`: limiar 5/3
  - `eco_run_test`: `--mutation-boost` 1,5. Com o `part_p` novo, o reforço 12 satura em 1 e nenhum filho nasce sem mutação.
- `pnpm api:test`: 266 passed. `pnpm test`: 320 passed. `pnpm typecheck`: exit 0.
- `sim_perf_test` dentro do orçamento:
  - S2: média 3,4 ms, p99 6,2 ms
  - E2: média 2,7 ms, p99 5,2 ms
  - S1: média 3,3 ms, p99 6,7 ms

## Parada 1: mandíbula com `effect.perception` 6,0 → 5,0

Ajuste do autor: com 6,0 o predador (base 4,0 + 6,0) saturava o teto de percepção 10 e o ocelo não servia a ele. Com 5,0, o ocelo volta a valer. Só o catálogo mudou (e `traits.perception` da fixture "mandibula": 10,0 → 9,0). Mesmas sementes e opções da rodada 3 (`--genesis 10 --no-test-species`, sementes 1–5).

| semente | 1º ramo (min) | ramos@90 | árvores vivas @60 | predadores @60 | maior árvore @90 |
|---|---|---|---|---|---|
| 1 | 54 | 8 | 1 | 0 | sp3 100% |
| 2 | 22 | 4 | 8 | 4 | sp1 34,3% |
| 3 | 19 | 7 | 5 | 0 | sp10 42,4% |
| 4 | 19 | 4 | 5 | 3 | sp7 47,2% |
| 5 | 32 | 13 | 3 | 23 | sp6 52,0% |

| meta | rodada 3 (6,0) | com 5,0 |
|---|---|---|
| 1 | mediana 50 | mediana 22 (abaixo da faixa 30–60), todas com ramo |
| 2 | mediana 5 | mediana 5 |
| 3 | 5/5 | 3/5 (cumpre o piso do plano, ≥ 3/5) |
| 4 | 2 sementes | 1 semente (s1 100%, boom-bust) |

O autor aceitou este resultado na Parada 1, em 2026-11-14.
