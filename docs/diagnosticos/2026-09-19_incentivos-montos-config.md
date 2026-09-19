# Incentivos jockey / entrenador — dónde vive el monto, qué dice hoy, cómo cambiarlo y qué pasa con lo ya liquidado

- **Fecha:** 2026-09-19
- **SHA de `main` relevado:** `ef78472` (`ef7847218bfb47f06f72d9df814d1aba02a1a14c`)
- **Modo:** SOLO LECTURA. Ninguna escritura en DB ni en código. Todo el relevamiento de código se hizo parado en `main`; el informe se escribe en `reports`.
- **Guards:** `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref `unlhcuanfrtpatoipwve`.
- **Prod = main:** `liquidaciones-engine.js` y `liquidaciones.html` servidos por `sigh.com.ar` tienen el mismo md5 que `main` (ver §7).

---

## 0. Veredicto (para Valeria / Fede / Yesi)

| Pregunta | Respuesta corta |
|---|---|
| ¿Dónde vive el monto? | En la **base**, tabla `liquidacion_config`, columnas `incentivo_jockey_monto` y `incentivo_entrenador_monto`. **Una fila por club** (`club_id` + `activo=true`). No está hardcodeado en el JS. |
| ¿Cuánto dice hoy? | **Jockey $50.000 · Entrenador $10.000** (fila de Dolores, `id 346c30f9…`). |
| ¿Desde cuándo? | **2026-06-08 03:15 UTC** (= domingo 07/06 a las 00:15 hora argentina). Fue un `UPDATE` directo por SQL (`usuario_id` NULL en `auditoria`), documentado como "montos confirmados por Fede 2026-06-08" en `docs/RESULTADO_INCENTIVOS_MONTAS.md`. Antes de eso la fila (creada 2026-06-02 con el seed de Fase 0) tenía **0 / 0**. **Nunca se volvió a tocar**: la auditoría tiene una sola fila para `liquidacion_config`. |
| ¿Está mal hoy? | Según Valeria sí (debería ser 60.000). El sistema no tiene forma de saber cuál es el valor "correcto": el 50.000 es el que se cargó el 08/06 con la confirmación de Fede de ese momento. **Pregunta abierta** (§8): ¿siempre fue 60.000 (y R6/R8 se pagaron mal) o subió después de R8? |
| ¿Configurable? | **Sí, ya hoy**: `liquidaciones.html` → pestaña **⚙️ Config. Comisiones** → botón **✏️ Editar reparto** → campos "Incentivo jockey ($)" / "Incentivo entrenador ($)" → Guardar. Lo puede hacer cualquier usuario del club (RLS por `club_id`), o sea **Yesi ya puede**. No requiere código. |
| ¿Por club, por reunión o global? | **Por club** (una sola fila activa por club). **No** es por reunión y **no** es global. La tabla tiene `vigente_desde`/`vigente_hasta` pero **nadie las lee**: el motor y la pantalla eligen la fila por `club_id` + `activo=true`, sin mirar fechas. Cambiar el valor = pisar la fila (`UPDATE`), sin historial más allá de la auditoría. |
| ¿Cambiar el valor altera lo ya pagado? | **No, por sí solo no.** Cada línea de `liquidacion_detalle` guarda su `monto_bruto` como snapshot al momento de generarse. Cambiar la config no reescribe nada. **Pero**: un **"Recalcular reunión"** (o una oficialización / des-oficialización de carrera, que dispara lo mismo) sobre una reunión vieja **borra y regenera las líneas NO pagadas** con el valor vigente en ese momento. Las líneas **pagadas** (`estado_linea='pagado'` o con `recibo_id`) se preservan por clave. |
| ¿R6 y R8 están a salvo? | **Sí.** Las **133 líneas de incentivo** de R6 (21 jockey + 51 entrenador) y las **61** de R8 (19 jockey + 42 entrenador) están **todas en `pagado`** a $50.000 / $10.000. Un recalc posterior al cambio las preserva. Lo único impago en R6/R8 son las líneas de `fondo_solidario` del club (35 y 40), que no dependen del incentivo. |
| ¿Y R9 (domingo 20/09)? | R9 tiene **0 liquidaciones y 0 carreras oficiales**. El motor lee la config **en cada oficialización**. Si el valor se cambia a 60.000 **antes** de oficializar la primera carrera del domingo, R9 sale a 60.000. Si se cambia **después** de alguna oficialización, la siguiente oficialización recalcula toda la reunión y, como en R9 nada estará pagado todavía, **todas** las líneas de incentivo quedan a 60.000 igual. Riesgo real: pagar un incentivo de R9 (emitir recibo) **antes** de corregir el valor → esa línea queda pagada a 50.000 y el recalc no la toca. |

**Qué haría falta para que Yesi lo cambie por reunión:** hoy no hace falta nada de código para el caso "cambia el valor y desde ahora vale el nuevo" (§5.1). Para el caso "el valor de una reunión pasada tiene que quedar reproducible aunque hoy valga otra cosa" hace falta versionado por fecha (§5.2) — no es urgente para el domingo.

---

## 1. Dónde vive el monto (código)

### 1.1 Motor único: `liquidaciones-engine.js` (`main` @ `ef78472`)

Carga de la config (líneas 68–75): la pasa la página o la carga el motor, **por club y `activo=true`**, sin fecha:

```javascript
    // Config de reparto (la pasa la página; si no, la carga el motor).
    let liqConfig = opts.liqConfig;
    if (!liqConfig) {
      const { data } = await sb.from('liquidacion_config')
        .select('*').eq('club_id', clubId).eq('activo', true).maybeSingle();
      liqConfig = data;
    }
    if (!liqConfig) return { created: 0, headers: 0, preserved: 0, error: 'sin liquidacion_config' };
```

Lectura de los montos (líneas 116–117):

```javascript
    const incJockey = parseFloat(liqConfig.incentivo_jockey_monto)     || 0;
    const incEntr   = parseFloat(liqConfig.incentivo_entrenador_monto) || 0;
```

Generación de las líneas (líneas 226–254): jockey **una línea por reunión** por jockey que largó ratificado; entrenador **una línea por caballo** que largó ratificado. Monto = el de la config en el momento de correr el motor.

```javascript
    // INCENTIVOS (Bloque C) — idéntico a generarLiquidaciones (jockey per-reunión dedup,
    // entrenador per-caballo). Las líneas de incentivo no llevan carrera_id (per-reunión).
    if (incJockey > 0 || incEntr > 0) {
      const { data: largaron } = resIds.length
        ? await sb.from('resultado_posiciones').select('inscripcion_id')
            .in('resultado_id', resIds).eq('no_largo', false)
        : { data: [] };
      const jockeysSet = new Set();
      for (const lp of (largaron || [])) {
        const insc = (inscs || []).find(i => i.id === lp.inscripcion_id);
        if (!insc || insc.estado !== 'ratificado') continue;
        if (incJockey > 0 && insc.jockey_titular_id) jockeysSet.add(insc.jockey_titular_id);
        if (incEntr > 0 && insc.entrenador_id) {
          addActor(insc.entrenador_id, 'entrenador', {
            premio: incEntr, pct: 1, subs: [], conceptoTipo: 'incentivo_entrenador',
            concepto: 'Incentivo entrenador',
            descripcion: `Incentivo entrenador por caballo corrido: ${fmt(incEntr)}`,
            posicion: null, inscripcion_id: insc.id, carrera_id: null,
          });
        }
      }
      if (incJockey > 0) for (const jid of jockeysSet) {
        addActor(jid, 'jockey', {
          premio: incJockey, pct: 1, subs: [], conceptoTipo: 'incentivo_jockey',
          concepto: 'Incentivo jockey',
          descripcion: `Incentivo jockey por actuación en la reunión: ${fmt(incJockey)}`,
          posicion: null, inscripcion_id: null, carrera_id: null,
        });
      }
    }
```

Nota: la `descripcion` de la línea lleva el monto formateado como texto ("…: $50.000,00"). Es cosmético, pero si mañana se cambia el valor, las líneas viejas seguirán diciendo 50.000 en su descripción **y en su `monto_bruto`** — coherente, es lo que se pagó.

### 1.2 Quién dispara el motor (3 lugares)

| Disparador | Archivo:línea | Config que usa |
|---|---|---|
| Botón **Recalcular reunión** | `liquidaciones.html:2004` `generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: rid, liqConfig, fmt })` | la `liqConfig` cargada al abrir la página (`init()`, línea 639) |
| **Oficializar carrera** | `resultados.html:1670` `generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: rid })` | la carga el motor en ese momento (fresca) |
| **Des-oficializar carrera** | `resultados.html:1699` ídem | ídem |

Detalle a tener en cuenta el domingo: `liquidaciones.html` carga la config **una vez al abrir**. Si Yesi cambia el valor en una pestaña y aprieta "Recalcular reunión" en otra pestaña que ya estaba abierta, el recalc usa el valor viejo. Con F5 se resuelve. `resultados.html` no tiene ese problema (no pasa `liqConfig`, el motor la lee fresca).

### 1.3 Pantalla de edición: `liquidaciones.html`

- Pestaña `⚙️ Config. Comisiones` (línea 206) → sección "Reparto de premios" (líneas 308–313) → botón `✏️ Editar reparto` (línea 311). **Sin gate de rol** en la UI: lo ve cualquier usuario logueado del club.
- Modal `#modal-reparto` (líneas 339–363), inputs `#rp-inc-jockey` / `#rp-inc-entrenador` (líneas 355–356).
- `openRepartoModal()` (589–602) prellena desde `liqConfig`.
- `saveReparto()` (604–631): valida que los 7 porcentajes sumen 100 y hace **`UPDATE` in place** sobre `liqConfig.id` (o `INSERT` si no hay fila). No versiona:

```javascript
  const { data, error } = liqConfig?.id
    ? await sb.from('liquidacion_config').update(payload).eq('id', liqConfig.id).select().single()
    : await sb.from('liquidacion_config').insert(payload).select().single();
```

- Permiso: RLS `liquidacion_config_rls` FOR ALL TO authenticated USING/WITH CHECK (`fn_is_super_admin() OR club_id = fn_get_user_club_id()`) — `docs/SCHEMA.md:192`. Yesi (`secretario_carreras` de Dolores) pasa.
- Auditoría: trigger `trg_audit_liquidacion_config` → `fn_auditoria_log` (ídem). Cada cambio desde la UI va a quedar con `usuario_id` y before/after en `auditoria.html`.

### 1.4 Schema (`docs/SCHEMA.md:173–176`, `migrations/liquidaciones_cd_fase0.sql`)

```
liquidacion_config: id UUID PK, club_id FK clubs NOT NULL,
  pct_propietario/pct_entrenador/pct_jockey/pct_peon/pct_capataz/pct_sereno/pct_fondo_solidario NUMERIC(6,3) NOT NULL,
  incentivo_jockey_monto NUMERIC(15,2) NOT NULL DEFAULT 0,
  incentivo_entrenador_monto NUMERIC(15,2) NOT NULL DEFAULT 0,
  dias_antidoping INTEGER NOT NULL DEFAULT 30, retencion_dgi_pct NUMERIC(6,3) NULL,
  vigente_desde DATE NOT NULL DEFAULT CURRENT_DATE, vigente_hasta DATE,
  activo BOOLEAN NOT NULL DEFAULT true, created_at
CHECK chk_reparto_suma_100
```

`vigente_desde` / `vigente_hasta` existen desde Fase 0 pero **ningún archivo las lee** para `liquidacion_config`:

```
$ grep -n "vigente_desde\|vigente_hasta" *.html *.js migrations/*.sql
liquidaciones.html:2045:  document.getElementById('cf-desde').value = rec?.vigente_desde||'';
liquidaciones.html:2046:  document.getElementById('cf-hasta').value = rec?.vigente_hasta||'';
liquidaciones.html:2065:    vigente_desde: document.getElementById('cf-desde').value || null,
liquidaciones.html:2066:    vigente_hasta: document.getElementById('cf-hasta').value || null,
migrations/liquidaciones_cd_fase0.sql:48:  vigente_desde               DATE NOT NULL DEFAULT CURRENT_DATE,
migrations/liquidaciones_cd_fase0.sql:49:  vigente_hasta               DATE,
```

Las 4 líneas de `liquidaciones.html` son del modal de **`comision_config`** (prefijo `cf-`), otra tabla. Para `liquidacion_config` las fechas son decorativas.

### 1.5 "50k" hardcodeado en algún lado?

No en lógica. Aparece sólo como texto en comentarios/docs (`CLAUDE.md` árbol de tests, `migrations/montas_r6_correccion.sql:208`, `docs/ISSUES.md:35`, `CHANGELOG.md:1431`, `docs/LIQUIDACIONES_MODELO.md`). El probe `tests/probe_incentivos_montas.mjs:68-71` lee los montos de la config, no los asume:

```javascript
    incJockeyCfg = parseFloat(liqConfig.incentivo_jockey_monto) || 0;
    incEntrCfg   = parseFloat(liqConfig.incentivo_entrenador_monto) || 0;
    console.log(`[config] incentivo_jockey=${incJockeyCfg} incentivo_entrenador=${incEntrCfg}`);
    if (incJockeyCfg <= 0 || incEntrCfg <= 0) throw new Error('liquidacion_config sin montos de incentivo (Tarea A no aplicada).');
```

Salida del grep completo (código, sin `docs/`):

```
$ grep -rn -i "incentivo" --include=*.html --include=*.js --include=*.sql --include=*.mjs . | grep -v node_modules | grep -v "docs/"
liquidaciones-engine.js:15:     - Incentivo jockey: per-reunión, una sola línea por jockey que corrió ≥1 (dedup).
liquidaciones-engine.js:21:   anti-doping 1°/2°, incentivos). NO se cambió ninguna regla de plata: solo la
liquidaciones-engine.js:99:    // ── Fechas / pcts / incentivos (idéntico a generarLiquidaciones) ─────
liquidaciones-engine.js:116:    const incJockey = parseFloat(liqConfig.incentivo_jockey_monto)     || 0;
liquidaciones-engine.js:117:    const incEntr   = parseFloat(liqConfig.incentivo_entrenador_monto) || 0;
liquidaciones-engine.js:226:    // INCENTIVOS (Bloque C) — idéntico a generarLiquidaciones (jockey per-reunión dedup,
liquidaciones-engine.js:227:    // entrenador per-caballo). Las líneas de incentivo no llevan carrera_id (per-reunión).
liquidaciones-engine.js:240:            premio: incEntr, pct: 1, subs: [], conceptoTipo: 'incentivo_entrenador',
liquidaciones-engine.js:241:            concepto: 'Incentivo entrenador',
liquidaciones-engine.js:242:            descripcion: `Incentivo entrenador por caballo corrido: ${fmt(incEntr)}`,
liquidaciones-engine.js:249:          premio: incJockey, pct: 1, subs: [], conceptoTipo: 'incentivo_jockey',
liquidaciones-engine.js:250:          concepto: 'Incentivo jockey',
liquidaciones-engine.js:251:          descripcion: `Incentivo jockey por actuación en la reunión: ${fmt(incJockey)}`,
liquidaciones-engine.js:298:      const descPct = ((cfg?.descuento_fondo_solidario_pct || 0) + (cfg?.descuento_incentivo_pct || 0));
liquidaciones.html:146:         3 incentivos + 3°/4°/5°). El fix elimina la clase entera de falla en vez de una causa:
liquidaciones.html:355:        <div class="form-group"><label>Incentivo jockey ($)</label><input type="text" id="rp-inc-jockey" placeholder="0" oninput="fmtInput(this)"></div>
liquidaciones.html:356:        <div class="form-group"><label>Incentivo entrenador ($)</label><input type="text" id="rp-inc-entrenador" placeholder="0" oninput="fmtInput(this)"></div>
liquidaciones.html:415:          <label>Desc. incentivo (%)</label>
liquidaciones.html:416:          <input type="number" id="cf-incentivo" min="0" max="100" step="0.01" placeholder="0.00">
liquidaciones.html:583:    <div class="config-row">Inc. jockey <span>${fmt(c.incentivo_jockey_monto)}</span></div>
liquidaciones.html:584:    <div class="config-row">Inc. entrenador <span>${fmt(c.incentivo_entrenador_monto)}</span></div>
liquidaciones.html:598:  document.getElementById('rp-inc-jockey').value   = c.incentivo_jockey_monto     ? formatMonto(c.incentivo_jockey_monto)     : '';
liquidaciones.html:599:  document.getElementById('rp-inc-entrenador').value = c.incentivo_entrenador_monto ? formatMonto(c.incentivo_entrenador_monto) : '';
liquidaciones.html:617:    incentivo_jockey_monto: parseMonto(document.getElementById('rp-inc-jockey').value) || 0,
liquidaciones.html:618:    incentivo_entrenador_monto: parseMonto(document.getElementById('rp-inc-entrenador').value) || 0,
liquidaciones.html:861:    incentivo_jockey:'Incentivo jockeys', incentivo_entrenador:'Incentivo cuidadores',
liquidaciones.html:1048:  if (cs && g.sinCarrera) return `${cs} · + incentivo por reunión`;
liquidaciones.html:1050:  return g.sinCarrera ? 'incentivo por reunión' : '—';
liquidaciones.html:1083:  // incentivos de entrenador (que no traen carrera_id) y `carrera_id` cubre las 3 líneas de
liquidaciones.html:1085:  // respaldo. El incentivo de jockey no tiene ninguno de los dos y eso es correcto: es por
liquidaciones.html:1147:// Pedido de Valeria (30/08): cuando alguien viene a cobrar sólo un incentivo, hoy hay que
liquidaciones.html:1165:// Los dos incentivos van en un grupo: un beneficiario es entrenador O jockey, nunca los dos, así
liquidaciones.html:1171:                            incentivo_jockey:'incentivo', incentivo_entrenador:'incentivo' };
liquidaciones.html:1172:const ORDEN_GRUPOS_COB  = ['premio','incentivo','bono','actuacion','otros'];
liquidaciones.html:1180:  if (grupo === 'incentivo') {
liquidaciones.html:1181:    if (tipos.size === 1) return tipos.has('incentivo_jockey') ? 'Incentivo jockey' : 'Incentivo entrenador';
liquidaciones.html:1182:    return 'Incentivos';
liquidaciones.html:1250:// La frase de Valeria —"destildo los demás y tildo solamente el incentivo"— en un click. El rótulo
liquidaciones.html:1619:  if (l.concepto_tipo === 'incentivo_entrenador') return 'Entrenador';
liquidaciones.html:1620:  if (l.concepto_tipo === 'incentivo_jockey') return 'Jockey';
liquidaciones.html:2025:    ${c.descuento_incentivo_pct?`<div class="config-row">Incentivo <span>-${c.descuento_incentivo_pct}%</span></div>`:''}
liquidaciones.html:2044:  document.getElementById('cf-incentivo').value = rec?.descuento_incentivo_pct||'';
liquidaciones.html:2064:    descuento_incentivo_pct: document.getElementById('cf-incentivo').value ? parseFloat(document.getElementById('cf-incentivo').value) : null,
tests/probe_recibos_emision.mjs:54:    const base = { liquidacion_id:liqId, beneficiario_tipo:'profesional', beneficiario_id:BENEF, reunion_id:R5, monto_descuento:0, concepto_tipo:'incentivo_jockey' };
tests/probe_reunion_es_prueba.mjs:197:                                   incentivo_jockey:'incentivo', incentivo_entrenador:'incentivo' };
tests/probe_reunion_es_prueba.mjs:198:       const ORDEN_GRUPOS_COB = ['premio','incentivo','bono','actuacion','otros'];
tests/probe_aislamiento_club_cobros.mjs:254:                                   incentivo_jockey:'incentivo', incentivo_entrenador:'incentivo' };
tests/probe_aislamiento_club_cobros.mjs:255:       const ORDEN_GRUPOS_COB = ['premio','incentivo','bono','actuacion','otros'];
tests/probe_recibo_pie_cobrador.mjs:203:    // El caso de Fede exacto: 3 incentivos de 10.000 + un 3°, un 4° y un 5°.
tests/probe_recibo_pie_cobrador.mjs:207:    for (let i = 0; i < 3; i++) lineas.push(await mk('TEST Incentivo entrenador', 10000, 'incentivo_entrenador', null, null));
tests/probe_incentivos_montas.mjs:2: * Probe Incentivos Bloque C — granularidad por rol (confirmado Fede 2026-06-08).
tests/probe_incentivos_montas.mjs:10: *    incentivo_jockey, beneficiario=jockey, inscripcion_id=null.
tests/probe_incentivos_montas.mjs:12: *    incentivo_entrenador, beneficiario=entrenador, inscripcion_id=la inscripción.
tests/probe_incentivos_montas.mjs:68:    incJockeyCfg = parseFloat(liqConfig.incentivo_jockey_monto) || 0;
tests/probe_incentivos_montas.mjs:69:    incEntrCfg   = parseFloat(liqConfig.incentivo_entrenador_monto) || 0;
tests/probe_incentivos_montas.mjs:70:    console.log(`[config] incentivo_jockey=${incJockeyCfg} incentivo_entrenador=${incEntrCfg}`);
tests/probe_incentivos_montas.mjs:71:    if (incJockeyCfg <= 0 || incEntrCfg <= 0) throw new Error('liquidacion_config sin montos de incentivo (Tarea A no aplicada).');
tests/probe_incentivos_montas.mjs:84:    // Solo ratificados cuentan para incentivo (igual que el generador).
tests/probe_incentivos_montas.mjs:131:    // (a) Jockey con N montas → UNA sola línea incentivo_jockey, monto config, inscripcion_id null.
tests/probe_incentivos_montas.mjs:132:    const jockLines = dets.filter(d => d.concepto_tipo === 'incentivo_jockey');
tests/probe_incentivos_montas.mjs:134:    ok('a1 jockey con N montas → exactamente 1 línea incentivo_jockey', jockMine.length === 1, `lineas=${jockMine.length}`);
tests/probe_incentivos_montas.mjs:135:    ok('a2 incentivo_jockey = monto de config + neto + inscripcion_id null',
tests/probe_incentivos_montas.mjs:140:    ok('a3 ningún otro jockey cobró incentivo (todos los corridos = JOCK_ID)',
tests/probe_incentivos_montas.mjs:141:       jockLines.length === 1, `total_incentivo_jockey=${jockLines.length}`);
tests/probe_incentivos_montas.mjs:143:    // (b) Entrenador con M caballos → M líneas incentivo_entrenador, monto config, inscripcion_id seteado.
tests/probe_incentivos_montas.mjs:144:    const entrLines = dets.filter(d => d.concepto_tipo === 'incentivo_entrenador');
tests/probe_incentivos_montas.mjs:146:    ok('b1 entrenador con M caballos → M líneas incentivo_entrenador', entrMine.length === M, `lineas=${entrMine.length} esperado=${M}`);
tests/probe_incentivos_montas.mjs:147:    ok('b2 cada incentivo_entrenador = monto config + neto + beneficiario profesional',
tests/probe_incentivos_montas.mjs:157:    // (c) Quien no corrió → no genera. Un profesional cualquiera distinto de JOCK/ENTR: 0 incentivos.
tests/probe_incentivos_montas.mjs:159:    const ningunoNadie = dets.filter(d => (d.concepto_tipo === 'incentivo_jockey' || d.concepto_tipo === 'incentivo_entrenador') && d.beneficiario_id === NADIE);
tests/probe_incentivos_montas.mjs:160:    ok('c1 quien no corrió → 0 líneas de incentivo', ningunoNadie.length === 0, `lineas=${ningunoNadie.length}`);
tests/probe_incentivos_montas.mjs:161:    // reunion_id seteado en todas las líneas de incentivo
tests/probe_incentivos_montas.mjs:162:    ok('c2 reunion_id seteado en todas las líneas de incentivo',
tests/probe_fase2_liquidaciones.mjs:2: * Probe Fase 2 — FORMA de las líneas de liquidación (fondo solidario, bono 6-8, incentivos).
tests/probe_fase2_liquidaciones.mjs:346:    // ── D. Incentivos: monto 0 → NO se generan ──
tests/probe_fase2_liquidaciones.mjs:347:    const incLines = dets.filter(d => d.concepto_tipo === 'incentivo_jockey' || d.concepto_tipo === 'incentivo_entrenador');
tests/probe_fase2_liquidaciones.mjs:348:    ok('D1 incentivos NO generados (monto 0 en liquidacion_config)', incLines.length === 0, `encontradas=${incLines.length}`);
tests/probe_fase2_liquidaciones.mjs:351:    const ENUM = new Set(['premio', 'bono', 'actuacion', 'incentivo_jockey', 'incentivo_entrenador', 'fondo_solidario']);
migrations/montas_r6_correccion.sql:208:-- Los incentivos por monta (jockey 50k/reunión, entrenador 10k/caballo)
migrations/liquidaciones_cd_fase0.sql:18:      ('premio', 'bono', 'actuacion', 'incentivo_jockey', 'incentivo_entrenador', 'fondo_solidario');
```

---

## 2. Qué dice hoy la base (SOLO LECTURA)

### 2.1 Guard

```sql
select current_setting('request.jwt.claims', true) as jwt, (select count(*) from spcs) as spcs_count;
```
```
[{"jwt":null,"spcs_count":210}]
```

### 2.2 `liquidacion_config` — todas las filas del sistema

```sql
select lc.id, c.nombre as club, lc.club_id, lc.incentivo_jockey_monto, lc.incentivo_entrenador_monto,
       lc.pct_propietario, lc.pct_entrenador, lc.pct_jockey, lc.pct_peon, lc.pct_capataz, lc.pct_sereno, lc.pct_fondo_solidario,
       lc.dias_antidoping, lc.vigente_desde, lc.vigente_hasta, lc.activo, lc.created_at
from liquidacion_config lc join clubs c on c.id = lc.club_id
order by c.nombre, lc.created_at;
```
```
[{"id":"346c30f9-729e-468b-9abb-8e5c2f85cdea","club":"Hipódromo de Dolores","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c",
  "incentivo_jockey_monto":"50000.00","incentivo_entrenador_monto":"10000.00",
  "pct_propietario":"70.000","pct_entrenador":"10.000","pct_jockey":"10.000","pct_peon":"4.000","pct_capataz":"3.000","pct_sereno":"1.000","pct_fondo_solidario":"2.000",
  "dias_antidoping":30,"vigente_desde":"2026-06-02","vigente_hasta":null,"activo":true,"created_at":"2026-06-02 04:19:52.542081+00"}]
```

**Una sola fila en toda la tabla** (sólo Dolores; "Mi Club Hípico" no tiene config → el motor devolvería `sin liquidacion_config`).

### 2.3 Historial: `auditoria` sobre `liquidacion_config`

```sql
select a.created_at, a.accion, a.usuario_id, u.email,
       a.datos_antes->>'incentivo_jockey_monto' as jockey_antes, a.datos_despues->>'incentivo_jockey_monto' as jockey_despues,
       a.datos_antes->>'incentivo_entrenador_monto' as entr_antes, a.datos_despues->>'incentivo_entrenador_monto' as entr_despues
from auditoria a left join usuarios u on u.id = a.usuario_id
where a.tabla = 'liquidacion_config' order by a.created_at;
```
```
[{"created_at":"2026-06-08 03:15:43.730248+00","accion":"UPDATE","usuario_id":null,"email":null,
  "jockey_antes":"0.00","jockey_despues":"50000.00","entr_antes":"0.00","entr_despues":"10000.00"}]
```

**Una sola modificación en la historia.** `usuario_id` NULL = no fue desde la UI, fue el `UPDATE` por SQL de `docs/RESULTADO_INCENTIVOS_MONTAS.md` ("Tarea A — config (DML aplicada)"):

```
UPDATE liquidacion_config SET incentivo_jockey_monto=50000, incentivo_entrenador_monto=10000
WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c';
```

Ese doc, a su vez, dice: *"Reglas de dominio (Fede, no negociables) — Jockey: 50.000 fijo por reunión … Entrenador: 10.000 por caballo"*. `CHANGELOG.md:1428-1433` (entrada `[2026-06-08]`, merge `47362ef`) lo repite. O sea: **el 50.000 no fue un invento del sistema, fue lo que Fede confirmó el 08/06.** Si hoy el valor correcto es 60.000, o cambió después, o el 08/06 se anotó mal.

---

## 3. Qué se liquidó y pagó con ese valor (R6, R8, sandbox 9999)

### 3.1 Líneas de incentivo por reunión, monto y estado

```sql
select r.numero as reunion, r.fecha, r.es_prueba, d.concepto_tipo, d.monto_bruto, d.estado_linea,
       (d.recibo_id is not null) as con_recibo, count(*) as lineas, sum(d.monto_neto) as neto
from liquidacion_detalle d join reuniones r on r.id = d.reunion_id
where d.concepto_tipo in ('incentivo_jockey','incentivo_entrenador') and r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'
group by 1,2,3,4,5,6,7 order by r.fecha, d.concepto_tipo, d.estado_linea;
```
```
[{"reunion":6,"fecha":"2026-06-20","es_prueba":false,"concepto_tipo":"incentivo_jockey","monto_bruto":"50000.00","estado_linea":"pagado","con_recibo":false,"lineas":21,"neto":"1050000.00"},
 {"reunion":6,"fecha":"2026-06-20","es_prueba":false,"concepto_tipo":"incentivo_entrenador","monto_bruto":"10000.00","estado_linea":"pagado","con_recibo":false,"lineas":51,"neto":"510000.00"},
 {"reunion":8,"fecha":"2026-08-16","es_prueba":false,"concepto_tipo":"incentivo_jockey","monto_bruto":"50000.00","estado_linea":"pagado","con_recibo":false,"lineas":18,"neto":"900000.00"},
 {"reunion":8,"fecha":"2026-08-16","es_prueba":false,"concepto_tipo":"incentivo_jockey","monto_bruto":"50000.00","estado_linea":"pagado","con_recibo":true,"lineas":1,"neto":"50000.00"},
 {"reunion":8,"fecha":"2026-08-16","es_prueba":false,"concepto_tipo":"incentivo_entrenador","monto_bruto":"10000.00","estado_linea":"pagado","con_recibo":false,"lineas":42,"neto":"420000.00"},
 {"reunion":9999,"fecha":"2099-01-01","es_prueba":true,"concepto_tipo":"incentivo_jockey","monto_bruto":"50000.00","estado_linea":"impago","con_recibo":false,"lineas":3,"neto":"150000.00"},
 {"reunion":9999,"fecha":"2099-01-01","es_prueba":true,"concepto_tipo":"incentivo_jockey","monto_bruto":"50000.00","estado_linea":"pagado","con_recibo":true,"lineas":1,"neto":"50000.00"},
 {"reunion":9999,"fecha":"2099-01-01","es_prueba":true,"concepto_tipo":"incentivo_entrenador","monto_bruto":"10000.00","estado_linea":"impago","con_recibo":false,"lineas":15,"neto":"150000.00"}]
```

Resumen:

| Reunión | Jockey (líneas × monto) | Entrenador (líneas × monto) | Estado |
|---|---|---|---|
| R6 (20/06) | 21 × $50.000 = $1.050.000 | 51 × $10.000 = $510.000 | **100 % `pagado`** (sin recibo: backfill manual del cobro histórico) |
| R8 (16/08) | 19 × $50.000 = $950.000 (1 con recibo) | 42 × $10.000 = $420.000 | **100 % `pagado`** |
| 9999 (⚗ PRUEBA) | 4 × $50.000 (1 pagada con recibo, 3 impagas) | 15 × $10.000 impagas | sandbox de probes, fuera del circuito de cobro (ISSUE-055) |

Si el valor correcto siempre fue 60.000, la diferencia no pagada a jockeys sería **21 × 10.000 = $210.000 en R6** y **19 × 10.000 = $190.000 en R8**. Eso es una decisión de Fede/Valeria, no del sistema (§8).

### 3.2 Estado global de las líneas de R6 / R8 / 9999

```sql
select r.numero as reunion, d.estado_linea, (d.recibo_id is not null) as con_recibo, count(*) as lineas, sum(d.monto_neto) as neto
from liquidacion_detalle d join reuniones r on r.id = d.reunion_id
where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'
group by 1,2,3 order by 1,2,3;
```
```
[{"reunion":6,"estado_linea":"impago","con_recibo":false,"lineas":35,"neto":"293591.99"},
 {"reunion":6,"estado_linea":"pagado","con_recibo":false,"lineas":157,"neto":"7116984.19"},
 {"reunion":8,"estado_linea":"impago","con_recibo":false,"lineas":40,"neto":"285162.00"},
 {"reunion":8,"estado_linea":"pagado","con_recibo":false,"lineas":181,"neto":"14806756.66"},
 {"reunion":8,"estado_linea":"pagado","con_recibo":true,"lineas":4,"neto":"230000.00"},
 {"reunion":9999,"estado_linea":"impago","con_recibo":false,"lineas":51,"neto":"553040.00"},
 {"reunion":9999,"estado_linea":"pagado","con_recibo":true,"lineas":4,"neto":"870000.00"},
 {"reunion":9999,"estado_linea":"retenido","con_recibo":false,"lineas":21,"neto":"604800.00"}]
```

Las impagas de R6/R8, ¿qué son?

```sql
select r.numero as reunion, d.concepto_tipo, d.beneficiario_tipo, count(*) as lineas, sum(d.monto_neto) as neto
from liquidacion_detalle d join reuniones r on r.id = d.reunion_id
where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and r.numero in (6,8) and d.estado_linea='impago'
group by 1,2,3 order by 1,2,3;
```
```
[{"reunion":6,"concepto_tipo":"fondo_solidario","beneficiario_tipo":"club","lineas":35,"neto":"293591.99"},
 {"reunion":8,"concepto_tipo":"fondo_solidario","beneficiario_tipo":"club","lineas":40,"neto":"285162.00"}]
```

→ Lo único no pagado en R6/R8 es el **fondo solidario del club** (el club no se cobra a sí mismo). **Toda línea a persona está `pagado`.** "R6 y R8 saldadas" se confirma en la base.

### 3.3 R9

```sql
select r.numero, r.fecha, r.estado,
       (select count(*) from liquidaciones l where l.reunion_id=r.id) as liqs,
       (select count(*) from resultados x join carreras c on c.id=x.carrera_id where c.reunion_id=r.id and x.estado='oficial') as carreras_oficiales
from reuniones r where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and r.numero in (6,8,9) order by r.numero;
```
```
[{"numero":6,"fecha":"2026-06-20","estado":"borrador","liqs":86,"carreras_oficiales":7},
 {"numero":8,"fecha":"2026-08-16","estado":"finalizada","liqs":93,"carreras_oficiales":8},
 {"numero":9,"fecha":"2026-09-20","estado":"publicada","liqs":0,"carreras_oficiales":0}]
```

R9: **0 liquidaciones, 0 oficiales**. Todo lo que se genere el domingo va a usar el valor que esté en la config **en el momento de cada oficialización**.

---

## 4. Cómo afecta un cambio de valor a lo ya liquidado (mecánica exacta)

### 4.1 Cambiar la config, sola, no toca nada

`liquidacion_detalle.monto_bruto` es un número guardado en cada línea cuando se generó (`liquidaciones-engine.js:297-305`, `monto_bruto: bruto`). No hay FK ni cálculo diferido hacia `liquidacion_config`. Un `UPDATE liquidacion_config` **no reescribe ninguna línea, ningún header, ningún recibo**. Las pantallas de Pagos/Recibos/Resumen leen `liquidacion_detalle`, no la config.

### 4.2 Lo que SÍ reescribe: el motor (`generarLiquidacionesReunion`)

Bloque "PERSISTENCIA PAID-SAFE" (`liquidaciones-engine.js:256-290`):

```javascript
    // 1. Cargar headers + líneas existentes de la reunión (preservar pagado, reusar headers).
    ...
      for (const d of (h.liquidacion_detalle || [])) {
        if (d.estado_linea === 'pagado' || d.recibo_id != null) {
          paidKeys.add(lineKey(d));
          paidCountByHeader[h.id]++;
          preserved++;
        }
      }
    ...
    // 2. Borrar SOLO las líneas no comprometidas (recibo_id null AND estado != 'pagado').
    //    Lo pagado se preserva; retenido sin recibo se recalcula.
    const allHeaderIds = (existingLiqs || []).map(h => h.id);
    if (allHeaderIds.length) {
      await sb.from('liquidacion_detalle').delete()
        .in('liquidacion_id', allHeaderIds)
        .is('recibo_id', null)
        .neq('estado_linea', 'pagado');
    }

    // 3. Construir líneas nuevas por actor (idéntico cálculo de detalleRows), saltear las
    //    que coincidan con una línea ya pagada, y adjuntarlas al header (reusado o nuevo).
```

Clave de línea (`lineKey`, líneas 37-41): `beneficiario_tipo | beneficiario_id | concepto_tipo | inscripcion_id | posicion | concepto`. **No incluye el monto.** Entonces una línea `incentivo_jockey` pagada a 50.000 sigue matcheando con la línea que el motor querría generar a 60.000 → se saltea, **queda la de 50.000**. Correcto para "no alterar lo pagado".

Consecuencias, por caso:

| Caso | Qué pasa si cambio el valor a 60.000 y después… |
|---|---|
| **R6 / R8** — todas las líneas a personas están `pagado` | Un "Recalcular reunión" borra y regenera sólo `fondo_solidario` (impago, y no depende del incentivo). Las 133 + 61 líneas de incentivo **se preservan a 50.000**. Nada cambia en lo pagado. ✅ |
| **Reunión con incentivos impagos** (hoy sólo la 9999 de prueba) | Un recalc borra las impagas y las regenera **a 60.000**. La pagada con recibo queda a 50.000. Mezcla dentro de la misma reunión — es lo que el paid-safe hace por diseño. |
| **R9 (domingo)** — nada generado todavía | Cada oficialización de carrera recalcula la reunión entera. Si la config ya dice 60.000 → todo sale a 60.000. Si se cambia a mitad de la tarde, la oficialización siguiente pisa las impagas con 60.000. **Única trampa:** si alguien emite un recibo con un incentivo de R9 a 50.000 *antes* de la corrección, ese incentivo queda a 50.000 para siempre (preservado por clave), y el único camino es anular el recibo (`anular_recibo`, ventana de 5 días para no-super_admin, `liquidaciones.html:1486-1526`) y recalcular. |
| **Des-oficializar** una carrera de R6/R8 | El RPC `desoficializar_carrera` tiene guard duro: si la carrera tiene líneas pagadas, `RAISE` y no recalcula (`resultados.html:1676-1681`). Bloqueado. |

### 4.3 Lo que NO hay (y por eso "por reunión" hoy no existe)

- No hay `reuniones.incentivo_jockey_monto` ni snapshot de config por reunión. El motor **no sabe** con qué config se generó una reunión; sólo quedan los `monto_bruto` en las líneas.
- No hay historial de versiones de `liquidacion_config`: `saveReparto` hace `UPDATE` sobre la misma fila. `vigente_desde`/`vigente_hasta`/`activo` existen pero nadie las usa para elegir la fila.
- Si mañana alguien "versionara" insertando una segunda fila `activo=true` para Dolores (sin desactivar la anterior), `.maybeSingle()` devuelve error por múltiples filas → `liqConfig` = null → el motor retorna `error: 'sin liquidacion_config'` y **no genera nada**. `saveReparto` no puede producir eso (siempre `UPDATE` si ya hay fila), pero un `INSERT` a mano sí.
- Reproducibilidad: si R6 se recalculara con la config de octubre (100.000), las líneas impagas saldrían a 100.000 aunque la reunión sea de junio. Hoy en R6/R8 eso es inocuo porque no hay incentivos impagos, pero es la deuda de diseño de fondo.

---

## 5. Qué haría falta para que Yesi lo cambie "por reunión"

### 5.1 Para el domingo (cero código)

1. Yesi entra a `liquidaciones.html` → `⚙️ Config. Comisiones` → `✏️ Editar reparto` → "Incentivo jockey ($)" = **60.000** → Guardar. Queda auditado con su usuario.
2. Hacerlo **antes de oficializar la primera carrera** de R9 (o al menos antes de emitir el primer recibo con incentivo).
3. Si ya había alguna carrera oficializada, la próxima oficialización regenera todo a 60.000 sola; si no va a haber más oficializaciones, `Recalcular reunión` en `liquidaciones.html` (con la página recién abierta, F5 — ver §1.2).
4. R6/R8 no se tocan (§4.2). Ni siquiera hace falta evitar el recalc: lo pagado se preserva.

Para octubre (100.000): mismo procedimiento antes de la primera oficialización de esa reunión.

**Qué NO hacer:** cambiar el valor y recalcular una reunión vieja que tenga incentivos **impagos** esperando que queden al valor histórico — quedan al valor nuevo.

### 5.2 Para que quede "por reunión" de verdad (código, no urgente)

Dos opciones, de menor a mayor:

**(a) Config con vigencia por fecha** — dejar de pisar la fila y usar lo que la tabla ya tiene:
- `saveReparto` → cerrar la fila actual (`vigente_hasta = ayer`, `activo=false`) e insertar una nueva con `vigente_desde = fecha elegida` (o hoy). Pedirle a Yesi "¿desde qué fecha rige?".
- Motor: elegir la fila con `vigente_desde <= reuniones.fecha` y (`vigente_hasta IS NULL OR >= reuniones.fecha`), en vez de `activo=true`. Un recalc de R6 en octubre volvería a usar 50.000 (o 60.000 si se retro-data) — reproducible.
- Toca: `liquidaciones.html` (`saveReparto`, `loadReparto`, `init`), `liquidaciones-engine.js:68-75`, y el probe `probe_incentivos_montas.mjs` (que hoy lee `activo=true`). Sin DDL: las columnas están. Ojo con `maybeSingle()` y el CHECK de suma 100 en cada fila nueva.
- Ventaja: una sola pantalla, historial completo, cero cambios en cómo se cobra.

**(b) Override por reunión** — columnas `reuniones.incentivo_jockey_monto` / `incentivo_entrenador_monto` (nullable, fallback a la config del club) editables desde `reuniones.html`. Más granular pero mete el número en una pantalla que hoy no tiene nada de plata, y sigue sin historial de la config base. No lo recomiendo para el pedido de Fede ("en octubre suben"), que es un cambio por fecha, no por reunión puntual.

Recomendación: **(a)**. Y en ambos casos, además: que el motor guarde en el header `liquidaciones` (o en la línea) la config con la que generó (`liquidacion_config_id`), para que "con qué valor se liquidó R6" sea una query y no una inferencia por `monto_bruto`.

---

## 6. Otros lugares donde el "50k" aparece como texto (no afectan el cálculo)

Si el valor cambia, conviene corregir por prolijidad — ninguno se ejecuta:
- `CLAUDE.md` (árbol de `tests/`): `probe_incentivos_montas.mjs  Incentivos Bloque C (jockey 50k/reunión, entrenador 10k/caballo)`
- `migrations/montas_r6_correccion.sql:208` (comentario)
- `docs/ISSUES.md:35`, `CHANGELOG.md:1431-1433`, `docs/LIQUIDACIONES_MODELO.md` §4, `docs/RESULTADO_INCENTIVOS_MONTAS.md`
- `tests/probe_recibo_pie_cobrador.mjs:203-207` usa `10000` como fixture literal ("el caso de Fede exacto") — es un fixture propio, no lee la config; sigue siendo válido como test aunque el monto real cambie.

---

## 7. Prod = main (verificación)

```
$ for f in liquidaciones-engine.js liquidaciones.html; do curl -s "https://sigh.com.ar/$f?v=$RANDOM" -o /tmp/prod_$f; git show main:$f > /tmp/local_$f; md5sum /tmp/local_$f /tmp/prod_$f; done
dbd2a2e840a864f1d1d2972b2209feeb  /tmp/local_liquidaciones-engine.js
dbd2a2e840a864f1d1d2972b2209feeb  /tmp/prod_liquidaciones-engine.js
ef57d92f0794a9724c2df52608c68279  /tmp/local_liquidaciones.html
ef57d92f0794a9724c2df52608c68279  /tmp/prod_liquidaciones.html
```

```
$ git branch --show-current && git rev-parse HEAD && git status --short | head
main
ef7847218bfb47f06f72d9df814d1aba02a1a14c
```

---

## 8. Preguntas abiertas (para Fede / Valeria)

1. **¿El incentivo a jockeys fue siempre 60.000, o subió de 50.000 a 60.000 después del 08/06?** El sistema cargó 50.000 el 08/06 "confirmado por Fede". Si siempre fue 60.000, R6 y R8 se pagaron $10.000 de menos a cada jockey (21 y 19 jockeys: $210.000 + $190.000). Si subió después, ¿desde qué reunión rige? (R8 del 16/08 se pagó a 50.000.)
2. **¿El de entrenador (10.000 por caballo) está bien?** Valeria no lo cuestionó; el sistema lo tiene en 10.000 desde el mismo 08/06.
3. **Octubre 100.000**: ¿rige por fecha de reunión (toda reunión desde el 1/10) o por fecha de pago? Cambia la opción de diseño de §5.2 (por fecha de reunión → (a) tal cual; por fecha de pago → no tiene sentido versionar, se pisa y listo).
4. Si hay que compensar R6/R8, ¿se hace como línea nueva "ajuste incentivo" (nuevo concepto o `incentivo_jockey` adicional con `concepto` distinto para no colisionar con `lineKey`) o se anulan recibos? Hoy `concepto_liq` no tiene un valor "ajuste"; se puede sumar con `ADD VALUE IF NOT EXISTS` (GOTCHA #11). Es decisión de producto, no la tomo acá.

---

## 9. Verificación de publicación

(se completa abajo con `git ls-remote`)
