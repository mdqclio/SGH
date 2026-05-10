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

## 4. jockey_habitual_id no existe en spcs
Nunca incluir jockey_habitual_id en SELECT de spcs — no es una columna.

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
