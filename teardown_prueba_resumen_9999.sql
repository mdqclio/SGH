-- ============================================================
-- TEARDOWN — reunión ficticia PRUEBA RESUMEN (numero 9999)
-- ============================================================
-- Reunión sembrada 2026-06-10 para que Leo pruebe la pestaña Resumen end-to-end.
-- id: a0000000-0000-0000-0000-000000009999 (numero 9999, fecha 2099-01-01,
-- observaciones='PRUEBA RESUMEN — BORRAR', hipódromo Dolores).
--
-- ⚠️ BORRAR ANTES DE LA REUNIÓN REAL DEL 20/6. Solo toca la ficticia.
-- Serie-safe: los recibos ficticios 9001/9002 se insertaron a mano con numero
-- fijo alto; este teardown los borra por id → NO toca club_secuencias
-- (ultimo_numero del recibo queda en 0, igual que antes del seed).
--
-- FK-order: posiciones → resultados → detalle → liquidaciones → recibos → inscripciones → carreras → reunión
-- ============================================================

DELETE FROM resultado_posiciones WHERE resultado_id IN
  ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000003');
DELETE FROM resultados WHERE id IN
  ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000003');
DELETE FROM liquidacion_detalle WHERE reunion_id='a0000000-0000-0000-0000-000000009999';
DELETE FROM liquidaciones       WHERE reunion_id='a0000000-0000-0000-0000-000000009999';
DELETE FROM recibos WHERE id IN
  ('e9000000-0000-0000-0000-000000009001','e9000000-0000-0000-0000-000000009002');
DELETE FROM inscripciones WHERE carrera_id IN
  ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000003');
DELETE FROM carreras  WHERE reunion_id='a0000000-0000-0000-0000-000000009999';
DELETE FROM reuniones WHERE id='a0000000-0000-0000-0000-000000009999';

-- Verificación post-teardown (esperado: liq=0, sec=0):
-- SELECT (SELECT count(*) FROM liquidaciones WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c') AS liq,
--        (SELECT ultimo_numero FROM club_secuencias WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND tipo='recibo') AS sec;
