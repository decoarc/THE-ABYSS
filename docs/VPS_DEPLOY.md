# Deploy na VPS

O site público (`theabyss.andrearcodaci.com`) roda na VPS pelo `infra/compose/compose.prod.yaml`
(projeto `abyss-prod`). O acesso público é pela Cloudflare Tunnel: nenhuma porta aberta na máquina.

## Automático: merge na `main` = no ar

O cron do usuário roda `scripts/vps/deploy.sh` a cada 5 min:

```
*/5 * * * * /home/andre/the-abyss/scripts/vps/deploy.sh >/dev/null 2>&1
```

Quando a `origin/main` tem commit novo:

1. O checkout avança só por fast-forward.
2. O site (`dist.new`) e a imagem da API são compilados. Se o build falhar, nada muda no ar.
3. O site é sincronizado em `apps/web/dist` e a API é recriada. A fotografia do mundo é gravada no
   desligamento (gate P), e as migrações rodam na subida.
4. O script espera a API ficar healthy e responder pelo Caddy. Se não ficar, volta para a imagem e o
   site anteriores. Migrações já aplicadas não são desfeitas.

Do merge até a versão no ar: até 5 min de espera, mais uns 2 min de build.

## Estado e log

- `.deploy/deployed`: commit no ar.
- `.deploy/failed`: último commit que falhou. Ele não é tentado de novo; o próximo commit na `main`
  tenta.
- `.deploy/deploy.log`: histórico.

```
tail -n 30 .deploy/deploy.log
scripts/vps/deploy.sh --force      # republica agora, mesmo sem commit novo
```

## Arquivos fora do git

- `infra/compose/.env.prod`: segredos e `TUNNEL_TOKEN` (permissão 600).
- `apps/web/.env.vps.local`: URLs públicas do build (`VITE_API_URL`, `VITE_WORLD_URL`).
