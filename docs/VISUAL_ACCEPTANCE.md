# The Abyss — Pacote de revisão do protótipo visual

**Data:** 2026-10-30 · **Branch:** `prototipo-visual`
**Status:** aguardando aprovação explícita do autor (único critério que fecha a etapa).

Como ver: `pnpm install`, depois `pnpm build && pnpm preview` e abrir `http://localhost:4173`.
Variações: `?quality=low`, `?perf=1` (mede e escreve no console após ~15 s).

## Capturas

| Arquivo | O quê |
|---|---|
| [desktop-1440x900.png](captures/desktop-1440x900.png) | Enquadramento principal, mesma proporção da referência (16:10) |
| [desktop-2560x1600.png](captures/desktop-2560x1600.png) | Resolução da tela do autor |
| [narrow-390x844.png](captures/narrow-390x844.png) | Janela estreita/retrato |
| [reduced-motion-1440x900.png](captures/reduced-motion-1440x900.png) | `prefers-reduced-motion: reduce` |
| [seq-0](captures/seq-0.png), [seq-2](captures/seq-2.png), [seq-4](captures/seq-4.png), [seq-7](captures/seq-7.png) | Quadros a 0, 1, 2 e 3,5 s, para ver movimento |

Recapturar: `pnpm build && pnpm preview` e, em outro terminal, `node scripts/capture.mjs` (saída em `captures/`).

## Desempenho

Medido com `?perf=1`: 5 s de aquecimento, 10 s de amostragem, frame time em ms; draw calls são a mediana por quadro somando todos os passes do pós-processamento.
Navegador: Chromium 156.0.8078.4 (Playwright), janela visível (não headless), ANGLE/D3D11. Viewport 1920×1080.
GPU escolhida pelo navegador: Intel Arc por padrão; RTX forçada com `--force_high_performance_gpu` (confirmado pelo `UNMASKED_RENDERER_WEBGL` abaixo).

| GPU | Preset | DPR | Buffer | p50 | p95 | Draw calls |
|---|---|---|---|---|---|---|
| RTX 4070 Laptop | high | 1,0 | 1920×1080 | 4,2 | 4,4 | 55 |
| RTX 4070 Laptop | high | 1,5 | 2880×1620 | 4,2 | 4,3 | 55 |
| Intel Arc | high | 1,0 | 1920×1080 | 4,2 | 8,8 | 55 |
| Intel Arc | high | 1,5 | 2880×1620 | 8,6 | 12,8 | 55 |
| Intel Arc | low | 1,0 | 1920×1080 | 7,9 / 4,2 | 8,8 / 8,6 | 55 |

Leitura:
- O painel do notebook roda a ~240 Hz; 4,2 ms é o teto do vsync. A RTX fica presa nele em todos os casos, então o número mostra que sobra margem, não quanto sobra.
- A Intel Arc fica entre 120 e 240 Hz mesmo no preset alto com DPR 1,5 (pior p95: 12,8 ms, contra o limite de 33 ms do plano).
- O preset baixo foi medido duas vezes (valores separados por `/`); a variação entre rodadas é maior que a diferença para o preset alto a DPR 1. Nesta cena o gargalo não é contagem de instâncias.
- Nenhum ajuste em `QUALITY` foi necessário: `low` na Arc ficou muito abaixo de p95 33 ms e `high` na RTX muito abaixo de p50 16,7 ms.
- Não medido: outros navegadores, Chrome do sistema, monitores externos de 60 Hz.

## Critérios (design §9)

| # | Critério | Situação |
|---|---|---|
| 1 | Atmosfera: profundidade quase preta, formas legíveis, espaço negativo | Atendido na avaliação do implementador: terço de cima escuro, leito azul-petróleo legível |
| 2 | Bioluminescência sem superexposição; âmbar subordinado | Atendido: bloom só nos núcleos, bocas e pontas; âmbar em fissuras finas e halos pequenos |
| 3 | Primeiro plano / meio / fundo, foco herói | Atendido: almofadas e corais rosados na frente, chaminés + leques no meio, cardume e raios ao fundo |
| 4 | Quatro movimentos claramente distintos | Atendido (ver tabela de movimento em `ART_DIRECTION.md`); conferir ao vivo, as capturas mostram pouco |
| 5 | Navegação compreensível e dentro dos limites | Órbita ±54°, polar 54°–84°, zoom 5–20, alvo limitado; testes garantem que a borda fica na névoa |
| 6 | Carregando / erro / sem WebGL / movimento reduzido | Implementados; sem-WebGL e erro cobertos por teste; movimento reduzido conferido em captura |
| 7 | Desempenho medido nas duas GPUs | Feito (tabela acima) |
| 8 | Aprovação explícita do autor | **Pendente** |

## Desvios em relação à referência

1. **Interface editorial ausente** (título, metadados, rótulos, painel Environment): fora do escopo desta etapa por decisão do autor.
2. **Criaturas diferentes de propósito:** a referência tem águas-vivas e peixes; aqui são Membrana, Filamento, Casco e cardume de esporos, abstratos e com núcleo.
3. **Almofadas** mais lisas e uniformes; a referência tem bordas recortadas e manchas internas.
4. **Leito** com relevo suave e poucas pedras; a referência tem textura de sedimento e muitas pedras médias espalhadas.
5. **Cardume** tende a se espalhar numa faixa larga em vez de formar grupos densos como o cardume de peixes da referência.
6. **Chaminés** mais limpas e cilíndricas; a referência tem silhueta mais irregular e várias bocas por coluna.

## Candidatos a Blender

- **Chaminés hidrotermais:** luz e cor estão no lugar, mas a silhueta gerada por anéis de ruído é regular demais. Uma escultura com crostas, ramificações e bocas secundárias resolveria melhor do que mais parâmetros.
- Nenhuma criatura precisa de Blender nesta etapa: os problemas que restam nelas são de calibração, não de forma.

---

# Protótipo 2

**Status:** aguardando aprovação explícita do autor. O protótipo 1 fica na tag `prototipo-1`; o 2 na tag `prototipo-2`.
Design: `docs/superpowers/specs/2026-10-30-prototipo-visual-v2-design.md`.

## O que mudou

- **Luz no chão:** sedimento com grão, poças de luz sob os raios, brilho de corais/almofadas/criaturas/chaminés tingindo o leito, mais pedras médias escuras.
- **Elenco:** Membrana, Filamento (redesenhado), Casco (maior, frestas maiores), **Célula** (nova), **Poliedro** (novo). Esporos removidos.

## Capturas (v1 × v2)

| | v1 | v2 |
|---|---|---|
| 1440×900 | [v1](captures/desktop-1440x900.png) | [v2](captures/v2/desktop-1440x900.png) |
| 2560×1600 | [v1](captures/desktop-2560x1600.png) | [v2](captures/v2/desktop-2560x1600.png) |
| 390×844 | [v1](captures/narrow-390x844.png) | [v2](captures/v2/narrow-390x844.png) |
| Movimento reduzido | [v1](captures/reduced-motion-1440x900.png) | [v2](captures/v2/reduced-motion-1440x900.png) |
| Sequência | [v1 0](captures/seq-0.png) · [v1 7](captures/seq-7.png) | [v2 0](captures/v2/seq-0.png) · [v2 2](captures/v2/seq-2.png) · [v2 4](captures/v2/seq-4.png) · [v2 7](captures/v2/seq-7.png) |

Movimento reduzido: 4,6% dos pixels mudam em 3,5 s (normal: 25,4%).
Na captura estreita a Célula está fora do quadro naquele instante (ela vai e volta pela esquerda).

## Desempenho

Mesmo método da v1 (Chromium 156.0.8078.4, janela visível, ANGLE/D3D11, viewport 1920×1080, `?perf=1`).

| GPU | Preset | DPR | Buffer | p50 | p95 | Draw calls |
|---|---|---|---|---|---|---|
| RTX 4070 Laptop | high | 1,0 | 1920×1080 | 4,2 | 4,3 | 85 |
| RTX 4070 Laptop | high | 1,5 | 2880×1620 | 4,2 | 4,4 | 85 |
| Intel Arc | high | 1,0 | 1920×1080 | 11,6 | 12,7 | 85 |
| Intel Arc | high | 1,5 | 2880×1620 | 21,1 | 27,5 | 85 |
| Intel Arc | low | 1,0 | 1920×1080 | 8,6 | 13,0 | 85 |

Leitura:
- RTX continua presa no vsync de ~240 Hz.
- A Intel Arc ficou bem mais pesada que na v1 (high a DPR 1,5: p50 8,6 → 21,1 ms). Os suspeitos são o passe extra de transmissão do cristal do Poliedro e o shader do leito; não isolei qual pesa mais.
- Metas do plano atendidas: Arc `low` p95 13,0 ms (limite 33); RTX `high` p50 4,2 ms (limite 16,7). `QUALITY` não mudou; se for preciso aliviar a Arc, o primeiro passo é `crystal: false` no `low`.

## Desvios que continuam em relação à referência

1. Almofadas lisas; pedras facetadas em vez de arredondadas.
2. Célula com silhueta de cápsula regular de perto.
3. Chaminés com silhueta regular (candidatas a Blender, como na v1).
4. Interface editorial ausente, por decisão do autor.
