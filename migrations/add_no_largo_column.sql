-- Migración: soporte para "no corrió" en resultado_posiciones
-- Ejecutar en Supabase SQL Editor

-- 1. posicion pasa a nullable (los caballos que no largaron no tienen posición)
ALTER TABLE resultado_posiciones
  ALTER COLUMN posicion DROP NOT NULL;

-- 2. Columna no_largo: true cuando el caballo ratificado no llegó a largar
ALTER TABLE resultado_posiciones
  ADD COLUMN IF NOT EXISTS no_largo BOOLEAN NOT NULL DEFAULT false;
