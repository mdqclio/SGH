# Plan — alta de caballeriza sin titular → propietario provisorio automático (criterio Fede 15/08)

- **Fecha**: 2026-09-16, 19:00 UTC (16:00 AR). Reunión R9: **domingo 20/09**.
- **SHA de `main` relevado**: `7887a27f2dc2cbf0d1c3a16a1e82b0b4d31d1ace`. Todo grep/lectura contra `main`; este archivo en `reports`.
- **Estado**: **PLAN, sin aplicar.** Nada de código de producto, nada en la base. Guards: `pwd=/home/clio/dev/SGH`, `spcs=210`, ref `unlhcuanfrtpatoipwve`.
- **Diagnóstico de base**: `2026-09-16_alta-caballeriza-exige-titular.md` (`a56d388`).

## 0. Decisión que pide Leo — cuál conviene

| | **A — provisorio automático** (criterio Fede 15/08, en pantalla) | **B — mínima: permitir guardar sin titular; después corro el `DO`** |
|---|---|---|
| Qué hace | Titular opcional. Si queda vacío, al guardar el sistema crea el `propietarios` provisorio con el nombre de la caballeriza + el vínculo `rol propietario` sin DNI + re-deriva las inscripciones sin propietario de esa caballeriza. **Lo mismo que el `DO`, para una caballeriza, en el momento.** | Titular opcional. La caballeriza nace sin ninguna fila de responsable (como las 43 de hoy). El `DO` de `propietarios_provisorios_r9.sql` la agarra después — **sólo si tiene inscripción en R9 y sin `propietario_id`**. |
| Yesi queda con | caballeriza **con dueño provisorio** al instante; inscribe y la inscripción ya sale con `propietario_id`. | caballeriza **huérfana** hasta que yo corra el `DO`; sus inscripciones nacen con `propietario_id NULL` (GOTCHA #47) y el portal le avisa "sin propietario" a cada entrenador que la elija. |
| Las 43 de hoy (y PARAJE LA TABLADA con TIRSO/GRAN RAUL en R9) | botón **"Crear provisorio"** en la card de cada caballeriza sin titular → mismo RPC. Yesi las arregla sola, sin SQL. | sólo las que tengan inscripción en R9 entran al `DO`; las otras 41 siguen huérfanas. |
| Dónde vive la lógica | **un RPC `SECURITY DEFINER`** (`rpc_caballeriza_provisorio`), atómico e idempotente, copia 1:1 del bloque del `DO`. El front lo llama. Probe + mutantes como `rpc_modificar_inscripcion`. | sólo front (10 líneas). |
| Alcance | RPC (~60 líneas SQL) + `caballerizas.html` (~60 líneas: validación, alta→RPC, edición-no-borra, badge+botón) + probe (~25 asserts) + docs. **~3 h.** | `caballerizas.html` (~20 líneas: validación + edición-no-borra) + probe chico. **~1 h.** Y cada vez que Yesi cree una caballeriza, me tiene que avisar para el `DO`. |
| Riesgo nuevo en prod antes del domingo | un RPC más (staff-only, sin DDL de tablas, rollback = `DROP FUNCTION`). Cubierto por probe + mutantes. | ninguno en la base; el riesgo es operativo (huérfanas + depender de mí). |

**Recomendación: A.** B no cumple el criterio del 15/08 —deja la caballeriza sin dueño y traslada el trabajo a un
`DO` manual que además sólo mira R9—, y A no es tanto más: la lógica **ya está escrita y probada en producción dos
veces** (18/08 y 11/09), sólo hay que meterla en una función de una caballeriza y llamarla desde el form. Si el
tiempo aprieta, A se corta en dos commits sobre la misma rama y el primero **es B** (§6): nada se pierde.

**Lo que NO entra en este plan** (queda como ISSUE-080, para después de R9): *completar* un provisorio desde la
ficha (cargarle el DNI real al mismo `propietarios`). Hoy eso crea otro propietario (§1). Este plan lo deja como
está pero **impide que la edición rompa** lo que ya hay.

---

## 1. El riesgo en el camino de edición — §5.2 del diagnóstico, tal cual

### 5.2 Qué rompe / qué hay que mirar en el mismo cambio

| | ¿rompe? | detalle |
|---|---|---|
| Base | **No** | Nada exige el titular (§1.3). Hoy ya hay 43 así y todo funciona. |
| Inscripciones que elijan esa caballeriza | **No rompe, pero deja `propietario_id = NULL`** | `trg_insc_set_propietario` no encuentra titular → NULL en silencio (GOTCHA #47). Es la misma situación de las 43 de hoy y de los 15 ratificados de R9 sin propietario. Lo regulariza el `DO` de provisorios — y para eso hace falta que **exista la caballeriza**, que es justamente lo que Yesi no puede hacer. Aflojar el form **destraba** el `DO`, no lo empeora. El portal ya avisa ("caballeriza sin titular") al anotar/modificar. |
| Liquidación | **No rompe** | Sin `propietario_id`, la línea del 70 % queda sin beneficiario hasta que haya provisorio o titular real. Es el estado actual de 15 ratificados de R9. |
| `caballerizas.html` edición — **riesgo preexistente que se vuelve más visible** | **Sí, hay que arreglarlo junto** | `saveRecord` en edición hace `delete().eq('caballeriza_id')` (`:644`) y reinserta lo que hay en el form. Hoy nadie llega ahí sin DNI porque la validación corta antes. Si el titular pasa a ser opcional, **editar una caballeriza con provisorio y dejar el bloque vacío borra el vínculo `rol propietario` del provisorio** → la caballeriza queda sin titular y sus inscripciones futuras sin `propietario_id` (las pasadas conservan el suyo porque `propietario_id` está copiado en `inscripciones`). Y al revés: tipear un DNI real sobre un provisorio **no completa** el provisorio — el trigger crea/encuentra **otro** `propietarios` por DNI y el provisorio queda huérfano con sus liquidaciones (ISSUE-080, caso LOS URONES). Fix mínimo: en edición, **si el bloque de propietario viene vacío, no tocar `caballeriza_responsables`** (no borrar, no insertar); y si viene con DNI y el titular actual es un provisorio, hacer `UPDATE` del responsable existente (mismo `id`) en vez de delete+insert — así el trigger `UPDATE OF documento_nro` completa el mismo `propietario_id`… **ojo**: `fn_caballeriza_resp_set_propietario` en UPDATE **busca por DNI y si no existe INSERTA uno nuevo** — o sea que también crearía otro propietario. Completar un provisorio por pantalla es ISSUE-080 y es un cambio aparte (RPC o UPDATE del `propietarios` provisorio con el DNI). Para **hoy**: alcanza con no borrar lo que no se tocó. |
| `responsable` (texto legado) | No | `buildResponsableText` devuelve `null` con el bloque vacío (`:655`). |
| Probes | No hay probe de `caballerizas.html` | Habría que escribir uno (alta sin titular → 0 filas en responsables; edición sin tocar → responsables intactos; edición con DNI nuevo sobre provisorio → **documentar** que hoy crea otro propietario). |

**Traducido a lo que hay que hacer en esta rama**: la edición sólo puede escribir en `caballeriza_responsables` si el
usuario **cambió** el bloque de responsables; si el bloque quedó como lo prellenó `loadRecord`, no se toca. Y con
titular provisorio prellenado (nombre = caballeriza, sin apellido ni DNI), la validación no puede exigir "los tres o
ninguno" sobre ese prellenado — tiene que reconocerlo como "sin cambios".

---

## 2. Relevamiento (lo que ya se midió, resumido)

- **Front** (`caballerizas.html`, `main`): `validateResponsables` `:446-462` exige apellido+nombre+DNI del propietario
  siempre; `saveRecord` `:586-660` la llama antes de todo (`:589-591`), inserta la caballeriza (`:638`), en edición
  **borra todos los responsables** (`:644`) y reinserta lo que hay en el form (`resolveAndInsertResponsables`
  `:471-503`, saltea filas sin apellido ni nombre `:474`), y actualiza el texto legado `responsable` (`:656`).
  `loadRecord` `:540-566` prellena el propietario con lo que hay en `caballeriza_responsables`. Cards `:318-336`: sin
  indicador de "sin titular" / "provisorio".
- **Base**: `caballerizas` sin CHECK/trigger; `caballeriza_responsables` todo nullable salvo `caballeriza_id`; trigger
  `trg_cab_resp_set_propietario` sólo actúa si `rol='propietario' AND documento_nro IS NOT NULL` (busca/crea
  `propietarios` por DNI) — con DNI NULL **respeta el `propietario_id` que venga en el INSERT**. Así se insertaron los
  47 provisorios. `propietarios`: sólo `nombre` NOT NULL. Policies: `propietarios_insert` = `fn_is_staff()`;
  `caballeriza_responsables_insert` = mismo club; `caballerizas_insert` = staff del club. **Yesi (`secretario_carreras`)
  ya puede escribir en las tres tablas** — el RPC no le da permisos nuevos, le da atomicidad e idempotencia.
- **Marcas existentes en `propietarios.notas`**: `'provisorio R8 15/08'`, `'provisorio R9 11/09'`, y una
  `'ex provisorio R8 15/08 — completado 11/09/2026 …'`. Ningún archivo de código filtra por esa marca (grep en
  `*.html`, `*.js`, `*.mjs`: 0). Sólo los `.sql` y los docs.
- **Homónimos**: 0 propietarios reales del club con el nombre exacto de una caballeriza (`homonimos_provisorio_nombre_cab = 0`).
- **`fn_is_staff()`** = `rol IN ('super_admin','secretario_carreras','operador')`, activo.

---

## 3. Diseño A

### 3.1 RPC `rpc_caballeriza_provisorio(p_caballeriza_id uuid) → jsonb` — borrador completo

Archivo: `migrations/rpc_caballeriza_provisorio.sql`. `apply_migration` (es DDL que queda; **no** es gemela).

```sql
-- rpc_caballeriza_provisorio — propietario PROVISORIO para UNA caballeriza sin titular.
-- Criterio de Fede (15/08): sin titular conocido, el dueño es un propietario provisorio con el
-- nombre de la caballeriza, sin documento, marcado en notas; se completa cuando aparece el real.
-- Es el bloque DO de migrations/propietarios_provisorios_r9.sql acotado a una caballeriza, para
-- que lo llame caballerizas.html (alta sin titular; botón "Crear provisorio").
-- Idempotente: si ya hay titular activo, no hace nada y lo dice. Reusa un provisorio previo con
-- el mismo nombre. Si hay un propietario REAL homónimo, no adivina: falla y pide cargarlo como titular.
CREATE OR REPLACE FUNCTION public.rpc_caballeriza_provisorio(p_caballeriza_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cab      RECORD;
  v_prop     uuid;
  v_resp     uuid;
  v_creado   boolean := false;
  v_rederiv  int;
  v_marca    text;
BEGIN
  -- (1) sólo secretaría / operador / super_admin
  IF NOT fn_is_staff() THEN
    RAISE EXCEPTION 'No autorizado: esta operación es de la secretaría.';
  END IF;

  -- (2) la caballeriza existe y es de mi club (super_admin ve todas)
  SELECT * INTO v_cab FROM caballerizas WHERE id = p_caballeriza_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La caballeriza no existe.';
  END IF;
  IF NOT fn_is_super_admin() AND v_cab.club_id IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'Esa caballeriza es de otro hipódromo.';
  END IF;

  -- (3) ya tiene titular activo → no-op (idempotencia)
  SELECT cr.propietario_id INTO v_prop
    FROM caballeriza_responsables cr
   WHERE cr.caballeriza_id = p_caballeriza_id AND cr.rol = 'propietario' AND cr.activo
   ORDER BY cr.created_at NULLS LAST, cr.id LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'creado', false, 'motivo', 'ya tiene titular',
                              'propietario_id', v_prop, 'inscripciones_rederivadas', 0);
  END IF;

  -- (4) homónimo REAL (no provisorio) en el club → no se adivina
  IF EXISTS (
    SELECT 1 FROM propietarios p
     WHERE p.club_id = v_cab.club_id
       AND upper(btrim(p.nombre)) = upper(btrim(v_cab.nombre))
       AND (p.notas IS NULL OR p.notas NOT ILIKE 'provisorio%')
  ) THEN
    RAISE EXCEPTION 'Ya existe un propietario "%" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio.', v_cab.nombre;
  END IF;

  -- (5) provisorio previo con el mismo nombre → reusar (= DO); si no, crear
  v_marca := 'provisorio alta ' || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY');
  SELECT p.id INTO v_prop
    FROM propietarios p
   WHERE p.club_id = v_cab.club_id
     AND upper(btrim(p.nombre)) = upper(btrim(v_cab.nombre))
     AND p.notas ILIKE 'provisorio%' AND p.activo
   ORDER BY p.created_at, p.id LIMIT 1;
  IF v_prop IS NULL THEN
    INSERT INTO propietarios (club_id, tipo, nombre, activo, estado, notas)
    VALUES (v_cab.club_id, 'persona', v_cab.nombre, true, 'activo', v_marca)
    RETURNING id INTO v_prop;
    v_creado := true;
  END IF;

  -- (6) el vínculo, misma forma que los 47 existentes: sin DNI → el trigger respeta propietario_id
  INSERT INTO caballeriza_responsables (caballeriza_id, propietario_id, rol, activo, nombre, documento_tipo)
  VALUES (p_caballeriza_id, v_prop, 'propietario', true, v_cab.nombre, 'DNI')
  RETURNING id INTO v_resp;

  -- (7) re-derivar las inscripciones de ESTA caballeriza que quedaron sin propietario
  --     (todas las reuniones: decisión de Leo 11/09 — no re-liquida nada, deja el historial con dueño)
  UPDATE inscripciones SET propietario_id = v_prop
   WHERE caballeriza_id = p_caballeriza_id AND propietario_id IS NULL;
  GET DIAGNOSTICS v_rederiv = ROW_COUNT;

  -- (8) el texto legado, como hace el form
  UPDATE caballerizas SET responsable = v_cab.nombre || ' (propietario provisorio)' WHERE id = p_caballeriza_id;

  RETURN jsonb_build_object('ok', true, 'creado', v_creado, 'propietario_id', v_prop,
                            'responsable_id', v_resp, 'marca', v_marca,
                            'inscripciones_rederivadas', v_rederiv);
END;
$$;

REVOKE ALL     ON FUNCTION public.rpc_caballeriza_provisorio(uuid) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.rpc_caballeriza_provisorio(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_caballeriza_provisorio(uuid) TO authenticated;
```

Notas:
- **Marca** `'provisorio alta DD/MM/YYYY'` en vez de `'provisorio R<n> DD/MM'`: no está atada a una reunión. Empieza
  con `provisorio` para que cualquier `ILIKE 'provisorio%'` la agarre y **no** agarre las `'ex provisorio …'`
  (completadas). Los `.sql` viejos filtran `LIKE 'provisorio R%'` — no incluyen las nuevas, y está bien: son fotos
  de su fecha. Si querés una sola marca para todo, `'provisorio R9 16/09'` también sirve — decisión menor (§8.1).
- (7) re-deriva **todas** las inscripciones sin propietario de la caballeriza, no sólo R9 — igual que el `DO`
  ejecutado el 11/09 con la decisión de Leo de incluir R6/R8. No toca liquidaciones.
- (8) `responsable` legado: el form lo escribe siempre; el RPC lo deja coherente para que la card lo muestre.
- Sin `p_marca` parametrizable: menos superficie. El `FOR UPDATE` evita dos clicks simultáneos → dos vínculos.

### 3.2 `caballerizas.html`

| # | dónde | cambio |
|---|---|---|
| F1 | `validateResponsables` `:446-462` | Titular **opcional, todo-o-nada**: si apellido, nombre y DNI están los tres vacíos → OK; si hay alguno pero no los tres → error `'Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejalo vacío: se crea un propietario provisorio con el nombre de la caballeriza.'`. Co-propietarios y DNI duplicados igual. **Excepción**: si el bloque es idéntico al prellenado por `loadRecord` (F3), no se valida — es "sin cambios". |
| F2 | HTML `:210-221` | `Propietario *` → `Propietario` + hint: *"Si no lo conocés, dejalo vacío: la caballeriza se crea con un propietario provisorio a su nombre, que la secretaría completa después."* Placeholders sin `*`. |
| F3 | `loadRecord` `:540-566` | Guardar en una variable de módulo `responsablesAlCargar = JSON.stringify(getResponsableData())` después de prellenar. Si el titular prellenado es provisorio (`propietarios.notas ILIKE 'provisorio%'`, se lee con un JOIN o un `select` más), mostrar arriba del bloque: *"Titular provisorio «X» (sin DNI). Completarlo desde acá todavía crea un propietario nuevo — ISSUE-080; por ahora avisale a Leo."* (texto a acordar). |
| F4 | `saveRecord` alta `:637-641` + `:646-656` | Después del `insert` de la caballeriza y de `resolveAndInsertResponsables`: **si el titular quedó vacío** → `const { data, error } = await sb.rpc('rpc_caballeriza_provisorio', { p_caballeriza_id: cabId })`. Error → toast error (la caballeriza ya existe; queda sin titular, como hoy — se avisa "creada, pero no se pudo crear el provisorio: …"). OK → toast `Caballeriza creada con propietario provisorio «NOMBRE». Completá el titular cuando lo tengas.` Saltear el `update responsable` legado (el RPC ya lo puso). |
| F5 | `saveRecord` edición `:643-656` | **Si `JSON.stringify(getResponsableData()) === responsablesAlCargar` → no tocar `caballeriza_responsables` ni `responsable`** (ni delete ni insert). Sólo el `update` de `caballerizas`. Si cambió → camino actual (delete + insert). Si cambió y el titular quedó vacío → delete + **RPC** (queda con provisorio en vez de huérfana). |
| F6 | cards `:318-336` | Badge `⚠ sin titular` (rojo suave) cuando no hay `rol propietario` activo, `◐ provisorio` (dorado) cuando el titular es provisorio, nada si es real. Botón **`Crear provisorio`** sólo en las "sin titular" → `sb.rpc('rpc_caballeriza_provisorio')` + toast + reload. Para eso `loadRecords` `:279` trae además un `select` de `caballeriza_responsables(rol,activo,documento_nro,propietarios(notas))` o una query aparte agrupada por caballeriza (295 filas, liviano). |
| F7 | — | `deleteRecord` sin cambios. `resolveAndInsertResponsables` sin cambios. |

Lo que **no** hace esta rama: completar un provisorio con DNI real desde el form (ISSUE-080). Con F3 el usuario lo
ve; con F5, si igual tipea el DNI sobre un provisorio, pasa lo de hoy (delete + insert → propietario nuevo por el
trigger). Se documenta en el hint y en el probe (U8, "documenta, no arregla").

### 3.3 Docs
CHANGELOG; `docs/MODULOS.md` (caballerizas); `SCHEMA.md` + `docs/SCHEMA.md` (RPC nueva); `docs/ISSUES.md`
(**ISSUE-083**: "el form exigía DNI desde el 11/05 y bloqueaba alta y edición de 95/295" → cerrado por esta rama;
ISSUE-080 sigue abierto con referencia a F3); `docs/GOTCHAS.md` (#97: el trigger de responsables respeta
`propietario_id` si el DNI es NULL — es lo que hace posible el provisorio); CLAUDE.md (probe en la lista; la nota de
R9 cambia: "PARAJE LA TABLADA se arregla con el botón"); `tests/README.md`.

---

## 4. Probe — `tests/probe_caballeriza_provisorio.mjs`

Patrón de siempre (sesión real de staff por magiclink — hay que crear un `usuarios` `secretario_carreras` de probe,
como el `uS` de `probe_modificar_inscripcion_portal.mjs`; fixture propio; teardown por estado; `--mutantes`).
**No toca ninguna caballeriza real.**

| # | caso | espera |
|---|---|---|
| A1 | staff llama al RPC sobre caballeriza de probe sin titular | ok, `creado=true`; existe `propietarios` `tipo persona`, `nombre`=caballeriza, `documento_nro NULL`, `notas ILIKE 'provisorio alta%'`, activo; existe vínculo `rol propietario` activo con ese `propietario_id`, `documento_nro NULL`; `caballerizas.responsable` seteado |
| A2 | segunda llamada sobre la misma | `creado=false`, `motivo='ya tiene titular'`; **sigue habiendo 1 solo vínculo y 1 solo propietario** |
| A3 | caballeriza de probe con 2 inscripciones sin `propietario_id` (reunión de probe 9985, fecha 2099) + 1 con propietario | `inscripciones_rederivadas=2`; las 2 quedan con el provisorio; la tercera intacta |
| A4 | otra caballeriza de probe con el **mismo nombre** | reusa el provisorio de A1 (`creado=false`, mismo `propietario_id`); vínculo nuevo |
| A5 | caballeriza cuyo nombre coincide con un `propietarios` **real** de probe (con DNI, sin marca) | error "Ya existe un propietario …"; sin vínculo, sin provisorio |
| A6 | sesión de **portal** (profesional) | error "No autorizado" |
| A7 | staff de **otro club** (usuario de probe con `club_id` distinto) | error "otro hipódromo" (super_admin no se prueba: no creamos super_admins de probe) |
| A8 | `p_caballeriza_id` inexistente | error "no existe" |
| A9 | `trg_insc_set_propietario` después del RPC: nueva inscripción de probe en esa caballeriza | nace con `propietario_id` = provisorio (la cadena cierra) |
| A0 | transversal: `caballerizas.nombre/club_id/activo` y `propietarios` reales de probe **nunca cambian** | snapshot antes/después de cada llamada |
| U1 | `validateResponsables` extraída: vacío → null; parcial → mensaje; completo → null; co-prop parcial → mensaje | ok |
| U2 | `saveRecord` alta con stubs (`sb.from().insert` graba, `sb.rpc` graba): titular vacío → llama `rpc_caballeriza_provisorio` con el id nuevo; titular completo → **no** llama al RPC | ok |
| U3 | `saveRecord` edición con stubs, bloque igual al `responsablesAlCargar` → **cero** llamadas a `from('caballeriza_responsables')` | ok (mata "delete+insert siempre") |
| U4 | edición con bloque cambiado y completo → delete + insert (camino actual) | ok |
| U5 | edición con bloque cambiado y vacío → delete + RPC | ok |
| U6 | card: sin titular → badge + botón `Crear provisorio`; provisorio → badge `provisorio`, sin botón; real → nada | ok (render extraído) |
| U7 | texto: hint del titular opcional presente; `required` sólo en `f-nombre` | ok |
| U8 | **documenta ISSUE-080**: edición de provisorio tipeando DNI → delete + insert (hoy). Assert que **falla a propósito cuando se arregle** (se marca `⚠ conocido`) — o se deja fuera; decisión §8 | — |
| R1 | teardown por estado: 0 filas de probe en `caballerizas`, `caballeriza_responsables`, `propietarios`, `inscripciones`, `carreras`, `reuniones`, `spcs`, `usuarios`, `auth.users`; `spcs` antes = después = 210 | limpio |

Mutantes SQL (gemela `rpc_caballeriza_provisorio_mut` por `execute_sql`, nunca `apply_migration` — GOTCHAS "gemela
que revive"; construida en la base desde `pg_get_functiondef` con `from→to`, como el 16/09):
M1 cae `fn_is_staff` (A6) · M2 cae el club (A7) · M3 cae el no-op de "ya tiene titular" (A2: 2 vínculos) · M4 cae el
homónimo real (A5) · M5 no reusa provisorio previo (A4: 2 propietarios) · M6 `documento_nro := '1'` en el vínculo (A1:
el trigger crea otro propietario → `propietario_id` distinto) · M7 cae la re-derivación (A3) · M8 re-deriva **también**
las que ya tenían propietario (A3: la tercera cambia) · M9 marca sin prefijo `provisorio` (A1) · M10 `FOR UPDATE`
quitado → no cubierto (concurrencia). Portal: P1 `validateResponsables` vuelve a exigir DNI (U1) · P2 el alta no llama
al RPC (U2) · P3 la edición borra siempre (U3) · P4 badge/botón siempre (U6).

---

## 5. Lo que rompe / lo que hay que mirar

| | |
|---|---|
| Base | Ningún DDL sobre tablas. Una función nueva staff-only. Rollback: `DROP FUNCTION public.rpc_caballeriza_provisorio(uuid)` + revertir el merge. |
| Provisorios "en pantalla" vs `DO` | Coexisten. El `DO` sigue sirviendo para lo masivo; desde ahora casi no debería hacer falta. Idempotentes entre sí (los dos miran "titular activo" y "provisorio homónimo"). |
| `liquidaciones.html` / Pagos | Un provisorio más es un beneficiario más con `nombre` = caballeriza, sin DNI: **igual** que los 47 que ya cobran/retienen. Nada nuevo. |
| Portal | `caballeriza_responsables` gana filas → la lista `cabsConTitular` del modal Modificar las ve como "con titular". Correcto. |
| `caballerizas.html` edición | Deja de bloquear a las 95 (43+52): con F1+F3+F5, abrir y guardar sin tocar responsables **funciona**. Completar un provisorio con DNI sigue siendo ISSUE-080 (crea otro propietario) — el hint lo dice. |
| Homónimos reales | El RPC falla a propósito. Hoy hay 0 casos. Si aparece uno, Yesi carga el titular real. |
| Auditoría | `propietarios` y `caballerizas` no tienen trigger de auditoría; `inscripciones` sí (la re-derivación deja rastro UPDATE con `usuario_id` de Yesi). Igual que el `DO`. |
| Nombres sucios | El provisorio hereda el nombre tal cual (`CAROSUEÑO (DOL)`, `El Capitan`). Igual que los 47. Se completa después. |

---

## 6. Secuencia (después del OK)

1. Rama `feat/caballeriza-titular-opcional-provisorio` desde `main` (`7887a27`).
2. `migrations/rpc_caballeriza_provisorio.sql` + **`apply_migration`** (`rpc_caballeriza_provisorio`), `get_advisors`.
3. `caballerizas.html` F1–F6.
4. Probe A0–A9, U1–U7, R1; corrida verde. Mutantes SQL por gemela (`execute_sql`) + portal automáticos → tanda limpia.
5. Docs (§3.3). Commit, push. **Informe a `reports` con salidas crudas. GATE: Leo lo ve antes del merge.**
6. Merge `--no-ff`, md5 contra `sigh.com.ar/caballerizas.html`, probe con `CABALLERIZAS_HTML=https://sigh.com.ar/caballerizas.html`.
7. **Operativo R9** (aparte, con Yesi): botón `Crear provisorio` en PARAJE LA TABLADA (TIRSO T1, GRAN RAUL T6 quedan con
   dueño); las 13 ratificadas sin caballeriza → Yesi les asigna/crea el stud (`inscripciones.html`; si crea, nace con
   provisorio). Control: la query de CLAUDE.md tiene que dar **0**. Ya no hace falta correr el `DO`.

**Corte de emergencia** (si el domingo se acerca y A no cierra): el commit 1 de la rama es exactamente **B** —
F1 + F2 + F3 + F5 sin RPC, con la edición sin romper. Se mergea eso, y el provisorio lo pongo yo con el `DO` (o con
el RPC, que se aplica igual aunque el form todavía no lo llame). A queda para el lunes.

Estimación: A completa **~3 h** de trabajo efectivo (RPC 30', form 60', probe+mutantes 60', docs+informe 30').
B sola **~1 h**.

---

## 7. Rollback

`DROP FUNCTION public.rpc_caballeriza_provisorio(uuid);` + `git revert` del merge. Los provisorios que haya creado
Yesi quedan (son datos válidos, misma forma que los 47) — se borran sólo si no tienen liquidación ni recibo, con el
mismo `DELETE` acotado del `.sql` de R9.

## 8. Preguntas abiertas

1. **Marca**: `'provisorio alta DD/MM/YYYY'` (propuesta) o seguir con `'provisorio R9 16/09'`.
2. **U8** (documentar ISSUE-080 en el probe con un assert que falle cuando se arregle): ¿lo dejo o lo saco?
3. **Re-derivación** en (7): todas las reuniones (como el `DO` del 11/09) o sólo las no oficializadas. Propuesto: todas
   (no re-liquida nada).
4. ¿Botón `Crear provisorio` visible para `operador` también, o sólo `secretario_carreras`/`super_admin`? El RPC deja
   pasar a los tres (`fn_is_staff`). Propuesto: los tres.
5. ¿Arranco con A, o con B y A el lunes?

## 9. Verificación de publicación

```
$ git push origin reports
$ git rev-parse HEAD
9fd14987477b06e8b46a9d27733f323725d5e7df
$ git ls-remote origin reports
9fd14987477b06e8b46a9d27733f323725d5e7df	refs/heads/reports
```

Coinciden. Esta sección va en un segundo commit sobre el mismo archivo.
