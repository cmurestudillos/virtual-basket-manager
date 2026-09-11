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

## El mercado

Dos ventanas: verano (julio a septiembre) e invierno (enero). Fuera de ellas no
se ficha, que es lo que obliga a llegar hecho a la temporada en vez de arreglar
la plantilla en marzo.

Un fichaje son **tres cifras que tienen que cuadrar a la vez**: lo que pide el
club que lo tiene, lo que pide el jugador de ficha y lo que hay en caja. El
precio de traspaso sale del valor del jugador corregido por contrato y edad —a
quien le queda un año casi no se le puede pedir nada, porque en verano se va
gratis— y la respuesta a una oferta llega con su motivo, no con un no a secas.

La plantilla va de **diez a catorce**: por debajo no se rescinde ni se vende, y
por encima no se ficha. Rescindir cuesta la mitad de lo que quedaba por pagar.
Lo que ves de un jugador que no es tuyo pasa por el ojeador, así que fichar
siempre es apostar.

Cuando la oferta se queda cerca, el club **contraoferta** en vez de decir que no:
pone su precio y tú decides. Por debajo de un 60 % de lo que pide, ni se sienta.

Una **cesión** es un jugador cuyo club de hoy y cuyo dueño no coinciden: juega,
entra en la rotación y sale en el acta con el que lo recibe, y vuelve a casa el
30 de junio. Nadie cede a uno de sus seis mejores.

El **reglamento** va por delante del dinero: cuatro jugadores de formación —los
del país del club— siempre inscritos, y una nómina que no puede pasar del tope
que fija el consejo, medido contra lo que ingresa el club en una temporada. No es
un _salary cap_ de la NBA con excepciones y sanciones; es un consejo europeo que
no firma lo que no se puede pagar.

Entre temporadas el mercado se mueve solo: vuelven los cedidos, vencen los
contratos de toda la liga —la IA renueva a la mayoría y el resto queda libre— y
los clubes cortos de plantilla salen a buscar entre los libres. Al usuario no se
le renueva nadie solo: lo que no renueve él, se va.

## El cuerpo técnico y la cantera

Cinco puestos, y ninguno decorativo: **ayudante** (el entrenamiento progresa más
rápido), **preparador físico** (menos desgaste y mejor recuperación), **médico**
(bajas más cortas y algo menos frecuentes), **ojeador** (el margen de error con
el que ves a un jugador que no es tuyo, de ±14 sin ojeador a ±2 con una
eminencia) y **analista** (te enseña la pizarra del rival en la previa). Si un
puesto no cambiara nada medible, sobraría.

La ficha crece al cuadrado con el nivel, así que hay que elegir dónde gastar. Un
puesto admite un técnico: contratar a otro para el mismo sitio deja libre al que
estaba, y el mercado de técnicos es la misma tabla sin equipo, igual que un
agente libre es un jugador sin equipo.

Un **juvenil** es un jugador más, marcado como cantera: no se viste, no entra en
la rotación y no sale en el acta. Promocionar es quitarle la marca, y hace falta
hueco en la plantilla. Las instalaciones (1-5) deciden cuántos salen cada verano
y con qué techo; a los diecinueve, el que no sube se va libre.

## El dinero

Todo va en **céntimos enteros**. Cada movimiento se apunta en el libro del club y
mueve la caja en la misma transacción: no hay dos cifras que puedan
desincronizarse.

Ingresos: abonos, televisión y patrocinio se cobran de una vez en pretemporada
—los dos últimos escalan con la reputación elevada a 1,5, que es lo que explica
que un grande pueda pagar cuatro veces más en fichas—, la taquilla entra partido
a partido y los premios al cerrar el curso. Gastos: nóminas y mantenimiento del
pabellón, el primero de cada mes. Con el precio por defecto y sin tocar nada,
cualquier club termina la temporada ligeramente en positivo; lo que decide si
gana o pierde dinero son las decisiones.

El **precio de la entrada** es la primera de ellas. Sube el ingreso por
espectador, baja la asistencia y enfría el ambiente; bajarlo llena el pabellón.
Los abonados son el suelo de la asistencia —su asiento está pagado— y se renuevan
en verano según el ambiente con el que acabó la temporada. El pabellón se puede
ampliar pagando al contado, hasta 25.000 espectadores.

El **consejo** pone un objetivo según la reputación del club: al grande le piden
el título y al pequeño mantenerse. La confianza se mueve con cada partido —perder
contra quien debías ganar pesa el triple— y con un repaso el primero de mes que
mira la clasificación y la caja. A cero, despido: la partida se queda como está y
el reloj deja de avanzar.

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

## El mundo

Veintiuna ligas en catorce países, y el mismo motor para todas. Lo que cambia de
una a otra es su **forma**: cuántos equipos tiene, cuántas categorías, con qué
reglamento juega y cuánto dinero mueve. Eso vive en `scripts/seed-data/leagues.mts`,
que es el mapa del mundo, y de ahí sale el dataset.

Una liga juega **las vueltas que le caben** en las 34 jornadas de la temporada:
dieciocho equipos juegan ida y vuelta (34), diez juegan tres vueltas (27) y una
de treinta juega una sola (29). No hay formatos distintos, hay un número de
vueltas distinto — que además es como funcionan las ligas pequeñas de verdad.

De todo ese mundo, una partida sólo **simula las ligas del país del club que
diriges**, más sus competiciones continentales. Simular las veintiuna serían
más de cuatro mil partidos por temporada para enseñar clasificaciones que nadie
va a abrir. Los clubes de los demás países existen igual: salen en el mercado y
pueden cruzarse contigo en Europa.

## Las competiciones continentales

Cuatro: **Euroliga**, **Eurocup** y **Europe League** en Europa, y **American
League** en América. Las cuatro se juegan igual —dieciséis equipos, fase de liga
a una vuelta los jueves, los ocho primeros a cuartos al mejor de tres y una
Final Four a partido único en sede neutral— porque lo que las distingue no es el
reglamento: es contra quién juegas y cuánto paga.

Se juegan **entre semana**, en jueves, viernes y lunes. La liga es de domingos,
así que Europa no para el calendario nacional: lo que hace es cansar a la
plantilla, que es exactamente lo que tiene que costar.

El reparto de plazas no necesita una tabla de coeficientes por país. Dentro de
cada liga manda **el puesto** del año anterior: su tercero no puede entrar antes
que su segundo. Entre ligas manda **la reputación**: la plaza siguiente se la
lleva el mejor club que quede de cualquier país. Con un tope de cuatro plazas
por liga, eso reparte como reparte la realidad —las ligas fuertes se llevan
más, pero ninguna se lo lleva todo—. Y hay un **aforo mínimo de pabellón** por
categoría: un club que pelea por entrar en la primera y no llega sabe
exactamente qué obra le falta.

## Las divisiones

El mundo de la partida tiene **dos ligas**, y las dos se juegan enteras con el
mismo motor. La segunda no está para decorar: es de donde salen los que suben y
adonde van los que bajan, y sin ella descender sería desaparecer.

Al cerrar el curso bajan los **dos últimos** de primera y suben los **dos
primeros** de segunda, de modo que ninguna categoría cambia de tamaño y el
calendario del año siguiente se genera igual que el de este. Lo que viaja con el
club es su **reputación**: de ella salen los derechos de televisión, el
patrocinio, el precio que aguanta la grada y lo que le exige el consejo, así que
subir cambia el club entero y no sólo la lista de rivales. Los premios de liga se
cobran por categoría —en segunda, un tercio—, y allí el objetivo del consejo es
ascender: un título que no existe no se puede pedir.

Todo esto vive en `shared/domain/promotion.ts`, que no sabe de base de datos: le
das dos clasificaciones y te dice quién sube y quién baja.

## La Copa

Ocho equipos, **partido único** y **sede neutral**, tres rondas en tres días
seguidos de febrero: la Copa del Rey de toda la vida. Es lo contrario de los
playoffs —allí el mejor tiene varias oportunidades y el factor cancha; aquí
cualquiera te gana una tarde— y por eso merece la pena tenerla.

Se clasifican los ocho primeros al cerrar la primera vuelta. La Copa tiene su
propia temporada, de su propia competición, así que sus partidos no pueden
colarse jamás en la clasificación de la liga ni mover el contador de jornadas; a
cambio, el reloj de la partida mira ahora a todas las competiciones vivas a la
vez. En sede neutral no hay taquilla para nadie.

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
