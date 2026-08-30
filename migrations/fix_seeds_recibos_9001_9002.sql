-- ═══════════════════════════════════════════════════════════════════════════════
-- Recibos seed 9001 y 9002 — totales en 0 con líneas que suman 870.000
--
-- Origen: relevamiento de la vista de historial de recibos (2026-08-30). Los dos
-- recibos seed de Dolores tienen total_premios, total_descuentos y neto_a_cobrar en
-- 0.00, pero sus líneas suman 170.000 y 700.000:
--
--   numero  neto_actual  total_premios  suma_lineas  n_lineas
--   9001    0.00         0.00           170000.00    2
--   9002    0.00         0.00           700000.00    2
--
-- No es un bug de la vista: es un dato inconsistente que la vista destapa. Hasta
-- ahora no molestaba porque no había forma de mirar un recibo viejo; con el historial
-- pasan a ser las dos primeras filas raras que ve el operador, y un recibo que se
-- lista en $0 y abre un detalle de $170.000 hace dudar de la pantalla, no del dato.
--
-- NO SE BORRAN. Son el bucket 'pagado' del que depende el tab Resumen: borrarlos
-- movería la reconciliación y rompería lo que hoy cuadra. Se corrigen los totales
-- para que coincidan con sus propias líneas.
--
-- Se corrigen los TRES campos, no sólo neto_a_cobrar: el recibo impreso muestra
-- "Total premios / Descuentos / NETO A COBRAR" (ver imprimirReciboCobro), así que
-- arreglar sólo el neto dejaría un impreso que dice "Total premios: $0" arriba de
-- "NETO A COBRAR: $170.000". Peor que el estado actual, porque parecería un error de
-- cálculo en vez de un dato viejo.
--
-- Los valores NO se escriben a mano: se derivan de las propias líneas del recibo, así
-- que la corrección es idempotente y no puede introducir un número inventado.
--   total_premios    = sum(monto_bruto)
--   total_descuentos = sum(monto_descuento)
--
-- `neto_a_cobrar` NO se escribe: es una columna GENERATED (GOTCHA #9) y Postgres la
-- recalcula sola. Intentar ponerla da:
--   ERROR: 428C9: column "neto_a_cobrar" can only be updated to DEFAULT
--   DETAIL: Column "neto_a_cobrar" is a generated column.
-- Su expresión es
--   ((total_premios - total_descuentos) - COALESCE(retencion_dgi, 0))
-- así que arreglar los dos totales la deja correcta por definición — y además
-- garantiza que el recibo cierre internamente, que es más de lo que daría escribirla
-- a mano.
--
-- Alcance: EXACTAMENTE esos dos recibos, por numero_recibo Y club_id. No se toca
-- ningún recibo real (1, 2 y 3 ya tienen sus totales correctos).
--
-- Guards (2026-08-30): pwd=/home/clio/dev/SGH · spcs=181 · ref=unlhcuanfrtpatoipwve ·
-- recibos=5 · anulados=0.
--
-- Rollback: volver a poner los tres campos en 0 para esos dos ids.
--   UPDATE recibos SET total_premios=0, total_descuentos=0
--    WHERE id IN ('e9000000-0000-0000-0000-000000009001',
--                 'e9000000-0000-0000-0000-000000009002');
--   (neto_a_cobrar vuelve a 0 solo: es GENERATED.)
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE recibos r
   SET total_premios    = s.bruto,
       total_descuentos = s.desc_
  FROM (
    SELECT ld.recibo_id,
           COALESCE(sum(ld.monto_bruto),     0) AS bruto,
           COALESCE(sum(ld.monto_descuento), 0) AS desc_,
           COALESCE(sum(ld.monto_neto),      0) AS neto
      FROM liquidacion_detalle ld
     GROUP BY ld.recibo_id
  ) s
 WHERE s.recibo_id = r.id
   AND r.club_id       = '0649e9c5-9e87-4aad-842f-101458e6b33c'
   AND r.numero_recibo IN (9001, 9002)
   -- Sólo si están mal: la migración se puede volver a correr sin efecto.
   AND (r.total_premios IS DISTINCT FROM s.bruto
     OR r.total_descuentos IS DISTINCT FROM s.desc_);
