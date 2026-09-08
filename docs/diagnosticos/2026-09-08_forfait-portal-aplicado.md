# APLICADO — forfait desde el portal (ventana de ratificación)

**Fecha:** 2026-09-08
**Rama:** `feat/forfait-portal` — **pusheada, SIN mergear.**
**SHA de la rama:** `c4684fc73eb0943c52e8602af2ba4942f256b4ca`
**SHA de `main` (intacto):** `8dafe0943cc2d9072dbed814d71c9a49286797e3`
**SHA de este informe:** ver §9.
**Plan aprobado:** `docs/diagnosticos/2026-09-08_plan-forfait-desde-el-portal.md`

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

## Resumen

| | |
|---|---|
| Probe | **21/21** |
| Mutantes | **14/14 muertos** — 3 de portal automáticos, 11 de SQL por MCP |
| Fixture | reunión 9989/9988, teardown verificado, **0 residuo** |
| `main` | intacto en `8dafe09` |
| ⚠️ El RPC | **ya está aplicado en producción** — ver §1.1 |

---

## 0. ⚠️ Lo primero: el RPC está vivo, la UI no

**El código SQL no puede quedarse en una rama: las funciones viven en la base.** Así que
`rpc_baja_inscripcion` **ya está reemplazada en producción**, mientras que `portal.html` —lo que
habilita el camino nuevo— está en la rama sin mergear.

Es seguro, y por tres motivos concretos:

1. **Es compatible hacia atrás.** En la ventana de inscripción se comporta **exactamente igual que
   antes**: mismo `DELETE`, mismos guards. El assert `A1` lo verifica.
2. **El camino nuevo no es alcanzable desde la UI actual.** El `portal.html` que sirve producción
   no trae `apertura_ratificacion` / `cierre_ratificacion` en su `select` y su `puedeRetirar` exige
   la ventana de inscripción, así que no muestra el botón fuera de ella.
3. **La ventana de R9 es el 14/09**, seis días adelante. No hay ninguna reunión con la ventana de
   ratificación abierta hoy.

Queda como riesgo residual que alguien llame al RPC directamente por API en una ventana de
ratificación abierta. Requiere ser usuario de portal, conocer el RPC y que haya una ventana
abierta — y el resultado sería el comportamiento buscado, no un daño.

Si preferís revertir el RPC hasta mergear la UI, el `CREATE OR REPLACE` de la versión anterior
está en el §1 del informe del plan y se aplica en un minuto. **Decilo y lo hago.**

---

## 1. Lo aplicado — el RPC

`migrations/rpc_baja_inscripcion_forfait.sql` (versionado en la rama) y aplicado por
`apply_migration`. La estructura:

```
guards comunes:  entidad de portal · usuario activo · la inscripción existe
                 canal='portal' AND inscripto_por = el que llama       ← sin cambios
                 reunión 'publicada'
ventanas:        v_en_inscripcion  (fail-closed)
                 v_en_ratificacion (fail-closed)      ← NUEVA
                 si no hay ninguna abierta → rechaza

RAMA 1 · inscripción abierta y ratificación cerrada:
   estado debe ser 'inscripto'  →  DELETE   (igual que antes)

RAMA 2 · ratificación abierta:
   estado debe ser 'inscripto' o 'ratificado'
   →  UPDATE estado='forfait', numero_partidor=NULL,
             motivo_estado='Forfait desde el portal'
      (canal e inscripto_por NO se tocan)
```

### 1.1 Las tres decisiones del `UPDATE`, y por qué

| Qué | Por qué |
|---|---|
| `estado='forfait'` en vez de `DELETE` | el forfait **se imprime**: bloque BORRADOS del PDF de ratificación (`ratificacion.html:397-405`) y tachado en el programa (`programa.html:67-68`). Borrar la fila deja al programa sin nada que tachar |
| `numero_partidor = NULL` | el sorteo se genera **al pedir el PDF de ratificación**, o sea **dentro** de esta misma ventana. Si ya corrió, un forfait con gatera dejaría un cajón asignado a un caballo que no corre. Mantiene la invariante de R8: 67 ratificados con gatera, **29 forfait con cero** |
| `motivo_estado = 'Forfait desde el portal'` | es el campo que la secretaría ya usa para el motivo (`inscripciones.html:318`). Distingue el forfait del portal del que carga ella, sin agregar columnas |
| `canal` e `inscripto_por` **intactos** | son el rastro de quién retiró — el control por auditoría que reemplaza al filtro por tenencia (regla del 24/08). Un `DELETE` lo perdía |

### 1.2 El solapamiento, y por qué gana el forfait

Si por un dato mal cargado las dos ventanas se solaparan, la rama 1 exige
`v_en_inscripcion AND NOT v_en_ratificacion`, o sea que **gana el forfait**. Entre perder datos y
dejar un borrado de más, se eligió lo segundo. Está comentado en el `.sql`.

### 1.3 El estado admitido

Se aceptan `inscripto` **y** `ratificado` en la ventana de ratificación, como aprobaste. Assert
`A14` lo fija: un caballo ya ratificado puede darse de forfait ahí.

---

## 2. Lo aplicado — la UI

`portal.html`, tres cambios. Diff completo en el §8.

**(a) El `select` trae las columnas de la ventana:**

```diff
+          // apertura/cierre_ratificacion: son la fuente de verdad de la ventana de
+          // forfait (ver modoRetiro). Sin ellas el front no puede decidir el modo.
           + 'carreras(numero_turno,nombre,estado,apertura_inscripcion,cierre_inscripcion,'
+          + 'apertura_ratificacion,cierre_ratificacion,'
```

**(b) `ventanaRatificacion()` + `modoRetiro()`**, que devuelve `null | 'inscripcion' |
'ratificacion'`. `puedeRetirar()` se conserva como `modoRetiro(i) !== null`.

**(c) El botón y la confirmación cambian según el modo:**

| Modo | Botón | Confirmación |
|---|---|---|
| `inscripcion` | **Retirar** | *"¿Retirar a X del turno N?"* |
| `ratificacion` | **Dar forfait** | *"¿Dar forfait a X en el turno N? **Queda registrado como BORRADO en el programa de la reunión.**"* |

Y la nota al pie de Mis inscripciones ahora explica las dos ventanas por separado.

**El front sigue sin ser el guard**: el RPC revalida todo. Assert `U6` verifica que la UI tampoco
ofrezca el botón sobre lo ajeno o lo de la secretaría.

---

## 3. La fuente de verdad de la ventana

Como quedó en el plan: **`carreras.apertura_ratificacion` / `cierre_ratificacion`**, las que
ISSUE-074 daba por no leídas. Son la única de las tres candidatas cuyo valor codifica la regla de
Fede:

| Reunión | fecha (día) | `carreras.cierre_ratificacion` | `ratificacion.html` deriva |
|---|---|---|---|
| R8 | 16/08 (Sunday) | **lunes 10/08** | domingo 16/08 12:00 |
| R9 | 20/09 (Sunday) | **lunes 14/09 12:00** | domingo 20/09 12:00 |

**Seis días de diferencia.** Eso quedó abierto como **ISSUE-075**: la pantalla que usa la
secretaría para ratificar tiene un plazo distinto del que ahora usa el sistema.

---

## 4. El probe

`tests/probe_forfait_portal.mjs`. Sesiones de portal **reales** (magiclink + `verifyOtp`, mismo
patrón que `probe_gate4_inscribir`) llamando al RPC real. Fixture propio, teardown verificado.

**El assert central, `A2`, no se apoya en el retorno del RPC** — lección del GOTCHA #93: relee la
fila de la base y verifica que **siga existiendo** con `estado='forfait'`. Un `DELETE` que
devolviera `true` pasaría un assert de "no dio error"; no pasa éste.

### Salida cruda

```

── El RPC ──

── La UI ──

── Probe · forfait desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_baja_inscripcion  ·  run=i77x6o
 ✅ A1) retirar durante la INSCRIPCIÓN sigue funcionando, y BORRA la fila  → ok=true msg=null fila=null
 ✅ A2) retirar durante la RATIFICACIÓN funciona y deja estado=forfait — la fila NO se borra  → ok=true msg=null fila={"id":"fe8018a5-2490-4cb7-9668-2a0f808c1d41","estado":"forfait","canal":"portal","inscripto_por":"e4d3a870-8dae-4f00-81ad-5ddc14abc147","numero_partidor":null,"motivo_estado":"Forfait desde el portal"}
 ✅ A10) el forfait limpia numero_partidor  → numero_partidor=null
 ✅ A11) el forfait CONSERVA canal e inscripto_por (el rastro no se pierde)  → canal=portal inscripto_por=e4d3a870-8dae-4f00-81ad-5ddc14abc147
 ✅ A12) el forfait deja marca de origen en motivo_estado  → motivo_estado="Forfait desde el portal"
 ✅ A14) un caballo ya RATIFICADO puede darse de forfait en esa ventana  → ok=true msg=null estado=forfait
 ✅ A13) un caballo ya en forfait no se puede volver a retirar  → msg=Ese caballo ya figura como forfait y no se puede dar de baja desde el portal.
 ✅ A3) antes de que abra ninguna ventana, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ A4) EL HUECO entre el cierre de inscripción y la apertura de ratificación, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ A5) después del cierre de ratificación, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ A6) no se puede retirar lo que cargó OTRO usuario  → msg=Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.
 ✅ A7) no se puede retirar lo que cargó la SECRETARÍA (canal manual)  → msg=Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.
 ✅ A8) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A9) ventana de ratificación en NULL → fail-closed, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ U1) modoRetiro distingue las dos ventanas y el fuera-de-plazo  → insc=inscripcion · rat=ratificacion
 ✅ U2) el rótulo del botón es "Dar forfait" en ratificación y "Retirar" en inscripción
 ✅ U3) cargarInscripcionesCrudas pide apertura_ratificacion y cierre_ratificacion
 ✅ U4) ventanaRatificacion es fail-closed: sin las dos fechas, cerrada
 ✅ U5) un RATIFICADO muestra botón en la ventana de ratificación, no en la de inscripción
 ✅ U6) lo de otro y lo de la secretaría no muestran botón
 ✅ T1) teardown: no quedaron reuniones 9988/9989 ni SPC del run  → reuniones=0 spcs=0

21/21 OK
```

### A4 — el hueco entre ventanas, que no estaba en la lista

Entre el cierre de inscripción (viernes 12:00) y la apertura de ratificación (lunes 00:00) hay
**~60 horas** en las que no se puede retirar por ninguna vía. Es el comportamiento correcto —esa
es la ventana en la que la secretaría arma la carta— pero ahora está fijado por un assert y no por
casualidad. El mutante M4 lo mata.

---

## 5. Mutation testing — 14/14

### 5.1 Los 3 de portal, automáticos

```

═══ MUTATION TESTING · 14/14 mutantes ═══
(copias en /tmp/mut-forfait-EFQ1u4 — el repo y la función real no se tocan)

✅ M12 muere — modoRetiro devuelve siempre "inscripcion"  [esperaba matar U1,U2; murieron U1,U2]
✅ M13 muere — el select del portal deja de pedir las columnas de ratificación  [esperaba matar U3; murieron U3]
✅ M14 muere — ventanaRatificacion pierde el fail-closed de NULL  [esperaba matar U4; murieron U4]

```

### 5.2 Los 11 de SQL, por MCP sobre una función gemela

**No se pueden automatizar desde el probe**: el RPC vive en la base y desde el probe no hay vía de
DDL — no hay cliente `pg`, no hay connection string, y crear un `exec_sql` genérico sería abrir una
inyección en producción. El runner los emite como `.sql` y se aplican por MCP sobre una **función
gemela** `rpc_baja_inscripcion_mut`; el probe la llama con `RPC_BAJA=…`. **La función real nunca se
tocó.**

| Mutante | Qué neutraliza | Esperaba matar | Murieron | |
|---|---|---|---|---|
| **M7** | **la rama de ratificación BORRA en vez de dejar forfait** | A2,A10,A11,A14 | **A2,A10,A11,A12,A14** | ✅ |
| M5 | la ventana de ratificación nunca se abre (vuelve el estado anterior) | A2,A10,A11,A14 | A2,A10,A12,A14 | ✅ |
| M1 | cae el guard de `canal='portal'` | A7 | A7 | ✅ |
| M2 | cae el guard de `inscripto_por` | A6 | A6 | ✅ |
| M3 | la rama de forfait acepta cualquier estado | A13 | A13 | ✅ |
| M4 | la ventana de inscripción queda siempre abierta | A3,A4,A5 | A3,A4,A5,A9 | ✅ |
| M6 | el fail-closed de NULL desaparece | A9 | A9 | ✅ |
| M8 | el forfait no limpia `numero_partidor` | A10 | A10 | ✅ |
| M9 | el forfait pisa `canal` e `inscripto_por` | A11 | A11 | ✅ |
| M10 | cae el guard de reunión publicada | A8 | A8 | ✅ |
| M11 | el forfait no deja marca de origen | A12 | A12 | ✅ |

**M7 es el que importa**: es exactamente la implementación que se descartó —forfait como
`DELETE`— y mata cinco asserts. Sin la decisión del §1.1 el probe se pondría rojo.

### 5.3 Limpieza verificada

```sql
DROP FUNCTION IF EXISTS public.rpc_baja_inscripcion_mut(uuid);
SELECT …;
-- [{"gemela_quedo":0,"real_existe":1,"real_intacta_forfait":true,
--   "real_intacta_gatera":true,"residuo_de_probes":0}]
```

Gemela dropeada, función real intacta y con las dos marcas del fix, **cero residuo** de los
probes en `inscripciones`.

---

## 6. Los docs corregidos

### `docs/MODELO_NUMERACION.md` — el sorteo va DESPUÉS

Decía `SORTEO (antes de ratificación)`. **Los datos de R8 lo desmienten**: 67 ratificados con
gatera, **29 forfait con cero**. Si el sorteo corriera antes de ratificar, los forfait también la
tendrían. Corregido, con la evidencia y una nota de qué decía antes.

Es el **tercer doc con texto viejo esta semana**, después de `ESTADO.md` y
`LIQUIDACIONES_MODELO.md` —y esos dos produjeron el bug de las bolsas—.

### `docs/ISSUES.md`

- **ISSUE-074** pasa a 🟠 **parcialmente resuelto**: las columnas ya tienen consumidor. Se anota
  que pasaron de decorativas a load-bearing y que hay que avisarle a la secretaría.
- **ISSUE-075** (nuevo, 🔴): `ratificacion.html` calcula el cierre **seis días tarde**, con el
  código y los números.
- **ISSUE-076** (nuevo, 🟡): un forfait del portal no le avisa a nadie, con el caso concreto de
  las 11:55 del lunes y tres opciones ordenadas por costo.

---

## 7. Lo que NO cambió

| | |
|---|---|
| Retirar lo que cargó la secretaría | sigue prohibido. Asserts A7, U6 |
| Retirar lo de otro | sigue prohibido. Asserts A6, U6 |
| El `DELETE` en la ventana de inscripción | idéntico. Assert A1 |
| `renumerarChapas` | sin tocar: en la ventana de ratificación todavía no hay mandiles |
| R8 con su cierre en 09:00 | sin tocar, como pediste |
| La notificación a la secretaría | **no se construyó**, como pediste. Queda en ISSUE-076 |
| `main` | intacto en `8dafe09` |

---

## 8. Diff de `portal.html`

```diff
diff --git a/portal.html b/portal.html
index 5a60f3e..acecc4a 100644
--- a/portal.html
+++ b/portal.html
@@ -682,7 +682,10 @@ function onBuscarSpc(q) {
 async function cargarInscripcionesCrudas() {
   const { data, error } = await sb.from('inscripciones')
     .select('id,estado,canal,inscripto_por,spc_id,carrera_id,created_at,spcs(nombre),'
+          // apertura/cierre_ratificacion: son la fuente de verdad de la ventana de
+          // forfait (ver modoRetiro). Sin ellas el front no puede decidir el modo.
           + 'carreras(numero_turno,nombre,estado,apertura_inscripcion,cierre_inscripcion,'
+          + 'apertura_ratificacion,cierre_ratificacion,'
           + 'reuniones(id,numero,numero_publico,fecha,estado,hipodromos(nombre)))')
     .order('created_at', { ascending: false });
   if (error) { console.error('[inscripciones]', error); toast(error.message, 'error'); throw error; }
@@ -926,13 +929,48 @@ async function anotar(spcId) {
 // Se puede retirar SÓLO una fila propia, cargada desde el portal, sin
 // ratificar y con la ventana todavía abierta. El RPC revalida las cuatro
 // condiciones: acá se decide únicamente si se muestra el botón.
-function puedeRetirar(i) {
-  return i.canal === 'portal'
-    && i.inscripto_por === miUsuarioId
-    && i.estado === 'inscripto'
-    && ventanaAbierta(i.carreras || {}, i.carreras?.reuniones?.estado);
+// ¿Está abierta la ventana de RATIFICACIÓN de ese turno?
+// La fuente de verdad son `carreras.apertura_ratificacion` / `cierre_ratificacion`
+// —no `reuniones.hora_cierre_ratificacion`—, porque son las únicas que codifican
+// la regla de Fede ("el lunes antes de las 12"): en R8 y R9 el cierre cae en
+// LUNES, seis días antes del domingo de la carrera. Lo que deriva
+// ratificacion.html (fecha de la reunión + esa hora) pone el cierre el DOMINGO
+// de la carrera, seis días tarde — ver ISSUE-075.
+// Fail-closed igual que ventanaAbierta(): sin las dos fechas, no está abierta.
+function ventanaRatificacion(c, reunionEstado) {
+  if (reunionEstado !== 'publicada') return false;
+  if (c.estado === 'anulada') return false;
+  if (!c.apertura_ratificacion || !c.cierre_ratificacion) return false;
+  const ahora = Date.now();
+  return ahora >= Date.parse(c.apertura_ratificacion) && ahora <= Date.parse(c.cierre_ratificacion);
+}
+
+// Devuelve null | 'inscripcion' | 'ratificacion'.
+// Las dos son la MISMA acción para el usuario, con consecuencias distintas:
+//   · 'inscripcion'  → el RPC BORRA la fila. No dejó huella en ningún documento.
+//   · 'ratificacion' → el RPC deja estado='forfait'. Queda impreso como BORRADO
+//     en el PDF de ratificación y tachado en el programa.
+// Por eso el rótulo del botón cambia: la consecuencia no es la misma.
+//
+// El front NO es el guard: rpc_baja_inscripcion revalida todo. Acá sólo se
+// decide qué mostrar, igual que antes.
+function modoRetiro(i) {
+  if (i.canal !== 'portal' || i.inscripto_por !== miUsuarioId) return null;
+  const c = i.carreras || {};
+  const rEstado = i.carreras?.reuniones?.estado;
+  // En la ventana de ratificación se admite 'ratificado' además de 'inscripto':
+  // esa ventana es justo cuando la secretaría ratifica, así que exigir
+  // 'inscripto' dejaría afuera el caso que pidió Fede.
+  if (ventanaRatificacion(c, rEstado) && ['inscripto', 'ratificado'].includes(i.estado)) {
+    return 'ratificacion';
+  }
+  if (ventanaAbierta(c, rEstado) && i.estado === 'inscripto') return 'inscripcion';
+  return null;
 }
 
+// Se conserva por compatibilidad con el resto del archivo y los probes.
+function puedeRetirar(i) { return modoRetiro(i) !== null; }
+
 async function loadMisInscripciones() {
   const cont = document.getElementById('inscripciones-container');
   cont.innerHTML = '<div class="loading-state"><div class="spinner"></div> Cargando…</div>';
@@ -969,9 +1007,14 @@ async function loadMisInscripciones() {
       <td>Turno ${esc(car?.numero_turno ?? '—')}</td>
       <td><span class="badge ${estadoBadge[i.estado] || ''}">${esc((i.estado || '—').replace('_', ' '))}</span></td>
       <td style="font-size:12px;color:var(--muted);">${esc(origen)}</td>
-      <td>${puedeRetirar(i)
-        ? `<button class="btn-sm btn-danger" onclick="retirar('${esc(i.id)}')">Retirar</button>`
-        : '<span style="color:var(--muted);font-size:12px;">—</span>'}</td>
+      <td>${(() => {
+        const modo = modoRetiro(i);
+        if (!modo) return '<span style="color:var(--muted);font-size:12px;">—</span>';
+        // "Dar forfait" es la palabra del ambiente y la consecuencia es distinta
+        // de retirar: el caballo queda listado como borrado en el programa.
+        const rotulo = modo === 'ratificacion' ? 'Dar forfait' : 'Retirar';
+        return `<button class="btn-sm btn-danger" onclick="retirar('${esc(i.id)}')">${rotulo}</button>`;
+      })()}</td>
     </tr>`;
   }).join('');
 
@@ -980,16 +1023,25 @@ async function loadMisInscripciones() {
     <tbody>${filas}</tbody>
   </table></div>
   <p style="font-size:12px;color:var(--muted);margin-top:12px;line-height:1.6;">
-    Sólo se pueden retirar las inscripciones que cargaste vos desde el portal y mientras
-    el turno siga abierto. Las que cargó la secretaría, o las que ya cerraron, se dan de
-    baja hablando con ${TEL}.
+    Sólo podés dar de baja las inscripciones que cargaste vos desde el portal.
+    Mientras la inscripción está abierta, <strong>Retirar</strong> borra la anotación.
+    Durante la ratificación, <strong>Dar forfait</strong> deja el caballo registrado
+    como borrado en el programa. Fuera de esas dos ventanas, y para lo que cargó la
+    secretaría, se da de baja hablando con ${TEL}.
   </p>`;
 }
 
 async function retirar(inscId) {
   const i = misInscripciones.find(x => x.id === inscId);
   const nombre = misCaballos.find(c => c.id === i?.spc_id)?.nombre || 'este caballo';
-  if (!confirm(`¿Retirar a ${nombre} del turno ${i?.carreras?.numero_turno ?? ''}?`)) return;
+  const turno = i?.carreras?.numero_turno ?? '';
+  const modo = modoRetiro(i);
+  // El forfait se IMPRIME: la confirmación tiene que decirlo antes, porque el
+  // caballo no desaparece — queda listado como borrado en el programa.
+  const pregunta = modo === 'ratificacion'
+    ? `¿Dar forfait a ${nombre} en el turno ${turno}?\n\nQueda registrado como BORRADO en el programa de la reunión.`
+    : `¿Retirar a ${nombre} del turno ${turno}?`;
+  if (!confirm(pregunta)) return;
 
   const { error } = await sb.rpc('rpc_baja_inscripcion', { p_inscripcion_id: inscId });
   if (error) {
@@ -997,7 +1049,7 @@ async function retirar(inscId) {
     toast(error.message.replace(/^.*?:\s*/, ''), 'error');
     return;
   }
-  toast('Inscripción retirada');
+  toast(modo === 'ratificacion' ? 'Forfait registrado' : 'Inscripción retirada');
   loadMisInscripciones();
 }
 
```

---

## 9. Verificación en `origin`

```
$ git ls-remote origin feat/forfait-portal
c4684fc73eb0943c52e8602af2ba4942f256b4ca	refs/heads/feat/forfait-portal

$ git ls-remote origin main            # intacto, sin mergear
8dafe0943cc2d9072dbed814d71c9a49286797e3	refs/heads/main

$ git diff --stat origin/main..origin/feat/forfait-portal
 docs/ISSUES.md                              | 116 ++++++-
 docs/MODELO_NUMERACION.md                   |  26 +-
 migrations/rpc_baja_inscripcion_forfait.sql | 165 ++++++++++
 portal.html                                 |  78 ++++-
 tests/README.md                             |   1 +
 tests/probe_forfait_portal.mjs              | 457 ++++++++++++++++++++++++++++
 6 files changed, 823 insertions(+), 20 deletions(-)
```

**`main` sigue en `8dafe09`. La rama espera tu OK.**

```bash
git fetch origin
git diff origin/main..origin/feat/forfait-portal
git switch feat/forfait-portal

set -a; . ./.env; set +a
node tests/probe_forfait_portal.mjs
node tests/probe_forfait_portal.mjs --mutantes    # los 3 de portal; los 11 de SQL se emiten
```

## 10. Preguntas abiertas

1. **¿Revierto el RPC hasta mergear la UI?** (§0). Hoy está vivo en producción y la UI no. Es
   compatible hacia atrás y el camino nuevo no es alcanzable desde la UI actual, pero si preferís
   simetría, se revierte en un minuto.
2. **Avisarle a la secretaría** que `apertura_ratificacion` / `cierre_ratificacion` del modal de
   turno **dejaron de ser decorativas**: si no las carga, el botón de forfait no aparece
   (fail-closed). Hoy sólo R8 y R9 las tienen; R10/R11/R12 todavía no tienen turnos.
3. **ISSUE-075 corre contra el reloj de R9**: el 14/09 el portal va a cerrar el forfait a las
   12:00 y `ratificacion.html` va a seguir dejando ratificar hasta el domingo 20. Son seis días de
   desfasaje sobre la reunión que viene.
4. **El rótulo "Dar forfait"** quedó como pediste. Si Fede prefiere "Retirar (forfait)", es una
   línea.

### 9.1 SHA final

```
$ git ls-remote origin reports
6f4fe9e3b77b82f39037b61bf2320f286c59699e	refs/heads/reports
$ git rev-parse HEAD
6f4fe9e3b77b82f39037b61bf2320f286c59699e
$ git ls-remote origin feat/forfait-portal
c4684fc73eb0943c52e8602af2ba4942f256b4ca	refs/heads/feat/forfait-portal
$ git ls-remote origin main
8dafe0943cc2d9072dbed814d71c9a49286797e3	refs/heads/main
```

Los tres refs verificados en `origin`.
