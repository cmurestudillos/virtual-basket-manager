/**
 * Estadística de un jugador en un partido. Es el "acta" y la unidad de dato más
 * importante del juego: de aquí sale todo lo demás (medias de temporada,
 * clasificaciones de anotadores, valoración, MVP de la jornada).
 *
 * Se guarda tal cual, en crudo. Nada de porcentajes ni valoraciones
 * persistidas: se derivan con las funciones de este módulo.
 */
export interface PlayerBoxScore {
  playerId: string;
  /** Segundos jugados. En segundos y no en minutos para no arrastrar decimales. */
  secondsPlayed: number;
  /** Tiros de dos: anotados / intentados. */
  twoPointMade: number;
  twoPointAttempted: number;
  threePointMade: number;
  threePointAttempted: number;
  freeThrowMade: number;
  freeThrowAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  /** Faltas cometidas. */
  fouls: number;
  /** Faltas recibidas: entran en la valoración ACB. */
  foulsDrawn: number;
  /** Diferencia de puntos del equipo mientras el jugador estaba en pista. */
  plusMinus: number;
}

export function emptyPlayerBoxScore(playerId: string): PlayerBoxScore {
  return {
    playerId,
    secondsPlayed: 0,
    twoPointMade: 0,
    twoPointAttempted: 0,
    threePointMade: 0,
    threePointAttempted: 0,
    freeThrowMade: 0,
    freeThrowAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0,
    foulsDrawn: 0,
    plusMinus: 0
  };
}

export function points(line: PlayerBoxScore): number {
  return line.twoPointMade * 2 + line.threePointMade * 3 + line.freeThrowMade;
}

export function totalRebounds(line: PlayerBoxScore): number {
  return line.offensiveRebounds + line.defensiveRebounds;
}

export function fieldGoalsMade(line: PlayerBoxScore): number {
  return line.twoPointMade + line.threePointMade;
}

export function fieldGoalsAttempted(line: PlayerBoxScore): number {
  return line.twoPointAttempted + line.threePointAttempted;
}

/**
 * Valoración ACB, la estadística con la que se decide el MVP de la jornada en
 * España y la que enseñaba PC Basket en cabecera:
 *
 *   (puntos + rebotes + asistencias + robos + tapones + faltas recibidas)
 *   − (tiros fallados + pérdidas + faltas cometidas)
 */
export function efficiencyRating(line: PlayerBoxScore): number {
  const positive =
    points(line) + totalRebounds(line) + line.assists + line.steals + line.blocks + line.foulsDrawn;

  const missedShots =
    fieldGoalsAttempted(line) -
    fieldGoalsMade(line) +
    (line.freeThrowAttempted - line.freeThrowMade);

  return positive - (missedShots + line.turnovers + line.fouls);
}

/** Porcentaje 0-100 con un decimal; 0 si no hubo intentos (nunca `NaN`). */
export function percentage(made: number, attempted: number): number {
  if (attempted <= 0) {
    return 0;
  }
  return Math.round((made / attempted) * 1000) / 10;
}

/** Minutos jugados en formato acta: `MM:SS`. */
export function formatMinutes(secondsPlayed: number): string {
  const minutes = Math.floor(secondsPlayed / 60);
  const seconds = secondsPlayed % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Suma dos líneas del mismo jugador (acumulado de temporada). */
export function addBoxScores(a: PlayerBoxScore, b: PlayerBoxScore): PlayerBoxScore {
  return {
    playerId: a.playerId,
    secondsPlayed: a.secondsPlayed + b.secondsPlayed,
    twoPointMade: a.twoPointMade + b.twoPointMade,
    twoPointAttempted: a.twoPointAttempted + b.twoPointAttempted,
    threePointMade: a.threePointMade + b.threePointMade,
    threePointAttempted: a.threePointAttempted + b.threePointAttempted,
    freeThrowMade: a.freeThrowMade + b.freeThrowMade,
    freeThrowAttempted: a.freeThrowAttempted + b.freeThrowAttempted,
    offensiveRebounds: a.offensiveRebounds + b.offensiveRebounds,
    defensiveRebounds: a.defensiveRebounds + b.defensiveRebounds,
    assists: a.assists + b.assists,
    steals: a.steals + b.steals,
    blocks: a.blocks + b.blocks,
    turnovers: a.turnovers + b.turnovers,
    fouls: a.fouls + b.fouls,
    foulsDrawn: a.foulsDrawn + b.foulsDrawn,
    plusMinus: a.plusMinus + b.plusMinus
  };
}
