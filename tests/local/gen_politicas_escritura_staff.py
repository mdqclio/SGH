#!/usr/bin/env python3
"""
Generador de ISSUE-093 — políticas de escritura de 14 tablas con guard de staff.

    python3 tests/local/gen_politicas_escritura_staff.py

Escribe:
  migrations/politicas_escritura_staff_14.sql           la migración (36 políticas)
  migrations/rollback_politicas_escritura_staff_14.sql  las 36 políticas EXACTAS de prod al 2026-09-27
  tests/local/politicas_escritura_sandbox.sql           réplica para el sandbox (tablas que faltan + SELECT + las 36 de hoy)

Por qué un generador y no texto a mano: GOTCHA #99 (apply_migration aplica el texto que se le pasa;
transcribir 36 políticas a mano es la forma segura de perder una). La especificación de abajo
(tabla → predicado de club) se verificó contra prod: el md5 de coalesce(USING,'')||'|'||coalesce(WITH CHECK,'')
de cada política de hoy coincide 36/36 con lo que genera este script (MD5_HOY). Si alguna vez no coincide,
el script se niega a escribir.

La forma del cambio es una sola:
  hoy:   (fn_is_super_admin() OR <PRED_CLUB>)
  nuevo: (fn_is_super_admin() OR (fn_is_staff() AND <PRED_CLUB>))
"""
import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
GC = "( SELECT fn_get_user_club_id() AS fn_get_user_club_id)"
SA = "( SELECT fn_is_super_admin() AS fn_is_super_admin)"
ST = "( SELECT fn_is_staff() AS fn_is_staff)"
PRED = {
    'caballeriza_responsables': f"(fn_club_de_caballeriza(caballeriza_id) = {GC})",
    'carrera_apuestas':         f"(fn_club_de_carrera(carrera_id) = {GC})",
    'categorias_carrera':       f"(club_id = {GC})",
    'club_configuracion':       f"(club_id = {GC})",
    'club_secuencias':          f"(club_id = {GC})",
    'clubs':                    f"(id = {GC})",
    'comision_config':          f"(club_id = {GC})",
    'hipodromos':               f"(club_id = {GC})",
    'liquidacion_config':       f"(club_id = {GC})",
    'novedades_reunion':        f"(fn_club_de_reunion(reunion_id) = {GC})",
    'resolucion_entidades':     f"(fn_club_de_resolucion(resolucion_id) = {GC})",
    'resoluciones':             f"(club_id = {GC})",
    'resultado_apuestas':       f"(fn_club_de_resultado(resultado_id) = {GC})",
    'resultado_log':            f"(fn_club_de_resultado(resultado_id) = {GC})",
}
# md5(coalesce(USING,'')||'|'||coalesce(WITH CHECK,'')) medido en prod el 2026-09-27 (informe ISSUE-093).
MD5_HOY = """
caballeriza_responsables.caballeriza_responsables_delete bbaf90f4f051fac5487616aed3f68c39
caballeriza_responsables.caballeriza_responsables_insert 826e737cf3837de0a8a8c85da5fa7c9b
caballeriza_responsables.caballeriza_responsables_update 203cb19e6282631546cc68c2feaae46c
carrera_apuestas.carrera_apuestas_delete bba38ee97efe7872df748faff36f6a53
carrera_apuestas.carrera_apuestas_insert d25f70117c7826fd5ca07c3f2b80b128
carrera_apuestas.carrera_apuestas_update 6e7800ce42733a89a14b004d6cb7c3e4
categorias_carrera.categorias_carrera_delete bd6203cb2a293196a30603f45ccf2556
categorias_carrera.categorias_carrera_insert ee075422773f3bdc4c1f562ef17c72ef
categorias_carrera.categorias_carrera_update d61391593f16b3c8c5855054f6e496b6
club_configuracion.club_configuracion_delete bd6203cb2a293196a30603f45ccf2556
club_configuracion.club_configuracion_insert ee075422773f3bdc4c1f562ef17c72ef
club_configuracion.club_configuracion_update d61391593f16b3c8c5855054f6e496b6
club_secuencias.club_secuencias_rls d61391593f16b3c8c5855054f6e496b6
clubs.clubs_update_self_or_admin 69603469b1724394789d8b395b5ab282
comision_config.comision_config_delete bd6203cb2a293196a30603f45ccf2556
comision_config.comision_config_insert ee075422773f3bdc4c1f562ef17c72ef
comision_config.comision_config_update d61391593f16b3c8c5855054f6e496b6
hipodromos.hipodromos_delete bd6203cb2a293196a30603f45ccf2556
hipodromos.hipodromos_insert ee075422773f3bdc4c1f562ef17c72ef
hipodromos.hipodromos_update d61391593f16b3c8c5855054f6e496b6
liquidacion_config.liquidacion_config_rls d61391593f16b3c8c5855054f6e496b6
novedades_reunion.novedades_reunion_delete 33e6746da67b32a954a81cda799742d2
novedades_reunion.novedades_reunion_insert 09b8d009e85900b82c2ad10fd5cda689
novedades_reunion.novedades_reunion_update c475109d35c86c71de624a5500edaf36
resolucion_entidades.resolucion_entidades_delete 7a26cdc2729437155a2514805fb17748
resolucion_entidades.resolucion_entidades_insert fd9b2e285b8eff20aeb424f9e5915bce
resolucion_entidades.resolucion_entidades_update 59647cea359f5f03e51bc7b498d5cb34
resoluciones.resoluciones_delete bd6203cb2a293196a30603f45ccf2556
resoluciones.resoluciones_insert ee075422773f3bdc4c1f562ef17c72ef
resoluciones.resoluciones_update d61391593f16b3c8c5855054f6e496b6
resultado_apuestas.resultado_apuestas_delete 8b4f3f4d2c526e37982ccbd25a7657f2
resultado_apuestas.resultado_apuestas_insert 405649d46a6a8446dd16a786841fe4f3
resultado_apuestas.resultado_apuestas_update 318d5c57650d2c4d64f86014e70d3229
resultado_log.resultado_log_delete 8b4f3f4d2c526e37982ccbd25a7657f2
resultado_log.resultado_log_insert 405649d46a6a8446dd16a786841fe4f3
resultado_log.resultado_log_update 318d5c57650d2c4d64f86014e70d3229
""".split()

POL = []
for t in PRED:
    if t in ('club_secuencias', 'liquidacion_config'):
        POL.append((t, t + '_rls', 'ALL'))
    elif t == 'clubs':
        POL.append((t, 'clubs_update_self_or_admin', 'UPDATE'))
    else:
        POL += [(t, t + '_delete', 'DELETE'), (t, t + '_insert', 'INSERT'), (t, t + '_update', 'UPDATE')]
POL.sort(key=lambda x: (x[0], x[1]))


def expr(t, staff):
    return f"({SA} OR {'(' + ST + ' AND ' + PRED[t] + ')' if staff else PRED[t]})"


def using_check(t, cmd, staff):
    e = expr(t, staff)
    return (e if cmd in ('DELETE', 'UPDATE', 'ALL') else None,
            e if cmd in ('INSERT', 'UPDATE', 'ALL') else None)


def block(t, p, cmd, staff, if_exists=False):
    q, w = using_check(t, cmd, staff)
    s = (f"DROP POLICY {'IF EXISTS ' if if_exists else ''}{p} ON public.{t};\n"
         f"CREATE POLICY {p} ON public.{t} AS PERMISSIVE FOR {cmd} TO authenticated")
    if q:
        s += f"\n  USING ({q})"
    if w:
        s += f"\n  WITH CHECK ({w})"
    return s + ";"


# ── verificación contra prod ─────────────────────────────────────────────────────────────────
gen = []
for t, p, cmd in POL:
    q, w = using_check(t, cmd, False)
    gen += [f"{t}.{p}", hashlib.md5(((q or '') + '|' + (w or '')).encode()).hexdigest()]
if gen != MD5_HOY:
    sys.exit('El generador NO reproduce las políticas de prod (md5 distinto): no escribo nada.')

TABLAS = ', '.join(sorted(PRED))
FWD = f"""-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ISSUE-093 — las políticas de ESCRITURA de 14 tablas exigen fn_is_staff() en la rama de club.
--
-- ESTADO EN PRODUCCIÓN: **APLICADA el 2026-09-27** (`20260927202948 politicas_escritura_staff_14`).
-- md5 de las 36 expresiones en prod = tests/local/politicas_escritura_md5_esperado.txt (36/36).
-- Probe --prod 281/281. Este bloque de ESTADO se agregó DESPUÉS de aplicar: las sentencias son
-- idénticas a las aplicadas (sólo cambian estos comentarios).
--
-- Hasta hoy la rama no-super_admin era sólo "el club de la fila = fn_get_user_club_id()", y
-- fn_get_user_club_id() devuelve el club de CUALQUIER usuario activo: un profesional o propietario
-- del portal (club Dolores) podía, por la API directa, escribir en liquidacion_config,
-- club_secuencias, clubs, comision_config, resultado_apuestas, etc.
-- Informe: docs/diagnosticos/2026-09-27_issue093-politicas-escritura-portal.md (reports).
--
-- Tablas: {TABLAS}.
-- 36 políticas (INSERT/UPDATE/DELETE, y las dos FOR ALL `_rls`). SELECT no se toca, salvo que las
-- dos FOR ALL (liquidacion_config_rls, club_secuencias_rls) también cubren SELECT: el portal deja de
-- leer esas dos tablas (no las usa).
--
-- No afecta: aplicar_resultado, fn_siguiente_recibo, rpc_caballeriza_provisorio (SECURITY DEFINER,
-- dueño postgres, RLS no forzada), service_role (probes, Edge Functions), migraciones.
--
-- GENERADO por tests/local/gen_politicas_escritura_staff.py — no editar a mano.
-- Rollback: migrations/rollback_politicas_escritura_staff_14.sql (políticas exactas de hoy, 36/36 md5).
-- Probe: tests/probe_politicas_escritura_staff.mjs (sandbox: réplica tests/local/politicas_escritura_sandbox.sql).
-- md5 esperado de cada expresión DESPUÉS de aplicar: medido en el sandbox, ver
-- tests/local/politicas_escritura_md5_esperado.txt.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

""" + "\n\n".join(block(t, p, c, True) for t, p, c in POL) + "\n\nCOMMIT;\n"

RB = f"""-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/politicas_escritura_staff_14.sql (ISSUE-093).
-- Restaura las 36 políticas de escritura EXACTAS de prod al 2026-09-27: el md5 de
-- coalesce(USING,'')||'|'||coalesce(WITH CHECK,'') de cada una coincide 36/36 con el medido en prod
-- (lista en tests/local/gen_politicas_escritura_staff.py, MD5_HOY).
-- ⚠️ Reabre el agujero: el portal vuelve a poder escribir en las 14 tablas.
-- GENERADO por tests/local/gen_politicas_escritura_staff.py — no editar a mano.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

""" + "\n\n".join(block(t, p, c, False) for t, p, c in POL) + "\n\nCOMMIT;\n"

# ── réplica del sandbox ─────────────────────────────────────────────────────────────────────────
DDL = """
CREATE TABLE IF NOT EXISTS caballerizas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL, nombre varchar NOT NULL,
  responsable varchar, domicilio varchar, telefono varchar, activo boolean NOT NULL DEFAULT true, notas text, estado varchar DEFAULT 'activo',
  chaquetilla_descripcion varchar, chaquetilla_url varchar, hipodromo_patente varchar);
CREATE TABLE IF NOT EXISTS caballeriza_responsables (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), caballeriza_id uuid NOT NULL, profesional_id uuid,
  apellido varchar, nombre varchar, documento_tipo varchar DEFAULT 'DNI', documento_nro varchar, fecha_nacimiento date, localidad varchar,
  rol varchar DEFAULT 'propietario', porcentaje numeric, activo boolean DEFAULT true, created_at timestamp DEFAULT now(), propietario_id uuid);
CREATE TABLE IF NOT EXISTS carrera_apuestas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carrera_id uuid NOT NULL, tipo varchar NOT NULL,
  precio numeric NOT NULL CHECK (precio > 0), nombre text, asegurado numeric, incremento numeric, orden smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), UNIQUE (carrera_id, tipo));
CREATE TABLE IF NOT EXISTS categorias_carrera (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL, nombre varchar NOT NULL,
  codigo varchar NOT NULL, descripcion text, es_computable boolean NOT NULL DEFAULT true, es_oficial boolean NOT NULL DEFAULT true, simbolo varchar,
  color_hex varchar, orden_display integer NOT NULL DEFAULT 0, activo boolean NOT NULL DEFAULT true, UNIQUE (club_id, codigo));
CREATE TABLE IF NOT EXISTS club_configuracion (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL, clave varchar NOT NULL,
  valor text, descripcion text, UNIQUE (club_id, clave));
CREATE TABLE IF NOT EXISTS hipodromos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL, nombre varchar NOT NULL,
  sigla varchar NOT NULL, localidad varchar, provincia varchar, tipo_pista varchar, activo boolean NOT NULL DEFAULT true,
  cantidad_gateras integer DEFAULT 12, UNIQUE (club_id, sigla));
CREATE TABLE IF NOT EXISTS novedades_reunion (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reunion_id uuid NOT NULL, carrera_id uuid, spc_id uuid,
  tipo_novedad varchar NOT NULL, descripcion text, hora_novedad timestamptz NOT NULL DEFAULT now(), visibilidad varchar NOT NULL DEFAULT 'interna',
  creado_por uuid);
CREATE TABLE IF NOT EXISTS resoluciones (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL, reunion_id uuid, numero varchar NOT NULL,
  fecha date NOT NULL, tipo varchar NOT NULL, texto text, documento_url text, estado varchar NOT NULL DEFAULT 'borrador', creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (club_id, numero));
CREATE TABLE IF NOT EXISTS resolucion_entidades (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resolucion_id uuid NOT NULL, entidad_tipo varchar NOT NULL,
  entidad_id uuid NOT NULL, descripcion text);
CREATE TABLE IF NOT EXISTS resultado_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resultado_id uuid NOT NULL, usuario_id uuid, accion text NOT NULL,
  datos_antes jsonb, datos_despues jsonb, created_at timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE FUNCTION public.fn_club_de_caballeriza(p_caballeriza_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT club_id FROM caballerizas WHERE id = p_caballeriza_id LIMIT 1; $function$;
CREATE OR REPLACE FUNCTION public.fn_club_de_resolucion(p_resolucion_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT club_id FROM resoluciones WHERE id = p_resolucion_id LIMIT 1; $function$;
CREATE OR REPLACE FUNCTION public.fn_club_de_resultado(p_resultado_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT fn_club_de_carrera(carrera_id) FROM resultados WHERE id = p_resultado_id LIMIT 1; $function$;

-- "otro club" para los perfiles de control (en prod existe: Mi Club Hípico)
INSERT INTO clubs (id, nombre, sigla) VALUES ('a6da7e40-1515-45dc-8933-4eef33ce937a', 'Mi Club Hípico', 'MCH') ON CONFLICT DO NOTHING;
"""


def select_pol(t):
    return (f"DROP POLICY IF EXISTS {t}_select ON public.{t};\n"
            f"CREATE POLICY {t}_select ON public.{t} AS PERMISSIVE FOR SELECT TO authenticated\n  USING ({expr(t, False)});")


SBX = f"""-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SÓLO SANDBOX (tests/local) — NUNCA APLICAR EN PROD.
-- Réplica de las 14 tablas de ISSUE-093 como están en prod el 2026-09-27, ANTES de
-- migrations/politicas_escritura_staff_14.sql: crea las que el clon de la 9999 no trae (columnas de
-- prod, sin FKs), las funciones fn_club_de_* que faltan, habilita RLS, crea las políticas de SELECT
-- (la de clubs se llama clubs_select también en prod; en las demás el nombre es el mismo patrón) y
-- las 36 de escritura de hoy.
--   tests/local/up.sh sql < tests/local/politicas_escritura_sandbox.sql
-- Para volver el sandbox a su estado de antes: tests/local/up.sh (recarga todo).
-- GENERADO por tests/local/gen_politicas_escritura_staff.py — no editar a mano.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
{DDL}
""" + "\n".join(f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;" for t in sorted(PRED)) + "\n" + \
    "\n".join(f"GRANT SELECT, INSERT, UPDATE, DELETE ON public.{t} TO authenticated, anon;" for t in sorted(PRED)) + "\n\n" + \
    "\n\n".join(select_pol(t) for t in sorted(PRED) if t not in ('club_secuencias', 'liquidacion_config')) + "\n\n" + \
    "\n\n".join(block(t, p, c, False, if_exists=True) for t, p, c in POL) + "\n"

(ROOT / 'migrations/politicas_escritura_staff_14.sql').write_text(FWD)
(ROOT / 'migrations/rollback_politicas_escritura_staff_14.sql').write_text(RB)
(ROOT / 'tests/local/politicas_escritura_sandbox.sql').write_text(SBX)
print(f'OK: {len(POL)} políticas; md5 de hoy 36/36 = prod; 3 archivos escritos')
