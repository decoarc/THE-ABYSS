# The Abyss — Pacote de aceite do gate E2 (Ecologia)

**Data:** 2026-11-07 · **Branch:** `gate-e` (a partir de `main`, com o E1 já dentro)
**Spec:** `docs/superpowers/specs/2026-11-05-gate-e2-ecologia-design.md` · **Plano:** `docs/superpowers/plans/2026-11-05-gate-e2-ecologia.md`
**Status:** Parada 1 (visual) aprovada pelo autor em 2026-11-06. Critérios 1–8 com evidência abaixo. **Critério 9 (aprovação explícita do autor): pendente — Parada 2.**

## Como ver

1. `pnpm api:up` (API em `localhost:4000`). Padrão: 150 organismos. O teto agora é 250 (`ABYSS_POPULATION`, faixa 5–250).
2. `pnpm build && pnpm preview` e abrir o endereço que o preview indicar.
3. Variações:
   - `?debug=1` expõe `window.__abyss` (usado pelo e2e). Também tem `forceResync()`, só para medição.
   - `?flypath=1` roda o percurso fixo da câmera, usado pela medição de desempenho.
   - `?quality=low` ou `?quality=high` escolhe o preset.
   - `ABYSS_SEED=<inteiro>` fixa o mundo inicial. Exemplo das medições: `ABYSS_SEED=7 ABYSS_POPULATION=250 ABYSS_FOOD_BOOST=2.0 pnpm api:up`.
   - `ABYSS_FOOD_BOOST` (padrão 1) é uma alavanca **só de medição**. Ver desvios.
   - `ABYSS_TEST_SPECIES=false` sobe o mundo só com comida, sem erro (painel e índice vazios).
4. Medição do servidor sem navegador: `mix abyss.eco --seed 7 --minutes 30 [--population 250] [--food-boost K]`. Escreve um CSV por minuto.
5. Estatísticas ao vivo: `GET /api/stats` (inclui nascimentos, mortes por causa, extintas, caças).

## Capturas

| Arquivo | O quê |
|---|---|
| `captures/e2/parada-1/README.md` | Descrição dos momentos, o que parece estranho, tabela de 30 min e a aprovação da Parada 1 |
| `captures/e2/parada-1/a-predacao.png` | Predação: Filamento ao lado de uma Célula; a presa some do roster |
| `captures/e2/parada-1/b-morte-0..2.png` | Morte por fome: fantasma que se dissolve em pontos |
| `captures/e2/parada-1/c-divisao-0,2,3.png` | Divisão: pai alongado, depois pai e filho jovem |
| `captures/e2/parada-1/d-amadurece-0..3.png` | Jovem virando adulto (Membrana) |
| `captures/e2/parada-1/e-brilhos.png` | Energias diferentes lado a lado (Cascos, de 0,08 a 0,92) |
| `captures/e2/parada-1/f-vista-de-cima-*.png` | Três vistas a 16 de altura (Jardim, Floresta, Planície) e uma oblíqua |
| `captures/e2/parada-1/g-poliedro-0,1.png` | Poliedro de perto |
| `captures/e2/parada-1/eco-seed7-30min.csv` | `mix abyss.eco`, seed 7, 150 org., 30 min, uma linha por minuto |
| `captures/e2/parada-2/perf.json` | Desempenho no teto (250), parado e voando, duas GPUs |
| `captures/e2/parada-2/carga-oficial.md` / `.json` | Carga oficial: 50 clientes + 2 abas reais, no teto |

Os vídeos `.webm` ficam fora do git, em `THE-ABYSS-capturas/e2/parada-1/` (pasta irmã do repositório): `sessao-completa.webm` (143 s, momentos a–d; 43,8 MB), `e-brilhos.webm`, `f-vista-de-cima.webm`, `g-poliedro.webm`.

## Critérios (design §8)

| # | Critério | Situação e evidência |
|---|---|---|
| 1 | O autor reconhece a cadeia no mundo de teste | Atendido pelo autor na Parada 1 (2026-11-06, "pode considerar aprovado"). Evidência: distribuição por região (README da Parada 1: Planície só com Membrana e Poliedro; Jardim com as cinco; Floresta com Célula, Filamento, Casco e Poliedro) e tabela de 30 min (seed 7: 632 nascimentos; mortes: 202 fome, 177 predação, 184 velhice). O autor confirma de novo ao vivo na Parada 2 |
| 2 | Cada momento do ciclo aparece na tela e foi aprovado numa parada visual | Atendido: Parada 1 aprovou caça, morte virando pontos, divisão com jovem, crescimento e brilho de fome. Evidência: `captures/e2/parada-1/a` a `g` e os vídeos. Decisões do autor em "Aceite do autor" |
| 3 | Extinção: aparece como extinta, com data, em todas as abas, e não volta | Atendido nos testes: `sim_test` "extinção é permanente" e "espécie inventada"; painel/índice (`SpeciesIndex.test.tsx`) mostram "extinta · data" sem expandir; e2e "duas abas concordam depois de 120 s" confere extintas iguais. Evidência ao vivo: no experimento de 30 min com `ABYSS_FOOD_BOOST=2.0` a Célula e o Filamento se extinguem (task 11, tabela por minuto). Sem evidência: captura de tela do índice com uma espécie extinta (o CSV não tem coluna de extinção) |
| 4 | Painel mostra os campos novos; seguir quem morre não quebra | Atendido: painel com Espécie, Fase, Energia, Geração, Come, Nasceu de, Surgiu, Posição (`InspectPanel.test.tsx`, Task 9). e2e "seguir quem morre": CEL-0025 seguida até morrer, sem erro de console, painel fecha e o Seguir é liberado. Sem evidência: captura de tela do painel novo |
| 5 | Duas abas concordam sobre vivos, nascimentos, mortes e extinções (e2e) | Atendido: `pnpm e2e` 7/7. Após 120 s (tick 1591): ids vivos 188 = 188, extintos iguais, geração e pai iguais em 10 ids. Com `E2E_NEGATE=1` o script sai com código 1 e `2/7` (as asserções novas falham, como deveriam) |
| 6 | Mesma semente, mesmo resultado nas medições do servidor | Atendido: `eco_run_test` "mesma semente, mesmo resultado" e `sim_test` "é determinístico pela seed". O `sim_perf_test` dá sempre os mesmos números ecológicos (11 nascimentos, 13 mortes, 3 caças) |
| 7 | Desempenho dentro do orçamento do E1 com 250, parado e voando; carga com observadores | Atendido: ver "Desempenho" e "Carga medida". O mundo ficou em 242–250 organismos em todas as janelas (meta ≥ 240), com a alavanca de medição |
| 8 | Nada de regra amarrada a nome de espécie | Atendido: teste "espécie inventada" (`sim_test`), com tabela injetada só de valores (`Sim.new` aceita a tabela); revisões das tarefas 1–5 sem regra por nome. Sem evidência: busca automática por nomes de espécie no código (a conferência foi por revisão) |
| 9 | **Aprovação explícita do autor** | **Pendente — Parada 2** |

Testes: API 126 passam na tarefa 6 (`pnpm api:test`); web 241 passam na tarefa 9 (`pnpm test`); e2e 7/7. Sem evidência: contagem final da suíte inteira depois da última tarefa (as contagens acima são as dos relatórios das tarefas).

## Ciclo de vida (resumo do que existe)

Energia, fases jovem/adulto, divisão com filho jovem, teto de proteção de 250, morte por fome e por velhice, predação pelo porte, fuga para o abrigo, caçador que desiste e ignora a presa por um tempo, extinção permanente, e as mensagens de nascimento, morte e extinção no fio. No cliente: brilho pela energia, jovem menor, alongamento antes de dividir, desfazer ao morrer (`alphaHash`), painel e índice.

## Tabela do `abyss.eco`

**Parada 1** (seed 7, 150 org., valores da calibração `49ab101`, 30 min), `captures/e2/parada-1/eco-seed7-30min.csv`:

| Minuto | Casco | Célula | Filamento | Membrana | Poliedro |
|---|---|---|---|---|---|
| 10 | 44 | 28 | 16 | 34 | 25 |
| 20 | 38 | 64 | 21 | 34 | 20 |
| 30 | 36 | 126 | 26 | 27 | 4 |

Totais: 632 nascimentos; mortes por fome 202, predação 177, velhice 184. O equilíbrio não é aceite: o Poliedro cai de 30 para 4, a Célula passa de 126.

**Teto** (seed 7, 250 fundadores, `ABYSS_FOOD_BOOST=2.0`, 30 min; relatório da tarefa 11). Total ≥ 245 o tempo todo. Células e Filamentos somem por volta dos minutos 10–21; a Membrana domina.

| Minuto | Total | Casco | Célula | Filamento | Membrana | Poliedro |
|---|---|---|---|---|---|---|
| 5 | 250 | 47 | 40 | 50 | 63 | 50 |
| 10 | 250 | 77 | 1 | 7 | 113 | 52 |
| 20 | 250 | 41 | 1 | 0 | 163 | 45 |
| 30 | 246 | 64 | 0 | 0 | 176 | 6 |

Sem a alavanca (k = 1.0) a população cai de 250 para 114 em 30 min. A tabela completa por minuto está em `.superpowers/sdd/2026-11-05-gate-e2-ecologia/task-11-report.md`.

## Desempenho

Dados: [perf.json](captures/e2/parada-2/perf.json), gerados por `scripts/perf/measure.mjs --suite e2`. 1920×1080, vsync, volta 2 do percurso e Floresta parada. `ABYSS_SEED=7`, 250 organismos, `ABYSS_FOOD_BOOST=2.0`. Commit `4f287fb`.

| Cenário | p50 / p95 (ms) | Quadros > 33 / > 50 | Programas ligados | População mín.–máx. |
|---|---|---|---|---|
| Arc low, voando | 16,7 / 16,8 | 0 / 0 | 0 | 245–250 |
| Arc high, voando | 16,7 / 16,7 | 0 / 0 | 0 | 244–250 |
| RTX low, voando | 16,7 / 16,7 | 0 / 0 | 0 | 244–250 |
| RTX high, voando | 16,7 / 16,8 | 0 / 0 | 0 | 244–250 |
| Arc low, parada | 16,7 / 16,7 | 0 / 0 | 0 | 246–250 |
| Arc high, parada | 16,7 / 16,7 | 0 / 0 | 0 | 246–248 |
| RTX low, parada | 16,7 / 16,7 | 0 / 0 | 0 | 246–249 |
| RTX high, parada | 16,7 / 16,7 | 0 / 0 | 0 | 247–250 |

Orçamento: **Arc `low` p95 ≤ 33 ms: PASS (pior 16,8)**. **RTX `high` p50 ≤ 16,7 ms: PASS (16,7)**. 0 programas ligados e 0 quadros > 50 ms depois do aquecimento: PASS.

Programas de shader (RTX high, voando): 2 min de percurso com 18 nascimentos, 23 → 23 programas. Não cresceu. Resync forçado de 246 organismos: 23 → 21 programas, sem crescimento.

**Servidor:** `sim_perf_test` com 250 adultos maduros no teto, 3000 passos, com nascimentos, mortes e caças (> 0). Máximo do passo de 6,5 a 10,8 ms em 5 execuções (orçamento 20 ms); 18,2 ms numa corrida dentro da suíte completa. Média 2,3–2,5 ms.

## Carga medida

Rodada oficial: 50 clientes Phoenix + 2 abas reais renderizando, 250 organismos (população 242–250), 1800 s depois de 600 s de aquecimento, seed 7, `ABYSS_FOOD_BOOST=2.0`. Relatório: [carga-oficial.md](captures/e2/parada-2/carga-oficial.md). Amostras brutas: `carga-oficial.json`.

| Medida | Valor |
|---|---|
| Ticks recebidos / lacunas | 902 125 / 0 |
| Quedas de conexão / erros de join | 0 / 0 |
| Intervalo entre ticks no cliente | p50 99,99 ms · p99 104,13 ms · máx 287,13 ms |
| `jitter_ms_p99` do servidor (máximo) | 1,826 ms (limite 20 ms) |
| Memória do contêiner | 227,3 MiB vs. 214,7 MiB na mediana dos 10 primeiros min (limite +10%) |
| CPU (última amostra) | 29,82 % |
| Observers | 52 |
| Tamanho médio de um tick no fio | 12 136 bytes (E1: 6415 com 150) |
| Consumo na medição | 1041 mordidas na flora · 4703 partículas comidas |

Os 4 critérios passaram (resultado PASS).

## Desvios em relação ao plano

- **`ABYSS_FOOD_BOOST=2.0` é alavanca só de medição** (`be8f1f1`). Divide `flora_grow_s` por k e multiplica a taxa e o teto de partículas por k. Com k = 1 o mapa é idêntico. Serve para segurar o mundo no teto de 250, porque a comida é o único freio. Com k = 1 a população cai para ~114 em 30 min. Equilíbrio não é aceite. O padrão do produto continua 1.
- **`step_us_max` ao vivo teve picos de até 158 ms** (carga oficial: 10,23 ms no aquecimento, 158,31 ms no fim). Diagnóstico da tarefa 11: pausas de agendamento do host (a VM Docker/WSL2 no Windows perde a CPU por dezenas de ms). As reduções do passo não crescem, o GC é pequeno, e as mesmas pausas atingem canais e sockets. Sem clientes o máximo foi 9,5 ms. Nenhum tick atrasou (jitter p99 1,8 ms). A garantia do orçamento de 20 ms é o `sim_perf_test` determinístico. Nenhuma mudança de código.
- **Resync total religa 3 programas de shader uma vez**, num único quadro de ~50 ms. A contagem de programas não cresce. É o pior caso sintético (todos desmontam de uma vez). Numa aba real que volta, só a diferença remonta.
- **Arc sem vsync (informativo, fora do orçamento):** um quadro de 8270 ms e 15 quadros > 50 ms voando. Não investigado. Com vsync, que é o caso do visitante, não aparece.
- **Primeira volta do percurso** compila os 8 programas iniciais (quadro de ~450 ms), como no E1.
- **Tick no fio de 12 136 B a 250** (E1: 6415 a 150). Nota para o gate P.
- **Broadcast leva ~20 ms por tick com 52 clientes**, dentro do processo do mundo e fora do `step_us_max`. Maior custo por tick do processo. Nota para o gate P.
- **Calibração inicial (`49ab101`)**: com os valores iniciais o mundo morria de fome em 15 min. Ajustaram-se só valores das espécies de teste e do bloco `:ecology` (`divide_s` 2 → 8, `flora_grow_s` 90 → 180). Permitido pelo design §9.
- **Rulings do controlador** (ver `progress.md`): `ABYSS_POPULATION` 5..250 (R1) e o teste "5..400" virou "5..pop_cap" (R2); `Abyss.Eco` em `lib/abyss/eco.ex` (R3); `WorldStore.juvenileScale()` (R4); adulto retido pelo teto não gasta energia no passo em que é retido; o puxão para o abrigo só vale fora da região com cobertura; caçador que desiste ignora aquela presa por `give_up_s`; o snapshot leva `divide_s` e o cliente o usa no alongamento; desfazer com `alphaHash` e fantasma que congela escala e alongamento do instante da morte.
- **Gancho de debug** `window.__abyss.forceResync()` só com `?debug=1`. Nenhum comportamento de produto muda.
- **Mortes de fantasma e caça**: a presa predada some do roster sem fantasma; morte por fome ou velhice vira fantasma que se desfaz.

Itens menores diferidos estão listados no ledger (`progress.md`, linhas "minor (deferred)"). Os que importam: presa foge também de caçador saciado; `ABYSS_FOOD_BOOST` não numérico dá `MatchError` pouco amigável; sem teto de câmera maior que y=16 não há uma vista única das três regiões.

## Aceite do autor

- **Parada 1** (visual, 2026-11-06): aprovada ("pode considerar aprovado"), sem ajuste de valores. Decisões:
  1. Poliedro fica como está; pode se extinguir. Equilíbrio não é critério de aceite.
  2. `divide_s` continua 8 s.
  3. Brilho da energia fica como está.
  4. Desfazer na morte aprovado como está.
  5. Abrigo da Floresta: `cover` continua 0,5 (valor conforme o README da Parada 1; não conferi o JSON do mapa).
- **Parada 2** (mundo ao vivo + este pacote): **pendente.**

**Aceite do autor:** gate E2 — pendente — Parada 2.
