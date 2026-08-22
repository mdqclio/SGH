# Bitácora de ejecución — propietarios provisorios R8 (18/08/2026)

Runbook: `docs/RUNBOOK_R8_PROVISORIOS.md` · medición previa: `docs/B1_SALIDA_18AGO.md`
(`e6741d8`).

- Proyecto: `unlhcuanfrtpatoipwve` · R8 = `7b6e003e-22e2-4629-bf55-f18560b1260f`
- Marca de idempotencia: `provisorio R8 15/08` (literal, no se cambia)
- Modo: **paso a paso**. Se para después de cada bloque 🔴 y de cada STOP.
- `oficiales = 6` → **B9, B10 y B11 son obligatorios.** La operación no cierra en B8.

Un bloque por sección, en orden de ejecución. Se agrega a medida que se corren.

---

## B0 · Guard — OK

```
pwd  = /home/clio/dev/SGH     OK
spcs = 183                    OK
ref  = unlhcuanfrtpatoipwve   OK   (get_project_url)
```

## B1 · Medición — OK

```
ratificados          = 67
con_prop             = 18
sin_prop             = 49
cab_r8               = 57
cab_sin_ninguna_fila = 40      ← N, las filas que entran en B3
cab_prop_inactivo    = 0
cab_fila_prop_sin_id = 0
oficiales            = 6       ← informativo; obliga B9–B11
```

Detalle y lista nominal de las 40: `docs/B1_SALIDA_18AGO.md`.

---

## B2 🔴 · Snapshot — HECHO, criterio cumplido

Primera escritura de la operación. DDL por `apply_migration`, migración
`bak_r8_propietario_snapshot`.

Chequeo previo de idempotencia (la tabla no existía):

```sql
SELECT to_regclass('public.bak_r8_propietario');   -- → NULL
```

DDL aplicado:

```sql
CREATE TABLE bak_r8_propietario AS
SELECT i.id AS inscripcion_id, i.carrera_id, i.spc_id, i.caballeriza_id,
       i.propietario_id, now() AS snapshot_at
FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado = 'ratificado';
```

Verificación:

```
filas       = 67      ← CRITERIO: 67. CUMPLE.
con_prop    = 18      ← coincide con B1
snapshot_at = 2026-08-18 16:01:22.503561+00
```

`filas = 67` y `con_prop = 18` reproducen exactamente `ratificados` y `con_prop` de B1: el
snapshot es de la misma foto que se midió, no de un estado que se movió en el medio.

**El rollback ya tiene contra qué restaurar.**

### CSV — fuera del repo

`tmp/bak_r8_propietario_20260818.csv` (header + 67 filas). **NO commiteado** — es PII y el
repo es público. Verificado:

```
$ git check-ignore -v tmp/bak_r8_propietario_20260818.csv
.gitignore:20:tmp/bak_r8_*.csv	tmp/bak_r8_propietario_20260818.csv
```

El respaldo real del rollback es la tabla `bak_r8_propietario` en la base. El CSV es
comodidad de lectura: si se borra, el rollback funciona igual.

**PARADA. B3 espera aprobación.**

---

## B3 🔴 · Insertar provisorios — HECHO, 40/40, criterio cumplido

Una sola sentencia atómica, la del runbook sin modificar. `El linye y Rami` entró como una
más (plan §8, decisión ratificada 18/08).

### Estado antes / después

| | antes | después | delta |
|---|---|---|---|
| `propietarios` (total) | 220 | 260 | **+40** |
| `propietarios` con marca `provisorio R8%` | 0 | 40 | **+40** |
| `caballeriza_responsables` (total) | 219 | 259 | **+40** |
| `caballeriza_responsables` de un provisorio | 0 | 40 | **+40** |

Control inmediato del runbook:

```
provisorios    = 40      ← CRITERIO: iguales entre sí y = N (40). CUMPLE.
cr_provisorios = 40
```

Los deltas de total coinciden con los de la marca: **+40 y +40, ni una fila de más**.
Ningún propietario se creó por fuera de la marca.

### Las 40 filas de `propietarios`

```
prov              = 40
notas_exactas     = 40    ← notas = 'provisorio R8 15/08' (literal, no LIKE)
documento_nro     = 40 NULL
documento_tipo    = 40 NULL
tipo='persona'    = 40
activo + 'activo' = 40
ids_distintos     = 40
nombres_distintos = 40    ← ningún nombre repetido entre los provisorios
created_at        = 2026-08-18 16:16:40.270291+00 (las 40, mismo instante = una transacción)
```

### Las 40 filas de `caballeriza_responsables`

```
cr_prov          = 40
documento_nro    = 40 NULL      ← el trigger no se disparó
rol='propietario'= 40
activo           = 40
cab_distintas    = 40           ← 1:1, ninguna caballeriza con dos filas
prop_distintos   = 40           ← 1:1, ningún propietario compartido
nombre_coincide  = 40           ← cr.nombre = propietarios.nombre en las 40
```

### El trigger no corrió — verificado en su código, no por inferencia

`documento_tipo` quedó en `'DNI'` en las 40, **pero no lo puso el INSERT**: es el
`column_default` de la tabla.

```
documento_nro   default NULL          nullable YES
documento_tipo  default 'DNI'::varchar nullable YES
```

Eso no dispara nada. El guard de `fn_caballeriza_resp_set_propietario` es:

```sql
IF NEW.rol='propietario' AND NEW.documento_nro IS NOT NULL THEN
```

`documento_nro` es NULL en las 40 → el cuerpo entero se saltea. El trigger nunca llega a
leer `documento_tipo`, nunca busca por documento y nunca hace el INSERT en `propietarios`
de su rama interna. **Cero propietarios creados por el trigger, cero `propietario_id`
pisados, cero duplicados silenciosos** — y el delta +40 exacto lo confirma por afuera.

### Correspondencia caballeriza → propietario provisorio

| caballeriza | propietario_id |
|---|---|
| ABUELO FLORO | `a3ae4b15-5830-4ffc-87ed-3fe4888f1bfe` |
| BETTY SANTI | `ecf7faa3-104d-4bcd-be11-406e1407efa7` |
| CRAZY HORSE | `3dffc831-aacf-4a78-8934-9c1add19db94` |
| DON BENICIO | `dd163efd-8c92-4a3a-a99c-9e0d62732a99` |
| DON GIOVANNI | `d0077f50-edfa-4a15-9956-ab8f9cb9dcd4` |
| DON RAUL | `adfab3c8-d64d-40d5-9d8a-031ce3071dda` |
| EL CHINGA | `d61d91c8-2454-46b3-a57a-3c6eb0c6b00c` |
| EL COLORADO | `63cc65d0-e5cc-4308-b860-366fe88293d0` |
| EL DERBY | `0e0b79c2-310d-4c75-b7ce-9c74b409cea6` |
| EL DESTINO | `c2904000-aef9-4b8c-9ef0-6c0cd98ca6f8` |
| EL HORNERITO CAFE | `7853a8e1-4cb4-44b9-b28c-69c594fc909e` |
| EL LALO | `3a905198-859b-4aa4-b3ed-91e5e7144c3f` |
| **El linye y Rami** | `8021028e-18a4-468a-9db3-c2643061e0e8` |
| EL NIETO | `02e897a0-874f-4031-a599-93a22563ff9e` |
| EL PIMPO | `d17c4ffa-48af-4491-bc26-1e0f493a0653` |
| EL VETERANO | `e0194048-4b6c-471d-ba2e-a54c9f9a65e5` |
| EMI | `9601b010-2254-462c-96d2-611f1a841606` |
| ESTAMPA DEL SUR | `ffe25be4-6555-4361-bef6-66ba1865a4ab` |
| FEDERICO Y MIGUEL | `6c9fd5dd-b7f4-480b-b5e3-5050e14c3ea9` |
| LA MILINGA | `183fb077-9792-4b7a-9a48-c03b4b855c11` |
| LA MORALEJA | `3939906a-274c-4b00-851e-6f6082264cc6` |
| LA PICHI | `1203cd63-3e3e-468d-8122-e6cd01fdc210` |
| LAGUNA VERDE | `ad843a30-85a3-4e1b-9bda-a4b033dd0525` |
| LOS CATACHOS | `b367d3f2-0ab4-4798-952c-ef6c52f25a1e` |
| LOS CUERVOS | `cd3b542d-0ffc-40f4-ae75-01ff7d529e4d` |
| LOS EDUCADITOS | `bf6a733d-0715-40a3-9d80-43f36d931cec` |
| LOS MELLI | `b966c4c1-caab-4214-95b8-04d04706c7e4` |
| LOS MONCHITOS | `12b4be54-9474-4a26-ae26-fe37fb5db254` |
| LOS MORENITOS | `744b754e-c7f4-4a6f-ae73-86f145c51919` |
| LOS URONES | `380bb7cb-aac3-48a7-974a-328daf47859b` |
| LUNA ROJA | `76b94f03-4d49-448f-9dbd-883c128d8123` |
| MAR DEL TUYU | `42c319e8-24c9-4e2d-81d2-c2760caebf58` |
| MARTIN Y NICOLAS | `4bccbabd-b1ac-4705-b9b6-c080d3251ada` |
| MELINA A | `d8a352fd-7956-4f5e-b3d6-c7d3e24fc6d0` |
| MI MARTINCITO | `e8cdec74-31c6-4ba8-bd91-4ca3f2585141` |
| NEGRO T | `042a60f5-38eb-431c-aeb3-0ea58fa18fc4` |
| NUEVO MUNDO | `4544facf-fd79-42aa-acd1-1d6737a7f577` |
| RD NECOCHEA | `b8ad9e70-d2ce-45a4-a449-210c5d0e0908` |
| SANTOS VEGA | `04781a9f-6841-43ae-97ee-7333a9b09407` |
| TIAN Y ROMA | `400372be-fdc5-47bc-99e6-7d74ae8f5eff` |

Son nombres de caballeriza, no de personas: no es PII, va al repo.

**PARADA. B4 (idempotencia) espera aprobación — no se corrió.**

---

## B3-bis · Re-confirmación pedida: `documento_nro` de las 40 filas de `caballeriza_responsables`

Contado de nuevo contra la base, no de memoria:

```sql
SELECT count(*) AS cr_prov_total,
       count(*) FILTER (WHERE cr.documento_nro IS NULL)     AS doc_nro_null,
       count(*) FILTER (WHERE cr.documento_nro IS NOT NULL) AS doc_nro_no_null
FROM caballeriza_responsables cr
JOIN propietarios p ON p.id = cr.propietario_id
WHERE p.notas LIKE 'provisorio R8%';
```

```
cr_prov_total   = 40
doc_nro_null    = 40
doc_nro_no_null = 0      ← ninguna con documento
```

**`trg_cab_resp_set_propietario` no pisó nada.** Con `documento_nro` NULL en las 40, su
guard (`rol='propietario' AND documento_nro IS NOT NULL`) nunca se cumple.

Control por el otro lado — todas las filas `rol='propietario'` de las 57 caballerizas de R8,
no sólo las nuestras:

```
cr_rol_prop_en_cab_de_r8 = 57
  con_documento          = 17   ← las 17 preexistentes, cargadas a mano con DNI
  apuntan_a_no_provisorio= 17   ← las mismas 17
  sin_propietario_id     = 0
```

57 = **40 nuestras** (sin documento, apuntando a un provisorio) + **17 preexistentes**
(con documento, apuntando a un propietario real). Cierra con B1: de 57 caballerizas, 40 no
tenían fila y 17 sí. **Ninguna caballeriza quedó con dos filas de propietario.**

---

## B4 🔴 · Idempotencia — HECHO, 0 filas, criterio cumplido

Segunda corrida de la sentencia de B3, **idéntica, sin cambiar un carácter**.

Resultado: **0 filas insertadas en las dos tablas.**

| | después de B3 | después de B4 | delta |
|---|---|---|---|
| `propietarios` (total) | 260 | 260 | **0** |
| `propietarios` con marca | 40 | 40 | **0** |
| `caballeriza_responsables` (total) | 259 | 259 | **0** |
| `caballeriza_responsables` de un provisorio | 40 | 40 | **0** |

```
instantes_created_at = 1                                  ← un solo lote, no dos
ultimo_created_at    = 2026-08-18 16:16:40.270291+00      ← el de B3, sin cambios
```

`count(DISTINCT created_at) = 1` es la prueba fina: si B4 hubiera insertado y algo hubiera
borrado la diferencia, habría dos instantes. Hay uno, y es el de B3.

### Qué candado frenó

El primero de los tres, el `NOT EXISTS` de la CTE `falta`:

```
falta_ahora = 0
```

Las 40 caballerizas ya tienen su fila en `caballeriza_responsables` con `rol='propietario'`,
así que `falta` devuelve el conjunto vacío y **ninguno de los dos INSERT recibe una sola
fila candidata**. Los otros dos candados (el `NOT EXISTS` contra `propietarios` por
nombre+marca, y el `LATERAL ... LIMIT 1` que reusa el provisorio existente) no llegaron a
evaluarse porque no hacía falta: cortó antes. Están sin ejercitar, no fallados.

**PARADA. B5 (STOP de duplicados) espera aprobación — no se corrió.**

---

## B3-ter · `documento_nro` de los provisorios — query textual pedida

Corrida tal cual, sin reescribir:

```sql
SELECT count(*) FROM caballeriza_responsables
WHERE documento_nro IS NOT NULL
  AND propietario_id IN (SELECT id FROM propietarios
                         WHERE notas LIKE 'provisorio R8%');
```

```
count = 0      ← CRITERIO: 0. CUMPLE.
```

**El trigger no pisó ningún `propietario_id` y no hay propietarios creados en paralelo.**
Control complementario, por si hubiera una fila repuntada a un propietario sin la marca:

```
propietarios creados hoy sin la marca 'provisorio R8%' = 0
```

Las 40 filas siguen apuntando a los 40 provisorios que insertó B3, y no existe ningún
propietario nuevo por fuera de esos 40.

---

## B5 · STOP de duplicados — HECHO, 0 filas, criterio cumplido

Read-only. Query del runbook sin modificar.

```
0 filas
```

**CRITERIO: 0 filas. CUMPLE. El STOP no se activó.** Ninguna caballeriza de R8 tiene dos
filas de propietario activas, así que no hay ambigüedad para el `LIMIT 1` sin `ORDER BY`
de `fn_inscripcion_set_propietario`: el titular que va a elegir B6 es único y determinado.

Distribución completa, para que se vea que el 0 es por unicidad y no porque falte gente:

```
cab_r8              = 57
con_exactamente_una = 57      ← las 57, una sola fila de propietario activa
con_ninguna         = 0
```

57 = 57. No hay caballeriza con dos, ni caballeriza sin ninguna. Es el estado que B6
necesita.

**PARADA. B6 (re-derivación sobre `inscripciones`) espera aprobación aparte — no se corrió.**

---

## B6 🔴 · Re-derivación sobre `inscripciones` — HECHO, 49 filas, criterio cumplido

UPDATE del runbook sin cambios (Plan A `408dc07` §1.3). `DISTINCT ON (caballeriza_id)`
ordenado por `created_at NULLS LAST, id`, filtrado a `propietario_id IS NULL` +
`estado='ratificado'` + carreras de R8.

**Filas actualizadas = 49.** Coincide con el `sin_prop` medido en B1.

El número no sale del cliente (el MCP no devuelve el rowcount del UPDATE): se midió
**contra el snapshot de B2**, fila por fila, que además es el único control que distingue
"actualizada" de "ya estaba":

```sql
SELECT ... FROM bak_r8_propietario b JOIN inscripciones i ON i.id = b.inscripcion_id;
```

```
filas_snapshot         = 67
actualizadas           = 49    ← estaban NULL en la foto, ahora tienen propietario
preexistentes_intactas = 18    ← tenían propietario, quedaron con EL MISMO
preexistentes_pisadas  = 0     ← ninguna de las 18 cambió de titular
siguen_null            = 0
caballeriza_cambiada   = 0     ← el UPDATE no tocó otra columna
otros_campos_cambiados = 0     ← spc_id y carrera_id idénticos a la foto
```

49 + 18 = 67. **Las 18 que ya tenían propietario cargado a mano no se tocaron.** Eso era lo
que había que proteger: el UPDATE sólo entra donde `propietario_id IS NULL`.

## B7 · Verificación 67 / 67 / 0 — CUMPLE

```
ratificados     = 67
con_propietario = 67
sin_propietario = 0      ← CRITERIO: 0. CUMPLE.
```

**B7-bis no se corrió: no hace falta, no hay filas sin propietario que explicar.**

### Composición del resultado

```
con propietario provisorio = 49
con propietario real       = 18
propietarios distintos     = 57   (40 provisorios + 17 reales)
```

Los 18 reales son 17 propietarios distintos: uno tiene dos ejemplares en la reunión. Los 49
provisorios cuelgan de los 40 creados en B3, porque 8 caballerizas corren más de un caballo.

**Toda ratificada de R8 tiene titular.** El 70% del propietario y el bono 6°-8° ya tienen a
quién liquidarse — pero **las liquidaciones todavía no lo reflejan**: son las viejas, de
antes de este backfill. Eso lo arregla B10.

**PARADA. B8 y B9 esperan aprobación. B9 es STOP: las fotos de lo comprometido (línea
pagada, retenidas, conteo de propietario) van ANTES del recálculo.**

---

## B9 · STOP — fotos de lo comprometido (read-only). TODOS LOS CRITERIOS CUMPLEN

Read-only, 6 SELECT. Es el registro contra el que compara B11.

### B9.1 · Línea pagada — 1 fila, idéntica a la tabla del runbook

| campo | valor |
|---|---|
| `id` | `28b05448-7983-46bb-94ff-213996dbeb82` |
| `concepto` | `Carrera 1 — 5° puesto` |
| `monto_neto` | **70000.00** |
| `estado_linea` | `pagado` |
| `recibo_id` | `77774e4d-6e5a-4015-9466-76fec012e212` |
| `numero_recibo` | **1** |
| `neto_a_cobrar` | 70000.00 |
| `beneficiario_tipo` | `propietario` |
| `beneficiario_id` | `37fa6583-08bb-47ca-9923-bbe746c88537` (QUINTEROS, CARLA ELISABETH) |
| `concepto_tipo` / `posicion` | `premio` / `5` |
| `inscripcion_id` | `6b74ddec-4f93-49e4-b303-b0f8ff33c526` (LINDA MAIPUENSE) |
| `liquidacion_id` | `30f70863-19df-412c-9d8e-80bc0e9bdd5b` |

**Criterio: exactamente 1 fila. CUMPLE.** Es la única línea pagada o con recibo de toda la
reunión.

### B9.2 · Clave reproducible — CUMPLE

```
guardado    = 'Carrera 1 — 5° puesto'
regeneraria = 'Carrera 1 — 5° puesto'
coincide    = true
benef_ok    = true
```

El motor va a regenerar el mismo `concepto`, así que el `lineKey` coincide y la línea pagada
se **preserva**, no se duplica. `benef_ok = true`: el `propietario_id` de la inscripción
sigue siendo el beneficiario de la línea — **B6 no tocó a QUINTEROS** (era una de las 18 que
ya tenían titular).

### B9.3 · Conteo de propietario ANTES del recálculo

| concepto_tipo | estado_linea | líneas | neto |
|---|---|---|---|
| premio | impago | 3 | $364.000,00 |
| premio | pagado | 1 | $70.000,00 |
| premio | retenido | 4 | $1.528.438,33 |
| **premio — total** | | **8** | **$1.962.438,33** |
| bono | impago | 4 | $400.000,00 |
| **bono — total** | | **4** | **$400.000,00** |
| **TOTAL PROPIETARIO** | | **12** | **$2.362.438,33** |

Idéntico a lo medido el 18/08 en el runbook. **12 líneas de propietario sobre 67 ratificadas
con titular** — ésa es la desproporción que B10 corrige: las liquidaciones son de antes del
backfill.

Contexto de la reunión, para comparar en B11:

```
liquidaciones = 69
líneas        = 170
neto total    = $6.429.081,99
  de propietario = 12 líneas
recibos involucrados = 1
```

### B9.4 · Las 28 retenidas por anti-doping

**Criterio: 28 retenidas y `fecha_liberacion` única = 2026-09-15. CUMPLE** — las 28 con
`2026-09-15`, sin excepción.

| beneficiario | 1° | 2° | total |
|---|---|---|---|
| profesional | 12 · $1.356.200,00 | 12 · $381.963,32 | 24 · $1.738.163,32 |
| propietario | 2 · $1.246.700,00 | 2 · $281.738,33 | 4 · $1.528.438,33 |
| **total** | **14 · $2.602.900,00** | **14 · $663.701,65** | **28 · $3.266.601,65** |

#### Las 4 de propietario, nominales

| id | propietario | ejemplar | concepto | monto |
|---|---|---|---|---|
| `5d38a098-7370-4d2d-8883-f1e9f0ab1e6f` | ALDAY, RAMIRO EMILIO | ELSEPTIMOESDECALDERA | Carrera 1 — 1° puesto | $602.000,00 |
| `9390b559-6f34-4765-a25c-71ee8f4c453f` | DIESTRA, CAMILA AYLEN | DESDEN | Carrera 7 — 1° puesto | $644.700,00 |
| `ec96c1e7-f3ef-48d5-9b9d-c89831fd6057` | DIAZ, CARLOS RODOLFO | BABY PARADISE | Carrera 3 — 2° puesto | $133.000,00 |
| `1f84b3b0-c0b9-40bc-a937-859a28f1b0b1` | PEREYRA, ROBERTO CARLOS | VISION SECURITY | Carrera 7 — 2° puesto | $148.738,33 |

**Las 4 tienen `notas = NULL`: son propietarios reales, ninguno es provisorio.** La plata
retenida de propietario ya está a nombre de personas de verdad, y B6 no las tocó — son de
las 18 preexistentes.

#### Las 24 de profesional

| id | concepto | pos | monto |
|---|---|---|---|
| `275ca462-27de-47ac-91b6-0086746434ac` | Carrera 1 — 1° puesto | 1 | $86.000,00 |
| `f9a908f1-262f-4e41-8bca-36a29933eb55` | Carrera 1 — 1° puesto | 1 | $86.000,00 |
| `f6587d57-5690-4211-a57d-cb68498908de` | Carrera 2 — 1° puesto | 1 | $105.000,00 |
| `a9788cc5-823b-4fa8-a450-ff35f06e3397` | Carrera 2 — 1° puesto | 1 | $105.000,00 |
| `c49c2ab3-3573-4a5c-8613-f1a1198133a2` | Carrera 3 — 1° puesto | 1 | $85.000,00 |
| `18d77997-b5fb-47fc-9a0d-86ae660f3b24` | Carrera 3 — 1° puesto | 1 | $85.000,00 |
| `ac2c42ac-cce5-488c-88fa-ba721a44b43e` | Carrera 5 — 1° puesto | 1 | $200.000,00 |
| `3ed3349f-e712-4145-a13b-3e81f812ebb8` | Carrera 5 — 1° puesto | 1 | $200.000,00 |
| `4fb4c966-f6ba-400e-8be0-82795fe67b2d` | Carrera 6 — 1° puesto | 1 | $110.000,00 |
| `354ae702-91a0-467c-9241-c4270e2d0acd` | Carrera 6 — 1° puesto | 1 | $110.000,00 |
| `6eb1a7da-950a-457e-b0dc-4c52646ab307` | Carrera 7 — 1° puesto | 1 | $92.100,00 |
| `25605559-65da-4e50-ac66-7b679d84dabb` | Carrera 7 — 1° puesto | 1 | $92.100,00 |
| `c1810dc8-88a4-4d2d-92e2-ebb889fcf13c` | Carrera 1 — 2° puesto | 2 | $19.316,67 |
| `a500e7e9-3c1c-47f6-8f9c-7ba7b7b6f0c3` | Carrera 1 — 2° puesto | 2 | $19.316,67 |
| `c326047e-cc9f-4286-83ab-0cb3763eb78a` | Carrera 2 — 2° puesto | 2 | $33.250,00 |
| `ecf53204-f006-474d-b005-616ce5f63de7` | Carrera 2 — 2° puesto | 2 | $33.250,00 |
| `8e2f6aa3-399d-476c-ba2d-7f5d5cb028e6` | Carrera 3 — 2° puesto | 2 | $19.000,00 |
| `96032a68-2a5d-4f49-b71a-bf50a7b60177` | Carrera 3 — 2° puesto | 2 | $19.000,00 |
| `f5a9398c-a0e1-45d6-9232-f7d1f17f7914` | Carrera 5 — 2° puesto | 2 | $63.333,33 |
| `acc89845-9bec-4fa5-ac06-c956e72c6c9a` | Carrera 5 — 2° puesto | 2 | $63.333,33 |
| `734a93ba-9f63-448a-bdee-161cdb2144c8` | Carrera 6 — 2° puesto | 2 | $34.833,33 |
| `4d625652-ffc3-413a-badc-4d678f5d7feb` | Carrera 6 — 2° puesto | 2 | $34.833,33 |
| `04bd7d0c-e424-4e2d-8b99-22f2d740cd7a` | Carrera 7 — 2° puesto | 2 | $21.248,33 |
| `cd1a4e37-d2f9-47d3-b0e9-c1b5525c7136` | Carrera 7 — 2° puesto | 2 | $21.248,33 |

Van de a pares (entrenador + jockey por ejemplar), sobre 6 carreras: 1, 2, 3, 5, 6 y 7. Son
las 6 oficializadas.

⚠️ Recordatorio de la revisión 18/08: **estos 28 `id` NO van a existir después de B10.** El
motor borra y regenera las `retenido` (el DELETE sólo excluye `pagado` y `recibo_id NOT
NULL`). Por eso B11.4 compara por **clave lógica** —
`beneficiario_id` + `inscripcion_id` + `posicion` + `concepto_tipo` — y no por `id`. Los `id`
de arriba sirven para **probar** que fueron reemplazadas, no para exigir que sobrevivan.

#### Control complementario — ninguna liberada a mano

```
posición 1 · retenido = 14
posición 2 · retenido = 14
```

**Criterio: todo 1° y 2° de premio en `retenido`, ninguna en `impago`. CUMPLE.** No hay
`impago` en ninguna de las dos posiciones: nadie corrió `liberar_linea` antes del recálculo,
así que B10 no va a revertir en silencio ninguna liberación deliberada.

**PARADA. B10 (recálculo) espera aprobación con estas fotos a la vista.**

---

## B10 🔴 · Recálculo de las liquidaciones — HECHO

### Cómo se corrió (no fue el botón)

El runbook dice *"no es SQL, lo hace una persona por pantalla"*. **No se apretó el botón**:
se ejecutó el **mismo motor** en un harness node, patrón real-code ya usado en
`tests/probe_oficializar_carrera.mjs`.

```js
// tmp/b10_recalcular_r8.mjs (no commiteado)
new Function(readFileSync('liquidaciones-engine.js', 'utf8'))();   // mismo texto que sirve prod
await globalThis.generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: R8 });
```

Es la misma llamada que hace `liquidaciones.html:985`. `liqConfig` se omite a propósito: el
motor lo carga con la **misma query** que hace la página (`liquidacion_config`, `club_id`,
`activo=true`, `maybeSingle`), así que el resultado es idéntico.

**Diferencia real, para que quede escrita:** el harness usa la `SUPABASE_SECRET_KEY`, que
**pasa por encima de RLS**; el botón corre con la sesión de Valeria. Los escritos son los
mismos — el motor no consulta el usuario — pero no es literalmente el mismo camino de
permisos.

### Resultado

```
RESULTADO: {"created":25,"headers":94,"preserved":1}   ·   126.598 ms (2m 7s)
líneas ANTES:   170
líneas DESPUÉS: 199
```

⚠️ **`created: 25` NO son líneas: son headers.** En el motor, `created++` está en la línea
349, justo después del `insert` en **`liquidaciones`**, no en `liquidacion_detalle`. O sea:
se crearon **25 liquidaciones nuevas** (69 → 94). `headers: 94` es el total de headers
recomputados, y `preserved: 1` es la línea pagada de QUINTEROS.

### Estado de la reunión, antes y después

| | antes | después |
|---|---|---|
| liquidaciones (headers) | 69 | **94** (+25) |
| líneas de detalle | 170 | **199** (+29) |
| neto total | $6.429.081,99 | **$13.015.055,32** (+$6.585.973,33) |
| líneas de propietario | 12 | **41** |
| retenidas | 28 | **36** |
| pagadas | 1 | **1** |

El neto **se duplica**: los $6,58 M que aparecen son el 70% del propietario y los bonos 6°-8°
que antes no se generaban porque las inscripciones no tenían titular. Es exactamente lo que
el backfill venía a habilitar.

**PARADA. Las verificaciones de B11 se corren de a una, aprobadas por separado. Ninguna se
corrió todavía.**

---

## B11 · Verificación post-recálculo — LAS CUATRO CUMPLEN

### B11.1 · La línea pagada quedó idéntica — CUMPLE

Misma query de B9.1. **1 fila, campo por campo igual a la foto:**

| campo | B9.1 (antes) | B11.1 (después) | |
|---|---|---|---|
| `id` | `28b05448-7983-46bb-94ff-213996dbeb82` | `28b05448-7983-46bb-94ff-213996dbeb82` | **= mismo id** |
| `monto_neto` | 70000.00 | 70000.00 | = |
| `estado_linea` | pagado | pagado | = |
| `recibo_id` | `77774e4d-…-76fec012e212` | `77774e4d-…-76fec012e212` | = |
| `numero_recibo` | 1 | 1 | = |
| `beneficiario_id` | `37fa6583-…-bbe746c88537` | `37fa6583-…-bbe746c88537` | = |
| `liquidacion_id` | `30f70863-…-80bc0e9bdd5b` | `30f70863-…-80bc0e9bdd5b` | = |

**El `id` no cambió: la fila no se borró ni se recreó, se preservó.** Es la prueba dura que
pedía el runbook.

Controles agregados:

```
líneas pagadas = 1 · total = $70.000,00        ← CUMPLE (idéntico a B9.1)
recibo 1 · neto_a_cobrar 70000.00 · lineas_vivas = 1   ← CUMPLE (≥ 1, no quedó huérfano)
```

### B11.2 · Nada se duplicó — CUMPLE

```
0 filas
```

Agrupando por la clave completa (`beneficiario_tipo`, `beneficiario_id`, `concepto_tipo`,
`inscripcion_id`, `posicion`, `concepto`), ninguna combinación aparece más de una vez en las
199 líneas. **El recálculo no duplicó nada, ni siquiera la línea pagada** — que era el riesgo
que B9.2 vigilaba.

### B11.3 · Propietario 12 → 41 — CUMPLE

| concepto_tipo | estado | líneas | neto |
|---|---|---|---|
| premio | impago | 17 | $1.694.840,00 |
| premio | pagado | 1 | $70.000,00 |
| premio | retenido | 12 | $6.083.571,66 |
| **premio — total** | | **30** | **$7.848.411,66** |
| bono | impago | 11 | $1.100.000,00 |
| **bono — total** | | **11** | **$1.100.000,00** |
| **TOTAL PROPIETARIO** | | **41** | **$8.948.411,66** |

| | antes | esperado | medido | |
|---|---|---|---|---|
| líneas premio | 8 | 30 | **30** | ✅ |
| líneas bono | 4 | 11 | **11** | ✅ |
| total líneas | 12 | 41 | **41** | ✅ |
| neto propietario | $2.362.438,33 | ≈ $8.948.411,64 | **$8.948.411,66** | ✅ |
| **delta** | | **+$6.585.973,31** | **+$6.585.973,33** | ✅ |

Los 2 centavos de diferencia son del redondeo de la estimación del runbook, no de la base.
**El criterio de halt era el monto y cierra.**

Control grueso de la reunión:

```
liquidaciones = 94 · neto = $13.015.055,32     (esperado ≈ $13.015.055,30)
```

### B11.4 · Las retenidas siguen retenidas — CUMPLE

Por clave lógica (`beneficiario_id` + `inscripcion_id` + `posicion` + `concepto_tipo`), **las
4 fotografiadas en B9.4 están las 4**:

| propietario | pos | monto antes | monto después | estado | fecha_lib | id |
|---|---|---|---|---|---|---|
| ALDAY, RAMIRO EMILIO | 1 | 602.000,00 | **602.000,00** | retenido | 2026-09-15 | `6bb39db0-…` ≠ |
| DIESTRA, CAMILA AYLEN | 1 | 644.700,00 | **644.700,00** | retenido | 2026-09-15 | `db8a22af-…` ≠ |
| DIAZ, CARLOS RODOLFO | 2 | 133.000,00 | **133.000,00** | retenido | 2026-09-15 | `4612f8b8-…` ≠ |
| PEREYRA, ROBERTO CARLOS | 2 | 148.738,33 | **148.738,33** | retenido | 2026-09-15 | `5d7f27e5-…` ≠ |

Ninguna NULL, las 4 `retenido`, montos exactos, `fecha_liberacion` intacta. Los 4 `id` son
**distintos** de los de B9.4 — **exactamente lo previsto**: fueron reemplazadas, no mutadas.

Ningún 1°/2° quedó pagable:

```
posición 1 · retenido = 18
posición 2 · retenido = 18
```

**0 filas en `impago` en las posiciones 1 y 2. CUMPLE.**

### El delta 28 → 36, verificado (no deducido)

| beneficiario | pos | antes | después | delta |
|---|---|---|---|---|
| profesional | 1 | 12 · $1.356.200,00 | 12 · $1.356.200,00 | **0** |
| profesional | 2 | 12 · $381.963,32 | 12 · $381.963,32 | **0** |
| propietario | 1 | 2 · $1.246.700,00 | **6** · $4.746.700,00 | **+4** |
| propietario | 2 | 2 · $281.738,33 | **6** · $1.336.871,66 | **+4** |
| **total** | | **28 · $3.266.601,65** | **36 · $7.821.734,98** | **+8** |

**Las 24 de profesional no se movieron ni un centavo.** Los 8 nuevos son todos de
propietario, +4 en cada posición. Y son nominalmente los que no existían antes:

| pos | propietario | provisorio | ejemplar | concepto | monto |
|---|---|---|---|---|---|
| 1 | ALDAY, RAMIRO EMILIO | no | ELSEPTIMOESDECALDERA | C1 — 1° | $602.000,00 |
| 1 | **ABUELO FLORO** | **sí** | IDALIA MARO | C2 — 1° | $735.000,00 |
| 1 | **LOS CUERVOS** | **sí** | DESTINADO JOHAN | C3 — 1° | $595.000,00 |
| 1 | **MELINA A** | **sí** | CHINITA SALTEÑA | C5 — 1° | $1.400.000,00 |
| 1 | **EMI** | **sí** | REINA EDITION | C6 — 1° | $770.000,00 |
| 1 | DIESTRA, CAMILA AYLEN | no | DESDEN | C7 — 1° | $644.700,00 |
| 2 | **RD NECOCHEA** | **sí** | LOCA DUBAI | C1 — 2° | $135.216,67 |
| 2 | **El linye y Rami** | **sí** | DE BELLOSO | C2 — 2° | $232.750,00 |
| 2 | DIAZ, CARLOS RODOLFO | no | BABY PARADISE | C3 — 2° | $133.000,00 |
| 2 | **EL COLORADO** | **sí** | WISLA KEN | C5 — 2° | $443.333,33 |
| 2 | **CRAZY HORSE** | **sí** | EL GRAN HECTOR | C6 — 2° | $243.833,33 |
| 2 | PEREYRA, ROBERTO CARLOS | no | VISION SECURITY | C7 — 2° | $148.738,33 |

**4 reales (las de B9.4) + 8 provisorios = 12.** El delta son exactamente las líneas de
propietario de 1° y 2° de las carreras cuyos ejemplares no tenían titular hasta hoy:
C2, C3, C5 y C6 en 1°; C1, C2, C5 y C6 en 2°.

> ⚠️ **Para tener presente, no es un fallo de la verificación:** de los $6.083.571,66
> retenidos de propietario, **$4.555.133,33 quedan a nombre de provisorios** — personas
> jurídicas creadas hoy con el nombre de la caballeriza, sin documento. La plata está
> **retenida hasta el 2026-09-15**, así que hay casi un mes para que Yesi y Fede pongan el
> titular real antes de que sea pagable. `El linye y Rami` es una de ellas ($232.750,00 por
> DE BELLOSO, 2° de la Carrera 2).

---

## Estado de la operación

Todos los bloques corridos y verificados: **B0 · B1 · B2 · B3 · B4 · B5 · B6 · B7 · B9 · B10 ·
B11**. Ningún criterio falló, ningún STOP se activó, **no hizo falta rollback**.

Escrituras totales: 1 `CREATE TABLE` + 40 `propietarios` + 40 `caballeriza_responsables` +
49 `inscripciones` + el recálculo (69 → 94 headers, 170 → 199 líneas).

**B8 quedó sin correr** (controles de que no se tocó nada de más). Su cobertura quedó
absorbida por el cotejo contra el snapshot en B6 —`preexistentes_pisadas = 0`,
`caballeriza_cambiada = 0`, `otros_campos_cambiados = 0`— pero **no es lo mismo**: B8 mira
fuera de R8, y eso no se verificó.

---

## B8 · Controles de que no se tocó nada de más (read-only) — corrido al final

Se corrió **después** de B11, fuera de orden, porque mira **fuera de R8** y esa cobertura no
la daba el cotejo contra el snapshot de B6.

### Los tres controles del runbook

**1) Ninguna de las que ya estaban resueltas cambió de dueño**

```
0 filas      ← CRITERIO: 0. CUMPLE.
```

**3) Nada fuera de R8**

```
spcs        = 183     ← CUMPLE (igual que en el guard B0)
provisorios = 40      ← CUMPLE (= N)
insc_9999   = 17      ← CUMPLE (sin cambios; la reunión de prueba no se tocó)
```

### Los cuatro controles pedidos

**a) Inscripciones de otras reuniones** — por `updated_at`, la única reunión con filas
modificadas durante la operación:

| reunión | fecha | tocadas | total |
|---|---|---|---|
| **8** | 2026-08-16 | **49** | 106 |

**Ninguna otra reunión aparece.** 49 = las de B6, exactas. Dentro de la propia R8, 57 de las
106 quedaron sin tocar (las no ratificadas y las que ya tenían titular).

**b) Propietarios preexistentes de Dolores — intactos**

```
propietarios de Dolores        = 253
  provisorios nuevos           =  40
  preexistentes                = 213   ← CUMPLE
  preexistentes modificados hoy =  0
  preexistentes creados hoy     =  0
```

253 = 213 + 40. **Los 40 son adicionales, no reemplazos**, y ninguno de los 213 tiene
`updated_at` dentro de la ventana de la operación.

*(El "220" de la medición previa a B3 era el total de la tabla, todos los clubes; los de
Dolores eran 213. No es una discrepancia, son dos recortes distintos.)*

**c) `club_secuencias` — no se movió**

```
club_id 0649e9c5… · tipo 'recibo' · ultimo_numero = 1
```

Sigue en **1**, el recibo de QUINTEROS. El recálculo no emite recibos y no tocó el
contador. Recibos del club: 3, el último creado el **16/08 18:46**, antes de la operación.
Ninguno nuevo.

**d) Liquidaciones de R6 y anteriores — VER LA OBSERVACIÓN, no da limpio del todo**

| reunión | fecha | liquidaciones | creadas en la operación | líneas | neto |
|---|---|---|---|---|---|
| 6 | 2026-06-20 | 86 | **0** | 192 | $7.734.232,01 |
| 8 | 2026-08-16 | 94 | 25 | 199 | $13.015.055,32 |
| 9999 | 2099-01-01 | 10 | **0** | 76 | $2.027.840,00 |

**Creadas durante la operación: sólo las 25 de R8.** Ni R6 ni la 9999 tienen una sola
liquidación creada hoy.

> ### ⚠️ Observación abierta — los números de R6 no coinciden con los de esta mañana
>
> `docs/COTEJO_R6.md` (`ebada94`, corrido hoy más temprano) registró para R6:
> **79 liquidaciones · 203 líneas · $7.438.067,84**.
> Ahora mismo R6 mide: **86 headers (74 con líneas) · 192 líneas · $7.410.576,18**.
>
> Diferencia: **−11 líneas y −$27.491,66**.
>
> **La operación de hoy no pudo causarlo**, y esto sí es demostrable: el motor lee sus
> headers con `.eq('reunion_id', rid).eq('club_id', clubId)` (`liquidaciones-engine.js:259`)
> y borra con `.in('liquidacion_id', allHeaderIds)` (línea 284-289) sobre **esa** lista. Con
> `rid` = R8, el DELETE no puede alcanzar una línea de R6.
>
> **Lo que NO se puede probar por timestamp:** `liquidacion_detalle` no tiene `created_at`
> ni `updated_at`. Y el `created_at` de los headers de R6 (último: **15/08 01:51**) tampoco
> sirve como prueba: un recálculo de R6 **reusaría** los headers existentes y sólo borraría e
> insertaría líneas, sin tocar el `created_at` de ninguno.
>
> Quedan dos explicaciones posibles y no distinguí cuál es:
> 1. las cifras del cotejo de esta mañana se midieron con otro recorte (no dejé la query en
>    el doc, sólo el resultado), o
> 2. alguien recalculó R6 entre esta mañana y ahora.
>
> **No es un hallazgo de esta operación ni la bloquea**, pero queda anotado sin resolver.
> Se cierra midiendo R6 de nuevo y comparando contra `docs/COTEJO_R6.md`.

### Resumen de B8

Los tres criterios del runbook **cumplen**. De los cuatro pedidos, **tres cumplen** (a, b, c)
y el cuarto (d) confirma que **la operación no creó nada fuera de R8**, con la observación de
arriba abierta sobre R6.
