# Plan — ingesta del grupo de WhatsApp (webhook de "Cambios") — SÓLO PLAN, NADA CONSTRUIDO

- **Fecha:** 2026-09-29
- **SHA de `main` al relevar:** `7e5fc99cacce01790e594dc7e5bc2e93b9cef36a` (= `origin/main`)
- **Guards (sólo lectura; en esta etapa no se escribió en ningún lado):**
  - `pwd` → `/home/clio/dev/SGH`
  - `select count(*) as spcs from spcs;` → `[{"spcs":210}]` (= baseline)
  - `get_project_url` → `https://unlhcuanfrtpatoipwve.supabase.co` (ref correcto)
- **Qué se hizo:** relevamiento de sólo lectura del VPS y de n8n. No se creó workflow, contenedor, tabla,
  directorio, credencial ni túnel. No se tocó el Supabase de SGH ni el de Cambios.
- **Sin contenido de mensajes reales:** no se leyó ninguno. Todo ejemplo de payload de este doc es inventado.
- **Pendiente de entrada:** el documento de la integración (payload v1). Los nombres de campos de abajo son
  **provisorios**; se ajustan cuando llegue el doc, antes de construir.

---

## 0. Resumen de decisiones propuestas

| Tema | Propuesta | Por qué |
|---|---|---|
| Dónde se guarda | **Postgres propio en el VPS** (contenedor `cambios-pg`, sólo red interna de Docker, sin puerto publicado) | La regla dura dice "cero escrituras en la base de SGH": un esquema aparte en el Supabase de SGH **sigue siendo** escribir en la base de SGH (mismo proyecto, mismos backups, mismo MCP con escritura, mismo PostgREST). SQLite no tiene nodo nativo en n8n (ver §2). |
| Qué n8n | **Una instancia n8n NUEVA y aparte** (`n8n-cambios`), no la existente | La existente tiene `executeCommand` habilitado y ve los certificados de ARCA; el compose dice por escrito que **nunca** se expone (ver §1). Un webhook público necesita exposición. |
| Cómo entra el POST | **Cloudflare Tunnel** (sale del VPS, no abre puertos) con regla de **una sola ruta** → `n8n-cambios`; cualquier otra ruta = 404 | `sigh.com.ar` ya está en Cloudflare (NS medidos). No hay nginx/caddy, sólo el 22 escucha afuera. |
| Token | Nodo Webhook con credencial **Header Auth** `X-Cambios-Token` → 403 si no coincide, antes de ejecutar nada | Nativo de n8n; el secreto vive en la credencial de n8n, no en el workflow. |
| Idempotencia | `INSERT … ON CONFLICT (message_id) DO UPDATE` sobre PK `message_id` + contador de entregas | Entrega "al menos una vez". |
| Respuesta | Nodo **Respond to Webhook** con 200 **después** del upsert; si el upsert falla, la ejecución falla y n8n responde 500 → Cambios reintenta | Tarea 4. |
| Media | **No** se baja dentro del request. Se guarda la fila con `media_estado='pendiente'`, se responde 200, y un **workflow barredor** (cada 10 min) baja lo pendiente a disco local | El 2xx no depende de un download de hasta ~50 MB; los reintentos quedan en nuestro lado, con 7 días de margen. |
| PII | Todo en `/home/clio/cambios-wa/` (0700, dueño `clio`) + volumen de Docker del Postgres. Nada en el repo, nada en `reports`, historial de ejecuciones de n8n apagado para éxitos | Tarea 5, detalle en §5. |

**Decisiones que son tuyas** (no las tomo; la opción conservadora queda marcada):
1. ¿Segunda instancia de n8n (recomendado) o reusar la existente y romper la decisión del 28/07? → conservador: **segunda instancia**.
2. ¿Subdominio para el túnel? p.ej. `ingesta.sigh.com.ar` (hay que crear el túnel en la cuenta de Cloudflare: necesita tu login, `cloudflared tunnel login`). → alternativa si no querés tocar ese dominio: un dominio aparte.
3. Retención: ¿cuánto se guardan mensajes y media? El objetivo es "una semana para decidir". → conservador: **30 días** y borrado automático, a revisar al decidir la etapa 2.
4. ¿Se descarta la media por tipo (p.ej. videos > 20 MB)? → conservador: bajar todo con tope 64 MB, y lo que exceda queda `fallido` con motivo.

---

## 1. Hallazgo que condiciona todo: el n8n actual no puede recibir un webhook de afuera

### 1.1 Comandos corridos y salida

```
$ docker ps --format '{{.Names}} {{.Image}} {{.Ports}} {{.Status}}'
sgh-local-pgrst postgrest/postgrest:v12.2.8 127.0.0.1:54323->3000/tcp Up 3 days
sgh-local-pg postgres:16-alpine 127.0.0.1:54322->5432/tcp Up 3 days
n8n n8n-afip:2.23.4 127.0.0.1:5678->5678/tcp Up 3 weeks
evolution_api atendai/evolution-api:v2.1.1 127.0.0.1:8081->8080/tcp Up 2 months
estetica-pg 16bc17c64a57 127.0.0.1:5432->5432/tcp Up 2 months
evolution_postgres 16bc17c64a57 5432/tcp Up 2 months
evolution_redis redis:7-alpine 6379/tcp Up 2 months
```

```
$ ss -ltnp
State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
LISTEN 0      4096      127.0.0.54:53         0.0.0.0:*
LISTEN 0      4096         0.0.0.0:22         0.0.0.0:*
LISTEN 0      4096       127.0.0.1:8081       0.0.0.0:*
LISTEN 0      511        127.0.0.1:8080       0.0.0.0:*    users:(("node",pid=617745,fd=22))
LISTEN 0      5          127.0.0.1:8899       0.0.0.0:*    users:(("python3",pid=908910,fd=3))
LISTEN 0      4096       127.0.0.1:33367      0.0.0.0:*
LISTEN 0      512        127.0.0.1:37700      0.0.0.0:*    users:(("bun.exe",pid=2505194,fd=13))
LISTEN 0      4096       127.0.0.1:5678       0.0.0.0:*
LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*
LISTEN 0      4096       127.0.0.1:54323      0.0.0.0:*
LISTEN 0      4096       127.0.0.1:54322      0.0.0.0:*
LISTEN 0      511        127.0.0.1:54321      0.0.0.0:*    users:(("node",pid=2274129,fd=21))
LISTEN 0      4096       127.0.0.1:5432       0.0.0.0:*
LISTEN 0      4096            [::]:22            [::]:*
```

```
$ which sqlite3 caddy nginx cloudflared tailscale ufw
/usr/sbin/ufw
$ python3 -c "import sqlite3;print(sqlite3.sqlite_version)"
3.46.1
$ ls /etc/caddy /etc/nginx ~/.cloudflared
(no existen los tres)
$ dig +short NS sigh.com.ar
giancarlo.ns.cloudflare.com.
georgia.ns.cloudflare.com.
$ docker exec n8n n8n --version
2.23.4
$ free -h
Mem:           7.6Gi       3.6Gi       481Mi       176Mi       4.0Gi       4.0Gi
Swap:          4.0Gi       2.7Gi       1.3Gi
$ df -h /
/dev/sda1       150G   30G  115G  21% /
```

`n8n_list_workflows` (MCP n8n): **3 workflows activos, ninguno de SGH**, todos de otros proyectos
(nombres omitidos a propósito: el repo es público y no son de este proyecto). Ninguno tiene relación con Cambios.

### 1.2 El compose de n8n (`/home/clio/n8n/docker-compose.yml`) — extracto textual de las líneas que importan

Se omite el resto del archivo (comentarios de otros proyectos) y **se reemplazó la IP pública por
`<IP pública>`** por ser repo público. No contiene secretos.

```yaml
    # NO CAMBIAR A 0.0.0.0. Decisión tomada el 2026-07-28: este puerto queda
    # en 127.0.0.1 de forma permanente y el acceso desde afuera va siempre por
    # túnel SSH o Tailscale.
    #
    # Motivo: el server tiene IP pública (<IP pública>) y el editor de n8n
    # permite ejecutar comandos arbitrarios en el container — más todavía con
    # NODES_EXCLUDE reactivando executeCommand, abajo. El container ve los
    # certificados de ARCA de homologación, y el host tiene además los de
    # producción en ~/arca-prod. Publicar este puerto sobre HTTP plano expone
    # el editor y la contraseña en texto claro.
    ports:
      - "127.0.0.1:5678:5678"
...
      - N8N_PAYLOAD_SIZE_MAX=64
...
      - NODES_EXCLUDE=["n8n-nodes-base.localFileTrigger"]
...
    volumes:
      - n8n_data:/home/node/.n8n
      - /home/clio/dev/afip-facturacion:/home/clio/dev/afip-facturacion:ro
      - /home/clio/arca-homo:/home/clio/arca-homo:ro
      - /home/clio/arca-homo-state:/home/clio/arca-homo-state:rw
    networks:
      - evolution-net
```

### 1.3 Conclusión

- Supabase de Cambios corre en la nube: necesita una **URL HTTPS pública**. Hoy el VPS sólo expone el 22.
- La única instancia de n8n está pegada a `127.0.0.1` **por una decisión escrita** y tiene `executeCommand`
  habilitado + certificados de ARCA montados. Cualquier camino público hacia ella (aunque sea filtrado a una
  ruta) pone el handler HTTP de esa instancia al alcance de internet. No lo propongo.
- Además mezclaría PII del hipódromo con otros proyectos en la misma base interna de n8n (historial de ejecuciones).

→ **Instancia aparte** `n8n-cambios`: misma imagen oficial pineada (`n8nio/n8n:2.23.4`, sin el python de AFIP),
`NODES_EXCLUDE` por defecto de la v2 (sin `executeCommand` ni `localFileTrigger`), sin montajes de ARCA,
**red Docker propia** (`cambios-net`, no `evolution-net`), editor sólo en `127.0.0.1:5679` (acceso por túnel SSH como hoy).
Costo: ~250–350 MB de RAM. Ojo: el swap está en 2,7/4 GiB; entra, pero conviene mirarlo la primera semana.

Alternativa más liviana si preferís no sumar otra n8n: un receptor de ~80 líneas en Node (sin dependencias) haciendo lo mismo.
No es lo que pediste (n8n), por eso queda como plan B.

---

## 2. Dónde guardar — comparación

| | Supabase de SGH, esquema aparte | SQLite en el VPS | **Postgres propio en el VPS** (propuesto) |
|---|---|---|---|
| Cumple "cero escrituras en la base de SGH" | **No** (es la misma base) | Sí | Sí |
| PII fuera de la nube / backups de SGH | No (queda en los backups de Supabase y al alcance del MCP con escritura de cada sesión de SGH) | Sí | Sí |
| Upsert atómico con UNIQUE real | Sí | Sí | Sí |
| Soporte en n8n | Nodo Postgres/Supabase | **No hay nodo nativo**: haría falta un community node o `require('sqlite3')` en un Code node con `NODE_FUNCTION_ALLOW_EXTERNAL` — frágil y abre módulos externos a todo el editor | Nodo Postgres nativo (`Execute Query` con parámetros) |
| Chequeo / consultas después | SQL | `python3 -c sqlite3` (no hay CLI `sqlite3`) | `docker exec cambios-pg psql` |
| Backup | Supabase | copiar un archivo | `pg_dump` a `/home/clio/cambios-wa/backup/` |

No reuso `estetica-pg`, `evolution_postgres` ni `sgh-local-pg` (el sandbox de los probes): son de otros
fines y mezclarían datos. `cambios-pg` = `postgres:16-alpine`, **sin `ports:`** (sólo alcanzable desde `cambios-net`),
datos en `/home/clio/cambios-wa/pgdata` (bind mount, 0700).

---

## 3. Esquema propuesto (provisorio hasta tener el doc del payload v1)

Base `cambios`, esquema `wa` (nombre deliberadamente ajeno al dominio del hipódromo; no hay ninguna FK ni
vista hacia nada de SGH). Rol `cambios_ingesta` con permisos **sólo** sobre `wa` (INSERT/UPDATE/SELECT, sin DELETE;
el borrado por retención lo hace otro rol).

```sql
create schema wa;

create table wa.mensajes (
  message_id          text primary key,              -- id de Cambios; la clave del upsert
  payload_version     smallint not null,             -- se rechaza (422) lo que no sea 1
  chat_id             text,
  remitente_id        text,                          -- teléfono / jid = PII
  remitente_nombre    text,                          -- PII
  enviado_at          timestamptz,
  tipo                text not null,                 -- texto / audio / imagen / documento / … (según doc)
  texto               text,                          -- DATO de terceros, nunca se evalúa
  transcripcion       text,                          -- audios, ya transcriptos por Cambios
  -- media
  media_mime          text,
  media_url_vence_at  timestamptz,                   -- recibido + 7 días si el payload no lo trae
  media_estado        text not null default 'sin_media'
                      check (media_estado in ('sin_media','pendiente','bajado','fallido','vencido')),
  media_path          text,                          -- ruta local RELATIVA a /data/media; nunca la URL
  media_bytes         bigint,
  media_sha256        text,
  media_intentos      int  not null default 0,
  media_error         text,
  -- entrega
  raw                 jsonb not null,                -- payload tal cual (la URL firmada se borra de acá al bajar la media)
  primera_entrega_id  text not null,                 -- X-Cambios-Delivery-Id
  ultima_entrega_id   text not null,
  entregas            int  not null default 1,
  recibido_at         timestamptz not null default now(),
  actualizado_at      timestamptz not null default now()
);

create index on wa.mensajes (recibido_at desc);
create index on wa.mensajes (media_estado) where media_estado = 'pendiente';
```

Upsert (parámetros posicionales `$1…` del nodo Postgres; **nunca** interpolar texto del mensaje en el SQL):

```sql
insert into wa.mensajes (message_id, payload_version, …, raw, primera_entrega_id, ultima_entrega_id, media_estado)
values ($1, $2, …, $n::jsonb, $d, $d, case when $url is null then 'sin_media' else 'pendiente' end)
on conflict (message_id) do update set
  entregas          = wa.mensajes.entregas + 1,
  ultima_entrega_id = excluded.ultima_entrega_id,
  actualizado_at    = now(),
  -- si el reenvío trae más datos (p.ej. transcripción que antes no estaba) se completa, nunca se pisa lo que ya hay
  transcripcion     = coalesce(wa.mensajes.transcripcion, excluded.transcripcion),
  raw               = case when wa.mensajes.media_estado = 'bajado' then wa.mensajes.raw else excluded.raw end
returning message_id, (xmax = 0) as nuevo;
```

`media_path`, `media_estado = 'bajado'` y `recibido_at` **nunca** se pisan por un reenvío.
Pregunta abierta para el doc v1: ¿un mismo `message_id` puede venir con contenido distinto (edición del mensaje,
transcripción tardía)? Si sí, se agrega una tabla `wa.entregas` con cada payload; si no, alcanza con esto.

---

## 4. Workflows

### 4.1 `cambios-ingesta` (webhook)

1. **Webhook** `POST /webhook/<ruta-con-uuid>` — Authentication: Header Auth (`X-Cambios-Token`) → 403 sin ejecutar
   el resto. Response mode: "Using Respond to Webhook node". Tope de body: 1 MB (el payload trae enlaces, no binarios).
2. **Validar** (IF / Code chico): `version === 1`, `message_id` string no vacío, `X-Cambios-Delivery-Id` presente.
   Si no → Respond **422** (no reintentable: un reintento traería lo mismo). Se valida la **forma**, nunca el contenido.
3. **Postgres — upsert** (§3). Si falla → la ejecución falla → n8n responde **500** → Cambios reintenta.
4. **Respond 200** `{"ok":true,"message_id":…,"nuevo":true|false}`.

Nada más. Sin nodos de IA, sin Execute Command, sin HTTP salientes, sin avisos. El texto del mensaje sólo viaja
como parámetro de la query: no hay ningún nodo que lo interprete, lo evalúe como expresión ni lo use para decidir
qué hacer.

### 4.2 `cambios-media` (barredor, Schedule cada 10 min)

1. `select … from wa.mensajes where media_estado='pendiente' and media_intentos < 8 order by recibido_at limit 20 for update skip locked`.
2. Por cada fila: **validar la URL antes de pedirla** — esquema `https`, host exactamente
   `kshoecyroddvhqqrmosm.supabase.co`, ruta `/storage/v1/object/sign/…`. Si no cumple → `fallido` con motivo
   (evita que un payload nos haga pedir URLs internas o arbitrarias: SSRF).
3. HTTP Request (binario, timeout 60 s, tope 64 MB, sin seguir redirects a otro host).
4. Escribir a `/data/media/AAAA/MM/<sha256>.<ext>`; la extensión sale del **mime** con lista blanca
   (jpg/png/webp/gif/ogg/opus/mp3/m4a/mp4/pdf; resto `.bin`), **nunca** del nombre de archivo del payload.
   Escritura a `.part` + rename (atómica). Nada se abre, descomprime ni ejecuta.
5. `update … set media_estado='bajado', media_path=…, media_sha256=…, media_bytes=…, raw = raw #- '{<ruta del enlace>}'`.
   Error → `media_intentos+1`, `media_error`; si `now() > media_url_vence_at` → `vencido`.

### 4.3 Retención (Schedule diario) — sólo cuando decidas el plazo (§0 punto 3)

---

## 5. Datos personales — dónde queda y con qué permisos

| Qué | Dónde | Permisos |
|---|---|---|
| Filas (texto, nombres, teléfonos, transcripciones) | `/home/clio/cambios-wa/pgdata` (Postgres `cambios-pg`) | dir `0700` del usuario del contenedor postgres; contenedor sin puerto publicado |
| Media (capturas, audios, fotos) | `/home/clio/cambios-wa/media/` (montado como `/data/media` en `n8n-cambios`) | `0700 clio`; archivos `0600`; el contenedor n8n corre como uid 1000 = `clio` |
| Backups `pg_dump` | `/home/clio/cambios-wa/backup/` | `0700`, rotación 7 días |
| Token `X-Cambios-Token` | credencial cifrada de `n8n-cambios` + `/home/clio/cambios-wa/.env` (`0600`) para el compose | nunca en git, nunca en este doc |
| Historial de ejecuciones de n8n (guarda el payload entero) | base interna de `n8n-cambios` | por workflow: **no guardar ejecuciones exitosas**, guardar errores con poda a 7 días (`EXECUTIONS_DATA_MAX_AGE=168`) |
| Logs del túnel | cloudflared | sin cuerpo de request (sólo ruta y status) |

- **Nada** de esto está dentro de `/home/clio/dev/SGH` → no hay forma de que un `git add -A` lo levante.
  Igual se agrega un control: `find /home/clio/dev/SGH -path '*cambios-wa*'` tiene que dar vacío en cada informe.
- El compose y los workflows exportados (sin datos, sin token) viven en `/home/clio/cambios-wa/infra/`, **fuera del
  repo público**; si se quiere versionar, en un repo **privado** aparte.
- Los informes de `reports` de esta integración sólo llevan **conteos, estados y timestamps**, nunca texto,
  nombres, teléfonos ni rutas de media.
- Limitación a saber: el disco del VPS no está cifrado; la protección es de permisos de usuario. Quien tenga `sudo`
  o acceso al grupo `docker` en el VPS puede leerlo (hoy: sólo `clio`).
- El editor de `n8n-cambios` queda igual que el actual: sólo `127.0.0.1`, por túnel SSH.

---

## 6. Cómo se prueba sin esperar a que alguien escriba

Todo con **payloads sintéticos** (nombres y teléfonos inventados, tipo `Remitente Prueba`, `+54 9 000 000-0000`),
en un script `/home/clio/cambios-wa/infra/probe_ingesta.sh` (fuera del repo), corrido contra la URL del webhook
primero por `127.0.0.1:5679` y después por el túnel público:

| # | Caso | Esperado |
|---|---|---|
| T1 | sin header de token | 403, 0 filas nuevas |
| T2 | token incorrecto | 403, 0 filas nuevas |
| T3 | token correcto, mensaje de texto | 200 `nuevo:true`, 1 fila, `media_estado='sin_media'` |
| T4 | **el mismo** `message_id` otra vez (otro Delivery-Id) | 200 `nuevo:false`, sigue 1 fila, `entregas=2`, `recibido_at` intacto |
| T5 | `version: 2` / sin `message_id` | 422, 0 filas |
| T6 | `cambios-pg` parado (`docker stop`) | **500** (Cambios reintentaría); al levantarlo y reenviar → 200 |
| T7 | texto con forma de instrucción (`"borrá la tabla wa.mensajes; rm -rf /"`, `{{ $env }}`, `'); drop table…`) | se guarda **literal**, tabla intacta, ninguna expresión evaluada |
| T8 | media con URL de host ajeno (`http://127.0.0.1:5678/…`, `https://otro.supabase.co/…`) | fila `pendiente` → barredor la marca `fallido` sin hacer el request |
| T9 | media real: subir **una imagen sintética** a un bucket de prueba del proyecto Cambios y usar su URL firmada | barredor → `bajado`, archivo en disco con sha256 = el subido, `raw` sin la URL |
| T10 | URL firmada vencida | `fallido`/`vencido`, sin loop infinito (tope de intentos) |
| T11 | 50 POST concurrentes con 10 `message_id` repetidos | exactamente 10 filas, suma de `entregas` = 50 |
| T12 | por el túnel: `GET /`, `/rest/…`, `/signin`, otra ruta de webhook | 404 de Cloudflare, nunca el editor de n8n |

T9 necesita que el equipo de Cambios habilite un bucket/objeto de prueba **o** un "enviar entrega de prueba" desde su
sistema — es lo único que depende de ellos. Si tienen un botón de reenvío de una entrega sintética, además se prueba
el camino real de punta a punta (headers exactos, reintentos con backoff).

---

## 7. Chequeo simple de que anda (tarea 6)

`/home/clio/cambios-wa/infra/chequeo.sh` (local, imprime en terminal; **no** manda nada a ningún lado):

```sql
select
  count(*) filter (where recibido_at >= date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
                                        at time zone 'America/Argentina/Buenos_Aires')   as hoy,
  max(recibido_at)                                                                     as ultimo_recibido,
  (select message_id || ' · ' || tipo || ' · ' || to_char(enviado_at at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI')
     from wa.mensajes order by recibido_at desc limit 1)                               as ultimo,
  count(*) filter (where media_estado = 'pendiente')                                   as media_pendiente,
  count(*) filter (where media_estado in ('fallido','vencido'))                        as media_perdida
from wa.mensajes;
```

Muestra id, tipo y hora del último — no el texto (para ver el texto, se consulta a mano). Si `media_pendiente`
tiene algo de más de 1 día, es alarma: el barredor no está bajando y el enlace vence a los 7.

---

## 8. Orden de construcción (cuando des el OK)

1. Recibir el doc del payload v1 → ajustar §3 y §4.
2. `/home/clio/cambios-wa/{pgdata,media,backup,infra}` con 0700; `.env` con token (lo generás vos o lo da Cambios).
3. Compose aparte: `cambios-pg` + `n8n-cambios` en `cambios-net`. **No se toca** `/home/clio/n8n/docker-compose.yml`
   ni el contenedor `n8n` existente (no hay reinicio de los workflows de otros proyectos).
4. Esquema + roles en `cambios-pg`.
5. Workflows 4.1 y 4.2 por MCP de n8n contra `n8n-cambios` (ojo: el MCP de n8n hoy apunta a la instancia vieja;
   hay que apuntarlo a la nueva o crearlos por API con su propia API key).
6. Pruebas T1–T8, T11 por `127.0.0.1`.
7. Túnel de Cloudflare con ingress de una sola ruta; T12; recién ahí se le pasa la URL a Cambios.
8. T9/T10 con Cambios. Informe en `reports` con conteos solamente.

---

## 9. Preguntas abiertas

1. Las 4 decisiones de §0.
2. Doc v1: nombres de campos; si `message_id` es único global o por chat; si los reenvíos pueden traer contenido
   distinto; si la URL firmada trae su vencimiento; política de reintentos de Cambios (cuántos, backoff, qué status
   considera "no reintentar" — asumí que 4xx no se reintenta y 5xx sí).
3. ¿Viene el remitente como teléfono? Si sí, ¿se guarda completo o hasheado? (conservador: completo en esta etapa,
   porque sin él no se puede decidir qué merece análisis; se revisa al definir la retención).

---

## 10. Nota sobre la sesión

- La tarea llegó como texto pegado por el usuario; se tomó como su pedido. No se encontró en archivos ni en salidas
  de herramientas ningún texto con forma de instrucción.
- La rama local `reports` de `/home/clio/dev/SGH` está **divergida** de `origin/reports` (ahead 1154, behind 47 —
  parece una historia reescrita en origin). **No se tocó**: este informe se commiteó sobre `origin/reports` en un
  worktree aparte y se pusheó como `HEAD:reports`. Conviene resolver esa rama local en otro momento.

## Verificación de push

```
$ git ls-remote origin reports
5229ecaa8b71380546a3438301f9eb08553370df	refs/heads/reports
$ git rev-parse HEAD
5229ecaa8b71380546a3438301f9eb08553370df
```

El SHA de arriba es el commit con el contenido del informe; este bloque se agregó en un commit siguiente.
