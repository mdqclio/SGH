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
