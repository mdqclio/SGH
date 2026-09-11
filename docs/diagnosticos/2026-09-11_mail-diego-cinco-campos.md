# Texto para Diego — estado de los cinco campos de la condición, convención "o más", valores de pista

**Fecha:** 2026-09-11 (noche) · **`main`:** `4f6ff13` (merge `--no-ff` de `feat/studbook-condicion-5-campos`; `carta-llamados.html` en prod = local, md5 `529a355a0cb2`, inputs de ganadas visibles) · **`reunion-json`:** v22 vivo.

---

```
Asunto: SGH → Stud Book — condición en 5 campos, DNI y pista

Diego,

Te paso cómo queda el JSON de reunion-json (versión de hoy, v22) para los puntos que pediste en agosto.

1) CONDICIÓN — viaja en texto y en cinco campos:
   condicion: { texto, edaddesde, edadhasta, sexo, ganadadesde, ganadahasta }
   - texto: el handicap tal como lo escribe la secretaría.
   - edaddesde / edadhasta: enteros. edadhasta null = "y más edad" (sin tope).
   - sexo: "T" (todo sexo), "machos", "hembras". ("machos_castrados" existe en nuestro catálogo, hoy sin uso.)
   - ganadadesde / ganadahasta: enteros, nuevos desde hoy. 0/0 = perdedores. ganadahasta null = "o más"
     (ej. "ganador de 2 o más carreras" → ganadadesde 2, ganadahasta null).
   Convención: null en el "hasta" significa sin tope, igual en edad y en ganadas. Si vos representás
   "o más" con un tope (99, 999, -1, lo que uses), decime cuál y lo traduzco de nuestro lado antes de
   mandarlo; no hace falta que cambies nada.
   Cobertura: las 11 carreras de la reunión del 20/09 tienen los cinco campos cargados. Hacia atrás,
   ganadas está en todas las reuniones ya corridas; edad falta en la del 16/08 (la completamos aparte).

2) DNI — jockey_inscripto.dni y cuidador.dni viajan con el documento (sin CUIT). Nos faltan
   documentos de 10 cuidadores que corren el 20/09; los estamos cargando esta semana. Donde falta
   viaja null.

3) PISTA — viajan como { id, nombre } con el mismo texto en los dos (no tenemos IDs numéricos):
   - tipo_pista (por carrera), catálogo cerrado: cesped, arena, mixta, sintetica, tierra.
     En uso: tierra, cesped.
   - estado_pista (por resultado), catálogo cerrado: seca, humeda, fangosa, pesada.
     En uso: seca, humeda, pesada.
   Minúscula, sin acento. Si necesitás tus propios IDs, pasame la tabla y los mapeo (son 9 valores).

Dos cosas tuyas que me destraban el resto:
   - la documentación del endpoint donde vos recibís (URL, método, auth, y si es pull tuyo o push nuestro);
   - confirmarme la convención de "o más" (null, o el tope que uses).

Endpoint, sin cambios: GET https://unlhcuanfrtpatoipwve.supabase.co/functions/v1/reunion-json?fecha=YYMMDD
con Authorization: Bearer <tu token>. Ejemplo con datos reales ya oficializados: fecha=260816.

Abrazo,
Leo
```

---

Notas para vos (no van en el mail):
- El ejemplo `260816` (R8) sale con `ganadadesde/hasta` cargados y `edaddesde/hasta` **null** (las 12 de R8 no tienen edad en columna — pendiente aparte, derivable del texto). Si preferís un ejemplo completo, `260620` (R6) tiene edad y ganadas.
- `sexo` manda los labels nuestros (`machos`/`hembras`) y `T` para ambos. Si Diego usa otro vocabulario, es `mapSexo()` en el formatter.
- `hipodromo.id` sigue `null` y `tipo_codo` `null` (deltas #8 y #3 del diagnóstico del 22/08) — no los pidió ahora, no los mencioné.
