/**
 * Los puntos del ranking de entrenadores.
 *
 * El ranking mide lo que se ha hecho **últimamente**: la temporada en curso
 * cuenta entera y la anterior, la mitad. Así un campeón de hace dos años no
 * sigue arriba por inercia, y el que empieza bien un curso sube desde octubre.
 *
 * Los puntos salen de tres cosas, todas de la partida (no hay palmarés
 * inventado): **victorias**, que valen según dónde se consigan; **rondas**
 * superadas en una eliminatoria; y **títulos**. Y todo se multiplica por la
 * **fuerza** de la competición, que sale de la reputación media de sus clubes:
 * ganar en la liga más fuerte del mundo vale más que ganar en una floja, sin
 * inventar coeficientes por país.
 *
 * Las cuentas, para una temporada de 34 jornadas en una liga de primera de
 * fuerza media: unas 20 victorias son 20 puntos; llegar a la final de los
 * playoffs, otros 6 de rondas y unos 8 de victorias; el título de liga, 12. Un
 * campeón de liga ronda los 45 puntos y un equipo de media tabla, los 15.
 *
 * Funciones puras: ni base de datos ni azar.
 */

/** Dónde se juega un partido, a efectos de lo que vale ganarlo. */
export type CoachGameKind = 'league' | 'playoffs' | 'cup' | 'continental';

/** Lo que vale cada cosa antes de aplicar la fuerza de la competición. */
export const COACH_POINTS = {
  /** Una victoria de liga regular en primera. */
  leagueWin: 1,
  /** De playoffs: más que una de liga, porque es contra los mejores y en eliminatoria. */
  playoffWin: 1.5,
  cupWin: 1.2,
  /** En Europa (o en América): los rivales son los mejores de cada país. */
  continentalWin: 2,
  /** Pasar una ronda de playoffs, de copa o continental. */
  playoffRound: 3,
  cupRound: 2,
  continentalRound: 4,
  /** Los títulos, por competición. */
  leagueTitle: 12,
  cupTitle: 6,
  continentalTitle: 15
} as const;

/**
 * Cuánto pesa la categoría: lo que se hace en segunda vale un poco más de la
 * mitad que en primera, y lo de más abajo, menos todavía. Sólo se aplica a la
 * liga y a sus playoffs: la copa y las continentales ya se miden por su fuerza.
 */
export function tierWeight(tier: number): number {
  if (tier <= 1) return 1;
  if (tier === 2) return 0.6;
  return 0.4;
}

/**
 * La fuerza de una competición: su reputación media contra la de una liga
 * normal (60), acotada entre 0,6 y 1,4 para que ninguna liga valga el doble
 * que otra por muy desigual que sea el mundo.
 */
export function competitionStrength(averageReputation: number): number {
  return clamp(averageReputation / 60, 0.6, 1.4);
}

/** Una victoria, según dónde. */
export function winPoints(kind: CoachGameKind, tier: number, strength: number): number {
  switch (kind) {
    case 'league':
      return COACH_POINTS.leagueWin * tierWeight(tier) * strength;
    case 'playoffs':
      return COACH_POINTS.playoffWin * tierWeight(tier) * strength;
    case 'cup':
      return COACH_POINTS.cupWin * strength;
    case 'continental':
      return COACH_POINTS.continentalWin * strength;
  }
}

/** Una ronda de eliminatoria superada. La liga regular no tiene rondas. */
export function roundPoints(kind: CoachGameKind, tier: number, strength: number): number {
  switch (kind) {
    case 'league':
      return 0;
    case 'playoffs':
      return COACH_POINTS.playoffRound * tierWeight(tier) * strength;
    case 'cup':
      return COACH_POINTS.cupRound * strength;
    case 'continental':
      return COACH_POINTS.continentalRound * strength;
  }
}

/** Un título. El de liga es el mismo gane la liga regular o los playoffs. */
export function titlePoints(kind: CoachGameKind, tier: number, strength: number): number {
  switch (kind) {
    case 'league':
    case 'playoffs':
      return COACH_POINTS.leagueTitle * tierWeight(tier) * strength;
    case 'cup':
      return COACH_POINTS.cupTitle * strength;
    case 'continental':
      return COACH_POINTS.continentalTitle * strength;
  }
}

/** Lo que pasó en un banquillo, ya contado: victorias, rondas y títulos con su competición. */
export interface CoachStintEvents {
  wins: readonly { kind: CoachGameKind; tier: number; strength: number }[];
  rounds: readonly { kind: CoachGameKind; tier: number; strength: number }[];
  titles: readonly { kind: CoachGameKind; tier: number; strength: number }[];
}

/** Los puntos de un tramo en un banquillo, con un decimal. */
export function stintPoints(events: CoachStintEvents): number {
  const total =
    events.wins.reduce((sum, row) => sum + winPoints(row.kind, row.tier, row.strength), 0) +
    events.rounds.reduce((sum, row) => sum + roundPoints(row.kind, row.tier, row.strength), 0) +
    events.titles.reduce((sum, row) => sum + titlePoints(row.kind, row.tier, row.strength), 0);
  return roundTenth(total);
}

/** Cuánto cuenta la temporada anterior en el ranking. */
export const PREVIOUS_SEASON_WEIGHT = 0.5;

/** Los puntos del ranking: el curso actual entero y la mitad del anterior. */
export function rankingPoints(current: number, previous: number): number {
  return roundTenth(current + previous * PREVIOUS_SEASON_WEIGHT);
}

/**
 * El orden del ranking: por puntos y, a igualdad, por reputación. El id deja
 * el orden estable entre dos lecturas, que es lo que permite paginar.
 */
export function compareRanking(
  a: { points: number; reputation: number; coachId: string },
  b: { points: number; reputation: number; coachId: string }
): number {
  return b.points - a.points || b.reputation - a.reputation || a.coachId.localeCompare(b.coachId);
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
