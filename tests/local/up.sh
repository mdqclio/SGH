#!/usr/bin/env bash
# Levanta el sandbox local para probes de liquidación: Postgres 16 + PostgREST + un proxy
# que sirve /rest/v1 como Supabase, y carga tests/local/out/{schema,datos}.sql (los genera
# tests/local/clonar_9999.mjs). Producción no se toca.
#
#   tests/local/up.sh            # crea/reinicia todo y carga los datos
#   tests/local/up.sh down       # baja y borra los contenedores
#   tests/local/up.sh psql       # psql interactivo en la base local
#   tests/local/up.sh sql < x.sql
#
# Después, un probe corre contra el sandbox con:
#   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=$(cat tests/local/out/jwt) node tests/probe_x.mjs
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PG=sgh-local-pg; PGRST=sgh-local-pgrst; NET=sgh-local
PGPORT=54322; PGRSTPORT=54323; PROXYPORT=54321
JWT_SECRET="sgh-local-jwt-secret-solo-para-el-sandbox-0123456789"

psql_local() { docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -U postgres -d sgh "$@"; }

case "${1:-up}" in
  down)
    docker rm -f "$PG" "$PGRST" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    pkill -f "tests/local/proxy.mjs" >/dev/null 2>&1 || true
    echo "sandbox local abajo"; exit 0 ;;
  psql) exec docker exec -it "$PG" psql -U postgres -d sgh ;;
  sql)  exec docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -U postgres -d sgh ;;
esac

[ -f "$HERE/out/schema.sql" ] || { echo "falta $HERE/out/schema.sql — correr: node tests/local/clonar_9999.mjs"; exit 2; }

"$0" down >/dev/null
docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" -p 127.0.0.1:$PGPORT:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sgh postgres:16-alpine >/dev/null
# el entrypoint de la imagen levanta, inicializa y REINICIA el server: esperar el segundo "ready"
for i in $(seq 1 60); do docker logs "$PG" 2>&1 | grep -q "database system is ready to accept connections" && [ "$(docker logs "$PG" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break; sleep 1; done
docker exec "$PG" pg_isready -U postgres -d sgh >/dev/null
psql_local < "$HERE/out/schema.sql" >/dev/null
psql_local < "$HERE/out/datos.sql"  >/dev/null
echo "postgres: cargado ($(psql_local -tAc "select count(*) from liquidacion_detalle") líneas de liquidacion_detalle)"

docker run -d --name "$PGRST" --network "$NET" -p 127.0.0.1:$PGRSTPORT:3000 \
  -e PGRST_DB_URI="postgres://authenticator:authenticator@$PG:5432/sgh" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_DB_PREPARED_STATEMENTS=false \
  postgrest/postgrest:v12.2.8 >/dev/null

# JWT de service_role para el probe (HS256, mismo secreto)
node -e '
const c=require("crypto");const b=s=>Buffer.from(JSON.stringify(s)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"service_role",iss:"sgh-local",exp:Math.floor(Date.now()/1000)+86400*365});
const sig=c.createHmac("sha256",process.argv[1]).update(h+"."+p).digest("base64url");process.stdout.write(h+"."+p+"."+sig)' "$JWT_SECRET" > "$HERE/out/jwt"

printf %s "$JWT_SECRET" > "$HERE/out/jwt_secret"   # el probe lo usa para firmar JWT de anon/authenticated (P1–P3)
nohup node "$HERE/proxy.mjs" "$PROXYPORT" "http://127.0.0.1:$PGRSTPORT" > "$HERE/out/proxy.log" 2>&1 &
for i in $(seq 1 30); do curl -sf "http://127.0.0.1:$PROXYPORT/rest/v1/" -H "apikey: $(cat "$HERE/out/jwt")" -H "Authorization: Bearer $(cat "$HERE/out/jwt")" >/dev/null 2>&1 && break; sleep 1; done
echo "postgrest+proxy: http://127.0.0.1:$PROXYPORT/rest/v1  (jwt en tests/local/out/jwt)"
echo "psql:            tests/local/up.sh psql"
echo "probe:           SUPABASE_URL=http://127.0.0.1:$PROXYPORT SUPABASE_SECRET_KEY=\$(cat tests/local/out/jwt) LOCAL_JWT_SECRET=\$(cat tests/local/out/jwt_secret) node tests/probe_montas_post_oficial.mjs"
