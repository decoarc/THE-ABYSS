# The Abyss — Pacote de aceite do gate S2 (Evolução)

**Data:** 2026-11-15 · **Branch:** `gate-s2` (a partir de `b16a821`; pacote escrito em `bb55c98` e atualizado depois da revisão final e da sua onda de correções)
**Spec:** `docs/superpowers/specs/2026-11-13-gate-s2-evolucao-design.md` · **Plano:** `docs/superpowers/plans/2026-11-13-gate-s2-evolucao.md`
**Status:** **APROVADO** — aprovado pelo autor em 2026-11-15 (Parada 2), após a revisão final e suas correções. Parada 1 (visual e ritmo) aprovada em 2026-11-14. Critérios 1–8 com a evidência abaixo.

## Como ver

1. Mundo evoluído do autor (já no banco de dev): `ABYSS_TEST_SPECIES=false ABYSS_MUTATION_BOOST=1.5 docker compose -f infra/compose/compose.yaml up -d`, depois `pnpm build && pnpm --filter @abyss/web preview --port 4173` e abrir `http://localhost:4173/` (`?debug=1` e `?quality=low|high` seguem valendo). O banco de dev tinha 34 ramos registrados, 10 espécies e 10 ramos vivos na consulta de antes e depois do `pnpm e2e` (relatório da Task 10). Na Parada 1, o mundo religado tinha 20 espécies vivas, o neto vivo `sp1.2.2` e a mãe extinta `sp3` com o ramo vivo `sp3.1`.
2. Botão da árvore no canto inferior direito (acima de "CRIAR ESPÉCIE"): abre o fluxograma da espécie seguida; clicar num ramo vivo leva a câmera a uma criatura dele. O índice "NO TERRÁRIO" aninha os ramos sob a mãe.
3. `pnpm e2e` roda `run.mjs` (E2) e `evolution.mjs` (S2); o segundo faz `pg_dump` do banco de dev antes e restaura depois. `pnpm e2e:genesis` continua sendo o do S1 e **apaga o mundo** (avisa no cabeçalho).
4. Medição: `mix abyss.eco --seed S --minutes 90 --genesis N --no-test-species` (calibração, sem navegador), `ABYSS_MUTATION_BOOST` (alavanca só de medição; o compose agora a repassa), `mix abyss.seed_branch` (semeia um ramo no banco, só para o e2e) e `node scripts/perf/measure.mjs ... --suite s2`.

## Capturas e documentos

| Arquivo | O quê |
|---|---|
| `captures/s2/parada-1/README.md` | Mundo, GPUs e imagens da Parada 1 |
| `captures/s2/parada-1/mae-<gpu>.png`, `ramo-<gpu>.png`, `mae-ramo-<gpu>.png` | Mãe `sp2`, ramo `sp2.1` e os dois lado a lado (Arc `low`, RTX `high`) |
| `captures/s2/parada-1/arvore-<gpu>.png`, `indice-<gpu>.png` | Fluxograma da espécie e índice com ramos aninhados |
| `captures/s2/calibracao/README.md` | Metas, rodadas 1–3 e valores finais |
| `captures/s2/perf/README.md`, `perf.json` | Desempenho do cliente com 228–229 genomas distintos, programas de shader, `sim_perf_test` |
| `captures/s2/perf/carga-2026-11-14T16-47-50-872Z.{md,json}` | Carga de 50 observadores, sem aquecimento: **FAIL** na memória (mundo ainda enchendo) |
| `captures/s2/perf/carga-2026-11-14T17-19-09-551Z.{md,json}` | Carga de 50 observadores, 1800 s, `--warmup 600`: **PASS**, a oficial |

## Critérios (design §9)

| # | Critério | Situação e evidência |
|---|---|---|
| 1 | Mundo de teste com mutação forçada: o ramo nasce exatamente na regra de §5.2, e não antes; teste automático | PASS. `branching_test.exs`: "ramo nasce exatamente no limiar", "distância 1 não forma ramo", "jeitos diferentes não se juntam", "tem que ter passado de pais para filhos" (regra: diferença de peças >= `branch_diff`, grupo >= `branch_min`, ao menos `branch_inherited` membros nascidos sem mutação; o teste fixa 5/3, os números do spec, e produção usa **4/2**, ver "Desvios"). `mutation_test.exs` e `blueprint_test.exs` cobrem a mutação e a distância de peças (espelhada conta 1). `seed_branch_test.exs` cobre o semeador do e2e. Task 3 com revisão limpa |
| 2 | Mundo de referência (~10 criadas típicas, sem espécies de teste): ramos na janela de ~30–60 min de mundo, em várias sementes | PASS com ressalva. Calibração com `--genesis 10 --no-test-species`, sementes 1–5: todas ramificaram. Rodada 3 (antes do ajuste da mandíbula): 1º ramo na mediana de 50 min. **Valores finais commitados** (mandíbula `perception` 5, `c814b7b`): 1º ramo por semente 54/22/19/19/32 min, mediana **22 min, abaixo da janela de 30–60**; o autor aceitou na Parada 1. Ao vivo, no mundo com boost 1,5, o 1º ramo veio ~31 min depois de subir o mundo, e o autor aprovou o ritmo |
| 3 | Criada típica e predador típico vivem o bastante para ramificar (meta de §5.4), em corridas longas; com 50 espécies, algum ramo aparece | PASS com ressalvas. Predador vivo no minuto 60 em **3/5 sementes** (s2, s4, s5; o plano pede >= 3/5), contra 5/5 com `perception` 6 e 0/5 antes da calibração. Árvores com algum vivo no minuto 60: mediana 5 de 10 (meta 6, por pouco; aceita), da tabela "Parada 1: mandíbula com `effect.perception` 6,0 → 5,0" de `captures/s2/calibracao/README.md` (1/8/5/5/3 nas sementes 1–5). Com 50 criadas (rodada 3, `perception` 6): ramos em 3 de 3 sementes (8, 1 e 12 ramos). **Não foi repetido com `perception` 5**, então o "50 espécies" vale para os valores anteriores ao ajuste final |
| 4 | Criaturas mutadas desenhadas com a própria planta; o autor reconhece na parada visual que os ramos se distinguem da mãe de olhar | PASS com ressalva do autor. O cliente desenha pelo genoma (`pickBlueprint`; 7 testes novos em `worldStore.life.test.ts`). Capturas `mae-ramo-<gpu>.png` nas duas GPUs. Na Parada 1 o autor aprovou a diferença mãe×ramo **como está: sutil, por peças** (2026-11-14). Não é diferença gritante e foi aceita assim |
| 5 | Botão da árvore abre o fluxograma da espécie seguida; clicar num ramo leva a câmera a uma criatura viva; rolagem com árvores grandes | PASS. `LineageTree.test.tsx` (7 testes, entre eles a atualização quando um vivo morre) e `SpeciesIndex.test.tsx`; o e2e `evolution.mjs` (2/2) exercita a UI com o ramo semeado. Capturas `arvore-<gpu>.png` e `indice-<gpu>.png`. Autor: árvore clara, sem queixa de sobreposição. Rolagem: painel com `max-height` 60vh e `overflow: auto`; **sem teste com árvore realmente grande** (a da Parada 1 tem 3 ramos) |
| 6 | Depois de um reinício, mãe e ramos vivos voltam com 3 criaturas da própria planta; ramos extintos continuam extintos, com data | PASS. `boot_test.exs`: ramo vivo volta com 3 da própria planta, mãe extinta não volta mas o ramo vivo sim, ancestrais extintos de ramo vivo vão no boot (103 no teste), pai antes do filho, extinção de ramo gravada uma vez, `reset` apaga os ramos. Contador de id de ramo restaurado do banco (`branch_seq`). e2e `evolution.mjs`: semeia 1 espécie e 1 linha em `branches`, reinicia a API e espera `sp1.1` voltar |
| 7 | 50 espécies e seus ramos dentro do orçamento do E2; programas de shader não crescem com plantas novas; tráfego não cresce com a planta inteira por criatura | PASS com ressalvas. Cliente (vsync): Arc `low` p95 16,8 ms (percurso repetido com 229 genomas: 16,7) e RTX `high` p50 16,7 ms, parado e voando. Programas: 23 antes, 22 depois de 233 genomas novos, 22 após resync forçado, 0 ligados após o aquecimento. Servidor: `sim_perf_test` S2 máx 12,37 ms (limite 20). Carga oficial de 50 observadores, 1800 s: jitter p99 1,78 ms, 0 quedas, 0 lacunas em 902 490 ticks, memória 352,8 contra 338,2 MiB. Tráfego: o genoma vai uma vez (`g`) e a troca de espécie por `rb`; tick médio 11 421 B; snapshot 240 127 B. Ressalvas em "Desvios" |
| 8 | E-mail fora do que chega aos clientes e dos logs; "um e-mail = uma espécie" continua | PASS por herança, com pouca evidência nova. `wire_test.exs` "fio sem e-mail com ramos" cobre o fio com ramos e genomas; os testes do S1 (`confirm_test`, `redact`, `log: false`, restrição única) seguem na suíte. **Não há, nos relatórios do S2, uma rodada de `pnpm e2e:genesis` nem uma checagem específica dos logs.** A revisão final conferiu pela leitura do código: `BranchRecord` sem criadora nem e-mail, `species_info` com lista fechada de campos, logs novos (`Recorder`, `notify_branch`, `boot_species`, `seed_branch`) só com ids |

**Resumo:** os 8 critérios têm evidência. 1, 5 e 6 sem ressalva relevante; 2, 3, 4 e 7 com as ressalvas acima, aceitas pelo autor na Parada 1 ou listadas em "Desvios"; o 8 é o de evidência mais fraca.

Testes depois de todas as tasks e da onda de correções da revisão final (2026-11-15, `51bed94`): suíte da API completa (`mix test` no contêiner, banco `abyss_test`) **271 testes, exit 0**; `mix format --check-formatted` exit 0; `pnpm test` **320 testes, exit 0**; `pnpm typecheck` exit 0; `pnpm build` exit 0. Antes, na Task 10: `pnpm e2e` exit 0 com `run.mjs` 7/7 e `evolution.mjs` 2/2, e `E2E_NEGATE=1` falhando como deve. O e2e não foi repetido depois da correção do restore (I1), para não mexer no banco de dev do autor.

## O que foi construído

- **Genoma por organismo:** cada criatura carrega o id de um genoma (planta mais características derivadas); genomas iguais são compartilhados e os sem vivos são coletados a cada `branch_scan_s`.
- **Mutação (`Mutation.child/3`):** no nascimento, com probabilidade `part_p` (vezes `ABYSS_MUTATION_BOOST`, teto 1), adiciona, remove ou troca uma peça; há também deriva de corpo e cor. Os limites da planta continuam valendo.
- **Ramos (`Branching.scan`):** a cada varredura, um grupo da espécie com a mesma planta e diferença de peças >= `branch_diff` da mãe, de tamanho >= `branch_min` e com ao menos `branch_inherited` membros nascidos sem mutação vira espécie-ramo (`sp2.1`, nome "Mãe · Jardim|Floresta|Planície", região de mais membros). Mãe extinta com ramo vivo permanece; a poda poupa ancestrais.
- **Fio:** `g` (genoma uma vez), `rb` (troca de espécie), `genomes` e ancestrais extintos no snapshot; espécie com `parent`, `root`, `region`, `born_ms`.
- **Banco:** tabela `branches`, `boot_species` com ramos, `branch_seq` restaurado, `reset` trunca ramos.
- **Cliente:** desenho pela planta do genoma (mesmo par de shaders, sem `defines` por genoma), `lineage.ts`, botão da árvore, fluxograma e índice aninhado; a poda de extintas poupa ancestrais.

## Decisões durante o gate

**Do autor (Parada 1, 2026-11-14):**

1. Diferença mãe×ramo: **sutil, por peças, aprovada como está**.
2. Árvore clara, sem queixa de sobreposição; ritmo (1º ramo ~50 min, boost 1) aprovado.
3. **Manter a regra `prey_r < hunter_r`** (predador só come presa menor).
4. Metas 2 (mediana 5, alvo 6) e 4 (2 de 5 sementes) **aceitas como quase atingidas**.
5. **Mandíbula `perception` 6 para 5** (o ocelo voltar a servir ao predador), aceitando 1º ramo em ~22 min e predador vivo em 3/5.

**Do construtor:** ver os `Ruling` do ledger; entre eles, id de ramo monotônico por mãe (`branch_seq`), `populated` para a extinção de ramos e `@drift_weight` passado para `:ecology`.

## Desvios e pontos em aberto

- **Regra de ramo 5/3 → 4/2 (Task 8).** O spec §5.2 pede grupo de pelo menos 5 criaturas com 3 nascidas sem mutação; produção usa `branch_min: 4` e `branch_inherited: 2` (`config.exs`), ajuste da calibração (`captures/s2/calibracao/README.md`, "Pendências para o autor"). O `branching_test` continua fixando 5/3, os números do spec. A aprovação da Parada 2 cobre esta mudança.
- **Mundo usa boost 1,5.** Com boost 8 nenhum ramo nasce: `part_p` satura em 1, todo nascimento muta e `branch_inherited` nunca é cumprido (0 ramos em 138 nascimentos). O mundo da Parada 1 usa `ABYSS_MUTATION_BOOST=1.5` e comida canônica.
- **O e2e semeia o ramo no banco em vez de esperar um ramo natural.** O natural leva ~30 min com boost 1,5 e nunca nasce com boost alto; o nascimento ao vivo fica coberto pela calibração (`mix abyss.eco`) e pelos testes de `Branching`, não pelo e2e.
- **Calibração: metas 2 e 4 abertas e meta 1 abaixo da faixa.** Meta 2 mediana 5 (alvo 6); meta 4 com 1 semente acima de 60% depois do ajuste (s1 100%, boom-bust com só 27 vivos no minuto 60); meta 1 mediana 22 min (faixa 30–60). O efeito é caótico: um número muda muito de uma semente para outra. Aceito pelo autor.
- **Predador pequeno só caça jovens** (`prey_r < hunter_r`); mantido por decisão do autor.
- **Perf do cliente medido sem ramos** (boost 8): mede os genomas distintos (228–229), que é o que pesa no desenho, mas não a árvore em tela.
- **17 quadros > 50 ms no percurso Arc `low`** (2ª volta, execução com 82 genomas): o alvo auxiliar do script "0 quadros > 50 ms" falhou. A repetição com 229 genomas deu 0 quadros > 33 ms e 0 > 50 ms. Sem vsync, a 2ª volta teve p95 28,9 ms e 248 quadros > 33 ms (informativo; mesmo padrão de rajada do Arc visto no S1).
- **1ª carga FAIL na memória** (305,8 contra 211,4 MiB): o mundo ainda enchia de 46 a 250 e não houve aquecimento. Repetida com `--warmup 600`: PASS. As duas ficam registradas.
- **`step_us_max` ao vivo informativo:** 48 ms no mundo de medição (pico de boot concorrendo com o vitest); 12,45 ms no início e 20,58 ms ao fim da carga oficial. O critério é o `sim_perf_test` isolado (12,37 ms).
- **Mundo da captura da Parada 1 sem neto nem ramo extinto;** o mundo religado depois da queda de sessão passou a ter ambos (`sp1.2.2`, `sp3`/`sp3.1`).
- **Prod ainda usa Swoosh Local;** e-mail real é do gate O (herdado do S1).

## Pendências

**Resolvidos na onda de correções da revisão final** (`c9fa9f7..51bed94`):

- e2e `evolution.mjs`: restaura o banco também em Ctrl+C/SIGTERM/SIGHUP; a API volta a subir mesmo se o restore falhar; se o `pg_restore` falhar, o dump fica no disco e o script imprime os comandos de recuperação; o erro do teste não fica escondido atrás do erro do restore.
- `mix format` em `apps/api` (inclui o pipeline de `from_rgb`); `--check-formatted` passa.
- `boot_species` espera a fila do `Recorder` (`Recorder.sync/0`) antes de ler o banco; inserção de ramo com `conflict_target: :id` (colisão de código não é mais engolida) e log com o id se o ramo já gravado tiver outra planta; comentário da invariante de ordem dos casts em `server.ex`.
- `Mutation`: `:math.pi()` no lugar de `3.14`; sorteio em lista vazia vira no-op.
- Comentário em `SpeciesRecord`: `extinct_at` marca só a mãe, não a linhagem.
- A pergunta sobre os 12 PNGs de `docs/captures/e2/parada-1/diag-poliedro/`: o autor pediu para tirá-los do git; feito em `3cbf4c5` (`git rm --cached`, os arquivos ficam no disco).

Itens menores que ficam (ledger em `progress.md`, linhas "minor (deferred)"; triagem da revisão final: podem ficar):

- **Mutação e Sim:** sem teste dos limites de deriva (espinha, matiz, arredondamento); átomo `:swap_nao_espelhavel` com nome enganoso e `case` sem fallback; parâmetro `_bounds` morto em `Hunt.threat/5`; teste "sem catálogo, nada muda" prova pouco; nome " 2" pode repetir após poda; nascido no mesmo passo do `rebranch` sai com a espécie da mãe em `births` e depois em `rb`; `traits_of` cria um mapa novo a cada chamada para membros de ramo (custo à toa no caminho quente, dentro do orçamento).
- **Fio e banco:** `species_info` com `Map.get` para parent/root/region/born_ms; `live_genomes` ignora gid sem genoma em silêncio; ancestrais também das 100 extintas recentes; sem RED dos testes de `on_branch` e teste negativo fraco.
- **Cliente:** `Criada` memoiza a planta por organismo (genoma tardio ou `rb` só redesenha no resync); teste de ancestrais não cobre profundidade > 64.
- **Painel da árvore:** pode sobrepor o `InspectPanel` em tela baixa e o índice abaixo de 700 px; sem foco nem Esc no diálogo; seletor de raiz mostra número sem "vivos"; o índice pula intermediário vivo-sem-vivos com recuo errado.
- **Calibração:** `drift_weight` com duas fontes (0,15 no código, 0,8 na config); `branching_test` fixa 5/3 e produção usa 4/2 (em "Desvios"); `eco_run_test` acoplado à calibração; `part_p` 0,06 para 0,27.
- **e2e e perf:** `E2E_NEGATE` não visível em `evolution.mjs`; laço de espera sem tratar erro de fetch logo após o reinício; regex `/Semente 1/` pode casar "Semente 10"; `seed_branch!` com corrida em `branch_seq` em chamadas simultâneas.
- **Ambiente:** `ABYSS_MUTATION_BOOST` (como `ABYSS_FOOD_BOOST`) vale em qualquer ambiente, prod inclusive; e `ABYSS_TEST_SPECIES=false` vaza para o `mix test` se estiver no ambiente (os testes de `eco_run_test` falham num mundo vazio). Para o gate O.
- **Herdados do S1, ainda abertos:** erros do Mailer real em logs (gate O); tick de 12,1 kB a 250 e broadcast de ~20 ms com 52 clientes (gate P/O); "metade da tela fica preta ao se mover" (E2, não investigado).

## Aceite do autor

- **Parada 1** (visual e ritmo, 2026-11-14): aprovada. Diferença mãe×ramo sutil por peças; árvore clara; ritmo; manter `prey_r < hunter_r`; metas 2 e 4 aceitas como quase; mandíbula `perception` 5.
- **Parada 2** (mundo ao vivo e este pacote): **Aprovado pelo autor em 2026-11-15 (Parada 2), após a revisão final e suas correções.** A aprovação cobre os desvios acima, entre eles a regra de ramo 4/2.
