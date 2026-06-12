-- ============================================================
-- SEED — datos de resultado COMPLETOS para reunión ficticia 9999
-- ============================================================
-- Objetivo: poblar TODOS los nulls que el generador de JSON
-- (tools/studbook_reunion_json.mjs) lee, para validar el mapeo
-- completo end-to-end con data realista.
--
-- ⚠️ DATA 100% FICTICIA. Solo toca la reunión 9999 (aislada) +
-- caballerizas/profesionales fake marcados "PRUEBA 9999 — BORRAR".
-- NO toca reuniones reales, NO toca plata, NO toca spcs.studbook_id.
--
-- Reunión: a0000000-0000-0000-0000-000000009999 (numero 9999)
-- Carreras: c0000000-...-0001/0002/0003  (turnos 1/2/3)
-- Resultados: d0000000-...-0001/0002/0003
-- Inscripciones: a1000000-...-0001 .. 0017
--
-- IDs deterministas de los objetos fake (para el teardown):
--   caballerizas:  f9000000-...-00c1 / 00c2 / 00c3
--   profesionales: f9000000-...-00a1 / 00a2 / 00a3 (jockeys)
--                  f9000000-...-00b1 / 00b2          (entrenadores/cuidadores)
--
-- Ejecutar manualmente tras OK de Leo. Idempotencia: usa ON CONFLICT
-- en los INSERT fake; los UPDATE son re-aplicables.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Caballerizas fake — 3 caminos de procedencia del generador
--    (procedenciaCaballeriza: hipodromo_patente > sufijo "(...)" > null)
-- ------------------------------------------------------------
INSERT INTO caballerizas (id, club_id, nombre, hipodromo_patente, chaquetilla_descripcion, activo, estado)
VALUES
  -- c1: CON hipodromo_patente  → procedencia = "DOL"
  ('f9000000-0000-0000-0000-0000000000c1', '0649e9c5-9e87-4aad-842f-101458e6b33c',
   'PRUEBA 9999 — BORRAR Stud Patente', 'DOL',
   'Casaca azul, gorra oro (PRUEBA 9999)', true, 'activo'),
  -- c2: SIN patente, nombre termina en "(SL)"  → procedencia = "SL"
  ('f9000000-0000-0000-0000-0000000000c2', '0649e9c5-9e87-4aad-842f-101458e6b33c',
   'PRUEBA 9999 — BORRAR Stud (SL)', NULL,
   'Casaca roja, mangas blancas (PRUEBA 9999)', true, 'activo'),
  -- c3: SIN patente, sin sufijo  → procedencia = null
  ('f9000000-0000-0000-0000-0000000000c3', '0649e9c5-9e87-4aad-842f-101458e6b33c',
   'PRUEBA 9999 — BORRAR Caballeriza Simple', NULL,
   'Casaca verde lisa (PRUEBA 9999)', true, 'activo')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2) Profesionales fake — jockeys (tipo=jockey) + cuidadores (tipo=entrenador)
--    Reemplazan a los reales para que el sample NO tenga PII real.
-- ------------------------------------------------------------
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, documento_nro, activo, estado)
VALUES
  ('f9000000-0000-0000-0000-0000000000a1', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey',     'PRUEBA 9999 — BORRAR', 'Jockey Uno',   '90000001', true, 'activo'),
  ('f9000000-0000-0000-0000-0000000000a2', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey',     'PRUEBA 9999 — BORRAR', 'Jockey Dos',   '90000002', true, 'activo'),
  ('f9000000-0000-0000-0000-0000000000a3', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey',     'PRUEBA 9999 — BORRAR', 'Jockey Tres',  '90000003', true, 'activo'),
  ('f9000000-0000-0000-0000-0000000000b1', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'PRUEBA 9999 — BORRAR', 'Cuidador Uno', '90000011', true, 'activo'),
  ('f9000000-0000-0000-0000-0000000000b2', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'PRUEBA 9999 — BORRAR', 'Cuidador Dos', '90000012', true, 'activo')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 3) Inscripciones — peso_balanza (kilos ejemplar 400-560),
--    peso_final (kilos jockey 52-58), re-link jockey/entrenador/caballeriza.
--    Distribución round-robin que cubre los 3 caballerizas y todos los fakes.
-- ------------------------------------------------------------
-- Carrera 1 (turno 1)
UPDATE inscripciones SET peso_balanza=462, peso_final=55, jockey_titular_id='f9000000-0000-0000-0000-0000000000a1', entrenador_id='f9000000-0000-0000-0000-0000000000b1', caballeriza_id='f9000000-0000-0000-0000-0000000000c1' WHERE id='a1000000-0000-0000-0000-000000000001';
UPDATE inscripciones SET peso_balanza=448, peso_final=53, jockey_titular_id='f9000000-0000-0000-0000-0000000000a2', entrenador_id='f9000000-0000-0000-0000-0000000000b2', caballeriza_id='f9000000-0000-0000-0000-0000000000c2' WHERE id='a1000000-0000-0000-0000-000000000002';
UPDATE inscripciones SET peso_balanza=510, peso_final=56, jockey_titular_id='f9000000-0000-0000-0000-0000000000a3', entrenador_id='f9000000-0000-0000-0000-0000000000b1', caballeriza_id='f9000000-0000-0000-0000-0000000000c3' WHERE id='a1000000-0000-0000-0000-000000000003';
UPDATE inscripciones SET peso_balanza=489, peso_final=54, jockey_titular_id='f9000000-0000-0000-0000-0000000000a1', entrenador_id='f9000000-0000-0000-0000-0000000000b2', caballeriza_id='f9000000-0000-0000-0000-0000000000c1' WHERE id='a1000000-0000-0000-0000-000000000004';
UPDATE inscripciones SET peso_balanza=525, peso_final=57, jockey_titular_id='f9000000-0000-0000-0000-0000000000a2', entrenador_id='f9000000-0000-0000-0000-0000000000b1', caballeriza_id='f9000000-0000-0000-0000-0000000000c2' WHERE id='a1000000-0000-0000-0000-000000000005';
UPDATE inscripciones SET peso_balanza=471, peso_final=52, jockey_titular_id='f9000000-0000-0000-0000-0000000000a3', entrenador_id='f9000000-0000-0000-0000-0000000000b2', caballeriza_id='f9000000-0000-0000-0000-0000000000c3' WHERE id='a1000000-0000-0000-0000-000000000006';
-- Carrera 2 (turno 2)
UPDATE inscripciones SET peso_balanza=455, peso_final=56, jockey_titular_id='f9000000-0000-0000-0000-0000000000a1', entrenador_id='f9000000-0000-0000-0000-0000000000b1', caballeriza_id='f9000000-0000-0000-0000-0000000000c1' WHERE id='a1000000-0000-0000-0000-000000000007';
UPDATE inscripciones SET peso_balanza=538, peso_final=58, jockey_titular_id='f9000000-0000-0000-0000-0000000000a2', entrenador_id='f9000000-0000-0000-0000-0000000000b2', caballeriza_id='f9000000-0000-0000-0000-0000000000c2' WHERE id='a1000000-0000-0000-0000-000000000008';
UPDATE inscripciones SET peso_balanza=467, peso_final=54, jockey_titular_id='f9000000-0000-0000-0000-0000000000a3', entrenador_id='f9000000-0000-0000-0000-0000000000b1', caballeriza_id='f9000000-0000-0000-0000-0000000000c3' WHERE id='a1000000-0000-0000-0000-000000000009';
UPDATE inscripciones SET peso_balanza=442, peso_final=53, jockey_titular_id='f9000000-0000-0000-0000-0000000000a1', entrenador_id='f9000000-0000-0000-0000-0000000000b2', caballeriza_id='f9000000-0000-0000-0000-0000000000c1' WHERE id='a1000000-0000-0000-0000-000000000010';
UPDATE inscripciones SET peso_balanza=498, peso_final=55, jockey_titular_id='f9000000-0000-0000-0000-0000000000a2', entrenador_id='f9000000-0000-0000-0000-0000000000b1', caballeriza_id='f9000000-0000-0000-0000-0000000000c2' WHERE id='a1000000-0000-0000-0000-000000000011';
UPDATE inscripciones SET peso_balanza=480, peso_final=52, jockey_titular_id='f9000000-0000-0000-0000-0000000000a3', entrenador_id='f9000000-0000-0000-0000-0000000000b2', caballeriza_id='f9000000-0000-0000-0000-0000000000c3' WHERE id='a1000000-0000-0000-0000-000000000012';
-- Carrera 3 (turno 3)
UPDATE inscripciones SET peso_balanza=515, peso_final=57, jockey_titular_id='f9000000-0000-0000-0000-0000000000a1', entrenador_id='f9000000-0000-0000-0000-0000000000b1', caballeriza_id='f9000000-0000-0000-0000-0000000000c1' WHERE id='a1000000-0000-0000-0000-000000000013';
UPDATE inscripciones SET peso_balanza=433, peso_final=53, jockey_titular_id='f9000000-0000-0000-0000-0000000000a2', entrenador_id='f9000000-0000-0000-0000-0000000000b2', caballeriza_id='f9000000-0000-0000-0000-0000000000c2' WHERE id='a1000000-0000-0000-0000-000000000014';
UPDATE inscripciones SET peso_balanza=472, peso_final=55, jockey_titular_id='f9000000-0000-0000-0000-0000000000a3', entrenador_id='f9000000-0000-0000-0000-0000000000b1', caballeriza_id='f9000000-0000-0000-0000-0000000000c3' WHERE id='a1000000-0000-0000-0000-000000000015';
UPDATE inscripciones SET peso_balanza=503, peso_final=56, jockey_titular_id='f9000000-0000-0000-0000-0000000000a1', entrenador_id='f9000000-0000-0000-0000-0000000000b2', caballeriza_id='f9000000-0000-0000-0000-0000000000c1' WHERE id='a1000000-0000-0000-0000-000000000016';
UPDATE inscripciones SET peso_balanza=458, peso_final=54, jockey_titular_id='f9000000-0000-0000-0000-0000000000a2', entrenador_id='f9000000-0000-0000-0000-0000000000b1', caballeriza_id='f9000000-0000-0000-0000-0000000000c2' WHERE id='a1000000-0000-0000-0000-000000000017';

-- ------------------------------------------------------------
-- 4) Resultados — tiempo_ganador "M:SS.d" + estado_pista realista
--    (valores canónicos del dominio: seca/humeda/pesada)
-- ------------------------------------------------------------
UPDATE resultados SET tiempo_ganador='1:11.20', estado_pista='seca'   WHERE id='d0000000-0000-0000-0000-000000000001';
UPDATE resultados SET tiempo_ganador='1:18.40', estado_pista='humeda' WHERE id='d0000000-0000-0000-0000-000000000002';
UPDATE resultados SET tiempo_ganador='1:25.10', estado_pista='pesada' WHERE id='d0000000-0000-0000-0000-000000000003';

-- ------------------------------------------------------------
-- 5) Resultado_posiciones — diferencia (margen), dividendo (pagaría),
--    1 descalificado con motivo. no_largo intacto (dividendo/dif NULL).
-- ------------------------------------------------------------
-- Carrera 1: ganador sin diferencia (no trae a nadie adelante)
UPDATE resultado_posiciones SET diferencia=NULL,                dividendo=2.30  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000001';
UPDATE resultado_posiciones SET diferencia='1 1/2 cuerpos',     dividendo=3.10  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000002';
UPDATE resultado_posiciones SET diferencia='2 cuerpos',         dividendo=5.50  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000003';
UPDATE resultado_posiciones SET diferencia='pescuezo',          dividendo=8.00  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000004';
UPDATE resultado_posiciones SET diferencia='3 cuerpos',         dividendo=12.50 WHERE inscripcion_id='a1000000-0000-0000-0000-000000000005';
-- a1...0006 Pampero Real = no_largo → se deja NULL/NULL (intacto)
-- Carrera 2
UPDATE resultado_posiciones SET diferencia=NULL,                dividendo=1.90  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000007';
UPDATE resultado_posiciones SET diferencia='cabeza',            dividendo=4.20  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000008';
UPDATE resultado_posiciones SET diferencia='1 cuerpo',          dividendo=6.75  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000009';
UPDATE resultado_posiciones SET diferencia='nariz',             dividendo=9.50  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000010';
UPDATE resultado_posiciones SET diferencia='5 cuerpos',         dividendo=15.00 WHERE inscripcion_id='a1000000-0000-0000-0000-000000000011';
-- a1...0012 Tormenta Sur = no_largo → se deja NULL/NULL (intacto)
-- Carrera 3 (incluye 1 descalificado)
UPDATE resultado_posiciones SET diferencia=NULL,                dividendo=2.75  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000013';
UPDATE resultado_posiciones SET diferencia='media cabeza',      dividendo=3.40  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000014';
UPDATE resultado_posiciones SET diferencia='3/4 cuerpo',        dividendo=4.90  WHERE inscripcion_id='a1000000-0000-0000-0000-000000000015';
UPDATE resultado_posiciones SET diferencia='2 1/2 cuerpos',     dividendo=7.25,
       descalificado=true, motivo_desc='Interferencia en los 200m finales — distanciado por los comisarios (PRUEBA 9999)'
       WHERE inscripcion_id='a1000000-0000-0000-0000-000000000016';
UPDATE resultado_posiciones SET diferencia='1 cuerpo',          dividendo=11.00 WHERE inscripcion_id='a1000000-0000-0000-0000-000000000017';

COMMIT;

-- ============================================================
-- Verificación post-seed (esperado: 0 nulls en los campos sembrados):
--   SELECT count(*) FILTER (WHERE tiempo_ganador IS NULL OR estado_pista IS NULL) AS res_null
--   FROM resultados WHERE carrera_id IN
--     ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000003');
--   -- inscripciones: peso_balanza/peso_final/caballeriza_id no-null en las 17
--   -- resultado_posiciones: 15 con dividendo (2 no_largo NULL), 1 descalificado=true
-- ============================================================
