#!/bin/sh
# Restaura um backup do banco (gate P) e sobe o mundo de volta dele.
#
# Uso: sh scripts/backup/restore.sh <arquivo>
#   <arquivo> é um caminho no disco (ex. um .dump baixado) ou o nome de um arquivo do volume de
#   backups (ex. abyss-20261116T120000Z.dump; `docker compose … run --rm backup ls /backups` lista).
#
# Para o `api` (o desligamento grava uma fotografia, mas a restauração a sobrescreve), cria o banco se
# ele não existir (volume novo), roda `pg_restore --clean --if-exists` e sobe o `api`, que volta da
# fotografia guardada no backup.
set -eu

[ $# -eq 1 ] || { echo "uso: sh scripts/backup/restore.sh <arquivo>" >&2; exit 2; }
SRC=$1
DC="docker compose -f infra/compose/compose.yaml"

$DC stop api
$DC up -d --wait db
$DC exec -T db sh -c 'psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '"'"'abyss_dev'"'"'" | grep -q 1 || createdb -U postgres abyss_dev'

if [ -f "$SRC" ]; then
  echo "restaurando $SRC (arquivo local)…"
  $DC exec -T db pg_restore -U postgres --clean --if-exists --no-owner -d abyss_dev < "$SRC"
else
  echo "restaurando /backups/$SRC (volume de backups)…"
  $DC run --rm --entrypoint pg_restore backup --clean --if-exists --no-owner -d abyss_dev "/backups/$SRC"
fi

$DC up -d api
echo "restaurado; o api está subindo (veja /api/stats)."
