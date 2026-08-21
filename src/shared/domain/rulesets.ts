/**
 * Reglamentos. Un partido de baloncesto no se juega igual en FIBA que en la
 * NBA, y las dos referencias del proyecto cubren cada una un lado: PC Basket
 * simulaba ACB (FIBA), International Basketball Manager metía la NBA en el
 * mismo juego. El motor no debe saber cuál está en juego: recibe un
 * {@link Ruleset} y obedece.
 */
export type RulesetId = 'fiba' | 'nba';

export interface Ruleset {
  id: RulesetId;
  label: string;
  /** Número de cuartos de la parte regular. */
  periods: number;
  /** Duración de cada cuarto, en minutos. */
  periodMinutes: number;
  /** Duración de cada prórroga, en minutos. */
  overtimeMinutes: number;
  /** Faltas personales que eliminan al jugador. */
  personalFoulLimit: number;
  /** Faltas de equipo por cuarto a partir de las cuales toda falta son tiros libres. */
  teamFoulBonus: number;
  /** Posesión, en segundos. */
  shotClockSeconds: number;
  /** Reposición tras rebote ofensivo, en segundos. */
  shotClockOffensiveReboundSeconds: number;
  /** Jugadores inscritos en acta. */
  gameRosterSize: number;
  /** Tiempos muertos por equipo y partido (simplificado: sin reparto por mitad). */
  timeoutsPerGame: number;
}

export const FIBA_RULESET: Ruleset = {
  id: 'fiba',
  label: 'FIBA / ACB',
  periods: 4,
  periodMinutes: 10,
  overtimeMinutes: 5,
  personalFoulLimit: 5,
  teamFoulBonus: 5,
  shotClockSeconds: 24,
  shotClockOffensiveReboundSeconds: 14,
  gameRosterSize: 12,
  timeoutsPerGame: 5
};

export const NBA_RULESET: Ruleset = {
  id: 'nba',
  label: 'NBA',
  periods: 4,
  periodMinutes: 12,
  overtimeMinutes: 5,
  personalFoulLimit: 6,
  teamFoulBonus: 5,
  shotClockSeconds: 24,
  shotClockOffensiveReboundSeconds: 14,
  gameRosterSize: 13,
  timeoutsPerGame: 7
};

export const RULESETS: Record<RulesetId, Ruleset> = {
  fiba: FIBA_RULESET,
  nba: NBA_RULESET
};

/** Minutos de juego reglamentario (sin prórrogas). */
export function regulationMinutes(ruleset: Ruleset): number {
  return ruleset.periods * ruleset.periodMinutes;
}

/**
 * Minutos totales que hay que repartir entre los jugadores de un equipo en un
 * partido: cinco jugadores en pista durante todo el partido.
 */
export function totalPlayerMinutes(ruleset: Ruleset): number {
  return regulationMinutes(ruleset) * 5;
}
