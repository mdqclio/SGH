# Dónde se carga el orden y el sorteo de partidores (pregunta de Yesi, R9)

**Fecha**: 2026-09-14
**Commit relevado**: `main` @ `c0e7803730fbe93d4e418df3c0468040778820d7` (todo grep y lectura contra `main`; el informe se commitea en `reports`)
**Modo**: SOLO LECTURA. No se tocó código ni datos.

## 0. Guard de sesión

| Check | Resultado |
|---|---|
| `pwd` | `/home/clio/dev/SGH` ✅ |
| ref del proyecto | `unlhcuanfrtpatoipwve` ✅ |
| `SELECT count(*) FROM spcs` | **209** ⚠ — baseline en `CLAUDE.md` dice 205. Ver §5. |

El 209 no es proyecto equivocado: son 4 altas de hoy 14/09 hechas por Yesi desde `spcs.html`
(LEONADA CHAT, OJO EXCELENTE, GRAN RAUL, CANDIDATA PIRANERA — query en §5). El baseline de
`CLAUDE.md` hay que subirlo a 209 en `main`; no lo hago acá porque el pedido es solo lectura.

---

## 1. ¿Dónde se carga o se genera `numero_partidor`?

**Carga manual, número por número, en `inscripciones.html`.** No hay sorteo automático en ningún
lado del repo, y el PDF no lo genera: lo lee.

### Único punto de escritura en todo el repo

```
$ git grep -n "numero_partidor" main -- '*.html' '*.js' | grep -v "^main:tests/"
```

```
main:inscripciones.html:637:  const { error } = await sb.from('inscripciones').update({ numero_partidor: val }).eq('id', id);
main:inscripciones.html:646:  if (insc) insc.numero_partidor = val;
main:inscripciones.html:677:      : `<input type="number" min="1" step="1" class="gatera-input" value="${i.numero_partidor??''}" data-prev="${i.numero_partidor??''}" onchange="guardarGatera('${i.id}', this)" style="width:60px;text-align:center" title="N° de gatera (sorteo)">`;
main:inscripciones.html:904:    .select('carrera_id, spc_id, numero_partidor, certificado_correr, estado, spcs(nombre, sexo)')
main:inscripciones.html:1043:  const hayPartidorEnReunion = inscs.some(i => i.numero_partidor != null && i.numero_partidor !== '');
main:inscripciones.html:1054:        return `<td>${insc?.numero_partidor != null ? insc.numero_partidor : ''}</td>`;
main:programa-oficial-color.html:669:    .sort((a, b) => (a.numero_partidor || 999) - (b.numero_partidor || 999))
main:programa-oficial.html:459:    .sort((a, b) => (a.numero_partidor || 999) - (b.numero_partidor || 999))
main:programa.html:263:    const { data } = await sb.from('inscripciones').select('*').in('carrera_id', carIds).eq('estado','ratificado').order('numero_partidor', { nullsFirst: false });
main:ratificacion.html:293:    .select('id, carrera_id, spc_id, numero_partidor, estado, certificado_correr, peso_declarado, peso_final, spcs(nombre, sexo)')
main:ratificacion.html:303:        const pa = a.numero_partidor, pb = b.numero_partidor;
main:ratificacion.html:607:        const pa = a.numero_partidor, pb = b.numero_partidor;
main:renumerar-chapas.js:5: * Se ordenan ASC por numero_partidor (nulls al final) y se les
main:renumerar-chapas.js:9: *                               { id, estado, numero_partidor }.
main:renumerar-chapas.js:15:    .sort((a, b) => (a.numero_partidor || 9999) - (b.numero_partidor || 9999));
main:resultados.html:612:  const sorted = [...activeInsc].sort((a,b) => (a.numero_partidor||999) - (b.numero_partidor||999));
main:resultados.html:710:      const sorted       = [...activeInsc].sort((a,b) => (a.numero_partidor||999) - (b.numero_partidor||999));
main:resultados.html:802:  const sortedInsc = [...activeInsc].sort((a, b) => (a.numero_partidor || 999) - (b.numero_partidor || 999));
main:resultados.html:1840:    .sort((a,b) => (a.numero_partidor||999) - (b.numero_partidor||999));
main:resultados.html:1936:// Ratificados de la carrera ordenados por GATERA (numero_partidor ASC, los sin gatera al
main:resultados.html:1941:    .sort((a, b) => (a.numero_partidor || 999) - (b.numero_partidor || 999));
main:resultados_legacy.html:352:    .sort((a, b) => (a.numero_partidor || 999) - (b.numero_partidor || 999));
main:resultados_legacy.html:355:    ? `${inscBorradas.map(i => i.numero_partidor).filter(Boolean).join('-')} (${totalInscriptos})`
main:resultados_legacy.html:397:            const mandil = i?.numero_partidor ? `[${i.numero_partidor}] ` : '';
main:resultados_legacy.html:432:    .sort((a, b) => (a.numero_partidor || 999) - (b.numero_partidor || 999));
main:resultados_legacy.html:435:    ? `${inscBorradas.map(i => i.numero_partidor).filter(Boolean).join('-')} (${totalInscriptos})`
main:resultados_legacy.html:441:    .sort((a, b) => (a.numero_partidor || 999) - (b.numero_partidor || 999));
main:resultados_legacy.html:460:      return `<option value="${i.id}" ${inscSel?.id === i.id ? 'selected' : ''}>${i.numero_partidor || '?'} — ${spc?.nombre || ''}</option>`;
main:resultados_legacy.html:608:    .sort((a, b) => (a.numero_partidor || 999) - (b.numero_partidor || 999));
```

Todo lo demás es **lectura** (ordenar por gatera, imprimir). El único `update` es
`inscripciones.html:637`. `ratificacion.html` sólo lo lee para ordenar; no tiene input.

### El código que lo carga — `inscripciones.html:626-648` (`guardarGatera`)

```javascript
async function guardarGatera(id, el) {
  const raw = (el.value || '').trim();
  let val = null;
  if (raw !== '') {
    val = parseInt(raw, 10);
    if (isNaN(val) || val < 1 || String(val) !== raw) {
      toast('Gatera inválida: entero ≥ 1', 'error');
      el.value = el.dataset.prev || '';
      return;
    }
  }
  const { error } = await sb.from('inscripciones').update({ numero_partidor: val }).eq('id', id);
  if (error) {
    if (error.code === '23505') toast(`Gatera ${val} ya usada en esta carrera`, 'error');
    else toast(error.message, 'error');
    el.value = el.dataset.prev || '';
    return;
  }
  el.dataset.prev = raw;
  const insc = inscripciones.find(x => x.id === id);
  if (insc) insc.numero_partidor = val;
  toast(val != null ? `Gatera ${val} guardada` : 'Gatera limpiada');
}
```

### Dónde está el input en la pantalla — `inscripciones.html:675-680` y `:696`

```javascript
    const gateraCell = (i.estado==='forfait'||i.estado==='mal_inscrito')
      ? `<span style="color:var(--muted)">—</span>`
      : `<input type="number" min="1" step="1" class="gatera-input" value="${i.numero_partidor??''}" data-prev="${i.numero_partidor??''}" onchange="guardarGatera('${i.id}', this)" style="width:60px;text-align:center" title="N° de gatera (sorteo)">`;
    return `<tr${jockeyDup ? ' class="jockey-duplicado"' : ''}>
      <td><div class="spc-name">${i.spcs?.nombre||spc?.nombre||i.spc_id}</div></td>
      <td>${gateraCell}</td>
```

```
    <thead><tr><th>SPC</th><th>Gatera</th><th>Cert.</th><th>Caballeriza</th><th>Entrenador</th><th>Jockey</th><th>Jockey suplente</th><th>Personal</th><th>Cargada por</th><th>Estado</th><th>Acciones</th></tr></thead>
```

Es la **segunda columna** de la tabla de inscriptos, titulada **"Gatera"**: una cajita numérica
por caballo, al lado del nombre. Se guarda sola al salir del campo (`onchange`) — no hay botón
"Guardar" ni "Sortear". Mensajes que da: `Gatera N guardada`, `Gatera limpiada`,
`Gatera N ya usada en esta carrera` (unique `(carrera_id, numero_partidor)` en la base),
`Gatera inválida: entero ≥ 1`.

Origen del feature: commit `73d7f80` (2026-06-15) *"feat(sorteo): UI carga de gatera + orden por
numero_partidor"*.

### ¿Y el PDF de ratificación?

No genera nada. `inscripciones.html:1043-1060` arma la matriz "ORDEN DE LARGADA" **leyendo** los
`numero_partidor` ya cargados; si ninguno está cargado (`hayPartidorEnReunion === false`) la
matriz directamente **no se dibuja**. Eso es lo que Yesi ve hoy en R9: PDF sin matriz porque no
hay nada cargado — no porque falte un paso "generar".

```javascript
  const hayPartidorEnReunion = inscs.some(i => i.numero_partidor != null && i.numero_partidor !== '');
  let matrizHtml = '';
  if (hayPartidorEnReunion) {
    ...
        return `<td>${insc?.numero_partidor != null ? insc.numero_partidor : ''}</td>`;
```

### Segundo campo, distinto: el **texto** del sorteo (`reuniones.sorteo_partidores`)

Hay otra cosa que también se llama "sorteo" y puede ser lo que Yesi busca: la **caja de texto
libre** que se imprime al pie de los PDFs de inscriptos y ratificados (pedido de Yesi del
12/08/2026, `docs/SORTEO_PARTIDORES.md`). Se carga en **`reuniones.html`**, en el modal de editar
reunión, campo **"Sorteo y orden de partidores"** (`reuniones.html:229-231`, se guarda en
`:437`). Ejemplo cargado en R8: `1→7 · 2→16 · 3→8 · 4→9 · 5→14 · 6→11 · 7→3 · 8→6 · 9→13 · 10→12 · 11→2 · 12→5`.

```
main:reuniones.html:229:          <label>Sorteo y orden de partidores</label>
main:reuniones.html:230:          <textarea id="f-sorteo-partidores" rows="2" placeholder="Ej: 1→7 · 2→16 · 3→8 · 4→9 · 5→14 · 6→11"></textarea>
main:reuniones.html:231:          <span ...>Se muestra al pie de los PDFs de inscriptos y ratificados. Texto libre: se imprime tal cual. Si lo dejás vacío, la caja no aparece.</span>
main:reuniones.html:437:    sorteo_partidores:       document.getElementById('f-sorteo-partidores').value.trim() || null,
```

Son **dos cargas independientes**, no se alimentan entre sí (`docs/SORTEO_PARTIDORES.md` §1,
"No confundir con la matriz que ya existía"):

| Qué | Dónde se carga | Qué imprime |
|---|---|---|
| Gatera de cada caballo (`inscripciones.numero_partidor`) | `inscripciones.html` → columna **Gatera** | Matriz "ORDEN DE LARGADA" del PDF; orden de largada en programa y resultados |
| Texto del sorteo (`reuniones.sorteo_partidores`) | `reuniones.html` → editar reunión → **"Sorteo y orden de partidores"** | Caja al pie de los PDFs de inscriptos y ratificados |

---

## 2. ¿Depende del estado de la reunión o de la carrera?

**No.** Ni de la reunión ni de la carrera ni del rol.

- `renderInscripciones()` (`inscripciones.html:649-700`) dibuja el input para toda inscripción
  cuyo `estado` no sea `forfait` ni `mal_inscrito`. Es la única condición. Un `inscripto` (sin
  ratificar) también tiene la cajita.
- No hay `puedeEditar` sobre esa celda: el único gate por rol de la pantalla es el select de
  estado de carrera (`inscripciones.html:532`), que no afecta la columna Gatera.
- No hay CSS que la oculte (`grep -n "nth-child|display: none"` sobre el archivo: sólo modal,
  dropdown, print y overlays — nada sobre la tabla).
- El selector de reuniones (`inscripciones.html:408`) trae **todas** las reuniones del club sin
  filtrar por estado; el de turnos (`:469-471`) trae todas las carreras de la reunión sin
  filtrar por estado.

Estado de R9 hoy (query completa en §3): reunión `publicada`, 11 turnos todos `abierta`.
**Nada de eso oculta la opción.**

Prod sirve exactamente ese archivo — md5 de `main:inscripciones.html` vs `sigh.com.ar`:

```
$ curl -s "https://sigh.com.ar/inscripciones.html?v=$RANDOM" -o prod_insc.html
$ git show main:inscripciones.html > main_insc.html
$ md5sum main_insc.html prod_insc.html
5540c48fd72c81834595609d7fb24f37  main_insc.html
5540c48fd72c81834595609d7fb24f37  prod_insc.html
$ grep -c "gatera-input" prod_insc.html
1
```

---

## 3. R9 hoy: ¿hay partidores asignados?

**No. Cero.** Y además **cero ratificados**: la ratificación de R9 todavía no se hizo.

Query (una sola, contra prod, `execute_sql`):

```sql
select 'guard_spcs' as k, count(*)::text as v from spcs
union all
select 'r9_reunion', json_build_object('id',id,'numero',numero,'numero_publico',numero_publico,'fecha',fecha,'estado',estado,'sorteo_partidores',sorteo_partidores,'es_prueba',es_prueba)::text
  from reuniones where id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
union all
select 'r9_carreras', json_agg(json_build_object('turno',numero_turno,'estado',estado,'nro_prog',numero_carrera_programa) order by numero_turno)::text
  from carreras where reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
union all
select 'r9_insc_por_estado_y_partidor', json_agg(t order by t.estado)::text from (
  select i.estado, count(*) total,
         count(*) filter (where i.numero_partidor is not null) con_partidor,
         count(*) filter (where i.numero_partidor is null) sin_partidor
  from inscripciones i join carreras c on c.id=i.carrera_id
  where c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
  group by i.estado) t
union all
select 'r9_por_turno', json_agg(t order by t.turno)::text from (
  select c.numero_turno turno, count(*) total,
         count(*) filter (where i.estado='ratificado') ratificados,
         count(*) filter (where i.estado='ratificado' and i.numero_partidor is not null) rat_con_partidor,
         count(*) filter (where i.estado='ratificado' and i.numero_partidor is null) rat_sin_partidor,
         count(*) filter (where i.estado='inscripto') inscriptos,
         count(*) filter (where i.jockey_titular_id is null and i.estado in ('inscripto','ratificado')) activos_sin_jockey
  from carreras c left join inscripciones i on i.carrera_id=c.id
  where c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
  group by c.numero_turno) t
union all
select 'r8_comparacion', json_agg(t)::text from (
  select r.numero, r.estado, count(*) filter (where i.estado='ratificado') rat,
         count(*) filter (where i.estado='ratificado' and i.numero_partidor is not null) rat_con_partidor,
         r.sorteo_partidores is not null as tiene_texto_sorteo
  from reuniones r join carreras c on c.reunion_id=r.id join inscripciones i on i.carrera_id=c.id
  where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and r.numero in (8,9)
  group by r.id, r.numero, r.estado, r.sorteo_partidores) t;
```

Salida cruda (JSON desanidado a mano, valores sin tocar):

```
guard_spcs: 209

r9_reunion:
  id=cafa37d6-89f4-45cb-a0d9-835bc27407e9  numero=9  numero_publico=8  fecha=2026-09-20
  estado=publicada  sorteo_partidores=null  es_prueba=false

r9_carreras (turno / estado / numero_carrera_programa):
  1 abierta null | 2 abierta null | 3 abierta null | 4 abierta null | 5 abierta null | 6 abierta null
  7 abierta null | 8 abierta null | 9 abierta null | 10 abierta null | 11 abierta null

r9_insc_por_estado_y_partidor:
  estado=forfait    total=16  con_partidor=0  sin_partidor=16
  estado=inscripto  total=85  con_partidor=0  sin_partidor=85
  (no hay filas 'ratificado' ni 'mal_inscrito')

r9_por_turno (turno / total / ratificados / rat_con_partidor / rat_sin_partidor / inscriptos / activos_sin_jockey):
   1  11  0  0  0   9  3
   2   8  0  0  0   4  1
   3  13  0  0  0  12  7
   4  13  0  0  0  11  4
   5   7  0  0  0   7  1
   6   7  0  0  0   7  1
   7   8  0  0  0   8  3
   8   4  0  0  0   4  1
   9   7  0  0  0   5  2
  10   9  0  0  0   5  1
  11  14  0  0  0  13  6

r8_comparacion:
  numero=9  estado=publicada   rat=0   rat_con_partidor=0   tiene_texto_sorteo=false
  numero=8  estado=finalizada  rat=67  rat_con_partidor=67  tiene_texto_sorteo=true
```

Respuesta directa a la pregunta 3:

| | Ratificadas con `numero_partidor` | Ratificadas en NULL |
|---|---|---|
| R9 | **0** | **0** (no hay ratificadas todavía) |

De las 101 inscripciones de R9, 85 `inscripto` + 16 `forfait`, **101 con `numero_partidor` NULL**.
`sorteo_partidores` (texto) también NULL. R8 como referencia de "reunión completa": 67/67
ratificados con gatera y texto de sorteo cargado.

30 caballos activos sin jockey titular (columna `activos_sin_jockey`) — dato informativo, no
bloquea la gatera (ver §4).

---

## 4. ¿Qué tiene que pasar antes para que aparezca la opción?

**Nada en el sistema.** La cajita está hoy, para los 85 inscriptos de R9. No requiere:
- ratificar la carrera ni la reunión (el input sale también en `inscripto`);
- tener jockeys cargados (no hay chequeo);
- ningún estado particular de reunión o carrera;
- ningún rol especial (Yesi entra como `secretario_carreras`, y ni siquiera eso se chequea
  para esa celda).

Lo que sí manda el **procedimiento de la casa** (no el código): el sorteo se hace **después de
ratificar**, sobre el listado alfabético de ratificados. `docs/MODELO_NUMERACION.md:124-137`
(corrección del 2026-09-08, con los datos de R8: 67 ratificados con gatera, 29 forfait con
cero → el sorteo corre después de la ratificación). Y el comentario de `inscripciones.html:610-616`:

```javascript
  // Alfabético por nombre del SPC, colación castellana — el mismo orden que el
  // PDF de inscriptos y que la hoja "ORDEN DE LARGADA". Yesi carga la gatera
  // leyendo el papel contra esta pantalla (pedido 12/09/2026). Mismo comparador
  // que ratificacion.html: 'es' explícito, la Ñ va después de la N y la tilde
  // no separa.
```

O sea: el sistema no la frena, pero si carga gateras antes de ratificar y después hay forfaits,
va a quedar con huecos que no salieron de ningún sorteo. El orden correcto para R9 es:

1. `ratificacion.html` → ratificar R9 (hoy 14/09, pendiente según `CLAUDE.md` "R9 — pendiente
   operativo del lunes 14/09").
2. Sortear en papel sobre el listado alfabético de ratificados (mismo orden en pantalla y PDF
   desde el 12/09).
3. `inscripciones.html` → R9 → turno por turno → columna **Gatera** → tipear el número por
   caballo. Se guarda solo.
4. Opcional: `reuniones.html` → editar R9 → **"Sorteo y orden de partidores"** → pegar el texto
   `1→7 · 2→16 · …` para que salga la caja al pie de los PDFs (como en R8).
5. Volver a imprimir el PDF de inscriptos: ahora sí aparece la matriz "ORDEN DE LARGADA".

Y el pendiente que ya estaba anotado: después de ratificar, correr el `DO` de
`migrations/propietarios_provisorios_r9.sql` (no tiene que ver con la gatera; lo repito porque
es del mismo día).

---

## 5. Drift del guard: `spcs` 205 → 209

```sql
select nombre, created_at::date as alta, club_id is null as sin_club from spcs where created_at > '2026-09-12' order by created_at;
```

```
DAHUA               2026-09-12  sin_club=true
SOUTH GOTICO        2026-09-12  sin_club=true
LEONADA CHAT        2026-09-14  sin_club=true
OJO EXCELENTE       2026-09-14  sin_club=true
GRAN RAUL           2026-09-14  sin_club=true
CANDIDATA PIRANERA  2026-09-14  sin_club=true
```

Los dos primeros ya estaban en el baseline 205. Los 4 de hoy son altas de Yesi por `spcs.html`.
Pendiente (fuera de este pedido): actualizar `CLAUDE.md` a **209** y el assert de
`tests/probe_spcs_r9_tanda_1.mjs` / `probe_spcs_studbook_alta.mjs` que chequean count 205.

---

## 6. Veredicto

**Dónde tiene que ir Yesi**: `inscripciones.html` (menú Inscripciones) → elegir R9 → elegir el
turno → en la tabla de inscriptos, **segunda columna "Gatera"**, una cajita numérica por caballo.
Tipea el número y sale del campo: se guarda solo, sin botón. Está en prod hoy y visible para los
85 inscriptos de R9. No hay pantalla "Sorteo" ni botón "Sortear": el sorteo es en papel y acá se
transcribe.

Si lo que busca es el **texto** del sorteo que sale al pie del PDF (`1→7 · 2→16 · …`), eso va en
`reuniones.html` → editar R9 → campo **"Sorteo y orden de partidores"**.

**Qué tiene que haber hecho antes**: nada que exija el sistema. Por procedimiento, **ratificar
R9 primero** (hoy no hay ningún ratificado: 85 inscriptos, 16 forfait) y sortear sobre el
listado alfabético de ratificados; recién después transcribir. Cargarla antes de ratificar
funciona pero deja gateras huérfanas si después hay forfaits.

## 7. Preguntas abiertas

- ¿Yesi buscaba la gatera por caballo (columna) o la caja de texto del PDF? Las dos existen y
  están en pantallas distintas; el nombre "sorteo de partidores" en la UI sólo aparece en la
  segunda. Puede valer la pena un rótulo "Gatera (sorteo)" más visible o un link desde
  ratificación — decisión de producto, no la tomo acá.
- El input de gatera aparece también en `inscripto` (sin ratificar). ¿Conviene mostrarlo sólo en
  `ratificado` para forzar el orden ratificar → sortear? Hoy no bloquea nada.
