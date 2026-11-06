# Carga do servidor — 2026-11-06T13:35:57.848Z

- Clientes: 52 · abas reais: 0 · duração: 1800 s (depois de 600 s de aquecimento) · população: 191
- Comida no início: partículas 399 · flora 178.47 / 200 · no fim: partículas 401 · flora 76.812 / 200
- Comida ao longo da medição: partículas 371–424 · soma da flora 76.812–176.987
- Comido na medição: flora 8271 mordidas · partículas 515
- Tamanho médio de um tick no fio: 8762 bytes (938498 ticks medidos)
- Ticks recebidos: 938498 · lacunas (ticks perdidos): 0
- Intervalo entre ticks (clientes): p50 99.99 ms · p99 103.8 ms · máx 232.97 ms
- Quedas de conexão: 0 · erros de join: 0
- CPU (última amostra): 20.55 % · memória: 213.8 MiB
- step_us_max (informativo, não é critério; máximo desde o boot, inclui a entrada dos 52 clientes): fim do aquecimento 37.49 ms · depois da entrada 37.49 ms · fim da medição 127.09 ms

| Critério | Valor | Resultado |
| --- | --- | --- |
| jitter_ms_p99 máximo ≤ 20 ms | 1.511 | PASS |
| memória sem tendência de alta (última ≤ 1,10 × mediana dos 10 primeiros min) | 213.8 vs 208.4 MiB | PASS |
| zero quedas de conexão | 0 | PASS |
| observers = 52 | 52 | PASS |

**Resultado: PASS**
