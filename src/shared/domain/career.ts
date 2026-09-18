/**
 * La carrera del entrenador: lo que vales y quién te quiere.
 *
 * En el modo mánager diriges un club y la partida se acaba si te echan. En
 * carrera el despido no es el final: es quedarte sin equipo y tener que
 * encontrar otro, y lo que te ofrezcan depende de lo que hayas hecho. Por eso
 * la pieza central de aquí es **cuánto vales**, y sale del palmarés y de las
 * temporadas dirigidas, no de un número que se guarde por ahí.
 *
 * Funciones puras: ni base de datos ni azar.
 */

/** Lo que hay que saber de una temporada dirigida para valorar a un entrenador. */
export interface CareerSeasonRecord {
  /** Puesto final en la liga regular. `null` si la temporada quedó a medias. */
  position: number | null;
  teams: number;
  /** 1 = máxima categoría. Ganar en segunda no vale lo que ganar en primera. */
  tier: number;
  /** Reputación del club dirigido esa temporada, 1-100. */
  clubReputation: number;
  /** Títulos ganados ese año. */
  titles: number;
  /** Si la temporada acabó con el entrenador destituido. */
  dismissed: boolean;
}

/** Reputación de partida de quien no ha dirigido nada todavía. */
export const STARTING_MANAGER_REPUTATION = 35;
export const MIN_MANAGER_REPUTATION = 5;
export const MAX_MANAGER_REPUTATION = 99;

/**
 * Cuánto vale el entrenador del usuario, 1-100.
 *
 * Es la regla general de {@link coachReputation} con el punto de partida de
 * quien empieza de cero: el usuario no trae palmarés de fuera de la partida.
 */
export function managerReputation(seasons: readonly CareerSeasonRecord[]): number {
  return coachReputation(STARTING_MANAGER_REPUTATION, seasons);
}

/**
 * Cuánto se separa el club «que le toca» a un entrenador de su reputación de
 * partida: al usuario, que arranca en 35, le corresponde un club de 50.
 */
export const CLUB_LEVEL_OFFSET = 15;

/**
 * Cuánto vale un entrenador, 1-100, a partir de su reputación de partida.
 *
 * Tres cosas la mueven, y en este orden: los **títulos**, que es lo que de
 * verdad se recuerda; el **rendimiento** contra lo que daba de sí cada club,
 * porque salvar a un modesto vale más que quedar tercero con el mejor
 * presupuesto; y el **tamaño de los clubes** dirigidos, que es lo que hace que
 * a un entrenador de club grande le abran puertas de clubes grandes.
 *
 * Los despidos restan, pero poco: a todo el mundo le echan alguna vez, y un
 * entrenador con palmarés no deja de valer porque un consejo perdiera la
 * paciencia.
 *
 * `base` es lo que vale antes de dirigir nada en la partida: 35 el usuario, y
 * lo que diga su ficha un entrenador de la IA, que llega con oficio. El tamaño
 * del club se mide contra el club que le corresponde a esa base
 * ({@link CLUB_LEVEL_OFFSET} por encima), no contra un club medio: un
 * entrenador de 60 que dirige a un club de 75 está donde le toca y no suma por
 * ello. Sin esto, a un entrenador de la IA de un grande se le contaría dos
 * veces el escudo: en su base y en cada temporada.
 *
 * **No se infla**: todo lo que suma es una media (rendimiento y tamaño del
 * club), una curva con techo (títulos, +26 como mucho) o un tope (el oficio,
 * +6 a partir de la octava temporada). Quien cumple lo esperado año tras año
 * —rendimiento cero, en su club, sin títulos— se queda en su base más el oficio
 * y de ahí no se mueve, dirija ocho temporadas o treinta.
 */
export function coachReputation(base: number, seasons: readonly CareerSeasonRecord[]): number {
  if (seasons.length === 0) {
    return clamp(Math.round(base), MIN_MANAGER_REPUTATION, MAX_MANAGER_REPUTATION);
  }

  const titles = seasons.reduce((sum, season) => sum + season.titles, 0);
  const dismissals = seasons.filter((season) => season.dismissed).length;
  const clubLevel = average(seasons.map((season) => season.clubReputation));
  const performance = average(seasons.map(overPerformance));

  // Los primeros títulos son los que más suben y luego la curva se aplana: el
  // tercero se nota mucho más que el décimo, porque si no un entrenador con
  // diez ligas se saldría de la escala él solo.
  const titleBonus = 26 * (1 - Math.exp(-titles / 2.2));

  const value =
    base +
    titleBonus +
    // El rendimiento pesa más que el escudo, y a propósito: si el tamaño del
    // club mandara, fracasar en un grande valdría más que triunfar en un
    // modesto, que es justo lo contrario de lo que mide esto.
    performance * 30 +
    (clubLevel - (base + CLUB_LEVEL_OFFSET)) * 0.18 +
    // Dirigir mucho tiempo cuenta, pero el oficio no sustituye a los resultados.
    Math.min(6, seasons.length * 0.8) -
    dismissals * 2.5;

  return clamp(Math.round(value), MIN_MANAGER_REPUTATION, MAX_MANAGER_REPUTATION);
}

/**
 * Cuánto se hizo por encima (o por debajo) de lo esperable, de -1 a 1.
 *
 * Lo esperable sale de la reputación del club: al mejor de la liga se le espera
 * primero, y al peor, último. Quedar donde te toca da cero; el mérito está en la
 * diferencia, que es lo que distingue a un entrenador de un presupuesto.
 */
export function overPerformance(season: CareerSeasonRecord): number {
  if (season.position === null || season.teams < 2) {
    return 0;
  }

  // Un club de reputación 100 espera ser primero; uno de 0, el último.
  const expected = 1 + ((100 - clamp(season.clubReputation, 0, 100)) / 100) * (season.teams - 1);
  const gap = (expected - season.position) / (season.teams - 1);

  // En segunda todo pesa menos: es media categoría de mérito.
  return clamp(gap, -1, 1) * (season.tier > 1 ? 0.6 : 1);
}

/**
 * ¿Le interesas a este club?
 *
 * Un club mira por encima del hombro a quien vale mucho menos que él, y a quien
 * vale mucho más ni se molesta en llamarlo. La horquilla es ancha a propósito:
 * el mercado de entrenadores no es el de jugadores, y un club que acaba de
 * echar al suyo coge lo que puede.
 */
export function clubWouldHire(clubReputation: number, managerReputation: number): boolean {
  return managerReputation >= clubReputation - 28 && managerReputation <= clubReputation + 34;
}

/**
 * Cuántos clubes se acuerdan de ti.
 *
 * Con poco nombre llega alguna oferta suelta; con palmarés, varias a la vez.
 * Nunca son más de cuatro: una lista larga convierte una decisión en un catálogo.
 */
export function offerCountFor(reputation: number): number {
  if (reputation >= 75) return 4;
  if (reputation >= 55) return 3;
  if (reputation >= 35) return 2;
  return 1;
}

/**
 * Probabilidad de que un club busque entrenador en una ventana del mercado.
 *
 * Los banquillos no se abren a la vez ni al azar puro: el que va mal cambia de
 * entrenador mucho antes que el que va bien. Por eso esperar en el paro tiene
 * sentido — cada mes se abren puertas distintas —, y por eso lo que llega no
 * suele ser el líder, sino el club que necesita un cambio.
 */
export function vacancyChance(position: number | null, teams: number): number {
  if (position === null || teams < 2) {
    return BASE_VACANCY_CHANCE;
  }
  // 0 el primero, 1 el último.
  const trouble = (position - 1) / (teams - 1);
  return BASE_VACANCY_CHANCE + trouble * 0.3;
}

export const BASE_VACANCY_CHANCE = 0.15;

/**
 * Teniendo equipo, ¿te tienta este club?
 *
 * Sólo si es claramente más grande: nadie deja su banquillo para irse a uno
 * igual. El umbral es el que separa un cambio de un ascenso en la carrera.
 */
export const EMPLOYED_OFFER_STEP = 8;

export function tempts(offeredReputation: number, currentReputation: number): boolean {
  return offeredReputation >= currentReputation + EMPLOYED_OFFER_STEP;
}

/** Cómo se lee una reputación de entrenador en pantalla. */
export function managerReputationLabel(reputation: number): string {
  if (reputation >= 85) return 'Entrenador de época';
  if (reputation >= 70) return 'Nombre respetado';
  if (reputation >= 55) return 'Entrenador consolidado';
  if (reputation >= 40) return 'Conocido en la liga';
  if (reputation >= 25) return 'Poco recorrido';
  return 'Desconocido';
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
