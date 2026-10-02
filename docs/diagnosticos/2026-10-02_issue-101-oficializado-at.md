# ISSUE-101 — resultados oficiales sin `oficializado_at` (y merge del PR #32)

- **Fecha:** 2026-10-02
- **Modo:** el relevamiento es **SÓLO LECTURA** (MCP `execute_sql`, sólo SELECT). No se corrigió nada.
- **Guards:** pwd=/home/clio/dev/SGH · ref=unlhcuanfrtpatoipwve · spcs=238 (nada de esto escribe).

## SHA de cada paso

| Paso | Referencia |
|---|---|
| merge del PR #32 (probe a sintéticos) | **`6ef13150cdd8e85f5cdce3a2bbd0e908260a2514`** (`CLAUDE.md` + `tests/probe_aviso_jockey_repetido.mjs`; ningún archivo de la app) |
| ISSUE-101 en `docs/ISSUES.md` | rama `chore/issue-101-oficializado-at` commit **`2fa427d`** — PR **#33** (https://github.com/mdqclio/SGH/pull/33), **sin mergear** |

## Resumen

- **No es R9 C4: son todos.** 24 resultados en la base; 23 `oficial` y **23/23 con `oficializado_at` y `oficializado_por` NULL**.
  Por reunión: R6 7/7, R8 8/8, R9 5/5, 9999 3/3.
- **Causa:** `aplicar_resultado` no escribe esas columnas (A.2). Sólo `desoficializar_carrera` las toca, y para ponerlas en
  NULL. En `main` ni el front ni las migraciones las escriben (A.1).
- **Reconstruible:** los 20 oficiales reales tienen en `auditoria` el paso `provisional → oficial` con `usuario_id` (A.4).
  La auditoría vence a los 12 meses: la de R6 (22/07), en julio de 2027.
- **Relación con el bloqueo en reunión cerrada:** en R6 y R8 (liquidación cerrada, ISSUE-091) `resultados.html` no deja
  des-oficializar (`:1699-1703`). Y el marcador sólo está en la vista provisional (ISSUE-089). Entonces no hay camino por
  pantalla para re-oficializar y que quede la fecha: las 15 de R6/R8 sólo se arreglan con un backfill desde la auditoría.

## A.1 `git grep` en `main` (`6ef1315`)

```
$ git grep -n -i "oficializado_at" main -- '*.html' '*.js' 'migrations/*.sql'
main:migrations/desoficializar_carrera.sql:40:     SET estado = 'provisional', oficializado_at = NULL, oficializado_por = NULL
main:migrations/guard_staff_desoficializar_carrera.sql:75:     SET estado = 'provisional', oficializado_at = NULL, oficializado_por = NULL
main:migrations/rollback_guard_staff_desoficializar_carrera.sql:28:     SET estado = 'provisional', oficializado_at = NULL, oficializado_por = NULL

$ git grep -n -i "cerrada" main -- resultados.html
main:resultados.html:1686:  if (r.cerrada) toast('✅ Resultado oficial. La liquidación de esta reunión está CERRADA (saldada): no se generó ni se tocó ninguna línea.', 'warning', 9000);
main:resultados.html:1699:  // Reunión con la liquidación cerrada (ISSUE-091): des-oficializar dejaría líneas de una carrera
main:resultados.html:1703:  if (reuCierre?.liquidacion_cerrada_at) { toast('La liquidación de esta reunión está cerrada (saldada): no se puede des-oficializar.', 'error', 9000); return; }
main:resultados.html:2154:    if (r.cerrada) toast('Monta guardada. La liquidación de esta reunión está CERRADA (saldada): no se recalculó.', 'warning', 9000);
```

## A.2 Funciones de prod que tocan `resultados`

```sql
select p.proname, p.prokind, position('oficializado_at' in pg_get_functiondef(p.oid)) > 0 as menciona_oficializado_at,
 position('oficializado_por' in pg_get_functiondef(p.oid)) > 0 as menciona_oficializado_por,
 md5(pg_get_functiondef(p.oid)) md5
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and (position('resultados' in pg_get_functiondef(p.oid)) > 0)
order by 1;
```

```json
[{"proname":"aplicar_resultado","prokind":"f","menciona_oficializado_at":false,"menciona_oficializado_por":false,"md5":"94d46dc0ed70e78329169bb3926f64c2"},{"proname":"desoficializar_carrera","prokind":"f","menciona_oficializado_at":true,"menciona_oficializado_por":true,"md5":"c3247d72656833cd534e4c601900f25a"},{"proname":"fn_club_de_resultado","prokind":"f","menciona_oficializado_at":false,"menciona_oficializado_por":false,"md5":"8c5de2f22e29483677a236da6bad10f5"},{"proname":"fn_insc_monta_oficial_guard","prokind":"f","menciona_oficializado_at":false,"menciona_oficializado_por":false,"md5":"935d8dfad71878efef3b7b75efad2b75"},{"proname":"rpc_cambiar_monta","prokind":"f","menciona_oficializado_at":false,"menciona_oficializado_por":false,"md5":"d49299c2a1b409e598db9353f90a5095"}]
```

(Dos intentos anteriores de esta consulta fallaron sin leer nada: `42809 "array_agg" is an aggregate function`, porque
`pg_get_functiondef` sobre agregadas, y `2201B invalid regular expression` en un `substring`. Se reemplazaron por esta.)

## A.3 Conteo en todas las reuniones + R9 C4 con su auditoría

```sql
select json_build_object(
 'por_reunion', (select json_agg(x order by x.fecha) from (
    select r.numero, r.fecha, c.sigla club, r.es_prueba, r.liquidacion_cerrada_at is not null as liq_cerrada,
      count(*) filter (where re.estado='oficial') as oficiales,
      count(*) filter (where re.estado='oficial' and re.oficializado_at is null) as oficiales_sin_at,
      count(*) filter (where re.estado='oficial' and re.oficializado_por is null) as oficiales_sin_por,
      count(*) filter (where re.estado='oficial' and re.oficializado_at is not null) as oficiales_con_at
    from resultados re join carreras ca on ca.id=re.carrera_id join reuniones r on r.id=ca.reunion_id join clubs c on c.id=r.club_id
    group by r.numero, r.fecha, c.sigla, r.es_prueba, r.liquidacion_cerrada_at) x),
 'totales', (select json_build_object('resultados', count(*), 'oficiales', count(*) filter (where estado='oficial'),
     'oficiales_sin_at', count(*) filter (where estado='oficial' and oficializado_at is null),
     'oficiales_sin_por', count(*) filter (where estado='oficial' and oficializado_por is null),
     'no_oficiales_con_at', count(*) filter (where estado<>'oficial' and oficializado_at is not null),
     'por_estado', (select json_object_agg(e, n) from (select estado::text e, count(*) n from resultados group by 1) z)) from resultados),
 'r9_c4', (select json_build_object('resultado_id', re.id, 'estado', re.estado, 'oficializado_at', re.oficializado_at, 'oficializado_por', re.oficializado_por, 'created_at', re.created_at, 'updated_at', re.updated_at,
     'auditoria', (select json_agg(json_build_object('t', a.created_at, 'accion', a.accion, 'usuario', a.usuario_id, 'estado_antes', a.datos_antes->>'estado', 'estado_despues', a.datos_despues->>'estado', 'oficializado_at_despues', a.datos_despues->>'oficializado_at') order by a.created_at) from auditoria a where a.tabla='resultados' and a.registro_id=re.id))
   from resultados re join carreras ca on ca.id=re.carrera_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and ca.numero_carrera_programa=4)
) r;
```

```json
[{"r":{"por_reunion":[{"numero":6,"fecha":"2026-06-20","club":"DOL","es_prueba":false,"liq_cerrada":true,"oficiales":7,"oficiales_sin_at":7,"oficiales_sin_por":7,"oficiales_con_at":0},{"numero":8,"fecha":"2026-08-16","club":"DOL","es_prueba":false,"liq_cerrada":true,"oficiales":8,"oficiales_sin_at":8,"oficiales_sin_por":8,"oficiales_con_at":0},{"numero":9,"fecha":"2026-09-20","club":"DOL","es_prueba":false,"liq_cerrada":false,"oficiales":5,"oficiales_sin_at":5,"oficiales_sin_por":5,"oficiales_con_at":0},{"numero":9999,"fecha":"2099-01-01","club":"DOL","es_prueba":true,"liq_cerrada":false,"oficiales":3,"oficiales_sin_at":3,"oficiales_sin_por":3,"oficiales_con_at":0}],"totales":{"resultados":24,"oficiales":23,"oficiales_sin_at":23,"oficiales_sin_por":23,"no_oficiales_con_at":0,"por_estado":{"provisional":1,"oficial":23}},"r9_c4":{"resultado_id":"c37cb02f-b470-41e0-92c9-a723f2a7a07a","estado":"oficial","oficializado_at":null,"oficializado_por":null,"created_at":"2026-09-20T18:10:29.257089+00:00","updated_at":"2026-09-20T18:17:24.691932+00:00","auditoria":[{"t":"2026-09-20T18:10:29.257089+00:00","accion":"INSERT","usuario":"2ed1427f-ef06-4f56-9a9d-75bae08047f8","estado_antes":null,"estado_despues":"provisional","oficializado_at_despues":null},{"t":"2026-09-20T18:17:24.691932+00:00","accion":"UPDATE","usuario":"2ed1427f-ef06-4f56-9a9d-75bae08047f8","estado_antes":"provisional","estado_despues":"oficial","oficializado_at_despues":null}]}}}]
```

## A.4 ¿Se puede reconstruir desde la auditoría?

```sql
select r.numero, count(*) as oficiales,
 count(*) filter (where exists (select 1 from auditoria a where a.tabla='resultados' and a.registro_id=re.id and a.datos_despues->>'estado'='oficial' and coalesce(a.datos_antes->>'estado','')<>'oficial')) as con_audit_paso_a_oficial,
 count(*) filter (where exists (select 1 from auditoria a where a.tabla='resultados' and a.registro_id=re.id and a.datos_despues->>'estado'='oficial' and coalesce(a.datos_antes->>'estado','')<>'oficial' and a.usuario_id is not null)) as con_usuario,
 min(re.created_at) as primer_resultado, max(re.updated_at) as ultimo_update
from resultados re join carreras ca on ca.id=re.carrera_id join reuniones r on r.id=ca.reunion_id
where re.estado='oficial' group by r.numero order by r.numero;
```

```json
[{"numero":6,"oficiales":7,"con_audit_paso_a_oficial":7,"con_usuario":7,"primer_resultado":"2026-07-22 17:55:16.695316+00","ultimo_update":"2026-07-22 20:04:19.977644+00"},{"numero":8,"oficiales":8,"con_audit_paso_a_oficial":8,"con_usuario":8,"primer_resultado":"2026-08-16 17:00:32.508433+00","ultimo_update":"2026-08-23 11:06:06.970833+00"},{"numero":9,"oficiales":5,"con_audit_paso_a_oficial":5,"con_usuario":5,"primer_resultado":"2026-09-20 16:33:34.101495+00","ultimo_update":"2026-09-20 19:10:06.767175+00"},{"numero":9999,"oficiales":3,"con_audit_paso_a_oficial":3,"con_usuario":0,"primer_resultado":"2026-06-10 02:33:04.025416+00","ultimo_update":"2026-09-23 01:35:51.806929+00"}]
```

Nota: los resultados de R6 se cargaron el 22/07 (después de la carrera del 20/06). Por eso la ventana de retención de R6
cuenta desde el 22/07.

## Preguntas abiertas

1. ¿Corregir `aplicar_resultado` para adelante y backfillear los 20 desde la auditoría? (propuesta en el ISSUE; no se hizo nada).
2. ¿Mergeo el PR #33 (sólo `docs/ISSUES.md`)?
