# ISSUE-056 — verificación de estado tras el corte de sesión

- **Fecha**: 2026-08-30
- **Rama de trabajo**: `feat/anular-recibo` = `f19919e` (desde `main` = `cbeeee8`)
- **Rama de este cambio de protocolo**: `chore/protocolo-informes-salidas` = `d9e58cf`
- **Proyecto**: `unlhcuanfrtpatoipwve`
- **Estado**: migración aplicada en prod; **merge NO hecho**; UI no construida.
- **Antecedentes**: `docs/diagnosticos/2026-08-30_anular-recibo-plan.md` ·
  `docs/diagnosticos/2026-08-30_anular-recibo-resultados.md`

Este doc contesta tres preguntas puntuales que quedaron abiertas cuando se cortó la
sesión, más el porqué del salto en `club_secuencias`. Todo verificado contra la base,
nada de memoria.

---

## Guards

```
$ pwd
/home/clio/dev/SGH
```

```sql
SELECT (SELECT count(*) FROM spcs) AS spcs, current_database() AS db;
```
```json
[{"spcs":181,"db":"postgres"}]
```

ref del proyecto: `unlhcuanfrtpatoipwve`. Los tres guards dan.

---

## 1 · ¿Está aplicada la migración de `anular_recibo`?

**Sí.** Verificado en `pg_proc`, no de memoria.

```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'anular_recibo%';
```
```json
[{"proname":"anular_recibo"}]
```

Detalle de la firma:

```sql
SELECT n.nspname AS schema, p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer, l.lanname AS lang
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language  l ON l.oid = p.prolang
 WHERE p.proname LIKE 'anular_recibo%'
 ORDER BY 1, 2, 3;
```
```json
[{"schema":"public","proname":"anular_recibo","args":"p_recibo_id uuid, p_motivo text","security_definer":true,"lang":"plpgsql"}]
```

Registrada como migración trackeada:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3;
```
```json
[{"version":"20260830025830","name":"anular_recibo_v1"},
 {"version":"20260830014105","name":"emitir_recibo_v1_2_aislamiento_club"},
 {"version":"20260829035400","name":"reuniones_es_prueba"}]
```

### Cotejo del cuerpo vivo contra `migrations/anular_recibo_v1.sql`

`prosrc` vivo = 3575 chars; el cuerpo del `.sql` = 3835. La diferencia son **tres
comentarios** que no viajaron a la base (el de `service_role`/super_admin en el guard 1,
el de "la foto y lo efectivamente soltado tienen que coincidir", y el inline
`-- red ante concurrencia`). **La lógica es idéntica línea por línea**: guard de club,
guard de ventana de 5 días, idempotencia, `v_usuario_id` desde `usuarios.auth_user_id`,
foto jsonb antes de soltar, `CASE fecha_liberacion > CURRENT_DATE → retenido`, chequeo
`v_liberadas <> jsonb_array_length`, `UPDATE ... AND estado='emitido'`, y `club_secuencias`
sin tocar.

---

## 2 · ¿Quedaron funciones sombra o mutantes vivos?

**No.** La query de arriba (`proname LIKE 'anular_recibo%'`) devuelve **una sola fila**:
`anular_recibo` a secas, firma única `(p_recibo_id uuid, p_motivo text)`, schema `public`.

No hay overloads, ni `_v2`, ni `_test`, ni `_mut`, ni copias en otro schema.
**No hubo nada que dropear y no se dropeó nada.**

---

## 3 · Columnas de anulación en `recibos`

Las tres existen. `anulado_at` ya venía del schema de Fase 0; las otras tres las agregó
esta migración.

```sql
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='recibos'
 ORDER BY ordinal_position;
```
```json
[{"column_name":"id","data_type":"uuid","is_nullable":"NO","column_default":"gen_random_uuid()"},
 {"column_name":"club_id","data_type":"uuid","is_nullable":"NO","column_default":null},
 {"column_name":"numero_recibo","data_type":"integer","is_nullable":"NO","column_default":null},
 {"column_name":"beneficiario_tipo","data_type":"USER-DEFINED","is_nullable":"NO","column_default":null},
 {"column_name":"profesional_id","data_type":"uuid","is_nullable":"YES","column_default":null},
 {"column_name":"propietario_id","data_type":"uuid","is_nullable":"YES","column_default":null},
 {"column_name":"forma_pago","data_type":"USER-DEFINED","is_nullable":"NO","column_default":null},
 {"column_name":"total_premios","data_type":"numeric","is_nullable":"NO","column_default":"0"},
 {"column_name":"total_descuentos","data_type":"numeric","is_nullable":"NO","column_default":"0"},
 {"column_name":"retencion_dgi","data_type":"numeric","is_nullable":"YES","column_default":null},
 {"column_name":"neto_a_cobrar","data_type":"numeric","is_nullable":"YES","column_default":null},
 {"column_name":"cobrador_nombre","data_type":"text","is_nullable":"YES","column_default":null},
 {"column_name":"cobrador_documento","data_type":"text","is_nullable":"YES","column_default":null},
 {"column_name":"comprobante_url","data_type":"text","is_nullable":"YES","column_default":null},
 {"column_name":"estado","data_type":"USER-DEFINED","is_nullable":"NO","column_default":"'emitido'::estado_recibo"},
 {"column_name":"emitido_por","data_type":"uuid","is_nullable":"YES","column_default":null},
 {"column_name":"emitido_at","data_type":"timestamp with time zone","is_nullable":"NO","column_default":"now()"},
 {"column_name":"anulado_at","data_type":"timestamp with time zone","is_nullable":"YES","column_default":null},
 {"column_name":"notas","data_type":"text","is_nullable":"YES","column_default":null},
 {"column_name":"created_at","data_type":"timestamp with time zone","is_nullable":"NO","column_default":"now()"},
 {"column_name":"anulado_por","data_type":"uuid","is_nullable":"YES","column_default":null},
 {"column_name":"motivo_anulacion","data_type":"text","is_nullable":"YES","column_default":null},
 {"column_name":"lineas_anuladas","data_type":"jsonb","is_nullable":"YES","column_default":null}]
```

Las tres nuevas son **nullable a propósito**: las 5 filas históricas de `recibos` quedarían
inválidas con `NOT NULL` y habría que backfillear con un motivo inventado. El motivo se
valida dentro del RPC, no en la columna.

`lineas_anuladas` **sí se llegó a agregar** (era la duda del pedido).

---

## 4 · Fixtures del probe: la base quedó limpia

```sql
SELECT
 (SELECT count(*) FROM liquidacion_detalle WHERE concepto ILIKE 'TEST ISSUE-056%') AS lineas_tag,
 (SELECT count(*) FROM usuarios   WHERE email LIKE 'probe.056.%@sgh.test')          AS usuarios_probe,
 (SELECT count(*) FROM auth.users WHERE email LIKE 'probe.056.%@sgh.test')          AS authusers_probe,
 (SELECT count(*) FROM recibos)                                                     AS recibos_total,
 (SELECT count(*) FROM recibos WHERE cobrador_nombre ILIKE 'Probe 056%')            AS recibos_probe,
 (SELECT count(*) FROM recibos WHERE estado='anulado')                              AS recibos_anulados,
 (SELECT count(*) FROM liquidacion_detalle WHERE recibo_id IS NOT NULL)             AS lineas_con_recibo;
```
```json
[{"lineas_tag":0,"usuarios_probe":0,"authusers_probe":0,"recibos_total":5,
  "recibos_probe":0,"recibos_anulados":0,"lineas_con_recibo":8}]
```

```sql
SELECT estado_linea, count(*) FROM liquidacion_detalle GROUP BY 1 ORDER BY 2 DESC;
```
```json
[{"estado_linea":"pagado","count":346},
 {"estado_linea":"impago","count":126},
 {"estado_linea":"retenido","count":21}]
```

`recibos=5` y `lineas_con_recibo=8` son el baseline de la migración. Sin residuo del probe
en líneas, usuarios, `auth.users` ni recibos.

**Salvedad: `club_secuencias` sí quedó sucio.** Ver §5.

---

## 5 · Por qué `club_secuencias` de Dolores pasó de 30 a 32

```sql
SELECT club_id, tipo, ultimo_numero FROM club_secuencias WHERE tipo='recibo';
```
```json
[{"club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","tipo":"recibo","ultimo_numero":1},
 {"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","tipo":"recibo","ultimo_numero":32}]
```

Los recibos que existen hoy (máximo real de Dolores = **3**; 9001/9002 son los sembrados a
mano de la reunión 9999, GOTCHA):

```sql
SELECT id, club_id, numero_recibo, estado, emitido_at, cobrador_nombre, emitido_por
  FROM recibos ORDER BY emitido_at;
```
```json
[{"id":"e9000000-0000-0000-0000-000000009001","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_recibo":9001,"estado":"emitido","emitido_at":"2026-06-10 02:33:53.506047+00","cobrador_nombre":null,"emitido_por":null},
 {"id":"e9000000-0000-0000-0000-000000009002","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_recibo":9002,"estado":"emitido","emitido_at":"2026-06-10 02:33:53.506047+00","cobrador_nombre":null,"emitido_por":null},
 {"id":"77774e4d-6e5a-4015-9466-76fec012e212","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_recibo":1,"estado":"emitido","emitido_at":"2026-08-16 18:46:44.652601+00","cobrador_nombre":null,"emitido_por":null},
 {"id":"b2966769-6613-4894-993f-f2033738e44a","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_recibo":2,"estado":"emitido","emitido_at":"2026-08-28 12:58:16.28662+00","cobrador_nombre":null,"emitido_por":null},
 {"id":"003b04c6-1b41-428c-8f16-5fe3e148d16a","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_recibo":3,"estado":"emitido","emitido_at":"2026-08-28 14:10:26.492625+00","cobrador_nombre":null,"emitido_por":null}]
```

`recibos` tiene trigger de auditoría (`trg_audit_recibos`), así que la historia se
reconstruye aunque las filas se hayan borrado:

```sql
SELECT to_char(created_at,'HH24:MI:SS') t, accion,
       CASE WHEN club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' THEN 'DOLORES' ELSE 'CLUB_B' END club,
       datos_despues->>'numero_recibo'   nro,
       datos_despues->>'cobrador_nombre' cobrador
  FROM auditoria
 WHERE tabla='recibos' AND accion='INSERT' AND created_at > '2026-08-30 02:00:00+00'
 ORDER BY created_at;
```

Salida cruda (94 filas, completa):

```
02:04:28  CLUB_B    2  Probe mtf61w9s
02:04:28  CLUB_B    3  Probe mtf61w9s
02:04:46  DOLORES  29  TEST Cobrador          ← probe_recibos_emision      (snapshot = 28)
02:04:47  DOLORES  30  TEST
02:05:09  DOLORES  29  SERENO SIN APODERADO   ← probe_recibo_pie_cobrador  (snapshot = 28)
02:05:14  DOLORES  30  TESORERIA
02:27:21  CLUB_B    2  Probe mtf6vbmc
02:27:22  CLUB_B    3  Probe mtf6vbmc
02:58:50  CLUB_B    2  Probe 056 mtf7zuvb
02:58:52  CLUB_B    3  Probe 056 mtf7zuvb
02:58:53  CLUB_B    4  Probe 056 mtf7zuvb
02:58:54  CLUB_B    5  Probe 056 mtf7zuvb
02:58:54  CLUB_B    6  Probe 056 mtf7zuvb
02:58:56  DOLORES  31  Probe 056 mtf7zuvb     ← probe_anular_recibo        (snapshot = 30)
02:58:57  CLUB_B    7  Probe 056 mtf7zuvb
02:58:58  CLUB_B    8  Probe 056 mtf7zuvb
02:59:00  CLUB_B    9  Probe 056 mtf7zuvb
02:59:56  CLUB_B    2  Probe 056 mtf81akv
02:59:58  CLUB_B    3  Probe 056 mtf81akv
02:59:59  CLUB_B    4  Probe 056 mtf81akv
03:00:00  CLUB_B    5  Probe 056 mtf81akv
03:00:01  CLUB_B    6  Probe 056 mtf81akv
03:00:03  DOLORES  31  Probe 056 mtf81akv
03:00:05  CLUB_B    7  Probe 056 mtf81akv
03:00:06  CLUB_B    8  Probe 056 mtf81akv
03:00:08  CLUB_B    9  Probe 056 mtf81akv
03:01:55  CLUB_B    2  Probe 056 mtf83utz
03:01:57  CLUB_B    3  Probe 056 mtf83utz
03:01:57  CLUB_B    4  Probe 056 mtf83utz
03:01:58  CLUB_B    5  Probe 056 mtf83utz
03:01:59  CLUB_B    6  Probe 056 mtf83utz
03:02:01  DOLORES  31  Probe 056 mtf83utz
03:02:02  CLUB_B    7  Probe 056 mtf83utz
03:02:03  CLUB_B    8  Probe 056 mtf83utz
03:02:05  CLUB_B    9  Probe 056 mtf83utz
03:02:28  CLUB_B    2  Probe 056 mtf84kcl
03:02:30  CLUB_B    3  Probe 056 mtf84kcl
03:02:30  CLUB_B    4  Probe 056 mtf84kcl
03:02:31  CLUB_B    5  Probe 056 mtf84kcl
03:02:32  CLUB_B    6  Probe 056 mtf84kcl
03:02:33  DOLORES  31  Probe 056 mtf84kcl
03:02:34  CLUB_B    7  Probe 056 mtf84kcl
03:02:35  CLUB_B    8  Probe 056 mtf84kcl
03:02:38  CLUB_B    9  Probe 056 mtf84kcl
03:03:00  CLUB_B    2  Probe 056 mtf859yg
03:03:02  CLUB_B    3  Probe 056 mtf859yg
03:03:02  CLUB_B    4  Probe 056 mtf859yg
03:03:03  CLUB_B    5  Probe 056 mtf859yg
03:03:04  CLUB_B    6  Probe 056 mtf859yg
03:03:06  DOLORES  31  Probe 056 mtf859yg
03:03:07  CLUB_B    7  Probe 056 mtf859yg
03:03:08  CLUB_B    8  Probe 056 mtf859yg
03:03:10  CLUB_B    9  Probe 056 mtf859yg
03:03:33  CLUB_B    2  Probe 056 mtf85y76
03:03:34  CLUB_B    3  Probe 056 mtf85y76
03:03:35  CLUB_B    4  Probe 056 mtf85y76
03:03:36  CLUB_B    5  Probe 056 mtf85y76
03:03:36  CLUB_B    6  Probe 056 mtf85y76
03:03:37  DOLORES  31  Probe 056 mtf85y76
03:03:38  CLUB_B    7  Probe 056 mtf85y76
03:03:39  CLUB_B    8  Probe 056 mtf85y76
03:03:41  CLUB_B    9  Probe 056 mtf85y76
03:04:02  CLUB_B    2  Probe 056 mtf86lmm
03:04:03  CLUB_B    3  Probe 056 mtf86lmm
03:04:04  CLUB_B    4  Probe 056 mtf86lmm
03:04:05  CLUB_B    5  Probe 056 mtf86lmm
03:04:06  CLUB_B    6  Probe 056 mtf86lmm
03:04:08  DOLORES  31  Probe 056 mtf86lmm
03:04:08  CLUB_B    7  Probe 056 mtf86lmm
03:04:09  CLUB_B    8  Probe 056 mtf86lmm
03:04:11  CLUB_B    9  Probe 056 mtf86lmm
03:04:33  CLUB_B    2  Probe 056 mtf879er
03:04:34  CLUB_B    3  Probe 056 mtf879er
03:04:35  CLUB_B    4  Probe 056 mtf879er
03:04:36  CLUB_B    5  Probe 056 mtf879er
03:04:37  CLUB_B    6  Probe 056 mtf879er
03:04:38  DOLORES  31  Probe 056 mtf879er
03:04:58  CLUB_B    2  Probe 056 mtf87s29
03:04:59  CLUB_B    3  Probe 056 mtf87s29
03:05:00  CLUB_B    4  Probe 056 mtf87s29
03:05:01  CLUB_B    5  Probe 056 mtf87s29
03:05:01  CLUB_B    6  Probe 056 mtf87s29
03:05:02  DOLORES  31  Probe 056 mtf87s29
03:05:04  CLUB_B    7  Probe 056 mtf87s29
03:05:04  CLUB_B    8  Probe 056 mtf87s29
03:05:06  CLUB_B    9  Probe 056 mtf87s29
03:06:00  CLUB_B    2  Probe mtf893oc
03:06:00  CLUB_B    3  Probe mtf893oc
03:06:08  DOLORES  31  TEST Cobrador          ← probe_recibos_emision      (snapshot = 30)
03:06:09  DOLORES  32  TEST
03:06:17  DOLORES  31  SERENO SIN APODERADO   ← probe_recibo_pie_cobrador  (snapshot = 30)
03:06:19  DOLORES  32  TESORERIA
```

Y los DELETE finales:

```
03:06:22  DELETE  DOLORES  42490fbb-3831-47cf-afed-0b2e61fd1849   (era el 31)
03:06:23  DELETE  DOLORES  8f1a33ab-8bc5-4f05-bded-cd76b859eef6   (era el 32)
        ← el proceso muere acá. El contador queda en 32.
```

### Conclusión — son dos cosas distintas, no una

**(a) Quién dejó el 32: `probe_recibo_pie_cobrador.mjs`.** Decisión explícita, en su propio
comentario:

```
tests/probe_recibo_pie_cobrador.mjs:175
// club_secuencias NO se snapshotea ni se restaura: los números de recibo son ilimitados y
```

Borra sus recibos pero no devuelve el contador. Corrió dos veces esta noche y sumó +2 cada
vez: **28 → 30** a las 02:05 y **30 → 32** a las 03:06. El baseline limpio no es 30, es
**28**. En la segunda corrida el proceso murió después de los DELETE (03:06:22/23) y antes
del bloque de restore, pero eso da igual: ese probe no restaura la secuencia ni cuando
termina bien.

**(b) `probe_anular_recibo` sí emite contra Dolores, y eso quedó sin revisar.** Toma el nro
31 de Dolores en **cada** corrida (9 corridas, 02:58 → 03:05). Es el fixture `detClubA`:

```js
const detClubA = await plantar(CLUB_A, REUNION_A, BENEF_A, `${TAG} clubA ${RUN}`, M_CLUBA);
```

Existe porque el candado de club necesita un recibo **de Dolores** para verificar que un
usuario del club B no lo puede anular (asserts P6/P7). Restaura bien — se ve en que cada
corrida vuelve a tomar el 31, nunca el 32 — así que **no** es el origen del residuo. Pero
el comentario de su bloque de restore dice lo contrario de lo que el probe hace:

```js
// El probe emite contra el club B (Mi Club Hípico) a propósito, para no correr el
// correlativo de Dolores. Igual se devuelven las dos secuencias a donde estaban.
```

Es falso tal como está escrito: emite contra los dos. Eso estaba para revisar antes de
correrlo, y se corrió igual. Queda anotado como deuda en §7.

---

## 6 · git

```
$ git status
On branch chore/protocolo-informes-salidas
nothing to commit, working tree clean

$ git log --oneline -5
d9e58cf docs: el protocolo de informes cubre toda salida, no sólo los diagnósticos
cbeeee8 merge: ISSUE-059/060/057 — aislamiento entre clubes en el circuito de cobro
59e278b docs: cierre de ISSUE-057/059/060 + GOTCHAS #79 y #80
ccc0c6e Merge remote-tracking branch 'origin/main' into fix/aislamiento-club-cobros
380ea72 test: probe_reunion_es_prueba se adapta al helper cobDelClub de ISSUE-060

$ git log --oneline -5 feat/anular-recibo
f19919e feat: anular_recibo v1 (ISSUE-056) — RPC + rollback + probe
cbeeee8 merge: ISSUE-059/060/057 — aislamiento entre clubes en el circuito de cobro
59e278b docs: cierre de ISSUE-057/059/060 + GOTCHAS #79 y #80
ccc0c6e Merge remote-tracking branch 'origin/main' into fix/aislamiento-club-cobros
380ea72 test: probe_reunion_es_prueba se adapta al helper cobDelClub de ISSUE-060

$ git show --stat --oneline feat/anular-recibo
f19919e feat: anular_recibo v1 (ISSUE-056) — RPC + rollback + probe
 migrations/anular_recibo_v1.sql          | 180 +++++++++++++
 migrations/rollback_anular_recibo_v1.sql |  16 ++
 tests/probe_anular_recibo.mjs            | 448 +++++++++++++++++++++++++++++++
 3 files changed, 644 insertions(+)

$ git branch --list feat/anular-recibo chore/protocolo-informes-salidas main reports -v
* chore/protocolo-informes-salidas d9e58cf docs: el protocolo de informes cubre toda salida, no sólo los diagnósticos
  feat/anular-recibo               f19919e feat: anular_recibo v1 (ISSUE-056) — RPC + rollback + probe
  main                             cbeeee8 merge: ISSUE-059/060/057 — aislamiento entre clubes en el circuito de cobro
  reports                          a06f7de docs: ISSUE-056 — resultados de anular_recibo (pasos 1-4, sin mergear)
```

Lo que estaba en staging cuando se cortó la sesión (los 3 archivos de ISSUE-056) quedó
**commiteado** en `f19919e`. Ninguna de las tres ramas está pusheada al remoto todavía.

---

## 7 · Números de resumen

| Pregunta | Respuesta |
|---|---|
| ¿Migración aplicada? | Sí — `anular_recibo(uuid, text)`, SECURITY DEFINER, `20260830025830` |
| ¿Sombras / mutantes? | No — 1 sola fila en `pg_proc`, nada que dropear |
| `anulado_por` | Existe, `uuid`, nullable, FK → `usuarios(id)` |
| `motivo_anulacion` | Existe, `text`, nullable |
| `lineas_anuladas` | Existe, `jsonb`, nullable |
| ¿Fixtures del probe en la base? | No — 0 líneas, 0 usuarios, 0 `auth.users`, 0 recibos |
| `club_secuencias` Dolores | **32** — debería ser **28**. +4 dejados por `probe_recibo_pie_cobrador` |
| `club_secuencias` Club B | 1 |
| Recibos anulados en prod | 0 |
| Merge a `main` | **NO hecho** |

---

## 8 · Preguntas abiertas

1. **`club_secuencias` de Dolores está en 32 y el baseline limpio es 28.** Tres opciones:
   bajarlo a 28, dejarlo y anotar el hueco, o dejarlo sin más. Es tu decisión — no toqué
   nada. Ojo que el hueco de numeración es visible para Valeria en la ventanilla.
2. **`probe_recibo_pie_cobrador.mjs:175` no restaura `club_secuencias`, por diseño.** Si el
   contador importa, hay que cambiarlo: es el único probe del set que no lo devuelve.
   Candidato a ISSUE nuevo.
3. **El comentario del restore de `probe_anular_recibo.mjs` miente** sobre contra qué club
   emite. Arreglar el comentario (el código está bien: el fixture de Dolores es necesario
   para probar el candado de club).
4. **¿Se mergea `feat/anular-recibo` a `main`?** Espera OK explícito. La UI de anulación en
   `liquidaciones.html` no está construida todavía.
5. **`chore/protocolo-informes-salidas`** tiene el cambio de CLAUDE.md pedido. También
   espera OK para mergear.
