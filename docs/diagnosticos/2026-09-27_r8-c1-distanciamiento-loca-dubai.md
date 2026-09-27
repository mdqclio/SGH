# R8, 1ra carrera (16/08/2026): distanciamiento de LOCA DUBAI por doping — estado en la base y qué implica (SOLO LECTURA)

- Fecha: 2026-09-27
- Código leído en `main` @ `3162550f86b153fb42f772e8832a167c0d094f11`
- Base: `unlhcuanfrtpatoipwve`, **sólo SELECT**. No se tocó nada.
- Guards: `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref → `unlhcuanfrtpatoipwve`
- Anonimizado: los beneficiarios van por rol y con los primeros 8 caracteres de su id (no son nombres); los caballos
  (SPC) van por nombre porque es dato público del programa. Ninguna persona nombrada.
- Resolución: la del 25/09 que me pasaste. En la base hay dos resoluciones del 25/09 (N° 39 y 40, tipo SANCIÓN,
  `notificada`, cargadas hoy 21:10 y 21:14 UTC) y las dos sanciones (§5.c).
- Nota de nombres: la resolución dice "WLSON SECURITY"; en la base el SPC es **WILSON SECURITY**.

---

## Resumen

| # | Respuesta corta |
|---|---|
| 1 | La 1ra carrera de R8 es el turno 2 ("PACHAMAMA", `41ff3ee7…`), resultado **oficial** con el marcador **original**: 1 ELSEPTIMOESDECALDERA, **2 LOCA DUBAI**, 3 WILSON SECURITY … 10 BESO CURIOSO. Nadie marcado `descalificado`. Liquidación: 21 líneas de premio y bono, **todas `pagado`**: 19 por el **saldado administrativo del 28/08** (sin recibo) y 2 con recibo real (4° jockey, 5° propietario). Además hay 5 líneas de fondo solidario del club, impagas. |
| 2 | **El premio del 2° figura como pagado por saldado administrativo el 28/08** ("pre-sistema, sin recibo"): $135.216,67 propietario + $19.316,67 entrenador + $19.316,67 jockey = **$173.850,01** (+ $3.863,33 de fondo, impago). Estaba `retenido` hasta el 15/09 (antidoping) y el saldado lo pasó a `pagado` antes de esa fecha. En el sistema **no** está retenido. Si la plata salió de verdad, habría que reclamarla. |
| 3 | El total de la carrera **no cambia** (cada rol da neto $0,00): **$203.850,01 cambian de manos** entre personas. Pierden LOCA DUBAI ($173.850,01) y el propietario de TOUCH OF BLUE ($30.000, de bono 6° a 5° puesto). Ganan WILSON (+$64.050,01), BENDITO (+$19.800,00), el entrenador y el jockey de TOUCH (+$10.000 cada uno) y el propietario de BACHUNA (+$100.000 de bono 8°). El fondo del club se reacomoda (+$3.863,33 / −$3.863,33). ELSEPTIMO, LINDA, ASTUTO, DOCTOR SKY y BESO: sin cambio de plata. Detalle en §3. |
| 4 | R8 está **cerrada** desde el 25/09 16:30:44 UTC. Por la API, la base rechaza cualquier escritura en sus líneas (P0091) y sólo un super_admin la reabre. **Reabrir y "Recalcular" sería muy dañino**: el motor preserva lo pagado con la clave vieja (incluye el puesto) y crea líneas **completas** para los puestos nuevos. En esta carrera dejaría **$873.663,35** cobrables a personas (más $27.503,33 de fondos) contra $203.850,01 que corresponden, y a LOCA DUBAI no le descuenta nada. Además regenera las otras 7 carreras de R8 con el 8 % y las líneas de ISSUE-091. Lo que hace falta es una corrección puntual (§4). |
| 5 | **A medias.** Existe `resultado_posiciones.descalificado` (+ `motivo_desc`); `aplicar_resultado` lo acepta, el motor excluye a los descalificados del premio y `resultados.html` muestra "(DESC)". Pero **ninguna pantalla lo puede poner en true** (siempre manda `false`), no hay "distanciado" (el motor no corre a los de abajo) y no hay líneas negativas ni devolución. Detalle en §5. |

---

## 1. La carrera hoy

### 1.a Carrera y reunión

```sql
select r.id reunion_id, r.numero, r.fecha, r.estado, r.liquidacion_cerrada_at, r.liquidacion_cerrada_nota,
 c.id carrera_id, c.numero_turno, c.numero_carrera_programa, c.estado carrera_estado, c.nombre
from reuniones r join carreras c on c.reunion_id=r.id
where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and r.fecha='2026-08-16'
order by coalesce(c.numero_carrera_programa, 99), c.numero_turno;
```
```
reunion_id                           | numero | fecha      | estado     | liquidacion_cerrada_at        | carrera_id                           | turno | n° prog | carrera_estado | nombre
7b6e003e-22e2-4629-bf55-f18560b1260f | 8      | 2026-08-16 | finalizada | 2026-09-25 16:30:44.073618+00 | 41ff3ee7-4464-468e-b5ed-988a921d8cad | 2     | 1       | confirmada     | PACHAMAMA
7b6e003e-…                           | 8      |            |            |                               | 5fdacd51-9d7b-4d42-a83c-894f8eb35b8b | 12    | 2       | abierta        | GRAL JOSÉ DE SAN MARTIN
7b6e003e-…                           | 8      |            |            |                               | 355537ae-3a74-49ad-b283-26008cf6f8ba | 4     | 3       | confirmada     | DIA DEL VETERINARIO
7b6e003e-…                           | 8      |            |            |                               | baa0ee8f-9f20-417e-b106-f5bc3faffc2c | 5     | 4       | confirmada     | DIA DEL FOLKLORE
7b6e003e-…                           | 8      |            |            |                               | d7288d33-09e0-44db-a449-b5580d56a59a | 10    | 5       | confirmada     | DÍA DEL NIÑO
7b6e003e-…                           | 8      |            |            |                               | 5fa356c5-02c2-44a0-a60b-b817df5e517a | 11    | 6       | confirmada     | ANIV- DOLORES PRIMER PUEBLO PATRIO
7b6e003e-…                           | 8      |            |            |                               | 3cebc6a0-d918-4cae-8af8-76cbe09bbc63 | 3     | 7       | confirmada     | FUERZA AÉREA ARGENTINA
7b6e003e-…                           | 8      |            |            |                               | 8f4ef16b-db26-470a-bbb1-18b8d9b2527b | 8     | 8       | confirmada     | SANTA ROSA
(+ turnos 1, 6, 7, 9: anulada, sin n° de programa)
```

(Filas 2 en adelante: mismas columnas de reunión; se omiten por repetidas.) `liquidacion_cerrada_nota` de R8:
"Congelada tal como está (saldado administrativo del 28/08): SIN el 8 % de peón/capataz/sereno y SIN las líneas de
ISSUE-091. NO es la decisión final sobre esa plata: queda congelada hasta que Fede conteste. Decisión del 25/09/2026."

Premios de la carrera:

```sql
select bolsa_total, bolsa_bonos, distribucion_premios from carreras where id='41ff3ee7-4464-468e-b5ed-988a921d8cad';
```
```
bolsa_total | bolsa_bonos | distribucion_premios
1016666.67  | 0.00        | {"1":60,"2":19,"3":12,"4":6,"5":3,"bono_ganador":250000,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000}
```

Premio por puesto (motor, `calcPremio`: bolsa × % + bono al ganador, con piso de ganancia mínima):
1° $860.000,00 (610.000 + 250.000) · 2° $193.166,67 · 3° $122.000,00 · 4° $100.000,00 (61.000 → piso) ·
5° $100.000,00 (30.500 → piso) · 6°–8° bono de $100.000 al propietario. R8 se liquidó con el reparto **70 / 10 / 10**
(propietario / entrenador / jockey) + fondo solidario 2 % del club, sin el 8 % de peón, capataz y sereno.

### 1.b Marcador en la base

```sql
select r.id resultado_id, r.estado, r.updated_at, rp.posicion, rp.no_largo, rp.descalificado, rp.motivo_desc, rp.empate, rp.diferencia, rp.dividendo,
 i.id insc_id, i.numero_partidor, i.estado insc_estado, s.nombre spc, i.entrenador_id, i.propietario_id, i.jockey_titular_id, i.caballeriza_id
from resultados r join resultado_posiciones rp on rp.resultado_id=r.id join inscripciones i on i.id=rp.inscripcion_id join spcs s on s.id=i.spc_id
where r.carrera_id='41ff3ee7-4464-468e-b5ed-988a921d8cad' order by rp.posicion nulls last, i.numero_partidor;
```
```
resultado ad27a219-2d38-4559-ab3f-b54cb4d22046 · estado oficial · updated_at 2026-08-23 11:06:06.970833+00
pos | spc                  | gatera | no_largo | descalificado | motivo_desc | diferencia | dividendo | insc_id  | entrenador | propietario | jockey
1   | ELSEPTIMOESDECALDERA | 2      | false    | false         | null        | null       | 7.80      | 7a48d4e6 | 896bb14e   | 710e65a0    | 654dc3ea
2   | LOCA DUBAI           | 4      | false    | false         | null        | 6 cpos     | 5.70      | 86534964 | 3c973f57   | b8ad9e70    | 7d069965
3   | WILSON SECURITY      | 10     | false    | false         | null        | 3½ cpos    | 3.00      | a350dec5 | efda8456   | 04781a9f    | 6765e12c
4   | BENDITO PRESAGIO     | 9      | false    | false         | null        | pzo        | 3.50      | 29073f91 | 65cd87b3   | d17c4ffa    | 8c358b73
5   | LINDA MAIPUENSE      | 5      | false    | false         | null        | 1 cpo      | 3.80      | 6b74ddec | c755aa10   | 37fa6583    | 0bbe6666
6   | TOUCH OF BLUE        | 1      | false    | false         | null        | 2½ cpos    | 6.40      | 11c68ef9 | 16f51c0a   | 4544facf    | af8435b7
7   | ASTUTO NOTES         | 7      | false    | false         | null        | 9 cpos     | 422.20    | d2088118 | 405ba68e   | 183fb077    | 9ba2e954
8   | DOCTOR SKY           | 6      | false    | false         | null        | ½ pzo      | 48.60     | 10b4601e | 05d9fbb6   | 380bb7cb    | 8f24be30
9   | BACHUNA              | 8      | false    | false         | null        | ½ pzo      | 127.90    | deebc6ad | 5e625dc3   | 3939906a    | 3fc8f1fd
10  | BESO CURIOSO         | 3      | false    | false         | null        | 4 cpos     | 72.90     | 5de4f156 | 4d076b78   | ca16bb3c    | 9a8af6b4
```

(ids recortados a 8 caracteres; todos `ratificado`.)

### 1.c Líneas de liquidación de la carrera

```sql
select d.posicion, s.nombre spc, d.beneficiario_tipo, d.concepto_tipo, d.concepto, d.descripcion, d.monto_bruto, d.monto_descuento, d.monto_neto, d.estado_linea, d.recibo_id is not null con_recibo, d.pagado_at, d.fecha_liberacion,
 (d.recibo_id is not null or d.estado_linea='pagado') comprometida, left(d.beneficiario_id::text,8) benef
from liquidacion_detalle d left join inscripciones i on i.id=d.inscripcion_id left join spcs s on s.id=i.spc_id
where d.carrera_id='41ff3ee7-4464-468e-b5ed-988a921d8cad'
order by d.posicion nulls last, d.beneficiario_tipo, d.concepto_tipo, d.concepto;
```

El rol (Jockey/Entrenador/Propietario) sale de la `descripcion`. "saldado 28/08" = sufijo
`[REGULARIZACION 2026-08-28: saldado administrativo pre-sistema, sin recibo; estado previo=…]` en la descripción,
`pagado_at 2026-08-28 15:00:00+00`, sin recibo.

```
pos | spc                  | rol            | tipo            | neto        | estado  | cómo                               | f. liberación | benef
1   | ELSEPTIMOESDECALDERA | Jockey         | premio          |  86.000,00  | pagado  | saldado 28/08 (previo: retenido)   | 2026-09-15    | 654dc3ea
1   | ELSEPTIMOESDECALDERA | Entrenador     | premio          |  86.000,00  | pagado  | saldado 28/08 (previo: retenido)   | 2026-09-15    | 896bb14e
1   | ELSEPTIMOESDECALDERA | Propietario    | premio          | 602.000,00  | pagado  | saldado 28/08 (previo: retenido)   | 2026-09-15    | 710e65a0
1   | ELSEPTIMOESDECALDERA | club           | fondo_solidario |  17.200,00  | impago  | —                                  | —             | 0649e9c5
2   | LOCA DUBAI           | Jockey         | premio          |  19.316,67  | pagado  | saldado 28/08 (previo: retenido)   | 2026-09-15    | 7d069965
2   | LOCA DUBAI           | Entrenador     | premio          |  19.316,67  | pagado  | saldado 28/08 (previo: retenido)   | 2026-09-15    | 3c973f57
2   | LOCA DUBAI           | Propietario    | premio          | 135.216,67  | pagado  | saldado 28/08 (previo: retenido)   | 2026-09-15    | b8ad9e70
2   | LOCA DUBAI           | club           | fondo_solidario |   3.863,33  | impago  | —                                  | —             | 0649e9c5
3   | WILSON SECURITY      | Entrenador     | premio          |  12.200,00  | pagado  | saldado 28/08 (previo: impago) + [REVERSION 2026-08-28: recibo N°4 (prueba) borrado] | — | efda8456
3   | WILSON SECURITY      | Jockey         | premio          |  12.200,00  | pagado  | saldado 28/08 (previo: impago)     | —             | 6765e12c
3   | WILSON SECURITY      | Propietario    | premio          |  85.400,00  | pagado  | saldado 28/08 (previo: impago)     | —             | 04781a9f
3   | WILSON SECURITY      | club           | fondo_solidario |   2.440,00  | impago  | —                                  | —             | 0649e9c5
4   | BENDITO PRESAGIO     | Jockey         | premio          |  10.000,00  | pagado  | **con recibo**, 2026-08-28 14:10   | —             | 8c358b73
4   | BENDITO PRESAGIO     | Entrenador     | premio          |  10.000,00  | pagado  | saldado 28/08 (previo: impago)     | —             | 65cd87b3
4   | BENDITO PRESAGIO     | Propietario    | premio          |  70.000,00  | pagado  | saldado 28/08 (previo: impago)     | —             | d17c4ffa
4   | BENDITO PRESAGIO     | club           | fondo_solidario |   2.000,00  | impago  | —                                  | —             | 0649e9c5
5   | LINDA MAIPUENSE      | Jockey         | premio          |  10.000,00  | pagado  | saldado 28/08 (previo: impago)     | —             | 0bbe6666
5   | LINDA MAIPUENSE      | Entrenador     | premio          |  10.000,00  | pagado  | saldado 28/08 (previo: impago)     | —             | c755aa10
5   | LINDA MAIPUENSE      | Propietario    | premio          |  70.000,00  | pagado  | **con recibo**, 2026-08-16 18:46   | —             | 37fa6583
5   | LINDA MAIPUENSE      | club           | fondo_solidario |   2.000,00  | impago  | —                                  | —             | 0649e9c5
6   | TOUCH OF BLUE        | Propietario    | bono            | 100.000,00  | pagado  | saldado 28/08 (previo: impago)     | —             | 4544facf
7   | ASTUTO NOTES         | Propietario    | bono            | 100.000,00  | pagado  | saldado 28/08 (previo: impago)     | —             | 183fb077
8   | DOCTOR SKY           | Propietario    | bono            | 100.000,00  | pagado  | saldado 28/08 (previo: impago)     | —             | 380bb7cb
```

Totales: premios y bonos **$1.537.650,01, todo `pagado`**: $1.457.650,01 por saldado administrativo y $80.000,00 con
recibo (4° jockey $10.000 + 5° propietario $70.000). Fondo solidario **$27.503,33**, `impago`. Los premiados 1° y 2°
tenían `fecha_liberacion` 2026-09-15 (16/08 + 30 días de antidoping) y estaban `retenido`; el saldado del 28/08 los
pasó a `pagado` **antes** de esa fecha. No hay líneas de peón/capataz/sereno (R8 cerrada sin el 8 %) ni incentivos
en esta carrera (los incentivos son por reunión y por caballo que largó, no dependen del puesto; LOCA DUBAI largó).

---

## 2. El premio del 2°

**Saldado administrativamente el 28/08**, no retenido, no con recibo:

| Rol | Monto | Estado | Cómo |
|---|---|---|---|
| Propietario (`b8ad9e70`) | $135.216,67 | `pagado` | saldado administrativo 28/08, sin recibo; previo `retenido` |
| Entrenador (`3c973f57`, el suspendido) | $19.316,67 | `pagado` | ídem |
| Jockey (`7d069965`) | $19.316,67 | `pagado` | ídem |
| Fondo solidario (club) | $3.863,33 | `impago` | línea interna del club |

**$173.850,01** a personas. El texto del saldado dice "pre-sistema": esas líneas se marcaron pagadas porque se
pagaron **por fuera del sistema**. Qué pasó con la plata en la realidad (¿se pagó en efectivo? ¿quedó retenida en
caja por el doping?) no está en la base: hay que preguntarle a la secretaría (Q1). Si se pagó, la resolución implica
reclamar $173.850,01 (o compensarlos contra premios futuros, si el reglamento lo admite).

---

## 3. Si el marcador cambia: qué habría que rehacer, puesto por puesto

Marcador nuevo: 1 ELSEPTIMOESDECALDERA, 2 WILSON SECURITY, 3 BENDITO PRESAGIO, 4 LINDA MAIPUENSE, 5 TOUCH OF BLUE,
6 ASTUTO NOTES, 7 DOCTOR SKY, 8 BACHUNA, 9 BESO CURIOSO, distanciado (último) LOCA DUBAI.

Cálculo con la **misma regla con la que se liquidó R8** (70/10/10 + fondo 2 %, sin el 8 %), mismos premios por puesto
(§1.a). Script (Python, leído de los números de arriba):

```
A) Diferencia real (regla con la que se liquidó R8: 70/10/10 + fondo 2 %), por caballo y rol
caballo                viejo nuevo rol                       liquidado correspondería     diferencia
ELSEPTIMOESDECALDERA       1     1 propietario              602.000,00     602.000,00           0,00
ELSEPTIMOESDECALDERA       1     1 entrenador                86.000,00      86.000,00           0,00
ELSEPTIMOESDECALDERA       1     1 jockey                    86.000,00      86.000,00           0,00
ELSEPTIMOESDECALDERA       1     1 fondo(club)               17.200,00      17.200,00           0,00
LOCA DUBAI                 2    10 propietario              135.216,67           0,00    -135.216,67
LOCA DUBAI                 2    10 entrenador                19.316,67           0,00     -19.316,67
LOCA DUBAI                 2    10 jockey                    19.316,67           0,00     -19.316,67
LOCA DUBAI                 2    10 fondo(club)                3.863,33           0,00      -3.863,33
WILSON SECURITY            3     2 propietario               85.400,00     135.216,67     +49.816,67
WILSON SECURITY            3     2 entrenador                12.200,00      19.316,67      +7.116,67
WILSON SECURITY            3     2 jockey                    12.200,00      19.316,67      +7.116,67
WILSON SECURITY            3     2 fondo(club)                2.440,00       3.863,33      +1.423,33
BENDITO PRESAGIO           4     3 propietario               70.000,00      85.400,00     +15.400,00
BENDITO PRESAGIO           4     3 entrenador                10.000,00      12.200,00      +2.200,00
BENDITO PRESAGIO           4     3 jockey                    10.000,00      12.200,00      +2.200,00
BENDITO PRESAGIO           4     3 fondo(club)                2.000,00       2.440,00        +440,00
LINDA MAIPUENSE            5     4 propietario               70.000,00      70.000,00           0,00
LINDA MAIPUENSE            5     4 entrenador                10.000,00      10.000,00           0,00
LINDA MAIPUENSE            5     4 jockey                    10.000,00      10.000,00           0,00
LINDA MAIPUENSE            5     4 fondo(club)                2.000,00       2.000,00           0,00
TOUCH OF BLUE              6     5 propietario                    0,00      70.000,00     +70.000,00
TOUCH OF BLUE              6     5 propietario (bono)       100.000,00           0,00    -100.000,00
TOUCH OF BLUE              6     5 entrenador                     0,00      10.000,00     +10.000,00
TOUCH OF BLUE              6     5 jockey                         0,00      10.000,00     +10.000,00
TOUCH OF BLUE              6     5 fondo(club)                    0,00       2.000,00      +2.000,00
ASTUTO NOTES               7     6 propietario (bono)       100.000,00     100.000,00           0,00
DOCTOR SKY                 8     7 propietario (bono)       100.000,00     100.000,00           0,00
BACHUNA                    9     8 propietario (bono)             0,00     100.000,00    +100.000,00
BESO CURIOSO              10     9 —                              0,00           0,00           0,00

Neto de la carrera:  0,00  · por rol: propietario  0,00, entrenador  0,00, jockey  0,00, fondo(club)  0,00
A pagar de más (suma de diferencias positivas): 277.713,34 · a recuperar/no corresponde (negativas): -277.713,34

B) Lo que CREARÍA el motor actual si se reabre R8 y se recalcula (clave = rol|beneficiario|inscripción|puesto|concepto; lo pagado se preserva con la clave vieja)
  ELSEPTIMOESDECALDERA    1° fondo(club)               17.200,00  se regenera (era impaga)
  ELSEPTIMOESDECALDERA    1° peón                      34.400,00  NUEVA
  ELSEPTIMOESDECALDERA    1° capataz                   25.800,00  NUEVA
  ELSEPTIMOESDECALDERA    1° sereno                     8.600,00  NUEVA
  WILSON SECURITY         2° propietario              135.216,67  NUEVA
  WILSON SECURITY         2° entrenador                19.316,67  NUEVA
  WILSON SECURITY         2° jockey                    19.316,67  NUEVA
  WILSON SECURITY         2° fondo(club)                3.863,33  NUEVA
  WILSON SECURITY         2° peón                       7.726,67  NUEVA
  WILSON SECURITY         2° capataz                    5.795,00  NUEVA
  WILSON SECURITY         2° sereno                     1.931,67  NUEVA
  BENDITO PRESAGIO        3° propietario               85.400,00  NUEVA
  BENDITO PRESAGIO        3° entrenador                12.200,00  NUEVA
  BENDITO PRESAGIO        3° jockey                    12.200,00  NUEVA
  BENDITO PRESAGIO        3° fondo(club)                2.440,00  NUEVA
  BENDITO PRESAGIO        3° peón                       4.880,00  NUEVA
  BENDITO PRESAGIO        3° capataz                    3.660,00  NUEVA
  BENDITO PRESAGIO        3° sereno                     1.220,00  NUEVA
  LINDA MAIPUENSE         4° propietario               70.000,00  NUEVA
  LINDA MAIPUENSE         4° entrenador                10.000,00  NUEVA
  LINDA MAIPUENSE         4° jockey                    10.000,00  NUEVA
  LINDA MAIPUENSE         4° fondo(club)                2.000,00  NUEVA
  LINDA MAIPUENSE         4° peón                       4.000,00  NUEVA
  LINDA MAIPUENSE         4° capataz                    3.000,00  NUEVA
  LINDA MAIPUENSE         4° sereno                     1.000,00  NUEVA
  TOUCH OF BLUE           5° propietario               70.000,00  NUEVA
  TOUCH OF BLUE           5° entrenador                10.000,00  NUEVA
  TOUCH OF BLUE           5° jockey                    10.000,00  NUEVA
  TOUCH OF BLUE           5° fondo(club)                2.000,00  NUEVA
  TOUCH OF BLUE           5° peón                       4.000,00  NUEVA
  TOUCH OF BLUE           5° capataz                    3.000,00  NUEVA
  TOUCH OF BLUE           5° sereno                     1.000,00  NUEVA
  ASTUTO NOTES            6° propietario (bono)       100.000,00  NUEVA
  DOCTOR SKY              7° propietario (bono)       100.000,00  NUEVA
  BACHUNA                 8° propietario (bono)       100.000,00  NUEVA
  Total que el motor dejaría cobrable en esta carrera: 901.166,68 (más lo que genere en las otras 7 carreras de R8: 8 % y líneas de ISSUE-091). LOCA DUBAI: sus 173.850,01 pagados se preservan, nada se descuenta.
```

**Parte A — lo que corresponde, por caballo:**

| Caballo | Pasa | Cambio de plata |
|---|---|---|
| ELSEPTIMOESDECALDERA | 1° → 1° | ninguno |
| **LOCA DUBAI** | 2° → último | **−$173.850,01** a personas (propietario −135.216,67, entrenador −19.316,67, jockey −19.316,67) y −$3.863,33 de fondo |
| WILSON SECURITY | 3° → 2° | **+$64.050,01** a personas (propietario +49.816,67, entrenador +7.116,67, jockey +7.116,67) y +$1.423,33 de fondo |
| BENDITO PRESAGIO | 4° → 3° | **+$19.800,00** a personas (propietario +15.400, entrenador +2.200, jockey +2.200) y +$440 de fondo |
| LINDA MAIPUENSE | 5° → 4° | ninguno ($100.000 en los dos puestos por el piso); cambia sólo la etiqueta del puesto |
| TOUCH OF BLUE | bono 6° → 5° puesto | propietario **−$30.000** (bono $100.000 → 70 % de $100.000), entrenador **+$10.000**, jockey **+$10.000**, fondo +$2.000 |
| ASTUTO NOTES | bono 7° → bono 6° | ninguno |
| DOCTOR SKY | bono 8° → bono 7° | ninguno |
| **BACHUNA** | 9° → bono 8° | propietario **+$100.000** |
| BESO CURIOSO | 10° → 9° | ninguno |

- Neto de la carrera **$0,00 en cada rol**: la bolsa no cambia, sólo quién la cobra.
- **Por beneficiario (neto): $203.850,01 a pagar** (WILSON +$64.050,01, BENDITO +$19.800,00, entrenador y jockey de
  TOUCH +$10.000 cada uno, propietario de BACHUNA +$100.000) y **$203.850,01 cobrados de más** (LOCA DUBAI
  $173.850,01, propietario de TOUCH OF BLUE $30.000).
- Fondo del club (línea interna, impaga): WILSON +$1.423,33, BENDITO +$440, TOUCH +$2.000, LOCA −$3.863,33 → neto $0.
- La salida A del script suma $277.713,34 de diferencias positivas por **línea**: cuenta aparte el 5° puesto nuevo
  del propietario de TOUCH (+$70.000) y su bono perdido (−$100.000). Por persona es −$30.000; de ahí los
  $203.850,01.
- Si además se aplicara la regla del 100 % (peón 4 % / capataz 3 % / sereno 1 %, que R8 **no** tiene: decisión del
  25/09 pendiente de Fede), cada puesto 1°–5° sumaría el 8 % de su premio: cambia el total de la carrera y es otra
  discusión (la de toda R8).

**Parte B — lo que haría el motor si se reabriera R8 y alguien apretara "Recalcular":** ver §4.b. **$873.663,35** a
personas en esta carrera (más $27.503,33 de fondos) en vez de $203.850,01, y ningún descuento a LOCA DUBAI.

Otros datos que el cambio de marcador toca y que la liquidación no toca:
- **Dividendos** (`resultado_apuestas`, 9 filas) y el campo `dividendo` de cada posición: son del tote. En la práctica
  un distanciamiento posterior por doping no cambia lo que ya se pagó en apuestas; hay que confirmarlo (Q3).
- **Performances** de la carrera: 0 filas (no hay historial que corregir).

---

## 4. R8 cerrada: qué hace falta para rehacer y qué se dispara si alguien la reabre

### 4.a Qué protege el cierre

```sql
select t.tgname, c.relname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and (t.tgname ilike '%cerrad%' or t.tgname ilike '%liq%' or c.relname='reuniones') order by 2,1;
```
```
trg_liq_detalle_cerrada   | liquidacion_detalle | BEFORE INSERT OR DELETE OR UPDATE … EXECUTE FUNCTION fn_liq_cerrada_guard()
trg_liquidaciones_cerrada | liquidaciones       | BEFORE INSERT OR DELETE OR UPDATE … EXECUTE FUNCTION fn_liq_cerrada_guard()
trg_reunion_cierre        | reuniones           | BEFORE INSERT OR UPDATE OF liquidacion_cerrada_at, liquidacion_cerrada_nota … EXECUTE FUNCTION fn_reunion_cierre_guard()
(+ trg_audit_liquidacion_config, trg_audit_liquidaciones, trg_audit_reuniones, trg_reuniones_updated_at)
```

`fn_liq_cerrada_guard` (md5 `e17f0c81a60afa0356fcda83819f5d4a`): si la reunión está cerrada, **todo INSERT/UPDATE/DELETE
en `liquidacion_detalle` o `liquidaciones` que entre por la API con sesión de usuario da `P0091`**. Pasan sólo
service_role (secret key) y sesiones directas a la base (migración por MCP/psql).
`fn_reunion_cierre_guard` (md5 `e531d5094c6ca559d3e0898b38c8839c`): cerrar o reabrir (`liquidacion_cerrada_at`) sólo
super_admin, service_role o migración. El motor además corta antes de leer nada
(`liquidaciones-engine.js:108`: "la liquidación de esta reunión está cerrada (saldada): no se recalcula").

Lo que **no** está protegido: `aplicar_resultado` no mira el cierre. Un secretario u operador **puede cambiar hoy el
marcador** de esta carrera en `resultados.html` (F10). El guardado anda; el recálculo automático posterior
(`resultados.html:1684`) choca con el cierre y la pantalla avisa "la liquidación no se generó". Quedaría el marcador
nuevo con la liquidación vieja: inconsistente pero sin plata nueva.

### 4.b Si alguien la reabre y recalcula

Un super_admin pone `liquidacion_cerrada_at = NULL` y aprieta **Recalcular reunión** (o vuelve a oficializar una
carrera). El motor (`liquidaciones-engine.js`):

1. Lee **toda R8**, no sólo esta carrera.
2. Preserva las líneas comprometidas (`pagado` o con recibo) por su clave:
   `lineKey = beneficiario_tipo | beneficiario_id | concepto_tipo | inscripcion_id | posicion | concepto` (`:40`).
3. Borra las no comprometidas (acá, los fondos impagos) y crea todo lo que no coincida con una clave preservada.

La clave incluye el **puesto** y el concepto ("Carrera 1 — 3° puesto"). Si el caballo cambia de puesto, la clave no
coincide: la línea vieja pagada queda y se crea una **completa** para el puesto nuevo. En esta carrera eso da (salida B
del script): **$901.166,68 cobrables**. De ese total, $27.503,33 son fondos del club, que reemplazan a los borrados; a
personas van **$873.663,35**, contra $273.850,01 que corresponden. Al mismo tiempo **a LOCA DUBAI no le descuenta
nada**: sus $173.850,01 pagados quedan con su clave. Y como hoy el motor usa la regla del 100 %, genera peón, capataz y
sereno para los cinco premiados, incluido el 1° ($68.800 del ganador).

Y lo mismo en las **otras 7 carreras de R8**: aparecen las sub-líneas del 8 % y las líneas de ISSUE-091, justo lo que
el cierre del 25/09 congeló a propósito hasta que Fede conteste. (ISSUE-091 midió R6+R8 juntas: 33 líneas, $1.345.823,34.)

**Conclusión: no hay que reabrir R8 ni recalcularla para aplicar esta resolución.**

### 4.c Qué haría falta para rehacerla bien (propuesta, no hecho)

Una corrección **puntual, sólo de esta carrera**, por migración (service_role / MCP: el guard la deja pasar sin
reabrir), con informe y revisión antes:

1. Marcador: reescribir `resultado_posiciones` de esta carrera. LOCA DUBAI con `descalificado = true` y
   `motivo_desc` = la resolución, más la posición que se decida (último o NULL); los demás corridos un puesto.
   **Sin llamar al motor.**
2. Plata, con el cálculo de §3 A (no con el motor):
   - Líneas **nuevas `impago`** por lo que falta pagar: WILSON +$64.050,01, BENDITO +$19.800,00, TOUCH (entrenador
     +$10.000, jockey +$10.000) y BACHUNA +$100.000. Con conceptos que no choquen con las claves existentes
     (p. ej. "Carrera 1 — ajuste por resolución 39/40"), así un recálculo futuro no las duplica.
   - Lo cobrado de más (LOCA DUBAI $173.850,01 y propietario de TOUCH $30.000): **el sistema no tiene cómo
     representarlo** (no hay líneas negativas, notas de débito ni devoluciones). Opciones: registrarlo fuera del sistema
     hasta que exista, o agregar el concepto (desarrollo aparte).
   - Fondos del club: ajustar las líneas impagas (WILSON +$1.423,33, BENDITO +$440, TOUCH +$2.000, LOCA −$3.863,33).
3. La nota de cierre de R8 (`liquidacion_cerrada_nota`) debería registrar el ajuste.

Antes de eso hace falta la decisión de Fede (Q2) y saber qué pasó con la plata del 2° (Q1).

---

## 5. ¿El sistema contempla el distanciamiento?

| Pieza | Estado |
|---|---|
| Columna | `resultado_posiciones.descalificado boolean default false` + `motivo_desc text` (esquema abajo). No hay "distanciado" como estado propio. |
| RPC | `aplicar_resultado` acepta `descalificado` y `motivo_desc` en `p_posiciones` y los guarda. |
| Pantalla | `resultados.html` **siempre** manda `descalificado: false` (`:1525`, `:1555`). No hay control para marcarlo. Sí lo **muestra**: "(DESC)" en rojo (`:1798`). |
| Motor | Excluye a los descalificados del premio: toma posiciones con `posicion NOT NULL AND descalificado = false` (`liquidaciones-engine.js:141`). **No corre a los de abajo**: si se marca descalificado al 2° sin cambiar las posiciones, nadie cobra el 2° y el 3° sigue cobrando el 3°. Distanciar = reescribir las posiciones a mano. |
| Plata ya pagada | Sin soporte: no hay líneas negativas ni devolución; y el recálculo, por la clave con puesto, duplica en vez de ajustar (§4.b). |
| Sanciones | Sí: las dos ya están cargadas (abajo). |

```sql
select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='resultado_posiciones' order by ordinal_position;
```
```
id uuid uuid_generate_v4() · resultado_id uuid · inscripcion_id uuid · posicion integer · tiempo varchar · diferencia varchar ·
descalificado boolean false · motivo_desc text · empate boolean false · dividendo numeric · no_largo boolean false
```

### 5.c Sanciones y resoluciones ya cargadas

```sql
select 'res' t, r.numero, r.tipo, r.fecha::text, r.estado, r.created_at::text, u.rol creador_rol, left(coalesce(r.texto,''),160) texto from resoluciones r left join usuarios u on u.id=r.creado_por where r.fecha>='2026-09-20'
union all select 'san', s.entidad_tipo::text, s.tipo_sancion, s.fecha_inicio::text, s.estado::text, s.created_at::text, u.rol, left(coalesce(s.motivo,''),160) from sanciones s left join usuarios u on u.id=s.creado_por
 where s.entidad_id in ((select spc_id from inscripciones where id='86534964-b32d-4ec5-b84b-92bb8af2ff69'), '3c973f57-4163-4e78-b7e1-cca4885d787f') order by 1,2;
```
```
t   | numero      | tipo       | fecha      | estado     | created_at                    | creador_rol | texto
res | 39          | SANCIÓN    | 2026-09-25 | notificada | 2026-09-27 21:10:49.942007+00 | null        | Visto el informe elevado por el Centro de Investigación y Control del Doping del Hipódromo de San Isidro, en relación al resultado de los análisis efectuados al
res | 40          | SANCIÓN    | 2026-09-25 | notificada | 2026-09-27 21:14:08.994978+00 | null        | Visto el informe elevado por el Centro de Investigación y Control del Doping del Hipódromo de San\nIsidro, en relación al resultado de los análisis efectuados al
san | profesional | SUSPENSIÓN | 2026-09-15 | activa     | 2026-09-25 21:04:18.20164+00  | operador    | DOPING POSITIVO CAFEINA, TEOFILINA Y ACEPROMACINA
san | spc         | SUSPENSIÓN | 2026-09-15 | activa     | 2026-09-25 21:05:12.001122+00 | operador    | CATEGORIA B Y C
```
```
sanción entrenador (3c973f57): 2026-09-15 → 2029-03-14 (2 años y medio) · activa
sanción LOCA DUBAI (spc 83dca3e3…): 2026-09-15 → 2027-01-14 (4 meses) · activa
```

Las fechas coinciden con la resolución. Las resoluciones 39 y 40 se cargaron hoy (21:10 y 21:14 UTC) sin `creado_por`
(`resoluciones.html` no lo manda; mismo patrón que tenía sanciones hasta el 25/09). Que se hayan podido cargar muestra
que las políticas nuevas de ISSUE-093 no le cerraron `resoluciones` al staff.

---

## Preguntas abiertas

- **Q1** — La plata del 2°: ¿se le pagó a LOCA DUBAI (propietario, entrenador, jockey) antes o después del 28/08, o
  quedó retenida en caja por el doping? La base dice "saldado administrativo pre-sistema". Si se pagó, hay que
  reclamar $173.850,01 (y $30.000 al propietario de TOUCH OF BLUE).
- **Q2** — ¿Fede confirma el reparto de §3 A (misma regla con la que se liquidó R8, sin el 8 %)? ¿O esta carrera va
  con la regla del 100 %?
- **Q3** — ¿Los dividendos de apuestas se tocan? (Normalmente no.)
- **Q4** — ¿LOCA DUBAI queda en el puesto 10 con `descalificado = true`, o sin puesto?
- **Q5** — ¿Hace falta en el sistema una forma de registrar devoluciones o descuentos (línea negativa, nota de débito,
  compensación contra premios futuros)? Hoy no existe.
- **Q6** — ¿Se agrega a `resultados.html` un control de "distanciado" (que marque `descalificado` y corra el
  marcador)? Y que `aplicar_resultado` avise o frene en reuniones cerradas.
