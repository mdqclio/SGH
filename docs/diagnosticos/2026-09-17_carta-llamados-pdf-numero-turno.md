# Carta de llamado — número de turno en el encabezado del PDF (sólo lectura)

- **Fecha:** 2026-09-17
- **SHA de `main` relevado:** `030089ae2ae226e2f8f9c5ca133e298e37be9b81`
- **Guards:** `pwd` = `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- **Alcance:** relevamiento de código en `main` + medición de ancho con Chromium headless sobre el CSS de impresión real. **No se tocó código ni la base.**
- **Pedido (Fede):** que el PDF de la carta muestre el número de turno adelante de la condición, como la pantalla ("TURNO 1 — Condición: Todo caballo 3 años perdedor").

---

## 0. Respuesta corta

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Dónde se genera el PDF y cómo arma el encabezado? | `carta-llamados.html`, `renderPrint()` (línea 1016). El PDF es `window.print()` sobre `#print-only` (`guardarCartaPDF()` línea 471). El título de cada carrera es `tituloHtml` (**línea 1080**) = `condMain` + bono; va al `<div class="p-head-titulo">` (línea 1085). Arriba de la caja va un caption `CARRERA <categoría>` (línea 1078/1082). |
| 2 | ¿El número está disponible ahí? | **Sí, y ya está calculado.** `c.numero_turno` viene del `select('*')` (línea 602). Más aún: `turnoLabel` y `headText` (**líneas 1054–1058**) lo arman y **nunca se usan** — es código muerto desde el rediseño del 20/05 (`5951c1a`). No hay que traer nada. |
| 3 | ¿`numero_turno` o `numero_carrera_programa`? | La pantalla usa **posición en la lista** (`idx+1`, línea 972) — que coincide con `numero_turno` salvo reorden sin guardar. El `turnoLabel` muerto usaría `CARRERA N (TURNO M)` si hay `numero_carrera_programa`. Para la carta corresponde **`numero_turno`** a secas: no hay sorteo todavía, y R9 muestra que después de ratificar `numero_carrera_programa` queda cargado (T3→7, T4→2…) y ensuciaría la carta si se reimprime. |
| 4 | ¿Otros PDF con el mismo problema? | **No.** Inscriptos (`inscripciones.html:1009–1011`) ya imprime `TURNO N — NOMBRE`. Ratificados (`ratificacion.html:361,386`) imprime `Carrera N` con `numero_carrera_programa` y cae a `numero_turno` si no hay — correcto para ese momento (post-sorteo). |
| — | Ancho | Cabe. El título es un `flex:1` que **envuelve**, nunca desborda ni empuja el chip de distancia. Con `TURNO N — ` adelante, en R9 pasan de **0 a 2** títulos a 2 líneas (T7 y T8, los de 57/54 chars + bono); sin bono ninguna condición histórica del club llega a 2 líneas. Ver §4. |

---

## 1. Dónde se genera el PDF y cómo arma el encabezado

Comando y salida cruda (todo contra `main`):

```
$ git grep -n "renderPrint\|turnoLabel\|headText\|tituloHtml\|p-head-titulo\|p-carrera-caption" main -- carta-llamados.html
main:carta-llamados.html:159:    /* PRINT — documento separado generado por renderPrint() */
main:carta-llamados.html:189:      .p-carrera-caption { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.8pt; color: #245033; text-transform: uppercase; margin-bottom: 2pt; padding-left: 2pt; }
```

(salida completa del grep en §A.1). El circuito:

1. `renderCarreras()` (pantalla) termina llamando a `renderPrint()` — línea 1013.
2. `renderPrint()` arma `header + carrerasHtml + novedadesHtml + fechasHtml` y lo mete en `#print-only` — línea 1120.
3. `guardarCartaPDF()` / `imprimirCartaColor()` / `imprimirCartaBN()` (líneas 471–486) hacen `window.print()`; el CSS `@media print` (líneas 161–254) oculta todo menos `#print-only`. **No hay jsPDF ni librería: el PDF es el diálogo de impresión del browser.**

### 1.1 El bloque por carrera en `renderPrint()` — líneas 1042–1094

```
  const carrerasHtml = carreras.map(c => {
    const cat     = categorias.find(x => x.id === c.categoria_id);
    const dist    = c.distribucion_premios || {};
    const bolsa   = c.bolsa_total || 0;
    const bonoGan    = dist.bono_ganador       || 0;
    const bonoPosH   = dist.bono_posicion_hasta || 0;
    const bonoPosD   = dist.bono_posicion_desde || 6;
    const bonoPosMon = dist.bono_posicion_monto || 0;

    // Encabezado: "TURNO N — CATEGORÍA (cód) — condición"
    const catLabel  = cat ? cat.nombre.toUpperCase() + (cat.codigo ? ` (${cat.codigo})` : '') : '';
    const condMain  = c.condicion_handicap || c.nombre || '';
    const turnoLabel = c.numero_carrera_programa
      ? `CARRERA ${c.numero_carrera_programa} (TURNO ${c.numero_turno})`
      : `TURNO ${c.numero_turno}`;
    const headParts = [turnoLabel, catLabel, condMain].filter(Boolean);
    const headText  = headParts.join(' &mdash; ');

    // Condición adicional (línea pequeña bajo encabezado)
    const condAdicional = c.condicion_adicional || '';

    // Línea de bolsa (bono ganador va inline en el título, no aquí)
    const { puestos: puestosEfectivos, total: bolsaNominal } = repartoDisplay(bolsa, dist);
    let bolsaLine = '';
    if (bolsa > 0) {
      const puestos = Object.entries(dist)
        .filter(([k,v]) => !EXCLUIR.includes(k) && Number(v) > 0)
        .sort(([a],[b]) => parseInt(a) - parseInt(b))
        .map(([pos]) => `${ORDINAL[parseInt(pos)-1]||pos+'°'} ${formatMonto(Math.round(puestosEfectivos[pos]||0))}`);
      bolsaLine = `BOLSA: ${formatMonto(bolsaNominal)}`;
      if (puestos.length)         bolsaLine += ' &mdash; ' + puestos.join(' &mdash; ');
      // La leyenda del piso por puesto se saco del impreso a pedido de secretaria. El piso
      // sigue aplicandose en repartoDisplay(): bolsaNominal y los montos por puesto no cambian.
      if (bonoPosH && bonoPosMon) bolsaLine += ` &mdash; BONO ${bonoPosD}°-${bonoPosH}° ${formatMonto(bonoPosMon)}/puesto`;
    }

    const captionCat = cat ? `CARRERA ${cat.nombre.toUpperCase()}` : '';
    const bonoGanTag = bonoGan > 0 ? ` <span class="p-head-bono">| BONO de ${formatMonto(bonoGan)} al ganador</span>` : '';
    const tituloHtml = `${condMain || c.nombre || ''}${bonoGanTag}`;
    return `<div class="p-carrera-wrap" data-cat="${cat?.codigo||''}">
      ${captionCat ? `<div class="p-carrera-caption">${captionCat}</div>` : ''}
      <div class="p-carrera-box">
        <div class="p-carrera-head">
          <div class="p-head-titulo">${tituloHtml}</div>
          <div class="p-head-dist">${c.distancia_metros} m</div>
        </div>
        <div class="p-carrera-body">
          ${condAdicional ? `<div class="p-linea-peso">${condAdicional}</div>` : ''}
          ${bolsaLine     ? `<div class="p-linea-bolsa">${bolsaLine}</div>`    : ''}
        </div>
      </div>
    </div>`;
  }).join('');

```

Lectura:

- **Línea 1080** — `tituloHtml = condMain + bonoGanTag`. Es lo que se ve en negrita dentro de la caja. **No lleva número.**
- **Línea 1078** — `captionCat = "CARRERA <categoría>"` — la línea chica verde/azul arriba de la caja. Dice "CARRERA OFICIAL NO COMPUTABLE", no "CARRERA 3": es la categoría, no el número.
- **Líneas 1054–1058** — `turnoLabel`, `headParts`, `headText`: se calculan y **no aparecen en el template** (líneas 1081–1093). Código muerto. El comentario de la línea 1051 ("Encabezado: TURNO N — CATEGORÍA (cód) — condición") describe el encabezado *viejo*, no el actual.

### 1.2 Cómo quedó muerto — historia

```
$ git log -S"headText" --format="%h %ad %s" --date=short -- carta-llamados.html
5951c1a 2026-05-20 feat(carta-llamados): rediseño completo de PDF estilo Dolores con cajas, novedades, disclaimers, sponsors y secretaría
d97efac 2026-05-09 carta-llamados PDF: encabezado de carrera en una sola línea

$ git log -S"turnoLabel" --format="%h %ad %s" --date=short -- carta-llamados.html
86ec3cd 2026-05-19 feat: forfait sin motivo + forfaits en PDF + carrera/turno en carta + selector de club super_admin

$ git show 5951c1a -- carta-llamados.html | grep -n "headText\|tituloHtml\|captionCat\|p-head-titulo\|p-head-text"
29:-      .p-head-text { font-size: 11px; font-weight: 700; flex: 1; line-height: 1.35; }
41:+      .p-head-titulo { font-size: 10pt; font-weight: 800; color: #111; flex: 1; line-height: 1.3; }
170:-        <span class="p-head-text">${headText}</span>
177:+    const captionCat = cat ? `CARRERA ${cat.nombre.toUpperCase()}` : '';
179:+    const tituloHtml = `${condMain || c.nombre || ''}${bonoGanTag}`;
181:+      ${captionCat ? `<div class="p-carrera-caption">${captionCat}</div>` : ''}
184:+          <div class="p-head-titulo">${tituloHtml}</div>

```

- `86ec3cd` (2026-05-19) agregó `turnoLabel` con el formato `CARRERA N (TURNO M)` y lo metía en `headText` → `<span class="p-head-text">${headText}</span>`.
- `5951c1a` (2026-05-20, "rediseño completo de PDF estilo Dolores") reemplazó ese span por caption + `tituloHtml`, y borró el uso de `headText` pero **no su cálculo**. Desde entonces el PDF no muestra el número. Es decir: el número **estuvo** un día en el PDF y se perdió en el rediseño; no es que nunca haya estado.

### 1.3 La pantalla, para comparar — líneas 969–981

```
    // Título del encabezado: "TURNO N — Condición: xxx — Categoría — 800 mts"
    // El turno que se muestra es la POSICIÓN en la lista, que es lo que va a quedar
    // persistido al guardar. Si difiere del que está en la DB, se avisa al lado.
    const turnoVista = idx + 1;
    const tituloPartes = [
      `TURNO ${turnoVista}`,
      condMain ? `Condición: ${condMain}` : null,
      cat?.nombre || null,
      `${c.distancia_metros} mts`,
    ].filter(Boolean);
    const tituloHeader = tituloPartes.join(' — ');
    const cambioTag = turnoVista !== c.numero_turno
      ? `<span class="carrera-turno-cambio">antes ${c.numero_turno}</span>` : '';

```

Formato pantalla: `TURNO {idx+1} — Condición: {condMain} — {categoría} — {distancia} mts`. En el PDF categoría y distancia ya están en otro lado (caption y chip verde), así que lo único que falta trasladar es el `TURNO N`.

---

## 2. ¿El dato está disponible?

Sí. `carreras` se carga con `select('*')`:

```
  ordenPropuesto = null;
  await recargarCarreras();
}

async function recargarCarreras() {
  const { data, error } = await sb.from('carreras')
    .select('*').eq('reunion_id', reunionId).order('numero_turno');
  if (error) { console.error('[recargarCarreras]', error); throw error; }

```

`c.numero_turno` y `c.numero_carrera_programa` están en cada `c` del `carreras.map(...)` de `renderPrint()`. De hecho la línea 1054–1056 ya los lee. **No hay que traer nada ni tocar la query.**

---

## 3. ¿`numero_turno` o `numero_carrera_programa`?

**`numero_turno`.** Tres razones:

1. **Semántica:** la carta es pre-inscripción; el sorteo/numeración de programa viene después de la ratificación. El documento habla de turnos (la pantalla, el modal "Editar Turno N", el reordenamiento ▲▼ con RPC `reordenar_turnos`, todo es turno).
2. **Datos reales:** en R9, ya ratificada, `numero_carrera_programa` está cargado y **no coincide** con el turno:

```sql
select r.numero_publico, r.numero, r.fecha, c.numero_turno, c.numero_carrera_programa, c.estado, c.distancia_metros,
  cat.nombre as categoria, cat.codigo,
  coalesce(c.condicion_handicap, c.nombre) as cond_main, length(coalesce(c.condicion_handicap, c.nombre)) as len_cond,
  (c.distribucion_premios->>'bono_ganador')::numeric as bono_ganador
from carreras c
join reuniones r on r.id = c.reunion_id
left join categorias_carrera cat on cat.id = c.categoria_id
where r.id in ('cafa37d6-89f4-45cb-a0d9-835bc27407e9')
   or (r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' and r.numero_publico = 8)
order by r.fecha, c.numero_turno;
```

| numero_publico | numero | fecha | turno | nro_prog | estado | dist | categoría | cod | cond_main | len | bono_ganador |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | 9 | 2026-09-20 | 1 | 1 | NULL | 800 | Oficial No Computable | ONC | Todo caballo 3 años perdedor. | 29 | 250000 |
| 8 | 9 | 2026-09-20 | 2 | NULL | anulada | 800 | Oficial No Computable | ONC | Todo caballo 4 años perdedor. | 29 | 250000 |
| 8 | 9 | 2026-09-20 | 3 | 7 | abierta | 1200 | Oficial No Computable | ONC | Todo caballo 4 años perdedor. | 29 | 250000 |
| 8 | 9 | 2026-09-20 | 4 | 2 | abierta | 800 | Oficial No Computable | ONC | Todo caballo 5 años y + edad perdedor. | 38 | 250000 |
| 8 | 9 | 2026-09-20 | 5 | 4 | abierta | 1000 | Oficial No Computable | ONC | Todo caballo 3 y 4 años ganador de 1 o 2 carreras. | 50 | 250000 |
| 8 | 9 | 2026-09-20 | 6 | 3 | abierta | 1000 | Oficial No Computable | ONC | Todo caballo de 5 años ganador de 1 o 2 carreras. | 49 | 250000 |
| 8 | 9 | 2026-09-20 | 7 | 5 | abierta | 1100 | Oficial No Computable | ONC | Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | 57 | 250000 |
| 8 | 9 | 2026-09-20 | 8 | NULL | anulada | 1200 | Oficial No Computable | ONC | Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | 54 | 250000 |
| 8 | 9 | 2026-09-20 | 9 | 6 | abierta | 1100 | Oficial No Computable | ONC | Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras. | 66 | NULL |
| 8 | 9 | 2026-09-20 | 10 | NULL | anulada | 1100 | Oficial Computable | OC | Yeguas 5 años y + edad perdedoras. | 34 | NULL |
| 8 | 9 | 2026-09-20 | 11 | 8 | abierta | 1200 | Oficial Computable | OC | Todo caballo 5 años y + edad perdedor. | 38 | NULL |

(La reunión del 20/09 es `numero` 9 / `numero_publico` 8 — la "R9" del CLAUDE.md. El `OR` de la query no trajo otra fila.)

   Si el PDF usara el `turnoLabel` muerto tal cual, hoy R9 imprimiría "CARRERA 7 (TURNO 3)", "CARRERA 2 (TURNO 4)"… en la carta. Ruido para un documento que se manda antes del sorteo — y que Yesi puede reimprimir después.
3. **Consistencia con la pantalla:** la pantalla muestra `idx+1` sobre `carrerasEnOrden()` (que es `carreras` en orden de `numero_turno` salvo que haya un reorden sin guardar). El PDF itera `carreras` (orden DB). Con `c.numero_turno` ambos coinciden en el estado guardado; durante un reorden sin guardar la pantalla muestra el número *propuesto* y el PDF el *persistido* — comportamiento aceptable (no se imprime a mitad de un reorden; y si se hace, el PDF refleja lo que está en la base). Alternativa: hacer que `renderPrint()` itere `carrerasEnOrden()` con `idx+1`, igual que la pantalla — pero eso imprime un orden que todavía no existe en la DB. **Recomendación: `c.numero_turno`.**

Nota al margen (no bloquea): `renderPrint()` **no filtra anuladas** (`select('*')` sin `.neq/.or` de estado, líneas 601–602). R9 tiene 3 turnos anulados (T2, T8, T10) que hoy salen en la carta si se reimprime. En la carta original (pre-inscripción) no hay anuladas, así que en el uso normal no aparece; queda anotado como pregunta abierta en §6.

---

## 4. Ancho: cómo quedaría el encabezado con el número

### 4.1 Geometría del encabezado (CSS real, líneas 188–197 y 228)

```
      .p-carrera-wrap { margin-bottom: 8pt; page-break-inside: avoid; }
      .p-carrera-caption { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.8pt; color: #245033; text-transform: uppercase; margin-bottom: 2pt; padding-left: 2pt; }
      .p-carrera-box { border: 1.5px solid #245033; border-radius: 4px; background: #fff; overflow: hidden; }
      .p-carrera-head { display: flex; align-items: center; justify-content: space-between; gap: 10pt; padding: 5pt 8pt; }
      .p-head-titulo { font-size: 10pt; font-weight: 800; color: #111; flex: 1; line-height: 1.3; }
      .p-head-bono { color: #dc2626; font-weight: 800; }
      .p-head-dist { font-size: 11pt; font-weight: 900; background: #245033; color: #fff; padding: 3pt 10pt; border-radius: 4px; white-space: nowrap; }
      .p-carrera-body { padding: 4pt 8pt 6pt; border-top: 1px solid #e5e7eb; }
      .p-linea-peso { font-size: 10.5pt; color: #444; margin-bottom: 2pt; line-height: 1.35; }
      .p-linea-bolsa { font-size: 9pt; font-weight: 700; color: #111; line-height: 1.4; }

      @page { size: A4 portrait; margin: 12mm; }
```

- `@page` A4 portrait, margen 12mm → **186mm** de contenido.
- `.p-carrera-head` es `display:flex`; `.p-head-titulo` es `flex:1` (10pt Arial, peso 800, `line-height:1.3`), `.p-head-dist` es `white-space:nowrap` (el chip "1000 m").
- **Consecuencia:** el título es un bloque que **envuelve a 2 líneas** cuando no entra; no desborda, no achica ni empuja el chip, y la caja crece 13pt por línea extra. No hay `white-space:nowrap`, `overflow:hidden` ni `text-overflow` en el título. **No hay forma de que "rompa el ancho".** La única pregunta es cuántos títulos pasan a 2 líneas.

### 4.2 Medición con Chromium headless

Método: se extrajo el bloque interno de `@media print` (líneas 162–228 de `carta-llamados.html`) tal cual a `print.css`, se armó un mock con la misma estructura `p-carrera-wrap > p-carrera-caption + p-carrera-box > p-carrera-head > p-head-titulo + p-head-dist` a 186mm de ancho, con **los 11 turnos reales de R9** más los **3 casos más largos de la historia del club** y 1 sintético (68 chars + bono + turno de 2 dígitos). Se renderizó en 4 variantes y se midió `.p-head-titulo` (`getBoundingClientRect().height / lineHeight` = líneas; `scrollWidth > clientWidth` = overflow).

Fuente: el VPS no tiene Arial; `fc-match Arial` da DejaVu Sans (≈10% más ancha). Se bajó `fonts-liberation` con `apt-get download` + `dpkg -x` al scratchpad y se inyectó **Liberation Sans** como `Arial` por `@font-face` (métricas idénticas a Arial — es su reemplazo métrico). `document.fonts.check('bold 10pt Arial')` → `true`. Con DejaVu (primera corrida, descartada) los números daban peor: 10/15 a 2 líneas en la variante B; con métricas de Arial, 5/15.

Script: `docs/diagnosticos/img/2026-09-17_carta-numero-turno/medir_encabezado.mjs` (autocontenido; requiere `LD_LIBRARY_PATH` con las libs de Chromium, ver §5).

Query de los casos más largos del club:

```sql
select r.numero_publico, c.numero_turno, c.distancia_metros, length(coalesce(c.condicion_handicap, c.nombre)) as len_cond, coalesce(c.condicion_handicap, c.nombre) as cond_main, (c.distribucion_premios->>'bono_ganador')::numeric as bono_ganador
from carreras c join reuniones r on r.id=c.reunion_id
where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'
order by len_cond desc nulls last limit 8;
```

| numero_publico | turno | dist | len | cond_main | bono_ganador |
|---|---|---|---|---|---|
| 9 | 11 | 1000 | 68 | Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras. | NULL |
| NULL | 11 | 1000 | 67 | Especial todo caballo de 4 años y + edad ganador de 2 o + carreras. | NULL |
| 7 | 10 | 1000 | 67 | Especial todo caballo de 4 años y + edad ganador de 2 o + carreras. | NULL |
| 8 | 9 | 1100 | 66 | Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras. | NULL |
| 6 | 11 | 1000 | 64 | Especial todo caballo 4 años y + edad ganador de 2 o + carreras. | NULL |
| 7 | 8 | 1200 | 61 | Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras | 250000 |
| 7 | 5 | 1000 | 61 | Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras | 250000 |
| 9 | 10 | 1000 | 59 | Todo caballo 6 años y mas edad ganadores de 1 o 2 carreras. | NULL |

El peor caso real es **61 chars + bono** (R7 T5/T8): hoy ya va a 2 líneas sin número.

### 4.3 Resultado — salida cruda completa

Comando:

```
LD_LIBRARY_PATH=<libs chromium> node medir_encabezado.mjs
```

```
font check: true
Variante A — actual (sin número): 3/15 títulos a 2 líneas, 0 overflow
  R9 T1                 60c  1 línea(s)  texto=388px / caja=598.7px    | Todo caballo 3 años perdedor. | BONO de $ 250.000 al ganador
  R9 T2                 60c  1 línea(s)  texto=388px / caja=598.7px    | Todo caballo 4 años perdedor. | BONO de $ 250.000 al ganador
  R9 T3                 60c  1 línea(s)  texto=388px / caja=590.7px    | Todo caballo 4 años perdedor. | BONO de $ 250.000 al ganador
  R9 T4                 69c  1 línea(s)  texto=445px / caja=598.7px    | Todo caballo 5 años y + edad perdedor. | BONO de $ 250.000 al ganador
  R9 T5                 81c  1 línea(s)  texto=513px / caja=590.7px    | Todo caballo 3 y 4 años ganador de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T6                 80c  1 línea(s)  texto=510px / caja=590.7px    | Todo caballo de 5 años ganador de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T7                 88c  1 línea(s)  texto=562px / caja=591.7px    | Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T8                 85c  1 línea(s)  texto=546px / caja=590.7px    | Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T9                 66c  1 línea(s)  texto=424px / caja=591.7px    | Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.
  R9 T10                34c  1 línea(s)  texto=225px / caja=591.7px    | Yeguas 5 años y + edad perdedoras.
  R9 T11                38c  1 línea(s)  texto=245px / caja=590.7px    | Todo caballo 5 años y + edad perdedor.
  R7 T5 (61c+bono)      92c  2 línea(s)  texto=540px / caja=590.7px    | Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras | BONO de $ 250.000 al ganador
  R7 T8 (61c+bono)      92c  2 línea(s)  texto=540px / caja=590.7px    | Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras | BONO de $ 250.000 al ganador
  R10 T11 (68c)         68c  1 línea(s)  texto=438px / caja=590.7px    | Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras.
  SINT T11 68c+bono     99c  2 línea(s)  texto=583px / caja=590.7px    | Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras. | BONO de $ 250.000 al ganador
Variante B — TURNO N — cond: 5/15 títulos a 2 líneas, 0 overflow
  R9 T1                 70c  1 línea(s)  texto=465px / caja=598.7px    | TURNO 1 — Todo caballo 3 años perdedor. | BONO de $ 250.000 al ganador
  R9 T2                 70c  1 línea(s)  texto=465px / caja=598.7px    | TURNO 2 — Todo caballo 4 años perdedor. | BONO de $ 250.000 al ganador
  R9 T3                 70c  1 línea(s)  texto=465px / caja=590.7px    | TURNO 3 — Todo caballo 4 años perdedor. | BONO de $ 250.000 al ganador
  R9 T4                 79c  1 línea(s)  texto=522px / caja=598.7px    | TURNO 4 — Todo caballo 5 años y + edad perdedor. | BONO de $ 250.000 al ganador
  R9 T5                 91c  1 línea(s)  texto=590px / caja=590.7px    | TURNO 5 — Todo caballo 3 y 4 años ganador de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T6                 90c  1 línea(s)  texto=587px / caja=590.7px    | TURNO 6 — Todo caballo de 5 años ganador de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T7                 98c  2 línea(s)  texto=584px / caja=591.7px    | TURNO 7 — Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T8                 95c  2 línea(s)  texto=568px / caja=590.7px    | TURNO 8 — Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T9                 76c  1 línea(s)  texto=501px / caja=591.7px    | TURNO 9 — Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.
  R9 T10                45c  1 línea(s)  texto=309px / caja=591.7px    | TURNO 10 — Yeguas 5 años y + edad perdedoras.
  R9 T11                49c  1 línea(s)  texto=328px / caja=590.7px    | TURNO 11 — Todo caballo 5 años y + edad perdedor.
  R7 T5 (61c+bono)     102c  2 línea(s)  texto=552px / caja=590.7px    | TURNO 5 — Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras | BONO de $ 250.000 al ganador
  R7 T8 (61c+bono)     102c  2 línea(s)  texto=552px / caja=590.7px    | TURNO 8 — Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras | BONO de $ 250.000 al ganador
  R10 T11 (68c)         79c  1 línea(s)  texto=521px / caja=590.7px    | TURNO 11 — Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras.
  SINT T11 68c+bono    110c  2 línea(s)  texto=590px / caja=590.7px    | TURNO 11 — Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras. | BONO de $ 250.000 al ganador
Variante C — N. cond: 3/15 títulos a 2 líneas, 0 overflow
  R9 T1                 63c  1 línea(s)  texto=403px / caja=598.7px    | 1. Todo caballo 3 años perdedor. | BONO de $ 250.000 al ganador
  R9 T2                 63c  1 línea(s)  texto=403px / caja=598.7px    | 2. Todo caballo 4 años perdedor. | BONO de $ 250.000 al ganador
  R9 T3                 63c  1 línea(s)  texto=403px / caja=590.7px    | 3. Todo caballo 4 años perdedor. | BONO de $ 250.000 al ganador
  R9 T4                 72c  1 línea(s)  texto=460px / caja=598.7px    | 4. Todo caballo 5 años y + edad perdedor. | BONO de $ 250.000 al ganador
  R9 T5                 84c  1 línea(s)  texto=528px / caja=590.7px    | 5. Todo caballo 3 y 4 años ganador de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T6                 83c  1 línea(s)  texto=525px / caja=590.7px    | 6. Todo caballo de 5 años ganador de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T7                 91c  1 línea(s)  texto=577px / caja=591.7px    | 7. Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T8                 88c  1 línea(s)  texto=561px / caja=590.7px    | 8. Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T9                 69c  1 línea(s)  texto=439px / caja=591.7px    | 9. Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.
  R9 T10                38c  1 línea(s)  texto=247px / caja=591.7px    | 10. Yeguas 5 años y + edad perdedoras.
  R9 T11                42c  1 línea(s)  texto=266px / caja=590.7px    | 11. Todo caballo 5 años y + edad perdedor.
  R7 T5 (61c+bono)      95c  2 línea(s)  texto=555px / caja=590.7px    | 5. Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras | BONO de $ 250.000 al ganador
  R7 T8 (61c+bono)      95c  2 línea(s)  texto=555px / caja=590.7px    | 8. Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras | BONO de $ 250.000 al ganador
  R10 T11 (68c)         72c  1 línea(s)  texto=459px / caja=590.7px    | 11. Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras.
  SINT T11 68c+bono    103c  2 línea(s)  texto=589px / caja=590.7px    | 11. Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras. | BONO de $ 250.000 al ganador
Variante D — TURNO N — Condición: cond (igual pantalla): 8/15 títulos a 2 líneas, 0 overflow
  R9 T1                 81c  1 línea(s)  texto=537px / caja=598.7px    | TURNO 1 — Condición: Todo caballo 3 años perdedor. | BONO de $ 250.000 al ganador
  R9 T2                 81c  1 línea(s)  texto=537px / caja=598.7px    | TURNO 2 — Condición: Todo caballo 4 años perdedor. | BONO de $ 250.000 al ganador
  R9 T3                 81c  1 línea(s)  texto=537px / caja=590.7px    | TURNO 3 — Condición: Todo caballo 4 años perdedor. | BONO de $ 250.000 al ganador
  R9 T4                 90c  1 línea(s)  texto=594px / caja=598.7px    | TURNO 4 — Condición: Todo caballo 5 años y + edad perdedor. | BONO de $ 250.000 al ganador
  R9 T5                102c  2 línea(s)  texto=542px / caja=590.7px    | TURNO 5 — Condición: Todo caballo 3 y 4 años ganador de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T6                101c  2 línea(s)  texto=589px / caja=590.7px    | TURNO 6 — Condición: Todo caballo de 5 años ganador de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T7                109c  2 línea(s)  texto=591px / caja=591.7px    | TURNO 7 — Condición: Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T8                106c  2 línea(s)  texto=575px / caja=590.7px    | TURNO 8 — Condición: Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | BONO de $ 250.000 al ganador
  R9 T9                 87c  1 línea(s)  texto=573px / caja=591.7px    | TURNO 9 — Condición: Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.
  R9 T10                56c  1 línea(s)  texto=381px / caja=591.7px    | TURNO 10 — Condición: Yeguas 5 años y + edad perdedoras.
  R9 T11                60c  1 línea(s)  texto=400px / caja=590.7px    | TURNO 11 — Condición: Todo caballo 5 años y + edad perdedor.
  R7 T5 (61c+bono)     113c  2 línea(s)  texto=552px / caja=590.7px    | TURNO 5 — Condición: Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras | BONO de $ 250.000 al ganador
  R7 T8 (61c+bono)     113c  2 línea(s)  texto=552px / caja=590.7px    | TURNO 8 — Condición: Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras | BONO de $ 250.000 al ganador
  R10 T11 (68c)         90c  2 línea(s)  texto=535px / caja=590.7px    | TURNO 11 — Condición: Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras.
  SINT T11 68c+bono    121c  2 línea(s)  texto=535px / caja=590.7px    | TURNO 11 — Condición: Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras. | BONO de $ 250.000 al ganador
```

`texto` = ancho real del contenido (px CSS a 96dpi; 186mm ≈ 703px), `caja` = ancho disponible del título (varía 590–599px según el chip "800 m" vs "1000 m").

### 4.4 Resumen

| Variante | Formato | R9 a 2 líneas | Histórico+sintético a 2 líneas | Overflow |
|---|---|---|---|---|
| **A** (hoy) | `Todo caballo 3 años perdedor. \| BONO…` | **0/11** | 3/4 (R7 T5, R7 T8, sintético) | 0 |
| **B** | `TURNO 1 — Todo caballo 3 años perdedor. \| BONO…` | **2/11** (T7, T8) | 3/4 | 0 |
| **C** | `1. Todo caballo 3 años perdedor. \| BONO…` | **0/11** | 3/4 | 0 |
| **D** (= pantalla) | `TURNO 1 — Condición: Todo caballo 3 años perdedor. \| BONO…` | **4/11** (T5–T8) | 4/4 | 0 |

- **Ninguna variante desborda.** Lo único que cambia es la cantidad de cajas que crecen 13pt.
- **B** ("TURNO N — condición") es lo que pide Fede y lo que ya usa el PDF de inscriptos (`TURNO N — NOMBRE`). Cuesta 2 títulos a 2 líneas en R9 (T7 con 57 chars y T8 con 54 chars, ambos con bono al ganador). T8 está anulado, así que en la carta original de R9 hubiera sido 1. Sin bono al ganador, **ninguna condición del club** (hasta 68 chars con `TURNO 11 — `) llega a 2 líneas.
- **D** (copiar literal el formato de pantalla, con "Condición:") duplica el texto del prefijo por nada — en el PDF la palabra "Condición" no aporta, y lleva 4 turnos de R9 a 2 líneas. No recomendada.
- **C** ("1. …") es la más compacta pero no es lo que pidió Fede y no coincide con inscriptos.
- Impacto en paginado: cada línea extra son 13pt (≈4.6mm). Con B en R9: 2 × 4.6 = 9mm. No hay riesgo de que un turno quede partido entre páginas (`.p-carrera-wrap { page-break-inside: avoid }`, línea 188).

### 4.5 Cómo se vería — imágenes

Render del mock a 2× (mismo CSS, Liberation Sans = métricas Arial). Los 11 primeros bloques son R9 en orden de turno; los 4 últimos son los casos históricos/sintético.

- Hoy (A): `img/2026-09-17_carta-numero-turno/variante_A.png`
- **Propuesta (B):** `img/2026-09-17_carta-numero-turno/variante_B.png`
- N. (C): `img/2026-09-17_carta-numero-turno/variante_C.png`
- Igual pantalla (D): `img/2026-09-17_carta-numero-turno/variante_D.png`

Ejemplo B, T1 de R9 (1 línea):

> **TURNO 1 — Todo caballo 3 años perdedor.** <span style="color:#dc2626">| BONO de $ 250.000 al ganador</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [800 m]

Ejemplo B, T7 de R9 (2 líneas — el peor de la reunión):

> **TURNO 7 — Todo caballo 6 años y + edad ganadores de 1 o 2 carreras.** <span style="color:#dc2626">| BONO de $ 250.000 al</span> &nbsp;&nbsp; [1100 m]
> <span style="color:#dc2626">ganador</span>

### 4.6 Cambio que haría falta (NO aplicado — para cuando se pida)

Un solo punto: la línea 1080 de `carta-llamados.html`.

```javascript
// hoy
const tituloHtml = `${condMain || c.nombre || ''}${bonoGanTag}`;
// propuesto (variante B)
const tituloHtml = `TURNO ${c.numero_turno} &mdash; ${condMain || c.nombre || ''}${bonoGanTag}`;
```

Y de paso borrar las líneas 1051–1058 (`catLabel`, `turnoLabel`, `headParts`, `headText`), que son código muerto y confunden — el comentario de 1051 describe un encabezado que ya no existe. Si se quiere que el número no se parta del guion cuando envuelve, `TURNO ${n}&nbsp;&mdash;&nbsp;` — con las medidas de arriba no hace falta: en ningún caso el corte cae ahí.

---

## 5. Los otros PDF — inscriptos y ratificados

```
$ git grep -n "numero_turno\|numero_carrera_programa\|TURNO \${\|Carrera \${" main -- inscripciones.html ratificacion.html
main:inscripciones.html:470:    .select('id,numero_turno,nombre,distancia_metros,tipo_pista,condicion_sexo,edad_minima_anos,edad_maxima_anos,bolsa_total,distribucion_premios,cupo_maximo,condicion_handicap,condicion_adicional,cierre_inscripcion,estado,categoria_id,categorias_carrera(nombre)')
main:inscripciones.html:471:    .eq('reunion_id', rid).order('numero_turno');
main:inscripciones.html:476:      let label = `Turno ${c.numero_turno}`;
main:inscripciones.html:582:    <div class="carrera-num">${esc(c.numero_turno ?? '—')}</div>
main:inscripciones.html:584:      <div class="carrera-name">${esc(c.nombre || 'Turno ' + (c.numero_turno ?? ''))}</div>
main:inscripciones.html:892:      .select('id,numero_turno,nombre,bolsa_total,distribucion_premios,distancia_metros,tipo_pista,edad_minima_anos,edad_maxima_anos,condicion_sexo,condicion_handicap,estado,categoria_id,categorias_carrera(nombre,es_oficial,es_computable)')
main:inscripciones.html:894:      .order('numero_turno'),
main:inscripciones.html:1010:      ? `TURNO ${car.numero_turno} — ${car.nombre.toUpperCase()}`
main:inscripciones.html:1011:      : `TURNO ${car.numero_turno}`;
main:inscripciones.html:1049:    const theadCols = carsConInsc.map(c => `<th>T${c.numero_turno}</th>`).join('');
main:ratificacion.html:281:      .select('id,numero_turno,numero_carrera_programa,hora_estimada,nombre,bolsa_total,distribucion_premios,distancia_metros,tipo_pista,edad_minima_anos,edad_maxima_anos,condicion_sexo,condicion_handicap,estado,categoria_id,categorias_carrera(nombre,es_oficial,es_computable)')
main:ratificacion.html:286:    const aNum = a.numero_carrera_programa != null ? a.numero_carrera_programa : (a.numero_turno + 10000);
main:ratificacion.html:287:    const bNum = b.numero_carrera_programa != null ? b.numero_carrera_programa : (b.numero_turno + 10000);
main:ratificacion.html:361:    const numCarrera = car.numero_carrera_programa != null ? car.numero_carrera_programa : car.numero_turno;
main:ratificacion.html:386:          <div class="pi-titulo-row"><span>Carrera ${numCarrera}</span>${horaHHMM ? `<span>${horaHHMM}</span>` : ''}</div>
main:ratificacion.html:486:  const { error } = await sb.from('carreras').update({ numero_carrera_programa: numero }).eq('id', carreraId);
main:ratificacion.html:586:    sb.from('carreras').select('*').eq('reunion_id', rid).order('numero_turno'),
main:ratificacion.html:654:        <div class="carrera-num">${car.numero_turno}</div>
main:ratificacion.html:655:        <div class="carrera-title">Turno ${car.numero_turno} — ${buildCondCompleta(car)}${renderCategoriaBadge(car)}</div>
main:ratificacion.html:680:        <button class="btn-turno${idx===0?' active':''}" onclick="goToTurno('${car.id}',this)">${car.numero_turno}</button>
main:ratificacion.html:681:        <input type="number" min="1" max="99" value="${car.numero_carrera_programa||''}" class="input-prog" onblur="updateNumeroCarreraPrograma('${car.id}', this.value)"${isCerrada?' disabled':''}>
main:ratificacion.html:787:  toast(`Carrera ${label}`, 'success');

$ git show main:inscripciones.html | sed -n 1009,1011p; sed -n 1024,1027p
    const turnoBand = car.nombre
      ? `TURNO ${car.numero_turno} — ${car.nombre.toUpperCase()}`
      : `TURNO ${car.numero_turno}`;
    const tituloHtml = bolsaStr
      ? `<div class="pi-titulo"><span class="pi-bolsa-inline">${bolsaStr}</span> · ${turnoBand}</div>`
      : `<div class="pi-titulo">${turnoBand}</div>`;
    const especialHtml = especial ? '<span class="pi-especial">ESPECIAL</span> ' : '';

$ git show main:ratificacion.html | sed -n 361p; sed -n 383,386p
    const numCarrera = car.numero_carrera_programa != null ? car.numero_carrera_programa : car.numero_turno;
    const tituloHtml = isAnulada
      ? ''
      : `<div class="pi-titulo">
          <div class="pi-titulo-row"><span>Carrera ${numCarrera}</span>${horaHHMM ? `<span>${horaHHMM}</span>` : ''}</div>
```

- **Inscriptos** (`inscripciones.html:1009–1011` → `turnoBand`): `TURNO N — NOMBRE` o `TURNO N`. **Ya lleva el número**, con `numero_turno`. Nada que hacer.
- **Ratificados** (`ratificacion.html:361` + `:386`): `Carrera N` con `numero_carrera_programa` y fallback a `numero_turno`. **Ya lleva el número**; usa el de programa porque es el PDF post-sorteo, y la lista viene ordenada por ese número (líneas 286–287). Correcto para su momento.
- Programa oficial (`programa-oficial*.html`) no lo pidieron; usa `numero_carrera_programa` (es el programa).

El único de los tres PDF sin número es el de la carta.

---

## 6. Preguntas abiertas / notas

1. **¿Anuladas en la carta?** `renderPrint()` imprime todo `carreras` sin filtrar `estado`. Si Yesi reimprime la carta de R9 hoy, salen T2/T8/T10 anulados como si nada. No es parte de este pedido; se anota.
2. **Reorden sin guardar:** pantalla muestra `idx+1`, PDF mostraría `numero_turno` persistido. Divergen sólo mientras hay un reorden pendiente. Aceptable; alternativa (iterar `carrerasEnOrden()` en `renderPrint()`) imprime un orden que no está en la DB — peor.
3. **Confirmar con Fede el formato exacto:** `TURNO 1 — …` (B, recomendada, = PDF de inscriptos) vs `1. …` (C). "Condición:" (D) no se recomienda — es lo que hace la pantalla pero en papel sólo consume ancho.
4. **`docs/SERVER.md` dice** que las libs de Chromium están en `~/chromium-libs/…`. **No existen ahí**: `ls ~/chromium-libs` → `No such file or directory`. Están en el scratchpad de la sesión del 17/09 (`/tmp/claude-1000/-home-clio-dev-SGH/140bdc16-…/scratchpad/libs/usr/lib/x86_64-linux-gnu`), que se puede borrar en cualquier momento. Conviene o copiarlas a `~/chromium-libs` o corregir el doc. Con esa ruta `ldd … | grep -c "not found"` → `0` y el headless corre. Lo mismo para `fonts-liberation`: no está instalado en el VPS; el render del programa oficial (`tests/render_programa_pdf.mjs`) está midiendo con DejaVu Sans, no con Arial — las columnas que "envuelven" ahí pueden ser menos en la impresora real de Yesi (DejaVu es ≈10% más ancha, cf. §4.2).

---

## A. Salida cruda completa del relevamiento de código

```
$ git grep -n "renderPrint\|turnoLabel\|headText\|tituloHtml\|p-head-titulo\|p-carrera-caption" main -- carta-llamados.html
main:carta-llamados.html:159:    /* PRINT — documento separado generado por renderPrint() */
main:carta-llamados.html:189:      .p-carrera-caption { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.8pt; color: #245033; text-transform: uppercase; margin-bottom: 2pt; padding-left: 2pt; }
main:carta-llamados.html:192:      .p-head-titulo { font-size: 10pt; font-weight: 800; color: #111; flex: 1; line-height: 1.3; }
main:carta-llamados.html:198:      .p-carrera-wrap[data-cat="OC"]  .p-carrera-caption { color: #1E40AF; }
main:carta-llamados.html:201:      .p-carrera-wrap[data-cat="ONC"] .p-carrera-caption { color: #16A34A; }
main:carta-llamados.html:204:      .p-carrera-wrap[data-cat="NO"]  .p-carrera-caption { color: #B45309; }
main:carta-llamados.html:207:      .p-carrera-wrap[data-cat="CC"]  .p-carrera-caption { color: #047857; }
main:carta-llamados.html:230:      body.print-bn .p-carrera-wrap[data-cat="OC"]  .p-carrera-caption,
main:carta-llamados.html:231:      body.print-bn .p-carrera-wrap[data-cat="ONC"] .p-carrera-caption,
main:carta-llamados.html:232:      body.print-bn .p-carrera-wrap[data-cat="NO"]  .p-carrera-caption,
main:carta-llamados.html:233:      body.print-bn .p-carrera-wrap[data-cat="CC"]  .p-carrera-caption {
main:carta-llamados.html:1013:  renderPrint();
main:carta-llamados.html:1016:function renderPrint() {
main:carta-llamados.html:1054:    const turnoLabel = c.numero_carrera_programa
main:carta-llamados.html:1057:    const headParts = [turnoLabel, catLabel, condMain].filter(Boolean);
main:carta-llamados.html:1058:    const headText  = headParts.join(' &mdash; ');
main:carta-llamados.html:1080:    const tituloHtml = `${condMain || c.nombre || ''}${bonoGanTag}`;
main:carta-llamados.html:1082:      ${captionCat ? `<div class="p-carrera-caption">${captionCat}</div>` : ''}
main:carta-llamados.html:1085:          <div class="p-head-titulo">${tituloHtml}</div>
main:carta-llamados.html:1137:  renderPrint();

$ git show main:carta-llamados.html | sed -n 969,981p
    // Título del encabezado: "TURNO N — Condición: xxx — Categoría — 800 mts"
    // El turno que se muestra es la POSICIÓN en la lista, que es lo que va a quedar
    // persistido al guardar. Si difiere del que está en la DB, se avisa al lado.
    const turnoVista = idx + 1;
    const tituloPartes = [
      `TURNO ${turnoVista}`,
      condMain ? `Condición: ${condMain}` : null,
      cat?.nombre || null,
      `${c.distancia_metros} mts`,
    ].filter(Boolean);
    const tituloHeader = tituloPartes.join(' — ');
    const cambioTag = turnoVista !== c.numero_turno
      ? `<span class="carrera-turno-cambio">antes ${c.numero_turno}</span>` : '';

$ git show main:carta-llamados.html | sed -n 1042,1094p
  const carrerasHtml = carreras.map(c => {
    const cat     = categorias.find(x => x.id === c.categoria_id);
    const dist    = c.distribucion_premios || {};
    const bolsa   = c.bolsa_total || 0;
    const bonoGan    = dist.bono_ganador       || 0;
    const bonoPosH   = dist.bono_posicion_hasta || 0;
    const bonoPosD   = dist.bono_posicion_desde || 6;
    const bonoPosMon = dist.bono_posicion_monto || 0;

    // Encabezado: "TURNO N — CATEGORÍA (cód) — condición"
    const catLabel  = cat ? cat.nombre.toUpperCase() + (cat.codigo ? ` (${cat.codigo})` : '') : '';
    const condMain  = c.condicion_handicap || c.nombre || '';
    const turnoLabel = c.numero_carrera_programa
      ? `CARRERA ${c.numero_carrera_programa} (TURNO ${c.numero_turno})`
      : `TURNO ${c.numero_turno}`;
    const headParts = [turnoLabel, catLabel, condMain].filter(Boolean);
    const headText  = headParts.join(' &mdash; ');

    // Condición adicional (línea pequeña bajo encabezado)
    const condAdicional = c.condicion_adicional || '';

    // Línea de bolsa (bono ganador va inline en el título, no aquí)
    const { puestos: puestosEfectivos, total: bolsaNominal } = repartoDisplay(bolsa, dist);
    let bolsaLine = '';
    if (bolsa > 0) {
      const puestos = Object.entries(dist)
        .filter(([k,v]) => !EXCLUIR.includes(k) && Number(v) > 0)
        .sort(([a],[b]) => parseInt(a) - parseInt(b))
        .map(([pos]) => `${ORDINAL[parseInt(pos)-1]||pos+'°'} ${formatMonto(Math.round(puestosEfectivos[pos]||0))}`);
      bolsaLine = `BOLSA: ${formatMonto(bolsaNominal)}`;
      if (puestos.length)         bolsaLine += ' &mdash; ' + puestos.join(' &mdash; ');
      // La leyenda del piso por puesto se saco del impreso a pedido de secretaria. El piso
      // sigue aplicandose en repartoDisplay(): bolsaNominal y los montos por puesto no cambian.
      if (bonoPosH && bonoPosMon) bolsaLine += ` &mdash; BONO ${bonoPosD}°-${bonoPosH}° ${formatMonto(bonoPosMon)}/puesto`;
    }

    const captionCat = cat ? `CARRERA ${cat.nombre.toUpperCase()}` : '';
    const bonoGanTag = bonoGan > 0 ? ` <span class="p-head-bono">| BONO de ${formatMonto(bonoGan)} al ganador</span>` : '';
    const tituloHtml = `${condMain || c.nombre || ''}${bonoGanTag}`;
    return `<div class="p-carrera-wrap" data-cat="${cat?.codigo||''}">
      ${captionCat ? `<div class="p-carrera-caption">${captionCat}</div>` : ''}
      <div class="p-carrera-box">
        <div class="p-carrera-head">
          <div class="p-head-titulo">${tituloHtml}</div>
          <div class="p-head-dist">${c.distancia_metros} m</div>
        </div>
        <div class="p-carrera-body">
          ${condAdicional ? `<div class="p-linea-peso">${condAdicional}</div>` : ''}
          ${bolsaLine     ? `<div class="p-linea-bolsa">${bolsaLine}</div>`    : ''}
        </div>
      </div>
    </div>`;
  }).join('');

$ git show main:carta-llamados.html | sed -n 596,603p
  ordenPropuesto = null;
  await recargarCarreras();
}

async function recargarCarreras() {
  const { data, error } = await sb.from('carreras')
    .select('*').eq('reunion_id', reunionId).order('numero_turno');
  if (error) { console.error('[recargarCarreras]', error); throw error; }

$ git show main:carta-llamados.html | sed -n 188,197p
      .p-carrera-wrap { margin-bottom: 8pt; page-break-inside: avoid; }
      .p-carrera-caption { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.8pt; color: #245033; text-transform: uppercase; margin-bottom: 2pt; padding-left: 2pt; }
      .p-carrera-box { border: 1.5px solid #245033; border-radius: 4px; background: #fff; overflow: hidden; }
      .p-carrera-head { display: flex; align-items: center; justify-content: space-between; gap: 10pt; padding: 5pt 8pt; }
      .p-head-titulo { font-size: 10pt; font-weight: 800; color: #111; flex: 1; line-height: 1.3; }
      .p-head-bono { color: #dc2626; font-weight: 800; }
      .p-head-dist { font-size: 11pt; font-weight: 900; background: #245033; color: #fff; padding: 3pt 10pt; border-radius: 4px; white-space: nowrap; }
      .p-carrera-body { padding: 4pt 8pt 6pt; border-top: 1px solid #e5e7eb; }
      .p-linea-peso { font-size: 10.5pt; color: #444; margin-bottom: 2pt; line-height: 1.35; }
      .p-linea-bolsa { font-size: 9pt; font-weight: 700; color: #111; line-height: 1.4; }

$ git show main:carta-llamados.html | sed -n 228p
      @page { size: A4 portrait; margin: 12mm; }

$ git log -S"headText" --format="%h %ad %s" --date=short -- carta-llamados.html
5951c1a 2026-05-20 feat(carta-llamados): rediseño completo de PDF estilo Dolores con cajas, novedades, disclaimers, sponsors y secretaría
d97efac 2026-05-09 carta-llamados PDF: encabezado de carrera en una sola línea

$ git log -S"turnoLabel" --format="%h %ad %s" --date=short -- carta-llamados.html
86ec3cd 2026-05-19 feat: forfait sin motivo + forfaits en PDF + carrera/turno en carta + selector de club super_admin

$ git show 5951c1a -- carta-llamados.html | grep -n "headText\|tituloHtml\|captionCat\|p-head-titulo\|p-head-text"
29:-      .p-head-text { font-size: 11px; font-weight: 700; flex: 1; line-height: 1.35; }
41:+      .p-head-titulo { font-size: 10pt; font-weight: 800; color: #111; flex: 1; line-height: 1.3; }
170:-        <span class="p-head-text">${headText}</span>
177:+    const captionCat = cat ? `CARRERA ${cat.nombre.toUpperCase()}` : '';
179:+    const tituloHtml = `${condMain || c.nombre || ''}${bonoGanTag}`;
181:+      ${captionCat ? `<div class="p-carrera-caption">${captionCat}</div>` : ''}
184:+          <div class="p-head-titulo">${tituloHtml}</div>

$ git grep -n "numero_turno\|numero_carrera_programa\|TURNO \${\|Carrera \${" main -- inscripciones.html ratificacion.html
main:inscripciones.html:470:    .select('id,numero_turno,nombre,distancia_metros,tipo_pista,condicion_sexo,edad_minima_anos,edad_maxima_anos,bolsa_total,distribucion_premios,cupo_maximo,condicion_handicap,condicion_adicional,cierre_inscripcion,estado,categoria_id,categorias_carrera(nombre)')
main:inscripciones.html:471:    .eq('reunion_id', rid).order('numero_turno');
main:inscripciones.html:476:      let label = `Turno ${c.numero_turno}`;
main:inscripciones.html:582:    <div class="carrera-num">${esc(c.numero_turno ?? '—')}</div>
main:inscripciones.html:584:      <div class="carrera-name">${esc(c.nombre || 'Turno ' + (c.numero_turno ?? ''))}</div>
main:inscripciones.html:892:      .select('id,numero_turno,nombre,bolsa_total,distribucion_premios,distancia_metros,tipo_pista,edad_minima_anos,edad_maxima_anos,condicion_sexo,condicion_handicap,estado,categoria_id,categorias_carrera(nombre,es_oficial,es_computable)')
main:inscripciones.html:894:      .order('numero_turno'),
main:inscripciones.html:1010:      ? `TURNO ${car.numero_turno} — ${car.nombre.toUpperCase()}`
main:inscripciones.html:1011:      : `TURNO ${car.numero_turno}`;
main:inscripciones.html:1049:    const theadCols = carsConInsc.map(c => `<th>T${c.numero_turno}</th>`).join('');
main:ratificacion.html:281:      .select('id,numero_turno,numero_carrera_programa,hora_estimada,nombre,bolsa_total,distribucion_premios,distancia_metros,tipo_pista,edad_minima_anos,edad_maxima_anos,condicion_sexo,condicion_handicap,estado,categoria_id,categorias_carrera(nombre,es_oficial,es_computable)')
main:ratificacion.html:286:    const aNum = a.numero_carrera_programa != null ? a.numero_carrera_programa : (a.numero_turno + 10000);
main:ratificacion.html:287:    const bNum = b.numero_carrera_programa != null ? b.numero_carrera_programa : (b.numero_turno + 10000);
main:ratificacion.html:361:    const numCarrera = car.numero_carrera_programa != null ? car.numero_carrera_programa : car.numero_turno;
main:ratificacion.html:386:          <div class="pi-titulo-row"><span>Carrera ${numCarrera}</span>${horaHHMM ? `<span>${horaHHMM}</span>` : ''}</div>
main:ratificacion.html:486:  const { error } = await sb.from('carreras').update({ numero_carrera_programa: numero }).eq('id', carreraId);
main:ratificacion.html:586:    sb.from('carreras').select('*').eq('reunion_id', rid).order('numero_turno'),
main:ratificacion.html:654:        <div class="carrera-num">${car.numero_turno}</div>
main:ratificacion.html:655:        <div class="carrera-title">Turno ${car.numero_turno} — ${buildCondCompleta(car)}${renderCategoriaBadge(car)}</div>
main:ratificacion.html:680:        <button class="btn-turno${idx===0?' active':''}" onclick="goToTurno('${car.id}',this)">${car.numero_turno}</button>
main:ratificacion.html:681:        <input type="number" min="1" max="99" value="${car.numero_carrera_programa||''}" class="input-prog" onblur="updateNumeroCarreraPrograma('${car.id}', this.value)"${isCerrada?' disabled':''}>
main:ratificacion.html:787:  toast(`Carrera ${label}`, 'success');

$ git show main:inscripciones.html | sed -n 1009,1011p; sed -n 1024,1027p
    const turnoBand = car.nombre
      ? `TURNO ${car.numero_turno} — ${car.nombre.toUpperCase()}`
      : `TURNO ${car.numero_turno}`;
    const tituloHtml = bolsaStr
      ? `<div class="pi-titulo"><span class="pi-bolsa-inline">${bolsaStr}</span> · ${turnoBand}</div>`
      : `<div class="pi-titulo">${turnoBand}</div>`;
    const especialHtml = especial ? '<span class="pi-especial">ESPECIAL</span> ' : '';

$ git show main:ratificacion.html | sed -n 361p; sed -n 383,386p
    const numCarrera = car.numero_carrera_programa != null ? car.numero_carrera_programa : car.numero_turno;
    const tituloHtml = isAnulada
      ? ''
      : `<div class="pi-titulo">
          <div class="pi-titulo-row"><span>Carrera ${numCarrera}</span>${horaHHMM ? `<span>${horaHHMM}</span>` : ''}</div>
```

## B. Verificación de publicación

Commit del informe + imágenes: `78fc798`.

```
$ git push -u origin reports
(ok)
$ git ls-remote origin reports
78fc798e9b29482fc69f03550752344bf0d2007f	refs/heads/reports
$ git rev-parse HEAD
78fc798e9b29482fc69f03550752344bf0d2007f
```

El commit de esta verificación (§B) es el siguiente sobre `reports`; se verifica igual abajo.
