# ¿Quién quiere ser millonario? · Edición Ecuador

Un juego de navegador inspirado en el concurso televisivo, creado por Yunga. Estudio azul y dorado, quince preguntas y un millón de dólares **virtuales**. Proyecto de aficionados, sin afiliación con el programa.

## Publicarlo y jugar

1. En este repositorio, abre **Settings → Pages**.
2. En **Source**, selecciona **Deploy from a branch**.
3. Selecciona **main** y **/(root)** y pulsa **Save**.
4. Cuando GitHub termine la publicación, abre la dirección que muestra Pages.

La dirección prevista es `https://yunga18.github.io/Quien_quiere_ser_millonario_ec/`. Solo funcionará después de activar Pages. [Guía oficial de GitHub](https://docs.github.com/es/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

No necesita compilación, base de datos, claves, cuentas para jugadores ni servicios de pago. HTML, CSS y JavaScript se publican directamente. Las herramientas de desarrollo son opcionales.

## Incluye

- 90 preguntas de Ecuador; cada partida elige 15, con cinco grados de dificultad y respuestas barajadas.
- Confirmación de respuesta definitiva, pausa de suspenso, revelación y explicación educativa.
- 50:50, público simulado y llamada simulada de 30 segundos, utilizables una vez por partida y combinables. Público y amigo pueden equivocarse. El reloj de llamada nunca termina la pregunta.
- Seguros de $1.000 en la pregunta 5 y $32.000 en la 10. Retirarse entrega lo ganado; fallar entrega el último seguro alcanzado. Sin límite de tiempo para responder.
- Sonidos originales sintetizados, ambiente de estudio, voz opcional del navegador y pantalla completa donde sea compatible.
- Guardado automático, continuar partida y cinco mejores marcas locales. Se conservan las veinte últimas partidas para reducir repeticiones.
- Computadora, tablet y celular; teclado A/B/C/D y Enter, diálogos accesibles y modo de movimiento reducido.
- Caché para jugar sin conexión después de una primera carga completa por HTTPS o localhost.

El guardado pertenece a este navegador: no se sincroniza entre dispositivos y se pierde al borrar sus datos. Si el navegador bloquea el almacenamiento, se puede jugar sin guardar. La voz depende de las voces españolas instaladas. La web no solicita cámara, micrófono ni ubicación y no envía resultados a un servidor.

## Desarrollo

Con Python 3:

```sh
python3 -m http.server 8080
```

Abre `http://localhost:8080`. Usa un servidor; los módulos JavaScript no funcionan abriendo `index.html` directamente como archivo.

Las reglas se verifican sin dependencias adicionales, con Node 22 o posterior:

```sh
npm test
```

Las pruebas de navegador requieren herramientas de desarrollo:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

También se ejecutan en **Actions → Probar el juego**, con una partida completa, recarga, retiro, fallo, cuatro anchos de pantalla y modo sin conexión. Las capturas y el informe quedan en el artefacto `pruebas-millonario-ecuador` durante siete días. Este flujo solo lee el código y no publica la web.

## Cambiar preguntas o diseño

- `js/questions.js`: preguntas, categorías, dificultades (1–5) y explicaciones. La primera opción de cada pregunta del banco es la correcta; el motor baraja las opciones al comenzar. Cada dificultad necesita al menos tres preguntas.
- `js/engine.js`: reglas, premios, seguros y validación del guardado.
- `js/app.js`: pantallas, comodines, voz y persistencia local.
- `js/audio.js`: sonidos propios con Web Audio.
- `styles.css`: diseño y adaptación de pantallas.
- `assets/studio.webp`: fondo del estudio; `assets/emblem.svg`: emblema editable.
- `sw.js`: incrementa la versión de `CACHE` cuando publiques cambios para renovar el modo sin conexión.

Las respuestas están en el cliente, como corresponde a un juego local de entretenimiento; no es una plataforma para competiciones con premios reales.

## Referencias del banco

Las preguntas incluyen explicaciones. Varias añaden un enlace de consulta al revelar la respuesta. Entre las referencias están la [UNESCO](https://whc.unesco.org/en/statesparties/ec/), el [Banco Central del Ecuador](https://www.bce.fin.ec/25/index.html), la [Constitución](https://www.asambleanacional.gob.ec/sites/default/files/documents/old/constitucion_de_bolsillo.pdf), el [catálogo de la Casa de la Cultura](https://biblioteca.casadelacultura.gob.ec/), el [Comité Olímpico Ecuatoriano](https://archivo.coe.org.ec/index.php/noticias/3058-hoy-recordamos-la-historica-medalla-de-oro-de-jefferson-perez-en-los-jj-oo-atlanta-1996) y [Galápagos Conservancy](https://www.galapagos.org/about_galapagos/history/).

## Arte del estudio

El fondo fue generado con la herramienta integrada de imágenes a partir de la composición de referencia aportada por el usuario. Es una escena estática; las transiciones, luces de interfaz y efectos del juego se realizan con CSS y JavaScript. El emblema es un SVG creado para esta edición.

Descripción de producción: «Estudio televisivo de concurso, render 3D cinematográfico panorámico, arquitectura simétrica azul noche con arcos dorados, público en penumbra, concursante a la izquierda y presentador a la derecha, pantalla central sin texto y suelo oscuro para superponer la interfaz. Sin logotipos, subtítulos ni paneles de respuestas en el fondo». El archivo final está en `assets/studio.webp`.
