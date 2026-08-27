# Relevamiento de la pantalla de Pagos — pendientes del 25/08 + los 4 pedidos de Valeria

| | |
|---|---|
| **Fecha** | 2026-08-27 |
| **SHA del código relevado** | `68444a2` — `main`, árbol limpio, sincronizado con `origin/main` |
| **SHA de este informe** | (este commit, branch `reports`) |
| **Alcance** | **SOLO LECTURA.** 10 `SELECT` por MCP, cero escritura. Ni un archivo de código tocado. Ningún merge. |
| **Archivo relevado** | `liquidaciones.html` (1090 líneas) · `liquidaciones-engine.js` |

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

SELECT count(*) AS spcs_count FROM spcs;
[{"spcs_count":181}]
```

`spcs = 181` coincide con el baseline de CLAUDE.md (2026-08-23). Ref del proyecto: `unlhcuanfrtpatoipwve`.

---

## Números de resumen

| # | | |
|---|---|---|
| **1** | Pendientes del 25/08 cerrados | **3 de 3** — ninguno quedó a medias |
| **2** | Pedidos de Valeria que ya están resueltos en el código | **1 de 4** (buscar por profesional) |
| **3** | Propietarios con deuda pagable cuyo "nombre" es una caballeriza, no una persona | **21 de 39** (54%) |
| **4** | Personas que hoy generan **dos** tarjetas y **dos** recibos por ser propietario y entrenador a la vez | **9** |
| **5** | Líneas pagables que no pueden resolver nº de carrera | **43 de 299** — y las 43 es correcto que no lo tengan |

---

# 1. Estado de los tres pendientes del 25/08

| | pendiente | estado | branch | SHA | ¿en `main`? |
|---|---|---|---|---|---|
| **a** | `es_titular` → `rol` en la búsqueda por caballeriza | ✅ **hecho** | `fix/cobros-busqueda-caballeriza` | `2199974` | **sí** |
| **b** | Rótulo del rol en el recibo | ✅ **hecho** — pasó de diagnóstico a fix | `fix/recibo-rotulo-rol` | `67f9371` | **sí** |
| **c** | B8 — control read-only de que no se tocó nada fuera de R8 | ✅ **cerrado** | doc rescatado en `1d163dd` | — | **sí** |

Los tres están vivos en producción. Ninguno quedó a medias, ninguno sin empezar.

## 1.a · `es_titular` → `rol` — HECHO

`liquidaciones.html:797-799`, hoy en `main`:

```javascript
const { data: cab, error: eCab } = await sb.from('caballeriza_responsables')
  .select('propietario_id, caballerizas(nombre)').eq('rol','propietario').eq('activo', true).not('propietario_id','is',null);
if (eCab) console.error('[cobrosBuscar/caballerizas]', eCab);
```

Diff aplicado en `2199974` (18/08):

```diff
-    const { data: cab } = await sb.from('caballeriza_responsables')
-      .select('propietario_id, caballerizas(nombre)').eq('es_titular', true).not('propietario_id','is',null);
+    const { data: cab, error: eCab } = await sb.from('caballeriza_responsables')
+      .select('propietario_id, caballerizas(nombre)').eq('rol','propietario').eq('activo', true).not('propietario_id','is',null);
+    if (eCab) console.error('[cobrosBuscar/caballerizas]', eCab);
```

Del mensaje del commit: `es_titular` **no existía como columna**. La query fallaba entera con `42703`, y como se destructuraba sólo `{ data: cab }` sin mirar el error, quedaba en `[]` en silencio. No es que fallaran los 40 provisorios: **fallaban las 236 caballerizas**. El `console.error` se agregó por eso.

Criterio de reemplazo: `rol='propietario' AND activo=true` — 236 filas para 236 caballerizas, 1:1, excluye copropietarios. Probe `tests/probe_cobros_caballeriza.mjs`, 14/14, con sensibilidad verificada (contra `main` viejo daba 0 caballerizas y exit 1).

## 1.b · Rótulo del rol en el recibo — HECHO, y contesta la pregunta

**Se había pedido diagnóstico. Se hizo el diagnóstico Y el fix, en el mismo commit `67f9371`.**

**La conclusión del diagnóstico, textual del commit: el recibo NO traía el dato.** No era que lo tuviera y no lo mostrara. `imprimirReciboCobro` seleccionaba `concepto, monto_neto, posicion, reunion_id, inscripcion_id` — sin `descripcion`, sin `concepto_tipo` y sin `beneficiario_tipo`, que son **las tres columnas donde el rol vive**. Como la fila impresa usaba sólo `concepto`, el premio del propietario y el del entrenador para el mismo caballo y el mismo puesto salían con el mismo texto (`"Carrera 1 — 1° puesto"`) y no se distinguían.

El fix agregó las tres columnas al SELECT y una función derivadora, hoy en `liquidaciones.html:929-936`:

```javascript
const ROL_POR_BENEFICIARIO = { propietario:'Propietario', profesional:'Profesional', club:'Club' };
function rolDeLinea(l){
  if (l.concepto_tipo === 'bono') return 'Propietario';
  if (l.concepto_tipo === 'incentivo_entrenador') return 'Entrenador';
  if (l.concepto_tipo === 'incentivo_jockey') return 'Jockey';
  const m = /—\s*(Propietario|Entrenador|Jockey)\b/.exec(l.descripcion || '');
  if (m) return m[1];
  return ROL_POR_BENEFICIARIO[l.beneficiario_tipo] || '';
}
```

Se consume en dos lugares del recibo: columna **Rol** por línea (`:955`) y el rol junto al nombre en el encabezado (`:977`), derivado de las líneas del propio recibo y no de `cobBenef.tipo`. Probe `tests/probe_recibo_rol.mjs`, 19/19 contra las 199 líneas de R8, 0 líneas sin rol.

⚠️ **Alcance del fix: el recibo, y sólo el recibo.** `rolDeLinea` no se usa en la pantalla — ver §4.

Quedó fuera a propósito, según el propio commit: el sub-reparto peón/capataz/sereno, y el vocabulario *entrenador* vs *cuidador*, que lo decide Fede.

## 1.c · B8 — CERRADO

`docs/B8_CONTROLES_FUERA_DE_R8.md`, en `main` (llegó en `1d163dd`, 22/08, "rescatar 17 diagnósticos de 3 ramas antes de borrarlas"). Encabezado: *"READ-ONLY. 5 SELECT, cero escritura. Re-corrido el 18/08 después de cerrar B11, con el estado final de la base."*

| control | criterio | medido | |
|---|---|---|---|
| Inscripciones de otras reuniones | 0 | **0** | ✅ |
| Liquidaciones de R6 y anteriores | 0 creadas / 0 escritas | **0 / 0** | ✅ |
| 213 preexistentes de Dolores | intactos, 40 adicionales | **213 + 40 = 253**, 0 modificados | ✅ |
| `club_secuencias` | sin cambios | `ultimo_numero` = 1, fila sin reescribir | ✅ |

Cierre textual: *"La operación no tocó nada fuera de R8. Con esto B8 queda cerrado y la secuencia completa —B0 a B11— verificada sin un solo criterio incumplido."*

> Nota: el `spcs = 183` que figura en ese doc es la foto del 18/08. El baseline vigente es 181 (unificación de duplicados del 23/08). No se reescribe, por la regla de CLAUDE.md.

## 1.d · Branches sin mergear relacionadas con Pagos

Una sola, duplicada:

| branch | SHA | remoto | contenido |
|---|---|---|---|
| `chore/propietarios-provisorios-r8` | `5dfb8e2` | `gone` | *"docs: pendiente — el rol deberia ser un campo propio, no un regex sobre descripcion"* |
| `bkp/chore/propietarios-provisorios-r8` | `5dfb8e2` | `gone` | idéntica (backup) |

**Es documental, no código.** Y anota exactamente la deuda que este relevamiento vuelve a encontrar en §4: el rol se deriva con un regex sobre `descripcion` en vez de ser una columna.

Las otras dos branches de Pagos (`fix/cobros-busqueda-caballeriza`, `fix/recibo-rotulo-rol`) están mergeadas y con el remoto borrado.

---

# 2. Número de carrera en la pantalla de Pagos

## 2.1 ¿Se trae? ¿Se selecciona? ¿Se muestra?

**Hay dos pantallas distintas dentro del tab Pagos y se comportan al revés.**

| pantalla | función | ¿trae el nº? | ¿lo muestra? |
|---|---|---|---|
| **Lista de beneficiarios** (la primera, con las tarjetas) | `cobrosBuscar` `:776-824` | **no** | **no** |
| **Detalle de una persona** (al tocar 🧾 Pagar) | `cobrosDetalle` `:826-890` | sí | **sí, columna "Carrera"** |
| Recibo impreso | `imprimirReciboCobro` `:938-993` | sí | sí |
| Tab Liquidaciones → Ver detalle | `verDetalle` `:553-577` | no | no |
| Tab Resumen → Pendientes | `loadResumen` `:690-694` | no | no (es agregado por persona, corresponde) |

El detalle **sí** lo trae y lo muestra, desde el 08/06:

```javascript
// :852
inscIds.length? sb.from('inscripciones').select('id,carrera_id,spcs(nombre),carreras(numero_turno,numero_carrera_programa)').in('id',inscIds):Promise.resolve({data:[]}),
// :856
const cellCarrera=l=>{const ins=inscMap[l.inscripcion_id];const n=ins?.carreras?.numero_carrera_programa ?? ins?.carreras?.numero_turno;return n?`C${n}`:'—';};
// :878 — cabecera
<th></th><th>Fecha</th><th>Carrera</th><th>Caballo</th><th>Puesto</th><th>Concepto</th><th style="text-align:right">Neto</th>
```

La lista de beneficiarios, en cambio, selecciona esto y nada más (`:789-791`):

```javascript
let qy = sb.from('liquidacion_detalle')
  .select('beneficiario_tipo,beneficiario_id,monto_neto,reunion_id,inscripcion_id')
  .eq('estado_linea','impago').neq('beneficiario_tipo','club').is('recibo_id', null);
```

y renderiza sólo nombre, tipo, cantidad de líneas y total (`:816-823`):

```javascript
<div><div class="liq-prof">${g.nombre}</div><div class="liq-recibo">${g.tipo} · ${g.n} línea(s) pagable(s)</div></div>
```

👉 **Ahí está el "una por una" de Valeria.** Para saber quién tiene líneas de la carrera 5 tiene que abrir el detalle de cada una de las 127 personas con deuda. Existe el filtro `cob-carrera` (`:196`), pero **filtra, no muestra**: acota el listado a esa carrera y sigue sin decir, dentro de cada tarjeta, de qué carrera es cada línea.

## 2.2 La regla `numero_carrera_programa ?? numero_turno` — se respeta en los 4 lugares

| archivo:línea | expresión |
|---|---|
| `liquidaciones-engine.js:177` | `car.numero_carrera_programa ?? car.numero_turno ?? ''` |
| `liquidaciones.html:771` | `c.numero_carrera_programa ?? c.numero_turno` |
| `liquidaciones.html:856` | `ins?.carreras?.numero_carrera_programa ?? ins?.carreras?.numero_turno` |
| `liquidaciones.html:953` | `ins?.carreras?.numero_carrera_programa ?? ins?.carreras?.numero_turno` |

**Cero offsets artificiales en todo el módulo.** Lo que se agregue tiene que usar la misma expresión.

## 2.3 Dato que cambia el diseño del fix: `liquidacion_detalle.carrera_id` ya existe

```sql
SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='liquidacion_detalle';
```

→ `carrera_id | uuid | YES` (columna nº 3). **La pantalla nunca la usa**: resuelve la carrera dando la vuelta por `inscripcion_id → inscripciones → carreras`.

Cobertura real:

```sql
SELECT concepto_tipo, beneficiario_tipo, count(*) n,
       count(*) FILTER (WHERE inscripcion_id IS NULL) sin_insc,
       count(*) FILTER (WHERE carrera_id IS NULL) sin_carrera_id
FROM liquidacion_detalle GROUP BY 1,2 ORDER BY 1,2;
```

| concepto_tipo | benef | n | sin_insc | sin carrera_id |
|---|---|---|---|---|
| premio | profesional | 176 | 1 | 0 |
| premio | propietario | 47 | 1 | 0 |
| bono | propietario | 19 | 1 | 0 |
| actuacion | profesional | 9 | 0 | 0 |
| **incentivo_jockey** | profesional | 44 | **44** | **44** |
| **incentivo_entrenador** | profesional | 108 | 0 | **108** |
| fondo_solidario | club | 90 | 0 | 0 |

Dos caminos complementarios, ninguno completo solo:

- `carrera_id` cubre premio/bono/actuación pero **no** los 108 `incentivo_entrenador`.
- `inscripcion_id` cubre los 108 incentivos de entrenador pero le faltan 3 líneas sueltas de premio/bono.
- Los **44 `incentivo_jockey` no tienen ninguno de los dos, y está bien**: son por reunión, no por carrera (`"Incentivo jockey por actuación en la reunión: $50.000,00"`). Su `—` es correcto, no un agujero.

Sobre las líneas que Valeria efectivamente ve:

```sql
SELECT estado_linea, count(*) lineas,
       count(*) FILTER (WHERE inscripcion_id IS NOT NULL) via_inscripcion_ok,
       count(*) FILTER (WHERE inscripcion_id IS NULL AND carrera_id IS NOT NULL) solo_carrera_id,
       count(*) FILTER (WHERE inscripcion_id IS NULL AND carrera_id IS NULL) sin_nada
FROM liquidacion_detalle WHERE beneficiario_tipo <> 'club' AND recibo_id IS NULL GROUP BY 1;
```

```json
[{"estado_linea":"impago",  "lineas":299,"via_inscripcion_ok":256,"solo_carrera_id":0,"sin_nada":43},
 {"estado_linea":"retenido","lineas":99, "via_inscripcion_ok":99, "solo_carrera_id":0,"sin_nada":0}]
```

**El camino actual (vía inscripción) resuelve 355 de 398 líneas pagables, y las 43 restantes son los incentivos de jockey, que no tienen carrera por definición.** El `?? carrera_id` de respaldo hoy no rescataría ninguna línea pagable — sólo 3 líneas del universo total. Vale agregarlo por corrección, no por volumen.

## 2.4 Qué habría que cambiar, archivo y línea

Nada de esto está aplicado. Es el señalamiento, no el fix.

| # | archivo:línea | cambio | tipo |
|---|---|---|---|
| 1 | `liquidaciones.html:789-791` | agregar `carrera_id` al `.select(...)` de `cobrosBuscar` | consulta |
| 2 | `liquidaciones.html:776-813` | resolver los nº de carrera de las líneas de cada grupo (join contra `carreras` de la reunión, o reusar el mapa que ya arma `cobLoadCarreras`) y acumularlos por beneficiario | consulta |
| 3 | `liquidaciones.html:818` | imprimir los nº en la tarjeta, junto a `${g.tipo} · ${g.n} línea(s)` — p.ej. `C3, C5, C7` | render |
| 4 | `liquidaciones.html:856` | extender `cellCarrera` con el respaldo por `carrera_id` cuando no hay `inscripcion_id` | consulta + render |
| 5 | `liquidaciones.html:953` | mismo respaldo en el recibo | consulta + render |

En 3, 4 y 5 el número se resuelve **siempre** como `numero_carrera_programa ?? numero_turno`.

---

# 3. Apellidos de propietarios y entrenadores

## 3.1 De dónde sale cada nombre

Ambos mapas se cargan en `init()` (`:475-485`):

```javascript
sb.from('profesionales').select('id,nombre,apellido,tipo,documento_nro').eq('club_id', CLUB_ID).order('apellido'),
sb.from('propietarios').select('id,nombre,nombre_stud,documento_nro').eq('activo', true),
...
(profs||[]).forEach(p=>{ profesionales[p.id]=p; });
(props||[]).forEach(p=>{ propietariosMap[p.id]=p; });
```

y se consumen en `nombreBenef` (`:745-748`):

```javascript
function nombreBenef(tipo, id){
  if (tipo==='propietario') return propietariosMap[id]?.nombre || '(propietario)';
  const p = profesionales[id]; return p ? `${p.apellido}, ${p.nombre}` : '(profesional)';
}
```

| beneficiario | campo | ¿apellido separado? |
|---|---|---|
| **Propietario** | `propietarios.nombre` (`:746`) | **no existe el campo** |
| **Entrenador / jockey** | `profesionales.apellido` + `profesionales.nombre`, concatenados en el render como `"APELLIDO, NOMBRE"` (`:747`) | **sí, separados en la DB** |

El mismo par se usa en el tab Liquidaciones (`:515-518`) y en `verDetalle` (`:557`).

## 3.2 El schema

```sql
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('propietarios','profesionales');
```

- **`propietarios` no tiene columna `apellido`.** Sus campos de identidad son `nombre` (varchar, NOT NULL), `nombre_stud` (nullable), `documento_nro` (nullable). Un solo campo de texto libre.
- **`profesionales` sí:** `nombre` NOT NULL y `apellido` NOT NULL, en columnas distintas.

## 3.3 Por qué Valeria no ve apellidos — respuesta separada por caso

**Entrenadores y jockeys: el dato está, se selecciona y se muestra con apellido.**

```sql
WITH b AS (SELECT DISTINCT beneficiario_id FROM liquidacion_detalle
           WHERE estado_linea='impago' AND recibo_id IS NULL AND beneficiario_tipo='profesional')
SELECT count(*) profesionales_con_deuda,
       count(*) FILTER (WHERE pf.club_id = '0649e9c5-...') en_el_mapa_dolores,
       count(*) FILTER (WHERE pf.apellido IS NULL OR pf.apellido='') sin_apellido,
       count(*) FILTER (WHERE pf.tipo='jockey') jockeys,
       count(*) FILTER (WHERE pf.tipo='entrenador') entrenadores,
       count(*) FILTER (WHERE pf.tipo='ambos') ambos
FROM b JOIN profesionales pf ON pf.id = b.beneficiario_id;
```

```json
[{"profesionales_con_deuda":88,"en_el_mapa_dolores":88,"fuera_del_mapa":0,
  "sin_apellido":0,"sin_dni":25,"jockeys":30,"entrenadores":57,"ambos":1}]
```

**88 de 88 en el mapa, 0 sin apellido.** No hay truncado en el render (`:818` no corta el texto ni tiene `text-overflow`). **No pude reproducir la mitad "entrenadores" del reporte de Valeria** — queda como pregunta abierta 1.

**Propietarios: el dato no está — y en el 54% de los casos no hay ninguna persona detrás.**

```sql
SELECT count(*) FILTER (WHERE p.notas ILIKE '%provisorio%') provisorios_con_deuda,
       count(*) FILTER (WHERE p.notas IS NULL OR p.notas NOT ILIKE '%provisorio%') reales_con_deuda,
       count(*) FILTER (WHERE p.documento_nro IS NULL OR p.documento_nro='') sin_dni,
       count(*) FILTER (WHERE p.nombre NOT LIKE '%,%') nombre_sin_coma, count(*) total
FROM (SELECT DISTINCT beneficiario_id FROM liquidacion_detalle
      WHERE estado_linea='impago' AND recibo_id IS NULL AND beneficiario_tipo='propietario') d
JOIN propietarios p ON p.id = d.beneficiario_id;
```

```json
[{"provisorios_con_deuda":21,"reales_con_deuda":18,"sin_dni":21,"nombre_sin_coma":21,"total":39}]
```

Dos poblaciones bien separadas:

- **18 propietarios reales** — `nombre` viene como `"APELLIDO, NOMBRE"`: `"AZURI, SANTIAGO DAMIAN"`, `"MORAGA MILLAN, ADRIAN LEONARDO"`. El apellido **está**, empaquetado en el mismo campo. Se muestra.
- **21 provisorios de R8** — `nombre` es **el nombre de la caballeriza, no de una persona**:

```sql
SELECT nombre, nombre_stud, documento_nro, notas FROM propietarios WHERE notas ILIKE '%provisorio%';
```

```
LOS MONCHITOS · LA MILINGA · EL DERBY · CRAZY HORSE · DON BENICIO · ABUELO FLORO
SANTOS VEGA · LOS CUERVOS · MAR DEL TUYU · TIAN Y ROMA · FEDERICO Y MIGUEL · EMI …
   nombre_stud = null · documento_nro = null · notas = "provisorio R8 15/08" · 40 filas
```

👉 **En estas 21 no hay apellido que mostrar porque no hay persona cargada.** Es el bloqueante de datos conocido (los 40 provisorios sin completar, decisión de producto de Fede), visto desde Pagos. Ninguna consulta ni render lo arregla.

**Resumen de la causa, en los términos de la pregunta:**

| caso | ¿el dato no está? | ¿no se selecciona? | ¿se muestra truncado? |
|---|---|---|---|
| Entrenadores / jockeys (88) | no, está | no, se selecciona | no |
| Propietarios reales (18) | está, pero **sin separar** de `nombre` | — | no |
| Propietarios provisorios (21) | **no está** — no hay persona | — | no |

---

# 4. Separación propietario / cuidador

## 4.1 ¿Las líneas distinguen el rol?

**En la base: sí. En la pantalla: no. En el recibo: sí, desde `67f9371`.**

El rol vive en tres columnas de `liquidacion_detalle`, ninguna de las cuales pide `cobrosDetalle`:

| dónde vive | ejemplo real |
|---|---|
| `descripcion` (para `premio`) | `"Carrera 1 — 1° puesto — Entrenador (bolsa: $1.450.000,00)"` |
| `concepto_tipo` | `bono` → Propietario · `incentivo_entrenador` → Entrenador · `incentivo_jockey` → Jockey |
| `beneficiario_tipo` | `propietario` / `profesional` / `club` (genérico, de respaldo) |

Lo escribe el motor en `liquidaciones-engine.js:191-201`:

```javascript
concepto: conceptoBase, descripcion: `${conceptoBase} — Propietario (bolsa: ${bolsaFmt})`,
concepto: conceptoBase, descripcion: `${conceptoBase} — Entrenador (bolsa: ${bolsaFmt})`,
concepto: conceptoBase, descripcion: `${conceptoBase} — Jockey (bolsa: ${bolsaFmt})`,
```

El SELECT de la pantalla (`:830-833`) pide `id, concepto, monto_neto, posicion, reunion_id, inscripcion_id` — **sin `descripcion`, sin `concepto_tipo`, sin `beneficiario_tipo`**. Es exactamente el mismo agujero que `67f9371` tapó en el recibo, sin tapar en la pantalla.

Consecuencia visible: el `concepto` del premio del propietario y el del entrenador para el mismo caballo y el mismo puesto es **el mismo string** (`"Carrera 1 — 1° puesto"`, `concepto` idéntico en 176 filas de profesional y 47 de propietario). En pantalla salen dos filas indistinguibles; en el recibo, desde el fix, salen con columna **Rol**.

## 4.2 ¿Cómo se agrupan hoy?

| | criterio | dónde |
|---|---|---|
| **Pantalla** (tarjetas) | `` `${l.beneficiario_tipo}|${l.beneficiario_id}` `` | `:802-806` |
| **Recibo** | por `recibo_id`, emitido para un solo par `(beneficiario_tipo, beneficiario_id)` | `:913-916` |
| **Resumen** | mismo par, más un bucket aparte para `club` | `:603-606` |

Peón / capataz / sereno **no** son un bucket propio: se acumulan bajo el `beneficiario_id` del entrenador y se pagan dentro de su recibo (`:204-205`, `:222`).

## 4.3 Una persona que cobra como propietario y como entrenador: **dos líneas, dos tarjetas, dos recibos**

Como `propietarios` y `profesionales` son tablas distintas, la misma persona tiene **dos UUID distintos** y la clave de agrupación los separa. No hay ninguna deduplicación por DNI en ninguna de las tres pantallas.

Cuántas personas son, en el padrón:

```sql
-- match por documento_nro entre propietarios y profesionales activos
```
→ **43 personas** están cargadas como propietario y como profesional a la vez.

Cuántas lo sufren **hoy, con deuda pagable abierta bajo los dos roles**:

```sql
WITH imp AS (SELECT beneficiario_tipo, beneficiario_id, sum(monto_neto) neto, count(*) n
             FROM liquidacion_detalle
             WHERE estado_linea='impago' AND recibo_id IS NULL AND beneficiario_tipo <> 'club'
             GROUP BY 1,2)
SELECT pr.documento_nro dni, pr.nombre como_propietario, pf.apellido||', '||pf.nombre como_profesional,
       pf.tipo, ip.n lineas_prop, ip.neto neto_prop, ig.n lineas_prof, ig.neto neto_prof
FROM imp ip
JOIN propietarios  pr ON pr.id = ip.beneficiario_id AND ip.beneficiario_tipo='propietario'
JOIN profesionales pf ON pf.documento_nro = pr.documento_nro AND pr.documento_nro IS NOT NULL AND pr.documento_nro <> ''
JOIN imp ig ON ig.beneficiario_tipo='profesional' AND ig.beneficiario_id = pf.id
ORDER BY 2;
```

| DNI | como propietario | como profesional | tipo | líneas prop | neto prop | líneas prof | neto prof |
|---|---|---|---|---|---|---|---|
| 21446180 | AZURI, SANTIAGO DAMIAN | AZURI, SANTIAGO DAMIAN | entrenador | 2 | 168.000,00 | 4 | 44.000,00 |
| 41434669 | CASINELLI, FABRICIO | CASINELLI, FABRICIO | entrenador | 1 | 154.000,00 | 2 | 32.000,00 |
| 23983195 | CUEVAS, CESAR DANIEL | CUEVAS, CESAR DANIEL | entrenador | 2 | 200.000,00 | 4 | 40.000,00 |
| 18151946 | DI FRANCO, GUSTAVO FABIAN | DI FRANCO, GUSTAVO | entrenador | 1 | 100.000,00 | 4 | 40.000,00 |
| 14520938 | DIAZ, CARLOS RODOLFO | DIAZ, CARLOS RODOLFO | entrenador | 1 | 140.000,00 | 3 | 40.000,00 |
| 25446452 | DUARTE, NESTOR FEDERICO | DUARTE, NESTOR FEDERICO | entrenador | 1 | 336.000,00 | 2 | 58.000,00 |
| 16670713 | MEDINA, OSCAR ROBERTO | MEDINA, OSCAR ROBERTO | entrenador | 1 | 70.000,00 | 2 | 20.000,00 |
| 43001366 | MORAGA MILLAN, ADRIAN LEONARDO | MORAGA, ADRIAN LEONARDO | entrenador | 1 | 70.000,00 | 2 | 20.000,00 |
| 34412986 | PALLET, GUIDO | PALLET, GUIDO | entrenador | 1 | 140.000,00 | 3 | 40.000,00 |

**9 personas → 18 tarjetas en la lista y 18 recibos separados.** Todas entrenadores. Las dos tarjetas aparecen con el **mismo nombre** en el listado, distinguidas sólo por la palabra `propietario` / `profesional` en la línea chica (`:818`).

Ese `${g.tipo}` es lo más cerca que está hoy la pantalla de rotular el rol — y dice `profesional`, el genérico, no `Entrenador` ni `Jockey`. **Es literalmente lo que Valeria reporta.** Es también el punto exacto donde `rolDeLinea` (que ya existe, `:929`) no se está usando.

## 4.4 Y el otro sentido de "no siempre son la misma persona"

Los 21 propietarios provisorios con deuda **son la caballeriza** (`"LOS MONCHITOS"`, `"LA MILINGA"`). La resolución caballeriza → titular (`:797-799`) devuelve a ese registro provisorio. Así que hoy, para esos 21, el beneficiario rotulado *propietario* es un nombre de stud, mientras el entrenador de esos mismos caballos es una persona con nombre y apellido en `profesionales`. **No son la misma persona y el sistema tampoco puede afirmar que lo sean** — no hay DNI en el registro provisorio con qué cotejar.

Sin propuesta de agrupación, como se pidió.

---

# 5. Buscador de la pantalla de Pagos

## 5.1 Criterios de hoy — la lista completa

Tres controles en la barra (`:190-200`):

| # | control | qué hace | dónde |
|---|---|---|---|
| 1 | `cob-q` — texto libre, debounce 300 ms | ver desglose abajo | `:191-192`, `:743`, `:812` |
| 2 | `cob-reunion` — select | `.eq('reunion_id', rid)` server-side | `:193`, `:792` |
| 3 | `cob-carrera` — select | trae las inscripciones de la carrera y filtra por `inscripcion_id` client-side | `:196`, `:782-786`, `:805` |

El texto libre resuelve por dos caminos, unidos con `OR` (`:812`):

```javascript
if (q) lista = lista.filter(g => benefSearch(g.tipo,g.id).includes(q) || propIdsPorCaballeriza.has(g.id));
```

**Camino A — `benefSearch` (`:750-754`), sobre el nombre ya resuelto del beneficiario:**

| si el beneficiario es | busca en |
|---|---|
| propietario | `nombre`, `nombre_stud`, `documento_nro` |
| profesional | `nombre`, `apellido`, `documento_nro` |

**Camino B — caballeriza (`:796-802`):** `caballeriza_responsables` con `rol='propietario' AND activo=true` → `propietario_id`. Substring sobre el nombre de la caballeriza.

Total: **6 campos de texto + 2 selects.**

## 5.2 ¿Se puede buscar por profesional?

**Sí. Ya funciona hoy, por nombre, apellido o DNI** — es la rama `profesional` de `benefSearch` (`:753`). El pedido 4 de Valeria está, en esa mitad, ya resuelto en el código. Los 88 profesionales con deuda están todos en el mapa que alimenta la búsqueda (§3.3), así que no hay ninguno inalcanzable.

Con dos límites reales:

1. **La búsqueda por caballeriza sólo llega al propietario.** `propIdsPorCaballeriza` se contrasta contra `g.id` sin mirar `g.tipo`, y se puebla únicamente con `propietario_id`. Escribir el nombre de una caballeriza **no** trae a su entrenador. Y como para 21 caballerizas el "propietario" es el registro provisorio homónimo, buscar `"LOS MONCHITOS"` trae la tarjeta del provisorio pero no a quien cuida esos caballos.
2. **No se puede filtrar por rol.** No hay control para "mostrame sólo entrenadores" o "sólo jockeys". `profesionales.tipo` (`jockey` / `entrenador` / `ambos`) se carga en el mapa (`:477`) y **nunca se usa** en Pagos. De los 88 con deuda: 57 entrenadores, 30 jockeys, 1 `ambos`.

Y una colisión a tener en cuenta al diseñar el filtro por carrera: los 44 `incentivo_jockey` no tienen `inscripcion_id`, así que **elegir cualquier carrera los saca del listado** (`:805`). Es correcto —son por reunión— pero significa que filtrando por carrera un jockey puede desaparecer teniendo plata a cobrar.

---

# 6. Cierre — los cuatro pedidos de Valeria

| # | pedido | naturaleza del cambio | por qué |
|---|---|---|---|
| **1** | Ver el número de carrera en las líneas | **consulta + render** | El detalle ya lo muestra (`:856`, `:878`). Falta en la tarjeta del listado: agregar los datos al `.select` de `cobrosBuscar` (`:789-791`) y pintarlos en `:818`. Sin cambio de modelo: el dato existe por dos caminos. |
| **2** | Ver apellidos de propietarios y entrenadores | **entrenadores: nada que cambiar** (88/88 ya salen `"APELLIDO, NOMBRE"`). **Propietarios: modelo de datos** | `propietarios` no tiene columna `apellido`; 21 de 39 con deuda son provisorios cuyo `nombre` es una caballeriza. Ninguna consulta ni render lo resuelve. |
| **3** | Separar propietario de cuidador | **consulta + render** (la parte visible) **+ modelo de datos** (la de fondo) | `rolDeLinea` ya existe (`:929`) y ya se usa en el recibo; falta traer `descripcion`/`concepto_tipo`/`beneficiario_tipo` en `:830-833` y agregar la columna en `:878`. Debajo queda la deuda que anota `chore/propietarios-provisorios-r8`: el rol se deriva de un regex sobre `descripcion` en vez de ser columna propia — y 9 personas siguen generando dos recibos por no haber identidad única entre las dos tablas. |
| **4** | Buscar por carrera y por profesional | **por profesional: ya está** (`:753`). **por carrera: render** (el filtro ya funciona, `:782-786`) **+ consulta** para los dos huecos | Falta: que la búsqueda por caballeriza alcance también al entrenador (hoy sólo resuelve `propietario_id`, `:800`), y un filtro por rol usando `profesionales.tipo`, que se carga y no se usa. |

---

# 7. Preguntas abiertas

1. **La mitad "entrenadores" del pedido 2 no reproduce.** 88 de 88 profesionales con deuda tienen `apellido` cargado y la pantalla lo imprime como `"APELLIDO, NOMBRE"`. ¿Valeria lo vio en Pagos, o en otra pantalla —el recibo impreso, el PDF del programa, la carta de llamados—? Sin eso no sé qué arreglar.
2. **Los 21 provisorios.** Mientras el `nombre` sea la caballeriza no hay apellido posible. ¿Se completan (decisión de Fede, hoy pendiente) o Pagos tiene que mostrar mientras tanto algo explícito del tipo *"caballeriza LOS MONCHITOS — titular sin identificar"*, para que Valeria no crea que es una persona?
3. **Las 9 personas con dos recibos.** ¿Es lo correcto operativamente —un recibo por rol, que es lo que hoy hace el sistema— o Valeria espera un recibo único por persona con las líneas rotuladas por rol? Es decisión de producto y cambia el diseño entero de la agrupación.
4. **Vocabulario.** `rolDeLinea` imprime `Entrenador`; el Resumen rotula el mismo concepto `Incentivo cuidadores` (`:655`). Valeria dice *cuidador*. Sigue pendiente de Fede desde `67f9371`.
5. **Filtro por carrera y jockeys.** Filtrando por carrera desaparecen los 44 `incentivo_jockey` (no tienen `inscripcion_id`). ¿Se los deja fuera, o el filtro tiene que arrastrarlos por reunión?
