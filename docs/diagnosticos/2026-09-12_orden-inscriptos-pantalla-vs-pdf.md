# Orden de los inscriptos: pantalla vs PDF (pedido de Yesi, sorteo de gateras)

- **Fecha:** 2026-09-12 (14:57 UTC)
- **Rama relevada:** `main` @ `92774aa1a532c933654866292a43c18818a7d394` (todo grep y lectura de
  código fue contra `main`; este archivo se publica en `reports`)
- **Guards:**
  - `pwd` → `/home/clio/dev/SGH` ✔
  - `SELECT count(*) FROM spcs` → **205** ✘ (baseline en `CLAUDE.md`: 203). Ver §7 — son 2 altas
    reales de hoy por `spcs.html` (DAHUA, SOUTH GOTICO), no proyecto equivocado. **Hay que actualizar
    el baseline a 205 en `CLAUDE.md` (main).**
  - ref del proyecto → `unlhcuanfrtpatoipwve` ✔
- **Alcance:** solo lectura. No se tocó código ni base.

---

## 0. Respuesta corta

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Cómo ordena la pantalla? | `inscripciones.html:599-601` — `.order('created_at')` explícito en la query; `renderInscripciones()` (`:642`) pinta el array tal cual, sin sort. **Orden de carga.** |
| 2 | ¿Ese orden significa algo? | No. Viene del commit `5eb0e38` (2026-05-07, "cambios del dia"), sin comentario ni doc. Nada en la página depende del índice: el array solo se recorre con `.map` para pintar y con `.find(x => x.id === id)` para gatera. El único "uso" implícito: el recién cargado aparece último. |
| 3 | ¿Cómo ordena el PDF? | `inscripciones.html:880-885` — `.sort((a,b) => (a.spcs?.nombre||'').localeCompare(b.spcs?.nombre||''))` **sin locale** (usa el del browser). Mismo array ordenado alimenta bloques **y** la matriz "ORDEN DE LARGADA" (`:1019`: fila r = r-ésimo alfabético). El PDF además **excluye `forfait`** (`:875`); la pantalla muestra todos. |
| 4 | Ñ / acentos | `localeCompare` sin locale depende del browser: con `es-AR` ordena bien; con `en-US` (colación root) la Ñ cuenta como N → `AÑO NUEVO < ANZUELO` y `ÑANDU < NUBE` (mal en castellano). `.sort()` a pelo (codepoint) es peor: `NISTEL WIN < NIÑO OCEANICO` — caso real en R9 T4. Acentos: `MARIA`/`MARÍA` ordenan juntos en cualquier variante con `localeCompare`; con codepoint no. **Criterio a usar: `localeCompare(..., 'es')`**, que es exactamente lo que ya usa `ratificacion.html` (`:306`, `:430`, `:610`). En R9 hoy, `default` y `'es'` dan el mismo orden en los 11 turnos; codepoint difiere en T4. |
| 5 | ¿Otras pantallas? | `ratificacion.html` (pantalla `:605-610` y PDF `:301-306`): **gatera ASC primero, sin gatera al final por nombre `'es'`** — antes del sorteo eso es alfabético `'es'`; después, orden de largada. `portal.html:756-764`: "Mis inscripciones" del usuario, `created_at DESC`, cruza reuniones/turnos — otro propósito, no es el listado del turno (el portal no muestra los inscriptos ajenos: `portal.html:901-902`). `programa.html:263`: ratificados por `numero_partidor` (post-sorteo, correcto). |
| — | ¿Se pierde algo al ordenar alfabético? | Solo "el último cargado aparece abajo". Nada funcional. Detalles en §6. |

**Propuesta (una línea):** ordenar el array en `loadInscripciones()` con `localeCompare(..., 'es')` por
nombre del SPC traído por JOIN (`spcs(nombre)`), **y** agregar `'es'` al sort del PDF (`:884`) para que
deje de depender del locale del browser. Así pantalla = papel = ratificación.

---

## 1. Pantalla — `inscripciones.html`

### Comando

```bash
grep -n "from('inscripciones')" inscripciones.html ratificacion.html portal.html programa.html programa-oficial.html programa-oficial-color.html carta-llamados.html resultados.html
```

### Salida

```
inscripciones.html:599:  const { data, error } = await sb.from('inscripciones')
inscripciones.html:623:  const { error } = await sb.from('inscripciones').update({ numero_partidor: val }).eq('id', id);
inscripciones.html:830:    ? await sb.from('inscripciones').update(payload).eq('id',id)
inscripciones.html:831:    : await sb.from('inscripciones').insert(payload);
inscripciones.html:841:  const { error } = await sb.from('inscripciones').delete().eq('id',id);
inscripciones.html:872:  const { data: inscsData } = await sb.from('inscripciones')
portal.html:756:  const { data, error } = await sb.from('inscripciones')
ratificacion.html:291:  const { data: inscsData } = await sb.from('inscripciones')
ratificacion.html:504:  const { error } = await sb.from('inscripciones').update({ peso_declarado: peso }).eq('id', inscId);
ratificacion.html:539:    sb.from('inscripciones').update({ peso_final: i.peso_declarado }).eq('id', i.id)
ratificacion.html:586:    ids.length ? sb.from('inscripciones').select('*').in('carrera_id', ids).order('created_at') : Promise.resolve({data:[]}),
ratificacion.html:859:  const { error } = await sb.from('inscripciones').update({ jockey_titular_id: jockeyId }).eq('id', inscId);
ratificacion.html:902:  const { error } = await sb.from('inscripciones').update({ estado:'ratificado', peso_final: peso }).eq('id', inscId);
ratificacion.html:925:  const { error } = await sb.from('inscripciones').update({ estado:'inscripto', peso_final: null }).eq('id', inscId);
ratificacion.html:967:  const { error } = await sb.from('inscripciones').update({ estado: nuevoEstado, motivo_estado: motivo }).eq('id', pendingInscId);
programa.html:263:    const { data } = await sb.from('inscripciones').select('*').in('carrera_id', carIds).eq('estado','ratificado').order('numero_partidor', { nullsFirst: false });
resultados.html:540:    sb.from('inscripciones').select('*').in('carrera_id', carIds),
resultados.html:1679:  const { data: insX } = await sb.from('inscripciones').select('id').eq('carrera_id', carreraId);
resultados.html:1906:    const { error } = await sb.from('inscripciones').update({ peso_balanza: u.peso_balanza }).eq('id', u.id);
resultados.html:2058:    const { error } = await sb.from('inscripciones')
programa-oficial.html:234:    ? await sb.from('inscripciones').select('*').in('carrera_id', carIds)
programa-oficial-color.html:341:    ? await sb.from('inscripciones').select('*').in('carrera_id', carIds)
```

### Carga del listado (`sed -n 593,604p inscripciones.html`)

```
593 async function loadInscripciones() {
594   if (!currentCarreraId) return;
595   document.getElementById('list-container').innerHTML='<div class="loading-state"><div class="spinner"></div> Cargando inscriptos…</div>';
596   // El nombre del cargador va por JOIN explícito: inscripciones tiene DOS FK a
597   // usuarios (inscripto_por y ratificado_por), así que PostgREST necesita el
598   // nombre del constraint o falla por ambigüedad.
599   const { data, error } = await sb.from('inscripciones')
600     .select('*, cargador:usuarios!inscripciones_inscripto_por_fkey(nombre_completo)')
601     .eq('carrera_id', currentCarreraId).order('created_at');
602   if (error) { toast(error.message,'error'); return; }
603   inscripciones = data||[];
604   renderInscripciones();
605 }
```

### Render (`sed -n 636,682p inscripciones.html`)

```
636 function renderInscripciones() {
637   if (!inscripciones.length) {
638     document.getElementById('list-container').innerHTML=`<div class="empty-state"><div class="icon">📋</div><h3>Sin inscriptos</h3><p>No hay SPC inscriptos en este turno.</p></div>`;
639     const cEl=document.getElementById('inscriptos-count'); cEl.textContent='0 inscriptos'; cEl.style.display='';
640     return;
641   }
642   const rows = inscripciones.map(i => {
643     const spc = getSpc(i.spc_id);
644     const cab = getCab(i.caballeriza_id);
645     const jkey = getProf(i.jockey_titular_id);
646     const jkeySup = getProf(i.jockey_suplente_id);
647     const entr = getProf(i.entrenador_id);
648     const certCell = i.certificado_correr
649       ? `<span style="color:var(--success);font-weight:600;">Sí</span>`
650       : `<span style="color:var(--danger);font-weight:600;">No</span>`;
651     // Quién cargó la inscripción. Con inscripción libre (24/08/2026) cualquier
652     // entrenador puede anotar cualquier SPC, y este dato ES el control que
653     // reemplaza al filtro por tenencia: la comisión de carreras sanciona con él.
654     const cargadaCell = i.canal === 'portal'
655       ? `<div style="font-size:12px;line-height:1.4;"><span style="color:var(--oro,#c9a84c);">Portal</span><br><span style="color:var(--muted);">${i.cargador?.nombre_completo || '—'}</span></div>`
656       : `<span style="font-size:12px;color:var(--muted);">Secretaría</span>`;
657     const gateraCell = (i.estado==='forfait'||i.estado==='mal_inscrito')
658       ? `<span style="color:var(--muted)">—</span>`
659       : `<input type="number" min="1" step="1" class="gatera-input" value="${i.numero_partidor??''}" data-prev="${i.numero_partidor??''}" onchange="guardarGatera('${i.id}', this)" style="width:60px;text-align:center" title="N° de gatera (sorteo)">`;
660     return `<tr>
661       <td><div class="spc-name">${spc?.nombre||i.spc_id}</div></td>
662       <td>${gateraCell}</td>
663       <td>${certCell}</td>
664       <td>${cab?`${cab.nombre}${cab.hipodromo_patente?` (${cab.hipodromo_patente})`:''}`:'—'}</td>
665       <td>${entr?`${entr.apellido}, ${entr.nombre}`:'-'}</td>
666       <td>${jkey?`${jkey.apellido}, ${jkey.nombre}`:'-'}</td>
667       <td>${jkeySup?`${jkeySup.apellido}, ${jkeySup.nombre}`:'—'}</td>
668       <td>${(() => { const l=[]; if(i.peon) l.push(`Peón: ${i.peon}`); if(i.capataz) l.push(`Cap: ${i.capataz}`); if(i.sereno) l.push(`Sereno: ${i.sereno}`); return l.length?`<div style="font-size:12px;color:var(--muted);">${l.join('<br>')}</div>`:''; })()}</td>
669       <td>${cargadaCell}</td>
670       <td><span class="badge badge-${i.estado}">${i.estado?.replace('_',' ')||'—'}</span></td>
671       <td class="actions-cell">
672         <button class="btn-sm btn-edit" onclick='openModal(${JSON.stringify({ ...i, cargador: undefined })})'>✏️</button>
673         <button class="btn-sm btn-delete" onclick="deleteRecord('${i.id}')">🗑️</button>
674       </td>
675     </tr>`;
676   }).join('');
677   document.getElementById('list-container').innerHTML = `<div class="table-wrap"><table>
678     <thead><tr><th>SPC</th><th>Gatera</th><th>Cert.</th><th>Caballeriza</th><th>Entrenador</th><th>Jockey</th><th>Jockey suplente</th><th>Personal</th><th>Cargada por</th><th>Estado</th><th>Acciones</th></tr></thead>
679     <tbody>${rows}</tbody>
680   </table></div>`;
681   const n=inscripciones.length; const cEl=document.getElementById('inscriptos-count'); cEl.textContent=`${n} inscripto${n!==1?'s':''}`; cEl.style.display='';
682 }
```

Sin `.sort` en el render: el orden de pantalla es el de la query → `created_at ASC`.
La gatera se carga acá mismo, inline, fila por fila (`guardarGatera`, `:611-634`). Es exactamente la
pantalla que Yesi lee contra el papel.

### ¿Se usa el índice del array en algún otro lado?

```bash
grep -n "inscripciones\b" inscripciones.html | grep -v "from('inscripciones')"
```

```
14:  ALTER TABLE inscripciones
344:let reuniones=[], carreras=[], inscripciones=[], spcs=[], profesionales=[], caballerizas=[];
596:  // El nombre del cargador va por JOIN explícito: inscripciones tiene DOS FK a
603:  inscripciones = data||[];
631:  const insc = inscripciones.find(x => x.id === id);
637:  if (!inscripciones.length) {
642:  const rows = inscripciones.map(i => {
681:  const n=inscripciones.length; const cEl=document.getElementById('inscriptos-count'); cEl.textContent=`${n} inscripto${n!==1?'s':''}`; cEl.style.display='';
```

Cuatro usos: asignar, `.find` por id, `.map` para pintar, `.length` para el contador. **Ninguno
depende de la posición.** Ordenar el array no rompe nada.

---

## 2. ¿El `created_at` significa algo? — historia

```bash
git log --format='%h %ad %s' --date=short -S".order('created_at')" -- inscripciones.html
git show 5eb0e38 --stat | head -20
git show 5eb0e38 -- inscripciones.html | grep -n "created_at"
grep -rn "orden de carga\|created_at" docs/MODULOS.md docs/GOTCHAS.md docs/DECISIONES.md docs/ISSUES.md | grep -i "inscri"
```

```
5eb0e38 2026-05-07 cambios del dia
----
commit 5eb0e38779712cb8afc6620d98b51299c6109893
Author: mdqclio <mdqclio@gmail.com>
Date:   Thu May 7 00:47:46 2026 +0000

    cambios del dia

 caballerizas-propietarios.html | 492 +++++++++++++++++++++++++++++++++++++
 carta-llamados.html            |  18 +-
 index.html                     | 136 ++++++-----
 inscripciones.html             | 221 +++++++++--------
 ratificacion.html              | 225 ++++++++++-------
 resultados.html                | 534 +++++++++++++++++++++++++++--------------
 sanciones.html                 | 121 ++++++----
 7 files changed, 1271 insertions(+), 476 deletions(-)
311:+  const { data, error } = await sb.from('inscripciones').select('*').eq('carrera_id', currentCarreraId).order('created_at');
----
docs/GOTCHAS.md:226:**Verificación a fondo (02/06/2026) — confirmado, no es artefacto de seeds.** Barrido de TODO el repo de `from('inscripciones').insert/.update/.upsert`: ningún payload escribe `propietario_id` (campos explícitos, sin spreads ni alias `propietario/dueño/owner`). `inscripciones.html` (insert L638, payload L621-635) y los UPDATE de `ratificacion.html` NO lo tocan. El **único** lugar que lo setea es `portal.html:574` (`payload.propietario_id` solo si `rol==='propietario'`), portal aún sin construir → 0 filas (`canal='web'`: 0/87). El form de `inscripciones.html` **no tiene campo de dueño** (grep vacío). NO hay trigger/RPC server-side que lo pueble: ninguna migración lo hace y, empíricamente, si existiera las 87 filas reales lo tendrían. Las 87 son carga **manual real por UI** (`canal='manual'` 87/87; `created_at` repartido 27/04→23/05/2026 con huecos humanos), no seeds → el 0/87 era exactamente lo que producía el flujo de entonces. ~~Para llenarlo hay que AGREGAR la captura/derivación al inscribir/ratificar (el fix se planea aparte).~~ **SUPERADO (ver nota 2026-06-08 arriba):** la captura/derivación YA está hecha y viva en main — triggers C/C3 + Fix D (`spcs.html`). Falta solo el backfill histórico (Fase A).
docs/ISSUES.md:30:  - **Verificación a fondo (02/06/2026):** confirmado que NINGÚN flujo escribe `propietario_id`. Barrido de todo el repo de `from('inscripciones').insert/.update/.upsert`: payloads con campos explícitos (sin spreads ni alias `propietario/dueño/owner`); `inscripciones.html` (insert L638) y los UPDATE de `ratificacion.html` no lo tocan; el form de inscripción NO tiene campo de dueño. Único setter: `portal.html:574` (rol propietario), portal sin construir → 0 filas (`canal='web'`: 0/87). No hay trigger/RPC server-side (ninguna migración; y si existiera, las 87 reales lo tendrían). Las 87 son carga manual real por UI (`canal='manual'` 87/87, `created_at` repartido 27/04→23/05), NO seeds → el 0/87 es lo que produce el flujo, no casualidad. **Hay que AGREGAR la captura/derivación al inscribir/ratificar; el fix se planea aparte.**
```

(Las dos líneas de docs hablan de `created_at` como prueba de que las inscripciones eran carga manual
real —"repartido 27/04→23/05 con huecos humanos"—, no de que el orden en pantalla sirva para algo.)

Conclusión: el `.order('created_at')` nació en un commit-bulto de mayo sin justificación. No hay ADR,
gotcha, ni comentario que lo defienda. **El orden del dominio para el sorteo es el alfabético**, y está
escrito en `docs/MODELO_NUMERACION.md:17`:

```
15 - **No es orden alfabético** (verificado en 3 carreras de producción).       ← habla de la GATERA
17 - El sorteo mapea orden alfabético → gatera al azar, para que ningún caballo tenga ventaja de posición por el criterio de asignación.
```

y en `docs/MODULOS.md:49` para el PDF: *"lista alfabética con sufijo (H) ... matriz consolidada
'ORDEN DE LARGADA' (filas = posiciones alfabéticas, columnas = T1..T11, celdas = numero_partidor)"*.
La pantalla es la que está fuera de criterio, no el papel.

---

## 3. PDF — `printInscriptos()` en `inscripciones.html`

### `sed -n 872,885p inscripciones.html`

```
872   const { data: inscsData } = await sb.from('inscripciones')
873     .select('carrera_id, spc_id, numero_partidor, certificado_correr, estado, spcs(nombre, sexo)')
874     .in('carrera_id', allCars.map(c => c.id))
875     .in('estado', ['inscripto', 'ratificado', 'mal_inscrito']);
876
877   const inscs = inscsData || [];
878
879   // Pre-ordenar inscriptos por nombre de SPC por carrera (reutilizado en bloques y matriz)
880   const inscsByCarrera = new Map();
881   allCars.forEach(car => {
882     inscsByCarrera.set(car.id, inscs
883       .filter(i => i.carrera_id === car.id)
884       .sort((a, b) => (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '')));
885   });
```

### Dónde se consume ese orden

```bash
grep -n "inscsByCarrera" inscripciones.html
```

```
880:  const inscsByCarrera = new Map();
882:    inscsByCarrera.set(car.id, inscs
959:    const inscsCar = inscsByCarrera.get(car.id) || [];        ← bloques por carrera (lista de nombres)
1012:    const carsConInsc = allCars.filter(c => (inscsByCarrera.get(c.id) || []).length > 0);
1013:    const maxInsc = Math.max(...carsConInsc.map(c => (inscsByCarrera.get(c.id) || []).length));
1019:        const insc = (inscsByCarrera.get(c.id) || [])[r];   ← matriz ORDEN DE LARGADA: fila r = r-ésimo alfabético
```

### `sed -n 1008,1030p inscripciones.html` (matriz)

```
1008   // Matriz consolidada de orden de largada
1009   const hayPartidorEnReunion = inscs.some(i => i.numero_partidor != null && i.numero_partidor !== '');
1010   let matrizHtml = '';
1011   if (hayPartidorEnReunion) {
1012     const carsConInsc = allCars.filter(c => (inscsByCarrera.get(c.id) || []).length > 0);
1013     const maxInsc = Math.max(...carsConInsc.map(c => (inscsByCarrera.get(c.id) || []).length));
1014     const filas = Math.min(maxInsc, cantidadGateras);
1015     const theadCols = carsConInsc.map(c => `<th>T${c.numero_turno}</th>`).join('');
1016     const tbodyRows = [];
1017     for (let r = 0; r < filas; r++) {
1018       const celdas = carsConInsc.map(c => {
1019         const insc = (inscsByCarrera.get(c.id) || [])[r];
1020         return `<td>${insc?.numero_partidor != null ? insc.numero_partidor : ''}</td>`;
1021       }).join('');
1022       tbodyRows.push(`<tr><td>${r + 1}</td>${celdas}</tr>`);
1023     }
```

Observaciones:

- **Criterio del PDF = nombre del SPC, `localeCompare` sin locale.** El locale efectivo es el del
  browser que imprime. Si Yesi imprime desde un Chrome en `es-AR`, sale colación castellana; desde
  uno en `en-US`, colación root (ver §4 la diferencia concreta).
- **Ese sort es de `4e07fc6` (2026-05-12, "rediseñar vista de impresión estilo Palermo")**:
  ```
  git log --format='%h %ad %s' --date=short -S"localeCompare(b.spcs?.nombre" -- inscripciones.html
  4e07fc6 2026-05-12 feat(inscripciones): rediseñar vista de impresión estilo Palermo
  ```
- **La matriz "ORDEN DE LARGADA" es literalmente la hoja del sorteo**: fila 1 = primer alfabético de
  cada turno, celda = gatera que le tocó. Si la pantalla estuviera en el mismo orden, la fila r de la
  matriz sería la fila r de la pantalla.
- **Membresía distinta:** el PDF trae `inscripto | ratificado | mal_inscrito` (sin `forfait`); la
  pantalla trae todos los estados. Un forfait aparece en pantalla (con "—" en gatera) y no en el
  papel. No es problema de orden, pero explica un posible "me sobra una fila" al cotejar.

---

## 4. Ñ y acentos — qué hace cada variante

### Nombres reales con Ñ o tilde en `spcs` (solo lectura) y prueba de colación

Script (corrido desde `tests/` para resolver `@supabase/supabase-js`; borrado después):

```js
import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { count } = await sb.from('spcs').select('id', { count: 'exact', head: true });
console.log('guard spcs count =', count);
const { data, error } = await sb.from('spcs').select('nombre').or('nombre.ilike.%ñ%,nombre.ilike.%á%,nombre.ilike.%é%,nombre.ilike.%í%,nombre.ilike.%ó%,nombre.ilike.%ú%,nombre.ilike.%ü%');
if (error) throw error;
console.log('spcs con Ñ o tilde:', data.length);
data.map(d => d.nombre).sort().forEach(n => console.log('  ', n));
// R9 inscriptos con Ñ / tilde
const { data: r9 } = await sb.from('inscripciones').select('carrera_id, estado, spcs(nombre), carreras!inner(numero_turno, reunion_id)').eq('carreras.reunion_id', 'cafa37d6-89f4-45cb-a0d9-835bc27407e9');
const conRaro = r9.filter(i => /[ñáéíóúü]/i.test(i.spcs?.nombre || ''));
console.log('\nR9 inscriptos total:', r9.length, '| con Ñ/tilde:', conRaro.length);
conRaro.forEach(i => console.log('   T' + i.carreras.numero_turno, i.estado, i.spcs.nombre));

// Prueba de colación
const casos = [
  ['CHINITA SALTEÑA', 'CHINITA SALTENO'],
  ['CHINITA SALTEÑA', 'CHINITA SALTEO'],
  ['AÑO NUEVO', 'ANZUELO'],
  ['MARIA CATULENGA', 'MARÍA CATULENGA'],
  ['MARÍA CATULENGA', 'MARIA CATULENGB'],
  ['ÑANDU', 'NUBE'],
  ['ÑANDU', 'OSO'],
  ['abc', 'ABD'],
];
console.log('\nlocale del proceso node:', Intl.DateTimeFormat().resolvedOptions().locale);
console.log('caso | default localeCompare | es | es base | codepoint (< >)');
for (const [a, b] of casos) {
  const d = Math.sign(a.localeCompare(b));
  const es = Math.sign(a.localeCompare(b, 'es'));
  const esb = Math.sign(a.localeCompare(b, 'es', { sensitivity: 'base' }));
  const cp = a < b ? -1 : a > b ? 1 : 0;
  console.log(`${a} vs ${b} | ${d} | ${es} | ${esb} | ${cp}`);
}
// Orden completo de la lista con Ñ en default vs es
const nombres = ['ANZUELO','AÑO NUEVO','ANA','AOTO','ÑANDU','NUBE','OSO','MARIA CATULENGA','MARÍA CATULENGA','MARIA CATULENGB','CHINITA SALTEÑA','CHINITA SALTENA','CHINITA SALTEO'];
console.log('\ndefault:', [...nombres].sort((a,b)=>a.localeCompare(b)).join(' < '));
console.log('es     :', [...nombres].sort((a,b)=>a.localeCompare(b,'es')).join(' < '));
console.log('codept :', [...nombres].sort().join(' < '));
```

Salida completa:

```
guard spcs count = 205
spcs con Ñ o tilde: 11
   ARMOÑOZO
   CHINITA SALTEÑA
   La City Porteña
   La Porteña
   NIÑO OCEANICO
   PORTEÑO Y BAILARIN
   QUE BELLA DOÑA
   Río Salado
   SEÑOR MONCHI
   SOY ISLEÑO
   TORO MAÑERO

R9 inscriptos total: 80 | con Ñ/tilde: 6
   T9 inscripto CHINITA SALTEÑA
   T4 inscripto NIÑO OCEANICO
   T7 inscripto SEÑOR MONCHI
   T3 inscripto TORO MAÑERO
   T1 inscripto QUE BELLA DOÑA
   T1 inscripto ARMOÑOZO

locale del proceso node: en-US
caso | default localeCompare | es | es base | codepoint (< >)
CHINITA SALTEÑA vs CHINITA SALTENO | -1 | 1 | 1 | 1
CHINITA SALTEÑA vs CHINITA SALTEO | -1 | -1 | -1 | 1
AÑO NUEVO vs ANZUELO | -1 | 1 | 1 | 1
MARIA CATULENGA vs MARÍA CATULENGA | -1 | -1 | 0 | -1
MARÍA CATULENGA vs MARIA CATULENGB | -1 | -1 | -1 | 1
ÑANDU vs NUBE | -1 | 1 | 1 | 1
ÑANDU vs OSO | -1 | -1 | -1 | 1
abc vs ABD | -1 | -1 | -1 | 1

default: ANA < AÑO NUEVO < ANZUELO < AOTO < CHINITA SALTENA < CHINITA SALTEÑA < CHINITA SALTEO < MARIA CATULENGA < MARÍA CATULENGA < MARIA CATULENGB < ÑANDU < NUBE < OSO
es     : ANA < ANZUELO < AÑO NUEVO < AOTO < CHINITA SALTENA < CHINITA SALTEÑA < CHINITA SALTEO < MARIA CATULENGA < MARÍA CATULENGA < MARIA CATULENGB < NUBE < ÑANDU < OSO
codept : ANA < ANZUELO < AOTO < AÑO NUEVO < CHINITA SALTENA < CHINITA SALTEO < CHINITA SALTEÑA < MARIA CATULENGA < MARIA CATULENGB < MARÍA CATULENGA < NUBE < OSO < ÑANDU
```

Lectura de la tabla (`-1` = a antes que b; `1` = a después; `0` = empate):

| Caso | default (node `en-US` ≈ browser en inglés) | `'es'` | codepoint (`.sort()` a pelo) | Lo esperado en castellano |
|---|---|---|---|---|
| `CHINITA SALTEÑA` vs `CHINITA SALTENO` | Ñ antes de N+O ✘ | Ñ después ✔ | Ñ después ✔ | Ñ es letra propia, va después de toda la N |
| `AÑO NUEVO` vs `ANZUELO` | AÑO antes ✘ | ANZUELO antes ✔ | ANZUELO antes ✔ | idem |
| `ÑANDU` vs `NUBE` | ÑANDU antes ✘ | NUBE antes ✔ | NUBE antes ✔ | idem |
| `ÑANDU` vs `OSO` | ✔ | ✔ | **OSO antes ✘** (Ñ = U+00D1 > Z) | Ñ va entre N y O, no después de Z |
| `CHINITA SALTEÑA` vs `CHINITA SALTEO` | ✔ | ✔ | **SALTEO antes ✘** | idem |
| `MARIA` vs `MARÍA CATULENGA` | juntas ✔ | juntas ✔ | **`MARÍA` cae después de `MARIA CATULENGB` ✘** | la tilde no separa |
| `abc` vs `ABD` | ✔ | ✔ | **mayúsculas primero ✘** | insensible a mayúsculas |

Resumen:

- **`localeCompare(..., 'es')` es el único que da bien todos los casos.** Es lo que ya usa
  `ratificacion.html` en sus tres sorts (`:306`, `:430`, `:610`).
- **`localeCompare()` sin locale (lo que hace el PDF hoy)** trata la Ñ como una N con tilde (nivel
  secundario): falla solo cuando la Ñ compite contra una N seguida de otra letra (`AÑO`/`ANZUELO`).
  En `es-AR` se comporta como `'es'`. O sea: **el PDF hoy ordena bien o mal según el idioma del
  Chrome que imprime.**
- **`.sort()` a pelo** (codepoint) falla en cuatro de los siete casos y es lo que hay que evitar.
- `sensitivity: 'base'` hace empatar `MARIA` con `MARÍA` (`0`): con `Array.prototype.sort` estable
  no rompe, pero no aporta nada — `'es'` a secas ya las pone juntas. No hace falta.

### Impacto real en R9 (20/09/2026) — ¿pantalla y papel darían distinto hoy?

Script (mismo patrón; compara los 4 criterios por turno):

```js
import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data } = await sb.from('inscripciones').select('estado, created_at, spcs(nombre), carreras!inner(numero_turno, reunion_id)').eq('carreras.reunion_id', 'cafa37d6-89f4-45cb-a0d9-835bc27407e9');
const byT = {};
data.forEach(i => (byT[i.carreras.numero_turno] ||= []).push(i));
for (const t of Object.keys(byT).sort((a,b)=>a-b)) {
  const arr = byT[t];
  const def = arr.map(i=>i.spcs.nombre).sort((a,b)=>a.localeCompare(b));
  const es  = arr.map(i=>i.spcs.nombre).sort((a,b)=>a.localeCompare(b,'es'));
  const cp  = arr.map(i=>i.spcs.nombre).sort();
  const cre = [...arr].sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(i=>i.spcs.nombre);
  console.log(`\nT${t} (${arr.length}) — default==es: ${JSON.stringify(def)===JSON.stringify(es)} | es==codepoint: ${JSON.stringify(es)===JSON.stringify(cp)}`);
  console.log('  es        :', es.join(' | '));
  if (JSON.stringify(def)!==JSON.stringify(es)) console.log('  default   :', def.join(' | '));
  if (JSON.stringify(es)!==JSON.stringify(cp)) console.log('  codepoint :', cp.join(' | '));
  console.log('  created_at:', cre.join(' | '));
}
```

Salida completa:

```

T1 (8) — default==es: true | es==codepoint: true
  es        : ARMOÑOZO | CONESERA | DESERT OF DUBAI | DOCTORA APASIONADA | ETERNA DOCTORA | HERMANOSDEMIPATRIA | QUE BELLA DOÑA | SI TIN
  created_at: SI TIN | CONESERA | ETERNA DOCTORA | DOCTORA APASIONADA | DESERT OF DUBAI | HERMANOSDEMIPATRIA | QUE BELLA DOÑA | ARMOÑOZO

T2 (8) — default==es: true | es==codepoint: true
  es        : ALHENA | ASTUTO NOTES | DEL CAMPEON | DOCTOR SKY | DOCTORA MIA | LOCA DUBAI | OLA DOCTOR | TOUCH OF BLUE
  created_at: ALHENA | DOCTOR SKY | OLA DOCTOR | DEL CAMPEON | DOCTORA MIA | LOCA DUBAI | ASTUTO NOTES | TOUCH OF BLUE

T3 (7) — default==es: true | es==codepoint: true
  es        : BAHIA ROMANA | DAHUA | LOCA DUBAI | MARIA CATULENGA | OLA DOCTOR | TORO MAÑERO | VISION SECURITY
  created_at: OLA DOCTOR | BAHIA ROMANA | LOCA DUBAI | TORO MAÑERO | VISION SECURITY | MARIA CATULENGA | DAHUA

T4 (13) — default==es: true | es==codepoint: false
  es        : BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NIÑO OCEANICO | NISTEL WIN | REY DE PILA | SOUTH GOTICO | TOY BOY
  codepoint : BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NISTEL WIN | NIÑO OCEANICO | REY DE PILA | SOUTH GOTICO | TOY BOY
  created_at: BACON | COLONIAL JOHAN | MARUKA PLUS | LOGUACIOUS | KRISTALINA | REY DE PILA | TOY BOY | GRILLADA RYE | NISTEL WIN | NIÑO OCEANICO | LIVIA DRUSA | BIEN COQUETA | SOUTH GOTICO

T5 (4) — default==es: true | es==codepoint: true
  es        : AMIGUITO JESUS | KUCCINI | NELIDA RIM | NOCHE EN VELA
  created_at: NELIDA RIM | NOCHE EN VELA | KUCCINI | AMIGUITO JESUS

T6 (6) — default==es: true | es==codepoint: true
  es        : EL MAS SABIO | FALAYS | FREE CRY | HALLOTOP | IDALIA MARO | REINA EDITION
  created_at: REINA EDITION | FREE CRY | FALAYS | IDALIA MARO | HALLOTOP | EL MAS SABIO

T7 (8) — default==es: true | es==codepoint: true
  es        : ATOMIZADOR | ECHO IN THE SKY | EL RISKO | LATIN PRESUMIDA | LE BATEAU | SEMBRADOR CHUCK | SEÑOR MONCHI | YOOKY
  created_at: LATIN PRESUMIDA | EL RISKO | YOOKY | SEÑOR MONCHI | ATOMIZADOR | LE BATEAU | SEMBRADOR CHUCK | ECHO IN THE SKY

T8 (3) — default==es: true | es==codepoint: true
  es        : IDALIA MARO | LATIN PRESUMIDA | YOOKY
  created_at: LATIN PRESUMIDA | YOOKY | IDALIA MARO

T9 (6) — default==es: true | es==codepoint: true
  es        : CHINITA SALTEÑA | ESPLENDID CRAF | LE BATEAU | QUERELLANTE | THE BEAST PARTY | WISLA KEN
  created_at: WISLA KEN | CHINITA SALTEÑA | QUERELLANTE | ESPLENDID CRAF | LE BATEAU | THE BEAST PARTY

T10 (8) — default==es: true | es==codepoint: true
  es        : ABARAJALA | BABY PARADISE | GRILLADA RYE | INDIANA MARO | KRISTALINA | LATIN RAIN | LOGUACIOUS | QUINIELA TREND
  created_at: LATIN RAIN | QUINIELA TREND | BABY PARADISE | LOGUACIOUS | KRISTALINA | GRILLADA RYE | INDIANA MARO | ABARAJALA

T11 (9) — default==es: true | es==codepoint: true
  es        : BABY PARADISE | BUEN MANUEL | DESTINADO JOHAN | EL GRAN HECTOR | ES SABALERO | GOIADORA | HEART OF GOLD | INDIO VALIDO | TERRIBLE KING
  created_at: BUEN MANUEL | TERRIBLE KING | BABY PARADISE | DESTINADO JOHAN | ES SABALERO | INDIO VALIDO | HEART OF GOLD | EL GRAN HECTOR | GOIADORA
```

Lectura:

- **`created_at` (pantalla hoy) no coincide con el alfabético en ninguno de los 11 turnos.** Es el
  problema que describe Yesi, tal cual.
- **`default` == `'es'` en los 11 turnos de R9**: hoy, con estos nombres, el PDF sale igual en un
  Chrome en inglés o en castellano. Es suerte, no diseño — alcanza con que se inscriba un `AÑO...`
  junto a un `ANZ...` para que difieran.
- **codepoint ≠ `'es'` en T4**: `NISTEL WIN` antes que `NIÑO OCEANICO`. Si la pantalla se ordenara
  con `.sort()` a pelo o con `ORDER BY` de Postgres en colación `C`, ese turno saldría distinto al
  papel. Por eso el orden va **en cliente con `'es'`**, no en el `ORDER BY`.
- Nombres con Ñ inscriptos en R9: `ARMOÑOZO` (T1), `QUE BELLA DOÑA` (T1), `TORO MAÑERO` (T3),
  `NIÑO OCEANICO` (T4), `SEÑOR MONCHI` (T7), `CHINITA SALTEÑA` (T9). Ninguno con tilde.
  `MARIA CATULENGA` está en T3 sin tilde en la base.

---

## 5. Otras pantallas con el mismo listado

```bash
grep -n "localeCompare\|Intl.Collator\|\.sort(" inscripciones.html ratificacion.html portal.html
```

```
ratificacion.html:284:  const allCars = (carsData || []).sort((a, b) => {
ratificacion.html:301:      .sort((a, b) => {
ratificacion.html:306:        return (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es');
ratificacion.html:429:      .sort((a, b) => (ORDEN_BORRADO[a.estado] - ORDEN_BORRADO[b.estado])
ratificacion.html:430:        || (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es'));
ratificacion.html:605:      .sort((a,b) => {
ratificacion.html:610:        return (getSpc(a.spc_id)?.nombre||'').localeCompare(getSpc(b.spc_id)?.nombre||'', 'es');
portal.html:601:      .sort((a, b) => a.numero_turno - b.numero_turno),
portal.html:746:    .sort((a, b) => {
portal.html:749:      return pa !== pb ? pa - pb : a._busca.localeCompare(b._busca);
portal.html:920:            .sort((a, b) => (a ?? 9999) - (b ?? 9999))
inscripciones.html:884:      .sort((a, b) => (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '')));
```

### `ratificacion.html` — pantalla (`sed -n 583,611p`)

```
583   const [{ data: cars }, inscResult] = await Promise.all([
584     sb.from('carreras').select('*').eq('reunion_id', rid).order('numero_turno'),
585     ids.length ? sb.from('inscripciones').select('*').in('carrera_id', ids).order('created_at') : Promise.resolve({data:[]}),
586   ]);
...
604     const insc = inscripciones.filter(i=>i.carrera_id===car.id)
605       .sort((a,b) => {
606         const pa = a.numero_partidor, pb = b.numero_partidor;
607         if (pa != null && pb != null) return pa - pb;
608         if (pa != null) return -1;
609         if (pb != null) return 1;
610         return (getSpc(a.spc_id)?.nombre||'').localeCompare(getSpc(b.spc_id)?.nombre||'', 'es');
611       });
```

### `ratificacion.html` — PDF (`sed -n 291,308p`)

```
291   const { data: inscsData } = await sb.from('inscripciones')
292     .select('id, carrera_id, spc_id, numero_partidor, estado, certificado_correr, peso_declarado, peso_final, spcs(nombre, sexo)')
293     .in('carrera_id', allCars.map(c => c.id))
294     .in('estado', ['inscripto', 'ratificado', 'mal_inscrito', 'forfait']);
...
299     inscsByCarrera.set(car.id, inscs
300       .filter(i => i.carrera_id === car.id)
301       .sort((a, b) => {
302         const pa = a.numero_partidor, pb = b.numero_partidor;
303         if (pa != null && pb != null) return pa - pb;
304         if (pa != null) return -1;
305         if (pb != null) return 1;
306         return (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es');
307       }));
```

Ratificación (pantalla y PDF) ya tiene criterio determinista y castellano: **gatera ASC; los sin
gatera al final, por nombre `'es'`**. Antes del sorteo (todas las gateras `null`) es alfabético
`'es'` puro; después, es el orden de largada. Coherente con el dominio: post-sorteo la gatera manda.
La query también trae `created_at` (`:585`) pero el `.sort` lo pisa — allí el `created_at` ya no
significa nada.

### `portal.html` — "Mis inscripciones" (`sed -n 756,765p`)

```
756   const { data, error } = await sb.from('inscripciones')
757     .select('id,estado,canal,inscripto_por,spc_id,carrera_id,created_at,spcs(nombre),'
...
764     .order('created_at', { ascending: false });
765   misInscripciones = data || [];
```

Es la lista personal del entrenador (todas sus inscripciones, cruzando reuniones y turnos), más
reciente primero. Otro propósito: no es "los inscriptos del turno". El portal **no muestra** el
listado de inscriptos ajenos (`portal.html:901-902`: *"Sólo se miran MIS inscripciones: las de otros
entrenadores no se ven hasta que la secretaría publica el listado de inscriptos"*). No hay nada que
unificar acá; no toca el sorteo.

### `programa.html:263`

`.eq('estado','ratificado').order('numero_partidor', { nullsFirst: false })` — post-sorteo, por gatera.
Correcto para su etapa; no aplica.

### `programa-oficial*.html`, `resultados.html`

Trabajan sobre ratificados con `renumerarChapas` (gatera → mandil 1..N). Etapa posterior al sorteo;
fuera de alcance.

**Resultado de la unificación propuesta:** `inscripciones.html` (pantalla y PDF) en alfabético `'es'`;
`ratificacion.html` en gatera-luego-alfabético `'es'` (que antes del sorteo **es** el mismo alfabético
`'es'`). Todas las pantallas del circuito inscripción → sorteo → ratificación quedan bajo el mismo
comparador.

---

## 6. ¿Qué se pierde al ordenar alfabético en pantalla?

| Hoy (created_at) | Con alfabético | ¿Importa? |
|---|---|---|
| El inscripto recién cargado aparece último, abajo de todo | Aparece en su lugar alfabético | Cosmético. La columna "Cargada por" (`:652-656`) y el `toast` de alta siguen. Si se quiere, un highlight de 2 s a la fila recién guardada lo compensa — no es necesario. |
| Editar y guardar (`openModal` → `saveRecord` → `loadInscripciones`) deja la fila donde estaba | Si el edit cambia el SPC, la fila se mueve | Raro (cambiar el caballo de una inscripción) y esperable. |
| Nada más | — | Verificado en §1: ningún código lee el índice del array. La gatera se guarda por `id` (`:623`). El contador es `.length`. |

**No se pierde nada funcional.** El "orden de carga" no está documentado como criterio en ningún
lado, nadie lo consume y es incompatible con la hoja del sorteo que el propio sistema imprime.

### Detalle para quien lo implemente (no hecho — fuera del alcance del pedido)

- Ordenar **en cliente**, no en `ORDER BY`: la colación del `ORDER BY` de Postgres puede no ser
  castellana (ver T4 en §4), y el JOIN a `spcs(nombre)` desde el `select` de `:600` es la fuente
  correcta. **No** ordenar por `getSpc(i.spc_id)?.nombre`: el cache `spcs` de la página trae solo
  `estado='activo'` (`:407`), así que un inscripto cuyo SPC se desactivó quedaría con nombre vacío y
  caería al principio.
- Si se agrega `spcs(nombre)` al `select`, el `openModal(JSON.stringify({ ...i, cargador: undefined }))`
  de `:672` pasa a llevar también el objeto `spcs` — limpiarlo igual que `cargador` para no meter
  ruido en el modal.
- Comparador: `(a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es')` — el mismo de
  `ratificacion.html:306`. Y **agregar `'es'` al de `:884`** (PDF), que hoy hereda el locale del
  browser.
- Probe: extraer `loadInscripciones` + el sort del PDF por ancla, correr contra R9, assertear que
  `pantalla[i].spc_id === pdf[i].spc_id` para cada turno y que `NIÑO OCEANICO` queda antes que
  `NISTEL WIN` en T4 (el caso que separa `'es'` de codepoint). Sin escritura.

---

## 7. Guard `spcs` = 205 ≠ 203

Los 5 SPC más nuevos (solo lectura):

```js
const { data } = await sb.from('spcs').select('id,nombre,created_at,studbook_id,estado').order('created_at', { ascending: false }).limit(5);
data.forEach(d => console.log(d.created_at, d.nombre, d.studbook_id, d.estado, d.id));
```

```
2026-09-12T14:34:33.291495+00:00 SOUTH GOTICO 424339 activo d933bbc3-d020-4d91-b21b-3218383b6e2a
2026-09-12T14:34:17.190577+00:00 DAHUA 438313 activo 8bca8458-936d-4faf-afff-c115476e5256
2026-09-11T21:21:06.686194+00:00 EL MAS SABIO 431662 activo 9e2862ef-d6b3-449d-9e2b-68daf2bed1ae
2026-09-11T21:21:06.686194+00:00 BIEN COQUETA 429819 activo 8fa89a02-3882-4858-a3f1-22861fd59b96
2026-09-11T20:03:21.933967+00:00 INDIANA MARO 432433 activo 77f1a588-ed20-477b-b5a4-96148a82952b
```

Dos altas de hoy 14:34 UTC, con `studbook_id` cargado (o sea, por el buscador del Stud Book de
`spcs.html` que salió ayer). Ambos ya están inscriptos en R9: `DAHUA` en T3 y `SOUTH GOTICO` en T4
(ver §4). Altas legítimas, no drift de proyecto. **Pendiente: actualizar el baseline a 205 en
`CLAUDE.md` (main)** — no lo hice porque este relevamiento no toca `main`.

---

## 8. Preguntas abiertas

1. ¿El papel que lee Yesi para el sorteo es el PDF de `inscripciones.html` (🖨️ Imprimir, alfabético
   sin gateras + matriz) o el de `ratificacion.html` (gatera primero)? Asumí el primero — es el
   único que es alfabético puro y el que tiene la matriz "ORDEN DE LARGADA". Si fuera el segundo,
   la respuesta cambia: habría que ordenar la pantalla gatera-primero como ratificación.
2. Forfaits: la pantalla los muestra y el PDF de inscriptos no. ¿Los quiere ver Yesi durante el
   sorteo (hoy salen con "—" en gatera)? No es de orden, pero afecta el cotejo fila a fila.
3. ¿Chrome de la secretaría en `es-AR` o `en-US`? Hoy da lo mismo para R9; con el `'es'` explícito
   deja de importar.

---

## 9. Verificación de publicación

(se completa abajo, tras el push)
