# Programa oficial color — columna S.P.C. desalineada entre carreras

- **Fecha**: 2026-09-17
- **Commit relevado**: `a25978372d1fec384a3d1a9b9a96ecb7681065e4` (`main`; todo el grep y la lectura de código se hicieron parados en `main`)
- **Reunión**: `cafa37d6-89f4-45cb-a0d9-835bc27407e9` (R9, 20/09/2026)
- **Modo**: SOLO LECTURA. No se tocó ningún archivo de `main` ni la base.
- **Guards**: `pwd` → `/home/clio/dev/SGH` ✓ · `SELECT count(*) FROM spcs` → **210** ✓ · ref `unlhcuanfrtpatoipwve` ✓

Reporte de Yesi: en el programa a color los nombres de S.P.C. no arrancan todos en la misma
vertical; "se corren según el ancho del número de mandil". Va a imprenta; reunión el domingo.

---

## 1. Cómo se arma la fila — mandil y S.P.C. van en celdas SEPARADAS

`programa-oficial-color.html:687-696` (función `renderCarreraColor`, `main`):

```javascript
      return `<tr>
        <td>${caballeriza}</td>
        <td>${i.performance || spc.ult_performances || ''}</td>
        <td class="col-num">${partidorChipHTML(fi + 1)}</td>
        <td class="col-spc">${(spc.nombre || '').toUpperCase()}</td>
        <td class="col-kesp">${kesp}</td>
        <td>${jockeyStr}</td>
        <td class="col-pedigree">${padreMadre}</td>
        <td>${entrStr}</td>
      </tr>`;
```

Encabezado, `programa-oficial-color.html:719-724`:

```html
    <table class="inscriptos-color">
      <thead><tr>
        <th>CABALLERIZA</th><th>4 ÚLT.</th><th>N°</th><th>S.P.C.</th><th>K E S P</th><th>JOCKEY</th><th class="col-pedigree">PADRE — MADRE</th><th>ENTRENADOR</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="8" ...>Sin inscriptos</td></tr>'}</tbody>
    </table>
```

El número de mandil es la **3ª celda** (`td.col-num`) y el nombre del S.P.C. es la **4ª celda**
(`td.col-spc`). Son dos `<td>` distintos, no un texto concatenado.

## 2. ¿El nombre arranca donde termina el número? — NO se confirma

La hipótesis "están juntos y el nombre arranca donde termina el número" **no aplica**: al ser
celdas distintas, dentro de UNA misma tabla todas las filas comparten el mismo borde izquierdo
de la columna S.P.C. (así funciona cualquier `<table>`: una columna tiene un solo ancho para
todas sus filas).

Además el número **no tiene ancho variable**: se dibuja como chip de ancho fijo.
`partidor-colors.js:26-30`:

```javascript
function partidorChipHTML(n) {
  const { bg, fg } = partidorColor(n);
  const border = bg.toUpperCase() === '#FFFFFF' ? '1px solid #000' : 'none';
  return `<span class="partidor-chip" style="background:${bg};color:${fg};border:${border}">${n}</span>`;
}
```

`programa-oficial-color.html:175` y `:179-185`:

```css
  table.inscriptos-color .col-num { text-align: center; width: 26px; }

  .partidor-chip {
    display: inline-block; width: 22px; height: 22px;
    line-height: 22px; text-align: center;
    font-weight: 800; font-size: 11px;
    font-family: 'Roboto', Arial, sans-serif;
    border-radius: 2px;
  }
```

Chip de **22px fijos** (el "1" y el "13" ocupan lo mismo) dentro de una columna de **26px**.
La columna N° mide igual en todas las carreras. **El mandil no es la causa.** Lo que Yesi ve
como "según el ancho del número" es una correlación: las carreras con 2 dígitos (T3, T4, T11,
con 11-13 ratificados) son también las que tienen más filas y otro contenido, y por eso la
tabla reparte distinto — ver punto 3.

## 3. Anchos: la tabla se AUTO-AJUSTA al contenido, y hay UNA tabla por carrera

`programa-oficial-color.html:162-177`:

```css
  /* ===== TABLA INSCRIPTOS ===== */
  table.inscriptos-color {
    width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 4px;
  }
  table.inscriptos-color thead th {
    background: var(--verde-muy-oscuro); color: #fff;
    padding: 5px 4px; font-weight: 700; text-transform: uppercase;
    font-size: 9px; letter-spacing: 0.5px; text-align: left;
  }
  table.inscriptos-color tbody td {
    padding: 3px 4px; border-bottom: 1px solid #E0E0E0; vertical-align: middle;
  }
  table.inscriptos-color tbody tr:nth-child(even) td { background: var(--gris-suave); }
  table.inscriptos-color .col-num { text-align: center; width: 26px; }
  table.inscriptos-color .col-kesp { white-space: nowrap; }
  table.inscriptos-color .col-spc { font-weight: 700; }
```

- No hay `table-layout: fixed` (grep en todo el archivo: cero ocurrencias).
- De 8 columnas, sólo **N°** tiene ancho (`26px`). Las otras 7 son `auto`: el browser las
  dimensiona por el contenido más largo de cada una y reparte el sobrante de `width:100%`
  en proporción a ese contenido.
- Cada carrera renderiza **su propia `<table>`** (`renderCarreraColor` devuelve un
  `<div class="carrera-color">` con la tabla adentro, `:703-725`), y varias carreras
  comparten página (`.carrera-color { page-break-inside: avoid; margin-bottom: 16px }`, `:117-119`).

Consecuencia: el borde izquierdo de S.P.C. = ancho(CABALLERIZA) + ancho(4 ÚLT.) + 34px de N°.
Las dos primeras dependen del contenido **de esa carrera**, así que **cada carrera cae en una
vertical distinta**, y en la misma hoja se ven dos o tres tablas con la columna corrida.
Eso es exactamente lo que reporta Yesi.

### Evidencia con los datos de R9

Query (solo lectura, MCP `execute_sql`), largo máximo del contenido por columna y por turno,
sólo ratificados (lo que imprime el programa, filtro en `:668`):

```sql
select ca.numero_turno as turno, ca.estado,
       count(*) filter (where i.estado='ratificado') as ratificados,
       max(length(coalesce(cb.nombre, p.nombre, ''))) filter (where i.estado='ratificado') as max_caballeriza,
       max(length(coalesce(i.performance, s.ult_performances, ''))) filter (where i.estado='ratificado') as max_4ult,
       max(length(s.nombre)) filter (where i.estado='ratificado') as max_spc,
       max(length(coalesce(s.padrillo_nombre,'')||' — '||coalesce(s.madre_nombre,''))) filter (where i.estado='ratificado') as max_pedigree,
       string_agg(distinct coalesce(i.performance, s.ult_performances, '∅'), ' | ') filter (where i.estado='ratificado') as muestras_4ult
from carreras ca
left join inscripciones i on i.carrera_id=ca.id
left join spcs s on s.id=i.spc_id
left join caballerizas cb on cb.id=i.caballeriza_id
left join propietarios p on p.id=i.propietario_id
where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
group by ca.numero_turno, ca.estado
order by ca.numero_turno;
```

Salida cruda completa:

```json
[{"turno":1,"estado":null,"ratificados":9,"max_caballeriza":17,"max_4ult":11,"max_spc":18,"max_pedigree":32,"muestras_4ult":"3D 4D 5D 9L | 3D 7T 6D | 4D 4D 3L 9L | 8D | 8L | 9L 7L | DEBUTA"},
 {"turno":2,"estado":"anulada","ratificados":0,"max_caballeriza":null,"max_4ult":null,"max_spc":null,"max_pedigree":null,"muestras_4ult":null},
 {"turno":3,"estado":"abierta","ratificados":13,"max_caballeriza":17,"max_4ult":11,"max_spc":15,"max_pedigree":33,"muestras_4ult":"0S | 3D 4D 7D 8D | 3T 3T 5T 6T | 5D 0L 3D 2D | 6D 5D 3D 7T | 6L 5T 8S 3D | 7D | 7T 5T 4T 4T | 8D4D5D7D | 9S 0L 0S 6D | DEBUTA | NO CORRERÁ"},
 {"turno":4,"estado":"abierta","ratificados":11,"max_caballeriza":17,"max_4ult":11,"max_spc":14,"max_pedigree":32,"muestras_4ult":"0D 6D | 0L | 0P | 2D 1D 9L 6D | 3L 2L 7L 5S | 5P 0P 8P 0P | 6D 8D 7D 7D | 6L 7L | 7D 0L | 7T | 8L 4D 8L 3D"},
 {"turno":5,"estado":"abierta","ratificados":7,"max_caballeriza":17,"max_4ult":11,"max_spc":14,"max_pedigree":34,"muestras_4ult":"1L 0L 0L 6D | 1L 0L 9L 9P | 2L 3L 4L 1D | 3D 1D 7L 6D | 3L 6L 2D 3T | 4P 1P 7S 4P | 9P 0L 6P 5D"},
 {"turno":6,"estado":"abierta","ratificados":7,"max_caballeriza":17,"max_4ult":11,"max_spc":13,"max_pedigree":31,"muestras_4ult":"0L 3D 0L 0P | 1L 6L 2D 0P | 1L 8L 7L 8L | 3D 1T 8L 1D | 3D 2L 0L 0L | 6Z 0Z 1D 8L | 7L 3L 2L 0L"},
 {"turno":7,"estado":"abierta","ratificados":8,"max_caballeriza":17,"max_4ult":14,"max_spc":15,"max_pedigree":35,"muestras_4ult":"0L 3D 0L 7D 5D | 0L 9S 4L 6L | 1D 4D 3L 8L | 1D 5D 1D 3D | 3S 4S 2S 3S | 5P 6L 3L 5L | 7L 2D 1D 4D | NO CORRERÁ"},
 {"turno":8,"estado":"anulada","ratificados":0,"max_caballeriza":null,"max_4ult":null,"max_spc":null,"max_pedigree":null,"muestras_4ult":null},
 {"turno":9,"estado":"abierta","ratificados":6,"max_caballeriza":13,"max_4ult":11,"max_spc":18,"max_pedigree":39,"muestras_4ult":"1D 1P 2D 5P | 2D 1D 2D 3D | 2P 8P 6S 1P | 3S 3L 9L 4L | 4P 0L 3L 1D | 9L 3L 4P 2T"},
 {"turno":10,"estado":"anulada","ratificados":0,"max_caballeriza":null,"max_4ult":null,"max_spc":null,"max_pedigree":null,"muestras_4ult":null},
 {"turno":11,"estado":"abierta","ratificados":13,"max_caballeriza":18,"max_4ult":11,"max_spc":15,"max_pedigree":34,"muestras_4ult":"0L 4D 3D 2D | 0L 9L 2D 7P | 2L 0L 0P 3D | 3D 2D 1D | 3D 4D | 3D 5D 4D 4D | 3D 7S 7S 0S | 3L 3L 2L 7L | 3P 5P 3S 4D | 8L 0L 0P 0P | 8L 9L 5D 3D | 9L 0L 2D 0L | 9L 5L 9D 9L"}]
```

Lectura:
- **CABALLERIZA** (1ª columna): máximo 17 en casi todas, **13 en T9**, **18 en T11** → esa columna ya
  mide distinto en T9 y T11 que en el resto.
- **4 ÚLT.** (2ª columna): 11 en todas menos **T7 = 14** (`0L 3D 0L 7D 5D`, cinco performances).
- Aun cuando las dos primeras columnas tienen el mismo máximo (T1, T3, T4, T5, T6), el S.P.C.
  se mueve igual, porque en layout auto el **sobrante** de la tabla se reparte entre las 7
  columnas auto en proporción a su contenido, y S.P.C. (13→18), PEDIGRÍ (31→39), JOCKEY y
  ENTRENADOR cambian por carrera. Cambia el reparto → cambia dónde arranca la 4ª columna.
- Las 8 tablas de R9 tienen 8 repartos distintos. La única columna estable es N°.

## 4. ¿El blanco y negro tiene el mismo problema? — SÍ, atenuado

`programa-oficial.html:39-54` (`main`):

```css
  table.inscriptos { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 4px; }
  ...
  table.inscriptos .col-numero { text-align: center; font-weight: 700; width: 24px; }
  table.inscriptos .col-kesp { white-space: nowrap; }
  /* Reparto de anchos: JOCKEY y ENTRENADOR necesitan su línea completa; PADRE — MADRE es
     el que más da y el que mejor tolera ceder (promedio 26-27 caracteres, y si aprieta
     envuelve sin perder sentido). Son sugerencias para el algoritmo auto de la tabla, no
     table-layout:fixed: el contenido sigue influyendo y nada se trunca. */
  table.inscriptos .col-jockey     { width: 15%; }
  table.inscriptos .col-entrenador { width: 15%; }
  table.inscriptos .col-pedigree   { width: 20%; }
```

Fila, `programa-oficial.html:476-483`:

```javascript
        <td>${caballeriza}</td>
        <td>${i.performance || spc.ult_performances || ''}</td>
        <td class="col-numero">${idx + 1}</td>
        <td><strong>${(spc.nombre || '').toUpperCase()}</strong></td>
        <td class="col-jockey">${jock ? nombreCorto(jock) : 'XX'}</td>
        <td class="col-kesp">${kesp}</td>
        <td class="col-pedigree">${padreMadre}</td>
        <td class="col-entrenador">${nombreCorto(entr)}</td>
```

Mismo esquema: una tabla por carrera, layout auto, N° en celda propia. El B&N tiene
sugerencias de ancho para JOCKEY/ENTRENADOR/PEDIGRÍ (50% pinneado, commit `65bf8cd`), pero
**CABALLERIZA, 4 ÚLT. y S.P.C. siguen auto** → el borde izquierdo de S.P.C. también varía por
carrera, sólo que sobre la mitad del ancho, así que el corrimiento es menor. El comentario del
propio archivo lo dice: *"Son sugerencias para el algoritmo auto de la tabla, no
table-layout:fixed: el contenido sigue influyendo"*. En el B&N el número es texto plano
(`${idx + 1}`), no chip; tampoco es la causa ahí (columna 24px fija).

El color **no heredó ni esas sugerencias**: es el único de los dos sin ningún reparto, por eso
Yesi lo nota en ése.

## 5. Las otras columnas — mismo motivo, todas se corren

En el color:

| Columna | Regla de ancho | ¿Se corre entre carreras? |
|---|---|---|
| CABALLERIZA | auto | sí (13/17/18 chars según turno) |
| 4 ÚLT. | auto | sí (11/14) |
| N° | `width:26px` + chip 22px | **no** |
| S.P.C. | auto (`font-weight:700`) | sí — la que Yesi nota, porque es la que se lee |
| K E S P | auto + `nowrap` | sí (contenido casi constante "57 3 M Z", pero su x depende de las 4 anteriores) |
| JOCKEY | auto | sí |
| PADRE — MADRE | auto (8.5px al imprimir, `:252`) | sí (31→39 chars) |
| ENTRENADOR | auto | sí |

Todas las columnas de la 4ª en adelante se corren por acumulación: su x es la suma de las
anteriores. **Es un solo defecto (layout auto por tabla), no ocho.** Cualquier arreglo que pinnee
las columnas arregla todas a la vez.

---

## Veredicto

**Causa**: `table.inscriptos-color` usa el layout automático de HTML (`width:100%`, sin
`table-layout:fixed`, 7 de 8 columnas sin ancho) y cada carrera es una tabla independiente.
El browser calcula el reparto de columnas por el contenido de cada carrera, así que la
columna S.P.C. (y todas las que siguen) arrancan en una vertical distinta en cada tabla.
El número de mandil **no** interviene: va en celda propia, con chip de 22px fijos en columna
de 26px.

**Arreglo mínimo** (un archivo, sólo CSS + un `<colgroup>`; no toca datos ni JS de negocio):

1. `programa-oficial-color.html:163-165` — agregar `table-layout: fixed`:
   ```css
   table.inscriptos-color {
     width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 4px;
     table-layout: fixed;
   }
   ```
2. `programa-oficial-color.html:719` — un `<colgroup>` con los 8 anchos, después de
   `<table class="inscriptos-color">`, para que las 8 tablas usen exactamente la misma grilla
   (con `table-layout:fixed` los anchos salen de las `<col>`, no del contenido). Punto de
   partida, sobre ~194mm útiles (A4, márgenes 8mm, `@page` en `:23`) y los máximos medidos en R9:
   ```html
   <colgroup>
     <col style="width:17%">   <!-- CABALLERIZA  (máx 18 chars) -->
     <col style="width:12%">   <!-- 4 ÚLT.       (máx 14 chars) -->
     <col style="width:34px">  <!-- N°           chip 22px + padding -->
     <col style="width:17%">   <!-- S.P.C.       (máx 18 chars, negrita) -->
     <col style="width:9%">    <!-- K E S P      nowrap -->
     <col style="width:12%">   <!-- JOCKEY -->
     <col>                     <!-- PADRE — MADRE: absorbe el resto y envuelve, como hoy -->
     <col style="width:12%">   <!-- ENTRENADOR -->
   </colgroup>
   ```
   Sacar `width: 26px` de `.col-num` en `:175` (queda redundante con la `<col>`).

Con `table-layout:fixed` el texto **no se trunca**: lo que no entra envuelve a la línea
siguiente (igual que hoy hace el pedigrí). El único cuidado es K E S P, que tiene `nowrap`
(`:176`): si la columna queda corta se desborda en vez de envolver — por eso 9% (~65px para
"57 3 M Z" ≈ 45px).

**Alternativa más chica pero menos segura**: sin `table-layout:fixed`, poner `width:%` en las
tres columnas de la izquierda (como hizo el B&N con las de la derecha en `65bf8cd`). En auto
el browser respeta el % mientras el contenido entre, así que en R9 alinearía; pero el día que
una caballeriza o una performance sea más larga que su %, la columna vuelve a crecer y el
corrimiento reaparece sin aviso. Para algo que va a imprenta conviene lo determinístico.

**Mismo arreglo aplica al B&N** (`programa-oficial.html:39-54`): hoy tiene el problema
atenuado. Es decisión aparte; no hace falta para el domingo si Yesi imprime el color.

**Verificación posible sin browser**: ninguna que muestre el render (sin Chromium, `docs/SERVER.md`).
Se puede asegurar por probe que el archivo servido tiene `table-layout: fixed` y 8 `<col>` por
tabla (assert de texto, patrón `tests/README.md`), y la alineación real la confirma Yesi en la
vista previa de impresión.

---

## Preguntas abiertas / hallazgos colaterales (datos, no código)

1. **Dos ratificados de R9 imprimen "NO CORRERÁ" en la columna 4 ÚLT.** Query y salida:

   ```sql
   select ca.numero_turno as turno, s.nombre as spc, i.estado, i.performance, s.ult_performances, i.numero_partidor
   from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id
   where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.estado='ratificado'
     and (i.performance ilike '%correr%' or s.ult_performances ilike '%correr%' or length(coalesce(i.performance, s.ult_performances,''))>=14)
   order by 1,2;
   ```
   ```json
   [{"turno":3,"spc":"LOCA DUBAI","estado":"ratificado","performance":"NO CORRERÁ","ult_performances":null,"numero_partidor":6},
    {"turno":7,"spc":"ECHO IN THE SKY","estado":"ratificado","performance":"0L 3D 0L 7D 5D","ult_performances":null,"numero_partidor":2},
    {"turno":7,"spc":"LE BATEAU","estado":"ratificado","performance":"NO CORRERÁ","ult_performances":null,"numero_partidor":6}]
   ```
   LOCA DUBAI (T3, gatera 6) y LE BATEAU (T7, gatera 6) están `ratificado` con la performance
   escrita a mano como "NO CORRERÁ". El programa los imprime como corredores, con mandil, y el
   texto sale en la columna de performances. Si de verdad no corren, corresponde `forfait`
   desde `ratificacion.html` (y el mandil de los que siguen se renumera solo,
   `renumerarChapas`). Es de Yesi/Fede; no se tocó.
2. ECHO IN THE SKY tiene 5 performances (`0L 3D 0L 7D 5D`) en una columna titulada "4 ÚLT." —
   es el dato que hace más ancha la 2ª columna en T7. Dato, no bug.
3. T1 tiene `carreras.estado = NULL` (GOTCHA #5; el filtro NULL-safe ya está en `:229` del
   B&N y equivalente en el color). Sólo se anota; no afecta este diagnóstico.

---

## Comandos corridos (tal cual)

```
$ cd /home/clio/dev/SGH && git branch --show-current && git rev-parse HEAD && wc -l programa-oficial-color.html programa-oficial.html
main
a25978372d1fec384a3d1a9b9a96ecb7681065e4
  730 programa-oficial-color.html
  516 programa-oficial.html
 1246 total

$ grep -n "table-layout\|nowrap\|col-\|@page\|page-break\|break-inside" programa-oficial-color.html
23:  @page { size: A4; margin: 10mm 8mm; }
26:  .tapa { min-height: 277mm; page-break-after: always; display: flex; flex-direction: column; }
118:    page-break-inside: avoid; margin-bottom: 16px; position: relative;
175:  table.inscriptos-color .col-num { text-align: center; width: 26px; }
176:  table.inscriptos-color .col-kesp { white-space: nowrap; }
177:  table.inscriptos-color .col-spc { font-weight: 700; }
223:    page-break-inside: avoid;
233:  .pagina-final { page-break-inside: avoid; padding-top: 20px; }
243:    /* El flyer no debe generar una página extra: sin page-break-before y sin margen que desborde. */
244:    .flyer-pie { page-break-before: avoid; page-break-after: auto; break-inside: avoid; }
252:    table.inscriptos-color .col-pedigree { font-size: 8.5px; }
690:        <td class="col-num">${partidorChipHTML(fi + 1)}</td>
691:        <td class="col-spc">${(spc.nombre || '').toUpperCase()}</td>
692:        <td class="col-kesp">${kesp}</td>
694:        <td class="col-pedigree">${padreMadre}</td>
721:        <th>CABALLERIZA</th><th>4 ÚLT.</th><th>N°</th><th>S.P.C.</th><th>K E S P</th><th>JOCKEY</th><th class="col-pedigree">PADRE — MADRE</th><th>ENTRENADOR</th>

$ grep -n "table-layout\|nowrap\|<table\|<td\|<th\|width:" programa-oficial.html | head -60
15:  .programa-page { max-width: 21cm; margin: 0 auto; }
21:  .programa-header .logo img { max-width: 140px; max-height: 80px; }
39:  table.inscriptos { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 4px; }
46:  table.inscriptos .col-numero { text-align: center; font-weight: 700; width: 24px; }
47:  table.inscriptos .col-kesp { white-space: nowrap; }
51:     table-layout:fixed: el contenido sigue influyendo y nada se trunca. */
52:  table.inscriptos .col-jockey     { width: 15%; }
53:  table.inscriptos .col-entrenador { width: 15%; }
54:  table.inscriptos .col-pedigree   { width: 20%; }
65:    .programa-page { max-width: none; }
90:  .sponsor-item img { max-width:120px; max-height:60px; filter:grayscale(100%); }
476:        <td>${caballeriza}</td>
477:        <td>${i.performance || spc.ult_performances || ''}</td>
478:        <td class="col-numero">${idx + 1}</td>
479:        <td><strong>${(spc.nombre || '').toUpperCase()}</strong></td>
480:        <td class="col-jockey">${jock ? nombreCorto(jock) : 'XX'}</td>
481:        <td class="col-kesp">${kesp}</td>
482:        <td class="col-pedigree">${padreMadre}</td>
483:        <td class="col-entrenador">${nombreCorto(entr)}</td>
505:    <table class="inscriptos">
506:      <thead><tr>
507:        <th>CABALLERIZA</th><th>4 ULT. PERF.</th><th>N°</th><th>S.P.C.</th><th class="col-jockey">JOCKEY</th><th>K E S P</th><th class="col-pedigree">PADRE — MADRE</th><th class="col-entrenador">ENTRENADOR</th>
509:      <tbody>${filas || '<tr><td colspan="8" style="text-align:center;font-style:italic;">Sin inscriptos</td></tr>'}</tbody>

$ git log --oneline -8 -- programa-oficial-color.html programa-oficial.html
60ce22b feat(programa): hoja final en blanco opcional en el B&N
38989d8 fix(edad): edad de SPC segun la regla del 1 de julio, referida a la reunion
07371e3 fix(programa): K E S P con espacio simple, sin caracteres separadores
d53feda fix(programa): separar K E S P, sacar GAN. MÍN. y mostrar el bono por posición
7a8795e fix(programa-bn): celdas con vertical-align middle, como el color
aaa47c0 fix(programa): PADRE — MADRE 1pt más chico al imprimir, en ambos programas
65bf8cd fix(programa-bn): ancho y tipografía de impresión — una línea por caballo
1b5c31c fix(programa-color): badge del bono en flujo, deja de tapar la condición

-- guard (MCP execute_sql)
select (select count(*) from spcs) as spcs_count,
       (select count(*) from carreras ca where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9') as carreras_r9;
[{"spcs_count":210,"carreras_r9":11}]
```

## Publicación

(se completa abajo con `git push` + `git ls-remote`)

```
$ git push -u origin reports
$ git ls-remote origin reports
a81a7bdb55e928128f5fd7907fe654040c93cd29	refs/heads/reports
$ git rev-parse HEAD
a81a7bdb55e928128f5fd7907fe654040c93cd29
```
(SHA del commit del informe. El commit siguiente sólo agrega este bloque.)
