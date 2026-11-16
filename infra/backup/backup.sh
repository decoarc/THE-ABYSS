#!/bin/sh
# Backup agendado do banco (gate P): `pg_dump -Fc` a cada BACKUP_EVERY_S segundos (padrão 21 600 = 6 h)
# em /backups, guardando os BACKUP_KEEP mais novos (padrão 7). O banco guarda mundo e história juntos
# (fotografias, espécies, ramos, contagens), então um arquivo restaura tudo de um mesmo instante.
# Conexão pelas variáveis PG* do serviço. `--once` faz um backup e sai.
# Backup fora da máquina e criptografia: gate O.
set -eu

EVERY="${BACKUP_EVERY_S:-21600}"
KEEP="${BACKUP_KEEP:-7}"
DIR=/backups

mkdir -p "$DIR"

backup_once() {
  f="$DIR/abyss-$(date -u +%Y%m%dT%H%M%SZ).dump"
  # Escreve num temporário e renomeia: um backup cortado no meio nunca parece completo.
  pg_dump -Fc -f "$f.tmp"
  mv "$f.tmp" "$f"
  # Do mais novo ao mais velho; apaga do (KEEP+1)-ésimo em diante.
  ls -1t "$DIR"/abyss-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm -f
  echo "backup: $f ($(wc -c < "$f") bytes; $(ls -1 "$DIR"/abyss-*.dump | wc -l) guardados)"
}

if [ "${1:-}" = "--once" ]; then
  backup_once
  exit 0
fi

while true; do
  backup_once || echo "backup falhou; tenta de novo em ${EVERY} s"
  sleep "$EVERY"
done
