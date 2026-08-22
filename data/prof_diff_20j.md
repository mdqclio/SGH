# Diff de profesionales — Reunión 6 (2026-06-20, Hipódromo de Dolores)

Diagnóstico read-only del borrador de profesionales contra los existentes en el
sistema (club Dolores). Objetivo: dar de alta solo lo que falta de verdad y no
duplicar personas escritas distinto.

> **Privacidad:** este documento contiene únicamente apellido + nombre tal como
> vienen en el borrador. Sin DNI/CUIT, teléfono ni ningún otro dato personal
> (repositorio público).

> **Estado:** todavía NO se creó ningún profesional. Esta es la lista a revisar
> antes de cargar.

## Notas previas

- **Club destino:** crear todo bajo el club **Dolores** (`0649e9c5-…`), que es
  donde viven la reunión 6 y sus inscripciones. (No usar el club hardcodeado en
  `supabase.js`.)
- **Datos de prueba a borrar:** en el sistema hay 5 profesionales de test
  `PRUEBA 9999 — BORRAR` (3 jockeys + 2 cuidadores). No forman parte del diff;
  eliminar con el teardown correspondiente.
- **Campo de rol:** `profesionales.tipo` = `jockey` | `entrenador`
  (cuidador → entrenador).

---

## JOCKEYS

### (a) Ya en el sistema — no crear
- ALDECOA IVAN  *(existe como entrenador)*
- CONTRERAS JUAN CRUZ
- GATICA DARIO
- IBARRA FERNANDO  *(= Fernando Augusto)*

### (b) Faltantes reales — a crear
- ACUÑA LUIS
- ACUÑA MATIAS
- AGUIRRE HUGO
- ARREGUY FRANCISCO
- AVENDAÑO MIGUEL A
- CANTO TOBIAS
- DA SILVA RUBEN
- DELLI QUADRI IGNACIO
- DIESTRA BAUTISTA
- DIESTRA PEDRO
- D'ELIA THIAGO
- GIL SANTINO
- MENDEZ KEVIN
- OSUNA JOSE
- PAIZ JAVIER
- ROJAS HERNAN
- ROMAY ABEL I
- SALDIAS DIEGO
- TORRES ANIBAL
- YALET IRINEO
- YALET JORGE
- ZAPICO DIEGO
- ZUBIRIA SANTIAGO  *(resuelto: persona distinta de ZUBIARRAIN SANTIAGO, entrenador — crear ambas)*

### (c) Dudosos — pendientes de confirmar antes de crear
- MARTINEZ AGUSTIN  — comparte apellido con MARTINEZ Julio Miguel (entrenador). Confirmar que es otra persona.
- PRESA DANIEL  — comparte apellido con PRESA Luis Horacio (sistema) y PRESA LUIS (borrador). Confirmar 3º distinto.
- GIULIANO BRUNO  — apellido casi igual a GIULIANI Nicolas (sistema). ¿Persona distinta o error de tipeo?

---

## CUIDADORES / ENTRENADORES

### (a) Ya en el sistema — no crear
- ALDAY ADRIAN
- ALDECOA IVAN
- ANRIQUEZ GERONIMO
- ARISTEGUI MARCELO
- AZURI SANTIAGO
- BONAVITA DAMIAN  *(= Nestor Damian)*
- BRIGANTI MARIA LAURA
- BURGOS FACUNDO  *(= Hector Facundo)*
- CUEVAS CESAR
- DEVINCENTTI DAMIAN  *(= Luis Damian)*
- DIAZ CARLOS RODOLFO
- DUARTE FEDERICO  *(= Nestor Federico)*
- GAINLE JOSE MARIA
- GIMENEZ MARCOS
- MARTINEZ JULIO MIGUEL
- PALLET GUIDO
- PEREZ GUILLERMO
- PRESA LUIS
- SAN MARTIN SERGIO
- VALENCIA GERARDO
- MARTIN ALBERTO DAM  *(= Martin Damian Alberto)*
- SUAREZ ULISES P  *(= Suarez Publio Ulises Noé)*

### (b) Faltantes reales — a crear
- ALBERDI OSVALDO
- ALZA MAXIMILIANO
- AMADEO LUIS ALEJANDRO
- BARRERA MARIA LAURA  *(resuelto: persona nueva, ≠ BRIGANTI Maria Laura)*
- BARRIONUEVO OSCAR ABEL
- BLANCO MARCELO
- BOLONTI ROBERTO
- CANTO HORACIO
- CANTO TOMAS
- CASTELLANO ROBERTO E
- CONSTANCIO ALEXIS
- DE LA TORRE GABRIEL
- DI FRANCO GUSTAVO
- DIESTRA CLAUDIO MAXIMILIANO  *(resuelto: "DIESTRA MAXIMILIANO" de la 1ª carrera es la MISMA persona — no duplicar)*
- DIESTRA FLORENCIA
- DIESTRA JUAN DOMINGO
- ECHENIQUE ATILIO
- FLEKSTEIN LEONARDO
- GAITAN PICART RAMIRO
- GOMEZ JULIO
- IPARAGUIRRE RICARDO
- MAITIA LUIS
- MAITIA MIGUEL A
- MORAN HECTOR ROBERTO
- NOTARIO GONZALO
- OLIVERA MARIO RAUL
- PADRON WALTER
- PREBE JOSE
- TAVAGNUTTI RICARDO H
- TEDESCHI ALEJANDRO
- TEVEZ OSCAR
- THEILLER RAUL OMAR
- TOLEDO MARIA ELENA
- TRUPPA ROBERTO
- VILLARUEL EDUARDO EMILIO
- ZUBIARRAIN SANTIAGO  *(resuelto: persona distinta de ZUBIRIA SANTIAGO, jockey — crear ambas)*

### (c) Dudosos — pendientes de confirmar antes de crear
- ALDAY SERGIO ESTEBAN  — el sistema ya tiene ALDAY Adrian Alfredo y ALDAY German Ceferino. ¿Sergio Esteban es un 3º nuevo?
- CARLI FEDERICO  — el sistema tiene CARLI Ornela. Misma familia, ¿persona distinta?

---

## Resumen

| Lista | Jockeys | Cuidadores |
|---|---|---|
| Ya en sistema | 4 | 22 |
| Faltantes a crear | 23 | 36 |
| Dudosos pendientes | 3 | 2 |

**Total a crear (sin dudosos): 59** (23 jockeys + 36 cuidadores), todos bajo club Dolores.

---

## Fix de DATA pendiente (no es alta de profesional)

- **BAM BAM HITS** (carrera MACHOS 3 AÑOS): la inscripción quedó con el cuidador
  equivocado. El correcto es **DIESTRA JUAN DOMINGO** (no DIESTRA Claudio
  Maximiliano). Corregir `inscripciones.entrenador_id` de esa inscripción al
  momento de la carga.
