# Numeración pública de reuniones — Diseño

**Branch**: `feat/numero-publico-reuniones`
**Fecha**: 2026-08-10
**Pedido**: Yesi — el programa del domingo 16/08 debe decir "Reunión N° 7", no 8. La reunión del 19/07 no se corrió y no debe consumir número público.
**Estado**: DISEÑO — nada aplicado a DB ni a prod.

---

## 0. Guard de sesión

| Check | Esperado | Real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `SELECT count(*) FROM spcs` | 181 (según pedido) | **179** |

⚠️ **Discrepancia**: el pedido asumía 181 SPCs tras la tanda 5. El valor real es **179**. La tanda 5 tocó únicamente `caballerizas` (rename EL POE→EL POBRE + altas LUNA ROJA / TIAN Y ROMA) y `profesionales` (ALDECOA) — no agregó ejemplares. El último movimiento de `spcs` fue la tanda 4b (LE CHAT MIMOUS, 178→179). No hay pérdida de datos; el número esperado estaba mal. Sin impacto sobre este trabajo.

⚠️ **Segunda corrección de dato**: el pedido llama "suspendida" a la reunión del 19/07. En DB su `estado` es **`cancelada`**, no `suspendida`. La regla de negocio trata ambos estados igual, así que el resultado no cambia — pero conviene que Yesi sepa con qué etiqueta quedó cargada.

---

## 1. Estado actual en DB

`reuniones` del club Dolores (`0649e9c5-…`):

| numero (interno) | fecha | estado | numero_publico propuesto |
|---:|---|---|---:|
| 1 | 2026-01-18 | finalizada | 1 |
| 2 | 2026-02-08 | finalizada | 2 |
| 3 | 2026-03-22 | finalizada | 3 |
| 4 | 2026-04-19 | finalizada | 4 |
| 5 | 2026-05-17 | finalizada | 5 |
| 6 | 2026-06-20 | borrador | 6 |
| 7 | 2026-07-19 | **cancelada** | **NULL** |
| 8 | 2026-08-16 | publicada | **7** ✅ |
| 9 | 2026-09-06 | programada | 8 |
| 10 | 2026-10-11 | programada | 9 |
| 11 | 2026-11-01 | programada | 10 |
| 12 | 2026-12-13 | programada | 11 |
| 9999 | 2099-01-01 | cancelada | NULL (reunión de prueba, año 2099, fuera de secuencia) |

La del 16/08 da **7**. Coincide con lo que pidió Yesi.

Constraint existente sobre la tabla: `UNIQUE (club_id, hipodromo_id, numero, fecha)`. El número interno no se toca en ningún gate de este trabajo.

### Alcance real del backfill

`reuniones` tiene tres grupos `(club, año)`, no uno:

| club | año | filas | efecto del backfill |
|---|---:|---:|---|
| Dolores | 2026 | 12 | la secuencia del pedido — 16/08 → 7 |
| **Mi Club Hípico** (`a6da7e40-…`) | 2026 | 1 | única reunión (17/05, borrador) → `numero_publico = 1` |
| Dolores | 2099 | 1 | reunión de prueba 9999, `cancelada` → `NULL` |

El backfill se escribe **general** (todos los clubes, todos los años) porque la regla es universal y particularizarla a Dolores/2026 dejaría al resto sin numerar y con la columna en NULL. El impacto fuera de Dolores es una sola fila de un club de prueba.

---

## 2. Modelo

Columna nueva `reuniones.numero_publico integer NULL`, **separada** del `numero` interno.

- `numero` = identidad técnica. FKs, auditoría, docs internos, selectores de secretaría. Inmutable por este trabajo.
- `numero_publico` = presentación. Es lo que ve el público en papel y en el portal.

`NULL` es un valor legítimo y significa "esta reunión no consume número público" (suspendida/cancelada), o "todavía sin numerar".

### Regla de negocio

> Dentro de un `club_id` y un año calendario (`EXTRACT(YEAR FROM fecha)`), las reuniones se ordenan por `fecha` y reciben 1..N consecutivos, **salteando** las de estado `suspendida` o `cancelada`, que quedan en `NULL`.

### Guard de unicidad

Índice único **parcial** — la unicidad sólo aplica entre las que efectivamente consumen número:

```sql
CREATE UNIQUE INDEX reuniones_numero_publico_uniq
  ON reuniones (club_id, (EXTRACT(YEAR FROM fecha)::int), numero_publico)
  WHERE numero_publico IS NOT NULL
    AND estado NOT IN ('cancelada','suspendida');
```

✅ *Verificado en gate 2*: la instancia corre **PostgreSQL 17.6**, donde `extract(text, date)` es IMMUTABLE (`provolatile = 'i'`) y `reuniones.fecha` es `date`. La expresión es indexable tal cual. El plan B (columna generada `anio`) queda descartado.

El índice es la defensa real. La pantalla valida antes para dar un mensaje lindo, pero la garantía vive en DB.

---

## 3. Punto C — dónde vive el default

**Decisión: función SQL invocada por la pantalla. Ni trigger, ni cálculo en JS.**

```sql
CREATE OR REPLACE FUNCTION siguiente_numero_publico(p_club_id uuid, p_fecha date)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT COALESCE(MAX(numero_publico), 0) + 1
  FROM reuniones
  WHERE club_id = p_club_id
    AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM p_fecha)
    AND estado NOT IN ('cancelada','suspendida')
    AND numero_publico IS NOT NULL
    AND fecha < p_fecha;
$$;
```

Por qué no las otras dos:

- **Trigger**: choca de frente con la decisión 3 (editable por secretaría). Un trigger tendría que distinguir "el usuario no puso nada" de "el usuario puso a mano el mismo valor que el default", y re-dispararía en cada UPDATE de la fila por cualquier motivo (cambio de estado, de observaciones, de horario de ratificación). Lógica invisible peleando con edición manual = la clase de bug que aparece recién en producción un domingo. Descartado.
- **Cálculo en la pantalla**: no hay bundler en este proyecto, así que la regla se copia-pega a cada HTML que la necesite y se desincroniza. Ya hay precedente doloroso: el sub-header del PDF de inscriptos está duplicado literal en `inscripciones.html:895` y `ratificacion.html:428`. Descartado.
- **Función SQL**: una sola definición de la regla, consumible por la pantalla (vía RPC), por el backfill y por el recálculo futuro. La pantalla la usa para **proponer**; el usuario confirma o pisa; el INSERT/UPDATE escribe siempre un valor explícito. El sistema propone, Yesi dispone — exactamente la decisión 3.

---

## 4. Punto B — suspensiones futuras

**Propuesta**: recalcular sólo hacia adelante, sólo lo no impreso, y **nunca en forma automática**.

Regla concreta:

1. Cuando una reunión pasa a `suspendida`/`cancelada`, su `numero_publico` se libera (→ `NULL`).
2. Las reuniones **posteriores por fecha**, del mismo club y año, son candidatas a correrse un lugar.
3. Es candidata sólo si su estado es `borrador` o `programada`. Si está `publicada`, `en_curso` o `finalizada`, **su número queda congelado**: ya salió en papel y el papel no se reescribe retroactivamente.
4. El recálculo **no se dispara solo**. La pantalla de reuniones ofrece un botón *"Recalcular numeración pública"* que muestra el diff propuesto (`de → a`, fila por fila) y pide confirmación.

Por qué manual y no automático: si una reunión futura ya está `publicada` y por lo tanto congelada, un recálculo ciego de las anteriores puede colisionar con su número y hacer fallar el índice único en medio de otra operación. Con confirmación previa, el conflicto se ve en el diff y lo resuelve una persona. Además es coherente con la decisión 3 — la numeración es de Yesi, el sistema no se la cambia por la espalda.

Usar `estado` como proxy de "ya se imprimió" evita agregar una columna `programa_emitido`. Si más adelante hace falta precisión (p.ej. una reunión publicada cuyo programa todavía no se mandó a imprenta), se agrega la columna y el paso 3 pasa a mirarla. Por ahora el proxy alcanza.

---

## 5. Punto A — `reunion-json` (Diego)

**Qué exporta hoy**: el número **interno**. Dos implementaciones espejo que deben moverse juntas:

- `supabase/functions/reunion-json/index.ts:91` — `.select('id, fecha, hipodromo_id, numero, estado')`
- `tools/studbook_reunion_json.mjs:60` — el mismo select

Ambas devuelven el objeto `reunion` tal cual viene del select (`index.ts:151`, `.mjs:128`). El header del edge function dice explícitamente *"Devuelve EXACTAMENTE el mismo JSON que tools/studbook_reunion_json.mjs"* — hay que respetarlo.

**Propuesta (confirmada en el pedido): contrato aditivo.** Agregar `numero_publico` al select en ambos archivos. `numero` se mantiene intacto. Diego no toca nada y su integración sigue andando; cuando quiera migrar, el campo ya está.

```
"reunion": { "id": …, "fecha": …, "numero": 8, "numero_publico": 7, "estado": … }
```

Sale en **gate 4, aparte**, con aviso a Diego por mail antes del deploy. No entra en la ventana urgente del 16.

---

## 6. Punto D — barrido de consumidores

### Fase 1 — urgente, para el 16/08

Salidas de cara al público. Todas pasan a `numero_publico`, con fallback `numero_publico ?? numero` para que nada quede en blanco si el backfill todavía no corrió.

| Archivo | Línea(s) | Qué es |
|---|---|---|
| `inscripciones.html` | 895 | Sub-header del PDF de inscriptos |
| `ratificacion.html` | 428 | Mismo sub-header, duplicado literal |
| `programa-oficial.html` | 230, 298 | Título de reunión + nombre del archivo |
| `programa-oficial-color.html` | 430, 531 | Bandera de tapa + nombre del archivo |
| `carta-llamados.html` | 433, 595, 759 | Documento oficial pre-carrera |

### Fase 2 — resto de lo público

| Archivo | Línea(s) | Qué es |
|---|---|---|
| `programa.html` | 314, 321 | Título de pantalla + header impreso |
| `portal.html` | 550, 667 | Portal propietarios/entrenadores |
| `reuniones.html` | 326 | Listado (+ campo editable nuevo, ver abajo) |
| `calendario.html` | 186 | Etiqueta del calendario anual |

### Fase 2 — a decidir con Yesi

- **Selectores de reunión de secretaría** (`inscripciones.html:357`, `programa.html:209`, `resultados.html:472`, `liquidaciones.html:487`, `ratificacion.html:493`, `resoluciones.html:215,217`). Son UI interna, pero si el selector dice "Reunión 8" y el programa impreso dice "Reunión 7", se presta a confusión. Propuesta conservadora: mostrar el público y el interno en gris chico al lado — `Reunión 7 (int. 8) — 16/08/2026`. Requiere confirmación de Yesi.
- **`resoluciones.html:260`** — las resoluciones citan reuniones y son documentos con peso oficial. Pendiente definir si citan público o interno.

### No se toca

- **`auditoria.html:315,331`** — el log de auditoría debe seguir mostrando la identidad técnica. Cambiarlo rompería la trazabilidad.

---

## 7. Gates

| Gate | Contenido | Estado |
|---|---|---|
| 1 | Diseño (este documento) | ✅ listo |
| 2 | Migración: columna + backfill + índice único parcial + función `siguiente_numero_publico` | ✅ **escrita** en `migrations/numero_publico_reuniones.sql` — **NO aplicada**, espera aviso a Yesi + OK |
| 3 | Fase 1 de pantallas/PDF + campo editable en `reuniones.html` | pendiente |
| 4 | `reunion-json` (edge fn + `.mjs`) — **aparte**, con aviso previo a Diego | pendiente |
| 5 | Fase 2 del barrido | pendiente |

**La aplicación del backfill se coordina con Yesi.** Leo le avisa antes. Nada se ejecuta contra producción sin ese aviso más el OK explícito.

El backfill vive en `migrations/numero_publico_reuniones.sql` — idempotente, envuelto en `BEGIN/COMMIT`, con cinco verificaciones posteriores (V1–V5) y un bloque de rollback comentado. V1 es la que importa: confirma que el 16/08 quedó en 7.

Orden dentro de la migración: columna → backfill → índice → función. El índice va **después** del backfill a propósito, para que el UPDATE masivo no choque contra la unicidad en un estado intermedio.
