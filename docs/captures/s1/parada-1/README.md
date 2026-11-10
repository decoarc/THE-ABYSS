# Parada 1 do S1 — capturas e calibração

Capturas da Parada 1 do gate S1 (Gênese de Espécies), geradas por `scripts/capture-s1.mjs` com as
plantas de `scripts/capture-s1-plantas.json`. Mundo de dev (`pnpm api:up`, espécies de teste ligadas,
população 150) e cliente Vite com `?debug=1`. As 8 espécies foram publicadas pelo fluxo real
(`/api/genesis/submit` → caixa de dev → `/api/genesis/confirm`), com e-mails distintos.

GPUs (seleção como em `scripts/perf/measure.mjs`):
- `arc` = GPU padrão + `?quality=low` → *ANGLE (Intel, Intel(R) Arc(TM) Graphics, D3D11)*
- `rtx` = `--force_high_performance_gpu` + `?quality=high` → *ANGLE (NVIDIA, GeForce RTX 4070 Laptop GPU, D3D11)*

## As 8 plantas

| # | Nome | Origem | Boca | Peças |
|---|---|---|---|---|
| 1 | Quatro Flagelos | fixture "quatro flagelos" (cores e padrão trocados) | raspador | flagelo ×4 |
| 2 | Misto | fixture "misto" | raspador | cílios ×2, ocelo, gancho |
| 3 | Corpo Grande | fixture "corpo grande limitado em 1.6" (cores trocadas) | raspador | — |
| 4 | Espinha de Seis | fixture "espinha de 6 pontos" (cores trocadas) | raspador | ocelo ×2 |
| 5 | Sorteada 5 | `Random.blueprint`, semente `{1, 0x5EED, 1}`, sorteio 5 | raspador | cardume, gancho, flagelo, ocelo ×3 |
| 6 | Sorteada 6 | idem, sorteio 6 | filtro | aleta ×3, cílios, cardume |
| 7 | Sorteada 10 | idem, sorteio 10 | mandíbula | placa ×2, cardume, gancho |
| 8 | Sorteada 15 | idem, sorteio 15 | filtro | placa ×2, cílios ×2, aleta |

(Os sorteios são os mesmos `sp5`, `sp6`, `sp10` e `sp15` do `mix abyss.eco --seed 1 --genesis N`.)

## Arquivos

| Arquivo | O que mostra |
|---|---|
| `editor-folha.png` | folha de contato: as 8 na prévia do editor (`#criar`), só o palco |
| `editor-<n>-<nome>.png` | cada planta no editor, com o painel (peças marcadas) |
| `mundo-arc-<n>-<nome>.png` | a mesma espécie nadando no mundo, de perto, selecionada (Arc, `low`) |
| `mundo-rtx-<n>-<nome>.png` | idem na RTX (`high`) |
| `cardume-arc.png`, `cardume-rtx.png` | 3 da mesma espécie com filamento de cardume juntas (Arc: Sorteada 6; RTX: Sorteada 5), depois de 90 s de mundo |
| `floresta-gancho-<gpu>-0..2.png` | Misto (gancho) fugindo de um predador com o rumo apontado para a Floresta (3 quadros, 1,2 s entre eles) |

Notas sobre as capturas:
- A prévia do editor nasce com a câmera a 4,2 do centro; corpos grandes (espinha de até 4) saem do quadro. O script afasta a câmera com a roda do mouse (como a pessoa faria) antes das fotos.
- No mundo, a câmera fica de lado em relação ao rumo da criatura (rumo tirado das posições), a ~(1,1 + 1,6 × raio) de distância. "Corpo Grande" tem espinha bem mais comprida que o `body_radius` (limitado em 1,6), então a câmera fica perto demais e o corpo atravessa o quadro.
- `cardume-rtx.png` e `floresta-gancho-rtx-*` vêm de uma sessão anterior do mesmo mundo (antes de um `api:reset`, refeito porque Sorteada 10 e 15 já tinham se extinguido quando a passagem da RTX chegou nelas); os `mundo-rtx-*` e todos os `*-arc*` vêm da sessão depois do reset.
- Fuga para a Floresta: a captura mostra a criatura com gancho fugindo (predador a menos de 8, rumo·centro da Floresta 0,74–0,77), mas longe dela (51 e 76 de distância do centro; raio da Floresta 30). A chegada ao abrigo não foi capturada.
- Placa escapando do bote: não há still; a evidência é a tabela abaixo (`hunts_escaped`).

## Calibração (Step 1)

`mix abyss.eco --seed S --minutes 60 --genesis 20`, S = 1..5, com as espécies de teste e sem elas
(`test_species: false`). Catálogo sem mudanças (`metabolism.base = 0.04`, `per_radius2 = 0.06`).
"> 60%": alguma espécie passou de 60% da população em algum minuto (primeiro minuto, fração, quantos minutos ao todo).
"Dividiram ≤ 20 min": das 20 sorteadas, quantas tiveram ao menos um nascimento nos primeiros 20 min.

| Teste | Semente | Criadas vivas no min 60 | > 60% | Fome | Predação | Velhice | Botes certos | Escapes (placa) | Dividiram ≤ 20 min |
|---|---|---|---|---|---|---|---|---|---|
| com | 1 | 2/20 | `celula` (de teste), min 21, 61%, 40 min | 400 | 42 | 620 | 42 | 0 | 9/20 |
| com | 2 | 0/20 | `celula`, min 24, 62%, 25 min | 401 | 66 | 616 | 66 | 0 | 11/20 |
| com | 3 | 0/20 | `celula`, min 16, 61%, 22 min | 534 | 305 | 708 | 305 | 0 | 8/20 |
| com | 4 | 2/20 | `celula`, min 31, 63%, 14 min | 576 | 512 | 477 | 512 | **2** | 13/20 |
| com | 5 | 0/20 | `celula`, min 28, 62%, 33 min | 352 | 41 | 508 | 41 | 0 | 4/20 |
| sem | 1 | 4/20 | `sp5` (raspador), min 55, 60%, 6 min | 452 | 9 | 229 | 9 | **1** | 5/20 |
| sem | 2 | 2/20 | `sp13` (raspador), min 9, 64%, 52 min | 525 | 0 | 252 | 0 | 0 | 7/20 |
| sem | 3 | 4/20 | `sp1` (raspador), min 40, 62%, 21 min | 409 | 5 | 239 | 5 | 0 | 7/20 |
| sem | 4 | 4/20 | `sp3` (raspador), min 51, 63%, 10 min | 378 | 7 | 194 | 7 | 0 | 10/20 |
| sem | 5 | 2/20 | `sp13` (raspador), min 12, 64%, 47 min | 361 | 0 | 140 | 0 | 0 | 4/20 |

Leitura:
- Das 20 espécies criadas vivas no minuto 60 (10 corridas), 19 comem flora (raspador) e 1 come partículas; nenhum predador criado sobrevive.
- Com as espécies de teste, `celula` passa de 60% em todas as sementes. Sem elas, uma sorteada com raspador passa de 60% em todas.
- As sorteadas são quase todas grandes (`body_radius` 1,3–1,6): o `Random` sorteia `r` da espinha até 0,9. Espécie típica (raio 0,8–1,2 e 2–3 peças de movimento) quase não aparece nelas (0–2 por corrida), por isso a checagem da típica foi feita à parte.

### Espécie típica: divide em 20 min?

5 plantas típicas (espinha `[-0.6,0,0.4] [0,0,0.55] [0.6,0,0.4]`, raio 1,0, `mature_s` 120), somadas às 20 sorteadas
(3 fundadoras cada), 20 min, sementes 1..5, com e sem as de teste. Célula = corridas (de 10) com ao menos uma divisão.

| Planta | Metabolismo | Dividiu (com teste) | Dividiu (sem teste) |
|---|---|---|---|
| raspador + flagelo ×2 + aleta | 0,160 | 3/5 | 5/5 |
| filtro + flagelo ×2 + aleta | 0,160 | 4/5 | 4/5 |
| mandíbula + flagelo ×2 + aleta | 0,170 | 1/5 | 1/5 |
| raspador + cílios ×2 | 0,140 | 5/5 | 3/5 |
| filtro + aleta ×2 + cílios | 0,145 | 4/5 | 0/5 |

As típicas com raspador e filtro se dividem em 20 min na maior parte das corridas (a primeira divisão costuma
vir entre o 1º e o 13º minuto). Pela regra da Task 14, **nenhum ajuste no catálogo**: `metabolism.base` e
`per_radius2` ficam como estão. A mandíbula típica quase nunca se divide (morre de fome): fica para a
pergunta (4) da parada com o autor.

### Placa escapando do bote

Nas 10 corridas acima: 3 escapes contra 987 botes certos (seed 4 com teste: min 9 e 10; seed 1 sem teste: min 3).
Quase não há escape porque as presas com placa sorteadas são grandes (raio 1,3–1,6), e o predador só caça presa menor.

Cenário dirigido (sem espécies de teste, 30 min): um caçador grande (mandíbula, flagelo ×2, ocelo ×2,
raio 1,6, 4 fundadores) contra presas pequenas (raio 0,6; 8 fundadoras cada) com placa ×2 (`escape` 0,255) e sem placa.

| Semente | Botes certos | Escapes | Presas com placa predadas | Presas sem placa predadas |
|---|---|---|---|---|
| 1 | 0 | 0 | 0 | 0 |
| 2 | 7 | **4** | 7 | 0 |
| 3 | 0 | 0 | 0 | 0 |
| 4 | 0 | 0 | 0 | 0 |
| 5 | 0 | 0 | 0 | 0 |

Na semente 2, 4 dos 11 botes que alcançaram uma presa com placa terminaram em escape (36%, para `escape` 0,255 por bote).
Nas outras, o caçador morre de fome antes de alcançar alguém.

### Mudanças no catálogo

Nenhuma. A única mudança de código foi no `mix abyss.eco`: colunas `hunts_ok` e `hunts_escaped` por
minuto e a opção `test_species` em `Abyss.Eco.run` (commit `feat: mix abyss.eco conta botes certos e escapes da placa`).

## Ajuste leve (Parada 1)

Decisão do autor na Parada 1, aplicada no commit `art: ajuste leve do catálogo (placa e mandíbula) e corpos variados no sorteio`:

- `placa`: `escape` 0,15 → 0,25 (teto `caps.escape` 0,6 e `speed_factor` 0,9 ficam).
- `mandibula`: `cost` 5 → 4 e `metab` 0,020 → 0,010.
- `Random.blueprint`: cada planta sorteia uma classe de tamanho (pequena, média ou grande, 1/3 cada) e
  sorteia comprimento da espinha, `r` dos pontos e curvatura dentro da faixa da classe. Antes quase todo corpo
  saía com `body_radius` 1,3–1,6; agora (teste com 1.000 plantas) ao menos 25% têm < 0,9 e ao menos 25% têm > 1,2
  (nas 60 espécies sorteadas da recalibração: 23 < 0,9, 22 > 1,2).
- Fixtures: só "mandibula" mudou (`cost` 8 → 7, `metabolism` 0,08535 → 0,07535, regenerados por script);
  nenhuma fixture tem placa. O plano `docs/superpowers/plans/2026-11-10-gate-s1-genese.md` não foi editado.

Recalibração: mesmo comando e métricas do Step 1, sementes 1..3, 60 min, 20 sorteadas, sem e com espécies de teste
(`tmp/calib.exs`, `CONC=1`, mesmo `Abyss.Eco.run`). Como o `Random` mudou, as 20 sorteadas de cada semente são
outras plantas: a comparação é de panorama, não espécie a espécie. "Antes" vem da tabela do Step 1.

| Teste | Semente | | Criadas vivas no min 60 | > 60% | Fome | Predação | Velhice | Botes certos | Escapes (placa) | Dividiram ≤ 20 min |
|---|---|---|---|---|---|---|---|---|---|---|
| com | 1 | antes | 2/20 | `celula`, min 21, 61%, 40 min | 400 | 42 | 620 | 42 | 0 | 9/20 |
| com | 1 | depois | 2/20 | `celula`, min 19, 61%, 17 min | 505 | 158 | 725 | 158 | 0 | 7/20 |
| com | 2 | antes | 0/20 | `celula`, min 24, 62%, 25 min | 401 | 66 | 616 | 66 | 0 | 11/20 |
| com | 2 | depois | 4/20 | `celula`, min 31, 61%, 3 min | 394 | 45 | 736 | 45 | 0 | 10/20 |
| com | 3 | antes | 0/20 | `celula`, min 16, 61%, 22 min | 534 | 305 | 708 | 305 | 0 | 8/20 |
| com | 3 | depois | 1/20 | `celula`, min 23, 60%, 12 min | 529 | 541 | 558 | 541 | 0 | 8/20 |
| sem | 1 | antes | 4/20 | `sp5` (raspador), min 55, 60%, 6 min | 452 | 9 | 229 | 9 | 1 | 5/20 |
| sem | 1 | depois | 1/20 | `sp5` (raspador, placa ×2), min 11, 65%, 50 min | 219 | 2 | 133 | 2 | 0 | 6/20 |
| sem | 2 | antes | 2/20 | `sp13` (raspador), min 9, 64%, 52 min | 525 | 0 | 252 | 0 | 0 | 7/20 |
| sem | 2 | depois | 6/20 | nenhuma | 370 | 0 | 490 | 0 | 0 | 11/20 |
| sem | 3 | antes | 4/20 | `sp1` (raspador), min 40, 62%, 21 min | 409 | 5 | 239 | 5 | 0 | 7/20 |
| sem | 3 | depois | 4/20 | nenhuma | 508 | 0 | 232 | 0 | 0 | 9/20 |

Totais (3 sementes): com teste, criadas vivas 2 → 7 de 60 (antes 2+0+0, depois 2+4+1); sem teste, 10 → 11 de 60;
`hunts_ok` com teste 413 → 744, sem teste 14 → 2; `hunts_escaped` 1 → 0 em todas.

Leitura:
- Predador criado vivo no minuto 60: nenhum, antes e depois (13 das 60 sorteadas têm mandíbula).
- Sem espécies de teste, 2 das 3 sementes não têm mais espécie acima de 60%; com teste, `celula` ainda passa de 60%
  nas três (61%, 61%, 60%), por menos minutos.
- A placa (escape 0,25) ainda não escapa de nenhum bote nestas corridas (`hunts_escaped` = 0): as caçadas quase
  só acontecem com espécies de teste, cujas presas não têm placa.
- Não se ajustou mais nada (equilíbrio não é critério de aceitação).

### Espécie típica com mandíbula (depois)

Mesma planta (mandíbula + flagelo ×2 + aleta, raio 1,0, `mature_s` 120) somada às 20 sorteadas (3 fundadoras),
20 min, sementes 1..5. Metabolismo 0,170 → 0,160, custo 17.

| | Antes | Depois |
|---|---|---|
| Dividiu em 20 min, com teste | 1/5 | 1/5 (semente 5) |
| Dividiu em 20 min, sem teste | 1/5 | 1/5 (semente 4) |

Continua quase nunca dividindo: a mandíbula típica morre de fome antes de alcançar presa.
