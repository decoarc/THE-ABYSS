# The Abyss: Gate P (Persistência), design

**Data:** 2026-11-15
**Status:** aguardando aprovação do autor (revisado por um construtor independente; pergunta respondida em 2026-11-15).
**Base:** `main` em `78a727d` (PR #5: gate S2 mergeado; ver `docs/GATE_S2_ACCEPTANCE.md`). Branch `gate-p`.
**Referências:** SPEC (§8 persistência e continuidade, §12 modelo de dados, §14 gate P, §15 verificação operacional, §16.1 progressão do mundo), designs do S1 e do S2, `docs/ART_DIRECTION.md`. Esboço da tela: `.superpowers/brainstorm/2438-1794794284/content/historia-onde.html` (opção A escolhida).

## 1. Intenção

Uma pessoa criou uma espécie e volta uma semana depois. O que importa para o autor é ela **entender o que aconteceu com a espécie dela**: quais ramos surgiram e, se a espécie ou algum ramo se extinguiu, **por quê**: fome, velhice ou um predador específico.

Para essa história ser verdadeira, o mundo também precisa **continuar de onde parou** depois de um reinício ou deploy (SPEC §8.1). Hoje um reinício traz as espécies vivas de volta com 3 fundadoras novas, e se perdem população, filhos, mutações individuais e o estado de cada ramo. Com isso, a história teria buracos e contaria coisas que o mundo "esqueceu".

## 2. Metas

1. **O mundo volta exatamente de onde parou** depois de um reinício normal, de uma queda ou de um deploy que não muda regras (§5.4, §5.6, §6).
2. **Tempo congelado:** enquanto o servidor está fora do ar, o mundo não anda. Ao voltar, ele continua do mesmo ponto, sem tentar recuperar o tempo perdido (§5.4).
3. **Registro da história:** nascimento de ramos (já gravado no S2) e extinções **com causa**: a causa da última morte, a espécie predadora quando foi predação e a divisão das mortes na reta final, separada por predador (§5.2).
4. **Buscador** de espécies e ramos pelo nome. A câmera vai até a criatura viva e começa a segui-la (§5.3).
5. **História dentro da árvore:** a árvore que já existe passa a mostrar datas, diferenças de peças e extinções com causa (§5.1).
6. **Backups** agendados do banco, com um ensaio de restauração documentado (§6.6).
7. **Provas de saída** (SPEC §14): recuperação depois de reinício e de queda, tempo do mundo avançando de forma coerente, restauração de backup e desempenho dentro do orçamento já aprovado (§8).

## 3. Não metas

- **Mutações que não viraram ramo.** Decisão do autor: só ramos, para a história ficar clara.
- **Resumo geral "enquanto você esteve fora"** para todo o mundo (SPEC §2.1). O P conta a história de uma espécie; um resumo do mundo fica para depois.
- **Recuperar o tempo de servidor parado** (progressão aproximada, SPEC §8.2): fica fora por decisão do autor.
- **E-mail avisando a criadora**, **página pública com URL fixa** (SPEC §5.3) e **toque/celular**: continuam no backlog.
- **Backup fora da máquina** (off-host, criptografado), monitoramento e e-mail real: gate O.
- **Árvore genealógica de indivíduos:** a história é de ramos.

## 4. Anti-metas

- **História com buracos ou inventada.** Toda causa mostrada vem de mortes registradas. Nada de explicação adivinhada (SPEC §7).
- **Reinício que mata todo mundo de velhice.** Depois de horas parado, a idade das criaturas não pode "pular" (§6.2).
- **Salvar o mundo atrasando o tick.** Gravar a fotografia não pode derrubar o orçamento de passo aprovado no S1/S2.
- **Perder o que já foi aprovado:** visual, desempenho, programas de shader fixos, privacidade do e-mail, "um e-mail = uma espécie", regras do S2.
- **Buscador que vaza e-mail** ou qualquer dado de criadora.

## 5. Decisões do autor

### 5.1 História dentro da árvore (opção A do esboço)
A árvore da espécie (o painel do botão com ícone de árvore) ganha, em cada nó:
- **Ramo:** data de nascimento e diferenças de peças em relação à mãe (por exemplo "+flagelo −placa").
- **Extinto:** marca ✕, data, a causa da última morte (fome, velhice ou "predação por *nome do predador*") e a queda na reta final (por exemplo "últimos 30 min: 70% predação, 30% fome").
- **Vivo:** contagem de vivos, como hoje.

### 5.2 O que conta como história
- **Ramos e extinções**, nada além disso. Mutações soltas ficam de fora.
- **Causa da extinção:** a última morte **e** a divisão das mortes na reta final. Mostrar só a última morte enganaria: uma espécie caçada por semanas pode ter o último indivíduo morrendo de velhice. A reta final e o "30 min" são proposta minha, aceita na conversa.
- **Divisão por predador** (escolha minha, depois da revisão): a predação aparece separada por espécie predadora, por exemplo "últimos 30 min: 50% predação por Garra, 20% por Lumina · Floresta, 30% fome". A reta final mostra **só a divisão das mortes**, não a queda da população em números ("de 40 para 0"), que pediria outra tabela.
- **Extinções de antes do P** mostram "causa não registrada" (escolha minha). O mundo ainda não está publicado, então isso só afeta mundos de teste.

### 5.3 Buscador
- Ele fica no **alto à esquerda** (o canto livre da tela).
- Procura pelo nome **espécies e ramos**, incluindo as extintas há muito tempo (lê o banco, não só o índice).
- Ao escolher uma espécie **viva**, a câmera vai até a criatura viva dela **mais próxima da câmera** e começa a segui-la (o mesmo "seguir" de hoje).
- **Espécie extinta com ramo vivo (opção B):** a câmera segue a criatura viva mais próxima de qualquer ramo descendente, e a árvore abre mostrando que a mãe se extinguiu e que o ramo continua.
- **Linhagem toda extinta:** a câmera não se mexe e a árvore abre direto, com a extinção e a causa.
- **Nome que não existe:** aviso logo abaixo do campo ("Nenhuma espécie com esse nome"). O aviso some quando a pessoa volta a digitar, e nada de janela que trava a tela (escolha minha, dita na conversa).

### 5.4 Tempo do mundo
- **O mundo congela** quando o servidor está fora do ar (opção A). Ele volta do ponto da última fotografia, sem recuperar o tempo perdido.

### 5.5 Abordagem
- **Fotografia do mundo inteiro no Postgres** de tempos em tempos e no desligamento normal (abordagem 1, §7).

### 5.6 Deploy que muda o mundo (opção B)
- **Mudança pequena preserva:** quando o formato da fotografia só ganha campos (por exemplo um campo novo no organismo ou na espécie), a fotografia antiga é completada com valores padrão e o mundo continua com as mesmas criaturas.
- **Mudança de regra recomeça:** quando muda uma regra de verdade (como comer, caçar, morrer, se dividir, mutar ou ramificar) ou o significado de um campo, o mundo recomeça (§6.4 passo 5) e registra "mundo recomeçado em *data*".
- Por isso a fotografia guarda **duas versões**: a do **formato** (sobe quando entra campo; a carga completa os campos que faltam) e a das **regras** (sobe quando muda regra; versão diferente = recomeço). Quem muda o código decide qual das duas subir; o plano deve deixar isso escrito junto da constante e coberto por um teste que carrega uma fotografia do formato anterior.
- Não existem conversões escritas à mão para cada mudança (opção C, descartada pelo autor).

## 6. Como funciona

### 6.1 Fotografia do mundo
- O estado completo do `Sim` (organismos, comida, sorteio, `tick`, contadores de ramos, genomas, extintas carregadas, eventos pendentes) é gravado numa tabela `world_snapshots` (SPEC §12): conteúdo binário, versão das regras, versão do formato, tick, relógio do mundo, hora real e checksum.
- **Quando:** a cada ~60 s e no desligamento normal (SIGTERM / parada do supervisor). Numa queda brusca perde-se até ~1 min de mundo. A história não perde nada, porque é gravada na hora (§6.3).
- **Sem atrasar o tick:** o `World.Server` só entrega uma cópia do estado. A codificação e a escrita acontecem em outro processo (escolha minha). Na escrita do desligamento, o servidor espera a gravação terminar, até um limite.
- Guardam-se as **últimas 3** fotografias. Ao ligar, o servidor usa a mais recente com checksum válido (escolha minha).

### 6.2 Relógio do mundo
Hoje o `Sim` usa a hora real (`System.system_time`) para idade, fases e extinções. Com o mundo congelado, isso faria todo adulto morrer de velhice depois de uma parada longa. Por isso:
- O mundo passa a ter um **relógio próprio**: hora real menos o tempo total parado. A fotografia guarda esse relógio; ao voltar, o deslocamento é refeito para que o relógio continue exatamente do ponto salvo.
- O `server_ms` que vai para o cliente (idade no painel, interpolação) usa o relógio do mundo.
- **Datas mostradas na história** (nascimento de ramo, extinção) usam a **hora real** do momento em que o evento aconteceu, porque é o que a criadora reconhece no calendário (escolha minha).

### 6.3 Registro de causas
- **Espécie do predador:** hoje a predação marca só a presa comida. Passa a registrar também a espécie de quem comeu.
- **Contagem de mortes por intervalo:** por espécie/ramo, por causa e por predador, em intervalos de **5 min** (escolha minha), numa tabela `death_counts`. É bem mais leve do que gravar cada morte. A "reta final" de uma extinção é lida dos intervalos dos últimos 30 min antes dela.
- **Relógio dos intervalos** (escolha minha, depois da revisão): os intervalos e a janela de 30 min usam o **relógio do mundo**, para que uma parada do servidor não "esvazie" a reta final. Só as datas mostradas usam hora real.
- **Minuto perdido numa queda** (escolha minha, depois da revisão): cada contagem guarda o tick do mundo em que foi feita. Ao voltar de uma fotografia, as contagens com tick depois dela são descartadas (senão o mundo refeito contaria as mesmas mortes duas vezes), **exceto** as de espécies e ramos cuja extinção ficou gravada nesse intervalo, que mantêm a reta final verdadeira.
- **Na extinção:** a última morte (causa e predador) é gravada junto com a extinção, em colunas novas de `species` e `branches` (por exemplo `extinct_cause`, `extinct_predator_id`). Hoje o `Recorder` já grava `extinct_at`.
- A gravação continua por `cast` no `Recorder`: o tick nunca espera o banco (regra do S1).
- O nome do predador é resolvido na leitura. Ele pode ser uma espécie de teste (id atom), uma criada ou um ramo.

### 6.4 Volta do servidor (reconciliação)
O banco é a verdade sobre **quais espécies e ramos existem e quando se extinguiram**. A fotografia é a verdade sobre **as criaturas**. Ao ligar:
1. Carrega a fotografia mais recente que seja válida e compatível.
2. **Espécie criada depois da fotografia** (está no banco e não na fotografia): entra com 3 fundadoras, como hoje.
3. **Ramo gravado depois da fotografia** (nasceu no minuto perdido de uma queda): volta com 3 criaturas da planta dele, como a regra de reinício do S2. A história dele não se perde.
4. **Extinção gravada depois da fotografia:** vale a do banco. As criaturas dessa espécie ou ramo que ainda estão na fotografia são retiradas.
5. **Fotografia incompatível** (um deploy mudou a versão das regras, §5.6; ou o formato mudou de um jeito que a carga não completa) ou ausente: o mundo volta do jeito de hoje (espécies e ramos vivos com 3 criaturas) e registra um evento "mundo recomeçado em *data*". A árvore mostra esse evento nas espécies vivas nesse momento. A história anterior fica, porque está nas tabelas de eventos (escolha minha, dita na conversa).
- Paradas normais (congelamento) **não** aparecem na árvore. Ficam registradas numa tabela `world_events` para as provas e para o gate O (escolha minha).

### 6.5 Buscador e história (cliente e API)
- **API nova, só leitura e sem e-mail:**
  - `GET /api/species/search?q=`: espécies e ramos cujo nome contém o texto, sem diferenciar maiúscula/acento. Retorna id, nome, se está viva e a raiz. Nomes podem se repetir (não há índice único de nome), então a resposta é uma lista e o cliente mostra os resultados para a pessoa escolher.
  - `GET /api/species/:id/history`: a árvore da raiz com, em cada nó, data de nascimento, diferenças de peças em relação à mãe, extinção (data, causa, predador, divisão dos últimos 30 min) e o evento "mundo recomeçado", se houver.
- As **diferenças de peças** são calculadas na leitura a partir das plantas da mãe e do ramo, com a mesma regra de "diferença de peças" do S2.
- A árvore no cliente passa a consultar a API de história, e não só o snapshot do canal, que guarda só as 100 extintas mais recentes. Assim ela funciona para qualquer espécie encontrada pela busca.
- Limite de requisições por IP no buscador, como o rate limit do S1 (escolha minha).

### 6.6 Backups
- Um serviço no compose roda `pg_dump` a cada **6 h** num volume próprio e guarda os **7** mais recentes (escolha minha; valores ajustáveis).
- Um script de restauração e um **ensaio documentado**: restaurar um backup num banco limpo e o mundo voltar dele.
- Backup fora da máquina e criptografia: gate O.

## 7. Abordagens consideradas

1. **Fotografia do mundo inteiro no Postgres (escolhida).** É simples, a volta é exata e tudo fica num lugar só, então o backup cobre mundo e história juntos. É o que o SPEC §12 prevê. Custo: uma queda brusca perde até ~1 min de mundo.
2. **Refazer o mundo a partir da semente e das entradas.** Descartada: semanas de mundo levariam horas para recalcular, e qualquer mudança de código quebra o resultado.
3. **Fotografia em arquivo no disco.** Descartada: o mundo fica dividido em dois lugares, e uma restauração pode juntar a fotografia de um dia com as espécies de outro.

## 8. Provas de saída (SPEC §14, §15)

- **Reinício normal:** desligar e ligar mantém as criaturas, as posições, a energia e a idade. O tick e o relógio do mundo continuam do ponto salvo.
- **Queda brusca** (`kill -9` / contêiner morto): volta da última fotografia, perdendo no máximo ~1 min. A reconciliação (§6.4) cobre espécie criada, ramo nascido e extinção dentro do minuto perdido.
- **Parada longa:** o servidor fica horas fora e, ao voltar, ninguém morre de velhice por causa da parada.
- **Fotografia incompatível ou corrompida:** cai para a fotografia anterior válida ou para o recomeço com o evento registrado.
- **Deploy com campo novo:** uma fotografia do formato anterior carrega e o mundo continua com as mesmas criaturas. Já com versão de regras diferente, ele recomeça.
- **Queda com contagens:** depois de uma queda, as contagens de mortes não ficam duplicadas.
- **Causas de extinção:** um experimento com semente fixa mostra uma extinção por predação com o predador certo e uma por fome.
- **Buscador:** e2e com espécie viva, extinta com ramo vivo, linhagem extinta e nome inexistente.
- **Backup:** o ensaio de restauração passa.
- **Desempenho:** o orçamento de passo e o FPS aprovados no S2 se mantêm com a fotografia ligada.
- **Duas paradas com o autor**, como nos gates anteriores. Parada 1: buscador e árvore com história no mundo ao vivo. Parada 2: pacote de aceite (`docs/GATE_P_ACCEPTANCE.md`) e demonstração de reinício e queda.

## 9. Fica com o construtor

- Formato exato da fotografia (por exemplo `:erlang.term_to_binary` comprimido) e o que entra ou se recalcula no boot (por exemplo `bounds`, grade espacial).
- Intervalo exato da fotografia, tamanho dos intervalos de mortes e o limite de espera no desligamento, dentro dos valores acima.
- Onde ficam as duas constantes de versão (§5.6) e como a carga completa campos novos com valores padrão.
- Como o processo de gravação evita sobrepor duas fotografias.
- Visual da árvore anotada e do buscador, dentro da direção de arte e do esboço aprovado.
- Desligamento gracioso no ambiente atual (`mix phx.server` no compose) e no futuro release.
