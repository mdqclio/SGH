# probe_aviso_jockey_repetido — tramo D (saveMontas) con rpc_cambiar_monta + mutante

- **Fecha:** 2026-10-02
- **Rama:** `fix/probe-aviso-jockey-savemontas` — commit **`93b6d30`** — PR **#31** (https://github.com/mdqclio/SGH/pull/31), **sin mergear**
- **Base:** `main` `fad1db8`
- **Guards:** pwd=/home/clio/dev/SGH · ref=unlhcuanfrtpatoipwve · el probe es SOLO LECTURA contra prod (sb falso en D; relectura D8)
- **Alcance:** sólo `tests/probe_aviso_jockey_repetido.mjs`, como se pidió.

## Resumen

- **Tramo D: 9/9** (D0–D8). D4 ahora exige `nombre === 'rpc_cambiar_monta'`.
- **Mutante M1 muere**: si `saveMontas` vuelve a `from('inscripciones').update()`, cae D4. Resultado: 1/1.
- **El probe completo sigue en rojo: 49/60.** Los 11 fallos están **fuera del tramo D** (R9, A1, A2, A7, B1). Son asserts con lo
  esperado fijado a la foto de R9 del **12/09**, y las montas de R9 se editaron después (16, 17 y 20/09; auditoría abajo).
  Es drift de datos, no un bug de las pantallas. **No los toqué**: no estaban en el pedido, y re-basearlos es una decisión tuya
  (pasarlos a una foto fija, a la 9999 o a casos sintéticos).
- Antes de este cambio, el probe moría en el tramo A (`escapeHtml is not defined`, arreglado en el PR #29) y después en el D
  (`sb.rpc is not a function`). Por eso estos 11 no se veían: nunca se llegaba al reporte.

## Cambio (diff completo)

```diff
diff --git a/tests/probe_aviso_jockey_repetido.mjs b/tests/probe_aviso_jockey_repetido.mjs
index cf92c82..c50d9f2 100644
--- a/tests/probe_aviso_jockey_repetido.mjs
+++ b/tests/probe_aviso_jockey_repetido.mjs
@@ -34,8 +34,13 @@
  *      sobre R8 T5 con noLargoMandiles armado como lo hace la pantalla:
  *      NOCHE EN VELA no largó → sin aviso; y el backfill (cargar Aguirre en
  *      LA LAGUNERA J con Aguirre todavía en NOCHE EN VELA) NO queda
- *      bloqueado: saveMontas emite el UPDATE (contra un sb falso que sólo
- *      registra; la base no se toca).
+ *      bloqueado: saveMontas emite el cambio (contra un sb falso que sólo
+ *      registra; la base no se toca). Desde ISSUE-084 (22/09) saveMontas no hace
+ *      UPDATE directo: llama sb.rpc('rpc_cambiar_monta'); D4 exige ese nombre.
+ *
+ * MUTANTES (--mutantes): M1 saveMontas vuelve a from('inscripciones').update()
+ * → D4 tiene que fallar. Se corre este mismo probe como subproceso con
+ * SRC_RESULTADOS_HTML apuntando a un resultados.html mutado.
  *
  * PATRÓN (tests/README.md § "Browser NO disponible")
  * ---------------------------------------------------------------------------
@@ -44,11 +49,13 @@
  * (lectura), un mini-DOM y stubs. Nada se reimplementa.
  *
  *   set -a; . ./.env; set +a
- *   node tests/probe_aviso_jockey_repetido.mjs
+ *   node tests/probe_aviso_jockey_repetido.mjs [--mutantes]
  */
 
 import { createClient } from '@supabase/supabase-js';
-import { readFileSync } from 'node:fs';
+import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
+import { execFileSync } from 'node:child_process';
+import { tmpdir } from 'node:os';
 import { dirname, join } from 'node:path';
 import { fileURLToPath } from 'node:url';
 
@@ -242,9 +249,13 @@ for (const [r, m, t, jockey] of SIN_COLISION) {
     extractFn(RESU, 'function moJockeysRepetidos() {'),
     extractFn(RESU, 'async function saveMontas() {'),
   ].join('\n\n');
-  // sb FALSO: registra los UPDATE y no escribe nada.
+  // sb FALSO: registra y no escribe nada. saveMontas llama rpc_cambiar_monta (ISSUE-084);
+  // from().update() queda para que el mutante M1 (UPDATE directo, como antes) registre SIN nombre y D4 falle.
   const updates = [];
-  const sbFalso = { from: () => ({ update: (payload) => ({ eq: async (col, val) => { updates.push({ ...payload, id: val }); return { error: null }; } }) }) };
+  const sbFalso = {
+    rpc: async (nombre, args) => { updates.push({ nombre, id: args.p_inscripcion_id, jockey_titular_id: args.p_jockey_id }); return { data: { recalcular: false }, error: null }; },
+    from: () => ({ update: (payload) => ({ eq: async (col, val) => { updates.push({ ...payload, id: val }); return { error: null }; } }) }),
+  };
   const toasts = [];
   const make = (valores, moOriginal) => {
     const dom = mkDom();
@@ -262,7 +273,7 @@ for (const [r, m, t, jockey] of SIN_COLISION) {
   const antes = { ...actual, [lagunera.id]: null };
   const r2 = await make(actual, antes);
   await r2.save();
-  ok('D4) backfill R8 T5: saveMontas emite el UPDATE de LA LAGUNERA J (no bloqueado)', updates.length === 1 && updates[0].id === lagunera.id && updates[0].jockey_titular_id === lagunera.jockey_titular_id, JSON.stringify(updates));
+  ok('D4) backfill R8 T5: saveMontas emite el cambio de LA LAGUNERA J por rpc_cambiar_monta (no bloqueado)', updates.length === 1 && updates[0].nombre === 'rpc_cambiar_monta' && updates[0].id === lagunera.id && updates[0].jockey_titular_id === lagunera.jockey_titular_id, JSON.stringify(updates));
   ok('D5) backfill R8 T5: toast de guardado y NINGÚN aviso de repetido (el otro no largó)', toasts.some(t => /monta\(s\) guardada/.test(t[0])) && !toasts.some(t => t[1] === 'warning'), JSON.stringify(toasts));
   // (iii) mismo jockey en dos que SÍ largaron → aviso warning, pero se guarda igual
   updates.length = 0; toasts.length = 0;
@@ -282,4 +293,29 @@ for (const [r, m, t, jockey] of SIN_COLISION) {
 for (const r of results) console.log(`${r.s} ${r.t}${r.n ? `  — ${r.n}` : ''}`);
 const fails = results.filter(r => r.s === '❌').length;
 console.log(`\n${results.length - fails}/${results.length} asserts OK${fails ? ` — ${fails} FALLARON` : ''}`);
-process.exit(fails ? 1 : 0);
+
+// ═══════════════════════════════ mutantes ═══════════════════════════════════
+let vivos = 0;
+if (process.argv.includes('--mutantes')) {
+  const MUT = [
+    { id: 'M1', desc: 'saveMontas vuelve a from(\'inscripciones\').update() (UPDATE directo, pre ISSUE-084)', mata: 'D4',
+      from: "const { data, error } = await sb.rpc('rpc_cambiar_monta', { p_inscripcion_id: u.id, p_jockey_id: u.jockey_titular_id });",
+      to: "const { data, error } = await sb.from('inscripciones').update({ jockey_titular_id: u.jockey_titular_id }).eq('id', u.id);" },
+  ];
+  console.log('\n── mutantes ──');
+  const dir = mkdtempSync(join(tmpdir(), 'mut-jockey-'));
+  for (const m of MUT) {
+    if (RESU.split(m.from).length !== 2) { console.log(`⚠️  ${m.id} ancla no única/ausente en resultados.html — mutante roto`); vivos++; continue; }
+    const p = join(dir, `${m.id}.html`);
+    writeFileSync(p, RESU.replace(m.from, m.to));
+    let out = '';
+    try { out = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, SRC_RESULTADOS_HTML: p }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
+    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
+    if (!/asserts OK/.test(out)) { console.log(`⚠️  ${m.id} ERROR DE ARNÉS — no llegó a los asserts: ${(out.split('\n').find(l => /Error/.test(l)) || '').trim().slice(0, 200)}`); vivos++; continue; }
+    const muere = out.includes(`❌ ${m.mata})`);
+    if (!muere) vivos++;
+    console.log(`${muere ? '✅ muere' : '❌ VIVE '} ${m.id} — ${m.desc}  [esperaba matar ${m.mata}]`);
+  }
+  console.log(`\nmutantes: ${MUT.length - vivos}/${MUT.length} muertos`);
+}
+process.exit(fails || vivos ? 1 : 0);
```

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
✅ R9) T1 sin aviso
❌ R9) T2 avisa: GONZALEZ, LUCAS  — (nada)
❌ R9) T3 sin aviso  — IBARRA, FERNANDO AUGUSTO
✅ R9) T4 sin aviso
❌ R9) T5 avisa: CANTO, TOBIAS  — ARREGUY, FRANCISCO
✅ R9) T6 sin aviso
✅ R9) T7 sin aviso
✅ R9) T8 sin aviso
✅ R9) T9 sin aviso
❌ R9) T10 avisa: AGUIRRE, HUGO  — (nada)
❌ R9) T11 avisa: CANTO, TOBIAS  — AGUIRRE, HUGO
❌ R9) T2 Gonzalez ×3
❌ R9) T10 Aguirre ×3
✅ R8) R6 T9 PRESA, DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T2 LOPEZ, ALEXIS: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T3 GONZALEZ, LUCAS: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T5 DELLI QUADRI, IGNACIO DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — AGUIRRE, HUGO
✅ R8) R8 T8 PRESA, DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T10 TORRES, ANIBAL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T11 CONTRERAS, JUAN CRUZ: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) T5 AGUIRRE, HUGO: los dos ratificados → avisa en ratificación (correcto)  — AGUIRRE, HUGO
✅ A0) inscripciones.html carga jockey-repetido.js
❌ A1) R9 T2: 3 filas con ⚠ dup. (Gonzalez ×3)  — badges: 0
❌ A2) R9 T2: las filas marcadas son las de Gonzalez
✅ A3) R9 T2: ALHENA (Hahn, único) sin badge
✅ A4) R9 T1 (turno limpio): 0 badges
✅ A5) R8 T2 (Lopez: ratificado + forfait): 0 badges
✅ A6) saveRecord llama avisarJockeyRepetido (toast, no return antes del insert)
❌ A7) toast de aviso al guardar con Gonzalez en T2, tipo warning  — []
✅ B0) portal.html carga jockey-repetido.js y pide jockey_titular_id
❌ B1) jockey ya en 2 caballos míos del turno → aviso visible con los nombres  — ⚠ Ya declaraste este jockey en DEL CAMPEON para este turno. Podés anotar igual: la monta se define en la ratificación.
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

49/60 asserts OK — 11 FALLARON

── mutantes ──
✅ muere M1 — saveMontas vuelve a from('inscripciones').update() (UPDATE directo, pre ISSUE-084)  [esperaba matar D4]

mutantes: 1/1 muertos
exit 1
```

## Evidencia del drift de R9 (MCP, prod, sólo lectura)

```sql
select c.numero_turno, i.estado, s.nombre as caballo, p.apellido||', '||p.nombre as jockey,
 (select json_agg(json_build_object('t',a.created_at,'antes',a.datos_antes->>'jockey_titular_id','despues',a.datos_despues->>'jockey_titular_id') order by a.created_at)
    from auditoria a where a.tabla='inscripciones' and a.registro_id=i.id and a.accion='UPDATE'
     and (a.datos_antes->>'jockey_titular_id') is distinct from (a.datos_despues->>'jockey_titular_id') and a.created_at > '2026-09-12') as cambios_jockey_desde_12_09
from inscripciones i join carreras c on c.id=i.carrera_id join spcs s on s.id=i.spc_id left join profesionales p on p.id=i.jockey_titular_id
where c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and c.numero_turno in (2,3,5,10,11) and i.estado in ('inscripto','ratificado')
order by c.numero_turno, jockey, caballo;
```

Lectura de la salida (está entera en el resultado del MCP de la sesión; acá lo que decide):
- **T2** hoy: DOCTORA MIA (Da Silva), DEL CAMPEON (Gonzalez), DOCTOR SKY (Ibarra) y LOCA DUBAI (sin jockey), todas `inscripto`.
  Gonzalez está **una** vez; el probe espera Gonzalez ×3. Los caballos de Gonzalez se ratificaron en otro turno: TOUCH OF BLUE y
  DEL CAMPEON aparecen en T3.
- **T3**: Ibarra en DOCTOR SKY (16/09 20:07) y en DOCTORA MIA (cambiado el 20/09 18:26) → el probe esperaba T3 limpio.
- **T5**: Arreguy en CHE CARABANERA y en OJO EXCELENTE (asignado el 20/09 18:17) → el probe esperaba Canto.
- **T10**: Aguirre una vez (BABY PARADISE) → el probe esperaba Aguirre ×3.
- **T11**: Aguirre en ABARAJALA (16/09) y BABY PARADISE (20/09 18:27) → el probe esperaba Canto.

Las fechas: carga de montas de la ratificación (16–17/09) y cambios del día de la carrera (20/09, 18:17–18:27 UTC).

## Pregunta abierta

¿Cómo querés los asserts R9/A/B? (a) contra una foto fija (sacar la R9 del 12/09 a un JSON del repo), (b) re-basear a la R9
actual (vuelve a romperse si alguien edita montas de R9), o (c) moverlos a la 9999 o a casos sintéticos, como H. Mi
recomendación es (c): no depende de que nadie toque R9.
