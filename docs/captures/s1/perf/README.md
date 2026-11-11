# Desempenho do S1 — 50 espécies criadas

Medido em 2026-11-10 (cliente, carga) e 2026-11-11 (`sim_perf_test`), na branch `gate-s`.

**Mundo medido:** `pnpm api:reset`, `mix abyss.seed_species --count 50 --seed 7`, reinício da API com
`ABYSS_FOOD_BOOST=2.0`: 150 fundadoras de 50 espécies criadas diferentes mais as espécies de teste até o
teto de 250. Viewport 1920×1080, `ABYSS_SEED=7`, preview do build (`localhost:4174`).

**Orçamento (o mesmo do E2):** servidor `step_us_max` ≤ 20 ms com 250 organismos; cliente Arc `low`
p95 ≤ 33 ms e RTX `high` p50 ≤ 16,7 ms, parado (floresta) e voando (`?flypath`, percurso).

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `perf.json` | suíte `s1` completa (`measure.mjs --suite s1`): todos os cenários nas duas GPUs e a contagem de programas com nascimentos e resync. Rodou depois de ~27 min de mundo, com parte das criadas já extinta (25–39 vivas por cenário). |
| `vivas-50/floresta-{arc,rtx}/perf.json` | floresta (parado) logo depois do seed: as 50 criadas vivas, 150 organismos delas na aba. |
| `vivas-50/percurso-{arc,rtx}/perf.json` | percurso (voando), rodado em seguida (`--only`). Cada percurso leva ~3 min; ao fim dele 28–44 criadas ainda tinham vivos. |
| `programs-sem-criadas.json` | contagem de programas no mesmo cliente com o mundo só de teste (`--programs-only`, `PROGRAMS_LABEL=sem-criadas`). |
| `carga-2026-11-10T23-30-55-538Z.{md,json}` | carga 50 observadores + 2 abas (`observers.mjs`), rodada separada do cliente medido. |

## Cliente — critérios do orçamento

Janela medida = 2ª volta no percurso (a 1ª inclui o aquecimento: ligação dos programas e o quadro de
~600 ms da primeira compilação) e os 10 s depois do aquecimento na floresta. Com vsync (60 Hz).

| GPU · qualidade | Cenário | Fonte | Criadas vivas na aba | p50 | p95 | > 33 ms | tarefas longas | programas ligados | Critério | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arc · low | floresta (parado) | vivas-50 | 50/50 | 16,7 | 16,7 | 0 | 0 | 0 | p95 ≤ 33 | **PASS** |
| Arc · low | percurso (voando) | vivas-50 | 44/50 | 16,7 | 16,7 | 1 | 0 | 0 | p95 ≤ 33 | **PASS** |
| RTX · high | floresta (parado) | vivas-50 | 50/50 | 16,7 | 16,7 | 0 | 0 | 0 | p50 ≤ 16,7 | **PASS** |
| RTX · high | percurso (voando) | vivas-50 | 34/50 | 16,7 | 16,7 | 0 | 0 | 0 | p50 ≤ 16,7 | **PASS** |
| Arc · low | floresta | perf.json | 25/50 | 16,7 | 16,7 | 0 | 0 | 0 | p95 ≤ 33 | **PASS** |
| Arc · low | percurso | perf.json | 39/50 | 16,7 | 16,7 | 9 | 1 (83 ms) | 0 | p95 ≤ 33 | **PASS** |
| RTX · high | floresta | perf.json | 25/50 | 16,7 | 16,7 | 0 | 0 | 0 | p50 ≤ 16,7 | **PASS** |
| RTX · high | percurso | perf.json | 29/50 | 16,7 | 16,7 | 0 | 0 | 0 | p50 ≤ 16,7 | **PASS** |

Informativo (fora do orçamento), da suíte completa: Arc `high` percurso p95 16,8 (0 > 50 ms);
RTX `low` floresta teve 1 quadro de 66,7 ms com 2 programas ligados aos 7,2 s (um programa que ainda não
tinha aparecido no aquecimento); Arc `low` percurso 2ª volta teve 1 quadro de 66,7 ms (com vsync).

Sem vsync (só para ver a folga): RTX `high` percurso p50 5,8 / p95 8,1 ms; Arc `low` floresta p50 7,2 /
p95 11,1 ms; Arc `low` percurso p50 8,8 / p95 17,2 ms na 2ª volta, com 124 quadros > 33 ms e 77 tarefas
longas em rajadas (25–31 s, 47–50 s, 86 s). As rajadas não aparecem com vsync nem na RTX; na suíte
completa a mesma volta teve p95 13,2 e 14 quadros > 33 ms. Fica registrado como ponto a olhar na Arc
(provável disputa de CPU com o Docker/WSL2 e o próprio Chromium, como no E2), não como falha do critério.

**Meta "50 espécies criadas vivas juntas":** atendida nos cenários parados (50/50 vivas e 150 organismos
delas na aba). Nos percursos o critério auxiliar `≥ 50 vivas em cada cenário` do script marca FAIL só
porque o mundo segue rodando: criadas sem presa ou comida suficiente se extinguem durante os ~3 min de
cada percurso (44 e 34 no fim). Não é custo de desenho: a floresta, com as 50, teve os mesmos números.

## Programas de shader

| Mundo | Programas antes | depois de 2 min de nascimentos | resync forçado | Resultado |
| --- | --- | --- | --- | --- |
| só teste (5 espécies, 0 criadas, 247 organismos) | 27 | 27 (5 nascimentos) | 27 → 27 | não cresce |
| 50 criadas + teste (55 espécies, 25 criadas vivas, 249 organismos) | 23 | 23 (23 nascimentos) | 23 → 23 | **PASS** |

Com 50 espécies criadas diferentes o cliente tem **menos** programas que o mundo só de teste (23 vs 27): o
número depende de quais materiais de teste estão na tela, não de quantas espécies criadas existem — as
criadas usam um só par de shaders, sem `defines` por espécie. O e2e `programas não crescem por espécie`
confirma o mesmo pela tela (a 2ª e a 3ª criadas não aumentam o número).

## Servidor — `step_us_max`

| Medição | Máximo | Critério ≤ 20 ms |
| --- | --- | --- |
| `sim_perf_test` S1: 3000 ticks, 50 criadas (150 fundadoras) + teste no teto de 250, boost 2.0 | 12,66 ms (média 2,45 ms, p99 4,82 ms) | **PASS** |
| `sim_perf_test` E2 (só teste, 250), mesma rodada | 10,45 ms (média 2,14 ms, p99 4,04 ms) | PASS |
| Ao vivo, carga 50+2 (máximo desde o boot) | 11,48 ms no fim do aquecimento · 19,70 ms aos 86 s · **24,73 ms** aos 406 s | informativo |
| Ao vivo, durante a medição do cliente (máximo desde o boot, ~27 min) | **35,16 ms** | informativo |

O `sim_perf_test` (a medida que o orçamento usa, num processo sem concorrência) passa com folga: 12,7 ms
com 50 espécies criadas. Os números ao vivo são o pior passo desde o boot em Docker/WSL2 dividindo a CPU
com o Chromium medindo (35 ms) ou com 52 clientes (24,7 ms) — um pico isolado, não uma tendência: o
intervalo entre ticks dos clientes ficou em p50 99,99 ms / p99 117,8 ms, sem nenhum tick perdido. O E2
teve o mesmo tipo de pico ao vivo (158 ms na carga oficial). Ficam acima de 20 ms e são registrados assim.

No mesmo teste, a população nunca passou de 250: antes do fix `d57e75b` as fundadoras pendentes não
contavam na vaga das divisões e o mundo chegava a 251.

## Carga 50 + 2

`observers.mjs`: 50 clientes de WebSocket + 2 abas reais, 600 s de aquecimento e 1800 s medidos, sem o
cliente medido rodando junto (para caber na RAM). **PASS** em todos os critérios: jitter p99 máximo
1,8 ms (≤ 20), memória 278,6 MiB vs 261,7 MiB de mediana (sem tendência), 0 quedas, 52 observadores.
Tick médio no fio 12,1 kB; snapshot 141,7 kB; 902 450 ticks sem lacuna. No snapshot havia 33 criadas
com vivos no início e 20 no fim (as outras já extintas: o mundo seguia rodando desde o seed, e a carga
começou depois da medição do cliente).

## O que não foi medido, e por quê

- **Cliente com a carga junto:** não cabe na RAM da máquina (lição do E2); as duas medidas rodaram separadas.
- **Percurso com as 50 vivas do começo ao fim:** o mundo não para; criadas se extinguem durante os
  ~3 min de percurso. A floresta (parada) é a medida com as 50 vivas.
- **`step_us_max` ao vivo isolado:** o `/api/stats` só dá o máximo desde o boot; não há janela por
  medição. O critério de 20 ms foi verificado no `sim_perf_test`.
- **Vídeos:** não vão para o repositório.
