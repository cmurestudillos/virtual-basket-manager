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

## El motor de partido (v0)

Bucle de posesiones. Cada una: pérdida → falta sin tiro → elección de tirador
por uso → tipo de tiro (sistema × perfil del tirador × posición) → tapón →
falta en tiro → acierto → asistencia o rebote → segunda opción.

Encima corren cansancio y **rotación por objetivo de minutos** — la mecánica de
PC Basket. Sin ella los doce jugadores acaban con los mismos minutos, que no se
parece a ningún partido real.

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
