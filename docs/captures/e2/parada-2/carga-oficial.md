# Carga do servidor — 2026-11-07T20:53:46.735Z

- Clientes: 50 · abas reais: 2 · duração: 1800 s (depois de 600 s de aquecimento) · população: 249
- População ao longo da medição (mín.–máx.): 242–250 (amostras a cada 10 s)
- Comida no início: partículas 779 · flora 197.282 / 200 · no fim: partículas 726 · flora 199.259 / 200
- Comida ao longo da medição: partículas 575–800 · soma da flora 195.081–199.636
- Comido na medição: flora 1041 mordidas · partículas 4703
- Tamanho médio de um tick no fio: 12136 bytes (902125 ticks medidos)
- Ticks recebidos: 902125 · lacunas (ticks perdidos): 0
- Intervalo entre ticks (clientes): p50 99.99 ms · p99 104.13 ms · máx 287.13 ms
- Quedas de conexão: 0 · erros de join: 0
- CPU (última amostra): 29.82 % · memória: 227.3 MiB
- step_us_max (informativo, não é critério; máximo desde o boot, inclui a entrada dos 52 clientes): fim do aquecimento 10.23 ms · depois da entrada 10.23 ms · fim da medição 158.31 ms

| Critério | Valor | Resultado |
| --- | --- | --- |
| jitter_ms_p99 máximo ≤ 20 ms | 1.826 | PASS |
| memória sem tendência de alta (última ≤ 1,10 × mediana dos 10 primeiros min) | 227.3 vs 214.7 MiB | PASS |
| zero quedas de conexão | 0 | PASS |
| observers = 52 | 52 | PASS |

**Resultado: PASS**
