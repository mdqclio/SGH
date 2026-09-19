# Plan — "Ratificación a premios" (pozo entre los que corren) · Fase 1: SOLO EL COBRO

- **Fecha:** 2026-09-19
- **SHA de `main` relevado:** `ef78472` (`ef7847218bfb47f06f72d9df814d1aba02a1a14c`). Todos los greps y lecturas de código, contra `main`. El informe se escribe en `reports`.
- **Modo:** PLAN. **Nada aplicado**: ni DDL, ni código, ni datos. Solo lectura de DB.
- **Guards:** `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref `unlhcuanfrtpatoipwve`.
- **Alcance:** relevamiento (§1), dónde viven los datos (§2), el cobro (§3), la devolución (§4), el pozo (§5), la pregunta del pago al ganador (§6, sin decidir), orden de construcción y probes (§7), preguntas abiertas (§8). **No** se diseña el pago al ganador más allá de §6.
- **Aviso de calendario:** R9 es mañana (20/09). Nada de esto llega a R9. Fase 1 apunta a R10.

---

## 0. Resumen ejecutivo

| Tema | Conclusión |
|---|---|
| ¿Hay algo en el modelo que sirva para un INGRESO? | **No.** `liquidacion_detalle` es 100 % deuda del club hacia afuera: sin CHECK de signo (un negativo "entra"), pero toda la capa de arriba —`emitir_recibo`, tab Pagos, Resumen, `anular_recibo`, paid-safe del motor— asume que `monto_neto > 0` es plata que el club paga. Meter negativos ahí es esconder un ingreso adentro de un pago. `beneficiario_tipo` tiene `'club'`, pero se usa para el fondo solidario (el club como *beneficiario* de un reparto), no como *cobrador*. `concepto_liq` no tiene ningún valor de cobro. |
| ¿Numeración de recibos? | **Hay que separar la serie, y el modelo ya lo permite a medias.** `club_secuencias` tiene PK `(club_id, tipo)` → una fila `tipo='recibo_cobro'` es trivial. Pero `fn_siguiente_recibo(p_club_id)` hardcodea `'recibo'` y `recibos` tiene `UNIQUE (club_id, numero_recibo)` + `CHECK chk_recibo_beneficiario` (profesional XOR propietario) + `neto_a_cobrar` GENERATED con semántica de pago. → **Tabla propia para los cobros, serie propia, RPC propio.** No reusar `recibos`. |
| Dónde viven monto y retención | `carreras.pozo_monto_caballo NUMERIC(15,2) NULL` (por carrera; NULL = esta carrera no tiene pozo) y `reuniones.pozo_retencion_pct NUMERIC(6,3) NULL` (por reunión). Nombres con prefijo `pozo_` a propósito: la palabra "ratificación" ya nombra **dos** ventanas distintas (ISSUE-075) y una tercera acepción la vuelve inusable. Nada parecido existe hoy (§2). |
| El cobro | Tabla nueva `pozo_cobros` (una fila por inscripción cobrada, con snapshot del monto, serie propia `recibo_cobro`, estado `cobrado/devuelto/anulado`), RPC `cobrar_pozo` SECURITY DEFINER, pantalla nueva `pozo.html` (reunión → carrera → ratificados con estado → Cobrar → recibo). Aviso en `oficializar()` de `resultados.html`, **`confirm` con "Oficializar igual"**, no bloqueo. |
| La devolución | RPC `devolver_pozo(p_cobro_id, p_motivo)`: `estado='devuelto'` + `devuelto_at/por` + motivo + foto jsonb — la fila **no se borra**. Distinto de `anular_cobro` (registro erróneo: nunca entró plata). Ambos salen del pozo. |
| El pozo | Calculado, no persistido en Fase 1: `pozo_bruto = Σ monto de cobros 'cobrado'`; `retención = pozo_bruto × pct/100`; `al_ganador = pozo_bruto − retención`. Más un **esperado** = ratificados × monto, para verlo antes de cobrar. Vista SQL `v_pozo_carrera` + cabecera en `pozo.html` + chip read-only en `resultados.html`. |
| Pago al ganador (§6) | Se analizan las dos opciones con argumentos; **no se decide**. Inclinación explicada al final de §6, con lo que habría que confirmar con Fede antes de elegir. |
| Premisa a corregir | El pedido decía *"mismo criterio que el gate de jockeys: avisa, no bloquea"*. **El gate de jockeys BLOQUEA** (`resultados.html:1623-1643`: `confirm` → `return`, sin "seguir igual"; el comentario lo dice: *"Bloqueo duro y no advertencia"*). Confirmado por Leonardo el 19/09: *"tenés razón con lo del gate de jockeys, yo dije 'mismo criterio' y es al revés"*. **Queda asentado: el pozo AVISA por decisión de Fede, no por consistencia con montas.** Los dos gates tienen criterios distintos a propósito: montas bloquea porque el faltante se perdía en silencio; el pozo avisa porque el faltante queda visible y cobrable después en `pozo.html`. |

---

## 1. Relevamiento

### 1.1 `liquidacion_detalle` — ¿soporta ingresos?

Constraints reales (DB, no doc):

```sql
select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid in ('liquidacion_detalle'::regclass,'recibos'::regclass,'club_secuencias'::regclass,'liquidaciones'::regclass) and contype in ('c','u','p','f')
order by 1,2;
```
```
liquidaciones        liquidaciones_aprobado_por_fkey        FOREIGN KEY (aprobado_por) REFERENCES usuarios(id)
liquidaciones        liquidaciones_club_id_fkey             FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
liquidaciones        liquidaciones_pkey                     PRIMARY KEY (id)
liquidaciones        liquidaciones_profesional_id_fkey      FOREIGN KEY (profesional_id) REFERENCES profesionales(id)
liquidaciones        liquidaciones_propietario_id_fkey      FOREIGN KEY (propietario_id) REFERENCES propietarios(id)
liquidaciones        liquidaciones_reunion_id_fkey          FOREIGN KEY (reunion_id) REFERENCES reuniones(id)
liquidacion_detalle  liquidacion_detalle_carrera_id_fkey    FOREIGN KEY (carrera_id) REFERENCES carreras(id)
liquidacion_detalle  liquidacion_detalle_inscripcion_id_fkey FOREIGN KEY (inscripcion_id) REFERENCES inscripciones(id)
liquidacion_detalle  liquidacion_detalle_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES liquidaciones(id) ON DELETE CASCADE
liquidacion_detalle  liquidacion_detalle_pkey               PRIMARY KEY (id)
liquidacion_detalle  liquidacion_detalle_recibo_id_fkey     FOREIGN KEY (recibo_id) REFERENCES recibos(id)
liquidacion_detalle  liquidacion_detalle_reunion_id_fkey    FOREIGN KEY (reunion_id) REFERENCES reuniones(id)
club_secuencias      club_secuencias_club_id_fkey           FOREIGN KEY (club_id) REFERENCES clubs(id)
club_secuencias      club_secuencias_pkey                   PRIMARY KEY (club_id, tipo)
recibos              chk_recibo_beneficiario                CHECK ((((beneficiario_tipo = 'profesional') AND (profesional_id IS NOT NULL) AND (propietario_id IS NULL)) OR ((beneficiario_tipo = 'propietario') AND (propietario_id IS NOT NULL) AND (profesional_id IS NULL))))
recibos              recibos_anulado_por_fkey               FOREIGN KEY (anulado_por) REFERENCES usuarios(id)
recibos              recibos_club_id_fkey                   FOREIGN KEY (club_id) REFERENCES clubs(id)
recibos              recibos_emitido_por_fkey               FOREIGN KEY (emitido_por) REFERENCES usuarios(id)
recibos              recibos_pkey                           PRIMARY KEY (id)
recibos              recibos_profesional_id_fkey            FOREIGN KEY (profesional_id) REFERENCES profesionales(id)
recibos              recibos_propietario_id_fkey            FOREIGN KEY (propietario_id) REFERENCES propietarios(id)
recibos              uq_recibo_por_club                     UNIQUE (club_id, numero_recibo)
```

ENUMs vigentes:

```
estado_linea_liq  = impago, pagado, retenido
concepto_liq      = premio, bono, actuacion, incentivo_jockey, incentivo_entrenador, fondo_solidario
beneficiario_tipo = profesional, propietario, club
forma_pago_recibo = efectivo, transferencia
estado_recibo     = emitido, anulado
```

Lectura:

- **No hay CHECK de signo** en `monto_bruto` / `monto_descuento`. Técnicamente un `monto_bruto = -100000` entra. Pero:
  - `emitir_recibo` (`migrations/emitir_recibo_v1_2_aislamiento_club.sql`) marca como pagadas **todas** las líneas `impago` del beneficiario que le pasan y suma `total_premios`; un negativo se **netearía** contra los premios en el mismo recibo → el recibo diría "cobrás 700.000" cuando en realidad el club pagó 800.000 y cobró 100.000. Dos operaciones de caja distintas en un solo papel, sin rastro de cada una.
  - Tab Pagos (`liquidaciones.html:1147-1260`, grupos `premio/incentivo/bono/actuacion/otros`) y Resumen (buckets por `estado_linea`, reconciliación `pagado + impago + retenido + fondo = total`) suman `monto_neto` como pasivo del club. Un negativo los descuadra en silencio.
  - `anular_recibo` devuelve las líneas a `impago` (o `retenido`): para un cobro, "impago" significaría "el club todavía no cobró", que no es el estado que se quiere expresar.
  - El motor paid-safe (`liquidaciones-engine.js:256-290`) **borra y regenera** las líneas no pagadas en cada oficialización. Una línea de cobro que viva ahí desaparece en el primer recalc si no está "pagada".
- `beneficiario_tipo = 'club'` existe y `fondo_solidario` lo usa (`liquidaciones-engine.js:203-210`): es el club **recibiendo su parte de un reparto** que sale de la bolsa, no el club **cobrándole a alguien**. La dirección de la plata es la misma que en el resto de la tabla (de la bolsa hacia un beneficiario); lo único distinto es que el beneficiario es el propio club. No es un concepto de cobro.
- `concepto_liq`: seis valores, todos egresos.

**Veredicto:** nada reusable como ingreso. El modelo es unidireccional por diseño (ADR-042: "la LÍNEA es la unidad de deuda"). Lo que sí se reusa: el **patrón** (RPC SECURITY DEFINER con guards de club, snapshot jsonb al anular, trigger `fn_auditoria_log`, RLS por `club_id`, serie por club en `club_secuencias`).

### 1.2 Numeración de recibos

`fn_siguiente_recibo` (DB):

```sql
CREATE OR REPLACE FUNCTION public.fn_siguiente_recibo(p_club_id uuid) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_num INTEGER;
BEGIN
  INSERT INTO club_secuencias (club_id, tipo, ultimo_numero)
  VALUES (p_club_id, 'recibo', 1)
  ON CONFLICT (club_id, tipo)
  DO UPDATE SET ultimo_numero = club_secuencias.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_num;
  RETURN v_num;
END $function$
```

Filas actuales de `club_secuencias`:

```
0649e9c5-…(Dolores):recibo=32 | a6da7e40-…(Mi Club Hípico):recibo=19
```

- La tabla ya es multi-serie (`PK (club_id, tipo)`), pero la función tiene `'recibo'` fijo. Opciones: (a) nueva `fn_siguiente_numero(p_club_id uuid, p_tipo text)` genérica y dejar `fn_siguiente_recibo` como wrapper (no rompe `emitir_recibo`); (b) segunda función `fn_siguiente_recibo_cobro`. **(a)**.
- `recibos.uq_recibo_por_club (club_id, numero_recibo)`: si los cobros fueran filas de `recibos`, la serie de cobro chocaría con la de pago en el número 33. Habría que agregar `tipo` y rehacer el UNIQUE a `(club_id, tipo, numero_recibo)`, tocar `chk_recibo_beneficiario` (un cobro no tiene beneficiario profesional/propietario, tiene un *pagador*), y renombrar mentalmente `neto_a_cobrar`. Además la pestaña Recibos (`liquidaciones.html:1709`, `from('recibos')…eq('club_id')`) los listaría mezclados.
- **Conclusión:** serie separada **y tabla separada**. Un recibo de cobro y uno de pago no comparten ni número ni tabla. Lo que comparten es el club y el patrón.

### 1.3 Lo que ya existe y se toca (inventario)

| Pieza | Dónde | Para qué sirve acá |
|---|---|---|
| Modal de turno (bolsa, ventanas) | `carta-llamados.html:381` (`#f-bolsa`), `:440` (`#f-ci-rat`), `:1153/1185/1219` (`bolsa_total`) | Ahí va el input del monto por carrera, al lado de la bolsa |
| Modal de reunión | `reuniones.html:389/431` (`hora_cierre_ratificacion`) | Ahí va el % de retención |
| Gate de montas | `resultados.html:1623-1643` | Ancla del aviso de pozo (después del gate, antes del `confirm` de oficializar) |
| `no_largo` | `resultados.html:756-766`, `resultado_posiciones.no_largo` | Define "pagó y no largó" → devolución |
| Impresión de recibo | `liquidaciones.html:1904` `imprimirReciboCobro(recibo, lineaIds, opts)` (ORIGINAL + DUPLICADO, logo, firma) | Se copia el layout, **no** la función: está atada a `liquidacion_detalle` |
| Anular con motivo | `liquidaciones.html:1562-1580` + RPC `anular_recibo` (foto jsonb en `lineas_anuladas`, ventana 5 días para no-super_admin, `ERRCODE 42501`) | Molde de `devolver_pozo` / `anular_cobro` |
| Aislamiento por club | `emitir_recibo v1.2` (guard del llamador + guard de las filas, doble) | Molde de los guards de `cobrar_pozo` |
| Auditoría | `trg_audit_recibos` → `fn_auditoria_log()` (`migrations/liquidaciones_cd_fase0.sql:159-168`) | Mismo trigger sobre `pozo_cobros` |
| Propietario del ganador | `inscripciones.propietario_id` (derivado por `trg_insc_set_propietario`, NULL si la caballeriza no tiene titular — GOTCHA #47) | Es a quien se le paga en Fase 2; hoy en R9 hay **2** ratificados con NULL (T1 y T6, ver §5.3) |

Búsqueda de antecedentes (contra `main`): ninguna mención previa de la feature.

```
$ grep -rn "ratificaci[oó]n a premios\|pozo entre\|monto_ratificacion\|inscripcion_monto\|derecho de\|cobro_ratif" --include=*.md --include=*.html --include=*.js --include=*.sql . | grep -v node_modules
(sin resultados)
```

---

## 2. Dónde viven los datos

### 2.1 Columnas existentes de `carreras` y `reuniones` (DB real)

```
carreras:  id | reunion_id | numero_turno | nombre | categoria_id | tipo_pista | distancia_metros | edad_minima_anos | edad_maxima_anos | condicion_sexo | condicion_handicap | condicion_adicional | bolsa_total | distribucion_premios | cupo_maximo | hora_estimada | apertura_inscripcion | cierre_inscripcion | apertura_ratificacion | cierre_ratificacion | estado | bolsa_bonos | numero_carrera_programa | apuestas | apuestas_notas | ganadas_desde | ganadas_hasta
reuniones: id | club_id | hipodromo_id | numero | fecha | tipo | estado | tiempo_clima | observaciones | creado_por | created_at | updated_at | hora_cierre_ratificacion | fechas_inscripciones | fechas_forfaits | fechas_compromiso_montas | sorteo_partidores | numero_publico | es_prueba
```

Nada parecido a un monto por caballo ni a un % de retención por reunión. Lo más cercano en espíritu:
- `carreras.bolsa_total` / `bolsa_bonos` (plata **por carrera**, la carga Yesi en el mismo modal) → el monto del pozo es un hermano de estas.
- `liquidacion_config.pct_fondo_solidario` y `comision_config.descuento_*_pct` (porcentajes que el club retiene, **por club**, no por reunión) → la retención del pozo es *por reunión*, así que no va en `liquidacion_config`; a lo sumo un default ahí (§2.3).
- `carrera_apuestas.precio` (un monto por carrera y por tipo) — otro dominio, no reusar.

### 2.2 Nombres propuestos

| Dato | Columna | Tipo | Notas |
|---|---|---|---|
| Monto que paga cada ratificado | **`carreras.pozo_monto_caballo`** | `NUMERIC(15,2) NULL` | `NULL` o `0` = esta carrera **no tiene pozo** (la pantalla de cobro la saltea, el aviso al oficializar no aplica). Se carga en el modal de turno de `carta-llamados.html`, debajo de "Bolsa". Hoy: 100.000 en todas, 200.000 en la Especial. |
| % que retiene el hipódromo | **`reuniones.pozo_retencion_pct`** | `NUMERIC(6,3) NULL, CHECK (pozo_retencion_pct IS NULL OR (pozo_retencion_pct >= 0 AND pozo_retencion_pct <= 100))` | Por reunión. Se carga en el modal de reunión de `reuniones.html`. `NULL` = sin definir → la pantalla del pozo muestra el bruto y avisa "retención sin cargar" en vez de asumir 20. |

Por qué **`pozo_`** y no **`ratificacion_`**: en el repo "ratificación" ya nombra (1) la ventana del entrenador `carreras.apertura/cierre_ratificacion`, (2) el cierre de carga de secretaría `reuniones.hora_cierre_ratificacion`, (3) el estado `inscripciones.estado='ratificado'`. ISSUE-075 documenta la confusión entre (1) y (2). Un `carreras.ratificacion_monto` al lado de `cierre_ratificacion` invita a leerlo como "monto de la ventana". `pozo_` es el sustantivo que usa Fede ("es un pozo entre los que corren") y no colisiona con nada. Si se prefiere el nombre de negocio en la UI, el rótulo de pantalla puede decir "Ratificación a premios ($ por caballo)" y la columna seguir siendo `pozo_monto_caballo`.

Alternativas descartadas: `carreras.derecho_ratificacion` (suena a arancel administrativo; no lo es, es un pozo que vuelve), `carreras.cuota_pozo` ("cuota" sugiere pagos parciales), `reuniones.retencion_pct` (ambiguo con la retención anti-doping de `liquidacion_config.dias_antidoping`, que también se llama "retención" en toda la UI).

### 2.3 Default del % (opcional, no bloquea)

Si Yesi tiene que escribir "20" en cada reunión, se va a olvidar una vez. Opción barata: `liquidacion_config.pozo_retencion_pct_default NUMERIC(6,3) NULL` y que `reuniones.html` **prellene** el input con ese valor al crear la reunión (la columna de `reuniones` sigue siendo la que manda; el default sólo evita el olvido). No lo pongo en el DDL mínimo de Fase 1; queda como decisión (§8-5).

---

## 3. El cobro

### 3.1 Tabla `pozo_cobros` (una fila por inscripción cobrada)

```sql
CREATE TYPE estado_pozo_cobro AS ENUM ('cobrado', 'devuelto', 'anulado');

CREATE TABLE pozo_cobros (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           uuid NOT NULL REFERENCES clubs(id),
  reunion_id        uuid NOT NULL REFERENCES reuniones(id),
  carrera_id        uuid NOT NULL REFERENCES carreras(id),
  inscripcion_id    uuid NOT NULL REFERENCES inscripciones(id),
  numero_recibo     integer NOT NULL,                 -- serie 'recibo_cobro', por club
  monto             numeric(15,2) NOT NULL CHECK (monto > 0),   -- SNAPSHOT de carreras.pozo_monto_caballo al cobrar
  forma_pago        forma_pago_recibo NOT NULL,       -- reusa el ENUM (efectivo/transferencia)
  pagador_nombre    text,                             -- quién trajo la plata (libre: puede ser el entrenador, un peón, el propietario)
  pagador_documento text,
  comprobante_url   text,
  estado            estado_pozo_cobro NOT NULL DEFAULT 'cobrado',
  cobrado_por       uuid REFERENCES usuarios(id),
  cobrado_at        timestamptz NOT NULL DEFAULT now(),
  -- devolución (plata que VOLVIÓ a salir) — §4
  devuelto_at       timestamptz,
  devuelto_por      uuid REFERENCES usuarios(id),
  motivo_devolucion text,
  devolucion_forma_pago forma_pago_recibo,
  -- anulación (registro erróneo: la plata nunca entró) — §4
  anulado_at        timestamptz,
  anulado_por       uuid REFERENCES usuarios(id),
  motivo_anulacion  text,
  foto_anulacion    jsonb,                            -- to_jsonb(fila) antes de cambiar de estado (patrón anular_recibo v2)
  notas             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pozo_cobro_numero UNIQUE (club_id, numero_recibo)
);
-- Un solo cobro VIVO por inscripción; los devueltos/anulados pueden repetirse (se cobró, se devolvió, volvió a pagar).
CREATE UNIQUE INDEX uq_pozo_cobro_vivo ON pozo_cobros (inscripcion_id) WHERE estado = 'cobrado';
CREATE INDEX idx_pozo_cobros_carrera ON pozo_cobros (carrera_id, estado);
CREATE INDEX idx_pozo_cobros_reunion ON pozo_cobros (reunion_id, estado);
-- RLS igual que recibos: FOR ALL TO authenticated USING/WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id())
-- pero SIN INSERT/UPDATE/DELETE directo para authenticated: todo por RPC (como recibos post revocar_recibos_delete.sql).
-- Auditoría: CREATE TRIGGER trg_audit_pozo_cobros AFTER INSERT OR UPDATE OR DELETE ON pozo_cobros FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();
```

Decisiones dentro de la tabla:
- **`monto` es snapshot.** Si Yesi corrige `pozo_monto_caballo` después de cobrar, lo cobrado no cambia (mismo criterio que `liquidacion_detalle.monto_bruto` vs `liquidacion_config`, ver informe de incentivos de hoy). El pozo se calcula sobre lo **cobrado**, no sobre la columna.
- **`inscripcion_id`** y no `spc_id`: el pozo es por caballo-en-esta-carrera. Si el mismo caballo corre dos carreras (no pasa en Dolores, pero el modelo lo permite), paga dos veces.
- **`pagador_*` libre** en vez de FK a propietario/profesional: la plata la trae quien la trae. El vínculo formal (a quién se le devuelve, a quién se le paga si gana) sale de la inscripción (`caballeriza_id` / `propietario_id` / `entrenador_id`), no del cobro.
- **Sin `numero_recibo` de devolución** en Fase 1: la devolución imprime un "comprobante de devolución" que referencia el número del cobro (`Devolución del recibo de cobro N° 12`). Si Valeria necesita serie propia para devoluciones, es una columna más (`numero_devolucion` + `tipo='devolucion_pozo'` en `club_secuencias`), no un rediseño. Pregunta §8-3.

### 3.2 Funciones

```sql
-- Serie genérica (a). fn_siguiente_recibo queda como wrapper → emitir_recibo no se toca.
CREATE OR REPLACE FUNCTION fn_siguiente_numero(p_club_id uuid, p_tipo text) RETURNS integer ...   -- mismo cuerpo, p_tipo en vez de 'recibo'
CREATE OR REPLACE FUNCTION fn_siguiente_recibo(p_club_id uuid) RETURNS integer AS $$ SELECT fn_siguiente_numero(p_club_id, 'recibo') $$ ...

-- Cobro
CREATE OR REPLACE FUNCTION cobrar_pozo(
  p_inscripcion_id uuid, p_forma_pago forma_pago_recibo,
  p_pagador_nombre text DEFAULT NULL, p_pagador_documento text DEFAULT NULL,
  p_comprobante_url text DEFAULT NULL, p_notas text DEFAULT NULL
) RETURNS pozo_cobros  SECURITY DEFINER SET search_path = public
-- Guards, en este orden (todos ANTES de consumir el número):
--  1. inscripción existe; se lockea FOR UPDATE; se resuelven carrera, reunión, club.
--  2. club: fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin() AND club <> mío → 42501 (patrón emitir_recibo v1.2).
--  3. inscripciones.estado = 'ratificado' → si no: RAISE 'cobrar_pozo: el caballo no está ratificado (estado %)'. (Ver §8-1: ¿se cobra a inscriptos antes de ratificar?)
--  4. carreras.pozo_monto_caballo > 0 → si no: RAISE 'cobrar_pozo: la carrera no tiene monto de pozo cargado'.
--  5. carrera no anulada (.estado IS DISTINCT FROM 'anulada' — NULL-safe, gotcha #5).
--  6. no existe pozo_cobros con esa inscripcion_id y estado='cobrado' (el índice parcial lo garantiza; el guard da mensaje legible).
--  7. reuniones.es_prueba → se permite (sandbox 9999), pero la pantalla lo rotula ⚗ PRUEBA igual que Pagos (ISSUE-055).
--  Luego: numero = fn_siguiente_numero(club, 'recibo_cobro'); INSERT con monto = carreras.pozo_monto_caballo; cobrado_por = usuarios.id del auth.uid() (FK a usuarios, NO auth.users — nota 4 de emitir_recibo v1.2).
```

¿Cobrar **antes** de que el resultado exista? Sí, ese es el caso normal (se cobra el domingo a la mañana o el sábado). El RPC no mira `resultados`.

### 3.3 Pantalla: `pozo.html` (archivo nuevo)

Por qué archivo nuevo y no una pestaña más en `liquidaciones.html`: ese archivo tiene **2.092 líneas** y cinco pestañas que comparten `liqConfig`, `profesionales`, `propietariosMap` y el selector de reunión; el pozo no necesita nada de eso y su usuaria (Valeria en la ventanilla) no necesita ver Pagos/Recibos/Resumen al lado. Un módulo autocontenido sigue la convención del repo (un HTML por módulo, `initAuth()`, `ActiveReunion`), entra al `club-switcher.js` como la 17ª página, y es probeable por extracción de bloque.

Layout (todo en una pantalla, sin navegación intermedia):

```
┌ Pozo — Reunión 10 · 04/10/2026 · Hipódromo de Dolores          [reunión ▾]   retención 20 % ┐
│                                                                                             │
│  T3 · Carrera 3 · DÍA DE LA PRIMAVERA · 13 ratificados · $100.000 c/u                       │
│  Esperado $1.300.000 · Cobrado $900.000 (9/13) · Retención $180.000 · Al ganador $720.000   │
│  ┌──┬────────────────────┬──────────────────┬────────┬────────────┬──────────────────────┐ │
│  │# │ Ejemplar           │ Caballeriza      │ Estado │ Recibo     │                      │ │
│  │1 │ DAHUA              │ LOS URONES       │ ✓ Pagó │ C-0012     │ [Imprimir] [Devolver]│ │
│  │2 │ NIÑO OCEANICO      │ EL CHAÑAR        │ Falta  │            │ [Cobrar]             │ │
│  │3 │ SOUTH GOTICO       │ …                │ ↩ Dev. │ C-0007 dev.│ [Cobrar de nuevo]    │ │
│  └──┴────────────────────┴──────────────────┴────────┴────────────┴──────────────────────┘ │
│  T4 · … (carreras sin pozo_monto_caballo: colapsadas con "sin pozo")                        │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

- `#` = mandil derivado con `renumerarChapas` (regla de oro: nunca `numero_partidor`).
- Orden de las filas: alfabético `es` como `inscripciones.html`/`ratificacion.html` (probe `probe_orden_inscriptos.mjs`), o por mandil — lo que Valeria prefiera para cobrar en ventanilla (§8-6).
- **Cobrar** → modal: forma de pago (efectivo/transferencia), pagador (nombre/DNI, prellenado con el titular de la caballeriza si hay), comprobante (URL opcional), notas → `sb.rpc('cobrar_pozo', …)` → toast + abre impresión del recibo.
- **Recibo de cobro**: mismo papel que `imprimirReciboCobro` (logo del club, ORIGINAL/DUPLICADO, pie con firma), con encabezado **"RECIBO DE COBRO — Ratificación a premios"**, número `C-NNNN` (prefijo en pantalla y en el papel para que nadie lo confunda con un recibo de pago `NNNN`), carrera, ejemplar, caballeriza, monto, forma, pagador, y la leyenda "Este importe integra el pozo de la carrera N y se devuelve si el ejemplar no larga". Función nueva `imprimirReciboPozo(cobro)`; no se toca `imprimirReciboCobro`.
- Filtro/atajo: "Sólo los que faltan" (checkbox), para la última pasada antes de la carrera.
- Estados de fila: **Falta** (ratificado sin cobro vivo) · **✓ Pagó** (cobro `cobrado`) · **↩ Devuelto** (`devuelto`, con el número) · **✗ Anulado** (sólo si se despliega historial) · **— No ratificado** (forfait/mal_inscrito: no se muestra salvo que tenga un cobro vivo, en cuyo caso aparece con el botón Devolver resaltado — es el caso "pagó y después no corre").

### 3.4 Aviso al oficializar (`resultados.html`)

Después del gate de montas (`resultados.html:1643`) y antes del `confirm` de oficializar (`:1644`), un bloque nuevo con anclas propias para el probe:

```javascript
  // ═══ AVISO POZO — INICIO ═══
  // Aviso, NO bloqueo (a diferencia del gate de montas, que es duro): si algún caballo que
  // largó no tiene cobro vivo del pozo, se muestra la lista y se pregunta "¿Oficializar igual?".
  // No frena la oficialización con gente esperando; lo que no se cobró queda visible en pozo.html.
  const faltanPozo = await pozoFaltantes(carreraId);   // ratificados con no_largo=false y sin pozo_cobros 'cobrado'; [] si la carrera no tiene pozo_monto_caballo
  if (faltanPozo.length) {
    const lista = faltanPozo.map(n => `  • ${n}`).join('\n');
    if (!confirm(`Atención: ${faltanPozo.length} caballo(s) que largaron no pagaron la ratificación a premios:\n\n${lista}\n\n`
               + `El pozo se calcula sólo con lo cobrado.\n\n¿Oficializar igual?`)) return;
  }
  // ═══ AVISO POZO — FIN ═══
```

- Sólo cuenta los que **largaron** (`no_largo=false`): un ratificado que no largó y no pagó no debe nada.
- Si la carrera no tiene `pozo_monto_caballo`, el bloque no hace ninguna query ni muestra nada.
- **Por qué avisa y no bloquea — decisión de Fede, no consistencia con montas (asentado 19/09):** el gate de montas (`:1623-1643`) hace `confirm(...) → return` sin opción de seguir: es bloqueo duro, y su comentario lo justifica ("el 20/09 la carga la hace alguien que usa SGH por primera vez, que a una advertencia le da Aceptar"). El aviso del pozo es deliberadamente **más blando**, y no por seguir a montas (Leonardo, 19/09: "yo dije 'mismo criterio' y es al revés") sino porque **Fede y Valeria lo decidieron así**: un bloqueo duro frenaría la oficialización con gente esperando. Es razonable además porque el faltante queda visible y cobrable después en `pozo.html`, cosa que con el jockey no pasaba (la línea se perdía en silencio). El comentario del bloque en `resultados.html` tiene que decir esto mismo, para que nadie lo "unifique" con montas en un refactor.

### 3.5 Carga del monto y del % (mínimo de UI)

- `carta-llamados.html`, modal de turno: input `#f-pozo` "Ratificación a premios ($ por caballo)" con `bindARSInput`/`fmtInput` como `#f-bolsa` (`:381`); leer en `:1153`, escribir en `:1219` (`pozo_monto_caballo`). Mostrarlo también en la tarjeta del turno junto a la bolsa (`:899`, `:1045`), para que se vea sin abrir el modal.
- `reuniones.html`, modal de reunión: input `#f-pozo-pct` "Retención del pozo (%)" `type=number min=0 max=100 step=0.01`, al lado de `#f-hora-cierre-rat` (`:389`/`:431`).
- ¿Va el monto al programa oficial / carta de llamados impresa? Probablemente sí ("Ratificación: $100.000"), pero es texto de programa y lo decide Fede (§8-7). No en Fase 1.

---

## 4. La devolución (y la anulación, que es otra cosa)

Dos operaciones distintas, las dos sin borrar:

| | Devolver | Anular |
|---|---|---|
| Qué pasó en la realidad | La plata entró y **vuelve a salir** (pagó, no largó) | La plata **nunca entró** (se registró por error: caballo equivocado, doble carga) |
| Estado final | `devuelto` | `anulado` |
| Qué se guarda | `devuelto_at/por`, `motivo_devolucion` (obligatorio), `devolucion_forma_pago`, `foto_anulacion = to_jsonb(fila)` | `anulado_at/por`, `motivo_anulacion` (obligatorio), `foto_anulacion` |
| Guards | `estado='cobrado'`; club; y **una** de: `resultado_posiciones.no_largo=true` para la inscripción, o `inscripciones.estado ∉ {ratificado}` (forfait/mal_inscrito después de cobrar), o carrera `anulada`. Si no se cumple ninguna → RAISE `'devolver_pozo: el caballo largó (o la carrera no está resuelta) — la devolución sólo aplica a quien no corrió'`. Un super_admin puede forzar con `p_forzar=true` (queda en el motivo). | `estado='cobrado'`; club; ventana **5 días** desde `cobrado_at` para no-super_admin (copiado de `anular_recibo`) |
| Efecto en el pozo | Sale del pozo (`estado <> 'cobrado'`) | Sale del pozo |
| Papel | "COMPROBANTE DE DEVOLUCIÓN — ref. recibo de cobro C-NNNN", firma del que recibe la plata | Nada (o el recibo original con sello ANULADO si se reimprime) |
| Número propio | No en Fase 1 (§8-3) | No |
| Vuelve a cobrarse | Sí: el índice parcial `uq_pozo_cobro_vivo` sólo mira `estado='cobrado'`, así que un caballo devuelto puede tener un cobro nuevo si vuelve a ratificarse (reunión reprogramada) | Ídem |

RPCs: `devolver_pozo(p_cobro_id uuid, p_motivo text, p_forma_pago forma_pago_recibo, p_forzar boolean DEFAULT false) RETURNS pozo_cobros` y `anular_cobro_pozo(p_cobro_id uuid, p_motivo text) RETURNS pozo_cobros`. Cuerpo calcado de `anular_recibo`: `FOR UPDATE`, motivo no vacío, ya-anulado → RAISE, `UPDATE … WHERE estado='cobrado' RETURNING`, `IF NOT FOUND → 'cambió de estado durante la operación'`.

Caso "pagó, largó y después lo descalificaron": **no** se devuelve (largó). Caso "carrera anulada después de cobrar": se devuelve todo; la pantalla ofrece "Devolver todos" que llama al RPC N veces (sin RPC masivo en Fase 1).

Caso pendiente de Fase 2 (sólo se anota): si el ganador ya cobró el pozo y después aparece una devolución de esa carrera, el pozo baja y el pago quedó hecho por más. Se resuelve con el mismo guard que `desoficializar_carrera`: **no se devuelve si el pozo de esa carrera ya fue pagado al ganador** (RAISE), salvo super_admin.

---

## 5. El pozo

### 5.1 Definición (calculado, sin persistir en Fase 1)

Para una carrera `c` de reunión `r`:

```
n_ratificados   = count(inscripciones estado='ratificado' de c)
esperado        = n_ratificados × c.pozo_monto_caballo
cobrado_bruto   = Σ pozo_cobros.monto WHERE carrera_id = c AND estado = 'cobrado'
retencion       = round(cobrado_bruto × r.pozo_retencion_pct / 100, 2)
al_ganador      = cobrado_bruto − retencion
```

- Se calcula sobre **lo cobrado**, no sobre lo esperado. Ejemplo de Fede: 10 × 100.000 = 1.000.000; retención 20 % = 200.000; ganador 800.000 — vale si los 10 pagaron. Si pagaron 9, el pozo es 900.000 / 180.000 / 720.000 y el aviso de §3.4 lo dice al oficializar. (¿O el que no pagó igual "debe" y el ganador cobra sobre el esperado? Pregunta §8-2 — cambia la fórmula.)
- `retencion` se calcula con el `pct` **de la reunión en el momento de mostrar**. Cuando en Fase 2 se pague al ganador, ahí se congela (snapshot del pct y del bruto en la fila de pago). Hasta entonces, cambiar el % en `reuniones.html` cambia la vista — correcto, todavía no se pagó nada.
- Empate en el 1° (dead-heat, el motor ya lo maneja en `liquidaciones-engine.js:176`): `al_ganador / n_empatados`. Se anota para Fase 2; en Fase 1 la cabecera muestra el total.

### 5.2 Vista SQL `v_pozo_carrera`

Una vista (no materializada, RLS via las tablas base) con `carrera_id, reunion_id, club_id, numero_turno, numero_carrera_programa, pozo_monto_caballo, pozo_retencion_pct, n_ratificados, n_cobrados, n_devueltos, esperado, cobrado_bruto, retencion, al_ganador`. La consumen `pozo.html` (cabecera por carrera), `resultados.html` (chip) y los probes. Una sola definición de la fórmula, en la DB — si mañana cambia la regla del §8-2 se cambia en un lugar.

### 5.3 Dónde se ve

| Dónde | Qué | Cuándo |
|---|---|---|
| `pozo.html` cabecera de cada carrera | Esperado · Cobrado (n/N) · Retención · Al ganador | Siempre — es "antes de que corra" |
| `pozo.html` cabecera de reunión | Σ de las carreras: Cobrado total · Retención total (lo que queda en el hipódromo) · Devuelto | Siempre |
| `resultados.html` cabecera de carrera | Chip read-only "Pozo $720.000 (9/13)" con link a `pozo.html` | Al cargar el resultado, para que quien oficializa vea con qué pozo lo hace |
| `liquidaciones.html` Resumen | **No en Fase 1.** El pozo no es bolsa del club; mezclarlo en los buckets de Resumen descuadra la reconciliación `pagado+impago+retenido+fondo=total`. Cuando exista Fase 2 se agrega un bloque aparte "Pozo de ratificación: cobrado / devuelto / retenido / pagado a ganadores", con su propia reconciliación `cobrado = devuelto + retenido + pagado + pendiente`. |

Simulación con R9 tal como está hoy (solo para dimensionar; R9 no va a tener pozo en el sistema):

```sql
select ca.numero_turno, ca.nombre, ca.bolsa_total, ca.estado,
       count(*) filter (where i.estado='ratificado') as ratificados,
       count(*) filter (where i.estado='ratificado' and i.propietario_id is null) as ratif_sin_propietario
from carreras ca left join inscripciones i on i.carrera_id=ca.id
where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' group by 1,2,3,4 order by 1;
```
```
T1  MODO PRIMAVERA                          1054166.67  null      9 ratificados  (1 sin propietario)
T2  —                                       1016666.67  anulada   0
T3  DIA DE LA PRIMAVERA                     1118333.33  abierta  13
T4  VIRGEN NUESTRA SEÑORA DE LOS DOLORES    1000000.00  abierta  11
T5  DIA DE LA SECRETARIA                    1166666.67  abierta   7
T6  DIA DEL MAESTRO                         1083333.33  abierta   7  (1 sin propietario)
T7  DIA DEL ESTUDIANTE                      1191666.67  abierta   8
T8  —                                       1191666.67  anulada   0
T9  ESPECIAL VELOCES                        3333333.33  abierta   6
T10 —                                       1833333.33  anulada   0
T11 DOMINGO FAUSTINO SARMIENTO              1833333.33  abierta  13
```

Con 100.000 en las 7 comunes (68 ratificados) y 200.000 en la Especial (6): esperado **$8.000.000**; retención 20 % **$1.600.000** para el hipódromo; **$6.400.000** a repartir entre 8 ganadores (de $560.000 a $1.040.000 según carrera — en T3/T11 el pozo neto es comparable al 60 % de la bolsa que hoy cobra el 1°). Es plata del orden de los premios, no un accesorio: justifica RPC + serie + auditoría desde el día uno y no una planilla.

Nota al margen: los 2 ratificados sin `propietario_id` (T1, T6) son los que en Fase 2 no tendrían a quién pagarle si ganan — el mismo agujero de GOTCHA #47 que ya afecta a los premios. Al 16/09 eran 15; Yesi lo viene cerrando.

---

## 6. Pago al ganador: ¿línea de su liquidación o circuito aparte? (análisis, sin decidir)

### Opción A — una línea más en `liquidacion_detalle` (`concepto_tipo = 'pozo_ratificacion'`, beneficiario = propietario del 1°)

A favor:
- **Un solo recibo.** El propietario del ganador pasa por Pagos, lo buscan por nombre/DNI, y cobra premio + bono + pozo juntos. Es lo que Valeria pidió para los incentivos ("destildo los demás y tildo solamente…", `liquidaciones.html:1250`) y funciona con el buscador, los grupos de cobro, el filtro por carrera y el recibo con logo/firma **sin tocar nada**.
- El motor ya resuelve **quién es el propietario del 1°**, incluidos empate (dead-heat), descalificado y `propietario_id` NULL (`liquidaciones-engine.js:176-197`). Sería un `addActor(insc.propietario_id, 'propietario', { premio: al_ganador, pct: 1, conceptoTipo: 'pozo_ratificacion', … })` al lado del bono del 1°. ~15 líneas.
- Paid-safe gratis: si se paga y después se recalcula, la línea se preserva por clave.
- `anular_recibo`, `liberar_linea`, Resumen por beneficiario, aislamiento por club: todo aplica.
- DDL mínimo: `ALTER TYPE concepto_liq ADD VALUE IF NOT EXISTS 'pozo_ratificacion'` (gotcha #11, sin rollback posible pero inofensivo).

En contra:
- **La liquidación pasa a depender de la caja.** Hoy `generarLiquidacionesReunion` es función de (resultados oficiales, config, comisiones): dos recalcs con los mismos datos dan lo mismo. Con el pozo adentro, el monto de la línea depende de **cuántos cobros vivos hay en ese instante**. Si se oficializa con 9/13 cobrados y el 10° paga a la tarde, la línea del ganador queda en 720.000 hasta que alguien recalcule; si ya se pagó, queda mal para siempre (preservada por clave — la clave no incluye el monto). Y a la inversa: una devolución posterior baja el pozo pero no la línea pagada.
- **Contamina el Resumen.** "Total liquidado" sumaría plata que no es del club; la reconciliación `pagado+impago+retenido+fondo=total` sigue cuadrando aritméticamente pero deja de significar "lo que la bolsa reparte". Habría que excluir el `concepto_tipo` en cada bucket (4-5 lugares en `liquidaciones.html:1990-2092`) o aceptar que Resumen mida otra cosa.
- **¿Retención anti-doping?** Los premios de 1° y 2° quedan `retenido` 30 días (Fase C). Si el pozo va como línea, hay que decidir si también (es plata que cobra el ganador; si el doping da positivo, ¿se devuelve al pozo? ¿a los demás?). Con línea propia la decisión es un `if` en el motor; con circuito aparte hay que construir la retención de cero. Pregunta §8-4.
- **Fondo solidario / comisiones:** `descPct` se aplica sólo a `conceptoTipo === 'premio'` (`liquidaciones-engine.js:294-298`), así que el pozo no sufriría el 2 % ni las comisiones por accidente — bien. Pero hay que dejarlo escrito para que nadie lo "arregle".
- Semánticamente, `liquidaciones.reunion_id` + `total_bruto` se leen como "lo que el club debe por la reunión". El pozo es plata **de los propietarios entre sí** que el club sólo custodia.

### Opción B — circuito aparte (`pozo_pagos`: una fila por carrera pagada, con snapshot del bruto, pct, retención y neto; serie propia `recibo_pozo`; pantalla en `pozo.html`)

A favor:
- **Ciclo cerrado y reconciliable solo:** `Σ cobrado = Σ devuelto + Σ retenido + Σ pagado + pendiente`, todo en dos tablas (`pozo_cobros`, `pozo_pagos`) sin tocar `liquidacion_detalle`. La caja del pozo se audita en una pantalla.
- El pago **congela** bruto/pct/neto en el momento de pagar (como `recibos` congela `total_premios`): ningún recalc posterior lo mueve, ningún cobro tardío lo mueve. Si llega un cobro tardío después de pagar, queda como "cobrado pero no repartido" y es visible — no se pierde ni se paga dos veces.
- El motor de liquidaciones sigue siendo puro (resultados → deuda). Cero riesgo de regresión en lo que ya cobra R6/R8/R9.
- La decisión de anti-doping se toma aparte y no arrastra a los premios.

En contra:
- **Dos recibos para la misma persona el mismo día**, dos búsquedas, dos pantallas. El propietario del ganador cobra en Pagos y después en Pozo. Es exactamente lo que Valeria no quería con los incentivos.
- Duplica infraestructura: buscador por propietario, impresión, anulación con motivo, ventana de 5 días, aislamiento por club — todo eso ya existe en `recibos`/`emitir_recibo` y habría que reescribirlo (o generalizar `recibos` con `tipo`, que es tocar `chk_recibo_beneficiario`, `uq_recibo_por_club`, la pestaña Recibos y los 6 probes de recibos).
- Empate en el 1° y `propietario_id` NULL: hay que resolverlos de nuevo (el motor ya los resuelve).
- El "Resumen" de cierre de reunión queda partido en dos lugares.

### Híbrido posible (lo dejo anotado, no lo recomiendo sin ver Fase 1 andando)

Circuito aparte para **calcular y congelar** (`pozo_pagos` con bruto/pct/neto), y **al pagar** inyectar una línea `pozo_ratificacion` ya congelada en la liquidación del propietario para que salga en el mismo recibo. Junta lo mejor de las dos, pero son dos fuentes de verdad para el mismo número y hay que mantenerlas iguales (`anular_recibo` tendría que soltar también la fila de `pozo_pagos`). Más piezas móviles que cualquiera de las dos puras.

### Qué inclinaría la balanza (para Fede/Valeria, antes de decidir)

1. ¿El propietario del ganador **tiene que** cobrar todo junto en un papel, o le da igual firmar dos? Si tiene que → A o híbrido. Si le da igual → B, sin dudar.
2. ¿El pozo se paga **el mismo día** que el premio (con retención anti-doping 30 días) o **en el momento**, después de la carrera, en efectivo, como un pozo de amigos? Si es en el momento → B (la liquidación se genera al oficializar, tarde para eso; y no hay retención). Si es con el premio → A.
3. ¿Qué pasa con el que no pagó y ganó? (§8-2) Si "no cobra el pozo hasta que pague su parte", eso es una regla de caja que vive mejor en B.

Mi lectura, sin decidir: las reglas que dictó Fede ("plata que ENTRA y después SALE", "distinto de todo lo que hay", devolución si no larga, dos recibos) describen un **ciclo de caja**, y el modelo de liquidaciones es de **deuda por resultado**. Eso empuja a B. Lo que empuja a A es un solo hecho, operativo y fuerte: Valeria en la ventanilla con un propietario adelante. La pregunta 2 decide.

---

## 7. Orden de construcción de Fase 1 y verificación

| # | Pieza | Archivos | Estimación |
|---|---|---|---|
| 1 | DDL: 2 columnas + ENUM + `pozo_cobros` + índices + RLS + trigger auditoría + `fn_siguiente_numero` (+ wrapper) + `v_pozo_carrera` | `migrations/pozo_fase1_cobro.sql` (una sola, idempotente) | ~150 líneas SQL |
| 2 | RPCs `cobrar_pozo`, `devolver_pozo`, `anular_cobro_pozo` | misma migración o `migrations/rpc_pozo_cobro.sql` | ~200 líneas |
| 3 | Carga del monto y del % | `carta-llamados.html` (modal turno + tarjeta), `reuniones.html` (modal) | ~40 líneas |
| 4 | `pozo.html` | nuevo (~700 líneas con CSS del repo), alta en `club-switcher.js`, link en `index.html` | el grueso |
| 5 | Aviso al oficializar + chip | `resultados.html` (bloque con anclas + `pozoFaltantes()` + chip en cabecera) | ~50 líneas |
| 6 | Docs | `SCHEMA.md`/`docs/SCHEMA.md`, `docs/MODULOS.md`, `CHANGELOG.md`, `docs/DECISIONES.md` (ADR: pozo fuera de `liquidacion_detalle`; serie separada), `CLAUDE.md` (árbol) | — |

Probes (patrón `tests/README.md`, código real, snapshot→run→assert→restore, contra la sandbox 9999 con `es_prueba`):

- `tests/probe_pozo_cobro.mjs` — RPC `cobrar_pozo`: guards 3-6 (no ratificado / sin monto / anulada / doble cobro → RAISE con texto exacto), snapshot del monto (cambiar `pozo_monto_caballo` después y verificar que el cobro no se movió), serie `recibo_cobro` correlativa y **separada** de `recibo` (`club_secuencias` antes/después: `recibo` no se movió), `cobrado_por` = usuario, aislamiento por club (usuario de MCH → 42501), auditoría con `datos_despues`. ESCRIBE; teardown por estado.
- `tests/probe_pozo_devolucion.mjs` — `devolver_pozo`: no largó → ok, foto jsonb, `estado='devuelto'`, se puede volver a cobrar; largó → RAISE; `anular_cobro_pozo`: ventana 5 días (mutar `cobrado_at`), motivo obligatorio; ambos salen de `v_pozo_carrera`.
- `tests/probe_pozo_vista.mjs` — `v_pozo_carrera` con 3 cobros + 1 devuelto + pct 20 → esperado/bruto/retención/neto exactos; pct NULL → retención NULL y neto NULL (no 0).
- `tests/probe_pozo_aviso_oficializar.mjs` — extrae el bloque `AVISO POZO` de `resultados.html` por anclas, lo corre con `confirm` stub: con faltantes y `confirm→false` no oficializa; con `confirm→true` sigue; sin `pozo_monto_caballo` no llama a `confirm`; sólo cuenta `no_largo=false`. Mutante: quitar el `if (!confirm…) return` → el probe tiene que fallar.
- `tests/probe_pozo_html.mjs` — extrae de `pozo.html` el render de la tabla: mandil por `renumerarChapas`, estados de fila, carreras sin pozo colapsadas, rótulo ⚗ PRUEBA.

Gate antes de merge: informe GATE en `reports` con los 5 probes + mutantes, md5 contra `sigh.com.ar` después del deploy (protocolo de `docs/diagnosticos/2026-09-17_carta-llamados-pdf-numero-turno_GATE.md`).

---

## 8. Preguntas abiertas (para Fede / Valeria / Yesi)

1. **¿Se cobra sólo a ratificados, o también a inscriptos antes de la ratificación?** El plan asume ratificados (guard 3 de `cobrar_pozo`). Si Valeria cobra el jueves cuando todavía están `inscripto`, el guard tiene que aceptar `inscripto` y la devolución cubrir "no ratificó".
2. **El que no pagó y largó: ¿el pozo se calcula sobre lo cobrado (plan) o sobre lo esperado?** Y si ese caballo gana, ¿cobra el pozo igual, cobra menos su parte, o no cobra hasta pagar? Cambia la fórmula de §5.1 y el guard de Fase 2.
3. **¿La devolución necesita número propio de comprobante** o alcanza con "devolución del recibo de cobro C-NNNN"?
4. **¿El pago del pozo al ganador tiene retención anti-doping** (30 días como el premio) o se paga en el momento? Es la pregunta que más pesa en §6.
5. **¿Default del % de retención** por club (`liquidacion_config`, prellena el modal de reunión) o Yesi lo escribe cada vez?
6. **Orden de la lista en ventanilla:** alfabético (como inscripciones) o por mandil.
7. **¿El monto va impreso** en el programa oficial / carta de llamados ("Ratificación a premios: $100.000")?
8. **Recibo de cobro: ¿a nombre de quién?** El plan guarda pagador libre (quien trae la plata) + vínculo a la inscripción (caballeriza/propietario). ¿Valeria quiere que el papel diga la caballeriza, el propietario, o el que pagó?
9. **¿Efectivo y transferencia, o sólo efectivo?** El ENUM `forma_pago_recibo` ya tiene los dos; si es sólo efectivo, se fija en el RPC.

---

## 9. Verificación de publicación

(se completa abajo con `git ls-remote`)

```
$ git push -u origin reports
$ git ls-remote origin reports
0ec6fa161cf93299c352454794a03363befe8f8d	refs/heads/reports
$ git rev-parse HEAD
0ec6fa161cf93299c352454794a03363befe8f8d
```
(commit del informe; este apéndice va en el commit siguiente)
