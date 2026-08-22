# Diagnóstico read-only — BOLSA / bonos por posición — R8 (16/08/2026)

**Fecha**: 2026-08-13
**Alcance**: solo lectura. Cero DDL, cero DML. Ningún archivo de producción modificado.
**Proyecto**: `unlhcuanfrtpatoipwve` (SGH prod)
**Branch**: `diag/bono-posicion-r8`

---

## 0. GUARD — resultado

| Check | Esperado | Obtenido | Estado |
|---|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | `/home/clio/dev/SGH` | ✅ |
| project-ref MCP (`mcp__supabase__*`) | `unlhcuanfrtpatoipwve` | `unlhcuanfrtpatoipwve` | ✅ |
| `SELECT count(*) FROM spcs` | **181** | **183** | ⚠️ **MISMATCH** |

**Interpretación del mismatch**: no es base equivocada. El ref del MCP está scopeado al
directorio `/home/clio/dev/SGH` y apunta a `unlhcuanfrtpatoipwve` (el otro server MCP,
`mcp__claude_ai_Supabase__*`, apunta a `ccdpbiflbewhnidigiin` — proyecto AK-Cl, **no** se usó acá).
La diferencia es **drift de datos**: hay 4 SPCs con `created_at = 2026-08-10 22:41:02+00`
(LA DE ETIQUETA, EL JOROBA, CURIOSA GO ON, GRAND FITO) cargados después de que se fijó el
número 181 del guard. El baseline del guard quedó viejo; conviene actualizarlo a 183.

Se siguió adelante porque toda la operación es de lectura y el riesgo es nulo.

---

## 1. Reunión del 16/08/2026

| Campo | Valor |
|---|---|
| `id` | `7b6e003e-22e2-4629-bf55-f18560b1260f` |
| `numero` | **8** |
| `numero_publico` | **7** |
| `fecha` | **2026-08-16** |
| `estado` | `borrador` |
| `club_id` | `0649e9c5-9e87-4aad-842f-101458e6b33c` (Hipódromo de Dolores) |

Única reunión con esa fecha en toda la base. Coincide con R8 / público 7.

---

## 2. Carreras de R8 — bolsa y distribución

**12 carreras** (turnos 1..12). Claves presentes en `distribucion_premios` en toda la reunión:
`1,2,3,4,5,bono_ganador,bono_posicion_desde,bono_posicion_hasta,bono_posicion_monto,ganancia_minima`.
No existen columnas dedicadas para los bonos en `carreras` — todo vive dentro del JSONB.

### 2.1 Tabla por turno

| turno | nº prog | bolsa_total | ganancia_minima | bono_ganador | bono_pos_desde | bono_pos_hasta | bono_pos_monto | ¿3 campos bono_posicion? |
|---:|---:|---:|---:|---:|---:|---:|---:|:--|
| 1 | **NULL** | 1.054.166,67 | 100.000 | 250.000 | 6 | 8 | 100.000 | ✅ completo |
| 2 | 1 | 1.016.666,67 | 100.000 | 250.000 | 6 | 8 | 100.000 | ✅ completo |
| 3 | 7 | 1.118.333,33 | 100.000 | 250.000 | 6 | 8 | 100.000 | ✅ completo |
| 4 | 3 | 1.000.000,00 | 100.000 | 250.000 | 6 | 8 | 100.000 | ✅ completo |
| 5 | 4 | 1.166.666,67 | 100.000 | 250.000 | 6 | 8 | 100.000 | ✅ completo |
| 6 | **NULL** | 1.166.666,67 | 100.000 | 250.000 | 6 | 8 | 100.000 | ✅ completo |
| 7 | **NULL** | 1.166.666,67 | 100.000 | 250.000 | 6 | 8 | 100.000 | ✅ completo |
| 8 | 8 | 1.191.666,67 | 100.000 | 250.000 | 6 | 8 | 100.000 | ✅ completo |
| 9 | **NULL** | 1.191.666,67 | 100.000 | 250.000 | 6 | 8 | 100.000 | ✅ completo |
| 10 | 5 | 3.333.333,33 | 100.000 | **NULL/FALTA** | 6 | 8 | 100.000 | ✅ completo |
| 11 | 6 | 1.833.333,33 | 100.000 | **NULL/FALTA** | 6 | 8 | 100.000 | ✅ completo |
| 12 | 2 | 1.750.000,00 | 100.000 | **NULL/FALTA** | 6 | 8 | 100.000 | ✅ completo |

`bolsa_bonos` = `0.00` en las 12 (columna sin uso; los bonos se leen del JSONB, no de acá).

**Respuesta directa a la consigna del punto 2**: **ninguna carrera de R8 tiene los tres campos
`bono_posicion_*` faltantes.** Las 12 tienen `desde=6`, `hasta=8`, `monto=100.000`. Lo que sí
falta es otra cosa: **`bono_ganador` no existe en los turnos 10, 11 y 12** (la clave directamente
no está en el JSON, no está en 0). Y **4 turnos (1, 6, 7, 9) tienen `numero_carrera_programa = NULL`**
— o sea la reunión tiene 12 turnos pero solo 8 numerados para el programa.

### 2.2 `distribucion_premios` crudo

Turnos 1–9 (idéntico byte a byte en los nueve):

```json
{"1": 60, "2": 19, "3": 12, "4": 6, "5": 3, "bono_ganador": 250000, "ganancia_minima": 100000, "bono_posicion_desde": 6, "bono_posicion_hasta": 8, "bono_posicion_monto": 100000}
```

Turnos 10, 11 y 12 (idéntico en los tres — mismo JSON **sin** `bono_ganador`):

```json
{"1": 60, "2": 19, "3": 12, "4": 6, "5": 3, "ganancia_minima": 100000, "bono_posicion_desde": 6, "bono_posicion_hasta": 8, "bono_posicion_monto": 100000}
```

### 2.3 Efecto del piso `ganancia_minima` sobre la BOLSA impresa

Importa porque la línea BOLSA **no imprime `bolsa_total`**, imprime el total efectivo que devuelve
`repartoDisplay()` (`premios-utils.js:33`), que eleva al piso cada puesto que quede por debajo.

| turno | bolsa_total (DB) | BOLSA mostrada | delta por piso | puestos elevados al piso |
|---:|---:|---:|---:|---:|
| 1 | 1.054.167 | 1.159.292 | +105.125 | 2 (4° y 5°) |
| 2 | 1.016.667 | 1.125.167 | +108.500 | 2 |
| 3 | 1.118.333 | 1.217.683 | +99.350 | 2 |
| 4 | 1.000.000 | 1.110.000 | +110.000 | 2 |
| 5 | 1.166.667 | 1.261.667 | +95.000 | 2 |
| 6 | 1.166.667 | 1.261.667 | +95.000 | 2 |
| 7 | 1.166.667 | 1.261.667 | +95.000 | 2 |
| 8 | 1.191.667 | 1.284.417 | +92.750 | 2 |
| 9 | 1.191.667 | 1.284.417 | +92.750 | 2 |
| 10 | 3.333.333 | 3.333.333 | 0 | 1 (5° cae justo en 100.000) |
| 11 | 1.833.333 | 1.878.333 | +45.000 | 1 |
| 12 | 1.750.000 | 1.797.500 | +47.500 | 1 |

O sea: en 11 de 12 carreras el número impreso como BOLSA es **mayor** que `bolsa_total` de la DB.
Es el comportamiento diseñado y documentado en `premios-utils.js:25-32`, no un bug — se anota
porque explica por qué el papel no cuadra con un `SELECT bolsa_total` a secas.

---

## 3. Bloques que renderizan la línea BOLSA

### 3.1 `programa-oficial.html` (B&N) — línea 446

Contexto (398–447):

```js
  const dist = c.distribucion_premios || {};
  const bonoGanador  = dist.bono_ganador || 0;
  const apuestasText = formatApuestasText(c);
  const bolsa = parseFloat(c.bolsa_total) || 0;
  const { puestos: puestosEfectivos, total: bolsaNominal } = repartoDisplay(bolsa, dist);
  const desglose = [1, 2, 3, 4, 5, 6].map(p => {
    const monto = puestosEfectivos[String(p)];
    return monto > 0 ? `${p}° ${formatMonto(monto)}` : null;
  }).filter(Boolean).join(' — ');
```

```html
      <div class="carrera-center">
        ${bonoGanador ? `<div class="bono-float"><div class="bono">BONO ${formatMonto(bonoGanador)}<br>AL GANADOR</div></div>` : ''}
        ${c.nombre ? `<div class="premio">PREMIO: ${c.nombre}</div>` : ''}
        ${(c.condicion_adicional || c.condicion_handicap) ? `<div>${[c.condicion_handicap, c.condicion_adicional].filter(Boolean).join(' — ')}</div>` : ''}
        <div class="bolsa">BOLSA: ${formatMonto(bolsaNominal)}${desglose ? ` — ${desglose}` : ''}${dist.ganancia_minima ? ` — GAN. MÍN. ${formatMonto(dist.ganancia_minima)}/puesto` : ''}</div>
        ${apuestasText ? `<div><strong>APUESTAS:</strong> ${apuestasText}</div>` : ''}
      </div>
```

Composición: `BOLSA:` + total efectivo + desglose 1°..6° + `GAN. MÍN. …/puesto`.
**No hay ninguna referencia a `bono_posicion_*` en este archivo.**

### 3.2 `programa-oficial-color.html` — línea 707

Contexto (646–708):

```js
  const dist    = c.distribucion_premios || {};
  const bolsa   = parseFloat(c.bolsa_total) || 0;
  const { puestos: puestosEf, total: bolsaNominal } = repartoDisplay(bolsa, dist);
  const bonoGanador  = dist.bono_ganador || 0;
  const apuestasText = formatApuestasText(c);

  const desglose = [1,2,3,4,5,6].map(p => {
    const m = puestosEf[String(p)];
    return m > 0 ? `${p}° ${formatMonto(m)}` : null;
  }).filter(Boolean).join(' — ');
```

```html
    <div class="carrera-color-info">
      ${bonoGanador ? `<div class="bono-lateral">BONO ${formatMonto(bonoGanador)}<br>AL GANADOR</div>` : ''}
      ${condiciones ? `<div>${condiciones}</div>` : ''}
      ${bolsa ? `<div class="bolsa-linea">BOLSA: ${formatMonto(bolsaNominal)}${desglose ? ` — ${desglose}` : ''}${dist.ganancia_minima ? ` — GAN. MÍN. ${formatMonto(dist.ganancia_minima)}/puesto` : ''}</div>` : ''}
    </div>
```

Misma composición que el B&N, con dos diferencias: la línea entera está guardada tras
`${bolsa ? … : ''}` (si `bolsa_total = 0` no se imprime nada), y el bono al ganador es
`.bono-lateral` en vez de `.bono-float`.
**Tampoco referencia `bono_posicion_*`.**

> **Hallazgo principal**: el bono por posición 6°–8° de $100.000/puesto está cargado en las 12
> carreras de R8 pero **no aparece en ninguno de los dos programas oficiales** (ni B&N ni color).
> Solo lo imprime la carta de llamados. No es un dato faltante: es una omisión de render.

### 3.3 `carta-llamados.html` — todas las apariciones de `ganancia_minima`

Seis apariciones. Con 5 líneas de contexto a cada lado:

#### (a) línea 780 — lista de claves excluidas del desglose por puesto (vista pantalla)

```js
775|    const cantPuestos = bonoPosH >= bonoPosD ? bonoPosH - bonoPosD + 1 : 0;
776|    const totalBonos  = bonoGan + (bonoPosMon * cantPuestos);
777|    const { puestos: puestosEfectivos, total: bolsaNominal } = repartoDisplay(bolsa, dist);
778|    const montoTotal  = bolsaNominal; // BOLSA = efectiva (con piso); los bonos van aparte, NO se suman
779|
780|    const EXCLUIR = ['bonos','bono_ganador','bono_posicion_desde','bono_posicion_hasta','bono_posicion_monto','ganancia_minima'];
781|    const condMain = c.condicion_handicap || c.nombre || '';
782|    const condAd   = c.condicion_adicional || '';
783|
784|    // Último puesto con premio en la distribución porcentual
785|    const puestosConPct = Object.entries(dist)
```

#### (b) línea 823 — fila "Ganancia mínima por puesto" del desglose en pantalla

```js
818|          <span class="premio-row-lbl">Total bonos</span>
819|          <span class="premio-row-val">${formatMonto(totalBonos)}</span>
820|        </div>` : '';
821|
822|      // Línea informativa de piso: recuerda la ganancia mínima por puesto (ya reflejada en la BOLSA efectiva)
823|      const gananciaMin = parseFloat(dist.ganancia_minima) || 0;
824|      const rowPiso = gananciaMin > 0 ? `<div class="premio-row premio-row-sub">
825|          <span class="premio-row-lbl">· Ganancia mínima por puesto</span>
826|          <span class="premio-row-val">${formatMonto(gananciaMin)}</span>
827|        </div>` : '';
828|
```

#### (c) línea 891 — misma lista `EXCLUIR`, ahora dentro de `renderPrint()`

```js
886|  if (!reunion || !carreras.length) return;
887|  const hip = reunion.hipodromos;
888|  const f = new Date(reunion.fecha + 'T12:00:00');
889|  const DIAS  = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
890|  const MESES = ['ENERO','FEBRERO',…,'DICIEMBRE'];
891|  const EXCLUIR = ['bonos','bono_ganador','bono_posicion_desde','bono_posicion_hasta','bono_posicion_monto','ganancia_minima'];
892|  const ORDINAL = ['1ª','2ª','3ª','4ª','5ª','6ª'];
893|
894|  const logoHtml = clubData?.logo_url
895|    ? `<img src="${clubData.logo_url}" class="p-doc-logo" alt="${clubData.nombre||''}">`
896|    : `<div class="p-doc-logo-fallback">${clubData?.nombre||'SGH'}</div>`;
```

#### (d) línea 942 — **la línea BOLSA impresa de la carta de llamados**

```js
937|      const puestos = Object.entries(dist)
938|        .filter(([k,v]) => !EXCLUIR.includes(k) && Number(v) > 0)
939|        .sort(([a],[b]) => parseInt(a) - parseInt(b))
940|        .map(([pos]) => `${ORDINAL[parseInt(pos)-1]||pos+'°'} ${formatMonto(Math.round(puestosEfectivos[pos]||0))}`);
941|      bolsaLine = `BOLSA: ${formatMonto(bolsaNominal)}`;
942|      if (puestos.length)         bolsaLine += ' &mdash; ' + puestos.join(' &mdash; ');
943|      if (dist.ganancia_minima)   bolsaLine += ` &mdash; GAN. MÍN. ${formatMonto(dist.ganancia_minima)}/puesto`;
944|      if (bonoPosH && bonoPosMon) bolsaLine += ` &mdash; BONO ${bonoPosD}°-${bonoPosH}° ${formatMonto(bonoPosMon)}/puesto`;
945|    }
946|
947|    const captionCat = cat ? `CARRERA ${cat.nombre.toUpperCase()}` : '';
948|    const bonoGanTag = bonoGan > 0 ? ` <span class="p-head-bono">| BONO de ${formatMonto(bonoGan)} al ganador</span>` : '';
```

> Nota: acá `ganancia_minima` cae en la **943**, no en la 942 — la numeración del grep original
> corresponde a la línea `if (dist.ganancia_minima) …`. Lo importante es la **944**: es el
> único lugar de todo el repo que imprime `BONO 6°-8° $100.000/puesto` en un documento.

#### (e) línea 1026 — carga del formulario de edición

```js
1021|  document.getElementById('f-cond-adicional').value = rec?.condicion_adicional||'';
1022|  document.getElementById('f-bolsa').value = rec?.bolsa_total ? formatMonto(rec.bolsa_total) : '';
1023|  document.getElementById('f-cupo').value = rec?.cupo_maximo||'';
1024|  const dist = rec?.distribucion_premios || {"1":60,"2":19,"3":12,"4":6,"5":3};
1025|  [1,2,3,4,5].forEach(i=>{ document.getElementById(`pr-${i}`).value = dist[String(i)]||0; });
1026|  document.getElementById('f-ganancia-minima').value = dist.ganancia_minima ? formatMonto(dist.ganancia_minima) : '';
1027|  document.getElementById('bono-ganador').value = dist.bono_ganador ? formatMonto(dist.bono_ganador) : '';
1028|  document.getElementById('f-bono-pos-hasta').value = dist.bono_posicion_hasta || '';
1029|  document.getElementById('f-bono-pos-monto').value = dist.bono_posicion_monto ? formatMonto(dist.bono_posicion_monto) : '';
1030|  updPct();
1031|  document.getElementById('f-ap-insc').value = rec?.apertura_inscripcion ? rec.apertura_inscripcion.slice(0,16) : '';
```

#### (f) línea 1049–1050 — guardado del formulario

```js
1044|  const id = document.getElementById('f-id').value;
1045|  const btn = document.getElementById('btn-save');
1046|  btn.disabled=true; btn.textContent='Guardando…';
1047|  const distribucion = {};
1048|  [1,2,3,4,5,6].forEach(i=>{ const v=parseFloat(document.getElementById(`pr-${i}`).value); if(v) distribucion[String(i)]=v; });
1049|  const gananciaMinima = parseMonto(document.getElementById('f-ganancia-minima').value)||0;
1050|  if (gananciaMinima) distribucion.ganancia_minima = gananciaMinima;
1051|  const bolsaVal = document.getElementById('f-bolsa').value ? parseMonto(document.getElementById('f-bolsa').value) : null;
1052|  // Warning (no bloqueo) si el piso parece un error de tipeo (la bolsa entera en el campo del piso)
1053|  if (bolsaVal && pisoSospechoso(gananciaMinima, bolsaVal)) {
1054|    if (!confirm(`El piso (ganancia mínima) parece muy alto: …`)) { … return; }
1055|  }
```

### 3.4 Comparación de las tres líneas BOLSA

| | programa-oficial (B&N) | programa-oficial-color | carta-llamados (print) |
|---|---|---|---|
| línea | 446 | 707 | 940–944 |
| total | `repartoDisplay().total` | `repartoDisplay().total` | `repartoDisplay().total` |
| desglose por puesto | `[1..6]` hardcodeado | `[1..6]` hardcodeado | `Object.entries(dist)` filtrado por `EXCLUIR` |
| ordinales | `1°` … `6°` | `1°` … `6°` | `1ª` … `6ª` |
| `GAN. MÍN.` | ✅ | ✅ | ✅ |
| `BONO 6°-8° /puesto` | ❌ **ausente** | ❌ **ausente** | ✅ línea 944 |
| bono al ganador | badge `.bono-float` aparte | badge `.bono-lateral` aparte | tag inline en el título (947) |
| guarda si bolsa = 0 | no (siempre imprime) | sí (`${bolsa ? … }`) | sí (`if (bolsa > 0)`) |

---

## 4. ¿Yesi o Fede pueden editar `bono_posicion_*` desde una pantalla?

**Parcialmente sí — la única pantalla es `carta-llamados.html`, y de los tres campos solo dos son editables.**

`carta-llamados.html` es el **único** módulo del repo que escribe `distribucion_premios`
(`carta-llamados.html:1083` dentro del `payload`, persistido en 1091–1092 vía
`update` / `insert` sobre `carreras`). Todos los demás módulos que tocan el JSONB
(`programa.html`, `programa-oficial*.html`, `inscripciones.html`, `ratificacion.html`,
`liquidaciones-engine.js`) solo **leen**.

Formulario (modal de carrera, `carta-llamados.html:391-412`), bloque "🎁 Bono por posición
(del 6° en adelante)":

| campo DB | input en pantalla | editable |
|---|---|---|
| `bono_posicion_hasta` | `#f-bono-pos-hasta` (number, min 6, max 10) — línea 404 | ✅ **sí** |
| `bono_posicion_monto` | `#f-bono-pos-monto` (texto ARS) — línea 408 | ✅ **sí** |
| `bono_posicion_desde` | — **no existe input** — | ❌ **no** |

El `desde` está **hardcodeado en 6** en el guardado:

```js
1061|  const bonoPosHasta = parseInt(document.getElementById('f-bono-pos-hasta').value)||0;
1062|  const bonoPosMontoVal = parseMonto(document.getElementById('f-bono-pos-monto').value)||0;
1063|  if (bonoPosHasta && bonoPosMontoVal) {
1064|    distribucion.bono_posicion_desde = 6;   // ← literal, sin UI
1065|    distribucion.bono_posicion_hasta = bonoPosHasta;
1066|    distribucion.bono_posicion_monto = bonoPosMontoVal;
1067|  }
```

**Consecuencias operativas:**

1. Para que el bono por posición arranque en un puesto distinto de 6° (ej. 5° o 7°),
   **hoy hay que tocarlo por SQL**. No hay camino por UI.
2. El guardado es **todo-o-nada**: si `hasta` o `monto` quedan vacíos/0, las **tres** claves
   desaparecen del JSON (el `if` de 1063 no entra y nunca se escriben). No hay forma de dejar
   `desde` cargado sin los otros dos.
3. El guardado **reconstruye `distribucion` desde cero** (`const distribucion = {}` en 1047).
   Cualquier clave del JSONB que el formulario no conozca se pierde al guardar esa carrera
   desde la pantalla. Hoy el form cubre `1..6`, `ganancia_minima`, `bono_ganador` y los tres
   `bono_posicion_*`, así que para R8 no hay pérdida — pero es frágil ante claves nuevas.
4. `bono_ganador` sí tiene input propio (`#bono-ganador`, línea 396). Que falte en los turnos
   10/11/12 de R8 es carga (o borrado por dejar el campo en 0), no una limitación de la UI.

---

## 5. Resumen de hallazgos

| # | Hallazgo | Severidad |
|---|---|---|
| 1 | Guard `spcs` = 183, no 181 — drift de datos (4 SPCs del 10/08), misma base correcta | informativo |
| 2 | El bono 6°-8° de $100.000/puesto está en las 12 carreras de R8 pero **no se imprime en ninguno de los dos programas oficiales** | **alta** — plata anunciada en la carta que no aparece en el programa |
| 3 | `bono_ganador` ausente en turnos 10, 11 y 12 de R8 | media — verificar con Fede si es intencional |
| 4 | 4 turnos (1, 6, 7, 9) sin `numero_carrera_programa`; 12 turnos → 8 carreras numeradas | media — revisar si falta ratificar |
| 5 | `bono_posicion_desde` no tiene UI: hardcodeado a 6 en `carta-llamados.html:1064` | media |
| 6 | `saveRecord()` reconstruye `distribucion_premios` desde `{}` → claves desconocidas se pierden | baja/latente |
| 7 | La BOLSA impresa ≠ `bolsa_total` en 11 de 12 carreras (piso `ganancia_minima`, +$92k a +$110k) | informativo — comportamiento diseñado |
| 8 | Desglose por puesto: programas usan `1°..6°` hardcodeado, carta usa `Object.entries(dist)` con `1ª..6ª` | baja — ordinal inconsistente entre documentos |

---

## 6. Queries usadas (todas `SELECT`)

```sql
-- guard
SELECT count(*) FROM spcs;
SELECT current_database(), (SELECT count(*) FROM spcs), (SELECT count(*) FROM clubs), (SELECT count(*) FROM reuniones);

-- 1. reunión
SELECT id, numero, numero_publico, fecha, estado, club_id FROM reuniones WHERE fecha = '2026-08-16' ORDER BY numero;

-- 2. carreras + derivadas
SELECT c.numero_turno, c.numero_carrera_programa, c.bolsa_total, c.bolsa_bonos,
       c.distribucion_premios::text,
       c.distribucion_premios->>'ganancia_minima',
       c.distribucion_premios->>'bono_ganador',
       c.distribucion_premios->>'bono_posicion_desde',
       c.distribucion_premios->>'bono_posicion_hasta',
       c.distribucion_premios->>'bono_posicion_monto'
FROM carreras c WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' ORDER BY c.numero_turno;

-- claves presentes
SELECT DISTINCT jsonb_object_keys(distribucion_premios) FROM carreras
WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND distribucion_premios IS NOT NULL;

-- efecto del piso (réplica SQL de repartoDisplay)
WITH c AS (SELECT numero_turno, numero_carrera_programa, bolsa_total, distribucion_premios AS d
           FROM carreras WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'),
     e AS (SELECT c.numero_turno, c.numero_carrera_programa, c.bolsa_total,
                  (c.d->>'ganancia_minima')::numeric AS piso, k.key AS puesto,
                  GREATEST(c.bolsa_total*(k.value)::numeric/100, COALESCE((c.d->>'ganancia_minima')::numeric,0)) AS efectivo,
                  c.bolsa_total*(k.value)::numeric/100 AS nominal_puesto
           FROM c, LATERAL jsonb_each_text(c.d) k
           WHERE k.key ~ '^[0-9]+$' AND (k.value)::numeric > 0)
SELECT numero_turno, numero_carrera_programa, round(max(bolsa_total)), round(sum(efectivo)),
       round(sum(efectivo)-max(bolsa_total)), count(*) FILTER (WHERE nominal_puesto < piso)
FROM e GROUP BY 1,2 ORDER BY 1;
```

---

**Confirmación final**: no se ejecutó ningún `INSERT` / `UPDATE` / `DELETE` / DDL.
Ningún archivo `.html` o `.js` del proyecto fue modificado. El único archivo creado es este
reporte, en la branch `diag/bono-posicion-r8`.

---
---

# PARTE 2 — Turnos anulados y listado de `resultados.html`

**Fecha**: 2026-08-13 (continuación, misma sesión)
**Alcance**: PARTE 1 read-only sobre prod. PARTE 2 = propuesta de diff **no aplicada**.
**GUARD**: `pwd` = `/home/clio/dev/SGH` ✅ · branch `diag/bono-posicion-r8` ✅ ·
worktree limpio ✅ · ref `unlhcuanfrtpatoipwve` ✅ · `SELECT count(*) FROM spcs` = **183**
(coincide con baseline actualizado) ✅

---

## 7. Las 12 carreras de R8 — estado e inscripciones

| turno | estado | nº prog | nombre | dist | insc. total | **ratif.** | inscripto | forfait | mal_insc |
|---:|:--|---:|:--|---:|---:|---:|---:|---:|---:|
| 1 | 🚫 `anulada` | NULL | — | 1000 | 3 | **0** | 3 | 0 | 0 |
| 2 | ✅ `confirmada` | 1 | PACHAMAMA | 800 | 12 | **10** | 0 | 2 | 0 |
| 3 | ✅ `confirmada` | 7 | FUERZA AÉREA ARGENTINA | 1200 | 8 | **6** | 0 | 2 | 0 |
| 4 | ✅ `confirmada` | 3 | DIA DEL VETERINARIO | 1000 | 12 | **12** | 0 | 0 | 0 |
| 5 | ✅ `confirmada` | 4 | DIA DEL FOLKLORE | 1000 | 13 | **8** | 0 | 4 | 1 |
| 6 | 🚫 `anulada` | NULL | — | 1000 | 2 | **0** | 0 | 2 | 0 |
| 7 | 🚫 `anulada` | NULL | — | 1100 | 7 | **0** | 2 | 4 | 1 |
| 8 | ✅ `confirmada` | 8 | SANTA ROSA | 1200 | 9 | **8** | 0 | 1 | 0 |
| 9 | 🚫 `anulada` | NULL | — | 1200 | 4 | **0** | 2 | 2 | 0 |
| 10 | ✅ `confirmada` | 5 | DÍA DEL NIÑO | 1000 | 12 | **8** | 0 | 3 | 1 |
| 11 | ✅ `confirmada` | 6 | ANIV- DOLORES PRIMER PUEBLO PATRIO | 1100 | 15 | **8** | 0 | 7 | 0 |
| 12 | ✅ `confirmada` | 2 | GRAL JOSÉ DE SAN MARTIN | 800 | 9 | **7** | 0 | 2 | 0 |

Totales: 8 carreras confirmadas (nº programa 1..8, sin huecos ni duplicados),
4 anuladas sin numerar, 106 inscripciones, **67 ratificadas**.

Ninguna carrera de R8 tiene fila en `resultados` todavía (12/12 con `resultado_id = NULL`,
0 `resultado_posiciones`). La reunión sigue en `borrador`.

---

## 8. Turnos 1, 6, 7 y 9 — **CONFIRMADO**

> **Confirmado. Los cuatro tienen `estado = 'anulada'`.**

| turno | estado | ¿inscriptos? | **¿ratificados?** | ¿carrera real sin numerar? |
|---:|:--|:--|:--|:--|
| 1 | `anulada` | sí — 3 en `inscripto` | **0** | **NO** |
| 6 | `anulada` | sí — 2, ambos `forfait` | **0** | **NO** |
| 7 | `anulada` | sí — 7 (2 `inscripto`, 4 `forfait`, 1 `mal_inscrito`) | **0** | **NO** |
| 9 | `anulada` | sí — 4 (2 `inscripto`, 2 `forfait`) | **0** | **NO** |

**Nada en rojo.** No hay ninguna carrera real sin numerar: los 4 turnos sin
`numero_carrera_programa` son exactamente los 4 anulados, y **ninguno tiene un solo
ratificado**. La correspondencia `estado='anulada'` ⟺ `numero_carrera_programa IS NULL`
es perfecta en R8. El programa de 8 carreras es correcto.

Detalle menor (no bloqueante): 7 inscripciones quedaron colgadas en estado `inscripto`
sobre carreras anuladas (3 en turno 1, 2 en turno 7, 2 en turno 9). No largan —
la carrera está anulada — pero tampoco fueron pasadas a `forfait` / `mal_inscrito`.
Ruido de datos, no un riesgo: `renumerarChapas()` filtra por `estado === 'ratificado'`,
así que no pueden colarse en ningún mandil.

---

## 9. `resultados.html` — qué carreras lista hoy

### 9.1 Bloque 478–539 (`loadReunion` + `renderLista`)

```js
478|async function loadReunion() {
479|  const rid = document.getElementById('sel-reunion').value;
480|  if (rid) ActiveReunion.set(rid);
481|  const mc = document.getElementById('main-container');
482|  if (!rid) { mc.innerHTML='…Seleccionar una reunión…'; return; }
483|  mc.innerHTML='<div class="loading-state"><div class="spinner"></div> Cargando…</div>';
484|
485|  const { data: cars } = await sb.from('carreras').select('*').eq('reunion_id', rid).order('numero_turno');
486|  carreras = cars || [];
487|  if (!carreras.length) { mc.innerHTML='…Sin carreras en esta reunión…'; return; }
488|
489|  const carIds = carreras.map(c=>c.id);
490|  const [{ data: inscs }, { data: resData }, { data: carApuData }] = await Promise.all([
491|    sb.from('inscripciones').select('*').in('carrera_id', carIds),
492|    sb.from('resultados').select('*').in('carrera_id', carIds),
493|    carIds.length ? sb.from('carrera_apuestas').select('*').in('carrera_id', carIds).order('orden') : Promise.resolve({ data: [] }),
494|  ]);
…
511|  renderLista();
512|}
517|function renderLista() {
518|  currentCarreraId = null;
519|  // Reunión oficial = estado DERIVADO: lo es cuando TODAS sus carreras están oficiales.
520|  const todasOficiales = carreras.length > 0 && carreras.every(c => resultados[c.id]?.estado === 'oficial');
521|  const oficialesN = carreras.filter(c => resultados[c.id]?.estado === 'oficial').length;
522|  const reunionBadge = todasOficiales
523|    ? `…🏆 Reunión oficial — todas las carreras (${oficialesN}/${carreras.length}) oficializadas…`
524|    : `…Reunión provisional — ${oficialesN}/${carreras.length} carreras oficiales…`;
525|  document.getElementById('main-container').innerHTML = reunionBadge +
526|    `<div class="carreras-grid">${carreras.map(c => {
527|      const res   = resultados[c.id];
528|      const estado = res?.estado || 'sin_resultado';
529|      return `<div class="carrera-card ${estado}" onclick="abrirResultado('${c.id}')">
530|        <div class="cc-num">${c.numero_carrera_programa != null ? c.numero_carrera_programa : c.numero_turno}</div>
531|        <div class="cc-name">${c.nombre || `Turno ${c.numero_turno}`}</div>
532|        <div class="cc-meta">${c.distancia_metros}m · ${c.tipo_pista||'—'}</div>
533|        <div class="cc-status"><span class="badge badge-${estado}">${estado.replace('_',' ')}</span></div>
534|        <button class="btn-outline" …>${estado==='sin_resultado'?'✏️ Cargar resultado':'🔍 Ver / editar'}</button>
535|      </div>`;
538|    }).join('')}</div>`;
539|}
```

### 9.2 Qué lista exactamente, hoy

**La query de la 485 no filtra por `estado`. Trae las 12 carreras, anuladas incluidas,
ordenadas por `numero_turno` ASC.** `renderLista()` (526) mapea ese array tal cual, sin
filtrar. Resultado: **12 tarjetas** en este orden.

El número grande de la tarjeta (`.cc-num`, línea 530) es
`numero_carrera_programa ?? numero_turno` — o sea, las anuladas caen al fallback y muestran
su número de **turno** con el mismo aspecto visual que un número de **programa**:

| # tarjeta | turno | `.cc-num` mostrado | origen del número | `.cc-name` | estado real |
|---:|---:|:--:|:--|:--|:--|
| 1ª | 1 | **1** | fallback turno | `Turno 1` | 🚫 anulada |
| 2ª | 2 | **1** | programa | PACHAMAMA | ✅ |
| 3ª | 3 | **7** | programa | FUERZA AÉREA ARGENTINA | ✅ |
| 4ª | 4 | **3** | programa | DIA DEL VETERINARIO | ✅ |
| 5ª | 5 | **4** | programa | DIA DEL FOLKLORE | ✅ |
| 6ª | 6 | **6** | fallback turno | `Turno 6` | 🚫 anulada |
| 7ª | 7 | **7** | fallback turno | `Turno 7` | 🚫 anulada |
| 8ª | 8 | **8** | programa | SANTA ROSA | ✅ |
| 9ª | 9 | **9** | fallback turno | `Turno 9` | 🚫 anulada |
| 10ª | 10 | **5** | programa | DÍA DEL NIÑO | ✅ |
| 11ª | 11 | **6** | programa | ANIV- DOLORES PRIMER PUEBLO PATRIO | ✅ |
| 12ª | 12 | **2** | programa | GRAL JOSÉ DE SAN MARTIN | ✅ |

**Tres consecuencias concretas:**

1. **Números duplicados en pantalla.** El `1` sale dos veces (tarjetas 1ª y 2ª), el `6`
   dos veces (6ª y 11ª), el `7` dos veces (3ª y 7ª). Quien carga resultados no tiene
   cómo distinguir de un vistazo cuál es la carrera 7 del programa (turno 3) y cuál el
   turno 7 anulado: la tarjeta se ve igual.
2. **Orden que no es el orden del programa.** La grilla va por turno, así que los números
   de programa salen `1, 7, 3, 4, 8, 5, 6, 2` intercalados con los anulados. No es el
   orden en que se corre la reunión.
3. **La reunión nunca puede quedar oficial.** El badge de 520–524 exige
   `carreras.every(c => resultados[c.id]?.estado === 'oficial')` sobre las **12**. Las 4
   anuladas jamás van a tener resultado oficial, así que `todasOficiales` es
   permanentemente `false` y el contador tope es `8/12`. El badge
   "🏆 Reunión oficial" es **inalcanzable** para R8 tal como está.

### 9.3 Corrección al brief: dónde vive el filtro NULL-safe

El brief lo atribuye a `programa.html`. **No está ahí.** `programa.html:251` es
`sb.from('carreras').select('*').eq('reunion_id', rid)` — sin filtro de estado; lo que hace
en 253–257 es *ordenar* empujando las no numeradas al final (`numero_turno + 10000`), pero
igual las muestra.

El patrón `.or('estado.is.null,estado.neq.anulada')` existe, textual, en:

- `programa-oficial.html:186`
- `programa-oficial-color.html:335`

Esos son los dos precedentes reales a copiar.

---

## 10. PARTE 2 — Diff propuesto (**NO aplicado**)

Condición habilitante cumplida: los 4 turnos sin numerar están todos en `anulada`
(§8), ninguno tiene ratificados, y ninguna carrera de R8 tiene resultado cargado —
así que el filtro no puede ocultar trabajo ya hecho.

### 10.1 Diff

```diff
--- a/resultados.html
+++ b/resultados.html
@@ -482,7 +482,10 @@ async function loadReunion() {
   if (!rid) { mc.innerHTML='<div class="empty-state"><div class="icon">🏁</div><h3>Seleccionar una reunión</h3></div>'; return; }
   mc.innerHTML='<div class="loading-state"><div class="spinner"></div> Cargando…</div>';

-  const { data: cars } = await sb.from('carreras').select('*').eq('reunion_id', rid).order('numero_turno');
+  // Las carreras anuladas no se corren: no deben aparecer en la carga de resultados ni
+  // contar para el badge de "reunión oficial". NULL-safe porque carreras.estado es VARCHAR
+  // libre y admite NULL (mismo patrón que programa-oficial.html:186).
+  const { data: cars } = await sb.from('carreras').select('*').eq('reunion_id', rid)
+    .or('estado.is.null,estado.neq.anulada')
+    .order('numero_turno');
   carreras = cars || [];
   if (!carreras.length) { mc.innerHTML='<div class="empty-state"><div class="icon">📋</div><h3>Sin carreras en esta reunión</h3></div>'; return; }
```

Por qué NULL-safe y no `.neq('estado','anulada')` a secas: en PostgREST `neq` traduce a
`estado <> 'anulada'`, que en SQL da NULL (no TRUE) para filas con `estado IS NULL` — esas
filas se caerían del listado. Hoy existe **1 carrera con `estado = NULL`** en toda la base,
más 30 `abierta`, 3 `programada`, 8 `confirmada` y 7 `anulada`. Sin el `estado.is.null` esa
fila desaparecería de `resultados.html`.

### 10.2 Carreras que quedarían listadas

8 tarjetas (las 4 anuladas se van). Orden sin cambios: `numero_turno` ASC.

| # tarjeta | turno | `.cc-num` (= nº programa) | nombre | ratificados |
|---:|---:|:--:|:--|---:|
| 1ª | 2 | **1** | PACHAMAMA | 10 |
| 2ª | 3 | **7** | FUERZA AÉREA ARGENTINA | 6 |
| 3ª | 4 | **3** | DIA DEL VETERINARIO | 12 |
| 4ª | 5 | **4** | DIA DEL FOLKLORE | 8 |
| 5ª | 8 | **8** | SANTA ROSA | 8 |
| 6ª | 10 | **5** | DÍA DEL NIÑO | 8 |
| 7ª | 11 | **6** | ANIV- DOLORES PRIMER PUEBLO PATRIO | 8 |
| 8ª | 12 | **2** | GRAL JOSÉ DE SAN MARTIN | 7 |

Qué arregla y qué no:

- ✅ **Números duplicados: resueltos.** Todas las tarjetas pasan a mostrar
  `numero_carrera_programa` real — 1..8 exactos, sin repetidos, sin fallback a turno.
- ✅ **Badge de reunión oficial: alcanzable.** El denominador pasa de 12 a 8, así que
  `8/8` es posible y `todasOficiales` puede dar `true`.
- ✅ **Menos ruido**: desaparecen 4 tarjetas `Turno N` sin nombre que no se corren.
- ❌ **El orden sigue sin ser el del programa**: la grilla queda `1, 7, 3, 4, 8, 5, 6, 2`.
  El `.order('numero_turno')` de la 485 no cambia con este diff. Arreglarlo es un
  **cambio aparte** (ordenar por `numero_carrera_programa` con fallback, como
  `programa.html:253-257`), fuera del alcance de lo pedido acá. Se deja anotado.

### 10.3 Riesgos

| Riesgo | Evaluación |
|---|---|
| Ocultar una carrera con resultado ya cargado | **Nulo en R8** — 0 filas en `resultados` para toda la reunión. Igual el filtro es por `carreras.estado`, no por resultado: si alguien anula una carrera *después* de cargarle el resultado, la tarjeta desaparecería del listado. No pasa hoy; conviene tenerlo presente. |
| Romper otras reuniones | Bajo. El `.or()` conserva `NULL`, `abierta`, `programada` y `confirmada` — solo excluye las 7 `anulada` de toda la base. |
| Desincronizar con otros módulos | Lo **alinea**: `programa-oficial.html` y `programa-oficial-color.html` ya filtran así. `programa.html`, `ratificacion.html` y `carta-llamados.html` siguen sin filtrar (por diseño en ratificación, que es donde se anula). |

**No se aplicó el diff.** `resultados.html` está sin tocar en esta branch.

---

## 11. Queries de la PARTE 1 (todas `SELECT`)

```sql
-- guard
SELECT count(*) FROM spcs;                                  -- 183 ✅

-- 7. carreras + conteo de inscripciones por estado
SELECT c.numero_turno, c.estado, c.numero_carrera_programa, c.nombre, c.distancia_metros,
       count(i.id) AS inscripciones_total,
       count(i.id) FILTER (WHERE i.estado='ratificado')   AS ratificadas,
       count(i.id) FILTER (WHERE i.estado='inscripto')    AS inscriptas,
       count(i.id) FILTER (WHERE i.estado='forfait')      AS forfait,
       count(i.id) FILTER (WHERE i.estado='mal_inscrito') AS mal_inscrito
FROM carreras c
LEFT JOIN inscripciones i ON i.carrera_id = c.id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
GROUP BY c.id, c.numero_turno, c.estado, c.numero_carrera_programa, c.nombre, c.distancia_metros
ORDER BY c.numero_turno;

-- 10.1 universo de estados (para justificar el NULL-safe)
SELECT estado, count(*) FROM carreras GROUP BY estado ORDER BY 1 NULLS FIRST;
-- NULL:1 · abierta:30 · anulada:7 · confirmada:8 · programada:3

-- 10.3 ¿alguna carrera de R8 tiene resultado cargado?
SELECT c.numero_turno, c.estado, r.id, r.estado,
       (SELECT count(*) FROM resultado_posiciones rp WHERE rp.resultado_id = r.id)
FROM carreras c LEFT JOIN resultados r ON r.carrera_id = c.id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' ORDER BY c.numero_turno;
-- 12/12 sin resultado
```

---

**Confirmación PARTE 2**: cero `INSERT` / `UPDATE` / `DELETE` / DDL. Ningún `.html` ni `.js`
modificado — el diff de §10.1 es una **propuesta**, no está aplicado. Lo único que cambia en
la branch `diag/bono-posicion-r8` es este mismo archivo de reporte.
