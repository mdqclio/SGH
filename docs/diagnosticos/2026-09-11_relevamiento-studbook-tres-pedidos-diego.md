# Integración Stud Book — relevamiento de los tres pedidos de Diego (solo lectura)

**Fecha:** 2026-09-11 (noche) · **`main`:** `4144a91` · **Solo lectura**: 4 `select` + `grep` en `main` + `list_edge_functions`. Nada tocado.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 203 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| greps | `main` | ✅ (`git branch --show-current` = main antes de cada grep) |

---

## 1. Veredicto

| pedido | del lado nuestro | lo que falta para decir "listos" |
|---|---|---|
| **Condición en 5 campos** | 3 de 5 existen en `carreras` (`edad_minima_anos`, `edad_maxima_anos`, `condicion_sexo`) y **ya viajan** en el JSON (`condicion.edaddesde/edadhasta/sexo`). **`ganadadesde`/`ganadahasta` no existen** en ninguna tabla: el JSON los manda `null` hardcodeado. | (a) 2 columnas nuevas + UI en `carta-llamados.html` (10 líneas) + 1 línea en el formatter; (b) retro: **15/49** carreras sin `edad_minima` (R8 completa + 9999), **5/49** con `condicion_sexo` mal (dicen `ambos` con texto de yeguas), y las 46 con texto se pueden pre-cargar `ganadas` por regex (**46/46 parsean**, 3 sin texto son la 9999) — a validar por Yesi, no a ciegas. |
| **DNI de cuidadores** | Contrato ya cumplido (`cuidador.dni` = `documento_nro`). Datos: padrón **108/139** con DNI; **31 sin** (todos Dolores, activos). En R9: **10 entrenadores** de 33 distintos sin DNI → **lista de 10 nombres** para Yesi, con sus caballos. | Que Yesi cargue esos 10 (33 filas de la lista, 25 caballos). Los otros 21 del padrón pueden esperar. Aparte: 8 inscripciones de R9 todavía sin entrenador. |
| **Tipos y estados de pista** | `carreras.tipo_pista` ENUM (`tierra` 40, `cesped` 9; catálogo `cesped, arena, mixta, sintetica, tierra`). `resultados.estado_pista` VARCHAR con CHECK (`seca` 9, `humeda` 9, `pesada` 1; permitido también `fangosa`). Viajan como `{id: <label>, nombre: <label>}` — **no hay IDs numéricos**. | Decidir con Diego: ¿le sirven los labels o quiere IDs suyos? Si IDs → tabla de mapeo de 4+5 valores, trivial. Dato menor: `hipodromos.tipo_pista` está sucio (`arena` en todos menos Dolores = `Césped`) y no se usa en el JSON. |
| **El JSON** | `reunion-json` v21 (deployada 23/08) ya emite `condicion` como **texto + campos** (no sólo texto). | Nada que agregar al JSON para los 3 primeros campos; para `ganadas` es 1 línea **después** de tener la columna. |

**Resumen para Diego**: edad y sexo ya viajan; ganadas no existe todavía (es el único hueco de contrato); DNI de cuidadores viaja pero con huecos de dato (10 en R9); pista viaja como label, sin ID. Lo que decide el orden es **si Diego quiere `ganadas` para R9 (20/09)**: si sí, hay que crear las columnas y que Yesi las cargue en los 11 turnos esta semana; si acepta `null` por ahora, del lado nuestro estamos listos con la carga de 10 DNI.

---

## 2. La condición en cinco campos

### 2.1 Qué hay en `carreras` (`information_schema`, hoy)

```
id, reunion_id, numero_turno, nombre, categoria_id, tipo_pista:tipo_pista, distancia_metros, edad_minima_anos:int4, edad_maxima_anos:int4, condicion_sexo:condicion_sexo, condicion_handicap:varchar, condicion_adicional:text, bolsa_total, distribucion_premios, cupo_maximo, hora_estimada, apertura_inscripcion, cierre_inscripcion, apertura_ratificacion, cierre_ratificacion, estado, bolsa_bonos, numero_carrera_programa, apuestas, apuestas_notas
```

- `condicion_sexo` ENUM: `ambos, machos, hembras, machos_castrados`.
- **Columnas parecidas a "ganadas" en toda la base** (`column_name ilike '%ganad%|%victori%|%triunf%|%perded%|%wins%'`): sólo `performances.tiempo_ganador` y `resultados.tiempo_ganador`. **No existe nada.** La condición de "ganador de N" vive únicamente en el texto libre `condicion_handicap`.

### 2.2 Cómo se completan hoy y cuánto falta

```json
{"total":49,"con_emin":34,"con_emax":26,"con_sexo":49,"sexo_dist":{"ambos":43,"machos":1,"hembras":5},"con_handicap_txt":46,"con_adicional":35,
 "por_reunion":[{"r":6,"club":"DOL","n":11,"sin_emin":0,"sin_hand":0},{"r":7,"club":"DOL","n":12,"sin_emin":0,"sin_hand":0},{"r":8,"club":"DOL","n":12,"sin_emin":12,"sin_hand":0},{"r":9,"club":"DOL","n":11,"sin_emin":0,"sin_hand":0},{"r":9999,"club":"DOL","n":3,"sin_emin":3,"sin_hand":3}]}
```

| campo | dónde se carga hoy | completitud (49) | retro si Diego lo pide para todas |
|---|---|---|---|
| `edad_minima_anos` | `carta-llamados.html`, modal de turno (Yesi lo usó hoy para T5/T6/T9/T10/T11) | 34/49 | **15**: las **12 de R8** (ninguna la tiene) + 3 de la 9999 (sandbox, no cuenta) → **12 reales** |
| `edad_maxima_anos` | idem | 26/49 | NULL = "y +" (abierto), así que no es "incompleto" per se; las 12 de R8 tampoco lo tienen y ahí sí falta decidir |
| `condicion_sexo` | idem, ENUM | 49/49 cargado, pero **5 mal**: texto dice yeguas / exclusión de yeguas y la columna dice `ambos` (R6 T2, T4, T10 · R7 T7 · R8 T12) — el mismo bug corregido en R9 T8/T10 el 08/09 | **5** correcciones (`hembras` ×3, `machos` ×2) |
| `ganadas desde/hasta` | **no existe** | 0/49 | 49 si se crea; pero **46/49 se derivan del texto** por regex (abajo). Sólo las 3 de la 9999 no tienen texto |

Sexo vs texto, las 5:
```json
[{"r":6,"t":10,"sexo_col":"ambos","h":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras."},{"r":6,"t":4,"sexo_col":"ambos","h":"Caballos 4 años perdedores (con exclusión de yeguas)"},{"r":6,"t":2,"sexo_col":"ambos","h":"Caballos 3 años perdedores (con exclusión de yeguas)"},{"r":7,"t":7,"sexo_col":"ambos","h":"Yeguas 4 y 5 años perdedoras."},{"r":8,"t":12,"sexo_col":"ambos","h":"Yeguas de 4 y 5 años perdedoras"}]
```

### 2.3 "Ganadas" — el texto es regular, se puede pre-cargar

Los 39 textos distintos de `condicion_handicap` (en §7) siguen 6 patrones. Regex sobre los 49:

```json
[{"ganadas":"0-0","n":25},{"ganadas":"1-2","n":13},{"ganadas":"SIN_TEXTO","n":3},{"ganadas":"1-1","n":3},{"ganadas":"2-∞","n":3},{"ganadas":"3-∞","n":1},{"ganadas":"2-3","n":1}]
```

| patrón en el texto | `ganadadesde` | `ganadahasta` | n |
|---|---|---|---|
| `perdedor(es/as)` | 0 | 0 | 25 |
| `ganador(a/es/as) de 1 carrera` | 1 | 1 | 3 |
| `… de 1 o 2` | 1 | 2 | 13 |
| `… de 2 o 3` | 2 | 3 | 1 |
| `… de 2 o +` | 2 | NULL (abierto) | 3 |
| `… de 3 o mas` | 3 | NULL | 1 |
| sin texto (9999) | — | — | 3 |

**46/46 con texto parsean sin ambigüedad**. Es un backfill propuesto por SQL + revisión de Yesi sobre una tabla de 46 filas, no una carga a mano.

### 2.4 Qué haría falta (si Diego lo pide)

1. **DDL**: `ALTER TABLE carreras ADD COLUMN ganadas_desde int4, ADD COLUMN ganadas_hasta int4` (NULL = sin restricción / abierto, misma semántica que `edad_maxima_anos`). Migración versionada, `apply_migration`.
2. **UI**: dos inputs numéricos en el modal de turno de `carta-llamados.html`, al lado de edad mín/máx (mismo bloque que Yesi ya usa). **Sin verificar** el nombre exacto de los ids del modal — no abrí el archivo; es un `grep edad_minima_anos carta-llamados.html` cuando se haga.
3. **Formatter**: `studbook_format.mjs:322-323` → `ganadadesde: c.ganadas_desde, ganadahasta: c.ganadas_hasta`. Redeploy de `reunion-json`.
4. **Retro**: (a) backfill de `ganadas` por regex (46) + (b) `edad_minima/maxima` de las 12 de R8 (también derivables del texto: "3 años" → 3-3, "5 años y más" → 5-NULL, "3 y 4" → 3-4, "3,4 y 5" → 3-5; **sin verificar** que las 12 parseen, no corrí ese regex) + (c) los 5 `condicion_sexo`. Todo propuesto en SQL, validado por Yesi, ejecutado con OK.
5. **Gate**: `validar_inscripcion` / `rpc_inscribir` hoy validan edad y sexo; "ganadas" **no se puede validar** de nuestro lado (no tenemos el récord de victorias de cada SPC — `spcs.ult_performances` es texto manual). Es dato para el Stud Book, no gate.

---

## 3. DNI de cuidadores

### 3.1 Padrón

```json
padron: [{"tipo":"entrenador","club":"DOL","estado":"activo","n":133,"con_dni":102,"sin_dni":31},{"tipo":"entrenador","club":"MCH","estado":"activo","n":5,"con_dni":5,"sin_dni":0},{"tipo":"ambos","club":"DOL","estado":"activo","n":1,"con_dni":1,"sin_dni":0}]
padron_total: {"entrenador_o_ambos":139,"con_dni":108,"sin_dni":31,"activos_dolores_sin_dni":31}
```

**139** entrenadores/ambos; **108 con DNI (78 %)**, **31 sin**, todos de Dolores y activos.

### 3.2 R9 — la lista acotada para Yesi

```json
r9_entrenadores: {"inscr_total":78,"con_entrenador":70,"sin_entrenador":8,"entrenadores_distintos":33,"distintos_con_dni":23,"distintos_sin_dni":10}
```

(R9 iba por **78** inscripciones al momento de la query; Yesi ya anotó QUE BELLA DOÑA en T1 y BIEN COQUETA en **T4** — no T11; cierra igual, 5 y +.)

**10 entrenadores sin DNI con caballos en R9** — esto es lo que hay que pedirle a Yesi, no los 31:

| entrenador | caballos en R9 |
|---|---|
| BLANCO, MARCELO | LOCA DUBAI T2, BAHIA ROMANA T3, LOCA DUBAI T3 |
| BOLONTI, ROBERTO | DOCTORA MIA T2, DEL CAMPEON T2 |
| CANTO, HORACIO | AMIGUITO JESUS T5, KUCCINI T5, EL MAS SABIO T6, ESPLENDID CRAF T9 |
| GONZALEZ, ADRIAN AGUSTIN | TOUCH OF BLUE T2, ECHO IN THE SKY T7 |
| MAITIA, MIGUEL A | TORO MAÑERO T3, COLONIAL JOHAN T4, TOY BOY T4, SEMBRADOR CHUCK T7 |
| PADRON, WALTER | BACON T4, BUEN MANUEL T11 |
| PAGANO, JUAN MAURICIO | IDALIA MARO T6, IDALIA MARO T8 |
| PREBE, JOSE | DESTINADO JOHAN T11 |
| TRUPPA, ROBERTO | ASTUTO NOTES T2, FALAYS T6, HEART OF GOLD T11 |
| VILLANUEVA, SANTINO | TERRIBLE KING T11 |

Se cargan desde `profesionales.html` → editar → DNI (ISSUE-079: sin unique en la base, el aviso de duplicado por DNI avisa pero no frena).

Además: **8 inscripciones de R9 sin entrenador** (DESERT OF DUBAI T1, QUE BELLA DOÑA T1, NIÑO OCEANICO T4, BIEN COQUETA T4, EL RISKO T7, THE BEAST PARTY T9, INDIANA MARO T10, GOIADORA T11) — saldrían con `cuidador: {nombre: null, dni: null}`. Son los del alta de hoy; Yesi completa.

Bonus, mismo criterio: **jockeys** titulares de R9 sin DNI: GONZALEZ, EDUARDO CECILIO · GONZALEZ, LUCAS · HAHN, GONZALO (3). El JSON también manda `jockey_inscripto.dni`.

---

## 4. Tipos y estados de pista

| dónde | tipo | valores en uso (conteo) | catálogo permitido |
|---|---|---|---|
| `carreras.tipo_pista` | ENUM `tipo_pista` | `tierra` **40**, `cesped` **9** (0 NULL) | `cesped, arena, mixta, sintetica, tierra` |
| `resultados.estado_pista` | VARCHAR + CHECK | `seca` **9**, `humeda` **9**, `pesada` **1** (19 resultados) | CHECK: `seca, humeda, fangosa, pesada` |
| `hipodromos.tipo_pista` | VARCHAR libre | `arena` ×6, `Césped` ×1 (Dolores) | ninguno — y **no se usa en el JSON** |
| `performances.tipo_pista` | VARCHAR libre | **sin verificar** (no consulté; tabla de performances manuales) | — |
| `reuniones.tiempo_clima` | — | NULL en las 14 | no se usa |

Sin acentos, minúsculas, consistentes. En el JSON: `tipo_pista: {id: 'tierra', nombre: 'tierra'}`, `estado_pista: {id: 'seca', nombre: 'seca'}` — **el `id` es el label**, no un código. Si Diego necesita sus IDs, es una tabla de mapeo de 9 filas del lado del formatter. `INTEGRACION_STUDBOOK_ESTADO.md:209` ya lo anotaba en agosto.

Inconsistencia lateral: `hipodromos.tipo_pista` dice `Césped` para Dolores mientras 40/49 carreras son `tierra`. No afecta el JSON (no viaja), pero es un dato sucio.

---

## 5. El JSON que ya le mandamos

`supabase/functions/_shared/studbook_format.mjs` en `main` @ `4144a91`, líneas 314-323:

```javascript
      tipo_pista: { id: c.tipo_pista ?? null, nombre: c.tipo_pista ?? null },
      estado_pista: { id: res?.estado_pista ?? null, nombre: res?.estado_pista ?? null },
      tipo_codo: { id: null, nombre: null },
      condicion: {
        texto: c.condicion_handicap ?? c.condicion_adicional ?? null,
        edaddesde: c.edad_minima_anos,
        edadhasta: c.edad_maxima_anos,
        sexo: mapSexo(c.condicion_sexo),
        ganadadesde: null,
        ganadahasta: null,
      },
```
```javascript
export function mapSexo(s) {
  if (s == null) return null;
  return s === 'ambos' ? 'T' : s;          // 'machos' / 'hembras' / 'machos_castrados' van tal cual
}
```
Y el cuidador (`:282-284`): `cuidador: { nombre, dni: cuid?.documento_nro ?? null, … }`.

**Respuesta: el JSON incluye la condición en las dos formas** — `texto` (el handicap libre, o `condicion_adicional` si no hay) **y** los campos `edaddesde / edadhasta / sexo`. `ganadadesde / ganadahasta` van **`null` hardcodeado** porque la columna no existe. Entonces lo que falta **no es agregar campos al JSON**: es crear y cargar `ganadas` en la base (y después una línea en el formatter). Para edad/sexo, lo que falta es **dato** (R8) y **corrección** (los 5 de sexo), no contrato.

Deploy: `reunion-json` **v21**, `updated_at` 2026-08-23 (`list_edge_functions`). **Sin verificar** byte a byte que el bundle deployado sea el `_shared` de `main` — el CHANGELOG del 23/08 dice que v18/v19 se deployaron desde `main` y v21 es del mismo día; no puedo diffear el bundle desde acá.

Pendiente del contrato que no es de estos tres pedidos pero Diego va a ver: `mapSexo` manda `'T'` para ambos y los labels nuestros para el resto — **sin verificar** que sea el vocabulario que él espera para `sexo` (`INTEGRACION_STUDBOOK_ESTADO.md` no lo cierra).

---

## 6. Qué haría, en orden

1. **Preguntar a Diego una cosa**: ¿`ganadadesde/hasta` los necesita para R9 (20/09) o puede recibir `null` por ahora? Y de paso: ¿`tipo_pista`/`estado_pista` con nuestros labels le sirven, o quiere IDs?
2. **Hoy mismo, sin depender de Diego**: darle a Yesi la lista de **10 entrenadores** (§3.2) y los **3 jockeys**, para que cargue DNI antes del lunes.
3. **Si Diego dice "ganadas sí"**: migración (2 columnas) + UI en carta-llamados + backfill por regex de las 46 + carga de Yesi en R9 + 1 línea del formatter + redeploy. Un día de trabajo, con plan y OK.
4. **Retro independiente de Diego**: `edad_minima/maxima` de las 12 de R8 y los 5 `condicion_sexo` mal — es el mismo tipo de fix que el del 08/09, y hoy hace que el JSON de R8 salga con `edaddesde: null`. Plan aparte, con Yesi validando.

---

## 7. Queries y salidas crudas

```sql
select 'carreras_cols' k, (select jsonb_agg(column_name||':'||udt_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='carreras') v
union all select 'cols_parecidas', coalesce((select jsonb_agg(table_name||'.'||column_name) from information_schema.columns where table_schema='public' and (column_name ilike '%ganad%' or column_name ilike '%victori%' or column_name ilike '%triunf%' or column_name ilike '%perded%' or column_name ilike '%wins%')), '[]')
union all select 'condicion_sexo_enum', (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typname=(select udt_name from information_schema.columns where table_name='carreras' and column_name='condicion_sexo'))
union all select 'tipo_pista_enum', (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typname='tipo_pista')
union all select 'carreras_completitud', (select jsonb_build_object('total',count(*),'con_emin',count(edad_minima_anos),'con_emax',count(edad_maxima_anos),'con_sexo',count(condicion_sexo),'sexo_dist',(select jsonb_object_agg(coalesce(condicion_sexo::text,'NULL'),n) from (select condicion_sexo, count(*) n from carreras group by 1) x),'con_handicap_txt',count(condicion_handicap),'con_adicional',count(condicion_adicional),'por_reunion',(select jsonb_agg(jsonb_build_object('r',r.numero,'club',cl.sigla,'n',x.n,'sin_emin',x.se,'sin_hand',x.sh) order by cl.sigla, r.numero) from (select reunion_id, count(*) n, count(*) filter (where edad_minima_anos is null) se, count(*) filter (where condicion_handicap is null) sh from carreras group by 1) x join reuniones r on r.id=x.reunion_id join clubs cl on cl.id=r.club_id)) from carreras)
union all select 'handicap_distintos', (select jsonb_agg(h) from (select distinct condicion_handicap h from carreras where condicion_handicap is not null order by 1) x)
union all select 'tipo_pista', (select jsonb_agg(jsonb_build_object('v',coalesce(tipo_pista::text,'NULL'),'n',n) order by n desc) from (select tipo_pista, count(*) n from carreras group by 1) x)
union all select 'estado_pista_resultados', (select jsonb_agg(jsonb_build_object('v',coalesce(estado_pista::text,'NULL'),'n',n) order by n desc) from (select estado_pista, count(*) n from resultados group by 1) x)
union all select 'pista_otras_cols', (select jsonb_agg(table_name||'.'||column_name||':'||udt_name) from information_schema.columns where table_schema='public' and column_name ilike '%pista%')
union all select 'check_estado_pista', coalesce((select jsonb_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid='resultados'::regclass and pg_get_constraintdef(oid) ilike '%pista%'), '[]')
union all select 'hipodromos_tipo_pista', (select jsonb_agg(jsonb_build_object('h',nombre,'tipo_pista',tipo_pista::text)) from hipodromos)
union all select 'reuniones_tiempo_clima', (select jsonb_agg(jsonb_build_object('v',coalesce(tiempo_clima::text,'NULL'),'n',n)) from (select tiempo_clima, count(*) n from reuniones group by 1) x)
```
```json
[{"k":"carreras_cols","v":["id:uuid","reunion_id:uuid","numero_turno:int4","nombre:varchar","categoria_id:uuid","tipo_pista:tipo_pista","distancia_metros:int4","edad_minima_anos:int4","edad_maxima_anos:int4","condicion_sexo:condicion_sexo","condicion_handicap:varchar","condicion_adicional:text","bolsa_total:numeric","distribucion_premios:jsonb","cupo_maximo:int4","hora_estimada:time","apertura_inscripcion:timestamptz","cierre_inscripcion:timestamptz","apertura_ratificacion:timestamptz","cierre_ratificacion:timestamptz","estado:varchar","bolsa_bonos:numeric","numero_carrera_programa:int4","apuestas:_text","apuestas_notas:text"]},
 {"k":"cols_parecidas","v":["performances.tiempo_ganador","resultados.tiempo_ganador"]},
 {"k":"condicion_sexo_enum","v":["ambos","machos","hembras","machos_castrados"]},
 {"k":"tipo_pista_enum","v":["cesped","arena","mixta","sintetica","tierra"]},
 {"k":"carreras_completitud","v":{"total":49,"con_emax":26,"con_emin":34,"con_sexo":49,"sexo_dist":{"ambos":43,"machos":1,"hembras":5},"por_reunion":[{"n":11,"r":6,"club":"DOL","sin_emin":0,"sin_hand":0},{"n":12,"r":7,"club":"DOL","sin_emin":0,"sin_hand":0},{"n":12,"r":8,"club":"DOL","sin_emin":12,"sin_hand":0},{"n":11,"r":9,"club":"DOL","sin_emin":0,"sin_hand":0},{"n":3,"r":9999,"club":"DOL","sin_emin":3,"sin_hand":3}],"con_adicional":35,"con_handicap_txt":46}},
 {"k":"handicap_distintos","v":["Caballos 3 años perdedores (con exclusión de yeguas)","Caballos 3 años perdedores.","Caballos 4 años perdedores (con exclusión de yeguas)","Caballos 4 años perdedores.","Especial todo caballo 4 años y + edad ganador de 2 o + carreras.","Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.","Especial todo caballo de 4 años y + edad ganador de 2 o + carreras.","Productos 2 años perdedores.","Todo caballo 3 años perdedor.","Todo caballo 3 y 4 años ganador de 1 o 2 carreras.","Todo caballo 3 y 4 años ganadores de 1 carrera.","Todo caballo 3 y 4 años ganadores de 2 o 3 carreras.","Todo caballo 3 y 4 años perdedores.","Todo caballo 3, 4 y 5 años ganadores de 1 o 2 carreras.","Todo caballo 4 años perdedor.","Todo caballo 4 años perdedores.","Todo caballo 5 años y + edad ganadores de 1 o 2 carreras.","Todo caballo 5 años y + edad perdedor.","Todo caballo 5 años y + edad perdedores.","Todo caballo 6 años y + edad ganadores de 1 o 2 carreras.","Todo caballo de 3 y 4 años ganadores de 1 o 2 carreras","Todo caballo de 3 y 4 años ganadores de 1 o 2 carreras.","Todo caballo de 3,4 y 5 años ganadores de 1 o 2 carreras","Todo caballo de 4 años perdedores","Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras","Todo caballo de 5 años ganador de 1 o 2 carreras.","Todo caballo de 5 años ganadora de 1 carrera.","Todo caballo de 5 años y más edad ganadores de 1 carrera","Todo caballo de 5 años y más edad perdedores","Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras","Todo caballo de 6 años y más edad perdedores","Todo Caballos de 3 años perdedores","Yeguas 3 años perdedoras.","Yeguas 4 años perdedoras.","Yeguas 4 y 5 años perdedoras.","Yeguas 5 años y + edad perdedoras.","Yeguas de 3 y 4 años perdedoras.","Yeguas de 4 y 5 años perdedoras","Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras."]},
 {"k":"tipo_pista","v":[{"n":40,"v":"tierra"},{"n":9,"v":"cesped"}]},
 {"k":"estado_pista_resultados","v":[{"n":9,"v":"seca"},{"n":9,"v":"humeda"},{"n":1,"v":"pesada"}]},
 {"k":"pista_otras_cols","v":["v_programa_reunion.tipo_pista:tipo_pista","carreras.tipo_pista:tipo_pista","hipodromos.tipo_pista:varchar","performances.tipo_pista:varchar","resultados.estado_pista:varchar"]},
 {"k":"check_estado_pista","v":["CHECK (((estado_pista)::text = ANY ((ARRAY['seca'::character varying, 'humeda'::character varying, 'fangosa'::character varying, 'pesada'::character varying])::text[])))"]},
 {"k":"hipodromos_tipo_pista","v":[{"h":"Hipodromo de Palermo","tipo_pista":"arena"},{"h":"Hipodromo Ciudad de Dolores","tipo_pista":"arena"},{"h":"Hipodromo de San Francisco","tipo_pista":"arena"},{"h":"Hipodromo Jockey Club de Azul","tipo_pista":"arena"},{"h":"Hipodromo Jockey club de Tandil","tipo_pista":"arena"},{"h":"Hipodromo de Gualeguaychu","tipo_pista":"arena"},{"h":"Hipódromo de Dolores","tipo_pista":"Césped"}]},
 {"k":"reuniones_tiempo_clima","v":[{"n":14,"v":"NULL"}]}]
```

```sql
with c as (select id, reunion_id, numero_turno, condicion_handicap h, lower(condicion_handicap) l, edad_minima_anos, edad_maxima_anos, condicion_sexo from carreras),
p as (select *, case when l is null then 'SIN_TEXTO' when l ~ 'perdedor' then '0-0' when l ~ 'ganador(a|es|as)? de 1 carrera' then '1-1' when l ~ 'ganador(a|es|as)? de 1 o 2' then '1-2' when l ~ 'ganador(a|es|as)? de 2 o 3' then '2-3' when l ~ 'ganador(a|es|as)? de 2 o \+' then '2-∞' when l ~ 'ganador(a|es|as)? de 3 o m' then '3-∞' else 'NO_PARSEA' end as ganadas from c)
select 'ganadas_parse' k, (select jsonb_agg(jsonb_build_object('ganadas',ganadas,'n',n) order by n desc) from (select ganadas, count(*) n from p group by 1) x) v
union all select 'no_parsea', coalesce((select jsonb_agg(jsonb_build_object('r',r.numero,'t',p.numero_turno,'h',p.h)) from p join reuniones r on r.id=p.reunion_id where ganadas in ('NO_PARSEA','SIN_TEXTO')), '[]')
union all select 'retro_faltantes', (select jsonb_build_object('sin_emin',count(*) filter (where edad_minima_anos is null),'sin_emax_y_no_abierto',count(*) filter (where edad_maxima_anos is null),'sin_ganadas_parseable',count(*) filter (where ganadas in ('NO_PARSEA','SIN_TEXTO')),'alguna_de_las_tres',count(*) filter (where edad_minima_anos is null or ganadas in ('NO_PARSEA','SIN_TEXTO'))) from p)
union all select 'sexo_vs_texto', coalesce((select jsonb_agg(jsonb_build_object('r',r.numero,'t',p.numero_turno,'sexo_col',p.condicion_sexo,'h',p.h)) from p join reuniones r on r.id=p.reunion_id where (p.l ~ 'yegua' and p.condicion_sexo <> 'hembras') or (p.l ~ 'exclusi.n de yeguas' and p.condicion_sexo <> 'machos')), '[]')
union all select 'edad_vs_texto_muestra', (select jsonb_agg(jsonb_build_object('r',r.numero,'t',p.numero_turno,'emin',p.edad_minima_anos,'emax',p.edad_maxima_anos,'h',p.h) order by r.numero, p.numero_turno) from p join reuniones r on r.id=p.reunion_id where r.numero=8)
```
```json
[{"k":"ganadas_parse","v":[{"n":25,"ganadas":"0-0"},{"n":13,"ganadas":"1-2"},{"n":3,"ganadas":"SIN_TEXTO"},{"n":3,"ganadas":"1-1"},{"n":3,"ganadas":"2-∞"},{"n":1,"ganadas":"3-∞"},{"n":1,"ganadas":"2-3"}]},
 {"k":"no_parsea","v":[{"h":null,"r":9999,"t":1},{"h":null,"r":9999,"t":2},{"h":null,"r":9999,"t":3}]},
 {"k":"retro_faltantes","v":{"sin_emin":15,"alguna_de_las_tres":15,"sin_emax_y_no_abierto":23,"sin_ganadas_parseable":3}},
 {"k":"sexo_vs_texto","v":[{"h":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras.","r":6,"t":10,"sexo_col":"ambos"},{"h":"Caballos 4 años perdedores (con exclusión de yeguas)","r":6,"t":4,"sexo_col":"ambos"},{"h":"Caballos 3 años perdedores (con exclusión de yeguas)","r":6,"t":2,"sexo_col":"ambos"},{"h":"Yeguas 4 y 5 años perdedoras.","r":7,"t":7,"sexo_col":"ambos"},{"h":"Yeguas de 4 y 5 años perdedoras","r":8,"t":12,"sexo_col":"ambos"}]},
 {"k":"edad_vs_texto_muestra","v":[{"h":"Todo Caballos de 3 años perdedores","r":8,"t":1,"emax":null,"emin":null},{"h":"Todo caballo de 4 años perdedores","r":8,"t":2,"emax":null,"emin":null},{"h":"Todo caballo de 4 años perdedores","r":8,"t":3,"emax":null,"emin":null},{"h":"Todo caballo de 6 años y más edad perdedores","r":8,"t":4,"emax":null,"emin":null},{"h":"Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras","r":8,"t":5,"emax":null,"emin":null},{"h":"Todo caballo de 3 y 4 años ganadores de 1 o 2 carreras","r":8,"t":6,"emax":null,"emin":null},{"h":"Todo caballo de 3,4 y 5 años ganadores de 1 o 2 carreras","r":8,"t":7,"emax":null,"emin":null},{"h":"Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras","r":8,"t":8,"emax":null,"emin":null},{"h":"Todo caballo de 5 años y más edad ganadores de 1 carrera","r":8,"t":9,"emax":null,"emin":null},{"h":"Especial todo caballo de 4 años y + edad ganador de 2 o + carreras.","r":8,"t":10,"emax":null,"emin":null},{"h":"Todo caballo de 5 años y más edad perdedores","r":8,"t":11,"emax":null,"emin":null},{"h":"Yeguas de 4 y 5 años perdedoras","r":8,"t":12,"emax":null,"emin":null}]}]
```

```sql
select 'padron' k, (select jsonb_agg(jsonb_build_object('tipo',tipo,'club',(select sigla from clubs where id=p.club_id),'estado',estado,'n',n,'con_dni',cd,'sin_dni',n-cd) order by tipo, n desc) from (select tipo, club_id, estado, count(*) n, count(documento_nro) cd from profesionales p where tipo in ('entrenador','ambos') group by 1,2,3) p) v
union all select 'padron_total', (select jsonb_build_object('entrenador_o_ambos',count(*),'con_dni',count(documento_nro),'sin_dni',count(*)-count(documento_nro),'activos_dolores_sin_dni',count(*) filter (where documento_nro is null and activo and club_id='0649e9c5-9e87-4aad-842f-101458e6b33c')) from profesionales where tipo in ('entrenador','ambos'))
union all select 'r9_entrenadores', (select jsonb_build_object('inscr_total',count(*),'con_entrenador',count(i.entrenador_id),'sin_entrenador',count(*)-count(i.entrenador_id),'entrenadores_distintos',count(distinct i.entrenador_id),'distintos_con_dni',count(distinct i.entrenador_id) filter (where p.documento_nro is not null),'distintos_sin_dni',count(distinct i.entrenador_id) filter (where p.documento_nro is null)) from inscripciones i join carreras ca on ca.id=i.carrera_id left join profesionales p on p.id=i.entrenador_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9')
union all select 'r9_lista_sin_dni', coalesce((select jsonb_agg(jsonb_build_object('entrenador',p.apellido||', '||coalesce(p.nombre,''),'tipo',p.tipo,'id',p.id,'caballos_r9',cab) order by p.apellido) from (select i.entrenador_id, string_agg(s.nombre||' T'||ca.numero_turno, ', ' order by ca.numero_turno) cab from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.entrenador_id is not null group by 1) x join profesionales p on p.id=x.entrenador_id where p.documento_nro is null), '[]')
union all select 'r9_sin_entrenador', coalesce((select jsonb_agg(jsonb_build_object('t',ca.numero_turno,'spc',s.nombre) order by ca.numero_turno) from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.entrenador_id is null), '[]')
union all select 'jockeys_r9_sin_dni', coalesce((select jsonb_agg(distinct p.apellido||', '||coalesce(p.nombre,'')) from inscripciones i join carreras ca on ca.id=i.carrera_id join profesionales p on p.id=i.jockey_titular_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and p.documento_nro is null), '[]')
```
```json
[{"k":"padron","v":[{"n":133,"club":"DOL","tipo":"entrenador","estado":"activo","con_dni":102,"sin_dni":31},{"n":5,"club":"MCH","tipo":"entrenador","estado":"activo","con_dni":5,"sin_dni":0},{"n":1,"club":"DOL","tipo":"ambos","estado":"activo","con_dni":1,"sin_dni":0}]},
 {"k":"padron_total","v":{"con_dni":108,"sin_dni":31,"entrenador_o_ambos":139,"activos_dolores_sin_dni":31}},
 {"k":"r9_entrenadores","v":{"inscr_total":78,"con_entrenador":70,"sin_entrenador":8,"distintos_con_dni":23,"distintos_sin_dni":10,"entrenadores_distintos":33}},
 {"k":"r9_lista_sin_dni","v":[{"id":"3c973f57-4163-4e78-b7e1-cca4885d787f","tipo":"entrenador","entrenador":"BLANCO, MARCELO","caballos_r9":"LOCA DUBAI T2, BAHIA ROMANA T3, LOCA DUBAI T3"},{"id":"87bc872c-a460-494c-8bb1-3e1064c2afb1","tipo":"entrenador","entrenador":"BOLONTI, ROBERTO","caballos_r9":"DOCTORA MIA T2, DEL CAMPEON T2"},{"id":"a8d0e58a-1024-4555-834e-3b931ce577b3","tipo":"entrenador","entrenador":"CANTO, HORACIO","caballos_r9":"AMIGUITO JESUS T5, KUCCINI T5, EL MAS SABIO T6, ESPLENDID CRAF T9"},{"id":"16f51c0a-8750-4df6-9b34-ae0d2dbdfb98","tipo":"entrenador","entrenador":"GONZALEZ, ADRIAN AGUSTIN","caballos_r9":"TOUCH OF BLUE T2, ECHO IN THE SKY T7"},{"id":"de1252b1-a852-4993-9a2f-c13347459c7a","tipo":"entrenador","entrenador":"MAITIA, MIGUEL A","caballos_r9":"TORO MAÑERO T3, COLONIAL JOHAN T4, TOY BOY T4, SEMBRADOR CHUCK T7"},{"id":"2ca89d1c-2bb5-49a7-98ac-13a25594b13c","tipo":"entrenador","entrenador":"PADRON, WALTER","caballos_r9":"BACON T4, BUEN MANUEL T11"},{"id":"76389359-d8ed-4153-801b-e7e7bcabcf14","tipo":"entrenador","entrenador":"PAGANO, JUAN MAURICIO","caballos_r9":"IDALIA MARO T6, IDALIA MARO T8"},{"id":"8528087d-ff46-45ac-9226-9e043cab39fb","tipo":"entrenador","entrenador":"PREBE, JOSE","caballos_r9":"DESTINADO JOHAN T11"},{"id":"405ba68e-78e0-40ca-bc3c-a06c60f11659","tipo":"entrenador","entrenador":"TRUPPA, ROBERTO","caballos_r9":"ASTUTO NOTES T2, FALAYS T6, HEART OF GOLD T11"},{"id":"804caabb-851a-46a7-94ae-6270e9929d5c","tipo":"entrenador","entrenador":"VILLANUEVA, SANTINO","caballos_r9":"TERRIBLE KING T11"}]},
 {"k":"r9_sin_entrenador","v":[{"t":1,"spc":"DESERT OF DUBAI"},{"t":1,"spc":"QUE BELLA DOÑA"},{"t":4,"spc":"NIÑO OCEANICO"},{"t":4,"spc":"BIEN COQUETA"},{"t":7,"spc":"EL RISKO"},{"t":9,"spc":"THE BEAST PARTY"},{"t":10,"spc":"INDIANA MARO"},{"t":11,"spc":"GOIADORA"}]},
 {"k":"jockeys_r9_sin_dni","v":["GONZALEZ, EDUARDO CECILIO","GONZALEZ, LUCAS","HAHN, GONZALO"]}]
```

```
$ git branch --show-current → main
$ grep -n "condicion\|edad\|sexo\|pista\|ganad\|documento\|dni\|cuidador\|entrenador" supabase/functions/_shared/studbook_format.mjs
227:      const cuid = profMap.get(i.entrenador_id) || null;
272:            dni: jock?.documento_nro ?? null,
279:            dni: jockEfectivo?.documento_nro ?? null,
282:          cuidador: {
284:            dni: cuid?.documento_nro ?? null,
314:      tipo_pista: { id: c.tipo_pista ?? null, nombre: c.tipo_pista ?? null },
315:      estado_pista: { id: res?.estado_pista ?? null, nombre: res?.estado_pista ?? null },
317:      condicion: {
318:        texto: c.condicion_handicap ?? c.condicion_adicional ?? null,
319:        edaddesde: c.edad_minima_anos,
320:        edadhasta: c.edad_maxima_anos,
321:        sexo: mapSexo(c.condicion_sexo),
322:        ganadadesde: null,
323:        ganadahasta: null,
$ list_edge_functions → reunion-json: version 21, status ACTIVE, verify_jwt false, updated_at 1787495325640 (= 2026-08-23)
```
