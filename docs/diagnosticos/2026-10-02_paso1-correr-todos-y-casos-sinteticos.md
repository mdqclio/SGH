# Paso 1 — casos sintéticos para los dos asserts de `<J07>` + `correr_todos.sh` sobre `main` y cada rama

- **Fecha**: 2026-10-02 (17:05–17:28 UTC)
- **`main`** al empezar: `ade78361a16146cb73262d4bc33b95962f28b158`
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` (MCP `get_project_url`) ✅ · clubs Dolores por uuid → `Hipódromo de Dolores` ✅
- **Anonimizado**: el jockey real del caso va como `<J07>` (y `<J09>` el otro que usaba el probe); sin nombres de personas.

## Qué se cambió (commit `63e7d0b18ffe36b8edba5e7280d492a73c8b02ee` en la rama del #42)

Los dos asserts seguían a un jockey real de R9 cuyo incentivo estaba impago; hoy a las 13:07 ART se cobró por transferencia y el caso dejó
de existir (informe `2026-10-02_correr-todos-pre-merge-37-38-42.md`). Pasaron a **sintéticos**, como P2/P5 de `probe_reparto_100`, por las
funciones reales de la vista (`cobDuenosIncentivo` → `cobArmarVistaCarrera` → `cobHtmlVistaCarrera` → parser):

| Probe | Assert | Ahora |
|---|---|---|
| `probe_pagos_vista_carrera` | 3e | jockey sintético que largó en las carreras 1 y 5: la nota de la 5 dice "figura en la carrera 1", y en la 1 el incentivo está con importe y "se paga una sola vez" |
| `probe_pagos_vista_incentivo_pagados` | 2, 2b | el mismo jockey sintético, incentivo impago: importe **sólo** en la 1; nota en la 5; sin nota en la 1 |
| `probe_pagos_vista_incentivo_pagados` | **2p (nuevo)** | el mismo incentivo **pagado por transferencia**: importe en ninguna, chip "✓ Transferido · Rec. #974" en la 1 sin botón, la nota sigue en la 5 (justo el caso de hoy) |

Las reglas generales contra R9 real (2c, 2d, 3b, 3c, 4) se quedan. **Ojo**: el assert 3 del segundo probe usa otro jockey real con una sola
monta e incentivo impago — tiene el mismo riesgo (se cae el día que cobre). No lo toqué (no estaba pedido); queda anotado.

Resultados: **25/25 · 7/7 mutantes** y **26/26 · 17/17 mutantes**, todos muertos por asserts.

## Corridas de `correr_todos.sh` (checkout principal)

| Rama | SHA | Resultado |
|---|---|---|
| `main` (base) | `ade78361a16146cb73262d4bc33b95962f28b158` | 25 verdes · 12 conocidos · **2 nuevos** (los dos de `<J07>`: esperado, el arreglo está en #42) |
| #42 `fix/probes-fixtures-al-sandbox` | `63e7d0b18ffe36b8edba5e7280d492a73c8b02ee` | 28 verdes · 12 conocidos · **0 nuevos** → merge |
| #37 actualizado con `main` (ya con #42) | `11147d62b616e06192d14bb4e493e24d989138b2` | 28 verdes · 12 conocidos · **0 nuevos** → merge |
| #38 actualizado con `main` (ya con #42) | `39bd8149b58323cad099f4fb0b764b4343834cce` | 29 verdes · 12 conocidos · **0 nuevos** · 0 ausentes (`probe_motor_chequeo_errores` verde) → merge |

Orden: primero #42 (trae el arreglo), después #37 y #38 actualizados con `main`. Los merges están en `2026-10-02_paso2-merge-37-38-42.md`.

## Salida cruda

### Diff de los dos probes (commit `63e7d0b…`)

(Encabezados de hunk como `[hunk …]`; los nombres de los dos jockeys reales de las líneas borradas, reemplazados por tokens.)

```diff
diff --git a/tests/probe_pagos_vista_carrera.mjs b/tests/probe_pagos_vista_carrera.mjs
index bd52aad..950eaff 100644
--- a/tests/probe_pagos_vista_carrera.mjs
+++ b/tests/probe_pagos_vista_carrera.mjs
[hunk -230,13 +230,29] ok('3b) C5: cada incentivo está bajo el rol Jockey del caballo que ese jockey m
 ok('3c) C5: ningún incentivo bajo un jockey que no largó acá', incLineas.every(x => e5.J.has(x.benefId)));
 ok('3d) C5: el incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"; la nota, "figura en la carrera N" (N = dueña)', incLineas.length > 0 && incLineas.every(x => x.nota ? x.texto === `Incentivo por reunión: figura en la carrera ${duenoNro[x.benefId]}` : /Incentivo por reunión — se paga una sola vez/.test(x.texto)), incLineas.map(x => x.texto).join(' | '));
 
-// 3e) la nota de C5 apunta a una carrera donde el incentivo SÍ está, con importe y rótulo
-const conNota = incLineas.find(x => x.nota);
-if (conNota) {
-  const cd = carrera(duenoNro[conNota.benefId]);
-  const bd = parsear(await buscar('', cd.id));
-  const alla = bd.flatMap(b => b.roles.flatMap(r => r.benefs.filter(be => be.nombre === conNota.benef).flatMap(be => be.lineas.filter(l => /incentivo jockey/i.test(l.texto)))));
-  ok(`3e) ${conNota.benef}: en la carrera ${duenoNro[conNota.benefId]} (dueña) el incentivo está con importe y "se paga una sola vez"`, alla.length === 1 && /Incentivo por reunión — se paga una sola vez/.test(alla[0].texto), alla.map(l => l.texto + ' ' + l.monto).join(' | '));
+// 3e) "la nota de C5 apunta a una carrera donde el incentivo SÍ está, con importe y rótulo": SINTÉTICO. Antes seguía la nota de
+// un jockey real de C5 hasta su carrera dueña; el 02/10 ese incentivo se cobró y la dueña ya no lo muestra con importe (está
+// pagado: es lo correcto). Ahora: un jockey sintético que largó en 1 y 5, con las funciones reales de la vista.
+{
+  const v = await new AsyncFunction('sb', 'CLUB_ID', 'document', 'toast', 'fmt', 'escapeHtml', 'propietariosMap', 'profesionales',
+    `let cobCaballerizas = [], cobInscCarrera = {}, cobNroCarrera = {}, cobMapsScope = null, cobReunPrueba = null;
+     ${src}
+     return { cobArmarVistaCarrera, cobHtmlVistaCarrera, cobDuenosIncentivo };`)(sb, CLUB_ID, mkDocument({}), () => {}, n => '$' + Number(n).toFixed(2), escapeHtml, propietariosMap, profesionales);
+  profesionales.jsint = { id: 'jsint', apellido: 'SINT', nombre: 'JOCKEY' };
+  const dS = v.cobDuenosIncentivo([{ id: 's1', numero_carrera_programa: 1, numero_turno: 1 }, { id: 's5', numero_carrera_programa: 5, numero_turno: 7 }],
+    [{ carrera_id: 's1', jockey_titular_id: 'jsint', largo: true }, { carrera_id: 's5', jockey_titular_id: 'jsint', largo: true }]);
+  const incS = { id: 'isint', beneficiario_tipo: 'profesional', beneficiario_id: 'jsint', concepto_tipo: 'incentivo_jockey', concepto: 'Incentivo jockey',
+    monto_neto: '60000', reunion_id: 'RX', inscripcion_id: null, carrera_id: null, liquidaciones: { club_id: CLUB_ID } };
+  const ins = cid => [{ id: `I${cid}`, numero_partidor: 1, posicion: 1, no_largo: false, largo: true, caballo: `CAB ${cid}`, propietario_id: null, entrenador_id: null, jockey_titular_id: 'jsint' }];
+  const de = cid => parsear(v.cobHtmlVistaCarrera(v.cobArmarVistaCarrera([incS], ins(cid), cid, dS), {}))
+    .flatMap(b => b.roles.flatMap(r => r.benefs.filter(be => be.nombre === 'SINT, JOCKEY')));
+  const en5 = de('s5'), en1 = de('s1');
+  const nota = en5.flatMap(be => be.notas)[0] || '';
+  const nroNota = parseInt((/figura en la carrera (\d+)/.exec(nota) || [])[1], 10);
+  const alla = (nroNota === 1 ? en1 : []).flatMap(be => be.lineas.filter(l => /incentivo jockey/i.test(l.texto)));
+  ok('3e) sintético: la nota de la carrera 5 ("figura en la carrera 1") apunta a una carrera donde el incentivo SÍ está, con importe y "se paga una sola vez"',
+     nroNota === 1 && alla.length === 1 && /Incentivo por reunión — se paga una sola vez/.test(alla[0].texto) && alla[0].monto.includes('60000'),
+     JSON.stringify({ nota, en1 }));
 }
 
 // 4) misma persona en dos roles → dos sub-bloques, dos Pagar distintos (propietario / profesional)
diff --git a/tests/probe_pagos_vista_incentivo_pagados.mjs b/tests/probe_pagos_vista_incentivo_pagados.mjs
index 29bfa4b..d950b08 100644
--- a/tests/probe_pagos_vista_incentivo_pagados.mjs
+++ b/tests/probe_pagos_vista_incentivo_pagados.mjs
[hunk -210,7 +210,9] const idsPendientes = delClub.filter(l => l.estado_linea === 'impago' && !l.reci
 const nLineasVista = vistas.reduce((s, v) => s + v.b.reduce((t, b) => t + b.benefs.reduce((u, be) => u + be.lineas.length, 0), 0), 0);
 ok('1c) R9: cantidad de líneas pagables mostradas = líneas impagas de la base (ninguna dos veces, ninguna afuera)', nLineasVista === idsPendientes.length, `${nLineasVista} vs ${idsPendientes.length}`);
 
-// 2) <J07> y <J09>: incentivo en una sola carrera (la de número más bajo), nota en la otra
+// 2/2b/2p) caso de un jockey que largó en dos carreras: pasaron a SINTÉTICOS (§ 7, al final). Antes usaban un jockey real de
+// R9 cuyo incentivo estaba impago; el 02/10 se cobró por transferencia y el caso dejó de existir (mismo motivo que P2/P5 de
+// probe_reparto_100). Las reglas generales sobre R9 real (2c, 3b, 3c, 4) siguen acá abajo.
 function apariciones(jid) {
   const lin = [], notas = [];
   for (const v of vistas) for (const b of v.b) for (const be of b.benefs) {
[hunk -221,18 +223,6] function apariciones(jid) {
   }
   return { lin, notas };
 }
-for (const [ap, nom] of [['<J07 apellido>', '<J07 nombre>'], ['<J09 apellido>', '<J09 nombre>']]) {
-  const jid = jockeyPorNombre(ap, nom);
-  const inc = delClub.find(l => l.concepto_tipo === 'incentivo_jockey' && l.beneficiario_id === jid);
-  const corrio = [...(largoEn[jid] || [])].sort((a, b) => a - b);
-  const a = apariciones(jid);
-  const pendiente = inc && inc.estado_linea === 'impago' && !inc.recibo_id;
-  ok(`2) ${ap} ${nom}: corrió en ${corrio.join(' y ')}; incentivo ${pendiente ? 'pagable' : 'YA NO pagable (' + inc?.estado_linea + ')'} en UNA sola carrera, la ${corrio[0]}`,
-     pendiente && a.lin.length === 1 && a.lin[0] === corrio[0], `con importe en: ${a.lin.join(',') || '—'}`);
-  const esperadas = corrio.slice(1).map(n => ({ nro: n, n: `Incentivo por reunión: figura en la carrera ${corrio[0]}` }));
-  ok(`2b) ${ap} ${nom}: nota "figura en la carrera ${corrio[0]}" en ${corrio.slice(1).join(',')} y en ninguna otra`,
-     corrio.length > 1 && JSON.stringify(a.notas) === JSON.stringify(esperadas), JSON.stringify(a.notas));
-}
 // 2c) regla general: todo incentivo pagable aparece con importe exactamente una vez, en min(carreras donde largó)
 const incPend = delClub.filter(l => l.concepto_tipo === 'incentivo_jockey' && l.estado_linea === 'impago' && !l.recibo_id);
 const malUbicados = incPend.filter(l => { const a = apariciones(l.beneficiario_id); return !(a.lin.length === 1 && a.lin[0] === minNro(l.beneficiario_id)); });
[hunk -335,6 +325,31] const b3 = en('k3'), b2 = en('k2');
 ok('6b) en la dueña: importe; en la otra: nota sin importe y sin botón', b2[0].total === 60000 && b3[0].total === 0 && b3[0].roles[0].beneficiarios[0].notas[0] === 'Incentivo por reunión: figura en la carrera 2' && !b3[0].roles[0].beneficiarios[0].lineas.length,
    JSON.stringify(b3[0].roles));
 
+// ═════════ 7) jockey que largó en dos carreras, SINTÉTICO, por la vista entera (armar + HTML + parser) ═════════
+// Carreras 1 y 5; el incentivo es UNO por reunión. Impago: importe sólo en la 1 (la dueña), nota en la 5. Pagado: en ninguna
+// con importe, chip del recibo en la 1 y la nota sigue en la 5 (decisión del 24/09: la nota sigue la regla esté pagado o no).
+profesionales.jq = { id: 'jq', apellido: 'SINT', nombre: 'JQ' };
+const NQ = 'SINT, JQ';
+const carQ = [{ id: 'q5', numero_carrera_programa: 5, numero_turno: 7 }, { id: 'q1', numero_carrera_programa: 1, numero_turno: 1 }];
+const dQ = api.cobDuenosIncentivo(carQ, [{ carrera_id: 'q1', jockey_titular_id: 'jq', largo: true }, { carrera_id: 'q5', jockey_titular_id: 'jq', largo: true }]);
+const incQ = { id: 'iq', beneficiario_tipo: 'profesional', beneficiario_id: 'jq', concepto_tipo: 'incentivo_jockey', concepto: 'Incentivo jockey',
+  monto_neto: '60000', reunion_id: 'RX', inscripcion_id: null, carrera_id: null, estado_linea: 'impago', recibo_id: null, liquidaciones: { club_id: CLUB_ID } };
+const vistaQ = (cid, lineas) => parsear(api.cobHtmlVistaCarrera(api.cobArmarVistaCarrera(lineas, [insc(`Q${cid}`, { jockey_titular_id: 'jq' })], cid, dQ), {}));
+const delJQ = v => v.flatMap(b => b.benefs.filter(x => x.nombre === NQ));
+const imp1 = delJQ(vistaQ('q1', [incQ])), imp5 = delJQ(vistaQ('q5', [incQ]));
+ok('2) sintético: jockey que largó en las carreras 1 y 5, incentivo impago → con importe ("se paga una sola vez") SÓLO en la 1',
+   imp1.flatMap(x => x.lineas).filter(esIncentivo).length === 1 && imp5.flatMap(x => x.lineas).filter(esIncentivo).length === 0 && imp1[0]?.pagar?.[1] === 'jq',
+   JSON.stringify({ c1: imp1, c5: imp5 }));
+ok('2b) sintético: en la 5, nota "figura en la carrera 1" sin importe ni botón; en la 1, sin nota',
+   JSON.stringify(imp5.flatMap(x => x.notas)) === JSON.stringify(['Incentivo por reunión: figura en la carrera 1']) && !imp5.some(x => x.pagar)
+   && imp1.flatMap(x => x.notas).length === 0, JSON.stringify(imp5));
+const pagQ = api.cobMarcarPagadas([{ ...incQ, id: 'iq2', estado_linea: 'pagado', recibo_id: 'r974', recibos: REC(974, 'transferencia') }]);
+const pag1 = delJQ(vistaQ('q1', pagQ)), pag5 = delJQ(vistaQ('q5', pagQ));
+ok('2p) sintético: el mismo incentivo PAGADO por transferencia → con importe en ninguna; chip "✓ Transferido · Rec. #974" en la 1, sin botón; la nota sigue en la 5',
+   pag1.concat(pag5).flatMap(x => x.lineas).filter(esIncentivo).length === 0 && JSON.stringify(pag1.flatMap(x => x.chips)) === '["✓ Transferido · Rec. #974"]'
+   && !pag1.some(x => x.pagar) && JSON.stringify(pag5.flatMap(x => x.notas)) === JSON.stringify(['Incentivo por reunión: figura en la carrera 1']),
+   JSON.stringify({ c1: pag1, c5: pag5 }));
+
 for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
 const fail = results.filter(r => r.s === '❌').length;
 console.log(`\n${results.length - fail}/${results.length} checks OK${mutArg ? ` (mutante ${mutArg})` : ''}`);
```

### `correr_todos.sh` — main

```
rama=main sha=ade78361a16146cb73262d4bc33b95962f28b158
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      0s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      2s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      37s
probe_fmtinput_onblur                      🟢 verde                                                      1s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      3s
probe_motor_chequeo_errores                — no está en esta rama
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       5s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                     25s
probe_pagos_vista_carrera                  🔴 ROJO NUEVO (rc=1)                                         14s
probe_pagos_vista_incentivo_pagados        🔴 ROJO NUEVO (rc=1)                                         16s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      2s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      0s
probe_recibo_una_hoja                      🟢 verde                                                     64s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_reparto_100                          🟢 verde                                                     38s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      10s
probe_studbook_v2                          🟢 verde                                                      1s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       1s

Resumen: 25 verdes · 12 rojos conocidos · 2 rojos NUEVOS · 1 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
ROJOS NUEVOS (bloquean el merge):
  - probe_pagos_vista_carrera
  - probe_pagos_vista_incentivo_pagados
Salida completa de cada probe: <scratchpad>/pre2/out_main/<probe>.txt
exit=1
```

### `correr_todos.sh` — 42

```
rama=fix/probes-fixtures-al-sandbox sha=63e7d0b18ffe36b8edba5e7280d492a73c8b02ee
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       2s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      1s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      0s
probe_chapa_4medio                         🟢 verde                                                      1s
probe_cobros_caballeriza                   🟢 verde                                                      1s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      12s
probe_fmtinput_onblur                      🟢 verde                                                      1s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      3s
probe_motor_chequeo_errores                — no está en esta rama
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       5s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                     26s
probe_pagos_vista_carrera                  🟢 verde                                                     12s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     14s
probe_portal_alta_spc_ui                   🟢 verde                                                      1s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      1s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     61s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_reparto_100                          🟢 verde                                                     40s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      10s
probe_studbook_v2                          🟢 verde                                                      1s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s

Resumen: 28 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 1 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
Salida completa de cada probe: <scratchpad>/pre2/out_42/<probe>.txt
exit=0
```

### `correr_todos.sh` — 37

```
rama=chore/issue-104-motor-liquidacion-duplicados sha=11147d62b616e06192d14bb4e493e24d989138b2
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      0s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      0s
probe_chapa_4medio                         🟢 verde                                                      1s
probe_cobros_caballeriza                   🟢 verde                                                      1s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      12s
probe_fmtinput_onblur                      🟢 verde                                                      1s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      3s
probe_motor_chequeo_errores                — no está en esta rama
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       6s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                     25s
probe_pagos_vista_carrera                  🟢 verde                                                     12s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     13s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      1s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     61s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_reparto_100                          🟢 verde                                                     39s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      11s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       3s

Resumen: 28 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 1 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
Salida completa de cada probe: <scratchpad>/pre2/out_37/<probe>.txt
exit=0
```

### `correr_todos.sh` — 38

```
rama=fix/motor-liquidacion-chequeo-errores sha=39bd8149b58323cad099f4fb0b764b4343834cce
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      3s
probe_badge_overlap                        🟢 verde                                                      0s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      0s
probe_chapa_4medio                         🟢 verde                                                      1s
probe_cobros_caballeriza                   🟢 verde                                                      1s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      12s
probe_fmtinput_onblur                      🟢 verde                                                      1s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      3s
probe_motor_chequeo_errores                🟢 verde                                                      0s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       5s
probe_orden_inscriptos                     🟢 verde                                                      4s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                     26s
probe_pagos_vista_carrera                  🟢 verde                                                     13s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     13s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      1s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     61s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_reparto_100                          🟢 verde                                                     39s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      11s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s

Resumen: 29 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 0 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
Salida completa de cada probe: <scratchpad>/pre2/out_38/<probe>.txt
exit=0
```
