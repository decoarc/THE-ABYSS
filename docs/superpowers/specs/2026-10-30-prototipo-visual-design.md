# The Abyss — Protótipo visual (V0/V1) — Design

**Data:** 2026-10-30
**Status:** aprovado em conversa, aguardando plano de implementação
**Contexto maior:** `SPEC.md` (visão completa do produto). Este documento recorta e ajusta a primeira etapa.
**Referência visual:** imagem conceitual na raiz do repositório (`4cEwro6l…jpg`, "ABYSSAL / The living abyss"). Será movida para `assets/references/hydrothermal-garden-reference.jpg`.

## 1. Intenção

Validar a **estética** de The Abyss antes de construir qualquer coisa além dela. A pergunta que o protótipo responde é: *um ecossistema escuro, meio sombrio, com criaturas brilhantes e interessantes, funciona visualmente em 3D no navegador?*

Se a resposta for sim (aprovação explícita do autor), o projeto segue para backend, simulação e criação de espécies (`SPEC.md` §14). Se não, itera-se arte, luz e composição — não se adiciona complexidade para mascarar.

## 2. Objetivos

1. Uma cena 3D local, rodando no navegador, com a **direção estética do ambiente da referência**: leito marinho quase preto, chaminés hidrotermais quentes como foco central, corais ramificados ciano/violeta, "almofadas" luminosas e tufos no chão, rochas escuras, raios de luz fracos vindos de cima, partículas em várias profundidades.
2. **3–4 criaturas abstratas fixas** (não imitam animais reais), cada uma com corpo, consistência e movimento próprios, todas com um **núcleo** luminoso.
3. Câmera cinematográfica com órbita/zoom limitados.
4. Medição de desempenho nas duas GPUs do PC do autor.

## 3. Não-objetivos (nesta etapa)

- **Interface editorial** (título, metadados, rótulos, painel Environment, dicas de navegação): adiada; o autor ainda não decidiu como quer. A cena aparece "limpa".
- Publicação online / Cloudflare Pages: roda só localmente (`pnpm dev` / `pnpm preview`).
- Backend, banco, e-mail, simulação, aprendizado, evolução, persistência.
- **Gerador de criaturas** (atributos → forma). As criaturas são fixas, mas desenhadas de modo que o gerador futuro seja plausível (ver §5.3).
- Blender como requisito (ver §6).

## 4. Anti-objetivos (falha mesmo que "funcione")

- Aquário de fliperama: cores saturadas, brilho global estourado, bloom achatando o contraste.
- Criaturas que leem como peixe, água-viva ou raia.
- Todas as criaturas se movendo do mesmo jeito.
- Câmera que revela bordas inacabadas do cenário.
- Qualquer coisa sugerindo ecossistema funcional ou dados reais (`SPEC.md` §2.2).

## 5. Criaturas

### 5.1 Regras comuns (decisão do autor)

- **Núcleo em todas:** um centro de luz dentro do corpo, que pulsa. É a assinatura do mundo.
- **Bioluminescência concentrada no núcleo.** O corpo pode ter brilho secundário (bordas, translucidez deixando a luz do núcleo vazar), sempre subordinado ao núcleo.
- **Corpo varia por espécie.** A membrana translúcida que respira é *um* dos corpos possíveis.
- **Movimento varia por espécie.**
- **3D**, não sprites.
- Abstratas e simples: silhuetas legíveis acima de microdetalhe.

Influências aprovadas dos rascunhos 2D: o **corpo e o núcleo da "Membrana"** e a **luminescência e o movimento do "Filamento"** (brilho forte na origem, apagando ao longo do corpo; ondulação fluida com rastro).

### 5.2 Elenco proposto (decisão do Claude; ajustável na revisão visual)

| # | Nome de trabalho | Corpo / consistência | Movimento | Papel na cena |
|---|---|---|---|---|
| 1 | Membrana | Bolha translúcida, gelatinosa, deformação suave por ruído; núcleo visível dentro | Deriva lenta + respiração (corpo expande/contrai em sincronia com o pulso do núcleo) | Criatura "herói", grande, perto das chaminés |
| 2 | Filamento | Corpo alongado em fita/tubo, afinando até a cauda; núcleo na "cabeça" | Ondulação contínua ao longo do corpo, trajetórias curvas amplas, rastro de luz se apagando | Cruza o meio da cena, dá movimento direcional |
| 3 | Casco | Corpo rígido, facetado/poliédrico, opaco; a luz do núcleo vaza pelas frestas entre facetas | Pairar quase imóvel, rotação lenta e desajeitada, pequenos "ajustes" ocasionais | Contraste de consistência (duro vs. mole) |
| 4 | Cardume de esporos | Muitas criaturas mínimas: núcleo + casca fina; instanciadas | Movimento coletivo (boids simples), arrancadas e pausas | Substitui o cardume de peixes da referência; dá escala e vida ambiente |

Cada criatura deve ser parametrizada internamente (tamanho, contagem de segmentos, espessura da membrana, frequência de pulso, cor do núcleo etc.) por um objeto de configuração, mesmo que só exista um conjunto de valores por criatura. Isso é preparação barata para o gerador futuro, não o gerador.

### 5.3 Mapeamento futuro atributo → visual (registro, não implementar)

Confirmado pelo autor como direção: mobilidade → corpo mais alongado/apêndices longos; resiliência → membrana mais grossa/opaca/rígida; percepção → mais pontos sensoriais ou apêndices; sociabilidade → pulsação sincronizada com vizinhos; alimentação → cor/comportamento do núcleo; traços especiais → elementos ou materiais extras.

## 6. Como é feito

- **Stack:** Vite + React + TypeScript + React Three Fiber (Three.js, WebGL), `@react-three/postprocessing` para bloom/efeitos. pnpm.
- **Assets:** tudo procedural em código (geometria + shaders GLSL). **Blender é plano B por peça** (decisão do autor): só se a revisão mostrar que o problema de uma peça específica é a *forma*, não luz/cor/composição. Blender não está instalado hoje.
- **Estrutura:** `apps/web/` conforme `SPEC.md` §13 (`src/scene/`, `src/organisms/`, …). Não criar `apps/api/`.
- **Paleta inicial:** tokens de `SPEC.md` §3.2 (`#020A10`, `#071821`, `#123C47`, `#49D6D3`, `#8666C5`, `#D8753B`).
- Animações de alta frequência fora do estado React (refs + `useFrame`). Instancing para cardume, partículas, tufos e rochas pequenas.

## 7. Câmera e comportamento (decisão do Claude, seguindo o spec)

- Começa numa composição autoral semelhante ao enquadramento da referência (chaminé central, vazio escuro em cima, leito na metade de baixo).
- Órbita, pan e zoom limitados; nunca mostra a borda do cenário. Scroll não sequestra a página (a página é só a cena, então isso é trivial nesta etapa).
- `prefers-reduced-motion`: movimento não essencial quase parado, sem transição de entrada.
- Estados: carregando, erro, e WebGL indisponível (mensagem estática simples).
- Selo discreto "demonstração — não é um ecossistema real".
- Janela estreita: composição continua enquadrada (ajuste de FOV/posição), sem exigir paridade com desktop.

## 8. Desempenho

- Hardware do autor: notebook Intel Core Ultra 9 185H, 32 GB, **RTX 4070 Laptop** + **Intel Arc integrada**, tela 2560×1600.
- Alvo provisório: ~60 FPS a 1080p na RTX; modo de qualidade reduzida utilizável na Intel Arc (que faz o papel do "dispositivo mais fraco" do spec).
- Presets de qualidade (ex.: alto/baixo) controlando DPR máximo, contagem de partículas/instâncias e pós-processamento. Escolha do preset: manual via query string é suficiente; adaptativo automático é opcional.
- Registrar: GPU, navegador, resolução, DPR, preset, frame time p50/p95, draw calls.

## 9. Validação e critério de pronto

**Ciclo de iteração (Claude):** capturar screenshots da cena (navegador headless ou Chrome), comparar com a referência em proporção equivalente, ajustar luz/composição/materiais, repetir — antes de apresentar ao autor.

**Critérios (recorte de `SPEC.md` §4.2, sem os de interface):**
1. Atmosfera: profundidade quase preta, formas legíveis, espaço negativo deliberado.
2. Bioluminescência: núcleos e flora leem com clareza sem superexposição; o laranja das chaminés é acento subordinado.
3. Composição: primeiro plano / meio / fundo visíveis, foco herói forte.
4. Movimento orgânico: as 4 criaturas com movimentos claramente distintos, mais flora/partículas, sem parecer loop mecânico.
5. Navegação: controles compreensíveis e dentro dos limites.
6. Resiliência: carregamento/erro/sem-WebGL e movimento reduzido funcionando.
7. Desempenho medido nas duas GPUs (sem alegar meta sem medição).
8. **Aprovação explícita do autor** — único critério que fecha a etapa.

**Evidências a entregar:** capturas desktop e janela estreita; uma gravação curta ou sequência de capturas mostrando movimento; notas de desempenho; lista de desvios em relação à referência (`docs/VISUAL_ACCEPTANCE.md`); notas de material/luz (`docs/ART_DIRECTION.md`).

**Testes automatizados:** typecheck e build obrigatórios; testes unitários só para lógica pura (configs de criatura, presets de qualidade, utilitários de aleatoriedade com semente). Visual é validado por olho, não por teste.

## 10. Deixado para quem constrói

Formas exatas, shaders, número de instâncias, coordenadas de câmera, calibração de cores, escolha de ruído, layout dos elementos do leito, ferramenta de captura de screenshot, e se o cardume reage à câmera.
