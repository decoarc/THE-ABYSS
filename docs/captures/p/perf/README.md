# Desempenho do gate P (persistência)

Medido em 2026-11-16, branch `gate-p`, no compose de dev (Docker Desktop, Windows 11).

**Mundo medido:** o mundo de referência da Parada 1 (`mix abyss.reset --yes`, `mix abyss.seed_species --count 10
--seed 1`, API com `ABYSS_TEST_SPECIES=false ABYSS_MUTATION_BOOST=1.5`), com ~9 h de mundo, no teto de 250
organismos, 38 a 45 ramos gravados e várias extinções. A fotografia roda a cada 60 s (`snapshot_s` padrão).

**Orçamento (o mesmo do S2):** `step_us_max` ≤ 20 ms no `sim_perf_test`; Arc `low` p95 ≤ 33 ms e RTX `high` p50
≤ 16,7 ms, parado e voando; carga de 50 observadores com jitter p99 ≤ 20 ms. O gate P acrescenta a pergunta: **a
fotografia pesa no tick?**

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `perf.json` | `measure.mjs --suite s2` nas duas GPUs (percurso e floresta) e a contagem de programas de shader. |
| `carga-2026-11-16T22-08-07-357Z.{md,json}` | carga oficial: 50 observadores, 1800 s depois de 120 s de aquecimento. **PASS**. |

## A fotografia no tick

O `/api/stats` ganhou `snapshot_us_max` (o maior tempo gasto pelo processo do mundo numa fotografia: descarregar as
mortes acumuladas, montar o payload e entregá-lo ao `Saver`) e `snapshots` (quantas foram tiradas desde o boot). A
codificação e a escrita no banco rodam fora do processo do mundo, no `Saver`.

| Medição | Valor | Comparação |
| --- | --- | --- |
| `snapshot_us_max`, 1ª fotografia depois do boot | 6,7 ms | tick = 100 ms |
| `snapshot_us_max`, 77 fotografias (~77 min, inclui a carga e a medição do cliente) | 13,2 ms | tick = 100 ms |
| jitter p99 ao vivo, com fotografias a cada 60 s | 1,72 a 1,83 ms | critério ≤ 20 ms |
| fotografia de 255 organismos (teste) | 38,9 kB, encode 3 ms, decode 2 ms | — |

A fotografia é tratada como mensagem própria entre dois ticks; no pior caso ela atrasa o tick seguinte em ~13 ms,
dentro dos 100 ms do período. Na carga, 30 fotografias caíram dentro da janela medida e o jitter p99 máximo ficou em
1,83 ms (o S2, sem fotografia, deu 1,78 ms): **sem pico visível no segundo da fotografia**. Os clientes viram
intervalo entre ticks p50 99,99 ms, p99 104,22 ms, máx 242,52 ms.

## Servidor

| Medição | Máximo | Critério ≤ 20 ms |
| --- | --- | --- |
| `sim_perf_test` S2: 3000 ticks, 250 genomas, boost 2.0 | 11,11 ms (média 3,29 ms, p99 5,90 ms) | **PASS** |
| `sim_perf_test` S1: 50 criadas + teste no teto de 250 | 9,75 ms (média 2,90 ms, p99 5,55 ms) | PASS |
| `sim_perf_test` E2: só teste, 250 | 11,05 ms (média 2,68 ms, p99 5,66 ms) | PASS |
| Ao vivo, logo depois do boot | 21,05 ms | informativo |
| Ao vivo, máximo desde o boot (~77 min, com a medição do cliente na mesma máquina) | 32,33 ms | informativo |

O `sim_perf_test` (processo sem concorrência, a medida do orçamento) passa com folga. O máximo ao vivo é um pico
isolado desde o boot (o `/api/stats` não tem janela), já presente antes da carga e não repetido nela; nesse
intervalo a medição de cliente das duas GPUs rodou na mesma máquina, como no S2 (48 ms).

## Cliente — critérios do orçamento

Viewport 1920×1080, preview do build em `localhost:4174`, com vsync (60 Hz). Janela medida = 2ª volta do percurso e
os 10 s depois do aquecimento na floresta. A aba via ~235 genomas distintos, 34–35 espécies criadas vivas (raízes e
ramos) e 246–250 organismos.

| GPU · qualidade | Cenário | p50 | p95 | > 33 ms | > 50 ms | programas ligados | Critério | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arc · low | floresta (parado) | 16,7 | 16,8 | 0 | 0 | 0 | p95 ≤ 33 | **PASS** |
| Arc · low | percurso (voando) | 16,7 | 16,7 | 0 | 0 | 0 | p95 ≤ 33 | **PASS** |
| RTX · high | floresta (parado) | 16,7 | 16,7 | 0 | 0 | 0 | p50 ≤ 16,7 | **PASS** |
| RTX · high | percurso (voando) | 16,7 | 16,7 | 0 | 0 | 0 | p50 ≤ 16,7 | **PASS** |

Depois do aquecimento: 0 programas ligados e 0 quadros > 50 ms em todas as janelas. A 1ª volta de cada percurso tem
o quadro da compilação inicial (333 a 746 ms, 3 programas), como nos gates anteriores. Arc `high` e RTX `low` com
vsync: p95 ≤ 16,8, 0 quadros > 33 ms na 2ª volta. Sem vsync (informativo): RTX `high` percurso p50 3,2 / p95 5,8,
floresta 2,6 / 3,9; Arc `low` percurso 5,7 / 8,3, floresta 3,8 / 5,8 (1 tarefa longa de 211 ms na floresta).

**Programas de shader:** 249 genomas novos vistos em 2 min de nascimentos (19 nascimentos), programas 21 → 21, e
21 → 21 no resync forçado (248 organismos removidos e remontados). **PASS** (não cresce).

O buscador e a árvore com história não entram no quadro: ficam fechados nas medições (a árvore só monta quando
aberta, e o buscador é um campo HTML).

## Carga 50 observadores

`node scripts/load/observers.mjs --out docs/captures/p/perf --warmup 120`. O aquecimento foi de 120 s (no S2, 600 s)
porque o mundo já estava no teto havia horas; o motivo dos 600 s do S2 era um mundo recém-restaurado enchendo durante
a medição.

| Critério | Valor | Resultado |
| --- | --- | --- |
| jitter_ms_p99 máximo ≤ 20 ms | 1,83 ms | PASS |
| memória sem tendência de alta | 327,9 vs 324,7 MiB | PASS |
| zero quedas de conexão | 0 | PASS |
| observers = 50 | 50 | PASS |

**Resultado: PASS.** 902 003 ticks sem lacuna; tick médio no fio 12 112 bytes; snapshot do fio 265 638 → 270 541
bytes (38 → 39 espécies criadas com vivos: um ramo nasceu durante a medição); CPU 19,6 %.

## O que não foi medido, e por quê

- **Cliente com a carga junto:** não cabe na RAM da máquina (uma 1ª tentativa da carga foi encerrada por falta de
  memória com o Chrome aberto); as medidas rodaram separadas, como no S1 e no S2.
- **Abas reais na carga:** 0 (só os 50 clientes de WebSocket), pela RAM.
