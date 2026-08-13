# Fix — edad reglamentaria de SPC (regla del 1° de julio)

**Fecha**: 2026-08-13 · **Reporte**: Yesi — las edades no coinciden con el Stud Book
**Branch**: `fix/programa-r8-imprenta` · **Gate**: `tests/probe_edad_reglamentaria.mjs` → **9/9**

**GUARD**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · cero DDL, cero DML.

---

## La regla

Reglamento General de Carreras: *"la edad de los caballos se contará desde el 1° de julio de
cada año"*. Todos los SPC cumplen años el 1 de julio, sin importar su fecha real de nacimiento.

```
edad = anioReferencia - anioNacimiento
si la fecha de referencia es ANTERIOR al 1 de julio de ese anio  ->  edad -= 1
```

Segundo bug, en la misma funcion: usaba `new Date()` (hoy) en vez de la **fecha de la reunion**,
asi que un programa reimpreso otro dia mostraba edades distintas del original.

## Punto 1 — Inventario: habia 6 implementaciones distintas

| # | ubicacion | formula | fecha ref. | estado |
|---|---|---|---|---|
| 1 | `programa-oficial.html:138` `calcEdad` | aniversario exacto | `new Date()` | ✅ corregido |
| 2 | `programa-oficial-color.html:290` `calcEdad` | aniversario exacto | `new Date()` | ✅ corregido |
| 3 | `programa.html:295` `calcEdad` | `ms / 365.25` floor | `new Date()` | ✅ corregido |
| 4 | `spcs.html:295` `calcEdad` | `ms / 365.25` floor | `new Date()` | ✅ corregido |
| 5 | `inscripciones.html:559` `calcSpcEdad` | `ms / 365.25` floor | `new Date()` | ✅ corregido |
| 6 | **DB** `v_inscriptos_carrera.spc_edad` | `date_part('year', age(...))` | `CURRENT_DATE` | ⚠️ **no tocado** |

`carta-llamados.html`, `ratificacion.html` y `portal.html` no calculan edad de SPC: solo manejan
`edad_minima_anos` / `edad_maxima_anos`, que es la condicion de la carrera.

Las tres del `365.25` daban ademas resultados distintos de las dos del aniversario en anios
bisiestos, asi que el mismo caballo podia figurar con dos edades segun la pantalla.

## Punto 2 — Unificado en `edad-spc.js`

Helper compartido nuevo, cargado por `<script src>` en los 5 archivos:

```js
function edadSPC(fechaNacimiento, fechaReferencia) {
  const nac = partesFecha(fechaNacimiento);
  if (!nac) return '';
  const ref = partesFecha(fechaReferencia) || hoyPartes();
  let edad = ref.anio - nac.anio;
  if (ref.mes < 7) edad--;          // antes del 1 de julio todavia no cumplio
  return edad < 0 ? 0 : edad;
}
```

- Los dos programas pasan `reunion.fecha`; `programa.html` pasa `currentReunion?.fecha`.
- `spcs.html` (ABM del Stud Book) e `inscripciones.html` (buscador de alta) no cuelgan de
  ninguna reunion: usan la fecha actual, y queda documentado en el codigo.
- `renderCarrera()` y `renderCarreraColor()` reciben `fechaReunion` como parametro explicito,
  en vez de leer una global — asi el gate puede fijarla y verificar el determinismo.
- Las fechas `'YYYY-MM-DD'` se parsean a mano: `new Date('2018-09-02')` las interpreta como UTC
  y en Argentina (UTC-3) puede correrlas un dia para atras.

## Punto 3 — Verificacion contra el Stud Book

67 ratificados de R8. La edad del Stud Book sale del scrape del perfil de cada ejemplar
(`(N años)`), no de un calculo propio. `HOY` = codigo de `main`; `FIX` = codigo corregido con
fecha de referencia 2026-08-16.

```
  C#  SPC                        NACIMIENTO   HOY  FIX   SB   
  ──  ─────────────────────────  ──────────  ────  ───  ────  ─────
   1  ASTUTO NOTES               2022-10-13    3 *   4    4
   1  BACHUNA                    2022-11-24    3 *   4    4
   1  BENDITO PRESAGIO           2022-09-29    3 *   4    4
   1  BESO CURIOSO               2022-10-22    3 *   4    4
   1  DOCTOR SKY                 2022-10-25    3 *   4    4
   1  ELSEPTIMOESDECALDERA       2022-10-27    3 *   4    4
   1  LINDA MAIPUENSE            2022-09-30    3 *   4    4
   1  LOCA DUBAI                 2022-11-06    3 *   4    4
   1  TOUCH OF BLUE              2022-10-30    3 *   4    4
   1  WILSON SECURITY            2022-08-05    4     4    4
   2  CHE CARABANERA             2022-08-20    3 *   4    4
   2  DE BELLOSO                 2021-09-01    4 *   5    5
   2  IDALIA MARO                2021-10-15    4 *   5    5
   2  LA GRAN TEMPESTAD          2021-09-08    4 *   5    5
   2  LOGUACIOUS                 2021-10-23    4 *   5    5
   2  MARUKA PLUS                2021-10-20    4 *   5    5
   2  SANTA LISA                 2021-10-10    4 *   5    5
   3  ALIADO SCAT                2019-08-18    6 *   7    7
   3  BABY PARADISE              2019-10-08    6 *   7    7
   3  DESTINADO JOHAN            2020-09-07    5 *   6    6
   3  FLORENTINA IN YOU          2020-11-01    5 *   6    6
   3  GLAM METAL                 2020-07-09    6     6    6
   3  GRAND VUELTERA             2020-11-10    5 *   6    6
   3  GRILLADA RYE               2019-11-12    6 *   7    7
   3  INFILTRADO SLEW            2020-07-27    6     6    6
   3  LIVIA DRUSA                2020-09-16    5 *   6    6
   3  QUINIELA TREND             2018-09-23    7 *   8    8
   3  RECUERDAME IN YOU          2020-10-05    5 *   6    6
   3  TERRIBLE KING              2019-08-23    6 *   7    7
   4  AMIGUITO JESUS             2022-07-29    4     4    4
   4  CONI ROSE                  2021-10-15    4 *   5    5
   4  FALAYS                     2021-10-26    4 *   5    5
   4  IX GOAL TUN                2018-07-29    8     8    8
   4  LA LAGUNERA J              2022-10-10    3 *   4    4
   4  NELIDA RIM                 2022-11-02    3 *   4    4
   4  NOCHE EN VELA              2022-07-28    4     4    4
   4  PORTEÑO Y BAILARIN         2021-08-03    5     5    5
   5  BELLO PRESAGIO             2021-09-10    4 *   5    5
   5  CHINITA SALTEÑA            2021-08-01    5     5    5
   5  ESPLENDID CRAF             2020-10-18    5 *   6    6
   5  Icy Tom                    2018-09-02    7 *   8    8
   5  LA DIVERTENTE              2020-07-27    6     6    6
   5  NORMANDO LU                2019-08-27    6 *   7    7
   5  Wave Rimout                2017-08-08    9     9    9
   5  WISLA KEN                  2021-09-28    4 *   5    5
   6  COLONIAL JOHAN             2021-10-15    4 *   5    5
   6  EL GRAN HECTOR             2021-08-25    4 *   5    5
   6  ES SABALERO                2021-10-20    4 *   5    5
   6  HEART OF GOLD              2021-11-24    4 *   5    5
   6  QUE TAL OREJA              2020-10-25    5 *   6    6
   6  REINA EDITION              2021-10-24    4 *   5    5
   6  REY DE PILA                2021-10-14    4 *   5    5
   6  TATA FOOT                  2021-08-30    4 *   5    5
   7  ABELITO MIMOSO             2022-11-10    3 *   4    4
   7  BAHIA ROMANA               2022-08-10    4     4    4
   7  DESDEN                     2022-08-01    4     4    4
   7  MAC VITAL                  2022-11-23    3 *   4    4
   7  SOY RICARDO                2022-08-01    4     4    4
   7  VISION SECURITY            2022-10-08    3 *   4    4
   8  BOHEMIO TOP                2020-08-12    6     6    6
   8  DEVIL'S KING               2018-08-17    7 *   8    8
   8  ECHO IN THE SKY            2020-10-08    5 *   6    6
   8  LE BATEAU                  2020-10-20    5 *   6    6
   8  LE CHAT MIMOUS             2020-09-18    5 *   6    6
   8  REINA ATREVIDA             2019-10-12    6 *   7    7
   8  SEÑOR MONCHI               2020-09-27    5 *   6    6
   8  YOOKY                      2020-08-15    5 *   6    6
```

**FIX coincide con el Stud Book en 67 de 67. `main` coincidia en 14 de 67** — o sea **53 edades
mal** en el programa que iba a imprenta.

3 ejemplares (`HEART OF GOLD`, `DESDEN`, `SOY RICARDO`) tienen **homonimos** en el Stud Book
(otro ejemplar de 1997, 1981 y 1976). Se desambiguan por fecha de nacimiento contra la que
tiene la base: coincide exacto en los tres. Ninguna fila quedo sin resolver.

Control adicional: la `fecha_nacimiento` de la base coincide con la del Stud Book en las 67.

## Punto 4 — Chequeo cruzado con la condicion de edad

⚠️ `edad_minima_anos` y `edad_maxima_anos` estan en **NULL en las 8 carreras**. La condicion real
vive en el texto de `condicion_handicap`, asi que el gate lo interpreta (y reporta como no
interpretable cualquier patron que no reconozca, en vez de darlo por bueno).

```
── Condicion de edad por carrera ──
  C 1  4..4 anios  (texto: "Todo caballo de 4 años perdedores")
       edades corregidas: 4   ok
       con las edades de main habrian figurado fuera: ASTUTO NOTES (3), BACHUNA (3), BENDITO PRESAGIO (3), BESO CURIOSO (3), DOCTOR SKY (3), ELSEPTIMOESDECALDERA (3), LINDA MAIPUENSE (3), LOCA DUBAI (3), TOUCH OF BLUE (3)
  C 2  4..5 anios  (texto: "Yeguas de 4 y 5 años perdedoras")
       edades corregidas: 4, 5   ok
       con las edades de main habrian figurado fuera: CHE CARABANERA (3)
  C 3  6..+ anios  (texto: "Todo caballo de 6 años y más edad perdedores")
       edades corregidas: 6, 7, 8   ok
       con las edades de main habrian figurado fuera: DESTINADO JOHAN (5), FLORENTINA IN YOU (5), GRAND VUELTERA (5), LIVIA DRUSA (5), RECUERDAME IN YOU (5)
  C 4  4..+ anios  (texto: "Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras")
       edades corregidas: 4, 5, 8   ok
       con las edades de main habrian figurado fuera: LA LAGUNERA J (3), NELIDA RIM (3)
  C 5  4..+ anios  (texto: "Especial todo caballo de 4 años y + edad ganador de 2 o + carreras.")
       edades corregidas: 5, 6, 7, 8, 9   ok
  C 6  5..+ anios  (texto: "Todo caballo de 5 años y más edad perdedores")
       edades corregidas: 5, 6   ok
       con las edades de main habrian figurado fuera: COLONIAL JOHAN (4), EL GRAN HECTOR (4), ES SABALERO (4), HEART OF GOLD (4), REINA EDITION (4), REY DE PILA (4), TATA FOOT (4)
  C 7  4..4 anios  (texto: "Todo caballo de 4 años perdedores")
       edades corregidas: 4   ok
       con las edades de main habrian figurado fuera: ABELITO MIMOSO (3), MAC VITAL (3), VISION SECURITY (3)
  C 8  6..+ anios  (texto: "Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras")
       edades corregidas: 6, 7, 8   ok
       con las edades de main habrian figurado fuera: ECHO IN THE SKY (5), LE BATEAU (5), LE CHAT MIMOUS (5), SEÑOR MONCHI (5), YOOKY (5)

  ✔ todas las condiciones de edad interpretadas (no interpretables: 0)
  ✔ ningun ratificado fuera de la condicion de edad de su carrera (fuera: 0)
     con las edades de main habrian figurado 32 caballos fuera de condicion

──────────────────────────────────────────────────────────────────
```

**No hay ningun caballo mal inscripto: los 67 son compatibles con la condicion de su carrera.**

Y el hallazgo que importa hoy: **con las edades de `main`, 32 caballos habrian figurado fuera de
condicion**. La carrera 1 pide "todo caballo de 4 años" y 9 de sus 10 ratificados salian
impresos como de 3. El programa se contradecia solo. No era un problema de inscripcion sino del
calculo de edad.

---

## Pendientes anotados (no tocados)

- **`v_inscriptos_carrera.spc_edad`** sigue con `date_part('year', age(...))` — edad cronologica
  contra `CURRENT_DATE`. Hoy no la consume nadie del frontend (`grep` sin resultados), asi que no
  afecta al programa, pero es la misma regla mal aplicada y corregirla es DDL. Queda para
  decidir con Fede.
- **`probe_pedigree_programa.mjs` B1** falla por drift de datos ajeno a este fix: el assert
  hardcodea "quedan 5 SPCs sin pedigree" y hoy son 3 (alguien cargo 2). Es un `count` de la DB,
  no toca nada del render. No se modifico: es la metrica de seguimiento de ese backfill.
