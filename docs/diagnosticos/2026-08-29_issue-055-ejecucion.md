# ISSUE-055 — ejecución: arreglo de restore, recibo fantasma, migración y probe

| | |
|---|---|
| **Fecha** | 2026-08-29 |
| **Rama** | `feat/reunion-es-prueba` — `342956e` + `8eb5db0`, pusheada, **SIN MERGEAR** |
| **Base** | `main` @ `323ad85` |
| **Estado** | pasos 1–4 hechos. **Freno en el paso 5 (merge) esperando tu OK** |

## Guards

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) AS spcs_count FROM spcs;
[{"spcs_count":181}]

$ get_project_url
{"url":"https://unlhcuanfrtpatoipwve.supabase.co"}
```

---

## 0. Lo primero: tenías razón sobre la clase de error, y yo me equivoqué en el diagnóstico

Tu lectura era correcta —contar filas no verifica estado— pero el hecho que puse en §0 del informe
anterior estaba mal. **No fueron 11 líneas, fueron 9, y no las dejó `probe_recibo_pie_cobrador`.**

Lo que realmente pasó:

```sql
SELECT r.id, c.nombre AS club, r.numero_recibo, r.profesional_id, r.neto_a_cobrar, r.emitido_at,
       (SELECT count(*) FROM liquidacion_detalle ld WHERE ld.recibo_id=r.id) lineas
FROM recibos r LEFT JOIN clubs c ON c.id=r.club_id ORDER BY r.numero_recibo, r.created_at;
```

| id | club | nº | beneficiario | neto | emitido_at | líneas |
|---|---|---:|---|---:|---|---:|
| `77774e4d-…` | Hipódromo de Dolores | 1 | propietario `37fa6583` | 70.000 | 2026-08-16 18:46 | 1 |
| **`2d89fb7d-…`** | **Mi Club Hípico** | **1** | **profesional `6361df8c`** | **92.000** | **2026-08-28 21:20** | **9** |
| `b2966769-…` | Hipódromo de Dolores | 2 | propietario `42c319e8` | 100.000 | 2026-08-28 12:58 | 1 |
| `003b04c6-…` | Hipódromo de Dolores | 3 | profesional `8c358b73` | 60.000 | 2026-08-28 14:10 | 2 |
| `e9000000-…9001` | Hipódromo de Dolores | 9001 | profesional `7381c730` | 0 | 2026-06-10 02:33 | 2 |
| `e9000000-…9002` | Hipódromo de Dolores | 9002 | propietario `0e0290d7` | 0 | 2026-06-10 02:33 | 2 |

La segunda fila es un **recibo emitido con el `club_id` de Mi Club Hípico cobrando 9 líneas de la
reunión 9999 de Dolores**, a ACHINGO (entrenador **de Dolores**), por $92.000. `emitido_por` es
NULL, así que no hay a quién preguntarle (ISSUE-057).

Mi §0 anterior había leído mal la evidencia por dos razones, las dos mías: agrupé por
`numero_recibo` sin agrupar por club (y hay dos recibos nº 1, en clubes distintos), y atribuí el
faltante al probe porque era la hipótesis cómoda. **Las 4 líneas en `pagado` de los recibos 9001 y
9002 no son residuo de nada**: son el seed del sandbox del 2026-06-10, el bucket "pagado" que el tab
Resumen necesita para poder probarse. Devolverlas a `impago`, como decía tu instrucción sobre las
11, habría roto el sandbox. Toqué 9, no 11.

### Y el número de ISSUE-055 estaba bien

Antes de revertir, la proyección:

```sql
SELECT count(*), sum(monto_neto) FROM liquidacion_detalle
WHERE reunion_id='a0000000-…-9999' AND beneficiario_tipo <> 'club'
  AND (estado_linea='impago' OR recibo_id='2d89fb7d-3cc5-43da-ad26-28a15203f4f9');
```
```
[{"lineas_pagables":36,"total":"488000.00"}]
```

**36 líneas por $488.000,00.** Exactamente lo que dice ISSUE-055. Las 9 líneas estaban impagas
cuando se escribió el issue el 28/08, y el recibo fantasma se las comió a las 21:20 UTC de ese
mismo día — después. Mi "27 / $396.000" medía la base ya contaminada.

**Consecuencia sobre tu respuesta 5**: no actualicé la cifra. Dejé en su lugar una nota explicando
por qué el número parecía mal y por qué no hay que corregirlo. Un issue con el número viejo sería
dato podrido; corregirle un número correcto, también.

---

## 1. Arreglo del restore

### El defecto, en los dos probes

`probe_recibo_pie_cobrador.mjs` cerraba con dos conteos:

```javascript
ok('R1 cleanup: fixtures borradas', !liqFin?.length && !recFin?.length);
ok('R2 cleanup: no quedan líneas huérfanas', !sobra?.length);
```

Y su foto de recibos filtraba por club:

```javascript
const fotoRecibos = async () => new Set((((await sb.from('recibos')
  .select('id').eq('club_id', CLUB_ID)).data) || []).map(r => r.id));
```

Ese `.eq('club_id', CLUB_ID)` es **la razón exacta** por la que el recibo de Mi Club Hípico era
invisible para el probe: aunque hubiera contado recibos correctamente, ese no estaba en la foto.

`probe_recuperacion_monta.mjs` tenía la variante suave. Su restore **sí** es correcto —borra y
reinserta las filas enteras, con `estado_linea` y `recibo_id` adentro— pero la verificación
comparaba **sólo ids**:

```javascript
ok('R1 · restore liquidacion_detalle (mismos ids)',
   JSON.stringify(finalDets.map(d=>d.id).sort()) === JSON.stringify(snapDets.map(d=>d.id).sort()));
```

Ids iguales, estados sin mirar. Correcto por construcción, no por verificación — que es cómo un
restore correcto se convierte en uno roto la próxima vez que alguien lo edita.

### El helper compartido — `tests/lib/estado_lineas.mjs` (nuevo, 86 líneas)

Lo hice compartido y no inline en cada probe justamente porque el punto del arreglo es que la
verificación sea **la misma en todos lados**. Una copia por probe se desalinea sola.

```javascript
export const CAMPOS = ['estado_linea','recibo_id','pagado_at','monto_bruto','monto_descuento',
                       'beneficiario_tipo','beneficiario_id','liquidacion_id','inscripcion_id','carrera_id'];

export async function snapshotLineas(sb, reunionId, campos = CAMPOS)   // id → {campo: valor}
export function       diffLineas(antes, despues, campos = CAMPOS)      // {cambiadas, faltantes, nuevas, limpio}
export async function restaurarLineas(sb, antes, despues, campos)      // devuelve cuántas arregló
export function       describir(v, max = 4)                            // texto para el ok(...)
export async function recibosDesde(sb, desdeISO)                       // SIN filtro de club
```

Tres decisiones que importan:

- **`monto_neto` no está en `CAMPOS`**: es GENERATED, Postgres la recalcula sola (GOTCHA #9).
  Incluirla daría diffs falsos y updates que explotan.
- **`recibosDesde` no filtra por club, a propósito.** Es la lección del recibo fantasma, y está
  comentada en el código para que nadie la "arregle" agregándole el filtro.
- **`restaurarLineas` devuelve un contador y el probe lo assertea aparte.** Que el helper haya
  podido arreglarlo no lo vuelve aceptable: `R3` dice si quedó limpio, `R4` dice si se pisó algo
  ajeno. Son dos preguntas distintas y necesitan dos asserts.

### Los checks nuevos

`probe_recibo_pie_cobrador.mjs`:

```javascript
const T0 = new Date(Date.now() - 1000).toISOString();
const snapAntes = await snapshotLineas(sb, SANDBOX);
// … en el finally, después de borrar las fixtures propias …
const arregladas = await restaurarLineas(sb, snapAntes, await snapshotLineas(sb, SANDBOX));
const verif = diffLineas(snapAntes, await snapshotLineas(sb, SANDBOX));
ok('R3 restore por ESTADO: el sandbox quedó campo por campo como estaba', verif.limpio, describir(verif));
ok('R4 el probe no pisó ninguna línea ajena (0 restauraciones de emergencia)', arregladas === 0);
const recSobra = (await recibosDesde(sb, T0)).filter(r => !recIds.includes(r.id));
ok('R5 no quedó ningún recibo creado durante la corrida, en NINGÚN club', recSobra.length === 0);
```

`probe_recuperacion_monta.mjs`: `R1b` (restore por estado) y `R1c` (0 restauraciones), junto a la
`R1` de ids que se conserva.

**R5 es el check que habría cazado esto el 28/08.**

### Corridas

```
$ node tests/probe_recibo_pie_cobrador.mjs
[snapshot] 76 líneas del sandbox fotografiadas por estado
…
✅ R1 cleanup: fixtures borradas (liquidación, líneas y recibos de prueba)
✅ R2 cleanup: no quedan líneas huérfanas de la liquidación de prueba
✅ R3 restore por ESTADO: el sandbox quedó campo por campo como estaba  (sin diferencias)
✅ R4 el probe no pisó ninguna línea ajena (0 restauraciones de emergencia)  (0 línea(s) hubo que devolver a su estado)
✅ R5 no quedó ningún recibo creado durante la corrida, en NINGÚN club

✅ TODO OK — 56 checks
```

```
$ node tests/probe_recuperacion_monta.mjs
…
✅  R1 · restore liquidacion_detalle (mismos ids) — 76 vs 76
✅  R1b · restore por ESTADO (estado_linea, recibo_id, montos), no sólo por ids — sin diferencias
✅  R1c · no hubo que restaurar nada de emergencia — 0 línea(s) devueltas a su estado
✅  R2 · restore jockeys de inscripciones
✅  R3 · restore estados de resultados

19/19 OK
```

Los dos probes ahora **corren con el restore endurecido y salen limpios**, o sea que el
comportamiento actual era correcto: el daño del 28/08 vino del recibo fantasma, no del probe.

---

## 2. Reversión del recibo fantasma — `migrations/fix_recibo_fantasma_mch.sql` · **APLICADA**

Snapshot previo (las 9 líneas, todas de `liquidacion_id b0000000-…-0004`, el seed del sandbox):

| id | concepto | bruto | estado antes | recibo antes |
|---|---|---:|---|---|
| `88c71919…` | Carrera 1 — 3° puesto | 12.000 | pagado | 2d89fb7d |
| `e59bad0f…` | Carrera 2 — 5° puesto | 10.000 | pagado | 2d89fb7d |
| `6c6a992d…` | Carrera 3 — 5° puesto | 10.000 | pagado | 2d89fb7d |
| `e9a33272…` `7eb5a8ba…` `dfb24b16…` `f09147fd…` `c78b42a5…` `9f5ca0ce…` | Incentivo entrenador ×6 | 10.000 c/u | pagado | 2d89fb7d |

SQL aplicado (con los dos guards `DO $$` adentro de la transacción):

```sql
BEGIN;
UPDATE liquidacion_detalle SET recibo_id=NULL, estado_linea='impago', pagado_at=NULL
 WHERE recibo_id='2d89fb7d-3cc5-43da-ad26-28a15203f4f9';
-- guard: exactamente 9 líneas de 6361df8c devueltas a impago en la 9999
DELETE FROM recibos WHERE id='2d89fb7d-3cc5-43da-ad26-28a15203f4f9';
-- guard: 36 líneas por 488000.00 pagables en la 9999
COMMIT;
```

El archivo lleva el **rollback completo comentado al pie** — reconstruye el recibo con su id, su
timestamp original y las 9 líneas — por si hiciera falta.

Estado después:

```sql
SELECT ld.estado_linea, r.numero_recibo, count(*) n, sum(ld.monto_neto) tot
FROM liquidacion_detalle ld LEFT JOIN recibos r ON r.id=ld.recibo_id
WHERE ld.reunion_id='a0000000-…-9999' GROUP BY 1,2;
```

| estado_linea | recibo | n | total |
|---|---:|---:|---:|
| impago | — | 51 | 553.040,00 |
| pagado | 9001 | 2 | 170.000,00 |
| pagado | 9002 | 2 | 700.000,00 |
| retenido | — | 21 | 604.800,00 |

51 impagas = **36 pagables ($488.000) + 15 del fondo solidario (`beneficiario_tipo='club'`,
$65.040, que Pagos ya excluía)**. Los buckets `pagado` y `retenido` del sandbox, intactos.

Control cruzado en toda la base:

```sql
SELECT count(*) FROM liquidacion_detalle ld
JOIN recibos r ON r.id=ld.recibo_id JOIN liquidaciones l ON l.id=ld.liquidacion_id
WHERE r.club_id <> l.club_id;
```
```
[{"lineas_cross_club":0}]
```

Recibos totales: 5, ninguno de otro club.

**Lo que NO revertí**: `club_secuencias` de Mi Club Hípico quedó en `ultimo_numero=1`. Quemar un
número en un club inactivo es inofensivo y borrar la fila tiene más riesgo que dejarla.

---

## 3. La causa raíz, que sigue abierta — ISSUE-059 y ISSUE-060

Arreglé los datos, no la causa. Son dos agujeros que se encadenan:

**ISSUE-059 — `emitir_recibo` no valida el club de las líneas.**

```sql
UPDATE liquidacion_detalle d
   SET estado_linea='pagado', recibo_id=v_recibo.id, pagado_at=now()
 WHERE d.id = ANY(p_linea_ids)
   AND d.beneficiario_id = p_beneficiario_id
   AND d.recibo_id IS NULL
   AND d.estado_linea = 'impago';
```

Beneficiario sí, impaga sí, sin recibo sí. **Club, no.** El número sale de
`fn_siguiente_recibo(p_club_id)`. El fix es una línea:

```sql
AND EXISTS (SELECT 1 FROM liquidaciones l WHERE l.id=d.liquidacion_id AND l.club_id=p_club_id)
```

No la apliqué: toca la RPC de cobro con Valeria operando y merece su propio probe. Es tuya la
decisión de cuándo.

**ISSUE-060 — `cobrosBuscar` no filtra por `club_id`.** La query no menciona el club en ninguna
parte. Funciona porque en la práctica sólo Dolores tiene liquidaciones, pero `club-switcher.js` deja
al `super_admin` cambiar de hipódromo en 16 páginas y `liquidaciones.html` es una de ellas: parado
en Mi Club Hípico, el tab Pagos sigue listando plata de Dolores. Esa es la mecánica exacta del
recibo fantasma. El fix no es trivial porque `liquidacion_detalle` **no tiene** `club_id` (está en
`liquidaciones`): hay que ir por embed o por lista de `liquidacion_id`, cuidando el NULL-safe
(GOTCHA #5). Por eso no entró acá.

Los dos quedaron documentados con la evidencia completa en `docs/ISSUES.md`.

---

## 4. Migración `es_prueba` — **APLICADA**

`apply_migration('reuniones_es_prueba')` → `{"success":true}`. El guard `DO $$` no abortó.

```sql
SELECT id, numero, fecha, estado, es_prueba FROM reuniones WHERE es_prueba;
```

| id | numero | fecha | estado | es_prueba |
|---|---:|---|---|---|
| `a0000000-0000-0000-0000-000000009999` | 9999 | 2099-01-01 | cancelada | **true** |

```sql
SELECT count(*) total, count(*) FILTER (WHERE es_prueba) marcadas,
       count(*) FILTER (WHERE NOT es_prueba) normales FROM reuniones;
```
```
[{"total_reuniones":14,"marcadas":1,"normales":13}]
```

14 = 13 de Dolores + 1 de Mi Club Hípico. Una sola marcada, la que corresponde.

---

## 5. Probe de ISSUE-055 — **16/16**

Un solo arreglo respecto de lo entregado ayer: el stub de DOM no tenía `scrollIntoView` (ni
`style`/`classList`), que `cobrosDetalle` usa. Ampliado.

```
$ set -a; . ./.env; set +a
$ node tests/probe_reunion_es_prueba.mjs
[fixtures] normal = R8 (publicada) · cancelada = R7

── Probe ISSUE-055 · reuniones.es_prueba fuera del circuito de cobro ──
 ✅ 0a) exactamente 1 reunión marcada es_prueba en toda la base  → [{"id":"a0000000-0000-0000-0000-000000009999","numero":9999,"estado":"cancelada","es_prueba":true}]
 ✅ 0b) la marcada es la 9999 del club de Dolores
 ✅ 0c) el circuito de cobro no filtra por estado='cancelada'
 ✅ 4a) el archivo trae cobVisible y cobCargarReunPrueba (el filtro está conectado)
 ✅ 4b) cobrosDetalle también aplica el filtro (no sólo el listado)
 ✅ A) el beneficiario que sólo tiene plata en la 9999 NO aparece  → 62423e35-81cb-43f2-a572-59bba7226c37
 ✅ B) el beneficiario de la reunión NORMAL aparece  → 6361df8c-179c-4e1b-9846-b589a46a0a2d
 ✅ C) el beneficiario de la reunión CANCELADA aparece (plata legítima de un evento suspendido)  → c34e5c0b-7bcf-45ad-8891-1bd22cda3f0d
 ✅ A2) ninguno de los beneficiarios de la 9999 entra por la puerta del sandbox
 ✅ D) el total del beneficiario mixto es sólo la plata real (no suma la del sandbox)  → real=111111 sandbox=92000
 ✅ D2) la tarjeta del mixto declara 1 línea pagable, no las del sandbox  →
    <div class="liq-header">
      <div><div class="liq-prof">ACHINGO, MAURICIO EZEQUIEL</div><div class="liq-recibo">Profesional · 1 línea(s) pagable(s) · incentivo por reunión</div></div>
 ✅ D3) el detalle del mixto no trae ninguna línea de la 9999 tildada  → ["7b6e003e-22e2-4629-bf55-f18560b1260f"]
 ✅ E) eligiendo la 9999 a mano, sus beneficiarios vuelven a aparecer  → 62423e35-81cb-43f2-a572-59bba7226c37
 ✅ E2) y el detalle vuelve a traer las líneas del sandbox
 ✅ E3) el selector rotula la reunión de prueba (⚗ PRUEBA)
 ✅ R) restore: no quedaron líneas TEST ISSUE-055 en la base  → []

16/16 OK
```

Detalle que vale la pena: el probe eligió como "beneficiario mixto" a **ACHINGO (`6361df8c`)**, que
es el mismo entrenador del recibo fantasma. El check **D** verifica que su tarjeta muestra $111.111
(la fixture de R8) y **no** los $92.000 del sandbox. Es el escenario de septiembre, medido.

Estado de la base después de correr: 9999 con 51 impagas / 2+2 pagadas / 21 retenidas, 5 recibos.
Idéntico a §2. El probe se limpió solo.

---

## 6. Tus respuestas, aplicadas

| # | Decisión | Dónde quedó |
|---|---|---|
| 1 | Rótulo, no exclusión dura | `cobVisible()` en `liquidaciones.html`; `⚗ PRUEBA` en el selector; check E |
| 2 | El RPC no bloquea | No se tocó `emitir_recibo`. El agujero *cross-club* que sí encontré quedó en ISSUE-059, aparte |
| 3 | Contador de `index.html`: dejarlo, anotarlo | **ISSUE-062** |
| 4 | SPC de prueba: issue aparte + a GOTCHAS | **ISSUE-061** + **GOTCHA #75** + nota en el bloque de guards de `CLAUDE.md` |
| 5 | Actualizar ISSUE-055 en el mismo merge | Cerrado en el mismo merge — **con la cifra original**, más la nota de §0 explicando por qué no se corrige |

Sobre la 4: la nota que pediste está en tres lugares porque el guard se usa todos los días y el
GOTCHA solo no lo alcanza. En `CLAUDE.md`, al lado del `SELECT count(*) FROM spcs → 181`:

> ⚠️ El 181 **incluye caballos de prueba**: `spcs` es global sin `club_id` (GOTCHA #13) y los
> ejemplares de test de "Mi Club Hípico" (`Pampa Libre`, `Don Facundo`) suman al conteo. Sirve para
> lo que se usa —detectar proyecto equivocado— pero **no es el padrón real de Dolores**.

---

## 7. Qué quedó en la rama

```
 CLAUDE.md                                   |  15 +-
 docs/GOTCHAS.md                             |  74 +++
 docs/ISSUES.md                              | 173 +++++++-
 liquidaciones.html                          |  40 +-
 migrations/fix_recibo_fantasma_mch.sql      |  76 +++
 migrations/reuniones_es_prueba.sql          |  50 ++
 migrations/rollback_reuniones_es_prueba.sql |  24 +
 tests/README.md                             |  34 +
 tests/lib/estado_lineas.mjs                 |  86 +++
 tests/probe_recibo_pie_cobrador.mjs         |  23 +
 tests/probe_recuperacion_monta.mjs          |  13 +
 tests/probe_reunion_es_prueba.mjs           | 235 +++++++++
 12 files changed, 832 insertions(+), 11 deletions(-)
```

Docs nuevos: ISSUE-058 (restore por conteo), ISSUE-059 (`emitir_recibo` cross-club), ISSUE-060
(`cobrosBuscar` sin club), ISSUE-061 (SPC de prueba), ISSUE-062 (contador). GOTCHAS #75, #76, #77.

---

## 8. Estado de la secuencia

| paso | | |
|---|---|---|
| 1 | Arreglo del restore + 9 líneas devueltas a impago | ✅ hecho, ambos probes verdes |
| 2 | `apply_migration` de `reuniones_es_prueba.sql` | ✅ aplicada, guard OK |
| 3 | Verificar `WHERE es_prueba` → 1 fila | ✅ 1 fila, la 9999 |
| 4 | `probe_reunion_es_prueba.mjs` | ✅ **16/16** |
| 5 | Merge + push + md5 contra `sigh.com.ar` | ⏸️ **esperando tu OK** |
| 6 | Re-correr `probe_pagos_rol_carrera` y `probe_cobros_caballeriza` | ⏸️ después del merge |
| 7 | Cerrar ISSUE-055 | ✅ ya escrito en la rama, entra con el merge |

**El orden que pediste se respetó: la migración está aplicada y el HTML no está en producción.**
Ese es el estado seguro — la columna existe y nadie la usa todavía. El inverso (HTML sin columna)
dejaría el tab Pagos en blanco, y no ocurrió.

---

## 9. Preguntas abiertas

1. **¿Merge ahora?** Todo lo del paso 5 está listo. Con el OK: merge, push, md5, y los dos probes
   de regresión del paso 6.
2. **ISSUE-059 (`emitir_recibo` sin validación de club)** — es una línea de SQL, pero toca la RPC de
   cobro. ¿Va como tarea propia esta semana, antes del 20/09?
3. **ISSUE-060 (`cobrosBuscar` sin `club_id`)** — es el que hace explotable a la 059 desde la UI.
   Mi voto: los dos juntos, en una pasada, con un probe que verifique aislamiento entre clubes.
4. **`emitido_por` NULL (ISSUE-057)** hizo que este recibo no tuviera autor rastreable. Sin eso, el
   próximo incidente tampoco lo va a tener.
