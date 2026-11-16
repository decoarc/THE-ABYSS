# Gate P: backup agendado e ensaio de restauração

Feito em 2026-11-16, no compose de dev (Docker Desktop, Windows 11).

## Backup agendado

O serviço `backup` (`postgres:17-alpine`, `infra/backup/backup.sh`) roda `pg_dump -Fc` a cada `BACKUP_EVERY_S`
segundos (padrão 21 600 = 6 h) no volume `db_backups` e guarda os `BACKUP_KEEP` mais novos (padrão 7). Cada
arquivo é escrito num `.tmp` e renomeado, para um backup cortado nunca parecer completo. O banco guarda mundo e
história juntos (fotografias, espécies, ramos, contagens de mortes, eventos), então um arquivo restaura tudo de um
mesmo instante.

- Backup na hora: `pnpm api:backup:now`.
- Restaurar: `pnpm api:restore <arquivo>`. `<arquivo>` pode ser um caminho no disco ou o nome de um arquivo do
  volume.

### Rotação (subido com `BACKUP_EVERY_S=30`)

Em 4 min e 1 s foram feitos 9 backups (de 12:07:49 a 12:11:50 UTC). Ficaram os 7 mais novos (12:08:49 a
12:11:50). Os dois primeiros (12:07:49 e 12:08:19) foram apagados quando nasceram o 8º e o 9º. O log mostrou
"7 guardados" a partir do 7º.

## Ensaio de restauração

Mundo de referência da Parada 1: 10 espécies semeadas, `ABYSS_TEST_SPECIES=false`.

1. Antes: `/api/stats` mostrava tick 3075 e população 38. Por espécie: sp1 3, sp2 7, sp3 5, sp4 3, sp5 3, sp6 4,
   sp7 2, sp8 5, sp9 3, sp10 3.
2. `docker compose stop api`. O log registrou "fotografia de desligamento gravada no tick 3172".
3. `pnpm api:backup:now` gerou `abyss-20261116T121223Z.dump` (177 192 bytes).
4. Banco apagado: `docker compose rm -sfv db` e `docker volume rm compose_db_data`.
5. `sh scripts/backup/restore.sh abyss-20261116T121223Z.dump` levou 7,9 s: subiu um `db` novo, criou o banco,
   rodou `pg_restore --clean --if-exists` e subiu o `api`.
6. Depois: o log registrou "mundo restaurado da fotografia do tick 3172 (epoch 1)". `/api/stats` mostrou tick 3226
   (o mundo já andava de novo), população 38 e as **mesmas contagens por espécie** do passo 1. `species` tinha 10
   linhas. `world_events` tinha só o `pause` da volta, nenhum `restart`.

Resultado: **passou**. Restaurar num banco limpo traz o mundo de volta da fotografia guardada no backup, com as
mesmas criaturas, e a história fica junto.

Ressalva: a leitura "antes" (tick 3075) foi feita uns 10 s antes da fotografia (tick 3172). As contagens por espécie
bateram exatamente, mas não medi se houve algum nascimento e alguma morte da mesma espécie nesse intervalo que se
anularam. A prova mais forte da volta exata, criatura por criatura, é o e2e de reinício (`scripts/e2e/persistence.mjs`).

## Fica para o gate O

Backup fora da máquina, criptografia e alerta de backup que falhou.
