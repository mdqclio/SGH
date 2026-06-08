# Resultado Fase C — estado de línea + retención anti-doping

> Fecha: 2026-06-08 · Rama: `feat/liquidaciones-fase-c` (NO mergeado a main)
> Plan: `docs/PLAN_FASE_C.md` · Decisiones del dueño: NOTA-A = subs acompañan retención · NOTA-B = retenido + warn
> Riesgo: bajo — solo escribe `liquidacion_detalle`, no toca `aplicar_resultado`.

## Diff final aplicado (`liquidaciones.html`, +54/-7)

```diff
@@ verDetalle: columna Estado por línea @@
     <td class="text-right text-accent">${fmt(d.monto_neto)}</td>
+    <td>${estadoLineaBadge(d)}</td>
   </tr>`).join('');
   document.getElementById('det-body').innerHTML = `
     <table class="detalle-table">
-      <thead><tr><th>Concepto</th><th>Descripción</th><th class="text-right">Bruto</th><th class="text-right">Descuento</th><th class="text-right">Neto</th></tr></thead>
-      <tbody>${rows||'<tr><td colspan="5" ...>Sin detalles</td></tr>'}</tbody>
+      <thead><tr><th>Concepto</th><th>Descripción</th><th class="text-right">Bruto</th><th class="text-right">Descuento</th><th class="text-right">Neto</th><th>Estado</th></tr></thead>
+      <tbody>${rows||'<tr><td colspan="6" ...>Sin detalles</td></tr>'}</tbody>
       <tfoot>
-        <tr><td colspan="2">TOTALES</td>...<td class="text-right text-success">${fmt(liq.total_neto)}</td></tr>
+        <tr><td colspan="2">TOTALES</td>...<td class="text-right text-success">${fmt(liq.total_neto)}</td><td></td></tr>
       </tfoot>
     </table>`;
   document.getElementById('modal-detalle').classList.add('open');
 }

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

@@ generarLiquidaciones: guard de regeneración nivel línea @@
   }

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

   if (!confirm('¿Generar liquidaciones automáticas? ...')) return;

@@ generarLiquidaciones: cargar reunión @@
-  const [{ data: cars }, { data: comCfg }] = await Promise.all([
+  const [{ data: cars }, { data: comCfg }, { data: reunionRow }] = await Promise.all([
     sb.from('carreras').select('id,numero_turno,bolsa_total,distribucion_premios').eq('reunion_id', rid),
     sb.from('comision_config').select('*').eq('club_id', CLUB_ID).eq('activo', true),
+    sb.from('reuniones').select('fecha').eq('id', rid).single(),
   ]);

@@ generarLiquidaciones: calcular fechaLiberacion @@
   if (!liqConfig) { toast('No hay configuración de reparto ...', 'error'); return; }
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
   const PCTS = { ... };

@@ generarLiquidaciones: setear estado_linea al persistir (NOTA-A: subs acompañan) @@
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
-      // Peón/capataz/sereno como sub-líneas en la liquidación del entrenador (ADR-025)
+        beneficiario_tipo: bTipo, beneficiario_id: actorId, reunion_id: rid,
+        estado_linea: retenido ? 'retenido' : 'impago',
+        fecha_liberacion: retenido ? fechaLiberacion : null });
+      // Peón/capataz/sereno como sub-líneas en la liquidación del entrenador (ADR-025).
+      // NOTA-A: las subs ACOMPAÑAN la retención del premio del que derivan (heredan `retenido`).
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
+          estado_linea: retenido ? 'retenido' : 'impago',
+          fecha_liberacion: retenido ? fechaLiberacion : null });
       }
```

## ✅ Verificación REAL-CODE (NO UPDATE) — `tests/probe_fase_c.mjs`

**Corrida del código REAL de `generarLiquidaciones()`**, no una réplica vía UPDATE. El probe
extrae el cuerpo de la función de `liquidaciones.html` (working tree, esta rama) y lo ejecuta
vía `AsyncFunction` con un cliente Supabase real + stubs de DOM (mismo método que
`probe_fase2_liquidaciones.mjs`). Browser descartado: `npx playwright install chromium` →
`"Playwright does not support chromium on ubuntu26.04-x64"`. La clave server-side se lee de
`process.env.SUPABASE_SECRET_KEY` (vía `.env`, gitignoreado; nunca hardcodeada).

- **Reunión:** `b02ca761-6f44-4720-86aa-a3c3099019ea` (Dolores), fecha **2026-06-20**, `dias_antidoping` **30** → `fecha_liberacion` esperada **2026-07-20**.
- **Por qué dispara NOTA-A:** carrera turno 1 con resultado **oficial**; el 1° (Jose Perez) y el 2° (Claudio Borgui) tienen `propietario_id` + peón/capataz/sereno cargados → se generan premio(1°/2°) **y** sus sub-líneas `actuacion`.
- **Snapshot → run real → assert → restore:** snapshot 12 liquidaciones / 29 detalle; restaurado idéntico al final (verificado por MCP: 12 / 29 / 0 no-impago / 1 oficial intacto). No se tocaron resultados ni roles.

### Distribución generada por el código real (concepto_tipo / posición / estado_linea)

| concepto_tipo | posición | estado_linea | filas | libera |
|---|---|---|---|---|
| premio | 1 | **retenido** | 3 | 2026-07-20 |
| premio | 2 | **retenido** | 3 | 2026-07-20 |
| premio | 3 | impago | 2 | — |
| premio | 4 | impago | 3 | — |
| premio | 5 | impago | 3 | — |
| **actuacion** | **1** | **retenido** | 3 | 2026-07-20 |
| **actuacion** | **2** | **retenido** | 3 | 2026-07-20 |
| actuacion | 3 | impago | 3 | — |
| actuacion | 4 | impago | 3 | — |
| actuacion | 5 | impago | 3 | — |
| bono | 6 | impago | 1 | — |
| fondo_solidario | 1-5 | impago | 5 | — |

**NOTA-A gatillada por datos:** las 6 sub-líneas `actuacion` de 1°/2° quedaron **retenido + 2026-07-20**, igual que el premio del que derivan.

### Checks (11/11 ✅)

```
✅ 1  premio 1°/2° generados (n=6)
✅ 1a premio 1°/2° → estado_linea=retenido (6/6)
✅ 1b premio 1°/2° → fecha_liberacion = fecha_reunion + dias_antidoping (2026-07-20)
✅ 2  sub-líneas actuacion 1°/2° generadas (n=6) — NOTA-A gatillada
✅ 2a actuacion 1°/2° → retenido (6/6)
✅ 2b actuacion 1°/2° → misma fecha_liberacion que el premio (2026-07-20)
✅ 3  resto → impago + fecha null (0/23 malas)
✅ (b) invariante retenido — inválidas = 0
✅ (c) premio/actuacion 1°/2° impago = 0
✅ (fecha) 2026-06-20 + 30d = 2026-07-20 (sin corrimiento N-1)
✅ R1 restore liquidaciones (12 == 12)
```

**Invariantes (b) y (c) = 0 en corrida REAL.** `fecha_liberacion` exacta `2026-07-20` (sin N-1).

---

## Verificación previa (R5, réplica vía UPDATE — referencia)

> Histórica. R5 (`c90b6186…`) no tenía peón/capataz/sereno en 1°/2°, así que NO gatillaba
> NOTA-A; se replicó la regla vía `UPDATE` (no corría el código real). Superada por la
> corrida real-code de arriba. Se deja como referencia.

R5: fecha `2026-05-17` · `dias_antidoping` 30 → `fecha_liberacion` = **2026-06-16**.

### (a) distribución por concepto / posición / estado

| concepto_tipo | posicion | estado_linea | filas | libera |
|---|---|---|---|---|
| premio | 1 | retenido | 1 | 2026-06-16 |
| premio | 2 | retenido | 2 | 2026-06-16 |
| premio | 3 | impago | 2 | — |
| premio | 4 | impago | 2 | — |
| premio | 5 | impago | 3 | — |
| actuacion | 3 | impago | 3 | — |
| actuacion | 5 | impago | 3 | — |

(En R5 los 1°/2° no tenían peón/capataz/sereno cargados → no se generaron subs `actuacion`
para esos puestos; la herencia NOTA-A está en el código, sin datos que la gatillen acá.)

### (b) invariante retenido — solo premio/actuacion 1°/2°, fecha futura no-null

| check | filas_invalidas |
|---|---|
| b_retenido_invalido | **0** |

### (c) ningún premio NI actuacion de 1°/2° quedó impago

| check | filas_invalidas |
|---|---|
| c_premio_actuacion_12_impago | **0** |

### (d) totales

| metric | valor |
|---|---|
| d_total | 16 |
| d_retenidas | 3 |

## Conclusión

**Invariantes (b) y (c) en 0: SÍ — en corrida REAL-CODE** (`tests/probe_fase_c.mjs`, reunión `b02ca761`). El código real de `generarLiquidaciones` escribió: premio 1°/2° **y** sus sub-líneas `actuacion` → `retenido` + `fecha_liberacion=2026-07-20` (= fecha_reunion + 30, sin N-1); resto `impago`. NOTA-A confirmada con datos reales. 11/11 checks ✅, restore íntegro. Rama `feat/liquidaciones-fase-c`, sin mergear a main.
