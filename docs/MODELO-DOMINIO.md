# Modelo de dominio

Cruce de las dos referencias del proyecto: **PC Basket 6.5** (Dinamic, ACB,
media docena de valores muy legibles por jugador y una simulación que se leía
en el acta) e **International Basketball Manager** (ligas de medio mundo, dos
docenas de habilidades por ficha, plantilla y cuerpo técnico).

Donde las dos discrepan, gana PC Basket en **legibilidad** e IBM en
**profundidad de datos**: fichas ricas, pero presentadas de forma que se
entiendan de un vistazo.

## Por qué no vale copiar el modelo del fútbol

|                            | Fútbol                    | Baloncesto                     |
| -------------------------- | ------------------------- | ------------------------------ |
| Sucesos por partido        | 2-4 goles                 | 130-180 posesiones             |
| Alineación                 | 11 titulares, 3-5 cambios | 5 en pista, cambios ilimitados |
| Decisión táctica principal | formación                 | **reparto de minutos** y ritmo |
| Estadística individual     | goles y asistencias       | acta completa de 15 columnas   |
| Campeón de liga            | primero de la tabla       | normalmente **playoffs**       |
| Estructura de eliminatoria | ida y vuelta              | **serie al mejor de 3/5/7**    |

Las dos últimas filas son las que más condicionan el esquema de base de datos;
la tercera es la que más condiciona el motor.

## Posiciones

`PG` base · `SG` escolta · `SF` alero · `PF` ala-pívot · `C` pívot.

No son etiquetas: el motor reparte posesiones, rebotes y tapones por posición, y
jugar fuera de sitio penaliza según la distancia en la escala 1-5 (suave a
distancia 1, severa a partir de 2). Ver `src/shared/domain/positions.ts`.

## Atributos (21, escala 1-99)

| Grupo    | Atributos                                                         |
| -------- | ----------------------------------------------------------------- |
| Tiro     | tiro cercano, media distancia, triple, tiros libres, finalización |
| Creación | pase, manejo, penetración                                         |
| Defensa  | defensa exterior, defensa interior, robo, tapón                   |
| Rebote   | rebote ofensivo, rebote defensivo                                 |
| Físico   | velocidad, fuerza, salto, resistencia                             |
| Mental   | visión de juego, regularidad, agresividad                         |

Más estáticos: altura, peso, **envergadura** (explica tapones y robos mejor que
la altura sola), nacionalidad, edad y potencial.

**La media se pondera por posición.** Un pívot con 30 de triple no es peor
jugador por ello, y un base con 30 de rebote defensivo tampoco. Es un cálculo,
no una columna.

## Reglamentos

|                   | FIBA / ACB                     | NBA                 |
| ----------------- | ------------------------------ | ------------------- |
| Cuartos           | 4 × 10 min                     | 4 × 12 min          |
| Faltas personales | 5                              | 6                   |
| Bonus de equipo   | 5ª falta del cuarto            | 5ª falta del cuarto |
| Posesión          | 24" / 14" tras rebote ofensivo | igual               |
| Acta              | 12 inscritos                   | 13                  |

El motor no sabe cuál está en juego: recibe un `Ruleset` y obedece. La
competición decide cuál usa.

## Tácticas

Seis sistemas ofensivos (interior, exterior, contraataque, bloqueo directo,
aclarado, juego de equipo) y seis defensivos (individual, zonas 2-3 / 3-2 /
1-3-1, presión a toda pista, caja y uno). Cada uno con perfil numérico real:
reparto de tiro, ritmo, asistencias, pérdidas, faltas y desgaste. Nada
cosmético.

Más tres deslizadores 1-10: ritmo, intensidad defensiva e insistencia en el
rebote ofensivo. Y un jugador designado como referencia ofensiva.

## La rotación

La plantilla entera está en la rotación: cinco titulares, cada uno en un hueco
de pista del 1 al 5, y el resto por orden de banquillo. Cada jugador lleva sus
**minutos objetivo**, y la suma de referencia es 200 — cinco huecos durante
cuarenta minutos.

El motor no exige que cuadren. Pasa los minutos a cuota de partido y los
normaliza a los cinco huecos, así que una rotación de 150 minutos se juega en la
proporción que pidió el entrenador en vez de dejar al equipo sentado un cuarto
entero. Cuadrarla sigue siendo cosa del usuario: es lo que decide si el noveno
juega diez minutos o dos.

Un jugador puede ocupar un hueco que no es el suyo, con penalización por
distancia en la escala 1-5: de escolta a alero casi no se nota, de base a pívot
sí. La pantalla lo enseña como porcentaje de encaje antes de jugar, no después.

## Estado físico

La frescura dentro del partido la lleva el motor; entre partidos manda la
**forma** (0-100), que es con la que el jugador llega al siguiente. Un partido
completo cuesta unos 24 puntos con 80 de resistencia, y se recuperan unos 11 al
día: con jornada semanal se llega entero, con playoffs cada tres días no.

Las **lesiones** se cuentan en días de calendario, no en partidos, justo para
que esa diferencia se note. El riesgo de cada partido sale de tres cosas, y las
tres son consecuencia de decisiones del entrenador: minutos jugados, forma con
la que llegó y edad. Un lesionado no se viste, así que la rotación tiene que
apañarse sin él.

El **entrenamiento** se resuelve cada lunes del calendario del juego. El foco
—del bloque, o propio de un jugador— decide qué atributos se trabajan y la
intensidad 1-10 cuánto: más intensidad mejora antes, cansa más y lesiona más. El
potencial es un techo de verdad: cuanto más cerca está el jugador, menos sube, y
al llegar deja de crecer. Pasados los treinta ya no mejora, y empieza a perder
velocidad, salto y resistencia. La semana de recuperación no mejora a nadie:
devuelve forma y quita riesgo.

## Los playoffs

La liga regular no corona campeón: reparte el **factor cancha**. Ocho equipos,
cuartos al mejor de 3 y semifinales y final al mejor de 5, como la ACB.

El cuadro es fijo —1-8, 2-7, 3-6 y 4-5, y el ganador del 1-8 se cruza con el del
4-5— para que en octubre se pueda mirar la clasificación y saber con quién te
vas a encontrar. Dentro de cada serie, el mejor clasificado abre y cierra en
casa: 2-1 al mejor de 3 y 2-2-1 al mejor de 5. Ese reparto **es** el factor
cancha; no hace falta ninguna otra mecánica, porque el motor ya premia jugar en
casa.

Una serie no es una tabla aparte: son varias filas de `games` con el mismo
`series_id`, y quien juega en casa el primer partido es, por construcción, el
mejor clasificado. De ahí se reconstruye todo. Al decidirse una serie se borran
los partidos que ya no se van a jugar, y cuando se cierra una ronda entera se
genera la siguiente.

## El acta

Se guarda **en crudo**: minutos, T2 c/i, T3 c/i, TL c/i, rebotes ofensivos y
defensivos, asistencias, robos, tapones, pérdidas, faltas cometidas, faltas
recibidas y +/-.

De ahí salen, calculados: puntos, rebotes totales, porcentajes y la
**valoración ACB**:

```
(puntos + rebotes + asistencias + robos + tapones + faltas recibidas)
− (tiros fallados + pérdidas + faltas cometidas)
```

De la suma de las actas sale la **estadística de temporada**: medias por
partido, porcentajes y líderes de la liga. Tampoco se guarda nada de eso —
se calcula al leer, sobre las actas en crudo. Para la tabla de líderes hay un
mínimo de partidos disputados, la mitad de los que lleva la liga, como en la
ACB: sin él, el que juega un partido, mete veinte puntos y se lesiona lidera la
anotación hasta junio.

## El motor de partido (v0)

Bucle de posesiones. Cada una: pérdida → falta sin tiro → elección de tirador
por uso → tipo de tiro (sistema × perfil del tirador × posición) → tapón →
falta en tiro → acierto → asistencia o rebote → segunda opción.

Encima corren cansancio y **rotación por objetivo de minutos** — la mecánica de
PC Basket. Sin ella los doce jugadores acaban con los mismos minutos, que no se
parece a ningún partido real.

El motor es **reanudable**: `GameSimulation` juega de cuarto en cuarto y
`simulateGame` no es más que un bucle encima. El partido del usuario se juega a
botonazos (modo resultado, un cuarto por pulsación) y el del rival se resuelve
de una tacada, pero los dos salen del mismo camino de código y del mismo azar —
hay un test que comprueba exactamente esa igualdad. Mantener el estado entre
cuartos, en vez de resolver el partido entero y limitarse a enseñarlo por
partes, es lo que permitirá ajustar la pizarra en el descanso sin rehacer nada.

Un partido a medias vive sólo en memoria. Si se cierra la aplicación en el
tercer cuarto, el encuentro vuelve a estar sin jugar y se repite idéntico,
porque la semilla sale del id del partido. Guardar cuartos sueltos obligaría a
que la clasificación supiera qué hacer con un partido a medio jugar.

Calibrado sobre 40 partidos con plantillas de nivel medio:

| Métrica                 | Motor  | Referencia ACB |
| ----------------------- | ------ | -------------- |
| Puntos por equipo       | 76,5   | 75-85          |
| Tiros de campo          | 46,1 % | ~46 %          |
| Triples                 | 37,0 % | ~35 %          |
| Tiros libres intentados | 19,7   | ~19            |
| Rebotes                 | 34,8   | ~34            |
| Asistencias             | 19,2   | ~16            |
| Pérdidas                | 9,0    | ~12            |
| Faltas                  | 19,2   | ~20            |

Se queda corto en pérdidas y algo largo en asistencias. Las constantes están
todas agrupadas al principio de `simulate-game.ts` precisamente para poder
ajustarlo cuando haya estadística real contra la que comparar.

Lo que el motor todavía **no** hace: tiempos muertos, faltas intencionadas al
final, últimas posesiones con el reloj en contra, ajuste táctico en vivo, ni
efecto real del público.
