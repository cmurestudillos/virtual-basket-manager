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
| ✅  | Dataset ficticio: 21 ligas, 338 equipos, 4.056 jugadores                     |     |
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

**Ascensos y descensos se quedaron fuera de esta fase a propósito**: el mundo del
juego era entonces una sola liga de 18 equipos, así que no había ni de dónde
subir ni adónde bajar. Entraron con la segunda división del Bloque 4.

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
| ✅  | Draft                 | Llegó con el formato NBA del Bloque 4: lotería y dos rondas         | M   |

Una cesión es un jugador cuyo club de hoy y cuyo dueño no coinciden: juega,
entra en la rotación y sale en el acta con el que lo recibe, y vuelve el 30 de
junio. Nadie cede a uno de sus seis mejores ni se queda por debajo del mínimo de
plantilla.

El reglamento va por delante del dinero: cuatro jugadores de formación —los del
país del club— siempre inscritos, y una nómina que no puede pasar del tope que
fija el consejo, medido contra lo que ingresa el club. No es un _salary cap_ de
la NBA con excepciones y sanciones: es un consejo europeo que no firma lo que no
se puede pagar.

El draft llegó con el formato NBA del Bloque 4, y allí está contado; en esa liga
el tope del consejo lo sustituye un tope salarial blando con impuesto de lujo.

## Bloque 4 — Más competiciones

### Fase 1 — la Copa (hecha)

|     | Pieza | Detalle                                                               |     |
| --- | ----- | --------------------------------------------------------------------- | --- |
| ✅  | Copa  | Ocho equipos, partido único en sede neutral, tres rondas en tres días | M   |

Se sortea al cerrar la primera vuelta con los ocho primeros de la clasificación
de ese momento, como la Copa del Rey. Vive en su propia temporada, así que sus
partidos no tocan la clasificación de la liga ni el contador de jornadas, y el
reloj de la partida mira ahora a las dos competiciones a la vez. En sede neutral
no hay taquilla ni factor cancha para nadie, y llegar lejos paga premio.

### Fase 2 — segunda división y ascensos (hecha)

|     | Pieza                       | Detalle                                                             |     |
| --- | --------------------------- | ------------------------------------------------------------------- | --- |
| ✅  | Segunda división y ascensos | Desbloquea los ascensos y descensos que dejó pendientes el Bloque 1 | M   |

Dieciocho clubes más en una **Liga Plata** que se juega entera, jornada a
jornada y con el mismo motor: sin eso, descender sería desaparecer del mundo.
Suben dos y bajan dos, así que ninguna división cambia de tamaño y el calendario
del curso siguiente sale igual. La reputación viaja con el equipo —de ahí salen
la televisión, el patrocinio y lo que le pide el consejo—, en segunda se cobra un
tercio de los premios, y el objetivo del consejo allí es ascender, no ganar un
título que no existe. La Copa sigue siendo de la máxima categoría: si diriges en
plata la ves, pero no la juegas.

### Fase 3 — el mundo y las competiciones continentales (hecha)

|     | Pieza                   | Detalle                                            |     |
| --- | ----------------------- | -------------------------------------------------- | --- |
| ✅  | El mundo                | 21 ligas en 14 países, 338 clubes y 4.056 fichas   | L   |
| ✅  | Competición continental | Euroliga, Eurocup, Europe League y American League | L   |

El mundo pasa de una liga a **veintiuna**: España, Alemania, Francia, Grecia,
Lituania, Adriática y Estados Unidos con dos categorías; Turquía, Italia,
Israel, Argentina, Chile y Australia con una; y Bélgica y Países Bajos
compartiendo la suya, como la BNXT de verdad. Cada liga juega **las vueltas que
le caben** en 34 jornadas —dieciocho equipos juegan ida y vuelta, diez juegan
tres vueltas, treinta juegan una—, así que ninguna necesita un formato propio.
Al principio sólo se simulaban las ligas del país del club; desde la fase 4 se
eligen los países al crear la partida.

Las **cuatro competiciones continentales** se juegan igual —dieciséis equipos,
fase de liga a una vuelta los jueves, cuartos al mejor de tres y Final Four a
partido único en sede neutral— y lo que las separa es el rango: la Euroliga se
queda a los mejores del continente, la Eurocup recoge a los siguientes y la
Europe League a los de después; nadie juega dos. El reparto no usa tabla de
coeficientes: dentro de cada liga manda el puesto del año anterior y entre ligas
manda la reputación, con un tope de cuatro plazas por liga. Y hay un **aforo
mínimo de pabellón** para entrar en cada categoría, que es lo que por fin le da
un objetivo claro a ampliar el pabellón.

### Fase 4 — el resto del bloque (hecha)

|     | Pieza                       | Detalle                                                           |     |
| --- | --------------------------- | ----------------------------------------------------------------- | --- |
| ✅  | Escoger ligas jugables      | Elegir qué países se juegan, con su coste en tiempo de partida    | M   |
| ✅  | Selecciones y ventanas FIBA | Clasificación, Mundial y selección dirigible a la vez que el club | L   |
| ✅  | Formato NBA                 | Conferencias, play-in, playoffs de 16, draft y tope blando        | L   |
| ✅  | Moral                       | Minutos, resultados, entrenamiento y selección; efecto en pista   | M   |

**Escoger ligas jugables.** Se eligen **países**, no ligas, y sólo al crear la
partida: las divisiones de un país van atadas por los ascensos, y una liga que
empezara a jugarse a mitad de partida no tendría ni clasificación del año
anterior ni historia. El país del club va siempre. Cada país elegido se juega
entero —calendario, playoffs, ascensos y **su copa**, que ahora tienen los
catorce— y el resto del mundo sigue existiendo: sus clubes fichan, entran en las
continentales y se pueden consultar, pero su liga no se disputa. Las
continentales se juegan en los continentes de los países elegidos.

La pantalla de nueva partida enseña lo que cuesta cada país en tiempo de espera
por temporada, con atajos para jugar sólo el tuyo, tu continente o el mundo
entero. La temporada no se cierra hasta que terminan **todas** las ligas
elegidas: si la tuya ya tiene campeón, el panel dice cuáles faltan. Las ofertas
de la carrera llegan de cualquiera de los países que se juegan, así que irse al
extranjero ya es posible. Las partidas anteriores siguen jugando sólo el país de
su club.

**Selecciones y ventanas FIBA.** Veintiuna selecciones —las nacionalidades con
doce jugadores o más— y un **Mundial cada verano**: el anfitrión, que rota, y los
tres primeros de cinco grupos de clasificación a ida y vuelta, jugados en tres
ventanas (noviembre, febrero y primeros de agosto). El Mundial son cuatro grupos
de cuatro, cuartos, semifinales y final en agosto. No hay campeonatos
continentales alternos: quince de las veintiuna son europeas y un torneo
continental dejaría a Australia y a Senegal sin nada.

Las ventanas van en viernes y lunes, así que no pisan ni la liga ni Europa, pero
**el convocado se pierde el domingo con su club** y vuelve con el cansancio y las
lesiones que traiga. Como en la realidad, en noviembre y febrero no sueltan
jugadores ni la liga americana ni los clubes con competición continental.

La selección **se dirige como en la vida real**: a la vez que el club, sólo ella
o sólo el club. Se elige al crear la partida o llega por ofertas de la carrera,
que se abren al acabar el Mundial según cómo le fue a cada federación. Se
convoca a doce entre todos los jugadores del país, se hace alineación y pizarra
en la misma pantalla que el club y los partidos se juegan igual, en vivo si se
quiere. La federación pide según el puesto en el ranking y destituye si el
resultado se queda dos escalones por debajo (con el despido desactivado, opina
pero no echa). Sin club y con selección, el reloj sigue corriendo para dirigirla.
Si no se dirige selección, el verano no hace esperar: el Mundial se juega de
golpe al empezar la temporada siguiente. La bandeja avisa de los convocados del
club, y las nacionalidades se ven ya con su **bandera** (`flag-icons`, MIT, en
local).

**Formato NBA.** La liga americana de primera juega como la NBA con el calendario
de siempre (una vuelta de treinta): **dos conferencias de tres divisiones**, la
tabla se lee por conferencia —seis directos y del séptimo al décimo al
**play-in**—, **playoffs de dieciséis al mejor de siete** por conferencias hasta
unas finales entre ellas, y **nadie sube ni baja**. El consejo lee las rondas en
su escala: primera ronda y semifinales de conferencia son «playoffs», finales de
conferencia «semifinales» y finales «final». Las partidas guardadas estrenan el
formato al migrar, salvo las que estén en mitad de sus playoffs, que lo hacen la
temporada siguiente.

Al acabar la temporada americana se abre el **draft**: una clase de ochenta
prospectos de 19 a 22 años —la mitad americanos—, dos rondas de treinta y
**lotería** entre los catorce que no jugaron playoffs (las probabilidades de la
NBA desde 2019, las cuatro primeras elecciones sorteadas). La IA elige hasta tu
turno y tú escoges con lo que ve tu ojeador, o renuncias; lo que no se elija se
hace solo al empezar la temporada siguiente, y los que nadie quiso quedan libres.
Los elegidos firman **contrato de novato** con escala por elección.

El tope del consejo se sustituye allí por un **tope salarial blando**: la nómina
media de la liga. Por debajo se firma lo que quepa; por encima, sólo contratos
mínimos. Renovar a los tuyos no pasa por el tope —los derechos Bird—, así que se
puede acabar pagando **impuesto de lujo**: uno y medio por cada euro por encima
del umbral (un 22 % sobre el tope), cobrado al cerrar la temporada. No hay cupo de
formación. La IA no se mete en impuesto por un agente libre.

**Moral.** Vale para todos los jugadores del mundo. La mueven **los minutos**
comparados con los que cree merecer por su lugar en la plantilla, **los
resultados**, la **intensidad de entrenamiento** y **ser convocado** por su
selección, y vuelve sola a lo normal con los días. Tiene efecto: en pista suma o
resta a todos los atributos (de +4 eufórico a −6 hundido), el descontento **pide
más por renovar** y el enfadado **no renueva**, también en la IA, y la bandeja
avisa cuando alguien cruza la raya. Se ve en la plantilla, en la ficha y en los
contratos.

**Banderas en todas partes.** La nacionalidad se ve con su bandera en casi todas
las pantallas con jugadores —plantilla, ficha, alineación, entrenamiento,
estadísticas, mercado, cantera, draft, récords y el partido, acta y banquillo—,
en el cuerpo técnico y en el entrenador, que elige nacionalidad al crear la
partida.

## Bloque 5 — Ver el partido

Aquí es donde más se parecían y más se diferenciaban las dos referencias.

### Fase 1 — la retransmisión (hecha)

|     | Pieza                 | Detalle                                                          |     |
| --- | --------------------- | ---------------------------------------------------------------- | --- |
| ✅  | Retransmisión textual | Jugada a jugada con marcador y reloj, velocidad y salto al final | M   |

El cuarto se sigue jugando entero al pulsar el botón: lo que llega a la pantalla
ya está decidido, y la retransmisión sólo hace correr el reloj y destapa las
jugadas cuyo segundo ha pasado. Por eso saltar al final no cambia nada, y por
eso mientras corre el reloj el acta y los parciales se quedan como estaban al
empezar el cuarto: enseñarlos sería cantar el resultado antes de verlo.

El narrador cuenta como un comentarista y no como el acta: la canasta y su
asistencia van en una línea, el robo se cuenta desde el que roba, los tiros
libres seguidos se resumen («2 de 2 desde la línea»), cada falta dice la
personal que lleva y un parcial de 8-0 se anuncia. Para eso el motor apunta
ahora también los **cambios**, que hacía pero no registraba.

Y apuntarlos destapó un fallo que el acta escondía: **270 cambios por partido**,
un tercio de ellos deshaciendo el anterior en menos de un minuto. El que entraba
ya iba sobrado de minutos y salía en la posesión siguiente; el reparto final
cuadraba, pero a base de meter y sacar a los mismos sin parar. Ahora nadie sale
por minutos antes de dos minutos y medio en pista —el cansancio y las faltas no
esperan— y sólo entra quien va de verdad más corto de cuota que el que sale. Se
queda en unos 80 cambios, ninguno de ida y vuelta, con los mismos puntos por
partido y los minutos apenas 0,2 más lejos del objetivo.

Sólo se guarda la retransmisión de **los partidos del usuario**, compactada
(unos 10 KB por partido en vez de 60): son los únicos que se vuelven a abrir, y
guardar la de los miles de partidos de la IA engordaría la partida sin que nadie
la leyera.

### Fase 2 — el partido en vivo (hecha)

|     | Pieza           | Detalle                                                            |     |
| --- | --------------- | ------------------------------------------------------------------ | --- |
| ✅  | Partido en vivo | Pausar, cambiar, tiempo muerto, cambiar de defensa sobre la marcha | L   |

La diferencia de fondo con la retransmisión de la fase 1 es que aquí **nada
está decidido todavía**. El motor pasa a jugar **posesión a posesión** y la
pantalla pide una, la reproduce con su reloj y pide la siguiente: entre una y
otra caben las órdenes del banquillo. Por eso no se juega por delante — con
posesiones ya jugadas en la recámara, el cambio que ordenases llegaría tarde y
dirigir no significaría nada.

Partir el cuarto en posesiones no movió ni una tirada de dado: un partido que
nadie toca sale **exactamente igual** jugado en vivo que simulado de una tacada,
y eso es lo primero que comprueban los tests. La huella del motor sobre
veinticinco partidos es la misma antes y después.

Se dirige desde el banquillo: los cinco de pista con sus minutos, sus faltas y
sus piernas, y el cambio se hace señalando a uno de cada lado. En cuanto
ordenas el primero, **el motor te deja el banquillo** —si siguiera rotando por
su cuenta desharía la orden en dos posesiones— y hay un botón para devolvérselo.
El tiempo muerto son los del reglamento, devuelven algo de piernas a los cinco
de pista y se cuentan; la pizarra cambia de defensa y de ritmo sobre la marcha.

Los dos modos conviven en el mismo partido: se puede dirigir el primer cuarto y
llevarse el resto simulado, o no dirigir nada. Y el consejo, la taquilla y las
lesiones pasan por el mismo sitio en los dos casos, así que verlo de una manera
o de otra deja lo mismo en la partida.

### Lo que queda del bloque

|     | Pieza    | Detalle                                                |     |
| --- | -------- | ------------------------------------------------------ | --- |
| ⬜  | Pista 2D | Vista cenital con los diez jugadores, estilo PC Basket | L   |
| ⬜  | Pista 3D | Como IBM. Caro y lo último que aporta valor de manager | L   |

## Bloque 6 — Alrededor

|     | Pieza                   | Detalle                                                |     |
| --- | ----------------------- | ------------------------------------------------------ | --- |
| ✅  | Modos de juego          | Mánager (un club) y carrera (te fichan otros)          | L   |
| ✅  | Dimitir y año sabático  | Irse por su pie, escuchar ofertas con equipo y esperar | M   |
| ✅  | Dificultad              | Incluye poder jugar sin despido                        | S   |
| ✅  | Historial y palmarés    | Temporadas, títulos, récords                           | M   |
| ✅  | Prensa y notificaciones | Bandeja de avisos, ruedas de prensa                    | M   |
| ✅  | Editor de datos         | Editar equipos y plantillas dentro del juego           | M   |
| ✅  | Ajustes                 | Resolución y reglamento; el idioma, al final           | S   |
| ✅  | Firma del instalador    | Lista para firmar; falta comprar el certificado        | S   |
| ✅  | Actualizaciones         | Auto-update contra GitHub Releases, sin publicar aún   | M   |

### Modos de juego y dificultad

**Mánager** es dirigir un club: la partida se acaba si te echan. **Carrera** es
la otra mitad —te quedas sin equipo y otro club te contrata según lo que hayas
hecho—, y entró en cuanto estuvo el palmarés, que era lo que le faltaba. El modo
se elige al crear la partida, junto al despido, porque no es un ajuste: es de
qué va la partida.

Lo que vale un entrenador **no se guarda en ninguna columna**: se calcula del
historial cada vez, y salen tres cosas en este orden — los títulos, el
rendimiento contra lo que daba de sí cada club y el tamaño de los clubes
dirigidos. El rendimiento pesa más que el escudo a propósito: si mandara el
tamaño del club, fracasar en un grande valdría más que triunfar en un modesto,
que es justo lo contrario de lo que se quiere medir. Los despidos restan poco: a
todo el mundo le echan alguna vez.

Lo único que sí se guarda son las **etapas** —qué club dirigiste y entre qué
temporadas—, porque eso no se deduce de nada: la partida sólo sabe a quién
diriges hoy, y sin esas filas el palmarés se apuntaría los títulos que ganó tu
antecesor en el club nuevo. El historial las respeta desde el primer día.

Cuando el consejo te destituye llegan **las ofertas**, y llegan en ese momento y
no en verano: los clubes destituyen y contratan en enero, y coger un banquillo a
mitad de temporada es heredar lo que lleve hecho el equipo, que es media gracia
del modo. Salen sólo de las ligas que se están jugando —las del país— por una
razón de fondo: son las únicas que tienen calendario ese año, así que fichar por
un club griego en enero te dejaría en una liga que esa temporada no existe.

**Dimitir y esperar** llegaron después, y las dos cosas iban juntas por una
razón técnica: esperar en el paro exige que el mundo se juegue sin nadie en el
banquillo. No se quitó el equipo dirigido de la partida —medio juego lo lee—
sino que el reloj aprendió a avanzar **como espectador**: nadie para en ningún
partido, la IA los juega todos, llega el verano y arranca la temporada siguiente.
El reloj normal sigue parado sin banquillo; sólo la espera lo mueve.

Los banquillos se abren **por meses**. Cada club tira una vez por ventana, y el
que va mal tira con más probabilidad que el líder: esperar tiene sentido porque
el mes que viene se abren puertas distintas, y mirar dos veces el mismo mes da
lo mismo. Estando libre siempre llama alguien —el club que más se parece a lo
que vales—, así que esperar es para buscar algo mejor, no la única salida.

Teniendo equipo, las ofertas sólo llegan **con la temporada cerrada** y sólo de
clubes claramente más grandes: nadie deja su banquillo en enero por uno parecido.
Firmar ahí cierra la etapa como marcha, no como despido, igual que dimitir, que
se hace desde la hoja de servicios en dos pasos. Mientras no hay banquillo, la
bandeja deja de contar las lesiones y fichajes del club que dejaste.

Las ofertas llegan de los países que se juegan en la partida, que se eligen al
crearla (Bloque 4, fase 4): con Grecia elegida, un banquillo griego es una salida
más.

### Prensa y notificaciones

La partida simula muchísimo que el jugador nunca veía —lesiones, fichajes, la
paciencia del consejo, quién gana cada competición— y la **bandeja** es lo que lo
saca a la luz. Cada aviso lleva a la pantalla donde se decide: la lesión a la
ficha del jugador, los contratos que acaban al mercado.

Los avisos **no los emite nadie**. Salen de comparar la última foto del club con
la de ahora, y la foto se saca al leer la bandeja; es el mismo truco con el que
la carrera se entera del despido, y por la misma razón: ni la temporada, ni el
consejo, ni el mercado tienen que saber que existe una bandeja, y todas las
reglas de qué es noticia viven juntas en `shared/domain/inbox.ts`. El precio es
que lo que empieza y acaba entre dos vistazos no se ve —una contusión de tres
días dentro de un «ir a la jornada»—, que es aceptable porque esa lesión no le
quitó un partido a nadie. Lo que sí se evita es el ruido: la cuenta atrás de una
baja no es noticia, la confianza sólo avisa al cruzar la raya de peligro y
fichar por otro club es un aviso, no doce idas y doce llegadas.

Y **no se avisa de lo que hace el propio usuario**. La primera versión contaba
«llega al club» del jugador que acababas de fichar, y lo destapó la captura del
arnés. La foto no sabe quién causó un cambio, pero hay una regla que lo resuelve:
en este juego nada mueve la plantilla sin que corra el reloj salvo el usuario —la
IA ficha, las cesiones vuelven y los contratos vencen al avanzar días—. Si entre
dos fotos no ha pasado el tiempo, los cambios de plantilla son suyos y se absorben
en silencio. Las lesiones quedan fuera de la regla, porque un partido lesiona sin
mover el calendario.

Las **ruedas de prensa** no llegan en cada partido, sólo en los que dan que
hablar: una racha, una paliza, unos playoffs, un consejo al borde del despido. Y
lo que contestas mueve dos cosas que **ya pesaban**: el ambiente de la grada, que
llena el pabellón y renueva abonos, y la paciencia del consejo. No se inventó una
moral de vestuario para esto. Ninguna respuesta gana en las dos cosas a la vez
—lo comprueba un test—: echar balones fuera enciende a la grada y enfría al
consejo, asumir la culpa hace lo contrario. Los efectos no se enseñan antes de
contestar, porque con los números delante nadie contesta, calcula; después
llega la reacción en palabras. Sólo vale la última rueda: en cuanto llega otra,
la que quedó sin contestar caduca.

La columna `players.morale` estuvo mucho tiempo sin hacer nada, a propósito: mover
un número que no cambia nada sería engañar al jugador. Tiene efecto desde la
fase 4 del Bloque 4, y allí está contado.

### Editor del mundo

Edita el **mundo base**: los clubes y jugadores con los que nacen las partidas
nuevas. Las empezadas no cambian —se sembraron al crearse y ya son suyas—, y por
eso el editor vive en el menú principal y no dentro de la partida, y lo dice
arriba.

El dataset no se toca nunca. Una vez instalado el juego está en una carpeta de
sólo lectura, así que las ediciones se guardan **como parches** en la base de la
aplicación —sólo los campos cambiados— y se aplican encima del original al crear
cada partida, y también al listar los clubes en «Nueva partida», para que lo que
se elige sea lo que se juega. Eso da tres cosas gratis: se puede restaurar un
club o el mundo entero, poner a mano el valor original deja de contar como
edición, y una versión nueva del juego con el dataset corregido no pisa lo que
el usuario editó.

Se editan los datos de cada club —nombre, ciudad, pabellón, aforo, reputación y
presupuesto—, los de cada jugador —nombre, nacionalidad, posición, altura,
potencial y los veintiún atributos— y las plantillas, moviendo jugadores de un
club a otro. Todo pasa por los mismos límites con los que se juega: ninguna
plantilla por debajo de diez ni por encima de catorce, y ningún atributo fuera
de la escala de 1 a 99.

### Ajustes

**Resolución**, que se aplica al momento, y **reglamento**, que decide con qué
reglas nacen las partidas nuevas: «como en la realidad» —FIBA en Europa,
Sudamérica y Oceanía; NBA en las dos ligas de Estados Unidos—, todo FIBA o todo
NBA. Sólo para las nuevas, porque cambiar la duración de los cuartos a mitad de
temporada mezclaría estadísticas de dos reglamentos. Cada ajuste valida su
valor en el proceso principal: una resolución o un reglamento inventados no
llegan a la ventana ni a la partida.

El **idioma** no está: la aplicación es sólo en español, y la traducción al
inglés va la última del proyecto. Es una L —i18n de cientos de textos, más la
narración, la prensa y los avisos que genera el juego—, no la S de esta tabla.

### Avatares

Cada persona del juego tiene cara: los jugadores con **ToonHead**, el entrenador
con **Personas** y el cuerpo técnico con **Avataaars**, de DiceBear. Se generan
**en local** a partir del identificador de cada uno —sin peticiones a ningún
servidor, así que el juego funciona sin conexión y un jugador tiene siempre la
misma cara—.

Jugadores y técnicos llevan nombres masculinos y los estilos sortean pelo y
rasgos sin saberlo, así que se acotan: sin melenas, ni vestidos, ni gestos fuera
de tono para una ficha de club. Al entrenador no se le impone nada de eso, porque
es el propio usuario y su cara no tiene por qué suponer quién es. ToonHead y
Personas son CC BY 4.0 y piden atribución: los créditos están en Ajustes y salen
de los metadatos de los propios estilos, para que no se queden desfasados.

### Firma y actualizaciones

Las dos piezas quedan **preparadas, no estrenadas**, y es a propósito: firmar de
verdad exige comprar un certificado, y publicar es decidir que el juego sale.
Los detalles operativos están en [DISTRIBUCION.md](DISTRIBUCION.md).

La **firma** se configura en `electron-builder.yml` —SHA-256 con sello de tiempo—
pero el certificado no está en el repositorio: se lee de las variables de entorno
`CSC_LINK` y `CSC_KEY_PASSWORD`. Sin ellas `pnpm build:win` compila sin firmar,
como antes; `pnpm release:win` exige firma y falla si falta, para que una versión
que se va a distribuir no salga sin firmar por olvido.

Las **actualizaciones** van contra las releases de GitHub con electron-updater.
La aplicación instalada comprueba al arrancar y desde Ajustes, descarga sola y
verifica el hash, pero **no instala sola**: avisa en Ajustes y en el menú, y se
instala al pulsar «Reiniciar e instalar» o al cerrar, porque reiniciar sin avisar
le haría perder a alguien el partido que estuviera jugando.

Se verificó de punta a punta **en local, sin publicar nada**: un instalador 0.2.0
servido por HTTP, y la aplicación 0.1.0 lo encontró, lo descargó y lo dejó listo.
Esa prueba destapó tres cosas que se corrigieron:

- **El nombre del instalador.** `latest.yml` lo nombra con guiones y el fichero
  salía con espacios; GitHub cambia los espacios por puntos al subirlo, así que
  la aplicación habría buscado un fichero inexistente y ninguna actualización se
  habría descargado. Ahora se llama `Triple-Manager-Setup-<versión>.exe`.
- **Una descarga fallida quedaba como promesa rechazada sin atender**, y la
  comprobación del arranque y la del botón podían pisarse.
- **Instalar al cerrar, en pruebas.** Con el servidor local la opción estaba
  activa y, al cerrar la ventana de pruebas, ejecutó en silencio el instalador y
  dejó la 0.2.0 instalada en la máquina (se desinstaló). En modo de prueba local
  está ahora desactivada.

Para que las releases sirvan de fuente, el repositorio tiene que ser público: la
aplicación instalada no lleva credenciales.

### Historial y palmarés

**No se guarda: se calcula al leerlo.** El campeón de cada temporada lo apunta
ya la propia temporada, y el puesto sale de los partidos, que no se borran
nunca; una tabla de historial sería un segundo sitio donde apuntar lo mismo, y
el día que los dos no coincidieran habría que decidir cuál miente. Diez
temporadas son unas pocas miles de filas: cuesta menos recalcularlo que
mantenerlo al día.

Son tres pestañas: **temporada a temporada** con el puesto, el balance, el
campeón de la liga y lo que se hizo en Copa, playoffs y Europa; el **palmarés**
del club, con cada título y los años en que se ganó; y los **récords** de la
partida —más puntos, rebotes, asistencias y triples en un partido—, que salen de
la tabla del acta con una consulta por marca, porque traerse esas filas a memoria
para ordenarlas costaría más que todo el resto del historial junto.

Y es, además, la memoria que necesita el **modo carrera**: un entrenador vale lo
que dice su palmarés.

---

## Decisiones abiertas

1. **¿Qué liga se simula?** Resuelta: veintiuna ligas ficticias en catorce
   países, con ascensos dentro de cada país y cuatro competiciones
   continentales. Queda decidir si el jugador puede elegir cuáles se simulan.
2. **¿Datos reales o inventados?** El dataset actual es inventado a propósito
   para no arrastrar el problema de marcas que apareció en el proyecto de
   fútbol. Cambiar de idea más adelante es caro.
3. **¿Hasta dónde llega el partido en vivo?** Resuelta a medias: el partido se
   dirige en vivo —pausa, cambios, tiempo muerto y pizarra sobre la marcha— y
   queda decidir si se llega a pintar la pista en 2D, que es lo que de verdad
   dispara el esfuerzo. El valor de manager ya está entregado sin ella.
4. **¿Un país o el mundo?** IBM abarcaba medio mundo; PC Basket, una liga bien
   hecha. Las dos son opciones defendibles y llevan a proyectos muy distintos.
