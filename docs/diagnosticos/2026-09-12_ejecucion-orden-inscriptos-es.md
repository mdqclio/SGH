# Ejecución — inscriptos en alfabético castellano (pantalla = PDF), baseline spcs 205

- **Fecha:** 2026-09-12
- **Rama:** `fix/orden-inscriptos-es` @ `d49dd47cda8e875ed522b4b29bc55193357dd86f` (sobre `main` `92774aa`)
- **GATE:** diff a branch, **sin mergear**. Pusheada a `origin` (verificación al pie).
- **Guards:** `pwd` `/home/clio/dev/SGH` ✔ · `count(spcs)` **205** (= baseline nuevo) ✔ · ref `unlhcuanfrtpatoipwve` ✔
- **Relevamiento previo:** `docs/diagnosticos/2026-09-12_orden-inscriptos-pantalla-vs-pdf.md`

## Qué cambió

| Archivo | Cambio |
|---|---|
| `inscripciones.html:596-614` | `loadInscripciones()`: `select` suma `spcs(nombre)`; sale `.order('created_at')`; sort en cliente `localeCompare(nombre, 'es')` (comparador idéntico a `ratificacion.html:306`). |
| `inscripciones.html:671` | La celda del nombre usa `i.spcs?.nombre` primero (el cache `spcs` sólo trae activos). |
| `inscripciones.html:682` | `openModal(...)` recibe la fila sin `spcs` (igual que ya se quitaba `cargador`). |
| `inscripciones.html:889-898` | `printInscriptos()`: `'es'` explícito en el sort del PDF. |
| `tests/probe_orden_inscriptos.mjs` | Nuevo. 52 asserts, sólo lectura. |
| `CLAUDE.md` | Baseline 203 → 205 (guard, ⚠️, historial, dos líneas de probes) + probe nuevo en la lista. |
| `tests/probe_spcs_r9_tanda_1.mjs`, `tests/probe_spcs_studbook_alta.mjs` | Asserteaban `203` hardcodeado → 205 (`ALTAS_UI_12_09 = 2` con comentario de origen). |
| `CHANGELOG.md`, `docs/MODULOS.md` | Entrada + párrafo "Orden del listado" en inscripciones. |

Decisión de implementación (no de producto): **sort en cliente, no `ORDER BY`** — la colación de Postgres no es
castellana (`NISTEL WIN < NIÑO OCEANICO`); y el nombre por **JOIN** y no por `getSpc()` porque el cache sólo
tiene activos. Nada de esto cambia lo que se guarda: la gatera sigue yendo por `id`.

## Diff de código (`git diff main..fix/orden-inscriptos-es -- inscripciones.html CLAUDE.md tests/probe_spcs_r9_tanda_1.mjs tests/probe_spcs_studbook_alta.mjs`)

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 385e1d0..8e8becc 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -259,11 +259,11 @@ Antes de cualquier operación de escritura sobre producción, verificar los tres
 
 ```
 pwd                          → /home/clio/dev/SGH
-SELECT count(*) FROM spcs    → 203        (baseline al 2026-09-11, noche, tanda 3)
+SELECT count(*) FROM spcs    → 205        (baseline al 2026-09-12, altas de Yesi por spcs.html)
 ref del proyecto             → unlhcuanfrtpatoipwve
 ```
 
-⚠️ El 203 **incluye caballos de prueba**: `spcs` es global sin `club_id` (GOTCHA #13) y los
+⚠️ El 205 **incluye caballos de prueba**: `spcs` es global sin `club_id` (GOTCHA #13) y los
 ejemplares de test de "Mi Club Hípico" (`Pampa Libre`, `Don Facundo`) suman al conteo. Sirve para lo
 que se usa —detectar proyecto equivocado— pero **no es el padrón real de Dolores**. GOTCHA #75,
 ISSUE-061.
@@ -273,7 +273,9 @@ cuando pase. Historial: 179 → 183 (tanda 5) → **181** (2026-08-23, se unific
 duplicados: se borraron `Fist Queen` y `Malenuchi`, ver `docs/PLAN_DUPLICADOS_SPC.md`) → **199**
 (2026-09-11, R9 tanda 1: 18 altas de la planilla de anotaciones, `migrations/spcs_r9_tanda_1.sql`) → **201**
 (2026-09-11 noche, R9 tanda 2: QUE BELLA DOÑA e INDIANA MARO, `migrations/spcs_r9_tanda_2.sql`) → **203**
-(2026-09-11 noche, R9 tanda 3: BIEN COQUETA y EL MAS SABIO, `migrations/spcs_r9_tanda_3.sql`).
+(2026-09-11 noche, R9 tanda 3: BIEN COQUETA y EL MAS SABIO, `migrations/spcs_r9_tanda_3.sql`) → **205**
+(2026-09-12, Yesi dio de alta DAHUA y SOUTH GOTICO desde `spcs.html` con el buscador del Stud Book — primeras
+altas por UI, sin migración; ambos inscriptos en R9 T3 y T4).
 
 Los guards que aparecen dentro de los planes y bitácoras de `docs/` son **fotos de su fecha**, no el
 baseline vigente: no se reescriben.
@@ -348,11 +350,12 @@ node tests/probe_solicitar_cuenta_existente.mjs   # ISSUE-069 — A DEMANDA: man
 node tests/probe_solicitar_falta_paso.mjs         # ISSUE-070 — pantalla "Ya casi"; sin red, no manda nada
 node tests/probe_club_id_alta_propietarios.mjs     # ISSUE-072 — alta con club_id + listado por club; ESCRIBE, teardown verificado
 node tests/probe_alta_entrenador_operador.mjs      # ISSUE-078/073/079 — operador ve "+ Nuevo Entrenador", tipo elegible, UPDATE/DELETE por club; ESCRIBE, teardown verificado
-node tests/probe_spcs_r9_tanda_1.mjs               # R9 tandas 1+2+3 — 22 altas vs evidencia del Stud Book, count 203, Conesera hembra; solo lectura
+node tests/probe_spcs_r9_tanda_1.mjs               # R9 tandas 1+2+3 — 22 altas vs evidencia del Stud Book, count 205, Conesera hembra; solo lectura
 node tests/probe_rpc_spcs_duplicados.mjs           # rpc_spcs_duplicados — 3 motivos, staff ok / portal 42501; ESCRIBE usuarios de prueba, teardown verificado
 node tests/probe_studbook_buscar_fn.mjs            # studbook-buscar — lógica extraída del index.ts contra el Stud Book real; sin Supabase
 node tests/probe_studbook_buscar_e2e.mjs           # studbook-buscar deployada — 200 staff / 403 portal / 401 sin token / preflight; ESCRIBE usuarios, teardown verificado
-node tests/probe_spcs_studbook_alta.mjs            # spcs.html — buscar, Usar, prellenado, panel de duplicados (bloquea / Guardar igual), INSERT real; ESCRIBE 1 spc + 1 usuario, teardown verificado, count 203
+node tests/probe_spcs_studbook_alta.mjs            # spcs.html — buscar, Usar, prellenado, panel de duplicados (bloquea / Guardar igual), INSERT real; ESCRIBE 1 spc + 1 usuario, teardown verificado, count 205
+node tests/probe_orden_inscriptos.mjs             # inscripciones.html — pantalla y PDF en alfabético 'es' (= ratificacion); R9 T4 NIÑO OCEANICO < NISTEL WIN; solo lectura
 ```
 
 **El patrón es código real sin browser.** Chromium no corre en este Ubuntu (`"Playwright does not support chromium on ubuntu26.04-x64"` — ver `docs/SERVER.md`), así que el probe **extrae del propio HTML** la función o el bloque a probar —por ancla, con balance de llaves—, lo corre con `new AsyncFunction(...)` inyectando dependencias reales (cliente Supabase con `SUPABASE_SECRET_KEY`, más stubs de DOM si hacen falta) y assertea contra la base. Nunca reimplementar la lógica dentro del test: si el archivo cambia, el probe corre el archivo cambiado. Para lo que escribe: **snapshot → run → assert → restore** en el `finally`.
diff --git a/inscripciones.html b/inscripciones.html
index 2f20aee..0ed8277 100644
--- a/inscripciones.html
+++ b/inscripciones.html
@@ -596,11 +596,21 @@ async function loadInscripciones() {
   // El nombre del cargador va por JOIN explícito: inscripciones tiene DOS FK a
   // usuarios (inscripto_por y ratificado_por), así que PostgREST necesita el
   // nombre del constraint o falla por ambigüedad.
+  // El nombre del SPC viene por JOIN y no del cache `spcs` (que sólo trae
+  // activos): un inscripto cuyo SPC se desactivó quedaría sin nombre y caería
+  // al principio de la lista.
   const { data, error } = await sb.from('inscripciones')
-    .select('*, cargador:usuarios!inscripciones_inscripto_por_fkey(nombre_completo)')
-    .eq('carrera_id', currentCarreraId).order('created_at');
+    .select('*, cargador:usuarios!inscripciones_inscripto_por_fkey(nombre_completo), spcs(nombre)')
+    .eq('carrera_id', currentCarreraId);
   if (error) { toast(error.message,'error'); return; }
-  inscripciones = data||[];
+  // Alfabético por nombre del SPC, colación castellana — el mismo orden que el
+  // PDF de inscriptos y que la hoja "ORDEN DE LARGADA". Yesi carga la gatera
+  // leyendo el papel contra esta pantalla (pedido 12/09/2026). Mismo comparador
+  // que ratificacion.html: 'es' explícito, la Ñ va después de la N y la tilde
+  // no separa. Se ordena en cliente y no con ORDER BY porque la colación de
+  // Postgres no es la castellana (NISTEL WIN < NIÑO OCEANICO).
+  inscripciones = (data||[]).sort((a, b) =>
+    (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es'));
   renderInscripciones();
 }
 
@@ -658,7 +668,7 @@ function renderInscripciones() {
       ? `<span style="color:var(--muted)">—</span>`
       : `<input type="number" min="1" step="1" class="gatera-input" value="${i.numero_partidor??''}" data-prev="${i.numero_partidor??''}" onchange="guardarGatera('${i.id}', this)" style="width:60px;text-align:center" title="N° de gatera (sorteo)">`;
     return `<tr>
-      <td><div class="spc-name">${spc?.nombre||i.spc_id}</div></td>
+      <td><div class="spc-name">${i.spcs?.nombre||spc?.nombre||i.spc_id}</div></td>
       <td>${gateraCell}</td>
       <td>${certCell}</td>
       <td>${cab?`${cab.nombre}${cab.hipodromo_patente?` (${cab.hipodromo_patente})`:''}`:'—'}</td>
@@ -669,7 +679,7 @@ function renderInscripciones() {
       <td>${cargadaCell}</td>
       <td><span class="badge badge-${i.estado}">${i.estado?.replace('_',' ')||'—'}</span></td>
       <td class="actions-cell">
-        <button class="btn-sm btn-edit" onclick='openModal(${JSON.stringify({ ...i, cargador: undefined })})'>✏️</button>
+        <button class="btn-sm btn-edit" onclick='openModal(${JSON.stringify({ ...i, cargador: undefined, spcs: undefined })})'>✏️</button>
         <button class="btn-sm btn-delete" onclick="deleteRecord('${i.id}')">🗑️</button>
       </td>
     </tr>`;
@@ -876,12 +886,15 @@ async function printInscriptos() {
 
   const inscs = inscsData || [];
 
-  // Pre-ordenar inscriptos por nombre de SPC por carrera (reutilizado en bloques y matriz)
+  // Pre-ordenar inscriptos por nombre de SPC por carrera (reutilizado en bloques y matriz).
+  // 'es' explícito: sin locale, localeCompare usa el del navegador que imprime, y en
+  // inglés la Ñ cuenta como N (AÑO < ANZUELO). Mismo comparador que la pantalla y
+  // que ratificacion.html.
   const inscsByCarrera = new Map();
   allCars.forEach(car => {
     inscsByCarrera.set(car.id, inscs
       .filter(i => i.carrera_id === car.id)
-      .sort((a, b) => (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '')));
+      .sort((a, b) => (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es')));
   });
 
   // Texto de sexo derivado de condicion_sexo, y regex para detectar si el texto libre
diff --git a/tests/probe_spcs_r9_tanda_1.mjs b/tests/probe_spcs_r9_tanda_1.mjs
index a22ac28..4c779da 100644
--- a/tests/probe_spcs_r9_tanda_1.mjs
+++ b/tests/probe_spcs_r9_tanda_1.mjs
@@ -6,7 +6,8 @@
  * edad + 2 typos de planilla), que están en migrations/spcs_r9_tanda_1.sql.
  *
  * Asserts:
- *   A) count(spcs) = 203 (181 + 18 tanda 1 + 2 tanda 2 + 2 tanda 3 — BIEN COQUETA, EL MAS SABIO)
+ *   A) count(spcs) = 205 (181 + 18 tanda 1 + 2 tanda 2 + 2 tanda 3 + 2 altas de Yesi por spcs.html
+ *      el 12/09 — DAHUA, SOUTH GOTICO; ver ALTAS_UI_12_09)
  *   B) las 18 filas existen por studbook_id, una sola vez cada una
  *   C) nombre / fecha_nacimiento / sexo / color / padre / madre iguales a la evidencia
  *   D) registro_stud_book NULL, club_id NULL, FK de asignación NULL, estado activo
@@ -31,6 +32,9 @@ const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, pe
 const HERE = dirname(fileURLToPath(import.meta.url));
 
 const BASELINE_ANTES = 181;
+// Altas hechas por Yesi desde spcs.html (buscador del Stud Book) el 12/09/2026, fuera de las
+// tandas SQL: DAHUA (SB 438313) y SOUTH GOTICO (SB 424339). Suman al count pero no son de este probe.
+const ALTAS_UI_12_09 = 2;
 const TANDA_2 = [
   { nombre_sb: 'QUE BELLA DOÑA', sb_id: '446458', fecha_nacimiento: '2023-10-08', sexo: 'hembra', color: 'Zaino',  padrillo_nombre: 'Sea Dog', madre_nombre: 'Paradise Nistel',  variante: 'BELLA DOÑA' },
   { nombre_sb: 'INDIANA MARO',   sb_id: '432433', fecha_nacimiento: '2021-09-15', sexo: 'hembra', color: 'Alazan', padrillo_nombre: 'Gokstad', madre_nombre: 'Ilusionada Chica', variante: 'INDIA MARO' },
@@ -58,7 +62,7 @@ const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); ret
 // A
 const { count: total, error: eC } = await sb.from('spcs').select('id', { count: 'exact', head: true });
 if (eC) throw eC;
-ok('A count(spcs) = 203', total === BASELINE_ANTES + 18 + TANDA_2.length + TANDA_3.length, `real ${total}`);
+ok('A count(spcs) = 205', total === BASELINE_ANTES + 18 + TANDA_2.length + TANDA_3.length + ALTAS_UI_12_09, `real ${total}`);
 
 // B–F
 const { data: filas, error: eF } = await sb.from('spcs')
diff --git a/tests/probe_spcs_studbook_alta.mjs b/tests/probe_spcs_studbook_alta.mjs
index 645201d..f2ee9ed 100644
--- a/tests/probe_spcs_studbook_alta.mjs
+++ b/tests/probe_spcs_studbook_alta.mjs
@@ -196,7 +196,7 @@ try {
   const { data: restSpc } = await admin.from('spcs').select('id').like('nombre', 'PROBE SBALTA %');
   ok('T) teardown: 0 spcs de prueba', (restSpc || []).length === 0, JSON.stringify(restSpc));
   const { count } = await admin.from('spcs').select('id', { count: 'exact', head: true });
-  ok('T) count spcs = 203 (baseline CLAUDE.md)', count === 203, String(count));
+  ok('T) count spcs = 205 (baseline CLAUDE.md)', count === 205, String(count));
   const { data: rest } = await admin.from('usuarios').select('email').like('email', `probe.sbalta.%.${RUN}@sgh.test`);
   ok('T) teardown: 0 usuarios de prueba', (rest || []).length === 0, JSON.stringify(rest));
   const { data: au } = await admin.auth.admin.listUsers({ perPage: 200 });
```

## Probe nuevo — `node tests/probe_orden_inscriptos.mjs` (archivo de la rama)

```
✅ D1) pantalla: comparador con locale 'es'  — (a, b) =>
    (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es')
✅ D2) PDF: comparador con locale 'es'  — (a, b) => (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es')
✅ D3) pantalla ya no ordena por created_at
✅ D4) ratificacion.html: todos sus sorts por nombre llevan 'es'  — total: 3, sin 'es': 0
✅ D5) inscripciones.html: ningún localeCompare sin 'es'
✅ C) pantalla: Ñ después de toda la N (ANZUELO < AÑO NUEVO)  — ANA < ANZUELO < AÑO NUEVO < AOTO
✅ C) PDF: Ñ después de toda la N (ANZUELO < AÑO NUEVO)  — ANA < ANZUELO < AÑO NUEVO < AOTO
✅ C) pantalla: Ñ entre N y O (NUBE < ÑANDU < OSO)  — NUBE < ÑANDU < OSO
✅ C) PDF: Ñ entre N y O (NUBE < ÑANDU < OSO)  — NUBE < ÑANDU < OSO
✅ C) pantalla: tilde no separa (MARIA ≈ MARÍA, antes que ...GB)  — MARIA CATULENGA < MARÍA CATULENGA < MARIA CATULENGB
✅ C) PDF: tilde no separa (MARIA ≈ MARÍA, antes que ...GB)  — MARIA CATULENGA < MARÍA CATULENGA < MARIA CATULENGB
✅ C) pantalla: caso real: CHINITA SALTEÑA entre SALTENA y SALTEO  — CHINITA SALTENA < CHINITA SALTEÑA < CHINITA SALTEO
✅ C) PDF: caso real: CHINITA SALTEÑA entre SALTENA y SALTEO  — CHINITA SALTENA < CHINITA SALTEÑA < CHINITA SALTEO
✅ C) pantalla: mayúsculas/minúsculas no separan (La Porteña / LA PORTEÑO)  — LA CITY < La Porteña < LA PORTEÑO
✅ C) PDF: mayúsculas/minúsculas no separan (La Porteña / LA PORTEÑO)  — LA CITY < La Porteña < LA PORTEÑO
✅ A0) R9 tiene turnos  — 11 turnos
✅ A) T1: pantalla en alfabético 'es' (9)  — ARMOÑOZO | CONESERA | DESERT OF DUBAI | DOCTORA APASIONADA | ETERNA DOCTORA | HERMANOSDEMIPATRIA | MOSQUITA GARDEN | QUE BELLA DOÑA | SI TIN
✅ A) T1: PDF == pantalla, id por id
✅ A) T1: todas las filas traen spcs.nombre por JOIN
✅ A) T2: pantalla en alfabético 'es' (8)  — ALHENA | ASTUTO NOTES | DEL CAMPEON | DOCTOR SKY | DOCTORA MIA | LOCA DUBAI | OLA DOCTOR | TOUCH OF BLUE
✅ A) T2: PDF == pantalla, id por id
✅ A) T2: todas las filas traen spcs.nombre por JOIN
✅ A) T3: pantalla en alfabético 'es' (7)  — BAHIA ROMANA | DAHUA | LOCA DUBAI | MARIA CATULENGA | OLA DOCTOR | TORO MAÑERO | VISION SECURITY
✅ A) T3: PDF == pantalla, id por id
✅ A) T3: todas las filas traen spcs.nombre por JOIN
✅ A) T4: pantalla en alfabético 'es' (13)  — BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NIÑO OCEANICO | NISTEL WIN | REY DE PILA | SOUTH GOTICO | TOY BOY
✅ A) T4: PDF == pantalla, id por id
✅ A) T4: todas las filas traen spcs.nombre por JOIN
✅ A) T5: pantalla en alfabético 'es' (4)  — AMIGUITO JESUS | KUCCINI | NELIDA RIM | NOCHE EN VELA
✅ A) T5: PDF == pantalla, id por id
✅ A) T5: todas las filas traen spcs.nombre por JOIN
✅ A) T6: pantalla en alfabético 'es' (6)  — EL MAS SABIO | FALAYS | FREE CRY | HALLOTOP | IDALIA MARO | REINA EDITION
✅ A) T6: PDF == pantalla, id por id
✅ A) T6: todas las filas traen spcs.nombre por JOIN
✅ A) T7: pantalla en alfabético 'es' (8)  — ATOMIZADOR | ECHO IN THE SKY | EL RISKO | LATIN PRESUMIDA | LE BATEAU | SEMBRADOR CHUCK | SEÑOR MONCHI | YOOKY
✅ A) T7: PDF == pantalla, id por id
✅ A) T7: todas las filas traen spcs.nombre por JOIN
✅ A) T8: pantalla en alfabético 'es' (3)  — IDALIA MARO | LATIN PRESUMIDA | YOOKY
✅ A) T8: PDF == pantalla, id por id
✅ A) T8: todas las filas traen spcs.nombre por JOIN
✅ A) T9: pantalla en alfabético 'es' (6)  — CHINITA SALTEÑA | ESPLENDID CRAF | LE BATEAU | QUERELLANTE | THE BEAST PARTY | WISLA KEN
✅ A) T9: PDF == pantalla, id por id
✅ A) T9: todas las filas traen spcs.nombre por JOIN
✅ A) T10: pantalla en alfabético 'es' (8)  — ABARAJALA | BABY PARADISE | GRILLADA RYE | INDIANA MARO | KRISTALINA | LATIN RAIN | LOGUACIOUS | QUINIELA TREND
✅ A) T10: PDF == pantalla, id por id
✅ A) T10: todas las filas traen spcs.nombre por JOIN
✅ A) T11: pantalla en alfabético 'es' (9)  — BABY PARADISE | BUEN MANUEL | DESTINADO JOHAN | EL GRAN HECTOR | ES SABALERO | GOIADORA | HEART OF GOLD | INDIO VALIDO | TERRIBLE KING
✅ A) T11: PDF == pantalla, id por id
✅ A) T11: todas las filas traen spcs.nombre por JOIN
✅ B1) T4 contiene NIÑO OCEANICO y NISTEL WIN  — 8/9
✅ B2) T4: NIÑO OCEANICO antes que NISTEL WIN  — BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NIÑO OCEANICO | NISTEL WIN | REY DE PILA | SOUTH GOTICO | TOY BOY
✅ B3) discriminante: por codepoint saldrían al revés (NISTEL < NIÑO)  — BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NISTEL WIN | NIÑO OCEANICO | REY DE PILA | SOUTH GOTICO | TOY BOY

52/52 asserts OK
```

Nota: T1 muestra 9 inscriptos (MOSQUITA GARDEN) — el relevamiento de la mañana tenía 8. Yesi está cargando en
vivo; el probe lee lo que hay.

## Mutante 1 — mismo archivo con los dos `'es'` quitados (`INSC_HTML=<copia sin 'es'>`)

```bash
sed "s/localeCompare(b.spcs?.nombre || '', 'es')/localeCompare(b.spcs?.nombre || '')/g" inscripciones.html > insc_mutante_sin_es.html
INSC_HTML=insc_mutante_sin_es.html node tests/probe_orden_inscriptos.mjs
```

```
❌ D1) pantalla: comparador con locale 'es'  — (a, b) =>
    (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '')
❌ D2) PDF: comparador con locale 'es'  — (a, b) => (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '')
✅ D3) pantalla ya no ordena por created_at
✅ D4) ratificacion.html: todos sus sorts por nombre llevan 'es'  — total: 3, sin 'es': 0
❌ D5) inscripciones.html: ningún localeCompare sin 'es'  — localeCompare(b.spcs?.nombre || '') ; localeCompare(b.spcs?.nombre || '')
❌ C) pantalla: Ñ después de toda la N (ANZUELO < AÑO NUEVO)  — ANA < AÑO NUEVO < ANZUELO < AOTO
❌ C) PDF: Ñ después de toda la N (ANZUELO < AÑO NUEVO)  — ANA < AÑO NUEVO < ANZUELO < AOTO
❌ C) pantalla: Ñ entre N y O (NUBE < ÑANDU < OSO)  — ÑANDU < NUBE < OSO
❌ C) PDF: Ñ entre N y O (NUBE < ÑANDU < OSO)  — ÑANDU < NUBE < OSO
✅ C) pantalla: tilde no separa (MARIA ≈ MARÍA, antes que ...GB)  — MARIA CATULENGA < MARÍA CATULENGA < MARIA CATULENGB
✅ C) PDF: tilde no separa (MARIA ≈ MARÍA, antes que ...GB)  — MARIA CATULENGA < MARÍA CATULENGA < MARIA CATULENGB
✅ C) pantalla: caso real: CHINITA SALTEÑA entre SALTENA y SALTEO  — CHINITA SALTENA < CHINITA SALTEÑA < CHINITA SALTEO
✅ C) PDF: caso real: CHINITA SALTEÑA entre SALTENA y SALTEO  — CHINITA SALTENA < CHINITA SALTEÑA < CHINITA SALTEO
✅ C) pantalla: mayúsculas/minúsculas no separan (La Porteña / LA PORTEÑO)  — LA CITY < La Porteña < LA PORTEÑO
✅ C) PDF: mayúsculas/minúsculas no separan (La Porteña / LA PORTEÑO)  — LA CITY < La Porteña < LA PORTEÑO
✅ A0) R9 tiene turnos  — 11 turnos
✅ A) T1: pantalla en alfabético 'es' (9)  — ARMOÑOZO | CONESERA | DESERT OF DUBAI | DOCTORA APASIONADA | ETERNA DOCTORA | HERMANOSDEMIPATRIA | MOSQUITA GARDEN | QUE BELLA DOÑA | SI TIN
✅ A) T1: PDF == pantalla, id por id
✅ A) T1: todas las filas traen spcs.nombre por JOIN
✅ A) T2: pantalla en alfabético 'es' (8)  — ALHENA | ASTUTO NOTES | DEL CAMPEON | DOCTOR SKY | DOCTORA MIA | LOCA DUBAI | OLA DOCTOR | TOUCH OF BLUE
✅ A) T2: PDF == pantalla, id por id
✅ A) T2: todas las filas traen spcs.nombre por JOIN
✅ A) T3: pantalla en alfabético 'es' (7)  — BAHIA ROMANA | DAHUA | LOCA DUBAI | MARIA CATULENGA | OLA DOCTOR | TORO MAÑERO | VISION SECURITY
✅ A) T3: PDF == pantalla, id por id
✅ A) T3: todas las filas traen spcs.nombre por JOIN
✅ A) T4: pantalla en alfabético 'es' (13)  — BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NIÑO OCEANICO | NISTEL WIN | REY DE PILA | SOUTH GOTICO | TOY BOY
✅ A) T4: PDF == pantalla, id por id
✅ A) T4: todas las filas traen spcs.nombre por JOIN
✅ A) T5: pantalla en alfabético 'es' (4)  — AMIGUITO JESUS | KUCCINI | NELIDA RIM | NOCHE EN VELA
✅ A) T5: PDF == pantalla, id por id
✅ A) T5: todas las filas traen spcs.nombre por JOIN
✅ A) T6: pantalla en alfabético 'es' (6)  — EL MAS SABIO | FALAYS | FREE CRY | HALLOTOP | IDALIA MARO | REINA EDITION
✅ A) T6: PDF == pantalla, id por id
✅ A) T6: todas las filas traen spcs.nombre por JOIN
✅ A) T7: pantalla en alfabético 'es' (8)  — ATOMIZADOR | ECHO IN THE SKY | EL RISKO | LATIN PRESUMIDA | LE BATEAU | SEMBRADOR CHUCK | SEÑOR MONCHI | YOOKY
✅ A) T7: PDF == pantalla, id por id
✅ A) T7: todas las filas traen spcs.nombre por JOIN
✅ A) T8: pantalla en alfabético 'es' (3)  — IDALIA MARO | LATIN PRESUMIDA | YOOKY
✅ A) T8: PDF == pantalla, id por id
✅ A) T8: todas las filas traen spcs.nombre por JOIN
✅ A) T9: pantalla en alfabético 'es' (6)  — CHINITA SALTEÑA | ESPLENDID CRAF | LE BATEAU | QUERELLANTE | THE BEAST PARTY | WISLA KEN
✅ A) T9: PDF == pantalla, id por id
✅ A) T9: todas las filas traen spcs.nombre por JOIN
✅ A) T10: pantalla en alfabético 'es' (8)  — ABARAJALA | BABY PARADISE | GRILLADA RYE | INDIANA MARO | KRISTALINA | LATIN RAIN | LOGUACIOUS | QUINIELA TREND
✅ A) T10: PDF == pantalla, id por id
✅ A) T10: todas las filas traen spcs.nombre por JOIN
✅ A) T11: pantalla en alfabético 'es' (9)  — BABY PARADISE | BUEN MANUEL | DESTINADO JOHAN | EL GRAN HECTOR | ES SABALERO | GOIADORA | HEART OF GOLD | INDIO VALIDO | TERRIBLE KING
✅ A) T11: PDF == pantalla, id por id
✅ A) T11: todas las filas traen spcs.nombre por JOIN
✅ B1) T4 contiene NIÑO OCEANICO y NISTEL WIN  — 8/9
✅ B2) T4: NIÑO OCEANICO antes que NISTEL WIN  — BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NIÑO OCEANICO | NISTEL WIN | REY DE PILA | SOUTH GOTICO | TOY BOY
✅ B3) discriminante: por codepoint saldrían al revés (NISTEL < NIÑO)  — BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NISTEL WIN | NIÑO OCEANICO | REY DE PILA | SOUTH GOTICO | TOY BOY

45/52 asserts OK — 7 FALLARON
```

Con node en `en-US` (mismo caso que un Chrome en inglés) los casos de Ñ fallan; los de tilde y R9 pasan —
coincide con el relevamiento: hoy R9 no tiene ningún par Ñ/N+letra que separe `default` de `'es'`.

## Mutante 2 — `inscripciones.html` de `main` (versión anterior, `created_at`)

```bash
git show main:inscripciones.html > insc_main.html
INSC_HTML=insc_main.html node tests/probe_orden_inscriptos.mjs
```

```
❌ D1) pantalla: comparador con locale 'es'  — (sin comparador por nombre en loadInscripciones)
❌ D2) PDF: comparador con locale 'es'  — (a, b) => (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '')
❌ D3) pantalla ya no ordena por created_at
✅ D4) ratificacion.html: todos sus sorts por nombre llevan 'es'  — total: 3, sin 'es': 0
❌ D5) inscripciones.html: ningún localeCompare sin 'es'  — localeCompare(b.spcs?.nombre || '')
❌ C) pantalla: Ñ después de toda la N (ANZUELO < AÑO NUEVO)  — sin comparador
❌ C) PDF: Ñ después de toda la N (ANZUELO < AÑO NUEVO)  — ANA < AÑO NUEVO < ANZUELO < AOTO
❌ C) pantalla: Ñ entre N y O (NUBE < ÑANDU < OSO)  — sin comparador
❌ C) PDF: Ñ entre N y O (NUBE < ÑANDU < OSO)  — ÑANDU < NUBE < OSO
❌ C) pantalla: tilde no separa (MARIA ≈ MARÍA, antes que ...GB)  — sin comparador
✅ C) PDF: tilde no separa (MARIA ≈ MARÍA, antes que ...GB)  — MARIA CATULENGA < MARÍA CATULENGA < MARIA CATULENGB
❌ C) pantalla: caso real: CHINITA SALTEÑA entre SALTENA y SALTEO  — sin comparador
✅ C) PDF: caso real: CHINITA SALTEÑA entre SALTENA y SALTEO  — CHINITA SALTENA < CHINITA SALTEÑA < CHINITA SALTEO
❌ C) pantalla: mayúsculas/minúsculas no separan (La Porteña / LA PORTEÑO)  — sin comparador
✅ C) PDF: mayúsculas/minúsculas no separan (La Porteña / LA PORTEÑO)  — LA CITY < La Porteña < LA PORTEÑO
✅ A0) R9 tiene turnos  — 11 turnos
✅ A) T1: pantalla en alfabético 'es' (9)  —  |  |  |  |  |  |  |  | 
✅ A) T1: PDF == pantalla, id por id
❌ A) T1: todas las filas traen spcs.nombre por JOIN
✅ A) T2: pantalla en alfabético 'es' (8)  —  |  |  |  |  |  |  | 
✅ A) T2: PDF == pantalla, id por id
❌ A) T2: todas las filas traen spcs.nombre por JOIN
✅ A) T3: pantalla en alfabético 'es' (7)  —  |  |  |  |  |  | 
✅ A) T3: PDF == pantalla, id por id
❌ A) T3: todas las filas traen spcs.nombre por JOIN
✅ A) T4: pantalla en alfabético 'es' (13)  —  |  |  |  |  |  |  |  |  |  |  |  | 
✅ A) T4: PDF == pantalla, id por id
❌ A) T4: todas las filas traen spcs.nombre por JOIN
✅ A) T5: pantalla en alfabético 'es' (4)  —  |  |  | 
✅ A) T5: PDF == pantalla, id por id
❌ A) T5: todas las filas traen spcs.nombre por JOIN
✅ A) T6: pantalla en alfabético 'es' (6)  —  |  |  |  |  | 
✅ A) T6: PDF == pantalla, id por id
❌ A) T6: todas las filas traen spcs.nombre por JOIN
✅ A) T7: pantalla en alfabético 'es' (8)  —  |  |  |  |  |  |  | 
✅ A) T7: PDF == pantalla, id por id
❌ A) T7: todas las filas traen spcs.nombre por JOIN
✅ A) T8: pantalla en alfabético 'es' (3)  —  |  | 
✅ A) T8: PDF == pantalla, id por id
❌ A) T8: todas las filas traen spcs.nombre por JOIN
✅ A) T9: pantalla en alfabético 'es' (6)  —  |  |  |  |  | 
✅ A) T9: PDF == pantalla, id por id
❌ A) T9: todas las filas traen spcs.nombre por JOIN
✅ A) T10: pantalla en alfabético 'es' (8)  —  |  |  |  |  |  |  | 
✅ A) T10: PDF == pantalla, id por id
❌ A) T10: todas las filas traen spcs.nombre por JOIN
✅ A) T11: pantalla en alfabético 'es' (9)  —  |  |  |  |  |  |  |  | 
✅ A) T11: PDF == pantalla, id por id
❌ A) T11: todas las filas traen spcs.nombre por JOIN
❌ B1) T4 contiene NIÑO OCEANICO y NISTEL WIN  — -1/-1
❌ B2) T4: NIÑO OCEANICO antes que NISTEL WIN  —  |  |  |  |  |  |  |  |  |  |  |  | 
❌ B3) discriminante: por codepoint saldrían al revés (NISTEL < NIÑO)  —  |  |  |  |  |  |  |  |  |  |  |  | 

27/52 asserts OK — 25 FALLARON
```

## Probes afectados por el baseline

```bash
node tests/probe_spcs_r9_tanda_1.mjs        # sólo lectura
```

```
✅ A count(spcs) = 205  → real 205
✅ B 18 filas por studbook_id  → real 18
✅ B ETERNA DOCTORA sb=442125 una sola fila  → hay 1
✅ C ETERNA DOCTORA datos = evidencia  → ETERNA DOCTORA|2023-07-29|hembra|Zaino Doradillo|Doctor Embrujo|Eterna Diablita
✅ D ETERNA DOCTORA registro NULL, FKs NULL, activo
✅ E ETERNA DOCTORA notas con SB + url  → SB 442125 · https://www.studbook.org.ar/ejemplares/perfil/442125/eterna-doctora · alta R9 tanda 1 11/09/2026
✅ B DESERT OF DUBAI sb=446340 una sola fila  → hay 1
✅ C DESERT OF DUBAI datos = evidencia  → DESERT OF DUBAI|2023-10-09|macho|Zaino|Dubai Thunder (GB)|Grela (USA)
✅ D DESERT OF DUBAI registro NULL, FKs NULL, activo
✅ E DESERT OF DUBAI notas con SB + url  → SB 446340 · https://www.studbook.org.ar/ejemplares/perfil/446340/desert-of-dubai · alta R9 tanda 1 11/09/2026
✅ B HERMANOSDEMIPATRIA sb=443096 una sola fila  → hay 1
✅ C HERMANOSDEMIPATRIA datos = evidencia  → HERMANOSDEMIPATRIA|2023-09-07|macho|Zaino|Grand Reward (USA)|Cat The Gold
✅ D HERMANOSDEMIPATRIA registro NULL, FKs NULL, activo
✅ E HERMANOSDEMIPATRIA notas con SB + url  → SB 443096 · https://www.studbook.org.ar/ejemplares/perfil/443096/hermanosdemipatria · alta R9 tanda 1 11/09/2026
✅ B ALHENA sb=434871 una sola fila  → hay 1
✅ C ALHENA datos = evidencia  → ALHENA|2022-07-16|hembra|Zaino|Puerto Escondido|Almedha
✅ D ALHENA registro NULL, FKs NULL, activo
✅ E ALHENA notas con SB + url  → SB 434871 · https://www.studbook.org.ar/ejemplares/perfil/434871/alhena · alta R9 tanda 1 11/09/2026
✅ B OLA DOCTOR sb=438421 una sola fila  → hay 1
✅ C OLA DOCTOR datos = evidencia  → OLA DOCTOR|2022-10-24|macho|Zaino|Lead To Win|Sweet Johar (USA)
✅ D OLA DOCTOR registro NULL, FKs NULL, activo
✅ E OLA DOCTOR notas con SB + url  → SB 438421 · https://www.studbook.org.ar/ejemplares/perfil/438421/ola-doctor · alta R9 tanda 1 11/09/2026
✅ B DEL CAMPEON sb=438805 una sola fila  → hay 1
✅ C DEL CAMPEON datos = evidencia  → DEL CAMPEON|2022-10-17|macho|Zaino|Golden Cigars|Sixties Spirit
✅ D DEL CAMPEON registro NULL, FKs NULL, activo
✅ E DEL CAMPEON notas con SB + url  → SB 438805 · https://www.studbook.org.ar/ejemplares/perfil/438805/del-campeon · alta R9 tanda 1 11/09/2026
✅ B TORO MAÑERO sb=440758 una sola fila  → hay 1
✅ C TORO MAÑERO datos = evidencia  → TORO MAÑERO|2022-10-21|macho|Zaino|Hit It A Bomb (USA)|Sarawak Top
✅ D TORO MAÑERO registro NULL, FKs NULL, activo
✅ E TORO MAÑERO notas con SB + url  → SB 440758 · https://www.studbook.org.ar/ejemplares/perfil/440758/toro-manero · alta R9 tanda 1 11/09/2026
✅ B BACON sb=428803 una sola fila  → hay 1
✅ C BACON datos = evidencia  → BACON|2021-07-17|macho|Zaino|Winning Prize|Biosfera
✅ D BACON registro NULL, FKs NULL, activo
✅ E BACON notas con SB + url  → SB 428803 · https://www.studbook.org.ar/ejemplares/perfil/428803/bacon · alta R9 tanda 1 11/09/2026
✅ B NISTEL WIN sb=430420 una sola fila  → hay 1
✅ C NISTEL WIN datos = evidencia  → NISTEL WIN|2021-10-08|macho|Zaino Colorado|Lead To Win|Barbie Nistel
✅ D NISTEL WIN registro NULL, FKs NULL, activo
✅ E NISTEL WIN notas con SB + url  → SB 430420 · https://www.studbook.org.ar/ejemplares/perfil/430420/nistel-win · alta R9 tanda 1 11/09/2026
✅ B HALLOTOP sb=441122 una sola fila  → hay 1
✅ C HALLOTOP datos = evidencia  → HALLOTOP|2021-10-08|macho|Zaino|Maipo Top|Halloweeninseattle
✅ D HALLOTOP registro NULL, FKs NULL, activo
✅ E HALLOTOP notas con SB + url  → SB 441122 · https://www.studbook.org.ar/ejemplares/perfil/441122/hallotop · alta R9 tanda 1 11/09/2026
✅ B EL RISKO sb=421108 una sola fila  → hay 1
✅ C EL RISKO datos = evidencia  → EL RISKO|2020-09-10|macho|Zaino|Security Risk (USA)|Spanakopitas
✅ D EL RISKO registro NULL, FKs NULL, activo
✅ E EL RISKO notas con SB + url  → SB 421108 · https://www.studbook.org.ar/ejemplares/perfil/421108/el-risko · alta R9 tanda 1 11/09/2026
✅ B ATOMIZADOR sb=422969 una sola fila  → hay 1
✅ C ATOMIZADOR datos = evidencia  → ATOMIZADOR|2020-10-26|macho|Zaino Doradillo|Daniel Boone (BRZ)|Atomic Star
✅ D ATOMIZADOR registro NULL, FKs NULL, activo
✅ E ATOMIZADOR notas con SB + url  → SB 422969 · https://www.studbook.org.ar/ejemplares/perfil/422969/atomizador · alta R9 tanda 1 11/09/2026
✅ B THE BEAST PARTY sb=438032 una sola fila  → hay 1
✅ C THE BEAST PARTY datos = evidencia  → THE BEAST PARTY|2022-07-30|macho|Alazan|In The Dark|Rimout Party
✅ D THE BEAST PARTY registro NULL, FKs NULL, activo
✅ E THE BEAST PARTY notas con SB + url  → SB 438032 · https://www.studbook.org.ar/ejemplares/perfil/438032/the-beast-party · alta R9 tanda 1 11/09/2026
✅ B ABARAJALA sb=433798 una sola fila  → hay 1
✅ C ABARAJALA datos = evidencia  → ABARAJALA|2020-10-25|hembra|Zaino|Storm Question|Redondiya
✅ D ABARAJALA registro NULL, FKs NULL, activo
✅ E ABARAJALA notas con SB + url  → SB 433798 · https://www.studbook.org.ar/ejemplares/perfil/433798/abarajala · alta R9 tanda 1 11/09/2026
✅ B GOIADORA sb=428590 una sola fila  → hay 1
✅ C GOIADORA datos = evidencia  → GOIADORA|2021-09-23|hembra|Zaino|Goias Key|Degolladora
✅ D GOIADORA registro NULL, FKs NULL, activo
✅ E GOIADORA notas con SB + url  → SB 428590 · https://www.studbook.org.ar/ejemplares/perfil/428590/goiadora · alta R9 tanda 1 11/09/2026
✅ B QUERELLANTE sb=416936 una sola fila  → hay 1
✅ C QUERELLANTE datos = evidencia  → QUERELLANTE|2019-10-11|macho|Zaino|Daniel Boone (BRZ)|Que Felicidad
✅ D QUERELLANTE registro NULL, FKs NULL, activo
✅ E QUERELLANTE notas con SB + url  → SB 416936 · https://www.studbook.org.ar/ejemplares/perfil/416936/querellante · alta R9 tanda 1 11/09/2026 · Homónimo en el Stud Book (sb 49722, 1947) descartado por edad.
✅ B MARIA CATULENGA sb=440678 una sola fila  → hay 1
✅ C MARIA CATULENGA datos = evidencia  → MARIA CATULENGA|2022-10-15|hembra|Zaino|Fiskardo|Ever Propulsora
✅ D MARIA CATULENGA registro NULL, FKs NULL, activo
✅ E MARIA CATULENGA notas con SB + url + variante  → SB 440678 · https://www.studbook.org.ar/ejemplares/perfil/440678/maria-catulenga · alta R9 tanda 1 11/09/2026 · Planilla R9: MARIA CATULANGA.
✅ B NIÑO OCEANICO sb=428019 una sola fila  → hay 1
✅ C NIÑO OCEANICO datos = evidencia  → NIÑO OCEANICO|2021-09-01|macho|Zaino|Seahenge (USA)|Niña Divina
✅ D NIÑO OCEANICO registro NULL, FKs NULL, activo
✅ E NIÑO OCEANICO notas con SB + url + variante  → SB 428019 · https://www.studbook.org.ar/ejemplares/perfil/428019/nino-oceanico · alta R9 tanda 1 11/09/2026 · Planilla R9: NIÑO OSEANICO.
✅ F ABARAJALA hembra
✅ G 0 studbook_id repetidos en spcs  → []
✅ H CONESERA corregida (hembra, sb 444373)  → {"nombre":"CONESERA","sexo":"hembra","studbook_id":"444373"}
✅ I QUE BELLA DOÑA existe, hembra, datos = SB, nota con variante  → SB 446458 · https://www.studbook.org.ar/ejemplares/perfil/446458/que-bella-dona · alta R9 tanda 2 11/09/2026 · Planilla R9: BELLA DOÑA.
✅ I INDIANA MARO existe, hembra, datos = SB, nota con variante  → SB 432433 · https://www.studbook.org.ar/ejemplares/perfil/432433/indiana-maro · alta R9 tanda 2 11/09/2026 · Planilla R9: INDIA MARO.
✅ J BIEN COQUETA existe, datos = SB, registro NULL, nota con SB  → SB 429819 · https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta · alta R9 tanda 3 11/09/2026 · Homónima sb 216248 (1998) descartada por edad. Planilla R9 la tenía en T2; Yesi la pasó a T11.
✅ J EL MAS SABIO existe, datos = SB, registro NULL, nota con SB  → SB 431662 · https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio · alta R9 tanda 3 11/09/2026 · Planilla R9 lo tenía en T5; Yesi lo pasó a T6.

81/81 asserts OK
```

`tests/probe_spcs_studbook_alta.mjs` **no se corrió**: escribe 1 spc + 1 usuario en prod y Yesi está cargando
inscriptos en este momento — el assert `count === 205` podría flapear si da de alta un SPC durante la corrida.
Cambio verificado con `node --check` (sintaxis) y por lectura del diff (una línea, `203` → `205`).

## Verificación de push de la rama

```bash
git push -u origin fix/orden-inscriptos-es
git ls-remote origin fix/orden-inscriptos-es
git rev-parse HEAD
```

```
d49dd47cda8e875ed522b4b29bc55193357dd86f	refs/heads/fix/orden-inscriptos-es
d49dd47cda8e875ed522b4b29bc55193357dd86f
```

## Pendiente (tuyo)

- OK para mergear `fix/orden-inscriptos-es` → `main` (deploy automático a `sigh.com.ar/inscripciones.html`).
- Después del merge: correr `probe_spcs_studbook_alta.mjs` en un momento en que Yesi no esté cargando.
- Preguntas abiertas del relevamiento (§8): forfaits en pantalla vs no en el PDF; cuál de los dos PDFs lee Yesi.

## Verificación de publicación de este informe

(se completa en el commit siguiente)
