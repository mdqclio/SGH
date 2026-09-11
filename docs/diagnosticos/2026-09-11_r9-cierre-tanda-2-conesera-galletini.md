# R9 — cierre: tanda 2 (SQL propuesto), Conesera (EJECUTADO), GALLETINI (diagnóstico)

**Fecha:** 2026-09-11 (noche) · **`main`:** `ce5dd3c` · **Branch de trabajo:** `fix/spcs-r9-tanda-2` @ `c392f6c` (pusheada, sin mergear)
**Escrituras en DB:** una — `apply_migration spcs_conesera_sexo` (1 fila). Todo lo demás, solo lectura.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` antes / después | 199 / 199 (Conesera es UPDATE, la tanda 2 no se ejecutó) | ✅ 199 / 199 |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| prod = main | `profesionales.html`, `profesionales-duplicados.js` | ✅ md5 iguales (§3) |

---

## 1. Tanda 2 — QUE BELLA DOÑA e INDIANA MARO: encontrados, SQL listo, NO ejecutado

```bash
node tools/studbook_scrape_tanda.mjs scratchpad/r9_tanda_2_scrape.json scratchpad/r9_nombres_t2.txt r9-2 199
```
```
{
  "fuente": "www.studbook.org.ar",
  "endpoint": "/ejemplares/autocomplete?tipo=1&muerto=1&term=",
  "tanda": "r9-2",
  "escribe_en_db": false,
  "nombres_pedidos": 2,
  "altas_propuestas": 2,
  "casos_no_resueltos": 0,
  "snapshot_spcs": 199
}
OK   QUE BELLA DOÑA -> QUE BELLA DOÑA sb=446458 2023-10-08 hembra Zaino | Sea Dog / Paradise Nistel 
OK   INDIANA MARO -> INDIANA MARO sb=432433 2021-09-15 hembra Alazan | Gokstad / Ilusionada Chica 
```

Sondeo por prefijo (para ver que no hay homónimos cerca):

```

=== QUE BELLA — 5 hits
  205087	QUE BELLA	15/10/1996	Hembra	Zaino	Peace Negotiations (USA) / Morey	raza=4	icon=/img/banderas/10.png
  446458	QUE BELLA DOÑA	08/10/2023	Hembra	Zaino	Sea Dog / Paradise Nistel	raza=4	icon=/img/banderas/10.png
  294758	QUE BELLA IDEA	23/11/2008	Hembra	Zaino	Manu Chao / By Lady	raza=4	icon=/img/banderas/10.png
  307451	QUE BELLA NOCHE	21/08/2010	Hembra	Alazan	Giant's Causeway (USA) / Queen Tango	raza=4	icon=/img/banderas/10.png
  362392	QUE BELLA TOWN	09/10/2016	Hembra	Zaino	Town Partner / Que Bella Idea	raza=4	icon=/img/banderas/10.png

=== INDIANA MAR — 2 hits
  432433	INDIANA MARO	15/09/2021	Hembra	Alazan	Gokstad / Ilusionada Chica	raza=4	icon=/img/banderas/10.png
  462553	INDIANA MARS	27/08/2026	Hembra	Zaino	Marsalis (USA) / Indiana Catcher	raza=4	icon=/img/banderas/10.png
```

| planilla (typo) | Stud Book | sb | nac. | edad 20/09 | sexo | color | padre × madre | turno | ✓ |
|---|---|---|---|---|---|---|---|---|---|
| BELLA DOÑA | **QUE BELLA DOÑA** | 446458 | 2023-10-08 | 3 | **hembra** | Zaino | Sea Dog × Paradise Nistel | T1 (3 años) | ✅ |
| INDIA MARO | **INDIANA MARO** | 432433 | 2021-09-15 | 5 | **hembra** | Alazan | Gokstad × Ilusionada Chica | T10 (yeguas 5+) | ✅ |

Match exacto y único los dos, 0 alertas (raza 4, bandera argentina). El BELLA DOÑA macho de 2017 (sb 403664) de la tanda 1 era otro caballo — descartado.

Chequeo de duplicados contra las 199 (misma batería que la tanda 1, más un substring):

```sql
select 'a' chk, count(*)::text r from spcs
union all select 'b', coalesce(string_agg(nombre||' '||studbook_id,'; '),'0 filas') from spcs where studbook_id in ('446458','432433')
union all select 'c', coalesce(string_agg(nombre,'; '),'0 filas') from spcs where upper(regexp_replace(translate(nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) in ('QUEBELLADONA','INDIANAMARO')
union all select 'd', coalesce(string_agg(s.nombre,'; '),'0 filas') from spcs s join (values ('2023-10-08'::date,'Sea Dog','Paradise Nistel'),('2021-09-15','Gokstad','Ilusionada Chica')) v(fn,padre,madre) on s.fecha_nacimiento=v.fn and upper(s.padrillo_nombre)=upper(v.padre) and upper(s.madre_nombre)=upper(v.madre)
union all select 'e_parecidos', coalesce(string_agg(nombre||' ('||fecha_nacimiento||' '||sexo||')','; '),'0 filas') from spcs where nombre ilike '%BELLA%' or nombre ilike '%MARO%' or nombre ilike '%INDIA%'
```
```json
[{"chk":"a","r":"199"},{"chk":"b","r":"0 filas"},{"chk":"c","r":"0 filas"},{"chk":"d","r":"0 filas"},{"chk":"e_parecidos","r":"IDALIA MARO (2021-10-15 hembra)"}]
```

199 / 0 / 0 / 0. El único vecino es IDALIA MARO (Engelhard × Itzel Chica, 15/10/2021) — otra yegua, distinta madre y fecha.

Archivos en `fix/spcs-r9-tanda-2`: `migrations/spcs_r9_tanda_2.sql`, `data/spcs_r9_tanda_2_scrape.json`, `data/spcs_r9_tanda_2_nombres.txt`. Mismo criterio que la tanda 1: `registro_stud_book` NULL, `studbook_id` en columna, `notas` con SB + url + `Planilla R9: <variante>`. **Esperado al ejecutar: 199 → 201.**

`migrations/spcs_r9_tanda_2.sql` completo:

```sql
-- ============================================================
-- spcs_r9_tanda_2.sql — altas de SPCs de R9, tanda 2 (los dos typos de la planilla)
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Yesi confirmó el 11/09 que la planilla tenía dos errores de tipeo:
--   BELLA DOÑA  -> QUE BELLA DOÑA  (T1, 3 años perdedores)
--   INDIA MARO  -> INDIANA MARO    (T10, yeguas 5 años y +)
-- Con los nombres corregidos el Stud Book devuelve match EXACTO y ÚNICO para
-- los dos (0 homónimos), y edad y sexo cierran con el turno:
--   QUE BELLA DOÑA  2023-10-08 hembra -> 3 años  ✔ T1
--   INDIANA MARO    2021-09-15 hembra -> 5 años  ✔ T10 (yeguas, min 5)
-- El "BELLA DOÑA" macho de 2017 (sb 403664) que apareció en la tanda 1 era
-- otro caballo. Descartado.
--
-- Origen: www.studbook.org.ar, /ejemplares/autocomplete?tipo=1&muerto=1&term=
-- Evidencia: data/spcs_r9_tanda_2_scrape.json · Script: tools/studbook_scrape_tanda.mjs
-- Snapshot spcs usado: 199 filas.
--
-- Mismo criterio que la tanda 1 (migrations/spcs_r9_tanda_1.sql):
--   registro_stud_book NULL · studbook_id en columna · notas = 'SB <id> · <url>
--   · alta R9 tanda 2 11/09/2026 · Planilla R9: <variante>' · club_id NULL ·
--   caballeriza/entrenador/jockey NULL (los asigna Yesi al inscribir).
-- Idempotente: cada INSERT se saltea si el studbook_id ya está.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Chequeo de duplicados ANTES de insertar (corrido el 11/09 contra las 199: 199 / 0 / 0 / 0)
-- ------------------------------------------------------------

-- 0.a  Baseline: tiene que dar 199.
SELECT count(*) AS spcs_total_antes FROM spcs;

-- 0.b  Por studbook_id: 0 filas.
SELECT nombre, studbook_id FROM spcs WHERE studbook_id IN ('446458', '432433');

-- 0.c  Por nombre normalizado: 0 filas.
SELECT nombre, studbook_id, fecha_nacimiento FROM spcs
WHERE upper(regexp_replace(translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g'))
   IN ('QUEBELLADONA', 'INDIANAMARO');

-- 0.d  Por fecha + padre + madre: 0 filas.
SELECT s.nombre, s.studbook_id, s.fecha_nacimiento, s.padrillo_nombre, s.madre_nombre
FROM spcs s
JOIN (VALUES
  ('2023-10-08'::date, 'Sea Dog', 'Paradise Nistel'),
  ('2021-09-15'::date, 'Gokstad', 'Ilusionada Chica')
) v(fn, padre, madre)
  ON s.fecha_nacimiento = v.fn
 AND upper(s.padrillo_nombre) = upper(v.padre)
 AND upper(s.madre_nombre)    = upper(v.madre);

-- 0.e  Parecidos por substring (BELLA / MARO / INDIA): la única fila es IDALIA MARO
--      (2021-10-15, Engelhard × Itzel Chica) — otra yegua del mismo criador, no es ésta.

BEGIN;

-- ------------------------------------------------------------
-- 1. Altas (2)
-- ------------------------------------------------------------

-- QUE BELLA DOÑA  [T1]  (planilla: BELLA DOÑA)
--   https://www.studbook.org.ar/ejemplares/perfil/446458/que-bella-dona
--   (2023 H SP) · tomo 1257 folio 587 · abuelo materno: Van Nistelrooy (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'QUE BELLA DOÑA', '2023-10-08'::date, 'hembra'::sexo_spc, 'Zaino',
       'Sea Dog', 'Paradise Nistel', 'Argentina', '446458', 'activo'::estado_spc,
       'SB 446458 · https://www.studbook.org.ar/ejemplares/perfil/446458/que-bella-dona · alta R9 tanda 2 11/09/2026 · Planilla R9: BELLA DOÑA.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '446458');

-- INDIANA MARO  [T10]  (planilla: INDIA MARO)
--   https://www.studbook.org.ar/ejemplares/perfil/432433/indiana-maro
--   (2021 H SP) · tomo 1243 folio 758 · abuelo materno: Iberique
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'INDIANA MARO', '2021-09-15'::date, 'hembra'::sexo_spc, 'Alazan',
       'Gokstad', 'Ilusionada Chica', 'Argentina', '432433', 'activo'::estado_spc,
       'SB 432433 · https://www.studbook.org.ar/ejemplares/perfil/432433/indiana-maro · alta R9 tanda 2 11/09/2026 · Planilla R9: INDIA MARO.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '432433');

-- ------------------------------------------------------------
-- 2. Verificación ANTES del COMMIT
-- ------------------------------------------------------------

-- Debe dar 201 (199 + 2).
SELECT count(*) AS spcs_total FROM spcs;

-- 2 filas, las dos hembra, registro_stud_book y FKs en NULL.
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre,
       pais_origen, studbook_id, estado, registro_stud_book,
       club_id, caballeriza_id, entrenador_id, jockey_habitual_id, notas
FROM spcs WHERE studbook_id IN ('446458', '432433') ORDER BY nombre;

-- 0 filas.
SELECT studbook_id, count(*) FROM spcs WHERE studbook_id IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DELETE FROM spcs WHERE studbook_id IN ('446458', '432433');
-- (Seguro sólo mientras no tengan inscripciones. GOTCHA #12.)
-- Después: SELECT count(*) FROM spcs -> 199.
```

---

## 2. Conesera — EJECUTADO

Confirmación de Yesi: "hembra del 2023". Coincide con sb 444373 (20/09/2023, Emmanuel × Milonga Burrera, Hembra, Alazan).

Antes:
```json
{"id":"1f645327-a6da-449b-8a62-fdb577a8658e","sexo":"macho","color":null,"notas":null,"estado":"activo","nombre":"Conesera","club_id":null,"updated_at":"2026-08-06T14:58:51.873309+00:00","pais_origen":"Argentina","studbook_id":null,"madre_nombre":"Milonga Burrera","entrenador_id":"62423e35-81cb-43f2-a572-59bba7226c37","caballeriza_id":"7f7cee40-beed-42fb-807a-70c900259be5","padrillo_nombre":"Emmanuel","fecha_nacimiento":"2023-09-20","certificado_correr":false,"registro_stud_book":null}
```
`studbook_id 444373` libre: 0 filas. `count(spcs)` = 199.

Aplicado por `apply_migration` (nombre `spcs_conesera_sexo`), el UPDATE de `migrations/spcs_conesera_sexo.sql` envuelto en un `DO` que aborta si `ROW_COUNT <> 1` o si `444373` no queda en exactamente 1 fila:

```sql
DO $$
DECLARE n int;
BEGIN
  UPDATE spcs
  SET sexo        = 'hembra'::sexo_spc,
      nombre      = 'CONESERA',
      color       = COALESCE(color, 'Alazan'),
      studbook_id = '444373',
      notas       = concat_ws(' · ', NULLIF(notas, ''),
                      'SB 444373 · https://www.studbook.org.ar/ejemplares/perfil/444373/conesera',
                      'sexo corregido macho->hembra segun Stud Book, confirmado por Yesi 11/09/2026 (planilla R9: CONESERSA)')
  WHERE id = '1f645327-a6da-449b-8a62-fdb577a8658e'
    AND sexo = 'macho'
    AND fecha_nacimiento = '2023-09-20'
    AND studbook_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Conesera: % filas afectadas, esperaba 1 -> rollback', n; END IF;
  SELECT count(*) INTO n FROM spcs WHERE studbook_id = '444373';
  IF n <> 1 THEN RAISE EXCEPTION 'studbook_id 444373 en % filas -> rollback', n; END IF;
END $$;
```
```json
{"success":true}
```

Después:
```json
{"id":"1f645327-a6da-449b-8a62-fdb577a8658e","sexo":"hembra","color":"Alazan","notas":"SB 444373 · https://www.studbook.org.ar/ejemplares/perfil/444373/conesera · sexo corregido macho->hembra segun Stud Book, confirmado por Yesi 11/09/2026 (planilla R9: CONESERSA)","estado":"activo","nombre":"CONESERA","club_id":null,"updated_at":"2026-09-11T19:53:51.067605+00:00","pais_origen":"Argentina","studbook_id":"444373","madre_nombre":"Milonga Burrera","entrenador_id":"62423e35-81cb-43f2-a572-59bba7226c37","caballeriza_id":"7f7cee40-beed-42fb-807a-70c900259be5","padrillo_nombre":"Emmanuel","fecha_nacimiento":"2023-09-20","certificado_correr":false,"registro_stud_book":null}
{"spcs":199,"sb_dup":0}
```

Sexo, nombre, `studbook_id` y `color` cargados; `registro_stud_book` sigue NULL (criterio); caballeriza y entrenador intactos; count 199; sin `studbook_id` repetido. El archivo `migrations/spcs_conesera_sexo.sql` quedó marcado **EJECUTADA** en la rama `fix/spcs-r9-tanda-2` (`c392f6c`).

**Colateral visto en la verificación**: T1 de R9 ya tiene **6 inscriptos** (a las 14:xx tenía 2): ETERNA DOCTORA, DOCTORA APASIONADA, DESERT OF DUBAI, HERMANOSDEMIPATRIA, SI TIN, CONESERA. Yesi está anotando con los 18 del alta. CONESERA aparece ahí como hembra ✅.

```json
[{"spc":"ETERNA DOCTORA","sexo":"hembra","estado":"inscripto"},{"spc":"DOCTORA APASIONADA","sexo":"hembra","estado":"inscripto"},{"spc":"DESERT OF DUBAI","sexo":"macho","estado":"inscripto"},{"spc":"HERMANOSDEMIPATRIA","sexo":"macho","estado":"inscripto"},{"spc":"SI TIN","sexo":"macho","estado":"inscripto"},{"spc":"CONESERA","sexo":"hembra","estado":"inscripto"}]
```

---

## 3. GALLETINI EZEQUIEL — no existe, nada lo frena del lado del servidor

```sql
select 'apellido_like' k, coalesce(jsonb_agg(jsonb_build_object('id',id,'apellido',apellido,'nombre',nombre,'tipo',tipo,'doc',documento_nro,'club',club_id,'patente_hip',hipodromo_patente,'estado',estado,'activo',activo,'created',created_at::date)), '[]') v from profesionales where apellido ilike '%GALLET%' or nombre ilike '%GALLET%' or apellido ilike '%GALET%' or nombre ilike '%GALET%'
union all select 'ezequiel', coalesce(jsonb_agg(jsonb_build_object('id',id,'apellido',apellido,'nombre',nombre,'tipo',tipo,'doc',documento_nro,'club',club_id,'estado',estado)), '[]') from profesionales where nombre ilike '%EZEQUIEL%' or apellido ilike '%EZEQUIEL%'
union all select 'solicitudes', coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'apellido',apellido,'rol',rol_pedido,'estado',estado,'doc',documento_nro,'created',created_at::date)), '[]') from solicitudes_acceso where apellido ilike '%GALLET%' or nombre ilike '%GALLET%' or nombre ilike '%EZEQUIEL%'
union all select 'caballerizas', coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre)), '[]') from caballerizas where nombre ilike '%GALLET%'
union all select 'propietarios', coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'doc',documento_nro)), '[]') from propietarios where nombre ilike '%GALLET%' or nombre ilike '%EZEQUIEL%'
union all select 'audit_prof_hoy', coalesce(jsonb_agg(jsonb_build_object('ar', to_char(a.created_at at time zone 'America/Argentina/Buenos_Aires','HH24:MI:SS'),'accion',a.accion,'tabla',a.tabla,'ref', coalesce(a.datos_despues->>'apellido', a.datos_antes->>'apellido'))), '[]') from auditoria a where a.tabla in ('profesionales','solicitudes_acceso') and a.created_at > '2026-09-11 00:00:00+00'
union all select 'trigger_prof', to_jsonb(coalesce(string_agg(trigger_name||'/'||event_manipulation, ', '), 'ninguno')) from information_schema.triggers where trigger_schema='public' and event_object_table='profesionales'
union all select 'prof_creados_hoy', coalesce(jsonb_agg(jsonb_build_object('apellido',apellido,'nombre',nombre,'tipo',tipo,'created', to_char(created_at at time zone 'America/Argentina/Buenos_Aires','HH24:MI'))), '[]') from profesionales where created_at > '2026-09-11 00:00:00+00'
union all select 'prof_count', to_jsonb((select count(*) from profesionales))
```
```json
[{"k":"apellido_like","v":[]},
 {"k":"ezequiel","v":[{"id":"6361df8c-179c-4e1b-9846-b589a46a0a2d","doc":"45844119","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","tipo":"entrenador","estado":"activo","nombre":"MAURICIO EZEQUIEL","apellido":"ACHINGO"},{"id":"a94f1572-bf4e-43a6-91b2-59d145531b7e","doc":"27776972","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","tipo":"entrenador","estado":"activo","nombre":"MARCOS EZEQUIEL","apellido":"GIMENEZ"},{"id":"9b563dc7-0402-4e17-a7f1-5eec1c497a6c","doc":"40578047","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","tipo":"entrenador","estado":"activo","nombre":"HECTOR EZEQUIEL","apellido":"ORTIZ"},{"id":"0b2c6b27-3343-4e7f-b4f7-c0674e225466","doc":"38284072","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","tipo":"jockey","estado":"activo","nombre":"MATIAS EZEQUIEL","apellido":"ACUÑA"}]},
 {"k":"solicitudes","v":[]},
 {"k":"caballerizas","v":[]},
 {"k":"propietarios","v":[{"id":"56ddfd4e-b5ee-4f5d-a7ea-d6f1ca6c64b3","doc":"25041080","nombre":"GALLETTINI, GUSTAVO JAVIER"},{"id":"5e9f7628-5920-4b51-810d-204fc00989e3","doc":"28986305","nombre":"DI SALVATORE, MARIO EZEQUIEL"},{"id":"d2c21233-41c8-4745-9e44-9ffba0d8a685","doc":"31524289","nombre":"NIELD LUCERO, LUCIANO EZEQUIEL"},{"id":"24d724b0-8fb2-4d9e-be05-18cfcd9504a9","doc":"34099472","nombre":"LORA, EZEQUIEL GASTON"}]},
 {"k":"audit_prof_hoy","v":[]},
 {"k":"trigger_prof","v":"trg_profesionales_updated_at/UPDATE"},
 {"k":"prof_creados_hoy","v":[]},
 {"k":"prof_count","v":190}]
```

### Lectura

| pregunta | respuesta |
|---|---|
| ¿Existe en `profesionales`? | **No.** `ilike '%GALLET%'` y `'%GALET%'` sobre apellido y nombre: **0 filas**. Ningún GALLETINI, GALLETTINI ni GALETINI, de ningún tipo, en ningún club. |
| ¿Hay un EZEQUIEL que matchee? | 4, todos con **otro apellido** (ACHINGO, GIMENEZ, ORTIZ entrenadores; ACUÑA jockey). El aviso de duplicados busca por **apellido** (`ilike` sobre `apellido`, `profesionales-duplicados.js:80-84`), no por nombre → ninguno de estos 4 le aparecería. |
| ¿Le estaría saltando el aviso? | **No puede.** El aviso consulta sólo `profesionales` del club por (a) mismo DNI, (b) apellido `ilike`. (a): no sabemos el DNI que tipeó — **sin verificar** — pero aunque coincidiera con alguien, (b) da 0 y el aviso **no bloquea el alta** por diseño (comentario en el header del helper: "NO BLOQUEA, y es a propósito"). Es un panel informativo con botón Guardar disponible. |
| ¿Hay un pariente en otra tabla? | **Sí, en `propietarios`**: `GALLETTINI, GUSTAVO JAVIER` (doble T, DNI 25041080). Es otra persona (Gustavo, no Ezequiel) y otra tabla; el aviso no mira `propietarios`. No interfiere. Anotado por si el apellido correcto es con doble T. |
| ¿Se intentó y falló en la base? | **No hay rastro de intento.** `profesionales` no tiene trigger de auditoría (sólo `trg_profesionales_updated_at`), pero: 0 filas creadas hoy (`created_at`), count 190 (igual que esta mañana), 0 filas de auditoría de `solicitudes_acceso`. Un INSERT rechazado por RLS no deja fila, así que "no hay fila" no descarta un rechazo — por eso lo siguiente. |
| ¿La RLS la deja insertar? | **Sí.** `profesionales_insert` = `WITH CHECK (fn_is_staff())`, y `fn_is_staff()` = usuario activo con `auth_user_id = auth.uid()` y rol en `('super_admin','secretario_carreras','operador')`. Yesi: `rol=operador`, `activo=true`, `auth_user_id` cargado, `club_id` Dolores. (`ultimo_login` NULL — la columna no se actualiza; sin importancia.) |
| ¿Prod sirve el fix de la mañana? | **Sí.** `md5(profesionales.html)` local `e2057bd73a4d` = prod `e2057bd73a4d`; `profesionales-duplicados.js` `dfa880021c57` = `dfa880021c57`. El botón `#btn-nuevo` (`profesionales.html:143`) no tiene gate de rol en `main`. |
| ¿Hay otro camino de alta? | **No.** `grep -i "nuevo entrenador\|crear entrenador"` en inscripciones/ratificacion/portal/solicitudes/index: sólo el link de `solicitudes.html:325` que manda a `profesionales.html`. El selector de entrenador de `inscripciones.html` no da de alta. |

### Conclusión

Del lado del servidor y del código en prod **no hay nada que impida** crear a GALLETINI EZEQUIEL: no existe, la RLS deja, el aviso no bloquea, el botón está. Las causas que quedan son del lado del navegador de Yesi, y no las puedo verificar desde acá (**sin verificar**, por orden de probabilidad):

1. **Caché del navegador**: `profesionales.html` cambió hoy a las ~10 AM (merge `c540aa0`). Si su pestaña de Entrenadores quedó abierta desde antes, o el navegador sirvió la copia vieja, **el botón "+ Nuevo Entrenador" sigue oculto** (la versión anterior lo escondía por JS para todo rol ≠ super_admin, `profesionales.html:268-270` viejo). Es exactamente el síntoma "no puedo cargar entrenadores". Prueba: `Ctrl+Shift+R` en `sigh.com.ar/profesionales.html`, o abrir `sigh.com.ar/profesionales.html?v=2`.
2. **Un error de validación del formulario que no llegó como reporte**: el `guardar()` muestra `toast(error.message)` si el INSERT falla (p.ej. `tipo` inválido, email mal formado). Sin el texto del toast no se puede decir más.
3. **Está buscándolo en el selector de entrenador de Inscripciones** (no lo encuentra porque no existe) y lee eso como "no puedo cargarlo" — en cuyo caso el camino es Entrenadores → + Nuevo Entrenador → después volver a inscribir.

Lo que le pediría a Yesi para cerrar: (a) que haga `Ctrl+Shift+R` en Entrenadores y diga si ve el botón "+ Nuevo Entrenador"; (b) si lo ve y falla al guardar, el texto exacto del mensaje rojo; (c) el DNI de Galletini, para descartar el caso (a) del aviso.

---

## 4. Queda

1. **Tanda 2**: OK tuyo → `apply_migration` con los 2 INSERT (+ DO de aborto si count ≠ 201), probe, `CLAUDE.md` 199 → 201, CHANGELOG, merge de `fix/spcs-r9-tanda-2`.
2. **Conesera**: hecho. Falta mergear `fix/spcs-r9-tanda-2` para que `migrations/spcs_conesera_sexo.sql` en `main` diga EJECUTADA (hoy `main` la tiene como PROPUESTA).
3. **GALLETINI**: esperar respuesta de Yesi (a/b/c de arriba). Si el DNI que tipea coincide con `GALLETTINI, GUSTAVO JAVIER` (25041080) sería otra historia — pero eso es `propietarios`, y el aviso no mira ahí.
4. BIEN COQUETA y EL MAS SABIO siguen sin resolver (edad no cierra con T2 / T5).
