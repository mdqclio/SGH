# SGH — Preguntas Abiertas y Decisiones Pendientes

## 1. API Stud Book Nacional
Estado: En gestión de acceso
Cuando esté disponible: campo buscar por Nº registro en spcs.html que autocomplete datos.
SGH enviará resultados oficializados al Stud Book.

## 2. Liquidaciones — Implementación completa
Pendiente construir:
- Calcular premios por puesto según distribución configurable (60/19/12/6/3)
- Distribución interna: 70% propietario, 10% entrenador, 10% jockey, 4% peón, 3% capataz, 1% sereno, 2% fondo solidario
- Montas perdidas tipo 1 (fija por reunión) y tipo 2 (por carrera)
- Incentivo entrenador configurable por hipódromo
- Recibos imprimibles con firma por persona
- Resumen por carrera y por reunión
- Liquidar por: caballo, caballeriza, entrenador, peón, capataz, sereno

## 3. Portal propietarios/entrenadores
Diseño acordado:
- registro-profesional.html: auto-registro público sin login
- Campos propietario: nombre, apellido, email, contraseña, teléfono, documento, nombre_stud
- Campos entrenador: nombre, apellido, email, contraseña, teléfono, documento, patente, hipódromo que otorgó la patente
- Al registrarse: estado=pendiente en tabla usuarios
- Super admin aprueba/rechaza desde admin.html
- Al aprobar: puede entrar a portal.html e inscribir sus SPCs
- portal.html: Mis SPCs / Carta de llamados publicadas / Mis inscripciones

## 4. RLS por club
Cuando implementar: cuando haya 2+ clientes pagando
Cómo: políticas Supabase que filtren por club_id del usuario autenticado

## 5. Email service
Opciones: Resend (recomendado) o SendGrid
Para qué: notificaciones aprobación usuarios, confirmaciones, recordatorios
Pendiente configurar en Supabase Edge Functions

## 6. Migración a cuenta de Fede
Opción A (recomendada): transferir proyecto Supabase (Settings → Transfer)
Opción B: crear proyecto nuevo, correr schema, importar datos con pg_dump
También: transferir o fork del repo GitHub

## 7. Dominio propio
Actualmente: mdqclio.github.io/SGH/
Futuro: dominio propio (ej: sgh.com.ar)
Cómo: CNAME en DNS + GitHub Pages custom domain

## 8. Precios del SaaS
No definidos. Sugerir modelo por hipódromo/mes según cantidad de reuniones anuales.

---

## Resueltas en sesión may-2026

### Carrera → Turno en UI
Parcialmente resuelto. carta-llamados.html ✅, inscripciones.html ✅. **Pendiente**: PDF impreso de carta de llamados.

### Estados de inscripción
Confirmados 4 visibles al operador: inscripto / mal_inscrito / ratificado / forfait.

### Asignación de gateras
Workflow definido: sistema asigna automáticamente al inscribir + operador puede modificar manualmente para clásicos. Implementación pendiente.

### Estados de carrera para secretaria
Solo importan 'reabierta' y 'anulada' en esta etapa. Campo VARCHAR libre, sin ENUM.

---

## Pendientes (sesión may-2026 — segunda iteración)

### 16. Vocabulario formal de condiciones de carrera
Hoy la condición técnica abreviada del PDF reconoce solo 'perdedor(es)', 'ganador de 1 carrera' y 'ganador de 2 carreras' por regex; el resto se trunca a 22 chars. Las condiciones largas de Dolores ('Todo caballo de 3 y 4 años...') quedan truncadas. Cuando Fede defina un vocabulario fijo, refactorizar a un mapping explícito en lugar de regex.

### 15. cantidad_gateras al alta de hipódromo nuevo
El campo hipodromos.cantidad_gateras existe y es DEFAULT 12. El PDF de inscriptos lo usa para dimensionar la matriz ORDEN DE LARGADA. Hoy se setea por SQL manual. Idealmente debería ser un campo editable en registro.html (alta de hipódromo) y en hipodromos.html (edición). Pendiente agregar a esos formularios.

## Pendientes (sesión may-2026)

### 9. Portal de auto-registro
SPC con autocompletado + certificado auto desde DB + resto manual + campos obligatorios.

### 10. Limpieza datos de prueba
Esperar UI completa para marcar 'baja' antes de limpiar.

### 11. Carrera→Turno en PDF impreso de carta de llamados
Falta actualizar el PDF generado (rótulo CARRERA → TURNO).

### 12. Selector de hipódromo para super_admin
Cuando entre el segundo hipódromo: considerar Supabase Pro + selector de club para super_admin en pantallas que filtran por club_id.

### 13. Categorías reales de jockeys de Dolores
7 jockeys cargados sin categoría asignada. Fede debe informar cuál corresponde a cada uno.

### 14. ¿Deprecar módulo Propietarios?
Si propietarios y caballerizas son el mismo concepto en Dolores, evaluar deprecar propietarios.html. Consultar con Fede.

## Pendientes al cierre del 16/05/2026

- **Forfait sin motivo obligatorio**: cuando declara forfait NO debe pedir motivo (mal_inscrito sí lo requiere). Pendiente de implementar.
- **Forfaits en PDF**: revertir decisión inicial, SÍ incluirlos al lado de los ratificados como columna paralela estilo Palermo manual de Dolores.
- **Cierre automático a las 12 hs**: los que NO declararon forfait pasan AUTOMÁTICAMENTE a ratificado (modelo opt-out). Override admin (Fede) puede modificar post-cierre.
- **Sorteo automático de gateras**: SISTEMA AUTOMÁTICO, ÚNICO para toda la reunión, se genera al pedir el PDF de ratificación y queda persistido para programa. Clarificar: ¿cómo se mapea cada caballo a su gatera específica? Hipótesis: orden alfabético del SPC dentro de carrera → SORTEO 1..N → GATERA según permutación fija de la reunión.
- **Pantalla de reorden de carreras post-ratificación**: renumerar + horarios manuales cada 30/35/40/45 min sugeridos.
- **Bloque C Liquidaciones**: bloqueado por validación Fede de Bloque B con reunión real Dolores.
- **Programa Oficial estilo revista**: PDF fancy con tapa, comisión de carreras, apuestas especiales, doblete, columnas extra (Stud, 4 Últimas, Padre-Madre, Entrenador). Requiere ALTER de varias tablas y agregar UI de carga para los campos nuevos.
- **Limpieza menor**: las funciones `renderCategoriaSelect` y `updateCategoria` en ratificacion.html quedan declaradas pero sin uso (después de migrar a badge solo lectura). Limpiar en una tanda futura.
- **Limpieza menor**: `buildCondAbr` está duplicado (local dentro de printRatificados + global). Mover todo a global y borrar la local.
- **Pregunta abierta**: ¿el contador del header debe detectar carrera anulada en DB y mostrar banda "ANULADA" + deshabilitar acciones? Hoy hay inconsistencia entre PDF (sí muestra anulada) y pantalla operativa (no la marca visualmente con banda, pero ya bloquea acciones desde la tanda del 16/05).
