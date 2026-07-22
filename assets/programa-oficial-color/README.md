# Assets — Programa Oficial Color

## tapa-caballos.jpg
Foto de portada (1600px ancho). Reemplazable por foto propia del cliente.
Fuente actual: Unsplash (libre uso comercial).
Para reemplazar: copiar la nueva foto con este mismo nombre de archivo.

## tapa-01.jpg … tapa-04.jpg
Fotos propias de HDO subidas por Leo (22/07/2026), candidatas para la tapa.
Yesi elige la definitiva. Mientras tanto `.tapa-foto` usa **tapa-01.jpg**.
- `tapa-01.jpg` — 5 caballos de frente entrando en la recta, baranda roja (2048x1365)
- `tapa-02.jpg` — pelotón de 6 en la recta, cielo azul y polvareda, cartel de los 100 m (2048x1365)
- `tapa-03.jpg` — 3 caballos de frente, polvareda dorada a contraluz (899x599)
- `tapa-04.jpg` — largada de frente con el tablero "HIPÓDROMO" de fondo (799x599)

Las tres primeras son 3:2, igual que `tapa-caballos.jpg`, así que el `center/cover` de
`.tapa-foto` las recorta igual que la foto anterior. `tapa-04.jpg` es 4:3 y la de menor
resolución: se recorta más y es la más floja para imprimir a página completa.

## banner-revista-palermo.jpg
Flyer del sponsor Revista Palermo (tira 1600x222, con QR de la app).
Se renderiza como franja de ancho completo al final del programa color (`.flyer-pie`).

## Pendiente para próxima iteración
- Sponsors con logos propios: usar tabla `clubs.sponsors` (array de objetos `{nombre, logo_url}`).
- Foto de tapa por reunión: campo `reuniones.foto_tapa_url` (no existe aún en DB).
