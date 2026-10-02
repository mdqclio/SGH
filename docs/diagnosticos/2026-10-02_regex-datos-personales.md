# Regex de datos personales ampliado + montos siempre con $ + merge del PR #35

- **Fecha:** 2026-10-02
- **Guards:** pwd=/home/clio/dev/SGH · ref=unlhcuanfrtpatoipwve · sin escrituras en la base.

## SHA

| Qué | Referencia |
|---|---|
| Regex nuevo + regla de montos + probe | rama `chore/claude-md-datos-personales`, commit **`29453422a036`** |
| Merge del PR #35 | **`d52afe9350ebfbd75bd341bc178e6e2e198c8a96`** (sólo `CLAUDE.md` y `tests/`; ningún archivo servido por Pages) |

## Qué cambió en `CLAUDE.md`

- El regex del chequeo antes de cada push a `reports` es el que pasaste, **sin cambios**: está en `CLAUDE.md`, sección "Datos
  personales", en la línea del `grep -nE` (commit `29453422a036`). No lo pego acá porque contiene una arroba y no pasaría su propio chequeo.
- Regla nueva: **los montos van siempre con `$` pegado**. Un monto sin `$` con puntos de miles tiene forma de DNI con puntos y cae.
- Se aclara qué no cae: dígitos pegados a letras hexadecimales (SHA, uuid, md5), fechas ISO y versiones de migración.
- `tests/probe_regex_datos_personales.mjs`: lee el regex **de `CLAUDE.md`** (no lo copia) y lo corre con `grep -E` real contra los
  casos pedidos. Imprime el **nombre** de cada caso y no su valor (los valores, inventados, tienen forma de DNI/CUIT/teléfono y están
  en el archivo del probe, en `main`).

## Prueba contra los casos pedidos — `node tests/probe_regex_datos_personales.mjs` (sobre `main` `d52afe9`)

```
regex (de CLAUDE.md): 121 caracteres
✅ DNI con puntos: detecta (esperado: detecta)
✅ CUIT sin guiones: detecta (esperado: detecta)
✅ celular de 10 dígitos: detecta (esperado: detecta)
✅ teléfono con guion: detecta (esperado: detecta)
✅ CUIT con guiones: detecta (esperado: detecta)
✅ monto con $ y puntos de miles: no detecta (esperado: no)
✅ SHA completo de commit: no detecta (esperado: no)
✅ fecha ISO: no detecta (esperado: no)
✅ versión de migración (14 dígitos): no detecta (esperado: no)

9/9 OK
exit 0
```

### Mismo probe con el regex ANTERIOR (mutante: confirma que el probe discrimina)

Se copió `CLAUDE.md` con el regex anterior (el de 7 u 8 dígitos) y se apuntó el probe a esa copia:

```
regex (de CLAUDE.md): 44 caracteres
❌ DNI con puntos: no detecta (esperado: detecta)
❌ CUIT sin guiones: no detecta (esperado: detecta)
❌ celular de 10 dígitos: no detecta (esperado: detecta)
❌ teléfono con guion: no detecta (esperado: detecta)
✅ CUIT con guiones: detecta (esperado: detecta)
✅ monto con $ y puntos de miles: no detecta (esperado: no)
✅ SHA completo de commit: no detecta (esperado: no)
✅ fecha ISO: no detecta (esperado: no)
✅ versión de migración (14 dígitos): no detecta (esperado: no)

5/9 OK
exit 1
```

Fallan exactamente los cuatro huecos que marcaste: DNI con puntos, CUIT sin guiones, celular de 10 dígitos y teléfono con guion.

## Chequeo de este informe antes del push

Corrido con el regex nuevo sobre lo que se agrega a `reports` (resultado abajo, en la verificación de push).

Nota: la primera versión de este informe citaba el commit por su SHA corto de 7 caracteres, que por casualidad son 7 dígitos
seguidos. **El chequeo lo frenó** y no se pusheó. Se reformuló con el prefijo largo (`29453422a036`), que tiene letras.

---

## Verificación de push

Chequeo de datos personales (regex de `CLAUDE.md`) antes de cada push: vacío (rc=1).

```
$ git ls-remote origin reports
fb4b74e4903c8eb46848829c09420c0cb71ec6bd	refs/heads/reports
$ git rev-parse HEAD
fb4b74e4903c8eb46848829c09420c0cb71ec6bd
```

Coinciden. Este bloque va en un commit posterior.
