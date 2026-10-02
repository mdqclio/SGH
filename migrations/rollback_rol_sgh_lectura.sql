-- Rollback de migrations/rol_sgh_lectura.sql: saca los permisos y borra el rol. Antes, cortar sus sesiones abiertas.
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'sgh_lectura';
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM sgh_lectura;
REVOKE USAGE ON SCHEMA public FROM sgh_lectura;
REVOKE CONNECT ON DATABASE postgres FROM sgh_lectura;
DROP ROLE IF EXISTS sgh_lectura;
