# hipodromodolores.com — planillas de resultados por carrera: formato, CSV y costo de padrón

- **Fecha:** 2026-09-26 (UTC ~01:20–01:50)
- **SHA main al relevar:** `4d95511`
- **Modo:** SOLO LECTURA. Cero escrituras en la base (sólo `SELECT` por MCP y `GET` por PostgREST). Nada cargado.
- **Guards:** `pwd` = `/home/clio/dev/SGH` · `select count(*) from spcs` = **210** · ref = `unlhcuanfrtpatoipwve` (`get_project_url` → `https://unlhcuanfrtpatoipwve.supabase.co`).
- **Evidencia cruda:** en el VPS, `tests/local/out/hipodromodolores_2026-09-26/` (gitignored en `main`, `.gitignore:26`): 6 páginas HTML, 23 CSV, sitemap, listas de la base, scripts (`an.py`, `analiza.py`, `match.py`, `padron.py`, `texto.py`) y sus salidas (`salidas_analisis.txt`, `salida_texto.txt`). Acá no va nada crudo: columnas, ejemplo con nombres reemplazados y conteos.
- **robots.txt del sitio:** pide `Crawl-delay: 60` y `Visit-time: 0300-1200` (UTC). Respeté los 60 s entre páginas del sitio (7 páginas + sitemap + 1 llamada a `wp-json` en total). **No respeté la ventana horaria** (bajé ~01:30 UTC). Si se hace un scraper de verdad, que corra 03–12 UTC. Las planillas son de Google, no del sitio: no aplica.

---

## Resumen (respuestas cortas)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Columnas | `POS/POSICIÓN, Nº, SPC, S, DISTANCIA, JOCKEY, KG, ENTRENADOR, CABALLERIZA` + un bloque `DIVIDENDOS` abajo en la misma hoja. **No hay propietario**, ni edad, ni pelaje, ni tiempo. |
| 2 | ¿Mismo formato? | **No del todo.** Mayo 1 de 2024 = **imágenes JPG/PNG** (no hay planilla). Desde 19/05/2024 = planillas, con las mismas 9 columnas, pero cambian: encabezado (`POSICIÓN`→`POS`), posición (`1°`→`1`), decimales (`3.10`→`1,90`), prefijo `•` en el nombre (2025+), nombres de combinadas (`DOBLE/TRIPLO`→`X2/X3/X4`), y el tipo de URL (una de 2024 es link de doc normal, no `/d/e/2PACX…`). |
| 3 | ¿CSV? | **Sí.** `…/pub?gid=<gid>&single=true&output=csv` → `200 text/csv`, para los dos tipos de URL. `export?format=csv` → 401. El libro entero sin `gid` no da CSV; la lista de pestañas (nombre + gid) sale del `pubhtml` sin `gid`. |
| 4 | Texto de la página | Con regex simples: computable, hora, premio, distancia, condición, peso, bolsa, apuestas y tiempo salen en **30/30 carreras** de 4 reuniones. Pero hay typos en los valores (bolsa y tiempo): hace falta normalización y revisión humana. |
| 5 | Reuniones | **30** posts de reunión (2024: 10, 2025: 12, 2026: 8). Lista abajo. |
| 6 | Padrón | 18/08/2024: **70 caballos distintos, 14 están hoy en `spcs`** (+1 con typo) → **~55 altas** sólo de SPC. Además 6/23 jockeys, 18/48 entrenadores y 22/52 caballerizas que no están. |

---

## 1. Columnas de la planilla

Descargado: las 8 hojas de 16/08/2026 (`…/d/e/2PACX-1vRM9X…/pub?gid=<gid>&single=true&output=csv`). Las 8 tienen el mismo encabezado:

```
POS,Nº,SPC,S,DISTANCIA,JOCKEY,KG,ENTRENADOR,CABALLERIZA
```

| Columna | Qué es | Notas |
|---|---|---|
| `POS` | Puesto de llegada | `1..N`, o código: `NC` (no corrió), `RET` (retirado), `DP` (ver pregunta abierta). 2024: `1°`, `2°`… |
| `Nº` | Número del caballo (mandil) | 2024 tiene `8A`, `11A` (acoplados) |
| `SPC` | Nombre del ejemplar | 2025+ con prefijo `•` |
| `S` | Sexo | `M` / `H` |
| `DISTANCIA` | **Margen de llegada** respecto del anterior | `3 1/2cps`, `pzo`, `1/2pzo`, `1cp`, `9cps`; vacía para el 1°. **No es la distancia de la carrera** (esa está en el texto de la página) |
| `JOCKEY` | `APELLIDO NOMBRE` (corto) | En 2025 aparece `XX` como placeholder |
| `KG` | Peso llevado | `57`, `55`, `"59,5"` |
| `ENTRENADOR` | `APELLIDO NOMBRE` | |
| `CABALLERIZA` | Nombre del stud | 2024: con sufijo de origen, `LOS HINOJALES (DOL)` |

**Faltan:** propietario, edad, pelaje, gatera, tiempo de la carrera (está en la página, no en la hoja).

### Ejemplo (fila real de 16/08/2026 C1, nombres reemplazados)

```
POS,Nº,SPC,S,DISTANCIA,JOCKEY,KG,ENTRENADOR,CABALLERIZA
1,2,•CABALLO A,M,,JOCKEY A,57,ENTRENADOR A,STUD A
2,10,•CABALLO B,M,3 1/2cps,JOCKEY B,57,ENTRENADOR B,STUD B
DP,4,•CABALLO J,H,6cps,JOCKEY J,55,ENTRENADOR J,STUD J
```

### Bloque de dividendos (misma hoja, abajo; mismo ejemplo, nombres reemplazados)

```
DIVIDENDOS,,,,,,,,
POSICIÓN,N°,SPC,,1ERO,,,2DO,3ERO
1,2,•CABALLO A,,"7,80",,,"3,80","3,60"
2,4,•CABALLO J,,,,,"2,10","2,10"
3,10,•CABALLO B,,,,,,"9,80"
,,,,,,,,
EXACTA,,,,2/4,,,VAC,
IMPERFECTA,,,,2/4,,,"14.304,00",
TRIFECTA,,,,2/4/10,,,VAC,
```

- Posicionales: columna E = GAN (`1ERO`), H = SEG (`2DO`), I = TER (`3ERO`), una fila por puesto → mapea directo a `resultado_apuestas` GAN/SEG/TER con sus slots.
- Directas/combinadas: col A = tipo, col E = combinación, col H = dividendo o `VAC` / `SIN APUESTAS`.
- Tipos vistos: `EXACTA, IMPERFECTA, TRIFECTA` + 2024 `DOBLE, TRIPLO`; 2025+ `X2, X3, X4`.
- **Ojo:** en este ejemplo el `DP` de la tabla de arriba aparece **2° en los dividendos**. En 16/08 C8 el `DP` aparece **1° y paga GAN**. O sea `DP` no es "descalificado y fuera": ver preguntas abiertas.

---

## 2. ¿Mismo formato en todas las reuniones?

Mirado: 6 reuniones (lo pedido + 3 de 2024 para ubicar el corte). Las otras 24 no las abrí.

| Reunión | Resultados en | Planilla | Encabezado | POS | Decimales div. | Combinadas | Prefijo `•` |
|---|---|---|---|---|---|---|---|
| 01/05/2024 (#5) | **7 imágenes** JPG/PNG (+ 7 photofinish, 7 YouTube) | — | — | — | — | — | — |
| 19/05/2024 | 6 iframes | `/d/e/2PACX-1vQJJH…` | (no bajé CSV) | | | | |
| 30/06/2024 | 6 iframes | `/d/e/2PACX-1vQQMl…` | (no bajé CSV) | | | | |
| 28/07/2024 | 7 iframes | `/d/e/2PACX-1vQCgG…` | (no bajé CSV) | | | | |
| 18/08/2024 (#9) | 7 iframes | `/d/1xmcTneh2SyT…` (**doc normal**, no `/e/`) | `POSICIÓN,…` | `1°` | punto `3.10`; `$1.756,80` | `DOBLE`, `TRIPLO` | no |
| 31/08/2025 (#07) | 8 iframes | `/d/e/2PACX-1vQGK4…` | `POS,…` | `1` | coma `1,90` | `X2`, `X3` | sí |
| 16/08/2026 (#7) | 8 iframes | `/d/e/2PACX-1vRM9X…` | `POS,…` | `1` | coma `7,80` | `X2`, `X3`, `X4` | sí |

- **Una planilla (libro) por reunión, una pestaña por carrera.** Los `gid` se repiten entre libros (`0`, `1238426116`, `989936616`…) porque se copian de un libro modelo: el `gid` no identifica carrera entre reuniones; el orden lo da la página.
- Nombres de pestaña (16/08/2026): `1° carrera`, `2° carreraOF`, … `6° carreraOF`, … Las `OF` coinciden exactamente con las 2 carreras `OFICIAL COMPUTABLE` del texto.
- Las 9 columnas son las mismas en 2024, 2025 y 2026. El parser tiene que tolerar: encabezado `POS`/`POSICIÓN`, `1°`/`1`, `•`, `8A`, decimal con punto o coma, `$` opcional, y el alias `DOBLE`=`X2`, `TRIPLO`=`X3`.

Salida cruda del análisis por hoja (`analiza.py`; n = filas de caballos; POS vals = valores distintos de la columna 1; div rows = columna A del bloque de dividendos):

```
r2024-08-18_0.csv | n= 10 | POS vals= ['1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', 'RET'] | div rows= ['POSICIÓN', '1°', '2°', '3°', 'EXACTA', 'IMPERFECTA', 'TRIFECTA']
r2024-08-18_1289628268.csv | n= 7 | POS vals= ['1°', '2°', '3°', '4°', '5°', '6°', 'RET'] | div rows= ['POSICIÓN', '1°', '2°', '3°', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'DOBLE']
r2024-08-18_145435003.csv | n= 15 | POS vals= ['10°', '1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°', 'RET'] | div rows= ['POSICIÓN', '1°', '2°', '3°', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'DOBLE']
r2024-08-18_488116433.csv | n= 8 | POS vals= ['1°', '2°', '3°', '4°', '5°', '6°', '7°', 'RET'] | div rows= ['POSICIÓN', '1°', '2°', '3°', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'DOBLE']
r2024-08-18_966416951.csv | n= 13 | POS vals= ['1°', '2°', '3°', '4°', '5°', '6°', '7°', 'RET'] | div rows= ['POSICIÓN', '1°', '2°', '3°', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'DOBLE', 'TRIPLO']
r2024-08-18_986645942.csv | n= 10 | POS vals= ['10°', '1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°'] | div rows= ['POSICIÓN', '1°', '2°', '3°', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'DOBLE', 'TRIPLO']
r2024-08-18_989936616.csv | n= 7 | POS vals= ['1°', '2°', '3°', '4°', '5°', '6°', 'RET'] | div rows= ['POSICIÓN', '1°', '2°', '3°', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'DOBLE']
r2025-08-31_0.csv | n= 6 | POS vals= ['1', '2', '3', '4', '5', '6'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'TRIFECTA']
r2025-08-31_1238426116.csv | n= 6 | POS vals= ['1', '2', '3', '4', '5', '6'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'X2']
r2025-08-31_1271358315.csv | n= 6 | POS vals= ['1', '2', '3', '4', '5', '6'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'X2']
r2025-08-31_1289628268.csv | n= 7 | POS vals= ['1', '2', '3', '4', '5', '6', '7'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'X2']
r2025-08-31_145435003.csv | n= 6 | POS vals= ['1', '2', '3', '4', '5', 'NC'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'X2']
r2025-08-31_1626877928.csv | n= 7 | POS vals= ['1', '2', '3', '4', 'NC', 'RET'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'X2']
r2025-08-31_681455089.csv | n= 10 | POS vals= ['1', '2', '3', '4', '5', '6', 'NC'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'X2', 'X3']
r2025-08-31_989936616.csv | n= 6 | POS vals= ['1', '2', '3', '4', '5', 'RET'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'X2', 'X3']
r2026-08-16_0.csv | n= 10 | POS vals= ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DP'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'TRIFECTA']
r2026-08-16_1238426116.csv | n= 7 | POS vals= ['1', '2', '3', '4', '5', 'NC', 'RET'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'X2']
r2026-08-16_1271358315.csv | n= 12 | POS vals= ['1', '10', '2', '3', '4', '5', '6', '7', '8', '9', 'NC'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'TRIFECTA', 'X2']
r2026-08-16_1483424202.csv | n= 6 | POS vals= ['1', '2', '3', '4', '5', '6'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'X2']
r2026-08-16_1626877928.csv | n= 8 | POS vals= ['1', '2', '3', '4', '5', '6', 'NC'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'X2']
r2026-08-16_1690096596.csv | n= 8 | POS vals= ['1', '2', '3', '4', 'DP', 'NC'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'X2', 'X4']
r2026-08-16_1830591315.csv | n= 8 | POS vals= ['1', '2', '3', '4', '5', '6', '7', 'NC'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'X2', 'X3']
r2026-08-16_989936616.csv | n= 8 | POS vals= ['1', '2', '3', '4', '5', '6', '7', '8'] | div rows= ['POSICIÓN', '1', '2', '3', 'EXACTA', 'IMPERFECTA', 'X2']
```

---

## 3. ¿CSV o parsear pubhtml?

**CSV.** Comandos tal como se corrieron (16/08/2026, gid 0; `$K` = clave `2PACX-1vRM9X…` completa):

```
curl -sL -w '%{http_code} %{content_type}\n' "https://docs.google.com/spreadsheets/d/e/$K/pub?gid=0&single=true&output=csv"
→ 200 text/csv; charset=utf-8

curl -sL "https://docs.google.com/spreadsheets/d/e/$K/pub?output=csv"            # sin gid
→ 200 pero HTML (no CSV)

curl -sL "https://docs.google.com/spreadsheets/d/e/$K/pubhtml"                  # sin gid
→ lista de pestañas: {name: "1° carrera", …, gid: "0"} … {name: "8° carrera", …, gid: "1690096596"}
```

URL tipo doc normal (18/08/2024, `$D` = `1xmcTneh2SyT…`):

```
curl … "https://docs.google.com/spreadsheets/d/$D/pub?gid=0&single=true&output=csv"   → 200 text/csv; charset=utf-8
curl … "https://docs.google.com/spreadsheets/d/$D/export?format=csv&gid=0"            → 401 text/html
```

Receta: página → regex de los `iframe src` (vienen con `&#038;`, hay que des-escapar) → reemplazar `pubhtml?` por `pub?` + `output=csv` → un CSV por carrera. 23/23 hojas bajaron OK.

Con 01/05/2024 no hay receta: son imágenes (OCR o carga a mano).

---

## 4. Lo que sale del texto de la página

Parser: bloque por carrera cortando en `OFICIAL (NO )?COMPUTABLE`; regex por campo; condición = línea siguiente a la distancia. Aciertos por campo (el patrón matchea algo):

| Reunión | Carreras | computable | hora | premio | distancia | condición | peso | bolsa | apuestas | tiempo |
|---|---|---|---|---|---|---|---|---|---|---|
| 01/05/2024 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 |
| 18/08/2024 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 |
| 31/08/2025 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 |
| 16/08/2026 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 |

Que el patrón matchee no quiere decir que el valor esté limpio. Lo que encontré en los valores:

- **Premio:** comillas de cierre inconsistentes en 2024 (`«MALVINAS ARGENTINAS «`, `«CLÁSICO «RAMON LARA»`): el regex se come la línea siguiente. `ESPECIAL` a veces va fuera de las comillas (`5° Premio ESPECIAL «DIA DEL NIÑO»`) y a veces dentro. Hay sufijos (`«PACHAMAMA» 1°TURNO`).
- **Bolsa:** total entre `| |`, después el reparto por puesto en texto libre. Typos: `$883,333,33`, `2º $90,250`, `2º $126.6666,67`, `4º 35.000` (sin `$`). Entre 2024 y 2026 cambió el formato de separadores (`1º $350.000- 2º …` vs `— 1° $860.000 — 2° …`).
- **Tiempo:** 5 formatos: `48»18c`, `1’01’66c`, `1’00″04c`, `43″13`, `59’90` (este último es 59″90 con el símbolo equivocado), y `TIEMPO:1’00″88c` sin espacio. La `c` final aparece hasta 2025. En la página, no en la planilla.
- **Computable:** sale bien (`OFICIAL  COMPUTABLE` con doble espacio en 18/08/2024 C3). En 2026 hay además un chequeo cruzado con el sufijo `OF` de la pestaña.
- **Distancia de la carrera:** limpia (`800 m`, `1000 m`, `1100 m`, `1200 m`).
- **Condición:** una línea de texto libre. Sale, pero hay que interpretarla (edad/sexo/ganadores) si se quiere mapear a categoría.
- **Apuestas:** texto libre con importe base y pozo asegurado.

Salida cruda (`texto.py`; premios, distancias y montos son públicos, no hay personas):

```
### resultados-1-mayo-2024.txt: 7 bloques de carrera
  C1: OFICIAL NO COMPUTABLE | 1° Premio «DÍA DEL VETERANO Y CAÍDOS EN LA GUERRA DE MALVINAS» | 800 m | cond=Todo caballo de 2 años perdedor. | Bolsa: | $500.000 | | TIEMPO: 51»48c
  C2: OFICIAL NO COMPUTABLE | 2° Premio «MALVINAS ARGENTINAS «
800 m  
Todo caballo de 3 año | 800 m | cond=Todo caballo de 3 años perdedor. | BOLSA: | $466.666,67 | | TIEMPO: 50»78c
  C3: OFICIAL NO COMPUTABLE | 3° Premio «DIA DEL ANIMAL «
800 m  
Todo caballo 4 años perded | 800 m | cond=Todo caballo 4 años perdedor. | BOLSA: | $441.666,67 | | TIEMPO: 51»22c
  C4: OFICIAL NO COMPUTABLE | 4° Premio «DIA MUNDIAL DEL LIBRO «
800 m  
Todo caballo de 4 y | 800 m | cond=Todo caballo de 4 y 5 años ganadores de 1 o 2 carreras. | BOLSA: | $475.000 | | TIEMPO: 49»60c
  C5: OFICIAL COMPUTABLE | 5° Premio «DIA MUNDIAL DE LA TIERRA «
1000 m
Todo caballo 5 añ | 1000 m | cond=Todo caballo 5 años y más edad perdedor. | BOLSA: | $666.666,66 | | TIEMPO: 1’04»84c
  C6: OFICIAL COMPUTABLE | 6° Premio «DIA MUNDIAL DEL ARTE «
1000 m
Todo caballo de 5 año | 1000 m | cond=Todo caballo de 5 años y más edad ganadores de 1 o 2 carrera | BOLSA: | $861.666,67 | | TIEMPO: 1’05»20c
  C7: OFICIAL COMPUTABLE | 7° Premio «CLÁSICO «RAMON LARA» | 1200 m | cond=Todo caballo de 4 años y más edad ganador. | BOLSA: | $2.166.666,67 | | TIEMPO: 1’15»69c
  aciertos por campo: {'computable': 7, 'hora': 7, 'premio': 7, 'distancia': 7, 'peso': 7, 'bolsa': 7, 'apuestas': 7, 'tiempo': 7} | fallas: []
### resultados-18-agosto-2024.txt: 7 bloques de carrera
  C1: OFICIAL NO COMPUTABLE | 1° Premio «PASO A LA INMORTALIDAD DEL GRAL JOSÉ DE SAN MARTIN» | 800 m | cond=Todo caballo de 4 años perdedor. | Bolsa: | $583.333,33 | | TIEMPO: 48»18c
  C2: OFICIAL NO COMPUTABLE | 2° Premio «PACHAMAMA» | 800 m | cond=Todo caballo de 5 años y más edad ganadores de 1 o 2 carrera | BOLSA: | $616.666,67 | | TIEMPO: 47»81c
  C3: OFICIAL  COMPUTABLE | 3° Premio «DIA DEL NIÑO» | 800 m | cond=Todo caballo de 6 años y más edad ganador de 1 o 2 carreras. | BOLSA: | $1.016.666,67 | | TIEMPO: 47»40c
  C4: OFICIAL NO COMPUTABLE | 4° Premio «DIA MUNDIAL DE LA FOTOGRAFÍA» | 1000 m | cond=Todo caballo de 3 años perdedor. | BOLSA: | $616.666,67 | | TIEMPO: 1’01’66c
  C5: OFICIAL NO COMPUTABLE | 5° Premio «DIA MUNDIAL DEL FOLKLORE» | 1000 m | cond=Todo caballo de 5 años y más edad ganador de 1 carrera. | BOLSA: | $883,333,33 | | TIEMPO: 1’00»97c
  C6: OFICIAL COMPUTABLE | 6° Premio «DIA DEL MÉDICO VETERINARIO» | 1200 m | cond=Todo caballo de 5 años y más edad perdedor. | BOLSA: | $971.666,67 | | TIEMPO: 1’14»56c
  C7: OFICIAL COMPUTABLE | 7° Premio «ANIVERSARIO FUNDACIÓN DE DOLORES» | 1200 m | cond=Todo caballo de 5 años y más edad ganadores de 2 o más carre | BOLSA: | $1.136.666,67 | | TIEMPO: 1’13»35c
  aciertos por campo: {'computable': 7, 'hora': 7, 'premio': 7, 'distancia': 7, 'peso': 7, 'bolsa': 7, 'apuestas': 7, 'tiempo': 7} | fallas: []
### 31-de-agosto-2025.txt: 8 bloques de carrera
  C1: OFICIAL NO COMPUTABLE | 1° Premio «PACHAMAMA» | 1000 m | cond=Todo caballo de 4 años perdedores | Bolsa: | $883.333,33| | TIEMPO: 1’00″04c
  C2: OFICIAL NO COMPUTABLE | 2° Premio «PACHAMAMA» | 1000 m | cond=Todo caballo de 4 años perdedores | Bolsa: | $883.333,33| | TIEMPO: 1’00″22c
  C3: OFICIAL NO COMPUTABLE | 3° Premio «DÍA DEL VETERINARIO» | 1000 m | cond=Todo caballo de 5 años perdedores | BOLSA: | $850.000 | | TIEMPO: 59″25c
  C4: OFICIAL NO COMPUTABLE | 4° Premio «GRAL JOSE DE SAN MARTIN» | 1000 m | cond=Todo caballo de 6 años y más edad perdedores. | BOLSA: | $850.000 | | TIEMPO: 1’01″07c
  C5: OFICIAL NO COMPUTABLE | 5° Premio «DÍA DEL ÁRBOL» | 1000 m | cond=Todo caballo de 4 y 5 años ganadores de 1 o 2 carreras | BOLSA: | $1.015.833,33 | | TIEMPO: 1’00″40c
  C6: OFICIAL COMPUTABLE | 6° Premio «DÍA DEL NIÑO» | 1000 m | cond=Todo caballo 6 y más edad ganadores 1 o 2 carreras | BOLSA: | $1.542.916,67| | TIEMPO:1’00″88c
  C7: OFICIAL COMPUTABLE | 7° Premio «DÍA DEL NIÑO» | 1000 m | cond=Todo caballo 6 y más edad ganadores 1 o 2 carreras | BOLSA: | $1.542.916,67| | TIEMPO: 1’00″37
  C8: OFICIAL NO COMPUTABLE | 8° Premio «ESPECIAL DOLORES -FUNDACIÓN PRIMER PUEBLO PATRIO» | 1000 m | cond=Todo caballo 4 años y más edad ganadores. | BOLSA: | $3.333.333,33| | TIEMPO: 59″31c
  aciertos por campo: {'computable': 8, 'hora': 8, 'premio': 8, 'distancia': 8, 'peso': 8, 'bolsa': 8, 'apuestas': 8, 'tiempo': 8} | fallas: []
### r160826.txt: 8 bloques de carrera
  C1: OFICIAL NO COMPUTABLE | 1° Premio «PACHAMAMA» | 800 m | cond=Productos de 4 años perdedores | BOLSA: |$1.125.167| | TIEMPO: 43″13
  C2: OFICIAL COMPUTABLE | 2° Premio «GRAL JOSE DE SAN MARTIN» | 800 m | cond=Yeguas de 4 y 5 años perdedoras | BOLSA: |$1.797.500| | TIEMPO: 49″00
  C3: OFICIAL NO COMPUTABLE | 3° Premio «DIA DEL VETERINARIO» | 1000 m | cond=Todo caballo de 6 años y más edad perdedores. | BOLSA: |$1.110.000| | TIEMPO: 1’02″03
  C4: OFICIAL NO COMPUTABLE | 4° Premio «DÍA DEL FOLKLORE» | 1000 m | cond=Todo caballo de 4 años y más edad ganadores de 1 o 2 carrera | BOLSA: |$1.261.667| | TIEMPO: 1’00″72
  C5: OFICIAL NO COMPUTABLE | 5° Premio ESPECIAL «DIA DEL NIÑO» | 1000 m | cond=Todo caballo de 4 años y más edad ganadores 2 o más carreras | BOLSA: |$3.333.333| | TIEMPO: 59’90
  C6: OFICIAL COMPUTABLE | 6° Premio «ANIV DOLORES PRIMER PUEBLO PATRIO» | 1100 m | cond=Todo caballo 5 años y más edad perdedores. | BOLSA: |$1.878.333| | TIEMPO: 1’04″81
  C7: OFICIAL NO COMPUTABLE | 7° Premio «FUERZA AEREA ARGENTINA» | 1200 m | cond=Todo caballo de 4 años perdedores. | BOLSA: |$1.217.683| | TIEMPO: 1’15″51
  C8: OFICIAL NO COMPUTABLE | 8° Premio «SANTA ROSA» | 1200 m | cond=Todo caballo 6 años y más edad ganadores de 1 o 2 carreras. | BOLSA: |$1.284.417| | TIEMPO: 1’15″19
  aciertos por campo: {'computable': 8, 'hora': 8, 'premio': 8, 'distancia': 8, 'peso': 8, 'bolsa': 8, 'apuestas': 8, 'tiempo': 8} | fallas: []
```

---

## 5. Reuniones publicadas

Fuente: `https://hipodromodolores.com/wp-sitemap-posts-post-1.xml` (58 posts). Filtré los posts con fecha en el slug. El resto son estadísticas, avisos, calendarios y un `__trashed`.

**Total: 30** — 2024: 10 · 2025: 12 · 2026: 8

```
     1	https://hipodromodolores.com/resultados-1-mayo-2024/
     2	https://hipodromodolores.com/resultados-19-mayo-2024/
     3	https://hipodromodolores.com/resultados-30-junio-2024/
     4	https://hipodromodolores.com/resultados-28-julio-2024/
     5	https://hipodromodolores.com/resultados-18-agosto-2024/
     6	https://hipodromodolores.com/22-septiembre-2024/
     7	https://hipodromodolores.com/13-octubre-2024/
     8	https://hipodromodolores.com/10-noviembre-2024-gdes-premios/
     9	https://hipodromodolores.com/08-diciembre-2024/
    10	https://hipodromodolores.com/22-diciembre-2024/
    11	https://hipodromodolores.com/16-febrero-2025/
    12	https://hipodromodolores.com/13-abril-2025/
    13	https://hipodromodolores.com/1-mayo-2025/
    14	https://hipodromodolores.com/25-de-mayo-2025/
    15	https://hipodromodolores.com/22-de-junio-2025/
    16	https://hipodromodolores.com/13-de-julio-2025/
    17	https://hipodromodolores.com/31-de-agosto-2025/
    18	https://hipodromodolores.com/14-de-septiembre-2025/
    19	https://hipodromodolores.com/19-de-octubre-2025/
    20	https://hipodromodolores.com/9-de-noviembre-2025/
    21	https://hipodromodolores.com/7-de-diciembre-2025/
    22	https://hipodromodolores.com/28-de-diciembre-2025/
    23	https://hipodromodolores.com/18-de-enero-2026/
    24	https://hipodromodolores.com/8-de-febrero-2026/
    25	https://hipodromodolores.com/24-de-marzo-2026/
    26	https://hipodromodolores.com/19-de-abril-2026/
    27	https://hipodromodolores.com/17-de-mayo-2026/
    28	https://hipodromodolores.com/28-de-junio-2026/
    29	https://hipodromodolores.com/16-de-agosto-2026/
    30	https://hipodromodolores.com/20-de-septiembre-2026/
```

(En la #8 de 2024, el slug es `10-noviembre-2024-gdes-premios`.)

Numeración del sitio vs SGH: el sitio llama **Reunión #7** a 16/08/2026. En 2026 hay 8 posts hasta el 20/09, y en SGH la del 20/09 es **R9**. O falta un post, o se numera distinto: pregunta abierta.

---

## 6. Costo de padrón

Normalización: mayúsculas, sin tildes, sin `•`, sin `(…)`, sólo alfanumérico. SPC: comparación exacta del nombre normalizado contra las 210 filas de `spcs` (209 nombres distintos), más un `difflib` ≥ 0.85 para detectar typos. Jockeys y entrenadores: tokens de la planilla ⊆ tokens de `apellido+nombre` en `profesionales` de Dolores (la planilla trae el nombre corto). Caballerizas: exacto contra `caballerizas` de Dolores (303). **Es heurística:** los conteos de personas son orientativos, no un matching definitivo.

```
spcs filas 210 distintos norm 209
r2024-08-18: distintos=70 exactos_en_spcs=14 parecidos(>=0.85)=1 faltan=55
   parecido: KRITALINA ~ KRISTALINA
r2025-08-31: distintos=54 exactos_en_spcs=17 parecidos(>=0.85)=0 faltan=37
r2026-08-16: distintos=67 exactos_en_spcs=66 parecidos(>=0.85)=1 faltan=0
   parecido: WISKA KEN ~ WISLA KEN
union 3 reuniones distintos: 168 en spcs: 78

r2024-08-18: filas=70 | SPC 70 (en spcs 14) | jockeys 23 (en padrón 17) | entrenadores 48 (en padrón 30) | caballerizas 52 (en padrón 30)
r2025-08-31: filas=54 | SPC 54 (en spcs 17) | jockeys 23 (en padrón 18) | entrenadores 39 (en padrón 24) | caballerizas 44 (en padrón 30)
r2026-08-16: filas=67 | SPC 67 (en spcs 66) | jockeys 26 (en padrón 25) | entrenadores 43 (en padrón 41) | caballerizas 56 (en padrón 56)
```

**18/08/2024 (la de 2024 pedida):**

| Entidad | En la reunión | Ya en SGH | Faltan |
|---|---|---|---|
| SPC | **70** | **14** exactos + 1 typo (`KRITALINA` ~ `KRISTALINA`) = 15 | **55** |
| Jockeys | 23 | 17 | 6 |
| Entrenadores | 48 | 30 | 18 |
| Caballerizas | 52 | 30 | 22 |

- En 2025 (31/08): 54 SPC, 17 en `spcs`, faltan 37.
- En 2026 (16/08): 67 SPC, 66 exactos + 1 typo (`WISKA KEN` ~ `WISLA KEN`) → el padrón actual cubre 2026. Es lo esperable, porque se dio de alta para R6–R9.
- Unión de las 3 reuniones: **168 SPC distintos, 78 en `spcs`** → 90 faltan sólo en esta muestra. Extrapolado a las ~22 reuniones de 2024–2025 (7–8 carreras, ~60 caballos por reunión, con mucha repetición entre reuniones), el orden es de **varios cientos de SPC**, cada uno con alta que hoy exige Stud Book (sexo, nacimiento, `studbook_id`). La planilla sólo da nombre y sexo. No medí la repetición entre reuniones más allá de estas 3: pregunta abierta si se quiere el número exacto (son ~22 bajadas de CSV más).
- La planilla **no trae propietario**. Una carga histórica no resolvería `propietario_id` (GOTCHA #47): quedaría igual que hoy.

---

## Hallazgos laterales (no pedidos, sin tocar nada)

1. **`spcs` tiene `Wave Rimout` dos veces** (210 filas, 209 nombres distintos). Es un duplicado posible, como los de `docs/PLAN_DUPLICADOS_SPC.md`. No lo investigué.
2. En 2025 hay jockey `XX` en una hoja (placeholder de la planilla original).

## Preguntas abiertas

1. **`DP` en `POS`:** en 16/08/2026 C1 el `DP` figura 2° en dividendos, y en C8 figura 1° y paga GAN. ¿Qué significa? (¿"distanciado/postergado"? ¿"dead heat"? ¿llegó 1° y quedó distanciado, pero la planilla de dividendos no se actualizó?) → Fede/Yesi.
2. **01/05/2024** está sólo en imágenes. ¿Hay otras así? Sólo abrí 6 de 30. Corte visto: 01/05/2024 imágenes, desde 19/05/2024 planillas.
3. Numeración: sitio #7 = 16/08/2026 vs SGH R9 = 20/09/2026, con 8 posts en 2026. ¿Hay una reunión sin post?
4. ¿Para qué es la carga histórica? Si es estadística (jockey/entrenador/caballeriza), alcanzan nombres normalizados. Si es para `spcs` real, el costo son las ~cientos de altas por Stud Book, y ahí está el cuello de botella.
5. `8A`/`11A` (acoplados, 2024): SGH hoy no modela acoplados en el mandil 1..N.

## Verificación de push

```
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
b7370deca9eea1d72ab87d2e2a8cb724b64a9658	refs/heads/reports
b7370deca9eea1d72ab87d2e2a8cb724b64a9658
```

Commit del informe: `b7370deca9eea1d72ab87d2e2a8cb724b64a9658` = `origin/reports`. (La rama `reports` **local** del VPS diverge de origin, 1154/25 commits; no la toqué. Publiqué desde un worktree separado en `origin/reports`.)
