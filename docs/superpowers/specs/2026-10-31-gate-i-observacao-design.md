# The Abyss — Gate I (Observação) — Design

**Data:** 2026-10-31
**Status:** aguardando aprovação do autor
**Base:** `main` após o merge do protótipo visual 2 (V-GATE fechado, ver `docs/VISUAL_ACCEPTANCE.md`).
**Referências:** SPEC (§9.1 stack, §13 gates), `docs/ART_DIRECTION.md`, designs do protótipo em `docs/superpowers/specs/2026-10-30-*`.

> Nota: no working tree o SPEC aparece como `SPEC (2).md` (o `SPEC.md` antigo foi apagado e ainda não houve commit). Este documento se refere a ele como "SPEC".

## 1. Intenção

O Abyss é um **terrário compartilhado**: um único mundo persistente que roda em tempo real e é igual para todos, onde espécies criadas por vários usuários convivem. Hoje ele é só um palco visual. As criaturas são animação procedural no navegador e não existem como entidades.

O gate I é a primeira vez que o terrário tem um **mundo de verdade**. Um servidor detém o estado e os organismos passam a ser indivíduos reais, que qualquer observador pode selecionar, inspecionar e seguir, vendo exatamente o mesmo que os outros. É a fundação sobre a qual entram a criação de espécies (gate S), a ecologia (gate E) e a persistência (gate P).

O autor decidiu ir direto ao backend e adiar a publicação do palco visual até existir estado real no servidor.

## 2. Metas

1. Um servidor **Elixir + Phoenix** com autoridade sobre um único mundo **contínuo**: um relógio, sempre rodando, sem "adiantar tempo", com taxa de ticks baixa.
2. O mundo começa com as **cinco espécies fundadoras** do protótipo (Membrana, Filamento, Casco, Célula, Poliedro) como indivíduos reais, num total de **~30–60 organismos**.
3. Até **~50 observadores** simultâneos veem o mesmo mundo em tempo real.
4. O visitante consegue **selecionar, inspecionar e seguir** qualquer indivíduo (§5).
5. O visual aprovado no V-GATE **não regride**.

## 3. Não metas (ficam para gates posteriores)

- Contas, e-mail, verificação, criação de espécies e moderação (gate S).
- Ecologia: alimentação, energia, idade, nascimento, morte, mutação e aprendizado (gate E).
- **Cardume como comportamento de espécie** (gate E). *Suposição minha, aprovada no playback.*
- Persistência, snapshots, backups e recuperação do estado (gate P). Reiniciar o servidor **recria o mundo do zero**.
- **PostgreSQL**: o mundo vive só na memória do servidor. *Suposição minha, aprovada no playback.* O banco entra quando houver algo a guardar (gate S/P).
- Hospedagem e publicação (SPEC §16 #7, adiado). No gate I tudo roda **localmente via Docker Compose**.
- LiveView no frontend do visitante (o SPEC já descarta).

## 4. Anti-metas (falhas mesmo que "funcione")

- **Movimento duro, mecânico ou com trancos.** Se os organismos vindos do servidor parecerem piores que a animação do protótipo, o gate não fecha.
- **Observadores vendo mundos diferentes**: posições, contagens ou identificadores divergentes entre duas abas.
- **Câmera tirada do controle do visitante sem ele pedir.** A seleção sozinha nunca move a câmera.
- Antecipar ecologia ou persistência "porque é fácil". O escopo do gate I é observação.

## 5. Decisões do autor

### 5.1 Mundo
- Mundo contínuo e único, com população e taxa de ticks baixas (SPEC §16 #1).
- Gate I com ~30–60 organismos e até ~50 observadores, **ambos configuráveis e medidos** (SPEC §16 #10).
- As cinco criaturas do protótipo são as espécies fundadoras: indivíduos reais no servidor, selecionáveis e seguíveis.
- O cardume decorativo do protótipo **sai** no gate I. Cardume passa a ser um comportamento: indivíduos da mesma espécie se agrupam se a espécie tiver essa característica, e isso é implementado no gate E.

### 5.2 Stack
- Backend em **Elixir + Phoenix**, com tempo real via **Phoenix Channels**, como fixa o SPEC §9.1. O frontend continua React + TypeScript + Vite + R3F em `apps/web`.
- O backend fica em `apps/api`, conforme o layout de monorepo do SPEC.
- Ambiente local via **Docker Compose**.

### 5.3 O que os organismos fazem
- **Só se movem.** O servidor decide posição, direção e velocidade.
- O painel mostra **atributos estáticos**: identificador, espécie e quando surgiu, além da posição atual.
- Não há idade, energia, nascimento nem morte.

### 5.4 Canônico × cosmético
- **Canônico** (servidor, igual para todos): posição, direção e velocidade de cada organismo, enviadas **~5–10 vezes por segundo**.
- **Cosmético** (calculado em cada navegador): a suavização entre as atualizações e toda a animação do corpo (ondulação do Filamento, pulsação da Membrana e dos núcleos, giro do Poliedro, pulsos de luz). Uma diferença de fase entre observadores é aceitável.
- O servidor não controla a animação do corpo.

### 5.5 Selecionar e seguir (opção C, escolhida sobre mockups)
- **Clique** num organismo: ele ganha um **anel discreto** e abre-se um **painel lateral transparente** no tom do SPEC §5 e do ART_DIRECTION (título serifado, metadados em mono, separadores finos). O painel mostra o identificador legível (por exemplo, `MBR-0042`), a espécie, o surgimento e a posição.
- **"Seguir"** no painel faz a câmera acompanhar o organismo suavemente. Só assim a câmera se move.
- **Esc** ou clique no vazio fecha a seleção e solta o seguimento.
- **Índice recolhível** de espécies → indivíduos, com contagem por espécie. Escolher um indivíduo no índice equivale a clicá-lo e funciona mesmo quando ele está longe ou escondido.

## 6. Critérios de aceite (gate I fechado)

1. **Duas abas, um mundo só:** com duas janelas lado a lado, cada organismo aparece no mesmo lugar, na mesma direção, com o mesmo identificador e a mesma contagem por espécie. A defasagem entre elas fica abaixo de uma fração de segundo.
2. **Seleção confiável:** clicar ou escolher no índice seleciona o indivíduo certo. O painel reflete dados do servidor, e "Seguir" acompanha o organismo sem perdê-lo.
3. **Reinício sem quebrar:** se o servidor cair e voltar, a página reconecta sozinha e mostra o mundo novo, sem travar e sem recarregar.
4. **Carga medida:** 60 organismos e 50 observadores simulados rodando por um período sustentado, com o relógio do mundo estável e os números registrados num relatório, no mesmo espírito da medição do protótipo 2.
5. **Visual intacto:** o autor compara uma gravação do terrário vivo com a versão aprovada no V-GATE e dá o aceite explícito, registrado no estilo de `docs/VISUAL_ACCEPTANCE.md`.
6. **Testes automatizados** de seleção e de consistência de estado entre servidor e cliente (exigência da tabela de gates do SPEC).

## 7. Restrições e contexto que o construtor precisa saber

- **O protótipo tem uma instância por espécie.** Hoje cada criatura é um componente único, com trajeto próprio (curvas de Lissajous e órbitas em `apps/web/src/organisms/`) e parâmetros em `creatureConfig.ts`. O gate I exige várias instâncias por espécie, dirigidas por dados do servidor. A composição aprovada (cinco criaturas grandes numa cena enquadrada) muda com 30–60 organismos, e é aí que mora o maior risco para o critério 5.
- **A câmera é fortemente restrita** (`apps/web/src/scene/cameraConfig.ts`): alvo limitado a uma caixa de ±5 em x/z, distância de 5 a 20 e ângulos limitados. A §9 define como isso muda durante o "Seguir".
- **O Filamento desenha o corpo a partir do histórico do trajeto** (amostras com atraso). Com movimento vindo do servidor, esse histórico passa a ser construído a partir das posições interpoladas.
- O orçamento de desempenho e os perfis de qualidade do protótipo 2 continuam valendo (ver o pacote de medição do protótipo 2).
- Monorepo pnpm (`pnpm-workspace.yaml`). Os scripts da raiz hoje filtram só `@abyss/web`.
- O autor prefere decisões apresentadas **uma por vez**, com opções e uma recomendação.

## 8. Decisões minhas (Claude), a conferir pelo autor

Saíram da revisão do documento. São decisões que um construtor sensato tomaria sem mudar o que será construído:

- **Página sem servidor:** mostra o ambiente (leito, luz, flora, névoa) sem organismos e um aviso discreto de "conectando…", tentando reconectar sozinha. A animação procedural de trajetos do protótipo é substituída pelos dados do servidor e não continua como modo offline, porque um "mundo falso" local contradiz a ideia de um único mundo verdadeiro. A animação do corpo (§5.4) permanece.
- **Desempenho com 30–60 organismos:** todo observador vê **a mesma população**. Perfis de qualidade mais baixos podem simplificar a geometria (menos segmentos, menos grânulos, LOD por distância), mas nunca esconder indivíduos. Se mesmo assim o orçamento do protótipo 2 não fechar no perfil baixo, a população do mundo é reduzida (ela é configurável), e o motivo vai para o relatório.
- **Limiar de carga (critério 4):** 30 minutos sustentados com 60 organismos e 50 clientes de WebSocket sem renderização, mais 2 navegadores reais para conferir a consistência. Passa se o jitter do tick no p99 ficar abaixo de 20% do intervalo do tick, sem crescimento contínuo de memória e sem perda de conexões. CPU e memória são registradas, sem teto fixo.
- **Pontos de parada para o autor durante a execução:** o plano para em dois pontos para o autor olhar e decidir, um por vez, com recomendação: (1) a escala e a câmera com muitos organismos (§9), antes de investir no resto do cliente; (2) a sensação do movimento vindo do servidor, antes de fechar o critério 5. O resto do que a §10 deixa ao construtor é decidido e relatado no fim.

## 9. Escala, câmera e "visual intacto"

Decisão do autor (opção b, escolhida entre três: diminuir as criaturas, ampliar o mundo ou prender todas no volume atual):

- **As criaturas mantêm a escala aprovada.** O mundo é que cresce: os organismos nadam num volume maior que o enquadramento atual, dentro do alcance da névoa (o leito tem raio 60, e a névoa engole tudo a partir de ~0,8 × esse raio).
- **A vista inicial continua sendo o quadro herói aprovado** e mostra só uma parte dos organismos de cada vez. Nem tudo fica à vista ao mesmo tempo, e o índice resolve achar quem está longe.
- **Os limites da câmera (`cameraConfig.ts`) só se afrouxam durante o "Seguir"**, o bastante para acompanhar o organismo por todo o volume do mundo. Ao soltar, a câmera volta suavemente ao enquadramento e aos limites normais.

**O que "visual intacto" significa (critério 5):**
- cada criatura, vista isoladamente, mantém a qualidade do protótipo 2;
- a atmosfera (luz, névoa, bloom, paleta) não muda;
- o quadro inicial continua lendo como uma composição, não como uma multidão.

A densidade de organismos pode mudar em relação ao protótipo.

## 10. Deixado ao construtor

- Modelo de movimento no servidor (vagar com steering, trajetos parametrizados ou outro), desde que o resultado pareça vivo e cada espécie mantenha o caráter de movimento que tem no protótipo.
- Taxa exata de ticks da simulação e de envio (dentro de ~5–10 Hz para o envio), formato das mensagens (estado completo, deltas ou ambos), estratégia de interpolação e de reconexão.
- Distribuição inicial por espécie e posições de nascimento.
- Formato do identificador, desde que seja legível e estável durante a vida do mundo (estilo `MBR-0042`).
- Organização interna do app Phoenix (processos, supervisão), ferramenta de carga para os 50 observadores e formato do relatório.
- Detalhes visuais do anel, do painel e do índice dentro da direção de arte existente.
