# Fix de la UI — carta-llamados guarda y muestra las ventanas en hora argentina

**Fecha:** 2026-09-08
**Es el paso 1** del orden acordado: **primero la UI, después el dato.**
**Rama:** `fix/carta-llamados-hora-local` — **pusheada, SIN mergear.**
**SHA de la rama:** `71a5995a796f4e2c5234dab8e47713c9cba075c0`
**SHA de `main` (intacto):** `79821ae01a9b8e8768ae698b967462d00baa71a0`
**SHA de este informe:** ver §8.
**Plan que lo motiva:** `docs/diagnosticos/2026-09-08_plan-hora-cierre-r9.md`

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

---

## 1. El diagnóstico, confirmado por los cuatro campos

Tu observación cierra el caso: **los cuatro campos de R9 están corridos exactamente −3 h.**

| Campo | Guardado (UTC) | Se lee en AR | Lo que Yesi cargó |
|---|---|---|---|
| `apertura_inscripcion` | `2026-08-28 00:00:00+00` | **27/08 21:00** | 28/08 00:00 |
| `cierre_inscripcion` | `2026-09-11 12:00:00+00` | **11/09 09:00** | 11/09 12:00 |
| `apertura_ratificacion` | `2026-09-14 00:00:00+00` | **13/09 21:00** | 14/09 00:00 |
| `cierre_ratificacion` | `2026-09-14 12:00:00+00` | **14/09 09:00** | 14/09 12:00 |

Cuatro campos, un solo corrimiento, siempre el mismo signo y la misma magnitud. **No son cuatro
errores de carga: es un bug aplicado cuatro veces.** Yesi cargó bien las cuatro.

### El mecanismo

Las cuatro columnas son `timestamptz`. PostgREST las devuelve con offset:
`"2026-09-11T12:00:00+00:00"`. Los inputs son `<input type="datetime-local">`, o sea hora local
**sin zona**. El código de `main` hacía:

```javascript
// leer  (carta-llamados.html:1112 en main)
document.getElementById('f-ci-insc').value = rec?.cierre_inscripcion ? rec.cierre_inscripcion.slice(0,16) : '';
// escribir (carta-llamados.html:1165 en main)
cierre_inscripcion: document.getElementById('f-ci-insc').value || null,
```

`"2026-09-11T12:00:00+00:00".slice(0,16)` = `"2026-09-11T12:00"`. **Se queda con la hora UTC y le
arranca el offset.** El input muestra 12:00, la secretaría lee "mediodía", y al guardar se manda
`"2026-09-11T12:00"` sin zona, que Postgres toma como UTC → `12:00+00` = **09:00 AR**.

Y lo peor: **el error se acumula por vuelta.** Abrir el turno y darle Guardar sin tocar nada
corría las cuatro fechas otras −3 h. Con el código de `main`, mirar un turno lo corrompía.

---

## 2. El fix

Dos helpers, inversos exactos entre sí. `carta-llamados.html`, después de `parseMonto`:

```javascript
// timestamptz → el value del input, en la hora local del browser.
function isoAInputLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
       + `T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

// El value del input (hora local sin zona) → ISO con offset explícito.
function inputLocalAISO(val) {
  if (!val) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(val);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
```

Dos decisiones que vale la pena dejar escritas:

- **`getFullYear`/`getMonth`/`getDate`/`getHours`/`getMinutes` son todos hora local.** Ahí está la
  conversión que faltaba: el `.slice` no convertía nada, sólo recortaba texto.
- **El `Date` de escritura se arma por COMPONENTES a propósito.** `new Date(y, m, d, h, mi)` es
  hora local por definición del lenguaje. Pasarle el string (`new Date("2026-09-11T12:00")`)
  también da lo correcto en los motores actuales, pero depende de una regla de parseo de strings
  que **ya cambió una vez** en la historia de JS. Por componentes no hay ambigüedad que dependa
  del motor — que es la misma lección del GOTCHA #91: no delegar en el runtime lo que se puede
  escribir explícito.

Las cuatro lecturas y las cuatro escrituras pasan por ellos. **Son los únicos cuatro
`datetime-local` del repo**, verificado:

```
$ grep -rn 'type="datetime-local"' --include=*.html . | grep -v node_modules
carta-llamados.html:420:          <input type="datetime-local" id="f-ap-insc">
carta-llamados.html:424:          <input type="datetime-local" id="f-ci-insc">
carta-llamados.html:428:          <input type="datetime-local" id="f-ap-rat">
carta-llamados.html:432:          <input type="datetime-local" id="f-ci-rat">
```

### Diff de `carta-llamados.html`

```diff
diff --git a/carta-llamados.html b/carta-llamados.html
index 5e9b69d..1f7fbf8 100644
--- a/carta-llamados.html
+++ b/carta-llamados.html
@@ -622,6 +622,50 @@ function parseMonto(str) {
   const s = String(str).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
   return parseFloat(s) || 0;
 }
+
+// ---------------------------------------------------------------------------
+// Fechas de las ventanas: <input type="datetime-local"> ↔ timestamptz
+// ---------------------------------------------------------------------------
+// Las cuatro columnas (apertura/cierre de inscripción y de ratificación) son
+// `timestamptz`: guardan un instante y PostgREST las devuelve con offset,
+// "2026-09-11T12:00:00+00:00". Un `datetime-local`, en cambio, es hora local
+// SIN zona.
+//
+// El código viejo hacía `.slice(0,16)` sobre el ISO y mandaba el value pelado.
+// Eso se queda con la hora UTC y le arranca el offset: la pantalla mostraba
+// 12:00 (que eran las 09:00 de Argentina) y al guardar escribía 12:00 UTC, o
+// sea otra vez las 09:00. Yesi cargó bien las cuatro fechas de R9 y las cuatro
+// quedaron corridas −3 h. No eran cuatro errores: era este bug, cuatro veces.
+// Ver docs/diagnosticos/2026-09-08_plan-hora-cierre-r9.md y GOTCHA #91.
+//
+// Las dos funciones son inversas exactas entre sí, y la ida y vuelta
+// (leer → guardar sin tocar nada) tiene que dejar el MISMO instante.
+
+// timestamptz → el value del input, en la hora local del browser.
+// getFullYear/getMonth/getDate/getHours/getMinutes son todos hora local: ahí
+// está la conversión que faltaba.
+function isoAInputLocal(iso) {
+  if (!iso) return '';
+  const d = new Date(iso);
+  if (isNaN(d.getTime())) return '';
+  const p2 = (n) => String(n).padStart(2, '0');
+  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
+       + `T${p2(d.getHours())}:${p2(d.getMinutes())}`;
+}
+
+// El value del input (hora local sin zona) → ISO con offset explícito.
+// El Date se arma por COMPONENTES a propósito: `new Date(y, m, d, h, mi)` es
+// hora local por definición. Pasarle el string a `new Date()` también anda en
+// los motores actuales, pero depende de una regla de parseo del string que ya
+// cambió una vez; por componentes no hay ambigüedad que dependa del motor.
+function inputLocalAISO(val) {
+  if (!val) return null;
+  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(val);
+  if (!m) return null;
+  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
+  if (isNaN(d.getTime())) return null;
+  return d.toISOString();
+}
 function fmtInput(el) {
   let raw = el.value.replace(/\$/g, '').replace(/\s/g, '');
   const commaIdx = raw.indexOf(',');
@@ -1108,10 +1152,13 @@ function openModal(rec=null) {
   document.getElementById('f-bono-pos-hasta').value = dist.bono_posicion_hasta || '';
   document.getElementById('f-bono-pos-monto').value = dist.bono_posicion_monto ? formatMonto(dist.bono_posicion_monto) : '';
   updPct();
-  document.getElementById('f-ap-insc').value = rec?.apertura_inscripcion ? rec.apertura_inscripcion.slice(0,16) : '';
-  document.getElementById('f-ci-insc').value = rec?.cierre_inscripcion ? rec.cierre_inscripcion.slice(0,16) : '';
-  document.getElementById('f-ap-rat').value = rec?.apertura_ratificacion ? rec.apertura_ratificacion.slice(0,16) : '';
-  document.getElementById('f-ci-rat').value = rec?.cierre_ratificacion ? rec.cierre_ratificacion.slice(0,16) : '';
+  // Las cuatro pasan por isoAInputLocal: el input muestra la hora de Argentina,
+  // no la UTC. Antes era `.slice(0,16)` sobre el ISO — ver el comentario de
+  // isoAInputLocal.
+  document.getElementById('f-ap-insc').value = isoAInputLocal(rec?.apertura_inscripcion);
+  document.getElementById('f-ci-insc').value = isoAInputLocal(rec?.cierre_inscripcion);
+  document.getElementById('f-ap-rat').value  = isoAInputLocal(rec?.apertura_ratificacion);
+  document.getElementById('f-ci-rat').value  = isoAInputLocal(rec?.cierre_ratificacion);
   document.getElementById('modal').classList.add('open');
 }
 
@@ -1161,10 +1208,12 @@ async function saveRecord() {
     bolsa_total: bolsaVal,
     cupo_maximo: document.getElementById('f-cupo').value ? parseInt(document.getElementById('f-cupo').value) : null,
     distribucion_premios: distribucion,
-    apertura_inscripcion: document.getElementById('f-ap-insc').value || null,
-    cierre_inscripcion: document.getElementById('f-ci-insc').value || null,
-    apertura_ratificacion: document.getElementById('f-ap-rat').value || null,
-    cierre_ratificacion: document.getElementById('f-ci-rat').value || null,
+    // Las cuatro pasan por inputLocalAISO: se manda el instante con offset
+    // explícito. Antes se mandaba el value pelado y Postgres lo tomaba como UTC.
+    apertura_inscripcion: inputLocalAISO(document.getElementById('f-ap-insc').value),
+    cierre_inscripcion: inputLocalAISO(document.getElementById('f-ci-insc').value),
+    apertura_ratificacion: inputLocalAISO(document.getElementById('f-ap-rat').value),
+    cierre_ratificacion: inputLocalAISO(document.getElementById('f-ci-rat').value),
     estado: 'abierta',
   };
   const { error } = id
```

---

## 3. El probe

`tests/probe_carta_hora_local.mjs` — real-code, mini-DOM, sin browser. Corre el `openModal` y el
`saveRecord` **reales** extraídos del HTML, con el cliente Supabase real. Fixture propio
(reunión 9991, fecha 2099), teardown verificado en el `finally`. **No toca R9.**

Estructura de los 22 asserts:

| Grupo | Qué prueba |
|---|---|
| **H1-H4** | los helpers sueltos: conversión, zona explícita en la cadena, que sean inversos exactos, y que vacío/basura no exploten |
| **L1-L4** | lectura: los cuatro inputs muestran la hora argentina, leyendo el registro real de la base |
| **E1-E3** | escritura: **el caso de Yesi** — cargar `12:00` en el input guarda las 12:00 de Argentina |
| **R1-R6** | **la ida y vuelta completa** |
| **F1-F3** | lo que no se tocó |
| **T1** | teardown limpio |

### El assert que importa: la ida y vuelta

`R1-R6` abren el modal con el registro real y le dan **Guardar sin editar nada**. Los cuatro
instantes tienen que quedar idénticos. Y lo hace **dos veces seguidas**, porque el bug viejo
corría −3 h *por vuelta*: una sola vuelta se puede pasar por alto, dos lo hacen obvio.

### Salida cruda — corrida normal

```

── Probe · carta-llamados, las cuatro ventanas en hora argentina ──
   html=/home/clio/dev/SGH/carta-llamados.html
   TZ=America/Argentina/Buenos_Aires  ·  offset=-3 h
 ✅ H1) isoAInputLocal convierte el instante a hora argentina  → 2099-05-04T15:00:00+00:00 → "2099-05-04T12:00"  (esperado "2099-05-04T12:00")
 ✅ H2) inputLocalAISO da el instante correcto  → "2099-05-04T12:00" → 2099-05-04T15:00:00.000Z  (esperado el instante de 2099-05-04T15:00:00+00:00)
 ✅ H2b) …y la cadena que devuelve lleva zona explícita (Z u offset)  → "2099-05-04T15:00:00.000Z"
 ✅ H3) las dos funciones son inversas exactas: ISO → input → ISO no mueve el instante  → 2099-05-04T15:00:00+00:00→2099-05-04T15:00:00.000Z · 2026-09-11T15:00:00+00:00→2026-09-11T15:00:00.000Z · 2026-01-01T03:00:00+00:00→2026-01-01T03:00:00.000Z · 2026-12-31T02:59:00+00:00→2026-12-31T02:59:00.000Z
 ✅ H4) vacío y basura no explotan
 ✅ L1) apertura de inscripción se muestra en hora argentina  → input="2099-05-01T09:00"  esperado="2099-05-01T09:00"  (db=2099-05-01T12:00:00+00:00)
 ✅ L2) cierre de inscripción se muestra en hora argentina  → input="2099-05-04T12:00"  esperado="2099-05-04T12:00"  (db=2099-05-04T15:00:00+00:00)
 ✅ L3) apertura de ratificación se muestra en hora argentina  → input="2099-05-06T08:30"  esperado="2099-05-06T08:30"
 ✅ L4) cierre de ratificación se muestra en hora argentina  → input="2099-05-07T18:45"  esperado="2099-05-07T18:45"
 ✅ E1) cargar 12:00 en el input guarda las 12:00 DE ARGENTINA  → db=2026-09-11T15:00:00+00:00  (esperado el instante de 2026-09-11T15:00:00+00:00 = 12:00 AR)
 ✅ E2) y se relee como 12:00 en el input  → relectura="2026-09-11T12:00"
 ✅ E3) no hubo toast de error al guardar  → [{"msg":"Turno actualizado"}]
 ✅ R1) ida y vuelta sin editar: apertura de inscripción no se mueve  → antes=2099-05-01T12:00:00+00:00  después=2099-05-01T12:00:00+00:00
 ✅ R2) ida y vuelta sin editar: cierre de inscripción no se mueve  → antes=2026-09-11T15:00:00+00:00  después=2026-09-11T15:00:00+00:00
 ✅ R3) ida y vuelta sin editar: apertura de ratificación no se mueve  → antes=2099-05-06T11:30:00+00:00  después=2099-05-06T11:30:00+00:00
 ✅ R4) ida y vuelta sin editar: cierre de ratificación no se mueve  → antes=2099-05-07T21:45:00+00:00  después=2099-05-07T21:45:00+00:00
 ✅ R5) dos vueltas seguidas tampoco mueven ninguno de los cuatro  → apertura_inscripcion: 0h · cierre_inscripcion: 0h · apertura_ratificacion: 0h · cierre_ratificacion: 0h
 ✅ R6) y el input sigue mostrando lo mismo después de las dos vueltas  → "2026-09-11T12:00"
 ✅ F1) los cuatro inputs de ventana siguen siendo datetime-local  → encontrados=4
 ✅ F2) no quedó ningún .slice(0,16) sobre una fecha en el archivo
 ✅ F3) hora_estimada (time sin zona) sigue yendo cruda, sin conversión
 ✅ T1) teardown: no quedó ninguna reunión 9991 en la base  → quedan=0

22/22 OK
```

### Salida cruda — mutation testing

```

═══ MUTATION TESTING · 8/8 mutantes ═══
(copias en /tmp/mut-carta-hora-u74CX9 — el repo no se toca)

✅ M1 muere — vuelve el bug: las cuatro LECTURAS con .slice(0,16) sobre el ISO  [esperaba matar L1,L2,L3,L4,R1,R2,R3,R4; murieron L1,L2,L3,L4,R1,R2,R3,R4]
✅ M2 muere — vuelve el bug: las cuatro ESCRITURAS mandan el value pelado  [esperaba matar E1,R1,R2,R3,R4; murieron E1,R1,R2,R3,R4]
✅ M3 muere — isoAInputLocal lee la hora UTC (getUTCHours) en vez de la local  [esperaba matar L1,L2,L3,L4,H1,R1; murieron L1,L2,L3,L4,H1,R1]
✅ M4 muere — inputLocalAISO arma el Date en UTC (Date.UTC) en vez de local  [esperaba matar E1,H2,R1,R2,R3,R4; murieron E1,H2,R1,R2,R3,R4]
✅ M5 muere — sólo el CIERRE de inscripción vuelve al .slice — el resto queda bien  [esperaba matar L2,R2; murieron L2,R2]
✅ M6 muere — sólo el CIERRE de ratificación se guarda pelado — el resto queda bien  [esperaba matar R4; murieron R4]
✅ M7 muere — inputLocalAISO devuelve el value sin convertir  [esperaba matar E1,H2b,R1; murieron E1,H2b,R1]
✅ M8 muere — las dos funciones dejan de ser inversas: isoAInputLocal suma una hora  [esperaba matar H3,L1; murieron H3,L1]

✅ TANDA LIMPIA — 8 probados · 8 muertos

```

**8 mutantes, 8 muertos.** M1 y M2 son literalmente el código de `main` reinyectado: el probe
falla con el código viejo, que es la prueba de que mide el fix y no otra cosa.

### Un hueco que el propio mutante destapó, y cómo se tapó

`M7` (que `inputLocalAISO` devuelva el value sin convertir) **no mataba `H2`**. El motivo es
instructivo: `H2` comparaba instantes con `new Date(...).getTime()`, y JS reparsea
`"2099-05-04T12:00"` como **hora local**, así que da el mismo número. El string pelado pasaba el
assert.

Lo que no lo deja pasar es **Postgres**, que toma el string sin zona como **UTC** — por eso `E1`
y `R1`, que van contra la base, sí lo mataban. Se agregó `H2b`, que exige que la cadena devuelta
lleve zona explícita (`Z` u offset), para cerrarlo también del lado del cliente.

Queda anotado en el probe: **el assert que decide es el que va contra la base.** Un round-trip
en memoria puede confirmar un bug de zona en vez de detectarlo, porque las dos puntas usan las
mismas reglas de parseo.

---

## 4. Lo que NO se tocó

| | |
|---|---|
| El valor de las cuatro columnas de R9 | intacto. Este commit es **sólo código**. Cero DML. |
| `apertura_inscripcion` de R9 | intacta, y no se va a tocar retroactivamente — ya pasó |
| `hora_estimada` | intacta. Es `time without time zone`, no lleva zona: sigue yendo cruda. Assert F3 |
| Cualquier otro módulo | ningún otro archivo del repo tiene `datetime-local` |
| `main` | intacto en `79821ae` |

### ⚠️ Un detalle a avisarle a la secretaría antes de que abra la pantalla

Con la UI arreglada, al abrir un turno de R9 el input de **apertura de inscripción** va a mostrar
**`27/08 21:00`**. No es un error nuevo: es la verdad de lo que está guardado hoy. Si alguien lo
"corrige" a `28/08 00:00`, estaría cambiando el dato — y quedamos en no tocarlo retroactivamente.

---

## 5. Hallazgo lateral: `bolsa_total` NOT NULL bloquea el guardado

Apareció corriendo el probe, no lo estaba buscando. **No está arreglado en esta rama.**

`bolsa_total` es `NOT NULL`. `openModal` llena el input así:

```javascript
document.getElementById('f-bolsa').value = rec?.bolsa_total ? formatMonto(rec.bolsa_total) : '';
```

`rec.bolsa_total` de **0 es falsy** → el input queda vacío → `saveRecord` manda
`bolsa_total: null` → la fila **no se guarda**:

```
null value in column "bolsa_total" of relation "carreras" violates not-null constraint
```

O sea: **un turno con bolsa 0 no se puede editar desde la pantalla.** Aparece como un toast de
error y el turno queda sin guardar. Los once turnos de R9 tienen bolsa cargada, así que no
bloquea el paso 2 — pero es un bug real y separado. Va como pregunta abierta (§7).

---

## 6. Paso 2 — corregir el dato desde la pantalla

Queda **pendiente del OK sobre esta rama**, según el gate.

Una vez mergeado, la secuencia es:

1. Verificar que el fix llegó a producción (MD5 de `carta-llamados.html` contra `sigh.com.ar`).
2. Abrir `carta-llamados.html` con R9.
3. Turno por turno: abrir el turno, poner **`12:00`** en *Cierre de inscripción*, Guardar.
   El input ya va a mostrar `09:00` — que es lo que hay — y hay que llevarlo a `12:00`.
   **No tocar la apertura de inscripción** (mostrará `27/08 21:00`; se deja).
4. Verificar por SQL que los once quedaron en `2026-09-11 15:00:00+00` = 12:00 AR
   (la query de verificación está en el §4.2 del plan).
5. Verificación de punta a punta del lado del usuario: el chip del llamado abierto del portal
   tiene que decir **`⏳ cierra 11/9 12:00 hs`**.

**Si eso funciona, el UPDATE por SQL del §4 del plan no hace falta** — que es justamente lo que
lo convierte en la prueba de punta a punta del fix.

**Plan B, si el paso 2 se complica:** corremos el UPDATE del §4 del plan igual. El cierre es el
viernes 11/09 y la fecha manda. El SQL está escrito, acotado y con rollback; se puede correr en
minutos.

**Ventana de tiempo:** hoy es 08/09. El cierre viejo es el 11/09 a las 09:00 AR. Quedan
**~3 días**.

---

## 7. Preguntas abiertas

1. **¿Arreglo también el `bolsa_total` de 0 (§5)?** Es una línea (`rec?.bolsa_total != null`
   en vez de truthy), pero es otro bug y va con su propio assert. ¿Entra en esta rama o va
   aparte?
2. **El cierre de ratificación de R9 sigue en lunes 09:00 AR.** Con la UI arreglada se corrige
   desde la misma pantalla y en el mismo paso, sin costo extra. **¿El criterio de Yesi para
   ratificación también es 12:00?** No lo asumo.
3. **¿Le aviso yo a la secretaría lo del `27/08 21:00` de la apertura (§4)?** Si abre la pantalla
   sin ese contexto, es probable que lo "corrija".
4. **¿La carta de llamados ya impresa dice 09:00?** Si se repartió en papel, el cambio en la base
   y el papel no van a coincidir. No lo puedo verificar desde acá.
5. **El mismo bug pudo afectar reuniones anteriores.** No lo revisé: el pedido era R9. ¿Barro las
   reuniones pasadas para ver si tienen el mismo corrimiento? Son datos históricos, no urge.

---

## 8. Verificación en `origin`

```
$ git ls-remote origin fix/carta-llamados-hora-local
71a5995a796f4e2c5234dab8e47713c9cba075c0	refs/heads/fix/carta-llamados-hora-local

$ git ls-remote origin main            # intacto, sin mergear
79821ae01a9b8e8768ae698b967462d00baa71a0	refs/heads/main

$ git diff --stat origin/main..origin/fix/carta-llamados-hora-local
 carta-llamados.html              |  65 +++++-
 tests/README.md                  |   1 +
 tests/probe_carta_hora_local.mjs | 435 +++++++++++++++++++++++++++++++++++++++
 3 files changed, 493 insertions(+), 8 deletions(-)
```

**`main` sigue en `79821ae`. Nada se mergeó. La rama espera tu OK.**

```bash
git fetch origin
git diff origin/main..origin/fix/carta-llamados-hora-local
git switch fix/carta-llamados-hora-local

set -a; . ./.env; set +a
node tests/probe_carta_hora_local.mjs
node tests/probe_carta_hora_local.mjs --mutantes
```
