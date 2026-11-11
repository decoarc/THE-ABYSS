# The Abyss — Pacote de aceite do gate S1 (Gênese de Espécies)

**Data:** 2026-11-11 · **Branch:** `gate-s` (a partir de `main` em `e3eb09a`; design em `ff678ad`, plano em `99e3c1f`)
**Spec:** `docs/superpowers/specs/2026-11-08-gate-s1-genese-design.md` · **Plano:** `docs/superpowers/plans/2026-11-10-gate-s1-genese.md`
**Status:** aguardando a Parada 2. Parada 1 (visual) aprovada pelo autor em 2026-11-10. Critérios 1–7 com evidência abaixo. **Critério 8: respondido "sim" na Parada 1; fecha de vez só com a aprovação explícita do autor na Parada 2.**

## Como ver

1. `pnpm api:up` sobe a API (`localhost:4000`) com o PostgreSQL do compose. O mundo de dev começa com as 5 espécies de teste e nenhuma criada.
2. `pnpm dev` (cliente em `localhost:5173`). Botão "CRIAR ESPÉCIE" no canto inferior direito; a tela de criação é a rota `#criar`.
3. Preencher a espécie, e-mail e nome, e clicar em "Liberar no abismo". O link chega na caixa local: `http://localhost:4000/dev/mailbox`. Abrir o link (`#confirmar=<token>`) confirma, volta ao mundo e mostra um aviso de 8 s. As 3 criaturas nascem num lugar sorteado; achar pelo índice.
4. `pnpm api:reset` (`mix abyss.reset --yes`) apaga todas as espécies e libera os e-mails. Sem `--yes` o comando só avisa e sai com código 1.
5. `pnpm e2e:genesis` roda o e2e do fluxo completo (precisa do `pnpm api:up`). `pnpm e2e` roda o do E2.
6. Atalhos já conhecidos: `?debug=1`, `?flypath=1`, `?quality=low|high`, `ABYSS_SEED`, `ABYSS_FOOD_BOOST` (alavanca só de medição).
7. Medição: `mix abyss.seed_species --count 50 --seed 7` (só em dev) cria 50 espécies sorteadas; `mix abyss.eco --genesis N` calibra no servidor, sem navegador.

## Capturas

| Arquivo | O quê |
|---|---|
| `captures/s1/parada-1/README.md` | As 8 plantas, calibração antes e depois do ajuste leve, placa, espécie típica |
| `captures/s1/parada-1/editor-folha.png`, `editor-<n>-*.png` | As 8 plantas na prévia do editor |
| `captures/s1/parada-1/mundo-arc-<n>-*.png`, `mundo-rtx-<n>-*.png` | As mesmas 8 nadando no mundo, nas duas GPUs |
| `captures/s1/parada-1/cardume-*.png`, `floresta-gancho-*` | Cardume (3 juntas) e gancho de abrigo (fuga rumo à Floresta) |
| `captures/s1/perf/README.md`, `perf.json`, `vivas-50/*` | Desempenho do cliente com 50 espécies criadas, programas, `step_us_max` |
| `captures/s1/perf/carga-2026-11-10T23-30-55-538Z.md` / `.json` | Carga: 50 clientes + 2 abas reais |

## Critérios (design §9)

| # | Critério | Situação e evidência |
|---|---|---|
| 1 | Botão, montagem, e-mail na caixa local, volta ao mundo e acha as 3 criaturas | PASS. e2e `pnpm e2e:genesis` 7/7 (fluxo completo, segunda aba, mesmo e-mail, link duas vezes, programas, e-mail no fio, reinício); visto falhar com `E2E_NEGATE=1` (0/7, exit 1). Na Parada 1 o autor publicou e viu a criatura no mundo. O fluxo com e-mail real na caixa local é refeito por ele na Parada 2 |
| 2 | A criatura no mundo é reconhecível como a montada, nas duas GPUs | PASS. Capturas `editor-<n>-*` e `mundo-arc/rtx-<n>-*` das mesmas 8 plantas (Arc `low`, RTX `high`). Autor aprovou na Parada 1 ("a criatura publicada apareceu no mundo como montada"). Ressalva menor: a cor da pele é "domada" pelo shader, e a prévia usa o mesmo desenho, então coincidem (ver desvios) |
| 3 | Cada peça muda o comportamento de forma visível, inclusive a placa | PASS com ressalva. Teste `traits_test` "cada peça muda" (derivação) e "peça que só enfeita" nas fixtures; mandíbula caça qualquer menor de outra espécie (`sim_test`); cardume e gancho com capturas (`cardume-*`, `floresta-gancho-*`). Placa: teste dirigido `placas: a fração de botes escapados segue o escape da presa` (400 botes, 180 escapes, 45% contra 42,5% esperado, controle sem placa 50/50 capturados). Autor aprovou "peças no comportamento" na Parada 1. Ressalva: em corridas aleatórias a placa quase não escapa (3 escapes em 987 botes; 0 depois do ajuste), só no cenário dirigido (semente 2: 4 de 11 botes, 36%) |
| 4 | Um e-mail não publica segunda espécie (dois envios simultâneos, maiúsculas, espaços); abuso | PASS. `confirm_test` ("maiúsculas e espaços" dá `:taken`; "dois tokens do mesmo e-mail" dá 1 espécie); restrição única sobre o e-mail normalizado, numa transação; limites por rede e por e-mail em `rate_limit_test`; tipos hostis (não-mapa, não-string, UTF-8 inválido) em `confirm_test`; `genesis_controller_test` (202/422/429, 413, 400). Resposta genérica para e-mail novo ou usado. e2e "mesmo e-mail" e "link duas vezes" |
| 5 | O e-mail não aparece nos clientes nem nos logs | PASS. `redact: true` em `email_normalized`; `filter_parameters` com `email` e `token`; `log: false` nas queries com e-mail; teste "o e-mail não aparece nos logs" rodando com Ecto em `:debug` (visto falhar sem o `log: false`); token guardado só como hash SHA-256. e2e "e-mail no fio" varre os quadros do WebSocket. Ressalva: o e2e procura só um dos três endereços usados |
| 6 | Reinício: vivas voltam com 3, extintas continuam extintas com data | PASS. `boot_test` (vivas por id; 100 extintas mais recentes; extinta com data); `Genesis.Recorder` grava a extinção; e2e "reinício"; manual: seed de 3 espécies e reinício deu `sp1..sp3` com 3 cada. `pnpm api:reset` visto apagando tudo e liberando os e-mails (`abyss_reset_test`) |
| 7 | 50 espécies criadas juntas dentro do orçamento do E2; programas de shader não crescem | PASS. Cliente com vsync, Arc `low` p95 16,7 ms (parado e voando) e RTX `high` p50 16,7 ms, as 4 janelas PASS (`captures/s1/perf/README.md`). Programas: 23 → 23 com 50 criadas, 27 → 27 sem criadas, e2e "programas não crescem por espécie". Servidor: `sim_perf_test` com 50 criadas a 250, máx 12,66 ms (≤ 20), população nunca acima de 250. Carga 50+2: jitter p99 1,8 ms, 0 quedas, 902 450 ticks sem lacuna. Ressalva: `step_us_max` ao vivo 24,7 e 35,2 ms (ver desvios) |
| 8 | O autor monta criaturas e confirma que dá para fazer espécies bem diferentes | Respondido "sim" na Parada 1 ("sim é possível fazer espécies bem diferenciadas"), com as 8 plantas de `editor-folha.png` como base. **Pendente da Parada 2**: fecha com a aprovação explícita |

**Resumo:** 6 PASS (1, 2, 4, 5, 6, 7; o 7 com ressalva de medição ao vivo, ver desvios), 1 PASS com ressalva (3), 1 pendente da Parada 2 (8).

Testes (rodados pelo agente da Task 15 em 2026-11-11, sobre `1458100`): `pnpm api:test` exit 0, 211 testes; `pnpm test` exit 0, 295 testes; `pnpm typecheck` exit 0; `pnpm e2e` 7/7; `pnpm e2e:genesis` 7/7, e `E2E_NEGATE=1` dá 0/7 com exit 1. O controlador repete a bateria antes da Parada 2.

## O que foi construído

Catálogo de 10 peças (boca exatamente uma: raspador, filtro, mandíbula; movimento: flagelo, cílios, aleta; ocelo; cardume; gancho de abrigo; placa) com orçamento de 24 pontos e custo crescente (`diminish` 0,7 para repetidas). A planta (corpo de 3 a 6 pontos com espessura, peças, cores, padrão) é um dado versionado que o editor, o servidor e o cliente leem; as características saem dela por uma função (`Traits`). O cliente desenha qualquer criatura com um desenho procedural único e compartilhado. Servidor: espécies registradas em tempo de execução, 3 fundadoras adultas num lugar sorteado, PostgreSQL + Ecto para criadoras, espécies e extinção, Swoosh com caixa local. Mandíbula caça qualquer menor de outra espécie (sem canibalismo); placa dá chance de escape e freia.

## Decisões durante o gate

**Do autor (Parada 1, 2026-11-10):**

1. Bússola no chão da prévia do editor indicando a frente da criatura, **sem texto**: só anel, marcas e seta (`6e72e56`, `0fa13d3`). A câmera inicial passou a enquadrar corpos grandes.
2. Ajuste leve do catálogo, com valores exatos (`f6a0946`): placa `escape` 0,15 → 0,25 (teto 0,6; `speed_factor` 0,9 igual); mandíbula `cost` 5 → 4 e `metab` 0,020 → 0,010; sorteio (`Random`) com corpos variados (pequeno, médio, grande, 1/3 cada). Flora e demais peças sem mudança.
3. Aprovou variedade, reconhecimento e peças no comportamento (perguntas 1–3).
4. Equilíbrio fino não é critério de aceite (coerente com o design §5.2).

**Do construtor (design §8):**

- **Números do catálogo:** em `shared/genesis/catalog-s1.json`: orçamento 24; corpo com custo por raio (4 por unidade) e raio limitado a 0,4–1,6; máximo de 14 peças; metabolismo = 0,04 + 0,06·raio² + soma das peças; `max` por peça (4 para as de movimento, sentido e placa; 1 para boca, cardume e gancho).
- **Ritmo de vida:** derivado do corpo, não escolhido (tempo de jovem = 60 + 60 × raio s; vida adulta = 500 + 400 × raio s).
- **Nome:** livre e sem filtro; 2 a 32 caracteres (aparados), sem caracteres de controle; nomes repetidos permitidos. Identificação por código curto `S` + base 36.
- **Token:** link único, de uso único, vale 30 minutos (`token_ttl_s: 1800`), guardado só como hash. Limites: 10 envios por 10 min por rede, 3 por hora por e-mail, 20 confirmações por 10 min por rede. Confirmar apaga os outros tokens do e-mail.
- **Reset:** `mix abyss.reset --yes` (`pnpm api:reset`); sem o `--yes` não faz nada.
- **Rota e botão:** `#criar` para a tela de criação, `#confirmar=<token>` para a confirmação; botão "CRIAR ESPÉCIE" no canto inferior direito do mundo; o rascunho é preservado ao voltar ao mundo.
- Fundadoras não contam como nascimento da ecologia (só divisões); `Sim.new` recebe `max_body_radius` em vez de ler o catálogo; a poda das extintas criadas também tira a entrada de `sim.extinct`; JSON inválido responde 400.

## Desvios e pontos em aberto

- **`step_us_max` ao vivo acima de 20 ms.** 24,7 ms na carga 50+2 e 35,2 ms durante a medição do cliente (máximo desde o boot, Docker/WSL2 dividindo CPU com o Chromium e 52 clientes). O `sim_perf_test` isolado dá 12,66 ms com 50 criadas a 250. **Decisão do controlador:** o orçamento de 20 ms é medido pelo teste isolado, como no E2, e os números ao vivo ficam informativos. Os ticks não atrasaram (intervalo p50 99,99 ms, p99 117,8 ms, 0 perdidos). O E2 teve 158 ms no mesmo tipo de pico. Se for o código e não a VM, aparece em produção; o gate O mede de novo.
- **Predador criado não sobrevive a corridas longas.** Nenhum predador criado estava vivo no minuto 60, antes e depois do ajuste leve; a mandíbula típica divide em 20 min em 1 de 5 corridas.
- **Placa escapa pouco em corrida aleatória.** As presas com placa sorteadas são grandes, e o predador só caça presa menor; `hunts_escaped` 0 depois do ajuste. A regra está provada no teste dirigido (45% contra 42,5%) e no cenário dirigido (36%). Pode ser mostrada ao vivo só com cena montada.
- **Espécies criadas morrem cedo.** Com 50 criadas, ~20–25 estão vivas em ~30 min (de 50). Equilíbrio não é aceite. Com as de teste ligadas, `celula` passa de 60% da população nas 3 sementes (61/61/60%); sem elas, uma raspadora passou de 60% em 1 de 3 sementes.
- **Arc sem vsync:** rajadas de tarefas longas no percurso (124 quadros > 33 ms, 77 tarefas longas numa corrida). Não aparecem com vsync nem na RTX. Fora do orçamento; ponto a olhar.
- **Cor da pele domada pelo shader.** O núcleo é discreto e a pele tende ao cinza. O editor mostra o que o mundo mostra, então não há divergência, mas a cor escolhida não aparece "pura".
- **Prod ainda usa Swoosh Local.** E-mail real é do gate O.
- **Corpo grande desenhado mais comprido que o `body_radius`** (espinha de até 4 de comprimento contra raio limitado a 1,6): a câmera de captura chega perto demais e o corpo atravessa o quadro.
- **Fuga para o abrigo:** a captura mostra o rumo para a Floresta, mas longe dela; a chegada ao abrigo não foi capturada.
- **Concern da bússola:** rótulos pequenos em corpos grandes motivaram a versão sem texto. A revisão desse ajuste fica para a revisão final da branch.

Itens menores diferidos (ledger em `progress.md`, linhas "minor (deferred)"), agrupados:

- **Testes mais fracos que o ideal:** teste de lixo raso nas plantas; sem prova de mutação nos testes de esponjas e de máx de raio; e2e "programas" passa se a contagem vier nula; "sem e-mail no fio" só procura um endereço; confirmação `429` com asserção fraca.
- **Erros e segurança menores:** `rescue` amplo em `blueprint.ex` esconde bug interno; qualquer erro de changeset vira `:taken`; `MatchError` se o Mailer falhar (token órfão até expirar); `vary: origin` só nas origens permitidas; `reset --yes` sem guarda de ambiente; ids podados podem ser registrados de novo (inalcançável hoje).
- **Editor:** roda do mouse lê a espessura antiga; contador de hover do zoom pode travar; token repetido na mesma aba não mostra nada; geometria refeita a cada arrasto (medir na Arc); `renderOrder` 1/2 contra 3 de outras espécies.

## Pendências

**Para o S2 (evolução):** mutação (filho com peça a mais ou diferente), seleção natural, espécie se dividindo em variações, canibalismo como característica de mutação. O formato já aceita planta diferente por criatura.

**Backlog (não-metas do S1):** e-mail avisando a criadora (por exemplo da extinção); buscador de espécies; página pública e recuperação (SPEC §5.3); guardar o mundo exato entre reinícios (gate P); serviço de e-mail real (gate O); toque e celular no editor. Do gate E2 segue aberto: "metade da tela fica preta ao se mover" (não investigado).

**Para o gate P/O:** tick no fio de 12,1 kB a 250; broadcast de ~20 ms por tick com 52 clientes; `step_us_max` ao vivo fora de Docker/WSL2.

## Aceite do autor

- **Parada 1** (visual, 2026-11-10): aprovada. Variedade ("sim é possível fazer espécies bem diferenciadas"), reconhecimento no mundo, peças no comportamento; ajuste leve do catálogo; bússola sem texto.
- **Parada 2** (mundo ao vivo, fluxo completo com e-mail real na caixa local, e este pacote): **aguardando.** Critério 8 fecha com a aprovação explícita do autor.
