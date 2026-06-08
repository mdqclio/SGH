# Incentivos Bloque C — montos confirmados + corrección de granularidad

> Fecha: 2026-06-08 · Rama: `feat/incentivos-montas` (desde main) · **NO mergeado a main.**
> Toca `generarLiquidaciones` (flujo de plata). Confirmado por Fede; pendiente revisión del diff (vos) + OK de Leonardo antes de merge.

## Reglas de dominio (Fede, no negociables)

- **Jockey:** 50.000 fijo **por reunión**, por jockey que corrió ≥1 (`no_largo=false`, ratificado). **Una** línea por jockey por reunión, aunque corra varias.
- **Entrenador:** 10.000 **por caballo** que corre. Una línea por caballo corrido.
- **Bonos** (ganador 250k fundido en 1° + 6-8 100% propietario): **SIN CAMBIO.**
- **Retención anti-doping 30d** (Fase C): **SIN CAMBIO.**

## Tarea A — config (DML aplicada)

```
UPDATE liquidacion_config SET incentivo_jockey_monto=50000, incentivo_entrenador_monto=10000
WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c';
```
La fila existe. Antes → después:

| campo | antes | después |
|---|---|---|
| incentivo_jockey_monto | 0.00 | **50000.00** |
| incentivo_entrenador_monto | 0.00 | **10000.00** |

## Tarea B — comportamiento ACTUAL encontrado + cambio

### Cómo generaba HOY (antes de este cambio)

El bloque de incentivos (`liquidaciones.html`, post-Fase-C ≈:810-840) metía jockeys **y**
entrenadores en **`Set`** (`jockeysSet`, `entrenadoresSet`) → ambos quedaban **deduplicados por
persona**: una sola línea por jockey y **una sola línea por entrenador por reunión**, ambas con
`inscripcion_id=null`. Es decir:

- **Jockey: ya era correcto** (1 línea por jockey, por reunión). ✅ No requería cambio funcional.
- **Entrenador: INCORRECTO** para la regla nueva — daba 1 línea por reunión en vez de 1 por caballo corrido.

No generaba "por monta": ya era por-profesional-deduplicado. Guard `monto 0/null → no genera` presente.

### Cambio aplicado (en la rama, NO en main)

- **Jockey:** sin cambio funcional (sigue `jockeysSet` → 1 línea, `inscripcion_id=null`). Se le agrega el guard `incJockey>0` al acumular.
- **Entrenador:** se elimina `entrenadoresSet`; ahora se hace `addActor(entrenador, 'incentivo_entrenador', {inscripcion_id: insc.id})` **dentro del loop de cada caballo corrido** → **una línea por inscripción corrida** (sin dedup). `beneficiario_tipo='profesional'`, `reunion_id` seteado, neto.
- Guard `monto 0/null → no genera` mantenido para ambos.

### Diff (`liquidaciones.html`)

```diff
-  // INCENTIVOS (Bloque C): monto fijo por reunión desde liquidacion_config.
-  // Una línea por jockey/entrenador que LARGÓ al menos una vez (no_largo=false) estando
-  // ratificado. Independiente del premio: el profesional entra al actorMap por haber
-  // largado, no por cobrar. Neto (sin descuentos). Si el monto es 0/null → no se genera.
+  // INCENTIVOS (Bloque C): montos desde liquidacion_config (confirmado Fede 2026-06-08).
+  // GRANULARIDAD DISTINTA por rol:
+  //  - Jockey: UNA línea por jockey que corrió al menos una (no_largo=false, ratificado),
+  //    aunque corra varias. Incentivo POR REUNIÓN → dedup por jockey, inscripcion_id=null.
+  //  - Entrenador: UNA línea POR CABALLO corrido (no_largo=false, ratificado). Incentivo
+  //    POR MONTA del caballo → sin dedup, inscripcion_id=la inscripción.
+  // Neto (sin descuentos). Guard: monto 0/null → no se genera.
   if (incJockey > 0 || incEntr > 0) {
     const { data: largaron } = await sb.from('resultado_posiciones')
       .select('inscripcion_id').in('resultado_id', resIds).eq('no_largo', false);
-    const jockeysSet = new Set(), entrenadoresSet = new Set();
+    const jockeysSet = new Set();   // jockey: una sola línea por reunión
     for (const lp of (largaron||[])) {
       const insc = (inscs||[]).find(i => i.id === lp.inscripcion_id);
       if (!insc || insc.estado !== 'ratificado') continue;   // blindaje: solo ratificados
-      if (insc.jockey_titular_id) jockeysSet.add(insc.jockey_titular_id);
-      if (insc.entrenador_id)     entrenadoresSet.add(insc.entrenador_id);
+      if (incJockey > 0 && insc.jockey_titular_id) jockeysSet.add(insc.jockey_titular_id);
+      // Entrenador: una línea por CADA caballo corrido (no se deduplica).
+      if (incEntr > 0 && insc.entrenador_id) {
+        addActor(insc.entrenador_id, 'entrenador', {
+          premio: incEntr, pct: 1, subs: [], conceptoTipo: 'incentivo_entrenador',
+          concepto: 'Incentivo entrenador',
+          descripcion: `Incentivo entrenador por caballo corrido: ${fmt(incEntr)}`,
+          posicion: null, inscripcion_id: insc.id,
+        });
+      }
     }
     if (incJockey > 0) for (const jid of jockeysSet) {
       addActor(jid, 'jockey', {
         premio: incJockey, pct: 1, subs: [], conceptoTipo: 'incentivo_jockey',
         concepto: 'Incentivo jockey',
         descripcion: `Incentivo jockey por actuación en la reunión: ${fmt(incJockey)}`,
         posicion: null, inscripcion_id: null,
       });
     }
-    if (incEntr > 0) for (const eid of entrenadoresSet) {
-      addActor(eid, 'entrenador', {
-        premio: incEntr, pct: 1, subs: [], conceptoTipo: 'incentivo_entrenador',
-        concepto: 'Incentivo entrenador',
-        descripcion: `Incentivo entrenador por actuación en la reunión: ${fmt(incEntr)}`,
-        posicion: null, inscripcion_id: null,
-      });
-    }
   }
```

Bonos y retención **no se tocaron** (el diff es solo el bloque de incentivos).

## Tarea C — probe (real-code, R5)

`tests/probe_incentivos_montas.mjs`: corre el cuerpo real de `generarLiquidaciones` (AsyncFunction +
Supabase real, sin browser). Setup sobre R5: asigna **un** jockey y **un** entrenador a las 22
inscripciones ubicadas (ratificadas, `no_largo=false`) → jockey con 22 montas, entrenador con 22
caballos. snapshot→mutate→run→assert→restore. Montos validados contra `liquidacion_config` (no hardcode).

### Output

```
[config] incentivo_jockey=50000 incentivo_entrenador=10000
[snapshot] ubicados no_largo=22 ratificados=22
[mutate] resultados→oficial=3 · roles asignados a 22 inscripciones
  [toast] 4 liquidación(es) generada(s) en borrador

✅ a1 jockey con N montas → exactamente 1 línea incentivo_jockey  (lineas=1)
✅ a2 incentivo_jockey = monto de config + neto + inscripcion_id null  (monto=50000 insc=null)
✅ a3 ningún otro jockey cobró incentivo (todos los corridos = JOCK_ID)  (total_incentivo_jockey=1)
✅ b1 entrenador con M caballos → M líneas incentivo_entrenador  (lineas=22 esperado=22)
✅ b2 cada incentivo_entrenador = monto config + neto + beneficiario profesional  (montos=10000)
✅ b3 cada línea entrenador apunta a una inscripción corrida distinta (sin dedup)  (distintas=22/22 nulls=0)
✅ b4 ningún otro entrenador cobró (todos los corridos = ENTR_ID)  (total=22)
✅ c1 quien no corrió → 0 líneas de incentivo  (lineas=0)
✅ c2 reunion_id seteado en todas las líneas de incentivo
✅ R1 restore liquidaciones (count == original)  (final=8 original=8)
✅ R2 restore roles de inscripciones

✅ TODO OK — 11 checks
```

(a) jockey 22 montas → **1** línea de 50k. (b) entrenador 22 caballos → **22** líneas de 10k, una
por inscripción distinta. (c) no-corrió → 0. Restore íntegro.

## Tarea D — docs

- `docs/LIQUIDACIONES_MODELO.md` §4 corregido (entrenador 10k por caballo; jockey 50k por reunión; montos en `liquidacion_config`).
- `docs/ISSUES.md` ISSUE-001: nota de incentivos confirmados (50k/10k + granularidad).

## Estado

Rama `feat/incentivos-montas`. **NO mergeado a main.** Con tu OK (diff) + el de Leonardo → merge.
Config DML (50k/10k) ya aplicada en prod (es dato, no código).
