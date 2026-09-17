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

---

## 6. Recomendación y anchos propuestos — verificados contra el contenido real de R9

**Método** (sin browser, `docs/SERVER.md`): se midió el ancho de cada celda que imprime
`renderCarreraColor` para los **74 ratificados** de R9 con las métricas reales de **Roboto**
(los mismos TTF v51 de `fonts.gstatic.com` que carga la página, pesos 400 y 700), a la
tipografía del CSS de `main` (td 9.5px; `.col-spc` 700; `.col-pedigree` 8.5px al imprimir;
th 9px 700 con `letter-spacing:0.5px`), y se simuló el word-wrap con anchos fijos. Los textos
salen del mismo armado que el HTML: `nombreCorto`, `kespTexto`, `edadSPC` extraídos por ancla
del archivo real (patrón `tests/README.md`), datos por Supabase con la secret key. La medición
suma advances por glifo **sin kerning** — Roboto kernea negativo, así que sobreestima ~1-2%:
conservador. Scripts completos en el apéndice.

Ancho de tabla al imprimir: A4 210mm − 2×8mm (`@page`, `:23`) = **194mm = 733.2px**. Padding
de celda 4px por lado (`:168`, `:172`) → texto = columna − 8px.

### 6.1 Lo más ancho de cada columna en R9 (max-content)

```json
{
 "fecha_reunion": "2026-09-20",
 "tabla_px": 733.2,
 "ratificados": 74,
 "carreras": [
  1,
  3,
  4,
  5,
  6,
  7,
  9,
  11
 ],
 "max_content": {
  "CABALLERIZA": {
   "txt": "MONTE DEL TORDILLO",
   "px": 97.8,
   "turno": 11,
   "head_px": 63.9,
   "min_col_1linea": 105.8
  },
  "ULT4": {
   "txt": "0L 3D 0L 7D 5D",
   "px": 65.1,
   "turno": 7,
   "head_px": 29.4,
   "min_col_1linea": 73.1
  },
  "SPC": {
   "txt": "DOCTORA APASIONADA",
   "px": 105.9,
   "turno": 1,
   "head_px": 28.1,
   "min_col_1linea": 113.9
  },
  "KESP": {
   "txt": "57 3 M A",
   "px": 37.6,
   "turno": 1,
   "head_px": 32.3,
   "min_col_1linea": 45.6
  },
  "JOCKEY": {
   "txt": "DELLI QUADRI IGNACIO",
   "px": 100.1,
   "turno": 1,
   "head_px": 36.5,
   "min_col_1linea": 108.1
  },
  "PEDIGREE": {
   "txt": "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO",
   "px": 188.4,
   "turno": 9,
   "head_px": 77,
   "min_col_1linea": 196.4
  },
  "ENTRENADOR": {
   "txt": "MONGAY MAXIMILIANO",
   "px": 103.5,
   "turno": 11,
   "head_px": 63,
   "min_col_1linea": 111.5
  }
 },
 "sum_max_content_px": 788.4
}
```

`min_col_1linea` = lo que necesita la columna para que **nada** envuelva (máx(texto, header) + padding).
Sumadas las 7 + los 34px de N°: **788.4px contra 733.2px disponibles. Faltan 55px.** No existe
reparto —ni fijo ni auto— en el que todo entre en una línea con esta tipografía y estos márgenes.
Hoy el layout auto ya resuelve eso achicando columnas y envolviendo (por eso el pedigrí está
en 8.5px al imprimir, `:247-252`); lo que cambia con `table-layout:fixed` es **quién** cede y que
sea **el mismo en las 8 tablas**.

### 6.2 La propuesta del §Veredicto (17/12/34px/17/9/12/resto/12) — DESCARTADA

Medida contra R9: JOCKEY envuelve en **20** filas, ENTRENADOR en **34**, PADRE—MADRE en **51**
(quedaba con 112px de texto). Apellido y nombre partidos en dos líneas en la mitad de los
entrenadores. No sirve. Salida completa en el apéndice (escenario A).

### 6.3 Dato clave: una celda de 2 líneas NO hace la fila más alta

El chip del mandil es `inline-block` de **22px** de alto (`:179-185`): la fila ya mide ≥ 22px + 6px
de padding en **todas** las filas. Dos líneas de texto miden:

```
9.5px × line-height normal de Roboto (1.172) = 11.1px/línea → 2 líneas = 22.3px
8.5px (pedigrí impreso)                                     → 2 líneas = 19.9px
```

Un pedigrí a 2 líneas (19.9px) **entra dentro del alto que ya impone el chip**. No corre nada
hacia abajo, no cambia la paginación. El costo de envolver es sólo estético, y en el pedigrí es
el menor (es el dato menos leído; `:247` lo dice).

### 6.4 Escenarios medidos (74 filas; "envuelven" = filas que pasan a 2 líneas)

```

### B — cada columna a su máximo de R9, PADRE—MADRE el resto  (total 733.2px)
  CABALLERIZA col    106px  texto     98px  envuelven: 0  header entra: true
  ULT4        col     74px  texto     66px  envuelven: 0  header entra: true
  SPC         col    114px  texto    106px  envuelven: 0  header entra: true
  KESP        col     46px  texto     38px  envuelven: 0  header entra: true
  JOCKEY      col    108px  texto    100px  envuelven: 3  header entra: true
  PEDIGREE    col  139.2px  texto  131.2px  envuelven: 30  header entra: true
  ENTRENADOR  col    112px  texto    104px  envuelven: 0  header entra: true
  JOCKEY T1#2 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T4#4 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T9#3 "DELLI QUADRI IGNACIO" → 2 líneas
  PEDIGREE T1#2 "EMMANUEL — MILONGA BURRERA" → 2 líneas
  PEDIGREE T1#4 "DUBAI THUNDER (GB) — GRELA (USA)" → 2 líneas
  PEDIGREE T1#5 "THE GARDEN — VENECIANA STORM" → 2 líneas
  PEDIGREE T1#6 "DOCTOR EMBRUJO — ETERNA DIABLITA" → 2 líneas
  PEDIGREE T1#7 "DOCTOR EMBRUJO — GIRL PASSION" → 2 líneas
  PEDIGREE T1#8 "MANIPULER — RECONDITA ARMONIA" → 2 líneas
  PEDIGREE T3#1 "LEAD TO WIN — SWEET JOHAR (USA)" → 2 líneas
  PEDIGREE T3#2 "GOLDEN CIGARS — SIXTIES SPIRIT" → 2 líneas
  PEDIGREE T3#3 "HELIOSTATIC (IRE) — HONRADEZA" → 2 líneas
  PEDIGREE T3#4 "DOCTOR EMBRUJO — MATRERA SKY" → 2 líneas
  PEDIGREE T3#6 "DUBAI THUNDER (GB) — SUNNY MAD" → 2 líneas
  PEDIGREE T3#8 "FOOTNOTES (USA) — ASTATA RIDE" → 2 líneas
  PEDIGREE T3#9 "HIT IT A BOMB (USA) — SARAWAK TOP" → 2 líneas
  PEDIGREE T4#9 "SOUTHERN CAT (CHI) — GALAXY GIRL" → 2 líneas
  PEDIGREE T4#11 "CURIOSO JOHAN — CONTEMPLADORA" → 2 líneas
  PEDIGREE T5#2 "TODO UN AMIGUITO — READING MY MIND" → 2 líneas
  PEDIGREE T5#4 "TODO UN AMIGUITO — STORMY ELLIPTIC" → 2 líneas
  PEDIGREE T5#7 "MANIPULATOR (USA) — VOWED (USA)" → 2 líneas
  PEDIGREE T6#3 "EQUAL EDITION — REINA GLORIOSA" → 2 líneas
  PEDIGREE T6#5 "MAIPO TOP — HALLOWEENINSEATTLE" → 2 líneas
  PEDIGREE T6#7 "HOLY BOSS (USA) — FREE EXCHANGE" → 2 líneas
  PEDIGREE T7#3 "CIMA DE TRIOMPHE (IRE) — SOLICITADA" → 2 líneas
  PEDIGREE T7#4 "SECURITY RISK (USA) — SPANAKOPITAS" → 2 líneas
  PEDIGREE T7#5 "CHUCK BERRY — SPOKES WOMAN" → 2 líneas
  PEDIGREE T7#8 "DANIEL BOONE (BRZ) — ATOMIC STAR" → 2 líneas
  PEDIGREE T9#1 "DANIEL BOONE (BRZ) — QUE FELICIDAD" → 2 líneas
  PEDIGREE T9#5 "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO" → 2 líneas
  PEDIGREE T11#2 "GRAND REWARD (USA) — BEAUTY SHINER" → 2 líneas
  PEDIGREE T11#5 "PURE MIRON — BATACLANA MORA" → 2 líneas
  PEDIGREE T11#11 "CURIOSO JOHAN — GRINGA AYELEN" → 2 líneas
  desbordes: ninguno

### C — JOCKEY 96 / ENTRENADOR 104 (cede 1 nombre cada una), PADRE—MADRE el resto  (total 733.2px)
  CABALLERIZA col    106px  texto     98px  envuelven: 0  header entra: true
  ULT4        col     74px  texto     66px  envuelven: 0  header entra: true
  SPC         col    114px  texto    106px  envuelven: 0  header entra: true
  KESP        col     46px  texto     38px  envuelven: 0  header entra: true
  JOCKEY      col     96px  texto     88px  envuelven: 6  header entra: true
  PEDIGREE    col  159.2px  texto  151.2px  envuelven: 8  header entra: true
  ENTRENADOR  col    104px  texto     96px  envuelven: 9  header entra: true
  JOCKEY T1#2 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T4#4 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T5#4 "ARREGUY FRANCISCO" → 2 líneas
  JOCKEY T7#6 "ARREGUY FRANCISCO" → 2 líneas
  JOCKEY T9#3 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T11#2 "GONZALEZ EDUARDO" → 2 líneas
  PEDIGREE T1#6 "DOCTOR EMBRUJO — ETERNA DIABLITA" → 2 líneas
  PEDIGREE T5#2 "TODO UN AMIGUITO — READING MY MIND" → 2 líneas
  PEDIGREE T5#4 "TODO UN AMIGUITO — STORMY ELLIPTIC" → 2 líneas
  PEDIGREE T7#3 "CIMA DE TRIOMPHE (IRE) — SOLICITADA" → 2 líneas
  PEDIGREE T7#4 "SECURITY RISK (USA) — SPANAKOPITAS" → 2 líneas
  PEDIGREE T9#1 "DANIEL BOONE (BRZ) — QUE FELICIDAD" → 2 líneas
  PEDIGREE T9#5 "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO" → 2 líneas
  PEDIGREE T11#2 "GRAND REWARD (USA) — BEAUTY SHINER" → 2 líneas
  ENTRENADOR T3#5 "TAVAGNUTTI RICARDO" → 2 líneas
  ENTRENADOR T3#13 "ANRIQUEZ GERONIMO" → 2 líneas
  ENTRENADOR T4#4 "ANRIQUEZ GERONIMO" → 2 líneas
  ENTRENADOR T4#6 "TAVAGNUTTI RICARDO" → 2 líneas
  ENTRENADOR T5#1 "ANRIQUEZ GERONIMO" → 2 líneas
  ENTRENADOR T5#6 "TAVAGNUTTI RICARDO" → 2 líneas
  ENTRENADOR T7#1 "ZUBIARRAIN SANTIAGO" → 2 líneas
  ENTRENADOR T11#12 "MONGAY MAXIMILIANO" → 2 líneas
  ENTRENADOR T11#13 "VILLANUEVA SANTINO" → 2 líneas
  desbordes: ninguno

### D — C + 4 ÚLT. 62 (4 performances, la de 5 envuelve)  (total 733.2px)
  CABALLERIZA col    106px  texto     98px  envuelven: 0  header entra: true
  ULT4        col     62px  texto     54px  envuelven: 3  header entra: true
  SPC         col    114px  texto    106px  envuelven: 0  header entra: true
  KESP        col     46px  texto     38px  envuelven: 0  header entra: true
  JOCKEY      col     96px  texto     88px  envuelven: 6  header entra: true
  PEDIGREE    col  171.2px  texto  163.2px  envuelven: 1  header entra: true
  ENTRENADOR  col    104px  texto     96px  envuelven: 9  header entra: true
  ULT4 T3#6 "NO CORRERÁ" → 2 líneas
  ULT4 T7#2 "0L 3D 0L 7D 5D" → 2 líneas
  ULT4 T7#6 "NO CORRERÁ" → 2 líneas
  JOCKEY T1#2 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T4#4 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T5#4 "ARREGUY FRANCISCO" → 2 líneas
  JOCKEY T7#6 "ARREGUY FRANCISCO" → 2 líneas
  JOCKEY T9#3 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T11#2 "GONZALEZ EDUARDO" → 2 líneas
  PEDIGREE T9#5 "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO" → 2 líneas
  ENTRENADOR T3#5 "TAVAGNUTTI RICARDO" → 2 líneas
  ENTRENADOR T3#13 "ANRIQUEZ GERONIMO" → 2 líneas
  ENTRENADOR T4#4 "ANRIQUEZ GERONIMO" → 2 líneas
  ENTRENADOR T4#6 "TAVAGNUTTI RICARDO" → 2 líneas
  ENTRENADOR T5#1 "ANRIQUEZ GERONIMO" → 2 líneas
  ENTRENADOR T5#6 "TAVAGNUTTI RICARDO" → 2 líneas
  ENTRENADOR T7#1 "ZUBIARRAIN SANTIAGO" → 2 líneas
  ENTRENADOR T11#12 "MONGAY MAXIMILIANO" → 2 líneas
  ENTRENADOR T11#13 "VILLANUEVA SANTINO" → 2 líneas
  desbordes: ninguno

### E — D + CABALLERIZA 100 (MONTE DEL TORDILLO envuelve)  (total 733.2px)
  CABALLERIZA col    100px  texto     92px  envuelven: 4  header entra: true
  ULT4        col     62px  texto     54px  envuelven: 3  header entra: true
  SPC         col    114px  texto    106px  envuelven: 0  header entra: true
  KESP        col     46px  texto     38px  envuelven: 0  header entra: true
  JOCKEY      col     96px  texto     88px  envuelven: 6  header entra: true
  PEDIGREE    col  177.2px  texto  169.2px  envuelven: 1  header entra: true
  ENTRENADOR  col    104px  texto     96px  envuelven: 9  header entra: true
  CABALLERIZA T1#3 "PARAJE LA TABLADA" → 2 líneas
  CABALLERIZA T6#6 "PARAJE LA TABLADA" → 2 líneas
  CABALLERIZA T11#5 "MONTE DEL TORDILLO" → 2 líneas
  CABALLERIZA T11#12 "HS LA HORMIGONERA" → 2 líneas
  ULT4 T3#6 "NO CORRERÁ" → 2 líneas
  ULT4 T7#2 "0L 3D 0L 7D 5D" → 2 líneas
  ULT4 T7#6 "NO CORRERÁ" → 2 líneas
  JOCKEY T1#2 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T4#4 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T5#4 "ARREGUY FRANCISCO" → 2 líneas
  JOCKEY T7#6 "ARREGUY FRANCISCO" → 2 líneas
  JOCKEY T9#3 "DELLI QUADRI IGNACIO" → 2 líneas
  JOCKEY T11#2 "GONZALEZ EDUARDO" → 2 líneas
  PEDIGREE T9#5 "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO" → 2 líneas
  ENTRENADOR T3#5 "TAVAGNUTTI RICARDO" → 2 líneas
  ENTRENADOR T3#13 "ANRIQUEZ GERONIMO" → 2 líneas
  ENTRENADOR T4#4 "ANRIQUEZ GERONIMO" → 2 líneas
  ENTRENADOR T4#6 "TAVAGNUTTI RICARDO" → 2 líneas
  ENTRENADOR T5#1 "ANRIQUEZ GERONIMO" → 2 líneas
  ENTRENADOR T5#6 "TAVAGNUTTI RICARDO" → 2 líneas
  ENTRENADOR T7#1 "ZUBIARRAIN SANTIAGO" → 2 líneas
  ENTRENADOR T11#12 "MONGAY MAXIMILIANO" → 2 líneas
  ENTRENADOR T11#13 "VILLANUEVA SANTINO" → 2 líneas
  desbordes: ninguno



### F' — recomendado: padding 4px, @page 8mm (como hoy)  (tabla 733.2px, padding 4px/lado)
  CABALLERIZA col    108px  texto    100px  envuelven: 0  header entra: true
  ULT4        col     66px  texto     58px  envuelven: 1  header entra: true
  SPC         col    116px  texto    108px  envuelven: 0  header entra: true
  KESP        col     52px  texto     44px  envuelven: 0  header entra: true
  JOCKEY      col    111px  texto    103px  envuelven: 0  header entra: true
  PEDIGREE    col  132.2px  texto  124.2px  envuelven: 38  header entra: true
  ENTRENADOR  col    114px  texto    106px  envuelven: 0  header entra: true
  ULT4 T7#2 "0L 3D 0L 7D 5D" → 2 líneas
  PADRE—MADRE a 2 líneas: 38
  PEDIGREE T1#2 "EMMANUEL — MILONGA BURRERA" → 2 líneas
  PEDIGREE T1#4 "DUBAI THUNDER (GB) — GRELA (USA)" → 2 líneas
  PEDIGREE T1#5 "THE GARDEN — VENECIANA STORM" → 2 líneas
  PEDIGREE T1#6 "DOCTOR EMBRUJO — ETERNA DIABLITA" → 2 líneas
  PEDIGREE T1#7 "DOCTOR EMBRUJO — GIRL PASSION" → 2 líneas
  PEDIGREE T1#8 "MANIPULER — RECONDITA ARMONIA" → 2 líneas
  PEDIGREE T3#1 "LEAD TO WIN — SWEET JOHAR (USA)" → 2 líneas
  PEDIGREE T3#2 "GOLDEN CIGARS — SIXTIES SPIRIT" → 2 líneas
  PEDIGREE T3#3 "HELIOSTATIC (IRE) — HONRADEZA" → 2 líneas
  PEDIGREE T3#4 "DOCTOR EMBRUJO — MATRERA SKY" → 2 líneas
  PEDIGREE T3#5 "FISKARDO — EVER PROPULSORA" → 2 líneas
  PEDIGREE T3#6 "DUBAI THUNDER (GB) — SUNNY MAD" → 2 líneas
  PEDIGREE T3#8 "FOOTNOTES (USA) — ASTATA RIDE" → 2 líneas
  PEDIGREE T3#9 "HIT IT A BOMB (USA) — SARAWAK TOP" → 2 líneas
  PEDIGREE T3#12 "PUERTO ESCONDIDO — ALMEDHA" → 2 líneas
  PEDIGREE T4#6 "SEAHENGE (USA) — NIÑA DIVINA" → 2 líneas
  PEDIGREE T4#9 "SOUTHERN CAT (CHI) — GALAXY GIRL" → 2 líneas
  PEDIGREE T4#11 "CURIOSO JOHAN — CONTEMPLADORA" → 2 líneas
  PEDIGREE T5#2 "TODO UN AMIGUITO — READING MY MIND" → 2 líneas
  PEDIGREE T5#4 "TODO UN AMIGUITO — STORMY ELLIPTIC" → 2 líneas
  PEDIGREE T5#7 "MANIPULATOR (USA) — VOWED (USA)" → 2 líneas
  PEDIGREE T6#2 "IL CAMPIONE (CHI) — INDIGIRKA" → 2 líneas
  PEDIGREE T6#3 "EQUAL EDITION — REINA GLORIOSA" → 2 líneas
  PEDIGREE T6#5 "MAIPO TOP — HALLOWEENINSEATTLE" → 2 líneas
  PEDIGREE T6#7 "HOLY BOSS (USA) — FREE EXCHANGE" → 2 líneas
  PEDIGREE T7#1 "SEÑOR CANDY (USA) — EMCALU" → 2 líneas
  PEDIGREE T7#3 "CIMA DE TRIOMPHE (IRE) — SOLICITADA" → 2 líneas
  PEDIGREE T7#4 "SECURITY RISK (USA) — SPANAKOPITAS" → 2 líneas
  PEDIGREE T7#5 "CHUCK BERRY — SPOKES WOMAN" → 2 líneas
  PEDIGREE T7#8 "DANIEL BOONE (BRZ) — ATOMIC STAR" → 2 líneas
  PEDIGREE T9#1 "DANIEL BOONE (BRZ) — QUE FELICIDAD" → 2 líneas
  PEDIGREE T9#5 "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO" → 2 líneas
  PEDIGREE T11#2 "GRAND REWARD (USA) — BEAUTY SHINER" → 2 líneas
  PEDIGREE T11#3 "UPWARD TREND (USA) — QUIRIBA" → 2 líneas
  PEDIGREE T11#5 "PURE MIRON — BATACLANA MORA" → 2 líneas
  PEDIGREE T11#11 "CURIOSO JOHAN — GRINGA AYELEN" → 2 líneas
  PEDIGREE T11#12 "STORM QUESTION — REDONDIYA" → 2 líneas
  PEDIGREE T11#13 "CHARLES KING — BIEN TERRIBLE" → 2 líneas
  desbordes: ninguno

### F'+p3 — igual, con padding 3px por lado en td/th  (tabla 733.2px, padding 3px/lado)
  CABALLERIZA col    106px  texto    100px  envuelven: 0  header entra: true
  ULT4        col     64px  texto     58px  envuelven: 1  header entra: true
  SPC         col    114px  texto    108px  envuelven: 0  header entra: true
  KESP        col     50px  texto     44px  envuelven: 0  header entra: true
  JOCKEY      col    109px  texto    103px  envuelven: 0  header entra: true
  PEDIGREE    col  146.2px  texto  140.2px  envuelven: 21  header entra: true
  ENTRENADOR  col    112px  texto    106px  envuelven: 0  header entra: true
  ULT4 T7#2 "0L 3D 0L 7D 5D" → 2 líneas
  PADRE—MADRE a 2 líneas: 21
  PEDIGREE T1#4 "DUBAI THUNDER (GB) — GRELA (USA)" → 2 líneas
  PEDIGREE T1#6 "DOCTOR EMBRUJO — ETERNA DIABLITA" → 2 líneas
  PEDIGREE T1#8 "MANIPULER — RECONDITA ARMONIA" → 2 líneas
  PEDIGREE T3#1 "LEAD TO WIN — SWEET JOHAR (USA)" → 2 líneas
  PEDIGREE T3#4 "DOCTOR EMBRUJO — MATRERA SKY" → 2 líneas
  PEDIGREE T3#6 "DUBAI THUNDER (GB) — SUNNY MAD" → 2 líneas
  PEDIGREE T3#9 "HIT IT A BOMB (USA) — SARAWAK TOP" → 2 líneas
  PEDIGREE T4#9 "SOUTHERN CAT (CHI) — GALAXY GIRL" → 2 líneas
  PEDIGREE T4#11 "CURIOSO JOHAN — CONTEMPLADORA" → 2 líneas
  PEDIGREE T5#2 "TODO UN AMIGUITO — READING MY MIND" → 2 líneas
  PEDIGREE T5#4 "TODO UN AMIGUITO — STORMY ELLIPTIC" → 2 líneas
  PEDIGREE T5#7 "MANIPULATOR (USA) — VOWED (USA)" → 2 líneas
  PEDIGREE T6#5 "MAIPO TOP — HALLOWEENINSEATTLE" → 2 líneas
  PEDIGREE T6#7 "HOLY BOSS (USA) — FREE EXCHANGE" → 2 líneas
  PEDIGREE T7#3 "CIMA DE TRIOMPHE (IRE) — SOLICITADA" → 2 líneas
  PEDIGREE T7#4 "SECURITY RISK (USA) — SPANAKOPITAS" → 2 líneas
  PEDIGREE T7#8 "DANIEL BOONE (BRZ) — ATOMIC STAR" → 2 líneas
  PEDIGREE T9#1 "DANIEL BOONE (BRZ) — QUE FELICIDAD" → 2 líneas
  PEDIGREE T9#5 "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO" → 2 líneas
  PEDIGREE T11#2 "GRAND REWARD (USA) — BEAUTY SHINER" → 2 líneas
  PEDIGREE T11#11 "CURIOSO JOHAN — GRINGA AYELEN" → 2 líneas
  desbordes: ninguno

### F'+p3+m6 — padding 3px y @page margin lateral 6mm (198mm = 748.3px)  (tabla 748.3px, padding 3px/lado)
  CABALLERIZA col    106px  texto    100px  envuelven: 0  header entra: true
  ULT4        col     64px  texto     58px  envuelven: 1  header entra: true
  SPC         col    114px  texto    108px  envuelven: 0  header entra: true
  KESP        col     50px  texto     44px  envuelven: 0  header entra: true
  JOCKEY      col    109px  texto    103px  envuelven: 0  header entra: true
  PEDIGREE    col  161.3px  texto  155.3px  envuelven: 6  header entra: true
  ENTRENADOR  col    112px  texto    106px  envuelven: 0  header entra: true
  ULT4 T7#2 "0L 3D 0L 7D 5D" → 2 líneas
  PADRE—MADRE a 2 líneas: 6
  PEDIGREE T5#2 "TODO UN AMIGUITO — READING MY MIND" → 2 líneas
  PEDIGREE T5#4 "TODO UN AMIGUITO — STORMY ELLIPTIC" → 2 líneas
  PEDIGREE T7#3 "CIMA DE TRIOMPHE (IRE) — SOLICITADA" → 2 líneas
  PEDIGREE T7#4 "SECURITY RISK (USA) — SPANAKOPITAS" → 2 líneas
  PEDIGREE T9#5 "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO" → 2 líneas
  PEDIGREE T11#2 "GRAND REWARD (USA) — BEAUTY SHINER" → 2 líneas
  desbordes: ninguno

### F'+m6 — padding 4px y @page margin lateral 6mm  (tabla 748.3px, padding 4px/lado)
  CABALLERIZA col    108px  texto    100px  envuelven: 0  header entra: true
  ULT4        col     66px  texto     58px  envuelven: 1  header entra: true
  SPC         col    116px  texto    108px  envuelven: 0  header entra: true
  KESP        col     52px  texto     44px  envuelven: 0  header entra: true
  JOCKEY      col    111px  texto    103px  envuelven: 0  header entra: true
  PEDIGREE    col  147.3px  texto  139.3px  envuelven: 22  header entra: true
  ENTRENADOR  col    114px  texto    106px  envuelven: 0  header entra: true
  ULT4 T7#2 "0L 3D 0L 7D 5D" → 2 líneas
  PADRE—MADRE a 2 líneas: 22
  PEDIGREE T1#4 "DUBAI THUNDER (GB) — GRELA (USA)" → 2 líneas
  PEDIGREE T1#6 "DOCTOR EMBRUJO — ETERNA DIABLITA" → 2 líneas
  PEDIGREE T1#7 "DOCTOR EMBRUJO — GIRL PASSION" → 2 líneas
  PEDIGREE T1#8 "MANIPULER — RECONDITA ARMONIA" → 2 líneas
  PEDIGREE T3#1 "LEAD TO WIN — SWEET JOHAR (USA)" → 2 líneas
  PEDIGREE T3#4 "DOCTOR EMBRUJO — MATRERA SKY" → 2 líneas
  PEDIGREE T3#6 "DUBAI THUNDER (GB) — SUNNY MAD" → 2 líneas
  PEDIGREE T3#9 "HIT IT A BOMB (USA) — SARAWAK TOP" → 2 líneas
  PEDIGREE T4#9 "SOUTHERN CAT (CHI) — GALAXY GIRL" → 2 líneas
  PEDIGREE T4#11 "CURIOSO JOHAN — CONTEMPLADORA" → 2 líneas
  PEDIGREE T5#2 "TODO UN AMIGUITO — READING MY MIND" → 2 líneas
  PEDIGREE T5#4 "TODO UN AMIGUITO — STORMY ELLIPTIC" → 2 líneas
  PEDIGREE T5#7 "MANIPULATOR (USA) — VOWED (USA)" → 2 líneas
  PEDIGREE T6#5 "MAIPO TOP — HALLOWEENINSEATTLE" → 2 líneas
  PEDIGREE T6#7 "HOLY BOSS (USA) — FREE EXCHANGE" → 2 líneas
  PEDIGREE T7#3 "CIMA DE TRIOMPHE (IRE) — SOLICITADA" → 2 líneas
  PEDIGREE T7#4 "SECURITY RISK (USA) — SPANAKOPITAS" → 2 líneas
  PEDIGREE T7#8 "DANIEL BOONE (BRZ) — ATOMIC STAR" → 2 líneas
  PEDIGREE T9#1 "DANIEL BOONE (BRZ) — QUE FELICIDAD" → 2 líneas
  PEDIGREE T9#5 "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO" → 2 líneas
  PEDIGREE T11#2 "GRAND REWARD (USA) — BEAUTY SHINER" → 2 líneas
  PEDIGREE T11#11 "CURIOSO JOHAN — GRINGA AYELEN" → 2 líneas
  desbordes: ninguno

### PADRE — MADRE: cuántos de los 74 superan X px de texto (8.5px)
  > 120px: 42
  > 130px: 32
  > 138px: 23
  > 140px: 22
  > 145px: 15
  > 150px: 8
  > 155px: 6
  > 160px: 3
  > 165px: 1
  > 170px: 1
  > 180px: 1
  > 190px: 0

### Altura de fila: chip 22px vs 2 líneas de texto
  9.5px × line-height normal Roboto (1.172) = 11.1px/línea → 2 líneas = 22.3px
  8.5px (pedigrí impreso) → 2 líneas = 19.9px
  chip .partidor-chip: 22px inline-block → la fila ya mide ≥ 22px + 6px padding
```

`desbordes: ninguno` en todos = ninguna palabra suelta más ancha que su columna, y K E S P
(`nowrap`) entra en su ancho. **Con `table-layout:fixed` no se trunca ni se tapa nada**: lo que
no entra envuelve a la línea siguiente; sólo un `nowrap` desbordaría, y el único `nowrap` es
K E S P, verificado (44px de texto contra 37.6px del más ancho, `57 3 M A`; con edad de 2
dígitos, `55 10 H Z`, ≈43px — entra).

### 6.5 Recomendación: **F'+p3** — anchos fijos + padding lateral 3px

Un archivo (`programa-oficial-color.html`), sólo CSS + un `<colgroup>`. Sin tocar JS ni datos.

| Columna | `<col>` | Texto | Lo más ancho de R9 | Resultado |
|---|---|---|---|---|
| CABALLERIZA | 106px | 100px | MONTE DEL TORDILLO 97.8px | 1 línea, 0 envuelven |
| 4 ÚLT. | 64px | 58px | `0L 3D 0L 7D 5D` 65.1px (5 perf., T7#2) | 4 performances entran; la de 5 envuelve (1 fila; ver abajo) |
| N° | 32px | chip 22px | — | igual que hoy |
| S.P.C. | 114px | 108px | DOCTORA APASIONADA 105.9px (700) | 1 línea, 0 envuelven |
| K E S P | 50px | 44px | `57 3 M A` 37.6px, nowrap | entra |
| JOCKEY | 109px | 103px | DELLI QUADRI IGNACIO 100.1px | 1 línea, 0 envuelven |
| PADRE — MADRE | auto (resto ≈ 146px) | ≈ 140px | MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO 188.4px | **21 de 74 a 2 líneas** (19.9px, entran en el alto del chip); 53 en 1 línea |
| ENTRENADOR | 112px | 106px | MONGAY MAXIMILIANO 103.5px | 1 línea, 0 envuelven |

Cada ancho fijo lleva 2-3px de aire sobre el máximo medido (además del 1-2% de la medición
sin kerning). Los nombres de personas, la caballeriza y el S.P.C. quedan **enteros en todas
las filas**; el único que cede es el pedigrí, y sólo en 21 filas, sin cambiar el alto de fila.

Cambios concretos (para cuando se aplique — todavía no):

```css
/* programa-oficial-color.html:163-165 */
table.inscriptos-color {
  width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 4px;
  table-layout: fixed;           /* misma grilla en las 8 tablas: los anchos salen del <colgroup>, no del contenido */
}
/* :168  padding: 5px 4px  →  5px 3px   (th) */
/* :172  padding: 3px 4px  →  3px 3px   (td)  — libera 16px que van al pedigrí */
/* :175  table.inscriptos-color .col-num { text-align: center; }   (sacar width:26px; lo fija la <col>) */
```

```html
<!-- programa-oficial-color.html:719, después de <table class="inscriptos-color"> -->
<colgroup>
  <col style="width:106px">  <!-- CABALLERIZA -->
  <col style="width:64px">   <!-- 4 ÚLT. -->
  <col style="width:32px">   <!-- N° -->
  <col style="width:114px">  <!-- S.P.C. -->
  <col style="width:50px">   <!-- K E S P -->
  <col style="width:109px">  <!-- JOCKEY -->
  <col>                      <!-- PADRE — MADRE: única sin ancho → se queda con el resto (≈146px en A4) -->
  <col style="width:112px">  <!-- ENTRENADOR -->
</colgroup>
```

Con `table-layout:fixed`, la única `<col>` sin ancho recibe todo el sobrante — determinístico,
no depende del contenido. En pantalla (viewport más ancho que A4) el pedigrí se ensancha y
envuelve menos; al imprimir da lo de la tabla.

**Por qué px y no %**: el papel es A4 fijo; en px cada columna queda calibrada a su contenido
real y el pedigrí absorbe lo que sobre. Con % habría que recalcular todo si cambia el margen.

### 6.6 Palanca opcional, NO incluida: margen lateral 6mm

`@page { margin: 10mm 8mm }` → `10mm 6mm` suma 15px de tabla: con F'+p3 el pedigrí pasa a
155px de texto y envuelven **6** filas en vez de 21 (escenario `F'+p3+m6`). Es un cambio del área
imprimible: depende de la imprenta (sangría/corte) y del resto de las páginas (tapa, flyer).
Decisión de Yesi/imprenta, no técnica. No hace falta para el domingo.

### 6.7 Qué queda fuera y qué mirar en la vista previa

- **T7#2 ECHO IN THE SKY** tiene 5 performances (`0L 3D 0L 7D 5D`) en la columna "4 ÚLT.":
  es la única fila de esa columna que envuelve. Si Yesi la deja en 4, entra. Dato, no código.
- **LOCA DUBAI (T3#6) y LE BATEAU (T7#6)**: "NO CORRERÁ" en performance, siguen `ratificado`
  (hallazgo del informe original). Con 58px entra en una línea, pero si no corren van a
  `forfait` — eso lo decide la secretaría.
- La medición asume que el print usa la webfont Roboto. Si al imprimir cayera al fallback
  (`Arial`, `:22`), el texto es ~5% más ancho: envolverían más pedigríes y, en el límite,
  MONGAY MAXIMILIANO (103.5 → ≈109px vs 106) partiría en dos. Nada se trunca ni se tapa igual.
- Verificación real de la alineación: Yesi, vista previa de impresión (Ctrl+P) — mirar que la
  columna S.P.C. arranque en la misma vertical en las 8 carreras y que ningún nombre de
  jockey/entrenador esté partido. Del lado del repo: probe de texto que asserte
  `table-layout: fixed` + 8 `<col>` en el HTML servido (patrón `tests/README.md`), y md5 contra
  `sigh.com.ar`.
- **B&N** (`programa-oficial.html`): mismo defecto atenuado; el mismo esquema aplica con sus
  columnas (ahí JOCKEY va 5º y K E S P 6º, y el N° es texto). Decisión aparte.

---

## Apéndice — scripts de medición (tal como se corrieron)

Entorno: `node v22.22.1`, `opentype.js` y `@supabase/supabase-js` instalados en el scratchpad
de la sesión; `roboto-400.ttf` y `roboto-700.ttf` bajados de las URLs que devuelve
`https://fonts.googleapis.com/css2?family=Roboto:wght@400` / `@700` (v51). `.env` del repo
para `SUPABASE_SECRET_KEY`.

`medir_columnas.mjs`:

```javascript
// Mide, con las métricas reales de Roboto (TTF de fonts.gstatic.com), el ancho del texto que
// programa-oficial-color.html imprime en cada columna para los ratificados de R9, y simula
// el word-wrap con anchos de columna fijos. Sin browser. Solo lectura.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');
const SCRATCH = '/tmp/claude-1000/-home-clio-dev-SGH/140bdc16-bf97-4ecb-890e-13bef777f276/scratchpad';
const REPO = '/home/clio/dev/SGH';
const REUNION = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';

const buf = p => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const R400 = opentype.parse(buf(`${SCRATCH}/roboto-400.ttf`));
const R700 = opentype.parse(buf(`${SCRATCH}/roboto-700.ttf`));
// Suma de advances por glifo (sin kerning: Roboto kernea negativo, así que esto sobreestima ~1-2% — conservador)
const w = (txt, px, bold = false, ls = 0) => { const f = bold ? R700 : R400; let s = 0; for (const ch of txt) s += f.charToGlyph(ch).advanceWidth; return s * px / f.unitsPerEm + ls * txt.length; };

// --- helpers reales del HTML (extraídos por ancla, patrón tests/README.md) ---
const html = readFileSync(`${REPO}/programa-oficial-color.html`, 'utf8');
function extraer(nombre) {
  const i = html.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error('no anchor ' + nombre);
  let d = 0, j = html.indexOf('{', i);
  for (; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}' && --d === 0) break; }
  return html.slice(i, j + 1);
}
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(`${REPO}/edad-spc.js`, 'utf8'), ctx);
vm.runInContext(['nombreCorto', 'pelajeCodigo', 'kespTexto', 'sexoCodigo'].map(extraer).join('\n'), ctx);
const { nombreCorto, kespTexto, edadSPC } = ctx;

// --- datos ---
const env = Object.fromEntries(readFileSync(`${REPO}/.env`, 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim().replace(/^"|"$/g, '')]; }));
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: reunion } = await sb.from('reuniones').select('fecha').eq('id', REUNION).single();
const { data: carreras } = await sb.from('carreras').select('id,numero_turno,estado').eq('reunion_id', REUNION).or('estado.is.null,estado.neq.anulada').order('numero_turno');
const { data: ins } = await sb.from('inscripciones').select('carrera_id,spc_id,jockey_titular_id,entrenador_id,propietario_id,caballeriza_id,peso_declarado,performance,numero_partidor,estado').in('carrera_id', carreras.map(c => c.id)).eq('estado', 'ratificado');
const ids = k => [...new Set(ins.map(i => i[k]).filter(Boolean))];
const [{ data: spcs }, { data: profs }, { data: props }, { data: cabs }] = await Promise.all([
  sb.from('spcs').select('id,nombre,sexo,color,fecha_nacimiento,padrillo_nombre,madre_nombre,ult_performances').in('id', ids('spc_id')),
  sb.from('profesionales').select('id,nombre,apellido').in('id', [...ids('jockey_titular_id'), ...ids('entrenador_id')]),
  sb.from('propietarios').select('id,nombre').in('id', ids('propietario_id')),
  sb.from('caballerizas').select('id,nombre').in('id', ids('caballeriza_id')),
]);
const M = rows => Object.fromEntries((rows || []).map(r => [r.id, r]));
const spcMap = M(spcs), profMap = M(profs), propMap = M(props), cabMap = M(cabs);

// Misma composición de celdas que renderCarreraColor (programa-oficial-color.html:667-697)
const filas = [];
for (const c of carreras) {
  ins.filter(i => i.carrera_id === c.id).sort((a, b) => (a.numero_partidor || 999) - (b.numero_partidor || 999)).forEach((i, fi) => {
    const spc = spcMap[i.spc_id] || {};
    const edad = edadSPC(spc.fecha_nacimiento, reunion.fecha);
    filas.push({
      turno: c.numero_turno, mandil: fi + 1,
      CABALLERIZA: (cabMap[i.caballeriza_id]?.nombre || propMap[i.propietario_id]?.nombre || '').toUpperCase(),
      ULT4: i.performance || spc.ult_performances || '',
      SPC: (spc.nombre || '').toUpperCase(),
      KESP: kespTexto(i.peso_declarado, edad, spc.sexo, spc.color),
      JOCKEY: profMap[i.jockey_titular_id] ? nombreCorto(profMap[i.jockey_titular_id]) : 'XX',
      PEDIGREE: [spc.padrillo_nombre, spc.madre_nombre].filter(Boolean).map(s => s.toUpperCase()).join(' — '),
      ENTRENADOR: nombreCorto(profMap[i.entrenador_id]),
    });
  });
}

// Tipografía por columna (CSS de main): td 9.5px Roboto 400; .col-spc 700; .col-pedigree 8.5px al imprimir
const FONT = { CABALLERIZA: [9.5, false], ULT4: [9.5, false], SPC: [9.5, true], KESP: [9.5, false], JOCKEY: [9.5, false], PEDIGREE: [8.5, false], ENTRENADOR: [9.5, false] };
const HEAD = { CABALLERIZA: 'CABALLERIZA', ULT4: '4 ÚLT.', SPC: 'S.P.C.', KESP: 'K E S P', JOCKEY: 'JOCKEY', PEDIGREE: 'PADRE — MADRE', ENTRENADOR: 'ENTRENADOR' };
const COLS = Object.keys(FONT);
let PAD = 8; // padding 4px por lado (td y th)
export const setPad = p => { PAD = p; };

// 1) max-content por columna (lo que hoy pide el layout auto)
const maxc = {};
for (const k of COLS) {
  let best = { txt: '', px: 0, turno: null };
  for (const f of filas) { const px = w(f[k], ...FONT[k]); if (px > best.px) best = { txt: f[k], px, turno: f.turno }; }
  const hpx = w(HEAD[k], 9, true, 0.5);
  maxc[k] = { ...best, px: +best.px.toFixed(1), head_px: +hpx.toFixed(1), min_col_1linea: +(Math.max(best.px, hpx) + PAD).toFixed(1) };
}

// 2) wrap greedy por palabras dentro de un ancho de texto
function lineas(txt, k, textW) {
  if (!txt) return 1;
  const words = txt.split(' ');
  let n = 1, cur = '';
  for (const word of words) {
    const cand = cur ? cur + ' ' + word : word;
    if (w(cand, ...FONT[k]) <= textW) cur = cand;
    else { if (cur) n++; cur = word; if (w(word, ...FONT[k]) > textW) n += 0; /* palabra sola más ancha: desborda visualmente (sin nowrap se parte? no: se sale del borde) */ }
  }
  return n;
}
function simular(nombre, widths) { // widths en px por columna (incluye padding), N° aparte
  const total = widths.N + COLS.reduce((s, k) => s + widths[k], 0);
  const res = { escenario: nombre, total_px: +total.toFixed(1), columnas: {}, filas_2_lineas: [], desbordes: [] };
  for (const k of COLS) {
    const tw = widths[k] - PAD;
    let wrap = 0, over = 0;
    for (const f of filas) {
      const n = lineas(f[k], k, tw);
      if (n > 1) { wrap++; res.filas_2_lineas.push(`${k} T${f.turno}#${f.mandil} "${f[k]}" → ${n} líneas`); }
      for (const word of f[k].split(' ')) if (w(word, ...FONT[k]) > tw) { over++; res.desbordes.push(`${k} T${f.turno}#${f.mandil} palabra "${word}" ${w(word, ...FONT[k]).toFixed(1)}px > ${tw.toFixed(1)}px`); }
      if (k === 'KESP' && w(f[k], ...FONT[k]) > tw) res.desbordes.push(`KESP nowrap T${f.turno}#${f.mandil} "${f[k]}" ${w(f[k], ...FONT[k]).toFixed(1)}px > ${tw.toFixed(1)}px`);
    }
    const headFits = w(HEAD[k], 9, true, 0.5) <= tw;
    res.columnas[k] = { col_px: +widths[k].toFixed(1), texto_px: +tw.toFixed(1), filas_que_envuelven: wrap, header_entra: headFits };
  }
  return res;
}

const TABLA = 733.2; // 194mm (A4 − 2×8mm) a 96dpi
const pct = p => TABLA * p / 100;
const esc = [];
// A: propuesta del informe (§Veredicto): 17/12/34px/17/9/12/resto/12
{ const W = { CABALLERIZA: pct(17), ULT4: pct(12), N: 34, SPC: pct(17), KESP: pct(9), JOCKEY: pct(12), ENTRENADOR: pct(12) }; W.PEDIGREE = TABLA - Object.values(W).reduce((a, b) => a + b, 0); esc.push(simular('A — informe 17/12/34px/17/9/12/resto/12', W)); }
// B: ajustada a los máximos medidos de R9 (se calcula abajo y se imprime)
const out = { fecha_reunion: reunion.fecha, tabla_px: TABLA, ratificados: filas.length, carreras: carreras.map(c => c.numero_turno), max_content: maxc, sum_max_content_px: +(COLS.reduce((s, k) => s + maxc[k].min_col_1linea, 0) + 34).toFixed(1), escenarios: esc };
export { filas, maxc, simular, TABLA, pct, COLS, out, w, FONT };
if (process.argv[1].endsWith('medir_columnas.mjs')) console.log(JSON.stringify(out, null, 1));
```

`escenarios.mjs`:

```javascript
import { filas, maxc, simular, TABLA, COLS, w, FONT } from './medir_columnas.mjs';
const mk = (nombre, W) => { W.PEDIGREE = TABLA - Object.values(W).reduce((a, b) => a + b, 0); return simular(nombre, W); };
const esc = [
  mk('B — cada columna a su máximo de R9, PADRE—MADRE el resto', { CABALLERIZA: 106, ULT4: 74, N: 34, SPC: 114, KESP: 46, JOCKEY: 108, ENTRENADOR: 112 }),
  mk('C — JOCKEY 96 / ENTRENADOR 104 (cede 1 nombre cada una), PADRE—MADRE el resto', { CABALLERIZA: 106, ULT4: 74, N: 34, SPC: 114, KESP: 46, JOCKEY: 96, ENTRENADOR: 104 }),
  mk('D — C + 4 ÚLT. 62 (4 performances, la de 5 envuelve)', { CABALLERIZA: 106, ULT4: 62, N: 34, SPC: 114, KESP: 46, JOCKEY: 96, ENTRENADOR: 104 }),
  mk('E — D + CABALLERIZA 100 (MONTE DEL TORDILLO envuelve)', { CABALLERIZA: 100, ULT4: 62, N: 34, SPC: 114, KESP: 46, JOCKEY: 96, ENTRENADOR: 104 }),
];
for (const e of esc) {
  console.log('\n### ' + e.escenario + '  (total ' + e.total_px + 'px)');
  for (const k of COLS) { const c = e.columnas[k]; console.log(`  ${k.padEnd(11)} col ${String(c.col_px).padStart(6)}px  texto ${String(c.texto_px).padStart(6)}px  envuelven: ${c.filas_que_envuelven}  header entra: ${c.header_entra}`); }
  if (e.filas_2_lineas.length) console.log('  ' + e.filas_2_lineas.join('\n  '));
  if (e.desbordes.length) console.log('  DESBORDES:\n  ' + e.desbordes.join('\n  ')); else console.log('  desbordes: ninguno');
}
// pedigrí: distribución de anchos, para elegir el ancho de texto
const ped = filas.map(f => ({ t: f.PEDIGREE, px: +w(f.PEDIGREE, ...FONT.PEDIGREE).toFixed(1) })).sort((a, b) => b.px - a.px);
console.log('\n### PADRE — MADRE, los 12 más anchos (8.5px Roboto 400):');
for (const p of ped.slice(0, 12)) console.log(`  ${String(p.px).padStart(6)}px  ${p.t}`);
console.log('\n### JOCKEY / ENTRENADOR más anchos (9.5px):');
for (const k of ['JOCKEY', 'ENTRENADOR']) { const l = [...new Set(filas.map(f => f[k]))].map(t => ({ t, px: +w(t, ...FONT[k]).toFixed(1) })).sort((a, b) => b.px - a.px).slice(0, 5); console.log('  ' + k + ': ' + l.map(x => `${x.t} ${x.px}px`).join(' | ')); }
console.log('\n### CABALLERIZA más anchas (9.5px):');
console.log('  ' + [...new Set(filas.map(f => f.CABALLERIZA))].map(t => ({ t, px: +w(t, 9.5).toFixed(1) })).sort((a, b) => b.px - a.px).slice(0, 5).map(x => `${x.t} ${x.px}px`).join(' | '));
console.log('\n### S.P.C. más anchos (9.5px bold):');
console.log('  ' + filas.map(f => ({ t: f.SPC, px: +w(f.SPC, 9.5, true).toFixed(1) })).sort((a, b) => b.px - a.px).slice(0, 5).map(x => `${x.t} ${x.px}px`).join(' | '));
```

`escenario_f.mjs`:

```javascript
import { filas, simular, TABLA, COLS, w, FONT } from './medir_columnas.mjs';
const mk = (nombre, W) => { W.PEDIGREE = TABLA - Object.values(W).reduce((a, b) => a + b, 0); return simular(nombre, W); };
const esc = [
  mk('F — JOCKEY y ENTRENADOR enteros, KESP 50, 4 ÚLT. 66; PADRE—MADRE el resto', { CABALLERIZA: 106, ULT4: 66, N: 34, SPC: 114, KESP: 50, JOCKEY: 109, ENTRENADOR: 112 }),
  mk('G — F con padding 3px (td/th 3px por lado, −16px) — sólo para medir cuánto rinde', { CABALLERIZA: 104, ULT4: 64, N: 32, SPC: 112, KESP: 48, JOCKEY: 107, ENTRENADOR: 110 }),
];
for (const e of esc) {
  console.log('\n### ' + e.escenario + '  (total ' + e.total_px + 'px)');
  for (const k of COLS) { const c = e.columnas[k]; console.log(`  ${k.padEnd(11)} col ${String(c.col_px).padStart(6)}px  texto ${String(c.texto_px).padStart(6)}px  envuelven: ${c.filas_que_envuelven}  header entra: ${c.header_entra}`); }
  if (e.filas_2_lineas.length) console.log('  ' + e.filas_2_lineas.join('\n  '));
  console.log(e.desbordes.length ? '  DESBORDES:\n  ' + e.desbordes.join('\n  ') : '  desbordes: ninguno');
}
console.log('\n### PADRE — MADRE: cuántos de los 74 superan X px de texto (8.5px)');
for (const X of [120, 130, 138, 140, 145, 150, 155, 160, 165, 170, 180, 190]) console.log(`  > ${X}px: ${filas.filter(f => w(f.PEDIGREE, ...FONT.PEDIGREE) > X).length}`);
console.log('\n### Altura de fila: chip 22px vs 2 líneas de texto');
console.log(`  9.5px × line-height normal Roboto (1.172) = ${(9.5*1.172).toFixed(1)}px/línea → 2 líneas = ${(2*9.5*1.172).toFixed(1)}px`);
console.log(`  8.5px (pedigrí impreso) → 2 líneas = ${(2*8.5*1.172).toFixed(1)}px`);
console.log('  chip .partidor-chip: 22px inline-block → la fila ya mide ≥ 22px + 6px padding');
```

`escenario_final.mjs`:

```javascript
import { filas, simular, COLS, w, FONT, setPad } from './medir_columnas.mjs';
const run = (nombre, tabla, pad, W) => { setPad(pad); W.PEDIGREE = tabla - Object.values(W).reduce((a, b) => a + b, 0); const e = simular(nombre, W);
  console.log('\n### ' + e.escenario + `  (tabla ${tabla}px, padding ${pad/2}px/lado)`);
  for (const k of COLS) { const c = e.columnas[k]; console.log(`  ${k.padEnd(11)} col ${String(c.col_px).padStart(6)}px  texto ${String(c.texto_px).padStart(6)}px  envuelven: ${c.filas_que_envuelven}  header entra: ${c.header_entra}`); }
  const ped = e.filas_2_lineas.filter(s => s.startsWith('PEDIGREE')); const otras = e.filas_2_lineas.filter(s => !s.startsWith('PEDIGREE'));
  if (otras.length) console.log('  ' + otras.join('\n  '));
  console.log(`  PADRE—MADRE a 2 líneas: ${ped.length}` + (ped.length ? '\n  ' + ped.join('\n  ') : ''));
  console.log(e.desbordes.length ? '  DESBORDES:\n  ' + e.desbordes.join('\n  ') : '  desbordes: ninguno');
};
// márgenes con 2-3px de aire sobre el máximo medido (la medición no kernea → ya sobreestima ~1-2%)
const F = () => ({ CABALLERIZA: 108, ULT4: 66, N: 34, SPC: 116, KESP: 52, JOCKEY: 111, ENTRENADOR: 114 });
run("F' — recomendado: padding 4px, @page 8mm (como hoy)", 733.2, 8, F());
const F3 = () => ({ CABALLERIZA: 106, ULT4: 64, N: 32, SPC: 114, KESP: 50, JOCKEY: 109, ENTRENADOR: 112 });
run("F'+p3 — igual, con padding 3px por lado en td/th", 733.2, 6, F3());
run("F'+p3+m6 — padding 3px y @page margin lateral 6mm (198mm = 748.3px)", 748.3, 6, F3());
run("F'+m6 — padding 4px y @page margin lateral 6mm", 748.3, 8, F());
```

Salida cruda completa del escenario A (la propuesta descartada del §Veredicto), `node medir_columnas.mjs`:

```
{
 "escenario": "A — informe 17/12/34px/17/9/12/resto/12",
 "total_px": 733.2,
 "columnas": {
  "CABALLERIZA": {
   "col_px": 124.6,
   "texto_px": 116.6,
   "filas_que_envuelven": 0,
   "header_entra": true
  },
  "ULT4": {
   "col_px": 88,
   "texto_px": 80,
   "filas_que_envuelven": 0,
   "header_entra": true
  },
  "SPC": {
   "col_px": 124.6,
   "texto_px": 116.6,
   "filas_que_envuelven": 0,
   "header_entra": true
  },
  "KESP": {
   "col_px": 66,
   "texto_px": 58,
   "filas_que_envuelven": 0,
   "header_entra": true
  },
  "JOCKEY": {
   "col_px": 88,
   "texto_px": 80,
   "filas_que_envuelven": 20,
   "header_entra": true
  },
  "PEDIGREE": {
   "col_px": 120,
   "texto_px": 112,
   "filas_que_envuelven": 51,
   "header_entra": true
  },
  "ENTRENADOR": {
   "col_px": 88,
   "texto_px": 80,
   "filas_que_envuelven": 34,
   "header_entra": true
  }
 },
 "filas_2_lineas": [
  "JOCKEY T1#2 \"DELLI QUADRI IGNACIO\" → 2 líneas",
  "JOCKEY T1#5 \"GUZMAN CLAUDIO\" → 2 líneas",
  "JOCKEY T1#7 \"DE MAIO FACUNDO\" → 2 líneas",
  "JOCKEY T3#4 \"IBARRA FERNANDO\" → 2 líneas",
  "JOCKEY T3#8 \"CONTRERAS JUAN\" → 2 líneas",
  "JOCKEY T3#9 \"ZUBIRIA SANTIAGO\" → 2 líneas",
  "JOCKEY T3#11 \"FERRARI BAUTISTA\" → 2 líneas",
  "JOCKEY T4#3 \"ZUBIRIA SANTIAGO\" → 2 líneas",
  "JOCKEY T4#4 \"DELLI QUADRI IGNACIO\" → 2 líneas",
  "JOCKEY T4#8 \"MENDIBURU BRIAN\" → 2 líneas",
  "JOCKEY T4#9 \"FERRARI BAUTISTA\" → 2 líneas",
  "JOCKEY T5#4 \"ARREGUY FRANCISCO\" → 2 líneas",
  "JOCKEY T6#4 \"IBARRA FERNANDO\" → 2 líneas",
  "JOCKEY T7#3 \"IBARRA FERNANDO\" → 2 líneas",
  "JOCKEY T7#6 \"ARREGUY FRANCISCO\" → 2 líneas",
  "JOCKEY T7#8 \"DIESTRA BAUTISTA\" → 2 líneas",
  "JOCKEY T9#3 \"DELLI QUADRI IGNACIO\" → 2 líneas",
  "JOCKEY T9#6 \"IBARRA FERNANDO\" → 2 líneas",
  "JOCKEY T11#2 \"GONZALEZ EDUARDO\" → 2 líneas",
  "JOCKEY T11#13 \"DE MAIO FACUNDO\" → 2 líneas",
  "PEDIGREE T1#1 \"SEA DOG — PARADISE NISTEL\" → 2 líneas",
  "PEDIGREE T1#2 \"EMMANUEL — MILONGA BURRERA\" → 2 líneas",
  "PEDIGREE T1#3 \"PETEN ITZA — LA CALCOMANIA\" → 2 líneas",
  "PEDIGREE T1#4 \"DUBAI THUNDER (GB) — GRELA (USA)\" → 2 líneas",
  "PEDIGREE T1#5 \"THE GARDEN — VENECIANA STORM\" → 2 líneas",
  "PEDIGREE T1#6 \"DOCTOR EMBRUJO — ETERNA DIABLITA\" → 2 líneas",
  "PEDIGREE T1#7 \"DOCTOR EMBRUJO — GIRL PASSION\" → 2 líneas",
  "PEDIGREE T1#8 \"MANIPULER — RECONDITA ARMONIA\" → 2 líneas",
  "PEDIGREE T3#1 \"LEAD TO WIN — SWEET JOHAR (USA)\" → 2 líneas",
  "PEDIGREE T3#2 \"GOLDEN CIGARS — SIXTIES SPIRIT\" → 2 líneas",
  "PEDIGREE T3#3 \"HELIOSTATIC (IRE) — HONRADEZA\" → 2 líneas",
  "PEDIGREE T3#4 \"DOCTOR EMBRUJO — MATRERA SKY\" → 2 líneas",
  "PEDIGREE T3#5 \"FISKARDO — EVER PROPULSORA\" → 2 líneas",
  "PEDIGREE T3#6 \"DUBAI THUNDER (GB) — SUNNY MAD\" → 2 líneas",
  "PEDIGREE T3#7 \"GOLDEN CIGARS — DRA SOFIA\" → 2 líneas",
  "PEDIGREE T3#8 \"FOOTNOTES (USA) — ASTATA RIDE\" → 2 líneas",
  "PEDIGREE T3#9 \"HIT IT A BOMB (USA) — SARAWAK TOP\" → 2 líneas",
  "PEDIGREE T3#11 \"DANIEL BOONE — LA GUAGUA\" → 2 líneas",
  "PEDIGREE T3#12 \"PUERTO ESCONDIDO — ALMEDHA\" → 2 líneas",
  "PEDIGREE T3#13 \"VICTOR SECURITY — IBARAKI\" → 2 líneas",
  "PEDIGREE T4#2 \"FLOWING RYE — GREAT GRILL\" → 2 líneas",
  "PEDIGREE T4#5 \"LEAD TO WIN — BARBIE NISTEL\" → 2 líneas",
  "PEDIGREE T4#6 \"SEAHENGE (USA) — NIÑA DIVINA\" → 2 líneas",
  "PEDIGREE T4#9 \"SOUTHERN CAT (CHI) — GALAXY GIRL\" → 2 líneas",
  "PEDIGREE T4#11 \"CURIOSO JOHAN — CONTEMPLADORA\" → 2 líneas",
  "PEDIGREE T5#2 \"TODO UN AMIGUITO — READING MY MIND\" → 2 líneas",
  "PEDIGREE T5#4 \"TODO UN AMIGUITO — STORMY ELLIPTIC\" → 2 líneas",
  "PEDIGREE T5#5 \"REMOTE (GB) — VEDETTE'S DAY\" → 2 líneas",
  "PEDIGREE T5#6 \"LEONADO — RECIT INTELLECT\" → 2 líneas",
  "PEDIGREE T5#7 \"MANIPULATOR (USA) — VOWED (USA)\" → 2 líneas",
  "PEDIGREE T6#2 \"IL CAMPIONE (CHI) — INDIGIRKA\" → 2 líneas",
  "PEDIGREE T6#3 \"EQUAL EDITION — REINA GLORIOSA\" → 2 líneas",
  "PEDIGREE T6#5 \"MAIPO TOP — HALLOWEENINSEATTLE\" → 2 líneas",
  "PEDIGREE T6#7 \"HOLY BOSS (USA) — FREE EXCHANGE\" → 2 líneas",
  "PEDIGREE T7#1 \"SEÑOR CANDY (USA) — EMCALU\" → 2 líneas",
  "PEDIGREE T7#3 \"CIMA DE TRIOMPHE (IRE) — SOLICITADA\" → 2 líneas",
  "PEDIGREE T7#4 \"SECURITY RISK (USA) — SPANAKOPITAS\" → 2 líneas",
  "PEDIGREE T7#5 \"CHUCK BERRY — SPOKES WOMAN\" → 2 líneas",
  "PEDIGREE T7#6 \"INTERACTION — LE YACA (CHI)\" → 2 líneas",
  "PEDIGREE T7#8 \"DANIEL BOONE (BRZ) — ATOMIC STAR\" → 2 líneas",
  "PEDIGREE T9#1 \"DANIEL BOONE (BRZ) — QUE FELICIDAD\" → 2 líneas",
  "PEDIGREE T9#5 \"MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO\" → 2 líneas",
  "PEDIGREE T9#6 \"GOLDEN CIGARS — HOLA NENA\" → 2 líneas",
  "PEDIGREE T11#2 \"GRAND REWARD (USA) — BEAUTY SHINER\" → 2 líneas",
  "PEDIGREE T11#3 \"UPWARD TREND (USA) — QUIRIBA\" → 2 líneas",
  "PEDIGREE T11#5 \"PURE MIRON — BATACLANA MORA\" → 2 líneas",
  "PEDIGREE T11#7 \"PURE MIRON — SHY SALEDIZA\" → 2 líneas",
  "PEDIGREE T11#9 \"MANIPULER — ISLAY WHISKY\" → 2 líneas",
  "PEDIGREE T11#11 \"CURIOSO JOHAN — GRINGA AYELEN\" → 2 líneas",
  "PEDIGREE T11#12 \"STORM QUESTION — REDONDIYA\" → 2 líneas",
  "PEDIGREE T11#13 \"CHARLES KING — BIEN TERRIBLE\" → 2 líneas",
  "ENTRENADOR T1#3 \"MALENA GUSTAVO\" → 2 líneas",
  "ENTRENADOR T1#4 \"GALLETINI EZEQUIEL\" → 2 líneas",
  "ENTRENADOR T3#2 \"BOLONTI FELICIANO\" → 2 líneas",
  "ENTRENADOR T3#3 \"GONZALEZ ADRIAN\" → 2 líneas",
  "ENTRENADOR T3#5 \"TAVAGNUTTI RICARDO\" → 2 líneas",
  "ENTRENADOR T3#6 \"BLANCO MARCELO\" → 2 líneas",
  "ENTRENADOR T3#7 \"BOLONTI FELICIANO\" → 2 líneas",
  "ENTRENADOR T3#8 \"TRUPPA ROBERTO\" → 2 líneas",
  "ENTRENADOR T3#10 \"BLANCO MARCELO\" → 2 líneas",
  "ENTRENADOR T3#12 \"BONAVITA NESTOR\" → 2 líneas",
  "ENTRENADOR T3#13 \"ANRIQUEZ GERONIMO\" → 2 líneas",
  "ENTRENADOR T4#1 \"DI FRANCO GUSTAVO\" → 2 líneas",
  "ENTRENADOR T4#2 \"VALENCIA GERARDO\" → 2 líneas",
  "ENTRENADOR T4#4 \"ANRIQUEZ GERONIMO\" → 2 líneas",
  "ENTRENADOR T4#6 \"TAVAGNUTTI RICARDO\" → 2 líneas",
  "ENTRENADOR T5#1 \"ANRIQUEZ GERONIMO\" → 2 líneas",
  "ENTRENADOR T5#5 \"PALMIERI LEONARDO\" → 2 líneas",
  "ENTRENADOR T5#6 \"TAVAGNUTTI RICARDO\" → 2 líneas",
  "ENTRENADOR T6#3 \"PALMIERI LEONARDO\" → 2 líneas",
  "ENTRENADOR T6#4 \"TRUPPA ROBERTO\" → 2 líneas",
  "ENTRENADOR T6#6 \"MALENA GUSTAVO\" → 2 líneas",
  "ENTRENADOR T7#1 \"ZUBIARRAIN SANTIAGO\" → 2 líneas",
  "ENTRENADOR T7#2 \"GONZALEZ ADRIAN\" → 2 líneas",
  "ENTRENADOR T7#3 \"ALZA MAXIMILIANO\" → 2 líneas",
  "ENTRENADOR T9#3 \"SAN MARTIN SERGIO\" → 2 líneas",
  "ENTRENADOR T9#6 \"ALZA MAXIMILIANO\" → 2 líneas",
  "ENTRENADOR T11#2 \"VALENCIA GERARDO\" → 2 líneas",
  "ENTRENADOR T11#3 \"GIMENEZ MARCOS\" → 2 líneas",
  "ENTRENADOR T11#4 \"CASINELLI FABRICIO\" → 2 líneas",
  "ENTRENADOR T11#5 \"DI FRANCO GUSTAVO\" → 2 líneas",
  "ENTRENADOR T11#7 \"TRUPPA ROBERTO\" → 2 líneas",
  "ENTRENADOR T11#9 \"GIMENEZ MARCOS\" → 2 líneas",
  "ENTRENADOR T11#12 \"MONGAY MAXIMILIANO\" → 2 líneas",
  "ENTRENADOR T11#13 \"VILLANUEVA SANTINO\" → 2 líneas"
 ],
 "desbordes": []
}
```

## Publicación del §6

(se completa abajo con `git push` + `git ls-remote`)

```
$ git push origin reports
$ git ls-remote origin reports
ca00f12e1cce9df7c695c50a91b63293d55681f6	refs/heads/reports
$ git rev-parse HEAD
ca00f12e1cce9df7c695c50a91b63293d55681f6
```
(SHA del commit del §6. El commit siguiente sólo agrega este bloque.)

---

## 6.8 Cierre del §6 — las ocho columnas, una por una (F'+p3)

Tabla al imprimir: **733.2px** (A4 194mm). Padding lateral 3px → texto = columna − 6px.
Siete anchos fijos suman **587px**; PADRE — MADRE es la única `<col>` sin ancho y se queda con
el resto: **146.2px**. 587 + 146.2 = **733.2px. Cierra exacto, sin sobrante ni scroll.**

| # | Columna | `<col>` | Texto útil | Contenido más ancho de R9 (medido, Roboto) | ¿Entra? | ¿Se corta? | Encabezado (9px 700, ls 0.5) | ¿Entra el encabezado? |
|---|---|---|---|---|---|---|---|---|
| 1 | CABALLERIZA | 106px | 100px | MONTE DEL TORDILLO — 97.8px (T11#5) | **1 línea**, 0/74 envuelven | no: si mañana hay una más larga, envuelve (palabra suelta más ancha: 67px) | CABALLERIZA 63.9px | sí (36px de aire) |
| 2 | 4 ÚLT. | 64px | 58px | `0L 3D 0L 7D 5D` — 65.1px (T7#2, 5 performances) | esa sola fila a **2 líneas**; las 73 de 4 performances (máx 52px) en 1 | no | 4 ÚLT. 29.4px | sí |
| 3 | N° | 32px | 26px | chip 22px, ancho fijo con 1 ó 2 dígitos | 1 línea, siempre | no | N° 10.9px | sí |
| 4 | S.P.C. | 114px | 108px | DOCTORA APASIONADA — 105.9px (T1#7, negrita) | **1 línea**, 0/74 envuelven | no | S.P.C. 28.1px | sí |
| 5 | K E S P | 50px | 44px | `57 3 M A` — 37.6px (nowrap) | 1 línea; edad de 2 dígitos (≈43px) también | no: es el único `nowrap` y entra | K E S P 32.3px | sí |
| 6 | JOCKEY | 109px | 103px | DELLI QUADRI IGNACIO — 100.1px (T1#2) | **1 línea**, 0/74 envuelven | no | JOCKEY 36.5px | sí |
| 7 | PADRE — MADRE | resto = 146.2px | 140.2px | MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO — 188.4px (T9#5) | **2 líneas** ésa y otras 20 (21/74); 53 en 1 línea | no: envuelve por palabra (la más larga, MASTERCRAFTSMAN, 93px, entra sola) | PADRE — MADRE 77.0px | sí |
| 8 | ENTRENADOR | 112px | 106px | MONGAY MAXIMILIANO — 103.5px (T11#12) | **1 línea**, 0/74 envuelven | no | ENTRENADOR 63.0px | sí |

**Ninguna columna queda más angosta que su encabezado.** El más ajustado es CABALLERIZA
(63.9px de título en 100px de texto) y sobra un tercio.

**Nada se corta.** `table-layout:fixed` no trunca: el texto que no entra envuelve a la
línea siguiente. Lo único que podría sobresalir de su celda es un `white-space:nowrap` más
ancho que la columna, y el único `nowrap` de la tabla es K E S P, con 6px de aire sobre el
peor caso real y ≈1px sobre una edad de 2 dígitos. Una palabra suelta más ancha que su columna
también sobresaldría (no hay guion automático): la más ancha de R9 es MASTERCRAFTSMAN, 93px
en 140px.

**Las dos que más varían:**
- **CABALLERIZA**: R9 va de C&C (3 letras) a MONTE DEL TORDILLO (18). Con 100px de texto
  entran todas en una línea, la más larga con 2px de aire. Una futura más larga envuelve a 2
  líneas, que caben en el alto del chip (§6.3): no rompe nada, sólo se ve partida.
- **PADRE — MADRE**: va de 65px (LE KEN — WILKENIA) a 188px. Con 140px, 21 de 74 pasan a 2
  líneas de 8.5px = 19.9px, por debajo de los 22px del chip → la fila no crece. Es la columna
  que cede por diseño: la única sin ancho, la de cuerpo menor, la menos leída.

Qué **no** entra en una línea, lista completa (las 22 filas), copiada del escenario `F'+p3`
del §6.4: ECHO IN THE SKY 4 ÚLT. (T7#2) y estos 21 pedigríes — T1#4 DUBAI THUNDER (GB) — GRELA
(USA) · T1#6 DOCTOR EMBRUJO — ETERNA DIABLITA · T1#8 MANIPULER — RECONDITA ARMONIA · T3#1 LEAD
TO WIN — SWEET JOHAR (USA) · T3#4 DOCTOR EMBRUJO — MATRERA SKY · T3#6 DUBAI THUNDER (GB) — SUNNY
MAD · T3#9 HIT IT A BOMB (USA) — SARAWAK TOP · T4#9 SOUTHERN CAT (CHI) — GALAXY GIRL · T4#11
CURIOSO JOHAN — CONTEMPLADORA · T5#2 TODO UN AMIGUITO — READING MY MIND · T5#4 TODO UN AMIGUITO
— STORMY ELLIPTIC · T5#7 MANIPULATOR (USA) — VOWED (USA) · T6#5 MAIPO TOP — HALLOWEENINSEATTLE ·
T6#7 HOLY BOSS (USA) — FREE EXCHANGE · T7#3 CIMA DE TRIOMPHE (IRE) — SOLICITADA · T7#4 SECURITY
RISK (USA) — SPANAKOPITAS · T7#8 DANIEL BOONE (BRZ) — ATOMIC STAR · T9#1 DANIEL BOONE (BRZ) — QUE
FELICIDAD · T9#5 MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO · T11#2 GRAND REWARD (USA) — BEAUTY
SHINER · T11#11 CURIOSO JOHAN — GRINGA AYELEN.

Salida cruda del script del cierre (`cierre.mjs`, mismo harness del apéndice):

```
suma fijos 587px + PADRE—MADRE (resto) 146.2px = 733.2px de 733.2px
CABALLERIZA: col 106 texto 100 | más ancho "MONTE DEL TORDILLO" 97.8px (T11#5) → ENTRA en 1 línea | filas que envuelven 0/74 | ¿se corta? no: envuelve, nunca corta | header "CABALLERIZA" 63.9px vs 100px → entra | palabra suelta más ancha 67.3px
ULT4: col 64 texto 58 | más ancho "0L 3D 0L 7D 5D" 65.1px (T7#2) → 2 líneas | filas que envuelven 1/74 | ¿se corta? no: envuelve, nunca corta | header "4 ÚLT." 29.4px vs 58px → entra | palabra suelta más ancha 46.3px
N: col 32 texto 26 | contenido: chip 22px fijo (1 ó 2 dígitos, mismo ancho) → entra | header "N°" 10.9px → entra
SPC: col 114 texto 108 | más ancho "DOCTORA APASIONADA" 105.9px (T1#7) → ENTRA en 1 línea | filas que envuelven 0/74 | ¿se corta? no: envuelve, nunca corta | header "S.P.C." 28.1px vs 108px → entra | palabra suelta más ancha 64.2px
KESP: col 50 texto 44 | más ancho "57 3 M A" 37.6px (T1#9) → ENTRA en 1 línea | filas que envuelven 0/74 | ¿se corta? no (nowrap, entra) | header "K E S P" 32.3px vs 44px → entra | palabra suelta más ancha 10.7px
JOCKEY: col 109 texto 103 | más ancho "DELLI QUADRI IGNACIO" 100.1px (T1#2) → ENTRA en 1 línea | filas que envuelven 0/74 | ¿se corta? no: envuelve, nunca corta | header "JOCKEY" 36.5px vs 103px → entra | palabra suelta más ancha 54.1px
PEDIGREE: col 146.2 texto 140.2 | más ancho "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO" 188.4px (T9#5) → 2 líneas | filas que envuelven 21/74 | ¿se corta? no: envuelve, nunca corta | header "PADRE — MADRE" 77.0px vs 140.2px → entra | palabra suelta más ancha 93.2px
ENTRENADOR: col 112 texto 106 | más ancho "MONGAY MAXIMILIANO" 103.5px (T11#12) → ENTRA en 1 línea | filas que envuelven 0/74 | ¿se corta? no: envuelve, nunca corta | header "ENTRENADOR" 63.0px vs 106px → entra | palabra suelta más ancha 61.1px
```

`cierre.mjs`:

```javascript
import { filas, w, FONT, COLS } from './medir_columnas.mjs';
const COL = { CABALLERIZA: 106, ULT4: 64, N: 32, SPC: 114, KESP: 50, JOCKEY: 109, PEDIGREE: null, ENTRENADOR: 112 };
const TABLA = 733.2, PAD = 6;
const fijos = Object.values(COL).filter(Boolean).reduce((a, b) => a + b, 0);
COL.PEDIGREE = +(TABLA - fijos).toFixed(1);
console.log(`suma fijos ${fijos}px + PADRE—MADRE (resto) ${COL.PEDIGREE}px = ${(fijos + COL.PEDIGREE).toFixed(1)}px de ${TABLA}px`);
const HEAD = { CABALLERIZA: 'CABALLERIZA', ULT4: '4 ÚLT.', N: 'N°', SPC: 'S.P.C.', KESP: 'K E S P', JOCKEY: 'JOCKEY', PEDIGREE: 'PADRE — MADRE', ENTRENADOR: 'ENTRENADOR' };
const lineas = (txt, k, tw) => { if (!txt) return 1; let n = 1, cur = ''; for (const word of txt.split(' ')) { const c = cur ? cur + ' ' + word : word; if (w(c, ...FONT[k]) <= tw) cur = c; else { if (cur) n++; cur = word; } } return n; };
for (const k of Object.keys(COL)) {
  const tw = COL[k] - PAD;
  const hpx = w(HEAD[k], 9, true, 0.5);
  if (k === 'N') { console.log(`${k}: col ${COL[k]} texto ${tw} | contenido: chip 22px fijo (1 ó 2 dígitos, mismo ancho) → entra | header "N°" ${hpx.toFixed(1)}px → entra`); continue; }
  const widest = filas.reduce((b, f) => { const px = w(f[k], ...FONT[k]); return px > b.px ? { txt: f[k], px, t: f.turno, m: f.mandil } : b; }, { px: 0 });
  const n = lineas(widest.txt, k, tw);
  const maxWord = Math.max(...filas.flatMap(f => f[k].split(' ').map(x => w(x, ...FONT[k]))));
  const wraps = filas.filter(f => lineas(f[k], k, tw) > 1).length;
  const corta = (k === 'KESP') ? (widest.px > tw ? 'DESBORDA (nowrap)' : 'no (nowrap, entra)') : (maxWord > tw ? 'palabra más ancha que la columna → sobresale' : 'no: envuelve, nunca corta');
  console.log(`${k}: col ${COL[k]} texto ${tw} | más ancho "${widest.txt}" ${widest.px.toFixed(1)}px (T${widest.t}#${widest.m}) → ${n === 1 ? 'ENTRA en 1 línea' : n + ' líneas'} | filas que envuelven ${wraps}/74 | ¿se corta? ${corta} | header "${HEAD[k]}" ${hpx.toFixed(1)}px vs ${tw}px → ${hpx <= tw ? 'entra' : 'NO ENTRA'} | palabra suelta más ancha ${maxWord.toFixed(1)}px`);
}
```

## Publicación del §6.8

(se completa abajo con `git push` + `git ls-remote`)

```
$ git push origin reports
$ git ls-remote origin reports
bff6459c644dca14980bf36e01e889f13a452047	refs/heads/reports
$ git rev-parse HEAD
bff6459c644dca14980bf36e01e889f13a452047
```
(SHA del commit del §6.8. El commit siguiente sólo agrega este bloque.)

---

## 6.9 Palanca del margen a 6mm, ENTRENADOR a 2 líneas, y el fix aplicado + PDF mirado

### 6.9.1 Primero, una corrección a los números del §6.4–§6.8

Se consiguió hacer correr **Chromium headless en el server** (el `chrome-headless-shell` de
`~/.cache/ms-playwright` más 8 libs del sistema extraídas con `dpkg -x`, sin sudo — `docs/SERVER.md`
corregido en la rama del fix). Con el browser real se midió cada celda con `canvas.measureText`
y la Roboto que carga Google Fonts. **Chrome dibuja ~6% más ancho que lo que daba `opentype.js`
sobre el TTF** (DELLI QUADRI IGNACIO 107px vs 100.1; MONGAY MAXIMILIANO 111 vs 103.5;
MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO 197 vs 188.4). Con los anchos del §6.5 tal cual, en el
render real envolvían DELLI QUADRI IGNACIO (3 filas), MONGAY MAXIMILIANO, ZUBIARRAIN SANTIAGO,
DOCTORA APASIONADA, MONTE DEL TORDILLO y HS LA HORMIGONERA. **Los anchos se recalibraron con las
medidas del browser** (es lo que imprime): las columnas de nombres suben 4-8px cada una y el
pedigrí, que absorbe el resto, baja de 146 a 117px. Los conteos de envolturas de acá en adelante
son del browser, no del TTF.

Anchos aplicados (`programa-oficial-color.html`, rama `fix/programa-color-columnas-fijas`, `d692365`):

| Columna | `<col>` | Texto (padding 3px) | Más ancho de R9 (Chrome) | Aire |
|---|---|---|---|---|
| CABALLERIZA | 112px | 106px | MONTE DEL TORDILLO 103px | 3px |
| 4 ÚLT. | 66px | 60px | 4 performances: 58px (`6D 8D 7D 7D`) | 2px |
| N° | 32px | 26px | chip 22px | 4px |
| S.P.C. | 120px | 114px | DOCTORA APASIONADA 112px (700) | 2px |
| K E S P | 50px | 44px | `57 3 M A` 40px (nowrap) | 4px; edad de 2 dígitos ≈45px → 1px NEGATIVO, ver 6.9.5 |
| JOCKEY | 116px | 110px | DELLI QUADRI IGNACIO 107px | 3px |
| PADRE — MADRE | resto = 117.2px | 111px | 197px | envuelve |
| ENTRENADOR | 120px | 114px | MONGAY MAXIMILIANO 111px | 3px |

Suma: 112+66+32+120+50+116+120 = **616px** fijos + 117.2 = **733.2px**. Cierra.

### 6.9.2 ENTRENADOR a 2 líneas: F' (8mm) contra 6mm

**Cero en los dos.** ENTRENADOR tiene ancho fijo (120px) y el margen de página no lo toca: lo
único que cambia con el margen es el ancho del pedigrí (la `<col>` sin ancho). Lo mismo para
JOCKEY, CABALLERIZA y S.P.C.: 0 filas partidas con 8mm y 0 con 6mm. Las "40 apellidos partidos"
eran del escenario A descartado (§6.2), no de F'.

Lo que sí cambia con el margen es el pedigrí. Cuatro variantes renderizadas en Chrome
(`EXTRA_CSS` + `VIEWPORT_W` del script), 74 filas:

```
v1_8mm       (@page 8mm, padding 3px — LO APLICADO): pedigrí texto 111px | envueltas={'PADRE — MADRE': 57, '4 ÚLT.': 3} | total=60/74
v2_6mm       (@page 6mm, padding 3px):               pedigrí texto 126px | envueltas={'PADRE — MADRE': 40, '4 ÚLT.': 3} | total=43/74
v4_8mm_pad2  (@page 8mm, padding 2px):               pedigrí texto 127px | envueltas={'PADRE — MADRE': 40, '4 ÚLT.': 3} | total=43/74
v3_6mm_pad2  (@page 6mm, padding 2px):               pedigrí texto 142px | envueltas={'PADRE — MADRE': 24, '4 ÚLT.': 3} | total=27/74
(en las cuatro: CABALLERIZA 0, S.P.C. 0, JOCKEY 0, ENTRENADOR 0; las 3 de 4 ÚLT. son
 "0L 3D 0L 7D 5D" (5 performances) y los dos "NO CORRERÁ")
```

El margen a 6mm ahorra **17 envolturas de pedigrí** (57 → 40). Padding 2px ahorra lo mismo.
Las dos juntas, 33 (57 → 24).

### 6.9.3 Riesgo de impresión del margen a 6mm

- **Impresora de oficina**: casi todas las láser/inkjet tienen zona no imprimible de 4-5mm;
  6mm entra, pero con 1-2mm de tolerancia. Con 8mm sobra.
- **Imprenta**: imprime en pliego y refila; el problema no es lo imprimible sino la **sangría
  y el corte**: con 6mm el texto queda a 6mm del borde del refilado, y una guillotina corre
  ±1-2mm. Legible igual, pero más cerca del filo que lo que se suele pedir (5mm mínimo de
  margen de seguridad). No sé qué pide la imprenta de Dolores.
- **Afecta a todas las páginas**, no sólo a las tablas: tapa (`.tapa` es full-width, la foto y
  el header se ensanchan 4mm), flyer del pie, página final. Ninguna rompe (todo es fluido), pero
  cambia el aspecto de lo que Yesi ya validó.
- Es un cambio de una línea (`@page { margin: 10mm 6mm }`), reversible, y **no lo decide el
  código**: lo decide la imprenta. **No se aplicó.** Queda con 8mm.

### 6.9.4 Qué se aplicó (rama `fix/programa-color-columnas-fijas`, `d692365`, pusheada; NO mergeada)

1. `table-layout: fixed` + `<colgroup>` con los anchos de 6.9.1; padding lateral 4 → 3px;
   `.col-num` sin `width` (lo fija la `<col>`).
2. **El pedigrí parte en el guion.** Con 57 filas a 2 líneas, cortar en cualquier espacio daba
   "SEA DOG — PARADISE" / "NISTEL". Cada nombre va ahora en un `<span class="ped-nombre">` con
   `display:inline-block`: si no entra, baja el nombre entero → "SEA DOG —" / "PARADISE NISTEL".
   Un nombre más ancho que la columna sigue envolviendo dentro de su bloque (nunca se sale de la
   celda). Con esto las 57 filas a 2 líneas se leen como "padrillo / madre", un formato, no un
   accidente.
3. `tests/render_programa_pdf.mjs` (nuevo) + `docs/SERVER.md` + `tests/README.md` + `CHANGELOG.md`.

### 6.9.5 El PDF de R9, mirado

Render antes (main `a25978`) y después (`d692365`), mismo script, mismo Chrome 153, viewport de
733px = ancho útil de A4. Imágenes en `docs/diagnosticos/img/2026-09-17_programa-color/`
(tiras del DOM en media print; no muestran los cortes de página del PDF):

- `antes_tira2.png` — carreras 01-03 tal como salen hoy: **la columna S.P.C. arranca en x≈198
  en la carrera 01 y en x≈210 en la 02 y 03**; en la 01 el layout auto además parte PARAJE LA
  TABLADA, `3D 4D 5D 9L`, DOCTORA APASIONADA, DELLI QUADRI IGNACIO y GALLETINI EZEQUIEL en dos líneas.
- `despues_tira2.png` — mismas carreras: S.P.C. en la misma vertical en las tres; todos los
  nombres enteros; el pedigrí a dos líneas partido en el guion.
- `despues_tira3.png` — carreras 04-06: ídem; se ve `NO CORRERÁ` partido en "NO / CORRERÁ" en
  LE BATEAU (dato) y `0L 3D 0L 7D / 5D` en ECHO IN THE SKY (5 performances, dato).

Lo que mira el ojo y confirma el JSON del script:
- **Grilla idéntica en las 8 tablas**: `x` de cada `td` = `[0, 112, 178, 210, 330, 380, 496, 880]`
  en las 8 (viewport 1000). Antes: 8 grillas distintas (ver salida cruda abajo).
- **Antes**, al ancho de A4, envolvían 38 celdas repartidas en TODAS las columnas: JOCKEY 5,
  ENTRENADOR 5, CABALLERIZA 6, S.P.C. 5, 4 ÚLT. 10, PADRE — MADRE 7. **Después**: 60, pero
  todas en PADRE — MADRE (57) y 4 ÚLT. (3, los datos de arriba). Cero nombres de personas,
  caballerizas o caballos partidos.
- **PDF**: 6 páginas antes, 6 después (mismo alto de fila — el chip manda). Sin errores JS. Los
  únicos mensajes de consola son el CSP de `frame-ancestors` por `<meta>` (preexistente) y el
  logo `https://sigh.com.ar/logo-dolores-verde.png` bloqueado por CSP **porque se sirvió desde
  localhost** (en prod es same-origin).
- **Fuentes**: Roboto 400/700/800/900, Roboto Condensed 900 y Playfair Display 700 cargadas
  (`document.fonts`). El render es con la webfont, no con Arial.
- Pendiente que **no** se puede mirar acá: los cortes de página del PDF, porque no hay poppler para
  paginarlo a imágenes. Con el mismo alto de fila que antes, la paginación es la de siempre
  (6 páginas). Yesi lo ve en la vista previa de impresión.
- **K E S P con edad de 2 dígitos** (caballo de 10+ años): ≈45px contra 44px de texto y
  `nowrap` → sobresaldría 1px sobre el padding de JOCKEY, invisible. R9 no tiene ninguno (el más
  viejo, QUINIELA TREND, tiene 8). Si aparece, subir la `<col>` a 52px.

### 6.9.6 Decisión pendiente (la de Fede/Yesi, no técnica)

- **Merge a `main`**: el fix está en `fix/programa-color-columnas-fijas` (`d692365`). No se mergea sin OK.
- **Margen 6mm**: no aplicado; consultar con la imprenta. Si sí, una línea.
- **B&N**: mismo defecto atenuado, no tocado.
- **Datos**: LOCA DUBAI y LE BATEAU ("NO CORRERÁ", ratificados); ECHO IN THE SKY (5 performances).

### Salida cruda — render antes/después (`tests/render_programa_pdf.mjs`)

```
=== ANTES (main a25978, servido desde worktree en :8766) ===
geometría de la 1ª fila de cada tabla, viewport 1000px (th = ancho de cada columna, x = borde izquierdo de cada td):
   9 filas  th=[137.3, 82.9, 30, 155.4, 62.2, 148.9, 248.6, 134.7]  x=[0, 137.3, 220.1, 250.1, 405.5, 467.7, 616.6, 865.3]
  11 filas  th=[128.9, 89.5, 30, 124.8, 65.1, 156, 251, 154.7]  x=[0, 128.9, 218.4, 248.4, 373.2, 438.3, 594.3, 845.3]
   7 filas  th=[150.8, 89.6, 30, 110.9, 68.3, 139.4, 260.3, 150.8]  x=[0, 150.8, 240.3, 270.3, 381.3, 449.5, 588.9, 849.2]
   7 filas  th=[134.8, 84.6, 30, 126.9, 63.4, 145.4, 264.3, 150.7]  x=[0, 134.8, 219.3, 249.3, 376.2, 439.6, 585, 849.3]
   8 filas  th=[134, 99.2, 30, 134, 60.5, 141.7, 249.9, 150.8]  x=[0, 134, 233.2, 263.2, 397.1, 457.7, 599.3, 849.3]
   6 filas  th=[105.5, 83.9, 30, 146.2, 59.8, 146.2, 294.9, 133.5]  x=[0, 105.5, 189.4, 219.4, 365.6, 425.3, 571.5, 866.5]
  13 filas  th=[138.8, 93.9, 30, 136, 65.3, 133.3, 247.6, 155.1]  x=[0, 138.8, 232.6, 262.6, 398.7, 464, 597.3, 844.9]
  13 filas  th=[143.9, 85.6, 30, 129.7, 60.9, 138.8, 256.8, 154.4]  x=[0, 143.9, 229.5, 259.5, 389.2, 450.1, 588.9, 845.6]
celdas que envuelven al ancho A4 (733px): {'JOCKEY': 5, 'CABALLERIZA': 6, 'ENTRENADOR': 5, 'PADRE — MADRE': 7, '4 ÚLT.': 10, 'S.P.C.': 5}  total 38/74
  JOCKEY | DELLI QUADRI IGNACIO | texto 107px en celda 102px | 2 líneas
  CABALLERIZA | PARAJE LA TABLADA | texto 98px en celda 95px | 2 líneas
  ENTRENADOR | GALLETINI EZEQUIEL | texto 96px en celda 93px | 2 líneas
  PADRE — MADRE | DOCTOR EMBRUJO — ETERNA DIABLITA | texto 163px en celda 154px | 2 líneas
  4 ÚLT. | 3D 4D 5D 9L | texto 56px en celda 55px | 2 líneas
  S.P.C. | DOCTORA APASIONADA | texto 112px en celda 108px | 2 líneas
  4 ÚLT. | 3D 1D 7L 6D | texto 56px en celda 55px | 2 líneas
  PADRE — MADRE | TODO UN AMIGUITO — READING MY MIND | texto 167px en celda 165px | 2 líneas
  S.P.C. | CHE CARABANERA | texto 88px en celda 88px | 2 líneas
  JOCKEY | ARREGUY FRANCISCO | texto 102px en celda 101px | 2 líneas
  CABALLERIZA | FEDERICO Y MIGUEL | texto 94px en celda 93px | 2 líneas
  ENTRENADOR | TAVAGNUTTI RICARDO | texto 106px en celda 105px | 2 líneas
  ENTRENADOR | ZUBIARRAIN SANTIAGO | texto 109px en celda 105px | 2 líneas
  CABALLERIZA | EL HORNERITO CAFE | texto 96px en celda 93px | 2 líneas
  4 ÚLT. | 0L 3D 0L 7D 5D | texto 69px en celda 67px | 2 líneas
  PADRE — MADRE | CIMA DE TRIOMPHE (IRE) — SOLICITADA | texto 162px en celda 153px | 2 líneas
  PADRE — MADRE | SECURITY RISK (USA) — SPANAKOPITAS | texto 161px en celda 153px | 2 líneas
  S.P.C. | SEMBRADOR CHUCK | texto 96px en celda 93px | 2 líneas
  JOCKEY | ARREGUY FRANCISCO | texto 102px en celda 98px | 2 líneas
  PADRE — MADRE | DANIEL BOONE (BRZ) — ATOMIC STAR | texto 153px en celda 153px | 2 líneas
  4 ÚLT. | 2P 8P 6S 1P | texto 54px en celda 54px | 2 líneas
  4 ÚLT. | 1D 1P 2D 5P | texto 56px en celda 54px | 2 líneas
  JOCKEY | DELLI QUADRI IGNACIO | texto 107px en celda 101px | 2 líneas
  ENTRENADOR | SAN MARTIN SERGIO | texto 97px en celda 93px | 2 líneas
  S.P.C. | CANDIDATA PIRANERA | texto 107px en celda 102px | 2 líneas
  CABALLERIZA | MI MARTINCITO | texto 75px en celda 74px | 2 líneas
  4 ÚLT. | 2D 1D 2D 3D | texto 58px en celda 54px | 2 líneas
  PADRE — MADRE | MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO | texto 197px en celda 184px | 2 líneas
  4 ÚLT. | 3D 7S 7S 0S | texto 55px en celda 55px | 2 líneas
  JOCKEY | GONZALEZ EDUARDO | texto 99px en celda 95px | 2 líneas
  PADRE — MADRE | GRAND REWARD (USA) — BEAUTY SHINER | texto 170px en celda 161px | 2 líneas
  CABALLERIZA | MONTE DEL TORDILLO | texto 103px en celda 101px | 2 líneas
  4 ÚLT. | 3D 5D 4D 4D | texto 58px en celda 55px | 2 líneas
  4 ÚLT. | 0L 4D 3D 2D | texto 56px en celda 55px | 2 líneas
  S.P.C. | DESTINADO JOHAN | texto 92px en celda 89px | 2 líneas
  CABALLERIZA | HS LA HORMIGONERA | texto 101px en celda 101px | 2 líneas
  ENTRENADOR | MONGAY MAXIMILIANO | texto 111px en celda 107px | 2 líneas
  4 ÚLT. | 3P 5P 3S 4D | texto 55px en celda 55px | 2 líneas
  teardown: usuarios=0 auth=0 (ambos deben ser 0)

=== DESPUÉS (fix/programa-color-columnas-fijas d692365, servido desde :8765) ===
   9 filas  th=[112, 66, 32, 120, 50, 116, 384, 120]  x=[0, 112, 178, 210, 330, 380, 496, 880]
  11 filas  th=[112, 66, 32, 120, 50, 116, 384, 120]  x=[0, 112, 178, 210, 330, 380, 496, 880]
   7 filas  th=[112, 66, 32, 120, 50, 116, 384, 120]  x=[0, 112, 178, 210, 330, 380, 496, 880]
   7 filas  th=[112, 66, 32, 120, 50, 116, 384, 120]  x=[0, 112, 178, 210, 330, 380, 496, 880]
   8 filas  th=[112, 66, 32, 120, 50, 116, 384, 120]  x=[0, 112, 178, 210, 330, 380, 496, 880]
   6 filas  th=[112, 66, 32, 120, 50, 116, 384, 120]  x=[0, 112, 178, 210, 330, 380, 496, 880]
  13 filas  th=[112, 66, 32, 120, 50, 116, 384, 120]  x=[0, 112, 178, 210, 330, 380, 496, 880]
  13 filas  th=[112, 66, 32, 120, 50, 116, 384, 120]  x=[0, 112, 178, 210, 330, 380, 496, 880]

maximos_por_columna_px (canvas.measureText con la fuente que cargó Chrome; top 4 por columna):
  CABALLERIZA: [{"txt": "MONTE DEL TORDILLO", "px": 103}, {"txt": "HS LA HORMIGONERA", "px": 101}, {"txt": "PARAJE LA TABLADA", "px": 98}, {"txt": "PARAJE LA TABLADA", "px": 98}]
  4 ÚLT.: [{"txt": "0L 3D 0L 7D 5D", "px": 69}, {"txt": "NO CORRERÁ", "px": 61}, {"txt": "NO CORRERÁ", "px": 61}, {"txt": "6D 8D 7D 7D", "px": 58}]
  S.P.C.: [{"txt": "DOCTORA APASIONADA", "px": 112}, {"txt": "CANDIDATA PIRANERA", "px": 107}, {"txt": "SEMBRADOR CHUCK", "px": 96}, {"txt": "MOSQUITA GARDEN", "px": 94}]
  K E S P: [{"txt": "57 3 M A", "px": 40}, {"txt": "57 5 M A", "px": 40}, {"txt": "59 5 M A", "px": 40}, {"txt": "57 5 M A", "px": 40}]
  JOCKEY: [{"txt": "DELLI QUADRI IGNACIO", "px": 107}, {"txt": "DELLI QUADRI IGNACIO", "px": 107}, {"txt": "DELLI QUADRI IGNACIO", "px": 107}, {"txt": "ARREGUY FRANCISCO", "px": 102}]
  PADRE — MADRE: [{"txt": "MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO", "px": 197}, {"txt": "GRAND REWARD (USA) — BEAUTY SHINER", "px": 170}, {"txt": "TODO UN AMIGUITO — READING MY MIND", "px": 167}, {"txt": "TODO UN AMIGUITO — STORMY ELLIPTIC", "px": 164}]
  ENTRENADOR: [{"txt": "MONGAY MAXIMILIANO", "px": 111}, {"txt": "ZUBIARRAIN SANTIAGO", "px": 109}, {"txt": "TAVAGNUTTI RICARDO", "px": 106}, {"txt": "TAVAGNUTTI RICARDO", "px": 106}]
  __headers: {"CABALLERIZA": 64.5, "4 ÚLT.": 28, "N°": 11, "S.P.C.": 28, "K E S P": 32.5, "JOCKEY": 37, "PADRE — MADRE": 76.5, "ENTRENADOR": 63}

fuentes_cargadas: ["Playfair Display 700", "Roboto 400", "Roboto 700", "Roboto 800", "Roboto 900", "Roboto Condensed 900"]
errores de consola: ["The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.", "Loading the image 'https://sigh.com.ar/logo-dolores-verde.png' violates the following Content Security Policy directive: \"img-src 'self' data: blob: https://*.supabase.co https://raw.githubusercontent.com\". The action has been blocked.", "Loading the image 'https://sigh.com.ar/logo-dolores-verde.png' violates the following Content Security Policy directive: \"img-src 'self' data: blob: https://*.supabase.co https://raw.githubusercontent.com\". The action has been blocked."]

celdas que envuelven al ancho A4 (733px): {'PADRE — MADRE': 57, '4 ÚLT.': 3}  total 60/74
  PADRE — MADRE | SEA DOG — PARADISE NISTEL | texto 118px en celda 111px | 2 líneas
  PADRE — MADRE | EMMANUEL — MILONGA BURRERA | texto 142px en celda 111px | 2 líneas
  PADRE — MADRE | PETEN ITZA — LA CALCOMANIA | texto 128px en celda 111px | 2 líneas
  PADRE — MADRE | DUBAI THUNDER (GB) — GRELA (USA) | texto 152px en celda 111px | 2 líneas
  PADRE — MADRE | THE GARDEN — VENECIANA STORM | texto 144px en celda 111px | 2 líneas
  PADRE — MADRE | DOCTOR EMBRUJO — ETERNA DIABLITA | texto 163px en celda 111px | 2 líneas
  PADRE — MADRE | DOCTOR EMBRUJO — GIRL PASSION | texto 146px en celda 111px | 2 líneas
  PADRE — MADRE | MANIPULER — RECONDITA ARMONIA | texto 151px en celda 111px | 2 líneas
  PADRE — MADRE | FLOWING RYE — GREAT GRILL | texto 120px en celda 111px | 2 líneas
  PADRE — MADRE | LEAD TO WIN — BARBIE NISTEL | texto 125px en celda 111px | 2 líneas
  PADRE — MADRE | SEAHENGE (USA) — NIÑA DIVINA | texto 130px en celda 111px | 2 líneas
  PADRE — MADRE | LE BLUES — EFFERVESENCE | texto 114px en celda 111px | 2 líneas
  PADRE — MADRE | WINNING PRIZE — BIOSFERA | texto 114px en celda 111px | 2 líneas
  PADRE — MADRE | SOUTHERN CAT (CHI) — GALAXY GIRL | texto 151px en celda 111px | 2 líneas
  PADRE — MADRE | CURIOSO JOHAN — CONTEMPLADORA | texto 156px en celda 111px | 2 líneas
  PADRE — MADRE | ENGELHARD — ITZEL CHICA | texto 112px en celda 111px | 2 líneas
  PADRE — MADRE | IL CAMPIONE (CHI) — INDIGIRKA | texto 129px en celda 111px | 2 líneas
  PADRE — MADRE | EQUAL EDITION — REINA GLORIOSA | texto 142px en celda 111px | 2 líneas
  PADRE — MADRE | MAIPO TOP — HALLOWEENINSEATTLE | texto 153px en celda 111px | 2 líneas
  PADRE — MADRE | HOLY BOSS (USA) — FREE EXCHANGE | texto 150px en celda 111px | 2 líneas
  PADRE — MADRE | VALID STRIPES — VUVUZELA | texto 117px en celda 111px | 2 líneas
  PADRE — MADRE | TODO UN AMIGUITO — READING MY MIND | texto 167px en celda 111px | 2 líneas
  PADRE — MADRE | TODO UN AMIGUITO — STORMY ELLIPTIC | texto 164px en celda 111px | 2 líneas
  PADRE — MADRE | REMOTE (GB) — VEDETTE'S DAY | texto 129px en celda 111px | 2 líneas
  PADRE — MADRE | LEONADO — RECIT INTELLECT | texto 121px en celda 111px | 2 líneas
  PADRE — MADRE | MANIPULATOR (USA) — VOWED (USA) | texto 153px en celda 111px | 2 líneas
  PADRE — MADRE | SEÑOR CANDY (USA) — EMCALU | texto 131px en celda 111px | 2 líneas
  4 ÚLT. | 0L 3D 0L 7D 5D | texto 69px en celda 60px | 2 líneas
  PADRE — MADRE | CIMA DE TRIOMPHE (IRE) — SOLICITADA | texto 162px en celda 111px | 2 líneas
  PADRE — MADRE | SECURITY RISK (USA) — SPANAKOPITAS | texto 161px en celda 111px | 2 líneas
  PADRE — MADRE | CHUCK BERRY — SPOKES WOMAN | texto 140px en celda 111px | 2 líneas
  4 ÚLT. | NO CORRERÁ | texto 61px en celda 60px | 2 líneas
  PADRE — MADRE | INTERACTION — LE YACA (CHI) | texto 123px en celda 111px | 2 líneas
  PADRE — MADRE | DANIEL BOONE (BRZ) — ATOMIC STAR | texto 153px en celda 111px | 2 líneas
  PADRE — MADRE | DANIEL BOONE (BRZ) — QUE FELICIDAD | texto 159px en celda 111px | 2 líneas
  PADRE — MADRE | CHUCK BERRY — FIESTONGA | texto 117px en celda 111px | 2 líneas
  PADRE — MADRE | MASTERCRAFTSMAN (IRE) — ESPLENDIDA HALO | texto 197px en celda 111px | 2 líneas
  PADRE — MADRE | GOLDEN CIGARS — HOLA NENA | texto 126px en celda 111px | 2 líneas
  PADRE — MADRE | LEAD TO WIN — SWEET JOHAR (USA) | texto 148px en celda 111px | 2 líneas
  PADRE — MADRE | GOLDEN CIGARS — SIXTIES SPIRIT | texto 136px en celda 111px | 2 líneas
  PADRE — MADRE | HELIOSTATIC (IRE) — HONRADEZA | texto 136px en celda 111px | 2 líneas
  PADRE — MADRE | DOCTOR EMBRUJO — MATRERA SKY | texto 149px en celda 111px | 2 líneas
  PADRE — MADRE | FISKARDO — EVER PROPULSORA | texto 135px en celda 111px | 2 líneas
  4 ÚLT. | NO CORRERÁ | texto 61px en celda 60px | 2 líneas
  PADRE — MADRE | DUBAI THUNDER (GB) — SUNNY MAD | texto 149px en celda 111px | 2 líneas
  PADRE — MADRE | GOLDEN CIGARS — DRA SOFIA | texto 122px en celda 111px | 2 líneas
  PADRE — MADRE | FOOTNOTES (USA) — ASTATA RIDE | texto 138px en celda 111px | 2 líneas
  PADRE — MADRE | HIT IT A BOMB (USA) — SARAWAK TOP | texto 156px en celda 111px | 2 líneas
  PADRE — MADRE | DANIEL BOONE — LA GUAGUA | texto 121px en celda 111px | 2 líneas
  PADRE — MADRE | PUERTO ESCONDIDO — ALMEDHA | texto 137px en celda 111px | 2 líneas
  PADRE — MADRE | VICTOR SECURITY — IBARAKI | texto 118px en celda 111px | 2 líneas
  PADRE — MADRE | GRAND REWARD (USA) — BEAUTY SHINER | texto 170px en celda 111px | 2 líneas
  PADRE — MADRE | UPWARD TREND (USA) — QUIRIBA | texto 138px en celda 111px | 2 líneas
  PADRE — MADRE | PURE MIRON — ORI CHAMP | texto 112px en celda 111px | 2 líneas
  PADRE — MADRE | PURE MIRON — BATACLANA MORA | texto 143px en celda 111px | 2 líneas
  PADRE — MADRE | PURE MIRON — SHY SALEDIZA | texto 122px en celda 111px | 2 líneas
  PADRE — MADRE | MANIPULER — ISLAY WHISKY | texto 118px en celda 111px | 2 líneas
  PADRE — MADRE | CURIOSO JOHAN — GRINGA AYELEN | texto 145px en celda 111px | 2 líneas
  PADRE — MADRE | STORM QUESTION — REDONDIYA | texto 132px en celda 111px | 2 líneas
  PADRE — MADRE | CHARLES KING — BIEN TERRIBLE | texto 133px en celda 111px | 2 líneas
  teardown: usuarios=0 auth=0 (ambos deben ser 0)```

### Salida cruda — variantes de margen/padding (mismo script, `EXTRA_CSS` + `VIEWPORT_W`)

```
$ run "v1_8mm" 733 ""
$ run "v2_6mm" 748 "@page { margin: 10mm 6mm; }"
$ run "v4_8mm_pad2" 733 "$PAD2"
$ run "v3_6mm_pad2" 748 "@page { margin: 10mm 6mm; } $PAD2"
  # PAD2 = padding-left/right 2px en th/td + col widths 110/64/30/118/48/114/resto/118 (!important)
v1_8mm: pedigrí texto 111px | envueltas={'PADRE — MADRE': 57, '4 ÚLT.': 3} | total=60/74 | teardown: usuarios=0 auth=0 (ambos deben ser 0)
    4 ÚLT. 0L 3D 0L 7D 5D 69 en 60
    4 ÚLT. NO CORRERÁ 61 en 60
    4 ÚLT. NO CORRERÁ 61 en 60
v2_6mm: pedigrí texto 126px | envueltas={'PADRE — MADRE': 40, '4 ÚLT.': 3} | total=43/74 | teardown: usuarios=0 auth=0 (ambos deben ser 0)
    4 ÚLT. 0L 3D 0L 7D 5D 69 en 60
    4 ÚLT. NO CORRERÁ 61 en 60
    4 ÚLT. NO CORRERÁ 61 en 60
v4_8mm_pad2: pedigrí texto 127px | envueltas={'PADRE — MADRE': 40, '4 ÚLT.': 3} | total=43/74 | teardown: usuarios=0 auth=0 (ambos deben ser 0)
    4 ÚLT. 0L 3D 0L 7D 5D 69 en 60
    4 ÚLT. NO CORRERÁ 61 en 60
    4 ÚLT. NO CORRERÁ 61 en 60
v3_6mm_pad2: pedigrí texto 142px | envueltas={'PADRE — MADRE': 24, '4 ÚLT.': 3} | total=27/74 | teardown: usuarios=0 auth=0 (ambos deben ser 0)
    4 ÚLT. 0L 3D 0L 7D 5D 69 en 60
    4 ÚLT. NO CORRERÁ 61 en 60
    4 ÚLT. NO CORRERÁ 61 en 60
```

(Las variantes se corrieron con los anchos de 6.9.1 pero ANTES del inline-block del pedigrí;
el inline-block no cambia cuántas filas envuelven, sólo dónde parten. La corrida final con el
fix completo, 8mm: `{'PADRE — MADRE': 57, '4 ÚLT.': 3}`, arriba.)

### Salida cruda — Chromium sin sudo

```
$ ldd ~/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell | grep "not found"
	libnspr4.so => not found
	libnss3.so => not found
	libnssutil3.so => not found
	libatk-1.0.so.0 => not found
	libatk-bridge-2.0.so.0 => not found
	libXdamage.so.1 => not found
	libasound.so.2 => not found
	libatspi.so.0 => not found
$ sudo -n true
sudo: interactive authentication is required
$ apt-get download libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libxdamage1 libasound2t64 libatspi2.0-0t64 libxres1
$ for d in debs/*.deb; do dpkg -x "$d" libs; done
$ LD_LIBRARY_PATH=libs/usr/lib/x86_64-linux-gnu ldd .../chrome-headless-shell | grep -c "not found"
0
$ node -e "chromium.launch({ executablePath: '.../chromium_headless_shell-1243/.../chrome-headless-shell' }) ..."
OK launch 153.0.8010.12
pdf ok
```

### Rama del fix

```
$ git ls-remote origin fix/programa-color-columnas-fijas
d692365442bac966d9a99ddd6f38e8bdadf68481	refs/heads/fix/programa-color-columnas-fijas
$ git show --stat d692365 --format=%s
fix(programa-color): columnas fijas — S.P.C. alineado entre carreras; pedigrí parte en el guion; render a PDF con Chromium headless
 CHANGELOG.md                  | +
 docs/SERVER.md                | +
 programa-oficial-color.html   | +
 tests/README.md               | +
 tests/render_programa_pdf.mjs | + (nuevo)
```

## Publicación del §6.9

(se completa abajo con `git push` + `git ls-remote`)
