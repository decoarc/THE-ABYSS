# The Abyss: Gate S2 (Evolução), design

**Data:** 2026-11-13
**Status:** aguardando aprovação do autor (revisado por um construtor independente; perguntas respondidas em 2026-11-13).
**Base:** `main` em `736f155` (PR #4: gate S1 mergeado; ver `docs/GATE_S1_ACCEPTANCE.md`). Branch `gate-s2`.
**Referências:** SPEC (§7.5 aprendizado e evolução, §7.6 medidas de emergência, §16.2 definição de espécie), design do S1 (`docs/superpowers/specs/2026-11-08-gate-s1-genese-design.md`, em especial §7 "Preparar o S2"), design do E2, `docs/ART_DIRECTION.md`.

## 1. Intenção

No S1 cada espécie nasce como a criadora montou, e todos os filhos são cópias. O S2 faz a espécie **se distinguir da sua criação**: ela se ramifica em **subespécies de si mesma**, que se adaptam ao lugar e ao modo de vida onde estão, como na seleção natural de Darwin. A criadora continua sem controle nenhum: quem decide quais variações duram é a ecologia.

O que importa para o autor não é a mutação solta, e sim **ver os ramos se separando**, alguns prosperando e outros se extinguindo, com cada ramo tendo nome e história.

## 2. Metas

1. **Mutação no nascimento.** Às vezes um filho nasce com a planta (o `blueprint` do S1) diferente da do pai (§5.1).
2. **Seleção natural.** As variações não são boas nem ruins por regra: a ecologia do E2 decide quem come, foge, se divide e morre. Mutação não é progresso (SPEC §7.5).
3. **Ramos (subespécies).** Um grupo que acumulou diferenças vira um ramo com nome, lugar no índice, contagem de vivos e extinção próprias (§5.2).
4. **Árvore sem limite de profundidade.** Um ramo pode gerar ramos dele mesmo.
5. **Ritmo:** um ramo deve surgir em cerca de **30 a 60 minutos** de mundo para uma espécie típica (§5.3).
6. **Equilíbrio:** uma espécie criada típica precisa viver o bastante para chegar a ramificar, incluindo predadores criados (§5.4).
7. **Botão da árvore e fluxograma** na tela do mundo (§5.6).
8. **Reinício** preserva a árvore: a espécie mãe e cada ramo vivo voltam com 3 criaturas da própria planta (§5.5).

## 3. Não metas

- **Canibalismo** (decisão: fica fora do S2).
- **Herdar o aprendizado**: o que a criatura aprende em vida não vai para a planta (SPEC §7.5). O S2 não traz aprendizado.
- **Árvore genealógica de indivíduos** (quem é pai de quem para sempre): o fluxograma mostra ramos, não indivíduos.
- **Guardar o mundo exato entre reinícios**: gate P.
- **E-mail avisando a criadora**, buscador de espécies, página pública: backlog.
- **Fluxograma de todas as espécies juntas**: a árvore é de uma espécie de cada vez.
- **Reprodução sexuada / cruzamento entre ramos**: a reprodução continua por divisão.

## 4. Anti-metas

- **Ramos que parecem iguais à mãe.** Todo ramo nasce de diferenças de peças, que são visíveis no corpo. Um ramo idêntico de olhar é falha.
- **Evolução que ninguém vê.** Se as espécies se extinguem antes de ramificar, o gate falhou mesmo com tudo funcionando (por isso §5.4).
- **Um ramo imbatível** que toma o mundo, ou mutação que só melhora (progresso garantido).
- **Comportamento amarrado ao nome** (regra do E2): ramos são caçados e caçam por características, nunca por nome.
- **Perder o que E1, E2 e S1 aprovaram**: visual, desempenho, contagem de programas de shader fixa (não cresce com plantas novas), privacidade do e-mail, "um e-mail = uma espécie".
- **Tráfego que cresce com cada criatura** carregando a planta inteira no fio.

## 5. Decisões do autor

### 5.1 O que muda num filho
- **Peças**: o filho pode **ganhar, perder ou trocar** uma peça. A **boca também pode trocar** (por exemplo, raspador vira mandíbula), mas **bem mais raramente** que as outras peças.
- **Corpo, cores e padrão**: variam **um pouco a cada nascimento**. Não contam para a regra de ramo, mas deixam os ramos distintos de olhar com o tempo.
- **Orçamento**: a mutação **pode passar dos 24 pontos** da criação. O freio é o custo de energia: cada peça aumenta o metabolismo, e uma criatura cara morre de fome se não houver comida.
- Toda planta mutada continua válida para o desenho (limites estruturais do editor: exatamente uma boca, número máximo de peças, raio do corpo etc.). Os limites estruturais valem; o de pontos não.

### 5.2 Ramos
- **Regra de nascimento de um ramo:** existem **pelo menos 5 criaturas vivas** do mesmo ramo com **2 ou mais diferenças de peças** em relação à **planta de referência** do ramo, e esse jeito novo **já passou de pais para filhos** (não são só mutações soltas). Os números 2 e 5 são palpite meu, aceito pelo autor, para acertar numa parada.
- **O que é "um grupo"** (escolha minha, depois da revisão): as 5 criaturas têm **o mesmo conjunto de diferenças de peças** em relação à planta de referência, ou seja, o mesmo jeito novo herdado. 5 criaturas que divergiram cada uma de um jeito não formam ramo. Corpo, cor e padrão podem variar dentro do grupo.
- **A mãe é o ramo raiz** (escolha minha, depois da revisão): tem contagem de vivos e extinção próprias, como qualquer ramo. Se os vivos que ainda são "da mãe" acabam e um ramo vive, o nó da mãe aparece como extinto, com data, e a espécie da criadora continua viva.
- "Diferença de peças" = peça a mais, peça a menos ou peça trocada de tipo. Posição, tamanho e ângulo de uma peça não contam; corpo, cor e padrão não contam.
- **Nome automático:** nome da mãe + região onde estava a maioria quando o ramo surgiu (regiões atuais do mapa: Jardim, Floresta, Planície), por exemplo "Lumina · Floresta". A criadora não dá nome.
- **Planta de referência** de um ramo: a planta mais comum entre os vivos que o formaram, no momento em que ele nasce.
- As criaturas que formaram o ramo **passam a pertencer a ele**, e seus filhos também.
- **Extinção por ramo**, com data. A espécie da criadora só conta como extinta quando ela e todos os ramos acabaram. O e-mail continua preso a ela para sempre (S1).
- **Caça entre ramos:** um ramo com mandíbula pode caçar ramos-irmãos e a mãe, se forem menores, porque contam como "outra espécie". Dentro do mesmo ramo, nunca (sem canibalismo).

### 5.3 Ritmo
Meio-termo: ramos em **~30 a 60 minutos de mundo** para uma espécie típica. A frequência de mutação é calibrada para isso.

**Mundo de referência** (decisão do autor, depois da revisão): o ritmo de §5.3 e o equilíbrio de §5.4 valem num mundo com **cerca de 10 espécies criadas, sem as espécies de teste**, com o teto atual de 250. Com 50 espécies, cobra-se só o desempenho e que **algum** ramo apareça. O teto de população **não muda** no S2.

### 5.4 Equilíbrio dentro do S2
O S2 inclui o trabalho de equilíbrio que o S1 deixou em aberto (`GATE_S1_ACCEPTANCE.md`, "Desvios"): com 50 criadas, metade some em ~30 min; nenhum predador criado vive até o minuto 60. **Meta:** uma espécie típica vive o bastante para ramificar dentro da janela de §5.3, e um predador criado típico consegue sobreviver. Equilíbrio fino não é aceite; "quase todas morrem antes de ramificar" é falha.

### 5.5 Reinício e reset
- **Reinício normal:** **cada ramo ainda vivo**, incluindo a mãe se ela ainda tem vivos, volta com **3 criaturas da própria planta de referência**, em lugar sorteado (regra do S1 aplicada a cada ramo). Um ramo extinto, inclusive a mãe, não volta. Provisório até o gate P.
- **Reset total:** apaga espécies e ramos, como no S1.

### 5.6 Tela: botão da árvore e fluxograma
- **Botão minimizado** com ícone de árvore num canto da tela do mundo.
- Ao clicar, abre um **fluxograma** da árvore de **uma espécie**: a da criatura seguida. Se ninguém está sendo seguido, mostra uma lista curta para escolher a espécie.
- Cada nó: nome do ramo, vivos (ou "extinta" com data). Com **rolagem** quando a árvore crescer.
- **Clicar num ramo** leva a câmera até uma criatura viva dele, como o índice já faz.
- O **índice** mostra os ramos embaixo da mãe.

Esboço:
```
 ┌───┐     ┌──────────────────────────────────────┐
 │ 🌳 │ ──▶ │ Lumina  (criada em 12/11)   ✕ fechar │
 └───┘     │   ├── Lumina · Floresta    18 vivos  │
           │   │      └── Lumina · Planície 6 vivos│
           │   └── Lumina · Jardim  extinta 13/11 │
           │                               ↕ rola │
           └──────────────────────────────────────┘
```

## 6. Abordagem (escolhida pelo autor)

Consideradas:
1. **Varredura periódica + tabela de plantas (escolhida).** Cada criatura tem a própria planta; plantas iguais são guardadas uma vez numa tabela (o "genótipo"), e a criatura aponta para ela. O cliente recebe a tabela no snapshot e depois só as plantas novas. A cada ~10 s o servidor confere os vivos de cada ramo pela regra de §5.2 e cria os ramos novos. Barata com 250 criaturas, simples de testar.
2. **Conferir a cada nascimento**, com contadores incrementais. Ramos uns segundos antes, mas contadores difíceis de manter certos com mortes, mudanças de ramo e reinícios. Para ramos de 30–60 min, sem ganho visível.
3. **Árvore genealógica completa** de indivíduos, com ramos por agrupamento de parentesco. Cresce sem parar e o fluxograma não mostra indivíduos.

O autor escolheu a 1.

## 7. Contexto do código atual (restrições)

- `Abyss.World.Organism` tem `species` (átomo; as criadas usam ids `sp<N>`), `generation` e `parent_id`, mas **não tem planta própria**: as características vêm da espécie. O S2 dá a cada criatura uma referência ao seu genótipo e ao seu ramo.
- Características saem da planta por uma função (`Abyss.Genesis.Traits`); o S2 calcula as características **por genótipo** (com cache), não por espécie.
- A divisão está em `Abyss.World.Sim` (`complete_divisions`/`start_divisions`): é onde a mutação entra.
- A caça da mandíbula compara "outra espécie" por `species`; passa a comparar por ramo.
- O snapshot e o tick (`Abyss.World.Wire`) carregam `species` e nascimentos; ganham genótipos novos e ramos novos. O índice e o painel já recebem espécies em tempo de execução (`sp`).
- O banco tem `species` (`SpeciesRecord`: criadora, nome, código, planta, extinção). O S2 acrescenta os **ramos** (mãe, nome, planta de referência, nascimento, extinção), sem mexer na restrição "um e-mail = uma espécie".
- O cliente já desenha qualquer criatura com um desenho procedural compartilhado guiado por dados de instância (S1 §7). A contagem de programas de shader não pode crescer por planta.
- Espécies de teste (`ABYSS_TEST_SPECIES`) não têm planta; ficam **sem mutação** (só desenvolvimento).
- **Catálogo** (escolha minha, depois da revisão): o ajuste de equilíbrio edita o catálogo atual e vale para todas as espécies, já publicadas ou não, e para as plantas mutadas. O The Abyss ainda não foi publicado (gate O), então não há espécies reais a preservar; não há catálogo paralelo nem migração de `ruleset`.
- **Teto de população** (`pop_cap` 250) não muda (§5.3).

## 8. Deixado ao construtor

- Probabilidades de mutação (ganhar, perder, trocar peça; boca bem mais rara) e o tamanho das variações de corpo, cor e padrão; calibrados para §5.3.
- O que mudar no equilíbrio (§5.4): comida, ritmo de vida, custo de peças, caça; com medição em corridas longas e com 50 espécies.
- Como verificar "já passou de pais para filhos" (por exemplo, exigir que parte do grupo seja de geração posterior à primeira que carregou a diferença).
- Intervalo exato da varredura e o desempate quando dois grupos se qualificam ao mesmo tempo.
- Nomes repetidos (dois ramos da mesma mãe na mesma região): sufixo numérico ou equivalente.
- Limite de genótipos guardados (coleta dos que não têm mais vivos) e formato no fio.
- Arte do botão, do ícone e do fluxograma, seguindo `docs/ART_DIRECTION.md`; desenho do índice com ramos.
- Como o painel mostra o ramo da criatura seguida.

## 9. Critérios de aceite (proposta)

1. Num mundo de teste com mutação forçada, um ramo nasce exatamente quando a regra de §5.2 é cumprida, e não antes; teste automático.
2. No mundo de referência (~10 criadas típicas, sem espécies de teste), ramos aparecem na janela de ~30–60 min de mundo, em várias sementes.
3. No mesmo mundo, uma espécie criada típica e um predador criado típico vivem o bastante para ramificar (meta de §5.4), medido em corridas longas. Com 50 espécies, pelo menos algum ramo aparece.
4. Criaturas mutadas são desenhadas com a própria planta, e o autor reconhece na parada visual que os ramos se distinguem da mãe de olhar.
5. O botão da árvore abre o fluxograma da espécie seguida; clicar num ramo leva a câmera até uma criatura viva dele; rolagem funciona com árvores grandes.
6. Depois de um reinício, a mãe e os ramos vivos voltam com 3 criaturas da própria planta; ramos extintos continuam extintos, com data.
7. Com 50 espécies e seus ramos, cliente e servidor dentro do orçamento do E2; a contagem de programas de shader não cresce com plantas novas; o tráfego não cresce com a planta inteira por criatura.
8. O e-mail continua fora de tudo que chega aos clientes e dos logs; "um e-mail = uma espécie" continua garantido.
