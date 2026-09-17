/**
 * Generación del calendario de liga regular.
 *
 * Función pura: entra una lista de equipos y sale el emparejamiento completo.
 * No sabe nada de base de datos ni de fechas de juego, para poder probarla sin
 * montar una partida.
 */

export interface ScheduledPairing {
  homeTeamId: string;
  awayTeamId: string;
}

/**
 * Todos contra todos a una vuelta, por el método del círculo: se fija un equipo
 * y los demás rotan a su alrededor.
 *
 * Con número impar de equipos entra un fantasma, y quien se cruza con él esa
 * jornada descansa: N jornadas en vez de N-1, cada una con un equipo sin
 * partido, que es como se juega una liga impar de verdad (la Primera FEB de
 * diecisiete). El fantasma va delante, como equipo fijo, y no al final: así los
 * campos se siguen repartiendo mitad y mitad en cada vuelta.
 */
export function generateSingleRoundRobin(teamIds: readonly string[]): ScheduledPairing[][] {
  if (teamIds.length < 2) {
    return [];
  }

  // `null` es el fantasma: nunca se confunde con el id de un equipo de verdad.
  const slots: (string | null)[] = teamIds.length % 2 === 0 ? [...teamIds] : [null, ...teamIds];
  const total = slots.length;
  const fixed = slots[0] as string | null;
  let rotating = slots.slice(1);

  const rounds: ScheduledPairing[][] = [];

  for (let round = 0; round < total - 1; round += 1) {
    const pairings: ScheduledPairing[] = [];
    // Un emparejamiento con el fantasma no se juega: ese equipo descansa.
    const pair = (home: string | null, away: string | null): void => {
      if (home !== null && away !== null) {
        pairings.push({ homeTeamId: home, awayTeamId: away });
      }
    };
    const opponent = rotating[0] as string | null;

    // El equipo fijo alterna campo cada jornada; si no, jugaría las 17 en casa.
    if (round % 2 === 0) {
      pair(fixed, opponent);
    } else {
      pair(opponent, fixed);
    }

    for (let index = 1; index < total / 2; index += 1) {
      const first = rotating[index] as string | null;
      const second = rotating[rotating.length - index] as string | null;
      if (index % 2 === 0) {
        pair(first, second);
      } else {
        pair(second, first);
      }
    }

    rounds.push(pairings);
    rotating = [rotating[rotating.length - 1] as string | null, ...rotating.slice(0, -1)];
  }

  return rounds;
}

/**
 * Ida y vuelta: la segunda vuelta repite los emparejamientos con los campos
 * cambiados, que es como se hace en cualquier liga real.
 */
export function generateDoubleRoundRobin(teamIds: readonly string[]): ScheduledPairing[][] {
  return generateRoundRobin(teamIds, 2);
}

/**
 * Varias vueltas seguidas, alternando el campo en cada una.
 *
 * No todas las ligas juegan dos vueltas: las pequeñas juegan tres o cuatro para
 * llenar la temporada, y las muy grandes sólo una. Es la misma competición con
 * distinto número de vueltas, no formatos distintos.
 */
export function generateRoundRobin(teamIds: readonly string[], laps: number): ScheduledPairing[][] {
  const base = generateSingleRoundRobin(teamIds);
  const rounds: ScheduledPairing[][] = [];

  for (let lap = 0; lap < Math.max(1, laps); lap += 1) {
    rounds.push(
      ...base.map((round) =>
        round.map((pairing) =>
          lap % 2 === 0
            ? pairing
            : { homeTeamId: pairing.awayTeamId, awayTeamId: pairing.homeTeamId }
        )
      )
    );
  }

  return rounds;
}

/**
 * Jornadas que caben en una temporada. Es la horquilla de una liga FIBA real y
 * el techo del calendario del juego: con más no cabrían los playoffs en junio.
 */
export const MAX_MATCHDAYS = 34;

/**
 * Jornadas de una vuelta: N-1 con número par de equipos y N con impar, porque
 * cada jornada descansa uno.
 */
export function roundsPerLap(teams: number): number {
  if (teams < 2) {
    return 0;
  }
  return teams % 2 === 0 ? teams - 1 : teams;
}

/**
 * Cuántas vueltas juega una liga según su tamaño.
 *
 * Sale de lo que cabe en la temporada: dieciocho equipos dan justo las 34
 * jornadas a ida y vuelta, y diecisiete también —diecisiete jornadas por vuelta,
 * con un descanso cada una—; diez juegan tres vueltas —como las ligas pequeñas
 * de verdad— y una liga de treinta se queda en una sola. Así todas las ligas del
 * mundo caben en el mismo calendario sin inventarse formatos distintos.
 */
export function roundRobinLaps(teams: number, maxRounds = MAX_MATCHDAYS): number {
  if (teams < 2) {
    return 1;
  }
  return Math.max(1, Math.floor(maxRounds / roundsPerLap(teams)));
}

/**
 * Partidos en casa de cada equipo en la fase regular: la mitad de los que juega,
 * que son uno contra cada rival por vuelta. Dieciocho equipos dan 17; diecisiete,
 * que descansan dos jornadas, 16.
 */
export function homeGamesPerSeason(teams: number, maxRounds = MAX_MATCHDAYS): number {
  if (teams < 2) {
    return 0;
  }
  return Math.round(((teams - 1) * roundRobinLaps(teams, maxRounds)) / 2);
}

/**
 * Fecha de cada jornada dentro del calendario del juego.
 *
 * Una jornada por semana, en domingo, arrancando el primer domingo a partir del
 * 28 de septiembre. Con 34 jornadas la temporada acaba a mediados de mayo, que
 * es la horquilla de una liga FIBA real.
 *
 * Las fechas se construyen en UTC a propósito: la partida se juega con el reloj
 * del juego, no con el de la máquina, y un `new Date(año, mes, día)` local haría
 * que la misma partida cayera en días distintos según el huso del jugador.
 */
export function matchdayDate(seasonStartYear: number, round: number): Date {
  const firstMatchday = firstSundayOnOrAfter(Date.UTC(seasonStartYear, 8, 28));
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  return new Date(firstMatchday.getTime() + (round - 1) * oneWeek);
}

function firstSundayOnOrAfter(timestamp: number): Date {
  const date = new Date(timestamp);
  const daysUntilSunday = (7 - date.getUTCDay()) % 7;
  return new Date(timestamp + daysUntilSunday * 24 * 60 * 60 * 1000);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días entre partidos de una misma eliminatoria. */
export const PLAYOFF_GAME_GAP_DAYS = 3;
/** Días de descanso entre el último partido posible de una ronda y la siguiente. */
export const PLAYOFF_ROUND_GAP_DAYS = 4;

/**
 * Arranque de los playoffs: el miércoles siguiente a la última jornada de liga.
 *
 * Tres días de margen es lo que tarda cualquier liga real en montar el cuadro y
 * vender las entradas; y deja los playoffs en el calendario de mayo y junio, que
 * es donde se juegan.
 */
export function firstPlayoffDate(lastRegularMatchday: Date): Date {
  return new Date(lastRegularMatchday.getTime() + PLAYOFF_GAME_GAP_DAYS * DAY_MS);
}

/** Fecha del enésimo partido de una serie que arranca ese día. */
export function playoffGameDate(roundStart: Date, seriesGame: number): Date {
  return new Date(roundStart.getTime() + (seriesGame - 1) * PLAYOFF_GAME_GAP_DAYS * DAY_MS);
}

/**
 * Arranque de la ronda siguiente, contando siempre con que la anterior llegue
 * al último partido. Una serie que se resuelve antes deja hueco muerto, igual
 * que en una temporada real: el cuadro no se adelanta porque haya un 3-0.
 */
export function nextPlayoffRoundStart(roundStart: Date, bestOf: number): Date {
  const lastGame = playoffGameDate(roundStart, bestOf);
  return new Date(lastGame.getTime() + PLAYOFF_ROUND_GAP_DAYS * DAY_MS);
}
