# Relevamiento — ¿se puede cargar la monta real al oficializar?

- **Fecha**: 2026-08-28
- **SHA de `main` al relevar**: `2754c5f`
- **Modo**: SOLO LECTURA. Ningún `UPDATE/INSERT/DELETE/DDL`. Ningún archivo modificado. Nada mergeado a `main`.
- **Guards verificados**:
  - `pwd` → `/home/clio/dev/SGH` ✔
  - `SELECT count(*) FROM spcs` → `181` ✔ (baseline vigente de CLAUDE.md)
  - ref del proyecto → `unlhcuanfrtpatoipwve` ✔

## Veredicto

**NO se puede.** No hay ningún punto en el flujo de resultados/oficialización donde se
cargue el jockey que corrió. Lo que se paga es siempre `inscripciones.jockey_titular_id`,
es decir **el jockey inscripto**. El único lugar donde ese campo se puede cambiar desde una
pantalla de secretaría (`ratificacion.html`) **se deshabilita solo el día de la reunión a las
12:00**, que es exactamente cuando llegan los cambios de monta.

Detalle en §7 (qué haría falta).

---

## 1. Dónde vive el jockey

`inscripciones` tiene **dos** columnas de jockey y **ninguna** de "jockey que corrió":

| Columna | Tipo | Nullable |
|---|---|---|
| `inscripciones.jockey_titular_id` | uuid | YES |
| `inscripciones.jockey_suplente_id` | uuid | YES |

`resultado_posiciones` **no tiene ninguna columna de jockey**. Estructura real medida:

```
resultado_posiciones: id, resultado_id, inscripcion_id, posicion, tiempo,
                      diferencia, descalificado, motivo_desc, empate,
                      dividendo, no_largo
```

`resultados` tampoco: `id, carrera_id, estado, tiempo_ganador, dividendos, incidentes,
observaciones, oficializado_por, oficializado_at, created_at, estado_pista,
favorito_mandil, redistribucion_legs, updated_at`.

**Conclusión 1**: no existe un campo separado para la monta real. Hay un solo campo,
`inscripciones.jockey_titular_id`, y es el del inscripto. El resultado de la carrera no
guarda quién la corrió.

Query:

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('inscripciones','resultado_posiciones','resultados')
ORDER BY table_name, ordinal_position;
```

---

## 2. La pantalla de resultados

Archivo: **`resultados.html`**. Carga de posiciones, dividendos, y `oficializar()`.

`grep -n "jockey" resultados.html` devuelve **3 ocurrencias, ninguna editable**:

| Línea | Qué es |
|---|---|
| `resultados.html:1602` | `jockey_id: insc.jockey_titular_id` — lectura, al insertar en `performances` |
| `resultados.html:1817` | comentario sobre el peso del jockey |
| `resultados.html:1840` | texto de un `toast` de validación de peso |

No hay `<select>` de jockey, no hay columna de jockey en el marcador, no hay función
`onJockeyChange`, no hay `update({jockey_titular_id: ...})`. El listado completo de
funciones del archivo (`grep -n "^function \|^async function "`) no tiene ninguna
relacionada con montas.

**`oficializar()` (`resultados.html:1581`)** lee el jockey y lo congela en el histórico
sin ofrecer cambiarlo:

```javascript
// resultados.html:1593-1603
const perfInserts = posiciones.filter(pos => !pos.no_largo).map(pos => {
  const insc = inscs.find(i=>i.id===pos.inscripcion_id);
  ...
  jockey_id:insc.jockey_titular_id, descalificado:pos.descalificado, fuente:'local' };
```

**Conclusión 2 (explícita)**: **`resultados.html` NO permite editar el jockey**, ni antes,
ni durante, ni después de oficializar. Lo lee y lo propaga.

### 2bis. Dónde SÍ se puede editar (y por qué no alcanza)

Hay dos lugares:

**a) `ratificacion.html` — selector de jockey por inscripción.**

```javascript
// ratificacion.html:838-854
function buildJockeySelect(i, carCerrada) { ...
  return `<select class="jockey-select..." data-insc="${i.id}"${carCerrada?' disabled':' onchange="onJockeyChange(this)"'}>${opts}</select>`;
}
// ratificacion.html:856-859
async function onJockeyChange(sel) {
  const inscId = sel.dataset.insc;
  const jockeyId = sel.value || null;
  const { error } = await sb.from('inscripciones').update({ jockey_titular_id: jockeyId }).eq('id', inscId);
```

Pero se apaga solo:

```javascript
// ratificacion.html:617
const carCerrada = isCerrada || car.estado === 'confirmada' || car.estado === 'anulada';
```

```javascript
// ratificacion.html: calcCierreStatus()
if (fecha > hoy) return false;          // reunión futura → abierta
if (fecha < hoy) return true;           // reunión pasada → CERRADA
const [hh, mm] = (reunion.hora_cierre_ratificacion || '12:00:00').split(':').map(Number);
return hoy.getHours()*60 + hoy.getMinutes() >= hh*60 + mm;   // mismo día → cierra a la hora
```

**Las 14 reuniones de la base tienen `hora_cierre_ratificacion = '12:00:00'`.** Es decir:
el día de la reunión, a partir de las 12:00, el selector de jockey de `ratificacion.html`
queda **`disabled`**. Los cambios de monta que pasa Yesi llegan después de esa hora.

**b) `inscripciones.html` — formulario de alta/edición.**

```
inscripciones.html:701   jockey_titular_id: document.getElementById('f-jockey-titular').value || null,
inscripciones.html:702   jockey_suplente_id: document.getElementById('f-jockey-suplente').value || null,
```

`grep -n "isCerrada\|calcCierreStatus\|cerrada"` sobre `inscripciones.html` → **sin
resultados**. Este formulario **no tiene gate de cierre**: se puede editar el jockey de
una inscripción en cualquier momento, incluso con la carrera ya corrida y oficializada.
Es la puerta que se usa hoy (ver §4).

---

## 3. Qué lee la liquidación — punta a punta

Es **el mismo campo en los tres tramos**. No hay divergencia de campo.

**Tramo 1 — resultado → liquidación (`liquidaciones-engine.js`)**

El motor carga las inscripciones y lee `jockey_titular_id` directo:

```javascript
// liquidaciones-engine.js:90
sb.from('inscripciones').select('*').in('carrera_id', carIds).neq('estado', 'forfait'),
```

```javascript
// liquidaciones-engine.js:199-203  — premio (el 10%)
addActor(insc.jockey_titular_id, 'jockey', {
  premio: premioEfectivo, pct: PCTS.jockey, subs: [], conceptoTipo: 'premio',
  concepto: conceptoBase, descripcion: `${conceptoBase} — Jockey (bolsa: ${bolsaFmt})`,
  posicion: posNum, inscripcion_id: insc.id, carrera_id: car.id,
});
```

```javascript
// liquidaciones-engine.js:237,247-252  — incentivo por reunión
if (incJockey > 0 && insc.jockey_titular_id) jockeysSet.add(insc.jockey_titular_id);
...
addActor(jid, 'jockey', { premio: incJockey, pct: 1, ..., conceptoTipo: 'incentivo_jockey', ... });
```

`addActor` descarta el id nulo sin avisar:

```javascript
const addActor = (id, tipo, item) => {
  if (!id) return;            // ← inscripción sin jockey: NO genera línea, en silencio
  ...
};
```

**Tramo 2 — liquidación → recibo (`liquidaciones.html`)**

La línea persiste el id como `beneficiario_id` (con `beneficiario_tipo='profesional'`; el
valor `'jockey'` del motor es el **rol**, no el tipo de beneficiario — ver §4). El buscador
de Pagos, el recibo y el resumen resuelven el nombre desde ahí:

```javascript
// liquidaciones.html
function nombreBenef(tipo, id){
  if (tipo==='propietario') return propietariosMap[id]?.nombre || '(propietario)';
  const p = profesionales[id]; return p ? `${p.apellido}, ${p.nombre}` : '(profesional)';
}
```

```
liquidaciones.html:889-893  .eq('beneficiario_tipo',tipo).eq('beneficiario_id',id)...
liquidaciones.html:979      p_beneficiario_tipo: cobBenef.tipo, p_beneficiario_id: cobBenef.id,
liquidaciones.html:1006     .select(...).eq('recibo_id',recibo.id)
```

El único otro uso de `jockey_titular_id` en `liquidaciones.html` es informativo (montas
perdidas del resumen), y también lee el mismo campo:

```javascript
// liquidaciones.html:675-676
const { data: ins } = await sb.from('inscripciones').select('id,jockey_titular_id').in('id', inscIds);
const jockeyByInsc = Object.fromEntries((ins||[]).map(i=>[i.id, i.jockey_titular_id]));
```

**Conclusión 3**: la cadena `resultado → liquidación → recibo` usa un solo campo,
`inscripciones.jockey_titular_id`, de punta a punta. **No hay riesgo de "cambio que no
llega al recibo por leer otro campo"**. El riesgo es otro y es peor: no hay dónde cargar
el cambio en el momento correcto, y si se carga tarde puede llegar después del pago (§6).

---

## 4. Evidencia histórica (R6 y R8)

### 4a. Divergencia liquidación vs inscripción: CERO

Ojo con el campo: `beneficiario_tipo` **no toma el valor `'jockey'`**. Los valores reales
son `propietario | profesional | club`; el rol jockey vive dentro de `'profesional'` y se
distingue por `descripcion ILIKE '%Jockey%'`. La primera query, filtrando por
`beneficiario_tipo='jockey'`, daba 0 filas y era un falso negativo.

```sql
SELECT r.numero AS reunion, ld.concepto_tipo::text AS ctipo, count(*) AS n,
       count(*) FILTER (WHERE ld.beneficiario_id IS DISTINCT FROM i.jockey_titular_id) AS divergentes,
       count(*) FILTER (WHERE ld.beneficiario_id = i.jockey_suplente_id) AS coincide_suplente
FROM liquidacion_detalle ld
JOIN liquidaciones l ON l.id = ld.liquidacion_id
JOIN reuniones r ON r.id = l.reunion_id
JOIN inscripciones i ON i.id = ld.inscripcion_id
WHERE ld.beneficiario_tipo::text = 'profesional' AND ld.descripcion ILIKE '%Jockey%'
GROUP BY 1,2 ORDER BY 1,2;
```

```
 reunion | ctipo  | n  | divergentes | coincide_suplente
---------+--------+----+-------------+-------------------
       6 | premio | 35 |           0 |                 0
       8 | premio | 39 |           0 |                 0
    9999 | premio | 15 |          15 |                 0
```

**R6 y R8: 0 divergencias sobre 74 líneas de premio a jockey.** El beneficiario pagado es
siempre, exactamente, el `jockey_titular_id` de la inscripción.

Las 15 divergencias de R9999 **no son evidencia**: es la reunión de prueba, cuyas
inscripciones tienen jockeys sintéticos (`f9000000-0000-0000-0000-0000000000a1`, `…a2`,
`…a3`) contra beneficiarios reales en la liquidación. Artefacto del fixture.

### 4b. Pero los cambios de monta SÍ existen — se registran en `auditoria`

`auditoria` sí loguea los `UPDATE` de `inscripciones` (2152 en total). Diffeando el campo:

```sql
SELECT r.numero AS reunion, r.fecha, count(*) AS cambios_jockey,
       count(*) FILTER (WHERE a.created_at::date = r.fecha) AS el_dia_de_la_reunion,
       count(*) FILTER (WHERE a.created_at::date > r.fecha) AS despues_de_la_reunion,
       min(a.created_at) AS primero, max(a.created_at) AS ultimo
FROM auditoria a
JOIN inscripciones i ON i.id = a.registro_id
JOIN carreras c ON c.id = i.carrera_id
JOIN reuniones r ON r.id = c.reunion_id
WHERE a.tabla='inscripciones' AND a.accion='UPDATE'
  AND (a.datos_antes->>'jockey_titular_id') IS DISTINCT FROM (a.datos_despues->>'jockey_titular_id')
GROUP BY 1,2 ORDER BY 1;
```

```
 reunion |   fecha    | cambios_jockey | el_dia_de_la_reunion | despues_de_la_reunion
---------+------------+----------------+----------------------+-----------------------
       6 | 2026-06-20 |            146 |                   24 |                    32
       8 | 2026-08-16 |             93 |                    3 |                     8
    9999 | 2099-01-01 |             17 |                    0 |                     0
```

**R6: 24 cambios de jockey el día de la reunión y 32 después.**
**R8: 3 el día y 8 después.**

Los 11 de R8 desde el día de la carrera en adelante, uno por uno:

```
     created_at (UTC)     |   usuario    |  antes  → después
 2026-08-16 17:02:15      | Yesica Elias |  null   → 9ba2e954…
 2026-08-16 17:02:30      | Yesica Elias |  null   → 3fc8f1fd…
 2026-08-16 18:07:10      | Yesica Elias |  null   → 3fc8f1fd…
 2026-08-17 23:11:25      | Yesica Elias |  null   → 654dc3ea…
 2026-08-17 23:12:35      | Yesica Elias | 0bbe6666… → 654dc3ea…   ← swap real
 2026-08-17 23:12:52      | Yesica Elias | 654dc3ea… → 0bbe6666…   ← revertido 17 s después
 2026-08-17 23:13:06      | Yesica Elias |  null   → a66df20c…
 2026-08-17 23:13:28      | Yesica Elias |  null   → 2e3428cb…
 2026-08-17 23:14:48      | Yesica Elias |  null   → 7dcddbdb…
 2026-08-17 23:15:52      | Yesica Elias |  null   → f67ec948…
 2026-08-17 23:16:58      | Yesica Elias |  null   → 8c358b73…
```

Lectura:

- Los hace **Yesi**, a mano, **un día y medio después de la carrera** (el grueso el 17 a
  las 23:11–23:16).
- 9 de 11 son **`null` → jockey**: no son cambios de monta, son **jockeys que faltaban** y
  se cargaron después. Mientras estuvieron en `null`, `addActor` los descartó en silencio
  y **esas líneas de premio al jockey no existieron**.
- 2 de 11 son swaps reales, y uno de ellos se revierte a los 17 segundos (tipeo).
- Se hicieron necesariamente por **`inscripciones.html`**: `ratificacion.html` estaba
  cerrado desde las 12:00 del 16.

### 4c. Por qué la divergencia da 0 pese a los cambios

Porque la liquidación se **recalculó después**:

```
 reunion |         liq_min          |         liq_max
---------+--------------------------+--------------------------
       6 | 2026-07-22 19:21:34+00   | 2026-08-15 01:51:26+00
       8 | 2026-08-16 17:54:24+00   | 2026-08-19 13:35:23+00
```

En R8 la primera liquidación es del 16 a las 17:54 — **antes** de los 8 cambios del 17. El
`liq_max` del 19 es el recálculo que los incorporó. En R6 el último cambio (07/08) precede
a la liquidación vigente (15/08).

O sea: **el sistema hoy converge, pero por reproceso manual y a destiempo**, no porque la
monta real se haya cargado en su momento. Y ese reproceso tiene un límite duro (§6).

---

## 5. El campo suplente: muerto

`jockey_suplente_id` se escribe en dos formularios y **no se lee en ningún lado del flujo
de resultados ni de liquidación**.

- **Se escribe**: `inscripciones.html:266,377,654,702` (`<select id="f-jockey-suplente">`)
  y `portal.html:246,678,691,835,859-860` (`p_jockey_suplente_id`).
- **Se lee**: sólo `ratificacion.html:840-844`, y únicamente para **poner al suplente
  primero en la lista del desplegable de titular**, etiquetado `(suplente)`:

  ```javascript
  const supl = i.jockey_suplente_id ? profesionales.find(p => p.id === i.jockey_suplente_id) : null;
  if (supl) {
    const sel = i.jockey_titular_id === supl.id ? ' selected' : '';
    opts += `<option value="${supl.id}"${sel}>${supl.apellido}, ${supl.nombre} (suplente)</option>`;
  }
  ```

- **No aparece** en `resultados.html`, `liquidaciones-engine.js`, `liquidaciones.html`,
  `carta-llamados.html` ni `programa.html`:
  `grep -n "suplente" <esos archivos>` → **0 resultados**.

Y no hay datos:

```sql
SELECT count(*) AS inscripciones_total, count(jockey_titular_id) AS con_titular,
       count(jockey_suplente_id) AS con_suplente FROM inscripciones;
```

```
 inscripciones_total | con_titular | con_suplente
---------------------+-------------+--------------
                 249 |         197 |            0
```

**Conclusión 5**: **queda muerto**. 0 de 249 inscripciones tienen suplente cargado, y aunque
lo tuvieran, al oficializar no se usa. La única utilidad implementada (ordenar el
desplegable de ratificación) se apaga con el mismo gate de las 12:00.

Nota lateral: 197 de 249 inscripciones tienen titular. **52 no tienen jockey** — para esas,
el motor no emite línea de premio al jockey y no avisa.

---

## 6. El riesgo que no se detecta después

`liquidaciones-engine.js` es **paid-safe**: al recalcular preserva lo cobrado.

```javascript
// liquidaciones-engine.js:274
if (d.estado_linea === 'pagado' || d.recibo_id != null) { ... }   // se preserva
// liquidaciones-engine.js:286-289
await sb.from('liquidacion_detalle').delete()
  ...
  .is('recibo_id', null)
  .neq('estado_linea', 'pagado');
```

Consecuencia: **si se le pagó al jockey equivocado, corregir la monta después NO lo
arregla.** La línea pagada al jockey inscripto queda intacta y el recálculo *agrega* la
línea correcta al jockey real. Resultado: plata de más pagada al que no corrió, y una
deuda nueva con el que sí. La única salida es manual.

Estado actual de las líneas:

```
 reunion | estado_linea |  n  | con_recibo
---------+--------------+-----+------------
       6 | impago       | 160 |          0
       6 | retenido     |  32 |          0
       8 | impago       | 178 |          0
       8 | pagado       |   1 |          1
       8 | retenido     |  46 |          0
    9999 | impago       |  51 |          0
    9999 | pagado       |   4 |          4
    9999 | retenido     |  21 |          0
```

La única línea pagada de R8 es de **propietario**, no de jockey. **Todavía no se materializó
ningún pago a un jockey equivocado** — la ventana sigue abierta porque casi no se cobró aún.
En cuanto Pagos se use en serio el día de la reunión, se cierra.

---

## 7. Qué haría falta

Ordenado por costo. La opción 1 sola alcanza para el 20/09.

**1. Modal "Montas" en `resultados.html` (recomendado).**
Ya existe el precedente exacto en el mismo archivo: `openPesoBalanza()` /
`savePesoBalanza()` (`resultados.html:1774-1860`) abre un modal con los ratificados de la
carrera actual ordenados por gatera y hace `sb.from('inscripciones').update(...)` fila por
fila. Un modal "Montas" es la misma forma, con un `<select>` de jockeys escribiendo
`jockey_titular_id` en lugar de un `<input number>` escribiendo `peso_balanza`. Sin schema
nuevo, sin migración, sin tocar el motor: como la liquidación lee `jockey_titular_id` (§3),
el cambio llega solo al recibo. Debe quedar accesible **antes de apretar oficializar**.

**2. Gate de oficialización: no oficializar con jockey en `null`.**
52 de 249 inscripciones no tienen jockey y el motor las saltea callado (`addActor: if (!id)
return`). Bloquear (o al menos advertir) al oficializar una carrera con algún ratificado sin
jockey convierte un error silencioso en uno visible. Esto es lo que produjo los 9 parches
`null → jockey` de Yesi del 17/08.

**3. Separar monta real de inscripción (más caro, más correcto).**
Columna `resultado_posiciones.jockey_id`, poblada al oficializar con fallback a
`inscripciones.jockey_titular_id`, y el motor leyendo de ahí. Deja el histórico
auditable: hoy, si alguien corrige `inscripciones` un mes después, se pierde el rastro de
quién corrió de verdad (lo único que queda es el diff en `auditoria`). No es necesario para
el 20/09.

**Lo que NO haría falta**: mover la `hora_cierre_ratificacion`. Abrir `ratificacion.html`
todo el día habilitaría también forfait, pesos y ratificaciones fuera de término. El cambio
de monta necesita su propio punto de carga, en la pantalla donde el operador ya está parado.

---

## 8. Martín

**Existe. No hay que crearlo.**

```
 nombre_completo | Martin Juarez
 email           | kiritatds@gmail.com
 rol             | operador
 club_id         | 0649e9c5-9e87-4aad-842f-101458e6b33c   (Dolores)
 activo          | true
 id              | 2ed1427f-ef06-4f56-9a9d-75bae08047f8
```

Usuarios de Dolores hoy: Administrador Dolores (`secretario_carreras`), Federico Iguacel
(`secretario_carreras`), Yesica Elias (`operador`), Valeria Radeland (`operador`), Martin
Juarez (`operador`), FABIO JOSE CASTRO (`profesional`).

Sobre el acceso: `rol='operador'` cae en la rama por defecto del dashboard
(`index.html:361` — "secretario_carreras, operador y cualquier otro rol con club"), y
`resultados.html` / `ratificacion.html` / `inscripciones.html` **no filtran por rol** en
`initAuth()`: sólo exigen sesión y `club_id`. Martín entra a todo lo que necesita.

Pendiente humano, no técnico: es su primera vez con SGH y el 20/09 le va a tocar la carga
que hoy hace Yesi.

---

## 9. Preguntas abiertas

1. **¿Los cambios de monta del día se anotan en algún lado antes de SGH?** Los 24 de R6 y
   los 3 de R8 del propio día de la reunión se cargaron igual, con el selector de
   ratificación ya cerrado a las 12:00 — o sea, por `inscripciones.html`. Confirmar con
   Yesi cuál es el circuito real, porque el modal de §7.1 tiene que reemplazar *ese*
   circuito, no uno imaginado.

2. **¿Los 32 cambios post-reunión de R6 son montas o backfill?** En R8 fueron 9 de 11
   backfill (`null → jockey`). Si en R6 pasa lo mismo, el problema #1 no es el cambio de
   monta sino la **inscripción sin jockey**, y el gate de §7.2 gana prioridad sobre el
   modal.

3. **¿Se descarta el suplente o se conecta?** 0 de 249 cargados. O se saca de
   `inscripciones.html`/`portal.html` para no dar la impresión de que hace algo, o se
   define qué debería hacer al oficializar. Hoy es una casilla que no mueve nada.

4. **Si se paga a un jockey y después aparece que corrió otro, ¿cuál es el procedimiento?**
   El motor es paid-safe y no lo revierte (§6). Hace falta una decisión de Fede antes de que
   Pagos se use el día de la reunión.

5. **`hora_cierre_ratificacion` es `12:00:00` en las 14 reuniones.** ¿Es la hora real de
   Dolores o quedó el DEFAULT?

## 10. Reunión de prueba 9999

Sigue viva (`estado='cancelada'`, `fecha=2099-01-01`, club Dolores) con 90 líneas de
liquidación, 4 de ellas pagadas con recibo. Ensucia toda consulta agregada de este informe
—hubo que excluirla a mano en §4— y su vencimiento de borrado (20/06) pasó hace más de dos
meses. Ya está anotado como A5 en `docs/diagnosticos/2026-08-27_auditoria-claude-md.md`; se
repite acá porque volvió a aparecer.
