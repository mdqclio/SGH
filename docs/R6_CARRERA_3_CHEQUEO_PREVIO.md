# R6 · carrera 3 — chequeo previo a re-oficializar

**READ-ONLY. NO se re-oficializó nada.** 3 SELECT.

> # 🛑 NO ESTÁN TODAS RESUELTAS — no se oficializó
>
> **6 de las 7 ratificadas de la carrera 3 tienen `propietario_id` en NULL.**
> Oficializar ahora generaría exactamente el problema que acabamos de arreglar en R8:
> liquidaciones sin la parte del propietario, que es el **70%**.

---

## 1 · El conteo

```sql
WITH r6 AS (SELECT id FROM reuniones
            WHERE numero=6 AND club_id='0649e9c5-9e87-4aad-842f-101458e6b33c')
SELECT i.estado, count(*) AS inscripciones,
       count(i.propietario_id) AS con_prop,
       count(*) FILTER (WHERE i.propietario_id IS NULL) AS sin_prop
FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
WHERE c.reunion_id=(SELECT id FROM r6) AND c.numero_carrera_programa=3
GROUP BY ROLLUP (i.estado) ORDER BY 1;
```

| estado | inscripciones | con propietario | **sin propietario** |
|---|---|---|---|
| **ratificado** | 7 | **1** | **6** |
| forfait | 4 | 0 | 4 |
| **total** | 11 | 1 | 10 |

Las 4 `forfait` no generan líneas: no importan. **Lo que bloquea son las 6 ratificadas.**

## 2 · Cuáles, y de qué caballerizas

```sql
SELECT rp.posicion, rp.no_largo, s.nombre AS ejemplar, cab.nombre AS caballeriza,
       p.nombre AS propietario,
       EXISTS (SELECT 1 FROM caballeriza_responsables cr
               WHERE cr.caballeriza_id=i.caballeriza_id
                 AND cr.rol='propietario' AND cr.activo) AS cab_tiene_responsable
FROM carreras c
JOIN resultados res ON res.carrera_id=c.id
JOIN resultado_posiciones rp ON rp.resultado_id=res.id
JOIN inscripciones i ON i.id=rp.inscripcion_id
JOIN spcs s ON s.id=i.spc_id
LEFT JOIN caballerizas cab ON cab.id=i.caballeriza_id
LEFT JOIN propietarios p ON p.id=i.propietario_id
WHERE c.reunion_id=<R6> AND c.numero_carrera_programa=3
ORDER BY rp.posicion NULLS LAST;
```

| pos | ejemplar | caballeriza | propietario | ¿la caballeriza tiene responsable? |
|---|---|---|---|---|
| **1** | SIEMPREHAYESPERANZA | **LA BETTY (TDL)** | **NULL** | **no** |
| **2** | SANTA LISA | LAGUNA VERDE | **NULL** | sí ⚠️ |
| **3** | DOCTORA MIA | **HARAS EL ORIGEN** | **NULL** | **no** |
| **4** | LOCA DUBAI | RD NECOCHEA | **NULL** | sí ⚠️ |
| **5** | MARUKA PLUS | LOS CATACHOS | **NULL** | sí ⚠️ |
| 6 | LA SENTADA | POR TU CULPA | CIMA, JUAN CARLOS | sí |
| — | TALENTOSA CATCH *(no largó)* | **GARIN CITY (LP)** | **NULL** | **no** |

**El único puesto con dueño resuelto es el 6°** — y es justo el que sólo cobra bono, no
premio. **Los cinco puestos que reparten premio no tienen propietario.**

### Lo que se perdería oficializando ahora

Según el cálculo validado de `docs/R6_CARRERA_3_PENDIENTE.md`: las 23 líneas / $520.044,17
que se generarían **no incluyen ni un peso de propietario por premio**. Falta el 70% de los
cinco puestos:

| pos | premio | 70% del propietario |
|---|---|---|
| 1° | $882.500,00 | $617.750,00 |
| 2° | $200.291,67 | $140.204,17 |
| 3° | $126.500,00 | $88.550,00 |
| 4° | $100.000,00 | $70.000,00 |
| 5° | $100.000,00 | $70.000,00 |
| | | **$986.504,17** |

**Casi el doble de lo que sí se generaría.** Oficializar ahora deja esa plata sin liquidar y
la reunión con la foto incompleta — el mismo estado del que sacamos a R8 hoy.

## 3 · ⚠️ Las tres con responsable: OJO, son provisorios nuestros de hoy

```sql
SELECT cab.nombre AS caballeriza, p.nombre AS propietario,
       (p.notas LIKE 'provisorio R8%') AS es_provisorio_de_hoy, p.created_at
FROM caballerizas cab
JOIN caballeriza_responsables cr ON cr.caballeriza_id=cab.id
     AND cr.rol='propietario' AND cr.activo
JOIN propietarios p ON p.id=cr.propietario_id
WHERE cab.id IN (<las 4 caballerizas con responsable>);
```

| caballeriza | propietario | ¿provisorio de hoy? | created_at |
|---|---|---|---|
| LAGUNA VERDE | LAGUNA VERDE | **sí** | 2026-08-18 16:16:40 |
| LOS CATACHOS | LOS CATACHOS | **sí** | 2026-08-18 16:16:40 |
| RD NECOCHEA | RD NECOCHEA | **sí** | 2026-08-18 16:16:40 |
| POR TU CULPA | CIMA, JUAN CARLOS | no | 2026-06-02 |

**Tres de las seis se resolverían solas con una re-derivación sobre R6 — pero apuntando a los
propietarios provisorios que creamos hoy para R8**, que son nombres de caballeriza sin
documento, no personas identificadas.

Eso es una **decisión de producto, no un paso mecánico**. En R8 se tomó a conciencia y con la
plata retenida hasta el 15/09. En R6 la situación es distinta: la reunión es del **20/06**,
lleva casi dos meses, y la retención anti-doping de sus premios ya venció. Si se re-deriva y
se oficializa, esa plata queda **pagable a nombre de una caballeriza**.

Las otras tres —**LA BETTY (TDL)**, **HARAS EL ORIGEN**, **GARIN CITY (LP)**— no tienen
ninguna fila de responsable, y dos parecen de otro hipódromo por el sufijo (TDL = Tandil,
LP = La Plata). Ésas no las resuelve ninguna re-derivación: hay que cargarlas.

## Qué haría falta antes de oficializar

1. **Decidir** si R6 también lleva propietarios provisorios, o si se espera el dato real.
2. Cargar responsable para **LA BETTY (TDL)**, **HARAS EL ORIGEN** y **GARIN CITY (LP)**
   *(esta última es la que no largó: no cobra premio, pero conviene igual)*.
3. Re-derivar `propietario_id` sobre R6 — el mismo UPDATE de B6, cambiando el `reunion_id`.
4. Verificar 7/7/0 sobre las ratificadas de la carrera 3.
5. Recién ahí re-oficializar.

**Nada de eso se hizo. La base quedó intacta: 3 SELECT, cero escritura.**

Cuando se destrabe, para el paso 1 de la ejecución: re-oficializar es desde
`resultados.html` → carrera 3 → **Oficializar**, que llama a la RPC `oficializar_carrera` y
dispara el motor sobre toda R6. No hay que apretar además "Recalcular reunión".
