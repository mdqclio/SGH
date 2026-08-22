# B1 — salida medida (18/08/2026)

Runbook: `docs/RUNBOOK_R8_PROVISORIOS.md` · bloque **B1 · Medir cuántas quedan sin
responsable (read-only)**.

- Proyecto: `unlhcuanfrtpatoipwve` (verificado por `get_project_url` →
  `https://unlhcuanfrtpatoipwve.supabase.co`)
- R8 = `7b6e003e-22e2-4629-bf55-f18560b1260f`
- Ejecutado: **18/08/2026**
- **Read-only: 3 SELECT, cero INSERT / UPDATE / DDL.** B2 sigue sin correr.

## B0 · Guard

```
pwd  = /home/clio/dev/SGH     OK
spcs = 183                    OK
ref  = unlhcuanfrtpatoipwve   OK
```

## Los ocho números

```
ratificados          = 67
con_prop             = 18
sin_prop             = 49
cab_r8               = 57
cab_sin_ninguna_fila = 40
cab_prop_inactivo    = 0
cab_fila_prop_sin_id = 0
oficiales            = 6
```

### Lectura

**Criterio de halt `ratificados = 67`: PASA.**

- **N = `cab_sin_ninguna_fila` = 40.** Ése es el número de filas que entran en B3, en las
  dos tablas. Es el número que se compara en B3 y B5 — no el 40 de ayer, aunque coincida.
- Las 40 caballerizas cubren las **49** ratificadas sin `propietario_id` (32 con un caballo,
  8 con más de uno).
- **Nadie cargó responsables desde el viernes.** Los cuatro números de cobertura (40 / 49 /
  18 / 57) son idénticos a la medición del 15/08. Tres días sin movimiento de Yesi, Fede ni
  Valeria.
- **No hay cargas humanas a medias.** `cab_prop_inactivo = 0` y `cab_fila_prop_sin_id = 0`.
  **B7-bis no hace falta.**
- **`oficiales = 6`** — informativo desde la revisión 18/08, ya no frena. Pero **obliga a
  B9, B10 y B11**: si se arranca B2, la operación no se da por terminada hasta que B11 pase.
  Si no se puede recalcular en la misma sesión → **FRENAR ANTES DE B3.**

## Lista nominal — las 40 que entrarían

| # | caballeriza | ratif |
|---|---|---|
| 1 | ABUELO FLORO | 1 |
| 2 | BETTY SANTI | 1 |
| 3 | CRAZY HORSE | 2 |
| 4 | DON BENICIO | 1 |
| 5 | DON GIOVANNI | 1 |
| 6 | DON RAUL | 1 |
| 7 | EL CHINGA | 1 |
| 8 | EL COLORADO | 1 |
| 9 | EL DERBY | 1 |
| 10 | EL DESTINO | 1 |
| 11 | EL HORNERITO CAFE | 1 |
| 12 | EL LALO | 1 |
| 13 | El linye y Rami | 1 |
| 14 | EL NIETO | 2 |
| 15 | EL PIMPO | 1 |
| 16 | EL VETERANO | 1 |
| 17 | EMI | 1 |
| 18 | ESTAMPA DEL SUR | 1 |
| 19 | FEDERICO Y MIGUEL | 1 |
| 20 | LA MILINGA | 3 |
| 21 | LA MORALEJA | 1 |
| 22 | LA PICHI | 1 |
| 23 | LAGUNA VERDE | 1 |
| 24 | LOS CATACHOS | 2 |
| 25 | LOS CUERVOS | 1 |
| 26 | LOS EDUCADITOS | 1 |
| 27 | LOS MELLI | 2 |
| 28 | LOS MONCHITOS | 1 |
| 29 | LOS MORENITOS | 1 |
| 30 | LOS URONES | 1 |
| 31 | LUNA ROJA | 1 |
| 32 | MAR DEL TUYU | 1 |
| 33 | MARTIN Y NICOLAS | 1 |
| 34 | MELINA A | 2 |
| 35 | MI MARTINCITO | 1 |
| 36 | NEGRO T | 2 |
| 37 | NUEVO MUNDO | 1 |
| 38 | RD NECOCHEA | 2 |
| 39 | SANTOS VEGA | 1 |
| 40 | TIAN Y ROMA | 1 |

**Total ratificadas cubiertas = 49** ✅ (cuadra con `sin_prop`).

## `El linye y Rami` — decisión tomada, no se revisa

Fila 13. **Entra como una más de las 40, con su propietario provisorio. NO se consolida.**

`EL LINYE Y RAMI` (mayúsculas) ya tiene responsable y por eso no aparece en esta lista.
Que los dos nombres sean el mismo es una hipótesis, no un dato: **consolidar ahora es
afirmar algo que no sabemos, y si nos equivocamos el 70% va a la persona equivocada.**
Si Fede después confirma que son la misma caballeriza, se unifica — con la confirmación
en la mano y sin plata liquidada de por medio.

Ratifica lo ya decidido en `66d9d05` ("'El linye y Rami' entra como una más, sin unificar").
El plan de consolidación de `docs/R8_CABALLERIZAS_HOMONIMAS.md` queda **archivado, sin
ejecutar**, a la espera de esa confirmación.

## Estado

**B1 cerrado. B2 sin aprobar — es la primera escritura de toda la operación y espera el OK.**
