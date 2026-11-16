# Parada 1 do gate P: buscador de espécies e árvore com história

Capturas para o autor julgar: (1) o buscador encontra e leva até a espécie? (2) os quatro casos de busca se comportam
como esperado? (3) a árvore conta bem a história (ramos, extinções e a causa)?

Geradas por `node scripts/capture-p.mjs` (Playwright, `?debug=1&quality=high`, 1280×720, RTX:
`ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU …, D3D11)`), em 2026-11-16.

## Mundo

O mundo de referência do S2: `mix abyss.reset --yes`, `mix abyss.seed_species --count 10 --seed 1`, API com
`ABYSS_TEST_SPECIES=false ABYSS_MUTATION_BOOST=1.5`. Na captura, ~9 h de mundo, 250 organismos, 50 ramos gravados,
várias raízes e ramos extintos. Atravessou reinícios, quedas e uma parada de 5 min (e2e de persistência).

## Os quatro casos de busca

| Caso | O que acontece | Imagem |
| --- | --- | --- |
| Nome de espécie viva (ramo `Semente 3 · Floresta`) | a câmera vai até uma criatura dela e segue (`following: true`); o painel do indivíduo abre | `busca-segue.png` |
| Raiz extinta **sem** descendente vivo (`Semente 1`) | abre a árvore da linhagem: "✕ extinta 16/11 10:45", "última morte: velhice", "últimos 30 min: 79% velhice, 14% fome, 7% predação por Semente 8" | `busca-extinta-sem.png` |
| Raiz extinta **com** descendente vivo | segue um descendente vivo e abre a árvore da raiz | — (não existe neste mundo; coberto pelo teste de unidade do `SpeciesSearch`) |
| Nome inexistente (`Lumna inexistente`) | aviso "Nenhuma espécie com esse nome" | `busca-inexistente.png` |

`busca-resultados.png`: "seme" lista 20 nomes (o limite), as vivas primeiro e "Semente 1 · extinta" no fim.

Neste mundo, toda raiz extinta que teve ramos perdeu também todos eles (ex.: `Semente 2`, com `· Jardim` e
`· Jardim 2` extintos), por isso o 3º caso não aparece ao vivo.

## A árvore com história

`arvore-historia.png`: `Semente 8` (48 vivos), 29 ramos diretos, 2 netos (`Jardim → Planície 6`,
`Planície 8 → Floresta`) e 5 ramos extintos, cada um com data e hora, a diferença de partes para a mãe
("+cilios +placa", "+2 aleta −ocelo"), a última morte e o resumo dos últimos 30 min. O texto completo está em
`captura.json`.

## Resposta do autor e ajustes

Levei três pontos; o autor pediu para corrigir os dois primeiros como sugerido e dar à árvore uma barra de rolagem
que combine com a interface. As imagens acima já são as de depois dos ajustes.

1. **A árvore ficava sobre o painel do indivíduo, com os textos misturados.** Agora o painel do indivíduo sai da
   frente enquanto a árvore está aberta e volta ao fechá-la; a seleção (e o Seguir) continua
   (`arvore-historia.png`).
2. **Linha do resumo cortada na borda.** As linhas secundárias (nascimento, última morte, últimos 30 min) quebram
   dentro do painel, recuadas sob o próprio começo (`busca-extinta-sem.png`, e `· Jardim 5` em
   `arvore-rolagem.png`).
3. **Barra de rolagem do tema.** Polegar reto de 6 px na cor das bordas (`rgba(220,235,232,0.3)`, mais claro sob o
   mouse), sem trilho e sem setas (classe `abyss-scroll`, em `apps/web/index.html`); no Firefox, a barra fina padrão
   na mesma cor (`arvore-rolagem.png`: a árvore de `Semente 8` rolada até o meio).

Depois, a pedido do autor, a lista de resultados da busca passou a usar a mesma barra (`busca-resultados.png`).

A árvore longa (29 ramos diretos) fica como está neste gate.

## Ver ao vivo

API no ar (`http://localhost:4000`) com este mundo. Web: `pnpm build && pnpm --filter @abyss/web preview --port
4173`, depois `http://localhost:4173/?debug=1` (ou `?quality=high`). O buscador fica no canto superior esquerdo:
experimente "seme", "Semente 1", "Semente 8 · Jardim" e um nome qualquer.
