# `v_inscriptos_carrera` cerrada para anon (ISSUE-098) + qué había en `info_adicional`

- **Fecha**: 2026-10-02, 16:35 a 16:50 ART
- **Rama**: `fix/v-inscriptos-security-invoker`, commit `fbe9d08d25550231ceebef2b4524fa535bec6e58`, PR #47 (desde `main` =
  `c28d8bee35c4304109ac7e6b763129f1b0a2c574`)
- **Migración aplicada en prod**: `20261002193945 cerrar_v_inscriptos_carrera`
- **Guards** (antes del apply): pwd `/home/clio/dev/SGH`; ref `unlhcuanfrtpatoipwve` (en `supabase.js`);
  `select count(*) from clubs where id='0649e9c5-9e87-4aad-842f-101458e6b33c' and nombre='Hipódromo de Dolores'` → `1`.
- **Horario**: pediste hacerlo ya. La vista no tiene lectores, así que no cambia ninguna pantalla y no esperé a que Yesi
  dejara de trabajar.

## 1. Un desvío en el orden

**El pedido "Antes de cerrar la vista: revisá qué contiene `info_adicional`" llegó después del apply.** La migración ya
estaba aplicada y verificada. No la reabrí para revisar: la revisión se hizo igual sobre la tabla `inscripciones`, que es
de donde la vista toma `info_adicional`, y el resultado es el mismo que si se hubiera hecho antes (§3).

## 2. El cierre

### 2.1 Probe antes del apply: tiene que dar rojo en C1

```
$ node tests/probe_v_inscriptos_cerrada.mjs
❌ C1 anon NO lee v_inscriptos_carrera — status=206 code=- filas=1
✅ C2 service_role: la vista sigue viva — status=206 total=427
✅ C3 anon → v_programa_reunion: 0 filas — status=200 filas=0 total=0
✅ C3 anon → v_sanciones_vigentes: 0 filas — status=200 filas=0 total=0
✅ C3 anon → v_spcs_activos: 0 filas — status=200 filas=0 total=0
✅ C4 toda CREATE [OR REPLACE] VIEW de migrations/ lleva security_invoker — 154 archivos

5/6 OK
rc=1
$ node tests/probe_v_inscriptos_cerrada.mjs --mutantes
💀 MU1 vista abierta (200 con filas, como antes del 02/10) — status=206 code=- filas=1
💀 MU2 anon con 0 filas pero sin rechazo (invoker sin REVOKE) — status=200 code=- filas=0
💀 MU3 vista muerta para service_role — status=404 total=null
💀 MU4 otra vista abierta a anon — status=200 filas=1 total=3
💀 MU5 migración nueva con CREATE OR REPLACE VIEW sin la opción — sin security_invoker: migrations/zz_mutante.sql:1
💀 MU6 se quita el marcador del bloque histórico — sin security_invoker: migrations/fn_edad_reglamentaria.sql:178
💀 MU7 rollback de fn_edad sin WITH — sin security_invoker: migrations/fn_edad_reglamentaria.sql:322

Mutantes: 7/7 muertos
rc=0
```

(Hoy son 427 inscripciones; en el informe de la fase 1 eran 425. Se sumaron dos en el medio.)

### 2.2 Apply

`apply_migration` con el texto **completo** de `migrations/cerrar_v_inscriptos_carrera.sql` (comentarios incluidos). La
parte ejecutable es:

```sql
ALTER VIEW public.v_inscriptos_carrera SET (security_invoker = true);
REVOKE SELECT ON public.v_inscriptos_carrera FROM anon;
```

Resultado: `{"success":true}`.

### 2.3 Verificación en la base

```sql
select reloptions, has_table_privilege('anon', oid, 'SELECT') anon_sel, has_table_privilege('authenticated', oid, 'SELECT') auth_sel, has_table_privilege('sgh_lectura', oid, 'SELECT') lectura_sel,
 (select version||' '||name from supabase_migrations.schema_migrations order by version desc limit 1) ult_migracion,
 (select md5(array_to_string(statements, E'\n')) from supabase_migrations.schema_migrations where name='cerrar_v_inscriptos_carrera') md5_texto
from pg_class where oid = 'public.v_inscriptos_carrera'::regclass;
```

```
reloptions={security_invoker=true} | anon_sel=f | auth_sel=t | lectura_sel=t | ult_migracion=20261002193945 cerrar_v_inscriptos_carrera | md5_texto=792b74438a4729e17b7287c2069db9cd
```

Los permisos que tenía la vista antes del apply eran estos:

```sql
select grantee, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants
where table_schema='public' and table_name='v_inscriptos_carrera' group by 1 order by 1;
```

```
anon|DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
authenticated|DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
postgres|DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
service_role|DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
sgh_lectura|SELECT
```

Se revocó **sólo SELECT** a anon, como se pidió. Los otros privilegios de anon (INSERT, UPDATE, DELETE…) siguen en el
catálogo, pero no sirven: la vista tiene JOINs, así que no es actualizable, y sin SELECT anon no la puede leer. Si se
quieren limpiar, va en el paquete de las 31.

### 2.4 Probe después del apply, y la API

```
$ node tests/probe_v_inscriptos_cerrada.mjs
✅ C1 anon NO lee v_inscriptos_carrera — status=401 code=42501 filas=0
✅ C2 service_role: la vista sigue viva — status=206 total=427
✅ C3 anon → v_programa_reunion: 0 filas — status=200 filas=0 total=0
✅ C3 anon → v_sanciones_vigentes: 0 filas — status=200 filas=0 total=0
✅ C3 anon → v_spcs_activos: 0 filas — status=200 filas=0 total=0
✅ C4 toda CREATE [OR REPLACE] VIEW de migrations/ lleva security_invoker — 154 archivos

6/6 OK
rc=0
$ curl -s -w ' http=%{http_code}\n' ".../rest/v1/v_inscriptos_carrera?select=inscripcion_id&limit=1" -H "apikey: <publishable>"
{"code":"42501","details":null,"hint":null,"message":"permission denied for view v_inscriptos_carrera"} http=401
```

### 2.5 Advisor de seguridad después del apply (conteo por lint)

```
26 ('anon_security_definer_function_executable', 'WARN')
1 ('auth_leaked_password_protection', 'WARN')
41 ('authenticated_security_definer_function_executable', 'WARN')
6 ('rls_enabled_no_policy', 'INFO')
```

`security_definer_view` (ERROR) ya **no aparece**. Antes del apply estaba en 1 (informe de la fase 1, §3.9).

### 2.6 Qué queda en el PR #47

- La migración y su rollback (el rollback la **reabre**, sólo para emergencias).
- `fn_edad_reglamentaria.sql`: el bloque aplicado queda como se aplicó, marcado `HISTÓRICO-SIN-INVOKER`; el ROLLBACK 2/2
  ahora lleva `WITH (security_invoker = true)`.
- CLAUDE.md § Vistas: toda `CREATE [OR REPLACE] VIEW` lleva `WITH (security_invoker = true)`, como pediste.
- GOTCHA #102, ISSUE-098 cerrado, CHANGELOG y el probe en `correr_todos.sh`.
- El `correr_todos.sh` del PR está corriendo; su resumen va en el informe del merge.

## 3. `info_adicional`: qué había

Se consultó la tabla de origen (`inscripciones`, las 427 de todas las reuniones y clubs), contando por categoría. **No se
copia ningún texto.**

```sql
with t as (select i.id, btrim(i.info_adicional) x, r.es_prueba, r.club_id, r.fecha from inscripciones i join carreras c on c.id=i.carrera_id join reuniones r on r.id=c.reunion_id)
select count(*) total,
 count(*) filter (where x is not null and x<>'') con_texto,
 count(*) filter (where x is not null and x<>'' and es_prueba) con_texto_9999,
 count(*) filter (where x ~ '<ARROBA>') arroba,                                       -- en la consulta real, el carácter arroba
 count(*) filter (where x ~ '[0-9]{7,}') corrida_7_digitos,
 count(*) filter (where x ~ '[0-9]{2,4}[ -.][0-9]{3,4}[ -.]?[0-9]{0,4}') forma_telefono,
 count(*) filter (where x ~ '[0-9]{1,2}\.[0-9]{3}\.[0-9]{3}') forma_dni_puntos,
 count(*) filter (where x ~* '(dni|cuit|cuil|cbu|alias|tel[eé]f|cel|whats|wsp)') palabra_dato_personal,
 count(*) filter (where x ~ '\$' or x ~* '(pesos|monto|deuda|pag[oó]|transfer)') plata,
 count(*) filter (where x ~* '(vet|lesi[oó]n|cojo|cojera|renguea|enferm|medic|droga|doping|antidop|fractur|cirug|operad|tendin|sangr|c[oó]lico|herid|infecc|tratamiento|suspendid|sanci)') salud_o_sancion,
 count(*) filter (where x ~* '(propietari|dueñ|entrenador|cuidador|capataz|pe[oó]n|sereno|jockey|stud|caballeriza)') menciona_personas_o_roles,
 count(*) filter (where x ~* '(kg|kilo|peso|descarg|aprendiz)') peso_descargo,
 count(*) filter (where x ~* '(anteojer|gr[aá]nulos?|vendas?|lengua|bozal|herradur|desherr|careta|orejer|cinch)') equipo,
 min(length(x)) filter (where x<>'') min_len, max(length(x)) max_len, round(avg(length(x)) filter (where x<>''),1) prom_len,
 count(distinct x) filter (where x<>'') textos_distintos
from t;
```

(El patrón del email se reescribió con `<ARROBA>` sólo en este documento: el chequeo de datos personales no admite el
carácter. En la consulta que corrió está el carácter literal.)

```
total=427 | con_texto=2 | con_texto_9999=0 | arroba=0 | corrida_7_digitos=0 | forma_telefono=0 | forma_dni_puntos=0
palabra_dato_personal=0 | plata=0 | salud_o_sancion=0 | menciona_personas_o_roles=0 | peso_descargo=0 | equipo=0
min_len=9 | max_len=18 | prom_len=13.5 | textos_distintos=2
```

**Sólo 2 de 427 inscripciones tienen texto.** Las leí para clasificarlas; acá van por categoría y sin el texto:

| inscripción (id) | reunión / turno | estado | canal | categoría |
|---|---|---|---|---|
| `f4150ef9-61af-4452-99d5-133222bc8e36` | R8 T10 | `mal_inscrito` | manual | **nota administrativa de estado**: una palabra que dice que el caballo quedó afuera |
| `df7f1abc-516b-4ad9-94f0-e556bb4f2092` | R8 T5 | `mal_inscrito` | manual | **nota administrativa de estado**: el motivo reglamentario por el que no corresponde al turno |

Consulta para verlas: `select id, info_adicional from inscripciones where btrim(coalesce(info_adicional,''))<>'';`.

**Conclusión**: en `info_adicional` **no** hay datos personales, de salud, teléfonos, montos ni nada sensible. Son dos
motivos de borrado de R8, que además salen públicamente en el PDF de ratificación.

**Qué más exponía la vista** (por las columnas, no por el contenido medido):

- nombres de **propietarios** (`propietarios.nombre`, que en muchos casos es una persona), de **entrenadores** y de
  **jockeys**;
- **caballerizas** y **colores**;
- datos de los caballos;
- pesos.

La vista **no** incluía DNI, teléfonos, emails ni montos: no tenía esas columnas. Buena parte de esto sale en el programa
impreso y en la carta de llamados. Lo que no es público son las inscripciones de reuniones que todavía no se publicaron y
las que quedaron `mal_inscrito` o `forfait`.

## 4. Preguntas abiertas

1. El aviso a Fede queda a tu criterio. Si sirve, una línea honesta:

   > "Entre el 27/08 y el 02/10, un error de configuración dejó legible desde afuera, sin usuario, la lista de inscripciones:
   > caballo, propietario, entrenador, jockey y caballeriza. No incluía documentos, teléfonos, emails ni plata. Se cerró el
   > 02/10 y agregamos un control para que no se repita."

2. ¿Los privilegios de escritura que le quedan a anon sobre la vista se limpian en el paquete de las 31? Mi propuesta: sí,
   con `REVOKE ALL`.

## Verificación de push

El grep de datos personales sobre lo agregado dio una coincidencia en el primer intento: un `@` usado como separador entre
la rama y el SHA en el encabezado. **No se pusheó**: se reescribió la línea y el grep dio vacío.

```
$ git push -q origin reports && git ls-remote origin reports && git rev-parse HEAD
52f620229db63837df3dcf74cfd3337ba7249062	refs/heads/reports
52f620229db63837df3dcf74cfd3337ba7249062
```

Esta sección va en un commit posterior: su SHA es el HEAD de `origin/reports` al leerla.
