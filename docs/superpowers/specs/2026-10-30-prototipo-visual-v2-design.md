# The Abyss — Protótipo visual 2 — Design

**Data:** 2026-10-30
**Status:** aguardando aprovação do autor
**Base:** protótipo 1, salvo na tag `prototipo-1` (commit `72d7c18`). Design da v1: `2026-10-30-prototipo-visual-design.md`, cujas regras continuam valendo salvo onde este documento muda.
**Referência visual:** `assets/references/hydrothermal-garden-reference.jpg`.

## 1. Intenção

O autor achou o protótipo 1 visualmente inferior à referência em dois pontos: **a luz, sobretudo no chão**, e **a distinção entre as criaturas**. A versão 2 é a mesma cena, melhorada nesses dois pontos, com duas criaturas novas de corpo sólido. Não é um conjunto de variantes para comparar entre si: é uma v2 única, comparada com a v1 (pela tag) e com a referência.

## 2. O que muda

### 2.1 Luz no chão (prioridade do autor)

Na referência o leito inteiro recebe uma luz azulada suave de cima: o relevo aparece, o sedimento é mais claro que as pedras, e a luz cai aos poucos para o fundo. No protótipo 1 o chão é uma mancha escura uniforme fora do alcance da flora.

A v2 deve ter:

- **Poças de luz** no leito sob os raios de luz que descem, claras o bastante para ler como luz batendo no chão, sem estourar.
- **Textura de sedimento** no leito: variação fina de tom e relevo, visível de perto e sumindo na névoa.
- **Mais pedras, de tamanhos médios**, mais escuras que o sedimento, com o contorno legível contra ele.
- **Luz das coisas vivas no chão:** corais, almofadas e criaturas que passam perto tingem o leito embaixo delas. *(Decisão do Claude, como complemento ao pedido.)*

A atmosfera da v1 continua: terço de cima quase preto, âmbar como acento.

### 2.2 Elenco (decisão do autor)

Cinco criaturas, todas com núcleo luminoso que pulsa (regra da v1):

| # | Criatura | Origem | O que muda |
|---|---|---|---|
| 1 | Membrana | v1 | Mantida |
| 2 | Filamento | v1 | Redesenhado (abaixo) |
| 3 | Casco | v1 | Mantido; pode ganhar tamanho/posição para não ficar de canto |
| 4 | Célula (nome de trabalho) | nova | Corpo sólido orgânico, tipo bactéria |
| 5 | Poliedro (nome de trabalho) | nova | Figura geométrica sólida |

**Esporos (cardume) saem** (decisão do autor): liam como o Filamento, só que mais numerosos e mais fracos.

**Filamento redesenhado** (proposta do Claude, aceita): maior, uma fita larga e ondulante de uns 4–5 m que brilha ao longo do comprimento todo, com pulsos de luz viajando da cabeça até a cauda. Ele é o "traço de luz" da cena, não um ponto com rabo.

**Célula** (direção do autor: "próxima de uma célula de bactéria"): bastonete/cápsula opaca de pele lisa e cerosa; núcleo e grânulos visíveis por dentro, com a luz do núcleo tingindo o corpo de dentro para fora; talvez flagelos curtos. Sólida, mas orgânica. Movimento próprio, diferente das outras quatro *(a definir pelo construtor; sugestão: avanço lento em linha com rolagem no próprio eixo, flagelos batendo)*.

**Poliedro** (direção do autor: "figura geométrica como um dodecaedro"): sólido inteiro, liso, arestas nítidas, faces que pegam a luz da cena, material marcante (pedra polida, cristal fosco ou metal escuro, a escolher na calibração). Grande o suficiente para ler como forma de longe. Precisa ser claramente diferente do Casco, que é escuro, quebrado em placas, com luz vazando pelas frestas. Movimento próprio *(sugestão: rotação lenta e perfeitamente regular, quase mecânica, contrastando com o Casco desajeitado)*.

## 3. Não-objetivos

Os mesmos da v1: sem interface editorial, sem publicação, sem backend, sem gerador de criaturas. Blender continua plano B por peça.

## 4. Anti-objetivos

- Os da v1 (aquário de fliperama, criaturas que leem como peixe/água-viva/raia, todas se movendo igual, câmera mostrando borda).
- **Duas criaturas que leiam como a mesma coisa de longe**, que foi o problema Filamento/Esporos da v1.
- Chão claro demais a ponto de perder a escuridão do abismo.
- Célula que leia como pílula/cápsula de remédio ou como larva.

## 5. Restrições

- Mesma stack, mesma estrutura de `apps/web`, tudo procedural.
- Testes de lógica pura, typecheck e build obrigatórios; visual validado por captura contra a referência, como na v1.
- Desempenho: medir de novo nas duas GPUs com `?perf=1`. Mesmos limites (Arc `low` p95 ≤ 33 ms; RTX `high` p50 ≤ 16,7 ms). Efeitos de luz novos não podem estourar isso.
- Documentos da v1 (`ART_DIRECTION.md`, `VISUAL_ACCEPTANCE.md`) atualizados para a v2; capturas da v2 ao lado das da v1 para comparação.
- Trabalho no branch `prototipo-visual`, commit por task, sem push. A v1 continua recuperável pela tag.

## 6. Deixado para o construtor

Técnica das poças de luz (decals, textura projetada, termo no shader do leito etc.), técnica da luz das criaturas no chão, material exato do Poliedro, forma e movimento exatos da Célula, posições de cada criatura na composição, ajuste fino de cor e bloom. A etapa fecha com aprovação explícita do autor.
