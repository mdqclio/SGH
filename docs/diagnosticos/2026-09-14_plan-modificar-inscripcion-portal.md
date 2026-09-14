# Plan — "Modificar" en Mis inscripciones del portal (pedido de Yesi, 14/09/2026)

- **Fecha**: 2026-09-14, 17:07 UTC (14:07 hora Argentina)
- **SHA de `main` relevado**: `c0e7803730fbe93d4e418df3c0468040778820d7`
- **Rama del informe**: `reports` (este archivo). Todo grep y lectura de código se hizo contra `main`
  (`git show main:…`, `git grep … main`); `reports` está 141 commits atrás de `main`.
- **Estado**: **PLAN, sin aplicar.** No se tocó la base, no se escribió código de producto.
  Gate explícito del usuario: "Quiero verlo antes de que se aplique".

## Guards

```
$ pwd
/home/clio/dev/SGH

$ git branch --show-current ; git rev-parse HEAD ; git status --short
main
c0e7803730fbe93d4e418df3c0468040778820d7
(limpio)

-- MCP execute_sql (proyecto unlhcuanfrtpatoipwve)
select count(*) as spcs from spcs;
[{"spcs":205}]
```

Los tres guards dan lo esperado (pwd, 205, ref del proyecto).

---

## 0. Resumen ejecutivo (lo que hay que decidir)

1. **La ventana de R9 ya cerró.** Las dos: `cierre_inscripcion` = 14/09 14:00 UTC (11:00 AR) y
   `cierre_ratificacion` = 14/09 15:00 UTC (12:00 AR). El relevamiento corrió a las 17:07 UTC
   (14:07 AR): `en_ratif=false`, `en_insc=false` en los 11 turnos. **Aunque el feature estuviera en
   prod ahora mismo, el RPC lo rechazaría "Fuera de plazo".** Para que sirva hoy, Yesi tiene que
   extender `carreras.cierre_ratificacion` de los turnos que quiera (se edita en
   `carta-llamados.html`, campo `f-ci-rat`, líneas 1172/1231 de `main`). Eso es decisión de la
   secretaría, no mía.
2. **La premisa "si cambia el entrenador, deja de ser suya" NO es lo que hace la base hoy.** La
   tenencia de la fila para el portal es `canal='portal' AND inscripto_por = yo` (quién la cargó),
   no `entrenador_id` (quién presenta). Cambiar el entrenador con el modelo vigente **no** le saca la
   fila al que la cargó. Hay que elegir (GATE-1, §6): **A** hacer que el RPC transfiera
   `inscripto_por` al usuario del nuevo entrenador (regla literal de Yesi) o **B** no transferir y
   escribir el aviso con la verdad. Recomiendo **B** para esta versión, ver §6.
3. **El trigger del propietario se dispara** (`trg_insc_set_propietario BEFORE INSERT OR UPDATE OF
   caballeriza_id`), y **si la caballeriza nueva no tiene titular activo deja `propietario_id =
   NULL` en silencio**. Hay **43 de 295** caballerizas activas de Dolores sin titular (15 %). El
   RPC lo detecta y lo devuelve; la UI avisa antes de guardar (§4.3, §5.2). No se bloquea:
   ese pozo ya lo regulariza el `DO` de `propietarios_provisorios_r9.sql` (pendiente del lunes, ya
   anotado en CLAUDE.md).
4. **No existe RPC de modificación.** Hay que escribir `rpc_modificar_inscripcion` (§4). La
   secretaría hace `sb.from('inscripciones').update(payload)` directo (`inscripciones.html:848`),
   protegida por RLS de club; el portal **no tiene** policy de UPDATE sobre `inscripciones`, así que
   la única vía es un `SECURITY DEFINER` con los mismos guards que `rpc_baja_inscripcion`.
5. Alcance cerrado: **caballeriza, entrenador, jockey, suplente**. El RPC **no recibe** `spc_id` ni
   `carrera_id` — no hay forma de tocarlos.

---

## 1. Relevamiento

### 1.1 `rpc_baja_inscripcion` — definición viva en la base (fuente de verdad)

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'rpc_%inscri%' or p.proname like '%propietario%deriv%' or p.proname like '%derivar%')
order by 1;
```

Salida cruda (dos funciones; `prosecdef=true` en ambas):

```sql
CREATE OR REPLACE FUNCTION public.rpc_baja_inscripcion(p_inscripcion_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id      uuid;
  v_insc            RECORD;
  v_carrera         RECORD;
  v_en_inscripcion  boolean;
  v_en_ratificacion boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM fn_mis_entidades() e
     WHERE e.entidad_tipo IN ('profesional', 'propietario')
  ) THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal.';
  END IF;

  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.';
  END IF;

  SELECT * INTO v_insc FROM inscripciones WHERE id = p_inscripcion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa inscripción no existe.';
  END IF;

  -- Sin revalidación de tenencia (regla del 24/08/2026): la fila queda
  -- protegida por canal='portal' AND inscripto_por = el que llama.
  IF v_insc.canal IS DISTINCT FROM 'portal'
     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id
  THEN
    RAISE EXCEPTION 'Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.';
  END IF;

  SELECT c.*, r.estado::text AS reunion_estado
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = v_insc.carrera_id;

  IF v_carrera.reunion_estado IS DISTINCT FROM 'publicada' THEN
    RAISE EXCEPTION 'Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.';
  END IF;

  -- Las dos ventanas, fail-closed: si a una le falta cualquiera de sus dos
  -- fechas, esa ventana NO está abierta.
  v_en_inscripcion := v_carrera.apertura_inscripcion IS NOT NULL
                  AND v_carrera.cierre_inscripcion   IS NOT NULL
                  AND now() >= v_carrera.apertura_inscripcion
                  AND now() <= v_carrera.cierre_inscripcion;

  v_en_ratificacion := v_carrera.apertura_ratificacion IS NOT NULL
                   AND v_carrera.cierre_ratificacion   IS NOT NULL
                   AND now() >= v_carrera.apertura_ratificacion
                   AND now() <= v_carrera.cierre_ratificacion;

  IF NOT (v_en_inscripcion OR v_en_ratificacion) THEN
    RAISE EXCEPTION 'Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.';
  END IF;

  -- RAMA 1: INSCRIPCIÓN ABIERTA -> borrar. Sólo cuando la de ratificación NO
  -- está abierta: si por un dato mal cargado se solaparan, gana el FORFAIT,
  -- que conserva la fila.
  IF v_en_inscripcion AND NOT v_en_ratificacion THEN
    IF v_insc.estado IS DISTINCT FROM 'inscripto' THEN
      RAISE EXCEPTION 'Esa inscripción ya fue procesada por la secretaría y no se puede retirar desde el portal.';
    END IF;

    DELETE FROM resultado_posiciones WHERE inscripcion_id = p_inscripcion_id;
    DELETE FROM inscripciones        WHERE id = p_inscripcion_id;
    RETURN true;
  END IF;

  -- RAMA 2: RATIFICACIÓN ABIERTA -> forfait. Se admite 'ratificado' además de
  -- 'inscripto': la ventana de ratificación es justo cuando la secretaría
  -- ratifica, y un caballo ratificado que se retira ES un forfait.
  IF v_insc.estado NOT IN ('inscripto', 'ratificado') THEN
    RAISE EXCEPTION 'Ese caballo ya figura como % y no se puede dar de baja desde el portal.', v_insc.estado;
  END IF;

  UPDATE inscripciones
     SET estado          = 'forfait',
         numero_partidor = NULL,
         motivo_estado   = 'Forfait desde el portal'
   WHERE id = p_inscripcion_id;

  RETURN true;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.rpc_inscribir(p_spc_id uuid, p_carrera_id uuid, p_caballeriza_id uuid, p_entrenador_id uuid, p_jockey_titular_id uuid DEFAULT NULL::uuid, p_jockey_suplente_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id     uuid;
  v_carrera        RECORD;
  v_reunion_estado text;
  v_club_id        uuid;
  v_spc            RECORD;
  v_ok             boolean;
  v_motivo         text;
  v_id             uuid;
BEGIN
  -- Entidad de portal: profesional O propietario. Quién anota queda en
  -- inscripto_por; quién entrena se declara en p_entrenador_id.
  IF NOT EXISTS (
    SELECT 1 FROM fn_mis_entidades() e
     WHERE e.entidad_tipo IN ('profesional', 'propietario')
  ) THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal.';
  END IF;

  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.';
  END IF;

  SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El caballo no existe.';
  END IF;

  SELECT c.*, r.estado::text AS reunion_estado, r.club_id AS club_id
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = p_carrera_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La carrera no existe.';
  END IF;

  v_reunion_estado := v_carrera.reunion_estado;
  v_club_id        := v_carrera.club_id;

  IF v_reunion_estado IS DISTINCT FROM 'publicada'
     OR v_carrera.estado IS NOT DISTINCT FROM 'anulada'
     OR v_carrera.apertura_inscripcion IS NULL
     OR v_carrera.cierre_inscripcion  IS NULL
     OR now() < v_carrera.apertura_inscripcion
     OR now() > v_carrera.cierre_inscripcion
  THEN
    RAISE EXCEPTION 'La inscripción para ese turno no está abierta.';
  END IF;

  IF p_caballeriza_id IS NULL THEN
    RAISE EXCEPTION 'Falta la caballeriza: es obligatoria para anotar.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM caballerizas
     WHERE id = p_caballeriza_id AND activo AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'Esa caballeriza no existe o no está activa en este hipódromo.';
  END IF;

  IF p_entrenador_id IS NULL THEN
    RAISE EXCEPTION 'Falta el entrenador: hay que declarar quién presenta el caballo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profesionales
     WHERE id = p_entrenador_id AND activo
       AND tipo IN ('entrenador', 'ambos') AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'El entrenador declarado no está en el padrón activo de este hipódromo.';
  END IF;

  -- Jockey OPCIONAL al anotar: se define hasta el martes y es obligatorio en
  -- la ratificación. Si viene, tiene que ser del padrón.
  IF p_jockey_titular_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM profesionales
        WHERE id = p_jockey_titular_id AND activo
          AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
     )
  THEN
    RAISE EXCEPTION 'El jockey declarado no está en el padrón activo de este hipódromo.';
  END IF;

  IF p_jockey_suplente_id IS NOT NULL THEN
    IF p_jockey_titular_id IS NULL THEN
      RAISE EXCEPTION 'No se puede declarar un suplente sin jockey titular.';
    END IF;
    IF p_jockey_suplente_id = p_jockey_titular_id THEN
      RAISE EXCEPTION 'El suplente no puede ser el mismo jockey que el titular.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM profesionales
       WHERE id = p_jockey_suplente_id AND activo
         AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
    ) THEN
      RAISE EXCEPTION 'El jockey suplente no está en el padrón activo de este hipódromo.';
    END IF;
  END IF;

  SELECT v.puede_inscribirse, v.motivo
    INTO v_ok, v_motivo
    FROM validar_inscripcion(p_spc_id, p_carrera_id) v;

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'No se puede inscribir: %', COALESCE(v_motivo, 'no cumple las condiciones de la carrera');
  END IF;

  IF EXISTS (
    SELECT 1 FROM inscripciones
     WHERE carrera_id = p_carrera_id AND spc_id = p_spc_id
  ) THEN
    RAISE EXCEPTION 'Ese caballo ya está anotado en ese turno.';
  END IF;

  INSERT INTO inscripciones (
    carrera_id, spc_id, estado, canal, inscripto_por,
    entrenador_id, caballeriza_id, jockey_titular_id, jockey_suplente_id
  ) VALUES (
    p_carrera_id, p_spc_id,
    'inscripto',
    'portal',
    v_usuario_id,
    p_entrenador_id,
    p_caballeriza_id,
    p_jockey_titular_id,
    p_jockey_suplente_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
```

**Lectura.** Guards de `rpc_baja_inscripcion`, en orden: (1) entidad de portal (`profesional` o
`propietario`), (2) usuario activo, (3) la fila existe, (4) **propia = `canal='portal' AND
inscripto_por = yo`**, (5) reunión `publicada`, (6) ventana de inscripción **o** de ratificación,
las dos fail-closed sobre `carreras.*`, (7) estado admitido según rama (`inscripto` en inscripción;
`inscripto`/`ratificado` en ratificación). No hay ninguna función de modificación: el barrido de
`pg_proc` por `rpc_%inscri%` sólo devuelve estas dos. Las validaciones de padrón (caballeriza
activa del club, entrenador `entrenador|ambos`, jockey `jockey|ambos`, suplente ≠ titular y sin
titular no hay suplente) están en `rpc_inscribir` y se reusan tal cual.

### 1.2 Triggers sobre `inscripciones` y `caballeriza_responsables` (la cadena del propietario)

```sql
select t.tgname, c.relname, pg_get_triggerdef(t.oid) as tgdef, p.proname, pg_get_functiondef(p.oid) as fndef
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
where c.relname in ('inscripciones','caballeriza_responsables') and not t.tgisinternal
order by 2,1;
```

Salida cruda:

| tgname | relname | tgdef |
|---|---|---|
| `trg_cab_resp_set_propietario` | `caballeriza_responsables` | `CREATE TRIGGER trg_cab_resp_set_propietario BEFORE INSERT OR UPDATE OF rol, documento_tipo, documento_nro, caballeriza_id ON public.caballeriza_responsables FOR EACH ROW EXECUTE FUNCTION fn_caballeriza_resp_set_propietario()` |
| `trg_audit_inscripciones` | `inscripciones` | `CREATE TRIGGER trg_audit_inscripciones AFTER INSERT OR DELETE OR UPDATE ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()` |
| `trg_insc_set_propietario` | `inscripciones` | `CREATE TRIGGER trg_insc_set_propietario BEFORE INSERT OR UPDATE OF caballeriza_id ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_inscripcion_set_propietario()` |
| `trg_inscripciones_updated_at` | `inscripciones` | `CREATE TRIGGER trg_inscripciones_updated_at BEFORE UPDATE ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION set_updated_at()` |

```sql
CREATE OR REPLACE FUNCTION public.fn_inscripcion_set_propietario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.caballeriza_id IS NOT NULL THEN
    SELECT cr.propietario_id INTO NEW.propietario_id FROM caballeriza_responsables cr
    WHERE cr.caballeriza_id=NEW.caballeriza_id AND cr.rol='propietario' AND cr.activo=true LIMIT 1;
  ELSE NEW.propietario_id := NULL; END IF;
  RETURN NEW;
END; $function$
```

```sql
CREATE OR REPLACE FUNCTION public.fn_caballeriza_resp_set_propietario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_tipo text; v_dt text;
BEGIN
  IF NEW.rol='propietario' AND NEW.documento_nro IS NOT NULL THEN
    SELECT c.club_id INTO v_club FROM caballerizas c WHERE c.id=NEW.caballeriza_id;
    IF v_club IS NULL THEN RAISE EXCEPTION 'Caballeriza % sin club_id', NEW.caballeriza_id; END IF;
    v_dt := COALESCE(NEW.documento_tipo,'DNI');
    v_tipo := CASE WHEN v_dt='CUIT' THEN 'sociedad' ELSE 'persona' END;
    SELECT p.id INTO NEW.propietario_id FROM propietarios p
    WHERE p.club_id=v_club AND p.documento_tipo=v_dt AND p.documento_nro=NEW.documento_nro LIMIT 1;
    IF NEW.propietario_id IS NULL THEN
      INSERT INTO propietarios (club_id, tipo, nombre, documento_tipo, documento_nro, localidad, activo, estado)
      VALUES (v_club, v_tipo, NULLIF(trim(concat_ws(', ', NEW.apellido, NEW.nombre)),''), v_dt, NEW.documento_nro, NEW.localidad, true, 'activo')
      RETURNING id INTO NEW.propietario_id;
    END IF;
  END IF;
  RETURN NEW;
END; $function$
```

(`fn_auditoria_log` y `set_updated_at` también salieron completas; son las genéricas del repo y
no cambian nada de este plan — `fn_auditoria_log` es lo que deja el rastro OLD/NEW de cada
modificación en `auditoria`, incluida la de `inscripto_por` si se elige GATE-1 = A.)

**Lectura.**
- `trg_insc_set_propietario` es `BEFORE … UPDATE OF caballeriza_id`. Un `UPDATE inscripciones SET
  caballeriza_id = …` **sí lo dispara**, esté o no en un `SECURITY DEFINER` (los triggers no miran
  quién ejecuta). `UPDATE OF col` dispara si la columna está en el `SET`, cambie o no el valor.
- La función **no falla nunca**: si la caballeriza nueva no tiene `caballeriza_responsables` con
  `rol='propietario' AND activo`, el `SELECT … INTO` deja `NEW.propietario_id = NULL` y la fila
  queda sin propietario **en silencio**. Ese es exactamente el pozo de GOTCHA #47 / R8.
- Si en vez de cambiar la caballeriza se cambia sólo jockey/entrenador/suplente, el trigger **no**
  corre (la columna no está en el `SET`) y `propietario_id` queda como estaba. Correcto.

### 1.3 Cuántas caballerizas caen en el pozo

```sql
select count(*) filter (where activo) as cab_activas,
 count(*) filter (where activo and not exists (select 1 from caballeriza_responsables cr where cr.caballeriza_id=c.id and cr.rol='propietario' and cr.activo)) as activas_sin_titular
from caballerizas c where c.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c';
```

```
[{"cab_activas":295,"activas_sin_titular":43}]
```

**43 de 295 (14,6 %).** No es un caso raro: 1 de cada 7 caballerizas que el entrenador puede
elegir en el select deja la inscripción sin propietario.

### 1.4 RLS sobre `inscripciones` (por qué hace falta un RPC)

```sql
select polname, polcmd, pg_get_expr(polqual, polrelid) as qual, pg_get_expr(polwithcheck, polrelid) as withcheck, polroles::regrole[] from pg_policy where polrelid='public.inscripciones'::regclass order by 1;
```

| polname | cmd | qual / withcheck |
|---|---|---|
| `inscripciones_delete` | d | `(NOT fn_is_portal_user()) AND (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id())` |
| `inscripciones_insert` | a | withcheck: `(NOT fn_is_portal_user()) AND (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id())` |
| `inscripciones_select` | r | `fn_is_super_admin() OR ((NOT fn_is_portal_user()) AND fn_club_de_carrera(carrera_id) = fn_get_user_club_id()) OR (fn_is_portal_user() AND spc_id IN (SELECT spc_id FROM fn_mis_spc_visibles()))` |
| `inscripciones_update` | w | qual y withcheck: `(NOT fn_is_portal_user()) AND (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id())` |

Todas sobre `{authenticated}`. **El portal no tiene UPDATE**: `NOT fn_is_portal_user()` lo excluye
explícitamente. Un `sb.from('inscripciones').update(...)` desde `portal.html` devolvería 0 filas.
La única vía es un `SECURITY DEFINER`, igual que la baja.

Funciones auxiliares (salida cruda):

```sql
CREATE OR REPLACE FUNCTION public.fn_mis_entidades()
 RETURNS TABLE(entidad_tipo text, entidad_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.entidad_tipo::text, u.entidad_id
  FROM usuarios u
  WHERE u.auth_user_id = auth.uid()
    AND u.activo
    AND u.entidad_tipo IS NOT NULL
    AND u.entidad_id IS NOT NULL;
$function$

CREATE OR REPLACE FUNCTION public.fn_is_portal_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND activo
      AND rol IN ('propietario', 'profesional')
  );
$function$

CREATE OR REPLACE FUNCTION public.fn_mis_spc_visibles()
 RETURNS TABLE(spc_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.spc_id FROM fn_mis_spc_ids() m
  UNION
  SELECT i.spc_id
    FROM inscripciones i
    JOIN usuarios u ON u.id = i.inscripto_por
   WHERE u.auth_user_id = auth.uid() AND u.activo;
$function$

CREATE OR REPLACE FUNCTION public.rpc_padron_profesionales()
 RETURNS TABLE(id uuid, nombre text, apellido text, matricula_nro text, tipo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.nombre::text, p.apellido::text, p.matricula_nro::text, p.tipo::text
    FROM profesionales p
   WHERE p.activo
     AND p.club_id = fn_get_user_club_id()
   ORDER BY p.apellido, p.nombre;
$function$
```

Nota para GATE-1: `fn_mis_spc_visibles` hace visibles al portal **todas** las inscripciones del
SPC cuando `inscripto_por` es el usuario. Si el RPC transfiere `inscripto_por` (opción A), el
nuevo entrenador pasa a ver ese SPC en su "Mis inscripciones" y el que la cargó **deja de verla**
salvo que el SPC figure a su nombre por `spcs.entrenador_id`.

Policies de las tablas que la UI necesita leer desde el portal:

```sql
select c.relname, polname, polcmd, pg_get_expr(polqual, polrelid) as qual from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname in ('caballerizas','caballeriza_responsables','profesionales') order by 1,2;
```

| relname | polname | cmd | qual |
|---|---|---|---|
| `caballeriza_responsables` | `caballeriza_responsables_delete` | d | `fn_is_super_admin() OR fn_club_de_caballeriza(caballeriza_id) = fn_get_user_club_id()` |
| `caballeriza_responsables` | `caballeriza_responsables_insert` | a | (sin qual; withcheck no listado por la query) |
| `caballeriza_responsables` | `caballeriza_responsables_select` | r | `fn_is_super_admin() OR fn_club_de_caballeriza(caballeriza_id) = fn_get_user_club_id()` |
| `caballeriza_responsables` | `caballeriza_responsables_update` | w | `fn_is_super_admin() OR fn_club_de_caballeriza(caballeriza_id) = fn_get_user_club_id()` |
| `caballerizas` | `caballerizas_delete` | d | `(NOT fn_is_portal_user()) AND (fn_is_super_admin() OR club_id = fn_get_user_club_id())` |
| `caballerizas` | `caballerizas_insert` | a | (sin qual) |
| `caballerizas` | `caballerizas_select` | r | `fn_is_super_admin() OR club_id = fn_get_user_club_id()` |
| `caballerizas` | `caballerizas_update` | w | `(NOT fn_is_portal_user()) AND (fn_is_super_admin() OR club_id = fn_get_user_club_id())` |
| `profesionales` | `profesionales_delete` | d | `fn_is_super_admin()` |
| `profesionales` | `profesionales_insert` | a | (sin qual) |
| `profesionales` | `profesionales_select` | r | `fn_is_staff() OR id IN (SELECT entidad_id FROM fn_mis_entidades() WHERE entidad_tipo='profesional')` |
| `profesionales` | `profesionales_update` | w | `fn_is_staff()` |

**Lectura.** El usuario del portal **puede leer `caballeriza_responsables` de su club** (la policy
de SELECT es por club, sin exclusión de portal). Entonces la UI puede saber, antes de guardar, si la
caballeriza elegida tiene titular activo: `select caballeriza_id from caballeriza_responsables where
rol='propietario' and activo=true`. No hace falta un RPC nuevo para el aviso previo. Ojo: expone
`caballeriza_id` + `rol`, nada de DNI si se selecciona sólo esa columna.

### 1.5 Ventanas de R9 — medidas ahora

```sql
select c.id, c.numero_turno, c.estado, c.apertura_inscripcion, c.cierre_inscripcion, c.apertura_ratificacion, c.cierre_ratificacion, r.estado as reunion_estado, r.fecha, r.numero, now() as ahora,
 (now() between c.apertura_ratificacion and c.cierre_ratificacion) as en_ratif,
 (now() between c.apertura_inscripcion and c.cierre_inscripcion) as en_insc,
 (select count(*) from inscripciones i where i.carrera_id=c.id and i.canal='portal') as portal_insc,
 (select count(*) from inscripciones i where i.carrera_id=c.id) as total_insc
from carreras c join reuniones r on r.id=c.reunion_id where r.id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' order by c.numero_turno;
```

| turno | id | estado | apertura_insc | cierre_insc | apertura_rat | cierre_rat | reunión | ahora (UTC) | en_ratif | en_insc | portal | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | c037b139-b8b5-46d7-900e-cbc7a01bd643 | abierta | 2026-08-24 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | 2026-09-14 17:07:00 | false | false | 2 | 10 |
| 2 | 2d4016ad-460a-44c9-9b2d-d710a510edee | abierta | 2026-08-28 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | " | false | false | 0 | 8 |
| 3 | 7250cda2-4b1b-40f5-80ed-54121745241b | abierta | 2026-08-28 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | " | false | false | 0 | 7 |
| 4 | fbf0de67-875f-4dbd-834c-60503d2d6f2f | abierta | 2026-08-28 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | " | false | false | 0 | 13 |
| 5 | 9733113c-8c80-40eb-80b4-6f741abf125c | abierta | 2026-08-28 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | " | false | false | 0 | 4 |
| 6 | 7da3fa1c-a32a-42dc-ad2f-6b10e86cba22 | abierta | 2026-08-28 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | " | false | false | 0 | 6 |
| 7 | 3b553ea4-1052-4411-933b-156e6676dfc0 | abierta | 2026-08-28 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | " | false | false | 1 | 8 |
| 8 | bae8008f-87fc-479e-a416-27502c7489b3 | abierta | 2026-08-28 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | " | false | false | 1 | 3 |
| 9 | 5cd5d00e-c844-467d-925f-83b378863af5 | abierta | 2026-08-28 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | " | false | false | 0 | 6 |
| 10 | 099b050d-b7e5-412c-b789-55dae7d5cd13 | abierta | 2026-08-28 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | " | false | false | 1 | 8 |
| 11 | 0bf74c72-9300-4406-8949-d81705da0c23 | abierta | 2026-08-28 00:00+00 | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | " | false | false | 0 | 9 |

`ahora` exacto: `2026-09-14 17:07:00.492356+00`.

**Lectura.** `cierre_ratificacion` = 15:00 UTC = **12:00 AR** (la regla del lunes antes de las 12,
como dice el pedido). `cierre_inscripcion` = 14:00 UTC = 11:00 AR — distinto del viernes 11/09
que fijó `migrations/fix_ventanas_r9_hora_argentina.sql`; alguien lo corrió al lunes después. No
importa para este plan: **las dos ventanas cerraron hace más de dos horas.** El RPC (el de baja hoy,
el de modificación cuando exista) responde "Fuera de plazo" en los 11 turnos. Sólo se puede volver
a abrir editando `cierre_ratificacion` en `carta-llamados.html` (única pantalla que escribe esa
columna: `main:carta-llamados.html:1172,1231`).

### 1.6 Qué hay en R9 que se podría modificar

```sql
select i.id, ca.numero_turno, i.estado, i.canal, u.email as inscripto_por_email, u.rol, u.entidad_tipo, i.entrenador_id is not null as tiene_entr, i.caballeriza_id is not null as tiene_cab, i.propietario_id is not null as tiene_prop, i.jockey_titular_id is not null as tiene_jockey, s.nombre as spc
from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id left join usuarios u on u.id=i.inscripto_por
where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.canal='portal' order by ca.numero_turno;
```

| id | turno | estado | canal | inscripto_por | rol | entidad | entr | cab | prop | jockey | spc |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cf0b3019-42b2-447e-847a-7231635be8a9 | 1 | inscripto | portal | hipodromodolores@gmail.com | profesional | profesional | t | t | t | t | MOSQUITA GARDEN |
| 910a6bc4-bd54-47cc-901a-371744c02e24 | 1 | forfait | portal | studtomasytobias@hotmail.com | profesional | profesional | t | t | t | t | First Queen |
| cdb0ee6c-4f98-443c-adc9-3c9db9cf70ce | 7 | inscripto | portal | ronaquenay@hotmail.com | profesional | profesional | t | t | t | t | LATIN PRESUMIDA |
| 33549954-7ea5-41ff-ac3f-0ac1fc7335cb | 8 | inscripto | portal | ronaquenay@hotmail.com | profesional | profesional | t | t | t | t | LATIN PRESUMIDA |
| f2173cb9-b3e5-433b-be14-6e117c423ae6 | 10 | inscripto | portal | ronaquenay@hotmail.com | profesional | profesional | t | t | t | t | LATIN RAIN |

```sql
select ca.numero_turno, i.estado, count(*) from inscripciones i join carreras ca on ca.id=i.carrera_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' group by 1,2 order by 1,2;
```

```
T1 forfait 1 · T1 inscripto 9 · T2 inscripto 8 · T3 inscripto 7 · T4 inscripto 13 · T5 inscripto 4
T6 inscripto 6 · T7 inscripto 8 · T8 inscripto 3 · T9 inscripto 6 · T10 inscripto 8 · T11 inscripto 9
```

**Lectura.** 5 filas de portal en R9 (4 activas), de 3 usuarios distintos; **nada está ratificado
todavía** (82 `inscripto`, 1 `forfait`). Uno de los 3 usuarios es `hipodromodolores@gmail.com`,
que tiene rol `profesional` — es la cuenta con la que Yesi probó el portal. Los otros dos son
entrenadores reales. El feature aplica a esas 4 filas; el resto (79) es de secretaría y queda
fuera por el guard (4).

### 1.7 Lo que hay en `portal.html` (main) para reusar

`git show main:portal.html` — 1180 líneas. Puntos de anclaje, con número de línea:

| línea | qué | uso en este plan |
|---|---|---|
| 215–222 | sección `#section-inscripciones` + `#inscripciones-container` | ahí va la columna con el botón **Modificar** |
| 226–284 | `#modal-inscribir` con selects `minsc-caballeriza / minsc-entrenador / minsc-jockey / minsc-suplente` | **no se reusa el modal** (está atado a `carreraSeleccionada` y a la búsqueda de SPC); se factoriza la carga de `<option>` |
| 762–772 | `cargarInscripcionesCrudas()` — el `select` **no trae** `caballeriza_id`, `entrenador_id`, `jockey_suplente_id`, `propietario_id` | hay que agregarlos para prellenar el modal |
| 780–797 | `cargarPadronMonta()` — caballerizas por policy, jockeys/entrenadores por `rpc_padron_profesionales`, cache `padronMontaCargado` | se reusa tal cual |
| 803–834 | `renderSelectsMonta()` — arma los `<option>` de los 4 selects `minsc-*` | se extrae `opcionesMonta()` y se usa en los dos modales |
| 836–851 | `avisoJockeyRepetidoPortal()` — mira `misInscripciones` del turno, sólo activas (`ESTADOS_ACTIVOS_MONTA` de `jockey-repetido.js`) | se generaliza para recibir `carreraId` y `excluirId` (la propia fila) |
| 1051–1057 | `ventanaRatificacion(c, reunionEstado)` — fail-closed sobre `carreras.apertura/cierre_ratificacion` | se reusa |
| 1069–1081 | `modoRetiro(i)` → `null / 'inscripcion' / 'ratificacion'`; incluye `canal==='portal' && inscripto_por===miUsuarioId` | **mismo predicado para mostrar Modificar**: `puedeModificar(i) = modoRetiro(i) !== null` |
| 1111–1131 | filas de la tabla; última celda con el botón Retirar/Dar forfait | se agrega el botón Modificar al lado |
| 1145–1165 | `retirar(inscId)` — `confirm()` + `sb.rpc('rpc_baja_inscripcion')` + toast + reload | patrón para `guardarModificacion()` |

`jockey-repetido.js` (main) exporta `ESTADOS_ACTIVOS_MONTA`, `conteoJockeysActivos(inscripciones)`,
`jockeysRepetidos(inscripciones)`, `badgeJockeyDup(cantidad)`. Se cargan ya en `portal.html`
(línea 300, `<script src="jockey-repetido.js">`).

### 1.8 Cómo modifica la secretaría (`inscripciones.html`, main)

```
$ git show main:inscripciones.html | grep -n -E "\.update\(|\.from\('inscripciones'\)|caballeriza_id|entrenador_id|jockey_titular_id|jockey_suplente_id|canal|inscripto_por"
606:  const { data, error } = await sb.from('inscripciones')
607:    .select('*, cargador:usuarios!inscripciones_inscripto_por_fkey(nombre_completo), spcs(nombre)')
637:  const { error } = await sb.from('inscripciones').update({ numero_partidor: val }).eq('id', id);
661:    const jockeyDup = ESTADOS_ACTIVOS_MONTA.includes(i.estado) && !!i.jockey_titular_id && jockeyCount[i.jockey_titular_id] >= 2;
672:      const cargadaCell = i.canal === 'portal'
784:    document.getElementById('f-caballeriza').value = rec.caballeriza_id||'';
785:    document.getElementById('f-entrenador').value = rec.entrenador_id||'';
786:    document.getElementById('f-jockey-titular').value = rec.jockey_titular_id||'';
787:    document.getElementById('f-jockey-suplente').value = rec.jockey_suplente_id||'';
832:    caballeriza_id: cabId,
833:    entrenador_id: document.getElementById('f-entrenador').value || null,
834:    jockey_titular_id: document.getElementById('f-jockey-titular').value || null,
835:    jockey_suplente_id: document.getElementById('f-jockey-suplente').value || null,
848:    ? await sb.from('inscripciones').update(payload).eq('id',id)
849:    : await sb.from('inscripciones').insert(payload);
855:  avisarJockeyRepetido(payload.jockey_titular_id);
872:  const { error } = await sb.from('inscripciones').delete().eq('id',id);
```

**Lectura.** La secretaría edita los mismos 4 campos con un `update(payload)` directo (línea 848),
sin RPC ni ventana — la RLS de club es su único guard. **No se toca nada de esto.** La secretaría
sigue pudiendo modificar cualquier fila, incluidas las de portal, en cualquier momento. La columna
"Cargada por" (línea 672) muestra `inscripto_por` → relevante para GATE-1.

### 1.9 Probe existente a imitar

`tests/probe_forfait_portal.mjs` (457 líneas): sesiones de portal reales (`generateLink` magiclink +
`verifyOtp`), fixture propio (reunión 9989 fecha 2099, 7 carreras con ventanas relativas a `now()`),
llama al **RPC real**, relee la fila con admin para assertear efecto (GOTCHA #93), teardown en el
`finally`, y **mutation testing** con `--mutantes`: los mutantes de `portal.html` corren solos sobre
una copia; los de SQL se emiten como `.sql` sobre una función **gemela** (`_mut`) que se aplica y
dropea por MCP, con el probe hijo apuntado por env. Ese esqueleto se copia entero.

Columnas de `inscripciones` (para el `SET` y el snapshot del probe):

```
id, carrera_id, spc_id, propietario_id, entrenador_id, jockey_titular_id, jockey_suplente_id,
numero_partidor, peso_declarado, peso_final, estado (enum, default 'pre_inscripto'),
canal (enum, default 'manual'), motivo_estado, info_adicional, inscripto_por, ratificado_por,
created_at, updated_at, caballeriza_id, peon, capataz, sereno, certificado_correr, peso_balanza, performance
```

---

## 2. Las ventanas

Misma fuente que el forfait del portal: **`carreras.apertura/cierre_inscripcion` y
`carreras.apertura/cierre_ratificacion`**, fail-closed (si falta una fecha, esa ventana está
cerrada). NO `reuniones.hora_cierre_ratificacion` (gobierna `ratificacion.html`, es la ventana de
la secretaría — ISSUE-075). Reunión `publicada` y carrera no `anulada`.

Estados admitidos, espejo de `rpc_baja_inscripcion`:

| ventana abierta | estado admitido | razón |
|---|---|---|
| inscripción (y no ratificación) | `inscripto` | si la secretaría ya la procesó, no se toca desde el portal |
| ratificación | `inscripto`, `ratificado` | es justo cuando se define la monta; un ratificado puede cambiar jockey |
| ninguna | — | "Fuera de plazo" |

Guard extra, conservador: **si `estado='ratificado'`, `p_jockey_titular_id` no puede ser NULL**
(`ratificacion.html:897,947` no deja ratificar sin jockey; no hay que permitir des-jockeyzar por
atrás). Anotado como decisión mía; se saca si Yesi dice que un ratificado puede quedar sin jockey.

## 3. Qué se puede cambiar

`caballeriza_id`, `entrenador_id`, `jockey_titular_id`, `jockey_suplente_id`. Nada más. El RPC no
recibe `spc_id` ni `carrera_id` ni `estado` ni `numero_partidor`; el `UPDATE` lista sólo esas
cuatro columnas (más `inscripto_por` si GATE-1 = A). Cambiar de caballo o de turno = Retirar +
anotar de nuevo, como pidió Yesi.

Validaciones de padrón copiadas de `rpc_inscribir` contra el **club de la reunión** (no el del
usuario): caballeriza activa del club; entrenador `activo AND tipo IN ('entrenador','ambos')`;
jockey y suplente `tipo IN ('jockey','ambos')`; suplente ≠ titular; sin titular no hay suplente.

---

## 4. El RPC — `rpc_modificar_inscripcion` (borrador completo, NO aplicado)

Archivo: `migrations/rpc_modificar_inscripcion.sql`. Se aplica por MCP `apply_migration`
(`rpc_modificar_inscripcion_portal`). Devuelve `jsonb` y no `boolean`, porque la UI necesita
saber dos cosas después de guardar: si la fila quedó sin propietario y si (GATE-1 = A) dejó de ser
del que llama.

```sql
-- ============================================================================
-- rpc_modificar_inscripcion — el entrenador modifica lo suyo desde el portal
--
-- Pedido de Yesi (14/09/2026): botón "Modificar" en Mis inscripciones. Puede
-- cambiar caballeriza, entrenador que presenta, jockey y suplente. NO el SPC
-- ni el turno (eso es retirar y anotar de nuevo).
--
-- Guards: los mismos de rpc_baja_inscripcion, en el mismo orden —
--   propia (canal='portal' AND inscripto_por = yo), reunión publicada, ventana
--   de inscripción O de ratificación (fail-closed sobre carreras.*).
-- Validaciones de padrón: las de rpc_inscribir, contra el club de la reunión.
--
-- Cadena del propietario: trg_insc_set_propietario (BEFORE UPDATE OF
-- caballeriza_id) re-deriva propietario_id. Si la caballeriza nueva no tiene
-- titular activo, el trigger deja NULL sin avisar (GOTCHA #47). Acá se detecta
-- ANTES y se devuelve `sin_propietario` para que la UI lo diga. No se bloquea:
-- ese pozo lo regulariza la secretaría (propietarios_provisorios_r9.sql).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_modificar_inscripcion(
  p_inscripcion_id     uuid,
  p_caballeriza_id     uuid,
  p_entrenador_id      uuid,
  p_jockey_titular_id  uuid DEFAULT NULL,
  p_jockey_suplente_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_usuario_id       uuid;
  v_insc             RECORD;
  v_carrera          RECORD;
  v_club_id          uuid;
  v_en_inscripcion   boolean;
  v_en_ratificacion  boolean;
  v_titular_nuevo    uuid;      -- propietario_id que va a derivar el trigger
  v_sin_propietario  boolean;
  v_cambio_entrenador boolean;
  v_propietario_post uuid;
  v_inscripto_por_post uuid;
BEGIN
  -- (1) entidad de portal
  IF NOT EXISTS (
    SELECT 1 FROM fn_mis_entidades() e
     WHERE e.entidad_tipo IN ('profesional', 'propietario')
  ) THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal.';
  END IF;

  -- (2) usuario activo
  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.';
  END IF;

  -- (3) la fila existe. FOR UPDATE: dos pestañas no se pisan.
  SELECT * INTO v_insc FROM inscripciones WHERE id = p_inscripcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa inscripción no existe.';
  END IF;

  -- (4) propia: canal='portal' AND inscripto_por = el que llama (= baja)
  IF v_insc.canal IS DISTINCT FROM 'portal'
     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id
  THEN
    RAISE EXCEPTION 'Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.';
  END IF;

  -- (5) reunión publicada, carrera no anulada
  SELECT c.*, r.estado::text AS reunion_estado, r.club_id AS club_id
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = v_insc.carrera_id;
  v_club_id := v_carrera.club_id;

  IF v_carrera.reunion_estado IS DISTINCT FROM 'publicada' THEN
    RAISE EXCEPTION 'Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.';
  END IF;
  IF v_carrera.estado IS NOT DISTINCT FROM 'anulada' THEN
    RAISE EXCEPTION 'Ese turno está anulado.';
  END IF;

  -- (6) las dos ventanas, fail-closed (idéntico a rpc_baja_inscripcion)
  v_en_inscripcion := v_carrera.apertura_inscripcion IS NOT NULL
                  AND v_carrera.cierre_inscripcion   IS NOT NULL
                  AND now() >= v_carrera.apertura_inscripcion
                  AND now() <= v_carrera.cierre_inscripcion;

  v_en_ratificacion := v_carrera.apertura_ratificacion IS NOT NULL
                   AND v_carrera.cierre_ratificacion   IS NOT NULL
                   AND now() >= v_carrera.apertura_ratificacion
                   AND now() <= v_carrera.cierre_ratificacion;

  IF NOT (v_en_inscripcion OR v_en_ratificacion) THEN
    RAISE EXCEPTION 'Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.';
  END IF;

  -- (7) estado admitido según ventana (espejo de la baja)
  IF v_en_inscripcion AND NOT v_en_ratificacion THEN
    IF v_insc.estado IS DISTINCT FROM 'inscripto' THEN
      RAISE EXCEPTION 'Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.';
    END IF;
  ELSE
    IF v_insc.estado NOT IN ('inscripto', 'ratificado') THEN
      RAISE EXCEPTION 'Ese caballo ya figura como % y no se puede modificar desde el portal.', v_insc.estado;
    END IF;
  END IF;

  -- (8) padrón, contra el club de la reunión (= rpc_inscribir)
  IF p_caballeriza_id IS NULL THEN
    RAISE EXCEPTION 'Falta la caballeriza: es obligatoria.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM caballerizas
     WHERE id = p_caballeriza_id AND activo AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'Esa caballeriza no existe o no está activa en este hipódromo.';
  END IF;

  IF p_entrenador_id IS NULL THEN
    RAISE EXCEPTION 'Falta el entrenador: hay que declarar quién presenta el caballo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profesionales
     WHERE id = p_entrenador_id AND activo
       AND tipo IN ('entrenador', 'ambos') AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'El entrenador declarado no está en el padrón activo de este hipódromo.';
  END IF;

  IF p_jockey_titular_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM profesionales
        WHERE id = p_jockey_titular_id AND activo
          AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
     )
  THEN
    RAISE EXCEPTION 'El jockey declarado no está en el padrón activo de este hipódromo.';
  END IF;

  IF p_jockey_suplente_id IS NOT NULL THEN
    IF p_jockey_titular_id IS NULL THEN
      RAISE EXCEPTION 'No se puede declarar un suplente sin jockey titular.';
    END IF;
    IF p_jockey_suplente_id = p_jockey_titular_id THEN
      RAISE EXCEPTION 'El suplente no puede ser el mismo jockey que el titular.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM profesionales
       WHERE id = p_jockey_suplente_id AND activo
         AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
    ) THEN
      RAISE EXCEPTION 'El jockey suplente no está en el padrón activo de este hipódromo.';
    END IF;
  END IF;

  -- (9) un ratificado no se queda sin jockey (ratificacion.html no ratifica sin jockey)
  IF v_insc.estado = 'ratificado' AND p_jockey_titular_id IS NULL THEN
    RAISE EXCEPTION 'Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría.';
  END IF;

  -- (10) cadena del propietario: qué va a derivar el trigger para la
  --      caballeriza nueva. Se mira ANTES para poder decirlo.
  SELECT cr.propietario_id INTO v_titular_nuevo
    FROM caballeriza_responsables cr
   WHERE cr.caballeriza_id = p_caballeriza_id AND cr.rol = 'propietario' AND cr.activo = true
   LIMIT 1;
  v_sin_propietario := v_titular_nuevo IS NULL;

  v_cambio_entrenador := p_entrenador_id IS DISTINCT FROM v_insc.entrenador_id;

  -- (11) el UPDATE. Sólo las cuatro columnas. spc_id, carrera_id, estado,
  --      numero_partidor, canal NO están en el SET: no hay forma de tocarlos.
  --      El trigger trg_insc_set_propietario re-deriva propietario_id.
  UPDATE inscripciones
     SET caballeriza_id     = p_caballeriza_id,
         entrenador_id      = p_entrenador_id,
         jockey_titular_id  = p_jockey_titular_id,
         jockey_suplente_id = p_jockey_suplente_id
   WHERE id = p_inscripcion_id;

  -- ── SÓLO SI GATE-1 = A (regla literal de Yesi) ───────────────────────────
  -- Si el entrenador que presenta cambió y no soy yo, la fila pasa a ser del
  -- usuario del portal de ese entrenador; si no tiene usuario, de nadie
  -- (sólo secretaría). Queda el rastro en auditoria (OLD/NEW).
  -- IF v_cambio_entrenador AND NOT EXISTS (
  --      SELECT 1 FROM fn_mis_entidades() e
  --       WHERE e.entidad_tipo = 'profesional' AND e.entidad_id = p_entrenador_id)
  -- THEN
  --   UPDATE inscripciones
  --      SET inscripto_por = (SELECT u.id FROM usuarios u
  --                            WHERE u.entidad_tipo = 'profesional'
  --                              AND u.entidad_id = p_entrenador_id
  --                              AND u.activo
  --                            ORDER BY u.created_at LIMIT 1)
  --    WHERE id = p_inscripcion_id;
  -- END IF;
  -- ─────────────────────────────────────────────────────────────────────────

  -- (12) releer y verificar que el trigger hizo lo que se esperaba
  SELECT propietario_id, inscripto_por INTO v_propietario_post, v_inscripto_por_post
    FROM inscripciones WHERE id = p_inscripcion_id;

  IF v_propietario_post IS DISTINCT FROM v_titular_nuevo THEN
    -- Defensivo: si esto salta, el trigger cambió o alguien lo deshabilitó.
    RAISE EXCEPTION 'La derivación del propietario no coincide (esperado %, quedó %). No se guardó.',
      v_titular_nuevo, v_propietario_post;
  END IF;

  RETURN jsonb_build_object(
    'ok',                true,
    'inscripcion_id',    p_inscripcion_id,
    'propietario_id',    v_propietario_post,
    'sin_propietario',   v_sin_propietario,
    'cambio_entrenador', v_cambio_entrenador,
    'sigue_siendo_mia',  v_inscripto_por_post = v_usuario_id
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_modificar_inscripcion(uuid, uuid, uuid, uuid, uuid) IS
  'Portal: modificar caballeriza/entrenador/jockey/suplente de una inscripción propia (canal=portal, inscripto_por=yo) dentro de la ventana de inscripción o de ratificación. Devuelve jsonb con sin_propietario y sigue_siendo_mia. Pedido de Yesi 14/09/2026.';

REVOKE ALL     ON FUNCTION public.rpc_modificar_inscripcion(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.rpc_modificar_inscripcion(uuid, uuid, uuid, uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_modificar_inscripcion(uuid, uuid, uuid, uuid, uuid) TO authenticated;
```

Notas sobre el borrador:
- `FOR UPDATE` en (3): la baja no lo tiene; acá vale porque Yesi puede estar ratificando la misma
  fila desde `ratificacion.html` al mismo tiempo (la ventana es justo esa). Con el lock, el
  `estado` que se chequea en (7) es el que va a quedar.
- El chequeo (12) es una **doble red**: si alguien deshabilita/cambia el trigger, la función no
  guarda un `propietario_id` incoherente. También es lo que hace que el mutante "el trigger no
  corre" muera en el probe.
- (10) no bloquea cuando `v_sin_propietario`. Alternativa más dura: `RAISE`. La descarto porque
  (a) la secretaría hace lo mismo sin aviso hoy, (b) 43 caballerizas caerían en el bloqueo y el
  entrenador no puede arreglarlo desde el portal, (c) el `DO` de provisorios ya existe para eso.
  Si preferís bloquear, es cambiar dos líneas y un assert.

## 5. UI en `portal.html`

### 5.1 Botón y modal

- En la última celda de la tabla de Mis inscripciones (línea 1119–1128 de main), al lado de
  Retirar/Dar forfait: `<button class="btn-sm" onclick="abrirModificar(id)">Modificar</button>`,
  visible con el **mismo predicado** `modoRetiro(i) !== null` (propia + portal + ventana + estado).
  La fila que no cumpla muestra `—` como hoy. El texto explicativo al pie se amplía con una línea:
  "Modificar cambia la caballeriza, el entrenador que presenta, el jockey o el suplente. El caballo y
  el turno no se cambian: para eso, retirá y anotá de nuevo."
- Modal nuevo `#modal-modificar` (no se reusa `#modal-inscribir`: está acoplado a
  `carreraSeleccionada` y a la búsqueda del padrón). Cabecera: `Modificar — <SPC> · Turno N ·
  Reunión R`. Cuatro selects `mmod-caballeriza / mmod-entrenador / mmod-jockey / mmod-suplente`,
  poblados con `opcionesMonta()` (extraída de `renderSelectsMonta()`, misma lista) y prellenados
  con los valores de la fila. Botones Cancelar / Guardar.
- `cargarInscripcionesCrudas()` agrega al `select`: `caballeriza_id, entrenador_id,
  jockey_suplente_id, propietario_id`.

### 5.2 Aviso: caballeriza sin titular (antes de guardar)

- Al abrir el modal (una vez por sesión, cacheado): `sb.from('caballeriza_responsables')
  .select('caballeriza_id').eq('rol','propietario').eq('activo',true)` → `Set` de caballerizas
  con titular. La policy lo permite (§1.4).
- `onchange` del select de caballeriza: si la elegida no está en el Set, aparece inline
  `⚠ Esta caballeriza no tiene propietario titular cargado. Si la guardás, la inscripción queda
  SIN PROPIETARIO para la liquidación de premios hasta que la secretaría lo cargue.`
- Al Guardar, si aplica, `confirm()` con el mismo texto + "¿Guardar igual?". Si el usuario
  cancela, no se llama al RPC.
- Después del RPC, si `resultado.sin_propietario === true` (el RPC lo mira en la base, no en el
  cache del front), toast `warning` con el mismo aviso. Doble aviso a propósito: el cache del
  front puede estar viejo.

### 5.3 Aviso: cambio de entrenador que presenta (antes de guardar)

Texto según GATE-1:

- **Opción A** (transfiere): `Estás cambiando el entrenador que presenta a <X>. La inscripción
  pasa a ser de esa persona: vos ya no vas a poder modificarla ni retirarla desde el portal. Para
  cualquier cambio posterior, hablá con la secretaría. ¿Confirmás?`
- **Opción B** (no transfiere): `Estás cambiando el entrenador que presenta a <X>. En el programa
  y en la liquidación el caballo figura presentado por <X>. Vos seguís pudiendo modificar o retirar
  esta inscripción porque la cargaste vos. ¿Confirmás?`

Sólo se pregunta si `entrenador nuevo !== entrenador actual`. Después del RPC, con
`sigue_siendo_mia === false` (sólo A) se muestra toast y la fila desaparece del listado tras el
reload (ya no pasa el filtro de `fn_mis_spc_visibles` salvo tenencia).

### 5.4 Aviso: jockey repetido en el turno (aviso, no bloqueo)

`avisoJockeyRepetidoPortal()` se generaliza a `avisoJockeyRepetido(elAviso, jockeyId, carreraId,
excluirInscId)`: cuenta con `conteoJockeysActivos` sobre `misInscripciones` del turno, **excluyendo
la propia fila** (si no, el propio caballo se contaría como colisión al no cambiar el jockey). El
modal de anotar sigue llamándola con `excluirInscId = null`. Después de guardar, mismo toast que
`anotar()` (líneas 1030–1035): `⚠ Ese jockey queda en N caballos tuyos de este turno…`. Sigue
siendo parcial (sólo se ven las propias) — el aviso completo lo tiene la secretaría.

### 5.5 Guardar

```js
async function guardarModificacion() {
  // lee los 4 selects; valida suplente-sin-titular en el front (como anotar());
  // confirm() de entrenador si cambió (5.3); confirm() de caballeriza sin titular (5.2);
  const { data, error } = await sb.rpc('rpc_modificar_inscripcion', {
    p_inscripcion_id: id, p_caballeriza_id, p_entrenador_id, p_jockey_titular_id, p_jockey_suplente_id });
  if (error) { console.error('[rpc_modificar_inscripcion]', error); toast(msg, 'error'); return; }
  toast('Inscripción modificada');
  if (data.sin_propietario)  toast('⚠ …sin propietario…', 'warning');
  if (!data.sigue_siendo_mia) toast('La inscripción pasó a <X>. Ya no la vas a ver acá.', 'warning');
  await cargarInscripcionesCrudas(); /* aviso jockey ×N */ loadMisInscripciones(); cerrarModificar();
}
```

Ningún cambio en `inscripciones.html`, `ratificacion.html`, `jockey-repetido.js` ni en las
policies.

---

## 6. GATE-1 — la tenencia cuando cambia el entrenador que presenta

**Hecho.** Hoy "propia" es `canal='portal' AND inscripto_por = yo`. `entrenador_id` es una
declaración ("quién presenta"), no la clave de tenencia. Ya pasa con `rpc_inscribir`: un
propietario anota con entrenador X y X **no** puede tocar esa fila desde el portal; el propietario
sí. Yesi describe la consecuencia "si cambia el entrenador, deja de ser suya" como si fuera
automática — **no lo es** con el modelo vigente. Hay que elegir:

| | **A — transferir** (regla literal de Yesi) | **B — no transferir** (modelo vigente) |
|---|---|---|
| Qué hace el RPC | si el entrenador nuevo no soy yo, `inscripto_por` := usuario del portal del nuevo entrenador, o NULL si no tiene | no toca `inscripto_por` |
| Quién puede tocarla después | el nuevo entrenador (si tiene cuenta) / sólo secretaría | el que la cargó, como siempre |
| "Cargada por" en `inscripciones.html` | cambia al nuevo entrenador — **deja de decir quién la cargó**; el rastro queda sólo en `auditoria` | sigue diciendo la verdad |
| `fn_mis_spc_visibles` | el nuevo entrenador pasa a ver el SPC (todas sus inscripciones); el que cargó deja de verla si el SPC no es suyo | sin cambios |
| Vector raro | A anota un caballo y lo "empuja" al portal de B sin que B lo pida (ya puede declararlo presentador hoy, pero no meterlo en su listado) | ninguno nuevo |
| Aviso en UI | el de §5.3-A | el de §5.3-B |
| Probe | +2 asserts (transferencia, NULL cuando no hay cuenta) +1 mutante | +1 assert (inscripto_por intacto) +1 mutante |

**Recomendación: B para esta versión.** No reescribe una columna de auditoría a seis días de la
reunión, no cambia lo que ve nadie en su portal sin pedirlo, y el aviso dice algo que es verdad.
Si Yesi confirma que quiere el traspaso literal, A es el bloque comentado de §4 más el texto A de
§5.3 — media hora de trabajo, y se puede hacer después de R9 sin tocar lo demás. Si elegís A ahora,
va igual: está diseñado y probado en el mismo probe.

**Otras decisiones tomadas (avisar si no van):**
- **D1** No se bloquea la caballeriza sin titular; se avisa dos veces (front + RPC). §4 nota (10).
- **D2** Un `ratificado` no puede quedar sin jockey. §2.
- **D3** `FOR UPDATE` en la fila (Yesi ratificando en paralelo). §4 nota (3).
- **D4** Los mismos estados que la baja: `inscripto` en ventana de inscripción; `inscripto` o
  `ratificado` en ratificación. No se modifica un `forfait` ni un `mal_inscrito`.

---

## 7. Probe — `tests/probe_modificar_inscripcion_portal.mjs`

Esqueleto: copia de `probe_forfait_portal.mjs` (sesiones de portal reales, fixture reunión
**9987** fecha 2099, teardown en `finally`, `--mutantes` con gemela `rpc_modificar_inscripcion_mut`
por env `RPC_MOD`). **No toca R9 ni ninguna reunión real.**

Fixture: usuarios de portal **A** (profesional, entrenador `profA`) y **B** (profesional,
`profB`); entrenador **C** sin cuenta; jockeys `j1`, `j2`; caballerizas `cabCon` (con titular:
insert en `caballeriza_responsables` rol propietario + DNI de probe → el trigger crea el
propietario) y `cabSin` (sin responsables); SPCs de probe; carreras con ventanas relativas a
`now()`: `cInsc` (inscripción abierta), `cRat` (sólo ratificación abierta), `cDesp` (las dos
cerradas), `cHueco` (inscripción cerrada, ratificación no abrió), `cNull` (ratificación NULL),
`cBorr` (reunión borrador con ratificación abierta). Inscripciones: A anota por `rpc_inscribir`
en `cInsc`; en las demás se insertan con admin `canal='portal', inscripto_por=A` (la ventana de
inscripción está cerrada ahí, `rpc_inscribir` no las dejaría entrar); una fila de secretaría
`canal='manual', inscripto_por=NULL` en `cInsc`; una fila de A en `cRat` con `estado='ratificado'`.

Todos los asserts de efecto **releen la fila con admin** (GOTCHA #93). Antes de cada llamada se
snapshotea `spc_id, carrera_id, estado, numero_partidor, canal` y se assertea que **no cambiaron**
(A0, transversal).

| # | caso | espera |
|---|---|---|
| A1 | A modifica lo suyo en ventana de inscripción (jockey j1→j2, suplente) | ok; fila con j2; `spc/carrera/estado/partidor/canal` iguales |
| A2 | A modifica lo suyo en ventana de ratificación, `inscripto` | ok |
| A3 | A modifica lo suyo en ventana de ratificación, `ratificado` (cambia jockey) | ok; `estado` sigue `ratificado`, `numero_partidor` intacto |
| A4 | A intenta dejar sin jockey un `ratificado` | error "tiene que tener jockey"; fila intacta (D2) |
| A5 | B modifica la de A | error "no la cargó usted"; fila intacta |
| A6 | A modifica la de secretaría (`canal='manual'`) | error; fila intacta |
| A7 | A modifica en `cDesp` (las dos cerradas) | error "Fuera de plazo" |
| A8 | A modifica en `cHueco` | error "Fuera de plazo" |
| A9 | A modifica en `cNull` (fail-closed) | error "Fuera de plazo" |
| A10 | A modifica en `cBorr` (reunión borrador) | error "no está publicada" |
| A11 | A cambia caballeriza a `cabCon` | ok; `propietario_id` = propietario del titular de `cabCon` (re-derivado por el trigger); `sin_propietario=false` |
| A12 | A cambia caballeriza a `cabSin` | ok; `propietario_id IS NULL`; **`sin_propietario=true`** (detectado) |
| A13 | A cambia caballeriza `cabSin`→`cabCon` de nuevo | `propietario_id` vuelve al titular (el trigger re-deriva en los dos sentidos) |
| A14 | A cambia sólo el jockey (no la caballeriza) con `propietario_id` puesto | `propietario_id` intacto (el trigger no corre, y no debe) |
| A15 | entrenador de otro club / inactivo | error de padrón |
| A16 | suplente sin titular; suplente = titular | error |
| A17 | A cambia entrenador `profA`→`profC` | ok; `cambio_entrenador=true`; **B:** `inscripto_por` intacto, `sigue_siendo_mia=true` · **A:** `inscripto_por IS NULL` (C sin cuenta), `sigue_siendo_mia=false`, segunda llamada de A → error "no la cargó usted" |
| A18 | (sólo GATE-1=A) A cambia entrenador → `profB` | `inscripto_por` = usuario B; B puede modificarla; A no |
| A19 | sesión sin entidad de portal (usuario staff) | error "para usuarios del portal" |
| A20 | `auditoria` tiene una fila UPDATE para la modificación de A1 | rastro presente |
| U1 | `portal.html` (main / copia mutada): botón Modificar sale con el mismo predicado que Retirar — `modoRetiro` extraída y ejecutada sobre filas sintéticas | ok |
| U2 | `cargarInscripcionesCrudas` pide `caballeriza_id, entrenador_id, jockey_suplente_id, propietario_id` (texto) | ok |
| U3 | `guardarModificacion` extraída con stubs: cambia entrenador → `confirm()` se llama con el texto acordado antes de `sb.rpc` | ok |
| U4 | caballeriza sin titular → `confirm()` con el texto de §5.2; si devuelve false, `sb.rpc` **no** se llama | ok |
| U5 | `avisoJockeyRepetido` extraída: jockey ya en otro caballo propio del turno → aviso; la propia fila **no** cuenta | ok |
| U6 | después de `sb.rpc` con `sin_propietario:true` (stub), aparece el toast `warning` | ok |
| R1 | restore: fixtures borradas y `count(*) FROM spcs` = 205 al final; **cero** filas `probe-mod-*` en `usuarios`, `profesionales`, `caballerizas`, `caballeriza_responsables`, `propietarios`, `inscripciones`, `carreras`, `reuniones`, `auth.users` | limpio |

### Mutation test — uno por guard

SQL (gemela `rpc_modificar_inscripcion_mut`, aplicada/dropeada por MCP, el real no se toca):

| id | mutante | tiene que matar |
|---|---|---|
| M1 | cae `canal='portal'` del guard (4) | A6 |
| M2 | cae `inscripto_por = yo` del guard (4) | A5 |
| M3 | reunión publicada → `IF false` | A10 |
| M4 | `v_en_inscripcion := true` | A7, A8 |
| M5 | `v_en_ratificacion := false` | A2, A3 |
| M6 | fail-closed de NULL desaparece (`coalesce(…, true)`) | A9 |
| M7 | estado en ratificación acepta cualquiera (`IF false`) | (fixture con `forfait`) A-extra |
| M8 | cae el guard "ratificado necesita jockey" | A4 |
| M9 | el `SET` agrega `spc_id = spc_id_de_otro` / `estado='inscripto'` | A0/A3 |
| M10 | (10) `v_sin_propietario := false` siempre | A12 |
| M11 | (12) chequeo post-trigger → `IF false` + `SET propietario_id = NULL` explícito | A11, A13 |
| M12 | cae la validación de padrón del entrenador | A15 |
| M13 | cae "suplente sin titular" | A16 |
| M14 | **B:** el RPC pisa `inscripto_por` con NULL · **A:** el bloque de transferencia → `IF false` | A17 |
| M15 | `FOR UPDATE` quitado | no matable por probe (concurrencia): se declara **equivalente-no-cubierto**, no cuenta como sobreviviente |

Portal (copia de `portal.html` por env `PORTAL_HTML`):

| id | mutante | mata |
|---|---|---|
| P1 | botón Modificar sale siempre (sin `modoRetiro`) | U1 |
| P2 | el `select` deja de pedir `propietario_id,…` | U2 |
| P3 | `confirm()` de entrenador quitado | U3 |
| P4 | `confirm()` de caballeriza sin titular quitado / se llama al RPC igual con false | U4 |
| P5 | la propia fila cuenta en el aviso de jockey | U5 |
| P6 | el toast de `sin_propietario` quitado | U6 |

Criterio: **tanda limpia = 0 sobrevivientes, 0 errores de arnés** (GOTCHA #82/#84). M15 va
listado aparte como no cubierto, con la razón.

---

## 8. Secuencia de ejecución (después del OK)

1. Rama `feat/portal-modificar-inscripcion` desde `main` (`c0e7803`).
2. `migrations/rpc_modificar_inscripcion.sql` (con o sin el bloque A). **No se aplica todavía.**
3. `tests/probe_modificar_inscripcion_portal.mjs` completo, con `--mutantes`.
4. Guards de sesión. `apply_migration` `rpc_modificar_inscripcion_portal` por MCP. `get_advisors`
   security (surfacear lo que salga).
5. `node tests/probe_modificar_inscripcion_portal.mjs` → tiene que dar `N/N OK`. Si algo falla,
   se arregla el SQL con un nuevo `CREATE OR REPLACE`, no se sigue.
6. `--mutantes`: los P automáticos; los M uno por uno por MCP (gemela → correr con `RPC_MOD` →
   `DROP`). Verificar al final que `rpc_modificar_inscripcion_mut` **no existe** (GOTCHA de la
   gemela que revive, `docs/GOTCHAS.md:1555-1600`).
7. `portal.html`: §5. Probe de nuevo (los U corren contra el archivo).
8. Docs: `CHANGELOG.md`, `docs/MODULOS.md` (portal), `SCHEMA.md` + `docs/SCHEMA.md` (RPC nueva),
   `CLAUDE.md` (línea del probe, nota en R9), `tests/README.md`, `docs/ISSUES.md` (ISSUE nuevo:
   "tenencia = inscripto_por, no entrenador_id" — sea A o B, hay que dejarlo escrito porque Yesi
   cree otra cosa).
9. Commit + push de la rama. Informe de ejecución en `reports` con salidas crudas.
10. **Merge a `main` sólo con OK explícito.** Después: md5 contra `sigh.com.ar/portal.html`,
    probe contra el HTML servido, `git ls-remote`.
11. **Aparte, y antes que todo esto si querés que sirva hoy**: Yesi extiende
    `cierre_ratificacion` de los turnos de R9 desde `carta-llamados.html`. Sin eso, el botón
    aparece deshabilitado (`—`) y el RPC dice "Fuera de plazo". No lo hago yo por SQL: es su
    plazo.

Rollback: `DROP FUNCTION public.rpc_modificar_inscripcion(uuid,uuid,uuid,uuid,uuid)` + revertir
el merge. No hay DDL sobre tablas, no hay backfill, no hay cambio de policies ni de triggers.

## 9. Preguntas abiertas

1. **GATE-1**: A o B (§6). Recomiendo B.
2. ¿Bloquear o avisar con caballeriza sin titular? Propuesto: avisar (D1).
3. ¿Un ratificado puede quedar sin jockey desde el portal? Propuesto: no (D2).
4. ¿Se extiende hoy la ventana de R9? Si no, el feature queda para R10 y no hay apuro de tocar
   la cadena del propietario esta semana.
5. `cierre_inscripcion` de R9 está en 14/09 11:00 AR, no en el viernes 11/09 12:00 AR que fijó
   `fix_ventanas_r9_hora_argentina.sql`. ¿Fue Yesi a propósito? No cambia este plan; lo anoto
   porque es distinto de lo documentado.

## 10. Verificación de publicación

Primer commit del informe:

```
$ git push -u origin reports
$ git ls-remote origin reports
8bf9946c5f06234328cb2081e53a455210c537aa	refs/heads/reports
$ git rev-parse HEAD
8bf9946c5f06234328cb2081e53a455210c537aa
```

Coinciden. Esta sección se agregó en un segundo commit sobre `reports` (mismo archivo); el SHA
final es el que muestra `git log -1 -- docs/diagnosticos/2026-09-14_plan-modificar-inscripcion-portal.md`.
