# SGH — Sistema de Gestión Hípica

Sistema web para la administración operativa de hipódromos: reuniones, inscripciones, programas y carga de resultados.

## Stack

- **Frontend**: HTML / CSS / JavaScript vanilla (sin frameworks)
- **Backend / DB**: [Supabase](https://supabase.com) — PostgreSQL + Auth
- **Deploy**: GitHub Pages (rama `main`, redeploy automático al pushear)

## URLs

- **App en vivo**: https://sigh.com.ar/
- **Repositorio**: https://github.com/mdqclio/SGH

## Desarrollo

```bash
# Editar archivos, luego:
git add <archivos>
git commit -m "mensaje"
git push origin main   # GitHub Pages redeploya en ~15 seg
```

## Pantallas implementadas

| Archivo | Descripción |
|---------|-------------|
| `login.html` | Autenticación |
| `portal.html` | Portal principal |
| `reuniones.html` | Gestión de reuniones |
| `programa.html` / `programa-oficial.html` / `programa-oficial-color.html` | Programa de carreras |
| `inscripciones.html` | Inscripciones de ejemplares |
| `resultados.html` | Carga y consulta de resultados |
| `ratificacion.html` | Ratificación de inscripciones |
| `carta-llamados.html` | Carta de llamados |
| `hipodromos.html` | ABM de hipódromos |
| `caballerizas.html` | Gestión de caballerizas |
| `spcs.html` | Ejemplares (SPC) |
| `jockeys.html` | Jockeys |
| `profesionales.html` | Profesionales |
| `propietarios.html` | Propietarios |
| `categorias.html` | Categorías |
| `calendario.html` | Calendario |
| `sanciones.html` | Sanciones |
| `resoluciones.html` | Resoluciones |
| `liquidaciones.html` | Liquidaciones |
| `auditoria.html` | Auditoría |
| `usuarios.html` | Administración de usuarios |
| `registro.html` / `registro-profesional.html` | Registro de usuarios |
| `reset-password.html` | Recupero de contraseña |
| `admin.html` | Panel de administración |

## Documentación

- **Schema de Supabase**: [SCHEMA.md](SCHEMA.md)
- **Historial de cambios**: [CHANGELOG.md](CHANGELOG.md)
- **Tests automatizados**: [tests/README.md](tests/README.md)
