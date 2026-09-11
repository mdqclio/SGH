# PLAN — lo nuestro para el Stud Book, sin esperar a Diego (NADA ejecutado)

**Fecha:** 2026-09-11 (noche) · **`main`:** `4144a91` · **Branch:** `feat/studbook-condicion-5-campos` @ `6bcbc87` (pusheada: los 2 SQL propuestos; los cambios de HTML/JS descritos abajo **no están codeados** todavía) · **Base:** `2026-09-11_relevamiento-studbook-tres-pedidos-diego.md`
**Solo lectura.** 3 `select` + `grep` en `main`.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 203 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Las 5 carreras con `condicion_sexo` mal — `migrations/fix_condicion_sexo_r6_r7_r8.sql`

### ¿Toca liquidación o resultados? No. Verificado así:

| quién lee `condicion_sexo` | cómo lo supe | efecto del cambio |
|---|---|---|
| `validar_inscripcion()` | `pg_proc.prosrc ilike '%condicion_sexo%'` → **sólo esa** función | gate al **anotar**; no corre sobre inscripciones existentes |
| vista `v_programa_reunion` | `information_schema.views` | lectura |
| `carta-llamados`, `inscripciones`, `ratificacion`, `programa`, `portal` | `grep condicion_sexo *.html` | display / chip; `ratificacion.html:314` ya tiene el comentario "R8 T12 es 'ambos' pero dice Yeguas" y deriva del texto |
| `studbook_format.mjs:321` | grep | el JSON |
| **`aplicar_resultado`, `liquidaciones.html`, `liquidaciones-engine.js`, `emitir_recibo`, `anular_recibo`, `liberar_linea`, `desoficializar_carrera`** | 0 hits en grep y en `pg_proc` | **no lo leen** |
| triggers sobre `carreras` | `trg_audit_carreras` INSERT/UPDATE/DELETE, nada más | queda auditado, como el fix de R9 |

Es dato de la carrera. Las dos oficiales (R6 T2: 16 líneas, R8 T12: 20 líneas) tienen su foto en el 0.b del SQL para comparar antes/después: mismas líneas, mismo neto, mismo `resultados.updated_at`.

### Las 5 y el valor propuesto

| carrera | texto | hoy | propuesto | estado |
|---|---|---|---|---|
| R6 T2 `c06f15a1` | Caballos 3 años perdedores (con exclusión de yeguas) | ambos | **machos** | oficial; 8 ratificados, todos machos |
| R6 T4 `d6a71a62` | Caballos 4 años perdedores (con exclusión de yeguas) | ambos | **machos** | anulada |
| R6 T10 `f23f5078` | Yeguas de 5 años y + edad ganadoras de 1 o 2 | ambos | **hembras** | anulada |
| R7 T7 `c611e802` | Yeguas 4 y 5 años perdedoras. | ambos | **hembras** | R7 cancelada, 0 inscr |
| R8 T12 `5fdacd51` | Yeguas de 4 y 5 años perdedoras | ambos | **hembras** | oficial; 9 inscr, 0 machos |

**Supuesto marcado en el SQL**: "con exclusión de yeguas" → `machos` (el ENUM tiene también `machos_castrados`; el texto no distingue; `machos` es lo que ya usa la única carrera con ese valor). Si en Dolores "machos" excluye castrados, son 2 literales.

Verificación final del SQL: 0 carreras en toda la base con texto de yeguas/exclusión y columna en desacuerdo (hoy 5).

---

## 2. `ganadas_desde` / `ganadas_hasta` — `migrations/carreras_ganadas_desde_hasta.sql`

### DDL
```sql
ALTER TABLE carreras ADD COLUMN ganadas_desde integer, ADD COLUMN ganadas_hasta integer;
ALTER TABLE carreras ADD CONSTRAINT carreras_ganadas_rango CHECK (
  (ganadas_desde IS NULL AND ganadas_hasta IS NULL)
  OR (ganadas_desde >= 0 AND (ganadas_hasta IS NULL OR ganadas_hasta >= ganadas_desde)));
```
Nullable las dos. El CHECK impide `hasta` sin `desde` y `hasta < desde`.

### Convención para "o más": **`ganadas_hasta = NULL`**

| criterio | NULL | tope (99 / 999 / -1) |
|---|---|---|
| coherencia con lo que ya hay | **misma regla que `edad_maxima_anos`**: NULL = "y + edad" en T8, T9, T10, T11 de R9 (así lo cargó Yesi hoy). Una sola regla para las dos parejas | dos reglas distintas para el mismo concepto en la misma tabla |
| facilidad de cambiar después si Diego usa otra | una línea: `UPDATE … SET ganadas_hasta = 99 WHERE ganadas_desde IS NOT NULL AND ganadas_hasta IS NULL` — o mejor, **traducir en el formatter** sin tocar la base (`ganadahasta: c.ganadas_hasta ?? 99`) | también una línea, pero un tope inventado queda en la base como si fuera dato; NULL no miente |
| ambigüedad | `(NULL, NULL)` = no cargado; `(N, NULL)` = N o más. Con `desde` cargado no hay ambigüedad | ninguna, pero el tope es arbitrario |
| UI | "hasta" vacío = "o más", igual que "edad máxima" vacía hoy | Yesi tendría que tipear 99 |

Elijo NULL por la primera y la segunda fila. Lo que le pregunto a Diego es sólo cómo lo quiere **recibir** — y eso se resuelve en `studbook_format.mjs`, no en la base.

### Pre-carga de las 46 (regex del relevamiento, 46/46 parsean)

| texto | desde | hasta | n |
|---|---|---|---|
| perdedor(es/as) | 0 | 0 | 25 |
| ganador(a/es/as) de 1 carrera | 1 | 1 | 3 |
| … de 1 o 2 | 1 | 2 | 13 |
| … de 2 o 3 | 2 | 3 | 1 |
| … de 2 o + | 2 | NULL | 3 |
| … de 3 o mas | 3 | NULL | 1 |
| sin texto (9999 ×3) | NULL | NULL | 3 — **no se tocan** |

El SQL tiene la **vista previa** (2.a) que Yesi valida antes — 46 filas con reunión, turno, texto, desde, hasta y una columna `alerta` que tiene que salir vacía — y recién después el UPDATE (2.b), idempotente (`WHERE ganadas_desde IS NULL AND ganadas_hasta IS NULL`). Verificación: distribución 25/3/13/1/3/1 + 3 NULL; 0 con texto y sin `desde`.

### UI en `carta-llamados.html` — 3 toques, mismo bloque que edad

Hoy (`grep` en `main`): inputs `#f-edad-min`/`#f-edad-max` en las líneas **347/351**, carga en **1141-1142**, payload en **1203-1204**. Propuesta, calcada:

```html
<!-- después del form-group de Edad máxima (línea ~352) -->
<div class="form-group">
  <label>Ganadas desde</label>
  <input type="number" id="f-ganadas-desde" min="0" max="50" placeholder="0 = perdedores">
</div>
<div class="form-group">
  <label>Ganadas hasta</label>
  <input type="number" id="f-ganadas-hasta" min="0" max="50" placeholder="vacío = o más">
</div>
```
```javascript
// carga del modal (junto a 1141-1142)
document.getElementById('f-ganadas-desde').value = rec?.ganadas_desde ?? '';
document.getElementById('f-ganadas-hasta').value = rec?.ganadas_hasta ?? '';
// payload (junto a 1203-1204)
ganadas_desde: document.getElementById('f-ganadas-desde').value !== '' ? parseInt(document.getElementById('f-ganadas-desde').value) : null,
ganadas_hasta: document.getElementById('f-ganadas-hasta').value !== '' ? parseInt(document.getElementById('f-ganadas-hasta').value) : null,
```
Ojo con el `0`: el patrón de edad usa `value ? parseInt : null`, que convierte `"0"`… no — `"0"` es string truthy, pero `rec?.ganadas_desde || ''` con `0` daría `''`. Por eso arriba va `?? ''` y `!== ''`, no `||`. Es el único detalle donde no se puede copiar el patrón de edad tal cual (edad nunca es 0; ganadas sí).

**Sin verificar** hasta codearlo: que el modal no tenga otro `save` que reconstruya el payload (hay un solo `condicion_sexo:` en el payload, línea 1205, así que es un solo lugar).

Probe: extender `tests/probe_condicion_sexo_r9.mjs` (rama `fix/condicion-sexo-t8-t10-r9`, sin mergear) o uno nuevo `probe_ganadas.mjs`: extrae el payload de `carta-llamados.html` por ancla, verifica que mande `ganadas_*` y que `0` viaje como `0` y vacío como `null`.

---

## 3. El JSON — `supabase/functions/_shared/studbook_format.mjs:322-323`

```diff
       condicion: {
         texto: c.condicion_handicap ?? c.condicion_adicional ?? null,
         edaddesde: c.edad_minima_anos,
         edadhasta: c.edad_maxima_anos,
         sexo: mapSexo(c.condicion_sexo),
-        ganadadesde: null,
-        ganadahasta: null,
+        ganadadesde: c.ganadas_desde ?? null,
+        ganadahasta: c.ganadas_hasta ?? null,   // NULL = "o más"; si Diego quiere tope: `?? 99` acá, no en la base
       },
```
`index.ts:112` hace `.from('carreras').select('*')` → las columnas nuevas llegan solas al builder; no hay que tocar la query. Después: redeploy de `reunion-json` (hoy v21) y diff del JSON de R9 contra `tools/studbook_reunion_json.mjs` (mismo `_shared`, tiene que dar byte a byte).

Orden obligatorio: **DDL → backfill → formatter → deploy**. Si se deploya el formatter antes del DDL, `c.ganadas_desde` es `undefined` → `?? null` lo salva, así que tampoco rompe; pero el orden natural es ese.

---

## 4. Lista de los 10 DNI — texto plano para WhatsApp

```
Yesi, estos 10 entrenadores tienen caballos anotados en la reunión del 20/09 y no tienen DNI cargado en el sistema. El Stud Book lo pide por documento. ¿Me los pasás o los cargás desde Entrenadores → editar?

1. BLANCO, MARCELO — LOCA DUBAI (T2 y T3), BAHIA ROMANA (T3)
2. BOLONTI, ROBERTO — DOCTORA MIA (T2), DEL CAMPEON (T2)
3. CANTO, HORACIO — AMIGUITO JESUS (T5), KUCCINI (T5), EL MAS SABIO (T6), ESPLENDID CRAF (T9)
4. GONZALEZ, ADRIAN AGUSTIN — TOUCH OF BLUE (T2), ECHO IN THE SKY (T7)
5. MAITIA, MIGUEL A — TORO MAÑERO (T3), COLONIAL JOHAN (T4), TOY BOY (T4), SEMBRADOR CHUCK (T7)
6. PADRON, WALTER — BACON (T4), BUEN MANUEL (T11)
7. PAGANO, JUAN MAURICIO — IDALIA MARO (T6 y T8)
8. PREBE, JOSE — DESTINADO JOHAN (T11)
9. TRUPPA, ROBERTO — ASTUTO NOTES (T2), FALAYS (T6), HEART OF GOLD (T11)
10. VILLANUEVA, SANTINO — TERRIBLE KING (T11)

Y tres jockeys, mismo tema: GONZALEZ EDUARDO CECILIO, GONZALEZ LUCAS, HAHN GONZALO.

Aparte, 8 caballos anotados todavía sin entrenador: DESERT OF DUBAI (T1), QUE BELLA DOÑA (T1), NIÑO OCEANICO (T4), BIEN COQUETA (T4), EL RISKO (T7), THE BEAST PARTY (T9), INDIANA MARO (T10), GOIADORA (T11).
```

(Foto de las 21:5x UTC; R9 iba por 78 inscripciones. Si Yesi siguió cargando, la lista se regenera con la query de §7 del relevamiento.)

---

## 5. Valores de pista — para Diego

```
Tipos y estados de pista que usamos (valores en base, minúscula sin acento):

TIPO DE PISTA (por carrera) — catálogo cerrado (ENUM): cesped, arena, mixta, sintetica, tierra
  En uso: tierra (40 carreras), cesped (9)

ESTADO DE PISTA (por resultado) — catálogo cerrado (CHECK): seca, humeda, fangosa, pesada
  En uso: seca (9), humeda (9), pesada (1)

En el JSON viajan como {id: <valor>, nombre: <valor>} — el id es el mismo texto. Si necesitás tus IDs numéricos, pasame la tabla y los mapeo del lado nuestro (son 9 valores).
```

---

## 6. Orden de ejecución propuesto (cada paso con su OK)

| # | qué | riesgo | depende de |
|---|---|---|---|
| 1 | `fix_condicion_sexo_r6_r7_r8.sql` (5 UPDATE) | nulo — no lo lee la plata; auditado | confirmar `machos` vs `machos_castrados` (Fede) — o ejecutar con `machos` y anotar |
| 2 | mandar a Yesi la lista de §4 | — | — |
| 3 | `carreras_ganadas_desde_hasta.sql` DDL + backfill, con la vista previa validada por Yesi (o por vos, son 46 filas y 6 patrones) | bajo — columnas nuevas nullable, nada las lee todavía | — |
| 4 | UI en `carta-llamados.html` + probe | bajo | 3 |
| 5 | formatter + redeploy `reunion-json` v22 + diff contra el CLI | bajo | 3 (el `?? null` lo hace tolerante igual) |
| 6 | Yesi carga `ganadas` en los 11 turnos de R9 (o valida la pre-carga: los 11 tienen texto, así que ya vienen del paso 3) | — | 3, 4 |
| 7 | mandar a Diego: §5 + la convención "hasta NULL = o más" + pedirle la doc del endpoint | — | — |

Los 12 `edad_minima/maxima` de R8 (relevamiento §2.2) **no** están en este plan — se pueden derivar del texto también (`(\d)` + "y más"; los 12 parsean, verificado hoy: `r8_edad_parse` en §8), pero es otro backfill y otro OK.

---

## 7. Los dos SQL — contenido completo

### `migrations/fix_condicion_sexo_r6_r7_r8.sql`
```sql
-- ============================================================
-- fix_condicion_sexo_r6_r7_r8.sql — 5 carreras con condicion_sexo='ambos' y texto de yeguas / exclusión de yeguas
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Mismo defecto que R9 T8/T10 (fix del 08/09, migrations/fix_condicion_sexo_r9_t8_t10.sql en la rama
-- fix/condicion-sexo-t8-t10-r9): la columna dice 'ambos' y el texto dice otra cosa. Detectado el 11/09
-- (docs/diagnosticos/2026-09-11_relevamiento-studbook-tres-pedidos-diego.md §2.2) con:
--   (lower(condicion_handicap) ~ 'yegua' AND condicion_sexo <> 'hembras')
--   OR (lower(condicion_handicap) ~ 'exclusi.n de yeguas' AND condicion_sexo <> 'machos')
--
-- Qué lee condicion_sexo (verificado el 11/09):
--   · validar_inscripcion()  — gate al ANOTAR (pg_proc.prosrc). No corre sobre inscripciones ya hechas.
--   · v_programa_reunion     — vista de lectura.
--   · carta-llamados / inscripciones / ratificacion / programa / portal — display.
--   · studbook_format.mjs    — el JSON (condicion.sexo).
--   NO lo leen: aplicar_resultado, liquidaciones.html, liquidaciones-engine.js, emitir_recibo, ninguna RPC de
--   plata (grep en main + pg_proc). Cambiar la columna no toca resultados ni liquidación: es dato de la carrera.
--   trg_audit_carreras deja el rastro (datos_antes/datos_despues), como con el fix de R9.
--
-- Las 5 (ids verificados):
--   R6 T2  c06f15a1-a570-434f-acf1-4c412fd50108  "Caballos 3 años perdedores (con exclusión de yeguas)"  → machos   (oficial, 16 líneas liq, 8 machos ratificados, 0 hembras)
--   R6 T4  d6a71a62-0dc2-426b-838e-25f95c396824  "Caballos 4 años perdedores (con exclusión de yeguas)"  → machos   (anulada)
--   R6 T10 f23f5078-1928-4715-8ef8-f81149f20531  "Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras." → hembras (anulada)
--   R7 T7  c611e802-d149-4a7b-a889-f0486b89b407  "Yeguas 4 y 5 años perdedoras."                          → hembras (R7 cancelada, 0 inscr)
--   R8 T12 5fdacd51-9d7b-4d42-a83c-894f8eb35b8b  "Yeguas de 4 y 5 años perdedoras"                        → hembras (oficial, 20 líneas liq, 0 machos)
--
-- SUPUESTO: "con exclusión de yeguas" = 'machos' (el ENUM tiene también 'machos_castrados'; el texto no
-- distingue, y 'machos' es el valor que ya usa la única carrera con ese sexo en la base). Confirmar con Fede
-- si "machos" en Dolores incluye castrados; si no, es cambiar 2 literales.
-- ============================================================

-- 0. Pre: exactamente estas 5 filas con 'ambos'.
SELECT r.numero, c.numero_turno, c.id, c.condicion_sexo, c.condicion_handicap
FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
WHERE c.id IN ('c06f15a1-a570-434f-acf1-4c412fd50108','d6a71a62-0dc2-426b-838e-25f95c396824','f23f5078-1928-4715-8ef8-f81149f20531','c611e802-d149-4a7b-a889-f0486b89b407','5fdacd51-9d7b-4d42-a83c-894f8eb35b8b')
ORDER BY r.numero, c.numero_turno;

-- 0.b Foto de plata y resultados de las 2 oficiales, para comparar después (no tiene que cambiar nada).
SELECT c.id, (SELECT count(*) FROM liquidacion_detalle d WHERE d.carrera_id = c.id) AS lineas,
       (SELECT sum(monto_neto) FROM liquidacion_detalle d WHERE d.carrera_id = c.id) AS neto,
       (SELECT estado FROM resultados WHERE carrera_id = c.id) AS res_estado,
       (SELECT updated_at FROM resultados WHERE carrera_id = c.id) AS res_updated
FROM carreras c WHERE c.id IN ('c06f15a1-a570-434f-acf1-4c412fd50108','5fdacd51-9d7b-4d42-a83c-894f8eb35b8b');

BEGIN;

UPDATE carreras SET condicion_sexo = 'machos'
WHERE id IN ('c06f15a1-a570-434f-acf1-4c412fd50108','d6a71a62-0dc2-426b-838e-25f95c396824') AND condicion_sexo = 'ambos';
-- 2 filas

UPDATE carreras SET condicion_sexo = 'hembras'
WHERE id IN ('f23f5078-1928-4715-8ef8-f81149f20531','c611e802-d149-4a7b-a889-f0486b89b407','5fdacd51-9d7b-4d42-a83c-894f8eb35b8b') AND condicion_sexo = 'ambos';
-- 3 filas

-- Verificación: 0 carreras con texto de yeguas/exclusión y columna en desacuerdo (en toda la base).
SELECT count(*) AS desacuerdos FROM carreras c
WHERE (lower(c.condicion_handicap) ~ 'yegua' AND lower(c.condicion_handicap) !~ 'exclusi.n de yeguas' AND c.condicion_sexo <> 'hembras')
   OR (lower(c.condicion_handicap) ~ 'exclusi.n de yeguas' AND c.condicion_sexo <> 'machos');
-- 0
-- Repetir 0.b: mismas líneas, mismo neto, mismo res_updated.

COMMIT;

-- ROLLBACK: UPDATE carreras SET condicion_sexo='ambos' WHERE id IN (…las 5…);
```

### `migrations/carreras_ganadas_desde_hasta.sql`
```sql
-- ============================================================
-- carreras_ganadas_desde_hasta.sql — condición "ganadas" en columnas (pedido Stud Book, campos 4 y 5 de 5)
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo. DDL: aplicar por apply_migration.
--
-- Hoy la cantidad de carreras ganadas que exige el turno ("perdedores", "ganadores de 1 o 2", "de 2 o +")
-- vive sólo en el texto libre condicion_handicap. El JSON del Stud Book manda ganadadesde/ganadahasta
-- hardcodeados en null (studbook_format.mjs:322-323). Esto agrega las dos columnas, las pre-carga desde el
-- texto para las 46 carreras que lo tienen (regex probado el 11/09: 46/46 parsean, 0 ambiguas) y deja las
-- 3 de la reunión 9999 (sandbox, sin texto) en NULL.
--
-- CONVENCIÓN (propuesta): ganadas_hasta = NULL significa "o más" (sin tope).
--   · Es la misma semántica que ya usa edad_maxima_anos (NULL = "y + edad") en 5 turnos de R9 y en T8/T10/T11
--     tras el acomodo de Yesi del 11/09. Una sola regla para las dos parejas de columnas.
--   · Es la más fácil de cambiar después: si Diego usa un tope (99, 999, -1), es un UPDATE de una línea
--     `SET ganadas_hasta = 99 WHERE ganadas_desde IS NOT NULL AND ganadas_hasta IS NULL` — o, mejor, se
--     traduce en el formatter sin tocar la base. Al revés (tope → NULL) también es una línea, pero un tope
--     inventado en la base contamina el dato; NULL no.
--   · Ambigüedad conocida: (desde NULL, hasta NULL) = "no cargado"; (desde N, hasta NULL) = "N o más".
--     Con desde NOT NULL no hay ambigüedad; el CHECK de abajo obliga a que hasta sin desde no exista.
--
-- Mapeo del texto (los 6 patrones que hay en la base, 39 textos distintos):
--   perdedor(es/as)                 → 0 – 0
--   ganador(a/es/as) de 1 carrera   → 1 – 1
--   … de 1 o 2                      → 1 – 2
--   … de 2 o 3                      → 2 – 3
--   … de 2 o +                      → 2 – NULL
--   … de 3 o mas                    → 3 – NULL
-- ============================================================

-- 1. DDL
ALTER TABLE carreras
  ADD COLUMN IF NOT EXISTS ganadas_desde integer,
  ADD COLUMN IF NOT EXISTS ganadas_hasta integer;

ALTER TABLE carreras
  ADD CONSTRAINT carreras_ganadas_rango CHECK (
    (ganadas_desde IS NULL AND ganadas_hasta IS NULL)                        -- no cargado
    OR (ganadas_desde >= 0 AND (ganadas_hasta IS NULL OR ganadas_hasta >= ganadas_desde))  -- N o más / N a M
  );

COMMENT ON COLUMN carreras.ganadas_desde IS 'Condición: mínimo de carreras ganadas exigido (0 = perdedores). NULL con hasta NULL = no cargado.';
COMMENT ON COLUMN carreras.ganadas_hasta IS 'Condición: máximo de carreras ganadas. NULL con desde NOT NULL = "o más" (sin tope), misma convención que edad_maxima_anos.';

-- 2. Pre-carga desde el texto (sólo filas con texto y columnas todavía NULL; idempotente)
-- 2.a Vista previa — lo que Yesi valida ANTES del UPDATE. 46 filas, ninguna 'NO_PARSEA'.
SELECT r.numero AS reunion, c.numero_turno AS t, c.condicion_handicap,
  CASE
    WHEN lower(c.condicion_handicap) ~ 'perdedor' THEN 0
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 carrera' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 o 2' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o 3' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o \+' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 3 o m' THEN 3
  END AS desde,
  CASE
    WHEN lower(c.condicion_handicap) ~ 'perdedor' THEN 0
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 carrera' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 o 2' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o 3' THEN 3
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o \+' THEN NULL
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 3 o m' THEN NULL
  END AS hasta,
  CASE WHEN lower(c.condicion_handicap) !~ 'perdedor|ganador(a|es|as)? de (1 carrera|1 o 2|2 o 3|2 o \+|3 o m)' THEN 'NO_PARSEA' END AS alerta
FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
WHERE c.condicion_handicap IS NOT NULL
ORDER BY r.numero, c.numero_turno;

BEGIN;

-- 2.b El UPDATE (misma regla que la vista previa)
UPDATE carreras c SET
  ganadas_desde = CASE
    WHEN lower(c.condicion_handicap) ~ 'perdedor' THEN 0
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 carrera' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 o 2' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o 3' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o \+' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 3 o m' THEN 3
  END,
  ganadas_hasta = CASE
    WHEN lower(c.condicion_handicap) ~ 'perdedor' THEN 0
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 carrera' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 o 2' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o 3' THEN 3
    ELSE NULL
  END
WHERE c.condicion_handicap IS NOT NULL
  AND c.ganadas_desde IS NULL AND c.ganadas_hasta IS NULL
  AND lower(c.condicion_handicap) ~ 'perdedor|ganador(a|es|as)? de (1 carrera|1 o 2|2 o 3|2 o \+|3 o m)';
-- 46 filas

-- Verificación
SELECT ganadas_desde, ganadas_hasta, count(*) FROM carreras GROUP BY 1,2 ORDER BY 1,2;
-- 0-0: 25 · 1-1: 3 · 1-2: 13 · 2-3: 1 · 2-NULL: 3 · 3-NULL: 1 · NULL-NULL: 3 (las de la 9999)
SELECT count(*) FROM carreras WHERE ganadas_desde IS NULL AND condicion_handicap IS NOT NULL;
-- 0

COMMIT;

-- ROLLBACK
-- ALTER TABLE carreras DROP CONSTRAINT carreras_ganadas_rango;
-- ALTER TABLE carreras DROP COLUMN ganadas_desde, DROP COLUMN ganadas_hasta;
-- (studbook_format.mjs vuelve a null hardcodeado; carta-llamados.html pierde los dos inputs)
```

---

## 8. Queries de respaldo (hoy)

```sql
select 'fns_condicion_sexo' k, coalesce((select jsonb_agg(p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc ilike '%condicion_sexo%'), '[]') v
union all select 'fns_edad', coalesce((select jsonb_agg(p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc ilike '%edad_minima%'), '[]')
union all select 'triggers_carreras', coalesce((select jsonb_agg(trigger_name||'/'||event_manipulation) from information_schema.triggers where trigger_schema='public' and event_object_table='carreras'), '[]')
union all select 'vistas_condicion_sexo', coalesce((select jsonb_agg(table_name) from information_schema.views where table_schema='public' and view_definition ilike '%condicion_sexo%'), '[]')
union all select 'las5', (select jsonb_agg(jsonb_build_object('r',r.numero,'t',c.numero_turno,'id',c.id,'sexo',c.condicion_sexo,'h',c.condicion_handicap,'estado',c.estado,'res',(select estado from resultados where carrera_id=c.id),'n_inscr',(select count(*) from inscripciones where carrera_id=c.id),'n_liq_lineas',(select count(*) from liquidacion_detalle d where d.carrera_id=c.id),'machos_inscritos',(select count(*) from inscripciones i join spcs s on s.id=i.spc_id where i.carrera_id=c.id and s.sexo<>'hembra' and i.estado='ratificado')) order by r.numero, c.numero_turno) from carreras c join reuniones r on r.id=c.reunion_id where (r.numero,c.numero_turno) in ((6,2),(6,4),(6,10),(7,7),(8,12)))
union all select 'r8_edad_parse', (select jsonb_agg(jsonb_build_object('t',c.numero_turno,'h',c.condicion_handicap,'emin',(regexp_match(lower(c.condicion_handicap),'(\d)'))[1],'ymas',lower(c.condicion_handicap) ~ 'y (\+|m[aá]s)') order by c.numero_turno) from carreras c join reuniones r on r.id=c.reunion_id where r.numero=8)
```
```json
[{"k":"fns_condicion_sexo","v":["validar_inscripcion"]},
 {"k":"fns_edad","v":["validar_inscripcion"]},
 {"k":"triggers_carreras","v":["trg_audit_carreras/INSERT","trg_audit_carreras/DELETE","trg_audit_carreras/UPDATE"]},
 {"k":"vistas_condicion_sexo","v":["v_programa_reunion"]},
 {"k":"las5","v":[{"h":"Caballos 3 años perdedores (con exclusión de yeguas)","r":6,"t":2,"id":"c06f15a1-a570-434f-acf1-4c412fd50108","res":"oficial","sexo":"ambos","estado":null,"n_inscr":12,"n_liq_lineas":16,"machos_inscritos":8},{"h":"Caballos 4 años perdedores (con exclusión de yeguas)","r":6,"t":4,"id":"d6a71a62-0dc2-426b-838e-25f95c396824","res":null,"sexo":"ambos","estado":"anulada","n_inscr":7,"n_liq_lineas":0,"machos_inscritos":0},{"h":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras.","r":6,"t":10,"id":"f23f5078-1928-4715-8ef8-f81149f20531","res":null,"sexo":"ambos","estado":"anulada","n_inscr":2,"n_liq_lineas":0,"machos_inscritos":0},{"h":"Yeguas 4 y 5 años perdedoras.","r":7,"t":7,"id":"c611e802-d149-4a7b-a889-f0486b89b407","res":null,"sexo":"ambos","estado":"abierta","n_inscr":0,"n_liq_lineas":0,"machos_inscritos":0},{"h":"Yeguas de 4 y 5 años perdedoras","r":8,"t":12,"id":"5fdacd51-9d7b-4d42-a83c-894f8eb35b8b","res":"oficial","sexo":"ambos","estado":"abierta","n_inscr":9,"n_liq_lineas":20,"machos_inscritos":0}]},
 {"k":"r8_edad_parse","v":[{"h":"Todo Caballos de 3 años perdedores","t":1,"emin":"3","ymas":false},{"h":"Todo caballo de 4 años perdedores","t":2,"emin":"4","ymas":false},{"h":"Todo caballo de 4 años perdedores","t":3,"emin":"4","ymas":false},{"h":"Todo caballo de 6 años y más edad perdedores","t":4,"emin":"6","ymas":true},{"h":"Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras","t":5,"emin":"4","ymas":true},{"h":"Todo caballo de 3 y 4 años ganadores de 1 o 2 carreras","t":6,"emin":"3","ymas":false},{"h":"Todo caballo de 3,4 y 5 años ganadores de 1 o 2 carreras","t":7,"emin":"3","ymas":false},{"h":"Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras","t":8,"emin":"6","ymas":true},{"h":"Todo caballo de 5 años y más edad ganadores de 1 carrera","t":9,"emin":"5","ymas":true},{"h":"Especial todo caballo de 4 años y + edad ganador de 2 o + carreras.","t":10,"emin":"4","ymas":true},{"h":"Todo caballo de 5 años y más edad perdedores","t":11,"emin":"5","ymas":true},{"h":"Yeguas de 4 y 5 años perdedoras","t":12,"emin":"4","ymas":false}]}]
```
```
$ grep -n "condicion_sexo" *.html *.js supabase/functions/*/index.ts supabase/functions/_shared/*.mjs   (main)
carta-llamados.html:1143 / :1205 · inscripciones.html:466,558,882,885,890,958 · portal.html:571,625 · programa.html:400 · ratificacion.html:280,314,319,354,704 · studbook_format.mjs:321
(liquidaciones.html, liquidaciones-engine.js, resultados.html: 0)
$ grep -n "edad_minima_anos\|edad_maxima_anos\|f-edad-min\|f-edad-max" carta-llamados.html → 347, 351, 1141, 1142, 1203, 1204
$ grep -n "from('carreras')" -A3 supabase/functions/reunion-json/index.ts → 112: .from('carreras').select('*').eq('reunion_id', reunionId)
```

---

## 9. Verificación de push

```
$ git ls-remote origin feat/studbook-condicion-5-campos
6bcbc87644d54bf1d950d55dec599d648a50913c	refs/heads/feat/studbook-condicion-5-campos
$ git push origin reports
$ git ls-remote origin reports
a9454fed6faaf732d1a2754676e0b7004ebd7ff6	refs/heads/reports
$ git rev-parse HEAD
a9454fed6faaf732d1a2754676e0b7004ebd7ff6
```
