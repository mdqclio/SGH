-- GENERADO por tests/local/gen_revoke_anon_tablas.py — no editar a mano.
-- SEGURIDAD — anon sin privilegios en las 37 tablas/vistas de public que los tenían (34 tablas + 3 vistas).
-- Antes: anon = arwdDxtm (todo, TRUNCATE incluido, que no pasa por RLS; recibos sin DELETE). Ninguna política alcanza a
-- anon/PUBLIC: anon leía 0 filas. Único camino sin sesión: programa-oficial(-color).html abierto por URL directa sin
-- login (hoy muestra vacío; después, error de permiso). No toca authenticated, service_role ni sgh_lectura.
-- ESTADO EN PRODUCCIÓN: APLICADA 2026-10-03 (`20261003150157`) + complemento revoke_anon_v_inscriptos_resto.sql (`20261003150235`).
-- Verificado: anon 401/42501 en las 37 (antes 200 y 0 filas), sesión staff lee las 37, ACL de los demás roles = antes,
-- 0 objetos de public con privilegios para anon.
BEGIN;
REVOKE ALL ON TABLE public.apoderados FROM anon;
REVOKE ALL ON TABLE public.auditoria FROM anon;
REVOKE ALL ON TABLE public.caballeriza_responsables FROM anon;
REVOKE ALL ON TABLE public.caballerizas FROM anon;
REVOKE ALL ON TABLE public.carrera_apuestas FROM anon;
REVOKE ALL ON TABLE public.carreras FROM anon;
REVOKE ALL ON TABLE public.categorias_carrera FROM anon;
REVOKE ALL ON TABLE public.club_configuracion FROM anon;
REVOKE ALL ON TABLE public.club_secuencias FROM anon;
REVOKE ALL ON TABLE public.clubs FROM anon;
REVOKE ALL ON TABLE public.comision_config FROM anon;
REVOKE ALL ON TABLE public.hipodromos FROM anon;
REVOKE ALL ON TABLE public.inscripciones FROM anon;
REVOKE ALL ON TABLE public.liquidacion_config FROM anon;
REVOKE ALL ON TABLE public.liquidacion_detalle FROM anon;
REVOKE ALL ON TABLE public.liquidaciones FROM anon;
REVOKE ALL ON TABLE public.novedades_reunion FROM anon;
REVOKE ALL ON TABLE public.performances FROM anon;
REVOKE ALL ON TABLE public.profesionales FROM anon;
REVOKE ALL ON TABLE public.propietarios FROM anon;
REVOKE ALL ON TABLE public.recibos FROM anon;
REVOKE ALL ON TABLE public.resolucion_entidades FROM anon;
REVOKE ALL ON TABLE public.resoluciones FROM anon;
REVOKE ALL ON TABLE public.resultado_apuestas FROM anon;
REVOKE ALL ON TABLE public.resultado_log FROM anon;
REVOKE ALL ON TABLE public.resultado_posiciones FROM anon;
REVOKE ALL ON TABLE public.resultados FROM anon;
REVOKE ALL ON TABLE public.reuniones FROM anon;
REVOKE ALL ON TABLE public.sanciones FROM anon;
REVOKE ALL ON TABLE public.solicitudes_acceso FROM anon;
REVOKE ALL ON TABLE public.spc_entrenadores_hist FROM anon;
REVOKE ALL ON TABLE public.spc_propietarios FROM anon;
REVOKE ALL ON TABLE public.spcs FROM anon;
REVOKE ALL ON TABLE public.usuarios FROM anon;
REVOKE ALL ON TABLE public.v_programa_reunion FROM anon;
REVOKE ALL ON TABLE public.v_sanciones_vigentes FROM anon;
REVOKE ALL ON TABLE public.v_spcs_activos FROM anon;
COMMIT;
