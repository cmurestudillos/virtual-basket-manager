# Roadmap — qué entra y qué no

Inventario de todo lo que tendría un manager de baloncesto completo, sacado de
**PC Basket 6.5** y de **International Basketball Manager**. Nada de esto está
decidido: la idea es que marques qué entra, qué se recorta y qué se descarta.

Estado: ✅ hecho · ⬜ propuesto · ⛔ bloqueado por otra pieza.

Tamaño orientativo: **S** una tarde · **M** un par de días · **L** una semana o
más.

---

## Bloque 0 — Base (hecho)

|     | Pieza                                                                        |     |
| --- | ---------------------------------------------------------------------------- | --- |
| ✅  | Esqueleto Electron + Vue + SQLite, IPC tipado, migraciones                   |     |
| ✅  | Dominio de baloncesto: posiciones, 21 atributos, reglamentos, acta, tácticas |     |
| ✅  | Motor de partido posesión a posesión, determinista y calibrado               |     |
| ✅  | Dataset ficticio: 18 equipos, 216 jugadores                                  |     |
| ✅  | Partidas: crear, cargar, borrar, sembrar el mundo                            |     |
| ✅  | Pantallas: menú, nueva partida, club, plantilla, ficha de jugador            |     |
| ✅  | Arnés de verificación con Electron real y capturas                           |     |
| ✅  | Instalador NSIS con icono, verificado también empaquetado                    |     |

---

## Bloque 1 — Que se pueda jugar una temporada

Lo mínimo para que esto sea un juego y no una base de datos bonita.

Decidido con el usuario antes de empezar: calendario con fechas reales,
playoffs formato ACB (8 equipos, cuartos al mejor de 3 y semis/final al mejor de
5), previa antes del partido y entrega en tres fases.

### Fase 1 — jugar la liga regular (hecha)

|     | Pieza                   | Detalle                                                                     |     |
| --- | ----------------------- | --------------------------------------------------------------------------- | --- |
| ✅  | Calendario de liga      | 34 jornadas ida y vuelta sobre domingos reales del calendario del juego     | M   |
| ✅  | Avance del reloj        | Avanzar día o ir a la jornada; se para en seco en el partido del usuario    | M   |
| ✅  | Partido del usuario     | **Modo resultado cuarto a cuarto**: él pulsa para pasar de cuarto           | M   |
| ✅  | Partidos de la IA       | Resueltos de una tacada por el mismo motor, con acta completa guardada      | M   |
| ✅  | Clasificación           | Con el desempate de baloncesto: _average_ particular, no diferencia general | S   |
| ✅  | Resultados y calendario | Jornada a jornada, con el acta de cada partido enlazada                     | M   |

### Fase 2 — que las decisiones sean tuyas (hecha)

|     | Pieza                     | Detalle                                                                        |     |
| --- | ------------------------- | ------------------------------------------------------------------------------ | --- |
| ✅  | Alineación y rotación     | Cinco inicial por huecos y minutos objetivo, con encaje a la vista             | M   |
| ✅  | Pizarra táctica           | Los seis sistemas de cada lado, los tres deslizadores y la referencia ofensiva | S   |
| ✅  | Estadísticas de temporada | Medias por jugador y líderes de la liga en ocho categorías                     | M   |

Los minutos objetivo llegan al motor: lo que se reparte en la pantalla es lo que
se juega. Si no suman 200 el motor reparte en proporción, así que una rotación a
medio cuadrar sigue siendo jugable. La pizarra y la rotación del usuario son las
únicas editables — las de la IA se leen, que es lo que hará falta para el ojeo.

### Fase 3 — que haya campeón (hecha)

|     | Pieza                | Detalle                                                            |     |
| --- | -------------------- | ------------------------------------------------------------------ | --- |
| ✅  | **Playoffs**         | 8 equipos, cuartos al mejor de 3 y semis/final al mejor de 5       | M   |
| ✅  | Factor cancha        | Por posición en la liga regular: 2-1 al mejor de 3 y 2-2-1 al de 5 | S   |
| ✅  | Fin de temporada     | Campeón guardado y arranque de la temporada siguiente              | M   |
| ⛔  | Ascensos y descensos | Necesitan una segunda división, que está en el Bloque 4            | M   |

El cuadro es fijo (1-8, 2-7, 3-6, 4-5; el 1-8 se cruza con el 4-5) y vive en la
misma tabla de partidos que la liga, con `series_id`: por eso una eliminatoria
nunca cuenta en la clasificación. Los partidos que sobran al decidirse una serie
se borran, así que un 2-0 no deja un tercer partido colgado en el calendario.

**Ascensos y descensos se quedan fuera a propósito**: el mundo del juego es una
sola liga de 18 equipos, así que no hay ni de dónde subir ni adónde bajar.
Entran con la segunda división del Bloque 4.

## Bloque 2 — El club

### Fase 1 — estado físico (hecha)

|     | Pieza             | Detalle                                                          |     |
| --- | ----------------- | ---------------------------------------------------------------- | --- |
| ✅  | Entrenamiento     | Foco por bloque y por jugador, intensidad 1-10; mueve atributos  | M   |
| ✅  | Lesiones y fatiga | Forma entre partidos, bajas en días de calendario y parte médico | M   |

La forma baja con los minutos jugados y sube con los días de descanso; el
riesgo de lesión sale de los minutos, de cómo llegaba el jugador y de su edad.
Se entrena cada lunes del calendario, y el techo de potencial manda: un veterano
en su techo no sube, y a partir de los treinta pierde piernas. Todo ello vale
para los equipos de la IA igual que para el del usuario.

### Fase 2 — el dinero (hecha)

|     | Pieza               | Detalle                                                                   |     |
| --- | ------------------- | ------------------------------------------------------------------------- | --- |
| ✅  | Finanzas            | Libro de movimientos, abonos, TV, patrocinio, taquilla, nóminas y premios | L   |
| ✅  | Pabellón y afición  | Aforo ampliable, abonados, ambiente y precio de la entrada                | M   |
| ✅  | Consejo y objetivos | Objetivo por reputación, confianza y despido                              | M   |

Cada apunte mueve la caja en la misma transacción, así que el libro y el saldo no
pueden contar cosas distintas. El precio de la entrada es la primera decisión
económica del juego: sube el ingreso por espectador, baja la asistencia y enfría
el pabellón, y el ambiente decide cuántos abonados renuevan en verano. El consejo
mira la tabla **y** la caja: estar en números rojos resta confianza aunque se gane.

Sólo lleva libros el club del usuario: mientras no haya mercado, la contabilidad
de los rivales no decide nada.

### Fase 3 — la cantera y el banquillo (hecha)

|     | Pieza          | Detalle                                                       |     |
| --- | -------------- | ------------------------------------------------------------- | --- |
| ✅  | Cuerpo técnico | Cinco puestos con efecto medible y mercado de técnicos libres | M   |
| ✅  | Cantera        | Juveniles por instalaciones, hornada cada verano y promoción  | M   |

Ningún puesto del cuerpo técnico es decorativo: el ayudante acelera el
entrenamiento, el preparador ahorra desgaste y recupera antes, el médico acorta
las bajas, el ojeador decide el margen de error con el que ves a un jugador que
no es tuyo y el analista te enseña la pizarra del rival en la previa. Un puesto,
un técnico: contratar a otro para el mismo sitio deja libre al que estaba.

Un juvenil es un jugador más marcado como cantera: no se viste, no entra en la
rotación y no aparece en el acta hasta que se le promociona, y para subirlo hace
falta hueco en la plantilla (tope de catorce). Las instalaciones —ampliables
pagando— deciden cuántos salen cada verano y con qué techo.

## Bloque 3 — Mercado

### Fase 1 — fichajes y contratos (hecha)

|     | Pieza                | Detalle                                                                          |     |
| --- | -------------------- | -------------------------------------------------------------------------------- | --- |
| ✅  | Fichajes y traspasos | Ventanas de verano e invierno, oferta con traspaso y ficha, y respuesta razonada | L   |
| ✅  | Agentes libres       | Bolsa de libres desde el primer día, y rescisiones que cuestan dinero            | M   |
| ✅  | Contratos            | Vencimientos, renovaciones y salida libre de quien no renueva                    | M   |
| ✅  | Ojeo                 | Lo que ves de un jugador de fuera lleva el margen de tu ojeador                  | M   |
| ✅  | Mercado de la IA     | Vencen contratos en toda la liga y los clubes cortos cubren sus huecos           | M   |

Un fichaje tiene que cuadrar tres cifras a la vez —lo que pide el club, lo que
pide el jugador de ficha y lo que hay en caja— y el «no» llega siempre con su
motivo, para poder volver a probar con otra cifra. La plantilla va de diez a
catorce: ni se puede vaciar el vestuario ni acumular jugadores.

### Fase 2 — cesiones, negociación y reglamento (hecha)

|     | Pieza                 | Detalle                                                             |     |
| --- | --------------------- | ------------------------------------------------------------------- | --- |
| ✅  | Cesiones              | Ceder y pedir cedido hasta final de temporada, con vuelta en verano | M   |
| ✅  | Negociación           | Contraoferta del club cuando la oferta se queda cerca               | M   |
| ✅  | Cupos y tope salarial | Mínimo de jugadores de formación y tope de nómina del consejo       | M   |
| ⛔  | **Draft**             | Necesita formato NBA, que es casi un juego aparte (Bloque 4)        | M   |

Una cesión es un jugador cuyo club de hoy y cuyo dueño no coinciden: juega,
entra en la rotación y sale en el acta con el que lo recibe, y vuelve el 30 de
junio. Nadie cede a uno de sus seis mejores ni se queda por debajo del mínimo de
plantilla.

El reglamento va por delante del dinero: cuatro jugadores de formación —los del
país del club— siempre inscritos, y una nómina que no puede pasar del tope que
fija el consejo, medido contra lo que ingresa el club. No es un _salary cap_ de
la NBA con excepciones y sanciones: es un consejo europeo que no firma lo que no
se puede pagar.

**El draft se queda fuera a propósito**: sólo tiene sentido con formato NBA, que
está en el Bloque 4 y es casi un juego aparte.

## Bloque 4 — Más competiciones

|     | Pieza                       | Detalle                                                           |     |
| --- | --------------------------- | ----------------------------------------------------------------- | --- |
| ⬜  | Copa                        | Eliminatoria a partido único en sede neutral, estilo Copa del Rey | M   |
| ⬜  | Competición continental     | Fase de liga más playoffs y Final Four                            | L   |
| ⬜  | Segunda división y ascensos |                                                                   | M   |
| ⬜  | Selecciones y ventanas FIBA |                                                                   | M   |
| ⬜  | Formato NBA                 | Conferencias, divisiones, _cap_, draft — es casi un juego aparte  | L   |

## Bloque 5 — Ver el partido

Aquí es donde más se parecían y más se diferenciaban las dos referencias.

|     | Pieza                 | Detalle                                                             |     |
| --- | --------------------- | ------------------------------------------------------------------- | --- |
| ⬜  | Retransmisión textual | Jugada a jugada con marcador y reloj; el motor ya emite los eventos | M   |
| ⬜  | Partido en vivo       | Pausar, cambiar, tiempo muerto, cambiar de defensa sobre la marcha  | L   |
| ⬜  | Pista 2D              | Vista cenital con los diez jugadores, estilo PC Basket              | L   |
| ⬜  | Pista 3D              | Como IBM. Caro y lo último que aporta valor de manager              | L   |

## Bloque 6 — Alrededor

|     | Pieza                   | Detalle                                                 |     |
| --- | ----------------------- | ------------------------------------------------------- | --- |
| ⬜  | Historial y palmarés    | Temporadas, títulos, récords                            | M   |
| ⬜  | Prensa y notificaciones | Bandeja de avisos, ruedas de prensa                     | M   |
| ⬜  | Editor de datos         | Editar equipos y plantillas dentro del juego            | M   |
| ⬜  | Ajustes                 | Resolución, reglamento, idioma                          | S   |
| ⬜  | Firma del instalador    | El instalador ya se genera con icono; falta certificado | S   |
| ⬜  | Actualizaciones         | Publicación y auto-update, si llega a distribuirse      | M   |

---

## Decisiones abiertas

1. **¿Qué liga se simula?** Ahora hay una liga ficticia de 18 equipos. ¿ACB
   ficticia, varias ligas europeas, NBA, o todo?
2. **¿Datos reales o inventados?** El dataset actual es inventado a propósito
   para no arrastrar el problema de marcas que apareció en el proyecto de
   fútbol. Cambiar de idea más adelante es caro.
3. **¿Hasta dónde llega el partido en vivo?** Determina buena parte del
   esfuerzo total: no es lo mismo texto que pista 2D.
4. **¿Un país o el mundo?** IBM abarcaba medio mundo; PC Basket, una liga bien
   hecha. Las dos son opciones defendibles y llevan a proyectos muy distintos.
