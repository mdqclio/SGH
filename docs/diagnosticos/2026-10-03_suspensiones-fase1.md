# Suspensiones con alcance y bloqueo al inscribir — Fase 1 (sólo lectura)

- Fecha: 2026-10-03
- Código leído: `origin/main` = `6b7f84b5f5446fd19de4c188dbf3b959bf568a18`, con `git show`/`git grep` y sin checkout. Base: prod (`unlhcuanfrtpatoipwve`), **sólo SELECT**.
- Guards: pwd `/home/clio/dev/SGH`; club Dolores = 1 fila.
- **No se escribió nada**: ni código, ni migración, ni datos.
- Anonimizado: sólo ids. Los nombres de caballos y personas sancionados no se copian; se deja la consulta que los devuelve.

## Reglas pedidas (Yesi y Fede)

1. Cada sanción dice a quién alcanza: **sólo el caballo, sólo el entrenador, o ambos**.
2. Caballo alcanzado: **no se inscribe con ningún entrenador**.
3. Entrenador alcanzado: **no inscribe ningún caballo**. Si la sanción es sólo del entrenador, el caballo puede inscribirse con otro.
4. Doping: alcanza a **ambos por defecto**. Achicarlo tiene que ser explícito y **queda registrado quién lo hizo**.
5. **Provisoria**: dura hasta que se abre el frasco testigo o se desiste; **después pasa a definitiva**.
6. Se tienen que poder **compartir entre hipódromos**. Si complica, va en una segunda etapa.

## 1. Cómo es hoy

### 1.1 Sanciones

- **Una fila por entidad.** Columnas `entidad_tipo` (enum `entidad_sancionada` = profesional, spc, propietario, caballeriza) y `entidad_id`. Para "caballo y
  entrenador" hacen falta dos filas sueltas, sin nada que las vincule.
- **Tipo.** `tipo_sancion` es texto libre ("SUSPENSIÓN", "Doping"…). No hay marca de doping, ni provisoria/definitiva, ni frasco.
- **Estado y período.** `estado` (enum: activa, cumplida, apelada, revocada) y `fecha_inicio`/`fecha_fin`.
- **`alcance`** (varchar, default `'club'`, sin CHECK) **ya existe con otro sentido**: si se comparte con otros clubes. La RLS de `sanciones_select`
  deja que el staff de otro club vea las que tienen `alcance <> 'club'`. Hoy las 5 tienen `'club'` y la pantalla lo fija en `'club'`.
- **Resolución.** El único vínculo es `codigo_resolucion` (texto, vacío en las 5) y `resolucion_url`. `resoluciones`/`resolucion_entidades` existen pero
  **no se vinculan con sanciones**: `resolucion_entidades` tiene 0 filas.
- **Autoría y auditoría.** `creado_por`/`modificado_por` los impone la base (`fn_autor_fila`) y hay auditoría en las tres tablas (ISSUE-097).
- **Permisos.** INSERT/UPDATE: staff de su club o super_admin. DELETE: sólo super_admin.
- **`v_sanciones_vigentes`** = `estado='activa' AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)`: **no mira `fecha_inicio`** y usa **hoy**, no la
  fecha de la reunión.

### 1.2 Pantalla de sanciones (`sanciones.html`)

- Ofrece las categorías jockey, spc, caballeriza y profesional (entrenador). **`'jockey'` no existe en el enum** (`sanciones.html:129,161,366` manda
  `entidad_tipo: 'jockey'`), así que **dar de alta una sanción a un jockey falla hoy**. Tampoco ofrece `propietario`.
- No tiene campos para alcance/compartir, resolución, doping, provisoria ni frasco.
- **Hallazgo que hay que arreglar igual**, independiente de este pedido.

### 1.3 Datos actuales (prod)

```sql
select 'sanciones', entidad_tipo, tipo_sancion, alcance, estado, (fecha_fin is null), (codigo_resolucion is not null), count(*) from sanciones group by …;
select 'resoluciones', tipo, estado, (reunion_id is not null), (documento_url is not null), count(*) from resoluciones group by …;
select 'resolucion_entidades', entidad_tipo, count(*) from resolucion_entidades group by …;
```
```
sanciones | profesional | SUSPENSIÓN | club | activa | fecha_fin cargada | sin código | 2
sanciones | spc         | SUSPENSIÓN | club | activa | fecha_fin cargada | sin código | 2
sanciones | spc         | Doping     | club | activa | fecha_fin cargada | sin código | 1
resoluciones | SANCIÓN | notificada | con reunión | con documento | 2
resolucion_entidades | (0 filas)
clubs: 3
```

Las 5 sanciones (ids; los nombres salen con `select s.id, coalesce(sp.nombre, p.apellido) from sanciones s left join spcs sp on sp.id=s.entidad_id left join profesionales p on p.id=s.entidad_id`):

| sanción | entidad | tipo | inicio | fin | cargada | inscripciones activas dentro del período |
|---|---|---|---|---|---|---|
| `ade49423…` | spc | Doping | 2026-05-05 | 2027-05-05 | 2026-05-05 | 0 |
| `aafe26a5…` | profesional (entrenador) | SUSPENSIÓN | 2026-09-15 | 2029-03-14 | 2026-09-25 | 3 |
| `fb44bf96…` | spc | SUSPENSIÓN | 2026-09-15 | 2027-01-14 | 2026-09-25 | 2 |
| `09f42656…` | profesional (entrenador) | SUSPENSIÓN | 2026-09-15 | 2028-03-14 | 2026-09-25 | 2 |
| `1ebc2218…` | spc | SUSPENSIÓN | 2026-09-15 | 2027-03-14 | 2026-09-25 | 0 |

Las cuatro del 25/09 son un mismo caso, con la misma fecha de inicio y la misma carga. Fueron 4 filas sueltas (2 entrenadores, 2 caballos) con duraciones distintas, sin nada que diga
qué caballo va con qué entrenador.

**Las 7 inscripciones "activas dentro del período" son todas de R9 (20/09)**, creadas el 11/09 por la secretaría (`canal='manual'`). Las sanciones se
cargaron después, el 25/09, con inicio **retroactivo** al 15/09. No fue una falla del bloqueo, porque cuando se inscribieron no había sanción. Pero el diseño tiene que contemplar
la carga retroactiva: el bloqueo **no puede romper ediciones de una reunión ya corrida**.

```sql
select s.id, s.entidad_tipo, i.id, i.estado, r.numero, r.fecha, r.estado, c.numero_turno, i.created_at::date, i.canal, <como: spc|entrenador|jockey>
from sanciones s join inscripciones i on (spc = entidad o entrenador/jockey = entidad) join carreras c … join reuniones r …
where i.estado in ('inscripto','ratificado') and r.fecha between s.fecha_inicio and coalesce(s.fecha_fin,'9999-12-31');
```
```
09f42656… profesional | 5b1502b5… | ratificado | R9 | 2026-09-20 | publicada | T6 | 2026-09-11 | manual | entrenador
09f42656… profesional | 8f85944f… | inscripto  | R9 | 2026-09-20 | publicada | T8 | 2026-09-11 | manual | entrenador
aafe26a5… profesional | 032aeda5… | ratificado | R9 | 2026-09-20 | publicada | T3 | 2026-09-11 | manual | entrenador
aafe26a5… profesional | 952efb8d… | ratificado | R9 | 2026-09-20 | publicada | T3 | 2026-09-11 | manual | entrenador
aafe26a5… profesional | 7f31c4c3… | inscripto  | R9 | 2026-09-20 | publicada | T2 | 2026-09-11 | manual | entrenador
fb44bf96… spc         | 7f31c4c3… | inscripto  | R9 | 2026-09-20 | publicada | T2 | 2026-09-11 | manual | spc
fb44bf96… spc         | 952efb8d… | ratificado | R9 | 2026-09-20 | publicada | T3 | 2026-09-11 | manual | spc
```
(T2 y T8 de R9 están anulados; R9 se suspendió después de la 5ª carrera.)

### 1.4 Todos los caminos que crean una inscripción, la pasan a un estado que corre o le cambian el caballo o el entrenador

| camino | quién / cómo escribe | ¿mira sanciones hoy? |
|---|---|---|
| `inscripciones.html` `saveRecord` (alta y edición; puede cambiar `spc_id`, `entrenador_id` y `estado` a ratificado) | staff, **INSERT/UPDATE directo** con RLS de club | **no**. Tampoco edad, sexo, cupo ni ventana. |
| `ratificacion.html` `ratificar` (estado → ratificado) | staff, UPDATE directo | **no** |
| `ratificacion.html` "Volver" (ratificado → inscripto) | staff, UPDATE directo | no; no hace falta, porque no habilita a correr más de lo que ya corría |
| portal `anotar` → `rpc_inscribir` (INSERT `estado='inscripto'`) | portal, RPC SECURITY DEFINER | **sí, sólo el caballo**, vía `validar_inscripcion` (vigencia a hoy, sin `fecha_inicio`, cualquier club y cualquier alcance; mensaje genérico al portal) |
| portal "Modificar" → `rpc_modificar_inscripcion` (cambia `entrenador_id`, jockey, caballeriza) | portal, RPC SECURITY DEFINER | **no**: se puede pasar un caballo a un entrenador suspendido |
| `resultados.html` `saveMontas` → `rpc_cambiar_monta` (sólo jockey) | staff, RPC | no; fuera de alcance (jockey) |
| Edge Function `studbook-buscar` 'traer' | service_role → `rpc_spc_alta_studbook_portal` | **crea el SPC, no la inscripción**: la inscripción sigue por los caminos de arriba |
| Edge Functions `reunion-json`, `invite-user` | — | no tocan inscripciones |
| migraciones de datos / tools (merge de SPC duplicados, correcciones de R6/R8, seed de la 9999) | migración (postgres) | no; son manuales |

Triggers sobre `inscripciones` hoy:
- `trg_audit_inscripciones`: auditoría.
- `trg_insc_set_propietario`: deriva el propietario.
- `trg_insc_monta_oficial`: monta en carrera oficial, P0084.
- `trg_inscripciones_updated_at`.

**Ninguno valida sanciones, edad ni ventana.**

Detalle del relevamiento (archivo:línea): se adjunta al final, en el Anexo A.

## 2. Modelo propuesto

### 2.1 Una sanción = un caso, con a quién alcanza

Se **extiende `sanciones`** en vez de hacer otra tabla. Las 5 filas existentes se conservan.

| columna nueva | tipo | regla |
|---|---|---|
| `spc_id` | uuid FK spcs, null | el caballo del caso |
| `entrenador_id` | uuid FK profesionales, null | el entrenador del caso (tipo entrenador/ambos) |
| `alcanza` | text CHECK in (`caballo`,`entrenador`,`ambos`) | `caballo`/`ambos` exige `spc_id`; `entrenador`/`ambos` exige `entrenador_id` (CHECK) |
| `es_doping` | boolean NOT NULL default false | reemplaza el texto libre "Doping" como criterio |
| `alcance_reducido_motivo` | text | obligatorio si `es_doping` y `alcanza <> 'ambos'` |
| `alcance_reducido_por` / `_at` | uuid FK usuarios / timestamptz | **los pone la base** (trigger, `auth.uid()`), no la pantalla |
| `caracter` | text CHECK in (`provisoria`,`definitiva`) default `definitiva` | |
| `frasco_testigo` | text CHECK in (`pendiente`,`abierto`,`desistido`), null | obligatorio (`pendiente`) si es provisoria |
| `definitiva_por` / `_at` | uuid / timestamptz | los pone la base al pasar a definitiva |
| `resolucion_id` | uuid FK resoluciones, null | vincula con la resolución (hoy `codigo_resolucion` es texto vacío) |

Notas:

- **Nombre.** `alcance` ya existe y significa "compartida con otros clubes". La columna nueva se llama `alcanza`, para no pisarla. En la etapa 2,
  `alcance` puede pasar a llamarse `difusion`.
- **`entidad_tipo` y `entidad_id` se conservan** para las sanciones que no bloquean inscripciones (propietario, caballeriza, jockey) y para lo histórico.
  En las de caballo/entrenador las mantiene coherentes un trigger: la entidad principal es el caballo si hay `spc_id`, y si no, el entrenador. Así la
  pantalla y los listados actuales siguen funcionando.
- **Backfill de las 5:**
  - `spc` → `alcanza='caballo'`, `spc_id=entidad_id`;
  - `profesional` (entrenador) → `alcanza='entrenador'`, `entrenador_id=entidad_id`;
  - la de "Doping" → `es_doping=true`, con `alcanza='caballo'` **como está hoy**.

  Esta última, al ser doping sin "ambos", necesita `alcance_reducido_motivo`. El backfill lo carga como `'carga anterior al 03/10: sólo el caballo'`
  y `alcance_reducido_por = NULL` (migración). Que Yesi confirme si correspondía "ambos". Las 4 del 25/09 quedan como 4 casos sueltos hasta
  que Yesi diga qué caballo va con qué entrenador; en ese caso se pueden juntar en casos `ambos`.

**Reglas en la base** (trigger BEFORE INSERT/UPDATE sobre `sanciones`):

- **Doping.** Si `es_doping` y no se indicó `alcanza` → `'ambos'`. Si `es_doping` y `alcanza <> 'ambos'` → exige `alcance_reducido_motivo` y estampa
  `alcance_reducido_por/_at`. Un UPDATE que achica el alcance de una de doping hace lo mismo. Además, todo cambio queda en `auditoria` con el usuario.
- **Provisoria.**
  - Al crearla: `caracter='provisoria'` ⇒ `frasco_testigo='pendiente'`.
  - Pasa a `definitiva` sólo si `frasco_testigo` ∈ (`abierto`, `desistido`). Al cambiar el frasco a uno de esos dos, la base la pasa a `definitiva` y
    estampa `definitiva_por/_at`. Si el contraanálisis da negativo, va `estado='revocada'` (ver pregunta 4).
  - Mientras es provisoria, **bloquea igual que una definitiva** (ver pregunta 3).
- **Vigencia para bloquear:** `estado` ∈ (`activa`[, `apelada`]) y la **fecha de la reunión** entre `fecha_inicio` y `coalesce(fecha_fin, ∞)`.
  Se mira la fecha de la reunión, no "hoy": así una sanción que empieza en dos semanas bloquea la reunión de dentro de tres, y no la de mañana.

### 2.2 Dónde va el bloqueo: en la base, con un trigger sobre `inscripciones`

**Función única** `fn_sancion_bloqueante(p_spc_id, p_entrenador_id, p_carrera_id)`:
- Devuelve la primera sanción que bloquea, con quién la tiene (caballo o entrenador), el tipo y si es provisoria.
- SECURITY DEFINER, sin EXECUTE para anon.
- Bloquea si:
  - (`alcanza` ∈ caballo, ambos **y** `spc_id` = el caballo), **o**
  - (`alcanza` ∈ entrenador, ambos **y** `entrenador_id` = el entrenador),
  - **y** la sanción está vigente a la fecha de esa reunión, **y** el club corresponde (ver 2.3).

**Trigger** `trg_insc_sancion` **BEFORE INSERT OR UPDATE OF spc_id, entrenador_id, estado, carrera_id ON inscripciones**. Chequea sólo cuando la
inscripción **queda en un estado que corre** (`inscripto`, `ratificado`, `pre_inscripto`, `confirmado`) **y** además pasa una de estas cosas:
- es un INSERT;
- cambió el caballo, el entrenador o el turno;
- **pasa a un estado que corre o a ratificado** desde otro (forfait → inscripto, inscripto → ratificado).

Si encuentra una sanción → `RAISE … USING ERRCODE='P0093'`:
- **staff:** el detalle ("El entrenador X tiene una suspensión vigente hasta …, resolución N°…");
- **portal:** el texto genérico que ya usa `validar_inscripcion`.

Por qué así:
- **Cubre todos los caminos de una vez:** el alta y edición de la secretaría (INSERT/UPDATE directo), ratificar, `rpc_inscribir`,
  `rpc_modificar_inscripcion` (cambio de entrenador) y cualquier camino futuro (Edge Function, RPC nueva). No depende de que cada pantalla se acuerde de
  validar.
- **No toca lo ya corrido:** un UPDATE de peso, gatera, jockey o propietario no cambia esas columnas y no dispara el chequeo. Las 7 de R9 siguen
  editables en todo lo demás. Sólo se frena si alguien intenta ratificar o reinscribir con la sanción vigente, que es lo que se quiere.
- **Excepción sólo para migración:** sesión sin JWT (postgres), el mismo criterio que P0092. **No hay marca para el cliente.** Si la comisión levanta
  una sanción, se cambia la sanción (estado/fecha), no se saltea el bloqueo.

**Además, para que el usuario se entere antes de guardar** (aviso; el freno es el de la base):
- `validar_inscripcion` pasa a usar `fn_sancion_bloqueante`. El portal deja de mirar "hoy" y suma al entrenador.
- `inscripciones.html`:
  - el buscador y el modal marcan "⛔ Sancionado" en el caballo o el entrenador elegidos;
  - el error P0093 se traduce.
- `ratificacion.html`: badge "⛔ Sancionado" y Ratificar deshabilitado con el motivo, con el mismo patrón que la reunión cerrada.
- `sanciones.html`:
  - campos nuevos (a quién alcanza, doping, provisoria y frasco, resolución);
  - se arregla `'jockey'` → `profesional`, con el combo de jockeys.

### 2.3 Compartir entre hipódromos

- **Caballo: se puede en la etapa 1, porque es barato.** Los SPC son globales (mismo id en todos los clubes). La función mira las sanciones del club de la
  reunión **más** las de otros clubes con `alcance <> 'club'`. Esa marca ya existe y la RLS ya deja verlas. Falta la UI para marcarla (un check
  "Compartir con otros hipódromos" en `sanciones.html`). Propuesta: **compartida por defecto en doping** (pregunta 6).
- **Entrenador: etapa 2.** Los profesionales son **por club**: la misma persona tiene un `id` distinto en cada hipódromo. Para que una suspensión de
  Dolores frene al mismo entrenador en otro club hace falta una identidad común (DNI o matrícula normalizados, con una tabla de equivalencias o un
  `persona_id`) y resolver homónimos. No es menor: va en la etapa 2.
- **En la etapa 1**, la sanción del entrenador bloquea sólo en el club que la cargó.

### 2.4 Lo que queda fuera

- **Jockeys:** las reglas no los mencionan, y además hoy no se pueden cargar por el bug del enum. ¿Una suspensión de jockey tiene que frenar la monta?
  Sería otro trigger (sobre `jockey_titular_id` y `rpc_cambiar_monta`).
- **Propietario y caballeriza:** no bloquean.
- **Retención de premios por doping** (`liquidaciones`: retenido + `liberar_linea`): sigue aparte. Podría vincularse con `es_doping` más adelante.

## 3. Plan de fase 2 (sólo propuesto)

1. Migración en el sandbox:
   - columnas + CHECKs + trigger de sanciones;
   - backfill de las 5;
   - `fn_sancion_bloqueante` + `trg_insc_sancion` + `validar_inscripcion` v2;
   - rollback.
2. Probe en el sandbox: matriz caballo/entrenador/ambos × caminos (INSERT staff, ratificar, `rpc_inscribir`, `rpc_modificar_inscripcion`), más:
   - fecha de la reunión dentro y fuera del período;
   - provisoria → definitiva;
   - doping achicado sin motivo, que tiene que dar rechazo;
   - edición de una inscripción de R9 en campos que no disparan el chequeo;
   - compartida de otro club (caballo), con mutantes.
3. Pantallas (sanciones, inscripciones, ratificación y portal) y su probe.
4. Prod: fuera del horario de Yesi, con md5 = sandbox.

## 4. Preguntas para Yesi y Fede

1. Las 4 sanciones del 25/09: ¿qué caballo va con qué entrenador? ¿Cada una alcanza a ambos o sólo a quien figura?
2. La de doping de mayo (`ade49423…`): ¿era sólo el caballo, o correspondía "ambos"?
3. Mientras es **provisoria**, ¿bloquea igual que una definitiva? (Propuesta: sí.)
4. Si se abre el frasco testigo y el contraanálisis **no** confirma: ¿se revoca? ¿Y si confirma, cambian las fechas al pasar a definitiva (la
   provisoria no tiene fin hasta entonces)?
5. Una sanción **apelada**: ¿sigue bloqueando? (Propuesta conservadora: sí, salvo que la resolución dé efecto suspensivo.)
6. ¿Las de doping se comparten con otros hipódromos por defecto?
7. ¿Las suspensiones de **jockey** tienen que frenar la monta? Hoy no se pueden ni cargar (bug del enum).
8. ¿Ratificar a alguien sancionado después de inscripto se frena, o sólo avisa? (Propuesta: se frena; la secretaría pasa la inscripción a forfait o
   cambia el entrenador.)
9. ¿El mensaje al portal puede decir "sancionado", o sigue el genérico "no está habilitado"?

## Anexo A — relevamiento del código (origin/main)

### A.1 Secretaría (INSERT/UPDATE directo con RLS)

RLS: `migrations/sec_rls_fase2b_escritura.sql:46-55`. INSERT/UPDATE/DELETE = `NOT fn_is_portal_user() AND (super_admin OR fn_club_de_carrera(carrera_id) = club del usuario)`. No valida nada más.

| archivo:línea | qué | validaciones hoy |
|---|---|---|
| inscripciones.html:1142 a 1190 `saveRecord` | INSERT (1182) / UPDATE (1181) con `spc_id`, `entrenador_id`, jockey, suplente, caballeriza, `estado` (select libre) | Sólo exige SPC y turno, más dos confirmaciones: falta de caballeriza y revisión pendiente al ratificar. **No llama a `validar_inscripcion`.** Sin edad, sexo, cupo, ventana ni sanción. |
| ratificacion.html:917-923 `ratificar` | UPDATE `estado='ratificado'`, `peso_final` | Confirmación si `revision_pendiente`; botón deshabilitado sin jockey. Sin sanción. |
| ratificacion.html:944-946 | UPDATE a `inscripto` ("Volver") | Sólo confirmación. |
| ratificacion.html:878 | UPDATE `jockey_titular_id` | Sin validación; si la carrera es oficial, la frena P0084. |
| resultados.html:2158 a 2184 | `rpc_cambiar_monta` | Sólo jockey. |
| inscripciones.html:1006 | Edge Function `studbook-buscar` 'traer' | Crea el SPC, no la inscripción. |

### A.2 Portal (siempre por RPC SECURITY DEFINER; el portal no tiene INSERT/UPDATE por RLS)

| archivo:línea | qué |
|---|---|
| portal.html:1096 a 1109 `anotar` | `rpc_inscribir` |
| portal.html:1226 a 1254 `traerYAnotar` | `studbook-buscar` (crea el SPC) → `anotar()` |
| portal.html:1540 | `rpc_modificar_inscripcion` |
| portal.html:1374 a 1386 | `rpc_baja_inscripcion` (DELETE o forfait: no habilita a correr) |

### A.3 RPCs

| archivo:línea | función | validaciones |
|---|---|---|
| migrations/portal_monta_al_anotar.sql:54-202 | `rpc_inscribir` (INSERT 185-198) | Entidad de portal y usuario activo; el SPC existe; reunión publicada; carrera no anulada; ventana fail-closed; caballeriza y entrenador del club; jockey del padrón; anti-duplicado. **Llama a `validar_inscripcion` (170-176).** |
| migrations/rpc_modificar_inscripcion.sql:31-238 | `rpc_modificar_inscripcion` (UPDATE 193-198: caballeriza, **entrenador**, jockey, suplente) | Fila propia; ventana; padrón del club; ratificado con jockey. **No llama a `validar_inscripcion` ni mira sanciones.** |
| migrations/fn_edad_reglamentaria.sql:77-154 | `validar_inscripcion` | SPC activo; edad a la fecha de la reunión; sexo; **sanción sólo del SPC en `v_sanciones_vigentes` (138-143)**; cupo; mensaje genérico al portal. |
| migrations/rpc_cambiar_monta.sql:126-328 | `rpc_cambiar_monta` | Rol y club; jockey de tipo jockey/ambos (no exige que esté activo); plata comprometida en una carrera oficial. Sin sanción. |
| migrations/rpc_baja_inscripcion_forfait.sql:57-165 | `rpc_baja_inscripcion` | No crea ni habilita. |
| migrations/rpc_spc_alta_studbook_staff.sql | `rpc_spc_alta_studbook_portal` | Crea SPC, no inscripciones. |

### A.4 Migraciones / tools (manuales)

`merge_duplicados_spc.sql:90` (UPDATE `spc_id`; no aplicada), `data/prof_carga_20j_PREVIEW.sql:74`, `personas_r8_tanda_5.sql:87`, `montas_r6_correccion.sql`, `tools/seed_9999_resultados.sql:67-85`. Las tandas de SPC no insertan inscripciones.

### A.5 Sanciones y resoluciones en el código

- `CREATE TABLE sanciones/resoluciones/resolucion_entidades` **no está en `migrations/`**: se crearon por el dashboard. La copia de prod está en `tests/local/sanciones_sandbox.sql:11-53`.
- `sec_autoregistro_gate1.sql:36-70`: `sanciones_select` por `alcance` (staff de otro club ve las de `alcance <> 'club'`).
- `sanciones_insert_update_staff.sql:33-51`: INSERT/UPDATE staff del club o super_admin. `resoluciones_sanciones_autor.sql` + `audit_resoluciones_sanciones.sql`: autoría y auditoría.
- `sanciones.html:129,161,366`: categoría `'jockey'` (no está en el enum). `:382`: `alcance: 'club'` fijo. No tiene campos de resolución, doping, provisoria ni frasco.
- `resoluciones.html`: no usa `resolucion_entidades` y no se vincula con sanciones.
- `docs/PORTAL_VALIDACION_INSCRIPCION.md:80,203-216`: antecedente. Bajo RLS del portal `v_sanciones_vigentes` daba 0 filas y la sanción se salteaba; se arregló con SECURITY DEFINER y mensaje genérico.
- `docs/ISSUES.md:2766 a 2811` (ISSUE-097): las resoluciones 39 y 40 (doping y suspensión de un entrenador) se cargaron sin autor, lo que llevó a la autoría y auditoría en la fila.
- `docs/CONTEXTO.md:15,20`: compartir sanciones entre hipódromos es parte del alcance del sistema. `docs/MODULOS.md:100-101` está desactualizado.
- **"Frasco testigo", "contraanálisis", "provisoria/definitiva": 0 apariciones** en todo el repo (código, SQL y docs).

### A.6 Esquema de `sanciones` en prod (columnas)

id, club_id NOT NULL, entidad_tipo (enum entidad_sancionada: profesional, spc, propietario, caballeriza) NOT NULL, entidad_id NOT NULL, tipo_sancion varchar NOT NULL, motivo, codigo_resolucion, fecha_inicio NOT NULL, fecha_fin, alcance varchar NOT NULL default 'club', estado (enum estado_sancion: activa, cumplida, apelada, revocada) default 'activa', resolucion_url, notas, creado_por, created_at, modificado_por, modificado_at. Sin CHECKs propios; FKs a clubs y usuarios. Triggers: `trg_audit_sanciones`, `trg_sanciones_autor`. Políticas: select (staff del club o compartidas, portal las propias), insert/update (staff del club o super_admin), delete (super_admin).

`v_sanciones_vigentes`: `SELECT … FROM sanciones WHERE estado = 'activa' AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)`.

## Verificación de push

```
$ git ls-remote origin reports
7e7fc48c38688af269ef8859f8cd1223ee829dea
$ git rev-parse HEAD
7e7fc48c38688af269ef8859f8cd1223ee829dea
```
Chequeo de datos personales sobre lo agregado: vacío.
