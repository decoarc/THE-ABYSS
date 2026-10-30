# The Abyss — Direção de arte do protótipo visual

Registro das decisões de luz, cor e material da cena *Hydrothermal Garden*, tiradas
da calibração contra `assets/references/hydrothermal-garden-reference.jpg`.
Capturas finais em `docs/captures/`.

## Paleta

Tokens em `apps/web/src/lib/palette.ts` (de `SPEC.md` §3.2). Cores derivadas usadas na cena:

| Uso | Valor | Observação |
|---|---|---|
| Fundo, névoa | `#020A10` (`bg`) | Névoa usa exatamente o fundo, então o leito some sem horizonte marcado |
| Leito (vértices) | `navy`→`bg` 40% até `navy`→`teal` 70% | Manchas por ruído; mais claro que as rochas, para elas lerem como silhueta |
| Rochas | `bg`→`navy` | Mais escuras que o leito |
| Chaminés | `#0e1b22` + fissuras `amber` | Âmbar só nas fissuras, na boca e num halo pequeno |
| Coral ciano | corpo `#123c47`, brilho `#5bb8d6` | Azul mais frio que o `cyan` puro, como na referência |
| Coral violeta | corpo `#211a3c`, brilho `violet` | |
| Coral rosado | corpo `#2a1422`, brilho `#a5507a` | Acento raro, primeiro plano à esquerda |
| Almofadas | entre `cyan` e `violet` | 65% puxando para ciano |
| Tufos | `cyan` (78%) / `amber` | Pontas luminosas |
| Raios de luz | `#7fb8c4` aditivo, força 0,04–0,06 | Mal perceptíveis de propósito |

Núcleos das criaturas (cor × intensidade do pulso, sem tone mapping):

| Criatura | Cor | Pulso (Hz) | Intensidade |
|---|---|---|---|
| Membrana | `#7fe9dd` | 0,16 | 1,05–1,9 |
| Filamento | `#86f4ec` | 0,42 | 2,2–3,6 |
| Casco | `#c9a2ff` | 0,09 | 1,6–3,0 |
| Esporos | ciano/âmbar dessaturados | 0,6 | 1,5–2,6 |

Cor de núcleo clara demais (ex.: `#c4f7ef`) multiplicada acima de 1 vira disco branco chapado;
cores mais saturadas mantêm o tom mesmo no pico.

## Luz

- Ambiente `teal` 0,5 + hemisférica `#2c6f80`/`bg` 1,1: é o que torna o leito legível. Sem ela a cena virava só pontos de luz no preto.
- Direcional fria `#9fd4e0` 0,7, alta e por trás à direita.
- Ponto âmbar na chaminé herói: intensidade 7, alcance 8. Com mais alcance o chão inteiro ficava marrom e o âmbar deixava de ser acento.
- A maior parte da "luz" visível vem de emissão nos shaders (núcleos, fissuras, pontas de coral, bordas de almofada), não de luzes da cena. A única luz extra é a do Casco (alcance 3,5), para a luz do núcleo vazar pelas frestas.

## Névoa e pós-processamento

- `fogExp2` cor `bg`, densidade 0,045. A borda do leito (raio 60) fica sempre além de ~33 unidades da câmera, onde a névoa já cobre >90%.
- Bloom: `luminanceThreshold` 0,6, `mipmapBlur`, intensidade 0,7. Só núcleos, bocas das chaminés e pontas mais fortes passam do limiar; o resto da cena não "brilha", o que mantém o contraste.
- Vinheta: offset 0,25, darkness 0,75.

## Câmera

Posição `[0, 8.2, 17.5]`, alvo `[0, 3.1, 0]`, FOV 42 em 16:10. Olha de cima (~16°) como a referência:
leito ocupa a metade de baixo, vazio escuro em cima. Em telas mais estreitas o FOV vertical sobe
para manter a largura do enquadramento (até 75°).

## Materiais

**Chaminés.** Coluna de anéis empilhados com ruído (11 lados, 20 anéis), base pouco alargada, boca levemente aberta. Shader próprio: rocha escura com grão, fissuras como bandas finas de ruído esticadas na vertical (mais frequentes no alto), boca emissiva e um halo âmbar pequeno por cima. Pluma de partículas quentes bem fraca (opacidade 0,07). Três chaminés altas e finas agrupadas + uma baixa à frente, como na referência.

**Corais.** Gerados por ramificação recursiva (`coralGen.ts`) com `flatten` para formar leques e tronco curto (5–7% da altura). Um BufferGeometry por coral (tubos + bulbos nas pontas). Corpo visível por inteiro em tom médio, brilho subindo para as pontas, borda por Fresnel; balanço por vértice proporcional ao quadrado da altura.

**Almofadas.** Esfera achatada com borda ondulada por ruído, instanciada. Brilho nas laterais e borda, topo escuro: lido como "almofada luminosa", não como disco de plástico.

**Tufos.** Sete hastes finas com bulbo na ponta, instanciados em 18 manchas perto das chaminés.

**Membrana.** Icosfera densa deslocada por simplex 3D no vertex shader, achatada 14% na vertical. Fresnel ciano na borda, violeta tênue no corpo, luz do núcleo atravessando o centro no pico do pulso. **Blending aditivo**: com blending normal o corpo escurecia o fundo e lia como disco opaco. Expande 7% no pico do pulso.

**Filamento.** Fita de seção elíptica (achatamento 0,35) cuja espinha é o próprio trajeto da cabeça amostrado no passado; afina até a cauda; brilho `(1-u)^2.2`, transparência subindo para a cauda.

**Casco.** Dodecaedro de vértices perturbados, cada face uma placa grossa encolhida para o próprio centro (86%). Material opaco escuro e fosco, `flatShading`. A luz violeta do núcleo vaza pelas frestas.

**Esporos.** Núcleo emissivo mínimo + casca elipsoidal por Fresnel bem fraca, instanciados; orientados pela velocidade.

## Movimento

| Criatura | Movimento |
|---|---|
| Membrana | Órbita larga e lenta em volta das chaminés, sobe e desce, respira com o núcleo |
| Filamento | Lissajous amplo no plano médio, ondulação lateral viajando da cabeça para a cauda |
| Casco | Paira quase parado, gira em eixo que vagueia, tranco curto a cada 6–12 s |
| Esporos | Boids com arrancadas e pausas |

Com `prefers-reduced-motion`, deslocamentos e balanços rodam a 8% da velocidade e a câmera não faz a entrada.
Pulsos de luz dos núcleos e o tremular das fissuras continuam a 30% e 15% (são luz, não deslocamento).
Medido: 3,7% dos pixels mudam em 3,5 s com movimento reduzido, contra 16,3% normal.

## Desvios conhecidos em relação à referência

- **Almofadas** ainda lisas demais; a referência tem bordas mais recortadas e manchas internas.
- **Cardume de esporos** tende a se espalhar numa faixa larga dentro do volume em vez de formar bolas densas.
- **Leito**: a referência tem textura de sedimento e muitas pedras médias; aqui o relevo é suave e as pedras são poucas e escuras.
- **Chaminés**: candidatas a Blender se a revisão pedir silhueta mais esculpida (topos com chaminés secundárias, crostas). Luz e cor já estão no lugar; o limite é a forma.

---

# Protótipo 2

O protótipo 1 fica na tag `prototipo-1`. Capturas da v2 em `docs/captures/v2/`.

## Luz no chão

O leito deixou de usar `MeshStandardMaterial` e ganhou shader próprio (`Seabed.tsx`):

- **Sedimento:** as manchas largas por cor de vértice da v1, mais grão em duas escalas (simplex 2,7 e 11 ciclos/unidade). Iluminação fixa e fraca de cima, `0,55 + 0,65 × normal.y`, para o relevo aparecer.
- **Poças de luz:** gaussianas nas pegadas dos raios de luz (`shaftLayout.ts`, mesma fórmula testada em `shaftPool`), clareando o próprio sedimento (`albedo × 1,6`) mais um toque de `#7fb8c4`, força 0,45. Um raio foi movido para cair no primeiro plano à esquerda (`x -5, z 0.5`), onde a poça aparece.
- **Brilho da vida:** até 16 fontes (`floorGlow.ts`) tingem o chão com falloff `(1 - d/r)²`: 6 corais, 2 manchas do canteiro de almofadas, as 5 criaturas (mais fraco e mais largo quanto mais alto elas estão; somem acima de 8 unidades) e 2 de calor âmbar das chaminés. O leito não recebe mais a pointLight âmbar, então o calor no chão vem desses dois slots.
- **Pedras:** 280 no preset alto (120 no baixo), tamanho típico 0,1–0,65, mais escuras que o sedimento: leem como silhueta.

## Criaturas

| Criatura | Núcleo | Corpo / material | Movimento |
|---|---|---|---|
| Membrana | `#7fe9dd` 0,16 Hz | igual à v1 | igual à v1 |
| Filamento | `#86f4ec` 0,42 Hz, raio 0,17 | fita de 0,42 de largura, achatamento 0,22, ~5 unidades; corpo inteiro brilha (`mix(1, 0.3, u)`) e pulsos gaussianos correm da cabeça à cauda (0,35 u/s, um a cada 0,3 u) | Lissajous da v1, ondulação mais larga e lenta |
| Casco | `#c9a2ff` 0,09 Hz | raio 1,15 (era 0,95), frestas maiores (faces a 78%) | igual à v1, mais perto do centro (`6.3, 3.7, -3.4`) |
| Célula | `#d4ec7a` 0,25 Hz | cápsula de 2,0 × 0,46, frente 20% mais gorda, relevo por ruído; pele cerosa verde-acinzentada `#3f5a4a` translúcida (alpha 0,5–0,95 pela borda) mostrando 14 grânulos e o núcleo; luz do núcleo tinge a parede por dentro; 3 flagelos ondulando | vai e volta entre dois pontos à esquerda, cosseno até 0,35 u/s, para 3 s em cada ponta virando de lado; rola no próprio eixo |
| Poliedro | `#a8c8ff` 0,12 Hz, raio 0,4 | dodecaedro liso de raio 1,2 em cristal fosco (`MeshPhysicalMaterial`: transmission 0,92, roughness 0,28, ior 1,45, atenuação `#5d7fa8`, emissivo fraco); o núcleo aparece refratado dentro; arestas aditivas na cor do núcleo. Sem `crystal`: pedra polida escura | giro perfeitamente regular num eixo fixo, 0,18 rad/s; sobe e desce bem devagar |

O cristal precisou de **pouco emissivo** (0,07 × cor do núcleo): com 0,22 as faces ficavam lavanda chapada e o núcleo sumia.
A Célula precisou de **pele translúcida**: opaca, lia como pílula/picles; mostrando os grânulos, lê como célula.

Esporos removidos: liam como o Filamento (ponto brilhante com rastro), só que menores.

Movimento reduzido: 4,6% dos pixels mudam em 3,5 s, contra 25,4% normal.

## Desvios que continuam

- Almofadas ainda lisas; leito sem as pedras médias de borda arredondada da referência (as pedras daqui são facetadas).
- A Célula ainda tem silhueta de cápsula regular de perto; candidata a Blender se a forma incomodar.
- Chaminés: mesmo comentário da v1 (silhueta regular demais; candidatas a Blender).
