# The Abyss: Gate S1 (Gênese de Espécies), design

**Data:** 2026-11-08
**Status:** aprovado pelo autor em 2026-11-08 (revisado por um construtor independente; perguntas respondidas em 2026-11-08).
**Base:** `main` em `e3eb09a` (PR #3: gate E2 mergeado; ver `docs/GATE_E2_ACCEPTANCE.md`).
**Referências:** SPEC (§5 modelo de experiência, §5.3 política de criação por e-mail, §6 orçamento de criação, §12 stack, §14 gates), design do E2 (`docs/superpowers/specs/2026-11-05-gate-e2-ecologia-design.md`), `docs/ART_DIRECTION.md`. Esboço da tela de criação (arrumação A escolhida): `.superpowers/brainstorm/285-1794168589/content/tela-criacao.html`.

> No working tree o SPEC aparece como `SPEC (2).md`, com conteúdo idêntico ao `SPEC.md` versionado. Este documento chama os dois de "SPEC".

## 1. Intenção

Até o E2, o mundo só tem as 5 espécies de teste. Em produção o mundo começa **sem espécies**: só flora e partículas. O gate S é o momento em que o mundo ganha vida de verdade, porque **cada visitante pode criar uma espécie própria**, que passa a viver sozinha na ecologia do E2.

A referência de sensação do autor é o editor de células do Spore: a pessoa **monta a criatura com peças, e as peças dão habilidades**. A boca decide o que ela come, o flagelo a deixa rápida, o ocelo a deixa enxergar longe. Aparência e modo de vida são a mesma coisa, e dá para entender o que a criatura faz só de olhar para ela. **Não é uma recriação do Spore**: as peças, a arte e a estética são do The Abyss.

A pessoa monta a espécie **uma vez só**. Depois disso ela não controla nada: a espécie sobrevive, se espalha ou se extingue pela ecologia. No futuro (S2) ela também muda sozinha por mutação.

O gate S foi dividido em duas etapas (decisão do autor, como E1/E2):
- **S1, a gênese** (este documento): editor de peças, criatura em 3D a partir das peças, e-mail verificado, banco de dados e as 3 primeiras criaturas nascendo no mundo.
- **S2, a evolução**: filhos nascendo com uma peça a mais ou diferente, seleção natural, espécie se dividindo em variações. Depende do S1.

## 2. Metas

1. **Botão de criação.** Todo visitante vê a mesma tela inicial, o mundo. Num canto há um botão para criar a própria espécie, que leva a uma **tela separada** de criação.
2. **Tela de criação (arrumação A).** À esquerda: e-mail, nome da espécie, catálogo de peças com o custo de cada uma, orçamento e o botão "Liberar no abismo". À direita, grande: a criatura sendo montada, que **começa como um núcleo luminoso** e muda ao vivo a cada ajuste.
3. **Editor por peças** (§5.2), com variedade visual suficiente para que cada espécie seja **única de olhar** (§5.3).
4. **Peças viram características** que a ecologia do E2 já usa, mais uma regra nova: a **defesa** (§5.4).
5. **Orçamento**: cada peça custa pontos de um total limitado e também aumenta o gasto de energia da criatura.
6. **Publicação com e-mail verificado**: link único, curto e de uso único enviado ao e-mail (SPEC §5.3). **Um e-mail cria uma única espécie, para sempre**, mesmo que ela se extinga.
7. **Nascimento**: confirmado o e-mail, nascem **3 criaturas** da espécie num **lugar sorteado** do mapa, e a pessoa volta ao mundo do jeito normal.
8. **A criatura no mundo aparece em 3D como foi montada no editor**, com o mesmo corpo, peças, cores e padrão.
9. **Banco de dados** (PostgreSQL + Ecto, SPEC §12) guarda criadoras e espécies publicadas.
10. **Reinício**: as espécies publicadas e ainda vivas voltam com 3 criaturas novas.
11. As espécies criadas entram no **painel e no índice** como as de teste (nome, o que come, energia etc.).

## 3. Não metas

- **Mutação, seleção natural e variações** dentro da espécie: são do S2. Mas o formato das peças tem que permitir que o S2 adicione ou troque uma peça num filho sem refazer o modelo (§7).
- **Guardar o mundo exato** (cada criatura no seu lugar) entre reinícios: é do gate P.
- **E-mail avisando a criadora** do que acontece com a espécie, por exemplo a extinção: backlog.
- **Buscador de espécies**: backlog.
- **Filtro de palavras ofensivas** no nome: decisão do autor, não haverá.
- **Bloqueio de cópia** (comparar a criatura com as existentes e recusar se for parecida): decisão do autor, não haverá. A unicidade vem só da variedade do editor.
- **Editar a espécie depois de publicada**: a espécie é imutável.
- **Escolher a região de nascimento**.
- **Toque e celular** no editor (o E1 também deixou toque de fora).
- **Serviço de envio de e-mail real** em produção: fica para quando o The Abyss for publicado (gate O). No S1 o envio usa o Swoosh com caixa local de desenvolvimento.
- **Recapitulação, histórico, página pública da espécie** (SPEC §5.3 "Recovery"): depois.

## 4. Anti-metas (falhas mesmo que "funcione")

- **Mundo cheio de espécies visualmente iguais.** É a falha que mais preocupa o autor. Se o editor só permitir variações pequenas, todo mundo monta quase a mesma criatura e o gate falhou, mesmo com tudo funcionando.
- **A criatura no mundo diferente da que a pessoa montou.** Ela precisa reconhecer a sua espécie nadando.
- **Peça que só enfeita.** Toda peça do catálogo tem efeito na vida da criatura, e esse efeito é visível no comportamento.
- **Espécie imbatível.** Uma combinação que vence tudo e domina o mundo. O orçamento e o custo de energia existem para impedir isso. O equilíbrio fino não é aceite, mas um "melhor em tudo" óbvio é falha.
- **Comportamento amarrado ao nome da espécie** (regra que já vale desde o E2).
- **E-mail exposto** em dados públicos, no fio, no painel, no índice ou em logs.
- **Duas espécies para o mesmo e-mail**, inclusive com dois cliques ao mesmo tempo ou maiúsculas diferentes no endereço.
- **Perder o que o E1 e o E2 aprovaram**: qualidade visual, câmera, ciclo de vida e desempenho. Em especial, travamentos por shader recompilando quando aparece uma espécie nova (lição do E1: a contagem de programas de shader não pode crescer a cada espécie ou criatura).

## 5. Decisões do autor

### 5.1 Fluxo
1. A pessoa está no mundo e clica no botão de criação, num canto da tela.
2. Vai para a tela de criação (arrumação A). Monta a criatura, digita o e-mail e o nome e clica em "Liberar no abismo".
3. Recebe um link de confirmação no e-mail.
4. Ao confirmar, volta ao mundo **do jeito normal** (decisão do autor): a câmera não é levada até a espécie nem liga o Seguir sozinha. A pessoa encontra as 3 primeiras criaturas por conta própria, por exemplo pelo índice.
5. A espécie entra **na hora**, sem moderação prévia nem filtro de nome.

### 5.2 Catálogo de peças (sugerido por mim, aceito pelo autor)

| Grupo | Peça | Efeito (característica) |
|---|---|---|
| Boca (**exatamente uma**) | Raspador | come flora |
| | Boca-filtro | come partículas |
| | Mandíbula | caça criaturas menores |
| Movimento | Flagelo | mais velocidade máxima |
| | Cílios | mais arranque (fuga e bote) |
| | Aleta | vira mais rápido |
| Sentidos | Ocelo | percepção mais longe |
| Comportamento | Filamento de cardume | anda em grupo |
| | Gancho de abrigo | busca a Floresta quando ameaçada |
| Defesa | Placa | defesa contra caça (§5.4) |

- **Caça por características:** a mandíbula caça **qualquer criatura menor de outra espécie**, nunca uma lista de espécies pelo nome (regra do E2). **Sem canibalismo no S1** (decisão do autor): não caça os jovens da própria espécie. O canibalismo pode surgir no S2 como característica de mutação, por exemplo por falta de alimento.
- **Espécies de teste** (só desenvolvimento): as caçadoras de teste mantêm a lista de presas pelo nome e não caçam espécies criadas; uma espécie criada com mandíbula pode caçar espécies de teste menores. Escolha minha.
- **Tamanho** não é peça: vem do corpo (§5.3). Maior é mais difícil de ser caçado, mas gasta mais energia.
- **Ritmo de vida** (tempo de jovem e tempo de vida adulta): não foi decidido como a pessoa escolhe. Fica ao construtor (§8), dentro do orçamento.
- **Orçamento:** cada peça custa pontos de um total limitado. O SPEC §6 sugere custo crescente para valores altos. Cada peça também aumenta o metabolismo, então uma criatura cheia de peças precisa comer mais.

### 5.3 Variedade visual (unicidade)
Cada espécie deve ser única de olhar, garantida **só pela variedade do editor**, sem bloqueio:
- **Corpo:** começa como o núcleo luminoso. A pessoa **estica, curva e muda a espessura** em vários pontos.
- **Peças:** colocadas em **qualquer ponto do corpo**, com **tamanho e ângulo** ajustáveis, e com **espelhamento** automático dos dois lados ou não.
- **Cores:** a cor do brilho do núcleo e uma segunda cor do corpo.
- **Padrão do corpo:** manchas, listras, anéis ou liso.
- Mais de uma peça do mesmo tipo é permitida (por exemplo, vários flagelos), e cada uma custa.

### 5.4 Defesa (regra nova na ecologia)
Decisão do autor: a placa entra no S1 como peça. Proposta minha: **cada placa dá à presa uma chance de escapar do bote** (a captura falha e a presa foge), e **cada placa deixa a criatura mais lenta**. Assim a defesa tem um preço. Os números são acertados numa parada visual, como no E2. A regra vale para qualquer espécie com placa, inclusive as de teste se ganharem placas.

### 5.5 Publicação e e-mail
- **Um e-mail = uma espécie, para sempre.** A extinção não libera o e-mail. Garantido por uma restrição única no banco sobre o e-mail normalizado, numa transação (SPEC §5.3).
- **Verificação** por link único, curto (expira) e de uso único. O token é guardado só como hash.
- **Privacidade:** o e-mail nunca aparece em dados públicos, no fio para os clientes, no painel, no índice ou nos logs.
- **Respostas genéricas** para não revelar se um e-mail já foi usado (SPEC §5.3), e limite de tentativas por rede e por e-mail.
- **Nome da espécie:** livre, sem filtro. Os nomes repetidos e o tamanho máximo ficam ao construtor (§8).
- **Sem remoção manual** (decisão do autor): não existe comando nem tela para remover uma espécie publicada. Só o reset total (§5.7) apaga espécies.

### 5.6 Nascimento e teto
- As 3 primeiras criaturas nascem num **lugar sorteado** do mapa, sem relação com o que a espécie come. As 3 nascem juntas, próximas umas das outras.
- Nascem como **adultas** (decisão do autor), para poder se dividir logo.
- Se o mundo estiver no teto de 250, **as 3 entram mesmo assim**. O mundo passa um pouco do teto até as mortes o trazerem de volta.

### 5.7 Reinício e reset
- **Reinício normal** do servidor: cada espécie publicada que ainda não se extinguiu volta com **3 criaturas novas** em lugar sorteado. É provisório, até o gate P guardar o mundo exato.
- **Extinção é permanente** também entre reinícios: o banco guarda a data da extinção, e uma espécie extinta não volta num reinício. (Isso adianta para o banco do S1 o registro das extintas que o E2 deixava só em memória.)
- **Índice:** mostra as espécies vivas e só as **100 extintas mais recentes** (decisão do autor). As outras extintas ficam só no banco e não vão para o snapshot dos clientes.
- **Reset total** (comando de operação): o mundo começa **vazio, sem nenhuma espécie**, e os **e-mails ficam livres** para criar de novo.

### 5.8 Espécies de teste
As 5 espécies de teste continuam existindo **só em desenvolvimento e experimentos**, como hoje (`ABYSS_TEST_SPECIES`). Em produção o mundo começa sem espécies. As espécies criadas e as de teste convivem no mesmo mundo em desenvolvimento.

### 5.9 Quantidade de espécies (escolhas minhas)
- **Não há limite de espécies vivas ao mesmo tempo**, coerente com "sem bloqueios na criação". O teto de 250 criaturas continua valendo para os nascimentos por divisão; as 3 fundadoras sempre entram (§5.6).
- **Meta de medição: 50 espécies criadas diferentes vivas juntas** no mundo, dentro do orçamento de desempenho do E2.
- Por isso, e pelo S2, o desenho 3D das espécies criadas é **um desenho compartilhado guiado por dados de cada instância**, não um conjunto de malhas por espécie.

## 6. Contexto do código atual (restrições)

- **Espécies hoje são uma tabela fixa** em `apps/api/lib/abyss/world/species.ex`, com as características do E2 (`max_speed`, `turn_rate`, `body_radius`, `diet`, `perception`, `school`, `shelter`, `burst`, `energy_max`, `metabolism`, `mature_s`, `adult_life_s`...). O S1 precisa de espécies **registradas em tempo de execução**, sem reiniciar o mundo, e o snapshot e o índice dos clientes precisam recebê-las.
- **A dieta de caça hoje é uma lista de espécies** (`{:prey, [:celula]}`). A mandíbula caça "qualquer menor". As espécies de teste podem manter a lista, mas a regra nova não pode depender de nomes.
- **O cliente hoje tem um componente 3D feito à mão por espécie** (`apps/web/src/organisms/*.tsx`, desenhados com instâncias). As espécies criadas precisam de **um único desenho procedural** que monta qualquer criatura a partir do corpo e das peças. Ele precisa caber no orçamento de desempenho do E2 com muitas espécies diferentes no mundo ao mesmo tempo. A contagem de programas de shader não pode crescer por espécie, e a reserva fixa de luzes do E1 continua valendo.
- **Ainda não há banco nem e-mail** na API (`mix.exs` não tem Ecto nem Swoosh, e o `infra/compose/compose.yaml` só sobe a API). O S1 traz PostgreSQL + Ecto e Swoosh (SPEC §12), com Postgres no compose de desenvolvimento.
- **O mundo continua em memória** (gate P). O banco guarda criadoras, espécies e a data de extinção, não as criaturas.
- **Teto de 250** em `config.exs` (`:ecology, :pop_cap`), também fixo em `runtime.exs:34` (minor da revisão do E2).

## 7. Preparar o S2 sem fazê-lo

O S2 vai fazer um filho nascer com uma peça a mais ou diferente da do pai. Para isso não exigir refazer o modelo:
- a **descrição da criatura** (corpo, peças, cores, padrão) é um dado único, versionado, que serve ao mesmo tempo para o editor, para o servidor calcular as características e para o cliente desenhar;
- as **características saem dessa descrição por uma função**, e não são digitadas à parte;
- o desenho no cliente aceita **descrições diferentes dentro da mesma espécie**, mesmo que no S1 todas as criaturas de uma espécie sejam iguais.

## 8. Deixado ao construtor

- Os números: pontos de cada peça, total do orçamento, curva de custo, quanto cada peça muda cada característica e o metabolismo, efeito exato do tamanho, chance de escape da placa e quanto ela freia. Calibrar para que uma espécie típica sobreviva e se reproduza no mundo de teste, e para que nenhuma combinação óbvia vença tudo. O autor ajusta numa parada.
- Como a pessoa escolhe o ritmo de vida (tempo de jovem e de vida adulta): fixo, derivado do corpo e das peças ou um ajuste no editor.
- Limites do editor: quantos pontos de corpo, quantas peças no máximo, tamanho máximo e mínimo, paleta de cores livre ou guiada.
- Tamanho máximo do nome e o que fazer com nomes repetidos.
- Formato do link de verificação, tempo de expiração e limites de tentativas.
- O formato do comando de reset total.
- A arte das peças e do editor, seguindo `docs/ART_DIRECTION.md` e a estética aprovada no V-GATE.
- Como a tela de criação é aberta e fechada (rota, botão de voltar ao mundo sem publicar) e onde fica o botão de criação na tela do mundo.

## 9. Critérios de aceite (proposta)

1. Uma pessoa sai do mundo pelo botão, monta uma criatura com peças, confirma o e-mail na caixa local, volta ao mundo e encontra as 3 criaturas nascidas.
2. A criatura no mundo é reconhecível como a montada no editor, nas duas GPUs da máquina de medição.
3. Cada peça do catálogo muda o comportamento de forma visível, inclusive a placa (presas com placa escapam de botes).
4. Um mesmo e-mail não publica uma segunda espécie, nem com dois envios simultâneos ou maiúsculas diferentes; testes de restrição e de abuso passam (SPEC §14, gate S).
5. O e-mail não aparece em nada que chega aos clientes nem nos logs.
6. Depois de um reinício, as espécies vivas voltam com 3 criaturas; as extintas continuam extintas, com data.
7. Com 50 espécies criadas diferentes ao mesmo tempo no mundo, o cliente e o servidor ficam dentro do orçamento do E2, e a contagem de programas de shader não cresce com espécies novas.
8. O autor monta algumas criaturas na parada visual e confirma que dá para fazer espécies bem diferentes entre si (anti-meta principal).
