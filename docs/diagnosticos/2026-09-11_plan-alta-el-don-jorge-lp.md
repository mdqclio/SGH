# PLAN — alta de "EL DON JORGE (LP)" con propietario provisorio (NADA ejecutado)

**Fecha:** 2026-09-11 (noche) · **`main`:** `95b7369` · **Branch:** `feat/caballeriza-el-don-jorge-lp` @ `dfcd136` (pusheada) · **SQL:** `migrations/caballeriza_el_don_jorge_lp.sql`
**Solo lectura** hasta acá. Complementa `2026-09-11_caballeriza-el-don-jorge-lp.md` (chequeo previo, misma noche).

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| `caballerizas` / `propietarios` / provisorios | 300 / 263 / 40 | ✅ (query 0.c del SQL, corrida hoy) |

---

## 1. Verificaciones previas (las tres que pediste)

### 1.1 ¿Existe ya? — No

`upper(regexp_replace(translate(nombre,…),'[^A-Za-z0-9]','','g')) LIKE '%JORGE%' OR LIKE '%DONJ%'` sobre las 300 caballerizas (sin filtro de club, sin acentos, sin espacios ni paréntesis → cubre `DON JORGE`, `EL DON JORGE`, `EL DON JORGE (LP)`, `DONJORGE`):

```json
[{"id":"8a71a402-063a-4aab-b753-86560718366f","hip":"DOL","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true,"estado":"activo","nombre":"DON JOACO","responsable":"KUKO JUAN PABLO (propietario)"}]
```

Sólo `DON JOACO` — otro stud. En `propietarios`, `%JORGE%` da 7 personas (ARIAS, PERRON, POLLINI, OCAÑO, HARTMANN, BARRIOS, PEREZ — todos "APELLIDO, JORGE X"), ninguna "EL DON JORGE". **Hay que crear los tres registros.**

### 1.2 ¿`caballerizas.html` manda `club_id` y filtra por club? — Sí, no hace falta fix

`caballerizas.html:620-629`:
```javascript
  const cabPayload = {
    club_id:   CLUB_ID,
    nombre:    document.getElementById('f-nombre').value.trim(),
    …
    hipodromo_patente:       document.getElementById('f-hipodromo-patente').value.trim() || null,
```
`:279` listado: `sb.from('caballerizas').select('*').eq('club_id', CLUB_ID)`. `:408` en `inscripciones.html`: el selector de caballeriza también `.eq('club_id', CLUB_ID).eq('activo', true)`. Dato: **0 caballerizas con `club_id` NULL** (296 Dolores + 4 de otros clubs). RLS `caballerizas_insert`: `NOT fn_is_portal_user() AND (super_admin OR club_id = fn_get_user_club_id())` → Yesi inserta en Dolores. **Esta pantalla no tiene el defecto de ISSUE-072/073** (salvo el detalle menor de que el UPDATE va sin `.eq('club_id')`, que no afecta el alta). Prueba viva: Yesi creó `LOS URONES` hoy 16:57 AR con `club_id` Dolores (y quedó duplicada — ver informe anterior §5; otro tema).

### 1.3 ¿Cómo está el sufijo en las otras? — Tres formas, ninguna mayoritaria

| forma | filas |
|---|---|
| `GARIN CITY (LP)` — paréntesis en el nombre, `hipodromo_patente` NULL | 1 |
| `JUVENTUD LP`, `LA ESCUELITA LP` — sin paréntesis, `hipodromo_patente` NULL | 2 |
| `TIAN Y ROMA`, `BETTY SANTI` — nombre limpio, `hipodromo_patente = 'LP'` | 2 |

Sufijos entre paréntesis en toda la tabla: `(DOL)` 3, `(AZ)` 2, `(TDL)` 2, `(LP)` 1, `(SL)` 1. `hipodromo_patente`: `DOL` 220, NULL 74, `LP` 2, `AZ`/`TANDIL`/`PALERMO`/`SR` 1 c/u.

Yesi fijó el nombre: **`EL DON JORGE (LP)`** (coincide con el único precedente con paréntesis). Para la columna, el SQL pone **`hipodromo_patente = 'LP'`** como `TIAN Y ROMA`/`BETTY SANTI` — es la única decisión mía en este plan; si preferís NULL como `GARIN CITY (LP)`, es cambiar un literal.

---

## 2. El alta — replica exacta de los 40 de R8

Medido sobre las 40 filas (`notas = 'provisorio R8 15/08'`), no sobre el doc:

```json
propietarios (40 iguales):  {"tipo":"persona","documento_tipo":null,"doc_null":true,"club_id":"0649e9c5-…","estado":"activo","activo":true,"notas":"provisorio R8 15/08"}
caballeriza_responsables (40 iguales): {"rol":"propietario","activo":true,"prof_null":true,"apellido_null":true,"nombre_null":false,"doc_null":true,"porcentaje":null}
   + documento_tipo = 'DNI' en las 3 muestras leídas (columna no agrupada; **sin verificar** en las 40)
caballerizas.responsable (texto): NULL en las 40, con_texto 0
```

Fuente del formato: `docs/RUNBOOK_R8_PROVISORIOS.md:228-248` (el INSERT de `propietarios (club_id, tipo, nombre, activo, estado, notas)` y el de `caballeriza_responsables (caballeriza_id, propietario_id, rol, activo, nombre)`).

Lo que hace el SQL, en una sola transacción, con `WITH … RETURNING` para que los ids fluyan sin hardcodear:

| # | tabla | valores | igual a R8 |
|---|---|---|---|
| 1 | `caballerizas` | `club_id` Dolores · `nombre 'EL DON JORGE (LP)'` · `estado 'activo'` · `activo true` · `hipodromo_patente 'LP'` · `notas` con el porqué · `responsable` NULL · `WHERE NOT EXISTS` por nombre en el club | (R8 no creaba caballerizas, ya existían) |
| 2 | `propietarios` | `club_id` Dolores · `tipo 'persona'` · `nombre 'EL DON JORGE (LP)'` · `activo true` · `estado 'activo'` · **`notas 'provisorio R9 11/09'`** · documento NULL | ✅ misma forma; la marca cambia R8→R9 y la fecha, para que `LIKE 'provisorio R%'` los agarre a todos y `=` sólo a éste |
| 3 | `caballeriza_responsables` | `rol 'propietario'` · `activo true` · `nombre` = caballeriza · `apellido` NULL · `documento_tipo 'DNI'` · `documento_nro` NULL · `profesional_id` NULL · `propietario_id` = el del paso 2 | ✅ |

Por qué `propietario_id` va explícito y no lo deriva el trigger: `fn_caballeriza_resp_set_propietario` (BEFORE INSERT/UPDATE en `caballeriza_responsables`) sólo actúa **si `documento_nro IS NOT NULL`** — con documento NULL no busca ni crea nada. Exactamente como en R8.

Índice único `ux_propietarios_club_doc` es parcial `WHERE documento_nro IS NOT NULL` → un provisorio sin documento **no choca** con nada, y tampoco lo protege nada: por eso el `WHERE NOT EXISTS` por nombre en la caballeriza, y el chequeo 0.b antes.

---

## 3. El orden y la re-derivación — no aplica hoy, queda cubierto igual

Trigger real (`pg_get_functiondef`):

```sql
CREATE OR REPLACE FUNCTION public.fn_inscripcion_set_propietario() RETURNS trigger … AS $$
BEGIN
  IF NEW.caballeriza_id IS NOT NULL THEN
    SELECT cr.propietario_id INTO NEW.propietario_id FROM caballeriza_responsables cr
    WHERE cr.caballeriza_id=NEW.caballeriza_id AND cr.rol='propietario' AND cr.activo=true LIMIT 1;
  ELSE NEW.propietario_id := NULL; END IF;
  RETURN NEW;
END; $$
-- trg_insc_set_propietario BEFORE INSERT y BEFORE UPDATE en inscripciones (sin WHEN)
```

Tres consecuencias:

1. **Se dispara en INSERT y en cualquier UPDATE de la inscripción**, sin condición: cada vez que Yesi guarda la inscripción (asignar caballeriza, cambiar jockey, ratificar), `propietario_id` se recalcula desde la caballeriza. **No se dispara al insertar el responsable** — eso es lo que decís, y es correcto.
2. **Estado hoy**: la caballeriza no existe → **0 inscripciones** apuntan a ella. MARIA CATULENGA está inscripta en R9 T3 con `caballeriza_id NULL` (y `propietario_id` NULL por eso mismo); NIÑO OCEANICO no está inscripto. Cuando Yesi les ponga la caballeriza **después** de este alta, el UPDATE dispara el trigger, encuentra el responsable activo y deriva el provisorio. **No hace falta forzar nada.**
3. **Cobertura por si el orden se invierte**: si Yesi crea la caballeriza desde la UI antes de que corramos esto (o la asigna antes), el `WHERE NOT EXISTS` no inserta la caballeriza duplicada, pero las inscripciones que ya la tengan quedaron con `propietario_id NULL` (sin responsable no había nada que derivar). Para eso el §4 del SQL: `UPDATE inscripciones SET propietario_id = cr.propietario_id … WHERE i.caballeriza_id = <la nueva> AND i.propietario_id IS NULL` — misma forma que B6 del runbook de R8, acotado a esta caballeriza. **Esperado hoy: 0 filas.** Si da > 0, es que el orden se invirtió y el UPDATE lo arregla en la misma transacción.

Y la trampa que el runbook de R8 marcó en B5: el `LIMIT 1` **sin `ORDER BY`** del trigger. Si algún día esta caballeriza tiene dos responsables `rol='propietario' AND activo=true` (el provisorio + el titular real que alguien cargue después sin desactivar el provisorio), el titular derivado es **arbitrario**. El SQL verifica `titulares_activos = 1` antes del COMMIT; y cuando llegue el dato real del titular, el paso correcto es **editar el provisorio** (ponerle documento y nombre real), no agregar uno segundo. Eso es lo que Fede aprobó para los 40: se completa, no se duplica.

---

## 4. Rollback

Al pie del SQL, en orden FK inverso: `caballeriza_responsables` → `propietarios` (por `nombre` + `notas = 'provisorio R9 11/09'`) → `caballerizas`. Con tres chequeos previos (inscripciones que la usen, liquidaciones y recibos del propietario): si hay inscripciones, primero `UPDATE inscripciones SET caballeriza_id = NULL` (el trigger deja `propietario_id` en NULL solo); si hay liquidaciones o recibos, **no hay rollback** — es plata y se resuelve como los provisorios de R8 (completar, no borrar). Conteos de vuelta a 300 / 263 / 40 / (responsables de 0.c).

---

## 5. Ejecución propuesta (con tu OK)

1. Guards + 0.a / 0.b / 0.c → 0 filas / 0 filas / 300-263-40.
2. `apply_migration caballeriza_el_don_jorge_lp` con el bloque `BEGIN…COMMIT` (los tres INSERT encadenados + UPDATE defensivo). Verificación §5: 1 fila con `prop_notas = 'provisorio R9 11/09'`, `titulares_activos = 1`, conteos 301 / 264 / 41.
3. Avisar a Yesi: la caballeriza ya está, que la asigne en Inscripciones a MARIA CATULENGA (T3) y a NIÑO OCEANICO cuando lo anote. Query §6 del SQL el lunes: 0 con `propietario_id NULL`.
4. `CLAUDE.md`: el bloqueante "40 provisorios" pasa a 41 donde se mencione (hoy sólo dice "10/95", ya viejo — es parte de la fase 2 de docs).

Sin resolver, fuera de este plan: `LOS URONES` duplicada (informe anterior §5) y la falta de aviso de duplicados en `caballerizas.html` (candidato a ISSUE-080).

---

## 6. `migrations/caballeriza_el_don_jorge_lp.sql` — contenido completo

```sql
-- ============================================================
-- caballeriza_el_don_jorge_lp.sql — alta de la caballeriza "EL DON JORGE (LP)" con propietario provisorio
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Pedido de Yesi (11/09/2026): la planilla de R9 la trae como "DON JORGE" (T4 NIÑO OCEANICO,
-- T3 MARIA CATULENGA; cuidador TAVAGNUTTI RICARDO H). El nombre correcto es con "EL".
-- No hay datos del titular → propietario PROVISORIO, mismo criterio que Fede aprobó el
-- 15/08 para los 40 de R8 (docs/RUNBOOK_R8_PROVISORIOS.md §B4): el propietario nace con el
-- nombre de la caballeriza, tipo 'persona', sin documento, y una marca en `notas` para
-- encontrarlo después. Se completa cuando alguien viene a cobrar.
--
-- Verificado antes (2026-09-11, docs/diagnosticos/2026-09-11_caballeriza-el-don-jorge-lp.md
-- y …_plan-alta-el-don-jorge-lp.md):
--   · no existe ninguna caballeriza JORGE / DON JORGE / EL DON JORGE, con o sin (LP), en ningún club
--   · no existe propietario "EL DON JORGE"
--   · caballerizas.html manda club_id en el INSERT y filtra el listado por club — no hace falta fix
--   · 0 inscripciones apuntan a esta caballeriza (no existe) → la re-derivación defensiva del §4 da 0
--
-- Formato de los 40 de R8, medido en la base (replicado tal cual, sin inventar):
--   propietarios:             tipo='persona', nombre=<caballeriza>, documento_tipo NULL, documento_nro NULL,
--                             activo=true, estado='activo', club_id=Dolores, notas='provisorio R8 15/08'
--   caballeriza_responsables: rol='propietario', activo=true, nombre=<caballeriza>, apellido NULL,
--                             documento_tipo='DNI', documento_nro NULL, profesional_id NULL, propietario_id=<nuevo>
--   caballerizas.responsable: NULL en las 40 (el texto lo arma la UI al re-guardar)
-- La marca de notas acá es 'provisorio R9 11/09' — misma forma, otra reunión/fecha, para que
-- `notas LIKE 'provisorio R%'` los agarre a todos y `= 'provisorio R9 11/09'` sólo a éste.
--
-- Sufijo: en la base conviven 'GARIN CITY (LP)' (paréntesis en el nombre), 'JUVENTUD LP' /
-- 'LA ESCUELITA LP' (sin paréntesis) y 'TIAN Y ROMA' / 'BETTY SANTI' (hipodromo_patente='LP').
-- Yesi fijó el nombre: 'EL DON JORGE (LP)'. hipodromo_patente='LP' como en TIAN Y ROMA/BETTY SANTI.
--
-- Trigger fn_caballeriza_resp_set_propietario: sólo actúa si documento_nro IS NOT NULL → con NULL
-- no crea ni busca propietario, por eso propietario_id va explícito (igual que en R8).
-- Trigger fn_inscripcion_set_propietario: BEFORE INSERT/UPDATE en inscripciones, deriva
-- propietario_id de caballeriza_responsables(rol='propietario', activo) SIN condición → cualquier
-- inscripción que reciba esta caballeriza DESPUÉS de este alta sale derivada sola.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Pre-chequeos (fuera de la tx). Todos tienen que dar lo indicado o NO seguir.
-- ------------------------------------------------------------

-- 0.a  Caballeriza parecida (sin acentos, sin espacios/paréntesis, cualquier club): 0 filas.
SELECT id, nombre, club_id, hipodromo_patente FROM caballerizas
WHERE upper(regexp_replace(translate(nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) LIKE '%JORGE%';

-- 0.b  Propietario con ese nombre en Dolores: 0 filas.
SELECT id, nombre, notas FROM propietarios
WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND upper(btrim(nombre)) = 'EL DON JORGE (LP)';

-- 0.c  Conteos base (para el rollback y la verificación): anotar.
SELECT (SELECT count(*) FROM caballerizas) AS caballerizas,
       (SELECT count(*) FROM propietarios) AS propietarios,
       (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R%') AS provisorios,
       (SELECT count(*) FROM caballeriza_responsables) AS responsables;
-- Medido el 11/09 noche: caballerizas 300 · propietarios 263 · provisorios 40 · responsables (anotar al ejecutar).

BEGIN;

-- ------------------------------------------------------------
-- 1. Caballeriza
-- ------------------------------------------------------------
-- Mismas columnas que manda caballerizas.html (línea 620): club_id, nombre, estado, activo,
-- hipodromo_patente; telefono/notas/chaquetilla NULL. `responsable` NULL como en R8.
WITH cab AS (
  INSERT INTO caballerizas (club_id, nombre, estado, activo, hipodromo_patente, notas)
  SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c', 'EL DON JORGE (LP)', 'activo', true, 'LP',
         'Alta 11/09/2026 (planilla R9 dice DON JORGE). Titular sin datos: propietario provisorio.'
  WHERE NOT EXISTS (
    SELECT 1 FROM caballerizas
    WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
      AND upper(btrim(nombre)) = 'EL DON JORGE (LP)'
  )
  RETURNING id, club_id, nombre
),
-- ------------------------------------------------------------
-- 2. Propietario provisorio (forma de R8)
-- ------------------------------------------------------------
prop AS (
  INSERT INTO propietarios (club_id, tipo, nombre, activo, estado, notas)
  SELECT cab.club_id, 'persona', cab.nombre, true, 'activo', 'provisorio R9 11/09'
  FROM cab
  RETURNING id, club_id, nombre
)
-- ------------------------------------------------------------
-- 3. Vínculo (forma de R8: rol propietario, activo, nombre=caballeriza, documento_tipo 'DNI', sin nro)
-- ------------------------------------------------------------
INSERT INTO caballeriza_responsables (caballeriza_id, propietario_id, rol, activo, nombre, documento_tipo)
SELECT cab.id, prop.id, 'propietario', true, cab.nombre, 'DNI'
FROM cab JOIN prop ON prop.club_id = cab.club_id AND prop.nombre = cab.nombre;

-- ------------------------------------------------------------
-- 4. Re-derivación defensiva de propietario_id (esperado: 0 filas)
-- ------------------------------------------------------------
-- Sólo tendría efecto si ya existieran inscripciones apuntando a esta caballeriza con
-- propietario_id NULL. Hoy no puede haber ninguna (la caballeriza no existía). Queda por si
-- el alta se ejecuta DESPUÉS de que Yesi la haya creado y asignado a mano — en ese caso el
-- WHERE NOT EXISTS del §1 no inserta y este UPDATE cubre a las inscripciones huérfanas.
UPDATE inscripciones i
SET propietario_id = cr.propietario_id
FROM caballerizas c
JOIN caballeriza_responsables cr ON cr.caballeriza_id = c.id AND cr.rol = 'propietario' AND cr.activo = true
WHERE c.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND upper(btrim(c.nombre)) = 'EL DON JORGE (LP)'
  AND i.caballeriza_id = c.id
  AND i.propietario_id IS NULL;

-- ------------------------------------------------------------
-- 5. Verificación ANTES del COMMIT
-- ------------------------------------------------------------
-- 1 fila: la caballeriza, con su propietario provisorio y el vínculo.
SELECT c.id AS cab_id, c.nombre, c.club_id, c.hipodromo_patente, c.estado, c.activo, c.responsable,
       p.id AS prop_id, p.nombre AS prop_nombre, p.tipo, p.documento_nro, p.notas AS prop_notas,
       cr.rol, cr.activo AS resp_activo, cr.documento_tipo, cr.profesional_id
FROM caballerizas c
JOIN caballeriza_responsables cr ON cr.caballeriza_id = c.id
JOIN propietarios p ON p.id = cr.propietario_id
WHERE c.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND upper(btrim(c.nombre)) = 'EL DON JORGE (LP)';

-- Exactamente 1 propietario activo para la caballeriza (si hay 2, el LIMIT 1 del trigger elige al azar).
SELECT count(*) AS titulares_activos
FROM caballeriza_responsables cr JOIN caballerizas c ON c.id = cr.caballeriza_id
WHERE upper(btrim(c.nombre)) = 'EL DON JORGE (LP)' AND cr.rol = 'propietario' AND cr.activo = true;

-- Conteos: caballerizas +1, propietarios +1, provisorios 41, responsables +1.
SELECT (SELECT count(*) FROM caballerizas) AS caballerizas,
       (SELECT count(*) FROM propietarios) AS propietarios,
       (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R%') AS provisorios,
       (SELECT count(*) FROM caballeriza_responsables) AS responsables;

COMMIT;

-- ------------------------------------------------------------
-- 6. Después (el lunes, cuando Yesi haya asignado la caballeriza en Inscripciones)
-- ------------------------------------------------------------
-- Las inscripciones de R9 con esta caballeriza tienen que salir con propietario_id = el provisorio.
-- 0 filas con propietario_id NULL.
SELECT s.nombre AS spc, ca.numero_turno, i.estado, i.propietario_id
FROM inscripciones i
JOIN carreras ca ON ca.id = i.carrera_id
JOIN spcs s ON s.id = i.spc_id
JOIN caballerizas c ON c.id = i.caballeriza_id
WHERE ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
  AND upper(btrim(c.nombre)) = 'EL DON JORGE (LP)';

-- ============================================================
-- ROLLBACK (en este orden, por FK: responsables → propietario → caballeriza)
-- ============================================================
-- Seguro sólo mientras ninguna inscripción apunte a la caballeriza ni ninguna liquidación /
-- recibo al propietario. Chequear antes:
--   SELECT count(*) FROM inscripciones WHERE caballeriza_id IN (SELECT id FROM caballerizas WHERE upper(btrim(nombre))='EL DON JORGE (LP)');
--   SELECT count(*) FROM liquidaciones WHERE propietario_id IN (SELECT id FROM propietarios WHERE nombre='EL DON JORGE (LP)' AND notas='provisorio R9 11/09');
--   SELECT count(*) FROM recibos WHERE propietario_id IN (SELECT id FROM propietarios WHERE nombre='EL DON JORGE (LP)' AND notas='provisorio R9 11/09');
-- Si las inscripciones ya la usan: primero UPDATE inscripciones SET caballeriza_id=NULL (el trigger pone propietario_id NULL solo).
--
-- BEGIN;
-- DELETE FROM caballeriza_responsables
--  WHERE caballeriza_id IN (SELECT id FROM caballerizas WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND upper(btrim(nombre))='EL DON JORGE (LP)');
-- DELETE FROM propietarios
--  WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND nombre='EL DON JORGE (LP)' AND notas='provisorio R9 11/09';
-- DELETE FROM caballerizas
--  WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND upper(btrim(nombre))='EL DON JORGE (LP)';
-- -- conteos vuelven a los de 0.c
-- COMMIT;
```

---

## 7. Queries de respaldo (corridas hoy, solo lectura)

```sql
-- forma de los 40 de R8
select 'prov_shape' k, (select jsonb_agg(x) from (select tipo, documento_tipo, (documento_nro is null) as doc_null, club_id, estado, activo, notas, count(*) n from propietarios where notas ilike '%provisorio%' group by 1,2,3,4,5,6,7) x) v
union all select 'resp_shape', (select jsonb_agg(x) from (select rol, activo, (profesional_id is null) prof_null, (apellido is null) apellido_null, (nombre is null) nombre_null, (documento_nro is null) doc_null, porcentaje, count(*) n from caballeriza_responsables where propietario_id in (select id from propietarios where notas ilike '%provisorio%') group by 1,2,3,4,5,6,7) x)
```
```json
[{"k":"prov_shape","v":[{"n":40,"tipo":"persona","notas":"provisorio R8 15/08","activo":true,"estado":"activo","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","doc_null":true,"documento_tipo":null}]},
 {"k":"resp_shape","v":[{"n":40,"rol":"propietario","activo":true,"doc_null":true,"prof_null":true,"porcentaje":null,"nombre_null":false,"apellido_null":true}]}]
```
```sql
select 'r8_cabs_responsable_txt' k, (select jsonb_build_object('null',count(*) filter (where cb.responsable is null),'con_texto',count(*) filter (where cb.responsable is not null)) from caballerizas cb where cb.id in (select caballeriza_id from caballeriza_responsables where propietario_id in (select id from propietarios where notas='provisorio R8 15/08'))) v
union all select 'uniq_prop', (select jsonb_agg(indexdef) from pg_indexes where tablename='propietarios')
```
```json
[{"k":"r8_cabs_responsable_txt","v":{"null":40,"con_texto":0}},
 {"k":"uniq_prop","v":["CREATE UNIQUE INDEX propietarios_pkey ON public.propietarios USING btree (id)","CREATE INDEX idx_propietarios_club ON public.propietarios USING btree (club_id)","CREATE UNIQUE INDEX ux_propietarios_club_doc ON public.propietarios USING btree (club_id, documento_tipo, documento_nro) WHERE (documento_nro IS NOT NULL)"]}]
```
```sql
-- triggers sobre inscripciones / caballeriza_responsables / caballerizas
select string_agg(trigger_name||' '||action_timing||' '||event_manipulation||' -> '||action_statement, E'\n') from information_schema.triggers where trigger_schema='public' and event_object_table in ('inscripciones','caballeriza_responsables','caballerizas')
```
```
trg_cab_resp_set_propietario BEFORE INSERT -> EXECUTE FUNCTION fn_caballeriza_resp_set_propietario()
trg_cab_resp_set_propietario BEFORE UPDATE -> EXECUTE FUNCTION fn_caballeriza_resp_set_propietario()
trg_audit_inscripciones AFTER INSERT/DELETE/UPDATE -> fn_auditoria_log()
trg_insc_set_propietario BEFORE INSERT -> EXECUTE FUNCTION fn_inscripcion_set_propietario()
trg_insc_set_propietario BEFORE UPDATE -> EXECUTE FUNCTION fn_inscripcion_set_propietario()
trg_inscripciones_updated_at BEFORE UPDATE -> set_updated_at()
(caballerizas: ninguno)
```
```sql
select pg_get_functiondef('fn_caballeriza_resp_set_propietario()'::regprocedure)
```
```sql
CREATE OR REPLACE FUNCTION public.fn_caballeriza_resp_set_propietario() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_club uuid; v_tipo text; v_dt text;
BEGIN
  IF NEW.rol='propietario' AND NEW.documento_nro IS NOT NULL THEN
    SELECT c.club_id INTO v_club FROM caballerizas c WHERE c.id=NEW.caballeriza_id;
    IF v_club IS NULL THEN RAISE EXCEPTION 'Caballeriza % sin club_id', NEW.caballeriza_id; END IF;
    v_dt := COALESCE(NEW.documento_tipo,'DNI');
    v_tipo := CASE WHEN v_dt='CUIT' THEN 'sociedad' ELSE 'persona' END;
    SELECT p.id INTO NEW.propietario_id FROM propietarios p
    WHERE p.club_id=v_club AND p.documento_tipo=v_dt AND p.documento_nro=NEW.documento_nro LIMIT 1;
    IF NEW.propietario_id IS NULL THEN
      INSERT INTO propietarios (club_id, tipo, nombre, documento_tipo, documento_nro, localidad, activo, estado)
      VALUES (v_club, v_tipo, NULLIF(trim(concat_ws(', ', NEW.apellido, NEW.nombre)),''), v_dt, NEW.documento_nro, NEW.localidad, true, 'activo')
      RETURNING id INTO NEW.propietario_id;
    END IF;
  END IF;
  RETURN NEW;
END; $function$
```

---

## 8. Verificación de push

```
$ git ls-remote origin feat/caballeriza-el-don-jorge-lp
dfcd136d0bab7db99afaf8f92e91de7ff1b86869	refs/heads/feat/caballeriza-el-don-jorge-lp
$ git push origin reports
$ git ls-remote origin reports
7c877420eb5ec1f2664b40f8b2a4d6d02e0f20e2	refs/heads/reports
$ git rev-parse HEAD
7c877420eb5ec1f2664b40f8b2a4d6d02e0f20e2
```
