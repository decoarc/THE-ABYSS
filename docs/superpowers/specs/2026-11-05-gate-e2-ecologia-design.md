# The Abyss: Gate E2 (Ecologia), design

**Data:** 2026-11-05
**Status:** rascunho para aprovação do autor (revisado por um construtor independente; perguntas respondidas em 2026-11-05).
**Base:** `main` em `670f7ae` (PR #2: gate E1 mergeado; ver `docs/GATE_E1_ACCEPTANCE.md`). O E2 segue na branch `gate-e`.
**Referências:** SPEC (§7 autonomia e ecologia, §11 desempenho, §14 gates), design do E1 (`docs/superpowers/specs/2026-11-01-gate-e1-mundo-grande-design.md`, sobretudo §9), `docs/ART_DIRECTION.md`. Esboços de leitura visual: `.superpowers/brainstorm/4165-1793892427/content/ciclo-na-tela.html`.

> No working tree o SPEC aparece como `SPEC (2).md`, com conteúdo idêntico ao `SPEC.md` versionado. Este documento chama os dois de "SPEC".

## 1. Intenção

O E1 deixou o mundo grande, com três regiões e comida funcionando, mas comer não muda nada na criatura. O E2 fecha o **ciclo de alimentação**: comer dá energia, viver gasta energia, quem enche se divide, quem zera morre, e o corpo morto vira alimento para outros.

Para o autor, a ecologia está funcionando quando **o ciclo de alimentação funciona junto com a ambientação**: cada região importa para quem vive nela. Olhando o mapa, dá para entender quem come o quê pela distribuição dos seres. Os herbívoros ficam no Jardim, perto das fontes. Os filtradores ficam na Planície, sob a neve de partículas. Os caçadores andam atrás das presas. A Floresta é refúgio de quem foge.

**As 5 espécies atuais são só de teste.** No projeto final elas não existem. Em produção o mundo começa sem espécies, até um usuário criar uma no gate S. Por isso **nenhum comportamento pode depender do nome da espécie**. Tudo sai de características genéricas (o que come, porte, se precisa de abrigo, tempos de vida...). As espécies de teste são só um conjunto de valores preenchidos nesse molde, e as espécies do gate S vão usar o mesmo molde sem a ecologia precisar mudar.

## 2. Metas

1. **Energia.** Cada organismo tem energia. Viver e nadar gastam; comer devolve.
2. **Duas fases de vida, jovem e adulto.**
   - O adulto cheio de energia **se divide**: continua adulto e da divisão nasce um **jovem menor**.
   - O jovem é igual ao adulto em tudo, **só é menor e não se divide**. Se sobreviver por um tempo de desenvolvimento (característica da espécie), vira adulto.
3. **Predação.** Caçadores perseguem e comem presas da sua dieta. **Só come quem é maior que a presa**, e o jovem, por ser menor, entra nessa conta. Presas percebem caçadores próximos e fogem; quem precisa de abrigo foge para a Floresta.
4. **Morte** por três causas: **fome** (energia zera), **predação** e **velhice** (um tempo máximo de vida contado **a partir da fase adulta**; o jovem não envelhece). O corpo **se desfaz em partículas luminosas**, que entram no estoque de comida animal do mundo.
5. **Extinção real e permanente.** Quando morre o último indivíduo, a espécie fica no índice como **extinta, com data**, e nunca volta sozinha.
6. **Ambientação.** Como consequência das regras acima e das fontes de comida do E1, a distribuição pelo mapa conta a cadeia alimentar (§1).
7. **Leitura visual do ciclo** nas direções escolhidas pelo autor (§5.4).
8. **Painel** ganha energia, fase (jovem/adulto), geração, o que come e de quem nasceu.
9. **Medição** para experimento repetível (SPEC §7.6): população por espécie ao longo do tempo, nascimentos e mortes com causa, reproduzíveis com a mesma semente (`ABYSS_SEED`).

## 3. Não metas

- **Mutação.** Decisão do autor: tirada do E2. O jovem nasce com as mesmas características do pai. Volta junto com o desenvolvimento das espécies reais. (Isso substitui a "mutação simples" listada no §9 do design do E1.)
- **Equilíbrio da cadeia de teste.** Não é critério de aceite. Se a cadeia de teste quebrar e uma espécie sumir, é o mundo funcionando, não defeito. Ajuste fino de equilíbrio fica para depois das espécies reais.
- **Adaptação**: migração por necessidade, ganho de habilidades ("perks"), evolução, aprendizado (SPEC §7.5). Tudo depois do gate S.
- **Exploração mais funda da velhice** (envelhecimento gradual, efeitos da idade). O autor vai explorar isso no desenvolvimento das criaturas; aqui é só um tempo máximo.
- **Comportamento próprio do jovem** além de ser menor e não se dividir (não fica perto do pai, não come coisa diferente, não nada diferente).
- **Sinais e comunicação** (SPEC §7.4), cooperação, estratégias de caça elaboradas.
- **Criação de espécies, login e banco** (gate S) e **persistência** (gate P). O mundo segue só em memória; o arquivo permanente de extintas é do gate P.
- **Repovoamento automático** de espécies extintas.
- **Mudanças na interface** além dos campos novos do painel e do estado "extinta" no índice.

## 4. Anti-metas (falhas mesmo que "funcione")

- **Comportamento amarrado ao nome da espécie** (`if species == :membrana`). Qualquer regra tem que valer para uma espécie nova que só traga valores diferentes.
- **Ciclo invisível.** Se o autor não *vê* caça, morte virando partículas, divisão e fome (pelo brilho), o gate não fecha, mesmo com os números certos.
- **Regiões sem função ecológica**: criaturas espalhadas ao acaso, sem relação com onde está sua comida ou seu abrigo.
- **Morte ou nascimento que "pisca"**: criatura que some ou aparece de repente, sem o desfazer em partículas ou a divisão.
- **Observadores vendo mundos diferentes**: duas abas discordando de quem está vivo, de quem nasceu ou de qual espécie está extinta.
- **Recuperação disfarçada**: extinção que volta sozinha, população "reposta" para manter o mundo bonito.
- **Perder o que o E1 aprovou**: qualidade visual, câmera, desempenho (`step_us_max` do servidor e quadros no cliente).

## 5. Decisões do autor

### 5.1 Modelo genérico de espécie
- O comportamento sai de **características da espécie**, nunca do nome. As que o E2 precisa (nomes finais e formato ficam com o construtor): o que come (flora, partículas ou outras espécies, e quais), porte, se precisa de abrigo, tempo de desenvolvimento do jovem, tempo máximo de vida adulta, além das que o E1 já tem (velocidade, percepção etc.).
- A cadeia das espécies de teste, já decidida: **Célula e Casco comem flora; Membrana filtra partículas; Filamento caça Células; Poliedro caça Filamentos e Células.** A Célula anda em grupo.

### 5.2 Ciclo de vida
- Energia: gasta com o tempo e com o nado; comer devolve. Zerou, morre de fome.
- Divisão quando o adulto enche de energia: o adulto continua adulto, nasce um jovem menor.
- Jovem: só menor e sem divisão. Passado o tempo de desenvolvimento, vira adulto.
- Velhice: tempo máximo de vida contado a partir da fase adulta.

### 5.3 Predação, fuga e abrigo
- Só caçadores comem outras criaturas, só das espécies da sua dieta, e só se forem maiores que a presa.
- Presas percebem caçadores próximos e fogem; quem precisa de abrigo foge em direção à Floresta.

- **Filamento × Célula:** pela regra do porte, o Filamento (menor que a Célula adulta, tamanho aprovado no E1) **só come Células jovens**. O porte usado na regra é o tamanho do corpo; não se cria um "porte" separado nem se muda o visual do Filamento. (Decisão do autor, 2026-11-05.)

### 5.3.1 Limite de população
- **Sem limite ecológico:** a comida é o único freio do crescimento.
- **Teto de proteção de 250 organismos** (abaixo do limite técnico de 400 do `Sim`, para trabalhar com folga). Configurável. Ao atingir o teto, a divisão espera (o adulto continua cheio) até abrir espaço; ninguém é removido nem reposto. As medições registram quando o teto está segurando divisões. (Decisão do autor, 2026-11-05.)
- O orçamento de desempenho do §7 é medido com a população no teto (250).

### 5.4 Leitura visual (escolhidas nos esboços)
- **Caça: silenciosa (1-A).** O caçador só acelera e alcança; a presa some ao ser comida. Sem rastro nem brilho de caça.
- **Morte: se desfaz devagar (2-A).** O corpo se apaga e se desmancha em poucos pontos de luz do mesmo tipo das partículas da Planície, que flutuam e se apagam aos poucos. Sem clarão.
- **Divisão: estica e se parte (3-A)**, com um adendo do autor: é a **divisão do núcleo**. A criatura alonga e se parte; o adulto segue adulto e o outro lado é um **ser menor** (o jovem), que cresce até virar adulto.
- **Fome: o brilho é a energia (4-A).** Cheia brilha forte; com fome fica apagada e tremeluz. Dá para ler o estado do bando só olhando.

### 5.5 Extinção e painel
- Extinta: some do mundo, continua no índice como "extinta", com data.
- Painel: energia, fase, geração, o que come, de quem nasceu.

## 6. Calls do construtor já feitos nesta conversa (palpites aceitos pelo autor)

- Nadar rápido (caçar, fugir) gasta mais energia que nadar devagar.
- O abrigo funciona porque o caçador tem mais dificuldade de alcançar a presa dentro da Floresta.
- O servidor registra população por espécie, nascimentos e mortes com causa.

Decisões do construtor tomadas depois da revisão (o autor pode vetar):
- **Partículas do corpo entram no mesmo estoque de partículas do mundo** (é o que a direção 2-A mostra: "do mesmo tipo das partículas da Planície"). Quem come são os filtradores (dieta de partículas), e elas contam no teto de partículas. Sem estoque separado de carniça.
- **Andar em grupo** vira uma característica genérica simples (coesão com vizinhos da mesma espécie), ligada na Célula. O gate I prometeu o cardume para o gate E, e ele muda como caça e fuga ficam na tela. Custo de vizinhança usa a grade existente.
- **Critério de semente (§8.6)** é verificado com uma execução offline do `Sim.step` com passo fixo (script ou mix task), não com dois servidores ao vivo, que usam o relógio real.
- **"Nada amarrado ao nome da espécie" (§8.8) vale para as regras da simulação no servidor.** No cliente, cada espécie de teste mantém seu componente, mas brilho de energia, desfazer em partículas, divisão e crescimento do jovem são feitos como efeitos compartilhados, aplicados aos cinco componentes. Um desenho genérico para espécies novas é assunto do gate S.

## 7. Restrições e contexto do código atual

- **Servidor (Elixir/Phoenix):** `apps/api/lib/abyss/world/`. `sim.ex` (passo da simulação), `organism.ex` (struct do organismo: `id, species, born_ms, pos, vel, yaw, pitch, mode, mode_left, target, sated_left`), `species.ex` (tabela fixa das 5 espécies; `diet: :flora | :particles | :none`), `flora.ex`, `particles.ex`, `grid.ex` (grade espacial de célula 8, usada para vizinhança), `map.ex`, `wire.ex` (formato das mensagens). Config em `apps/api/config/config.exs` (`:world` e `:food`), população por `ABYSS_POPULATION`, semente por `ABYSS_SEED`.
- **Hoje no E1:** a criatura vai até a comida, morde, fica "saciada" por `sated_s` e volta a vagar; Filamento e Poliedro têm `diet: :none` e só se movem. Ninguém nasce nem morre. O E2 parte disso.
- **Cliente:** um componente por espécie em `apps/web/src/organisms/`, dados do servidor interpolados (`services/interpolate.ts`, `worldStore.ts`). Brilho em `creatureGlow.ts`. Comida em `apps/web/src/food/`. Painel `ui/InspectPanel.tsx`, índice `ui/SpeciesIndex.tsx`.
- **Luzes:** a reserva fixa de 4 luzes (commit `064a305`) existe porque mudar a contagem de luzes recompila shaders e trava. Nascimentos e mortes **não podem** mudar a contagem de luzes nem de materiais em tempo de execução.
- **Desempenho:** `step_us_max` do servidor dentro de 20 ms com a população de teste (com a grade, o step ao vivo ficou em ~3,3 ms). Medir também **voando** com a câmera, não só parado (lição do E1: p50/p95 escondem congelamentos raros).
- **Ferramentas existentes a estender, não refazer:** e2e (`scripts/e2e/run.mjs`), carga (`scripts/load/observers.mjs`), medição (`scripts/perf/measure.mjs`), `?flypath`.
- **Produção sem espécies:** `test_species: false` continua dando um mundo só com comida, sem erros (painel e índice vazios sem quebrar).
- O autor prefere decisões apresentadas **uma por vez**, com opções e uma recomendação, e paradas visuais para aprovar o que se vê.

## 8. Critérios de aceite

1. O autor observa o mundo de teste e **reconhece a cadeia** na distribuição pelas regiões e em quem come, foge, morre e se divide.
2. Cada momento do ciclo aparece na tela nas direções do §5.4, aprovado numa parada visual: caça, morte virando partículas, divisão com jovem, crescimento para adulto, fome pelo brilho.
3. Extinção: uma espécie que perde o último indivíduo aparece como extinta, com data, em todas as abas, e não volta.
4. Painel mostra os campos novos, corretos para o indivíduo selecionado; seguir um indivíduo que morre não quebra a câmera nem o painel.
5. Duas abas concordam sobre vivos, nascimentos, mortes e extinções (e2e).
6. Mesma semente, mesmo resultado nas medições do servidor (população, nascimentos, mortes por causa), dentro do que o determinismo atual garante.
7. Desempenho dentro do orçamento do E1 com 250 organismos (o teto), medido parado e voando, e carga com observadores passando.
8. Nada de regra amarrada a nome de espécie (verificável em revisão de código e por um teste com uma espécie inventada só de valores).
9. **Aprovação explícita do autor.**

## 9. Deixado ao construtor

- Formato do modelo genérico de espécie e nome das características; valores das espécies de teste (energia, custos, tempos de desenvolvimento e vida, porte do jovem), **podendo ajustar valores das espécies de teste** para que cada elo da cadeia aconteça de fato de vez em quando. Equilíbrio não é exigido.
- Fórmulas de gasto e ganho de energia, limiar de divisão e como a energia se reparte entre adulto e jovem.
- Como o caçador escolhe e persegue, quando desiste; como a presa percebe e foge; como a Floresta dificulta a caça.
- Quantas partículas um corpo vira e se elas respeitam o teto de partículas do mundo.
- Como o jovem cresce visualmente até o tamanho adulto.
- Formato das mensagens de nascimento, morte e extinção; como as medições são expostas (endpoint de stats, log, script).
- Valores finos do brilho de energia, mantendo a leitura de "cheia / média / fome".
- Organização das paradas visuais.
