# Rollback — Gate 0 (auto-registro)

**Fecha**: 2026-08-04 · **Base**: `main` @ `3c2abaf` · **Rama**: `sec/autoregistro-gate-0`

Commiteado **antes** de aplicar el Gate 0, según la disciplina de las pasadas SEC_RLS.

## Qué cambia el Gate 0

Sólo **archivos HTML estáticos**. Cero schema, cero policies, cero funciones, cero datos.
Por eso el rollback es git puro: no hay migración inversa que escribir.

## Estado previo — blobs exactos

| archivo | blob sha1 antes | líneas |
|---|---|---|
| `registro-profesional.html` | `9fbab576b7f87b4af774acfbcc76c788b9613091` | 306 |
| `registro.html` | `691c4bb37689375b4825338d9820dc4ea1d00467` | 274 |
| `login.html` | `3d08d0cdfc3eccdbb4b279985a83f7f6f214d676` | 388 |

`login.html` se lista porque se toca su comentario, no su comportamiento: el link a
`registro-profesional.html` **ya estaba comentado desde antes** (ver §Corrección del reporte).

## Cómo revertir

Revertir el commit del Gate 0 completo:

```bash
git revert --no-edit <SHA_DEL_COMMIT_GATE_0>
git push origin main
```

O restaurar un archivo puntual a su contenido exacto previo:

```bash
git checkout 3c2abaf -- registro-profesional.html
git checkout 3c2abaf -- registro.html
git checkout 3c2abaf -- login.html
```

Verificación de que la reversión quedó bien:

```bash
git rev-parse HEAD:registro-profesional.html   # → 9fbab576b7f87b4af774acfbcc76c788b9613091
git rev-parse HEAD:registro.html               # → 691c4bb37689375b4825338d9820dc4ea1d00467
```

GitHub Pages republica solo, en 15-60 s.

## Qué NO revierte esto

- Nada, porque el Gate 0 no toca la base. `spcs` = 144 antes y después.
- Las 2 cuentas huérfanas de `auth.users` **no se tocan** en este gate (ver el reporte), así que no hay nada que restaurar de ese lado.

## Recuperar el formulario para reciclarlo en el Gate 3

El markup del formulario de `registro-profesional.html` (tabs entrenador/propietario, layout,
CSS, CSP) se recicla en el Gate 3. No hace falta conservar el archivo vivo: sale de git.

```bash
git show 3c2abaf:registro-profesional.html > /tmp/form_base.html
```
