# Desempenho do S2 — evolução (genomas distintos e ramos)

Medido em 2026-11-14, branch `gate-s2`.

**Mundo medido (cliente):** `mix abyss.reset --yes`, `mix abyss.seed_species --count 50 --seed 7`, API com
`ABYSS_POPULATION=250 ABYSS_TEST_SPECIES=true ABYSS_FOOD_BOOST=2.0 ABYSS_SEED=7 ABYSS_MUTATION_BOOST=8`, **20 min de mundo
antes de medir** (a mutação alta dá muitos genomas distintos; com ela nenhum ramo se firma, `branches_total` 0, e ramos
não fazem parte desta medida). Viewport 1920×1080, preview do build em `localhost:4174`, `measure.mjs --suite s2`
(o s1 com a contagem de genomas distintos e de genomas novos vistos em 2 min).

**Orçamento (o mesmo do S1/E2):** `step_us_max` ≤ 20 ms com 250 organismos; Arc `low` p95 ≤ 33 ms e RTX `high`
p50 ≤ 16,7 ms, parado (floresta) e voando (`?flypath`, percurso).

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `perf.json` | suíte `s2` completa: todos os cenários nas duas GPUs, e a contagem de programas com 2 min de nascimentos e resync forçado. |
| `carga-2026-11-14T16-47-50-872Z.{md,json}` | 1ª carga (50 observadores, 1800 s, sem aquecimento) com o mundo restaurado do banco: **FAIL** na memória (ver abaixo). |
| `carga-2026-11-14T17-19-09-551Z.{md,json}` | 2ª carga (mesma, com `--warmup 600`): **PASS**. É a oficial. |

## Cliente — critérios do orçamento

Janela medida = 2ª volta no percurso e os 10 s depois do aquecimento na floresta, com vsync (60 Hz). "Genomas" =
genomas distintos na aba ao fim do cenário; as criadas vivas são as da aba (o mundo segue rodando; a pressão da
mutação extingue algumas).

| GPU · qualidade | Cenário | Criadas vivas | Genomas | p50 | p95 | > 33 ms | > 50 ms | programas ligados | Critério | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arc · low | floresta (parado) | 35/50 | 228 | 16,7 | 16,7 | 0 | 0 | 0 | p95 ≤ 33 | **PASS** |
| Arc · low | percurso (voando) | 50/50 | 82 | 16,7 | 16,8 | 21 | 17 | 0 | p95 ≤ 33 | **PASS** |
| RTX · high | floresta (parado) | 33/50 | 226 | 16,7 | 16,8 | 0 | 0 | 0 | p50 ≤ 16,7 | **PASS** |
| RTX · high | percurso (voando) | 35/50 | 216 | 16,7 | 16,7 | 0 | 0 | 0 | p50 ≤ 16,7 | **PASS** |

Os dois critérios do orçamento passam (Arc low p95 16,8 ms; RTX high p50 16,7 ms) e a contagem de programas ligados
depois do aquecimento é 0 em todas as janelas. **Um alvo auxiliar do script reprova:** "0 quadros > 50 ms depois do
aquecimento" deu 17, todos na 2ª volta do percurso Arc `low` (21 quadros > 33 ms, máx 150 ms, p95 ainda 16,8). É o
mesmo ponto já registrado no S1 (Arc: rajadas de quadros longos, provável disputa de CPU com Docker/WSL2 e o
Chromium); a mesma volta Arc `high` e todas as da RTX tiveram 0. Registrado, não ajustado.

Informativo (sem vsync, trabalho real da GPU): RTX `high` percurso p50 2,5 / p95 3,8 ms (2ª volta 2,6 / 3,9),
floresta p50 1,9 / p95 2,8; Arc `low` floresta p50 3,1 / p95 10,9; Arc `low` percurso p50 4,4 / p95 18,2 com 14
quadros > 33 ms e 3 tarefas longas na 2ª volta. Outras variantes (Arc `high`, RTX `low`) com vsync: p95 ≤ 16,8 e
0 quadros > 33 ms na 2ª volta.

## Programas de shader

| Mundo | Programas antes | depois de 2 min de nascimentos | resync forçado | Resultado |
| --- | --- | --- | --- | --- |
| 50 criadas + teste, 250 organismos, mutação ×8 (228 genomas distintos na aba, **233 genomas novos vistos em 2 min**) | 23 | 22 (6 nascimentos) | 22 → 22 (250 organismos removidos e remontados) | **PASS** (não cresce) |

Os genomas novos (233, ≥ 100) não criam programas: o desenho de cada organismo usa o mesmo par de shaders, com a
forma e a cor vindas de atributos e uniformes, sem `defines` por genoma. O número oscila de 23 para 22 só pelo
conjunto de materiais de teste na tela, como no S1 (23 e 27).

## Servidor

| Medição | Máximo | Critério ≤ 20 ms |
| --- | --- | --- |
| `sim_perf_test` S2: 3000 ticks, 250 genomas, boost 2.0 | 12,37 ms (média 3,15 ms, p99 6,62 ms) | **PASS** |
| `sim_perf_test` S1: 50 criadas + teste no teto de 250 | 11,00 ms (média 2,70 ms, p99 5,01 ms) | PASS |
| `sim_perf_test` E2: só teste, 250 | 15,49 ms (média 2,43 ms, p99 4,78 ms) | PASS |
| Ao vivo, mundo da medição do cliente (mutação ×8, máximo desde o boot, ~45 min) | 48,28 ms | informativo |
| Ao vivo, carga oficial (mundo com ramos, boot até o fim, 50 observadores) | 12,45 ms no início · 20,58 ms ao fim | informativo |

O `sim_perf_test` (processo sem concorrência, a medida do orçamento) passa com folga com 250 genomas distintos. O
máximo ao vivo de 48 ms do mundo medido é um pico isolado do tempo de boot: vitest e typecheck rodavam na máquina
nos primeiros minutos desse mundo (o `/api/stats` só dá o máximo desde o boot, sem janela). O mundo da carga
oficial ficou em 12,45 ms até o fim do aquecimento e 20,58 ms ao fim (informativo, como no S1).

## Carga 50 observadores com ramos nascendo

Mundo = o banco de dev restaurado (11 espécies criadas vivas, 10 ramos vivos de 34 gravados), `ABYSS_TEST_SPECIES=false`,
`ABYSS_MUTATION_BOOST=1.5`, 250 organismos no teto. `pnpm load --out docs/captures/s2/perf --warmup 600`.

| Critério | Valor | Resultado |
| --- | --- | --- |
| jitter_ms_p99 máximo ≤ 20 ms | 1,78 ms | PASS |
| memória sem tendência de alta | 352,8 vs 338,2 MiB | PASS |
| zero quedas de conexão | 0 | PASS |
| observers = 50 | 50 | PASS |

**Resultado: PASS.** Tamanho do snapshot: 211 297 bytes no início e 240 127 no fim (250 e 211 organismos; as espécies
criadas com vivos subiram de 11 para 15, ou seja, **ramos nasceram durante a medição**: `branches_total` 0 → 7 no
mundo). **Tick médio no fio: 11 421 bytes** (≈ 114 kB/s por observador a 10 Hz); 902 490 ticks sem lacuna; intervalo
entre ticks p50 99,98 ms / p99 108,2 ms; CPU 23 %.

A 1ª tentativa (`carga-…16-47-50…`, sem `--warmup`) deu **FAIL** só na memória (305,8 vs 211,4 MiB): o mundo tinha
acabado de subir do banco com 46 organismos (sem espécies de teste) e encheu até 250 durante a medição, então a
mediana dos primeiros 10 min era de um mundo menor. Os demais critérios passaram (jitter p99 1,64 ms, 0 quedas, tick
médio 7 970 bytes). Repetida com o mundo já no teto, passou.

## O que não foi medido, e por quê

- **Ramos no cliente medido:** com mutação alta (×8) nenhum ramo se firma (`part_p` satura em 1 e `branch_inherited`
  nunca vale); com ×1,5 o primeiro leva ~30 min. A medida de cliente usa genomas distintos, não ramos.
- **Cliente com a carga junto:** não cabe na RAM da máquina; as medidas rodaram separadas, como no S1.
- **Abas reais na carga:** 0 (só os 50 clientes de WebSocket), pela RAM.
