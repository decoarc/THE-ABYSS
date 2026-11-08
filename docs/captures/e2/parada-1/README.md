# Parada 1 do E2: o ciclo na tela

Mundo com `ABYSS_SEED=7`, população 150, perfil de qualidade `high`, 1280x720, GPU real (Intel Arc, ANGLE/D3D11).
Os vídeos ficam fora do git, em `../THE-ABYSS-capturas/e2/parada-1/` (relativo à raiz do repositório).
As capturas foram feitas por `scripts/capture-e2.mjs` (momentos de evento) e `scripts/capture-e2-estatico.mjs` (brilhos, vista de cima, Poliedro).

Limite da ferramenta: o ffmpeg do Playwright não decodifica VP9, então o vídeo dos momentos a a d não pôde ser cortado.
Eles estão na sessão contínua `sessao-completa.webm` (143 s), nos instantes abaixo.

## Momentos

- a. Predação: `a-predacao.png`. Um Filamento ao lado de uma Célula; a presa sumiu do roster sem fantasma (morte por predação) logo depois. Vídeo: `sessao-completa.webm`, 111,5 s a 117 s.
- b. Morte por fome desfazendo-se: `b-morte-0.png`, `b-morte-1.png`, `b-morte-2.png`. Um Casco com energia 0,000 vira fantasma e se dissolve em pontos escuros, com o núcleo roxo aparecendo como esfera de pontos no meio. Vídeo: `sessao-completa.webm`, 113,5 s a 120 s.
- c. Divisão: `c-divisao-0.png` (Filamento em divisão, brilhante), `c-divisao-2.png` e `c-divisao-3.png` (depois da separação, com o filho jovem FIL-0049). Vídeo: `sessao-completa.webm`, 118,5 s a 126 s. Não há `c-divisao-1.png`: o ponto de captura "5 s de alongamento" não foi atingido, o evento todo durou cerca de 6 s desde que o diretor o detectou.
- d. Jovem virando adulto: `d-amadurece-0.png` (jovem), `d-amadurece-1.png` (instante da mudança), `d-amadurece-2.png` (2 s depois), `d-amadurece-3.png` (4,5 s depois). O organismo acompanhado é uma Membrana. Vídeo: `sessao-completa.webm`, 125 s a 143 s.
- e. Brilhos diferentes: `e-brilhos.png`, vídeo `e-brilhos.webm`. Grupo de Cascos com energias entre 0,08 e 0,92 no instante da escolha (0,92, 0,84, 0,08, 0,20). O Casco é escuro e o brilho é só uma fresta roxa; o contraste lê-se menos do que o de uma Célula ou Filamento.
- f. Vista de cima: `f-vista-de-cima-jardim.png`, `f-vista-de-cima-floresta.png`, `f-vista-de-cima-planicie.png`, `f-vista-de-cima-obliqua.png`, vídeo `f-vista-de-cima.webm`. A câmera livre tem teto em y=16 (`CameraRig`), então não existe uma vista única das três regiões: são três vistas a 16 de altura sobre o centro de cada região e uma oblíqua de longe. A distribuição por região, contada pelo roster no mesmo instante:

| Região | Membrana | Célula | Filamento | Casco | Poliedro |
|---|---|---|---|---|---|
| Jardim | 6 | 30 | 15 | 39 | 8 |
| Floresta | 0 | 6 | 12 | 7 | 9 |
| Planície | 35 | 0 | 0 | 0 | 11 |

- g. Poliedro de perto: `g-poliedro-0.png`, `g-poliedro-1.png`, vídeo `g-poliedro.webm`. O Poliedro mais cheio disponível no momento tinha energia 0,68 (nenhum acima de 0,9 apareceu em 30 s).

## O que parece estranho na tela

- Poliedro (g): as faces são opacas, cinza-azuladas, e o que se vê são discos azul-claros de borda macia sobre as faces; o núcleo não aparece como um volume dentro do cristal. Na distância curta (`g-poliedro-1.png`) a câmera fica quase dentro do corpo e os discos ocupam o quadro.
- Poliedros comuns no mundo (distantes) aparecem escuros com uma fresta roxa; só de perto aparecem como o cristal azulado das capturas g.
- Dissolução (b): lê-se como uma nuvem de pontos fina com granulação visível; em `b-morte-1.png` o centro tem uma esfera lilás de pontos.
- Brilho (e): em Casco o contraste entre energia alta e baixa é pequeno na imagem.
- Vista oblíqua (f): a 16 de altura e de longe, as criaturas ficam pequenas e quase escuras; as colunas de luz e o respiradouro dominam o quadro.
- Em `d-amadurece-1.png` o organismo acompanhado é translúcido e pequeno sobre o fundo, com um ponto central; o fundo ficou sem referências.

## Tabela de 30 minutos (`eco-seed7-30min.csv`)

`mix abyss.eco --seed 7 --minutes 30`, uma linha por minuto.

| Minuto | Casco | Célula | Filamento | Membrana | Poliedro |
|---|---|---|---|---|---|
| 10 | 44 | 28 | 16 | 34 | 25 |
| 20 | 38 | 64 | 21 | 34 | 20 |
| 30 | 36 | 126 | 26 | 27 | 4 |

Totais em 30 minutos: 632 nascimentos; mortes: 202 por fome, 177 por predação, 184 por velhice. O CSV não tem coluna de extinção; o Poliedro cai para 4 no minuto 30 e a Célula passa de 126.

## Aprovação do autor (2026-11-06)

Parada 1 aprovada pelo autor ("pode considerar aprovado"). Decisões, todas mantendo o estado atual:

1. Poliedro: fica como está (pode se extinguir; equilíbrio não é critério de aceite).
2. Divisão: `divide_s` continua 8 s.
3. Brilho da energia: fica como está.
4. Desfazer na morte: aprovado como está.
5. Abrigo da Floresta: `cover` continua 0,5.

Nenhum valor da calibração inicial (commit 49ab101) foi alterado.
