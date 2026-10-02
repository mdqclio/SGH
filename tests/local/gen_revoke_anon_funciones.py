#!/usr/bin/env python3
"""ISSUE-099 — genera, desde UNA sola lista (las 31 funciones de public que anon podía ejecutar, medidas en prod
el 2026-10-02 con la consulta de abajo), los tres archivos del paquete:

  migrations/revoke_anon_funciones_publicas.sql            REVOKE + ALTER DEFAULT PRIVILEGES
  migrations/rollback_revoke_anon_funciones_publicas.sql   vuelve EXACTO al ACL medido (proacl) y al default anterior
  tests/local/revoke_anon_sandbox.sql                      reproduce en el sandbox las 31 firmas con el ACL y el
                                                           default de prod (las que faltan en `sgh` como stubs)

  python3 tests/local/gen_revoke_anon_funciones.py

Consulta que dio la lista (prod, 2026-10-02, antes del apply):
  select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_function_result(p.oid) ret, p.prosecdef,
         l.lanname, p.provolatile, p.proacl::text acl, md5(pg_get_functiondef(p.oid)) md5
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='public' and p.prokind='f' and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1;
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CON_PUBLIC = '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
SIN_PUBLIC = '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'

# (nombre, argumentos de identidad, tipo de retorno, ACL en prod, grupo)
#   A = queda para authenticated + service_role · B = sólo service_role (trigger o guard interno)
F = [
    ('calcular_premio', 'p_bolsa_total numeric, p_distribucion jsonb, p_puesto integer', 'numeric', CON_PUBLIC, 'A'),
    ('fn_autor_fila', '', 'trigger', CON_PUBLIC, 'B'),
    ('fn_club_de_caballeriza', 'p_caballeriza_id uuid', 'uuid', CON_PUBLIC, 'A'),
    ('fn_club_de_carrera', 'p_carrera_id uuid', 'uuid', CON_PUBLIC, 'A'),
    ('fn_club_de_inscripcion', 'p_inscripcion_id uuid', 'uuid', CON_PUBLIC, 'A'),
    ('fn_club_de_liquidacion', 'p_liquidacion_id uuid', 'uuid', CON_PUBLIC, 'A'),
    ('fn_club_de_resolucion', 'p_resolucion_id uuid', 'uuid', CON_PUBLIC, 'A'),
    ('fn_club_de_resultado', 'p_resultado_id uuid', 'uuid', CON_PUBLIC, 'A'),
    ('fn_club_de_reunion', 'p_reunion_id uuid', 'uuid', CON_PUBLIC, 'A'),
    ('fn_edad_reglamentaria', 'p_fecha_ref date, p_fecha_nac date', 'integer', SIN_PUBLIC, 'A'),
    ('fn_get_user_club_id', '', 'uuid', CON_PUBLIC, 'A'),
    ('fn_is_portal_user', '', 'boolean', CON_PUBLIC, 'A'),
    ('fn_is_staff', '', 'boolean', CON_PUBLIC, 'A'),
    ('fn_is_super_admin', '', 'boolean', CON_PUBLIC, 'A'),
    ('fn_mis_entidades', '', 'TABLE(entidad_tipo text, entidad_id uuid)', CON_PUBLIC, 'A'),
    ('fn_mis_spc_ids', '', 'TABLE(spc_id uuid)', CON_PUBLIC, 'A'),
    ('fn_mis_spc_visibles', '', 'TABLE(spc_id uuid)', CON_PUBLIC, 'A'),
    ('fn_proteger_rol_club_id_usuario', '', 'trigger', CON_PUBLIC, 'B'),
    ('fn_solicitudes_guard_staff', 'p_solicitud_id uuid', 'uuid', SIN_PUBLIC, 'B'),
    ('fn_usuarios_guard_privilegios', '', 'trigger', CON_PUBLIC, 'B'),
    ('fn_usuarios_set_auth_user_id', '', 'trigger', CON_PUBLIC, 'B'),
    ('rpc_aprobar_solicitud', 'p_solicitud_id uuid, p_entidad_tipo text, p_entidad_id uuid, p_copiar_documento boolean', 'uuid', SIN_PUBLIC, 'A'),
    ('rpc_descartar_solicitud', 'p_solicitud_id uuid', 'void', SIN_PUBLIC, 'A'),
    ('rpc_inscribir', 'p_spc_id uuid, p_carrera_id uuid, p_caballeriza_id uuid, p_entrenador_id uuid, p_jockey_titular_id uuid, p_jockey_suplente_id uuid', 'uuid', SIN_PUBLIC, 'A'),
    ('rpc_padron_profesionales', '', 'TABLE(id uuid, nombre text, apellido text, matricula_nro text, tipo text)', SIN_PUBLIC, 'A'),
    ('rpc_padron_spcs', '', 'TABLE(id uuid, nombre text, sexo text, fecha_nacimiento date, color text, studbook_id text, padrillo_nombre text, madre_nombre text, estado text, habilitado boolean)', CON_PUBLIC, 'A'),
    ('rpc_rechazar_solicitud', 'p_solicitud_id uuid, p_motivo text', 'void', SIN_PUBLIC, 'A'),
    ('rpc_solicitar_acceso', 'p_nombre text, p_apellido text, p_documento_nro text, p_telefono text, p_rol_pedido text, p_club_id uuid, p_documento_tipo text, p_email text, p_origen_hipodromo text, p_origen_patente_nro text, p_origen_caballeriza text', 'uuid', SIN_PUBLIC, 'A'),
    ('set_updated_at', '', 'trigger', CON_PUBLIC, 'B'),
    ('siguiente_numero_publico', 'p_club_id uuid, p_fecha date', 'integer', CON_PUBLIC, 'A'),
    ('validar_inscripcion', 'p_spc_id uuid, p_carrera_id uuid', 'TABLE(puede_inscribirse boolean, motivo text)', CON_PUBLIC, 'A'),
]
assert len(F) == 31 and sum(g == 'A' for *_, g in F) == 25 and sum(g == 'B' for *_, g in F) == 6


def tipos(args):
    """'p_a uuid, p_b text' → 'uuid, text' (la firma de REVOKE/GRANT acepta nombres, pero así es más corta)."""
    return ', '.join(a.strip().split(' ', 1)[1] for a in args.split(',')) if args else ''


def firma(n, a):
    return f'public.{n}({tipos(a)})'


def grants_de_acl(acl):
    """'{=X/postgres,postgres=X/postgres,anon=X/postgres,…}' → ['PUBLIC','anon',…] (sin el dueño)."""
    out = []
    for e in acl.strip('{}').split(','):
        quien = e.split('=')[0]
        if quien == 'postgres':
            continue
        out.append('PUBLIC' if quien == '' else quien)
    return out


ENC = """-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- GENERADO por tests/local/gen_revoke_anon_funciones.py — no editar a mano: cambiar la lista y regenerar.
"""

mig = [ENC, """-- SEGURIDAD ISSUE-099 — las 31 funciones de `public` que `anon` podía ejecutar + ALTER DEFAULT PRIVILEGES
--
-- Fase 1 (relevamiento, sólo lectura): docs/diagnosticos/2026-10-02_issue-099-funciones-anon-y-v-inscriptos-fase1.md (reports).
-- Llamadas legítimas como anon: 0 (código, políticas, Edge Functions, pg_stat_statements).
--
--   A) 25 → REVOKE de PUBLIC y anon; GRANT explícito a authenticated y service_role (no dependen de PUBLIC).
--   B)  6 → sólo service_role (+ dueño): fn_solicitudes_guard_staff (la llaman 3 RPC definer, como dueño) y los 5
--       de trigger. Postgres chequea EXECUTE de la función de trigger al CREAR el trigger, no al dispararlo
--       (probado en el sandbox: tests/probe_revoke_anon_funciones.mjs, caso T).
--   C) para que no se repita:
--      C1  default de esquema (postgres, public): sin anon  → las funciones nuevas nacen sin EXECUTE para anon.
--      C2  default GLOBAL de postgres: sin PUBLIC          → y sin EXECUTE para PUBLIC (el default de Postgres
--          lo da a PUBLIC en TODO esquema; no se puede quitar con IN SCHEMA). authenticated y service_role lo
--          siguen recibiendo por el default de esquema.
--      No toca los defaults de supabase_admin (los administra la plataforma) ni los de tablas/secuencias.
--
-- No cambia ningún pg_get_functiondef (un GRANT/REVOKE no toca la definición): el probe compara el md5 de las 31
-- antes y después. Rollback: migrations/rollback_revoke_anon_funciones_publicas.sql (ACL exacto anterior).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- A) 25 → authenticated + service_role
"""]
for n, a, r, acl, g in F:
    if g == 'A':
        mig.append(f'REVOKE EXECUTE ON FUNCTION {firma(n, a)} FROM PUBLIC, anon;\n')
        mig.append(f'GRANT  EXECUTE ON FUNCTION {firma(n, a)} TO authenticated, service_role;\n')
mig.append('\n-- B) 6 → sólo service_role (+ dueño)\n')
for n, a, r, acl, g in F:
    if g == 'B':
        mig.append(f'REVOKE EXECUTE ON FUNCTION {firma(n, a)} FROM PUBLIC, anon, authenticated;\n')
        mig.append(f'GRANT  EXECUTE ON FUNCTION {firma(n, a)} TO service_role;\n')
mig.append("""
-- C) default privileges de postgres
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;   -- C1
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;                  -- C2

COMMIT;
""")

rb = [ENC, """-- ROLLBACK de revoke_anon_funciones_publicas.sql — deja el ACL de cada una de las 31 EXACTO como estaba en prod
-- el 2026-10-02 (proacl medido) y los default privileges de postgres como antes (sin entrada global; la de
-- esquema con anon). Verificar después: proacl de las 31 = el de la lista del generador COMO CONJUNTO (el GRANT
-- puede dejar las entradas en otro orden: `{postgres=X/postgres,=X/postgres,…}` es el mismo permiso).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;
"""]
for n, a, r, acl, g in F:
    rb.append(f'REVOKE ALL ON FUNCTION {firma(n, a)} FROM PUBLIC, anon, authenticated, service_role;\n')
    rb.append(f'GRANT EXECUTE ON FUNCTION {firma(n, a)} TO {", ".join(grants_de_acl(acl))};   -- {acl}\n')
rb.append("""
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;   -- borra la entrada global (vuelve al default de Postgres)

COMMIT;
""")

sb = [ENC, """-- Sandbox de ISSUE-099: sobre una COPIA de la base `sgh` (el probe la crea: sgh_anon_run), deja las 31 firmas con
-- el ACL de prod y el default de prod. Las que no existen en `sgh` se crean como STUB con la firma exacta (el
-- paquete sólo cambia permisos: el cuerpo no importa para lo que se prueba). Las de trigger que sí están montadas
-- en `sgh` (set_updated_at en inscripciones, fn_autor_fila en sanciones, las dos de usuarios) conservan su cuerpo.
SET check_function_bodies = off;
"""]
for n, a, r, acl, g in F:
    if r == 'trigger':
        cuerpo = "LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$"
    elif r.startswith('TABLE') or r == 'void':
        cuerpo = "LANGUAGE sql AS $$ SELECT NULL::text WHERE false $$" if r != 'void' else "LANGUAGE sql AS $$ SELECT $$"
    else:
        cuerpo = f"LANGUAGE sql AS $$ SELECT NULL::{r} $$"
    if r.startswith('TABLE'):
        cols = r[6:-1]
        nulls = ', '.join(f'NULL::{c.strip().split(" ", 1)[1]}' for c in cols.split(','))
        cuerpo = f"LANGUAGE sql AS $$ SELECT {nulls} WHERE false $$"
    sb.append(f"""DO $do$ BEGIN
  IF to_regprocedure('{firma(n, a)}') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION {firma(n, a).replace(tipos(a), a) if a else firma(n, a)} RETURNS {r} {cuerpo}$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION {firma(n, a)} FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION {firma(n, a)} TO {", ".join(grants_de_acl(acl))};
""")
sb.append("""
-- default de prod para funciones de postgres en public (y sin entrada global)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
""")

(ROOT / 'migrations/revoke_anon_funciones_publicas.sql').write_text(''.join(mig), encoding='utf8')
(ROOT / 'migrations/rollback_revoke_anon_funciones_publicas.sql').write_text(''.join(rb), encoding='utf8')
(ROOT / 'tests/local/revoke_anon_sandbox.sql').write_text(''.join(sb), encoding='utf8')
print('ok: 3 archivos generados (31 funciones: 25 A + 6 B)')
