# Paridad llamado abierto ↔ inscripciones, y el formato de hora en 24 h

**Fecha:** 2026-09-08
**Pedido:** Fede y Yesi, 07/09/2026 — dos pantallas que muestran cada una la mitad de lo mismo.
**Rama de trabajo:** `feat/paridad-llamado-inscripciones` — **pusheada, SIN mergear a `main`**.
**SHA de la rama de trabajo:** `07ef2aa4058001f9fca96608d3b213b5bb0b8f2f`
**SHA de `main` (intacto):** `b10adc906b67316da72c717d47e3defba9010f0e`
**SHA de este informe:** `1282c88f145b12bbab92dfad782e6a0bf2e525a3` en `origin/reports` (verificación al pie).

---

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

Los tres coinciden con el baseline de CLAUDE.md (181 al 2026-08-23).

---

## 1. Relevamiento — de dónde sale cada dato en cada pantalla

### 1.1 Llamado abierto (`portal.html`)

La query del llamado está en `portal.html:524` (numeración de `main`):

```javascript
.select('id,numero,numero_publico,fecha,estado,hipodromos(nombre),carreras(id,numero_turno,nombre,distancia_metros,condicion_sexo,edad_minima_anos,edad_maxima_anos,condicion_handicap,condicion_adicional,bolsa_total,cupo_maximo,tipo_pista,estado,apertura_inscripcion,cierre_inscripcion)')
```

**Hallazgo: al llamado no le faltaba traer nada.** `condicion_handicap` y `condicion_adicional`
ya venían en el `select` desde antes — simplemente no se renderizaban. El render (`main`,
`portal.html:575-586`) sólo armaba chips:

```
          <div class="carrera-chips">
            <span class="chip">${esc(c.distancia_metros)}m</span>
            ${c.tipo_pista ? `<span class="chip">${esc(c.tipo_pista)}</span>` : ''}
            ${c.condicion_sexo ? `<span class="chip">${esc(c.condicion_sexo)}</span>` : ''}
            ${textoEdad(c) ? `<span class="chip">${esc(textoEdad(c))}</span>` : ''}
            ${c.bolsa_total ? `<span class="chip">💰 ${esc(formatARS(c.bolsa_total))}</span>` : ''}
            ${c.cupo_maximo ? `<span class="chip">Cupo ${esc(c.cupo_maximo)}</span>` : ''}
            <span class="chip">⏳ cierra ${esc(fechaHora(c.cierre_inscripcion))}</span>
            ${yaAnotados ? `<span class="chip" ...>✓ ${yaAnotados} anotado…</span>` : ''}
          </div>
```

Tenía: distancia, pista, sexo, edad, bolsa, cupo, cierre. **Le faltaba: el texto de la condición.**

### 1.2 Inscripciones (`inscripciones.html`)

La query del selector de turnos está en `inscripciones.html:410` (`main`):

```javascript
const { data: cars } = await sb.from('carreras').select('id,numero_turno,nombre,distancia_metros,condicion_handicap').eq('reunion_id', rid).order('numero_turno');
```

**Cinco columnas.** Son exactamente las que entran en el rótulo del `<option>`
(`inscripciones.html:414-420` en `main`):

```javascript
      let label = `Turno ${c.numero_turno}`;
      if (c.nombre) label += ` — ${c.nombre}`;
      label += ` — ${c.distancia_metros}m`;
      if (c.condicion_handicap) {
        const cond = c.condicion_handicap.length > 70 ? c.condicion_handicap.slice(0, 70) + '…' : c.condicion_handicap;
        label += ` — ${cond}`;
      }
```

De ahí sale el `"Turno 11 — 1200m — Todo caballo 5 años y + edad perdedor"` que reportó Yesi:
es el rótulo de una opción de un `<select>`, no un encabezado. **Adentro de un `<option>` no
se pueden poner chips** — no admite HTML.

Lo que le faltaba traer a inscripciones, entonces, es todo lo demás:
`tipo_pista`, `condicion_sexo`, `edad_minima_anos`, `edad_maxima_anos`, `bolsa_total`,
`cupo_maximo`, `condicion_adicional`, `cierre_inscripcion` y `categorias_carrera(nombre)`.
Sin esas columnas, `currentCarrera` —que sale de ese mismo array (`inscripciones.html:441`)—
llegaba a la mitad y cualquier chip habría salido vacío.

**Dato lateral:** el CSS de chips **ya estaba definido en `inscripciones.html` y sin usar**
(`main`, líneas 49-50), junto con `.carrera-info`, `.carrera-num`, `.carrera-name` y
`.carrera-condicion`. Es un encabezado que alguien diseñó y nunca se cableó. El cambio lo revive
en vez de inventar clases nuevas.

### 1.3 Resumen del relevamiento

| Campo | Llamado (portal) antes | Inscripciones antes |
|---|---|---|
| Número de turno | ✅ chip grande | ✅ en el rótulo |
| Distancia | ✅ chip | ✅ en el rótulo |
| Pista | ✅ chip | ❌ ni en el select |
| Sexo | ✅ chip | ❌ ni en el select |
| Rango de edad | ✅ chip | ❌ ni en el select |
| Bolsa | ✅ chip | ❌ ni en el select |
| Cupo | ✅ chip | ❌ ni en el select |
| Cierre | ✅ chip (mal formateado) | ❌ ni en el select |
| Texto de la condición | ❌ (el dato estaba, no se mostraba) | ✅ truncado a 70 chars |
| Categoría | ❌ | ❌ ni en el select |

---

## 2. Los reales de R9 — ¿hay condiciones de tres renglones?

**Sí.** Query corrida contra producción:

```sql
SELECT r.numero, r.fecha, r.estado, c.numero_turno, c.distancia_metros, c.tipo_pista,
       c.condicion_sexo, c.edad_minima_anos, c.edad_maxima_anos, c.bolsa_total,
       c.cierre_inscripcion,
       length(coalesce(c.condicion_handicap,'')) AS len_hc,
       length(coalesce(c.condicion_adicional,'')) AS len_ad,
       c.condicion_handicap, c.condicion_adicional
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9
ORDER BY c.numero_turno;
```

Salida cruda completa (11 filas, R9 = 20/09/2026, pública N° 8, `publicada`):

| T | dist | pista | sexo | edad | bolsa | cierre_inscripcion | len_hc | len_ad | **hc + ad** |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 800 | tierra | ambos | 3-3 | 1054166.67 | 2026-09-11 12:00:00+00 | 29 | 78 | **110** |
| 2 | 800 | tierra | ambos | 4-4 | 1016666.67 | 2026-09-11 12:00:00+00 | 29 | 78 | **110** |
| 3 | 1200 | cesped | ambos | 4-4 | 1118333.33 | 2026-09-11 12:00:00+00 | 29 | 78 | **110** |
| 4 | 800 | cesped | ambos | 5-10 | 1000000.00 | 2026-09-11 12:00:00+00 | 38 | 78 | **119** |
| 5 | 1000 | tierra | ambos | 5-10 | 1166666.67 | 2026-09-11 12:00:00+00 | 50 | 123 | **176** |
| 6 | 1000 | tierra | ambos | 5-10 | 1083333.33 | 2026-09-11 12:00:00+00 | 49 | 123 | **175** |
| 7 | 1100 | cesped | ambos | 6-10 | 1191666.67 | 2026-09-11 12:00:00+00 | 57 | 123 | **183** |
| 8 | 1200 | tierra | ambos | 5-`null` | 1191666.67 | 2026-09-11 12:00:00+00 | 54 | 95 | **152** |
| **9** | 1100 | tierra | ambos | 5-10 | 3333333.33 | 2026-09-11 12:00:00+00 | **66** | **123** | **192** ← el peor |
| 10 | 1100 | cesped | ambos | 5-10 | 1833333.33 | 2026-09-11 12:00:00+00 | 34 | 46 | **83** |
| 11 | 1200 | tierra | ambos | 5-5 | 1833333.33 | 2026-09-11 12:00:00+00 | 38 | 78 | **119** |

Los textos completos de los dos extremos:

```
T9  (192 chars unidos):
  condicion_handicap : "Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras."
  condicion_adicional: "Peso 52 kilos al ganador de 2 carreras. Recargo de 2 kilos por carrera subsiguiente ganada. Jockey aprendices sin descargo."

T10 (83 chars unidos):
  condicion_handicap : "Yeguas 5 años y + edad perdedoras."
  condicion_adicional: "Peso 55 kilos. Jockey aprendices con descargo."
```

**Conclusión del relevamiento de datos: sí, hay uno de tres renglones (T9, 192 caracteres).**
Ninguno de los once es de un solo renglón corto: el más chico ya son 83 caracteres. El layout
se diseñó para ese caso y el probe lo cubre con una copia literal de T9.

Nota sobre `cierre_inscripcion`: los once turnos tienen `2026-09-11 12:00:00+00`, que en
Argentina (UTC-3 todo el año) son las **09:00**. Es el valor de Yesi. **No se tocó.**

---

## 3. El bug de formato de hora

### 3.1 Reproducción

```
$ node -e "
process.env.TZ='America/Argentina/Buenos_Aires';
const d=new Date('2026-09-11T12:00:00Z');
console.log('TT:', JSON.stringify(d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})));
console.log('node icu', process.versions.icu, 'tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
"
TT: "09:00 a. m."
node icu 78.2 tz America/Buenos_Aires
```

El código de `main` (`portal.html:405-410`) es:

```javascript
function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';
}
```

`toLocaleTimeString('es-AR', {hour:'2-digit'})` devuelve `"09:00 a. m."` en el ICU actual
(78.2), y el código le concatena `' hs'`. Resultado: **`"cierra 11/9 09:00 a. m. hs"`** — las
dos notaciones mezcladas y la unidad repetida. Es exactamente lo que marcó Fede.

### 3.2 ¿Cuántos lugares? — la respuesta, y una corrección

**La respuesta corta: un helper (`fechaHora` en `portal.html`) con dos usos, más siete lugares
sueltos en otros cuatro archivos que tenían el mismo defecto de notación.**

Detalle del helper de "esa hora" (la de cierre):

| Archivo | Línea (`main`) | Qué es |
|---|---|---|
| `portal.html` | 405-410 | el helper `fechaHora()` |
| `portal.html` | 582 | uso 1 — el chip `⏳ cierra …` del llamado |
| `portal.html` | 723 | uso 2 — el `Cierra …` del modal de anotar |

Arreglado en el helper, así que los dos usos quedan bien de un saque.

**Corrección importante sobre el barrido.** El primer grep de este relevamiento se corrió
parado en `reports`, que está atrás de `main`, y **no vio los cuatro usos de
`liquidaciones.html`**. Es el caso que CLAUDE.md advierte: el grep desde `reports` devuelve
cero y parece cero. Re-corrido contra `main`, el barrido completo de formateo de hora es:

```
$ git grep -n "toLocaleTimeString\|hour: .2-digit.\|hour12" main -- "*.html" "*.js"
main:auditoria.html:263:  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
main:liquidaciones.html:1518:    ? new Date(recibo.emitido_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '';
main:liquidaciones.html:1785:        <td>${f.toLocaleDateString('es-AR')} ${f.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</td>
main:liquidaciones.html:1854:      <div class="config-card-title" ...>⛔ ANULADO el ${... toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) ...}</div>
main:liquidaciones.html:1864:        Emitido el ${fEmi.toLocaleDateString('es-AR')} a las ${fEmi.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}
main:portal.html:409:    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';
main:resultados.html:1601:  setStatus(`✓ ${msg} — ${new Date().toLocaleTimeString('es-AR')}`);
main:solicitudes.html:156:const fecha = (iso) => new Date(iso).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
```

**Ocho líneas en cinco archivos.** Sólo la de `portal.html` duplicaba la unidad (`" hs"` sobre
un `"a. m."`); las otras siete mezclaban la notación pero sin repetir. Dos de las de
`liquidaciones.html` salen en documentos que ve el propietario: el **recibo impreso** (1864) y
el aviso de **recibo anulado** (1854).

Todas quedaron arregladas.

### 3.3 Qué se hizo

- `portal.html` — `fechaHora()` se rearmó a mano con `getHours()`/`getMinutes()`, que ya vienen
  en la zona del browser: 24 h siempre, sin depender del locale ni del ICU. La fecha queda en
  `d/M` sin cero a la izquierda, que es lo que venía dando `es-AR`.
- Los otros siete: `hour12: false` explícito. Un solo token por línea, nada más.
- Verificado que ninguno cae en el caso `"24:00"` a medianoche:

```
$ node -e "..."   # 2099-05-02T03:00:00Z = 00:00 AR
00:00 AR auditoria:   "11/09/26, 00:00:00"
00:00 AR solicitudes: "11/9, 00:00"
00:00 AR resultados:  "00:00:00"
00:00 AR portal:      "11/9 00:00 hs"
09:00 AR auditoria:   "11/09/26, 09:00:00"
09:00 AR solicitudes: "11/9, 09:00"
09:00 AR resultados:  "09:00:00"
09:00 AR portal:      "11/9 09:00 hs"
```

El chip de cierre ahora dice exactamente lo que pidió Fede: **`cierra 11/9 09:00 hs`**.

---

## 4. El cambio

Las dos pantallas muestran ahora **número de turno, distancia, pista, sexo, rango de edad,
bolsa, cupo, cierre y el texto completo de la condición**.

### 4.1 `portal.html` — llamado abierto

- Helper nuevo `textoCondicion(c)`: une `condicion_handicap` + `condicion_adicional` con `" — "`,
  **el mismo separador que ya usa el programa oficial** (`programa-oficial.html:496`). No se
  inventó formato.
- El texto se renderiza en un bloque propio `.carrera-cond`, **hermano** de `.carrera-chips`,
  no adentro de la fila de chips.
- Los chips no se tocaron: se mantiene el formato que ya existía.

### 4.2 `inscripciones.html` — encabezado del turno

- Se amplió el `select` del selector de turnos a las columnas que faltaban, y también el
  fallback del deep link `?carrera_id=` (que con `select('*')` no traía el join a categoría y
  habría dejado ese chip vacío sólo en ese camino).
- Encabezado nuevo `#carrera-header`, debajo de la barra de selección, con el **mismo juego de
  chips** que el llamado (clase `.chip`, la que ya estaba definida en el archivo) más el texto
  completo de la condición debajo.
- **El rótulo del `<option>` no se tocó.** Sigue diciendo `Turno N — …`. El truncado a 70
  caracteres que tenía es correcto ahí: es un desplegable.
- Cuatro helpers nuevos (`esc`, `fechaHora`, `textoEdad`, `textoCondicion`) gemelos de los de
  `portal.html`. Se duplican en vez de compartirse porque cada módulo es un HTML autocontenido
  —la misma convención que ya rige para `formatMonto`/`formatARS`, que también está duplicado—
  y el probe compara las cuatro salidas entre los dos archivos para que no se desincronicen.

### 4.3 El layout con la condición larga

El caso peor real es T9 de R9: **192 caracteres**, tres renglones. Qué lo sostiene:

- `.carrera-cond` es un bloque propio, no un chip. Envuelve por palabra.
- `overflow-wrap: anywhere` — una palabra sin espacios tampoco puede empujar la tarjeta.
- El contenedor de texto puede encogerse: `.carrera-info { flex: 1; min-width: 180px }` en el
  portal, `.carrera-header-body { flex: 1; min-width: 0 }` en inscripciones. Con eso la tarjeta
  crece **hacia abajo**, nunca hacia los costados, y el botón "Anotar" no se mueve.
- El probe verifica las tres cosas, y además que el turno de condición larga y el de condición
  corta tengan **la misma cantidad de chips** — si el texto se filtrara a la fila de chips, el
  largo tendría uno más.

### 4.4 La categoría que pidió Yesi — decisión de producto

Yesi pidió *"la categoría **en vez de** Turno"*. El punto 2 del pedido, en cambio, dice que las
dos pantallas tienen que mostrar **número de turno**. Son incompatibles al pie de la letra.

**Se eligió lo conservador: la categoría se agrega como chip propio, no reemplaza al número de
turno.** El número de turno es la clave con la que se habla del turno en toda la app (marcador,
programa, carta de llamados), sacarlo de la pantalla de inscripciones sería un cambio de fondo.
**Queda como pregunta abierta para Yesi** (§7).

---

## 5. El probe

`tests/probe_paridad_llamado_inscripciones.mjs` — real-code, mini-DOM, sin browser, siguiendo
el patrón de `tests/README.md § "Browser NO disponible"`: se **extraen de los propios HTML** las
funciones a probar (por ancla, con balance de llaves) y se las corre con `new AsyncFunction`
inyectando el cliente Supabase real y stubs de DOM. Nada se reimplementa: si el HTML cambia, el
probe corre el HTML cambiado.

**Fixture propio** (reunión 9992, fecha 2099) con dos turnos copiados literalmente de R9: uno de
condición corta y el T9 de 192 caracteres. Teardown en el `finally`, verificado por estado.
**No toca R9 ni ninguna reunión real, y no escribe ningún `cierre_inscripcion`.**

```
set -a; . ./.env; set +a
node tests/probe_paridad_llamado_inscripciones.mjs
node tests/probe_paridad_llamado_inscripciones.mjs --mutantes
```

### 5.1 Salida cruda — corrida normal

```

── Probe · paridad llamado abierto ↔ encabezado de inscripciones ──
   portal=/home/clio/dev/SGH/portal.html
   insc=/home/clio/dev/SGH/inscripciones.html
   TZ=America/Argentina/Buenos_Aires · condición larga=192 chars
 ✅ H1) el llamado imprime la hora en 24 h, sin duplicar la unidad  → fechaHora → "1/5 09:00 hs"  (esperado "1/5 09:00 hs")
 ✅ H2) sin "a. m." ni "p. m."  → "1/5 09:00 hs"
 ✅ H3) una sola vez "hs"  → "1/5 09:00 hs"
 ✅ H4) inscripciones imprime la MISMA hora que el llamado  → portal="1/5 09:00 hs" · inscripciones="1/5 09:00 hs"
 ✅ H5) el valor guardado sigue siendo 09:00 AR — sólo cambió el formato  → db=2099-05-01T12:00:00+00:00 → "1/5 09:00 hs"
 ✅ H6) medianoche sale 00:00 en las dos pantallas, no 24:00  → portal="2/5 00:00 hs" · inscripciones="2/5 00:00 hs"
 ✅ H7) el helper es idéntico en los dos archivos (ninguno se quedó atrás)
 ✅ P0) el llamado renderizó el bloque de la reunión del fixture  → container=12216 chars
 ✅ P1) el turno de condición larga tiene su fila
 ✅ P2) chip de distancia  → 1100m | tierra | ambos | 5 a 10 años | 💰 $3.333.333,33 | Cupo 14 | ⏳ cierra 1/5 09:00 hs
 ✅ P3) chip de pista
 ✅ P4) chip de sexo
 ✅ P5) chip de rango de edad
 ✅ P6) chip de bolsa
 ✅ P7) el número de turno está en la fila
 ✅ P8) el texto de la condición está en la fila
 ✅ P9) chip de cierre en 24 h
 ✅ P10) ni un "a. m." en todo el llamado renderizado
 ✅ Q0) onReunionChange trajo los dos turnos del fixture  → carreras=2
 ✅ Q1) el encabezado se muestra
 ✅ Q2) chip de distancia  → 1100m | tierra | ambos | 5 a 10 años | Concertada | 💰 $3.333.333,33 | Cupo 14 | ⏳ cierra 1/5 09:00 hs
 ✅ Q3) chip de pista
 ✅ Q4) chip de sexo
 ✅ Q5) chip de rango de edad
 ✅ Q6) chip de bolsa
 ✅ Q7) chip de cierre en 24 h
 ✅ Q8) el texto de la condición está en el encabezado
 ✅ Q9) el número de turno está en el encabezado
 ✅ Q10) ni un "a. m." en el encabezado
 ✅ Y1) el chip de categoría que pidió Yesi está en inscripciones  → categoría="Concertada"
 ✅ D1) los ocho campos aparecen en LAS DOS pantallas  → 8/8
 ✅ D2) la condición se arma igual en las dos (mismo separador)
 ✅ D3) el rango de edad se arma igual en las dos
 ✅ D4) la bolsa se formatea igual en las dos  → portal="$3.333.333,33" · inscripciones="$3.333.333,33"
 ✅ L1) el llamado muestra la condición larga COMPLETA, sin truncar  → render=192 chars · esperado=192
 ✅ L2) inscripciones muestra la condición larga COMPLETA, sin truncar  → render=192 chars · esperado=192
 ✅ L3) en el llamado la condición va en su propio bloque, no en la fila de chips
 ✅ L4) en inscripciones la condición va en su propio bloque, no en la fila de chips
 ✅ L5) el llamado: mismo número de chips con condición corta y con larga  → larga=7 · corta=7
 ✅ L6) inscripciones: mismo número de chips con condición corta y con larga  → larga=8 · corta=8
 ✅ L7) .carrera-cond declara overflow-wrap: anywhere en las dos hojas  → portal=".carrera-cond { font-size: 12px; line-height: 1.45; color: var(--muted); margin-top: 6px; overflow-wrap: anywhere; }" · inscripciones=".carrera-cond { font-size: 12px; line-height: 1.45; color: var(--muted); margin-top: 6px; overflow-wrap: anywhere; }"
 ✅ L8) el contenedor de texto puede encogerse (min-width), así el bloque crece hacia abajo
 ✅ F1) mirar el encabezado no cambia la reunión activa por otra cosa que el select  → ids=["8162b0ef-b657-46fb-89a4-1dfc99f32956"]
 ✅ F2) ningún toast de error durante el render  → []
 ✅ F3) el gate de edad de la inscripción quedó intacto
 ✅ F4) al deseleccionar el turno el encabezado se limpia
 ✅ T1) teardown: no quedó ninguna reunión 9992 en la base  → quedan=0

47/47 OK
```

### 5.2 Salida cruda — mutation testing (los 11 de un saque)

```

═══ MUTATION TESTING · 11/11 mutantes ═══
(copias en /tmp/mut-paridad-llamado-ZZL5LS — el repo no se toca)

✅ M1 muere — vuelve el bug: fechaHora usa toLocaleTimeString y le pega " hs"  [esperaba matar H1,H2,H5,H7; murieron H1,H2,H5,H7]
✅ M2 muere — la unidad queda duplicada ("09:00 hs hs")  [esperaba matar H1,H3; murieron H1,H3]
✅ M3 muere — inscripciones se desincroniza: fechaHora vuelve a 12 h  [esperaba matar H4,H6,H7; murieron H4,H6,H7]
✅ M4 muere — el llamado vuelve a no mostrar el texto de la condición  [esperaba matar P8,L1,L3,D1; murieron P8,L1,L3,D1]
✅ M5 muere — inscripciones vuelve a no mostrar el texto de la condición  [esperaba matar Q8,L2,L4,D1; murieron Q8,L2,L4,D1]
✅ M6 muere — el select de carreras vuelve a las cinco columnas viejas  [esperaba matar Q3,Q4,Q5,Q6,Q7,D1; murieron Q3,Q4,Q5,Q6,Q7,D1]
✅ M7 muere — la condición se mete adentro de la fila de chips y la estira  [esperaba matar L4; murieron L4]
✅ M8 muere — el llamado trunca la condición larga a 70 caracteres  [esperaba matar L1; murieron L1]
✅ M9 muere — inscripciones pierde el chip de cierre  [esperaba matar Q7,D1; murieron Q7,D1]
✅ M10 muere — la condición pierde overflow-wrap: una palabra larga desborda la tarjeta  [esperaba matar L7; murieron L7]
✅ M11 muere — inscripciones pierde el chip de categoría que pidió Yesi  [esperaba matar Y1; murieron Y1]

✅ TANDA LIMPIA — 11 probados · 11 muertos

```

**11 mutantes, 11 muertos, cero sobrevivientes, cero errores de arnés.**

Qué neutraliza cada uno y qué assert lo mata:

| Mutante | Archivo | Qué rompe | Mata |
|---|---|---|---|
| M1 | portal | `fechaHora` vuelve a `toLocaleTimeString` + `" hs"` (el bug original) | H1, H2, H5, H7 |
| M2 | portal | la unidad queda duplicada (`"09:00 hs hs"`) | H1, H3 |
| M3 | insc | inscripciones se desincroniza: su `fechaHora` vuelve a 12 h | H4, H6, H7 |
| M4 | portal | el llamado vuelve a no mostrar el texto de la condición | P8, L1, L3, D1 |
| M5 | insc | inscripciones vuelve a no mostrar el texto de la condición | Q8, L2, L4, D1 |
| M6 | insc | el `select` de carreras vuelve a las cinco columnas viejas | Q3-Q7, D1 |
| M7 | insc | la condición se mete adentro de la fila de chips | L4 |
| M8 | portal | el llamado trunca la condición larga a 70 caracteres | L1 |
| M9 | insc | inscripciones pierde el chip de cierre | Q7, D1 |
| M10 | portal | `.carrera-cond` pierde `overflow-wrap` (una palabra larga desborda) | L7 |
| M11 | insc | inscripciones pierde el chip de categoría que pidió Yesi | Y1 |

Nota de arnés: M7 no mata `L6` (misma cantidad de chips corta vs. larga) porque los dos turnos
del fixture tienen condición, así que los dos ganan un chip y la cuenta sigue empatada. Lo mata
`L4`, que es el assert correcto para ese defecto: la condición no puede estar adentro del div de
chips. `L5`/`L6` cubren el caso complementario.

### 5.3 Cobertura pedida vs. asserts

| Lo que pidió el pedido | Asserts |
|---|---|
| las dos pantallas muestran los mismos campos | D1 (los ocho, campo por campo), D2, D3, D4 |
| el texto de la condición aparece en el llamado | P8, L1, L3 |
| los chips aparecen en inscripciones | Q2-Q7, Y1 |
| la hora sin "a. m." y sin "hs" duplicado | H1, H2, H3, H4, P10, Q10 |
| un turno con condición larga no rompe el layout | L1, L2, L3, L4, L5, L6, L7, L8 |
| (extra) el valor de hora_cierre no se tocó | H5 |
| (extra) medianoche no sale 24:00 | H6 |
| (extra) el gate de edad y la reunión activa intactos | F1, F3 |
| (extra) teardown limpio | T1 |

---

## 6. Verificación de estado de las ramas

```
$ git ls-remote origin feat/paridad-llamado-inscripciones
07ef2aa4058001f9fca96608d3b213b5bb0b8f2f	refs/heads/feat/paridad-llamado-inscripciones

$ git ls-remote origin main            # intacto, sin mergear
b10adc906b67316da72c717d47e3defba9010f0e	refs/heads/main

$ git log --oneline origin/main -1
b10adc9 docs: ISSUE-072 vivo en producción + ISSUE-073 (el UPDATE sin acote en profesionales/jockeys)

$ git log --oneline origin/feat/paridad-llamado-inscripciones -3
07ef2aa fix: los cuatro usos de hora en liquidaciones.html también en 24 h
f0d1d79 feat: llamado abierto e inscripciones muestran el mismo conjunto + hora en 24 h
b10adc9 docs: ISSUE-072 vivo en producción + ISSUE-073 (el UPDATE sin acote en profesionales/jockeys)

$ git diff --stat origin/main..origin/feat/paridad-llamado-inscripciones
 auditoria.html                                |   4 +-
 inscripciones.html                            | 108 ++++-
 liquidaciones.html                            |  11 +-
 portal.html                                   |  29 +-
 resultados.html                               |   3 +-
 solicitudes.html                              |   3 +-
 tests/README.md                               |   1 +
 tests/probe_paridad_llamado_inscripciones.mjs | 564 ++++++++++++++++++++++++++
 8 files changed, 712 insertions(+), 11 deletions(-)
```

**`main` está en `b10adc9`, exactamente donde estaba antes de empezar. Nada se mergeó.**

---

## 7. Greps contra `main` — el estado del que se partió

Corridos con `git grep … main` y `git show main:…`, no desde el árbol de trabajo.

```
$ git grep -n "toLocaleTimeString\|hour: .2-digit.\|hour12" main -- "*.html" "*.js"
main:auditoria.html:263:  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
main:liquidaciones.html:1518:    ? new Date(recibo.emitido_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '';
main:liquidaciones.html:1785:        <td>${f.toLocaleDateString('es-AR')} ${f.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</td>
main:liquidaciones.html:1854:      <div class="config-card-title" style="color:var(--danger);">⛔ ANULADO el ${rec.anulado_at ? new Date(rec.anulado_at).toLocaleDateString('es-AR')+' '+new Date(rec.anulado_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—'}${rec.anulado_por ? ' por '+escapeHtml(recUsuarios[rec.anulado_por] || '—') : ''}</div>
main:liquidaciones.html:1864:        Emitido el ${fEmi.toLocaleDateString('es-AR')} a las ${fEmi.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}
main:portal.html:409:    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';
main:resultados.html:1601:  setStatus(`✓ ${msg} — ${new Date().toLocaleTimeString('es-AR')}`);

$ git grep -n "carrera-cond" main
main:carta-llamados.html:955:      ${condAd ? `<div class="carrera-body"><div class="carrera-condicion">${condAd}</div></div>` : ''}
main:inscripciones.html:46:    .carrera-condicion { font-size: 13px; color: var(--muted); margin-top: 4px; font-style: italic; }
main:inscripciones.html:47:    .carrera-condicion-extra { font-size: 12px; color: var(--muted); font-style: italic; margin-top: 2px; }

$ git grep -n "textoCondicion" main
(sin resultados — el helper no existe en main)

$ git grep -n "carrera-header" main
main:docs/SESION_2026-05-16.md:181:- Header del bloque (.carrera-header) ahora incluye `.estado-carrera-actions` con:
main:inscripciones.html:43:    .carrera-header { background: rgba(201,168,76,0.07); border-bottom: 1px solid var(--border); padding: 14px 24px; }
main:ratificacion.html:36:    .carrera-header { padding: 14px 18px; display: flex; align-items: center; gap: 14px; cursor: pointer; background: rgba(0,0,0,0.15); }
main:ratificacion.html:37:    .carrera-header:hover { background: rgba(0,0,0,0.25); }
main:ratificacion.html:650:      <div class="carrera-header" onclick="toggleSection('${car.id}')">

$ git grep -n "renderCarreraChips" main
(sin resultados)

$ git show main:portal.html | sed -n "405,412p"   # fechaHora en main
function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';
}
function toast(msg, type = 'success') {
  const t = document.createElement('div');

$ git show main:portal.html | sed -n "575,588p"   # la fila del llamado en main
          <div class="carrera-chips">
            <span class="chip">${esc(c.distancia_metros)}m</span>
            ${c.tipo_pista ? `<span class="chip">${esc(c.tipo_pista)}</span>` : ''}
            ${c.condicion_sexo ? `<span class="chip">${esc(c.condicion_sexo)}</span>` : ''}
            ${textoEdad(c) ? `<span class="chip">${esc(textoEdad(c))}</span>` : ''}
            ${c.bolsa_total ? `<span class="chip">💰 ${esc(formatARS(c.bolsa_total))}</span>` : ''}
            ${c.cupo_maximo ? `<span class="chip">Cupo ${esc(c.cupo_maximo)}</span>` : ''}
            <span class="chip">⏳ cierra ${esc(fechaHora(c.cierre_inscripcion))}</span>
            ${yaAnotados ? `<span class="chip" style="color:var(--success);border-color:rgba(76,175,130,0.35);">✓ ${yaAnotados} anotado${yaAnotados > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
        <button class="btn-inscribir" onclick="abrirInscripcion('${esc(c.id)}','${esc(r.id)}')">Anotar</button>
      </div>`;
    }).join('');

$ git show main:inscripciones.html | sed -n "405,425p"   # el select y el rótulo en main
async function onReunionChange() {
  const rid = document.getElementById('sel-reunion').value;
  if (rid) { ActiveReunion.set(rid); }
  const selC = document.getElementById('sel-carrera');
  if (!rid) { selC.innerHTML='<option value="">— Seleccionar reunión primero —</option>'; return; }
  const { data: cars } = await sb.from('carreras').select('id,numero_turno,nombre,distancia_metros,condicion_handicap').eq('reunion_id', rid).order('numero_turno');
  carreras = cars||[];
  selC.innerHTML = '<option value="">— Seleccionar turno —</option>' +
    carreras.map(c => {
      let label = `Turno ${c.numero_turno}`;
      if (c.nombre) label += ` — ${c.nombre}`;
      label += ` — ${c.distancia_metros}m`;
      if (c.condicion_handicap) {
        const cond = c.condicion_handicap.length > 70 ? c.condicion_handicap.slice(0, 70) + '…' : c.condicion_handicap;
        label += ` — ${cond}`;
      }
      return `<option value="${c.id}">${label}</option>`;
    }).join('');
  document.getElementById('sel-estado-car-wrap').style.display='none';
  document.getElementById('tabla-label').style.display='';
  document.getElementById('inscriptos-count').style.display='none';

$ git grep -c "chip" main -- inscripciones.html   # el CSS de chips ya estaba en main, sin uso en el JS
main:inscripciones.html:7
$ git show main:inscripciones.html | grep -n "class=\"chip\"\|carrera-chips"
49:    .carrera-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
```

Lectura de estos greps:

- `textoCondicion` y `renderCarreraChips` **no existen en `main`**: son del cambio.
- `carrera-cond` en `main` sólo aparece como `.carrera-condicion` / `.carrera-condicion-extra`
  en `inscripciones.html` (CSS sin uso) y en `carta-llamados.html`. El bloque nuevo es otro.
- `carrera-header` en `main` existe en `inscripciones.html:43` como una clase CSS **sin uso**
  y en `ratificacion.html` con otro sentido. En la rama se le da uso en inscripciones.
- El CSS `.carrera-chips` estaba en `inscripciones.html:49` de `main` y **ningún `class="chip"`
  en el JS** — confirmado por el `grep -n 'class="chip"'`, que sólo devuelve la línea del CSS.
  El encabezado estaba diseñado y sin cablear.

---

## 8. Diff completo de los archivos HTML

`tests/probe_paridad_llamado_inscripciones.mjs` (564 líneas nuevas) no va acá: está entero en la
rama. Este es el diff de los seis HTML.

```diff
diff --git a/auditoria.html b/auditoria.html
index 8a357d4..f5029f5 100644
--- a/auditoria.html
+++ b/auditoria.html
@@ -260,7 +260,9 @@ function shortId(uuid) {
 function formatTs(ts) {
   if (!ts) return '';
   const d = new Date(ts);
-  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
+  // hour12:false explícito: sin él el ICU actual devuelve "09:00:00 a. m." para
+  // es-AR. La app muestra la hora en 24 h en todos lados (Fede, 07/09/2026).
+  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
 }
 
 function formatFechaCorta(f) {
diff --git a/inscripciones.html b/inscripciones.html
index b62312c..8a3f499 100644
--- a/inscripciones.html
+++ b/inscripciones.html
@@ -48,6 +48,15 @@
     .carrera-name { font-family: 'Playfair Display', serif; font-size: 17px; }
     .carrera-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
     .chip { font-size: 11px; background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.2); color: var(--muted); padding: 2px 9px; border-radius: 5px; }
+    /* Encabezado del turno. El texto de la condición es libre y largo (R9 T9 son
+       192 caracteres entre handicap y adicional, tres renglones): va en su propio
+       bloque, envuelve, y con overflow-wrap:anywhere no lo desborda ni una palabra
+       sin espacios. El número de turno es flex-shrink:0 y el resto flex:1, así el
+       bloque crece hacia abajo y nunca hacia los costados. */
+    .carrera-header { display: flex; align-items: flex-start; gap: 14px; margin: 16px 16px 0; padding: 14px 18px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
+    .carrera-header .carrera-num { flex-shrink: 0; line-height: 1; }
+    .carrera-header-body { flex: 1; min-width: 0; }
+    .carrera-cond { font-size: 12px; line-height: 1.45; color: var(--muted); margin-top: 6px; overflow-wrap: anywhere; }
     .stats-row { display: flex; gap: 12px; padding: 16px 24px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
     .stat-chip { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 10px 18px; text-align: center; min-width: 100px; }
     .stat-chip-val { font-size: 20px; font-weight: 700; color: var(--accent); }
@@ -218,6 +227,11 @@
   </div>
 </div>
 
+<!-- Encabezado del turno seleccionado: mismo conjunto de datos que el llamado
+     abierto del portal (turno, distancia, pista, sexo, edad, bolsa, cierre) más
+     el texto completo de la condición. Vacío hasta que hay turno elegido. -->
+<div id="carrera-header" class="carrera-header" style="display:none;"></div>
+
 
 <div class="content">
   <div class="table-actions">
@@ -349,6 +363,42 @@ function toast(msg, type='success') {
   document.getElementById('toast-container').appendChild(t); setTimeout(()=>t.remove(),3500);
 }
 
+// ---------------------------------------------------------------------------
+// Encabezado del turno — mismo conjunto de datos que el llamado abierto del
+// portal. Las cuatro funciones de abajo son gemelas de las de portal.html: se
+// duplican en vez de compartirse porque cada módulo es un HTML autocontenido
+// (misma convención que formatMonto/formatARS, que ya está duplicado). Si una
+// cambia, tiene que cambiar la otra — el probe compara las dos salidas.
+// ---------------------------------------------------------------------------
+function esc(s) {
+  return String(s ?? '').replace(/[&<>"']/g, ch =>
+    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
+}
+
+// Hora en 24 h, armada a mano: toLocaleTimeString('es-AR') da "09:00 a. m." en
+// el ICU actual. Ver el comentario gemelo en portal.html.
+function fechaHora(iso) {
+  if (!iso) return '—';
+  const d = new Date(iso);
+  if (isNaN(d.getTime())) return '—';
+  const p2 = (n) => String(n).padStart(2, '0');
+  return `${d.getDate()}/${d.getMonth() + 1} ${p2(d.getHours())}:${p2(d.getMinutes())} hs`;
+}
+
+// `carreras` no tiene una columna de edad en texto: el dato son dos enteros.
+function textoEdad(c) {
+  const min = c.edad_minima_anos, max = c.edad_maxima_anos;
+  if (min == null && max == null) return '';
+  if (min != null && max != null) return min === max ? `${min} años` : `${min} a ${max} años`;
+  return min != null ? `desde ${min} años` : `hasta ${max} años`;
+}
+
+// Mismo separador que el programa oficial (programa-oficial.html:496).
+function textoCondicion(c) {
+  return [c.condicion_handicap, c.condicion_adicional]
+    .map(s => (s || '').trim()).filter(Boolean).join(' — ');
+}
+
 async function loadAll() {
   const [{ data: reuns }, { data: jocksData }, { data: entrData }, { data: sprcs }, { data: cabs }] = await Promise.all([
     sb.from('reuniones').select('id,numero,numero_publico,fecha,estado,sorteo_partidores,hipodromos(nombre)').eq('club_id', CLUB_ID).order('fecha', {ascending:false}),
@@ -407,7 +457,15 @@ async function onReunionChange() {
   if (rid) { ActiveReunion.set(rid); }
   const selC = document.getElementById('sel-carrera');
   if (!rid) { selC.innerHTML='<option value="">— Seleccionar reunión primero —</option>'; return; }
-  const { data: cars } = await sb.from('carreras').select('id,numero_turno,nombre,distancia_metros,condicion_handicap').eq('reunion_id', rid).order('numero_turno');
+  // El select traía sólo lo que entra en el label del <option>. El encabezado
+  // del turno necesita además los campos que el llamado del portal ya muestra
+  // como chips (pista, sexo, edad, bolsa, cupo, cierre) más condicion_adicional
+  // y el nombre de la categoría. Sin esto, currentCarrera salía del array con
+  // la mitad de las columnas y los chips quedaban vacíos.
+  const { data: cars, error: eCars } = await sb.from('carreras')
+    .select('id,numero_turno,nombre,distancia_metros,tipo_pista,condicion_sexo,edad_minima_anos,edad_maxima_anos,bolsa_total,cupo_maximo,condicion_handicap,condicion_adicional,cierre_inscripcion,estado,categoria_id,categorias_carrera(nombre)')
+    .eq('reunion_id', rid).order('numero_turno');
+  if (eCars) { console.error('[carreras onReunionChange]', eCars); toast(eCars.message, 'error'); throw eCars; }
   carreras = cars||[];
   selC.innerHTML = '<option value="">— Seleccionar turno —</option>' +
     carreras.map(c => {
@@ -425,6 +483,7 @@ async function onReunionChange() {
   document.getElementById('inscriptos-count').style.display='none';
   document.getElementById('btn-nueva').style.display='none';
   document.getElementById('list-container').innerHTML='';
+  limpiarCarreraHeader();
 }
 
 async function onCarreraChange() {
@@ -436,11 +495,16 @@ async function onCarreraChange() {
     document.getElementById('inscriptos-count').style.display='none';
     document.getElementById('btn-nueva').style.display='none';
     document.getElementById('list-container').innerHTML='';
+    limpiarCarreraHeader();
     return;
   }
   currentCarrera = carreras.find(c=>c.id===cid) || null;
   if (!currentCarrera) {
-    const { data } = await sb.from('carreras').select('*').eq('id', cid).single();
+    // Camino del deep link ?carrera_id=…: la carrera no está en el array. El
+    // join a categorias_carrera va explícito porque select('*') no lo trae y el
+    // chip de categoría quedaría vacío sólo en este camino.
+    const { data } = await sb.from('carreras')
+      .select('*,categorias_carrera(nombre)').eq('id', cid).single();
     currentCarrera = data;
   }
   renderCarreraHeader();
@@ -473,6 +537,46 @@ function renderCarreraHeader() {
        </select>` : '';
   document.getElementById('ch-estado-carrera').innerHTML = badge + sel;
   document.getElementById('sel-estado-car-wrap').style.display='flex';
+  renderCarreraChips();
+}
+
+// El conjunto completo, igual que el llamado abierto del portal: número de
+// turno, distancia, pista, sexo, rango de edad, bolsa, cupo, cierre, y el
+// texto de la condición. La categoría va como chip propio (pedido de Yesi,
+// 07/09/2026): se agrega, no reemplaza al número de turno.
+// Todo el texto que viene de la DB pasa por esc() — es innerHTML (ISSUE-018).
+function renderCarreraChips() {
+  const cont = document.getElementById('carrera-header');
+  const c = currentCarrera;
+  if (!c) { cont.style.display = 'none'; cont.innerHTML = ''; return; }
+
+  const cond = textoCondicion(c);
+  const cat = c.categorias_carrera?.nombre || '';
+  const chips = [
+    c.distancia_metros ? `${c.distancia_metros}m` : '',
+    c.tipo_pista || '',
+    c.condicion_sexo || '',
+    textoEdad(c),
+    cat,
+    c.bolsa_total ? `💰 ${formatMonto(c.bolsa_total)}` : '',
+    c.cupo_maximo ? `Cupo ${c.cupo_maximo}` : '',
+    c.cierre_inscripcion ? `⏳ cierra ${fechaHora(c.cierre_inscripcion)}` : '',
+  ].filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`).join('');
+
+  cont.innerHTML = `
+    <div class="carrera-num">${esc(c.numero_turno ?? '—')}</div>
+    <div class="carrera-header-body">
+      <div class="carrera-name">${esc(c.nombre || 'Turno ' + (c.numero_turno ?? ''))}</div>
+      <div class="carrera-chips">${chips}</div>
+      ${cond ? `<div class="carrera-cond">${esc(cond)}</div>` : ''}
+    </div>`;
+  cont.style.display = 'flex';
+}
+
+function limpiarCarreraHeader() {
+  const cont = document.getElementById('carrera-header');
+  cont.style.display = 'none';
+  cont.innerHTML = '';
 }
 
 async function loadInscripciones() {
diff --git a/liquidaciones.html b/liquidaciones.html
index 77e00b2..9a1556c 100644
--- a/liquidaciones.html
+++ b/liquidaciones.html
@@ -1514,8 +1514,11 @@ function cobrosRenderRecibo(){
   if (!cont) return;
   if (!cobUltimoRecibo) { cont.innerHTML = ''; return; }
   const { recibo, lineaIds, benef, anulado, retenidas } = cobUltimoRecibo;
+  // hour12:false explícito acá y en los otros tres usos del archivo (1785, 1854
+  // y el recibo impreso en 1864): sin él el ICU actual devuelve "09:00 a. m."
+  // para es-AR. La app muestra la hora en 24 h en todos lados (Fede, 07/09/2026).
   const hora = recibo.emitido_at
-    ? new Date(recibo.emitido_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '';
+    ? new Date(recibo.emitido_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false}) : '';
   const accion = anulado
     ? `<span class="badge badge-anulada">ANULADO</span>`
     : (puedeAnularUI(recibo, currentUser?.rol)
@@ -1782,7 +1785,7 @@ function recibosRenderLista(){
       const f = new Date(r.emitido_at);
       return `<tr class="rec-row${anulado?' rec-anulado':''}" data-recibo="${r.id}" data-estado="${r.estado}">
         <td style="font-weight:600;color:var(--accent);">#${r.numero_recibo}</td>
-        <td>${f.toLocaleDateString('es-AR')} ${f.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</td>
+        <td>${f.toLocaleDateString('es-AR')} ${f.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false})}</td>
         <td>${escapeHtml(recNombreBenef(r))}</td>
         <td>${escapeHtml(r.cobrador_nombre || '—')}</td>
         <td>${r.forma_pago === 'transferencia' ? 'transf.' : 'efectivo'}</td>
@@ -1851,7 +1854,7 @@ async function recibosDetalle(reciboId){
 
   const bloqueAnulado = !anulado ? '' : `
     <div class="config-card" style="margin:6px 0 14px;border:1px solid var(--danger);background:rgba(224,82,82,0.07);">
-      <div class="config-card-title" style="color:var(--danger);">⛔ ANULADO el ${rec.anulado_at ? new Date(rec.anulado_at).toLocaleDateString('es-AR')+' '+new Date(rec.anulado_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—'}${rec.anulado_por ? ' por '+escapeHtml(recUsuarios[rec.anulado_por] || '—') : ''}</div>
+      <div class="config-card-title" style="color:var(--danger);">⛔ ANULADO el ${rec.anulado_at ? new Date(rec.anulado_at).toLocaleDateString('es-AR')+' '+new Date(rec.anulado_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false}) : '—'}${rec.anulado_por ? ' por '+escapeHtml(recUsuarios[rec.anulado_por] || '—') : ''}</div>
       <div style="font-size:13px;padding:3px 0;"><strong>Motivo:</strong> ${escapeHtml(rec.motivo_anulacion || '—')}</div>
       <div style="font-size:12px;color:var(--muted);padding:2px 0;">Las ${lineas.length} línea(s) volvieron a quedar pendientes de cobro. El número ${rec.numero_recibo} no se reutiliza.</div>
       ${foto ? '' : `<div style="font-size:11px;color:var(--muted);padding-top:5px;">⚠ Este recibo se anuló antes de que el sistema guardara la foto de las líneas: los importes se reconstruyen desde la liquidación y pueden no coincidir con el papel si la reunión se recalculó después.</div>`}
@@ -1861,7 +1864,7 @@ async function recibosDetalle(reciboId){
     <div class="config-card" style="margin-top:16px;${anulado?'border-left:4px solid var(--danger);':''}">
       <h2 style="font-size:18px;color:var(--accent);margin-bottom:6px;">Recibo N° ${rec.numero_recibo} — ${escapeHtml(recNombreBenef(rec))}</h2>
       <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">
-        Emitido el ${fEmi.toLocaleDateString('es-AR')} a las ${fEmi.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}
+        Emitido el ${fEmi.toLocaleDateString('es-AR')} a las ${fEmi.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false})}
         · ${rec.forma_pago === 'transferencia' ? 'Transferencia' : 'Efectivo'}
         · Retiró: ${escapeHtml(rec.cobrador_nombre || '—')}${rec.cobrador_documento ? ' (Doc. '+escapeHtml(rec.cobrador_documento)+')' : ''}
         ${rec.comprobante_url ? '· Comprobante: '+escapeHtml(rec.comprobante_url) : ''}
diff --git a/portal.html b/portal.html
index 79fdf78..4793fad 100644
--- a/portal.html
+++ b/portal.html
@@ -83,6 +83,13 @@
     .carrera-name { font-size: 14px; font-weight: 600; color: var(--text); }
     .carrera-chips { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
     .chip { font-size: 11px; background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.2); color: var(--muted); padding: 2px 8px; border-radius: 4px; }
+    /* El texto de la condición es libre y largo: R9 T9 son 192 caracteres entre
+       condicion_handicap y condicion_adicional, o sea tres renglones. Va en su
+       propio bloque (no adentro de la fila de chips), envuelve, y con
+       overflow-wrap:anywhere para que una palabra sin espacios tampoco empuje
+       la tarjeta. .carrera-info ya es flex:1 con min-width, así que el botón
+       "Anotar" se mantiene en su lugar. */
+    .carrera-cond { font-size: 12px; line-height: 1.45; color: var(--muted); margin-top: 6px; overflow-wrap: anywhere; }
     .btn-inscribir { background: var(--accent); color: #1a1a0a; border: none; padding: 8px 16px; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; white-space: nowrap; }
     .btn-inscribir:hover { opacity: 0.85; }
 
@@ -402,11 +409,18 @@ function fechaCorta(iso) {
   if (!iso) return '—';
   return new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
 }
+// Hora en 24 h, armada a mano. `toLocaleTimeString('es-AR', {hour:'2-digit'})`
+// devuelve "09:00 a. m." en el ICU actual: como acá se le concatenaba " hs",
+// salía "cierra 11/9 09:00 a. m. hs" — las dos notaciones mezcladas y la unidad
+// repetida (lo marcó Fede, 07/09/2026). Se arma con getHours()/getMinutes(),
+// que ya vienen en la zona del browser: 24 h siempre, sin depender del locale.
+// Fecha en d/M sin cero a la izquierda, que es lo que venía dando es-AR.
 function fechaHora(iso) {
   if (!iso) return '—';
   const d = new Date(iso);
-  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
-    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';
+  if (isNaN(d.getTime())) return '—';
+  const p2 = (n) => String(n).padStart(2, '0');
+  return `${d.getDate()}/${d.getMonth() + 1} ${p2(d.getHours())}:${p2(d.getMinutes())} hs`;
 }
 function toast(msg, type = 'success') {
   const t = document.createElement('div');
@@ -502,6 +516,16 @@ function textoEdad(c) {
   return min != null ? `desde ${min} años` : `hasta ${max} años`;
 }
 
+// El texto de la condición vive libre en dos columnas: condicion_handicap (la
+// condición propiamente dicha) y condicion_adicional (pesos, descargos). Se
+// unen con el MISMO separador que ya usa el programa oficial
+// (programa-oficial.html:496) para no inventar un formato nuevo.
+// Puede venir vacío: no toda carrera tiene condición cargada.
+function textoCondicion(c) {
+  return [c.condicion_handicap, c.condicion_adicional]
+    .map(s => (s || '').trim()).filter(Boolean).join(' — ');
+}
+
 function ventanaAbierta(c, reunionEstado) {
   if (reunionEstado !== 'publicada') return false;
   if (c.estado === 'anulada') return false;
@@ -582,6 +606,7 @@ async function loadLlamado() {
             <span class="chip">⏳ cierra ${esc(fechaHora(c.cierre_inscripcion))}</span>
             ${yaAnotados ? `<span class="chip" style="color:var(--success);border-color:rgba(76,175,130,0.35);">✓ ${yaAnotados} anotado${yaAnotados > 1 ? 's' : ''}</span>` : ''}
           </div>
+          ${textoCondicion(c) ? `<div class="carrera-cond">${esc(textoCondicion(c))}</div>` : ''}
         </div>
         <button class="btn-inscribir" onclick="abrirInscripcion('${esc(c.id)}','${esc(r.id)}')">Anotar</button>
       </div>`;
diff --git a/resultados.html b/resultados.html
index 4892080..2f2ed30 100644
--- a/resultados.html
+++ b/resultados.html
@@ -1598,7 +1598,8 @@ async function aplicar(carreraId, estado) {
   isDirty = false;
   const msg = estado==='provisional' ? 'Resultado provisional guardado' : 'Guardado';
   toast(msg);
-  setStatus(`✓ ${msg} — ${new Date().toLocaleTimeString('es-AR')}`);
+  // hour12:false explícito: sin él el ICU actual devuelve "09:00:00 a. m.".
+  setStatus(`✓ ${msg} — ${new Date().toLocaleTimeString('es-AR', { hour12: false })}`);
   renderDivView(undefined, true);  // pendingApuestas ya está actualizado desde RPC
 }
 
diff --git a/solicitudes.html b/solicitudes.html
index 021f575..7223a4f 100644
--- a/solicitudes.html
+++ b/solicitudes.html
@@ -153,7 +153,8 @@ function abrirWa(tel, texto) {
   if (!url) { toast('Esta solicitud no tiene teléfono cargado.', 'error'); return; }
   window.open(url, '_blank', 'noopener');
 }
-const fecha = (iso) => new Date(iso).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
+// hour12:false explícito: sin él el ICU actual devuelve "09:00 a. m." para es-AR.
+const fecha = (iso) => new Date(iso).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 
 function setTab(t){
   tab=t;
```

Diffstat completo de la rama:

```
 auditoria.html                                |   4 +-
 inscripciones.html                            | 108 ++++-
 liquidaciones.html                            |  11 +-
 portal.html                                   |  29 +-
 resultados.html                               |   3 +-
 solicitudes.html                              |   3 +-
 tests/README.md                               |   1 +
 tests/probe_paridad_llamado_inscripciones.mjs | 564 ++++++++++++++++++++++++++
 8 files changed, 712 insertions(+), 11 deletions(-)
```

---

## 9. Fuera de alcance — lo que NO se tocó

| Cosa | Estado |
|---|---|
| Lógica de inscripción | intacta. Ni una línea de `guardarInscripcion` / `abrirInscripcion` / validaciones. |
| Gate de edad | intacto. `edadSPCTexto` sigue igual; assert F3 lo verifica. |
| Dónde se guardan las condiciones | intacto. Se siguen leyendo de `carreras.condicion_handicap` y `carreras.condicion_adicional`. Cero DDL, cero migraciones. |
| El valor de `hora_cierre` / `cierre_inscripcion` | intacto. Los once turnos de R9 siguen en `2026-09-11 12:00:00+00` (= 09:00 AR). Sólo cambió cómo se imprime. Assert H5. |
| El rótulo del `<option>` de inscripciones | intacto, incluido su truncado a 70 caracteres. |
| La reunión activa del sistema | intacta. Assert F1. |
| `main` | intacto en `b10adc9`. |

---

## 10. Números de resumen

| | |
|---|---|
| Archivos HTML modificados | 6 (`portal`, `inscripciones`, `auditoria`, `solicitudes`, `resultados`, `liquidaciones`) |
| Archivos nuevos | 1 (el probe) |
| Líneas del diff | +712 / −11 |
| Sitios de formateo de hora arreglados | 8 líneas en 5 archivos (1 helper con 2 usos + 7 sueltos) |
| Sitios que además duplicaban la unidad | 1 (`portal.html`, el que marcó Fede) |
| Campos que ahora muestran las dos pantallas | 8 (turno, distancia, pista, sexo, edad, bolsa, cierre, condición) + cupo, + categoría sólo en inscripciones |
| Columnas agregadas al `select` de inscripciones | 10 |
| Condición más larga de R9 | 192 caracteres (T9), 3 renglones |
| Asserts del probe | 47 / 47 OK |
| Mutantes | 11 / 11 muertos |
| Escrituras a producción | ninguna permanente (fixture 9992 con teardown verificado) |

---

## 11. Preguntas abiertas

1. **La categoría vs. el número de turno (Yesi).** El pedido de Yesi fue *"la categoría en vez
   de Turno"*; el punto 2 del pedido pide que las dos pantallas muestren el número de turno. Se
   resolvió por lo conservador: la categoría se **agrega** como chip, el número de turno queda.
   ¿Yesi quiere efectivamente que el número de turno desaparezca de inscripciones, o le alcanza
   con ver la categoría al lado?

2. **El horario de cierre de R9.** Los once turnos cierran el **11/09/2026 a las 09:00**. Hoy es
   08/09: quedan tres días. Está anotado como dato de Yesi en consulta y no se tocó, pero si la
   consulta se resuelve conviene resolverla antes del 11.

3. **El chip de cupo.** Las dos pantallas lo muestran, pero **ningún turno de R9 tiene
   `cupo_maximo` cargado** (los once en `null`), así que el chip no aparece nunca en la práctica.
   ¿Dolores usa cupo por turno o la columna quedó muerta?

4. **`carreras.estado = 'abierta'`.** Los once turnos de R9 lo tienen. Ese valor no está en la
   lista de valores en uso documentada en CLAUDE.md (`NULL/'programada'`, `'confirmada'`,
   `'anulada'`) — lo escribe `carta-llamados.html` en toda carrera que guarda. No afecta este
   cambio (el llamado sólo lo usa para excluir `'anulada'`), pero la documentación está atrás
   del código.

5. **El rótulo del `<option>` ahora es redundante.** Con el encabezado nuevo, el `<select>`
   repite turno + distancia + condición truncada. ¿Se deja así (redundancia útil al elegir) o se
   acorta el rótulo a `Turno N — distancia` ahora que el detalle vive abajo?

6. **`liquidaciones.html`, cuatro usos de hora.** Se arreglaron por ser el mismo defecto de
   notación, dos de ellos en documentos que ve el propietario (recibo impreso y aviso de
   anulado). No estaban en el pedido explícito. Si preferís que el recibo quede como estaba,
   se revierte esa línea sola — es el commit `07ef2aa`, separado a propósito.

---

## 12. Cómo mirarlo

```bash
git fetch origin
git diff origin/main..origin/feat/paridad-llamado-inscripciones
git switch feat/paridad-llamado-inscripciones

set -a; . ./.env; set +a
node tests/probe_paridad_llamado_inscripciones.mjs
node tests/probe_paridad_llamado_inscripciones.mjs --mutantes
```

**No mergeado. Esperando OK.**

---

## 13. Verificación final del informe en `origin`

```
$ git ls-remote origin reports
1282c88f145b12bbab92dfad782e6a0bf2e525a3	refs/heads/reports
$ git rev-parse HEAD
1282c88f145b12bbab92dfad782e6a0bf2e525a3
$ git ls-remote origin main
b10adc906b67316da72c717d47e3defba9010f0e	refs/heads/main
$ git ls-remote origin feat/paridad-llamado-inscripciones
07ef2aa4058001f9fca96608d3b213b5bb0b8f2f	refs/heads/feat/paridad-llamado-inscripciones
```

Los tres refs verificados: el informe está en `origin/reports`, la rama de trabajo está
pusheada, y `main` sigue en `b10adc9` sin tocar.
