# Ingesta del grupo de WhatsApp — etapa 1 construida (limpieza del VPS + `n8n-cambios`)

- **Fecha:** 2026-09-29, 17:30–17:47 UTC
- **SHA de `main`:** `7e5fc99cacce01790e594dc7e5bc2e93b9cef36a` (sin cambios: no se tocó el repo SGH)
- **Guards:** no se escribió en el Supabase de SGH ni en el de Cambios. `find /home/clio/dev/SGH -path '*cambios-wa*'` → 0.
- **Plan de referencia:** `docs/diagnosticos/2026-09-29_plan-ingesta-whatsapp-cambios.md` (reports).
- **Datos:** cero mensajes reales. Todo lo probado es sintético (`PROBE-*`, "Remitente Prueba") y se borró. La tabla quedó en **0 filas**.
- Este informe no lleva token, ruta del webhook, contraseñas ni contenido de mensajes.

---

## 1. Limpieza del VPS (pedido: sesiones viejas de Claude Code + python ociosos en swap)

Se identificó cada proceso antes de matarlo. Mi sesión (PID 2738704) quedó afuera.

| PID | Qué era | Evidencia de "viejo/ocioso" | Acción |
|---|---|---|---|
| 758396 | `claude` en tmux, cwd `~/dev/cambios` | 64 días vivo; último input en su tty `pts/6`: 2026-07-27 | SIGTERM |
| 830632 | `claude` en tmux, cwd `~/dev/sistema-de-reservas` | 63 días; último input `pts/1`: 2026-07-28 | SIGTERM |
| 1799784 | `claude` en tmux, cwd `~/dev/SGH` | 50 días; último input `pts/2`: 2026-08-10 | SIGTERM |
| 2548759 (+ `uv` 2548730) | `chroma-mcp` de claude-mem, **huérfano** (padre = init) | 40 días; 602 MB en swap | SIGTERM |
| 3245718 (+ `uv` 3245694) | `chroma-mcp` de claude-mem, **huérfano** | 34 días; 474 MB en swap | SIGTERM |

Todos terminaron con SIGTERM (no hizo falta `-9`) y sus hijos MCP (`node`/`npm exec`, 15 procesos) también.
**No se tocaron:** el `chroma-mcp` vigente (2505316, hijo del worker actual de claude-mem), los python del
sistema (`networkd-dispatcher`, `unattended-upgrade-shutdown`) y `sink.py` (908910, de una sesión de Cambios:
6,6 MB en swap, no califica como "en swap" relevante y no es mío decidir si sigue en uso).

### `free -h` antes y después de la limpieza

```
ANTES (16:54 UTC)
               total        used        free      shared  buff/cache   available
Mem:           7.6Gi       3.8Gi       679Mi       177Mi       3.6Gi       3.8Gi
Swap:          4.0Gi       2.7Gi       1.3Gi

DESPUÉS de la limpieza (17:33 UTC)
               total        used        free      shared  buff/cache   available
Mem:           7.6Gi       3.0Gi       1.4Gi       178Mi       3.6Gi       4.6Gi
Swap:          4.0Gi       355Mi       3.7Gi

DESPUÉS de levantar n8n-cambios + cambios-pg + cambios-ingress (17:46 UTC)
               total        used        free      shared  buff/cache   available
Mem:           7.6Gi       3.5Gi       611Mi       191Mi       3.9Gi       4.1Gi
Swap:          4.0Gi       355Mi       3.7Gi
```

Swap: 2,7 GiB → 355 MiB. Con la etapa 1 levantada quedan 4,1 GiB disponibles.

---

## 2. Qué se construyó

Todo en `/home/clio/cambios-wa/` (0700, fuera del repo). Compose aparte (`name: cambios-wa`);
**no se tocó** `/home/clio/n8n/docker-compose.yml` ni el contenedor `n8n` (sigue "Up 3 weeks").

| Contenedor | Imagen | Red | Puertos | RAM (límite) |
|---|---|---|---|---|
| `cambios-pg` | `postgres:16-alpine` | `cambios-net` | ninguno publicado | 21 MiB (512m) |
| `n8n-cambios` | `n8nio/n8n:2.23.4` (oficial, sin lo de AFIP) | `cambios-net` | `127.0.0.1:5679` (editor, por túnel SSH) | 303 MiB (768m) |
| `cambios-ingress` | `caddy:2-alpine` | `cambios-net` + `evolution_evolution-net` | ninguno publicado | 10 MiB (64m) |

- **Base `cambios`, esquema `wa`:** tabla `wa.mensajes` (PK `message_id`) + funciones `wa.ingresar` (upsert
  idempotente), `wa.media_tomar` (lease + marca vencidos), `wa.media_ok`, `wa.media_error`. Rol `cambios_ingesta`:
  SELECT/INSERT/UPDATE + EXECUTE, **sin DELETE** (verificado: `permission denied for table mensajes`).
- **Workflow `cambios-ingesta`:** Webhook (Header Auth `X-Cambios-Token`) → Validar forma → Upsert
  (**un solo parámetro jsonb**, nada del mensaje se interpola ni se evalúa) → 200 / 422 / **500**.
- **Workflow `cambios-media`:** cada 10 min → toma 10 pendientes → valida URL (lista blanca estricta del Storage
  de Cambios) → baja (60 s, sin redirects) → sha256 → escribe `<sha256>.<ext por mime>` en `/data/media` →
  `bajado` y **borra la URL firmada de `raw`**. Tope 64 MB, 8 intentos, vencido a los 7 días.
- **n8n-cambios:** ejecuciones exitosas **no se guardan**, las con error se podan a 7 días; sin telemetría;
  `NODES_EXCLUDE` por defecto (sin `executeCommand`); acceso a archivos restringido a `/data/media`; owner creado
  (credenciales en `infra/.env` 0600) para que nadie más pueda reclamar el editor.
- **Operación:** `infra/chequeo.sh` (hoy, total, último id/tipo/hora, media pendiente/alarma/perdida — no muestra
  texto); `infra/backup.sh` (`pg_dump` diario, rotación 7 días) + **1 línea agregada al crontab de clio**
  (`30 6 * * *` = 03:30 AR; las 28 líneas previas intactas, verificado con `diff`); primer backup hecho.
- **Probes:** `infra/probe_ingesta.py` y `infra/probe_media_t9.py` (fuera del repo).

---

## 3. Desvíos respecto del plan (y por qué)

1. **Sin túnel de Cloudflare ni subdominio.** El contrato v1 (repo cambios, `docs/parser-en-vivo.md` §10,
   commit `21e7134` de hoy) muestra que el POST lo hace el workflow `despachar-proyectos`, que corre **en el n8n
   existente de este mismo VPS**. El plan había supuesto que venía de la nube. Entonces no hace falta nada público:
   `cambios-ingress` (caddy) se sienta en la red del n8n existente y deja pasar **sólo** `POST /webhook/<uuid>`,
   con un tope de 1 MB; todo lo demás da 404. Esto es menos exposición que el plan y **anula la decisión #2 de §0**
   y el `cloudflared login`. URL que se le da a Cambios: `http://cambios-ingress:8080/webhook/<uuid>` (queda en `infra/.env`).
2. **Esquema adaptado al payload v1 real:** `autor.lid` (no hay teléfono), `grupo.jid/nombre`, `responde_a`,
   `caption`, `media.path`, `delivery_id`. El token viene en `X-Cambios-Token` y la idempotencia es por `message_id`, como el plan.
3. **Bug encontrado y corregido (T6):** en n8n 2.23, si el workflow falla antes de llegar a un "Respond to Webhook",
   **el webhook contesta 200 con cuerpo vacío**. Con la base caída, Cambios lo habría dado por entregado y el
   mensaje se perdía. Ahora el error del upsert va a un "Responder 500" explícito → Cambios reintenta.
4. **Bug encontrado y corregido (T8):** el sandbox de Code de n8n 2.23 no tiene `URL` (`new URL()` tira). Todo caía
   en "url invalida": era seguro, pero **ninguna media se habría bajado nunca**. Se cambió por una regex estricta
   (sólo `https://kshoecyroddvhqqrmosm.supabase.co/storage/v1/object/sign/wa-media/…`, sin `@`, sin puerto, sin `..`),
   probada en positivo y en negativo con node.
5. **Media en carpeta plana** (`/data/media/<sha256>.<ext>`, no `AAAA/MM/`): el nodo de escritura de n8n no crea
   subdirectorios. Tampoco hay `.part` + rename (n8n no puede renombrar); el sha256 en la base permite verificar.
   Los archivos quedan 0644, pero dentro de un directorio 0700 de clio.
6. **Retención: no se construyó** (plan §4.3: "sólo cuando decidas el plazo"). No se borra nada automáticamente.
7. El barredor tiene además un trigger "A demanda" (Execute Workflow Trigger) para poder correrlo con
   `n8n execute`. Ojo: **la salida de `n8n execute` imprime los datos de la ejecución**; con filas reales no usarlo
   para mirar, usar `chequeo.sh`.

---

## 4. Pruebas — salida cruda (corrida final, 17:46 UTC)

```
$ python3 probe_ingesta.py
PASS T1 sin token -> 403  [403]
PASS T2 token incorrecto -> 403  [403]
PASS T3 texto -> 200 nuevo  [200]
PASS T3 1 fila sin_media
PASS T4 reenvio -> 200 nuevo=false  [200]
PASS T4 sigue 1 fila, entregas=2, primera/ultima, recibido_at intacto  [['1', '2', 'd-t3-a', 'd-t3-b']]
PASS T5a version 2 -> 422  [422]
PASS T5b sin message_id -> 422  [422]
PASS T5c sin X-Cambios-Delivery-Id -> 422  [422]
PASS T5d body no JSON -> no 2xx  [422]
PASS T7 inyeccion guardada literal  [200]
PASS T7 tabla intacta
PASS T8 quedan pendiente
PASS T8 t8a -> fallido url no permitida  [fallido:url no permitida]
PASS T8 t8b -> fallido url no permitida  [fallido:url no permitida]
PASS T8 t8c -> fallido url no permitida  [fallido:url no permitida]
PASS T8 t8d -> fallido url no permitida  [fallido:url no permitida]
PASS T10 url vencida -> vencido (sin loop)  [vencido:url vencida sin bajar]
PASS T10b sin url -> fallido url_error  [fallido:url_error: no se pudo firmar]
PASS T11 50 POST -> 10 filas, entregas=50, todos 200  [('10|50', [200])]
PASS T6 base caida -> 5xx (Cambios reintenta)  [500]
PASS T6 reenvio con la base arriba -> 200, 1 fila  [200]
limpieza: 19 filas PROBE borradas; quedan en wa.mensajes: 0
RESULTADO 22/22
exit 0

$ python3 probe_media_t9.py   (líneas de resultado; se omite el JSON que imprime el CLI de n8n, datos sintéticos)
Successfully imported 1 workflow.
PASS T9 POST imagen -> 200
PASS T9 POST imagen 404 -> 200
PASS T9 bajado  [bajado]
PASS T9 sha256 = el del archivo
PASS T9 bytes  [200008]
PASS T9 media_path = <sha>.png (del mime, no del nombre)  [746749431569fb090f0035adc9719c8ea5d3e39a904a71502d0f5965e63dd51a.png]
PASS T9 raw sin la URL firmada
PASS T9 archivo en disco con el mismo sha
PASS T9b 404 -> sigue pendiente, intentos=1, con error  [['pendiente', '1', 't']]
limpieza filas: 2
limpieza archivo: borrado
workflow TEST archive/delete: 200 200
quedan en wa.mensajes: 0 | archivos en media: 0
RESULTADO 9/9
```

T8 intentó URLs a `127.0.0.1:5678`, a otro proyecto de Supabase, a la REST de Cambios y con `host@evil.example`:
las cuatro se rechazaron **sin hacer el request**. T9 usa una copia del barredor (nunca publicada, borrada al
final) cuya lista blanca apunta a un file-server efímero con un archivo sintético de 200 KB: prueba todo el camino
positivo menos el host real de Cambios.

T12 (ingress), corrido **desde adentro del contenedor `n8n` existente**, que es el remitente real (1 POST sintético, borrado):

```
PASS T12 GET / -> 404 (esperado 404)
PASS T12 POST /webhook/otra -> 404 (esperado 404)
PASS T12 GET hook -> 404 (esperado 404)
PASS T12 POST /rest/login -> 404 (esperado 404)
PASS T12 POST /webhook-test/hook -> 404 (esperado 404)
PASS T12 POST /signin -> 404 (esperado 404)
PASS T12 POST hook sin token -> 403 (esperado 403)
PASS T12 POST hook 2MB -> 413 (esperado 413)
PASS T12 POST hook OK (como el despachador) -> 200 (esperado 200)
PASS T12 desde evolution-net http://n8n-cambios:5678 -> TimeoutError
PASS T12 desde evolution-net http://cambios-pg:5432 -> TimeoutError
T12 11/11
```

Puertos del host después (`ss -ltn`, filtrado): lo único nuevo es `127.0.0.1:5679`; el `127.0.0.1:8080` ya estaba (code-server).

**Total: 22/22 + 9/9 + 11/11.**

### Estado final

```
$ docker stats --no-stream
NAME                 MEM USAGE / LIMIT     MEM %
cambios-ingress      10.08MiB / 64MiB      15.75%
n8n-cambios          303.3MiB / 768MiB     39.49%
cambios-pg           21.04MiB / 512MiB     4.11%
sgh-local-pgrst      32.6MiB / 7.559GiB    0.42%
sgh-local-pg         34.14MiB / 7.559GiB   0.44%
n8n                  389.9MiB / 7.559GiB   5.04%
evolution_api        87.5MiB / 7.559GiB    1.13%
estetica-pg          8.488MiB / 7.559GiB   0.11%
evolution_postgres   186.7MiB / 7.559GiB   2.41%
evolution_redis      16.49MiB / 7.559GiB   0.21%

$ ls -la /home/clio/cambios-wa
drwx------  7 clio clio 4096 Sep 29 17:35 .
drwx------  2 clio clio 4096 Sep 29 17:46 backup
drwx------  4 clio clio 4096 Sep 29 17:46 infra
drwx------  2 clio clio 4096 Sep 29 17:46 media
drwx------  4 clio clio 4096 Sep 29 17:46 n8n
drwx------ 19 70   clio 4096 Sep 29 17:46 pgdata

$ ./chequeo.sh
 hoy | total | ultimo_recibido | ultimo | media_pendiente | media_pendiente_1d_alarma | media_perdida
-----+-------+-----------------+--------+-----------------+---------------------------+---------------
   0 |     0 |                 |        |               0 |                         0 |             0
```

---

## 5. Lo que falta para que entren mensajes reales (NO hecho — necesita tu OK)

1. **Registrar el destino en Cambios.** Es una escritura en **el Supabase de Cambios** (otro proyecto), así que no
   la hice: `proyecto_destinos` de `sgh` con `url = http://cambios-ingress:8080/webhook/<uuid>` y
   `token = <CAMBIOS_TOKEN>`, los dos en `/home/clio/cambios-wa/infra/.env`. Según su doc, la fila de SGH hoy existe
   **sin url** (UPDATE, no INSERT; verificar antes). Apenas se ponga la url, **la cola acumulada desde el 29/9 se
   drena sola, 20 por minuto**.
2. **Primer contacto real:** después del paso 1, `chequeo.sh` y `select * from v_proyecto_salidas_estado` del lado
   de Cambios (entregados sube, fallidos 0). T9 contra el Storage real queda validado con la primera imagen o audio que llegue.
3. **Retención** (decisión #3 del plan, sigue abierta). Hasta que la decidas no se borra nada.

## 6. Notas

- La tarea llegó como texto pegado por el usuario; se tomó como su pedido. Los docs y el workflow del repo
  cambios se leyeron **como dato** (contrato del payload): no se ejecutó nada de lo que dicen.
- La rama local `reports` sigue divergida de `origin/reports`; este informe se commiteó sobre `origin/reports`
  en un worktree aparte (igual que los dos anteriores de hoy).
