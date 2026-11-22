#!/usr/bin/env bash
# Deploy automático da VPS (gate O): publica a `main` quando chega commit novo.
#
# O cron roda a cada 5 min (ver docs/VPS_DEPLOY.md). A própria VPS consulta o GitHub:
# nada entra na máquina, nenhuma porta aberta. Passos:
#   1. git fetch; se origin/main == último deploy (ou == último que falhou), sai.
#   2. Avança o checkout (só fast-forward; a pasta não pode ter mudanças versionadas).
#   3. Compila o site (dist.new) e a imagem da API. Se qualquer um falhar, nada muda no ar.
#   4. Troca: site via rsync em dist/, API recriada (a fotografia do mundo é gravada no SIGTERM).
#   5. Espera a API ficar healthy e responder pelo Caddy; se não, volta a imagem e o site anteriores.
#
# Uso: scripts/vps/deploy.sh [--force]   (--force publica mesmo sem commit novo)
# Estado e log em .deploy/ (fora do git).
set -euo pipefail

main() {
  local root branch force=0
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  branch="${DEPLOY_BRANCH:-main}"
  [[ "${1:-}" == "--force" ]] && force=1
  cd "$root"

  local state="$root/.deploy"
  mkdir -p "$state"
  exec 9>"$state/lock"
  flock -n 9 || { echo "outro deploy em andamento"; exit 0; }
  exec >>"$state/deploy.log" 2>&1

  local compose=(docker compose -f infra/compose/compose.prod.yaml --env-file infra/compose/.env.prod)
  local site_port
  site_port="$(sed -n 's/^SITE_PORT=//p' infra/compose/.env.prod)"
  site_port="${site_port:-8080}"
  [[ "$site_port" == *:* ]] || site_port="127.0.0.1:$site_port"

  git fetch -q origin "$branch"
  local target deployed failed
  target="$(git rev-parse "origin/$branch")"
  deployed="$(cat "$state/deployed" 2>/dev/null || true)"
  failed="$(cat "$state/failed" 2>/dev/null || true)"
  if [[ $force -eq 0 && ( "$target" == "$deployed" || "$target" == "$failed" ) ]]; then
    exit 0
  fi

  log() { echo "$(date -u +%FT%TZ) [$target] $*"; }
  fail() {
    log "FALHOU: $*"
    echo "$target" >"$state/failed"
    exit 1
  }

  log "deploy de $branch: ${deployed:-nenhum} -> $target"
  [[ "$(git rev-parse --abbrev-ref HEAD)" == "$branch" ]] || fail "checkout não está na $branch"
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "mudanças locais versionadas na pasta"
  git merge -q --ff-only "origin/$branch" || fail "não dá para avançar a $branch só com fast-forward"

  # Build sem tocar no que está no ar.
  docker run --rm -v "$root":/w -w /w -e CI=true \
    -v abyss-pnpm-store:/pnpm-store -e npm_config_store_dir=/pnpm-store \
    node:24-alpine sh -c "corepack enable && pnpm install --frozen-lockfile --reporter=silent \
      && pnpm --filter @abyss/web exec tsc --noEmit \
      && pnpm --filter @abyss/web exec vite build --mode vps --outDir dist.new --emptyOutDir \
      && chown -R $(id -u):$(id -g) node_modules apps/web/node_modules apps/web/dist.new" \
    || fail "build do site"
  if docker image inspect abyss-prod-api:latest >/dev/null 2>&1; then
    docker tag abyss-prod-api:latest abyss-prod-api:anterior
  fi
  "${compose[@]}" build -q api || fail "build da API"

  # Troca. rsync no lugar (o Caddy monta a pasta dist; trocar a pasta inteira ele não veria).
  mkdir -p apps/web/dist apps/web/dist.anterior
  rsync -a --delete apps/web/dist/ apps/web/dist.anterior/
  rsync -a --delete apps/web/dist.new/ apps/web/dist/
  "${compose[@]}" up -d --remove-orphans
  # Arquivos montados não recriam o contêiner: recarrega o que mudou entre os dois commits.
  if [[ -n "$deployed" ]] && ! git diff --quiet "$deployed" "$target" -- infra/compose/Caddyfile; then
    "${compose[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true
  fi
  if [[ -n "$deployed" ]] && ! git diff --quiet "$deployed" "$target" -- infra/backup; then
    "${compose[@]}" restart backup || true
  fi

  if wait_healthy "$site_port"; then
    echo "$target" >"$state/deployed"
    rm -f "$state/failed"
    docker image prune -f >/dev/null || true
    log "OK no ar"
    exit 0
  fi

  log "API não ficou saudável; voltando a versão anterior"
  rsync -a --delete apps/web/dist.anterior/ apps/web/dist/
  if docker image inspect abyss-prod-api:anterior >/dev/null 2>&1; then
    docker tag abyss-prod-api:anterior abyss-prod-api:latest
    "${compose[@]}" up -d --no-build api
  fi
  # O checkout volta junto, para o próximo deploy partir do que está no ar.
  [[ -n "$deployed" ]] && git reset -q --keep "$deployed"
  wait_healthy "$site_port" && log "versão anterior de volta" || log "ATENÇÃO: versão anterior também não respondeu"
  fail "health check (migrações já aplicadas não são desfeitas)"
}

# API healthy no Docker e respondendo pelo Caddy, em até ~3 min.
wait_healthy() {
  local port="$1" id status
  for _ in $(seq 60); do
    id="$(docker compose -f infra/compose/compose.prod.yaml --env-file infra/compose/.env.prod ps -q api)"
    status="$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo none)"
    if [[ "$status" == healthy ]] && curl -fsS -m5 "http://$port/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

# Tudo dentro de main(): o bash lê a função inteira antes de rodar, então o `git merge`
# pode trocar este arquivo no meio do deploy sem quebrar a execução.
main "$@"
exit
