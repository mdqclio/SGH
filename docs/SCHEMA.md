# SGH — Schema de Base de Datos

## Supabase Project
- URL: https://unlhcuanfrtpatoipwve.supabase.co
- ID: unlhcuanfrtpatoipwve

## Tablas principales

### clubs
id UUID PK, nombre VARCHAR(150), sigla VARCHAR(10) UNIQUE, razon_social, cuit, domicilio, localidad, provincia, pais VARCHAR DEFAULT 'Argentina', telefono, email, logo_url TEXT, activo BOOLEAN DEFAULT TRUE, created_at, updated_at, auditoria_retencion_meses INTEGER DEFAULT 12, comision_carreras JSONB DEFAULT '[]', sponsors JSONB DEFAULT '[]', comisariato JSONB DEFAULT '[]', disclaimer_importante TEXT, disclaimer_nota TEXT, website TEXT, instagram TEXT, facebook TEXT, tiktok TEXT, twitter_x TEXT, youtube TEXT, secretaria_carreras_nombre TEXT, inscripciones_telefono TEXT, sponsor_destacado JSONB
NOTA sponsor_destacado: `{"nombre":"AGENCIA HIPICA DOLORES","subtitulo":"PALERMO – SAN ISIDRO – LA PLATA","foto_url":"https://...","direccion":"Sarmiento 274, Dolores","contacto":"Juga xWhatsApp 116361-0222"}` — sponsor heroico en el programa oficial (bloque B&N a media página). Separado de sponsors[] que son los logos pequeños.
NOTA comision_carreras: `[{"cargo":"Presidente","nombre":"Juan Pérez"}, ...]` — board del hipódromo, editable desde Admin "Mi Hipódromo"
NOTA comisariato: `[{"cargo":"Presidente del Comisariato","nombre":"..."}, ...]` — stewards del hipódromo, editable desde Admin "Mi Hipódromo". Club-level (no cambia por reunión).
NOTA sponsors: `[{"nombre":"YPF","logo_url":"https://..."}, ...]`

### hipodromos
id UUID PK, club_id FK clubs, nombre, sigla, localidad, provincia, tipo_pista, activo, cantidad_gateras INTEGER DEFAULT 12
UNIQUE (club_id, sigla)
NOTA: cantidad_gateras = gateras físicas del hipódromo. Dolores: 16. Default 12 para nuevos hipódromos.

### club_configuracion
id UUID PK, club_id FK clubs NOT NULL, clave VARCHAR NOT NULL, valor TEXT nullable, descripcion TEXT nullable
NOTA: tabla key-value de overrides de configuración por club (parámetros del sistema editables por administrador de club).

### usuarios
id UUID PK, club_id FK clubs NOT NULL, email VARCHAR NOT NULL, password_hash TEXT NOT NULL, nombre_completo VARCHAR, rol ENUM(super_admin/secretario_carreras/operador/profesional/propietario/publico) NOT NULL DEFAULT 'operador', entidad_tipo VARCHAR, entidad_id UUID, activo BOOLEAN NOT NULL DEFAULT true, ultimo_login TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), telefono VARCHAR, estado VARCHAR DEFAULT 'activo'
CRÍTICO: columna se llama nombre_completo NO nombre

### categorias_carrera
id UUID PK, club_id FK clubs, nombre, codigo, descripcion, es_computable BOOLEAN, es_oficial BOOLEAN, simbolo VARCHAR(10), color_hex VARCHAR(7), orden_display INTEGER, activo
UNIQUE (club_id, codigo)

### propietarios (GLOBALES — club_id nullable)
id UUID PK, club_id FK nullable, tipo (persona/sociedad), nombre, documento_tipo, documento_nro, domicilio, localidad, provincia, telefono, email, colores_desc, colores_img_url, nombre_stud VARCHAR(150), activo, estado VARCHAR(20) DEFAULT 'activo', chaquetilla_descripcion VARCHAR, chaquetilla_url VARCHAR

### caballerizas
id UUID PK, club_id FK nullable, nombre, responsable TEXT (autogenerado de caballeriza_responsables), domicilio, telefono, activo, notas, estado VARCHAR(20) DEFAULT 'activo', hipodromo_patente VARCHAR(50), chaquetilla_descripcion VARCHAR(500), chaquetilla_url VARCHAR(500)
NOTA: campo "responsable" no se edita directamente — se regenera desde caballeriza_responsables al guardar.

### caballeriza_responsables (nueva — sesión may-2026)
id UUID PK, caballeriza_id FK caballerizas ON DELETE CASCADE, profesional_id FK profesionales (opcional — NULL si no es profesional del sistema), apellido VARCHAR(150), nombre VARCHAR(150), documento_tipo VARCHAR(10) DEFAULT 'DNI', documento_nro VARCHAR(30), fecha_nacimiento DATE, localidad VARCHAR(150), rol VARCHAR(20) CHECK (rol IN ('propietario','copropietario')), porcentaje DECIMAL (V2 — no usado aún), activo BOOLEAN DEFAULT TRUE, created_at
RLS: policy permisiva (allow_all).
REGLA: exactamente 1 fila con rol='propietario' por caballeriza, 0-N con rol='copropietario'.

### profesionales (per-hipódromo — CORRECCIÓN: NO son globales)
id UUID PK, club_id FK nullable, tipo ENUM(jockey/entrenador/ambos), nombre, apellido, documento_tipo, documento_nro, fecha_nacimiento, localidad VARCHAR(150), matricula_nro, patente, hipodromo_patente VARCHAR(50), categoria_jockey VARCHAR(50), peso_minimo, peso_maximo, caballeriza_id FK, telefono, email, foto_url, activo, estado VARCHAR(20) DEFAULT 'activo'
NOTA: categoria_jockey cambió de ENUM a VARCHAR(50) — sesión may-2026. Valores actuales: Jockey / 2ª categoría / 3ª categoría / 4ª categoría.
CORRECCIÓN: entrenadores NO son globales — tienen hipodromo_patente igual que jockeys (patente otorgada por un hipódromo específico).

### spcs (GLOBALES — club_id nullable)
id UUID PK, club_id FK nullable, nombre, registro_stud_book, fecha_nacimiento DATE, sexo ENUM(macho/hembra/castrado), color, marcas, padrillo_nombre, madre_nombre, abuela_materna, pais_origen DEFAULT 'Argentina', caballeriza_id FK, entrenador_id FK, estado ENUM(activo/retirado/suspendido/fallecido/vendido) DEFAULT 'activo', notas, doc_url, foto_url, certificado_correr BOOLEAN DEFAULT FALSE, ult_performances TEXT
NOTA ult_performances: texto libre (ej: `5D5P3L`). Ingreso manual hasta disponer de API Stud Book. Editable en spcs.html tab Origen. Celda en blanco en el programa si no hay dato (no dice "DEBUTA" — ese texto se agrega manualmente si corresponde).
CRÍTICO: usar .eq('estado','activo') NO .eq('activo',true) — columna activo no existe

### spc_propietarios
id UUID PK, spc_id FK spcs, propietario_id FK propietarios, porcentaje DECIMAL DEFAULT 100, fecha_desde DATE, fecha_hasta DATE, activo

### spc_entrenadores_hist
id UUID PK, spc_id FK spcs NOT NULL, entrenador_id FK profesionales NOT NULL, fecha_desde DATE NOT NULL, fecha_hasta DATE nullable
NOTA: historial de entrenadores por SPC; la fila sin fecha_hasta es el entrenador actualmente asignado.

### sanciones (COMPARTIDAS entre hipódromos)
id UUID PK, club_id FK nullable, entidad_tipo ENUM(profesional/spc/propietario/caballeriza), entidad_id UUID, tipo_sancion, motivo, codigo_resolucion, fecha_inicio DATE, fecha_fin DATE, alcance DEFAULT 'club', estado ENUM(activa/cumplida/apelada/revocada), resolucion_url, notas, creado_por FK usuarios

### reuniones
id UUID PK, club_id FK clubs, hipodromo_id FK hipodromos, numero INTEGER, fecha DATE, tipo ENUM(oficial/extraoficial/especial/nocturna), estado ENUM(borrador/programada/publicada/en_curso/finalizada/cancelada/suspendida), condicion_pista, tiempo_clima, observaciones, creado_por FK usuarios, hora_cierre_ratificacion TIME NOT NULL DEFAULT '12:00:00', fechas_inscripciones TEXT, fechas_forfaits TEXT, fechas_compromiso_montas TEXT
COLUMNAS ELIMINADAS (19/05/2026): apuestas_combinadas JSONB (existió brevemente, dropped en refactor final), comisariato JSONB (migrado a clubs.comisariato)

### novedades_reunion
id UUID PK, reunion_id FK reuniones NOT NULL, carrera_id FK carreras nullable, spc_id FK spcs nullable, tipo_novedad VARCHAR NOT NULL, descripcion TEXT nullable, hora_novedad TIMESTAMPTZ NOT NULL DEFAULT now(), visibilidad VARCHAR NOT NULL DEFAULT 'interna', creado_por FK usuarios nullable
NOTA: incidentes y novedades durante la reunión (scratches tardíos, cambios de jockey, etc.); visibilidad 'interna' o 'publica'.

### carreras
id UUID PK, reunion_id FK reuniones, numero_turno INTEGER, nombre, categoria_id FK categorias_carrera, tipo_pista ENUM(cesped/arena/tierra/sintetica), distancia_metros INTEGER, edad_minima_anos, edad_maxima_anos, condicion_sexo ENUM(ambos/machos/hembras/machos_castrados), condicion_handicap, condicion_adicional, bolsa_total DECIMAL, bolsa_bonos DECIMAL DEFAULT 0, distribucion_premios JSONB (incluye ganancia_minima), cupo_maximo, hora_estimada TIME, apertura_inscripcion, cierre_inscripcion, apertura_ratificacion, cierre_ratificacion, estado VARCHAR DEFAULT 'programada', numero_carrera_programa INTEGER, apuestas TEXT[] DEFAULT '{}', apuestas_notas TEXT NULL
UNIQUE (reunion_id, numero_turno)
NOTA condicion: condicion_handicap es la condición principal en texto libre. condicion_adicional es nota extra ("Peso x impresion" en casos especiales).
NOTA estado: campo VARCHAR libre (sin ENUM). Valores especiales usados en UI: 'reabierta' (cupo no completado, se reabre), 'anulada' (cancelada). NULL = sin marca especial.
NOTA apuestas (legacy): TEXT[] con texto libre del programa oficial ("Apuestas: A ganador, segundo…"). Sin uso funcional; queda intacta para referencia.
NOTA apuestas_notas: texto libre opcional para notas del programa (ej: "Triplo Inicial — Pozo asegurado $50.000"). Sigue como columna en carreras.
COLUMNA ELIMINADA (may-2026): apuestas_habilitadas JSONB — reemplazada por tabla carrera_apuestas.
FUNCIÓN ELIMINADA (may-2026): apuestas_keys_validas(jsonb) — ya no necesaria.

### carrera_apuestas
id UUID PK DEFAULT gen_random_uuid(), carrera_id UUID NOT NULL REFERENCES carreras(id) ON DELETE CASCADE, tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('GAN','SEG','TER','EX','IM','TR','CUAT','X2','X2P','X3','X4','X5','CAD')), precio NUMERIC NOT NULL CHECK (precio > 0), nombre TEXT NULL, asegurado NUMERIC NULL CHECK (asegurado >= 0), incremento NUMERIC NULL CHECK (incremento >= 0), orden SMALLINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
UNIQUE (carrera_id, tipo)
INDEX idx_carrera_apuestas_carrera ON (carrera_id)
RLS: policy allow_all
NOTA: modelo relacional que reemplaza carreras.apuestas_habilitadas. Una fila por apuesta habilitada por carrera. nombre/asegurado/incremento son opcionales (detalles del programa).

### inscripciones
id UUID PK, carrera_id FK carreras, spc_id FK spcs, propietario_id FK, entrenador_id FK, jockey_titular_id FK, jockey_suplente_id FK, caballeriza_id FK, peon VARCHAR, capataz VARCHAR, sereno VARCHAR, numero_partidor, peso_declarado, peso_final, peso_balanza NUMERIC(5,2) NULL, estado ENUM(pre_inscripto/inscripto/confirmado/ratificado/forfait/no_presentado/mal_inscrito) DEFAULT 'inscripto', canal DEFAULT 'manual', motivo_estado VARCHAR, info_adicional, certificado_correr BOOLEAN, inscripto_por FK usuarios, ratificado_por FK usuarios
NOTA peso_balanza: peso real del CABALLO medido en balanza post-carrera (300–600 kg). Distinto del handicap (peso_declarado/peso_final). Se carga desde el modal "Pesos balanza" en resultados.html para todos los caballos que corrieron.
UNIQUE (carrera_id, spc_id)
ESTADOS VISIBLES EN UI: inscripto / mal_inscrito / ratificado / forfait. mal_inscrito agregado en sesión may-2026.
CRÍTICO: estado es ENUM rígido (estado_inscripcion). Para agregar valores usar ALTER TYPE ADD VALUE, NO migrar a VARCHAR (v_inscriptos_carrera depende del ENUM).

### resultados
id UUID PK, carrera_id FK UNIQUE, estado ENUM(provisional/oficial/en_protesta), tiempo_ganador, estado_pista VARCHAR(20) CHECK (IN 'seca','buena','algo_pesada','pesada','muy_pesada'), dividendos JSONB, incidentes, observaciones, oficializado_por FK, oficializado_at, created_at TIMESTAMPTZ NOT NULL DEFAULT now()

### resultado_apuestas
id UUID PK DEFAULT gen_random_uuid(), resultado_id FK resultados ON DELETE CASCADE NOT NULL, tipo VARCHAR(10) NOT NULL, val_apu NUMERIC NOT NULL DEFAULT 100, composicion VARCHAR(60) NULL, pozo NUMERIC NULL, vales INTEGER NULL, div_orig NUMERIC NULL, div_inc NUMERIC NULL, vacante BOOLEAN NOT NULL DEFAULT false, orden SMALLINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()

CONSTRAINTS:
- CHECK chk_resultado_apuestas_tipo: tipo IN ('GAN','SEG','TER','EX','IM','TR','CUAT','X2','X2P','X3','X4','X5','CAD')
- UNIQUE INDEX idx_resultado_apuestas_resultado_tipo_orden ON (resultado_id, tipo, orden)
- INDEX idx_resultado_apuestas_resultado_id ON (resultado_id)  ← no único, para lookup rápido
NOTA: TE (Tómbola Exacta) eliminado del set válido en may-2026. La única fila existente fue eliminada en la migración.

TIPOS DE APUESTA (13 tipos válidos):
| Código | Descripción          | Clasificación   |
|--------|----------------------|-----------------|
| GAN    | Ganador (1°)         | Per-carrera     |
| SEG    | Segundo (2°)         | Per-carrera     |
| TER    | Tercero (3°)         | Per-carrera     |
| EX     | Exacta               | Per-carrera     |
| IM     | Imperfecta           | Per-carrera     |
| TR     | Trifecta             | Per-carrera     |
| CUAT   | Cuatrifecta          | Per-carrera     |
| X2     | Doble                | Multi-carrera   |
| X2P    | Doble a Place        | Multi-carrera   |
| X3     | Triplo               | Multi-carrera   |
| X4     | Cuaterna             | Multi-carrera   |
| X5     | Quíntuplo            | Multi-carrera   |
| CAD    | Cadena               | Multi-carrera   |

CONVENCIÓN MULTI-MONTO (SEG, TER):
SEG y TER pueden pagar distintos dividendos según el monto de la apuesta base.
Se modela con varias filas para el mismo (resultado_id, tipo), diferenciadas por orden:
  - SEG orden=N, val_apu=$1  → dividendo para apuesta a $1
  - SEG orden=N+1, val_apu=$5 → dividendo para apuesta a $5
El índice único (resultado_id, tipo, orden) lo garantiza — mismo tipo en distintas posiciones
de la lista está permitido; mismo tipo en la misma posición no.
Máximo sugerido: GAN=1 fila, SEG=2 filas, TER=3 filas. No hay constraint de cantidad.

CONVENCIÓN MULTI-CARRERA (X2, X2P, X3, X4, X5, CAD):
El dividendo se registra en resultado_apuestas de la CARRERA DE CIERRE del ciclo.
No existe modelo de legs (no hay tabla de ciclos ni FK a carrera de inicio).
La composición (ej: "1/3-5/2-4/7") se almacena en el campo composicion VARCHAR(60).
Campo redistribucion_legs en resultados (JSONB, pendiente validación semántica) es
reserva futura para redistribución por pata — no usar aún.

### resultado_posiciones
id UUID PK, resultado_id FK resultados, inscripcion_id FK inscripciones, posicion INTEGER NULL, tiempo, diferencia, descalificado BOOLEAN, motivo_desc, empate BOOLEAN DEFAULT false, no_largo BOOLEAN NOT NULL DEFAULT false
UNIQUE (resultado_id, posicion) — NULL se trata como distinto en Postgres; múltiples no_largo=true con posicion=NULL son válidos
CRÍTICO: borrar siempre antes de borrar inscripciones
MODELO no_largo: cuando un ratificado no llega a largar, se inserta {posicion:null, no_largo:true}. Su mandil se conserva (hueco). Consultable para Bloque C liquidación.

### resultado_log
id UUID PK, resultado_id FK, usuario_id FK, accion, datos_antes JSONB, datos_despues JSONB, created_at

### comision_config
id UUID PK, club_id FK clubs NOT NULL, hipodromo_id FK hipodromos nullable, categoria_id FK categorias_carrera nullable, tipo_profesional ENUM nullable, tipo_cobro ENUM NOT NULL, porcentaje NUMERIC nullable, monto_fijo NUMERIC nullable, posicion_bono INTEGER nullable, monto_bono NUMERIC nullable, descuento_fondo_solidario_pct NUMERIC DEFAULT 0, descuento_incentivo_pct NUMERIC DEFAULT 0, otros_descuentos JSONB nullable, vigente_desde DATE NOT NULL, vigente_hasta DATE nullable, descripcion TEXT nullable, activo BOOLEAN NOT NULL DEFAULT true
NOTA: diseño granular (reemplaza el modelo original de 7 porcentajes fijos). tipo_cobro determina si aplica porcentaje, monto_fijo o bono por posición.

### liquidaciones
id UUID PK, club_id FK NOT NULL, reunion_id FK NOT NULL, profesional_id FK nullable, propietario_id FK nullable, periodo_desde DATE nullable, periodo_hasta DATE nullable, total_bruto DECIMAL NOT NULL DEFAULT 0, total_descuentos DECIMAL NOT NULL DEFAULT 0, total_neto DECIMAL GENERATED ALWAYS AS (total_bruto - total_descuentos) STORED, estado ENUM(borrador/aprobada/pagada/anulada) NOT NULL DEFAULT 'borrador', numero_recibo VARCHAR nullable, recibo_pdf_url TEXT nullable, aprobado_por FK usuarios nullable, pagado_at TIMESTAMPTZ nullable, notas TEXT nullable, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
CRÍTICO: total_neto es columna generada — no se puede actualizar directamente

### liquidacion_detalle
id UUID PK, liquidacion_id FK, carrera_id FK, concepto, descripcion, monto_bruto DECIMAL, porcentaje_desc DECIMAL, monto_descuento DECIMAL, monto_neto DECIMAL GENERATED

### resoluciones
id UUID PK, club_id FK, reunion_id FK, numero VARCHAR UNIQUE, fecha DATE, tipo, texto, documento_url, estado DEFAULT 'borrador', creado_por FK

### resolucion_entidades
id UUID PK, resolucion_id FK resoluciones NOT NULL, entidad_tipo VARCHAR NOT NULL, entidad_id UUID NOT NULL, descripcion TEXT nullable
NOTA: tabla de detalle — entidades (profesional/SPC/propietario/caballeriza) afectadas por una resolución (relación N:1 con resoluciones).

### notificaciones
id UUID PK, tipo, titulo, mensaje, leida BOOLEAN DEFAULT FALSE, usuario_id FK, created_at

### auditoria
id UUID PK, club_id FK, usuario_id FK, tabla, registro_id UUID, accion, datos_antes JSONB, datos_despues JSONB, ip, created_at

## JSONB distribucion_premios
{"1": 60, "2": 19, "3": 12, "4": 6, "5": 3, "bono_ganador": 250000, "bono_posicion_desde": 6, "bono_posicion_hasta": 8, "bono_posicion_monto": 100000, "ganancia_minima": 100000}
NOTA ganancia_minima: piso de premio por puesto. Si `bolsa * pct / 100 < ganancia_minima`, ese puesto se eleva al piso; los que superan el piso no se tocan. Display via `premios-utils.js#calcPremiosConPiso` (bolsa efectiva derivada al render); pago efectivo via `liquidaciones.html` (que aplica el Math.max incluyendo bonos). `carreras.bolsa_total` en DB es siempre la bolsa nominal — nunca se persiste la efectiva.

## ALTER TABLE ejecutados posteriormente
```sql
ALTER TABLE spcs ALTER COLUMN club_id DROP NOT NULL;
ALTER TABLE profesionales ALTER COLUMN club_id DROP NOT NULL;
ALTER TABLE propietarios ALTER COLUMN club_id DROP NOT NULL;
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS patente VARCHAR(50);
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS hipodromo_patente VARCHAR(150);
ALTER TABLE propietarios ADD COLUMN IF NOT EXISTS nombre_stud VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activo';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS caballeriza_id UUID REFERENCES caballerizas(id);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS peon VARCHAR(200);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS capataz VARCHAR(200);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS sereno VARCHAR(200);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS certificado_correr BOOLEAN DEFAULT FALSE;
ALTER TABLE carreras ADD COLUMN IF NOT EXISTS bolsa_bonos DECIMAL(15,2) DEFAULT 0;
-- premio_minimo eliminada (21/05/2026): unificado en distribucion_premios.ganancia_minima
ALTER TABLE resultados ADD COLUMN IF NOT EXISTS estado_pista VARCHAR(20);
-- resultados.apuestas NUNCA se aplicó (columna inexistente en base). El modelo de apuestas vive en carreras.apuestas (TEXT[]).
ALTER TABLE spcs ADD COLUMN IF NOT EXISTS certificado_correr BOOLEAN DEFAULT FALSE;
ALTER TYPE tipo_pista ADD VALUE IF NOT EXISTS 'tierra';
ALTER TYPE estado_reunion ADD VALUE IF NOT EXISTS 'programada';
ALTER TYPE estado_inscripcion ADD VALUE IF NOT EXISTS 'inscripto';
-- Sesión may-2026:
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS localidad VARCHAR(150);
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo';
ALTER TABLE propietarios ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo';
ALTER TABLE caballerizas ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo';
ALTER TABLE caballerizas ADD COLUMN IF NOT EXISTS hipodromo_patente VARCHAR(50);
ALTER TABLE caballerizas ADD COLUMN IF NOT EXISTS chaquetilla_descripcion VARCHAR(500);
ALTER TABLE caballerizas ADD COLUMN IF NOT EXISTS chaquetilla_url VARCHAR(500);
ALTER TABLE profesionales ALTER COLUMN categoria_jockey TYPE VARCHAR(50); -- era ENUM
ALTER TYPE estado_inscripcion ADD VALUE IF NOT EXISTS 'mal_inscrito';
CREATE TABLE IF NOT EXISTS caballeriza_responsables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caballeriza_id UUID NOT NULL REFERENCES caballerizas(id) ON DELETE CASCADE,
  profesional_id UUID REFERENCES profesionales(id),
  apellido VARCHAR(150), nombre VARCHAR(150),
  documento_tipo VARCHAR(10) DEFAULT 'DNI', documento_nro VARCHAR(30),
  fecha_nacimiento DATE, localidad VARCHAR(150),
  rol VARCHAR(20) CHECK (rol IN ('propietario','copropietario')),
  porcentaje DECIMAL, activo BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE caballeriza_responsables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON caballeriza_responsables FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- Sesión may-2026 (segunda iteración — inscripciones + PDF):
ALTER TABLE hipodromos ADD COLUMN IF NOT EXISTS cantidad_gateras INTEGER DEFAULT 12;
-- Sesión 12/05/2026 (seguridad — RLS + auditoría):
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS auditoria_retencion_meses INTEGER DEFAULT 12;
-- Sesión 14/05/2026 (liquidaciones + resultados fixes):
ALTER TABLE resultado_posiciones ADD COLUMN IF NOT EXISTS empate BOOLEAN DEFAULT false;
ALTER TABLE resultado_posiciones ADD COLUMN IF NOT EXISTS dividendo NUMERIC(10,2); -- (22/05/2026) cotización a ganador POR CABALLO (no pago por puesto): se carga a mano por mandil en la sección M.(F)/Sport. Poblada para todos los starters; el favorito = argmin. Verificado contra R5C1 (el 6° pagaba 2,20)
ALTER TABLE resultado_posiciones ALTER COLUMN posicion DROP NOT NULL; -- (28/05/2026) posicion ahora nullable para soportar no_largo=true con posicion=NULL
ALTER TABLE resultado_posiciones ADD COLUMN IF NOT EXISTS no_largo BOOLEAN NOT NULL DEFAULT false; -- (28/05/2026) caballo ratificado que no llega a largar; posicion=NULL, conserva mandil (hueco)
ALTER TABLE resultados ADD COLUMN IF NOT EXISTS favorito_mandil INTEGER; -- (22/05/2026) número de partidor del caballo favorito antes de la carrera (para análisis de M.(F))
-- Migraciones carga-resultados-v2 (22/05/2026):
-- CREATE TABLE resultado_apuestas (id UUID PK, resultado_id FK, tipo VARCHAR(10), val_apu NUMERIC(10,2), composicion VARCHAR(60), pozo NUMERIC(15,2), vales INTEGER, div_orig NUMERIC(12,2), div_inc NUMERIC(12,2), vacante BOOLEAN, orden SMALLINT, created_at TIMESTAMPTZ)
-- ALTER TABLE resultados ADD COLUMN redistribucion_legs JSONB; -- umbral redistribución por pata ({"1":"gde","2":"al3",...}) PENDIENTE VALIDACIÓN SEMÁNTICA con secretario de carreras
-- ALTER TABLE resultados ADD COLUMN tiempo_clima VARCHAR(50); -- condición climática ("BUENO", "REGULAR", "MALO") separada de estado_pista
-- ALTER TABLE resultados DROP/ADD CONSTRAINT estado_pista_check CHECK (IN ('normal','seca','humeda','fangosa','pesada'))
ALTER TABLE resultados ADD COLUMN IF NOT EXISTS estado_pista VARCHAR(20) CHECK (estado_pista IN ('seca','buena','algo_pesada','pesada','muy_pesada'));
CREATE TABLE IF NOT EXISTS resultado_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resultado_id UUID NOT NULL REFERENCES resultados(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id),
  accion VARCHAR(50),
  datos_antes JSONB,
  datos_despues JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE resultado_log ENABLE ROW LEVEL SECURITY;
-- RLS resultado_log: Fase 2B via fn_club_de_resultado
-- Sesión 19/05/2026 (apuestas, comisariato, carta-llamados, navegación):
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS comision_carreras JSONB DEFAULT '[]'::jsonb;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS sponsors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS disclaimer_importante TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS disclaimer_nota TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS facebook TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS tiktok TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS twitter_x TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS youtube TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS comisariato JSONB DEFAULT '[]'::jsonb;
ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS fechas_inscripciones TEXT;
ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS fechas_forfaits TEXT;
ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS fechas_compromiso_montas TEXT;
ALTER TABLE carreras ADD COLUMN IF NOT EXISTS apuestas TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE carreras ADD COLUMN IF NOT EXISTS numero_carrera_programa INTEGER;
-- feature/apuestas-schema (26/05/2026):
CREATE OR REPLACE FUNCTION apuestas_keys_validas(obj jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT NOT EXISTS (SELECT 1 FROM jsonb_object_keys(obj) AS k WHERE k NOT IN ('GAN','SEG','TER','EX','IM','TR','X2','X2P','X3','X4','X5','CAD','TE')) $$;
ALTER TABLE carreras ADD COLUMN apuestas_habilitadas JSONB NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN apuestas_notas TEXT NULL, ADD CONSTRAINT chk_carreras_apuestas_keys CHECK (apuestas_keys_validas(apuestas_habilitadas));
ALTER TABLE resultado_apuestas ADD CONSTRAINT chk_resultado_apuestas_tipo CHECK (tipo IN ('GAN','SEG','TER','EX','IM','TR','X2','X2P','X3','X4','X5','CAD','TE'));
CREATE UNIQUE INDEX idx_resultado_apuestas_resultado_tipo_orden ON resultado_apuestas (resultado_id, tipo, orden);
-- add_cuat_to_apuestas_validas (27/05/2026):
-- CREATE OR REPLACE FUNCTION apuestas_keys_validas(...) — agrega 'CUAT' al set
-- ALTER TABLE resultado_apuestas DROP CONSTRAINT chk_resultado_apuestas_tipo;
-- ALTER TABLE resultado_apuestas ADD CONSTRAINT chk_resultado_apuestas_tipo CHECK (tipo IN ('GAN','SEG','TER','EX','IM','TR','X2','X2P','X3','X4','X5','CAD','TE','CUAT'));
-- Columnas agregadas y eliminadas en la misma sesión (refactor):
-- clubs.apuestas_simples TEXT[]  -- agregada y luego eliminada (movida a carreras.apuestas)
-- reuniones.apuestas_combinadas JSONB  -- agregada y luego eliminada (simplificación modelo)
-- reuniones.comisariato JSONB  -- agregada y luego eliminada (migrado a clubs.comisariato)
-- Sesión 20/05/2026 (Programa Oficial + ult_performances):
ALTER TABLE spcs ADD COLUMN IF NOT EXISTS ult_performances TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS secretaria_carreras_nombre TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS inscripciones_telefono TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS sponsor_destacado JSONB;
-- feature/apuestas-tabla-relacional (27/05/2026):
CREATE TABLE carrera_apuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrera_id UUID NOT NULL REFERENCES carreras(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('GAN','SEG','TER','EX','IM','TR','CUAT','X2','X2P','X3','X4','X5','CAD')),
  precio NUMERIC NOT NULL CHECK (precio > 0),
  nombre TEXT NULL,
  asegurado NUMERIC NULL CHECK (asegurado >= 0),
  incremento NUMERIC NULL CHECK (incremento >= 0),
  orden SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (carrera_id, tipo)
);
CREATE INDEX idx_carrera_apuestas_carrera ON carrera_apuestas (carrera_id);
ALTER TABLE carrera_apuestas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON carrera_apuestas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- Migración apuestas_habilitadas → carrera_apuestas (datos insertados via script)
ALTER TABLE carreras DROP COLUMN apuestas_habilitadas;
ALTER TABLE carreras DROP CONSTRAINT IF EXISTS chk_carreras_apuestas_keys;
DROP FUNCTION IF EXISTS apuestas_keys_validas;
-- Actualizar CHECK de resultado_apuestas: remover TE, dejar set final sin TE, con CUAT:
ALTER TABLE resultado_apuestas DROP CONSTRAINT chk_resultado_apuestas_tipo;
ALTER TABLE resultado_apuestas ADD CONSTRAINT chk_resultado_apuestas_tipo CHECK (tipo IN ('GAN','SEG','TER','EX','IM','TR','CUAT','X2','X2P','X3','X4','X5','CAD'));
-- Nota: la única fila con tipo='TE' fue borrada manualmente antes de alterar el constraint.
-- add_peso_balanza_to_inscripciones (27/05/2026):
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS peso_balanza NUMERIC(5,2) NULL;
-- Peso real del caballo en balanza post-carrera (300–600 kg). Distinto del handicap.
```

## Vistas

### v_inscriptos_carrera
Tablas: inscripciones ⋈ spcs, LEFT JOIN propietarios, profesionales (entrenador), profesionales (jockey_titular), profesionales (jockey_suplente), caballerizas
Propósito: listado completo de inscriptos con nombres resueltos (spc, propietario, entrenador, jockeys, caballeriza) para una carrera dada.

### v_programa_reunion
Tablas: reuniones ⋈ hipodromos ⋈ carreras ⋈ categorias_carrera, LEFT JOIN inscripciones
Propósito: programa de una reunión con totales de inscriptos y forfaits por carrera (GROUP BY carrera).

### v_sanciones_vigentes
Tablas: sanciones (filtro: estado='activa' AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE))
Propósito: sanciones activas y aún no vencidas; equivale a las sanciones aplicables a la fecha actual.

### v_spcs_activos
Tablas: spcs WHERE estado='activo', LEFT JOIN spc_propietarios (activo=true, fecha_hasta IS NULL), propietarios, profesionales (entrenador), caballerizas
Propósito: SPCs en actividad con propietario principal, entrenador actual y caballeriza.

## Storage Supabase
Bucket: **chaquetillas** (público, creado sesión may-2026)
Policies SQL requeridas después de crear el bucket desde la UI:
```sql
CREATE POLICY "chaquetillas_public_read"   ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'chaquetillas');
CREATE POLICY "chaquetillas_auth_insert"   ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chaquetillas');
CREATE POLICY "chaquetillas_auth_update"   ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'chaquetillas');
CREATE POLICY "chaquetillas_auth_delete"   ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chaquetillas');
```
URL pública: `https://unlhcuanfrtpatoipwve.supabase.co/storage/v1/object/public/chaquetillas/{filename}`

## Funciones de seguridad (12/05/2026)

Todas con `STABLE SECURITY DEFINER SET search_path = public`. Ver SECURITY.md para detalle de diseño.

| Función | Firma | Propósito |
|---|---|---|
| `fn_get_user_club_id()` | `() → UUID` | club_id del usuario logueado (vía email del JWT) |
| `fn_is_super_admin()` | `() → BOOLEAN` | true si el usuario logueado es super_admin |
| `fn_club_de_reunion(uuid)` | `(UUID) → UUID` | club_id de una reunión |
| `fn_club_de_carrera(uuid)` | `(UUID) → UUID` | club_id de una carrera (vía reuniones) |
| `fn_club_de_inscripcion(uuid)` | `(UUID) → UUID` | club_id de una inscripción (vía carreras → reuniones) |
| `fn_club_de_liquidacion(uuid)` | `(UUID) → UUID` | club_id de una liquidación |
| `fn_club_de_resolucion(uuid)` | `(UUID) → UUID` | club_id de una resolución |
| `fn_club_de_caballeriza(uuid)` | `(UUID) → UUID` | club_id de una caballeriza |
| `fn_club_de_resultado(uuid)` | `(UUID) → UUID` | club_id de un resultado (vía fn_club_de_carrera) |
| `fn_auditoria_log()` | `() → TRIGGER` | Registra INSERT/UPDATE/DELETE en tabla auditoria |
| `fn_purgar_auditoria()` | `() → INTEGER` | Borra registros viejos según auditoria_retencion_meses por club |
| `fn_proteger_rol_club_id_usuario()` | `() → TRIGGER` | BEFORE UPDATE en usuarios — impide auto-promoción de rol/club_id |

## Triggers (12/05/2026)

| Trigger | Tabla | Evento | Función |
|---|---|---|---|
| `trg_audit_reuniones` | reuniones | AFTER INSERT/UPDATE/DELETE | fn_auditoria_log() |
| `trg_audit_carreras` | carreras | AFTER INSERT/UPDATE/DELETE | fn_auditoria_log() |
| `trg_audit_inscripciones` | inscripciones | AFTER INSERT/UPDATE/DELETE | fn_auditoria_log() |
| `trg_audit_resultados` | resultados | AFTER INSERT/UPDATE/DELETE | fn_auditoria_log() |
| `trg_audit_liquidaciones` | liquidaciones | AFTER INSERT/UPDATE/DELETE | fn_auditoria_log() |
| `trg_audit_clubs` | clubs | AFTER INSERT/UPDATE/DELETE | fn_auditoria_log() |
| `trg_audit_usuarios` | usuarios | AFTER INSERT/UPDATE/DELETE | fn_auditoria_log() |
| `trg_audit_categorias_carrera` | categorias_carrera | AFTER INSERT/UPDATE/DELETE | fn_auditoria_log() |
| `trg_proteger_rol_club_id_usuario` | usuarios | BEFORE UPDATE | fn_proteger_rol_club_id_usuario() |

## RLS (actualizado 14/05/2026)

26 tablas con RLS endurecida. ISSUE-017 cerrado. Ver SECURITY.md para detalle por tabla y patrón aplicado.

Tablas endurecidas: `caballerizas`, `categorias_carrera`, `reuniones`, `liquidaciones`, `resoluciones`, `hipodromos`, `carreras`, `inscripciones`, `resultados`, `resultado_posiciones`, `resultado_log`, `liquidacion_detalle`, `spcs`, `propietarios`, `profesionales`, `sanciones`, `usuarios`, `clubs`, `comision_config`, `club_configuracion`, `spc_propietarios`, `novedades_reunion`, `performances`, `resolucion_entidades`, `caballeriza_responsables`, `auditoria`

Sin tablas con policy permisiva residual.

Script base: `docs/migrations/2026-05-12-rls.sql`
