# R8 — Tanda 5, punto 5: cruce de la planilla final

**Branch**: `fix/spcs-r8-tanda-5`
**Fecha**: 2026-08-10
**Pedido**: Yesi — faltantes detectados contra el xlsx final, mientras inscribe para R8 (16/08).
**Estado**: PROPUESTA — nada aplicado a la base.

---

## 0. Guard de sesión

| Check | Resultado |
|---|---|
| `pwd` | `/home/clio/dev/SGH` ✅ |
| `SELECT count(*) FROM spcs` | **179** ✅ |
| Working tree | limpio, branch `fix/spcs-r8-tanda-5` |

---

## 1. SPCs (7 nombres)

Cruce por nombre normalizado (upper, sin acentos, sin no-alfanuméricos).

| Nombre | En base | Acción |
|---|---|---|
| CURIOSA GO ON | no | **alta** — sb 434886 |
| EL JOROBA | no | **alta** — sb 429575 |
| GRAND FITO | no | **alta** — sb 431958 |
| LA DE ETIQUETA | no | **alta** — sb 427052 |
| DEVIL'S KING | ✅ sí | confirmado — sb 407323, caballeriza DON GIOVANNI |
| NOCHE EN VELA | ✅ sí | confirmado — sin studbook_id |
| Wave Rimout | ⚠️ **duplicado** | ver §3 |

Los 4 faltantes se scrapearon del Stud Book: **4/4 match exacto, 0 ambiguos**.
Evidencia en `data/spcs_r8_tanda_5_scrape.json`.

| Nombre | sb_id | Nac. | Sexo | Pelo | Padre / Madre |
|---|---|---|---|---|---|
| CURIOSA GO ON | 434886 | 2022-07-16 | hembra | Alazan | Curioso Johan / Mucura Cat |
| EL JOROBA | 429575 | 2021-08-27 | macho | Zaino | In The Dark / Juany |
| GRAND FITO | 431958 | 2021-10-06 | macho | Zaino | Telematico / Lady Glamour |
| LA DE ETIQUETA | 427052 | 2021-07-16 | hembra | Zaino | Aspire (USA) / Etiquetag |

Guard anti-duplicado por grafía: la única fila parecida es **BESO CURIOSO** (sb 439623) — otro ejemplar, no comparte sb ni madre. No bloquea.

Migración: `migrations/spcs_r8_tanda_5_punto5.sql` (spcs 179 → 183).

---

## 2. Caballerizas (5 nombres)

**4 de 5 ya existían.** El pedido las daba por faltantes; el cruce dice otra cosa.

| Nombre | En base | Acción |
|---|---|---|
| DON GIOVANNI | ✅ `de9c5157-…` | ya está — ⚠️ `hipodromo_patente` NULL |
| LOS MELOS | ✅ `a07b8f01-…` (DOL) | ya está |
| MARIA EVA | ✅ `d91f7c30-…` (DOL) | ya está |
| STUD LOS GRINGOS | ✅ `8ab122ff-…` (DOL) | ya está |
| LA CALIFORNIA | ❌ no | **única alta** |

El cruce toleró el prefijo `STUD ` en ambos lados, así que "LOS GRINGOS" y "STUD LOS GRINGOS" no se habrían duplicado.

Migración: `migrations/caballerizas_r8_tanda_5_punto5.sql` (1 alta).

---

## 3. ⚠️ Hallazgo: Wave Rimout duplicado — toca R8 del 16/08

Hay **dos filas** en `spcs` para el mismo ejemplar (mismo nombre, misma fecha de nacimiento 2017-08-08, mismo sexo):

| id | Creado | caballeriza | Inscripción |
|---|---|---|---|
| `f277af1c-a4ac-4a98-87d7-b41871718c8d` | 2026-05-07 | **LOS MELOS** | R6 (20/06), turno 11, `forfait` |
| `5ebc5e48-2caf-4c44-be6a-ad75f2716850` | 2026-06-12 | **NULL** | **R8 (16/08), turno 10, `inscripto`** |

Ninguna de las dos tiene `studbook_id`, así que el índice único parcial no las frenó.

**El problema concreto**: la inscripción viva del domingo apunta a la fila *sin caballeriza*. La que tiene LOS MELOS es la vieja, y quedó con un forfait de R6.

Dos arreglos posibles — **no aplico ninguno solo**:

- **A (mínimo)**: setear `caballeriza_id = LOS MELOS` en `5ebc5e48`. Toca un solo campo, no mueve inscripciones, arregla la salida del domingo. Deja el duplicado vivo.
- **B (limpio)**: repuntar la inscripción de R8 a `f277af1c` y desactivar `5ebc5e48`. Deja una sola fila por ejemplar, pero toca una inscripción que Yesi está usando ahora mismo.

Recomiendo **A ahora** (llega al domingo sin tocar inscripciones) y **B después del 16**, con Yesi mirando.

---

## 4. ⚠️ Hallazgo de fondo: 33 SPCs de R8 sin caballeriza

Wave Rimout no es un caso aislado. En la reunión del 16/08:

| Métrica | Valor |
|---|---|
| SPCs distintos inscriptos | 80 |
| …de esos, **sin `caballeriza_id`** | **33 (41 %)** |
| Inscripciones totales | 106 |
| …de esas, con SPC sin caballeriza | **48 (45 %)** |

En toda la tabla: **64 de 179 SPCs (36 %) sin caballeriza**, y 116 de 179 (65 %) sin `studbook_id`.

Es el mismo patrón que GOTCHA #47 (`inscripciones.propietario_id` 10/95). No lo arreglo en esta tanda — es un backfill aparte y necesita a Yesi para decidir caballeriza por ejemplar. Lo dejo medido para que se pueda planificar.

Si el programa del 16 imprime la caballeriza, **45 % de las líneas saldrían en blanco**. Vale confirmarlo antes del domingo.

---

## 5. Pendiente: el cruce completo de 83 SPCs

El pedido decía *"te paso la lista entera abajo"* y quedó el placeholder `[pegá acá la lista de 83 nombres si CC la pide]` — **la lista no vino**. Sin ella no puedo cerrar el cruce completo ni descartar más huecos.

Lo que sí se puede afirmar hoy: los 7 nombres explícitos del punto 5 están cruzados y resueltos.

---

## 6. Gates

| Gate | Contenido | Estado |
|---|---|---|
| 1 | Cruce + scrape + migraciones escritas (este documento) | ✅ listo |
| 2 | Aplicar `spcs_r8_tanda_5_punto5.sql` (4 altas, 179 → 183) | espera OK |
| 3 | Aplicar `caballerizas_r8_tanda_5_punto5.sql` (1 alta) | espera OK |
| 4 | Decisión sobre Wave Rimout (opción A o B) | espera decisión |
| 5 | Cruce completo de los 83 SPCs | espera la lista |

Nada se aplica sin OK.
