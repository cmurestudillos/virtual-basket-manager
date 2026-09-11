/**
 * El consejo: qué te piden, cuánto confían en ti y cuándo te echan.
 *
 * El objetivo sale de la reputación del club, así que dirigir a un grande no es
 * lo mismo que dirigir a un recién ascendido: al primero le piden el título y
 * al segundo sobrevivir. Eso es lo que convierte una octava plaza en un éxito o
 * en un despido según dónde estés.
 *
 * Funciones puras: ni base de datos ni azar.
 */

import { PROMOTION_SLOTS } from './promotion';

export type BoardObjective =
  'survive' | 'midtable' | 'promotion' | 'playoffs' | 'semifinals' | 'title';

export const BOARD_OBJECTIVES = [
  'survive',
  'midtable',
  'promotion',
  'playoffs',
  'semifinals',
  'title'
] as const satisfies readonly BoardObjective[];

export const BOARD_OBJECTIVE_LABELS: Record<BoardObjective, string> = {
  survive: 'Mantener la categoría',
  midtable: 'Pelear la zona media',
  promotion: 'Ascender de categoría',
  playoffs: 'Clasificarse para los playoffs',
  semifinals: 'Llegar a semifinales',
  title: 'Ganar el título'
};

/**
 * Qué le piden a un club según lo que es y dónde juega.
 *
 * La categoría manda sobre la reputación: en segunda no se pide un título que
 * no existe, se pide subir. Y un recién descendido, que baja con la reputación
 * más alta de su nueva liga, es justo al que más se le exige allí.
 */
export function objectiveForReputation(reputation: number, tier = 1): BoardObjective {
  if (tier > 1) {
    return reputation >= 22 ? 'promotion' : 'midtable';
  }
  if (reputation >= 80) return 'title';
  if (reputation >= 68) return 'semifinals';
  if (reputation >= 52) return 'playoffs';
  if (reputation >= 38) return 'midtable';
  return 'survive';
}

/**
 * Puesto de liga regular con el que se da por cumplido el objetivo.
 *
 * Los objetivos de playoff se miden contra los ocho primeros, que es lo que
 * reparte el cuadro; los de más arriba exigen además hacer camino en él.
 */
export function targetPositionFor(objective: BoardObjective, teams: number): number {
  switch (objective) {
    case 'title':
      return 1;
    case 'semifinals':
      return 4;
    case 'playoffs':
      return 8;
    case 'promotion':
      return PROMOTION_SLOTS;
    case 'midtable':
      return Math.max(1, Math.round(teams / 2));
    case 'survive':
      return Math.max(1, teams - 2);
  }
}

export const START_CONFIDENCE = 60;
export const MAX_CONFIDENCE = 100;
/** Por debajo de esto, la directiva ya está mirando otros nombres. */
export const DANGER_CONFIDENCE = 30;
/** A cero, a la calle. */
export const DISMISSAL_CONFIDENCE = 0;

/**
 * Cómo se toma el consejo cada partido del equipo.
 *
 * No es sólo ganar o perder: perder contra quien tienes que ganar pesa más que
 * caer en la cancha del primero. `expectedToWin` es esa diferencia.
 *
 * `secondary` es para las competiciones que **no** son aquella en la que el
 * consejo puso el objetivo —Europa, sobre todo—. Ahí pesa la mitad, y como el
 * resultado se trunca hacia cero, una derrota razonable no resta nada y una
 * victoria grande sí suma: a nadie lo echan por perder en la Euroliga, pero
 * hacer un buen papel allí compra paciencia. Sin esto, quince partidos contra
 * la élite del continente bastaban para vaciar la confianza de un club que iba
 * bien en su liga.
 */
export function confidenceAfterGame(
  confidence: number,
  outcome: { won: boolean; expectedToWin: boolean; secondary?: boolean }
): number {
  const base = outcome.won ? (outcome.expectedToWin ? 1 : 3) : outcome.expectedToWin ? -3 : -1;
  const delta = outcome.secondary ? Math.trunc(base / 2) : base;

  return clamp(confidence + delta, DISMISSAL_CONFIDENCE, MAX_CONFIDENCE);
}

/**
 * Revisión de fin de mes: dónde está el equipo y cómo están las cuentas.
 *
 * Estar en números rojos resta aunque se gane, que es la parte que hace que la
 * pantalla de finanzas importe: un consejo aguanta una mala racha, no un
 * agujero en la caja.
 */
export function confidenceAfterMonth(
  confidence: number,
  status: { position: number; targetPosition: number; balanceCents: number }
): number {
  const gap = status.targetPosition - status.position;
  // Por encima del objetivo suma, por debajo resta, y el tamaño importa. Pero
  // no simétricamente: ir por detrás resta como mucho la mitad de lo que suma
  // ir por delante. Con nueve revisiones al año y el mismo peso en las dos
  // direcciones, a cualquier club al que se le pida el título se le acababa la
  // paciencia en enero por ir tercero, y el veredicto de fin de temporada
  // —que es donde se juzga de verdad— no llegaba a contar.
  const sporting = clamp(gap, -2, 4);
  // Lo que sí es tajante es la caja: estar en números rojos es cosa tuya.
  const financial = status.balanceCents < 0 ? -4 : 0;

  return clamp(confidence + sporting + financial, DISMISSAL_CONFIDENCE, MAX_CONFIDENCE);
}

export type SeasonVerdict = 'exceeded' | 'met' | 'failed';

export const SEASON_VERDICT_LABELS: Record<SeasonVerdict, string> = {
  exceeded: 'Objetivo superado',
  met: 'Objetivo cumplido',
  failed: 'Objetivo incumplido'
};

/**
 * Veredicto de la temporada.
 *
 * `playoffRound` es hasta dónde llegó el equipo en el cuadro: 0 si no se
 * clasificó, 1 cuartos, 2 semifinales, 3 final.
 */
export function seasonVerdict(input: {
  objective: BoardObjective;
  position: number;
  teams: number;
  playoffRound: number;
  champion: boolean;
}): SeasonVerdict {
  if (input.champion) {
    return input.objective === 'title' ? 'met' : 'exceeded';
  }

  const target = targetPositionFor(input.objective, input.teams);

  switch (input.objective) {
    case 'title':
      return input.playoffRound >= 3 ? 'met' : 'failed';
    case 'semifinals':
      if (input.playoffRound >= 3) return 'exceeded';
      return input.playoffRound >= 2 ? 'met' : 'failed';
    case 'playoffs':
      if (input.playoffRound >= 2) return 'exceeded';
      return input.playoffRound >= 1 ? 'met' : 'failed';
    // Subir y quedarse a las puertas no se parecen en nada, y en segunda no hay
    // cuadro que valga: el objetivo se mide sólo contra el puesto.
    case 'promotion':
      return input.position <= target ? 'met' : 'failed';
    default:
      if (input.playoffRound >= 1) return 'exceeded';
      return input.position <= target ? 'met' : 'failed';
  }
}

/** Lo que el veredicto le hace a la confianza al cerrar la temporada. */
export function confidenceAfterSeason(confidence: number, verdict: SeasonVerdict): number {
  const delta = verdict === 'exceeded' ? 25 : verdict === 'met' ? 10 : -30;
  return clamp(confidence + delta, DISMISSAL_CONFIDENCE, MAX_CONFIDENCE);
}

/**
 * Subir o bajar de categoría.
 *
 * Pesa aún más que el veredicto de la temporada, y a propósito: un descenso se
 * lleva por delante al entrenador mucho más a menudo que un mal año sin más.
 */
export function confidenceAfterDivisionChange(
  confidence: number,
  direction: 'promoted' | 'relegated'
): number {
  return clamp(
    confidence + (direction === 'promoted' ? 25 : -25),
    DISMISSAL_CONFIDENCE,
    MAX_CONFIDENCE
  );
}

/** Cómo describe el consejo su paciencia ahora mismo. */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 75) return 'Plena confianza';
  if (confidence >= 50) return 'Confianza';
  if (confidence >= DANGER_CONFIDENCE) return 'Dudas';
  if (confidence > DISMISSAL_CONFIDENCE) return 'En la cuerda floja';
  return 'Destituido';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
