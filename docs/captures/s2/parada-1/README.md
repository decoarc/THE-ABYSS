# Parada 1 do S2: ramos de olhar e árvore

Capturas para o autor julgar três coisas: (1) os ramos se distinguem da mãe de olhar? (2) o botão e o fluxograma da árvore estão claros? (3) o ritmo da evolução parece certo?

Geradas por `node scripts/capture-s2.mjs --gpu arc` e `--gpu rtx` (Playwright, `?debug=1`, 1280×720, câmera pela ponte de depuração).

## Mundo

- API: `ABYSS_TEST_SPECIES=false`, 10 espécies semeadas (`mix abyss.seed_species --count 10 --seed 1`), mundo zerado antes (`pnpm api:reset`).
- Valores de medição do mundo que gerou as imagens: `ABYSS_MUTATION_BOOST=1.5` e `ABYSS_FOOD_BOOST=1` (comida canônica). O compose agora repassa `ABYSS_MUTATION_BOOST`.
- Tentativas anteriores, descartadas: boost 8 (`part_p` vira 1,0, todo nascimento muta e nenhum filho nasce "sem mutação", então a regra `branch_inherited` nunca cumpre: 0 ramos em 138 nascimentos); boost 2 com comida ×3 (população no teto de 250, 321 nascimentos em ~30 min, 0 ramos); boost 8 com comida ×3 igual ao primeiro.
- Com boost 1,5 e comida 1: o 1º ramo apareceu ~31 min depois de subir o mundo e o 2º logo em seguida (~31 min); ao capturar (~35 min) havia 3 ramos (`branches_total` 3), todos filhos diretos de raízes.
- Não ocorreram no tempo disponível: ramo neto (ramo de ramo) e ramo extinto. A árvore mostrada tem só mãe e dois ramos.

## Espécies e organismos mostrados

Mãe `sp2` ("Semente 2"), ramo `sp2.1` ("Semente 2 · Jardim"); a árvore também tem `sp2.2` ("Semente 2 · Jardim 2"). Em ambas as GPUs: mãe = indivíduo `S02-0006`, ramo = indivíduo `S02-0022`. Ids completos em `captura-arc.json` e `captura-rtx.json`.

## GPU

- Arc: `ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)`, `?quality=low`.
- RTX: `ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002860) Direct3D11 vs_5_0 ps_5_0, D3D11)`, `?quality=high`.

## Imagens (`<gpu>` = `arc` ou `rtx`)

- `mae-<gpu>.png`: a mãe de perto, nadando (selecionada, câmera de lado).
- `ramo-<gpu>.png`: o ramo de perto, nadando.
- `mae-ramo-<gpu>.png`: as duas fotos lado a lado, com legenda.
- `arvore-<gpu>.png`: botão da árvore clicado com o ramo selecionado; painel mostra a mãe e os dois ramos com vivos.
- `indice-<gpu>.png`: índice "NO TERRÁRIO" aberto, com os ramos aninhados sob as mães e as extintas ao fim.
- `captura-<gpu>.json`: ids, renderizador e o texto da árvore e do índice.

## Ver ao vivo

A API fica no ar com o mundo evoluído (`http://localhost:4000`). Web: `pnpm build && pnpm --filter @abyss/web preview --port 4173`, depois `http://localhost:4173/?debug=1` (ou `?quality=high`). Selecione um indivíduo de `Semente 2 · Jardim` no índice e abra o botão da árvore (canto inferior direito).
