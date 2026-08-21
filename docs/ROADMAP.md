# Roadmap — qué entra y qué no

Inventario de todo lo que tendría un manager de baloncesto completo, sacado de
**PC Basket 6.5** y de **International Basketball Manager**. Nada de esto está
decidido: la idea es que marques qué entra, qué se recorta y qué se descarta.

Estado: ✅ hecho · ⬜ propuesto.

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

### Fase 2 — que las decisiones sean tuyas

|     | Pieza                     | Detalle                                                    |     |
| --- | ------------------------- | ---------------------------------------------------------- | --- |
| ⬜  | Alineación y rotación     | Cinco inicial y minutos objetivo, editables por el usuario | M   |
| ⬜  | Pizarra táctica           | Los seis sistemas de cada lado y los tres deslizadores     | S   |
| ⬜  | Estadísticas de temporada | Medias por jugador y líderes de la liga                    | M   |

### Fase 3 — que haya campeón

|     | Pieza            | Detalle                                                           |     |
| --- | ---------------- | ----------------------------------------------------------------- | --- |
| ⬜  | **Playoffs**     | 8 equipos, cuartos al mejor de 3 y semis/final al mejor de 5      | M   |
| ⬜  | Factor cancha    | Por posición en la liga regular                                   | S   |
| ⬜  | Fin de temporada | Campeón, ascensos y descensos, arranque de la temporada siguiente | M   |

## Bloque 2 — El club

|     | Pieza               | Detalle                                                        |     |
| --- | ------------------- | -------------------------------------------------------------- | --- |
| ⬜  | Entrenamiento       | Foco por jugador o por bloque; afecta a atributos y a lesiones | M   |
| ⬜  | Lesiones y fatiga   | Estado físico entre partidos, bajas por semanas                | M   |
| ⬜  | Cuerpo técnico      | Ayudante, preparador físico, médico, analista, ojeador         | M   |
| ⬜  | Finanzas            | Presupuesto, taquilla, TV, patrocinio, nóminas                 | L   |
| ⬜  | Pabellón y afición  | Aforo, abonados, ambiente, ampliación                          | M   |
| ⬜  | Consejo y objetivos | Expectativas, confianza, despido                               | M   |
| ⬜  | Cantera             | Juveniles, promoción al primer equipo                          | M   |

## Bloque 3 — Mercado

|     | Pieza                   | Detalle                                                         |     |
| --- | ----------------------- | --------------------------------------------------------------- | --- |
| ⬜  | Fichajes y traspasos    | Ofertas, negociación de precio y ficha                          | L   |
| ⬜  | Agentes libres          | Y rescisiones                                                   | M   |
| ⬜  | Cesiones                |                                                                 | M   |
| ⬜  | Contratos               | Vencimientos, renovaciones, cláusulas                           | M   |
| ⬜  | Ojeo                    | Informes con incertidumbre real sobre lo que ves del jugador    | M   |
| ⬜  | Mercado de la IA        | Que los rivales fichen entre ellos y la liga se mueva sola      | M   |
| ⬜  | Cupos y límite salarial | Extranjeros y jugadores de formación (ACB) o _salary cap_ (NBA) | M   |
| ⬜  | **Draft**               | Sólo si entra formato NBA                                       | M   |

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
