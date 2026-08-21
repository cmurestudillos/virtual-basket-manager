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

export class OddTeamCountError extends Error {
  constructor(count: number) {
    super(`El calendario de todos contra todos necesita un número par de equipos (hay ${count})`);
    this.name = 'OddTeamCountError';
  }
}

/**
 * Todos contra todos a una vuelta, por el método del círculo: se fija un equipo
 * y los demás rotan a su alrededor.
 *
 * Exige número par de equipos. Con impar habría que meter un equipo fantasma y
 * una jornada de descanso por equipo, que es una decisión de diseño de
 * competición y no algo que deba inventarse aquí en silencio — de ahí el error
 * explícito.
 */
export function generateSingleRoundRobin(teamIds: readonly string[]): ScheduledPairing[][] {
  if (teamIds.length % 2 !== 0) {
    throw new OddTeamCountError(teamIds.length);
  }
  if (teamIds.length < 2) {
    return [];
  }

  const total = teamIds.length;
  const fixed = teamIds[0] as string;
  let rotating = teamIds.slice(1);

  const rounds: ScheduledPairing[][] = [];

  for (let round = 0; round < total - 1; round += 1) {
    const pairings: ScheduledPairing[] = [];
    const opponent = rotating[0] as string;

    // El equipo fijo alterna campo cada jornada; si no, jugaría las 17 en casa.
    pairings.push(
      round % 2 === 0
        ? { homeTeamId: fixed, awayTeamId: opponent }
        : { homeTeamId: opponent, awayTeamId: fixed }
    );

    for (let index = 1; index < total / 2; index += 1) {
      const first = rotating[index] as string;
      const second = rotating[rotating.length - index] as string;
      pairings.push(
        index % 2 === 0
          ? { homeTeamId: first, awayTeamId: second }
          : { homeTeamId: second, awayTeamId: first }
      );
    }

    rounds.push(pairings);
    rotating = [rotating[rotating.length - 1] as string, ...rotating.slice(0, -1)];
  }

  return rounds;
}

/**
 * Ida y vuelta: la segunda vuelta repite los emparejamientos con los campos
 * cambiados, que es como se hace en cualquier liga real.
 */
export function generateDoubleRoundRobin(teamIds: readonly string[]): ScheduledPairing[][] {
  const first = generateSingleRoundRobin(teamIds);
  const second = first.map((round) =>
    round.map((pairing) => ({
      homeTeamId: pairing.awayTeamId,
      awayTeamId: pairing.homeTeamId
    }))
  );

  return [...first, ...second];
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
