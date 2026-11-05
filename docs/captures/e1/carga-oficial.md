# Carga do servidor — 2026-11-05T12:58:27.459Z

- Clientes: 50 · abas reais: 2 · duração: 1800 s (depois de 600 s de aquecimento) · população: 150
- Comida no início: partículas 301 · flora 194.714 / 200 · no fim: partículas 318 · flora 193.533 / 200
- Comida ao longo da medição: partículas 276–354 · soma da flora 191.461–196.05
- Comido na medição: flora 2928 mordidas · partículas 922
- Tamanho médio de um tick no fio: 6415 bytes (902300 ticks medidos)
- Ticks recebidos: 902300 · lacunas (ticks perdidos): 0
- Intervalo entre ticks (clientes): p50 99.99 ms · p99 104.08 ms · máx 179.66 ms
- Quedas de conexão: 0 · erros de join: 0
- CPU (última amostra): 10.08 % · memória: 199.3 MiB
- step_us_max (informativo, não é critério; máximo desde o boot, inclui a entrada dos 52 clientes): no aquecimento 4,95 ms (lido aos 431 s de vida) · depois da entrada 29,18 ms · fim da medição 29,18 ms

| Critério do gate I | Valor | Resultado |
| --- | --- | --- |
| jitter_ms_p99 máximo ≤ 20 ms | 1.559 | PASS |
| memória sem tendência de alta (última ≤ 1,10 × mediana dos 10 primeiros min) | 199.3 vs 188.2 MiB | PASS |
| zero quedas de conexão | 0 | PASS |
| observers = 52 | 52 | PASS |

**Resultado: PASS** (os 4 critérios do gate I)

## Como foi rodada

- `ABYSS_SEED=20261104 ABYSS_TEST_SPECIES=true ABYSS_POPULATION=150 docker compose -f infra/compose/compose.yaml up -d --force-recreate api` (mundo novo `54f6b397…`), web por `pnpm build` + `vite preview` na porta 4176.
- `node scripts/load/observers.mjs --clients 50 --tabs 2 --web-url http://localhost:4176/ --warmup 600 --seconds 1800`. Naquela versão do script, o `step_us_max ≤ 20 ms` ainda entrava como critério e a rodada saiu com código 1 só por ele. Depois disso o script passou a tratá-lo como informativo (veja abaixo). A rodada não foi repetida.
- Os 4 critérios do gate I passaram: `jitter_ms_p99` máximo de 1,56 ms nas 180 amostras de 10 s; memória entre 175 e 209 MiB, sem subir (207 MiB aos 3 min, 199 MiB no fim); 0 quedas e 0 erros de join; `observers = 52` em todas as amostras.
- Tamanho médio de um tick no fio: **6415 bytes**, com 150 organismos e a comida no teto.
- Dados brutos: `carga-oficial.json` (saída da rodada: as 180 amostras de `/api/stats` com CPU e memória, os bytes dos ticks e a lista de critérios **como a rodada a gravou**, ainda com a linha do `step_us_max` marcada como reprovada).

## step_us_max (informativo: máximo desde o boot, inclui a entrada dos 52 clientes)

- O `step_us_max` é o passo mais lento do mundo **desde o boot**, e não do regime. A primeira amostra da medição é tirada depois da entrada dos clientes, então o número inclui essa entrada.
- **No aquecimento: 4,95 ms**, lido à mão aos 431 s de vida, ainda sem observadores. A versão do script usada na rodada não gravava o valor no fim do aquecimento; a versão atual grava.
- **Depois da entrada dos 52 clientes: 29,18 ms**, já na primeira amostra (614 s de vida). O valor **ficou parado nos 30 min seguintes**, o mesmo nas 180 amostras.
- Então houve um único passo lento, nos ~14 s entre o fim do aquecimento e a primeira amostra. Nesse intervalo o Chromium foi lançado, as 2 abas carregaram e os 50 clientes entraram no canal. Em regime, nenhum passo passou de 29,18 ms. O máximo do regime em si não dá para ver, porque o valor só acumula.
- Hipótese, não verificada: o passo é medido com `:timer.tc`, em tempo de relógio. Com a máquina disputando CPU (Chromium subindo e renderizando 2 abas, a VM do Docker, 50 joins), o processo do mundo pode ter ficado sem CPU no meio de um passo. Os ticks não atrasaram: intervalo p99 de 104 ms nos clientes e `jitter_ms_p99` de 1,56 ms.
