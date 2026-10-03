#!/usr/bin/env python3
"""Revoke de anon en las 37 tablas/vistas de public que tenían privilegios para anon (medido en prod el 2026-10-03).
Genera, desde UNA lista:
  migrations/revoke_anon_tablas_publicas.sql            REVOKE ALL … FROM anon (37 objetos)
  migrations/rollback_revoke_anon_tablas_publicas.sql   devuelve a anon EXACTAMENTE lo que tenía (recibos sin DELETE)
  tests/local/revoke_anon_tablas_sandbox.sql            en el sandbox: crea como stub lo que falta y deja el ACL de anon como prod

  python3 tests/local/gen_revoke_anon_tablas.py

Consulta que dio la lista (prod, 03/10, antes del apply):
  select c.relname, c.relkind, c.relacl from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m') and has_table_privilege('anon', c.oid, 'SELECT');
Ninguna política de esas tablas alcanza a anon ni a PUBLIC (RLS: anon recibe 0 filas); ningún código de producción las
lee con filas sin sesión. Fase 1: docs/diagnosticos/2026-10-03_anon-tablas-fase1.md (reports).
"""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]

TABLAS = ['apoderados', 'auditoria', 'caballeriza_responsables', 'caballerizas', 'carrera_apuestas', 'carreras',
          'categorias_carrera', 'club_configuracion', 'club_secuencias', 'clubs', 'comision_config', 'hipodromos',
          'inscripciones', 'liquidacion_config', 'liquidacion_detalle', 'liquidaciones', 'novedades_reunion',
          'performances', 'profesionales', 'propietarios', 'recibos', 'resolucion_entidades', 'resoluciones',
          'resultado_apuestas', 'resultado_log', 'resultado_posiciones', 'resultados', 'reuniones', 'sanciones',
          'solicitudes_acceso', 'spc_entrenadores_hist', 'spc_propietarios', 'spcs', 'usuarios']
VISTAS = ['v_programa_reunion', 'v_sanciones_vigentes', 'v_spcs_activos']
SIN_DELETE = {'recibos'}          # en prod anon tenía arwDxtm (todo menos DELETE)
OBJ = TABLAS + VISTAS
assert len(OBJ) == 37

ENC = '-- GENERADO por tests/local/gen_revoke_anon_tablas.py — no editar a mano.\n'
mig = [ENC, """-- SEGURIDAD — anon sin privilegios en las 37 tablas/vistas de public que los tenían (34 tablas + 3 vistas).
-- Antes: anon = arwdDxtm (todo, TRUNCATE incluido, que no pasa por RLS; recibos sin DELETE). Ninguna política alcanza a
-- anon/PUBLIC: anon leía 0 filas. Único camino sin sesión: programa-oficial(-color).html abierto por URL directa sin
-- login (hoy muestra vacío; después, error de permiso). No toca authenticated, service_role ni sgh_lectura.
-- ESTADO EN PRODUCCIÓN: APLICADA 2026-10-03 (`20261003150157`) + complemento revoke_anon_v_inscriptos_resto.sql (`20261003150235`).
-- Verificado: anon 401/42501 en las 37 (antes 200 y 0 filas), sesión staff lee las 37, ACL de los demás roles = antes,
-- 0 objetos de public con privilegios para anon.
BEGIN;
"""]
for o in OBJ:
    mig.append(f'REVOKE ALL ON TABLE public.{o} FROM anon;\n')
mig.append('COMMIT;\n')

rb = [ENC, '-- ROLLBACK: devuelve a anon lo que tenía el 03/10 (ALL; recibos todo menos DELETE).\nBEGIN;\n']
for o in OBJ:
    rb.append(f'GRANT ALL ON TABLE public.{o} TO anon;\n')
    if o in SIN_DELETE:
        rb.append(f'REVOKE DELETE ON TABLE public.{o} FROM anon;\n')
rb.append('COMMIT;\n')

sb = [ENC, '-- Sandbox: stubs de lo que no existe en `sgh` + ACL de anon como prod (ALL; recibos sin DELETE).\n']
for t in TABLAS:
    sb.append(f"DO $$ BEGIN IF to_regclass('public.{t}') IS NULL THEN EXECUTE 'CREATE TABLE public.{t} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dato text)'; "
              f"EXECUTE 'ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY'; EXECUTE 'INSERT INTO public.{t}(dato) VALUES (''x'')'; END IF; END $$;\n")
for v in VISTAS:
    sb.append(f"DO $$ BEGIN IF to_regclass('public.{v}') IS NULL THEN EXECUTE 'CREATE VIEW public.{v} WITH (security_invoker = true) AS SELECT id FROM public.reuniones'; END IF; END $$;\n")
for o in OBJ:
    sb.append(f'GRANT ALL ON TABLE public.{o} TO anon, authenticated, service_role;\n')
    if o in SIN_DELETE:
        sb.append(f'REVOKE DELETE ON TABLE public.{o} FROM anon;\n')

(ROOT / 'migrations/revoke_anon_tablas_publicas.sql').write_text(''.join(mig), encoding='utf8')
(ROOT / 'migrations/rollback_revoke_anon_tablas_publicas.sql').write_text(''.join(rb), encoding='utf8')
(ROOT / 'tests/local/revoke_anon_tablas_sandbox.sql').write_text(''.join(sb), encoding='utf8')
print('ok: 37 objetos')
