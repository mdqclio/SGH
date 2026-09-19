# Pozo de ratificación — Fase 1 (cobro) · Pieza 1: schema — PLAN, pendiente de OK

- **Fecha:** 2026-09-19
- **Decisión que lo habilita (Leonardo, 19/09):** opción **B, circuito aparte**. Dos recibos (premio y pozo; Valeria lo prefiere). El pozo se paga **en el momento**, después de la carrera: **no** va con el premio, **no** queda retenido por anti-doping. Se cobra **antes de correr**. El que no paga no corre y no puede ganar; el sistema **avisa igual, no bloquea** (decisión de Fede — no consistencia con el gate de montas, que bloquea).
- **Rama de trabajo:** `feat/pozo-ratificacion-fase1-cobro` (desde `main` `ef78472`) · commit **`943e398`** · pusheada (ver §5).
- **Archivos:** `migrations/pozo_fase1_cobro.sql` (NO APLICADA) · `migrations/rollback_pozo_fase1_cobro.sql`.
- **Guards:** `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref `unlhcuanfrtpatoipwve`.
- **Estado:** nada aplicado en DB. Se aplica por MCP `apply_migration` sólo con OK explícito.

---

## 1. Qué hace la migración (resumen; el detalle y el "por qué circuito aparte" están en la cabecera del `.sql`)

| # | Objeto | Detalle |
|---|---|---|
| 1 | `carreras.pozo_monto_caballo NUMERIC(15,2) NULL` | + `CHECK (IS NULL OR >= 0)` + COMMENT. NULL/0 = sin pozo. |
| 2 | `reuniones.pozo_retencion_pct NUMERIC(6,3) NULL` | + `CHECK (IS NULL OR BETWEEN 0 AND 100)` + COMMENT. NULL = sin cargar → la vista devuelve retención NULL, **no asume 20**. |
| 3 | `TYPE estado_pozo_cobro` | `cobrado / devuelto / anulado`. |
| 4 | `TABLE pozo_cobros` | Una fila por inscripción cobrada. `monto` snapshot (`CHECK > 0`). `numero_recibo` serie propia, `UNIQUE (club_id, numero_recibo)`. Sellos de devolución y anulación con `CHECK chk_pozo_cobro_estado` (los sellos sólo en su estado, motivo obligatorio). `foto_anulacion jsonb`. Índice parcial `uq_pozo_cobro_vivo (inscripcion_id) WHERE estado='cobrado'` → **un solo cobro vivo por inscripción**, devueltos/anulados repetibles. Índices por carrera, reunión, inscripción. |
| 5 | RLS + privilegios | `pozo_cobros_select` (super_admin, o staff del club — `fn_is_staff()` + `club_id`). **Sin** policy de INSERT/UPDATE/DELETE **y** `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER FROM authenticated, anon`; `REVOKE ALL FROM anon`. Escritura sólo por RPC SECURITY DEFINER (pieza 2). Dos capas a propósito (`revocar_recibos_delete.sql`, GOTCHA #86): sin REVOKE el rechazo sería silencioso. |
| 6 | `trg_audit_pozo_cobros` | → `fn_auditoria_log()` (toma `club_id` de la fila; igual que `recibos`). |
| 7 | `fn_siguiente_numero(p_club_id, p_tipo)` | Serie genérica por club sobre `club_secuencias` (PK `(club_id, tipo)` ya existente). `REVOKE ALL FROM PUBLIC, anon, authenticated`: sólo la llaman los RPC definer. **`fn_siguiente_recibo(p_club_id)` pasa a ser wrapper** (`RETURN fn_siguiente_numero(p_club_id,'recibo')`): misma firma, mismo retorno, mismos grants → `emitir_recibo` no se toca. Serie nueva: `'recibo_cobro'`. |
| 8 | `VIEW v_pozo_carrera` | Todas las carreras con su reunión: `tiene_pozo`, `n_ratificados`, `n_cobrados/devueltos/anulados`, `esperado`, `cobrado_bruto`, `devuelto`, `retencion`, `al_ganador` (NULL si pct NULL). `security_invoker = true`. `GRANT SELECT TO authenticated`. Única definición de la fórmula. |

Diferencias respecto del plan del §3.1/§5.2 (mejoras al bajarlo a SQL):
- `CHECK chk_pozo_cobro_estado`: en el plan los sellos eran columnas sueltas; acá la DB garantiza que un `devuelto` tiene `devuelto_at` + motivo y un `anulado` tiene `anulado_at` + motivo, y que nunca hay los dos.
- `fn_siguiente_numero` sin grant a `authenticated`: en el plan no estaba dicho; sin esto, cualquier usuario podría consumir números de la serie por PostgREST (`rpc/fn_siguiente_numero`). `fn_siguiente_recibo` conserva sus grants actuales (no se cambian; hoy `emitir_recibo` la llama como definer).
- La vista trae **todas** las carreras (también anuladas y sin pozo) con `tiene_pozo` y `carrera_estado`, para que `pozo.html` colapse en vez de hacer dos queries. Filtro NULL-safe del lado del cliente (gotcha #5).
- La vista NO expone al portal: `pozo_cobros_select` es sólo staff. Si en Fase 2 el propietario tiene que ver su recibo de cobro, se agrega policy con `fn_mis_entidades()` como `recibos_select`.

## 2. Qué NO hace
- No toca `liquidacion_detalle`, `liquidaciones`, `recibos`, `emitir_recibo`, `anular_recibo`, `liquidaciones-engine.js`.
- No crea los RPC `cobrar_pozo` / `devolver_pozo` / `anular_cobro_pozo` (pieza 2). Hasta entonces `pozo_cobros` es de sólo lectura para la app y queda vacía.
- No cambia UI.

## 3. Riesgos revisados
| Riesgo | Mitigación |
|---|---|
| `CREATE OR REPLACE FUNCTION fn_siguiente_recibo` rompe `emitir_recibo` | Misma firma `(uuid) RETURNS integer`, mismo `SECURITY DEFINER`, mismo comportamiento (`INSERT … ON CONFLICT … +1`). Verificación post-apply: `tests/probe_recibos_emision.mjs` y `probe_cobros_v11.mjs` sobre la sandbox 9999 tienen que seguir 14/14 (§4). |
| `REVOKE … FROM authenticated` en tabla nueva | Sólo afecta `pozo_cobros`. Verificable: `INSERT` por PostgREST con sesión staff → **42501** (no 204 con 0 filas). |
| `ADD COLUMN` sobre `carreras` / `reuniones` | Nullable, sin default → sin rewrite, sin lock largo. `carta-llamados.html` y `reuniones.html` hacen `.select('*')` en algunos lugares: una columna nueva NULL no rompe nada (sólo se ignora hasta la pieza 3). |
| Vista con subqueries correlacionadas | Para la escala de Dolores (≤ 11 carreras × ≤ 16 inscripciones) es irrelevante. Si molesta, se reescribe con `LEFT JOIN LATERAL` sin cambiar columnas. |
| `fn_auditoria_log` toma `club_id` de la fila (`to_jsonb(NEW)->>'club_id'`) | `pozo_cobros.club_id NOT NULL` → la auditoría siempre tiene club. |
| R9 mañana | Nada de esto se aplica antes de R9. Si el OK llega hoy, se aplica igual **después** de R9 (lunes 21/09) — cero riesgo de tocar la base el sábado con el programa en imprenta. |

## 4. Verificación post-apply (se hace cuando esté aplicada; va al informe de la pieza)
1. Schema: columnas, constraints, índices, policy, grants (`information_schema.role_table_grants` para `pozo_cobros`: `authenticated` sólo `SELECT`; `anon` nada), trigger, vista con `security_invoker`.
2. `tests/probe_recibos_emision.mjs` + `tests/probe_cobros_v11.mjs` (regresión de `fn_siguiente_recibo` como wrapper) → 14/14 y 100 %.
3. Nuevo `tests/probe_pozo_schema.mjs` (se escribe en la pieza 1, corre después del apply):
   - `SELECT` de `v_pozo_carrera` para R9 → 11 filas, `tiene_pozo=false` en todas, `esperado=0`, `retencion IS NULL`.
   - Con sesión **staff Dolores**: `INSERT INTO pozo_cobros` por PostgREST → error `42501` (capa REVOKE, ruidosa). `SELECT` → 0 filas sin error.
   - Con sesión **portal** (propietario de prueba, patrón `probe_rpc_spcs_duplicados.mjs`): `SELECT pozo_cobros` → 0 filas (policy), `SELECT v_pozo_carrera` → 0 filas (security_invoker sobre `carreras`… ver nota).
   - `rpc/fn_siguiente_numero` con sesión staff → **42501** (sin grant). `fn_siguiente_recibo` sigue accesible como hoy.
   - Serie separada: sobre el club de prueba **Mi Club Hípico** (`a6da7e40…`, no Dolores, para no quemar el C-0001 real) llamar `fn_siguiente_numero(mch,'recibo_cobro')` **por MCP** dos veces → 1, 2; `club_secuencias (mch,'recibo')` sigue en 19. Teardown: `DELETE FROM club_secuencias WHERE club_id=mch AND tipo='recibo_cobro'`; assert por estado.
   - Nota: la vista con `security_invoker` hereda la RLS de `carreras`/`reuniones`/`inscripciones`; un usuario portal hoy **sí** lee carreras (el portal las necesita para inscribir), así que vería `esperado`/`n_ratificados` pero `n_cobrados`/`cobrado_bruto` en 0 (la subquery sobre `pozo_cobros` le devuelve nada). Aceptable en Fase 1 (no hay pantalla portal); se anota en GOTCHAS para que nadie asuma que la vista es privada.
4. `get_advisors` (security) después del apply: sin hallazgo nuevo sobre `pozo_cobros` / `v_pozo_carrera`.

## 5. Publicación

```
$ git push -u origin feat/pozo-ratificacion-fase1-cobro
$ git ls-remote origin feat/pozo-ratificacion-fase1-cobro
943e398076bb081e7e0af2711bfde2764ade6d89	refs/heads/feat/pozo-ratificacion-fase1-cobro
$ git rev-parse HEAD   (en la rama feat)
943e398076bb081e7e0af2711bfde2764ade6d89
```

Archivos para leer: `https://raw.githubusercontent.com/mdqclio/SGH/feat/pozo-ratificacion-fase1-cobro/migrations/pozo_fase1_cobro.sql` y `…/migrations/rollback_pozo_fase1_cobro.sql`.

## 6. Qué sigue, con OK
1. Aplicar `pozo_fase1_cobro.sql` por MCP `apply_migration` (lunes 21/09 o después, no antes de R9).
2. Verificación §4 → informe `2026-09-2X_pozo-fase1-pieza1-schema_APLICADA.md` en `reports`.
3. Pieza 2: RPCs `cobrar_pozo` / `devolver_pozo` / `anular_cobro_pozo` — plan por pieza, OK antes de aplicar.

(se completa abajo con `git ls-remote` de `reports`)

```
$ git ls-remote origin reports
5639b0c37453912427a6ea2a790dd491399cbb4b	refs/heads/reports
$ git rev-parse HEAD
5639b0c37453912427a6ea2a790dd491399cbb4b
```
