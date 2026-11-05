# Parada 4 — comida: números de /api/stats em 10 min

Duas rodadas de 10 min cada, mundo novo a cada uma, semente `ABYSS_SEED=20261104`, amostra de `/api/stats` a cada 5 s (`t_s` conta desde o início da amostra; o mundo tinha 6–9 s de vida no início). Arquivos: `stats-sem-comedores.csv` e `stats-com-comedores.csv`.

- **Sem comedores:** `ABYSS_TEST_SPECIES=false` (0 organismos, só flora e partículas).
- **Com comedores:** `ABYSS_TEST_SPECIES=true`, `ABYSS_POPULATION=150`.

Tetos: flora 200 manchas, nível 0–1 por mancha (soma máxima 200); partículas 400.

| | Sem comedores | Com comedores |
| --- | --- | --- |
| Soma da flora (início → fim) | 141,1 → 200,0 | 146,2 → 194,4 |
| Teto da flora | **atingido aos 57 s** (uptime 62 s) e mantido em 200,0 até o fim | não volta a 200: depois do 1º min fica entre **192,4 e 195,9** (comida e rebrota se equilibram) |
| Partículas (início → fim) | 7 → 361 | 24 → 307 |
| Faixa das partículas depois do 4º min | 317–400 | 301–355 |
| Teto das partículas (400) | tocado uma vez (512 s), nunca passou de 400 | nunca chega a 400 (máx. 355) |
| Mordidas na flora | 0 | 972 (**97/min**) |
| Partículas comidas | 0 | 275 (**27,5/min**) |
| Partículas expiradas (se apagaram) | 807 (80,1/min; ~105/min do 5º min em diante) | 624 (62,3/min; ~70–100/min do 4º min em diante) |
| step_us_max (passo mais lento desde a partida) | 3,4 ms | 8,8 ms |

## Por minuto (com comedores)

| Min | Flora (mín–máx) | Partículas (mín–máx) | Mordidas | Comidas | Expiradas |
| --- | --- | --- | --- | --- | --- |
| 1 | 146,2–191,9 | 24–119 | 87 | 7 | 0 |
| 2 | 192,4–194,0 | 126–209 | 89 | 21 | 0 |
| 3 | 192,8–195,9 | 222–311 | 90 | 28 | 12 |
| 4 | 193,3–194,9 | 306–331 | 78 | 23 | 71 |
| 5 | 193,0–194,9 | 328–349 | 88 | 26 | 67 |
| 6 | 192,7–194,9 | 319–355 | 93 | 30 | 104 |
| 7 | 193,1–195,0 | 322–335 | 88 | 28 | 73 |
| 8 | 193,9–195,0 | 312–323 | 98 | 29 | 87 |
| 9 | 193,7–195,1 | 311–328 | 92 | 28 | 78 |
| 10 | 193,7–194,9 | 301–316 | 81 | 27 | 73 |

## Por minuto (sem comedores)

| Min | Flora (mín–máx) | Partículas (mín–máx) | Expiradas |
| --- | --- | --- | --- |
| 1 | 141,1–200,0 | 7–97 | 0 |
| 2 | 200,0 | 106–208 | 0 |
| 3 | 200,0 | 219–317 | 7 |
| 4 | 200,0 | 325–332 | 83 |
| 5 | 200,0 | 324–335 | 103 |
| 6 | 200,0 | 317–339 | 107 |
| 7 | 200,0 | 336–369 | 82 |
| 8 | 200,0 | 371–392 | 107 |
| 9 | 200,0 | 383–400 | 111 |
| 10 | 200,0 | 360–385 | 131 |

## Leitura

- Sem ninguém comendo, a flora enche até o teto em menos de 1 min e fica parada nele; as partículas sobem até ~3 min (quando as primeiras começam a expirar) e daí oscilam abaixo de 400, encostando no teto uma vez.
- Com 150 organismos, a flora fica ~5 abaixo do teto (≈ 97 mordidas/min, compensadas pela rebrota) e as partículas ficam ~50 abaixo da rodada sem comedores: ≈ 27,5/min são comidas por Membranas e o resto expira.

## Vídeo `comida.webm` (60 s, 1600×900, VP9)

- **0–30 s — Jardim (60 s reais a 2×):** a câmera acompanha a Célula CEL-0023 pastando entre as manchas de flora. Pelo canal, ela deu 3 mordidas durante a tomada, aos **6,0 s, 16,0 s e 26,3 s** do vídeo. Manchas já comidas aparecem como placas lisas, sem hastes, ao lado das cheias. Capturas: `still-jardim-celula-00s.jpg` e `still-jardim-celula-30s.jpg` (quadro da tomada aos 30 s reais, ≈ 15 s do vídeo).
- **30–60 s — Planície (30 s reais a 1×):** a câmera acompanha a Membrana MBR-0006. Partículas caem como pontos claros. Uma partícula laranja está dentro da Membrana, com o brilho no leito, e é comida aos **42,0 s** do vídeo. Captura: `still-planicie-membrana-39s.png`.
- Os instantes vêm do canal `world:main` (cada mordida ou partícula removida antes de vencer é atribuída ao comedor mais perto). Eles convertem o relógio do servidor para o do navegador sem corrigir a diferença entre os dois.
