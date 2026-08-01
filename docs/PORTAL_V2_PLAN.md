# PORTAL v2 — Plan de rediseño del acceso de entrenadores y propietarios

**Fecha:** 01/08/2026
**Estado:** PROPUESTA. No se ejecutó ni una línea de código ni una migración.
**Proyecto Supabase:** `unlhcuanfrtpatoipwve`
**Guard verificado:** `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅
**Insumo previo:** `docs/ANALISIS_R6_PORTAL.md` (branch `tmp/analisis-r6-portal`, SHA `fa1d6d5`)

Todo el SQL de este documento es **propuesta**. Nada fue aplicado.

---

## Decisiones de entrada (dadas, no se re-discuten)

1. **Una cuenta por persona, sin selector de rol.** Las secciones se muestran según lo que la persona *tiene*, no según `usuarios.rol`. Matchea en `profesionales` → sección entrenador. Matchea en `propietarios` → sección propietario. Ambas → ambas. Sección sin datos → no se muestra.
2. **Alcance v1: VER + INSCRIBIR.** Ratificar/forfait **no** entra. Queda como fase 2 sujeta a confirmación de Fede.

---

## Resumen ejecutivo

El portal actual no se puede arreglar con parches. Se encontraron **9 defectos funcionales** en `portal.html` (varios de los cuales lo dejan inservible aun con datos cargados) y **8 huecos de seguridad** en las policies, cuatro de ellos con `USING (true)`.

El hallazgo más grave no es de datos sino de permisos: **la identidad del portal se deriva del email de `propietarios`/`profesionales`, y cualquier usuario autenticado puede escribir ese email** (`propietarios_update` con `USING (true)`). Es una cadena de suplantación completa: cambio el email de un propietario a uno mío, entro al portal, y el portal me reconoce como esa persona y me muestra su plata. Además, `liquidaciones`, `liquidacion_detalle` y `recibos` son legibles a nivel club, con lo cual **cualquier cuenta de portal ve los premios de todos los propietarios y profesionales de Dolores**, esté suplantando a alguien o no.

Orden de trabajo propuesto: **primero la DB (seguridad y datos), después la UI**. El repo es público; la publishable key está en el HTML por diseño y RLS es la única frontera real.

---

## A. Origen de datos — ¿de dónde sale "mis caballos"?

### A.1 Situación medida

| Fuente | Estado | Cobertura |
|---|---|---|
| `spcs.entrenador_id` | **NULL en 144/144** | 0 % |
| `spcs.caballeriza_id` | **NULL en 144/144** | 0 % |
| `spc_propietarios` | **0 filas** | 0 % |
| `inscripciones.entrenador_id` | cargado | 121/125 en R6 · **126 SPCs distintos** en toda la base |
| `inscripciones.caballeriza_id` | cargado | 124/125 en R6 |
| `inscripciones.propietario_id` | cargado | 30/125 en R6 |
| `caballeriza_responsables` | 219 filas, 214 con `propietario_id` | 201/276 caballerizas |

`portal.html` consulta exactamente las dos fuentes vacías (`spcs.entrenador_id` en línea 377, `spc_propietarios` en línea 372). De ahí la pantalla vacía universal.

### A.2 Dato nuevo que cambia la decisión

Se midió la ambigüedad del backfill:

```
SPCs con al menos un entrenador en inscripciones:  126
Pares distintos (spc_id, entrenador_id):           126
SPCs con 2+ entrenadores distintos en su historia:   0
```

**Cero ambigüedad.** Ningún ejemplar cambió de entrenador en los datos existentes, así que el backfill no requiere decidir "cuál gana". Esa decisión, que era el argumento principal en contra de persistir la tenencia, hoy no existe. Puede aparecer más adelante — y para eso ya está prevista la tabla `spc_entrenadores_hist (spc_id, entrenador_id, fecha_desde, fecha_hasta)`, que existe en el schema con **RLS activo y 0 policies** (o sea: hoy inaccesible desde cualquier cliente, sólo `service_role`).

### A.3 Opción 1 — derivar de `inscripciones` (sin migración)

```sql
-- "Mis caballos" del entrenador X
SELECT DISTINCT s.* FROM spcs s
JOIN inscripciones i ON i.spc_id = s.id
WHERE i.entrenador_id = <X>;
```

**A favor:** cero migración, refleja la realidad operativa, se mantiene solo.

**Limitaciones, en orden de gravedad:**

1. **El caballo que nunca corrió no existe para el portal.** Y ese es exactamente el caballo que el entrenador quiere inscribir por primera vez. La derivación rompe la mitad del alcance de v1 (inscribir) justo en el caso de uso que más valor tiene. Es un problema de diseño, no de cobertura.
2. **No se puede expresar "dejé de entrenar a este caballo".** La inscripción histórica es inmutable; el ejemplar queda en "mis caballos" para siempre. Sin una fecha de baja no hay forma de sacarlo.
3. **Cobertura:** 126 de 144 SPCs. 18 ejemplares no aparecerían para nadie.
4. **Depende de `inscripciones`, que es club-scoped.** Un caballo entrenado en Dolores pero inscripto en otro hipódromo no aparecería. Hoy es irrelevante (un solo club), mañana no.
5. **Costo por render:** un `DISTINCT` sobre `inscripciones` con join en cada carga de la sección, en lugar de un índice sobre una columna.

### A.4 Opción 2 — backfill de la tenencia (recomendada)

**Sí, creo que la solución correcta es backfillear.** No por prolijidad: porque la derivación no puede representar un caballo sin historia, y sin eso "inscribir" no funciona para altas nuevas.

**De dónde sale el dato, cadena por cadena:**

| Destino | Origen | Regla | Cobertura esperada |
|---|---|---|---|
| `spcs.entrenador_id` | `inscripciones.entrenador_id` | inscripción más reciente por `spc_id` (hoy irrelevante: hay un solo entrenador por SPC) | 126/144 |
| `spcs.caballeriza_id` | `inscripciones.caballeriza_id` | ídem | ~127/144 |
| `spc_propietarios` | `caballeriza_responsables` vía `spcs.caballeriza_id` | filas con `rol='propietario' AND activo`, `porcentaje` heredado, `fecha_desde` = fecha de la primera inscripción | limitada — sólo 201/276 caballerizas tienen responsable, y de las 85 de R6 apenas 20 |
| `spc_entrenadores_hist` | mismo backfill | una fila por par, `fecha_desde` = primera inscripción, `fecha_hasta = NULL` | 126 |

**Boceto (PROPUESTA — no ejecutar):**

```sql
-- 1) tenencia de entrenador, desde la inscripción más reciente
WITH ult AS (
  SELECT DISTINCT ON (spc_id) spc_id, entrenador_id, caballeriza_id, created_at
  FROM inscripciones
  WHERE entrenador_id IS NOT NULL
  ORDER BY spc_id, created_at DESC
)
UPDATE spcs s SET entrenador_id = ult.entrenador_id
FROM ult WHERE ult.spc_id = s.id AND s.entrenador_id IS NULL;

-- 2) caballeriza, misma lógica (habilita el paso 3)
-- 3) spc_propietarios desde caballeriza_responsables
INSERT INTO spc_propietarios (spc_id, propietario_id, porcentaje, fecha_desde, activo)
SELECT s.id, cr.propietario_id, COALESCE(cr.porcentaje, 100),
       COALESCE(pr.primera, CURRENT_DATE), true
FROM spcs s
JOIN caballeriza_responsables cr
  ON cr.caballeriza_id = s.caballeriza_id AND cr.rol = 'propietario' AND cr.activo
LEFT JOIN (SELECT spc_id, min(created_at)::date AS primera
             FROM inscripciones GROUP BY spc_id) pr ON pr.spc_id = s.id
ON CONFLICT DO NOTHING;
```

**Riesgo del backfill de propietarios:** hereda la cobertura pobre de `caballeriza_responsables` (20 de 85 caballerizas de R6). El backfill **no arregla** el problema de fondo del lado propietario — eso sigue siendo carga manual de secretaría. Es coherente con la conclusión de `ANALISIS_R6_PORTAL.md`: el portal del propietario va a estar vacío para la mayoría, y por decisión 1 esa sección simplemente no se muestra.

### A.5 Trampa que hay que desactivar antes de cualquier backfill

Existe este trigger:

```sql
CREATE TRIGGER trg_insc_set_propietario
  BEFORE INSERT OR UPDATE OF caballeriza_id ON inscripciones
  FOR EACH ROW EXECUTE FUNCTION fn_inscripcion_set_propietario();
```

```sql
-- fn_inscripcion_set_propietario()
IF NEW.caballeriza_id IS NOT NULL THEN
  SELECT cr.propietario_id INTO NEW.propietario_id FROM caballeriza_responsables cr
  WHERE cr.caballeriza_id = NEW.caballeriza_id AND cr.rol='propietario' AND cr.activo LIMIT 1;
ELSE NEW.propietario_id := NULL; END IF;
```

Dos consecuencias, ambas relevantes:

1. **Explica el 30/125.** `inscripciones.propietario_id` no se carga a mano: lo deriva el trigger de `caballeriza_responsables`. Por eso las 30 inscripciones con propietario coinciden exactamente con las 20 caballerizas que tienen responsable.
2. **Anula la escritura del portal.** `portal.html:575` hace `payload.propietario_id = propietarioId` pero **no** setea `caballeriza_id`. El trigger corre `BEFORE INSERT`, ve `caballeriza_id IS NULL` y ejecuta `NEW.propietario_id := NULL`. La atribución de propietario se pierde en silencio, sin error. Cualquier inscripción hecha desde el portal actual queda huérfana de propietario.

**Acción requerida:** el RPC de inscripción del portal debe setear `caballeriza_id` (derivada del SPC) para que el trigger resuelva el propietario, **o** el trigger debe modificarse para no pisar un `propietario_id` provisto explícitamente. Prefiero lo primero: mantiene una sola fuente de verdad (`caballeriza_responsables`) y no toca lógica que ya usa la secretaría.

### A.6 Recomendación A

**Backfill (A.4) + un resolutor único en la DB.** El portal nunca arma la consulta de "mis caballos": llama a una función y recibe el set ya resuelto.

```sql
-- PROPUESTA
CREATE FUNCTION fn_mis_spcs() RETURNS SETOF spcs
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT s.* FROM spcs s
  WHERE s.entrenador_id IN (SELECT entidad_id FROM fn_mis_entidades()
                             WHERE entidad_tipo = 'profesional')
     OR s.id IN (SELECT sp.spc_id FROM spc_propietarios sp
                  WHERE sp.activo AND sp.propietario_id IN
                        (SELECT entidad_id FROM fn_mis_entidades()
                          WHERE entidad_tipo = 'propietario'))
$$;
```

Así la regla de resolución (tenencia persistida hoy, quizá derivada+persistida mañana) cambia en un solo lugar sin tocar la UI. `fn_mis_entidades()` se define en la sección B.

---

## B. Vinculación cuenta → persona

### B.1 Los tres problemas, confirmados

```javascript
// portal.html:312
sb.from('usuarios').select('club_id,nombre_completo,rol,estado')
  .eq('email', session.user.email).single();
// portal.html:325
sb.from('propietarios').select('id').eq('email', session.user.email).single();
// portal.html:328
sb.from('profesionales').select('id').eq('email', session.user.email)
  .eq('tipo','entrenador').single();
```

- **(i) `.single()` revienta con 0 o >1 filas.** Con 0 filas tira `PGRST116`. Hoy, con 0 emails cargados, **toda cuenta nueva revienta en la línea 325 o 328**. No es un riesgo futuro: es el estado actual.
- **(ii) No filtra `club_id`.** El único índice sobre email es `usuarios_club_id_email_key (club_id, email)`. El mismo email en dos clubes es legal y rompe la línea 312. Además `fn_get_user_club_id()` hace `SELECT club_id FROM usuarios WHERE email = auth.jwt()->>'email' LIMIT 1` — con duplicado cross-club **elige un club arbitrario en silencio**, que es peor que fallar.
- **(iii) `entidad_tipo`/`entidad_id` existen y nadie los escribe.** 3 usuarios en la base, los 3 con ambos en NULL.

### B.2 Por qué `entidad_tipo`/`entidad_id` tampoco alcanza

Es un puntero **único**. La decisión 1 exige que una persona pueda ser entrenador *y* propietario a la vez — y hay al menos 10 personas así confirmadas por DNI (piso, con sólo 22/59 DNIs cargados). Un par `(tipo, id)` no puede representar dos fichas. Sirve como puntero primario, no como el modelo.

### B.3 Modelo propuesto

**Tres cambios, en orden de dependencia.**

**B.3.1 — Anclar la identidad a `auth.users.id`, no al email.**

Es el cambio de mayor palanca del plan. Mata dos problemas de un saque: la ambigüedad cross-club del `LIMIT 1`, y el vector de suplantación de la sección D (el email es escribible; el `auth.uid()` no).

```sql
-- PROPUESTA
ALTER TABLE usuarios ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id);
-- backfill: 3 filas hoy, match por email contra auth.users
-- luego, reescribir los helpers:
CREATE OR REPLACE FUNCTION fn_get_user_club_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid();
$$;
-- idem fn_is_super_admin()
```

Sin `LIMIT 1`: con `UNIQUE` sobre `auth_user_id` no puede haber más de una fila, así que un resultado ambiguo pasa a ser imposible en vez de silenciosamente arbitrario.

**B.3.2 — Tabla de vínculos 1..N.**

```sql
-- PROPUESTA
CREATE TABLE usuario_entidades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  entidad_tipo  text NOT NULL CHECK (entidad_tipo IN ('propietario','profesional')),
  entidad_id    uuid NOT NULL,
  activo        boolean NOT NULL DEFAULT true,
  vinculado_por uuid REFERENCES usuarios(id),
  vinculado_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, entidad_tipo, entidad_id)
);
```

Más un índice único parcial que impida que **dos cuentas distintas reclamen la misma ficha**:

```sql
CREATE UNIQUE INDEX ux_entidad_una_cuenta
  ON usuario_entidades (entidad_tipo, entidad_id) WHERE activo;
```

**B.3.3 — Resolutor único.**

```sql
-- PROPUESTA
CREATE FUNCTION fn_mis_entidades()
RETURNS TABLE (entidad_tipo text, entidad_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ue.entidad_tipo, ue.entidad_id
  FROM usuario_entidades ue
  JOIN usuarios u ON u.id = ue.usuario_id
  WHERE u.auth_user_id = auth.uid() AND ue.activo AND u.activo;
$$;
```

El portal llama a esto y a nada más. **El email desaparece por completo de la ruta de identidad.**

### B.4 Cómo se puebla el vínculo

Por la **secretaría, en el momento de invitar** — no por auto-match. El flujo:

1. Secretaría abre `usuarios.html`, elige "Invitar al portal".
2. Busca la ficha por nombre o DNI (no por email: `propietarios.documento_nro` tiene 220/220 de cobertura, es el único identificador confiable que existe).
3. Selecciona una o dos fichas (propietario y/o profesional) y carga el email de contacto.
4. El sistema crea `auth.users` (invitación), la fila en `usuarios` con `auth_user_id`, y una fila en `usuario_entidades` por ficha.

Esto pone una persona en el medio, que es lo correcto: vincular una cuenta a una ficha que cobra plata no debería resolverse por coincidencia de string.

### B.5 Qué hay que hacer para llegar

| # | Paso | Bloquea a |
|---|---|---|
| B-1 | `usuarios.auth_user_id` + backfill (3 filas) | todo lo demás |
| B-2 | Reescribir `fn_get_user_club_id` / `fn_is_super_admin` sobre `auth.uid()` | D-1 |
| B-3 | Crear `usuario_entidades` + índice único parcial | B-4 |
| B-4 | `fn_mis_entidades()` | A.6, C, D |
| B-5 | UI de vinculación en `usuarios.html` (secretaría) | onboarding real |
| B-6 | Sacar los 3 `.single()` por email de `portal.html` | — (cae solo al reescribir, ver F) |

---

## C. Qué ve cada uno — secciones de v1

Regla transversal (decisión 1): la sección se renderiza **sólo si `fn_mis_entidades()` devuelve el tipo correspondiente y hay al menos una fila de datos**. Nada de secciones vacías.

### C.1 Mis caballos

| | |
|---|---|
| **Fuente** | `fn_mis_spcs()` (§A.6) |
| **Visible para** | entrenador y/o propietario — la función une ambos caminos |
| **Acciones v1** | ninguna. **Solo lectura.** |
| **Campos** | nombre, registro Stud Book, fecha nacimiento, sexo, color, padrillo × madre, estado |

**El alta de SPC sale de v1.** Hoy `portal.html:449` permite `sb.from('spcs').insert(...)` desde el portal, y los SPCs son **globales** (sin `club_id`). Eso significa que un entrenador podría crear registros del Stud Book para todo el sistema. El Stud Book es un registro externo; darlo de alta es acto de secretaría. Si un entrenador tiene un caballo nuevo, lo pide por el canal actual.

### C.2 Llamado abierto / inscribir

| | |
|---|---|
| **Fuente** | `reuniones` con `estado = 'publicada'` + sus `carreras` |
| **Filtro de ventana** | `carreras.apertura_inscripcion <= now() <= carreras.cierre_inscripcion` |
| **Acción** | `portal_inscribir(p_spc_id, p_carrera_id)` |

**Problema de datos, bloqueante y no obvio:**

| Reunión | Carreras | con `apertura_inscripcion` | con `cierre_inscripcion` | con `cupo_maximo` |
|---|---:|---:|---:|---:|
| R6 (20/06) | 11 | 0 | 0 | 0 |
| R7 (19/07) | 12 | 0 | 0 | 0 |
| R8 (16/08) | 12 | **2** | **2** | 0 |

Si se filtra por ventana, el portal muestra 2 carreras en total. Si **no** se filtra, no hay control de cierre y un entrenador puede inscribir después del cierre — que es precisamente el control que la secretaría no puede perder.

**Recomendación:** hacer la ventana **obligatoria** en `reuniones.html` antes de abrir el portal, y que el portal filtre por ella sin excepción. Mientras no esté cargada, la carrera no aparece — falla cerrado, que es el lado correcto para fallar. Como apoyo informativo puede mostrarse `reuniones.fechas_inscripciones` (texto libre, ya se usa), pero **no** como criterio de habilitación.

`cupo_maximo` está en 0/35 carreras. `validar_inscripcion` ya contempla cupo (`IF v_carrera.cupo_maximo IS NOT NULL`), así que sin dato simplemente no se aplica el tope. No es bloqueante, pero conviene que Fede confirme si Dolores usa cupo.

**El RPC de inscripción (PROPUESTA):**

```sql
CREATE FUNCTION portal_inscribir(p_spc_id uuid, p_carrera_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- 1. el SPC pertenece al usuario           → si no, EXCEPTION
-- 2. la carrera está en ventana de inscripción → si no, EXCEPTION
-- 3. validar_inscripcion(p_spc_id, p_carrera_id) → si puede_inscribirse = false, EXCEPTION con motivo
-- 4. no existe ya una inscripción de ese SPC en esa carrera
-- 5. INSERT con canal='web', inscripto_por=<usuario>, entrenador_id/caballeriza_id
--    derivados del SPC (caballeriza_id es imprescindible: sin ella el trigger
--    trg_insc_set_propietario deja propietario_id en NULL — ver §A.5)
$$;
```

Concentrar la escritura en un RPC `SECURITY DEFINER` permite dejar `inscripciones` **sin policy de INSERT para cuentas de portal**. Es la diferencia entre "el cliente puede insertar y confiamos en el JS" y "el cliente no puede insertar, punto".

Además cierra dos bugs vivos de `portal.html`:

- **Línea 472:** `.in('estado', ['publicada','abierta'])`. El ENUM `estado_reunion` es `borrador, publicada, en_curso, finalizada, cancelada, suspendida, programada`. **`'abierta'` no existe** → PostgREST devuelve `22P02 invalid input value for enum`. La carta de llamados **nunca carga**, con datos o sin ellos.
- **Línea 560:** el código evalúa `valResult.valido === false`, pero `validar_inscripcion` devuelve `TABLE(puede_inscribirse boolean, motivo text)`. `valResult.valido` es siempre `undefined`, y `undefined === false` es `false`. **La validación nunca bloquea nada.** Edad, sexo, sanción vigente, cupo: todo pasa.

### C.3 Mis inscripciones

| | |
|---|---|
| **Fuente** | `inscripciones` restringidas a `fn_mis_spcs()` / `fn_mis_entidades()` |
| **Acciones v1** | ninguna. **Solo lectura.** |
| **Columnas** | ejemplar, reunión + fecha, turno, estado, canal (manual/web) |

El botón **Forfait** de `portal.html:621/630` **sale de v1**: cambiar `estado` a `forfait` es un acto de ratificación y la decisión 2 lo deja para fase 2 con confirmación de Fede.

Nota de presentación: mostrar `numero_turno` etiquetado como **turno**, no como "carrera". Es ISSUE-029 (turno→carrera app-wide) y conviene no introducir deuda nueva.

### C.4 Lo que se me debe

| | |
|---|---|
| **Fuente** | `liquidacion_detalle` donde `(beneficiario_tipo, beneficiario_id)` ∈ `fn_mis_entidades()` |
| **Acciones v1** | ninguna. **Solo lectura.** |

Estado actual de la tabla (279 líneas):

| beneficiario | impago | retenido | pagado |
|---|---:|---:|---:|
| profesional | 156 (69 personas) | **48 (28 personas)** | 2 |
| propietario | 12 (11 personas) | **4 (4 personas)** | 2 |
| club | 55 | — | — |

**El manejo de `retenido` es el punto delicado.** `estado_linea_liq` es `impago / pagado / retenido`, y `retenido` es la retención por control anti-doping. 52 de 279 líneas (19 %) están retenidas, afectando a 32 beneficiarios distintos. Reglas para el portal:

1. **`retenido` nunca se suma al total a cobrar.** Van en un bloque separado, con subtotal propio y rótulo explícito ("Retenido por control anti-doping").
2. **Se explica el motivo y qué sigue.** No basta con un badge: la persona tiene que entender que no es un error ni una demora administrativa.
3. **El portal no libera nada.** La liberación es manual de secretaría vía RPC `liberar_linea(p_linea_id)`. El portal no la expone ni la insinúa.
4. **`pagado` muestra el recibo asociado** (`recibo_id` → `recibos.numero_recibo`, fecha, forma de pago). Hay 2 recibos emitidos.

Tres bloques, entonces: **A cobrar** (`impago`), **Retenido** (`retenido`, con explicación), **Cobrado** (`pagado`, con recibo).

Dinero: usar `formatARS()` del repo. `portal.html:336` tiene un `formatMonto()` propio reimplementado a mano — contradice la convención del proyecto (`formatARS`/`parseARS`/`bindARSInput`) y es una fuente de divergencia de formato.

### C.5 Fuera de v1, explícitamente

| Se saca | Por qué |
|---|---|
| Alta/edición de SPC | Stud Book global; acto de secretaría (§C.1) |
| Forfait | es ratificación → decisión 2 |
| Ratificar | decisión 2, fase 2 con Fede |
| Liberar retención | control de secretaría (§C.4) |
| Ver resultados/dividendos | no pedido; además `resultados` es club-wide (§D) |

---

## D. Seguridad

**Esta es la sección crítica.** RLS está activo en las 33 tablas de `public`, y todas las policies apuntan a `{authenticated}` (ninguna a `anon`, que queda denegado). Pero el modelo vigente es **"pertenecés al club ⇒ podés todo dentro del club"**, diseñado para personal de secretaría. Una cuenta de portal, hoy, entra con ese mismo nivel de privilegio.

Los grants de tabla son totales (`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, ...` para `anon` y `authenticated` en todas las tablas revisadas). O sea: **RLS es la única frontera**. Si una policy se afloja o se agrega una con `TO public`, el dato queda expuesto de inmediato. Con el repo público y la publishable key en el HTML, cualquiera puede pegarle a PostgREST directo — el JS del portal no protege nada.

### D.1 Respuesta directa

**No. Las policies actuales no alcanzan, ni de cerca.** Con las policies de hoy, una cuenta de portal puede leer y escribir prácticamente todo lo del club, más los catálogos globales.

### D.2 Huecos, por gravedad

**D-H1 · `USING (true)` en `propietarios` y `profesionales` — suplantación de identidad**

```
propietarios_select  USING (true)      propietarios_update  USING (true) WITH CHECK (true)
profesionales_select USING (true)      profesionales_update USING (true) WITH CHECK (true)
propietarios_insert  WITH CHECK (true) profesionales_insert WITH CHECK (true)
```

Cualquier usuario autenticado, de cualquier club, lee **las 220 filas de `propietarios` y las 167 de `profesionales`** — con `documento_nro` (220/220 cargados), `domicilio`, `localidad`, `telefono`, `email`. Es un volcado de PII completo.

Y puede **escribirlas**. La cadena de escalación, en cuatro pasos:

1. El portal resuelve identidad por `propietarios.email = session.user.email` (línea 325).
2. `propietarios_update USING (true)` me deja escribir el email de cualquier propietario.
3. Pongo mi email en la fila del propietario que me interese.
4. Entro al portal y soy esa persona: veo sus caballos, sus inscripciones y su plata.

**La identidad se deriva de un campo que el atacante puede escribir.** Se cierra por los dos lados: el modelo de §B (identidad por `auth.uid()`, vínculo explícito) elimina la dependencia del email, y las policies de §D.3 eliminan la escritura.

**D-H2 · `liquidaciones` / `liquidacion_detalle` / `recibos` legibles a nivel club — los datos de plata**

```
liquidaciones_select       USING (fn_is_super_admin() OR club_id = fn_get_user_club_id())
liquidacion_detalle_select USING (fn_is_super_admin() OR fn_club_de_liquidacion(...) = fn_get_user_club_id())
recibos_rls  FOR ALL       USING (fn_is_super_admin() OR club_id = fn_get_user_club_id())
```

Una cuenta de portal de Dolores lee **las 89 liquidaciones, las 279 líneas de detalle y los 2 recibos** del club. Premios de todos los propietarios y profesionales, montos, descuentos, retenciones, quién cobró qué y con qué documento (`recibos.cobrador_nombre`, `recibos.cobrador_documento`).

Es exactamente lo que preocupa en el enunciado, y no requiere ninguna suplantación: alcanza con tener cuenta. Peor: `liquidaciones_update`, `liquidacion_detalle_update` y `recibos_rls` (que es `FOR ALL`) permiten **escribir** — marcar la línea propia como `pagado`, cambiar montos, anular recibos.

**D-H3 · `USING (true)` en `spcs` — el Stud Book es escribible por cualquiera**

```
spcs_select USING (true)   spcs_update USING (true) WITH CHECK (true)   spcs_insert WITH CHECK (true)
```

Los SPCs son **globales** (sin `club_id`). Cualquier usuario autenticado puede renombrar un ejemplar, cambiarle el pedigree, marcarlo `fallecido` o `retirado` — y `validar_inscripcion` rechaza todo SPC con `estado != 'activo'`, así que **cambiar un estado es sabotear la inscripción de un rival**. También puede crear SPCs fantasma. Sólo `DELETE` está protegido (`fn_is_super_admin()`).

**D-H4 · `USING (true)` en `spc_propietarios` — reclamar la propiedad de un caballo**

```
spc_propietarios_select USING (true)   _insert WITH CHECK (true)   _update USING (true)
```

La tabla está vacía hoy, pero es justamente la que el backfill de §A.4 va a poblar y la que `fn_mis_spcs()` va a consultar. Con estas policies, cualquiera inserta una fila que lo declara propietario de cualquier ejemplar — y con eso entra en "mis caballos" y en la liquidación asociada. **Debe cerrarse antes del backfill, no después.**

**D-H5 · `inscripciones` a nivel club — escritura y borrado sobre inscripciones ajenas**

```
inscripciones_select/update/delete USING (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id())
```

Lectura club-wide es defendible (el programa es público). **Escritura no.** Una cuenta de portal puede poner en `forfait` el caballo de un rival la noche antes de la carrera, cambiarle el peso, el jockey o el `numero_partidor` (la gatera), o **borrar** la inscripción. Con `trg_audit_inscripciones` queda registrado en auditoría — pero después del hecho.

**D-H6 · `reuniones` y `carreras` a nivel club — borrar una reunión entera**

```
reuniones_delete USING (fn_is_super_admin() OR club_id = fn_get_user_club_id())
carreras_delete  USING (fn_is_super_admin() OR fn_club_de_reunion(reunion_id) = fn_get_user_club_id())
```

Una cuenta de portal puede `DELETE` sobre `reuniones` y `carreras`. Es la pérdida de datos más grande alcanzable con un solo request.

**D-H7 · `resultados` y `resultado_posiciones` a nivel club — alterar el orden de llegada**

```
resultados_update / resultado_posiciones_update USING (... = fn_get_user_club_id())
```

Una cuenta de portal puede cambiar posiciones y dividendos oficiales. Combinado con D-H2 (escritura sobre liquidaciones), toca directamente el cálculo de premios.

**D-H8 · `usuarios` — enumeración de cuentas del club**

```
usuarios_select USING (fn_is_super_admin()
                    OR email = auth.jwt()->>'email'
                    OR club_id = fn_get_user_club_id())
```

RLS es a nivel fila, no columna: `select('*')` devuelve **todas las columnas de todos los usuarios del club**, incluida `password_hash`.

*Aclaración, para no exagerar:* se verificó el contenido sin exponerlo — 2 filas tienen `length = 24` con prefijo `mana` (compatible con un placeholder tipo `managed_by_supabase_auth`) y 1 fila está vacía. **No son credenciales reales**; las passwords las maneja Supabase Auth. No es una filtración de contraseñas. Igual conviene (a) no seleccionar nunca esa columna desde el cliente y (b) evaluar dropearla, porque una columna llamada `password_hash` legible por todo el club es una trampa esperando a que alguien la use en serio.

Lo que sí es real: cualquier cuenta de portal enumera email, nombre, teléfono y rol de todos los usuarios del club.

**D-H9 · Catálogos globales legibles (menor)**

`sanciones_select USING (true)` y `performances_select USING (true)`: lectura global cross-club. Las sanciones son información compartida entre hipódromos por diseño (`sanciones.html`), así que probablemente sea intencional — pero conviene confirmarlo, porque una sanción es información sensible sobre una persona.

**D-H10 · Fragilidades estructurales**

- `fn_get_user_club_id()` usa `WHERE email = auth.jwt()->>'email' LIMIT 1`. Con emails duplicados cross-club **elige un club arbitrario en silencio**. Se resuelve con B-1/B-2 (`auth.uid()` + `UNIQUE`).
- Ninguna tabla tiene `FORCE ROW LEVEL SECURITY`. Sólo afecta al owner, no es urgente, pero vale anotarlo.
- `spc_entrenadores_hist`: RLS activo, **0 policies** → denegada para todos salvo `service_role`. Si el plan la usa (§A.4), necesita policies.
- `anon` tiene todos los grants de tabla. Hoy queda bloqueado porque ninguna policy lo incluye. Es una red de una sola capa.

### D.3 Modelo de policies propuesto

**Principio: la cuenta de portal es de sólo lectura contra la DB, y escribe únicamente por RPCs `SECURITY DEFINER`.** Esto reduce la superficie de escritura de ~15 tablas a 1 función auditable.

**Paso 1 — distinguir al usuario de portal.**

```sql
-- PROPUESTA
CREATE FUNCTION fn_is_portal_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios
                  WHERE auth_user_id = auth.uid()
                    AND rol IN ('propietario','profesional'));
$$;
```

Nota: `rol` sigue existiendo para decidir *privilegio*, aunque la UI no lo use para decidir *qué secciones mostrar* (decisión 1). Son dos cosas distintas y conviene no mezclarlas.

**Paso 2 — cerrar los cuatro `USING (true)`.**

| Tabla | Hoy | Propuesta |
|---|---|---|
| `spcs` | SELECT/UPDATE/INSERT `true` | SELECT: secretaría del club **o** `id IN (SELECT id FROM fn_mis_spcs())`. UPDATE/INSERT: sólo secretaría |
| `propietarios` | SELECT/UPDATE/INSERT `true` | SELECT: secretaría del club **o** `id ∈ fn_mis_entidades()`. UPDATE/INSERT: sólo secretaría |
| `profesionales` | ídem | ídem |
| `spc_propietarios` | ídem | SELECT: secretaría **o** `spc_id ∈ fn_mis_spcs()`. UPDATE/INSERT: sólo secretaría |

**Paso 3 — restringir escritura para portal en las tablas operativas.** Agregar `AND NOT fn_is_portal_user()` a las policies de `INSERT/UPDATE/DELETE` de `inscripciones`, `carreras`, `reuniones`, `resultados`, `resultado_posiciones`, `liquidaciones`, `liquidacion_detalle`, `recibos`, `caballerizas`, `apoderados`.

**Paso 4 — restringir lectura de plata.**

```sql
-- PROPUESTA — liquidacion_detalle_select
USING (
  fn_is_super_admin()
  OR (NOT fn_is_portal_user()
      AND fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id())
  OR (beneficiario_tipo::text, beneficiario_id)
        IN (SELECT entidad_tipo, entidad_id FROM fn_mis_entidades())
)
```

Análogo para `liquidaciones` (por `profesional_id`/`propietario_id`) y `recibos`.

**Paso 5 — `usuarios`:** que la cuenta de portal vea **sólo su propia fila** (`auth_user_id = auth.uid()`), sin la rama `club_id = fn_get_user_club_id()`. Y nunca seleccionar `password_hash` desde el cliente.

**Paso 6 — envolver en `(SELECT ...)`.** Las funciones de autorización se evalúan por fila. Existe `migrations/r2a_wrap_policies_initplan.sql` (sin trackear en el working tree) que aborda justamente esto para las policies actuales. Las policies nuevas deben nacer envueltas: `(SELECT fn_is_portal_user())`.

### D.4 Cómo se verifica

Sin probes negativas esto no se puede dar por cerrado. Propuesta: `tests/probe_portal_rls.mjs`, con dos usuarios de prueba (portal A y portal B, distintas fichas), que **afirme fallos**:

| # | Assert |
|---|---|
| 1 | A **no** lee `liquidacion_detalle` de B |
| 2 | A **no** lee `recibos` de B |
| 3 | A **no** actualiza `propietarios.email` de B |
| 4 | A **no** actualiza `spcs` de un ejemplar de B |
| 5 | A **no** inserta en `spc_propietarios` |
| 6 | A **no** actualiza/borra `inscripciones` de B |
| 7 | A **no** borra `reuniones` ni `carreras` |
| 8 | A **no** actualiza `resultados` |
| 9 | A lista sólo su propia fila de `usuarios` |
| 10 | A **sí** ve sus caballos, sus inscripciones y sus líneas de liquidación |
| 11 | `portal_inscribir` rechaza un `spc_id` que no es de A |
| 12 | `portal_inscribir` rechaza fuera de ventana |

Los 1–9 deben fallar con error o devolver 0 filas. Un `UPDATE` bajo RLS que no matchea devuelve **éxito con 0 filas afectadas**, no error: la probe tiene que verificar el valor en la DB después, no el status de la respuesta. Es el error clásico al testear RLS.

---

## E. Estados vacíos

Hoy, una cuenta sin ficha ve pantalla vacía sin explicación — o directamente un `signOut()` + redirect a `login.html` (línea 313), que con una sesión válida puede quedar en loop.

Siete casos, cada uno con texto y salida concreta:

| # | Situación | Detección | Qué se muestra |
|---|---|---|---|
| **E-1** | Sesión de Auth válida, sin fila en `usuarios` | `fn_mis_entidades()` no resuelve; no hay fila propia | "Tu cuenta todavía no está habilitada en el sistema." + **el email con el que entró** + contacto de secretaría + botón Cerrar sesión. **No** redirigir a `login.html`: la sesión es válida y el redirect genera loop |
| **E-2** | `usuarios.estado = 'pendiente'` | ya implementado (línea 315) | Se conserva la pantalla actual ("Registro pendiente"), agregándole el email y el contacto |
| **E-3** | Fila en `usuarios`, **0 entidades vinculadas** | `fn_mis_entidades()` → 0 filas | "Tu cuenta está creada pero todavía no está asociada a tu ficha." + email + contacto. **Es el caso más probable en el arranque** y hoy es exactamente el que rompe con `PGRST116` |
| **E-4** | Vinculado como entrenador, 0 caballos | `fn_mis_spcs()` → 0 filas | "No figurás como entrenador de ningún ejemplar." + explicación de que la tenencia se toma de las inscripciones + a quién reclamar |
| **E-5** | Con caballos, sin llamado abierto | 0 carreras en ventana | "No hay llamado abierto en este momento." + fecha de la próxima reunión publicada, si existe |
| **E-6** | Sin inscripciones | 0 filas | "Todavía no inscribiste ningún ejemplar." + link a la sección de llamado (sólo si hay llamado abierto) |
| **E-7** | Sin líneas de liquidación | 0 filas | "No tenés premios registrados." Y si tiene **sólo** líneas `retenido`: mostrar el bloque de retenidos, **nunca** un "no tenés nada" que contradiga lo que la persona sabe que ganó |

Dos reglas transversales:

- **Siempre mostrar el email de la sesión.** Es el dato que la persona necesita para que la secretaría la encuentre por teléfono.
- **Ningún estado vacío es un callejón sin salida.** Todos llevan contacto de secretaría y botón de cerrar sesión.

E-1 y E-3 son distintos y no hay que fusionarlos: en E-1 no existe la cuenta en el sistema; en E-3 existe pero le falta el vínculo. La acción de secretaría es diferente en cada caso.

---

## F. Qué se recicla de `portal.html` y qué se tira

**Recomendación honesta: conservar el CSS y el markup, reescribir el `<script>` entero.**

### F.1 Se conserva (~300 de 652 líneas, ≈45 %)

| Bloque | Líneas | Por qué |
|---|---|---|
| CSP meta tag | 5 | Bien armada: `object-src 'none'`, `frame-ancestors 'none'`, `connect-src` acotado a Supabase. Mejor que la del resto del repo |
| `<style>` completo | 13–152 | Coherente con la paleta del proyecto. Cards, badges, modales, toasts, empty-state, spinner, responsive, sidebar colapsable. Trabajo real y correcto |
| Layout / sidebar / topbar | 158–213 | Estructura sólida; cambian los ítems del menú, no el andamiaje |
| Modal de inscripción | 273–299 | Se reusa con el nuevo RPC |
| `toast()` | 344–349 | Utilitario correcto |

### F.2 Se tira

| Bloque | Líneas | Por qué |
|---|---|---|
| `initAuth()` | 307–332 | `.single()` ×3; gating por `usr.rol` (línea 314) que contradice la decisión 1; identidad por email |
| `loadSpcs()` | 367–385 | Lee las dos fuentes vacías (`spc_propietarios`, `spcs.entrenador_id`); ramifica por `currentUser.rol` |
| Modal + alta/edición de SPC | 215–271, 412–461 | Alta de Stud Book global desde el portal — fuera de v1 (§C.1) |
| `loadCarta()` | 467–508 | Filtra por `'abierta'`, que no existe en el ENUM → la sección nunca carga. Además no filtra por ventana de inscripción |
| `confirmarInscripcion()` | 545–585 | Valida contra `valResult.valido`, campo que la RPC no devuelve → validación siempre pasa. Y su `propietario_id` lo pisa el trigger |
| `loadMisInscripciones()` | 588–628 | Depende de `misSPCs`, que siempre viene vacío; incluye el botón de forfait |
| `darForfait()` | 630–636 | Ratificación → fuera de v1 (decisión 2) |
| `formatMonto()` | 336–343 | Reimplementación local; el proyecto usa `formatARS()` |

### F.3 Además, dos defectos que se arrastran

- **XSS / rotura por comillas (ISSUE-018).** Línea 407: `onclick='openModalSpc(${JSON.stringify(r)})'` inyecta el registro completo dentro de un atributo HTML — un nombre con comilla simple rompe el handler, y el patrón es explotable. Líneas 497 y 534 usan `.replace(/'/g,"\\'")`, que no es escapado suficiente para un contexto de atributo. La reescritura debe usar `addEventListener` + `dataset`, no interpolación en `onclick`.
- **`.catch()` silencioso implícito.** Varios `const { data } = await ...` descartan `error` sin loguear (líneas 312, 325, 328, 555, 559), contra la convención del proyecto (`console.error('[contexto]', err); throw err;`). Por eso el portal "no muestra nada" en vez de decir qué falló.

### F.4 Veredicto

De ~350 líneas de JS, **se salvan `toast()` y poco más**. Los defectos no son independientes: el gating por rol, la identidad por email, las fuentes vacías y el trigger que pisa `propietario_id` son la misma decisión de arquitectura equivocada, repetida en cinco funciones. Parchear nueve bugs entrelazados en lógica que igual hay que reorientar cuesta más que reescribir el script sobre la base de RPCs.

**No es un archivo nuevo:** se conserva `portal.html` con su CSS y su markup, y se sustituye el bloque `<script>`. El diff va a ser grande pero el resultado es un solo archivo, coherente con la convención del repo (HTML autocontenido, sin build).

---

## Plan de ejecución propuesto

Orden por dependencia. **Nada de esto fue ejecutado.**

| Fase | Qué | Entregable | Bloquea a |
|---|---|---|---|
| **0. Seguridad DB** | `usuarios.auth_user_id` + helpers sobre `auth.uid()`; cerrar los 4 `USING (true)`; `NOT fn_is_portal_user()` en escrituras; acotar lectura de plata | `migrations/portal_v2_rls.sql` | todo |
| **1. Datos** | Backfill `spcs.entrenador_id` / `spcs.caballeriza_id` / `spc_propietarios`; resolver el trigger `trg_insc_set_propietario` (§A.5); policies para `spc_entrenadores_hist` | `migrations/portal_v2_backfill.sql` | 3 |
| **2. Vinculación** | `usuario_entidades` + índice único parcial + `fn_mis_entidades()` + `fn_mis_spcs()`; UI de invitación en `usuarios.html` | migración + `usuarios.html` | 3 |
| **3. Ventanas** | Cargar `apertura_inscripcion`/`cierre_inscripcion` en `reuniones.html`; hacerlas obligatorias | `reuniones.html` | 4 |
| **4. RPC** | `portal_inscribir()` con las 5 validaciones (§C.2) | `migrations/portal_inscribir.sql` | 5 |
| **5. Portal v2** | Reescribir el `<script>`; 4 secciones; 7 estados vacíos | `portal.html` | 6 |
| **6. Probes** | `tests/probe_portal_rls.mjs` — 12 asserts, mayoría negativos | probe verde | release |
| **P. Contacto** | Campaña de carga de emails (secretaría) — **en paralelo desde ahora** | datos | invitar gente real |
| **F2. Post-v1** | Ratificar / forfait, sujeto a confirmación de Fede | — | — |

**Camino crítico: fase 0.** Los huecos D-H1 a D-H4 son explotables **hoy**, con las 3 cuentas existentes y sin portal de por medio — no requieren que el portal exista. Conviene tratarlos como corrección independiente y no como parte del release del portal.

---

## Preguntas para Fede

1. **Cupo por carrera** — `cupo_maximo` está vacío en las 35 carreras. ¿Dolores usa tope de inscriptos? `validar_inscripcion` ya lo contempla si el dato está.
2. **Ventana de inscripción** — hoy sólo 2 de 35 carreras la tienen cargada. ¿La secretaría puede cargarla siempre? Sin ella, el portal no puede cerrar la inscripción sola.
3. **Alta de SPC desde el portal** — se propone excluirla de v1 (Stud Book global). ¿De acuerdo?
4. **Ratificar/forfait** — confirmar si en fase 2 el entrenador puede dar forfait solo, o si siempre pasa por secretaría.
5. **Sanciones legibles cross-club** (`sanciones_select USING (true)`) — ¿es intencional que se vean desde otros hipódromos?
6. **Apoderados** — `apoderados` ya existe con `autorizante_tipo`/`autorizado_documento`. ¿Un apoderado debería tener cuenta de portal en nombre del propietario? No está contemplado en v1.

---

## Apéndice — evidencia recogida

Consultas de sólo lectura contra `unlhcuanfrtpatoipwve` vía MCP `execute_sql`. Ninguna escritura.

```sql
-- Policies vigentes
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd;

-- RLS por tabla
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

-- Helpers de autorización
SELECT proname, pg_get_functiondef(oid) FROM pg_proc
WHERE proname IN ('fn_get_user_club_id','fn_is_super_admin',
                  'fn_club_de_carrera','fn_club_de_reunion');

-- Grants de tabla para anon/authenticated
SELECT grantee, table_name, string_agg(DISTINCT privilege_type, ',')
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
GROUP BY grantee, table_name;

-- Ambigüedad del backfill de entrenador
WITH pares AS (
  SELECT spc_id, entrenador_id FROM inscripciones
  WHERE entrenador_id IS NOT NULL GROUP BY 1,2
)
SELECT count(DISTINCT spc_id), count(*) FROM pares;   -- 126, 126 → sin ambigüedad

-- Trigger que pisa propietario_id
SELECT tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'inscripciones' AND NOT t.tgisinternal;

-- Ventanas de inscripción por reunión
SELECT r.numero, count(*), count(c.apertura_inscripcion),
       count(c.cierre_inscripcion), count(c.cupo_maximo)
FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND r.numero IN (6,7,8) GROUP BY r.numero;

-- Estado de liquidaciones
SELECT beneficiario_tipo::text, estado_linea::text, count(*),
       count(DISTINCT beneficiario_id)
FROM liquidacion_detalle GROUP BY 1,2;

-- ENUMs relevantes
SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('estado_reunion','canal_inscripcion','estado_linea_liq',
                    'beneficiario_tipo','rol_usuario')
GROUP BY t.typname;

-- validar_inscripcion: firma real vs. la que asume portal.html
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'validar_inscripcion';
-- → RETURNS TABLE(puede_inscribirse boolean, motivo text)
--   portal.html:560 lee valResult.valido → siempre undefined
```
