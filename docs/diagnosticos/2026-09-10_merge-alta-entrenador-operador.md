# Merge y verificación en producción — alta de entrenador para el rol operador

**Fecha:** 2026-09-10
**Rama del informe:** `reports`
**Merge:** `c540aa0ebeb5eaad3b88b28d3ae9899ab44d641f` (`--no-ff` de `fix/alta-entrenador-operador`)
**Docs de estado:** `842aa43709c9c50850b536ad2a66bc253adbc88c`
**Base previa de `main`:** `eface80078b99a56c9ae3160053cd8fd0c425d31`

Informes anteriores de esta línea de trabajo:
- `docs/diagnosticos/2026-09-10_alta-entrenador-desde-solicitudes.md` (diagnóstico)
- `docs/diagnosticos/2026-09-10_fix-alta-entrenador-operador.md` (el fix, pre-merge)

## Guards verificados

```
$ pwd
/home/clio/dev/SGH
```

```sql
select count(*) as spcs_count from spcs;
```
```json
[{"spcs_count":181}]
```

---

## Lo que se preguntó, respondido

### El conteo

| corrida | asserts | mutantes |
|---|---|---|
| pre-merge, sobre el working tree | **30/30** | **14/14 muertos** |
| post-deploy, sobre los archivos bajados de `sigh.com.ar` | **30/30** | **14/14 muertos** |

Estaba en el informe anterior, sección PROBE — pero enterrado adentro de 40 líneas de salida
cruda, en las líneas `30/30 OK` y `✅ TANDA LIMPIA — 14 probados · 14 muertos`. Un grep por
"asserts" o por "mutantes" no lo encuentra, porque el probe no imprime esas palabras en el
resumen. **Corregido para la próxima**: la tabla de arriba va al principio.

### El punto 4 — se hizo

**La mitigación por UI entró en el merge y está viva.** Lo único que quedó como issue es el
**índice único de base de datos** (ISSUE-079), que es DDL.

El motivo de haberlo hecho y no diferido está medido:

```sql
select indexname, indexdef from pg_indexes where tablename='profesionales' order by indexname;
```
```json
[{"indexname":"idx_profesionales_club","indexdef":"CREATE INDEX idx_profesionales_club ON public.profesionales USING btree (club_id)"},
 {"indexname":"profesionales_pkey","indexdef":"CREATE UNIQUE INDEX profesionales_pkey ON public.profesionales USING btree (id)"}]
```

Eso es todo: **`profesionales` no tiene ningún índice único por documento.** `propietarios` sí lo
tiene (`ux_propietarios_club_doc`). O sea, el pedido habilitaba el alta manual de a uno sobre la
única de las dos tablas donde la base no frena el duplicado. Diferir el aviso habría sido abrir el
camino y la trampa juntos.

**Qué hace** (`profesionales-duplicados.js`, compartido por las dos pantallas): al salir de
Apellido o de N° de documento en un **alta nueva**, muestra las fichas parecidas del mismo club.
Dos señales separadas a propósito:

| señal | presentación | por qué |
|---|---|---|
| mismo `documento_nro` en el club | panel rojo, *"Si es la misma persona, cerrá y editá esa ficha en vez de crear otra"* | es un duplicado real y la base no lo frena |
| apellido parecido (`ilike %ape%`) | panel gris, con documento y tipo de cada uno a la vista | en este padrón es lo **normal** |

**No bloquea, y ZUBIARRAIN/ZUBIRIA es exactamente la razón:**

```sql
select id,nombre,apellido,tipo,documento_nro,club_id from profesionales
where apellido ilike '%zubi%' or nombre ilike '%zubi%' order by apellido;
```
```json
[{"id":"1f46b478-5edf-4cb5-be36-957d7fec99d3","nombre":"SANTIAGO","apellido":"ZUBIARRAIN","tipo":"entrenador","documento_nro":"14527442","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c"},
 {"id":"674157cf-9393-419e-bf50-0881802b785e","nombre":"SANTIAGO","apellido":"ZUBIRIA","tipo":"jockey","documento_nro":"39342378","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c"}]
```

Mismo nombre de pila, apellidos parecidos, **documentos distintos**: son dos personas. Y no es un
caso aislado — en Dolores hay 5 DIESTRA, 5 GONZALEZ, 3 CANTO, 3 ALDAY y 3 DIAZ, familias del turf,
todas personas distintas (la consulta completa está en el informe anterior, §4). Un corte duro se
dispararía en la mayoría de las cargas y se aprendería a saltear en una semana. Por eso el aviso
**informa** y muestra siempre el documento y el tipo al lado de cada parecido: es el dato con el
que se descartan. El assert **A13b** fija ese caso con esos dos registros reales.

**Lo que falta, y sigue faltando** (ISSUE-079, abierto):

```sql
CREATE UNIQUE INDEX ux_profesionales_club_doc ON profesionales
  (club_id, documento_tipo, documento_nro) WHERE documento_nro IS NOT NULL;
```

Se puede crear sin limpieza previa —hoy hay **0 duplicados exactos** por
`(club_id, documento_tipo, documento_nro)` sobre las 145 filas con documento— pero es DDL y no se
aplicó. **Hoy el duplicado exacto de DNI se avisa en pantalla y la base lo sigue aceptando.**

---

## El merge

```bash
git checkout main && git pull --ff-only origin main
git merge --no-ff fix/alta-entrenador-operador -F <mensaje>
```
```
Merge made by the 'ort' strategy.
 CHANGELOG.md                             |  73 ++++
 CLAUDE.md                                |   2 +
 docs/ISSUES.md                           | 159 ++++++-
 jockeys.html                             | 136 +++++-
 profesionales-duplicados.js              | 108 +++++
 profesionales.html                       | 173 +++++++-
 tests/README.md                          |  42 ++
 tests/probe_alta_entrenador_operador.mjs | 701 +++++++++++++++++++++++++++++++
 8 files changed, 1358 insertions(+), 36 deletions(-)
 create mode 100644 profesionales-duplicados.js
 create mode 100644 tests/probe_alta_entrenador_operador.mjs
```

```bash
git log --oneline -3
```
```
c540aa0 merge: la secretaria puede crear entrenadores (ISSUE-078, 073, 079)
e5050cd fix: la secretaria puede crear entrenadores (ISSUE-078, 073, 079)
eface80 docs: ISSUE-075 reescrito (son dos plazos, no dos cálculos) e ISSUE-077 nuevo
```

```bash
git push origin main
git ls-remote origin main
git rev-parse HEAD
```
```
To github.com:mdqclio/SGH.git
   eface80..c540aa0  main -> main
c540aa0ebeb5eaad3b88b28d3ae9899ab44d641f	refs/heads/main
c540aa0ebeb5eaad3b88b28d3ae9899ab44d641f
```

Después, un segundo commit con los estados de los issues (`842aa43`), que es lo que hay en `main`
ahora:

```
To github.com:mdqclio/SGH.git
   c540aa0..842aa43  main -> main
842aa43709c9c50850b536ad2a66bc253adbc88c	refs/heads/main
842aa43709c9c50850b536ad2a66bc253adbc88c
```

---

## Verificación contra `sigh.com.ar`

### El deploy tardó ~30 s

Poll cada 10 s comparando el md5 del HTML servido contra el del commit:

```bash
WANT=$(md5sum $SP/prod/local_profesionales.html | cut -d' ' -f1)
i=0
until [ "$(curl -sL "https://sigh.com.ar/profesionales.html?v=$RANDOM$i" | md5sum | cut -d' ' -f1)" = "$WANT" ] || [ $i -ge 60 ]; do i=$((i+1)); sleep 10; done
echo "intentos=$i (x10s)"; echo "esperado=$WANT"
echo "servido =$(curl -sL "https://sigh.com.ar/profesionales.html?v=$RANDOM" | md5sum | cut -d' ' -f1)"
```
```
intentos=3 (x10s)
esperado=e2057bd73a4d47b79acdf4f0e4106308
servido =e2057bd73a4d47b79acdf4f0e4106308
```

Un chequeo hecho **antes** de que el CDN diera vuelta la caché mostraba todavía la versión vieja
(`0a975d0c…`, que es el md5 de `profesionales.html` en `eface80`). Queda anotado porque es el modo
de falla del que avisa `CLAUDE.md`: sin poll, se verifica contra contenido viejo y parece que el
deploy no salió.

### MD5 de los cuatro archivos — con `-L`

```bash
for f in profesionales.html jockeys.html profesionales-duplicados.js solicitudes.html; do
  curl -sL "https://sigh.com.ar/$f?v=$RANDOM" -o $SP/prod/serv_$f
done
for f in …; do
  L=$(md5sum <local_$f|cut -d' ' -f1); P=$(md5sum <serv_$f|cut -d' ' -f1)
  printf "%-30s local=%s prod=%s %s\n" "$f" "$L" "$P" "$([ "$L" = "$P" ] && echo IGUAL || echo DISTINTO)"
done
```
```
profesionales.html             local=e2057bd73a4d47b79acdf4f0e4106308 prod=e2057bd73a4d47b79acdf4f0e4106308 IGUAL
jockeys.html                   local=507213a748002af8019f1e6e43a2a946 prod=507213a748002af8019f1e6e43a2a946 IGUAL
profesionales-duplicados.js    local=dfa880021c57436abe4919c439721156 prod=dfa880021c57436abe4919c439721156 IGUAL
solicitudes.html               local=9b5c0b090ab28fd2386e1043f52610be prod=9b5c0b090ab28fd2386e1043f52610be IGUAL
```

Los `local_*` salen de `git show c540aa0:<archivo>`, no del working tree. **4/4 idénticos**,
incluido el archivo nuevo `profesionales-duplicados.js` — que además confirma que GitHub Pages lo
está sirviendo y no da 404 (antes del deploy devolvía la página de error, md5 `c1f9838a…`).

`solicitudes.html` no se tocó en este cambio; se baja igual porque el probe corre su
`buscarFichas()` real, y hay que probar el que está servido.

### Marcadores del fix en el HTML servido

```bash
grep -c "f-tipo" serv_profesionales.html serv_jockeys.html
grep -c "eq('club_id', CLUB_ID).select('id')" serv_profesionales.html serv_jockeys.html
grep -c "btn-nuevo').style.display" serv_profesionales.html
```
```
serv_profesionales.html:4
serv_jockeys.html:4
serv_profesionales.html:3
serv_jockeys.html:2
--- el gate viejo ya no esta ---
0
```

El selector de tipo está en las dos pantallas, los tres caminos de escritura acotados por club
en `profesionales.html` (modal, toggle, delete) y los dos en `jockeys.html` (modal, delete), y
**el gate de rol sobre `#btn-nuevo` ya no existe en el archivo que sirve producción**.

---

## Probe contra el HTML servido

Los cuatro archivos que corre el probe son los **bajados de `sigh.com.ar`**, no los del repo:

```bash
set -a; . ./.env; set +a
PROFESIONALES_HTML=$SP/prod/serv_profesionales.html \
JOCKEYS_HTML=$SP/prod/serv_jockeys.html \
SOLICITUDES_HTML=$SP/prod/serv_solicitudes.html \
DUPLICADOS_JS=$SP/prod/serv_profesionales-duplicados.js \
node tests/probe_alta_entrenador_operador.mjs
```

Salida cruda completa:

```
   línea de base: total=185 dolores=174 otro=11 nulos=0

── Probe · alta de entrenador para el rol operador (profesionales.html / jockeys.html) ──
   profesionales=/tmp/claude-1000/-home-clio-dev-SGH/77bc5cb7-0127-4542-94c9-a9ac2a337b94/scratchpad/prod/serv_profesionales.html
   jockeys      =/tmp/claude-1000/-home-clio-dev-SGH/77bc5cb7-0127-4542-94c9-a9ac2a337b94/scratchpad/prod/serv_jockeys.html
   solicitudes  =/tmp/claude-1000/-home-clio-dev-SGH/77bc5cb7-0127-4542-94c9-a9ac2a337b94/scratchpad/prod/serv_solicitudes.html
   duplicados   =/tmp/claude-1000/-home-clio-dev-SGH/77bc5cb7-0127-4542-94c9-a9ac2a337b94/scratchpad/prod/serv_profesionales-duplicados.js
   dnis_fixture ={"A":"77027316","B":"78027316","C":"79027316","D":"76027316","E":"75027316"}
 ✅ A0) la línea de base no tiene fichas huérfanas (club_id NULL) antes de empezar  → nulos=0
 ✅ A1) ⭐ corriendo el load() REAL como rol `operador`, "+ Nuevo Entrenador" NO queda oculto  → style.display=undefined · el botón sigue en el HTML=true
 ✅ A2) cardHTML() le da Editar al operador (la policy de UPDATE es fn_is_staff, que lo incluye)  → operador_tiene_editar=true · admin=true
 ✅ A2b) …y NO le da Eliminar, porque profesionales_delete es fn_is_super_admin: sería un botón que miente. El super_admin sí lo ve  → operador_tiene_eliminar=false · admin=true
 ✅ A3) saveRecord() de profesionales.html crea la ficha CON club_id del hipódromo activo  → toasts=[{"msg":"Entrenador creado","tipo":"success"}] · fila={"id":"6aa264d0-13d0-44b3-9bdf-a20dc187fc0a","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"Luciana","apellido":"ZZPROBEALTAENT","tipo":"entrenador","documento_tipo":"DNI","documento_nro":"77027316","estado":"activo","activo":true,"patente":"ENT-PROBE"}
 ✅ A3b) y el resto del payload llegó entero, con el DNI normalizado por parseDNI  → {"id":"6aa264d0-13d0-44b3-9bdf-a20dc187fc0a","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"Luciana","apellido":"ZZPROBEALTAENT","tipo":"entrenador","documento_tipo":"DNI","documento_nro":"77027316","estado":"activo","activo":true,"patente":"ENT-PROBE"}
 ✅ A4) ⭐ buscarFichas() de solicitudes.html la encuentra por DNI exacto y la marca EXACTO — el botón "Vincular y aprobar" se habilita  → exactas=[{"id":"6aa264d0-13d0-44b3-9bdf-a20dc187fc0a","nombre":"Luciana","apellido":"ZZPROBEALTAENT","documento_nro":"77027316","tipo":"entrenador","hipodromo_patente":null}] · sugeridas=0
 ✅ A4b) …y el buscador manual de la bandeja también — circuito completo profesionales.html → solicitudes.html  → sugeridas=[{"id":"6aa264d0-13d0-44b3-9bdf-a20dc187fc0a","ap":"ZZPROBEALTAENT"}]
 ✅ A5) con el selector en "Entrenador", la ficha queda `entrenador` y aparece en el listado de esta pantalla  → tipo=entrenador · TIPOS_PANTALLA=["entrenador","ambos"]
 ✅ A5b) ⭐ eligiendo "Jockey" desde profesionales.html la ficha queda `jockey` — el tipo sale del selector, no de una constante escondida en el código  → tipo=jockey · toasts=[{"msg":"Entrenador creado","tipo":"success"},{"msg":"Quedó como Jockey: la vas a encontrar en la pantalla de Jockeys.","tipo":"success"}]
 ✅ A6) ⭐ un alta hecha desde jockeys.html eligiendo "Entrenador" queda `entrenador`, no `jockey` — era el defecto del tipo fijo  → fila={"id":"8b303866-349e-4ed7-a196-348fa5ec2aac","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"Desde Jockeys","apellido":"ZZPROBEALTAENT","tipo":"entrenador","documento_tipo":"DNI","documento_nro":"78027316","estado":"activo","activo":true,"patente":null} · toasts=[{"msg":"Jockey creado","tipo":"success"},{"msg":"Quedó como Entrenador: la vas a encontrar en la pantalla de Entrenadores.","tipo":"success"}]
 ✅ A6b) …y avisa que la ficha quedó fuera de este listado, en vez de dejarla "desaparecer"  → [{"msg":"Jockey creado","tipo":"success"},{"msg":"Quedó como Entrenador: la vas a encontrar en la pantalla de Entrenadores.","tipo":"success"}]
 ✅ A6c) coherencia de los dos listados: la ficha `entrenador` está en Entrenadores y NO en Jockeys, y los dos filtran por club  → en_prof=131 · en_jock=47
 ✅ A6d) ahora se puede crear un `ambos`, y aparece en LOS DOS listados  → tipo=ambos
 ✅ A7) openModal() precarga el tipo REAL de la ficha: al editar un `ambos` desde Entrenadores, el selector viene en `ambos` y no lo degrada  → f-tipo="ambos"
 ✅ A7b) …y en un alta nueva el selector arranca en el tipo de la pantalla  → f-tipo="entrenador" · TIPO_DEFAULT=entrenador
 ✅ A8) editar por id una ficha de otro club es un no-op: no la pisa NI la mueve de hipódromo  → {"id":"40b7614c-3275-4873-b392-0a9b8f3638dc","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","nombre":"Ajeno","tipo":"entrenador","estado":"activo"}
 ✅ A8b) …y avisa, en vez de cantar "Entrenador actualizado" sobre 0 filas  → [{"msg":"No se pudo actualizar: la ficha no pertenece a este hipódromo.","tipo":"error"}]
 ✅ A9) el toggle rápido de estado tampoco puede tocar una ficha de otro club  → estado={"estado":"activo","activo":true} · toasts=[{"msg":"No se pudo actualizar: la ficha no pertenece a este hipódromo.","tipo":"error"}]
 ✅ A10) el DELETE tampoco: la ficha de otro club sigue existiendo y la pantalla lo dice  → sigue=true · toasts=[{"msg":"No se pudo eliminar: hace falta permiso de super_admin.","tipo":"error"}]
 ✅ A8c) editar una ficha del propio club sigue guardando y no le cambia el club (el acote no es un falso positivo)  → {"id":"6aa264d0-13d0-44b3-9bdf-a20dc187fc0a","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"Luciana","apellido":"ZZPROBEALTAENT","tipo":"entrenador","documento_tipo":"DNI","documento_nro":"77027316","estado":"inactivo","activo":false,"patente":"ENT-PROBE-2"} · toasts=[{"msg":"Entrenador actualizado","tipo":"success"}]
 ✅ A11) el aviso detecta el duplicado REAL: mismo documento en el mismo club  → porDocumento=["6aa264d0-13d0-44b3-9bdf-a20dc187fc0a"]
 ✅ A11b) …y el mismo apellido lo lista aparte, sin repetir la ficha que ya salió por documento  → porApellido=["ZZPROBEALTAENT/Desde Jockeys","ZZPROBEALTAENT/Jockey Desde Entrenadores","ZZPROBEALTAENT/Los Dos"]
 ✅ A12) el aviso NO cruza clubes: la ficha de "Mi Club Hípico" con el mismo apellido no sale  → ids=["8b303866-349e-4ed7-a196-348fa5ec2aac","34667283-17b5-4cbd-a2c8-1f1e0e30557b","5c0d0641-6f53-4ba0-a551-3c406d27b01d","6aa264d0-13d0-44b3-9bdf-a20dc187fc0a"]
 ✅ A13) un apellido de menos de 3 letras NO dispara consulta: traería medio padrón y no es una señal  → {"porDocumento":[],"porApellido":[],"consultado":false}
 ✅ A13b) con "ZUBI" trae los dos parecidos reales del padrón, con documentos DISTINTOS a la vista — es un falso positivo legítimo y por eso no puede bloquear  → ["ZUBIARRAIN/14527442/entrenador","ZUBIRIA/39342378/jockey"]
 ✅ A14) `excluirId` saca a la propia ficha: editando, no se avisa a sí misma  → porDocumento=0 · porApellido=3
 ✅ A14b) los comodines de PostgREST van escapados: un apellido con % no matchea de más  → escapado=50\%\_x · normalizado=acuna
 ✅ Z1) teardown por estado: ninguno de los ids creados sigue existiendo, y no queda ninguna fila con el apellido del fixture  → ids_creados=5 · siguen_vivos=[] · por_apellido=[]
 ✅ Z2) teardown por conteo: total, Dolores, otro club y huérfanos vuelven a la línea de base  → base={"total":185,"dolores":174,"otro":11,"nulos":0} · fin={"total":185,"dolores":174,"otro":11,"nulos":0}

30/30 OK
```

## Mutantes contra el HTML servido

Mismos cuatro archivos de producción; el runner los muta sobre copias en `/tmp`, el repo no se
toca.

```bash
PROFESIONALES_HTML=… JOCKEYS_HTML=… SOLICITUDES_HTML=… DUPLICADOS_JS=… \
node tests/probe_alta_entrenador_operador.mjs --mutantes
```

Salida cruda completa:

```
═══ MUTATION TESTING · 14/14 mutantes ═══
(copias en /tmp/mut-alta-entrenador-ASjPQ5 — el repo no se toca)

✅ M1 muere — BUG ORIGINAL — load() vuelve a esconder "+ Nuevo Entrenador" salvo super_admin  [esperaba matar A1; murieron A1]
✅ M2 muere — BUG ORIGINAL — cardHTML vuelve a dar Editar sólo a super_admin  [esperaba matar A2; murieron A2]
✅ M3 muere — Eliminar se muestra a cualquiera — botón que miente (la policy es super_admin)  [esperaba matar A2b; murieron A2b]
✅ M4 muere — el payload del alta pierde club_id: la ficha nace huérfana e invisible para la bandeja  [esperaba matar A3,A4,A4b; murieron A3,A4,A4b]
✅ M5 muere — BUG ORIGINAL — en profesionales.html el tipo vuelve a estar fijo en el código  [esperaba matar A5b,A6d; murieron A5b,A6d]
✅ M6 muere — BUG ORIGINAL — en jockeys.html el tipo vuelve a estar fijo en 'jockey'  [esperaba matar A6,A6b; murieron A6,A6b]
✅ M7 muere — openModal no precarga el tipo real: editar un 'ambos' lo degrada  [esperaba matar A7; murieron A7]
✅ M8 muere — ISSUE-073 — el UPDATE del modal pierde el acote por club  [esperaba matar A8; murieron A8]
✅ M9 muere — el UPDATE de 0 filas canta "actualizado" igual  [esperaba matar A8b; murieron A8b]
✅ M10 muere — ISSUE-073 — el toggle rápido de estado pierde el acote por club  [esperaba matar A9; murieron A9]
✅ M11 muere — el DELETE pierde el acote por club y borra una ficha de otro hipódromo  [esperaba matar A10; murieron A10]
✅ M12 muere — el helper de duplicados deja de buscar por documento — el duplicado real pasa mudo  [esperaba matar A11; murieron A11]
✅ M13 muere — el helper de duplicados pierde el filtro por club: sugiere fichas de otro hipódromo  [esperaba matar A12; murieron A12]
✅ M14 muere — el helper acepta apellidos de 1-2 letras y trae medio padrón como "parecido"  [esperaba matar A13; murieron A13]

✅ TANDA LIMPIA — 14 probados · 14 muertos
```

---

## El probe escribe en producción — verificación de que quedó limpio

Teardown por estado (Z1) y por conteo (Z2) arriba, más una verificación independiente por fuera
del probe, después de las dos corridas contra prod:

```sql
select count(*) total,
       count(*) filter (where apellido like 'ZZPROBE%') fixtures_sueltos,
       count(*) filter (where club_id is null) nulos,
       count(*) filter (where tipo='entrenador') entrenador,
       count(*) filter (where tipo='jockey') jockey,
       count(*) filter (where tipo='ambos') ambos
from profesionales;
```
```json
[{"total":185,"fixtures_sueltos":0,"nulos":0,"entrenador":133,"jockey":51,"ambos":1}]
```

185 filas, la misma línea de base de antes de empezar. Cero fixtures sueltos, cero huérfanas, y el
reparto por tipo intacto (133 / 51 / 1).

---

## Estado de la documentación en `main`

Actualizado en `842aa43`:

| doc | qué dice ahora |
|---|---|
| `docs/ISSUES.md` ISSUE-078 | ✅ RESUELTO y VIVO en `sigh.com.ar`, merge `c540aa0` |
| `docs/ISSUES.md` ISSUE-073 | ✅ RESUELTO y VIVO, mismo merge (iba junto con el 078) |
| `docs/ISSUES.md` ISSUE-079 | 🟡 ABIERTO — la mitigación por UI está viva, **el índice no se creó** |
| `CHANGELOG.md` | entrada del 2026-09-10 marcada VIVO, con el SHA y la verificación |

---

## Números de resumen

| dato | valor |
|---|---|
| SHA del merge | `c540aa0ebeb5eaad3b88b28d3ae9899ab44d641f` |
| SHA de `main` ahora | `842aa43709c9c50850b536ad2a66bc253adbc88c` |
| Archivos del merge | 8 · +1358 / −36 |
| Tiempo hasta que el CDN sirvió lo nuevo | ~30 s (3 polls de 10 s) |
| MD5 local vs servido | **4/4 idénticos** |
| Probe contra archivos de producción | **30/30 asserts** |
| Mutantes contra archivos de producción | **14/14 muertos** |
| `profesionales` antes / después | 185 / 185 · 0 fixtures sueltos · 0 huérfanas |
| Issues cerrados | ISSUE-078, ISSUE-073 |
| Issues abiertos | ISSUE-079 (índice único, DDL sin aplicar) |

---

## Lo que queda pendiente

1. **ISSUE-079 — el índice único.** Es lo único del punto 4 que no entró. `CREATE UNIQUE INDEX
   ux_profesionales_club_doc …`, con migración versionada en `migrations/` y aplicada por
   `apply_migration`. Hay 0 duplicados exactos, así que no necesita limpieza previa.
2. **Lo Gioia y Caporale.** Con esto vivo, Yesi las puede resolver sola: crear la ficha desde
   Entrenadores y volver a la bandeja. Son las dos pendientes de Dolores sin ficha. No las toqué
   —son datos de operación, no del fix—.
3. **Las policies siguen sin club.** `profesionales_update` es `fn_is_staff()` a secas: el acote de
   ISSUE-073 es de pantalla, no de base. Va con ISSUE-017.
4. **`jockeys.html` sigue mostrando Eliminar a todos.** Ahora avisa en vez de mentir, pero el botón
   está. Ocultarlo también ahí es decisión de producto: sería quitar algo que hoy se ve.
5. **El hook de `claude-seo`** quedó parcheado a `python3` en la caché del plugin; se revierte si el
   plugin se actualiza. Detalle en el informe anterior, sección final.

---

## Verificación de push a `origin`

(se completa abajo, después del primer push)
