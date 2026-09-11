/**
 * La Copa.
 *
 * Ocho equipos, **partido único** y **sede neutral**, tres rondas en tres días
 * seguidos de febrero: la Copa del Rey de toda la vida. Es lo contrario de los
 * playoffs —allí el mejor tiene cuatro oportunidades y el factor cancha; aquí
 * cualquiera te gana una tarde— y por eso merece la pena tenerla: mete un
 * torneo con reglas distintas en mitad de la liga.
 *
 * Se clasifican los ocho primeros al cerrar la primera vuelta, que es el corte
 * que usa la ACB de verdad.
 *
 * Funciones puras: ni base de datos ni azar.
 */

import type { SeriesPairing } from './playoffs';

export const CUP_TEAMS = 8;

/** Jornada de liga que decide quién juega la Copa: el fin de la primera vuelta. */
export function cupCutoffRound(totalRounds: number): number {
  return Math.max(1, Math.floor(totalRounds / 2));
}

const ROUND_NAMES: Record<number, string> = {
  2: 'Final',
  4: 'Semifinales',
  8: 'Cuartos de final',
  16: 'Octavos de final'
};

export function cupRoundName(teamsInRound: number): string {
  return ROUND_NAMES[teamsInRound] ?? `Ronda de ${teamsInRound}`;
}

export interface CupRound {
  /** 1 = primera ronda. */
  round: number;
  name: string;
  teams: number;
}

/** El cuadro: cuántas rondas y cómo se llaman. Todas a partido único. */
export function buildCupFormat(teamCount: number): CupRound[] {
  const rounds: CupRound[] = [];
  let teams = teamCount;
  let round = 1;

  while (teams >= 2) {
    rounds.push({ round, name: cupRoundName(teams), teams });
    teams = Math.floor(teams / 2);
    round += 1;
  }

  return rounds;
}

/**
 * Cruces de la primera ronda: 1-8, 2-7, 3-6 y 4-5, como en el cuadro de
 * playoffs. Aquí el «mejor clasificado» no gana factor cancha —se juega en
 * campo neutral— pero sigue decidiendo contra quién te toca.
 */
export function cupPairings(seeds: readonly string[]): SeriesPairing[] {
  const pairings: SeriesPairing[] = [];

  for (let index = 0; index < seeds.length / 2; index += 1) {
    const opposite = seeds.length - 1 - index;
    pairings.push({
      higherSeedTeamId: seeds[index] as string,
      higherSeed: index + 1,
      lowerSeedTeamId: seeds[opposite] as string,
      lowerSeed: opposite + 1
    });
  }

  return pairings;
}

/** Ronda siguiente: el cuadro es fijo, como en los playoffs. */
export function nextCupPairings(
  winners: readonly { teamId: string; seed: number }[]
): SeriesPairing[] {
  const pairings: SeriesPairing[] = [];

  for (let index = 0; index < winners.length / 2; index += 1) {
    const first = winners[index] as { teamId: string; seed: number };
    const second = winners[winners.length - 1 - index] as { teamId: string; seed: number };
    const [higher, lower] = first.seed <= second.seed ? [first, second] : [second, first];

    pairings.push({
      higherSeedTeamId: higher.teamId,
      higherSeed: higher.seed,
      lowerSeedTeamId: lower.teamId,
      lowerSeed: lower.seed
    });
  }

  return pairings;
}

/**
 * Fechas de la Copa: tres días seguidos a mediados de febrero.
 *
 * Se juega entre semana y en una sola sede, así que la liga no se para: los
 * ocho clasificados se van tres días y el resto sigue con su calendario.
 */
export function cupRoundDate(seasonStartYear: number, round: number): Date {
  // La temporada arranca en otoño, así que febrero cae en el año siguiente.
  return new Date(Date.UTC(seasonStartYear + 1, 1, 12 + round));
}

/** Premio por llegar a cada ronda; el título paga lo suyo aparte. */
export function cupPrizeCents(round: number, champion: boolean): number {
  const byRound = [0, 60_000_00, 120_000_00, 200_000_00];
  return (byRound[round] ?? 0) + (champion ? 250_000_00 : 0);
}
