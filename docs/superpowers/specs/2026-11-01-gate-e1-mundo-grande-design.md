# The Abyss: Gate E1 (Mundo grande), design

**Data:** 2026-11-01
**Status:** aprovado pelo autor em 2026-11-01. E1 e E2 são feitos na mesma branch (`gate-e`).
**Base:** `main` em `d22acef`, com o gate I fechado (ver `docs/GATE_I_ACCEPTANCE.md`).
**Referências:** SPEC (§3.3 cena, §6–§7 criação e ecologia, §11 desempenho, §14 gates), `docs/ART_DIRECTION.md`, design do gate I (`docs/superpowers/specs/2026-10-31-gate-i-observacao-design.md`).

> Nota: no working tree o SPEC aparece como `SPEC (2).md`, com conteúdo idêntico ao `SPEC.md` versionado. Este documento chama os dois de "SPEC".

## 1. Intenção

O Abyss é um terrário compartilhado: um único mundo em tempo real, igual para todos, onde vão conviver espécies criadas por usuários. A inspiração declarada do autor é a **sensação do estágio celular do Spore**: uma cadeia alimentar visível, coisas pequenas comendo partículas, coisas maiores caçando as menores. Aqui ela vem em 3D, com a estética própria do Abyss e com o mundo **totalmente autônomo**: ninguém controla criaturas, o visitante só observa. A referência é de sensação e não de conteúdo. Nada de mecânicas, formas ou interface copiadas.

O gate E (Ecologia) foi dividido em duas etapas:
- **E1, mundo grande** (este documento): o mundo fica grande o bastante para sustentar um ecossistema, ganha regiões com funções diferentes na cadeia alimentar, e as **fontes de comida passam a existir e funcionar**.
- **E2, ecologia:** energia, fome, divisão com mutação, morte e extinção. Terá documento próprio. As decisões já tomadas estão no §9.

O E1 vem primeiro porque o lugar onde a comida nasce depende das regiões, e porque a arte das regiões novas é a parte que mais depende da aprovação visual do autor.

## 2. Metas

1. **Mapa muito maior**, com três regiões, cada uma com raio entre **20 e 50**, variando de uma para outra:
   - **Jardim Hidrotermal** (a cena atual, reaproveitada): rico em **comida vegetal**.
   - **Planície da Neve Marinha:** rica em **comida animal** (partículas).
   - **Floresta de Esponjas de Vidro:** região de **abrigo**, com pouca comida.
2. **Transições suaves** entre as regiões, sem portas nem telas de carregamento. Uma criatura atravessa o mapa nadando.
3. **Mapa extensível:** acrescentar uma região depois (o autor já pensa em outras, como a Fossa Escura ou o Campo Frio) não pode exigir refazer as existentes.
4. **Criaturas menores**, para dar perspectiva de mapa grande.
5. **Câmera livre** (nadar) mais o **Seguir** que já existe, com o visitante começando num **ponto aleatório** do mapa.
6. **Fontes de comida funcionando** e canônicas no servidor, iguais para todos os observadores:
   - **Flora** cresce aos poucos até um teto, mais perto das fontes hidrotermais, e cresce mesmo sem ninguém comer.
   - **Partículas luminosas** (restos de seres que já viveram) são espalhadas pelo mundo, sobretudo na Planície, se apagam com o tempo e têm teto.
   - **Criaturas comem:** vão até a comida próxima, a comida diminui ou some e depois volta.
7. **~150 organismos** das espécies de teste no mapa, número medido e ajustável (§8).

## 3. Não metas

- **Efeito da comida na criatura:** energia, fome, divisão, mutação, morte, extinção e os campos novos do painel (energia, geração, origem). Tudo isso é o E2.
- **Predação.** Ninguém morre no E1, então Filamento e Poliedro não caçam. Eles só se movem (§8).
- **Aprendizado** (SPEC §7.5), que fica para depois do E2.
- **Regiões além das três.**
- **Câmera livre em celular ou tela de toque.** Ali valem o Seguir e o giro em torno do lugar atual (§8).
- **Criação de espécies, login e banco de dados** (gate S), e **persistência** (gate P). O mundo continua só em memória, e reiniciar o servidor recria tudo.
- **Mudanças na interface** além do necessário para a câmera livre. O painel e o índice continuam como estão.

## 4. Anti-metas (falhas mesmo que "funcione")

- **Visual pior que o aprovado.** Criaturas menores não podem perder a leitura e a qualidade do protótipo 2. Regiões novas no nível de um rascunho não fecham o gate.
- **Regiões que parecem cópias do Jardim** com outra cor, sem identidade nem função própria.
- **Mapa grande e morto:** quilômetros de nada, sem vida à vista. O visitante não pode começar num canto vazio.
- **Comida invisível ou abstrata.** Se o autor não *vê* a flora crescer e ser comida e as partículas caírem e sumirem, o critério 2 não fecha, mesmo com os números certos.
- **Câmera que enjoa ou bate seco:** parada brusca, parede invisível dura ou atravessar o chão.
- **Observadores vendo comida diferente:** flora ou partículas em lugares ou quantidades diferentes entre duas abas.
- **Antecipar o E2** (energia, morte) "porque é fácil".

## 5. Decisões do autor

### 5.1 Mapa e regiões
- As três regiões e as funções de cada uma estão no §2. O Jardim é a cena atual reaproveitada como uma região.
- **Raio de cada região entre 20 e 50.** O tamanho de cada uma dentro dessa faixa é decisão do construtor, por exemplo um Jardim compacto e uma Planície ampla.
- Mais regiões no futuro.

### 5.2 Direção de arte das regiões novas
Escolhida entre dois esboços por região (`.superpowers/brainstorm/1610-1793544738/content/regioes-e1.html`):
- **Planície: "Neve silenciosa".** Chão de sedimento aberto, dunas baixas, quase vazio, com partículas caindo devagar do alto. Muito espaço negativo, e a luz vem principalmente da comida no chão.
- **Floresta: "Treliça".** Esponjas em forma de cesto, entrelaçadas e relativamente baixas, em tom violeta. As criaturas podem se esconder dentro delas, e a região é mais densa e labiríntica.
- A paleta e a atmosfera (luz, névoa, bloom) são as do protótipo aprovado. Os esboços são de clima e não arte final.

### 5.3 Criaturas
- **Ficam menores.** A suposição inicial é cerca de metade do tamanho atual. O valor exato é decidido numa parada visual (§7). Isso substitui a decisão de escala do gate I (§9 daquele design), em que as criaturas mantinham o tamanho.
- No E1 elas continuam **só se movendo**, como no gate I, mais o comportamento de ir até a comida e comer (§5.5).

### 5.4 Câmera e entrada
- **WASD nada e o mouse olha.** A câmera não atravessa o chão e não sai do mapa.
- O **Seguir** continua existindo.
- O visitante **começa num ponto aleatório** do mapa (§6 detalha).

### 5.5 Comida
- **Alimentação simples:** a criatura chega à comida e come, sem digestão ou nutrientes.
- **Flora:** cresce aos poucos sem ninguém comer, até um teto, para não sobrecarregar o servidor. *Suposições minhas, aceitas pelo autor:* cresce mais perto das fontes hidrotermais, e quando é comida diminui e volta a crescer.
- **Partículas:** o mundo as espalha sozinho, "como restos de seres que nunca vimos", para os carnívoros terem comida mesmo sem mortes. No E2 as mortes também vão gerar partículas. *Suposições minhas, aceitas:* elas se apagam e somem com o tempo e têm teto.
- **Quem come o quê** depende da espécie (§9). No E1 comem só os que comem flora e partículas.

### 5.6 Espécies
- **Em produção o mundo começa sem nenhuma espécie**, só com flora e partículas, até um usuário criar a primeira no gate S.
- As cinco criaturas do protótipo (Membrana, Filamento, Casco, Célula, Poliedro) são **espécies de teste**. Existem no ambiente de desenvolvimento e nos experimentos, nunca em produção.

## 6. Critérios de aceite (E1 fechado)

1. **Navegar e aprovar o visual.** O autor nada pelas três regiões com a câmera livre e aprova cada uma, nas paradas do §7, incluindo o tamanho novo das criaturas. Aceite explícito, registrado no estilo de `docs/VISUAL_ACCEPTANCE.md`.
2. **Comida funcionando, visível e comprovada:**
   - o autor vê a flora crescer e ser comida, e as partículas caírem, serem comidas e se apagarem;
   - medições confirmam que, sem ninguém comendo, a flora para no teto e as partículas não passam do teto e somem com o tempo;
   - com criaturas comendo, a quantidade de comida cai e se recupera.
3. **Um mundo só, inclusive a comida:** duas abas veem a mesma flora e as mesmas partículas (mesmas posições e quantidades, com a defasagem do gate I), além dos mesmos organismos.
4. **Desempenho medido** com o mapa grande, ~150 organismos e a comida no teto, no orçamento do protótipo 2 (Arc `low` com p95 ≤ 33 ms; RTX `high` com p50 ≤ 16,7 ms), mais a carga do servidor com 50 observadores, no mesmo espírito do gate I.
5. **Testes automatizados** do crescimento e do teto da flora, do teto e do apagamento das partículas, do consumo, dos limites da câmera e da consistência entre servidor e cliente.

## 7. Paradas para o autor durante a execução

Como no gate I: em cada parada o construtor mostra capturas ou vídeo e pede uma decisão, uma por vez, com recomendação.

1. **Escala e mapa em rascunho:** o mapa grande com as três regiões em forma bruta (sem arte final), as criaturas no tamanho novo e a câmera livre funcionando. Decide o tamanho das criaturas e se o mapa "parece grande". Acontece antes de investir em arte.
2. **Planície:** a arte da Neve silenciosa.
3. **Floresta:** a arte da Treliça, incluindo como a câmera e as criaturas lidam com a densidade.
4. **Comida:** vídeo da flora crescendo e sendo comida, e das partículas caindo e sumindo. Fecha os critérios 1 e 2.

**Parada 1, decidido pelo autor em 2026-11-01** (capturas em `docs/captures/e1/parada-1/`):

- Tamanho das criaturas: `creature_scale` 0,5 (metade do gate I).
- Tamanho do mapa: mantido (Jardim r 30, Floresta r 30, Planície r 45).
- Sensação da câmera (testada à mão em 2026-11-04): aprovada com os valores atuais (velocidade máxima 6, aceleração 8, arrasto 2,5; W anda na direção do olhar; borda macia a 6 da borda).
- Travamentos no voo (achados no mesmo teste, corrigidos e aprovados em 2026-11-04): congelamentos de 0,3 a 1,5 s eram shaders recompilados porque cada Casco tinha uma luz pontual dentro do grupo descartado por distância, e o número de luzes da cena mudava a cada Casco que entrava ou saía do alcance. Agora há uma reserva fixa de 4 luzes (`organisms/creatureLights.tsx`) que vai para os Cascos mais próximos. Fica em aberto, sem bloquear: um material visto pela primeira vez no meio do voo ainda compila ali (até ~250 ms, uma vez por sessão); a pré-compilação na tela de carregamento é candidata para depois.

**Parada 2, decidido pelo autor em 2026-11-04** (capturas em `docs/captures/e1/parada-2/`):

- Planície ("Neve silenciosa"): aceita como está. O chão fica escuro e aberto, e a luz vem das partículas de comida perto da câmera; a neve que cai é 1,5× a do Jardim, e as poças âmbar grandes ficam.
- Transição Jardim → Planície: alongada do lado da Planície, de r 26 até ~40 a partir do centro do Jardim (antes 26 → 32). Névoa, luz, cor do chão, luz da comida e neve usam o mesmo peso. Nada muda dentro de r ≤ 26.
- Flora no miolo do Jardim: fica. As manchas passam a fazer parte do quadro herói aprovado.

## 8. Decisões minhas (Claude), a conferir pelo autor

- **O que o "raio 20–50" mede:** a área nadável e composta de cada região, ou seja, o chão com arte própria e o volume onde as criaturas nadam, no mesmo sentido do raio 28 do gate I (`config.exs`). O leito de raio 60 de hoje (`SEABED_RADIUS`) é em grande parte chão engolido pela névoa e não conta.
- **O Jardim mantém a composição aprovada:** fontes, corais, poças e o quadro herói continuam como estão, com raio por volta de 28–30. O chão excedente em volta (até o raio 60) dá lugar às transições para as regiões vizinhas. Ninguém reescala nem recorta o miolo aprovado: o resto do mundo se ajusta ao Jardim.
- **Tamanho total como ponto de partida:** Jardim com raio ~30, Floresta ~30 e Planície ~45. A soma das áreas fica umas 5 vezes a área nadável do gate I. A Parada 1 ajusta isso.
- **População de ~150 organismos.** No gate I eram 45 num raio de 28. Com o mapa ~5 vezes maior em área e as criaturas menores, 150 dá uma densidade parecida. O número é configurável e sai de medição. Se o orçamento não fechar, a população diminui e o motivo vai para o relatório (mesma regra do gate I).
- **Detalhes da câmera livre:**
  - olhar segurando o botão esquerdo e arrastando, sem travar o cursor, para não brigar com cliques no painel, no índice e nas criaturas; um clique curto continua selecionando, como hoje;
  - Espaço sobe e Shift desce;
  - movimento com inércia suave, como debaixo d'água;
  - desliza pelo chão em vez de atravessar, e na borda do mapa há uma resistência macia, como uma corrente empurrando de volta.
- **Seguir na câmera livre:** apertar WASD durante o Seguir solta a criatura e devolve o controle. O Esc continua soltando. Ao soltar, a câmera fica onde está, porque não existe mais um quadro herói fixo para onde voltar.
- **O quadro herói deixa de ser o enquadramento inicial.** Vira só um lugar bonito do Jardim. A zona livre em volta da câmera herói (`exclusion` em `apps/api/config/config.exs`) perde a razão de existir.
- **Ponto de partida aleatório com vida por perto:** o visitante surge num ponto aleatório, mas próximo de organismos ou de comida visível, nunca num canto vazio. Cada visitante sorteia o seu.
- **Regiões lado a lado:** as bordas se misturam (chão, luz e névoa fazem a transição), sem portas.
- **Quem come no E1:** Célula e Casco comem flora; a Membrana come partículas. Filamento e Poliedro só se movem até o E2, porque caçar implica morte.
- **Onde as criaturas ficam:** não existe um conceito de "habitat" fixo por espécie. As criaturas **tendem a ir para onde está a sua comida**, com algum vagar entre regiões:
  - quem come flora fica mais no Jardim;
  - a Membrana fica mais na Planície;
  - Filamento e Poliedro circulam pelo mapa todo, incluindo a Floresta, e no E2 essa circulação vira caça.
  
  Assim nenhuma região fica vazia, e o E2 herda o comportamento sem reescrita. A distribuição inicial segue a mesma lógica.
- **Criaturas e as esponjas da Floresta:** no E1 as criaturas contornam ou atravessam as treliças sem colidir de forma visível. O servidor conhece as esponjas como formas simples (cilindros ou cápsulas) para desviar delas. Entrar e se esconder dentro das treliças é comportamento de abrigo e fica para o E2.
- **Medição de desempenho (critério 4)** em dois cenários repetíveis, com semente fixa e a comida no teto:
  - um **percurso fixo de câmera** pelas três regiões;
  - um **ponto de pior caso** dentro da Floresta densa, com muitos organismos à vista.
  
  Os dois precisam caber no orçamento.
- **Celular e tela de toque:** o visitante começa no mesmo ponto aleatório com vida por perto. O giro (órbita) acontece em torno desse ponto, e o Seguir é o jeito de viajar pelo mapa. Ao soltar o Seguir, a câmera fica onde está e a órbita passa a girar em torno do lugar atual. O modo "returning" ao quadro herói deixa de existir.
- **Flora que é comida precisa ser reconhecível.** A comida deve ser legível como comida, por exemplo o crescimento luminoso do chão ou tapetes próximos às fontes, e seu crescimento e consumo precisam ser visíveis. A flora decorativa (corais e ramos do protótipo) pode continuar decorativa.
- **Espécies de teste ligadas por configuração:** um ajuste do mundo define se ele nasce com as espécies de teste (padrão em desenvolvimento) ou vazio (padrão para produção).
- **Contador de comida:** os totais de flora e de partículas aparecem em `/api/stats` e na tela de depuração (`?debug=1`), não na interface do visitante, que não muda.

## 9. Contexto do E2 (já decidido, não construir no E1)

Para o construtor não fechar portas:
- **Cadeia de teste:** Célula e Casco comem flora; a Membrana filtra partículas; o Filamento caça Células; o Poliedro caça Filamentos e Células. A Célula anda em grupo (o cardume como comportamento).
- **Reprodução por divisão** quando a energia enche, com cada metade levando metade da energia.
- **Mutação simples:** só numérica (velocidade, tamanho, percepção), com teto. O aprendizado fica para depois.
- **Morte** por fome ou predação, e o corpo vira partículas luminosas.
- **Extinção real e permanente:** sem repovoamento. A espécie continua registrada e aparece no índice como extinta, com a data. O arquivo permanente de espécies extintas vai para o gate P.
- **Painel:** ganha energia, geração, o que come e de quem nasceu.
- **Medições** para um experimento ecológico repetível (SPEC §7.6, §14).

Consequência para o E1: o estado da comida e dos organismos no servidor deve permitir acrescentar energia, nascimento e morte sem reescrever o modelo. Os organismos já vivem como dados num mundo, não como um processo por organismo (SPEC §11.2).

## 10. Restrições e contexto do código atual

- **Mundo no servidor:** `apps/api/lib/abyss/world/`, com parâmetros em `apps/api/config/config.exs` (`population: 45`, `tick_hz: 10`, `radius: 28.0`, `y_min: 1.5`, `y_max: 8.0`, `exclusion`). A população já é configurável por `ABYSS_POPULATION` (5 a 200, em `runtime.exs`).
- **Cena:** o leito do Jardim tem raio 60 e a névoa engole tudo a partir de ~0,8 × esse raio (`apps/web/src/scene/Seabed.tsx`). O mapa grande precisa repensar névoa, leito e luz para várias regiões.
- **Câmera:** `apps/web/src/scene/CameraRig.tsx` (OrbitControls com intro, modos home/following/returning) e `cameraConfig.ts`. A câmera livre substitui o modo órbita como modo principal. O Seguir (`follow.ts`, taxa 2,5/s) foi aprovado na Parada 2 do gate I e deve manter a sensação.
- **Criaturas:** um componente por espécie em `apps/web/src/organisms/`, guiado por dados do servidor e interpolado. O Filamento desenha o corpo a partir do histórico de posições.
- **Desempenho:** orçamento e perfis de qualidade do protótipo 2 (`QUALITY`). Com um mapa grande, desenhar com detalhe só o que está perto da câmera (LOD, descarte por distância) é esperado. Todo observador tem o mesmo mundo, e nenhum indivíduo ou comida pode ser escondido para economizar.
- **Ferramentas existentes:** e2e (`scripts/e2e/run.mjs`), carga (`scripts/load/observers.mjs`) e medição (`scripts/perf/measure.mjs`) do gate I devem ser estendidos, não refeitos.
- O autor prefere decisões apresentadas **uma por vez**, com opções e uma recomendação.

## 11. Deixado ao construtor

- Disposição das regiões no mapa e raio de cada uma, dentro de 20 a 50; forma das transições.
- Modelo da flora (manchas com nível de crescimento, indivíduos ou outro), taxas de crescimento, tetos e regras de reaparecimento.
- Modelo das partículas (taxa de surgimento, tempo de vida, teto, como "caem"), e a distribuição por região.
- Como a criatura acha e alcança a comida (alcance de percepção, steering), desde que pareça vivo e cada espécie mantenha seu caráter de movimento.
- Formato das mensagens da comida (estado completo, deltas, frequência), mantendo a consistência entre abas.
- Técnica de LOD e descarte, geração do terreno das regiões novas e organização dos assets.
- Valores finos da câmera (velocidade, inércia, resistência da borda), dentro do §8.
