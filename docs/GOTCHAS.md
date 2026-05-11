# SGH — Gotchas y Aprendizajes

## 1. GitHub Pages es case-sensitive
Profesionales.html ≠ profesionales.html. Siempre usar minúsculas.
Cómo detectarlo: la consola muestra el nombre con mayúscula en la URL.

## 2. Usar SIEMPRE la legacy anon key (eyJ...)
La nueva key sb_publishable_... da error 400 en consultas REST.
Dónde obtenerla: Settings → API → pestaña "Legacy anon, service_role API keys"

## 3. nombre_completo, no nombre
La tabla usuarios tiene nombre_completo NO nombre.
Usar siempre: .select('club_id, nombre_completo, rol')
Afecta todos los archivos con verificación de auth.

## 4. jockey_habitual_id SÍ existe en spcs (CORRECCIÓN)
~~No era columna~~ → sí existe. Verificado en sesión may-2026.

## 5. spcs usa estado, no activo
La tabla spcs no tiene columna activo.
Usar .eq('estado', 'activo') no .eq('activo', true).

## 6. GitHub Pages caché agresivo
Esperar 2-3 min después de push. Cmd+Shift+R para forzar recarga.
Agregar ?v=N a la URL para saltear caché.

## 7. Codespace se duerme y pierde trabajo
Hacer git push frecuentemente. Antes de cerrar la Mac: push obligatorio.
Comando: cd /workspaces/SGH && git add . && git commit -m "wip" && git push

## 8. iOS AirDrop convierte PNG a JPEG
Al enviar PNG del iPhone a Mac por AirDrop, iOS puede agregar fondo blanco.
Solución: descargar archivos directamente desde el navegador de la Mac.

## 9. ENUMs PostgreSQL: solo agregar valores, nunca quitar
ALTER TYPE nombre_enum ADD VALUE IF NOT EXISTS 'nuevo_valor';
Los valores viejos quedan aunque no se usen.

## 10. Foreign keys al borrar inscripciones
resultado_posiciones tiene FK a inscripciones.
Siempre borrar en orden: resultado_posiciones → inscripciones.

## 11. Columna GENERATED no se puede actualizar
total_neto en liquidaciones es GENERATED ALWAYS AS.
Actualizar total_bruto y total_descuentos — total_neto se recalcula solo.

## 12. club_id puede ser NULL para entidades globales
SPCs, propietarios y entrenadores pueden tener club_id=NULL.
El buscador de inscripciones NO debe filtrar por club_id al buscar SPCs.

## 13. Supabase rate limit de emails
Plan gratuito tiene límite de emails/hora.
Crear usuarios desde Authentication → Users → Add user con Auto Confirm activado.

## 14. mix-blend-mode para logos con fondo blanco
Para logo con fondo blanco sobre verde: agregar mix-blend-mode: multiply al img.

## 15. Carta de llamados bloqueada
Para editar una carta publicada:
UPDATE reuniones SET estado = 'borrador' WHERE id = 'UUID';

## 16. toLocaleString sin locale da formato inglés
Nunca usar .toLocaleString() ni .toFixed() directo para mostrar plata. Siempre formatMonto(). El locale default del browser suele ser en-US y mete coma de miles, que es lo opuesto al formato argentino.

## 17. Comillas curly de iOS rompen SQL (may-2026)
iOS autocompleta comillas tipográficas (' ') en lugar de rectas (' '). Si pegás SQL con strings desde el iPhone, Supabase SQL Editor no lo ejecuta. Desactivar smart quotes en iPhone: Configuración → General → Teclado → Smart Punctuation OFF.

## 18. condicion_adicional NO es la condición principal (may-2026)
A pesar del nombre, condicion_adicional es solo una nota extra (ej: "Peso x impresion"). La condición real de la carrera está en condicion_handicap. Usar condicion_handicap para mostrar la condición en dropdowns y cards.

## 19. inscripciones.estado es ENUM rígido (may-2026)
No migrar inscripciones.estado a VARCHAR — hay una vista v_inscriptos_carrera que depende del ENUM. Para agregar valores: ALTER TYPE estado_inscripcion ADD VALUE 'nuevo_valor'.
Contraste: carreras.estado es VARCHAR libre (sin ENUM ni restricciones).

## 20. super_admin sin club_id no ve datos en pantallas con filtro por club_id (may-2026)
Las pantallas que usan CLUB_ID para filtrar (inscripciones, jockeys, caballerizas) no muestran datos si el super_admin no tiene club_id asignado en la tabla usuarios. Es un problema de UX, no de código. Solución temporal: asignar club_id al super_admin en la DB.

## 21. Bucket Storage requiere policies SQL después de crearlo (may-2026)
Crear el bucket desde la UI de Supabase no genera las RLS policies. Hay que ejecutar las 4 CREATE POLICY manualmente en el SQL Editor (ver SCHEMA.md → Storage Supabase).
