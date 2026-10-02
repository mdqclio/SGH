# R9 — jockey en dos caballos del mismo turno: T3 (Ibarra), T5 (Arreguy), T11 (Aguirre). ¿Largaron? ¿Qué se liquidó y qué se pagó?

- **Fecha:** 2026-10-02
- **Modo:** SÓLO LECTURA (MCP `execute_sql`, sólo SELECT). No se tocó nada.
- **Código de referencia:** `main` = `16136744f31a267e4be5615af0b2b7edcf69a95d` (merge del PR #31, sólo el probe).
- **Guards:** pwd=/home/clio/dev/SGH · ref=unlhcuanfrtpatoipwve · spcs=238 (02/10 00:22 UTC; nada de esto escribe).
- **Origen:** los 11 rojos del probe `probe_aviso_jockey_repetido` (informe `2026-10-02_probe-aviso-jockey-tramo-d.md`). En la R9
  actual hay un mismo jockey en dos caballos activos en T3, T5 y T11.

## Respuesta corta

| Caso | Turno → carrera del programa | ¿Largaron los dos? | Líneas de monta del jockey en esa carrera | ¿Recibo pagado por los dos? |
|---|---|---|---|---|
| **Ibarra** — DOCTOR SKY / DOCTORA MIA | T3 → **C7** | **No se corrió**: C7 no tiene resultado (R9 se suspendió tras la 5ª) | **0** | **No** (no hay líneas) |
| **Arreguy** — CHE CARABANERA / OJO EXCELENTE | T5 → **C4** (oficial) | **No**: CHE CARABANERA **no largó** (`no_largo = true`); OJO EXCELENTE **1°** | **1**: premio 1° de OJO EXCELENTE, $95.000, **retenido**, sin recibo | **No.** CHE CARABANERA tiene **0 líneas**. El único recibo de Arreguy en R9 (N° 57) paga otras dos cosas |
| **Aguirre** — ABARAJALA / BABY PARADISE | T11 → **C8** | **No se corrió**: C8 no tiene resultado | **0** | **No** (no hay líneas) |

**En ningún caso hay doble monta liquidada ni pagada.** La única carrera corrida de las tres (C4) es el caso del backfill: el
jockey quedó cargado en el caballo que no largó, como pasó en R8 T5 con Aguirre. El motor no le generó línea a ese caballo.

## Detalle

### Arreguy en C4 (T5)

- CHE CARABANERA: `ratificado`, `no_largo = true`, sin posición → **0 líneas** de ningún beneficiario.
- OJO EXCELENTE: `ratificado`, **1°**. Arreguy se cargó como jockey el **20/09 18:17 UTC** (auditoría, informe del tramo D).
  Tiene 8 líneas: la de Arreguy es `premio` "Carrera 4 — 1° puesto", $95.000, `retenido`, sin recibo (retención anti-doping
  de los ganadores). La otra de $95.000 `profesional` y las 3 `actuacion` (38.000 / 28.500 / 9.500) son del entrenador y sus
  sub-roles (las líneas de Arreguy en C4 son una sola: ver A.1).
- **Recibo N° 57** (Arreguy, efectivo, $70.000, emitido el 20/09 18:31 UTC, `emitido`): paga el `premio` de **C2** (LOGUACIOUS,
  4°, $10.000) + el `incentivo_jockey` de la reunión ($60.000). Nada de C4.
- Otras líneas de Arreguy en R9: premio de C3 (FREE CRY, $90.000, retenido).

### Ibarra en C7 (T3) y Aguirre en C8 (T11)

C7 y C8 son las carreras 7 y 8 del programa; R9 corrió de la C1 a la C5. No tienen resultado ni posiciones, y no hay ninguna
línea de liquidación atada a esos caballos. Los dos jockeys tienen su `incentivo_jockey` de la reunión (Ibarra impago, Aguirre
impago; criterio "haya corrido o no", ISSUE-085). Esa línea es por reunión y no depende de este turno.

### Lateral (no pedido, lo anoto)

- El resultado de C4 está `oficial` con `oficializado_at = NULL`.

## Anexo — consultas y salidas crudas (tal como se corrieron)

### A.0 Columnas de las tablas usadas

```sql
select table_name, string_agg(column_name||':'||data_type, ', ' order by ordinal_position) cols from information_schema.columns where table_schema='public' and table_name in ('liquidacion_detalle','liquidaciones','recibos','recibo_lineas','resultado_posiciones','resultados') group by 1;
```

```json
[{"table_name":"liquidacion_detalle","cols":"id:uuid, liquidacion_id:uuid, carrera_id:uuid, concepto:character varying, descripcion:text, monto_bruto:numeric, porcentaje_desc:numeric, monto_descuento:numeric, monto_neto:numeric, orden_display:integer, estado_linea:USER-DEFINED, concepto_tipo:USER-DEFINED, posicion:integer, inscripcion_id:uuid, fecha_liberacion:date, pagado_at:timestamp with time zone, recibo_id:uuid, beneficiario_tipo:USER-DEFINED, beneficiario_id:uuid, reunion_id:uuid"},{"table_name":"liquidaciones","cols":"id:uuid, club_id:uuid, reunion_id:uuid, profesional_id:uuid, propietario_id:uuid, periodo_desde:date, periodo_hasta:date, total_bruto:numeric, total_descuentos:numeric, total_neto:numeric, estado:USER-DEFINED, numero_recibo:character varying, recibo_pdf_url:text, aprobado_por:uuid, pagado_at:timestamp with time zone, notas:text, created_at:timestamp with time zone"},{"table_name":"recibos","cols":"id:uuid, club_id:uuid, numero_recibo:integer, beneficiario_tipo:USER-DEFINED, profesional_id:uuid, propietario_id:uuid, forma_pago:USER-DEFINED, total_premios:numeric, total_descuentos:numeric, retencion_dgi:numeric, neto_a_cobrar:numeric, cobrador_nombre:text, cobrador_documento:text, comprobante_url:text, estado:USER-DEFINED, emitido_por:uuid, emitido_at:timestamp with time zone, anulado_at:timestamp with time zone, notas:text, created_at:timestamp with time zone, anulado_por:uuid, motivo_anulacion:text, lineas_anuladas:jsonb"},{"table_name":"resultado_posiciones","cols":"id:uuid, resultado_id:uuid, inscripcion_id:uuid, posicion:integer, tiempo:character varying, diferencia:character varying, descalificado:boolean, motivo_desc:text, empate:boolean, dividendo:numeric, no_largo:boolean"},{"table_name":"resultados","cols":"id:uuid, carrera_id:uuid, estado:USER-DEFINED, tiempo_ganador:character varying, dividendos:jsonb, incidentes:text, observaciones:text, oficializado_por:uuid, oficializado_at:timestamp with time zone, created_at:timestamp with time zone, estado_pista:character varying, favorito_mandil:integer, redistribucion_legs:jsonb, updated_at:timestamp with time zone"}]
```

### A.1 Los tres casos: caballos, si largaron, líneas del jockey en esa carrera y en el resto de R9

```sql
with casos(turno, jockey) as (values (3,'IBARRA'),(5,'ARREGUY'),(11,'AGUIRRE')),
c as (
  select k.turno, k.jockey, ca.id carrera_id, ca.numero_carrera_programa, ca.estado carrera_estado, p.id jockey_id, p.apellido||', '||p.nombre jockey_nombre
  from casos k join carreras ca on ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and ca.numero_turno=k.turno
  join profesionales p on p.club_id=ca.reunion_id::text::uuid is null or true
  where p.apellido ilike k.jockey and p.tipo in ('jockey','ambos') and p.id in (select jockey_titular_id from inscripciones where carrera_id=ca.id)
)
select json_agg(json_build_object(
  'turno', c.turno, 'carrera_programa', c.numero_carrera_programa, 'carrera_estado', c.carrera_estado, 'jockey', c.jockey_nombre, 'jockey_id', c.jockey_id,
  'resultado', (select json_build_object('estado', r.estado, 'oficializado_at', r.oficializado_at) from resultados r where r.carrera_id=c.carrera_id),
  'caballos', (select json_agg(json_build_object('insc_id', i.id, 'caballo', s.nombre, 'estado_insc', i.estado, 'motivo_estado', i.motivo_estado,
        'posicion', rp.posicion, 'no_largo', rp.no_largo, 'descalificado', rp.descalificado) order by s.nombre)
      from inscripciones i join spcs s on s.id=i.spc_id
      left join resultados r on r.carrera_id=i.carrera_id left join resultado_posiciones rp on rp.resultado_id=r.id and rp.inscripcion_id=i.id
      where i.carrera_id=c.carrera_id and i.jockey_titular_id=c.jockey_id),
  'lineas_jockey_en_esa_carrera', (select json_agg(json_build_object('linea', d.id, 'concepto_tipo', d.concepto_tipo, 'concepto', d.concepto, 'caballo', (select s2.nombre from inscripciones i2 join spcs s2 on s2.id=i2.spc_id where i2.id=d.inscripcion_id),
        'monto_neto', d.monto_neto, 'estado_linea', d.estado_linea, 'pagado_at', d.pagado_at, 'recibo_id', d.recibo_id,
        'recibo', (select json_build_object('numero', rc.numero_recibo, 'estado', rc.estado, 'forma_pago', rc.forma_pago, 'neto', rc.neto_a_cobrar, 'emitido_at', rc.emitido_at) from recibos rc where rc.id=d.recibo_id)) order by d.concepto_tipo, d.id)
      from liquidacion_detalle d where d.carrera_id=c.carrera_id and d.beneficiario_tipo='profesional' and d.beneficiario_id=c.jockey_id),
  'lineas_jockey_en_R9_otras_carreras', (select json_agg(json_build_object('carrera_turno', (select ca2.numero_turno from carreras ca2 where ca2.id=d.carrera_id), 'concepto_tipo', d.concepto_tipo, 'caballo', (select s2.nombre from inscripciones i2 join spcs s2 on s2.id=i2.spc_id where i2.id=d.inscripcion_id),
        'monto_neto', d.monto_neto, 'estado_linea', d.estado_linea, 'recibo_numero', (select rc.numero_recibo from recibos rc where rc.id=d.recibo_id)) order by d.carrera_id)
      from liquidacion_detalle d where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and d.beneficiario_tipo='profesional' and d.beneficiario_id=c.jockey_id and d.carrera_id is distinct from c.carrera_id)
) order by c.turno) r from c;
```

(El `join profesionales p on … is null or true` es un join sin condición: el filtro real es apellido + tipo + que el
profesional sea el jockey de alguna inscripción de esa carrera. Da un solo jockey por caso, como se ve abajo.)

```json
[{"r":[{"turno":3,"carrera_programa":7,"carrera_estado":"abierta","jockey":"IBARRA, FERNANDO AUGUSTO","jockey_id":"8f24be30-e951-4287-82bd-2db54d0e32dc","resultado":null,"caballos":[{"insc_id":"b4ecb6e3-84c7-43ea-b4a8-2237450a5872","caballo":"DOCTOR SKY","estado_insc":"ratificado","motivo_estado":null,"posicion":null,"no_largo":null,"descalificado":null},{"insc_id":"76625ff6-926c-4bbb-ac5b-bdd086284465","caballo":"DOCTORA MIA","estado_insc":"ratificado","motivo_estado":null,"posicion":null,"no_largo":null,"descalificado":null}],"lineas_jockey_en_esa_carrera":null,"lineas_jockey_en_R9_otras_carreras":[{"carrera_turno":7,"concepto_tipo":"premio","caballo":"YOOKY","monto_neto":14300,"estado_linea":"impago","recibo_numero":null},{"carrera_turno":6,"concepto_tipo":"premio","caballo":"FALAYS","monto_neto":20583.33,"estado_linea":"retenido","recibo_numero":null},{"carrera_turno":null,"concepto_tipo":"incentivo_jockey","caballo":null,"monto_neto":60000,"estado_linea":"impago","recibo_numero":null}]},{"turno":5,"carrera_programa":4,"carrera_estado":"abierta","jockey":"ARREGUY, FRANCISCO","jockey_id":"7dcddbdb-52dc-4f56-8010-0fc8a5de9dcb","resultado":{"estado":"oficial","oficializado_at":null},"caballos":[{"insc_id":"1b68dc4d-7ee0-4434-8385-18922c1f79fa","caballo":"CHE CARABANERA","estado_insc":"ratificado","motivo_estado":null,"posicion":null,"no_largo":true,"descalificado":false},{"insc_id":"5f416dc2-abaf-4856-87b9-c1ccb9705b34","caballo":"OJO EXCELENTE","estado_insc":"ratificado","motivo_estado":null,"posicion":1,"no_largo":false,"descalificado":false}],"lineas_jockey_en_esa_carrera":[{"linea":"57bc0bd2-fdc3-4794-8546-a73383cf0731","concepto_tipo":"premio","concepto":"Carrera 4 — 1° puesto","caballo":"OJO EXCELENTE","monto_neto":95000,"estado_linea":"retenido","pagado_at":null,"recibo_id":null,"recibo":null}],"lineas_jockey_en_R9_otras_carreras":[{"carrera_turno":6,"concepto_tipo":"premio","caballo":"FREE CRY","monto_neto":90000,"estado_linea":"retenido","recibo_numero":null},{"carrera_turno":4,"concepto_tipo":"premio","caballo":"LOGUACIOUS","monto_neto":10000,"estado_linea":"pagado","recibo_numero":57},{"carrera_turno":null,"concepto_tipo":"incentivo_jockey","caballo":null,"monto_neto":60000,"estado_linea":"pagado","recibo_numero":57}]},{"turno":11,"carrera_programa":8,"carrera_estado":"abierta","jockey":"AGUIRRE, HUGO","jockey_id":"a66df20c-cd72-4125-a1d7-b32e48fcf037","resultado":null,"caballos":[{"insc_id":"967d541d-418f-4f3d-94e9-3ab47154f909","caballo":"ABARAJALA","estado_insc":"ratificado","motivo_estado":null,"posicion":null,"no_largo":null,"descalificado":null},{"insc_id":"a2bc15ea-857c-4cf9-8ced-307f7d3820f8","caballo":"BABY PARADISE","estado_insc":"ratificado","motivo_estado":null,"posicion":null,"no_largo":null,"descalificado":null}],"lineas_jockey_en_esa_carrera":null,"lineas_jockey_en_R9_otras_carreras":[{"carrera_turno":null,"concepto_tipo":"incentivo_jockey","caballo":null,"monto_neto":60000,"estado_linea":"impago","recibo_numero":null}]}]}]
```

Nota de lectura: `carrera_turno` en "otras carreras" es el **turno**. Para Arreguy, el premio de LOGUACIOUS es del turno 4 = C2;
FREE CRY, del turno 6 = C3. Para Ibarra, YOOKY es del turno 7 = C5, y FALAYS del turno 6 = C3 (mapa turno → programa en A.2).

### A.2 Carreras de R9 con resultado, recibo 57 y líneas por inscripción de los seis caballos

```sql
select json_build_object(
 'carreras_r9', (select json_agg(json_build_object('turno', ca.numero_turno, 'programa', ca.numero_carrera_programa, 'estado', ca.estado, 'resultado', r.estado, 'posiciones', (select count(*) from resultado_posiciones rp where rp.resultado_id=r.id), 'no_largo', (select count(*) from resultado_posiciones rp where rp.resultado_id=r.id and rp.no_largo)) order by ca.numero_carrera_programa nulls last, ca.numero_turno) from carreras ca left join resultados r on r.carrera_id=ca.id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'),
 'recibo_57', (select json_build_object('id', rc.id, 'numero', rc.numero_recibo, 'estado', rc.estado, 'forma_pago', rc.forma_pago, 'beneficiario', (select p.apellido||', '||p.nombre from profesionales p where p.id=rc.profesional_id), 'neto', rc.neto_a_cobrar, 'emitido_at', rc.emitido_at,
   'lineas', (select json_agg(json_build_object('turno', (select ca.numero_turno from carreras ca where ca.id=d.carrera_id), 'programa', (select ca.numero_carrera_programa from carreras ca where ca.id=d.carrera_id), 'concepto_tipo', d.concepto_tipo, 'concepto', d.concepto, 'caballo', (select s.nombre from inscripciones i join spcs s on s.id=i.spc_id where i.id=d.inscripcion_id), 'neto', d.monto_neto, 'estado_linea', d.estado_linea) order by d.concepto_tipo) from liquidacion_detalle d where d.recibo_id=rc.id))
   from recibos rc where rc.numero_recibo=57 and rc.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'),
 'lineas_por_inscripcion_casos', (select json_agg(json_build_object('caballo', s.nombre, 'n_lineas', (select count(*) from liquidacion_detalle d where d.inscripcion_id=i.id), 'detalle', (select json_agg(json_build_object('benef_tipo', d.beneficiario_tipo, 'concepto_tipo', d.concepto_tipo, 'neto', d.monto_neto, 'estado', d.estado_linea, 'recibo', d.recibo_id)) from liquidacion_detalle d where d.inscripcion_id=i.id)) order by s.nombre)
   from inscripciones i join spcs s on s.id=i.spc_id where i.id in ('b4ecb6e3-84c7-43ea-b4a8-2237450a5872','76625ff6-926c-4bbb-ac5b-bdd086284465','1b68dc4d-7ee0-4434-8385-18922c1f79fa','5f416dc2-abaf-4856-87b9-c1ccb9705b34','967d541d-418f-4f3d-94e9-3ab47154f909','a2bc15ea-857c-4cf9-8ced-307f7d3820f8'))
) r;
```

```json
[{"r":{"carreras_r9":[{"turno":1,"programa":1,"estado":null,"resultado":"oficial","posiciones":9,"no_largo":3},{"turno":4,"programa":2,"estado":"abierta","resultado":"oficial","posiciones":11,"no_largo":1},{"turno":6,"programa":3,"estado":"abierta","resultado":"oficial","posiciones":7,"no_largo":3},{"turno":5,"programa":4,"estado":"abierta","resultado":"oficial","posiciones":7,"no_largo":3},{"turno":7,"programa":5,"estado":"abierta","resultado":"oficial","posiciones":8,"no_largo":2},{"turno":9,"programa":6,"estado":"abierta","resultado":null,"posiciones":0,"no_largo":0},{"turno":3,"programa":7,"estado":"abierta","resultado":null,"posiciones":0,"no_largo":0},{"turno":11,"programa":8,"estado":"abierta","resultado":null,"posiciones":0,"no_largo":0},{"turno":2,"programa":null,"estado":"anulada","resultado":null,"posiciones":0,"no_largo":0},{"turno":8,"programa":null,"estado":"anulada","resultado":null,"posiciones":0,"no_largo":0},{"turno":10,"programa":null,"estado":"anulada","resultado":null,"posiciones":0,"no_largo":0}],"recibo_57":{"id":"82edda6f-584e-4308-9f82-f928996b8c67","numero":57,"estado":"emitido","forma_pago":"efectivo","beneficiario":"ARREGUY, FRANCISCO","neto":70000,"emitido_at":"2026-09-20T18:31:13.321756+00:00","lineas":[{"turno":4,"programa":2,"concepto_tipo":"premio","concepto":"Carrera 2 — 4° puesto","caballo":"LOGUACIOUS","neto":10000,"estado_linea":"pagado"},{"turno":null,"programa":null,"concepto_tipo":"incentivo_jockey","concepto":"Incentivo jockey","caballo":null,"neto":60000,"estado_linea":"pagado"}]},"lineas_por_inscripcion_casos":[{"caballo":"ABARAJALA","n_lineas":0,"detalle":null},{"caballo":"BABY PARADISE","n_lineas":0,"detalle":null},{"caballo":"CHE CARABANERA","n_lineas":0,"detalle":null},{"caballo":"DOCTOR SKY","n_lineas":0,"detalle":null},{"caballo":"DOCTORA MIA","n_lineas":0,"detalle":null},{"caballo":"OJO EXCELENTE","n_lineas":8,"detalle":[{"benef_tipo":"profesional","concepto_tipo":"incentivo_entrenador","neto":10000,"estado":"pagado","recibo":"8ea1f38c-e182-480d-b242-3b1f899a8058"},{"benef_tipo":"club","concepto_tipo":"fondo_solidario","neto":19000,"estado":"impago","recibo":null},{"benef_tipo":"profesional","concepto_tipo":"premio","neto":95000,"estado":"retenido","recibo":null},{"benef_tipo":"propietario","concepto_tipo":"premio","neto":665000,"estado":"retenido","recibo":null},{"benef_tipo":"profesional","concepto_tipo":"premio","neto":95000,"estado":"retenido","recibo":null},{"benef_tipo":"profesional","concepto_tipo":"actuacion","neto":38000,"estado":"retenido","recibo":null},{"benef_tipo":"profesional","concepto_tipo":"actuacion","neto":28500,"estado":"retenido","recibo":null},{"benef_tipo":"profesional","concepto_tipo":"actuacion","neto":9500,"estado":"retenido","recibo":null}]}]}}]
```

## Preguntas abiertas

1. Ninguna de las tres terminó en doble pago. El aviso de la pantalla sigue siendo correcto: que no bloquee es el diseño del 12/09.
2. Sigue el paso 2 (los asserts R9/A/B a casos sintéticos o a la 9999, PR aparte). Estos datos confirman que el cambio en R9 es
   operativo (ratificación y día de carrera) y no un error: no hay nada que "arreglar" en R9.

---

## Verificación de push

```
$ git ls-remote origin reports
13da8f40ce438c640e980a115096845197a5f340	refs/heads/reports
$ git rev-parse HEAD
13da8f40ce438c640e980a115096845197a5f340
```

Coinciden. Este bloque va en un commit posterior.
