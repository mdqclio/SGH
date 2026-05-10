# SGH — Módulos del Sistema

## Estado actual
✅ Funciona | 🔧 En desarrollo | ❌ No funciona | 📋 Pendiente

| Módulo | Archivo | Estado |
|---|---|---|
| Login | login.html | ✅ |
| Dashboard | index.html | ✅ |
| Admin | admin.html | ✅ |
| Registro hipódromo | registro.html | ✅ |
| Reset password | reset-password.html | ✅ |
| Reuniones | reuniones.html | ✅ |
| Carta de llamados | carta-llamados.html | 🔧 |
| Inscripciones | inscripciones.html | 🔧 |
| Ratificación | ratificacion.html | ✅ |
| Programa | programa.html | ✅ |
| Resultados | resultados.html | 🔧 |
| Liquidaciones | liquidaciones.html | ❌ |
| Calendario | calendario.html | ✅ |
| Profesionales | profesionales.html | ✅ |
| Jockeys | jockeys.html | ✅ |
| Propietarios | propietarios.html | ✅ |
| Caballerizas | caballerizas.html | ✅ |
| Stud Book | spcs.html | ✅ |
| Sanciones | sanciones.html | ✅ |
| Resoluciones | resoluciones.html | ✅ |
| Usuarios | usuarios.html | ✅ |
| Categorías | categorias.html | ✅ |
| Hipódromos | hipodromos.html | ✅ |
| Portal | portal.html | 📋 |
| Registro profesional | registro-profesional.html | 📋 |

## Flujo principal del negocio
1. Crear reunión (reuniones.html)
2. Cargar carta de llamados → Publicar (bloquea edición)
3. Inscripciones: buscar SPC → jockey/caballeriza/peón/capataz/sereno
4. Ratificación: inscripto → ratificado (o forfait)
5. Programa oficial + PDF
6. Resultados: posiciones + apuestas → Oficializar
7. Liquidaciones: calcular premios → generar recibos

## Reglas de negocio críticas

### Estados de inscripción
Solo 3 activos: inscripto → ratificado → forfait

### Carta de llamados
Una vez publicada no se puede modificar.
Para desbloquear: UPDATE reuniones SET estado='borrador' WHERE id='UUID';

### SPCs son globales
NO filtrar por club_id al buscar SPCs. Usar .eq('estado','activo') sin club_id.

### Entrenadores son globales
club_id nullable — trabajan en cualquier hipódromo.

### Jockeys son por hipódromo
club_id obligatorio — patente otorgada por cada hipódromo.

### Sanciones son compartidas
Sin filtro por club_id — se ven en todos los hipódromos.

## Distribución de premios (porcentajes nacionales, configurables)
Propietario 70% / Entrenador 10% / Jockey 10% / Peón 4% / Capataz 3% / Sereno 1% / Fondo solidario 2%

## Sistema de bonos
- Bono ganador: monto fijo adicional al 1er puesto
- Bono posición: monto por puesto del 6° en adelante (hasta el 10°)
- Ganancia mínima: si el % calculado es menor, se paga el mínimo

## Apuestas (carga manual)
Simples: Ganador, 1°, 2°, 3°, Exacta, Imperfecta
Múltiples: Doble, Trifecta, Cuatrifecta, Triplo, Cuaterna, Quíntuplo, Cadena
