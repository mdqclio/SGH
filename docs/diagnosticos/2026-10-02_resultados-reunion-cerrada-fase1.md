# Bloquear cambios de resultado en reuniones con liquidación cerrada (en la base) + ISSUE-101 — Fase 1: relevamiento y diseño

- **Fecha:** 2026-10-02
- **Modo:** **SÓLO LECTURA.** MCP `execute_sql` con SELECT de catálogo y datos, `git grep`/lectura de `main`, y un `curl` de
  status contra `sigh.com.ar`. **No se escribió nada** en la base, en `main` ni en ninguna rama de trabajo.
- **Código leído en:** `main` = `cc594e43cbb33e8b3f655cdc657b9406b5e5354a` (merge del PR #33, ISSUE-101).
- **Guards:** pwd=/home/clio/dev/SGH · ref=unlhcuanfrtpatoipwve · spcs=238.
- **Paso previo pedido:** merge del PR #33 → **`cc594e4`** (sólo `docs/ISSUES.md`).

---

## Resumen

1. **Hoy nada en la base impide cambiar el resultado de una carrera de una reunión cerrada.** El cierre (ISSUE-091) protege
   `liquidacion_detalle` y `liquidaciones`, no `resultados`, `resultado_posiciones` ni `resultado_apuestas`. El único freno es
   el de la pantalla para **des-oficializar** (`resultados.html:1699-1703`).
2. Hay **siete caminos** que escriben resultados (§1). Cinco funcionan hoy sobre R6/R8 cerradas: F10 en la vista oficial,
   F10/Aplicar en la vista provisional, la API directa, `resultados_legacy.html` (servida, 200) y `desoficializar_carrera` por
   la API en una carrera sin plata comprometida (hoy en R6/R8 no hay ninguna: todas la tienen).
3. **Re-aplicar en R8 (§2):** el resultado cambia y la liquidación no. El motor corta (`cerrada`) y el trigger de líneas
   tira P0091. Quedan posiciones nuevas con líneas y recibos viejos, sin rastro por fila: `resultado_posiciones` y
   `resultado_apuestas` no tienen auditoría.
4. **Diseño propuesto (§3):**
   - un trigger en las tres tablas, con su mensaje (P0092);
   - `aplicar_resultado` v2 que escribe `oficializado_at`/`oficializado_por` (ISSUE-101) y no degrada oficial → provisional (ISSUE-089);
   - `desoficializar_carrera` con el mismo corte;
   - corrección legítima sólo por super_admin con una **resolución**, en un registro propio (`resultado_correcciones`);
   - backfill de los 20 desde la auditoría, usando la **última** transición a oficial.
5. **Laterales:**
   - `performances` está **vacía entera**: `oficializar()` nunca logró escribirla, porque la política exige super_admin y el
     código no mira el error (§5.1).
   - Las políticas de escritura de `resultados` y `resultado_posiciones` no exigen `fn_is_staff()` (§5.2).

---

## 1. Todos los caminos que escriben resultados / posiciones / apuestas, y qué mira cada uno

| # | Camino | Escribe | Quién puede | Mira reunión cerrada | Mira plata comprometida | Mira estado oficial | Recalcula |
|---|---|---|---|---|---|---|---|
| 1 | `aplicar_resultado` (RPC, SECURITY DEFINER; EXECUTE authenticated + service_role) | `resultados` (INSERT/UPDATE), `resultado_posiciones` y `resultado_apuestas` (DELETE + INSERT en bloque) | guard 0: service_role / super_admin / staff; guard de club | **No** | **No** | **No** (acepta oficial → provisional) | No |
| 2 | `oficializar()` en `resultados.html` (`:1623`) | llama #1 con `'oficial'` + `performances` (DELETE + INSERT) + motor | staff (gates de montas y entrenadores) | sólo después: el motor corta y avisa "CERRADA… no se generó" | No | — | sí (motor; cerrada → no-op) |
| 3 | `aplicar(…,'provisional')` / **F10** (`:1836`) en `resultados.html` | llama #1 con `'provisional'` | staff | **No** | **No** | **No**: F10 sigue activo en la vista **oficial** (ISSUE-089) | No |
| 4 | `desoficializar()` en `resultados.html` (`:1697`) → RPC `desoficializar_carrera` | `resultados.estado='provisional'`, `oficializado_*`=NULL; `performances` DELETE; motor | staff | **Sí, sólo en pantalla** (`:1703`) | Sí (pantalla + RPC) | — | sí (cerrada → no-op) |
| 5 | RPC `desoficializar_carrera` llamada directo por la API | igual que #4 | guard 0 + club | **No** | Sí (`recibo_id IS NOT NULL OR estado_linea='pagado'`) | — | No |
| 6 | **API directa** (PostgREST) sobre las tablas | `resultados`, `resultado_posiciones` (políticas: no portal + club, **sin `fn_is_staff`**), `resultado_apuestas` (staff + club) | cualquier usuario activo con club que no sea del portal | **No** | **No** | **No** | No |
| 7 | **`resultados_legacy.html`** (servida: `sigh.com.ar/resultados_legacy.html` → **200**; no está en los menús) | INSERT/UPDATE `resultados` (`:595`, `:600`), DELETE+INSERT `resultado_posiciones` (`:630-631`), `performances` (`:656-657`); des-oficializa con **UPDATE directo** `estado='provisional'` (`:672`) | staff con sesión | **No** | **No** (ni para des-oficializar) | No | No |
| 8 | RPC `rpc_baja_inscripcion` (portal) | DELETE `resultado_posiciones` de la inscripción que se retira | usuario del portal, sobre lo suyo | — | — | — | — |

Sobre #8: exige reunión `publicada` y ventana de inscripción o ratificación abierta. Una reunión con resultados oficiales nunca
está en ese estado, así que **no es un camino real** sobre reuniones cerradas. Lo listo porque escribe la tabla.

**Triggers hoy** (§A.1): `resultados` tiene `trg_audit_resultados` (auditoría) y `resultados_set_updated_at`.
`resultado_posiciones` y `resultado_apuestas` no tienen **ninguno**: sin auditoría y sin guard. El cierre vive en
`trg_liq_detalle_cerrada` y `trg_liquidaciones_cerrada` (`fn_liq_cerrada_guard`, P0091) y en `trg_reunion_cierre`
(cerrar/reabrir sólo super_admin).

---

## 2. Qué pasa hoy si se re-aplica un resultado en R8 (congelada)

R8: cerrada el 25/09 16:30 UTC con la nota "Congelada tal como está… hasta que Fede conteste". Tiene 8 carreras oficiales, 67
posiciones y 225 líneas (185 `pagado`, 40 `impago`). **Las 8 carreras oficiales tienen líneas comprometidas**, entre 7 y 25
cada una (§A.5).

### 2.1 Camino F10 desde la vista oficial (el más probable: un error de teclado)

1. Vista oficial de, por ejemplo, R8 C3: no hay marcador, pero F10 sigue enganchado → `aplicar(id,'provisional')`.
2. `posData = []` → todos los ratificados caen en `sinResolver` → `confirm("Hay N caballos sin resultado ni marca de 'no corrió'…")`.
3. Si el operador acepta → `aplicar_resultado(p_estado='provisional', p_posiciones=todos no_largo)`. Ninguno de sus guards mira
   el cierre ni las líneas: **pasa**.
4. **Se recalcula: nada.** `aplicar` no llama al motor.
5. **Queda:** el resultado en `provisional`, las posiciones de la carrera **pisadas** (todos "no corrió", sin rastro por fila) y
   las apuestas reemplazadas por lo que tuviera la pantalla. Las 30 líneas de C3 (25 comprometidas + 5 no comprometidas, §A.5) y sus recibos, **intactos**.
   La auditoría sólo registra `resultados` oficial → provisional.

### 2.2 Camino "corregir y volver a oficializar"

6. Con la carrera ya provisional, la pantalla muestra el marcador. Se carga otro orden y se oficializa → `aplicar_resultado('oficial')`: **pasa**.
7. `performances`: DELETE + INSERT, que fallan en silencio para un no-super_admin (§5.1).
8. Motor: `generarLiquidacionesReunion` lee `reuniones.liquidacion_cerrada_at` → `{ cerrada: true }` y no toca nada → toast
   "✅ Resultado oficial. La liquidación de esta reunión está CERRADA (saldada): no se generó ni se tocó ninguna línea."
   Si el motor no cortara, el trigger `fn_liq_cerrada_guard` tiraría P0091 en cualquier escritura de líneas con sesión de usuario.
9. **Queda:** el resultado nuevo como oficial y la liquidación del resultado viejo, ya pagada. **No se recalcula nada, y es
   correcto que no se recalcule:** el problema es que el resultado haya podido cambiar sin ningún registro de por qué.

### 2.3 Los otros caminos sobre R8

- **Des-oficializar por pantalla:** cortado (`:1703`).
- **`desoficializar_carrera` por la API:** RAISE "carrera con pagos emitidos" en las 8 (todas tienen plata comprometida). En
  una carrera de reunión cerrada **sin** pagos pasaría: hoy no hay ninguna, pero nada lo impide.
- **API directa o `resultados_legacy.html`:** pasan siempre. Legacy des-oficializa sin mirar ni el cierre ni la plata.

R6 está igual: cerrada, 7 oficiales, todas con plata comprometida. R6 C3 está `provisional` y sin líneas (§A.5). Con F10 o la
API se le puede cambiar el resultado hoy mismo.

---

## 3. Propuesta (no aplicada)

### 3.1 El guard en la base

**Trigger `trg_resultado_cerrado` — `BEFORE INSERT OR UPDATE OR DELETE`** sobre `resultados`, `resultado_posiciones` y
`resultado_apuestas`, con una función `fn_resultado_cerrado_guard()`:

- Busca la reunión: `resultados.carrera_id` → `carreras.reunion_id`. En `resultado_posiciones` y `resultado_apuestas`, vía
  `resultado_id`. Mira OLD y NEW (un UPDATE no puede sacar una fila de una reunión cerrada ni meterla en una).
- Si `fn_reunion_liq_cerrada(reunión)` → RAISE, **salvo**:
  - sesión directa a la base (`session_user <> 'authenticator'`: migraciones por MCP/psql), igual que `fn_liq_cerrada_guard`;
  - la marca de sesión `sgh.correccion_resultado = '1'`, que pone **sólo** la RPC de corrección (§3.2) para su transacción
    (patrón de `rpc_cambiar_monta` / `sgh.alta_portal`).
- **`service_role` NO queda exento**, a diferencia de `fn_liq_cerrada_guard`. La key secreta la usan scripts y probes, y un
  resultado no se "regulariza" por la API: va por migración o por la RPC de corrección. **Decisión tuya** (§6).
- Mensaje, `ERRCODE 'P0092'`:
  > `La liquidación de esta reunión está cerrada (saldada): el resultado de la carrera %s no se puede modificar. Si un fallo (p. ej. de doping) cambia el resultado, lo corrige un super_admin con la resolución, desde Corrección de resultado. ISSUE-102`

  (`%s` = `numero_carrera_programa`, o el turno si no tiene.) La pantalla lo muestra tal cual.

**Además, en las RPC** (primera capa, para que el mensaje llegue antes del trabajo y no se dependa del trigger):

- `aplicar_resultado` v2, al principio, después del guard de club: si la reunión está cerrada → el mismo RAISE P0092.
- `desoficializar_carrera`: el mismo corte. Hoy sólo lo tiene la pantalla.
- `aplicar_resultado` v2 también cierra ISSUE-089: si el resultado actual es `oficial` y `p_estado <> 'oficial'` → RAISE
  `'aplicar_resultado: la carrera está oficial; para corregirla, des-oficializala primero'` (P0001). Así F10 en la vista
  oficial queda inofensivo aunque la pantalla no se toque.

**Auditoría:** `trg_audit_resultado_posiciones` y `trg_audit_resultado_apuestas` → `fn_auditoria_log` (ISSUE-089 punto 3).
Sin eso, ni un cambio legítimo deja rastro por caballo.

**Front** (después de la base, otro PR): F10 / F9 / Aplicar cortan si la carrera es oficial o la reunión está cerrada (ISSUE-089
punto 1). `resultados_legacy.html` se da de baja (ISSUE-046), porque es el único camino que des-oficializa sin RPC; el trigger
igual la cubre. Y el toast muestra el P0092.

### 3.2 Corrección legítima (fallo de doping)

**Hoy no hay ninguna vía:** la pantalla no deja des-oficializar en reunión cerrada, y la base deja hacer cualquier cosa sin
registro.

- **Quién:** super_admin. Es el mismo nivel que cerrar o reabrir la liquidación (`fn_reunion_cierre_guard`).
- **Con qué registro:**
  - una **resolución** existente en `resoluciones` (ya tiene autor impuesto, `modificado_*` y auditoría, ISSUE-097), del mismo
    club que la reunión y no anulada;
  - un **motivo** de texto, obligatorio;
  - y una tabla nueva, **`resultado_correcciones`**:

    ```
    id uuid pk, resultado_id uuid fk, carrera_id uuid fk, reunion_id uuid fk,
    resolucion_id uuid NOT NULL fk resoluciones, motivo text NOT NULL CHECK (length(btrim(motivo)) >= 20),
    antes jsonb NOT NULL   -- header + posiciones + apuestas, foto antes
    despues jsonb NOT NULL, -- idem, después
    corregido_por uuid NOT NULL fk usuarios, corregido_at timestamptz NOT NULL default now()
    ```

    Sólo INSERT, por la RPC. Sin UPDATE ni DELETE para nadie. Con su auditoría.
- **Cómo:** RPC `rpc_corregir_resultado(p_carrera_id, p_resolucion_id, p_motivo, p_posiciones, p_apuestas)`, SECURITY DEFINER,
  EXECUTE sólo `authenticated`:
  1. guard 0: `fn_is_super_admin()`, antes de leer nada;
  2. valida la resolución (existe, club, estado) y el motivo;
  3. toma la foto `antes`, con `FOR UPDATE` sobre el resultado;
  4. `set_config('sgh.correccion_resultado','1', true)`;
  5. reemplaza posiciones y apuestas con la misma lógica de `aplicar_resultado`, sin cambiar `estado` (sigue `oficial`) **ni
     `oficializado_*`** (el original queda, la corrección es otra fila);
  6. toma la foto `despues` e inserta la corrección.

  Devuelve el id de la corrección.
- **La plata, a propósito afuera:** la RPC **no recalcula**. En una reunión cerrada los premios ya están pagados según el
  resultado viejo. Qué se recupera, qué se paga de nuevo y cómo se registra es una **decisión de Fede**. La herramienta que hay
  es reabrir la liquidación (super_admin, auditado) y recalcular: el motor preserva lo `pagado` y genera las líneas del
  resultado nuevo como cobrables. Eso puede pagar dos veces el mismo puesto. No lo automatizo: queda como pregunta (§6).
- En una reunión **abierta** (R9) el camino de hoy sigue valiendo (des-oficializar sin pagos, corregir, oficializar). Con plata
  comprometida, la misma RPC de corrección.

### 3.3 `aplicar_resultado` escribiendo `oficializado_at` y `oficializado_por` (ISSUE-101)

En v2, leyendo el estado previo con el mismo `FOR UPDATE` del lock optimista:

| Estado previo → `p_estado` | `oficializado_at` | `oficializado_por` |
|---|---|---|
| (nuevo, INSERT) → `oficial` | `now()` | usuario de la sesión* |
| `provisional` → `oficial` | `now()` | usuario de la sesión* |
| `oficial` → `oficial` (re-aplicar oficial, en reunión abierta) | **se conserva** | **se conserva** |
| `oficial` → `provisional` | — | — (RAISE, §3.1: se usa `desoficializar_carrera`, que ya los pone en NULL) |
| `provisional` → `provisional` | NULL | NULL |

\* `(SELECT id FROM usuarios WHERE auth_user_id = auth.uid())`; NULL si llama `service_role` (probes). La FK
`resultados_oficializado_por_fkey → usuarios(id)` ya existe (§A.6).

El md5 de `pg_get_functiondef` se mide en el sandbox y se compara después del `apply_migration` (GOTCHA #99). Lo cubre un probe
del par oficializar/des-oficializar en la 9999.

### 3.4 Backfill de los 20 desde la auditoría

- **Fuente:** la **última** fila de `auditoria` con `tabla='resultados'`, `registro_id = resultado.id`,
  `datos_despues->>'estado' = 'oficial'` y `coalesce(datos_antes->>'estado','') <> 'oficial'`. Tiene que ser la última porque
  hay re-oficializaciones: R6 1 resultado con 2, R8 3 con 2 y 1 con 3 (§A.6); 73 des-oficializaciones auditadas en total.
- **Qué:** `UPDATE resultados SET oficializado_at = a.created_at, oficializado_por = a.usuario_id WHERE estado='oficial' AND oficializado_at IS NULL`.
  Son 20 reales: R6 7, R8 8, R9 5. Los 3 de la 9999 se completan sólo con la fecha (`usuario_id` NULL en la auditoría: probes).
  Quiénes oficializaron, en toda la historia: "Administrador Dolores" (secretario) 19, Yesica Elias (operador) 13, Martin Juarez
  (operador) 5, y 86 sin usuario (9999).
- **Cómo:** migración versionada con guards antes y después (23 oficiales sin fecha → 0; 20 con usuario; los usuarios existen,
  por la FK). Corre como sesión directa a la base, así que **pasa el trigger del §3.1** aunque R6/R8 estén cerradas. Se aplica
  **antes** de `aplicar_resultado` v2, para no mezclar valores reales con los del backfill.
- **Efectos:** el UPDATE dispara `resultados_set_updated_at`, así que una pantalla abierta en esa carrera recibe
  `CONCURRENT_MODIFICATION` al guardar. Por eso va **fuera del horario de carga**. También dispara `trg_audit_resultados` (23
  filas de auditoría, sin usuario). No toca posiciones, apuestas ni líneas.
- **Plazo:** la auditoría de R6 (22/07) se purga en julio de 2027 (`auditoria_retencion_meses = 12`).

### 3.5 Orden propuesto (Fase 2, con OK)

1. Sandbox (`tests/local`, con las tres tablas, R6/R8 cerradas sintéticas, la auditoría y las 3 RPC reales): backfill → trigger
   P0092 + auditoría de posiciones y apuestas → `aplicar_resultado` v2 → `desoficializar_carrera` v2. Probe con mutantes:
   cada camino de §1 contra una reunión cerrada; la 9999 abierta sigue andando; la corrección por RPC con y sin resolución.
2. Prod en ese orden, md5 de cada función = sandbox, fuera de horario.
3. Front (PR aparte): F10 / Aplicar, mensaje P0092, baja de `resultados_legacy.html`.
4. `rpc_corregir_resultado` + `resultado_correcciones` + su pantalla: **después** de que Fede defina qué pasa con la plata (§6).

---

## 4. Qué NO cambia

- `fn_liq_cerrada_guard`, `fn_reunion_cierre_guard` y el corte del motor: siguen igual.
- R9 (abierta) y la 9999: todos los caminos de hoy siguen andando, salvo oficial → provisional por `aplicar_resultado` (ISSUE-089),
  que pasa a ir sólo por `desoficializar_carrera`.

---

## 5. Hallazgos laterales (no pedidos)

### 5.1 `performances` está vacía: `oficializar()` nunca la escribió

Las políticas de `performances` exigen `fn_is_super_admin()` para INSERT/UPDATE/DELETE (§A.4). `oficializar()` hace
`sb.from('performances').delete()` e `.insert(perfInserts)` (`resultados.html:1681-1682`) **sin mirar el error**, y lo corre staff.
Resultado: **0 filas en toda la tabla** (R6 0, R8 0, R9 0; §A.7). Lo que lea `performances` (p. ej. `programa.html:269`) no
tiene datos propios. Candidato a ISSUE aparte.

### 5.2 Las políticas de `resultados` y `resultado_posiciones` no exigen staff

INSERT/UPDATE/DELETE: "no es portal" + (super_admin o club). `resultado_apuestas` sí exige `fn_is_staff()` (ISSUE-093). Hoy no hay
usuarios activos con otro rol que no sea staff o portal (§A.6: profesional 20, propietario 5, operador 3, secretario 2,
super_admin 1), así que no hay exposición. Igual conviene alinearlas.

---

## 6. Preguntas abiertas

1. ¿`service_role` queda **sujeto** al trigger de resultados (propuesta), o exento como en el de líneas?
2. Corrección en reunión cerrada: ¿la RPC sólo corrige el resultado (propuesta) o además reabre y recalcula? Y para Fede: con
   premios ya pagados según el resultado viejo, ¿cómo se registra lo que se recupera o se paga de nuevo?
3. ¿Qué estados de `resoluciones` habilitan una corrección? Hay que mirar los valores en uso antes de fijarlo.
4. ¿Se da de baja `resultados_legacy.html` en esta tarea o aparte (ISSUE-046)?
5. ¿ISSUE nuevo para `performances` (§5.1)?

---

## Anexo — consultas y salidas crudas (tal como se corrieron)

### A.1 Funciones que escriben las tres tablas, triggers, políticas y grants

```sql
select json_build_object(
 'funciones', (select json_agg(json_build_object('f', p.proname, 'secdef', p.prosecdef, 'args', pg_get_function_identity_arguments(p.oid), 'md5', md5(pg_get_functiondef(p.oid)),
     'escribe_resultados', pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?resultados\M',
     'escribe_posiciones', pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?resultado_posiciones',
     'escribe_apuestas', pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?resultado_apuestas',
     'exec', (select string_agg(r.rolname, ',') from pg_roles r where r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid, p.oid, 'EXECUTE'))) order by p.proname)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
    and pg_get_functiondef(p.oid) ~* '(insert into|update|delete from)\s+(public\.)?(resultados\M|resultado_posiciones|resultado_apuestas)'),
 'triggers', (select json_agg(json_build_object('tabla', c.relname, 'trigger', t.tgname, 'def', pg_get_triggerdef(t.oid))) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in ('resultados','resultado_posiciones','resultado_apuestas','reuniones','liquidacion_detalle','liquidaciones','performances') and not t.tgisinternal),
 'politicas', (select json_agg(json_build_object('tabla', tablename, 'p', policyname, 'cmd', cmd, 'roles', roles::text, 'qual', qual, 'chk', with_check)) from pg_policies where tablename in ('resultados','resultado_posiciones','resultado_apuestas')),
 'grants_tablas', (select json_agg(json_build_object('t', table_name, 'g', grantee, 'p', string_agg)) from (select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name in ('resultados','resultado_posiciones','resultado_apuestas') and grantee in ('anon','authenticated') group by 1,2) g)
) r;
```

```json
[{"r":{"funciones":[{"f":"aplicar_resultado","secdef":true,"args":"p_resultado_id uuid, p_expected_updated_at timestamp with time zone, p_carrera_id uuid, p_estado text, p_estado_pista text, p_tiempo_ganador text, p_incidentes text, p_favorito_mandil integer, p_redistribucion_legs jsonb, p_posiciones jsonb, p_apuestas jsonb","md5":"94d46dc0ed70e78329169bb3926f64c2","escribe_resultados":true,"escribe_posiciones":true,"escribe_apuestas":true,"exec":"authenticated,service_role"},{"f":"desoficializar_carrera","secdef":true,"args":"p_carrera_id uuid","md5":"c3247d72656833cd534e4c601900f25a","escribe_resultados":true,"escribe_posiciones":false,"escribe_apuestas":false,"exec":"authenticated,service_role"},{"f":"rpc_baja_inscripcion","secdef":true,"args":"p_inscripcion_id uuid","md5":"b8bf790485fcdfab726d7eee7bf05ca4","escribe_resultados":false,"escribe_posiciones":true,"escribe_apuestas":false,"exec":"authenticated,service_role"}],"triggers":[{"tabla":"reuniones","trigger":"trg_reuniones_updated_at","def":"CREATE TRIGGER trg_reuniones_updated_at BEFORE UPDATE ON public.reuniones FOR EACH ROW EXECUTE FUNCTION set_updated_at()"},{"tabla":"reuniones","trigger":"trg_audit_reuniones","def":"CREATE TRIGGER trg_audit_reuniones AFTER INSERT OR DELETE OR UPDATE ON public.reuniones FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()"},{"tabla":"resultados","trigger":"trg_audit_resultados","def":"CREATE TRIGGER trg_audit_resultados AFTER INSERT OR DELETE OR UPDATE ON public.resultados FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()"},{"tabla":"liquidaciones","trigger":"trg_audit_liquidaciones","def":"CREATE TRIGGER trg_audit_liquidaciones AFTER INSERT OR DELETE OR UPDATE ON public.liquidaciones FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()"},{"tabla":"resultados","trigger":"resultados_set_updated_at","def":"CREATE TRIGGER resultados_set_updated_at BEFORE UPDATE ON public.resultados FOR EACH ROW EXECUTE FUNCTION set_updated_at()"},{"tabla":"liquidacion_detalle","trigger":"trg_liq_detalle_cerrada","def":"CREATE TRIGGER trg_liq_detalle_cerrada BEFORE INSERT OR DELETE OR UPDATE ON public.liquidacion_detalle FOR EACH ROW EXECUTE FUNCTION fn_liq_cerrada_guard()"},{"tabla":"liquidaciones","trigger":"trg_liquidaciones_cerrada","def":"CREATE TRIGGER trg_liquidaciones_cerrada BEFORE INSERT OR DELETE OR UPDATE ON public.liquidaciones FOR EACH ROW EXECUTE FUNCTION fn_liq_cerrada_guard()"},{"tabla":"reuniones","trigger":"trg_reunion_cierre","def":"CREATE TRIGGER trg_reunion_cierre BEFORE INSERT OR UPDATE OF liquidacion_cerrada_at, liquidacion_cerrada_nota ON public.reuniones FOR EACH ROW EXECUTE FUNCTION fn_reunion_cierre_guard()"}],"politicas":[{"tabla":"resultado_posiciones","p":"resultado_posiciones_delete","cmd":"DELETE","roles":"{authenticated}","qual":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","chk":null},{"tabla":"resultado_posiciones","p":"resultado_posiciones_insert","cmd":"INSERT","roles":"{authenticated}","qual":null,"chk":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},{"tabla":"resultado_posiciones","p":"resultado_posiciones_select","cmd":"SELECT","roles":"{authenticated}","qual":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))","chk":null},{"tabla":"resultado_posiciones","p":"resultado_posiciones_update","cmd":"UPDATE","roles":"{authenticated}","qual":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","chk":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},{"tabla":"resultado_apuestas","p":"resultado_apuestas_delete","cmd":"DELETE","roles":"{authenticated}","qual":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","chk":null},{"tabla":"resultado_apuestas","p":"resultado_apuestas_insert","cmd":"INSERT","roles":"{authenticated}","qual":null,"chk":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},{"tabla":"resultado_apuestas","p":"resultado_apuestas_select","cmd":"SELECT","roles":"{authenticated}","qual":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))","chk":null},{"tabla":"resultado_apuestas","p":"resultado_apuestas_update","cmd":"UPDATE","roles":"{authenticated}","qual":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","chk":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},{"tabla":"resultados","p":"resultados_delete","cmd":"DELETE","roles":"{authenticated}","qual":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","chk":null},{"tabla":"resultados","p":"resultados_insert","cmd":"INSERT","roles":"{authenticated}","qual":null,"chk":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},{"tabla":"resultados","p":"resultados_select","cmd":"SELECT","roles":"{authenticated}","qual":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))","chk":null},{"tabla":"resultados","p":"resultados_update","cmd":"UPDATE","roles":"{authenticated}","qual":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","chk":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"}],"grants_tablas":[{"t":"resultado_apuestas","g":"anon","p":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"},{"t":"resultado_apuestas","g":"authenticated","p":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"},{"t":"resultado_posiciones","g":"anon","p":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"},{"t":"resultado_posiciones","g":"authenticated","p":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"},{"t":"resultados","g":"anon","p":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"},{"t":"resultados","g":"authenticated","p":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"}]}}]
```

### A.2 Definiciones de `aplicar_resultado`, `desoficializar_carrera` y de los guards de cierre

```sql
select p.proname, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('aplicar_resultado','desoficializar_carrera','fn_liq_cerrada_guard','fn_reunion_cierre_guard','fn_reunion_liq_cerrada') order by 1;
```

```sql
-- aplicar_resultado (md5 94d46dc0ed70e78329169bb3926f64c2)
CREATE OR REPLACE FUNCTION public.aplicar_resultado(p_resultado_id uuid, p_expected_updated_at timestamp with time zone, p_carrera_id uuid, p_estado text, p_estado_pista text, p_tiempo_ganador text, p_incidentes text, p_favorito_mandil integer, p_redistribucion_legs jsonb, p_posiciones jsonb, p_apuestas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at TIMESTAMPTZ;
  v_res_id             UUID;
  v_carrera_id         UUID;
  v_club               UUID;
  v_user_club          UUID;
BEGIN
  -- ── guard 0 · QUIÉN LLAMA ───────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR fn_is_super_admin() OR fn_is_staff()) THEN
    RAISE EXCEPTION 'aplicar_resultado: sin permiso' USING ERRCODE = '42501';
  END IF;

  -- ── guard de club (nuevo: antes no había) ───────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN
    v_carrera_id := COALESCE(p_carrera_id,
                             (SELECT r.carrera_id FROM resultados r WHERE r.id = p_resultado_id));
    v_club := fn_club_de_carrera(v_carrera_id);
    v_user_club := fn_get_user_club_id();
    IF v_user_club IS NULL THEN
      RAISE EXCEPTION 'aplicar_resultado: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';
    END IF;
    IF v_club IS DISTINCT FROM v_user_club THEN
      RAISE EXCEPTION 'aplicar_resultado: la carrera es de otro hipódromo' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Optimistic locking con FOR UPDATE para cerrar race en escrituras concurrentes
  IF p_resultado_id IS NOT NULL AND p_expected_updated_at IS NOT NULL THEN
    SELECT updated_at INTO v_current_updated_at
      FROM resultados
      WHERE id = p_resultado_id
      FOR UPDATE;
    IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION'
        USING DETAIL = 'El resultado fue modificado por otro operador. Recargá antes de guardar.';
    END IF;
  END IF;

  -- Upsert resultado
  IF p_resultado_id IS NULL THEN
    INSERT INTO resultados (
      carrera_id, estado, tiempo_ganador, incidentes,
      estado_pista, favorito_mandil, redistribucion_legs
    ) VALUES (
      p_carrera_id,
      p_estado::estado_resultado,
      p_tiempo_ganador,
      p_incidentes,
      p_estado_pista,
      p_favorito_mandil,
      COALESCE(p_redistribucion_legs, '{}'::jsonb)
    )
    RETURNING id INTO v_res_id;
  ELSE
    UPDATE resultados SET
      estado              = p_estado::estado_resultado,
      tiempo_ganador      = p_tiempo_ganador,
      incidentes          = p_incidentes,
      estado_pista        = p_estado_pista,
      favorito_mandil     = p_favorito_mandil,
      redistribucion_legs = COALESCE(p_redistribucion_legs, '{}'::jsonb)
    WHERE id = p_resultado_id;
    v_res_id := p_resultado_id;
  END IF;

  -- Posiciones
  DELETE FROM resultado_posiciones WHERE resultado_id = v_res_id;
  IF p_posiciones IS NOT NULL AND jsonb_array_length(p_posiciones) > 0 THEN
    INSERT INTO resultado_posiciones (
      resultado_id, inscripcion_id, posicion, no_largo, descalificado,
      tiempo, diferencia, motivo_desc, empate, dividendo
    )
    SELECT
      v_res_id,
      (x->>'inscripcion_id')::uuid,
      (x->>'posicion')::integer,
      COALESCE((x->>'no_largo')::boolean, false),
      COALESCE((x->>'descalificado')::boolean, false),
      x->>'tiempo',
      x->>'diferencia',
      x->>'motivo_desc',
      COALESCE((x->>'empate')::boolean, false),
      (x->>'dividendo')::numeric
    FROM jsonb_array_elements(p_posiciones) AS x;
  END IF;

  -- Apuestas
  DELETE FROM resultado_apuestas WHERE resultado_id = v_res_id;
  IF p_apuestas IS NOT NULL AND jsonb_array_length(p_apuestas) > 0 THEN
    INSERT INTO resultado_apuestas (
      resultado_id, tipo, val_apu, composicion,
      pozo, vales, div_orig, div_inc, vacante, orden
    )
    SELECT
      v_res_id,
      x->>'tipo',
      COALESCE((x->>'val_apu')::numeric, 100),
      NULLIF(x->>'composicion', ''),
      (x->>'pozo')::numeric,
      (x->>'vales')::integer,
      (x->>'div_orig')::numeric,
      (x->>'div_inc')::numeric,
      COALESCE((x->>'vacante')::boolean, false),
      COALESCE((x->>'orden')::smallint, 0)
    FROM jsonb_array_elements(p_apuestas) AS x;
  END IF;

  RETURN jsonb_build_object(
    'resultado_id', v_res_id,
    'updated_at',   (SELECT updated_at FROM resultados WHERE id = v_res_id)
  );

END;
$function$

-- desoficializar_carrera (md5 c3247d72656833cd534e4c601900f25a)
CREATE OR REPLACE FUNCTION public.desoficializar_carrera(p_carrera_id uuid)
 RETURNS resultados
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res       resultados;
  v_pagas     int;
  v_club      uuid;
  v_user_club uuid;
BEGIN
  -- ── guard 0 · QUIÉN LLAMA ───────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR fn_is_super_admin() OR fn_is_staff()) THEN
    RAISE EXCEPTION 'desoficializar_carrera: sin permiso' USING ERRCODE = '42501';
  END IF;

  -- ── guard de club (nuevo: antes no había) ───────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN
    v_club := fn_club_de_carrera(p_carrera_id);
    v_user_club := fn_get_user_club_id();
    IF v_user_club IS NULL THEN
      RAISE EXCEPTION 'desoficializar_carrera: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';
    END IF;
    IF v_club IS DISTINCT FROM v_user_club THEN
      RAISE EXCEPTION 'desoficializar_carrera: la carrera es de otro hipódromo' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT count(*) INTO v_pagas
    FROM liquidacion_detalle d
   WHERE (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado')
     AND ( d.carrera_id = p_carrera_id
        OR d.inscripcion_id IN (SELECT i.id FROM inscripciones i WHERE i.carrera_id = p_carrera_id) );

  IF v_pagas > 0 THEN
    RAISE EXCEPTION 'carrera con pagos emitidos, anulá los recibos primero';
  END IF;

  UPDATE resultados
     SET estado = 'provisional', oficializado_at = NULL, oficializado_por = NULL
   WHERE carrera_id = p_carrera_id
   RETURNING * INTO v_res;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no hay resultado para esta carrera';
  END IF;

  RETURN v_res;
END $function$

-- fn_liq_cerrada_guard
CREATE OR REPLACE FUNCTION public.fn_liq_cerrada_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old uuid;
  v_new uuid;
BEGIN
  -- Regularización: sesión directa a la base (migración por MCP/psql: session_user no es el
  -- 'authenticator' de PostgREST) o service_role (API con la secret key). Todo lo que entra por la
  -- API con sesión de usuario (anon/authenticated) pasa por 'authenticator' y queda sujeto al guard.
  IF session_user::text <> 'authenticator' OR auth.role() = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := OLD.reunion_id; END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN v_new := NEW.reunion_id; END IF;
  IF fn_reunion_liq_cerrada(v_old) OR fn_reunion_liq_cerrada(v_new) THEN
    RAISE EXCEPTION 'La liquidación de esta reunión está cerrada (saldada): no se puede modificar %. ISSUE-091', TG_TABLE_NAME
      USING ERRCODE = 'P0091';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$

-- fn_reunion_cierre_guard
CREATE OR REPLACE FUNCTION public.fn_reunion_cierre_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.liquidacion_cerrada_at   IS NOT DISTINCT FROM OLD.liquidacion_cerrada_at
     AND NEW.liquidacion_cerrada_nota IS NOT DISTINCT FROM OLD.liquidacion_cerrada_nota THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.liquidacion_cerrada_at IS NULL AND NEW.liquidacion_cerrada_nota IS NULL THEN
    RETURN NEW;
  END IF;
  IF session_user::text <> 'authenticator' OR auth.role() = 'service_role' OR fn_is_super_admin() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Sólo un super_admin puede cerrar o reabrir la liquidación de una reunión. ISSUE-091'
    USING ERRCODE = '42501';
END $function$

-- fn_reunion_liq_cerrada
CREATE OR REPLACE FUNCTION public.fn_reunion_liq_cerrada(p_reunion_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM reuniones WHERE id = p_reunion_id AND liquidacion_cerrada_at IS NOT NULL);
$function$
```

### A.3 `rpc_baja_inscripcion` (el tramo que toca posiciones y sus condiciones)

```sql
select pg_get_functiondef('public.rpc_baja_inscripcion(uuid)'::regprocedure) def;
```

Definición completa (md5 `b8bf790485fcdfab726d7eee7bf05ca4`). Lo relevante: sólo portal, reunión `publicada` y ventana abierta;
la rama 1 borra `resultado_posiciones` de la inscripción que se retira.

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

### A.4 `performances`, reuniones cerradas, auditoría de posiciones y apuestas, roles activos

```sql
select json_build_object(
 'performances_politicas', (select json_agg(json_build_object('p', policyname, 'cmd', cmd, 'qual', qual, 'chk', with_check)) from pg_policies where tablename='performances'),
 'performances_triggers', (select json_agg(tgname) from pg_trigger where tgrelid='public.performances'::regclass and not tgisinternal),
 'cerradas', (select json_agg(json_build_object('numero', r.numero, 'cerrada_at', r.liquidacion_cerrada_at, 'nota', r.liquidacion_cerrada_nota,
     'resultados_oficiales', (select count(*) from resultados re join carreras ca on ca.id=re.carrera_id where ca.reunion_id=r.id and re.estado='oficial'),
     'posiciones', (select count(*) from resultado_posiciones rp join resultados re on re.id=rp.resultado_id join carreras ca on ca.id=re.carrera_id where ca.reunion_id=r.id),
     'lineas', (select json_object_agg(e, n) from (select d.estado_linea::text e, count(*) n from liquidacion_detalle d where d.reunion_id=r.id group by 1) z),
     'performances', (select count(*) from performances pf join carreras ca on ca.id=pf.carrera_id where ca.reunion_id=r.id))) from reuniones r where r.liquidacion_cerrada_at is not null),
 'audit_resultado_posiciones', (select count(*) from pg_trigger where tgrelid='public.resultado_posiciones'::regclass and not tgisinternal),
 'audit_resultado_apuestas', (select count(*) from pg_trigger where tgrelid='public.resultado_apuestas'::regclass and not tgisinternal),
 'roles_usuarios_activos', (select json_object_agg(rol, n) from (select rol::text, count(*) n from usuarios where activo group by 1) x)
) r;
```

```json
[{"r":{"performances_politicas":[{"p":"performances_select","cmd":"SELECT","qual":"(( SELECT fn_is_staff() AS fn_is_staff) OR (spc_id IN ( SELECT s.spc_id\n   FROM fn_mis_spc_ids() s(spc_id))))","chk":null},{"p":"performances_delete","cmd":"DELETE","qual":"( SELECT fn_is_super_admin() AS fn_is_super_admin)","chk":null},{"p":"performances_insert","cmd":"INSERT","qual":null,"chk":"( SELECT fn_is_super_admin() AS fn_is_super_admin)"},{"p":"performances_update","cmd":"UPDATE","qual":"( SELECT fn_is_super_admin() AS fn_is_super_admin)","chk":"( SELECT fn_is_super_admin() AS fn_is_super_admin)"}],"performances_triggers":null,"cerradas":[{"numero":8,"cerrada_at":"2026-09-25T16:30:44.073618+00:00","nota":"Congelada tal como está (saldado administrativo del 28/08): SIN el 8 % de peón/capataz/sereno y SIN las líneas de ISSUE-091. NO es la decisión final sobre esa plata: queda congelada hasta que Fede conteste. Decisión del 25/09/2026.","resultados_oficiales":8,"posiciones":67,"lineas":{"pagado":185,"impago":40},"performances":0},{"numero":6,"cerrada_at":"2026-09-25T16:30:44.073618+00:00","nota":"Congelada tal como está (saldado administrativo del 28/08): SIN el 8 % de peón/capataz/sereno y SIN las líneas de ISSUE-091. NO es la decisión final sobre esa plata: queda congelada hasta que Fede conteste. Decisión del 25/09/2026.","resultados_oficiales":7,"posiciones":81,"lineas":{"pagado":157,"impago":35},"performances":0}],"audit_resultado_posiciones":0,"audit_resultado_apuestas":0,"roles_usuarios_activos":{"profesional":20,"super_admin":1,"propietario":5,"secretario_carreras":2,"operador":3}}}]
```

### A.5 Carreras de R6/R8 (cerradas): estado del resultado y líneas comprometidas

```sql
select r.numero, ca.numero_carrera_programa as carrera, ca.numero_turno as turno, re.estado,
 (select count(*) from liquidacion_detalle d where (d.recibo_id is not null or d.estado_linea='pagado') and (d.carrera_id=ca.id or d.inscripcion_id in (select i.id from inscripciones i where i.carrera_id=ca.id))) as lineas_comprometidas,
 (select count(*) from liquidacion_detalle d where d.estado_linea in ('impago','retenido') and d.recibo_id is null and (d.carrera_id=ca.id or d.inscripcion_id in (select i.id from inscripciones i where i.carrera_id=ca.id))) as lineas_no_comprometidas,
 (select count(*) from resultado_apuestas ra where ra.resultado_id=re.id) as apuestas
from carreras ca join reuniones r on r.id=ca.reunion_id left join resultados re on re.carrera_id=ca.id
where r.liquidacion_cerrada_at is not null order by r.numero, ca.numero_carrera_programa nulls last, ca.numero_turno;
```

```json
[{"numero":6,"carrera":1,"turno":1,"estado":"oficial","lineas_comprometidas":20,"lineas_no_comprometidas":5,"apuestas":9},{"numero":6,"carrera":2,"turno":2,"estado":"oficial","lineas_comprometidas":18,"lineas_no_comprometidas":5,"apuestas":7},{"numero":6,"carrera":3,"turno":3,"estado":"provisional","lineas_comprometidas":0,"lineas_no_comprometidas":0,"apuestas":7},{"numero":6,"carrera":4,"turno":8,"estado":"oficial","lineas_comprometidas":20,"lineas_no_comprometidas":5,"apuestas":11},{"numero":6,"carrera":5,"turno":11,"estado":"oficial","lineas_comprometidas":18,"lineas_no_comprometidas":5,"apuestas":5},{"numero":6,"carrera":6,"turno":6,"estado":"oficial","lineas_comprometidas":23,"lineas_no_comprometidas":5,"apuestas":10},{"numero":6,"carrera":7,"turno":9,"estado":"oficial","lineas_comprometidas":20,"lineas_no_comprometidas":5,"apuestas":10},{"numero":6,"carrera":8,"turno":5,"estado":"oficial","lineas_comprometidas":17,"lineas_no_comprometidas":5,"apuestas":11},{"numero":6,"carrera":null,"turno":4,"estado":null,"lineas_comprometidas":0,"lineas_no_comprometidas":0,"apuestas":0},{"numero":6,"carrera":null,"turno":7,"estado":null,"lineas_comprometidas":0,"lineas_no_comprometidas":0,"apuestas":0},{"numero":6,"carrera":null,"turno":10,"estado":null,"lineas_comprometidas":0,"lineas_no_comprometidas":0,"apuestas":0},{"numero":8,"carrera":1,"turno":2,"estado":"oficial","lineas_comprometidas":24,"lineas_no_comprometidas":5,"apuestas":9},{"numero":8,"carrera":2,"turno":12,"estado":"oficial","lineas_comprometidas":20,"lineas_no_comprometidas":5,"apuestas":4},{"numero":8,"carrera":3,"turno":4,"estado":"oficial","lineas_comprometidas":25,"lineas_no_comprometidas":5,"apuestas":10},{"numero":8,"carrera":4,"turno":5,"estado":"oficial","lineas_comprometidas":23,"lineas_no_comprometidas":5,"apuestas":7},{"numero":8,"carrera":5,"turno":10,"estado":"oficial","lineas_comprometidas":24,"lineas_no_comprometidas":5,"apuestas":7},{"numero":8,"carrera":6,"turno":11,"estado":"oficial","lineas_comprometidas":22,"lineas_no_comprometidas":5,"apuestas":6},{"numero":8,"carrera":7,"turno":3,"estado":"oficial","lineas_comprometidas":21,"lineas_no_comprometidas":5,"apuestas":6},{"numero":8,"carrera":8,"turno":8,"estado":"oficial","lineas_comprometidas":7,"lineas_no_comprometidas":5,"apuestas":7},{"numero":8,"carrera":null,"turno":1,"estado":null,"lineas_comprometidas":0,"lineas_no_comprometidas":0,"apuestas":0},{"numero":8,"carrera":null,"turno":6,"estado":null,"lineas_comprometidas":0,"lineas_no_comprometidas":0,"apuestas":0},{"numero":8,"carrera":null,"turno":7,"estado":null,"lineas_comprometidas":0,"lineas_no_comprometidas":0,"apuestas":0},{"numero":8,"carrera":null,"turno":9,"estado":null,"lineas_comprometidas":0,"lineas_no_comprometidas":0,"apuestas":0}]
```

### A.6 FK de `oficializado_por`, transiciones a oficial, des-oficializaciones, quién oficializó, `resoluciones`

```sql
select json_build_object(
 'fk_oficializado_por', (select json_agg(conname||': '||pg_get_constraintdef(oid)) from pg_constraint where conrelid='public.resultados'::regclass and contype='f'),
 'transiciones_a_oficial', (select json_agg(json_build_object('reunion', x.numero, 'n_transiciones', x.n, 'resultados', x.c) order by x.numero, x.n) from (
    select r.numero, t.n, count(*) c from (
      select re.id, (select count(*) from auditoria a where a.tabla='resultados' and a.registro_id=re.id and a.datos_despues->>'estado'='oficial' and coalesce(a.datos_antes->>'estado','')<>'oficial') n, re.carrera_id
      from resultados re where re.estado='oficial') t join carreras ca on ca.id=t.carrera_id join reuniones r on r.id=ca.reunion_id group by r.numero, t.n) x),
 'desoficializaciones_auditadas', (select count(*) from auditoria a where a.tabla='resultados' and a.datos_antes->>'estado'='oficial' and a.datos_despues->>'estado'='provisional'),
 'usuarios_que_oficializaron', (select json_agg(json_build_object('usuario', u.nombre_completo, 'rol', u.rol, 'n', z.n)) from (select a.usuario_id, count(*) n from auditoria a where a.tabla='resultados' and a.datos_despues->>'estado'='oficial' and coalesce(a.datos_antes->>'estado','')<>'oficial' group by 1) z left join usuarios u on u.id=z.usuario_id),
 'resoluciones_cols', (select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='resoluciones'),
 'resolucion_entidades_cols', (select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='resolucion_entidades'),
 'entidad_tipos_en_uso', (select json_agg(distinct entidad_tipo) from resolucion_entidades),
 'liberar_linea_existe', (select count(*) from pg_proc where proname='liberar_linea')
) r;
```

```json
[{"r":{"fk_oficializado_por":["resultados_carrera_id_fkey: FOREIGN KEY (carrera_id) REFERENCES carreras(id) ON DELETE CASCADE","resultados_oficializado_por_fkey: FOREIGN KEY (oficializado_por) REFERENCES usuarios(id)"],"transiciones_a_oficial":[{"reunion":6,"n_transiciones":1,"resultados":6},{"reunion":6,"n_transiciones":2,"resultados":1},{"reunion":8,"n_transiciones":1,"resultados":4},{"reunion":8,"n_transiciones":2,"resultados":3},{"reunion":8,"n_transiciones":3,"resultados":1},{"reunion":9,"n_transiciones":1,"resultados":5},{"reunion":9999,"n_transiciones":1,"resultados":1},{"reunion":9999,"n_transiciones":11,"resultados":1},{"reunion":9999,"n_transiciones":33,"resultados":1}],"desoficializaciones_auditadas":73,"usuarios_que_oficializaron":[{"usuario":"Administrador Dolores","rol":"secretario_carreras","n":19},{"usuario":"Yesica Elias","rol":"operador","n":13},{"usuario":"Martin Juarez","rol":"operador","n":5},{"usuario":null,"rol":null,"n":86}],"resoluciones_cols":"id:uuid, club_id:uuid, reunion_id:uuid, numero:character varying, fecha:date, tipo:character varying, texto:text, documento_url:text, estado:character varying, creado_por:uuid, created_at:timestamp with time zone, modificado_por:uuid, modificado_at:timestamp with time zone","resolucion_entidades_cols":"id:uuid, resolucion_id:uuid, entidad_tipo:character varying, entidad_id:uuid, descripcion:text","entidad_tipos_en_uso":null,"liberar_linea_existe":1}}]
```

(`entidad_tipos_en_uso: null`: hoy `resolucion_entidades` está vacía. Una resolución todavía no se puede atar a una carrera
por esa tabla; la corrección guardaría el `resolucion_id` en su propia fila.)

### A.7 `performances` por reunión

```sql
select r.numero, (select count(*) from performances pf join carreras ca on ca.id=pf.carrera_id where ca.reunion_id=r.id) performances, (select count(*) from resultados re join carreras ca on ca.id=re.carrera_id where ca.reunion_id=r.id and re.estado='oficial') oficiales, (select max(pf.created_at) from performances pf) ultima_performance_total, (select count(*) from performances) performances_total from reuniones r where r.numero in (6,8,9) and r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' order by 1;
```

```json
[{"numero":6,"performances":0,"oficiales":7,"ultima_performance_total":null,"performances_total":0},{"numero":8,"performances":0,"oficiales":8,"ultima_performance_total":null,"performances_total":0},{"numero":9,"performances":0,"oficiales":5,"ultima_performance_total":null,"performances_total":0}]
```

### A.8 Código de `main` (`cc594e4`)

```
$ git grep -n "from('resultados')\|from('resultado_posiciones')\|from('resultado_apuestas')\|rpc('aplicar_resultado'\|rpc('desoficializar_carrera'\|from('performances')\|rpc('rpc_baja_inscripcion'\|generarLiquidacionesReunion(" main -- '*.html' '*.js' | grep -v "^main:tests/" | cut -c1-200
main:auditoria.html:306:    else if (tabla === 'resultados') q = sb.from('resultados').select('id, carreras(numero_turno, reuniones(numero))').in('id', idsToFetch);
main:carta-llamados.html:831:    const { data: _res } = await sb.from('resultados')
main:liquidaciones-engine.js:92:  async function generarLiquidacionesReunion(opts) {
main:liquidaciones-engine.js:134:      sb.from('resultados').select('id,carrera_id').in('carrera_id', carIds).eq('estado', 'oficial'),
main:liquidaciones-engine.js:140:      ? await sb.from('resultado_posiciones').select('*')
main:liquidaciones-engine.js:282:        ? await sb.from('resultado_posiciones').select('inscripcion_id')
main:liquidaciones.html:941:    const { data: resOf } = await sb.from('resultados').select('id').in('carrera_id', carIds).eq('estado','oficial');
main:liquidaciones.html:944:      const { data: noLarg } = await sb.from('resultado_posiciones').select('inscripcion_id').in('resultado_id', resIds).eq('no_largo', true);
main:liquidaciones.html:2463:  const r = await generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: rid, liqConfig, fmt });
main:portal.html:1383:  const { error } = await sb.rpc('rpc_baja_inscripcion', { p_inscripcion_id: inscId });
main:programa.html:269:    const { data: perfs } = await sb.from('performances').select('*').in('spc_id', spcIds).order('fecha_carrera', {ascending:false});
main:programa.html:278:    const { data: _res } = await sb.from('resultados')
main:resultados.html:545:    sb.from('resultados').select('*').in('carrera_id', carIds),
main:resultados.html:556:    resIds.length ? sb.from('resultado_posiciones').select('*').in('resultado_id', resIds) : { data: [] },
main:resultados.html:557:    resIds.length ? sb.from('resultado_apuestas').select('*').in('resultado_id', resIds).order('orden') : { data: [] },
main:resultados.html:1346:  const { data } = await sb.from('resultado_apuestas').select('*').eq('resultado_id', res.id).order('orden');
main:resultados.html:1571:  const { data: rpcData, error: rpcErr } = await sb.rpc('aplicar_resultado', {
main:resultados.html:1681:    await sb.from('performances').delete().eq('carrera_id', carreraId);
main:resultados.html:1682:    await sb.from('performances').insert(perfInserts);
main:resultados.html:1685:  const r = await generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: rid });
main:resultados.html:1715:  const { error } = await sb.rpc('desoficializar_carrera', { p_carrera_id: carreraId });
main:resultados.html:1717:  await sb.from('performances').delete().eq('carrera_id', carreraId);
main:resultados.html:1720:  const r = await generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: rid });
main:resultados.html:2153:    const r = await generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: rid });
main:resultados_legacy.html:294:    sb.from('resultados').select('*').in('carrera_id', carIds),
main:resultados_legacy.html:302:    const { data: posData } = await sb.from('resultado_posiciones').select('*').in('resultado_id', resIds);
main:resultados_legacy.html:595:    const { data, error } = await sb.from('resultados').insert(resPayload).select().single();
main:resultados_legacy.html:600:    const { error } = await sb.from('resultados').update(resPayload).eq('id', resId);
main:resultados_legacy.html:630:    await sb.from('resultado_posiciones').delete().eq('resultado_id', resId);
main:resultados_legacy.html:631:    const { error } = await sb.from('resultado_posiciones').insert(posData);
main:resultados_legacy.html:656:    await sb.from('performances').delete().eq('carrera_id', carreraId);
main:resultados_legacy.html:657:    await sb.from('performances').insert(perfInserts);
main:resultados_legacy.html:672:  const { error } = await sb.from('resultados').update({ estado: 'provisional' }).eq('id', resId);

$ git grep -n "resultados_legacy" main | grep -v "^main:docs/diagnosticos" | cut -c1-180
main:REMEDIACION_RESULTADO.md:45:`admin, auditoria, caballerizas, calendario, carta-llamados, categorias, hipodromos, index, inscripciones, jockeys, liquidaciones, login, portal, p
main:docs/INITAUTH_ACTIVO_DIAGNOSTICO.md:38:`resultados_legacy`, `reuniones`, `sanciones`, `solicitudes`, `spcs`, `usuarios`.
main:docs/INITAUTH_ACTIVO_DIAGNOSTICO.md:46:| **A** `6535ade86e` | **20** | admin, caballerizas, calendario, carta-llamados, categorias, hipodromos, index, inscripciones, jockeys,
main:docs/ISSUES.md:313:### ISSUE-046: `resultados_legacy.html` mantiene una lista de cuerpos paralela
main:docs/ISSUES.md:314:Descripción: la pantalla legacy no usa el catálogo de `chapas.js` — arma su propio `CUERPOS_OPCIONES` para el datalist de márgenes (`resultados_legacy.
main:docs/ISSUES.md:315:Módulo: `resultados_legacy.html`. Estado: ⏳ Abierto — unificar contra `chapas.js` o dar de baja la pantalla legacy. Prioridad: Baja.
main:docs/auditoria/SGH-REMEDIACION.md:89:- HTML con CSP (29): `admin.html`, `auditoria.html`, `caballerizas.html`, `calendario.html`, `carta-llamados.html`, `categorias.html`, `hi
main:tests/probe_cuerpos_oficial.mjs:6: * legacy sí lo pintaba, resultados_legacy.html:403). Este probe corre el renderOficial REAL
sigh.com.ar/resultados_legacy.html → 200
```

Los tramos de `resultados.html` citados (`aplicar` `:1488-1608`, `oficializar` `:1623-1689`, `desoficializar` `:1697-1724`,
atajos `:1833-1839`) y el corte del motor (`liquidaciones-engine.js:99-112`) se leyeron completos desde `main` en esta sesión.
Las líneas citadas son de `cc594e4`.

### Intentos fallidos (sin efecto, sólo lectura)

Ninguno en este relevamiento. Los dos errores de consulta de antes (agregadas y regex) están en el informe de ISSUE-101 del mismo día.
