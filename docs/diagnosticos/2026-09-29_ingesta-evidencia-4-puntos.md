# Ingesta WhatsApp — evidencia de los 4 puntos (token, idempotencia, error al guardar, historial de n8n)

- **Fecha:** 2026-09-29, 17:53–17:58 UTC
- **SHA de `main`:** `7e5fc99cacce01790e594dc7e5bc2e93b9cef36a` (sin cambios)
- **Contexto:** `docs/diagnosticos/2026-09-29_ingesta-whatsapp-etapa1.md`
- Datos **sintéticos** (`PROBE-EVID-*`), borrados al final (tabla en 0). Sin token, sin ruta del webhook (`<webhook>`).
- **No se cambió nada** de la configuración en este paso: sólo mediciones.

## Resumen

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Sin token / token mal → 403 y no escribe | **Sí.** 3 variantes → `HTTP 403`, `count(*)` 0 antes y 0 después |
| 2 | Mismo `message_id` dos veces → 1 fila, `entregas=2` | **Sí.** 1 fila, `entregas` 1→2, `recibido_at` intacto, `nuevo:false` en el 2º |
| 3 | Si el guardado falla → error, no 200 | **Sí para el caso que importa** (base caída → `HTTP 500`, Cambios reintenta y entra). Con una salvedad, abajo |
| 4 | El historial de ejecuciones de n8n no guarda el contenido | **NO, no se puede confirmar tal como está.** Ver §4 |

## 1–3. Salida cruda (corrida única, tal cual)

```
2026-09-29 17:53:54 UTC

### 1. Sin token / token incorrecto -> 403 y no escribe
$ select count(*) from wa.mensajes  (antes)
 count 
-------
     0
(1 row)
$ POST <webhook>  [sin header X-Cambios-Token]
  -> HTTP 403  body='Authorization data is wrong!'
$ POST <webhook>  [token incorrecto (64 x 'x')]
  -> HTTP 403  body='Authorization data is wrong!'
$ POST <webhook>  [token correcto con 1 caracter cambiado]
  -> HTTP 403  body='Authorization data is wrong!'
$ select count(*) from wa.mensajes  (despues)
 count 
-------
     0
(1 row)

### 2. Idempotencia: mismo message_id dos veces, distinto Delivery-Id
$ POST <webhook>  [1er envio, Delivery-Id ev-1]
  -> HTTP 200  body='{"ok":true,"message_id":"PROBE-EVID-1","nuevo":true}'
  message_id  | entregas | primera_entrega_id | ultima_entrega_id |   recibido   | actualizado  
--------------+----------+--------------------+-------------------+--------------+--------------
 PROBE-EVID-1 |        1 | ev-1               | ev-1              | 17:53:54.268 | 17:53:54.268
(1 row)
$ POST <webhook>  [2do envio, MISMO message_id, Delivery-Id ev-2]
  -> HTTP 200  body='{"ok":true,"message_id":"PROBE-EVID-1","nuevo":false}'
  message_id  | entregas | primera_entrega_id | ultima_entrega_id |   recibido   | actualizado  
--------------+----------+--------------------+-------------------+--------------+--------------
 PROBE-EVID-1 |        2 | ev-1               | ev-2              | 17:53:54.268 | 17:53:55.874
(1 row)

### 3. Si el guardado falla: base parada
$ docker stop cambios-pg
cambios-pg
$ POST <webhook>  [base caida, message_id PROBE-EVID-2]
  -> HTTP 500  body='{"ok":false,"error":"no se pudo guardar"}'
$ docker start cambios-pg
cambios-pg
$ (base arriba) ¿quedó algo de PROBE-EVID-2?
 count 
-------
     0
(1 row)
$ POST <webhook>  [reintento de Cambios, mismo PROBE-EVID-2]
  -> HTTP 200  body='{"ok":true,"message_id":"PROBE-EVID-2","nuevo":true}'
  message_id  | entregas | primera_entrega_id | ultima_entrega_id |   recibido   | actualizado  
--------------+----------+--------------------+-------------------+--------------+--------------
 PROBE-EVID-1 |        2 | ev-1               | ev-2              | 17:53:54.268 | 17:53:55.874
 PROBE-EVID-2 |        1 | ev-4               | ev-4              | 17:54:04.658 | 17:54:04.658
(2 rows)

### limpieza
DELETE 2
 count 
-------
     0
(1 row)
```

**Salvedad del punto 3.** El 500 está cableado para la falla del **upsert** (salida de error del nodo → "Responder 500").
En n8n 2.23, si falla **cualquier otro** nodo antes de un Respond, el webhook contesta **200 vacío** (medido antes del fix,
con la base caída: `200 b''`). Los otros nodos del camino son un Code de validación defensivo y el IF; no encontré
cómo hacerlos fallar, pero la garantía formal hoy cubre el guardado, no "cualquier error".

## 4. Historial de ejecuciones de n8n — lo que hay en disco

Medido sobre una **copia consistente** de `/home/clio/cambios-wa/n8n/database.sqlite` (+ `-wal`, `-shm`),
borrada después, y contra la API del propio n8n:

```
execution_entity total: 267
(status, mode, cantidad, min id, max id, con deletedAt)
('error',   'webhook',   2,  64,  66,   0)
('running', 'cli',       3,  79, 213,   3)
('running', 'trigger',   2,   1, 269,   2)
('running', 'webhook', 260,   2, 267, 260)
execution_data filas: 267

API /rest/executions → count 2 (sólo 64 y 66, status error)
```

Búsqueda de texto de los payloads sintéticos dentro de `execution_data.data` (cantidad de ejecuciones que lo contienen):

```
'PROBE-' 258 · 'Remitente Prueba' 260 · 'sintetico' 253 · 'borrá la tabla' 4 · '000000000@lid' 256
```

Logs (cantidad de líneas con el contenido):

```
n8nEventLog*.log (4 archivos)       PROBE=0 Remitente=0 borrá=0
docker logs n8n-cambios             PROBE=0 Remitente=0 x-cambios-token=0
docker logs cambios-ingress         PROBE=0 Remitente=0 x-cambios-token=0
docker logs cambios-pg              PROBE=0 Remitente=0 x-cambios-token=0
```

### Lectura

1. **Ejecuciones exitosas (265):** `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` las oculta (la API no las muestra), pero n8n 2.23
   **las guarda al empezar con el payload entero** y al terminar sólo las **soft-deletea** (`deletedAt`). El borrado físico
   lo hace la poda después del `EXECUTIONS_DATA_HARD_DELETE_BUFFER` (no configurado → default **1 h**, verificado en `@n8n/config/dist/configs/executions.config.js:113`: `pruneDataHardDeleteBuffer = 1`; el ciclo de hard-delete corre cada **15 min**, línea 20). Además, SQLite
   no reescribe las páginas liberadas hasta un `VACUUM`: el texto puede quedar en el archivo aun después del hard-delete.
   → **Cada mensaje queda en la base de n8n entre ~1 h y ~1 h 15, y en el archivo hasta un VACUUM.** A verificar a las ~18:45 UTC
   si las primeras (17:40) ya se borraron físicamente.
2. **Ejecuciones con error (2, ids 64 y 66):** son las de T6 **antes** del fix (base caída). Guardan el payload completo y se
   retienen **7 días** (`EXECUTIONS_DATA_MAX_AGE=168`, `SAVE_ON_ERROR=all`). Así lo decía el plan §5 ("guardar errores con
   poda a 7 días"), pero contradice el requisito del punto 4. Hoy, con el fix, una falla del guardado ya **no** deja una
   ejecución con error (sale por "Responder 500" y la ejecución termina bien); sólo quedarían las fallas inesperadas.
3. Los logs (eventos de n8n, caddy, postgres) **no** tienen contenido ni el token.

### Para cumplir el punto 4 (no aplicado — decisión tuya)

- `EXECUTIONS_DATA_SAVE_ON_ERROR=none`: tampoco se guardan los errores. Se pierde el detalle para depurar una falla (queda el
  status HTTP del lado de Cambios, `ultimo_error` en `proyecto_salidas`, y la fila que haya en `wa.mensajes`).
- `EXECUTIONS_DATA_HARD_DELETE_BUFFER=1` explícito, `EXECUTIONS_DATA_PRUNE_MAX_COUNT` bajo y `DB_SQLITE_VACUUM_ON_STARTUP=true`
  para que no queden páginas viejas en el archivo.
- Aun así, n8n 2.23 **escribe el payload en su base mientras la ejecución corre** (≤ 1 h con el buffer mínimo). Llegar a
  "nunca toca disco" con n8n no parece posible con la configuración: haría falta que el webhook lo recibiera otra cosa
  (el receptor chico en Node del plan B, §1.3 del plan).
- Borrar ya las 2 ejecuciones con error (64, 66: sintéticas) y hacer `VACUUM` de la base de n8n.
