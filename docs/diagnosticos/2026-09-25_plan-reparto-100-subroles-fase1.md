# Reparto al 100 %: peón / capataz / sereno siempre, con el entrenador (18 %) — FASE 1, SOLO LECTURA

- Fecha: 2026-09-25
- Pedido: definición de Fede y Valeria (audios 25/09 11:48). Peón 4 %, capataz 3 % y sereno 1 % se pagan **con el
  entrenador, en su mismo recibo** (lo firma el cuidador), pero **discriminados en el detalle**. El recibo del
  entrenador pasa a ser del **18 %**.
- Código leído: `main` @ `a4ec2adf84c78dbaf4264f7ea561a5653d0dc35f` (`liquidaciones-engine.js`, `liquidaciones.html`,
  `resultados.html`, `inscripciones.html`, `migrations/guard_staff_emitir_recibo.sql`, `migrations/rpc_cambiar_monta.sql`)
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- **Cero escrituras.** Sólo `SELECT` por MCP y el **motor real de `main` corrido en seco**: lecturas contra prod,
  toda escritura (`insert/update/delete/upsert`, y cualquier `rpc`) **capturada en memoria y nunca enviada**. La
  propuesta de cambio se aplicó **al texto del motor en memoria** (`PATCH=subs`), no al archivo. Los md5 de líneas,
  headers e inscripciones de R6, R8 y R9 son idénticos antes y después (§ Verificación).
- Anonimizado: sin nombres de personas. Los caballos son del Stud Book (públicos). Los jockeys y entrenadores no aparecen.
- Reuniones: R6 `b02ca761-6f44-4720-86aa-a3c3099019ea` · R8 `7b6e003e-22e2-4629-bf55-f18560b1260f` · R9 `cafa37d6-89f4-45cb-a0d9-835bc27407e9`.

---

## Resumen (lo que hay que decidir está marcado con ⚖)

| # | Pregunta | Respuesta corta |
|---|---|---|
| 1 | Cambio en el motor | Una línea: `.filter(nombre)` pasa a `.map(nombre o null)`. **Además**, `concepto` pasa a ser **sólo el rol** (`Peón`) y el nombre va a la descripción. Así la clave de dedup no depende del nombre y se cierra ISSUE-092. **Sin entrenador**: hoy se pierden el 10 % **y** el 8 %. Propuesta: bloquear la oficialización sin entrenador, como ya se hace con el jockey. Hoy hay **0** premiados sin entrenador en R6/R8/R9. |
| 2 | Recibo y pantalla con sub-línea sin nombre | Hoy el recibo imprime sólo `concepto` y un "Rol" que para `actuacion` dice **"Profesional"**. Con la propuesta imprimiría `Profesional · Peón` y nada más: ni el %, ni "sin nombre", ni cuánto le toca al entrenador. **Hace falta tocar el recibo**: rol = Peón/Capataz/Sereno, nombre o "(sin nombre)", subtotales 10 % + 8 % = 18 %. |
| 3 | R9 al recalcular | Nacen **69 líneas** (23 caballos × 3), todas "sin nombre", y ninguna otra cosa cambia. Total **$564.096,67** exacto sin redondear; **$564.096,68** redondeando línea por línea (1 centavo, § Q4). De eso: 30 **retenidas** (1°/2°, $447.336,68), 12 **impagas** de entrenadores que todavía no cobraron ($35.440,00) y **27 impagas de 9 caballos cuyos entrenadores YA cobraron** con 8 recibos ($81.320,00). ⚖ Esas 27 **no pueden** ir "en su mismo recibo": el recibo ya está emitido. |
| 4 | R6 + R8 al recalcular | **258 líneas, $3.660.839,36 cobrables**: las 33 de ISSUE-091 ($1.345.823,34; el pedido dice "13 líneas, $895.823", que era la estimación sólo de premios; el dry-run del motor real da 33) más **225 sub-líneas, $2.315.016,02** (R6 105 / $1.174.368,02; R8 120 / $1.140.648,00). De eso, $1.984.425,36 queda retenido pero **liberable ya** (vencieron las fechas) y $1.676.414,00 queda impago, cobrable en el acto. |
| 5 | Protección de saldadas | Recomendada: **marca explícita por reunión** (`reuniones.liquidacion_cerrada_at`) + guard en la base (trigger sobre `liquidacion_detalle`) + corte en el motor. **No** sirven las variantes "por marca REGULARIZACION" ni "por carrera con plata comprometida": **también bloquearían R9**, que es justo donde hay que generar el 8 %. ⚖ Qué hacer con el 8 % retroactivo de R6/R8. |
| 6 | Probe | Diseñado (§ 6). Hallazgo: con redondeo por línea, **"100 % exacto" y "18 % exacto" no se cumplen solos**. En R9, 4 de 23 caballos se van ±1 centavo (en R8, 6 de 40). Hace falta una **regla de residuo**: el propietario absorbe el centavo del 100 % y el 10 % del entrenador absorbe el del 18 %. Con esa regla, los dos asserts son exactos. |

---

## 1. Cambio en el motor

### 1.1 Hoy (`liquidaciones-engine.js`, main)

```js
// :183-188
            const subs = [
              { nombre: insc.peon,    rol: 'Peón',    pct: PCTS.peon },
              { nombre: insc.capataz, rol: 'Capataz', pct: PCTS.capataz },
              { nombre: insc.sereno,  rol: 'Sereno',  pct: PCTS.sereno },
            ].filter(s => s.nombre && s.nombre.trim());
// :317-328 (persistencia de cada sub, colgada del entrenador)
            concepto: `${sub.rol} — ${sub.nombre}`,
            descripcion: `${item.concepto} — A redistribuir (${Math.round(sub.pct * 100)}%)`,
            ... concepto_tipo: 'actuacion', beneficiario_tipo: 'profesional', beneficiario_id: actorId,
            estado_linea: retenido ? 'retenido' : 'impago',
// :37-41 — la clave de dedup incluye el concepto (o sea, hoy, el NOMBRE)
  function lineKey(d) { return [d.beneficiario_tipo, d.beneficiario_id, d.concepto_tipo,
            d.inscripcion_id || '', d.posicion == null ? '' : d.posicion, d.concepto || ''].join('|'); }
```

### 1.2 Propuesta (es exactamente lo que corrió el dry-run con `PATCH=subs`)

```js
            ].map(s => ({ ...s, nombre: (s.nombre || '').trim() || null }));   // siempre las 3
...
            concepto: sub.rol,                                                   // 'Peón' | 'Capataz' | 'Sereno'
            descripcion: `${item.concepto} — ${sub.rol}: ${sub.nombre || '(sin nombre cargado)'} — A redistribuir (${Math.round(sub.pct * 100)}%)`,
```

Por qué `concepto = rol` y no `Peón — (sin nombre)`:
- con el nombre en el `concepto`, **cargar el nombre después** cambia la clave. Si la sub-línea "sin nombre" ya se
  pagó, el recálculo crea otra con el nombre: **doble pago** (ISSUE-092, demostrado en el dry-run del 25/09);
- con `concepto = rol`, la clave es `profesional|<entrenador>|actuacion|<inscripción>|<puesto>|Peón` y no cambia con el
  nombre. Si la línea no está pagada se regenera con el nombre nuevo; si está pagada se preserva y no se duplica;
- las 9 sub-líneas de la 9999 (`Peón — Pedro Peón`, etc.) cambian de clave. En la 9999 no importa (están
  retenidas y sin recibo: se regeneran). En la base **no hay ninguna sub-línea real** (0 fuera de la 9999).

Lo que **no** cambia: el % sale de `liquidacion_config` (4/3/1), la sub-línea se cuelga del entrenador
(`beneficiario_id` = entrenador), y hereda la retención de 1°/2° con la misma `fecha_liberacion`.

### 1.3 Regla de residuo (necesaria para el "100 % exacto", ver § 6)

Hoy cada línea se redondea por separado (la columna es `numeric(…,2)`). Con 6 líneas por caballo, un premio no
redondo (p. ej. $205.833,33) puede dar ±1 centavo. Propuesta, por caballo y sólo sobre líneas **no comprometidas**:

```
P      = r2(premio)
fondo  = r2(2 % P) ; jockey = r2(10 % P) ; peón/capataz/sereno = r2(4 %/3 %/1 % P)
E18    = r2(18 % P)                          → entrenador = E18 − (peón+capataz+sereno)
propietario = P − (fondo + jockey + E18)
```

Con esto Σ = P y entrenador + subs = E18, exactos. Cada línea queda a ≤ 1 centavo de su % teórico. Si una línea del
caballo ya está pagada, no se toca y se aplica el redondeo simple a las demás (el centavo queda donde está).

### 1.4 Caballo sin entrenador (`addActor` sale por `if (!id) return;`, `:140`)

- Hoy, sin `entrenador_id`, **no nacen ni el 10 % del entrenador ni las subs**. Es plata que no aparece, sin error ni aviso.
- Exposición medida hoy (Q7): **0 premiados sin entrenador** en R6, R8 y R9. Ratificados sin entrenador: R6 2, R8 0, R9 0.
- Opciones:
  - **(a) Recomendada: gate en `oficializar()`**, igual que el GATE MONTAS (`resultados.html:1624-1640`). Ningún
    ratificado que largó y quedó 1°–5° puede no tener entrenador: se bloquea y se ofrece cargarlo. Costo: una función
    gemela de `montasFaltantes`. Para Martín (el que oficializa) es un aviso más, del mismo estilo que el que ya conoce.
  - (b) Línea "pendiente de asignar" con `beneficiario_tipo='club'`. **No recomendada**: haría aparecer plata del
    personal como del club.
  - (c) Dejarlo como está y avisar en el Resumen. **No recomendada**: es el patrón de pérdida silenciosa que el
    gate de montas vino a cerrar.
- **Mismo problema, sin gate**: las 9 inscripciones de R8 que hoy tienen entrenador asignado después (ISSUE-091)
  también lo muestran. El motor lo arregla "solo" en el próximo recálculo, y eso es justamente lo que hay que
  controlar (§ 5).

---

## 2. Qué muestran el recibo y la pantalla (relevado por lectura de `liquidaciones.html` en main)

| Vista | Dónde | Qué imprime de una línea `actuacion` | Con la propuesta (`concepto='Peón'`) |
|---|---|---|---|
| **Recibo impreso** (ORIGINAL + DUPLICADO) | `imprimirReciboCobro`, `:2274-2368`; fila en `:2307` | columnas Fecha · Carrera · Caballo · Puesto · **Rol** · **Concepto** · Neto. Rol = `rolDeLinea(l)`, que para `actuacion` devuelve **"Profesional"** (`:1986-1994`). **Nunca** imprime `descripcion`. Encabezado: `A nombre de: <entrenador> — Entrenador / Profesional` (`:2348`) | `Profesional · Peón · $35.300,00`: no dice "sin nombre", no dice el %, no separa el 10 % del 8 %. Firma única del recibo (`:2323-2326`: Firma / Aclaración / DNI, o "TRANSFERENCIA — no requiere firma") |
| **Pagos — tarjeta del buscador** | `cobrosBuscar`, `:1425-1514` | agrupa por beneficiario: las subs cuentan bajo el entrenador, con la etiqueta "Entrenador / Profesional" | igual |
| **Pagos — detalle a cobrar** | `cobrosDetalle`, `:1641-1741`; fila `:1705`, retenidas `:1708` | Rol ("Profesional") + `concepto` (sin escapar). Chip de filtro "Actuación" (`:1554`). **Todas las impagas vienen tildadas** (`cobChecked`, `:1571-1578`). Las retenidas van aparte, con un **✅ Habilitar por línea** (`:1711` → `liberar_linea`) | el recibo del entrenador sale con sus subs **si están impagas al mismo tiempo**. En 1°/2° son **4 clics de Habilitar por caballo** (entrenador + 3) |
| **Pagos — vista por carrera** | `cobHtmlVistaCarrera`, `:1367-1389`; `rolVista` `:1162-1173` | `concepto` (escapado), bajo el bloque Entrenador, al final (`ORDEN_CONCEPTO_VISTA.actuacion = 3`) | `Peón` bajo el entrenador |
| **Resumen** | `loadResumen`, `:863-906` | total por tipo: `Actuaciones (peón/capataz/sereno)` (`:899`) | pasa de $0 a la suma real |
| **Detalle de liquidación** | `verDetalle`, `:797-822` | `concepto` + `descripcion` (la única vista que muestra "A redistribuir (4 %)") | `Peón` + `Carrera 1 — 1° puesto — Peón: (sin nombre cargado) — A redistribuir (4%)` |

`emitir_recibo` (v1.3, `migrations/guard_staff_emitir_recibo.sql:43, 119-125`) cobra **los ids que manda el cliente**:
`d.id = ANY(p_linea_ids) AND beneficiario = … AND recibo_id IS NULL AND estado_linea = 'impago'`. No filtra por
`concepto_tipo`. Las subs entran en el recibo del entrenador si están tildadas, y por defecto lo están.

**Cambios mínimos de pantalla para "discriminados en el detalle"** (van en el mismo cambio que el motor):
1. `rolDeLinea`: si `concepto_tipo === 'actuacion'`, devolver el rol del `concepto` (`Peón`/`Capataz`/`Sereno`).
2. Recibo: en la columna Concepto de `actuacion`, poner el nombre o **"(sin nombre)"**, sacado de la descripción o de la
   inscripción. Al pie, subtotales **Entrenador 10 % · Personal 8 % · Total 18 %** cuando haya subs.
3. Encabezado del recibo: que no diga "Entrenador / Profesional" sino "Entrenador (incluye personal)".
4. Pagos: un **"Habilitar caballo"** que libere juntas las 4 retenidas del mismo caballo (4 llamadas a `liberar_linea`
   o una RPC nueva). Si no, Valeria hace 4 clics por caballo premiado 1°/2°.
5. Escapar `concepto` en `cobrosDetalle:1705` y en el recibo `:2307` (hoy van sin `escapeHtml`; el nombre del
   peón es texto libre cargado a mano).

---

## 3. R9 al recalcular con la propuesta

- **Motor actual** (sin parche), R9: `inserts 80 {"RENACE_IGUAL":80}`, 0 nuevas, 0 desaparecen. **R9 no tiene deuda
  escondida** del tipo ISSUE-091.
- **Con el parche**: `inserts 149 {"RENACE_IGUAL":80,"NUEVA":69}`, 0 desaparecen, 0 renacen distintas.

| Grupo | Líneas | Caballos | Monto | Estado al nacer | ¿Entra en "su mismo recibo"? |
|---|---:|---:|---:|---|---|
| 1°/2°: entrenador retenido, sin cobrar | 30 | 10 | 447.336,68 | `retenido`, libera 2026-10-20 | Sí, si se habilitan las 4 del caballo antes de emitir |
| 3°–5°: entrenador impago, sin cobrar | 12 | 4 | 35.440,00 | `impago` | Sí: salen tildadas junto al 10 % |
| 3°–5°: **entrenador ya cobró** (recibos 35, 37, 40, 45, 46, 48, 56, 61) | 27 | 9 | 81.320,00 | `impago` | **No.** Hace falta un **recibo complementario** o anular y re-emitir. `anular_recibo` exige super_admin pasados 5 días, y los recibos son del 20/09 |
| **Total** | **69** | **23** | **564.096,68** | | |

Por rol: Peón 23 líneas / $282.048,33 · Capataz 23 / $211.536,25 · Sereno 23 / $70.512,08 (sin redondear: 223.668,33 +
58.380,00; 167.751,25 + 43.785,00; 55.917,08 + 14.595,00). **Cierre**: 564.096,6672 sin redondear = el 8 % teórico del
informe del 25/09 (Q6: $564.096,67). Redondeado por línea da $564.096,68: un centavo de más por redondeo, que la regla
de § 1.3 corrige.

⚖ **Los 9 caballos cuyo entrenador ya cobró**: ¿recibo complementario del 8 % ("personal de caballeriza")
o se anula y se re-emite el del 20/09? El primero no toca recibos emitidos. Lo pagado en papel no se ve.

---

## 4. R6 y R8 al recalcular con la propuesta

| | Líneas nuevas | Monto | retenido (libera 2026-07-20 / 2026-09-15, **ya vencidas**) | impago |
|---|---:|---:|---:|---:|
| R6 — ISSUE-091 (propietarios asignados después) | 4 | 430.290,00 | — | 430.290,00 |
| R6 — sub-líneas (35 caballos × 3) | 105 | 1.174.368,02 | 918.980,02 | 255.388,00 |
| R8 — ISSUE-091 (propietario, entrenador, jockey, incentivos) | 29 | 915.533,34 | 181.133,34 | 734.400,00 |
| R8 — sub-líneas (40 caballos × 3) | 120 | 1.140.648,00 | 884.312,00 | 256.336,00 |
| **Total R6 + R8** | **258** | **3.660.839,36** | **1.984.425,36** | **1.676.414,00** |

- "13 líneas, $895.823" era la estimación del informe del 25/09 hecha sólo con premios (`fondo / 0,02`). El
  **motor real** en seco da **33 líneas, $1.345.823,34**: faltaban 15 incentivos de entrenador y 5 de jockey de R8
  (ISSUE-091, rama `chore/issues-091-092-recalculo-saldadas-peon` @ `13e6dfb`).
- Con la propuesta, en R8 **todos** los caballos cierran al 100 % (Σ líneas = Σ premios = 14.258.100,00; 6 caballos a
  ±1 centavo). En R6 **no**: faltan las líneas de propietario de 21 caballos (grupos B/C/D del informe del 25/09) y
  Σ líneas = 6.955.234,20 contra premios por 14.679.600,01.
- Retenido "ya vencido" significa que Valeria lo ve con ✅ Habilitar y un clic lo vuelve cobrable.

---

## 5. Protección de reuniones saldadas (tiene que entrar en el mismo cambio)

Sin protección, el deploy del motor nuevo convierte **cualquier** recálculo de R6/R8 en $3,66 M cobrables. Los
disparadores (ISSUE-091) siguen abiertos:
- oficializar **R6 carrera 3** (turno 3, `provisional`);
- cambiar una de las **61 montas** que pasan el guard de `rpc_cambiar_monta`;
- o el botón **🔄 Recalcular** de `liquidaciones.html`, que no tiene guard.

| Opción | Cómo | R9 (hay que generar el 8 %) | Yesi (operador: inscripciones, montas) | Martín (oficializa resultados) | Veredicto |
|---|---|---|---|---|---|
| **A. Marca por reunión** `reuniones.liquidacion_cerrada_at` (+ `_por`) | **Motor**: si la reunión está cerrada, no borra ni inserta nada y devuelve `{error:'reunión saldada'}`. **Base**: trigger `BEFORE INSERT OR DELETE OR UPDATE OF monto_bruto, estado_linea` sobre `liquidacion_detalle` → RAISE si la reunión está cerrada (salvo `service_role`, para regularizaciones por migración). **UI**: el botón Recalcular deshabilitado con cartel. Cerrar y reabrir: sólo super_admin | Queda **abierta** → recibe el 8 % | Puede seguir cambiando montas de R6/R8 (se actualizan las performances), pero **no mueve plata**: el recálculo devuelve "reunión saldada" y un toast lo explica | Puede oficializar la C3 de R6 (resultado, performances, Stud Book); la liquidación **no** se genera y el toast lo dice | **Recomendada.** Explícita, auditada, sin heurística; la base la sostiene aunque el cliente falle |
| B. Heurística "tiene líneas con `[REGULARIZACION`" | sin schema: el motor corta si encuentra la marca | **Bloquea R9**: tiene 5 líneas regularizadas del 20/09 (recibos manuales 0479/0480/0486/0487/0488) | igual que A | igual que A | **No**: frena justo la reunión que hay que liquidar, y depende de un texto |
| C. Congelar por carrera "con plata comprometida" | el motor no genera en carreras con alguna línea pagada | **Bloquea R9**: las 5 carreras oficiales tienen líneas cobradas | cambiar una monta en una carrera con pagos no recalcula nada, ni siquiera lo legítimo | oficializar una carrera nueva sí genera | **No**: impide el 8 % en R9 y deja pasar la C3 de R6 |
| D. Sólo en el cliente (sin la base) | la misma marca que A, sin trigger | abierta | igual que A | igual que A | **No como único mecanismo**: cualquier llamada directa al motor o a la API la saltea |

⚖ **Decisiones de producto que A deja explícitas** (no las toma el código):
1. ¿R6 y R8 se cierran tal como están, sin el 8 % y con los $1,35 M de ISSUE-091 **fuera**? ¿O se genera el 8 % y se
   regulariza como "pagado por fuera", igual que el saldado del 28/08? Lo pagado en papel no se ve (informe del 25/09).
2. ¿Quién cierra una reunión de ahora en adelante? Propuesta: Valeria o Fede, desde Pagos, cuando está todo cobrado,
   con una confirmación que muestre el pendiente.
3. ¿R9 se cierra después de emitir los complementarios?

**Orden de deploy, si se aprueba A**:
1. Migración (columna + trigger) **y** marcar R6/R8 cerradas, en la **misma** transacción.
2. Deploy del motor y de la UI.
3. Recalcular R9 (nacen las 69).

Si el motor sale antes del paso 1, la ventana queda abierta.

---

## 6. Probe (diseño; no se escribió código en `tests/`)

`tests/probe_reparto_100.mjs`, con el patrón del repo: extrae `generarLiquidacionesReunion` del archivo real y lo corre
con un `sb` en memoria. Dos modos:

**(a) Sintético, sin Supabase** (tablas en memoria), casos:

| Caso | Assert |
|---|---|
| Premio redondo (1° $850.000 con bono) | Σ líneas del caballo = P exacto; entrenador + 3 subs = r2(18 % P) exacto; 3 subs presentes "sin nombre" |
| Premio no redondo (2° $205.833,33 — el caso real que hoy da −1 centavo) | ídem, gracias a la regla de residuo; cada línea a ≤ 0,01 de su % |
| Empate (dead-heat, premio promediado) | ídem con el premio promediado |
| Con nombre → recálculo → nombre cambiado, sub-línea **pagada** | **no** nace otra sub-línea (clave = rol); la pagada se preserva |
| Sin nombre pagada → se carga el nombre → recálculo | no duplica |
| 1°/2° | las 3 subs `retenido` con la misma `fecha_liberacion` que el 10 % del entrenador |
| Caballo sin entrenador | según la decisión de § 1.4: el gate de `oficializar` lo bloquea (se prueba el gate, extraído por anclas) |
| Reunión cerrada | el motor devuelve error y **0** escrituras capturadas |
| Recibo | `imprimirReciboCobro` extraído: Rol = Peón/Capataz/Sereno, "(sin nombre)", subtotales 10/8/18 |

**(b) Contra prod, sólo lectura** (el dry-run de este informe convertido en assert):
- R9 → exactamente **69** nuevas, todas `actuacion`, Σ = r2(8 % Σ premios) con la regla de residuo, **0** desaparecen,
  **0** renacen distintas;
- R6/R8 cerradas → **0** inserts;
- md5 de R6/R8/R9 igual antes y después (prueba de que no escribió).

**Mutantes**:
- volver a `.filter(nombre)` → el sintético falla (0 subs);
- sacar la regla de residuo → falla en el 2° de $205.833,33 (±0,01);
- `concepto` con nombre → falla el caso "renombre pagada" (nace duplicado);
- sacar el corte de reunión cerrada → falla (> 0 inserts);
- en la base: sacar el trigger → un INSERT directo en una reunión cerrada pasa.

---

## Queries, comandos y salidas crudas

### Q1 — Guard y estado inicial

```sql
select (select count(*) from spcs) spcs,
 (select md5(string_agg(d::text,'|' order by d.id)) from liquidacion_detalle d where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9') md5_r9_lineas,
 (select count(*) from liquidacion_detalle d where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9') r9_lineas,
 (select column_default||' / nullable='||is_nullable from information_schema.columns where table_name='liquidacion_detalle' and column_name='beneficiario_id') benef_id,
 (select string_agg(enumlabel,',' order by enumsortorder) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname=(select udt_name from information_schema.columns where table_name='liquidacion_detalle' and column_name='beneficiario_tipo')) benef_tipo_enum,
 (select string_agg(enumlabel,',' order by enumsortorder) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname=(select udt_name from information_schema.columns where table_name='liquidacion_detalle' and column_name='concepto_tipo')) concepto_enum;
```
```json
[{"spcs":210,"md5_r9_lineas":"c33f00d6900252c6fd33fed3ce061aaa","r9_lineas":147,"benef_id":null,"benef_tipo_enum":"profesional,propietario,club","concepto_enum":"premio,bono,actuacion,incentivo_jockey,incentivo_entrenador,fondo_solidario"}]
```
(`benef_id` sale NULL porque `column_default` es NULL y la concatenación da NULL. Por `docs/SCHEMA.md:200-216` y
`migrations/liquidaciones_cd_fase0.sql:123,131-132`, `beneficiario_id` es nullable y sin FK.)

Foto de R6/R8 (tomada en esta sesión, antes de los dry-runs del 25/09 a la tarde):
```json
[{"numero":6,"lineas":192,"md5_lineas":"85051a817b77f6cda3337bee07741697","headers":86,"md5_headers":"37d13ace847db6b8a19d15f65b5d53ce","md5_insc":"a514b5b01efd0363248fc8ecceeeff2b"},{"numero":8,"lineas":225,"md5_lineas":"fc82ef1b2a81d85eb4af7e7d369f5c44","headers":93,"md5_headers":"f4c60a74062900c97a669b2adf7f7e4a","md5_insc":"4e81620165c33874e81ed7281a9bcffe"}]
```

### Q2 — Script del dry-run (tal como corrió; en el scratchpad de la sesión, no en el repo)

```js
// DRY-RUN del motor real (main:liquidaciones-engine.js) sobre una reunión.
// Lecturas: contra prod. Escrituras (insert/update/delete/upsert/rpc): CAPTURADAS, nunca enviadas.
// Uso: node dryrun_recalc.mjs <reunion_id> <out.json>
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/clio/dev/SGH/package.json');
const { createClient } = require('@supabase/supabase-js');

const [rid, out, hookPath] = process.argv.slice(2);
if (hookPath) globalThis.__hook = (await import(hookPath)).default;
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const real = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } });

const WRITE = new Set(['insert', 'update', 'delete', 'upsert']);
const captured = [];
let fakeId = 0;

function builder(table) {
  const chain = [];
  let writeOp = null;
  const api = new Proxy({}, {
    get(_, m) {
      if (m === 'then') {
        return (res, rej) => run().then(res, rej);
      }
      return (...args) => {
        if (WRITE.has(m)) { if (writeOp) throw new Error('doble write'); writeOp = { op: m, args }; }
        chain.push([m, args]);
        return api;
      };
    },
  });
  async function run() {
    if (writeOp) {
      const rec = { table, op: writeOp.op, payload: writeOp.args[0] ?? null,
        filters: chain.filter(([m]) => !WRITE.has(m) && m !== 'select' && m !== 'single').map(([m, a]) => [m, a]) };
      captured.push(rec);
      if (writeOp.op === 'insert' && chain.some(([m]) => m === 'single')) {
        const id = `DRYRUN-HEADER-${++fakeId}`;
        return { data: { id, ...writeOp.args[0] }, error: null };
      }
      return { data: null, error: null, count: null };
    }
    // Sólo lectura: se reproduce la cadena sobre el cliente real.
    if (chain[0]?.[0] !== 'select') throw new Error(`cadena sin select en ${table}: ${chain.map(c => c[0])}`);
    let q = real.from(table);
    for (const [m, a] of chain) q = q[m](...a);
    const res = await q;
    // Hook opcional: altera EN MEMORIA lo leído (nunca la base).
    if (globalThis.__hook && res && res.data) res.data = globalThis.__hook(table, res.data);
    return res;
  }
  return api;
}
const sb = { from: builder, rpc: () => { throw new Error('rpc no permitido en dry-run'); } };

const src = execSync('git -C /home/clio/dev/SGH show main:liquidaciones-engine.js', { encoding: 'utf8' });
// PATCH=subs → propuesta Fase 1: siempre las 3 sub-líneas; concepto = rol (clave estable), nombre en descripcion.
let code = src;
if (process.env.PATCH === 'subs') {
  const a = `].filter(s => s.nombre && s.nombre.trim());`;
  const b = `concepto: \`\${sub.rol} — \${sub.nombre}\`,
            descripcion: \`\${item.concepto} — A redistribuir (\${Math.round(sub.pct * 100)}%)\`,`;
  if (!code.includes(a) || !code.includes(b)) throw new Error('ancla del parche no encontrada');
  code = code.replace(a, `].map(s => ({ ...s, nombre: (s.nombre || '').trim() || null }));`);
  code = code.replace(b, `concepto: sub.rol,
            descripcion: \`\${item.concepto} — \${sub.rol}: \${sub.nombre || '(sin nombre cargado)'} — A redistribuir (\${Math.round(sub.pct * 100)}%)\`,`);
}
new Function('window', code)(globalThis);

// Estado previo (para clasificar lo que el motor insertaría)
const { data: prev, error: pe } = await real.from('liquidacion_detalle')
  .select('id,beneficiario_tipo,beneficiario_id,concepto_tipo,inscripcion_id,posicion,concepto,monto_bruto,estado_linea,recibo_id,carrera_id')
  .eq('reunion_id', rid);
if (pe) throw pe;

const r = await globalThis.generarLiquidacionesReunion({ sb, clubId: CLUB, reunionId: rid });

const key = globalThis.lineKey;
const prevByKey = new Map(prev.map(d => [key(d), d]));
const inserts = captured.filter(c => c.table === 'liquidacion_detalle' && c.op === 'insert').flatMap(c => c.payload);
const clasif = inserts.map(d => {
  const p = prevByKey.get(key(d));
  const cls = !p ? 'NUEVA' : (Math.abs(parseFloat(p.monto_bruto) - d.monto_bruto) < 0.005 && p.estado_linea === d.estado_linea ? 'RENACE_IGUAL' : 'RENACE_DISTINTA');
  return { cls, ...d, prev_monto: p?.monto_bruto ?? null, prev_estado: p?.estado_linea ?? null };
});
const deletes = captured.filter(c => c.op === 'delete');
const noComprometidasPrev = prev.filter(d => d.recibo_id == null && d.estado_linea !== 'pagado');
const insertKeys = new Set(inserts.map(key));
const desaparecen = noComprometidasPrev.filter(d => !insertKeys.has(key(d)));
writeFileSync(out, JSON.stringify({ reunion: rid, resultado_motor: r, prev_total: prev.length,
  prev_no_comprometidas: noComprometidasPrev.length, writes_capturados: captured.map(c => ({ table: c.table, op: c.op,
    filas: Array.isArray(c.payload) ? c.payload.length : (c.payload ? 1 : 0), filters: c.filters })),
  inserts_total: inserts.length, clasif, desaparecen }, null, 1));
const cnt = clasif.reduce((a, c) => (a[c.cls] = (a[c.cls] || 0) + 1, a), {});
console.log(rid, 'motor:', JSON.stringify(r), 'prev:', prev.length, 'no_comprometidas:', noComprometidasPrev.length,
  'inserts:', inserts.length, JSON.stringify(cnt), 'desaparecen:', desaparecen.length,
  'writes:', captured.length);
```

### Q3 — Corridas

```
$ node dryrun_recalc.mjs cafa37d6-89f4-45cb-a0d9-835bc27407e9 dry_r9_base.json
cafa37d6-89f4-45cb-a0d9-835bc27407e9 motor: {"created":0,"headers":70,"preserved":67} prev: 147 no_comprometidas: 80 inserts: 80 {"RENACE_IGUAL":80} desaparecen: 0 writes: 114

$ PATCH=subs node dryrun_recalc.mjs cafa37d6-89f4-45cb-a0d9-835bc27407e9 dry_r9_subs.json
cafa37d6-89f4-45cb-a0d9-835bc27407e9 motor: {"created":0,"headers":70,"preserved":67} prev: 147 no_comprometidas: 80 inserts: 149 {"RENACE_IGUAL":80,"NUEVA":69} desaparecen: 0 writes: 119
{
  'actuacion|Peón|retenido': { n: 10, m: 223668.333544 },
  'actuacion|Capataz|retenido': { n: 10, m: 167751.25015799998 },
  'actuacion|Sereno|retenido': { n: 10, m: 55917.083386 },
  'actuacion|Peón|impago': { n: 13, m: 58380.000031999996 },
  'actuacion|Capataz|impago': { n: 13, m: 43785.00002399999 },
  'actuacion|Sereno|impago': { n: 13, m: 14595.000007999999 }
}
nuevas 69 total float 564096.6671520001 total redondeado por linea 564096.68
otras clases: {"RENACE_IGUAL":80,"NUEVA":69} desaparecen 0
sin nombre: 69

$ PATCH=subs node dryrun_recalc.mjs b02ca761-… dry_r6_subs.json ; PATCH=subs node dryrun_recalc.mjs 7b6e003e-… dry_r8_subs.json
b02ca761-6f44-4720-86aa-a3c3099019ea motor: {"created":4,"headers":74,"preserved":157} prev: 192 no_comprometidas: 35 inserts: 144 {"NUEVA":109,"RENACE_IGUAL":35} desaparecen: 0 writes: 128
7b6e003e-22e2-4629-bf55-f18560b1260f motor: {"created":20,"headers":93,"preserved":185} prev: 225 no_comprometidas: 40 inserts: 189 {"NUEVA":149,"RENACE_IGUAL":40} desaparecen: 0 writes: 183
dry_r6_subs.json nuevas 109 total 1604658.02 {"actuacion|retenido":{"n":42,"m":"918980.02"},"actuacion|impago":{"n":63,"m":"255388.00"},"otras(ISSUE-091)|impago":{"n":4,"m":"430290.00"}} renace_distinta 0 desaparecen 0
dry_r8_subs.json nuevas 149 total 2056181.34 {"actuacion|retenido":{"n":48,"m":"884312.00"},"actuacion|impago":{"n":72,"m":"256336.00"},"otras(ISSUE-091)|retenido":{"n":2,"m":"181133.34"},"otras(ISSUE-091)|impago":{"n":27,"m":"734400.00"}} renace_distinta 0 desaparecen 0
```

Primera línea nueva de R9, completa (muestra la forma exacta que genera la propuesta):
```json
{"cls":"NUEVA","concepto":"Peón","descripcion":"Carrera 1 — 1° puesto — Peón: (sin nombre cargado) — A redistribuir (4%)","monto_bruto":35300.00008,"porcentaje_desc":null,"monto_descuento":0,"concepto_tipo":"actuacion","posicion":1,"inscripcion_id":"58cd78a0-1c00-4484-826b-9d953ff869d1","carrera_id":"c037b139-b8b5-46d7-900e-cbc7a01bd643","beneficiario_tipo":"profesional","reunion_id":"cafa37d6-89f4-45cb-a0d9-835bc27407e9","estado_linea":"retenido","fecha_liberacion":"2026-10-20","orden_display":3,"prev_monto":null,"prev_estado":null}
```
(se sacaron `beneficiario_id` y `liquidacion_id`, que identifican a un entrenador.)

### Q4 — Cierre al 100 % y al 18 % por caballo (líneas preservadas + nuevas, redondeadas a centavos)

Script:
```js
// Verificación de la propuesta sobre el dry-run: por caballo premiado, líneas (preservadas + nuevas) redondeadas a centavos.
import { createRequire } from 'node:module'; import { readFileSync } from 'node:fs';
const require = createRequire('/home/clio/dev/SGH/package.json');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const [rid, dry] = process.argv.slice(2);
const j = JSON.parse(readFileSync(dry, 'utf8'));
const r2 = x => Math.round(x * 100) / 100;
const { data: prev } = await sb.from('liquidacion_detalle').select('id,inscripcion_id,concepto_tipo,descripcion,monto_bruto,estado_linea,recibo_id').eq('reunion_id', rid);
const { data: cars } = await sb.from('carreras').select('id,bolsa_total,distribucion_premios').eq('reunion_id', rid);
const { data: res } = await sb.from('resultados').select('id,carrera_id').in('carrera_id', cars.map(c => c.id)).eq('estado', 'oficial');
const { data: pos } = await sb.from('resultado_posiciones').select('resultado_id,inscripcion_id,posicion,empate').in('resultado_id', res.map(r => r.id)).not('posicion', 'is', null).eq('descalificado', false);
const calc = (car, p) => { const d = car.distribucion_premios; const pct = d[String(p)]; if (!pct) return 0; let v = parseFloat(car.bolsa_total) * pct / 100; if (p === 1 && d.bono_ganador) v += parseFloat(d.bono_ganador); const m = parseFloat(d.ganancia_minima) || 0; return m > 0 && v < m ? m : v; };
const premio = {};
for (const p of pos) { if (p.empate) throw new Error('empate: no contemplado'); const car = cars.find(c => c.id === res.find(r => r.id === p.resultado_id).carrera_id); const v = calc(car, p.posicion); if (v > 0) premio[p.inscripcion_id] = { v, pos: p.posicion }; }
// líneas finales = preservadas (comprometidas) + insertadas por el motor
const kept = prev.filter(d => d.recibo_id != null || d.estado_linea === 'pagado').map(d => ({ ...d, monto: parseFloat(d.monto_bruto), src: 'preservada' }));
const ins = j.clasif.map(c => ({ ...c, monto: r2(c.monto_bruto), src: c.cls }));
const all = [...kept, ...ins].filter(d => premio[d.inscripcion_id] && ['premio', 'fondo_solidario', 'actuacion'].includes(d.concepto_tipo));
const rolOf = d => d.concepto_tipo === 'fondo_solidario' ? 'fondo' : d.concepto_tipo === 'actuacion' ? 'sub' : (/— (Propietario|Entrenador|Jockey) \(/.exec(d.descripcion) || [])[1];
let maxDif100 = 0, maxDif18 = 0, n = 0, falla100 = [], falla18 = [], sinRol = {};
const tot = { premio: 0, lineas: 0 };
for (const [iid, { v, pos: p }] of Object.entries(premio)) {
  const ls = all.filter(d => d.inscripcion_id === iid); n++;
  const by = {}; for (const d of ls) { const k = rolOf(d); by[k] = (by[k] || 0) + d.monto; }
  const suma = ls.reduce((a, d) => a + d.monto, 0);
  const d100 = r2(suma - r2(v)); tot.premio += r2(v); tot.lineas += suma;
  const e18 = r2((by.Entrenador || 0) + (by.sub || 0)); const d18 = r2(e18 - r2(v * 0.18));
  maxDif100 = Math.max(maxDif100, Math.abs(d100)); maxDif18 = Math.max(maxDif18, Math.abs(d18));
  if (d100 !== 0) falla100.push({ iid, pos: p, premio: r2(v), suma: r2(suma), dif: d100, by });
  if (d18 !== 0) falla18.push({ iid, pos: p, entr18: e18, esperado: r2(v * 0.18), dif: d18 });
  for (const k of ['Propietario', 'Entrenador', 'Jockey', 'fondo', 'sub']) if (!(k in by)) sinRol[k] = (sinRol[k] || 0) + 1;
}
console.log(JSON.stringify({ reunion: rid, caballos_premiados: n, premio_total: r2(tot.premio), lineas_total: r2(tot.lineas), dif_total: r2(tot.lineas - tot.premio),
  max_dif_100_por_caballo: maxDif100, caballos_que_no_cierran_100: falla100.length, max_dif_18: maxDif18, caballos_entrenador_no_18: falla18.length, caballos_sin_rol: sinRol }));
if (falla100.length) console.log('no cierran 100:', JSON.stringify(falla100));
if (falla18.length) console.log('no 18:', JSON.stringify(falla18));
```
Salida:
```
{"reunion":"cafa37d6-89f4-45cb-a0d9-835bc27407e9","caballos_premiados":23,"premio_total":7051208.34,"lineas_total":7051208.36,"dif_total":0.02,"max_dif_100_por_caballo":0.01,"caballos_que_no_cierran_100":4,"max_dif_18":0.01,"caballos_entrenador_no_18":4,"caballos_sin_rol":{}}
no cierran 100: [{"iid":"d5dcf1e1-79fb-4be0-ab6b-12e9075aec99","pos":2,"premio":205833.33,"suma":205833.32,"dif":-0.01,"by":{"fondo":4116.67,"Propietario":144083.33,"Entrenador":20583.33,"sub":16466.66,"Jockey":20583.33}},{"iid":"0c1b255c-4e00-4afc-8109-38e585dfa8eb","pos":2,"premio":226416.67,"suma":226416.68,"dif":0.01,"by":{"fondo":4528.33,"Entrenador":22641.67,"sub":18113.34,"Jockey":22641.67,"Propietario":158491.67}},{"iid":"c28c6983-8664-45a2-9fef-7eaf9a45f683","pos":2,"premio":200291.67,"suma":200291.68,"dif":0.01,"by":{"fondo":4005.83,"Propietario":140204.17,"Entrenador":20029.17,"sub":16023.34,"Jockey":20029.17}},{"iid":"3419f110-f1bf-4a92-98b0-baf0a58c016d","pos":2,"premio":221666.67,"suma":221666.68,"dif":0.01,"by":{"fondo":4433.33,"Jockey":22166.67,"Entrenador":22166.67,"sub":17733.34,"Propietario":155166.67}}]
no 18: [{"iid":"d5dcf1e1-79fb-4be0-ab6b-12e9075aec99","pos":2,"entr18":37049.99,"esperado":37050,"dif":-0.01},{"iid":"0c1b255c-4e00-4afc-8109-38e585dfa8eb","pos":2,"entr18":40755.01,"esperado":40755,"dif":0.01},{"iid":"c28c6983-8664-45a2-9fef-7eaf9a45f683","pos":2,"entr18":36052.51,"esperado":36052.5,"dif":0.01},{"iid":"3419f110-f1bf-4a92-98b0-baf0a58c016d","pos":2,"entr18":39900.01,"esperado":39900,"dif":0.01}]
{"reunion":"b02ca761-6f44-4720-86aa-a3c3099019ea","caballos_premiados":35,"premio_total":14679600.01,"lineas_total":6955234.2,"dif_total":-7724365.81,"max_dif_100_por_caballo":1680000,"caballos_que_no_cierran_100":22,"max_dif_18":0.01,"caballos_entrenador_no_18":3,"caballos_sin_rol":{"Propietario":21}}
no cierran 100: [{"iid":"addc3bd4-67c9-4935-8afe-f402bf1d4afd","pos":1,"premio":882500,"suma":264750,"dif":-617750,"by":{"Jockey":88250,"Entrenador":88250,"fondo":17650,"sub":70600}},{"iid":"bfabef7d-2fb2-4213-bc6b-07f807fc7452","pos":2,"premio":200291.67,"suma":60087.51,"dif":-140204.16,"by":{"Jockey":20029.17,"Entrenador":20029.17,"sub":16023.34,"fondo":4005.83}},{"iid":"316fb581-3e10-442b-ac85-2e47c8850a99","pos":3,"premio":126500,"suma":37950,"dif":-88550,"by":{"Entrenador":12650,"Jockey":12650,"fondo":2530,"sub":10120}},{"iid":"785d802d-7e5c-4bd0-8bf6-455da36370b3","pos":4,"premio":100000,"suma":30000,"dif":-70000,"by":{"Jockey":10000,"Entrenador":10000,"fondo":2000,"sub":8000}},{"iid":"23ce0134-3db7-4549-a39f-a710e473acb4","pos":5,"premio":100000,"suma":30000,"dif":-70000,"by":{"Entrenador":10000,"Jockey":10000,"fondo":2000,"sub":8000}},{"iid":"a3672b92-081a-4c7c-948b-9b1983204673","pos":1,"premio":1030000,"suma":309000,"dif":-721000,"by":{"Jockey":103000,"Entrenador":103000,"fondo":20600,"sub":82400}},{"iid":"a370bfc3-329f-4c4d-b6af-bddb0760d881","pos":2,"premio":247000,"suma":74100,"dif":-172900,"by":{"Entrenador":24700,"Jockey":24700,"fondo":4940,"sub":19760}},{"iid":"f325ae40-9fbf-4b53-802a-76b4b78227ed","pos":5,"premio":100000,"suma":30000,"dif":-70000,"by":{"Jockey":10000,"Entrenador":10000,"fondo":2000,"sub":8000}},{"iid":"53cddf30-0123-457b-b698-387b646cfa4f","pos":1,"premio":2400000,"suma":720000,"dif":-1680000,"by":{"Jockey":240000,"Entrenador":240000,"fondo":48000,"sub":192000}},{"iid":"dd0a126e-12d4-4d5c-988e-c1ac79b36d59","pos":5,"premio":120000,"suma":36000,"dif":-84000,"by":{"Entrenador":12000,"Jockey":12000,"fondo":2400,"sub":9600}},{"iid":"20b80f1f-2f28-4a9f-8ea2-a0a1850063d3","pos":1,"premio":1000000,"suma":300000,"dif":-700000,"by":{"Jockey":100000,"Entrenador":100000,"fondo":20000,"sub":80000}},{"iid":"7fbbd8b1-24e8-4fe9-beee-09df6e51a4a5","pos":2,"premio":316666.67,"suma":95000.01,"dif":-221666.66,"by":{"Jockey":31666.67,"Entrenador":31666.67,"fondo":6333.33,"sub":25333.339999999997}},{"iid":"d7b909c5-2b92-4985-b3f3-1610a715223d","pos":4,"premio":100000,"suma":30000,"dif":-70000,"by":{"Entrenador":10000,"Jockey":10000,"fondo":2000,"sub":8000}},{"iid":"1cdac0b9-e71f-4f45-b4c9-81ae155bd3be","pos":5,"premio":100000,"suma":30000,"dif":-70000,"by":{"Jockey":10000,"Entrenador":10000,"fondo":2000,"sub":8000}},{"iid":"6632e8d1-20da-41a6-b745-7a6ee6066c93","pos":1,"premio":1193500,"suma":358050,"dif":-835450,"by":{"Jockey":119350,"Entrenador":119350,"fondo":23870,"sub":95480}},{"iid":"3c91aad4-50a6-4b44-88d2-d96470b88330","pos":2,"premio":377941.67,"suma":377941.68,"dif":0.01,"by":{"Entrenador":37794.17,"Jockey":37794.17,"Propietario":264559.17,"fondo":7558.83,"sub":30235.339999999997}},{"iid":"9c4fa3c2-12d3-4131-aab8-4fac28f0f7cb","pos":4,"premio":119350,"suma":35805,"dif":-83545,"by":{"Jockey":11935,"Entrenador":11935,"fondo":2387,"sub":9548}},{"iid":"0e147226-6f40-468b-ac02-508961681be4","pos":1,"premio":1009000,"suma":302700,"dif":-706300,"by":{"Entrenador":100900,"Jockey":100900,"fondo":20180,"sub":80720}},{"iid":"766f1538-0ca2-4f64-8b68-8dfd77f04e7d","pos":4,"premio":100000,"suma":30000,"dif":-70000,"by":{"Entrenador":10000,"Jockey":10000,"fondo":2000,"sub":8000}},{"iid":"6d1b78bb-c549-4d10-b8b9-70f4edb5b71c","pos":5,"premio":100000,"suma":30000,"dif":-70000,"by":{"Jockey":10000,"Entrenador":10000,"fondo":2000,"sub":8000}},{"iid":"35aaf81f-ce6e-4a84-b371-cf2e1502cc76","pos":1,"premio":1450000,"suma":435000,"dif":-1015000,"by":{"Jockey":145000,"Entrenador":145000,"sub":116000,"fondo":29000}},{"iid":"e7d7e085-286a-4f7a-8623-2b5237b2be4f","pos":3,"premio":240000,"suma":72000,"dif":-168000,"by":{"Entrenador":24000,"Jockey":24000,"fondo":4800,"sub":19200}}]
no 18: [{"iid":"bfabef7d-2fb2-4213-bc6b-07f807fc7452","pos":2,"entr18":36052.51,"esperado":36052.5,"dif":0.01},{"iid":"7fbbd8b1-24e8-4fe9-beee-09df6e51a4a5","pos":2,"entr18":57000.01,"esperado":57000,"dif":0.01},{"iid":"3c91aad4-50a6-4b44-88d2-d96470b88330","pos":2,"entr18":68029.51,"esperado":68029.5,"dif":0.01}]
{"reunion":"7b6e003e-22e2-4629-bf55-f18560b1260f","caballos_premiados":40,"premio_total":14258100,"lineas_total":14258100,"dif_total":0,"max_dif_100_por_caballo":0.01,"caballos_que_no_cierran_100":6,"max_dif_18":0.01,"caballos_entrenador_no_18":6,"caballos_sin_rol":{}}
no cierran 100: [{"iid":"6bee22d1-f56b-4157-854e-34dee2fe074a","pos":2,"premio":212483.33,"suma":212483.32,"dif":-0.01,"by":{"Jockey":21248.33,"Propietario":148738.33,"Entrenador":21248.33,"fondo":4249.67,"sub":16998.66}},{"iid":"8ffcc170-be94-417f-8d45-5f63af74c375","pos":2,"premio":348333.33,"suma":348333.32,"dif":-0.01,"by":{"Propietario":243833.33,"Entrenador":34833.33,"Jockey":34833.33,"fondo":6966.67,"sub":27866.660000000003}},{"iid":"a6774bec-54d2-4e05-8d8d-c011bac9722a","pos":2,"premio":221666.67,"suma":221666.68,"dif":0.01,"by":{"Entrenador":22166.67,"Propietario":155166.67,"Jockey":22166.67,"fondo":4433.33,"sub":17733.34}},{"iid":"86534964-b32d-4ec5-b84b-92bb8af2ff69","pos":2,"premio":193166.67,"suma":193166.68,"dif":0.01,"by":{"Propietario":135216.67,"Jockey":19316.67,"Entrenador":19316.67,"fondo":3863.33,"sub":15453.34}},{"iid":"f946b09a-d053-4ac2-bc37-51062e8a91eb","pos":2,"premio":633333.33,"suma":633333.32,"dif":-0.01,"by":{"Jockey":63333.33,"Propietario":443333.33,"Entrenador":63333.33,"fondo":12666.67,"sub":50666.66}},{"iid":"bde2d35b-bf27-4a47-8bed-c2a606e3fd55","pos":2,"premio":226416.67,"suma":226416.68,"dif":0.01,"by":{"Jockey":22641.67,"fondo":4528.33,"Propietario":158491.67,"Entrenador":22641.67,"sub":18113.34}}]
no 18: [{"iid":"6bee22d1-f56b-4157-854e-34dee2fe074a","pos":2,"entr18":38246.99,"esperado":38247,"dif":-0.01},{"iid":"8ffcc170-be94-417f-8d45-5f63af74c375","pos":2,"entr18":62699.99,"esperado":62700,"dif":-0.01},{"iid":"a6774bec-54d2-4e05-8d8d-c011bac9722a","pos":2,"entr18":39900.01,"esperado":39900,"dif":0.01},{"iid":"86534964-b32d-4ec5-b84b-92bb8af2ff69","pos":2,"entr18":34770.01,"esperado":34770,"dif":0.01},{"iid":"f946b09a-d053-4ac2-bc37-51062e8a91eb","pos":2,"entr18":113999.99,"esperado":114000,"dif":-0.01},{"iid":"bde2d35b-bf27-4a47-8bed-c2a606e3fd55","pos":2,"entr18":40755.01,"esperado":40755,"dif":0.01}]
```

Comprobación de la regla de § 1.3 sobre el caso real `d5dcf1e1…` (2°, P = 205.833,33), hecha a mano: fondo 4.116,67 ·
jockey 20.583,33 · subs 8.233,33 + 6.175,00 + 2.058,33 = 16.466,66 · E18 = r2(37.049,9994) = 37.050,00 → entrenador =
20.583,34 · propietario = 205.833,33 − (4.116,67 + 20.583,33 + 37.050,00) = 144.083,33 → **Σ = 205.833,33** y
**18 % = 37.050,00**, los dos exactos.

### Q5 — R9: estado del 10 % del entrenador de cada caballo premiado

```sql
with prem as (
 select distinct d.inscripcion_id, d.posicion from liquidacion_detalle d
 where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and d.concepto_tipo='fondo_solidario'
)
select case when p.posicion in (1,2) then '1-2 (retenido)' else '3-5' end tramo,
 e.estado_linea::text entr_estado, (e.recibo_id is not null) entr_con_recibo, count(*) caballos,
 count(distinct e.beneficiario_id) entrenadores, count(distinct e.recibo_id) recibos
from prem p left join liquidacion_detalle e on e.inscripcion_id=p.inscripcion_id and e.concepto_tipo='premio' and e.descripcion like '%— Entrenador%'
group by 1,2,3 order by 1,2,3;
```
```json
[{"tramo":"1-2 (retenido)","entr_estado":"retenido","entr_con_recibo":false,"caballos":10,"entrenadores":9,"recibos":0},{"tramo":"3-5","entr_estado":"impago","entr_con_recibo":false,"caballos":4,"entrenadores":4,"recibos":0},{"tramo":"3-5","entr_estado":"pagado","entr_con_recibo":true,"caballos":9,"entrenadores":8,"recibos":8}]
```

```sql
select d.inscripcion_id, rc.numero_recibo, d.posicion from liquidacion_detalle d join recibos rc on rc.id=d.recibo_id
where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and d.concepto_tipo='premio' and d.descripcion like '%— Entrenador%' order by rc.numero_recibo;
```
```json
[{"inscripcion_id":"4699b317-5fb3-4132-aee7-2667e58e2f6a","numero_recibo":35,"posicion":4},{"inscripcion_id":"5b0bf74a-76da-45ee-b7ed-a359c592d46d","numero_recibo":37,"posicion":3},{"inscripcion_id":"c991cfab-55ea-45f3-92f2-6bfd2946a6d3","numero_recibo":37,"posicion":5},{"inscripcion_id":"4847cdc4-120d-4c95-8d63-80fef2eb9dd2","numero_recibo":40,"posicion":3},{"inscripcion_id":"5fda3830-4902-4df6-8ee6-c62edcb72bc3","numero_recibo":45,"posicion":4},{"inscripcion_id":"6661bfc2-f480-4b45-8f58-e24e8d5dba25","numero_recibo":46,"posicion":3},{"inscripcion_id":"52a6b0db-6131-446a-9654-79ec1fba70a9","numero_recibo":48,"posicion":4},{"inscripcion_id":"7bd940ba-85c2-435d-ad56-e699ecf0db20","numero_recibo":56,"posicion":5},{"inscripcion_id":"192151de-8761-4af6-b568-f33c60b3185b","numero_recibo":61,"posicion":3}]
```

### Q6 — Las 69 de R9 por estado del entrenador (sobre `dry_r9_subs.json`, con los 9 ids de Q5)

```
retenido|entrenador_no_cobro 30 lineas 10 caballos 447336.68
impago|entrenador_ya_cobro 27 lineas 9 caballos 81320.00
impago|entrenador_no_cobro 12 lineas 4 caballos 35440.00
```

### Q7 — Caballos sin entrenador

```sql
select r.numero, count(*) filter (where i.estado='ratificado') ratificados,
 count(*) filter (where i.estado='ratificado' and i.entrenador_id is null) ratif_sin_entrenador,
 count(*) filter (where i.estado='ratificado' and i.entrenador_id is null and rp.posicion between 1 and 5) premiados_sin_entrenador_hoy
from reuniones r join carreras ca on ca.reunion_id=r.id join inscripciones i on i.carrera_id=ca.id
left join resultados res on res.carrera_id=ca.id and res.estado='oficial'
left join resultado_posiciones rp on rp.resultado_id=res.id and rp.inscripcion_id=i.id
where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and r.numero in (6,8,9) group by 1 order by 1;
```
```json
[{"numero":6,"ratificados":81,"ratif_sin_entrenador":2,"premiados_sin_entrenador_hoy":0},{"numero":8,"ratificados":67,"ratif_sin_entrenador":0,"premiados_sin_entrenador_hoy":0},{"numero":9,"ratificados":74,"ratif_sin_entrenador":0,"premiados_sin_entrenador_hoy":0}]
```

### Q8 — Habilitar retenidas es por línea

`git show main:liquidaciones.html | sed -n 1700,1712p` (extracto) y `grep`:
```
1711:      <td><button class="btn-sm btn-aprobar" onclick="habilitarLinea('${l.id}','${tipo}','${id}')">✅ Habilitar</button></td></tr>`).join('');
1752:// Habilitar (liberar) una línea retenida por doping → pasa a impago (pagable). Liberación MANUAL.
1754:  if (!confirm('¿Habilitar esta línea retenida por doping? Pasa a pagable.')) return;
1755:  const { error } = await sb.rpc('liberar_linea', { p_linea_id: lineaId });
```

### Verificación — la base no se movió

```sql
select r.numero,
 (select count(*) from liquidacion_detalle d where d.reunion_id=r.id) lineas,
 (select md5(string_agg(d::text, '|' order by d.id)) from liquidacion_detalle d where d.reunion_id=r.id) md5_lineas,
 (select count(*) from liquidaciones l where l.reunion_id=r.id) headers,
 (select md5(string_agg(l::text, '|' order by l.id)) from liquidaciones l where l.reunion_id=r.id) md5_headers,
 (select md5(string_agg(i::text, '|' order by i.id)) from inscripciones i join carreras c on c.id=i.carrera_id where c.reunion_id=r.id) md5_insc,
 (select count(*) from spcs) spcs
from reuniones r where r.id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f','cafa37d6-89f4-45cb-a0d9-835bc27407e9') order by 1;
```
```json
[{"numero":6,"lineas":192,"md5_lineas":"85051a817b77f6cda3337bee07741697","headers":86,"md5_headers":"37d13ace847db6b8a19d15f65b5d53ce","md5_insc":"a514b5b01efd0363248fc8ecceeeff2b","spcs":210},{"numero":8,"lineas":225,"md5_lineas":"fc82ef1b2a81d85eb4af7e7d369f5c44","headers":93,"md5_headers":"f4c60a74062900c97a669b2adf7f7e4a","md5_insc":"4e81620165c33874e81ed7281a9bcffe","spcs":210},{"numero":9,"lineas":147,"md5_lineas":"c33f00d6900252c6fd33fed3ce061aaa","headers":70,"md5_headers":"d765b0a8f5319f0cdb4fd72194734f8d","md5_insc":"29cc7a31d2af0d9706cdf2a9296507f7","spcs":210}]
```
R6 y R8 son idénticas a la foto de Q1. El md5 de líneas de R9 es idéntico al de Q1 (`c33f00d6…`).

---

## Preguntas abiertas (⚖, de producto)

1. **R9, 9 caballos cuyo entrenador ya cobró ($81.320,00, recibos 35/37/40/45/46/48/56/61)**: ¿recibo complementario
   del 8 % o anular y re-emitir (requiere super_admin, > 5 días)?
2. **R6/R8**: ¿se cierran sin el 8 % (y sin los $1,35 M de ISSUE-091), o se genera y se regulariza como "pagado por
   fuera"? ¿Lo que se pagó en papel fue el 92 % o el 100 %? (No se sabe; informe del 25/09.)
3. **Caballo sin entrenador**: ¿gate en oficializar (recomendado)?
4. **Recibo**: ¿alcanza con discriminar las 3 líneas + subtotales 10/8/18, o Fede quiere un bloque "Personal de
   caballeriza" con nombre y firma de cada uno? Hoy hay una sola firma por recibo, la de quien retira.
5. **"Sin nombre"**: ¿se imprime "(sin nombre)" o se exige cargar el nombre antes de emitir el recibo del
   entrenador? Esto último agrega un paso para Yesi en `inscripciones.html`.
6. **Quién cierra una reunión** y cuándo (opción A).

## Nota de proceso

- La sesión anterior (ISSUE-091/092) dejó la rama `chore/issues-091-092-recalculo-saldadas-peon` @ `13e6dfb` pusheada,
  con las entradas en `docs/ISSUES.md`. **Su informe en `reports` no llegó a escribirse**: la corrida que juntaba las
  salidas se cortó (`Exit code 137`). Los números de ISSUE-091 que se citan acá (33 / $1.345.823,34) están
  re-medidos en esta sesión (Q3: `otras(ISSUE-091)`).
- Informe commiteado en el worktree sobre `origin/reports` y pusheado como fast-forward. La rama `reports` local no se tocó.
