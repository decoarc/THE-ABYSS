# The Abyss — Pacote de aceite do gate P (Persistência)

**Data:** 2026-11-16 · **Branch:** `gate-p` (a partir de `687de37`; design e plano em `4ef59c5`)
**Spec:** `docs/superpowers/specs/2026-11-15-gate-p-persistencia-design.md` · **Plano:** `docs/superpowers/plans/2026-11-15-gate-p-persistencia.md`
**Status:** **APROVADO** — aprovado pelo autor em 2026-11-16 (Parada 2). A Parada 1 (buscador e árvore com história)
foi aprovada no mesmo dia, depois de três ajustes. As provas de saída (design §8) têm a evidência abaixo.

## Como ver

1. Mundo de referência (no banco de dev): `ABYSS_TEST_SPECIES=false ABYSS_MUTATION_BOOST=1.5 docker compose -f
   infra/compose/compose.yaml up -d` (sobe `db`, `api` e `backup`), depois `pnpm build && pnpm --filter @abyss/web
   preview --port 4173` e abrir `http://localhost:4173/` (`?debug=1` e `?quality=low|high` seguem valendo). O mundo
   tem ~10 h, 250 organismos e 50 ramos gravados. Atravessou reinícios, quedas, uma parada de 5 min, uma queda do
   Docker Desktop e um apagamento do volume do banco.
2. **Reinício:** `docker compose -f infra/compose/compose.yaml restart api`. O log mostra "fotografia de desligamento
   gravada no tick N" e, na volta, "mundo restaurado da fotografia do tick N (epoch E)". A aba reconecta sozinha.
3. **Queda:** `docker compose -f infra/compose/compose.yaml kill -s KILL api` e depois `up -d api`: volta da última
   fotografia (no máximo ~60 s antes).
4. **Buscador:** canto superior esquerdo. Espécie viva → a câmera segue uma criatura dela; extinta → árvore com a
   data, a última morte e o resumo dos últimos 30 min.
5. **Backup:** `pnpm api:backup:now` (na hora) e `pnpm api:restore <arquivo>`. O serviço `backup` faz um a cada 6 h e
   guarda 7.
6. `pnpm e2e` roda `run.mjs` (E2 + busca), `evolution.mjs` (S2) e `persistence.mjs` (reinício, queda, parada de 5
   min). O `persistence.mjs` reinicia e derruba o `api` de dev, mas não apaga dados.

## Capturas e documentos

| Arquivo | O quê |
|---|---|
| `captures/p/parada-1/README.md` | Os quatro casos de busca, a árvore com história e os ajustes pedidos na Parada 1 |
| `captures/p/parada-1/busca-*.png`, `arvore-historia.png`, `arvore-rolagem.png` | Resultados, nome inexistente, espécie viva seguida, raiz extinta, árvore de `Semente 8` (29 ramos) e a barra de rolagem |
| `captures/p/backup/README.md` | Rotação do backup e ensaio de restauração com o volume apagado |
| `captures/p/perf/README.md`, `perf.json` | Custo da fotografia no tick, `sim_perf_test`, cliente nas duas GPUs |
| `captures/p/perf/carga-2026-11-16T22-08-07-357Z.{md,json}` | Carga de 50 observadores, 1800 s: **PASS** |

## Provas de saída (design §8)

| # | Prova | Situação e evidência |
|---|---|---|
| 1 | **Reinício normal:** mantém criaturas, posições, energia e idade; tick e relógio continuam | PASS. e2e `persistence.mjs` "reinício normal" (`docker compose restart api`), em três execuções: 43/43, 246/247 e 248/248 criaturas de volta. O pior desvio de idade foi **0 ms**, e o mundo andou ~6,8 s em ~11,6 s reais (o relógio fica parado com o servidor fora). O tick continua. O limite é 95% porque uma criatura pode morrer durante o reinício. Posições e energia: `snapshot_test` "ida e volta continua o mesmo mundo" (o Sim decodificado é igual ao codificado). Relógio: `server_clock_test` (6 testes, com "boot restaurado continua o mundo e reconcilia com o banco") |
| 2 | **Queda brusca:** volta da última fotografia, perde no máximo ~1 min; a reconciliação cobre espécie criada, ramo nascido e extinção no minuto perdido | PASS. e2e "queda (kill -9)", em três execuções: perdeu 70, 69 e 69 ticks (~7 s; o limite é 600 + margem). Reconciliação: `reconcile_test` "espécie criada depois da fotografia nasce com 3", "ramo gravado depois da fotografia volta com 3 da planta dele", "extinção gravada depois vale a do banco" e "extinta no banco e ausente no Sim entra extinta" |
| 3 | **Parada longa:** ninguém morre de velhice por causa da parada | PASS. e2e "parada longa (300 s)", em duas execuções: velhice 11/min antes e 11/min depois, 0 no boot, população 248 → 248; e 6/min antes, 11/min depois (limite 2×), 0 no boot, 250 → 250. Horas: `boot_test` "volta depois de 6 h não mata por velhice". A parada real mais longa foi a queda do Docker Desktop (horas): o mundo voltou do tick 271 311 com 250 organismos |
| 4 | **Fotografia incompatível ou corrompida:** cai para a anterior válida ou recomeça com evento | PASS. `boot_test` "checksum ruim cai para a anterior", "regras diferentes recomeçam com epoch novo e evento" e "sem fotografia: epoch 1, sem evento". `snapshot_test` "formato mais novo que o código recusa", "regras diferentes recusam" e "mapa diferente recusa". Guarda as 3 mais novas (`saver_test` "grava a cada intervalo e guarda 3") |
| 5 | **Deploy com campo novo:** fotografia do formato anterior carrega com as mesmas criaturas; regras diferentes recomeçam | PASS (teste de unidade, como o plano previa). `snapshot_test` "formato antigo com campo a menos é completado" (campos que faltam no Sim e no Organism vêm do padrão da struct). As regras de quando subir `@format_version` e `@rules_version` estão comentadas em `snapshot.ex` |
| 6 | **Queda com contagens:** mortes não ficam duplicadas | PASS. e2e "queda": **0** linhas de `death_counts` gravadas antes da queda com tick depois da fotografia (fora as de extinção), nas três execuções. `boot_test` "queda descarta contagens depois da fotografia, menos as de extinção" |
| 7 | **Causas de extinção:** com semente fixa, uma extinção por predação com o predador certo e uma por fome | PASS. `sim_death_cause_test` "extinção por predação guarda o predador certo" (acrescentado nesta Task: passou de primeira e falhou com o predador trocado) e "extinção guarda a última morte" (fome). `recorder_test` "extinção grava causa e reta final antes". `history_test` "reta final por predador". Ao vivo, extinções gravadas com causa: 4 raízes e 7 ramos por fome, 3 raízes e 2 ramos por velhice, 1 ramo `branched`. **Nenhuma por predação no mundo vivo**, mas a predação aparece no resumo final (`Semente 1`: "7% predação por Semente 8") |
| 8 | **Buscador:** e2e com espécie viva, extinta com ramo vivo, linhagem extinta e nome inexistente | PASS com ressalva. e2e `run.mjs` "buscar uma espécie viva segue uma criatura dela; nome inexistente avisa" cobre 2 dos 4 casos. Os quatro estão em `SpeciesSearch.test.tsx` ("viva: seleciona a mais próxima e segue", "extinta com ramo vivo: segue o ramo e abre a árvore da raiz", "linhagem extinta: só abre a árvore", "nome inexistente mostra o aviso…"). Na Parada 1, três apareceram ao vivo. O caso "extinta com ramo vivo" não existe no mundo de referência: toda raiz extinta perdeu também os ramos. API: `history_test` (9 testes) e `species_controller_test` (busca e história **sem e-mail**, 404, limite por IP) |
| 9 | **Backup:** o ensaio de restauração passa | PASS. `captures/p/backup/README.md`: rotação 9 → 7 com `BACKUP_EVERY_S=30`. Ensaio: volume do banco apagado, `restore.sh` em 7,9 s, mundo de volta da fotografia do tick 3172 com a mesma população por espécie e a história junto |
| 10 | **Desempenho:** passo e FPS do S2 se mantêm com a fotografia ligada | PASS. Fotografia no processo do mundo: **6,7 ms** na 1ª e **13,2 ms** no pior caso em 77 fotografias (tick de 100 ms; `snapshot_us_max` em `/api/stats`). `sim_perf_test` máx 11,11 ms (limite 20). Cliente: Arc `low` p95 16,8 ms, RTX `high` p50 16,7 ms, 0 programas ligados e 0 quadros > 50 ms depois do aquecimento, programas 21 → 21. Carga de 50 observadores (30 fotografias na janela): jitter p99 máx 1,83 ms (S2 sem fotografia: 1,78), 0 quedas, 0 lacunas em 902 003 ticks, memória 327,9 contra 324,7 MiB |
| 11 | **Duas paradas com o autor** | PASS. Parada 1 aprovada em 2026-11-16 (ver "Decisões"). Parada 2 (este pacote) aprovada em 2026-11-16; o autor aprovou sem pedir a demonstração ao vivo, que fica coberta pelas execuções do e2e de reinício e queda acima. |

**Tamanho e tempo da fotografia:** 255 organismos dão 38,9–39,8 kB, com encode de 2–3 ms e decode de 1–2 ms (teste).
O mundo vivo com 250 organismos e ~50 ramos dá 132 kB em média nas 3 guardadas. A codificação e a escrita rodam no
`Saver`, fora do processo do mundo. Se uma gravação ainda está em curso, a seguinte é descartada com aviso no log.

**Testes no fim do gate** (2026-11-16):
- **API:** `mix test` completo no contêiner, **325 testes, exit 0**. `mix format --check-formatted` exit 0.
- **Web:** `pnpm test` **339 testes, exit 0**. `pnpm typecheck` exit 0. `pnpm build` exit 0.
- **e2e:** `pnpm e2e` exit 0 (`run.mjs` 8/8, `evolution.mjs` 2/2, `persistence.mjs` 3/3). `E2E_NEGATE=1` no
  `persistence.mjs` falha 0/3, como deve.
- Depois dos ajustes da Parada 1, só o `evolution.mjs` rodou de novo (2/2). Foi o único e2e que os ajustes tocaram.

## O que foi construído

- **Relógio do mundo:** `world_ms = hora real − clock_offset_ms`. O tempo para enquanto o servidor está fora. As datas
  que vão para o banco e para o fio são convertidas para hora real. O `epoch` numera os recomeços.
- **Fotografia (`Snapshot`, `Saver`):** o Sim inteiro em binário com checksum SHA-256, versão de formato e de regras.
  É gravada a cada 60 s (`ABYSS_SNAPSHOT_S`) e no desligamento (`terminate`, até 10 s), e as 3 mais novas ficam
  guardadas. O compose dá 30 s para o desligamento (`stop_grace_period`) e roda `exec mix phx.server`.
- **Volta (`Boot`, `Reconcile`):** carrega a fotografia mais nova válida, ou recomeça com um evento `restart`.
  Reconcilia com o banco o que mudou no minuto perdido e registra um evento `pause`.
- **Causas de morte e de extinção:** `dead_by` e `extinct_causes` no Sim. Contagens de mortes em blocos de 5 min
  (`death_counts`). Extinção gravada com causa, predador, `world_ms` e `epoch`.
- **API de história:** `GET /api/species/search?q=` (sem acento, curingas escapados, vivas primeiro, 20 resultados,
  limite por IP) e `GET /api/species/:root/history` (árvore com diferenças de peças, extinções com causa e resumo dos
  últimos 30 min, recomeços). Nenhuma das duas devolve e-mail.
- **Cliente:** buscador (`SpeciesSearch`). A árvore mostra a história (nascimento, diferença de peças, extinção, última
  morte, últimos 30 min, "mundo recomeçado"). `serverNow()` na ponte de depuração.
- **Backup:** serviço `backup` (`pg_dump -Fc` a cada 6 h, guarda 7), `pnpm api:backup:now` e `pnpm api:restore`.
  `.gitattributes` garante LF nos `.sh`.
- **Medição:** `snapshot_us_max` e `snapshots` em `/api/stats`. e2e `persistence.mjs` e caso de busca no `run.mjs`.

## Decisões durante o gate

**Do autor (Parada 1, 2026-11-16):**

1. A árvore abria sobre o painel do indivíduo, com os textos misturados. O painel agora **sai da frente enquanto a
   árvore está aberta** e volta ao fechá-la, sem perder a seleção nem o Seguir.
2. As linhas secundárias da árvore **quebram dentro do painel**, em vez de serem cortadas.
3. **Barra de rolagem do tema** (polegar reto de 6 px na cor das bordas, sem setas) na árvore e, a pedido, na lista
   da busca. O índice "NO TERRÁRIO" fica com a barra do sistema.
4. A árvore longa (29 ramos) fica como está neste gate.
5. Parada 1 e Task 12 aprovadas.

**Do construtor:** os `Ruling` do ledger. Entre eles:
- o `Server` recebe a persistência injetada (`persist`);
- o rng vai na fotografia por `:rand.export_seed_s`;
- `Sim.force_extinct/3` existe para a reconciliação;
- o resumo final inclui o bloco de 5 min que contém o início da janela;
- escolher uma viva na busca já começa a seguir;
- a raiz pedida pelo buscador vale até a árvore fechar;
- o `Recorder.record/1` só aceita o mapa novo.

## Desvios e pontos em aberto

- **Buscador no e2e: 2 dos 4 casos** (prova 8). Os outros dois têm teste de unidade, e "extinta com ramo vivo" não
  existe no mundo de referência.
- **Extinção por predação só no teste** (prova 7): o mundo vivo ainda não teve uma.
- **Parada longa de horas só no teste** (6 h) e na queda real do Docker. O e2e usa 5 min.
- **Carga com 120 s de aquecimento** (no S2, 600 s): o mundo já estava no teto havia horas. A 1ª tentativa foi
  encerrada por falta de memória na máquina, não por falha do teste.
- **`step_us_max` ao vivo 32,3 ms** (pico desde o boot, com a medição de cliente das duas GPUs na mesma máquina).
  Informativo, como no S2 (48 ms). O critério é o `sim_perf_test`.
- **O e2e "selecionar pelo índice" do `run.mjs`** procurava a espécie de teste "Membrana" e falhava em mundo sem ela.
  Agora pega a primeira espécie viva do índice.
- **A árvore fica sobre o `InspectPanel`** foi resolvido. Continua aberto, do S2: sem foco nem Esc no diálogo, e o
  índice abaixo de 700 px.
- **Memória da máquina:** a carga e o e2e foram encerrados duas vezes pelo Claude Code por falta de RAM (Chrome
  aberto). Repetidos depois, passaram.

**Herdados, ainda abertos:**
- **Gate O:**
  - tick de 12,1 kB a 250 organismos e broadcast de ~20 ms com 52 clientes (nesta carga, tick médio de 12 112 B);
  - backup fora da máquina, criptografia e alerta de backup que falhou;
  - `ABYSS_MUTATION_BOOST` (como `ABYSS_FOOD_BOOST`) vale em qualquer ambiente, prod inclusive (M5);
  - erros do Mailer real nos logs.
- **Não investigado:** "metade da tela fica preta ao se mover" (E2).
- **M2:** `traits_of` cria um mapa novo a cada chamada para membros de ramo (custo à toa no caminho quente, dentro
  do orçamento).

## Revisão final

Um revisor que não tinha visto o código leu a branch inteira (`687de37..7d0eb6c`) e checou um a um os cinco pontos
de risco do plano. Resultado: **nenhum crítico**, 4 importantes, 10 menores. Veredito: "pronto com correções". Um dos
menores (#5) foi reclassificado para importante pelo efeito em quem usa a busca. As cinco correções estão em
`402be8a`, cada uma com um teste que falhou antes e passou depois:

1. **O desligamento cortava a fotografia aos 5 s** (padrão do OTP), apesar dos 10 s configurados. Agora o Server
   tem `shutdown: 28_000`, e a espera do Recorder ficou limitada a 5 s, para o total caber nos 30 s do compose.
2. **Uma queda do próprio mundo virava a fotografia mais nova.** Na volta, o mesmo passo se repetiria e derrubaria o
   mundo de novo. Agora o `terminate` só grava no desligamento normal (`:normal`, `:shutdown`).
3. **A configuração ficava congelada na fotografia.** Na volta, `:ecology` e `:food` (com `ABYSS_FOOD_BOOST`) vêm da
   configuração de agora. População, `creature_scale` e espécies de teste continuam os da fotografia. Para mudá-los
   num mundo em curso é preciso subir `@rules_version`, o que está documentado em `snapshot.ex`.
4. **Um backup que falhava publicava um arquivo vazio, e a rotação apagava um backup bom.** Agora, sem dump válido
   (`pg_dump` mais `pg_restore -l`), nada é publicado e nada é apagado. Isso foi provado num contêiner com o banco
   fora do ar, que antes falhava e agora passa, e o caminho normal continua funcionando.
5. **A busca podia cortar espécies vivas** quando havia mais de 20 nomes. Agora as vivas vêm primeiro já no banco.
   Ao vivo, "semente" passou a trazer 20 vivas.

Depois das correções: `mix test` **329 testes, exit 0**; `mix format --check-formatted` exit 0. Ao vivo, o reinício
gravou a fotografia de desligamento do tick 397 831 e voltou dela.

**Menores que ficam** (no ledger, para um gate futuro):
- o teste não prova que `%` é tratado como texto na busca;
- o histórico faz ~2N consultas e não tem limite por IP;
- o epoch pode se repetir se o mundo cair antes da 1ª fotografia;
- o descarte de contagens roda antes de esperar o Recorder, no reinício só do Server;
- uma extinção que falhou ao gravar fica viva no banco;
- o boot depende do banco sem fallback;
- a regra de campo novo de espécie (ler com `Map.get` e padrão) não está escrita no `Snapshot`;
- `restore.sh` para o api antes de checar o arquivo e não faz cópia de segurança antes do `--clean`;
- `binary_to_term` sem `[:safe]`.

## Aceite do autor

- **Parada 1** (buscador e árvore com história, 2026-11-16): aprovada depois de três ajustes (painel do indivíduo
  sai da frente da árvore, linhas que quebram, barra de rolagem do tema na árvore e na busca).
- **Parada 2** (este pacote): **aprovado pelo autor em 2026-11-16**, antes da revisão final; as correções da revisão
  estão na seção acima. A demonstração ao vivo de reinício e queda não foi
  pedida; as execuções do e2e `persistence.mjs` registradas acima fazem esse papel. A aprovação cobre os desvios listados.
