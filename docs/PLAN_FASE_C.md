# Plan Fase C — Estado de línea + retención anti-doping

> Fecha: 2026-06-08 · Rama: `feat/liquidaciones-fase-c` (desde `main`)
> **PLAN-FIRST: no se implementó código.** Este doc tiene el plan + el diff exacto. Freno para OK.
> Spec: `docs/LIQUIDACIONES_MODELO.md` §8 · `docs/LIQUIDACIONES_GAP_ANALYSIS.md` §C
> Riesgo: **bajo** — solo escribe `liquidacion_detalle` (+ lee `reuniones.fecha`). **NO toca `aplicar_resultado`.**

## Objetivo

En `generarLiquidaciones` (`liquidaciones.html`), setear por línea de `liquidacion_detalle`:
- `estado_linea='retenido'` + `fecha_liberacion = reuniones.fecha + liquidacion_config.dias_antidoping`, para `concepto_tipo='premio'` con `posicion ∈ {1,2}`.
- `estado_linea='impago'` para todo el resto (bono 6-8, fondo solidario, incentivos, premios 3°-5°, y sub-líneas de actuación).
- UI: badge de estado por línea en `verDetalle` + fecha de liberación en las retenidas.

Enums confirmados en DB: `estado_linea_liq = {impago, pagado, retenido}`; columnas `liquidacion_detalle.estado_linea` (default `impago`), `.fecha_liberacion` (date null), `.recibo_id`, `.pagado_at` ya existen (Fase 0). `liquidacion_config.dias_antidoping` default 30.

---

## Decisiones de diseño (los 5 puntos pedidos)

### 1) Dónde se setea cada `estado_linea` (archivo:línea)

Un **solo punto** de cómputo: el bucle de persistencia que arma `detalleRows`, `liquidaciones.html:813-834`. Ahí cada `item` ya tiene `conceptoTipo` y `posicion` (vienen de `addActor`), así que la regla se evalúa por línea sin tocar la lógica de reparto de arriba.

- **Línea principal** (`detalleRows.push` en `:820-823`): `estado_linea = (item.conceptoTipo==='premio' && (item.posicion===1||item.posicion===2)) ? 'retenido' : 'impago'`; `fecha_liberacion` = la fecha calculada si retenido, si no `null`.
- **Sub-líneas peón/capataz/sereno** (`:829-833`, `concepto_tipo='actuacion'`): **siempre `impago`** (no son `concepto_tipo='premio'`). Ver NOTA-A.
- **`fecha_liberacion`** se calcula **una vez** al inicio (tras cargar la reunión y `liqConfig`), no por fila.

### 2) Empate (dead-heat) en 1°/2° → todas las líneas retenido

Resuelto **gratis** por el modelo de datos. En `generarLiquidaciones` todas las líneas de un grupo de empate se persisten con `posicion = posNum` (= **puesto líder del grupo**, `liquidaciones.html:733/738/743`, ver GOTCHA #45). Entonces:
- Empate 1°-2° (grupo líder 1°): ambas líneas `posicion=1` → ambas `∈{1,2}` → **ambas retenido**. ✅
- Empate 2°-3° (grupo líder 2°): ambas líneas `posicion=2` → **ambas retenido** (correcto: en dead-heat de 2° los dos son "2° equal"). ✅
- Empate triple 1°-2°-3° (líder 1°): las 3 líneas `posicion=1` → **las 3 retenido** (los tres son "1° equal"). ✅
- Empate 5°-6° (líder 5°, fuera de retención): `posicion=5` → **impago**. ✅

No hace falta lógica especial de empate en Fase C: la regla `posicion ∈ {1,2}` sobre el `posicion` ya almacenado (que es el del líder) cubre todos los casos.

### 3) REGENERACIÓN — preservar `pagado` / líneas con recibo (el punto delicado)

**Hoy** (`liquidaciones.html:575-590`): `generarLiquidaciones` borra+recrea. Guarda solo a nivel **header**: aborta si alguna `liquidaciones.estado ∈ {aprobada,pagada}`; borra las de `estado='borrador'` (detalle + header) y recrea todo en `borrador`. **Ese guard NO protege el estado a nivel LÍNEA** que introducen Fase C/D (`estado_linea`, `recibo_id`).

**Problema:** con Fase D, una línea puede quedar `pagado` + `recibo_id` mientras su header sigue `borrador` (el recibo cruza reuniones, es independiente del header per-reunión). El delete+recreate actual la destruiría.

**Decisión:** agregar un **guard a nivel línea** ANTES de borrar/recrear. Si en la reunión existe **alguna** línea ya comprometida (`estado_linea='pagado'` **o** `recibo_id IS NOT NULL`), **abortar** la regeneración con mensaje claro. Es la opción conservadora: no se pisa estado financiero ya cobrado/recibido.

- `retenido` **sin** recibo = NO se protege: es premio en ventana de doping, todavía no cobrado → se puede recalcular y se re-marca `retenido` con la lógica nueva.
- `pagado` o cualquier línea con `recibo_id` = sagrada → aborta.

En Fase C aislada esto nunca dispara (no hay forma de marcar `pagado`/`recibo_id` hasta Fase D), pero se deja escrito **ahora** para que cuando exista D, regenerar no rompa nada. Se mantiene el guard de header existente tal cual (redundante pero inofensivo).

### 4) De dónde sale `fecha_reunion`

De **`reuniones.fecha`** (columna `DATE`, ver `docs/SCHEMA.md`). Hoy `generarLiquidaciones` **no** carga la reunión; se agrega un fetch `sb.from('reuniones').select('fecha').eq('id', rid).single()`.

Cálculo TZ-safe (evita el bug N-1 de timezone, ISSUE-007): parsear como UTC y sumar días en UTC.
```js
const d = new Date(reunionRow.fecha + 'T00:00:00Z');
d.setUTCDate(d.getUTCDate() + diasAntidoping);
fechaLiberacion = d.toISOString().slice(0,10);   // 'YYYY-MM-DD'
```
`diasAntidoping = parseInt(liqConfig.dias_antidoping) || 30`. Si `reuniones.fecha` es null → `fechaLiberacion=null` + `console.warn`; las líneas 1°/2° igual quedan `retenido` pero sin fecha (Fase D tratará `fecha_liberacion IS NULL` como "no liberada" = no cobrable hasta carga manual). Ver NOTA-B.

### 5) Verificación propuesta (MCP, post-regeneración)

Tras regenerar R5 (la reunión de test) correr:
```sql
-- (a) distribución de estados por concepto
SELECT concepto_tipo, posicion, estado_linea,
       count(*), min(fecha_liberacion) AS libera
FROM liquidacion_detalle
GROUP BY concepto_tipo, posicion, estado_linea
ORDER BY estado_linea, concepto_tipo, posicion;

-- (b) INVARIANTE retenido: solo premio 1°/2°, fecha futura, no null
SELECT 'retenido_mal' AS check, count(*) AS filas_invalidas
FROM liquidacion_detalle
WHERE estado_linea='retenido'
  AND NOT (concepto_tipo='premio' AND posicion IN (1,2)
           AND fecha_liberacion IS NOT NULL AND fecha_liberacion > CURRENT_DATE);

-- (c) INVARIANTE impago: ningún premio 1°/2° quedó impago
SELECT 'premio12_no_retenido' AS check, count(*) AS filas_invalidas
FROM liquidacion_detalle
WHERE concepto_tipo='premio' AND posicion IN (1,2) AND estado_linea<>'retenido';

-- (d) total de filas tras regenerar (referencia: hoy 45)
SELECT count(*) AS total, count(*) FILTER (WHERE estado_linea='retenido') AS retenidas
FROM liquidacion_detalle;
```
Criterio de éxito: (b)=0, (c)=0, (a) muestra `premio/1/retenido`, `premio/2/retenido` y todo lo demás `impago`, (d) sin pérdida de filas vs el conteo esperado de la regeneración.

> Aclaración: hoy las 45 filas están todas `impago` y **mayormente sin propietario** (GOTCHA #47, `propietario_id` 10/95). El premio 70% del propietario solo se genera si hay `propietario_id`; los premios de jockey/entrenador 1°/2° sí deberían aparecer `retenido` tras regenerar. La validación plena de volumen depende del backfill (Fase A).

---

## NOTAS / preguntas abiertas para tu OK

- **NOTA-A (decisión a confirmar):** las sub-líneas peón/capataz/sereno (`concepto_tipo='actuacion'`) salen del MISMO premio 1°/2° que se retiene, pero por la regla literal del spec (`concepto_tipo='premio'`) quedan **`impago`** → se podrían cobrar mientras el premio del dueño/entrenador/jockey está retenido. Si querés que **acompañen la retención** del premio del que derivan, cambio la condición a `(conceptoTipo==='premio' || conceptoTipo==='actuacion') && posicion∈{1,2}` y propago la `fecha_liberacion` a las subs. **Default del plan: seguir el spec literal (actuacion = impago).**
- **NOTA-B:** reunión sin `fecha` → retenido sin `fecha_liberacion`. Alternativa: dejar `impago` si no hay fecha. Default: `retenido` + warn (más seguro: no liberar por defecto).
- **Fuera de scope Fase C** (van en Fase D): excluir líneas `retenido` del recibo, marcar `pagado`, asignar `recibo_id`/`numero_recibo`. `imprimirRecibo` no se toca acá.

---

## DIFF PROPUESTO (exacto, no aplicado)

### Diff 1 — cargar reunión + calcular `fechaLiberacion`

Bloque de carga de datos, `liquidaciones.html:593-596` y guard de config `:612`.

```diff
   // Cargar datos
-  const [{ data: cars }, { data: comCfg }] = await Promise.all([
+  const [{ data: cars }, { data: comCfg }, { data: reunionRow }] = await Promise.all([
     sb.from('carreras').select('id,numero_turno,bolsa_total,distribucion_premios').eq('reunion_id', rid),
     sb.from('comision_config').select('*').eq('club_id', CLUB_ID).eq('activo', true),
+    sb.from('reuniones').select('fecha').eq('id', rid).single(),
   ]);
   const carIds = (cars||[]).map(c => c.id);
   if (!carIds.length) { toast('La reunión no tiene carreras', 'error'); return; }
```

```diff
   if (!liqConfig) { toast('No hay configuración de reparto para este club. Configurala en la pestaña Comisiones.', 'error'); return; }
+  // Fase C: retención anti-doping. Premios 1°/2° quedan retenidos N días desde la fecha de
+  // la reunión (liquidacion_config.dias_antidoping, default 30). Cálculo TZ-safe (UTC) para
+  // no caer en el corrimiento N-1 de timezone (ISSUE-007).
+  const diasAntidoping = parseInt(liqConfig.dias_antidoping) || 30;
+  let fechaLiberacion = null;
+  if (reunionRow?.fecha) {
+    const d = new Date(reunionRow.fecha + 'T00:00:00Z');
+    d.setUTCDate(d.getUTCDate() + diasAntidoping);
+    fechaLiberacion = d.toISOString().slice(0, 10);
+  } else {
+    console.warn('[generarLiquidaciones] reunión sin fecha: retenidos quedarán sin fecha_liberacion');
+  }
   const PCTS = {
```

### Diff 2 — guard de regeneración a nivel línea

Bloque de idempotencia, `liquidaciones.html:576-590`.

```diff
   // Verificar liquidaciones bloqueadas (aprobada/pagada)
   const { data: existentes } = await sb.from('liquidaciones').select('id,estado').eq('reunion_id', rid).eq('club_id', CLUB_ID);
   const bloqueadas = (existentes||[]).filter(l => ['aprobada','pagada'].includes(l.estado));
   if (bloqueadas.length) {
     toast(`No se puede regenerar: hay ${bloqueadas.length} liquidación(es) aprobada/pagada. Anulalas manualmente antes de regenerar.`, 'error');
     return;
   }
+
+  // Fase C/D: proteger líneas ya comprometidas (cobradas o con recibo asignado). El guard de
+  // header de arriba NO las cubre: con recibos cruzando reuniones una línea puede quedar
+  // pagado/recibo_id con el header todavía en borrador. retenido SIN recibo NO se protege
+  // (es premio en ventana de doping, se puede recalcular).
+  const { data: comprometidas } = await sb.from('liquidacion_detalle')
+    .select('id').eq('reunion_id', rid)
+    .or('estado_linea.eq.pagado,recibo_id.not.is.null')
+    .limit(1);
+  if (comprometidas?.length) {
+    toast('No se puede regenerar: hay líneas ya pagadas o con recibo asignado en esta reunión.', 'error');
+    return;
+  }

   if (!confirm('¿Generar liquidaciones automáticas? Se eliminarán los borradores previos y se recalculará todo desde los resultados oficiales.')) return;
```

### Diff 3 — setear `estado_linea` + `fecha_liberacion` al persistir

Bucle de persistencia, `liquidaciones.html:813-834`.

```diff
     for (const item of actorData.items) {
       const bruto = item.premio * item.pct;
       // descPct (comision_config) solo sobre premios; bono/incentivo/fondo van netos.
       const aplicaDesc = item.conceptoTipo === 'premio';
       const desc = aplicaDesc ? bruto * descPct / 100 : 0;
       totalBruto += bruto; totalDesc += desc;
+      // Fase C: retención anti-doping automática a premio de 1° y 2° (incluye empates: todas
+      // las líneas del grupo llevan posicion=posNum, ver GOTCHA #45). El resto queda impago.
+      const retenido = item.conceptoTipo === 'premio' && (item.posicion === 1 || item.posicion === 2);
       // monto_neto es columna generada en DB — no incluir en el insert
       detalleRows.push({ concepto: item.concepto, descripcion: item.descripcion,
         monto_bruto: bruto, porcentaje_desc: aplicaDesc ? (descPct||null) : null, monto_descuento: desc,
         concepto_tipo: item.conceptoTipo, posicion: item.posicion, inscripcion_id: item.inscripcion_id,
-        beneficiario_tipo: bTipo, beneficiario_id: actorId, reunion_id: rid });
+        beneficiario_tipo: bTipo, beneficiario_id: actorId, reunion_id: rid,
+        estado_linea: retenido ? 'retenido' : 'impago',
+        fecha_liberacion: retenido ? fechaLiberacion : null });
       // Peón/capataz/sereno como sub-líneas en la liquidación del entrenador (ADR-025)
       for (const sub of (item.subs||[])) {
         const sb2 = item.premio * sub.pct;
         const sd2 = sb2 * descPct / 100;
         totalBruto += sb2; totalDesc += sd2;
         detalleRows.push({ concepto: `${sub.rol} — ${sub.nombre}`,
           descripcion: `${item.concepto} — A redistribuir (${Math.round(sub.pct*100)}%)`,
           monto_bruto: sb2, porcentaje_desc: descPct||null, monto_descuento: sd2,
           concepto_tipo: 'actuacion', posicion: item.posicion, inscripcion_id: item.inscripcion_id,
-          beneficiario_tipo: 'profesional', beneficiario_id: actorId, reunion_id: rid });
+          beneficiario_tipo: 'profesional', beneficiario_id: actorId, reunion_id: rid,
+          estado_linea: 'impago', fecha_liberacion: null });   // actuacion: impago (ver NOTA-A)
       }
     }
```

### Diff 4 — UI: badge de estado por línea en `verDetalle`

`liquidaciones.html:521-535` (filas + thead + tfoot). Tabla pasa de 5 a 6 columnas.

```diff
   const rows = dets.map(d=>`<tr>
     <td>${d.concepto||''}</td>
     <td>${d.descripcion||''}</td>
     <td class="text-right">${fmt(d.monto_bruto)}</td>
     <td class="text-right text-danger">${d.porcentaje_desc?d.porcentaje_desc+'%':''} ${fmt(d.monto_descuento)}</td>
     <td class="text-right text-accent">${fmt(d.monto_neto)}</td>
+    <td>${estadoLineaBadge(d)}</td>
   </tr>`).join('');
   document.getElementById('det-body').innerHTML = `
     <table class="detalle-table">
-      <thead><tr><th>Concepto</th><th>Descripción</th><th class="text-right">Bruto</th><th class="text-right">Descuento</th><th class="text-right">Neto</th></tr></thead>
-      <tbody>${rows||'<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--muted)">Sin detalles</td></tr>'}</tbody>
+      <thead><tr><th>Concepto</th><th>Descripción</th><th class="text-right">Bruto</th><th class="text-right">Descuento</th><th class="text-right">Neto</th><th>Estado</th></tr></thead>
+      <tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--muted)">Sin detalles</td></tr>'}</tbody>
       <tfoot>
-        <tr><td colspan="2">TOTALES</td><td class="text-right">${fmt(liq.total_bruto)}</td><td class="text-right text-danger">-${fmt(liq.total_descuentos)}</td><td class="text-right text-success">${fmt(liq.total_neto)}</td></tr>
+        <tr><td colspan="2">TOTALES</td><td class="text-right">${fmt(liq.total_bruto)}</td><td class="text-right text-danger">-${fmt(liq.total_descuentos)}</td><td class="text-right text-success">${fmt(liq.total_neto)}</td><td></td></tr>
       </tfoot>
     </table>`;
```

### Diff 5 — helper de badge (nueva función, junto a `verDetalle`)

Insertar después de `verDetalle` (tras `liquidaciones.html:537`). Reusa las clases `badge-*` existentes (`:55-58`).

```diff
   document.getElementById('modal-detalle').classList.add('open');
 }
+
+// Fase C: badge de estado por línea de liquidación.
+function estadoLineaBadge(d) {
+  const e = d.estado_linea || 'impago';
+  if (e === 'retenido') {
+    const f = d.fecha_liberacion
+      ? ` <span style="font-size:10px;opacity:.75;">libera ${d.fecha_liberacion}</span>` : '';
+    return `<span class="badge badge-aprobada" title="Retenido por control anti-doping">🔒 retenido</span>${f}`;
+  }
+  if (e === 'pagado') return `<span class="badge badge-pagada">✅ pagado</span>`;
+  return `<span class="badge badge-borrador">impago</span>`;
+}
```

---

## Resumen de impacto

| Archivo | Cambio | Líneas aprox. |
|---|---|---|
| `liquidaciones.html` | cargar `reuniones.fecha` + calcular `fechaLiberacion` | Diff 1 (~12) |
| `liquidaciones.html` | guard regeneración nivel línea | Diff 2 (~10) |
| `liquidaciones.html` | setear `estado_linea`/`fecha_liberacion` en INSERT | Diff 3 (~6) |
| `liquidaciones.html` | UI badge en `verDetalle` (+1 columna) | Diff 4 (~6) |
| `liquidaciones.html` | helper `estadoLineaBadge` | Diff 5 (~10) |

Sin migraciones (schema Fase 0 ya tiene todo). Sin cambios a `aplicar_resultado` ni a `resultados.html`. Tablas tocadas: solo `liquidacion_detalle` (escritura) + `reuniones` (lectura).

**Frenado para tu OK antes de aplicar.** Confirmame especialmente NOTA-A (actuacion impago vs acompañar retención) y NOTA-B (reunión sin fecha).
