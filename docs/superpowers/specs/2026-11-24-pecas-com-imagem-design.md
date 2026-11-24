# Peças com imagem na tela de criação

Data: 2026-11-24 · Tamanho: mudança pequena

## Intenção

Na tela de criação (`apps/web/src/genesis/CreationScreen.tsx`), a seção **Peças** é uma lista
de texto, uma peça por linha ("Raspador · come a flora  +2"). Quem cria uma espécie não sabe
como é um Ocelo ou um Gancho antes de pôr a peça no corpo. A lista passa a ser uma grade de
cartões com a imagem de cada peça, 3 por linha.

## Objetivos

- Cada peça vira um cartão com a imagem, o nome, o efeito e o custo da próxima instância.
- 3 colunas por linha dentro do painel de 360px.
- A imagem é a peça 3D de verdade, com a mesma geometria e o mesmo material do jogo.

## Fora do escopo

- Mudar o catálogo, os custos ou o comportamento de "adicionar peça".
- Animar a imagem. Ela é uma foto parada.
- Fazer a foto acompanhar a cor da espécie.
- Mexer no resto do painel (No corpo, Cores, O que ela faz, Orçamento).

## Abordagens

1. **Foto da peça 3D renderizada na hora (escolhida).** Um único renderizador escondido
   fotografa cada uma das 10 peças. A imagem sempre bate com a criatura e não há arquivo para
   manter.
2. **Ícone SVG desenhado à mão.** Mais legível em tamanho pequeno, mas é um desenho separado,
   que pode divergir da peça real.
3. **PNGs capturados e salvos no repositório.** Simples, mas desatualizam quando a geometria
   muda.

Você escolheu a 1.

## Como fica

```
BOCA · SÓ UMA
┌────────┐ ┌────────┐ ┌────────┐
│ [foto] │ │ [foto] │ │ [foto] │
│Raspador│ │Boca-fil│ │Mandíbul│
│come a  │ │come par│ │caça cri│
│flora +2│ │      +2│ │      +3│
└────────┘ └────────┘ └────────┘
MOVIMENTO
┌────────┐ ┌────────┐ ┌────────┐ ...
```

- **Grupos mantidos** (minha decisão): os títulos Boca, Movimento, Sentidos, Comportamento e
  Defesa continuam, cada um com sua grade de 3 colunas. Boca e Movimento enchem uma linha; os
  outros ficam com a linha incompleta, alinhada à esquerda.
- **Cartão:** a foto em cima (quadrada, ~64px), o nome, o efeito em letra menor, quebrando
  linha, e o custo em ciano. O cartão continua sendo o mesmo botão de hoje: o clique adiciona
  a peça, e o cartão fica esmaecido e com "—" quando não cabe mais nenhuma.
- **Foto:** uma planta só com aquela peça, sem corpo, passada pelo `buildPartsGeometry` e pelo
  material das peças. Ângulo fixo, fundo transparente.
- **Cor fixa, da paleta do menu** (sua decisão): as fotos usam sempre o ciano do menu
  (`PALETTE.cyan`, `#49D6D3`) como brilho, e não a cor da espécie. Assim a grade fica coerente
  com o resto do painel e não muda quando a cor da criatura muda.
- **Renderizador:** um único `WebGLRenderer` fora da tela. Ele gera as 10 imagens uma vez por
  carregamento da página como data URL, guardadas em memória, e elas vão num `<img alt="">`. O
  renderizador é descartado depois disso. O nome no cartão já serve de rótulo.
- **Sem WebGL** (testes em jsdom, navegador sem suporte): o cartão aparece sem a foto, só com o
  texto. Nada quebra.

## Para quem for construir decidir

- O enquadramento de cada peça (distância da câmera a partir da bounding sphere).
- Onde mora o código da foto (sugestão: `genesis/partThumbnails.ts` mais um hook).
- O ajuste fino de tamanhos e espaçamentos para caber em 360px e no layout mobile (painel em
  largura total).
