# CLAUDE.md — sección "Datos personales: el repo es PÚBLICO" (PR #35) + limpieza del informe de la cuenta de Auth

- **Fecha:** 2026-10-02
- **Guards:** pwd=/home/clio/dev/SGH · ref=unlhcuanfrtpatoipwve · sin escrituras en la base.
- **Decisiones:** exposición del 02/10 → opción (b), **no se reescribe `reports`** (va en el ticket a GitHub). El listado de las 19
  cuentas **no se hace**.

## Qué se hizo

| Qué | Referencia |
|---|---|
| Sección nueva al principio de `CLAUDE.md` | rama `chore/claude-md-datos-personales`, commit **`3df75f5`**, PR **#35** (https://github.com/mdqclio/SGH/pull/35), **sin mergear** |
| Informe de la cuenta de Auth: se sacaron el email enmascarado (dos letras de la parte local más el dominio) y todas las arrobas | `reports` **`3b5170e`** — `docs/diagnosticos/2026-10-02_cuenta-auth-sin-usuario-0024.md` |

**Contenido de la sección** (el texto exacto está en el commit `3df75f5`; acá no se pega porque la propia regla lleva arrobas y no
pasaría el chequeo que ella misma impone):

- No van en informes, commits, ramas ni PR: emails, ni siquiera la parte local; DNI, CUIT, CBU, teléfonos; nombres de usuarios del
  portal (nombre, apellido, caballeriza que cargaron). Sí van los uuid; para ver el dato se deja la consulta.
- Antes de cada push a `reports`: `git fetch` y grep de arrobas y de números de 7 u 8 dígitos sobre `git diff -U0 origin/reports..HEAD`
  (sólo líneas agregadas). Si sale cualquier cosa, no se pushea: se reformula. Sin excepciones.
- El caso del 02/10, con la ruta del informe.

## Un ajuste para confirmar (va en el PR)

El regex **no cuenta como número los dígitos pegados a letras hexadecimales**: `(^|[^0-9a-fA-F])[0-9]{7,8}([^0-9a-fA-F]|$)`. Sin eso,
cualquier SHA completo de commit (que suele tener tramos de 7 dígitos entre letras) bloquea todo informe con verificación de push, y
esa verificación es obligatoria. Un DNI, CUIT o teléfono va separado por espacios o puntuación, así que sigue entrando. Si preferís
el regex literal, hay que cambiar la verificación de push para que no copie los SHA enteros.

## Chequeo aplicado al informe de la cuenta de Auth (antes de su push)

```
$ git diff -U0 origin/reports..HEAD | grep '^+' | grep -v '^+++' | grep -nE '<arroba>|(^|[^0-9a-fA-F])[0-9]{7,8}([^0-9a-fA-F]|$)'
(vacío, rc=1)
$ grep -nE '<arroba>|(^|[^0-9a-fA-F])[0-9]{7,8}([^0-9a-fA-F]|$)' docs/diagnosticos/2026-10-02_cuenta-auth-sin-usuario-0024.md
(vacío, rc=1)
```

(`<arroba>` es el carácter real del comando, escrito así para que este informe pase su propio chequeo.)

## Preguntas abiertas

1. Los commits llevan el trailer de atribución `Co-Authored-By: Claude …` con la dirección **noreply** de Anthropic. Es la atribución
   que pide el harness, no un dato personal, pero es un email literal en cada commit. ¿Se deja como excepción? Hoy no está en la regla.
2. Los informes **anteriores** a hoy en `reports` no se revisaron con este chequeo. ¿Querés un barrido de sólo lectura (cuántos
   archivos y líneas tienen arrobas o números de 7–8 dígitos), sin reescribir nada?

---

## Verificación de push

Chequeo de datos personales antes del push: vacío (rc=1).

```
$ git ls-remote origin reports
34e47c5f86525e33ac0e5c52864efb3707cb8801	refs/heads/reports
$ git rev-parse HEAD
34e47c5f86525e33ac0e5c52864efb3707cb8801
```

Coinciden. Este bloque va en un commit posterior.
