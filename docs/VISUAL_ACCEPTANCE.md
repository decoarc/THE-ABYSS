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
