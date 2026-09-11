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

export type BoardObjective = 'survive' | 'midtable' | 'playoffs' | 'semifinals' | 'title';

export const BOARD_OBJECTIVES = [
  'survive',
  'midtable',
  'playoffs',
  'semifinals',
  'title'
] as const satisfies readonly BoardObjective[];

export const BOARD_OBJECTIVE_LABELS: Record<BoardObjective, string> = {
  survive: 'Mantener la categoría',
  midtable: 'Pelear la zona media',
  playoffs: 'Clasificarse para los playoffs',
  semifinals: 'Llegar a semifinales',
  title: 'Ganar el título'
};

/** Qué le piden a un club según lo que es. */
export function objectiveForReputation(reputation: number): BoardObjective {
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
 */
export function confidenceAfterGame(
  confidence: number,
  outcome: { won: boolean; expectedToWin: boolean }
): number {
  const delta = outcome.won ? (outcome.expectedToWin ? 1 : 3) : outcome.expectedToWin ? -3 : -1;

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
  // Por encima del objetivo suma, por debajo resta, y el tamaño importa.
  const sporting = clamp(gap, -4, 4);
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
