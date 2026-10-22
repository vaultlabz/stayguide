#!/usr/bin/env bash
# 2026-10-22 11:33, #65 nightly second copy of the StayGuide data, independent of Plesk Backup Manager:
# MySQL dump (consistent snapshot, no table locks) + user files. Keeps KEEP_DAYS days, then deletes older sets.
# Run from Plesk → Scheduled Tasks (cron), e.g. daily 02:30:  bash /var/www/vhosts/<domain>/<app>/scripts/backup-mysql.sh
# DB credentials live in ~/.stayguide-backup.cnf (chmod 600), never on the command line:
#   [client]
#   user=<DB_USER>
#   password=<DB_PASSWORD>
#   host=localhost
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
env_value() { { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null || true; } | tail -1 | cut -d= -f2-; } # missing key -> empty
DB_NAME="${DB_NAME:-$(env_value DB_NAME)}"
OPS_DIR="${OPS_STORAGE_DIR:-$(env_value OPS_STORAGE_DIR)}"
OPS_DIR="${OPS_DIR:-$APP_DIR/storage/ops}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/stayguide-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
CNF="${CNF:-$HOME/.stayguide-backup.cnf}"

stamp="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
umask 077

mysqldump --defaults-extra-file="$CNF" --single-transaction --quick --routines --triggers --no-tablespaces \
  "$DB_NAME" | gzip > "$BACKUP_DIR/db_$stamp.sql.gz.part"
mv "$BACKUP_DIR/db_$stamp.sql.gz.part" "$BACKUP_DIR/db_$stamp.sql.gz"

# Uploaded images, job photos / insurance certificates, and .env (OPS_SECRET_KEY is needed to read stored access codes)
files=()
for p in "$APP_DIR/public/uploads" "$OPS_DIR" "$APP_DIR/.env"; do [ -e "$p" ] && files+=("${p#/}"); done
tar -czf "$BACKUP_DIR/files_$stamp.tar.gz" -C / "${files[@]}"

# A dump that ends early is not a backup: the last line of a complete mysqldump is "-- Dump completed"
gzip -dc "$BACKUP_DIR/db_$stamp.sql.gz" | tail -1 | grep -q 'Dump completed' || { echo "backup-mysql: dump incomplete" >&2; exit 1; }

find "$BACKUP_DIR" -name 'db_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'files_*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "backup-mysql: $BACKUP_DIR/db_$stamp.sql.gz ($(du -h "$BACKUP_DIR/db_$stamp.sql.gz" | cut -f1)), files_$stamp.tar.gz"
