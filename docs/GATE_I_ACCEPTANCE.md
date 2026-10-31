# The Abyss — Pacote de aceite do gate I (Observação)

**Data:** 2026-10-31 · **Branch:** `gate-i-base-main` (a partir de `main` `9baad35`, com o trabalho do `gate-i`)
**Spec:** `docs/superpowers/specs/2026-10-31-gate-i-observacao-design.md` · **Plano:** `docs/superpowers/plans/2026-10-31-gate-i-observacao.md`
**Status:** critérios 1–4 e 6 atendidos por evidência automática ou medida; critério 5 com **aceite do autor pendente**.

## Como ver

1. `pnpm api:up` (API em `localhost:4000`; para população 60 use `ABYSS_POPULATION=60 pnpm api:up`).
2. `pnpm build && pnpm preview` e abrir `http://localhost:4173` (ou a porta que o preview indicar).
3. Variações: `?debug=1` expõe `window.__abyss` (usado pelo e2e); `?perf=1` mede frame time no console após ~15 s.

## Capturas

| Arquivo | O quê |
|---|---|
| [desktop-1440x900.png](captures/gate-i/desktop-1440x900.png) | Quadro herói, 45 organismos, 16:10 |
| [desktop-2560x1600.png](captures/gate-i/desktop-2560x1600.png) | Resolução da tela do autor |
| [narrow-390x844.png](captures/gate-i/narrow-390x844.png) | Janela estreita/retrato |
| [reduced-motion-1440x900.png](captures/gate-i/reduced-motion-1440x900.png) | `prefers-reduced-motion: reduce` |
| [flow-1-selecionado.png](captures/gate-i/flow-1-selecionado.png) | Organismo selecionado pelo índice, anel e painel |
| [flow-2-seguindo-5.png](captures/gate-i/flow-2-seguindo-5.png) | Seguindo `MBR-0003` (câmera acompanha, posição atualiza) |
| [flow-3-solto.png](captures/gate-i/flow-3-solto.png) | Depois do Esc: câmera de volta ao quadro herói |

Vídeo da Parada 2 (roteiro de seleção, Seguir ~20 s e soltar): `captures/parada-2/parada-2-seguir.webm` (local, não versionado).

## Consistência e testes automatizados (critérios 1, 2, 3, 6)

| Suíte | Comando | Resultado |
|---|---|---|
| Web (unitários e componentes) | `pnpm test` | 116 testes passam |
| Typecheck e build do web | `pnpm typecheck`, `pnpm build` | exit 0 |
| API (Elixir) | `pnpm api:test` | 26 testes passam |
| E2E (3 cenários) | `pnpm e2e` | 3/3 passam |

Cenários do e2e:
- **Duas abas, um mundo só:** mesmo `world_id` e mesmo roster; defasagem de ticks ≤ 2; `positionsAt(T)` idêntico nas duas abas para um tick recente. Verificado que o teste falha quando a asserção é invertida (`E2E_NEGATE=1`).
- **Seleção pelo índice:** escolher um id seleciona esse id (sem seguir) e o painel mostra `INDIVÍDUO · {id}`.
- **Reinício:** `docker compose restart api` → a página volta ao vivo com `world_id` novo, sem recarregar (`window.__marker` preservado).

## Carga medida (critério 4)

Rodada oficial: 50 clientes Phoenix no canal `world:main` + 2 abas reais, população 60, 1800 s, sem renderizar nos clientes.
Relatório completo: [carga-oficial.md](captures/gate-i/carga-oficial.md) (gerado por `pnpm load`).

| Medida | Valor |
|---|---|
| Ticks recebidos pelos clientes | 900 852 |
| Lacunas na sequência (ticks perdidos) | 0 |
| Quedas de conexão / erros de join | 0 / 0 |
| Intervalo entre ticks no cliente | p50 100 ms · p99 103,2 ms |
| `jitter_ms_p99` do servidor (máximo das amostras) | 1,65 ms (limite 20 ms) |
| Memória do contêiner | 154,8 MiB na última amostra vs. 153,3 MiB na mediana dos 10 primeiros min (limite +10%) |
| Observers | 52 (= 50 + 2 abas) |

Ressalva: o intervalo máximo medido no cliente foi de 235 ms, pontual. O critério de aceite usa o jitter medido pelo servidor, que ficou em 1,65 ms no pior caso.

## Desempenho com 60 organismos (`?perf=1`, 1920×1080)

Dados: [perf-60-organismos.json](captures/gate-i/perf-60-organismos.json), gerados por `scripts/perf/measure.mjs`. Cada cenário roda em navegador novo.

Com vsync (o monitor limita o quadro em 16,7 ms):

| GPU | Preset | p50 (ms) | p95 (ms) | Draw calls |
|---|---|---|---|---|
| Intel Arc | high | 16,7 | 17,9 | 254 |
| Intel Arc | low | 16,7 | 17,8 | 265 |
| RTX 4070 Laptop | high | 16,7 | 17,8 | 259 |
| RTX 4070 Laptop | low | 16,7 | 17,6 | 258 |

Sem vsync (mostra o trabalho real da GPU):

| GPU | Preset | p50 (ms) | p95 (ms) |
|---|---|---|---|
| Intel Arc | high | 3,5 | 6,2 |
| RTX 4070 Laptop | high | 3,1 | 4,3 |

Orçamento do protótipo 2: Arc `low` p95 ≤ 33 ms; RTX `high` p50 ≤ 16,7 ms.
- **Arc `low`:** p95 de 17,8 ms com vsync. Como o vsync só limita para cima, o trabalho real é no máximo esse valor, abaixo de 33 ms. Não medi `low` sem vsync.
- **RTX `high`:** p50 de 3,1 ms sem vsync, abaixo de 16,7 ms.

Nenhum ajuste em `QUALITY` foi necessário. Não houve redução de população.

Ressalva: uma rodada por cenário. Não medi outros navegadores nem monitores de 60 Hz.

## Critérios (design §6)

| # | Critério | Situação |
|---|---|---|
| 1 | Duas abas, um mundo só | Atendido: e2e "duas abas veem o mesmo mundo" e carga com 2 abas reais |
| 2 | Seleção confiável; "Seguir" acompanha sem perder | Atendido: e2e "selecionar pelo índice"; testes de seleção, anel e câmera; Parada 2 |
| 3 | Reinício sem quebrar | Atendido: e2e "reinício reconecta com mundo novo" |
| 4 | Carga medida, 60 organismos, 50 observadores | Atendido: rodada oficial acima |
| 5 | Visual intacto: aceite explícito do autor | **Pendente.** Movimento aprovado na Parada 2; comparação com o protótipo 2 ainda não registrada |
| 6 | Testes automatizados de seleção e consistência | Atendido: suítes web, API e e2e |

## Desvios em relação ao plano

- O e2e usa a biblioteca `playwright` com um script próprio (`scripts/e2e/run.mjs`), sem `@playwright/test` nem arquivo de configuração.
- A "consistência" de posições foi testada no store (`positionsAt`) e no e2e com duas abas, não por um rastreio de ticks no servidor.
- O teste do jitter de carga usa `/api/stats`, a mesma métrica que o design §8 cita.

## Aceite do autor

**Aceite do autor:** pendente (critério 5: comparar com o protótipo 2 aprovado).
