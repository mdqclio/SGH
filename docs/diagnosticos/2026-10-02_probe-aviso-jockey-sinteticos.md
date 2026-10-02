# probe_aviso_jockey_repetido — R9/A/B a casos sintéticos (opción c) + merge del PR #31

- **Fecha:** 2026-10-02
- **Guards:** pwd=/home/clio/dev/SGH · ref=unlhcuanfrtpatoipwve · el probe es SOLO LECTURA contra prod.

## SHA de cada paso

| Paso | Qué | Referencia |
|---|---|---|
| 1 | merge del PR #31 (tramo D) | **`16136744f31a267e4be5615af0b2b7edcf69a95d`** (sólo `tests/probe_aviso_jockey_repetido.mjs`, ningún archivo servido por Pages) |
| 3 | R9 T3/T5/T11, sólo lectura | informe `docs/diagnosticos/2026-10-02_r9-jockey-dos-caballos-t3-t5-t11.md` (reports `e7d0d9b`) |
| 2 | asserts R9/A/B a sintéticos | rama `fix/probe-aviso-jockey-sinteticos` commit **`796eea8`** — PR **#32** (https://github.com/mdqclio/SGH/pull/32), **sin mergear** |

## Qué cambió (PR #32)

- **R9 → S**: turnos sintéticos con jockeys `sj-…` (`SINT-GONZALEZ`, `SINT-CANTO`, …) agregados a `profsMap`. Mismos escenarios que
  tenía R9 al 12/09: ×3 (S1), ×2 (S2), forfait + ratificado (S3), mal_inscrito + ratificado (S4), turno limpio (S5).
- **A** (`renderInscripciones` real) y **B** (`avisoJockeyRepetidoPortal` real) corren sobre esos turnos. A5, que antes usaba R8 T2,
  ahora es el sintético forfait + ratificado.
- **R8** (los 8 casos históricos) y **D** (R8 T5, `saveMontas`) siguen sobre datos reales: no se pidió tocarlos y pasan.
- **Mutantes**: el runner pasa a ser genérico (`SRC_<ARCHIVO>`). M1 era el que ya había; se suman M2, M3 y M4.
- `CLAUDE.md`: la línea del probe (decía "R9 4 turnos avisan").
- Se sacó `R9_ID` (sin uso).

## Corrida completa: `node tests/probe_aviso_jockey_repetido.mjs --mutantes`

```
✅ H1) forfait + ratificado, mismo jockey → NO repetido
✅ H2) mal_inscrito + ratificado, mismo jockey → NO repetido
✅ H3) inscripto + inscripto, mismo jockey → repetido
✅ H4) ratificado + ratificado, mismo jockey → repetido
✅ H5) inscripto + ratificado, mismo jockey → repetido
✅ H6) dos jockeys distintos → nada
✅ H7) sin jockey no cuenta
✅ H8) conteo ×3
✅ H9) badge lleva ⚠ dup. y la cantidad
✅ S1) ×3 inscriptos con el mismo jockey → avisa ese jockey (y no el del caballo único)  — SINT-GONZALEZ, LUCAS
✅ S1) conteo ×3
✅ S2) ×2 ratificados → avisa  — SINT-CANTO, TOBIAS
✅ S3) forfait + ratificado, mismo jockey → no avisa
✅ S4) mal_inscrito + ratificado, mismo jockey → no avisa
✅ S5) turno limpio (jockeys distintos, uno sin jockey) → no avisa
✅ R8) R6 T9 PRESA, DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T2 LOPEZ, ALEXIS: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T3 GONZALEZ, LUCAS: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T5 DELLI QUADRI, IGNACIO DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — AGUIRRE, HUGO
✅ R8) R8 T8 PRESA, DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T10 TORRES, ANIBAL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T11 CONTRERAS, JUAN CRUZ: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) T5 AGUIRRE, HUGO: los dos ratificados → avisa en ratificación (correcto)  — AGUIRRE, HUGO
✅ A0) inscripciones.html carga jockey-repetido.js
✅ A1) turno ×3: 3 filas con ⚠ dup.  — badges: 3
✅ A2) turno ×3: las filas marcadas son las del jockey repetido
✅ A3) turno ×3: ALHENA S (jockey único) sin badge
✅ A4) turno limpio: 0 badges
✅ A5) ratificado + forfait con el mismo jockey: 0 badges
✅ A6) saveRecord llama avisarJockeyRepetido (toast, no return antes del insert)
✅ A7) toast de aviso al guardar con el jockey ×3, tipo warning  — [["⚠ SINT-GONZALEZ, LUCAS queda en 3 caballos de este turno. Es un aviso: se define en la ratificación.","warning"]]
✅ B0) portal.html carga jockey-repetido.js y pide jockey_titular_id
✅ B1) jockey ya en 2 caballos míos del turno → aviso visible con los nombres  — ⚠ Ya declaraste este jockey en DEL CAMPEON S, OLA DOCTOR S para este turno. Podés anotar igual: la monta se define en la ratificación.
✅ B2) los otros en forfait → sin aviso
✅ B3) otro turno → sin aviso
✅ B4) sin jockey elegido → sin aviso
✅ B5) el aviso dice que se puede anotar igual (no bloqueo)
✅ C0) ratificacion.html carga jockey-repetido.js
✅ C1) render: jockeyCount = conteoJockeysActivos(insc)
✅ C2) el conteo viejo sobre todas las filas ya no está
✅ C3) recalcJockeyColisiones cuenta por estado de fila
✅ C4) updateCounter recalcula el aviso tras cada cambio de estado
✅ C5) ratificar() sigue sin mirar colisiones (no bloqueo)
✅ C6) estadoDeFila lee badge-ratificado / badge-mal_inscrito
✅ D0) resultados.html carga jockey-repetido.js
✅ D1) R8 T5: NOCHE EN VELA no largó (dato persistido)  — noLargo mandiles: 4
✅ D2) R8 T5: Aguirre en los dos, ratificados
✅ D3) estado actual (Aguirre ×2, NOCHE EN VELA no largó) → moJockeysRepetidos sin repetidos  — {"654dc3ea-5c90-46cd-a579-eb0efa3bd1c0":1,"a66df20c-cd72-4125-a1d7-b32e48fcf037":1,"8f24be30-e951-4287-82bd-2db54d0e32dc":1,"484361c0-abb5-41af-b20e-3090535cb075":1,"2e3428cb-be99-4c91-9b99-13c3b499e147":1,"005caa02-fc91-45b3-9ae6-6f55d989fa2e":1,"0bbe6666-bdf5-446b-8ee2-5279eafdc844":1}
✅ D4) backfill R8 T5: saveMontas emite el cambio de LA LAGUNERA J por rpc_cambiar_monta (no bloqueado)  — [{"nombre":"rpc_cambiar_monta","id":"4370d235-6dd9-479a-b7af-cd7c4d81c82f","jockey_titular_id":"a66df20c-cd72-4125-a1d7-b32e48fcf037"}]
✅ D5) backfill R8 T5: toast de guardado y NINGÚN aviso de repetido (el otro no largó)  — [["1 monta(s) guardada(s)","success"]]
✅ D6) Aguirre en dos que largaron → se guarda igual (UPDATE emitido) + toast warning  — {"updates":[{"nombre":"rpc_cambiar_monta","id":"b6ef2dbb-59aa-45c7-8385-386197acb0e8","jockey_titular_id":"a66df20c-cd72-4125-a1d7-b32e48fcf037"}],"toasts":[["1 monta(s) guardada(s)","success"],["⚠ Jockey repetido entre caballos que largaron: AGUIRRE, HUGO. Se guardó igual — revisalo antes de oficializar.","warning"]]}
✅ D7) montasFaltantes usa noLargoIds (refactor sin cambio de criterio)
✅ D8) la base no se tocó: LA LAGUNERA J y el tercer caballo siguen como estaban  — [{"id":"4370d235-6dd9-479a-b7af-cd7c4d81c82f","jockey_titular_id":"a66df20c-cd72-4125-a1d7-b32e48fcf037","estado":"ratificado"},{"id":"b6ef2dbb-59aa-45c7-8385-386197acb0e8","jockey_titular_id":"654dc3ea-5c90-46cd-a579-eb0efa3bd1c0","estado":"ratificado"}]

53/53 asserts OK

── mutantes ──
✅ muere M1 (resultados.html) — saveMontas vuelve a from('inscripciones').update() (UPDATE directo, pre ISSUE-084)  [esperaba matar D4; cayeron D4]
✅ muere M2 (jockey-repetido.js) — forfait cuenta como monta activa  [esperaba matar S3; cayeron H1,H8,S3,R8,A5,B2]
✅ muere M3 (inscripciones.html) — renderInscripciones no marca la fila con jockey repetido  [esperaba matar A1; cayeron A1,A2]
✅ muere M4 (portal.html) — el aviso de jockey repetido del portal no se muestra nunca  [esperaba matar B1; cayeron B1,B5]

mutantes: 4/4 muertos
exit 0
```

Antes de este cambio (con el tramo D ya arreglado): 49/60, 11 rojos de R9/A/B. Ahora: **53/53**, mutantes **4/4**, exit 0.

## Diff completo (`git diff main..796eea8`)

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index f0cb858..1b4e591 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -377,7 +377,7 @@ node tests/probe_studbook_buscar_fn.mjs            # studbook-buscar — lógica
 node tests/probe_studbook_buscar_e2e.mjs           # studbook-buscar deployada — 200 staff / 403 portal / 401 sin token / preflight; ESCRIBE usuarios, teardown verificado
 node tests/probe_spcs_studbook_alta.mjs            # spcs.html — buscar, Usar, prellenado, panel de duplicados (bloquea / Guardar igual), INSERT real; ESCRIBE 1 spc + 1 usuario, teardown verificado, count 205
 node tests/probe_orden_inscriptos.mjs             # inscripciones.html — pantalla y PDF en alfabético 'es' (= ratificacion); R9 T4 NIÑO OCEANICO < NISTEL WIN; solo lectura
-node tests/probe_aviso_jockey_repetido.mjs         # jockey repetido en el turno — aviso en 4 pantallas, sólo activos; R9 4 turnos avisan, R8 T5 backfill no bloqueado; solo lectura
+node tests/probe_aviso_jockey_repetido.mjs [--mutantes]   # jockey repetido en el turno — aviso en 4 pantallas, sólo activos; turnos SINTÉTICOS (×3, ×2, limpio, forfait, mal_inscrito; desde 02/10 reemplazan a R9, que drifteó) + R8 histórico + R8 T5 backfill no bloqueado (saveMontas → rpc_cambiar_monta); 53/53, 4/4 mutantes; solo lectura
 node tests/probe_caballeriza_provisorio.mjs        # caballerizas.html titular opcional + rpc_caballeriza_provisorio (UI con stubs + RPC con sesiones reales); ESCRIBE fixture (reunión 9985), teardown verificado, count 238; CABALLERIZAS_HTML acepta URL
 node tests/probe_modificar_inscripcion_portal.mjs   # Modificar desde el portal — rpc_modificar_inscripcion (guards = baja, cadena del propietario, GATE-1=B) + UI; ESCRIBE fixture 9987/9986, teardown verificado, count 238; PORTAL_HTML=https://sigh.com.ar/portal.html corre contra el HTML servido
 node tests/probe_carta_numero_turno.mjs [out_dir]   # carta-llamados PDF — `TURNO N — condición` con numero_turno (R9 T3=7 discrimina) + ancho con Chromium: nadie desborda, T5–T8 a 2 líneas, chip de distancia intacto; PNG; solo lectura; necesita ~/chromium-libs + fonts-liberation
diff --git a/tests/probe_aviso_jockey_repetido.mjs b/tests/probe_aviso_jockey_repetido.mjs
index c50d9f2..3aa6f96 100644
--- a/tests/probe_aviso_jockey_repetido.mjs
+++ b/tests/probe_aviso_jockey_repetido.mjs
@@ -18,16 +18,20 @@
  *   H) jockey-repetido.js — el helper compartido, con casos sintéticos:
  *      forfait/mal_inscrito con el mismo jockey NO cuentan; inscripto +
  *      inscripto y ratificado + ratificado SÍ.
- *   R9) Datos reales: los 4 turnos de R9 con jockey repetido (T2 Gonzalez ×3,
- *      T5 Canto ×2, T10 Aguirre ×3, T11 Canto ×2) avisan; los otros 7 no.
+ *   S) Turnos SINTÉTICOS (02/10/2026, reemplazan a los de R9): ×3, ×2, turno
+ *      limpio, forfait + ratificado y mal_inscrito + ratificado. Antes eran datos
+ *      reales de R9 fijados al 12/09; las montas de R9 se editaron después
+ *      (ratificación y día de carrera) y los asserts quedaron en rojo por drift,
+ *      no por un bug (informe 2026-10-02_r9-jockey-dos-caballos-t3-t5-t11.md).
  *   R8) Datos reales, los 8 casos históricos: los 7 "forfait/mal_inscrito +
  *      ratificado" ya NO avisan; R8 T5 (Aguirre, los dos ratificados) avisa en
  *      ratificación (correcto: ahí los dos estaban activos).
- *   A) inscripciones.html — renderInscripciones() real con DOM stub: badge
- *      ⚠ dup. en las filas de R9 T2 y en ninguna de un turno limpio.
- *   B) portal.html — avisoJockeyRepetidoPortal() real: muestra el aviso cuando
- *      el jockey elegido ya está en otro caballo mío activo del turno; no lo
- *      muestra si ese otro está en forfait.
+ *   A) inscripciones.html — renderInscripciones() real con DOM stub sobre los
+ *      turnos sintéticos: badge ⚠ dup. en las 3 filas del ×3 y en ninguna del
+ *      turno limpio ni del forfait + ratificado.
+ *   B) portal.html — avisoJockeyRepetidoPortal() real sobre el turno sintético:
+ *      muestra el aviso cuando el jockey elegido ya está en otro caballo mío
+ *      activo del turno; no lo muestra si ese otro está en forfait.
  *   C) ratificacion.html — texto: cuenta con conteoJockeysActivos y el
  *      updateCounter recalcula; el conteo viejo (todas las filas) no está.
  *   D) resultados.html Montas — moJockeysRepetidos() y saveMontas() reales
@@ -38,9 +42,12 @@
  *      registra; la base no se toca). Desde ISSUE-084 (22/09) saveMontas no hace
  *      UPDATE directo: llama sb.rpc('rpc_cambiar_monta'); D4 exige ese nombre.
  *
- * MUTANTES (--mutantes): M1 saveMontas vuelve a from('inscripciones').update()
- * → D4 tiene que fallar. Se corre este mismo probe como subproceso con
- * SRC_RESULTADOS_HTML apuntando a un resultados.html mutado.
+ * MUTANTES (--mutantes): cada uno se corre como subproceso de este mismo probe con
+ * SRC_<ARCHIVO> apuntando a una copia mutada; tiene que caer el assert indicado.
+ *   M1 resultados.html: saveMontas vuelve a from('inscripciones').update() → D4
+ *   M2 jockey-repetido.js: forfait cuenta como activo → S3
+ *   M3 inscripciones.html: renderInscripciones no marca la fila duplicada → A1
+ *   M4 portal.html: el aviso del portal no se muestra nunca → B1
  *
  * PATRÓN (tests/README.md § "Browser NO disponible")
  * ---------------------------------------------------------------------------
@@ -64,7 +71,6 @@ const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE
 if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
 
 const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
-const R9_ID   = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';   // Reunión 9 — 20/09/2026
 const R8_ID   = '7b6e003e-22e2-4629-bf55-f18560b1260f';   // Reunión 8 — 16/08/2026 (finalizada)
 const R6_ID   = 'b02ca761-6f44-4720-86aa-a3c3099019ea';   // Reunión 6 — 20/06/2026
 
@@ -134,16 +140,38 @@ const profsMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
 const nomJ = (id) => profsMap[id] ? `${profsMap[id].apellido}, ${profsMap[id].nombre}` : id;
 const porTurno = (insc) => { const m = {}; insc.forEach(i => (m[i.carreras.numero_turno] ||= []).push(i)); return m; };
 
-// R9
-const r9 = porTurno(await inscDeReunion(R9_ID));
-const ESPERADO_R9 = { 2: 'GONZALEZ, LUCAS', 5: 'CANTO, TOBIAS', 10: 'AGUIRRE, HUGO', 11: 'CANTO, TOBIAS' };
-for (const t of Object.keys(r9).map(Number).sort((a, b) => a - b)) {
-  const rep = [...H.jockeysRepetidos(r9[t])].map(nomJ);
-  if (ESPERADO_R9[t]) ok(`R9) T${t} avisa: ${ESPERADO_R9[t]}`, rep.length === 1 && rep[0] === ESPERADO_R9[t], rep.join(' | ') || '(nada)');
-  else ok(`R9) T${t} sin aviso`, rep.length === 0, rep.join(' | '));
-}
-ok('R9) T2 Gonzalez ×3', H.conteoJockeysActivos(r9[2] || [])[Object.keys(profsMap).find(id => nomJ(id) === 'GONZALEZ, LUCAS')] === 3);
-ok('R9) T10 Aguirre ×3', H.conteoJockeysActivos(r9[10] || [])[Object.keys(profsMap).find(id => nomJ(id) === 'AGUIRRE, HUGO')] === 3);
+// ═══════════════════ S — turnos sintéticos (reemplazan a R9) ═══════════════
+// Mismos escenarios que tenía R9 al 12/09, sin depender de que nadie edite montas.
+// Jockeys con ids propios ('sj-…'), agregados a profsMap para que nomJ/getProf los nombren.
+const SJ = { gonz: 'sj-gonz', canto: 'sj-canto', hahn: 'sj-hahn', aguirre: 'sj-aguirre', presa: 'sj-presa' };
+Object.assign(profsMap, {
+  [SJ.gonz]: { id: SJ.gonz, apellido: 'SINT-GONZALEZ', nombre: 'LUCAS', tipo: 'jockey' },
+  [SJ.canto]: { id: SJ.canto, apellido: 'SINT-CANTO', nombre: 'TOBIAS', tipo: 'jockey' },
+  [SJ.hahn]: { id: SJ.hahn, apellido: 'SINT-HAHN', nombre: 'GONZALO', tipo: 'jockey' },
+  [SJ.aguirre]: { id: SJ.aguirre, apellido: 'SINT-AGUIRRE', nombre: 'HUGO', tipo: 'jockey' },
+  [SJ.presa]: { id: SJ.presa, apellido: 'SINT-PRESA', nombre: 'DANIEL', tipo: 'jockey' },
+});
+let nInsc = 0;
+const ins = (carrera, caballo, estado, jockey) => ({ id: `si-${++nInsc}`, carrera_id: carrera, spc_id: `ss-${nInsc}`, estado,
+  jockey_titular_id: jockey, jockey_suplente_id: null, caballeriza_id: null, entrenador_id: null, numero_partidor: nInsc,
+  canal: 'manual', spcs: { nombre: caballo }, carreras: { id: carrera, numero_turno: 0, reunion_id: 'sintetica' } });
+const ST = {
+  tres: [ins('sc-tres', 'DEL CAMPEON S', 'inscripto', SJ.gonz), ins('sc-tres', 'OLA DOCTOR S', 'inscripto', SJ.gonz),
+         ins('sc-tres', 'TOUCH OF BLUE S', 'inscripto', SJ.gonz), ins('sc-tres', 'ALHENA S', 'inscripto', SJ.hahn)],
+  dos: [ins('sc-dos', 'KUCCINI S', 'ratificado', SJ.canto), ins('sc-dos', 'DESTINADO S', 'ratificado', SJ.canto),
+        ins('sc-dos', 'NELIDA S', 'ratificado', SJ.aguirre)],
+  limpio: [ins('sc-limpio', 'UNO S', 'ratificado', SJ.gonz), ins('sc-limpio', 'DOS S', 'ratificado', SJ.canto),
+           ins('sc-limpio', 'TRES S', 'inscripto', SJ.hahn), ins('sc-limpio', 'CUATRO S', 'inscripto', null)],
+  forfait: [ins('sc-forf', 'WILSON S', 'ratificado', SJ.presa), ins('sc-forf', 'MAC VITAL S', 'forfait', SJ.presa)],
+  malins: [ins('sc-mal', 'PRIMERO S', 'ratificado', SJ.aguirre), ins('sc-mal', 'SEGUNDO S', 'mal_inscrito', SJ.aguirre)],
+};
+const repS = (t) => [...H.jockeysRepetidos(ST[t])].map(nomJ);
+ok('S1) ×3 inscriptos con el mismo jockey → avisa ese jockey (y no el del caballo único)', JSON.stringify(repS('tres')) === JSON.stringify(['SINT-GONZALEZ, LUCAS']), repS('tres').join(' | ') || '(nada)');
+ok('S1) conteo ×3', H.conteoJockeysActivos(ST.tres)[SJ.gonz] === 3);
+ok('S2) ×2 ratificados → avisa', JSON.stringify(repS('dos')) === JSON.stringify(['SINT-CANTO, TOBIAS']), repS('dos').join(' | ') || '(nada)');
+ok('S3) forfait + ratificado, mismo jockey → no avisa', repS('forfait').length === 0, repS('forfait').join(' | '));
+ok('S4) mal_inscrito + ratificado, mismo jockey → no avisa', repS('malins').length === 0, repS('malins').join(' | '));
+ok('S5) turno limpio (jockeys distintos, uno sin jockey) → no avisa', repS('limpio').length === 0, repS('limpio').join(' | '));
 
 // R8 + R6: los 8 casos históricos
 const r8 = porTurno(await inscDeReunion(R8_ID));
@@ -171,20 +199,18 @@ for (const [r, m, t, jockey] of SIN_COLISION) {
     run(dom, insc, () => null, () => null, (id) => profsMap[id] || null, H.conteoJockeysActivos, H.badgeJockeyDup, H.ESTADOS_ACTIVOS_MONTA, escapeHtml);
     return dom._n['list-container'].innerHTML;
   };
-  const htmlT2 = render(r9[2]);
-  const dupsT2 = (htmlT2.match(/badge-jockey-dup/g) || []).length;
-  ok('A1) R9 T2: 3 filas con ⚠ dup. (Gonzalez ×3)', dupsT2 === 3, `badges: ${dupsT2}`);
-  ok('A2) R9 T2: las filas marcadas son las de Gonzalez', ['DEL CAMPEON', 'OLA DOCTOR', 'TOUCH OF BLUE'].every(n => new RegExp(`<tr class="jockey-duplicado">\\s*<td><div class="spc-name">${n}</div>`).test(htmlT2)));
-  ok('A3) R9 T2: ALHENA (Hahn, único) sin badge', /<tr>\s*<td><div class="spc-name">ALHENA<\/div>/.test(htmlT2));
-  const limpio = Object.keys(r9).map(Number).find(t => !ESPERADO_R9[t]);
-  ok(`A4) R9 T${limpio} (turno limpio): 0 badges`, (render(r9[limpio]).match(/badge-jockey-dup/g) || []).length === 0);
-  // R8 T2: Lopez en WILSON SECURITY (ratificado) + MAC VITAL (forfait) → 0 badges
-  ok('A5) R8 T2 (Lopez: ratificado + forfait): 0 badges', (render(r8[2]).match(/badge-jockey-dup/g) || []).length === 0);
+  const htmlTres = render(ST.tres);
+  const dupsTres = (htmlTres.match(/badge-jockey-dup/g) || []).length;
+  ok('A1) turno ×3: 3 filas con ⚠ dup.', dupsTres === 3, `badges: ${dupsTres}`);
+  ok('A2) turno ×3: las filas marcadas son las del jockey repetido', ['DEL CAMPEON S', 'OLA DOCTOR S', 'TOUCH OF BLUE S'].every(n => new RegExp(`<tr class="jockey-duplicado">\\s*<td><div class="spc-name">${n}</div>`).test(htmlTres)));
+  ok('A3) turno ×3: ALHENA S (jockey único) sin badge', /<tr>\s*<td><div class="spc-name">ALHENA S<\/div>/.test(htmlTres));
+  ok('A4) turno limpio: 0 badges', (render(ST.limpio).match(/badge-jockey-dup/g) || []).length === 0);
+  ok('A5) ratificado + forfait con el mismo jockey: 0 badges', (render(ST.forfait).match(/badge-jockey-dup/g) || []).length === 0);
   ok('A6) saveRecord llama avisarJockeyRepetido (toast, no return antes del insert)', /await loadInscripciones\(\);\s*avisarJockeyRepetido\(payload\.jockey_titular_id\);/.test(INSC));
   const av = extractFn(INSC, 'function avisarJockeyRepetido(jockeyId) {');
   const toasts = [];
-  new Function('inscripciones', 'getProf', 'toast', 'conteoJockeysActivos', av + "\navisarJockeyRepetido(arguments[4]);")(r9[2], (id) => profsMap[id], (m, t) => toasts.push([m, t]), H.conteoJockeysActivos, r9[2].find(i => nomJ(i.jockey_titular_id) === 'GONZALEZ, LUCAS').jockey_titular_id);
-  ok('A7) toast de aviso al guardar con Gonzalez en T2, tipo warning', toasts.length === 1 && /GONZALEZ, LUCAS queda en 3 caballos/.test(toasts[0][0]) && toasts[0][1] === 'warning', JSON.stringify(toasts));
+  new Function('inscripciones', 'getProf', 'toast', 'conteoJockeysActivos', av + "\navisarJockeyRepetido(arguments[4]);")(ST.tres, (id) => profsMap[id], (m, t) => toasts.push([m, t]), H.conteoJockeysActivos, SJ.gonz);
+  ok('A7) toast de aviso al guardar con el jockey ×3, tipo warning', toasts.length === 1 && /SINT-GONZALEZ, LUCAS queda en 3 caballos/.test(toasts[0][0]) && toasts[0][1] === 'warning', JSON.stringify(toasts));
 }
 
 // ═══════════════════ B — portal.html avisoJockeyRepetidoPortal ══════════════
@@ -200,8 +226,8 @@ for (const [r, m, t, jockey] of SIN_COLISION) {
     new Function('document', 'misInscripciones', 'carreraSeleccionada', 'ESTADOS_ACTIVOS_MONTA', src + '\navisoJockeyRepetidoPortal();')(dom, misInscripciones, { id: carreraId }, H.ESTADOS_ACTIVOS_MONTA);
     return dom._n['minsc-jockey-aviso'];
   };
-  const gonz = r9[2].find(i => nomJ(i.jockey_titular_id) === 'GONZALEZ, LUCAS');
-  const mias = r9[2].filter(i => i.jockey_titular_id === gonz.jockey_titular_id).slice(0, 2);   // como si fueran míos
+  const gonz = ST.tres[0];
+  const mias = ST.tres.filter(i => i.jockey_titular_id === gonz.jockey_titular_id).slice(0, 2);   // como si fueran míos
   const a1 = corre(mias, gonz.jockey_titular_id, gonz.carrera_id);
   ok('B1) jockey ya en 2 caballos míos del turno → aviso visible con los nombres', a1.hidden === false && /Ya declaraste este jockey en/.test(a1.textContent) && mias.every(i => a1.textContent.includes(i.spcs.nombre)), a1.textContent);
   const a2 = corre(mias.map(i => ({ ...i, estado: 'forfait' })), gonz.jockey_titular_id, gonz.carrera_id);
@@ -298,23 +324,35 @@ console.log(`\n${results.length - fails}/${results.length} asserts OK${fails ? `
 let vivos = 0;
 if (process.argv.includes('--mutantes')) {
   const MUT = [
-    { id: 'M1', desc: 'saveMontas vuelve a from(\'inscripciones\').update() (UPDATE directo, pre ISSUE-084)', mata: 'D4',
+    { id: 'M1', archivo: 'resultados.html', desc: 'saveMontas vuelve a from(\'inscripciones\').update() (UPDATE directo, pre ISSUE-084)', mata: 'D4',
       from: "const { data, error } = await sb.rpc('rpc_cambiar_monta', { p_inscripcion_id: u.id, p_jockey_id: u.jockey_titular_id });",
       to: "const { data, error } = await sb.from('inscripciones').update({ jockey_titular_id: u.jockey_titular_id }).eq('id', u.id);" },
+    { id: 'M2', archivo: 'jockey-repetido.js', desc: 'forfait cuenta como monta activa', mata: 'S3',
+      from: "const ESTADOS_ACTIVOS_MONTA = ['inscripto', 'ratificado'];",
+      to: "const ESTADOS_ACTIVOS_MONTA = ['inscripto', 'ratificado', 'forfait'];" },
+    { id: 'M3', archivo: 'inscripciones.html', desc: 'renderInscripciones no marca la fila con jockey repetido', mata: 'A1',
+      from: "const jockeyDup = ESTADOS_ACTIVOS_MONTA.includes(i.estado) && !!i.jockey_titular_id && jockeyCount[i.jockey_titular_id] >= 2;",
+      to: "const jockeyDup = false;" },
+    { id: 'M4', archivo: 'portal.html', desc: 'el aviso de jockey repetido del portal no se muestra nunca', mata: 'B1',
+      from: "function avisoJockeyRepetido(el, jockeyId, carreraId, excluirInscId = null) {",
+      to: "function avisoJockeyRepetido(el, jockeyId, carreraId, excluirInscId = null) { if (el) { el.hidden = true; el.textContent = ''; } return;" },
   ];
   console.log('\n── mutantes ──');
   const dir = mkdtempSync(join(tmpdir(), 'mut-jockey-'));
   for (const m of MUT) {
-    if (RESU.split(m.from).length !== 2) { console.log(`⚠️  ${m.id} ancla no única/ausente en resultados.html — mutante roto`); vivos++; continue; }
-    const p = join(dir, `${m.id}.html`);
-    writeFileSync(p, RESU.replace(m.from, m.to));
+    const src = rd(m.archivo);
+    if (src.split(m.from).length !== 2) { console.log(`⚠️  ${m.id} ancla no única/ausente en ${m.archivo} — mutante roto`); vivos++; continue; }
+    const p = join(dir, `${m.id}-${m.archivo}`);
+    writeFileSync(p, src.replace(m.from, m.to));
+    const envVar = `SRC_${m.archivo.replace(/[.-]/g, '_').toUpperCase()}`;
     let out = '';
-    try { out = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, SRC_RESULTADOS_HTML: p }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
+    try { out = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, [envVar]: p }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
     catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
     if (!/asserts OK/.test(out)) { console.log(`⚠️  ${m.id} ERROR DE ARNÉS — no llegó a los asserts: ${(out.split('\n').find(l => /Error/.test(l)) || '').trim().slice(0, 200)}`); vivos++; continue; }
     const muere = out.includes(`❌ ${m.mata})`);
     if (!muere) vivos++;
-    console.log(`${muere ? '✅ muere' : '❌ VIVE '} ${m.id} — ${m.desc}  [esperaba matar ${m.mata}]`);
+    const caidos = [...new Set([...out.matchAll(/^❌ ([A-Z]+\d*)\)/gm)].map(x => x[1]))];
+    console.log(`${muere ? '✅ muere' : '❌ VIVE '} ${m.id} (${m.archivo}) — ${m.desc}  [esperaba matar ${m.mata}; cayeron ${caidos.join(',') || 'ninguno'}]`);
   }
   console.log(`\nmutantes: ${MUT.length - vivos}/${MUT.length} muertos`);
 }
```

---

## Verificación de push

```
$ git ls-remote origin reports
b03122710133ac64d82305b1babdceeea841e190	refs/heads/reports
$ git rev-parse HEAD
b03122710133ac64d82305b1babdceeea841e190
$ git ls-remote origin fix/probe-aviso-jockey-sinteticos
796eea81047dd016c20a9bd9b5369ca79c620f06	refs/heads/fix/probe-aviso-jockey-sinteticos
```

Coinciden. Este bloque va en un commit posterior.
