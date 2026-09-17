import type { FixtureEntry, SeasonSummary } from '@shared/contracts/season.contract';

/**
 * Qué hace CONTINUAR en cada momento de la partida.
 *
 * Hasta la fase 2 del estilo IBM esto estaba repartido por los botones del
 * panel del club («Avanzar día», «Ir a la jornada», «Jugar partido», «Empezar
 * temporada», «Esperar un mes»). Con un único CONTINUAR en la barra de arriba
 * la decisión tiene que vivir en un sitio, y en uno sin Vue ni IPC: así se
 * prueba sola y el panel del club, la barra y el arnés leen la misma respuesta.
 */

export type ContinueAction =
  /** Nada que hacer: sin partida cargada, o destituido sin selección que dirigir. */
  | { kind: 'none'; reason: 'noGame' | 'dismissed' | 'unemployed' }
  /** En el paro y sin selección: pasa un mes y llegan otros banquillos. */
  | { kind: 'wait' }
  /** Semana de descanso en una liga impar: la jornada se juega sin el club. */
  | { kind: 'playRound'; round: number }
  /** Hay partido propio: se avanza hasta él y se entra. */
  | { kind: 'playGame'; gameId: string }
  /** Sin partido propio pero con la competición en marcha. */
  | { kind: 'advance'; reason: 'pendingLeagues' | 'eliminated' | 'noOwnGames' }
  /** Todo terminado: empieza la temporada siguiente. */
  | { kind: 'startSeason'; seasonNumber: number };

export type ContinueKind = ContinueAction['kind'];

export interface ContinueContext {
  /** Hay partida cargada y temporada leída. */
  hasGame: boolean;
  season: Pick<SeasonSummary, 'stage' | 'nextRound' | 'pendingLeagues' | 'seasonNumber'> | null;
  nextGame: Pick<FixtureEntry, 'gameId' | 'scheduledOn'> | null;
  /** El consejo te ha echado (o el último avance lo dijo). */
  dismissed: boolean;
  /** Modo carrera y sin club. */
  unemployed: boolean;
  /** Sin club, pero con selección: sus partidos se siguen dirigiendo. */
  nationalOnly: boolean;
  /** La carrera deja esperar a otra ventana de banquillos. */
  canWait: boolean;
}

/**
 * La jornada de liga que toca, si el próximo partido del club llega después de
 * ella. Es la semana de descanso de una liga impar —el club no juega esa
 * jornada— o, con el partido propio ya jugado, el resto de la jornada por
 * simular. En los dos casos el partido siguiente todavía no se puede empezar.
 */
export function roundBeforeNextGame(
  context: Pick<ContinueContext, 'season' | 'nextGame' | 'unemployed'>
): SeasonSummary['nextRound'] {
  const round = context.season?.nextRound;
  if (context.season?.stage !== 'regular' || !round || context.unemployed) {
    return null;
  }
  const next = context.nextGame;
  return !next || next.scheduledOn > round.scheduledOn ? round : null;
}

/** Lo mismo que decidía el panel del club, en el mismo orden. */
export function decideContinue(context: ContinueContext): ContinueAction {
  if (!context.hasGame || !context.season) {
    return { kind: 'none', reason: 'noGame' };
  }
  // Sin club, lo primero es elegir banquillo; esperar es lo único que mueve el
  // reloj. Con selección, en cambio, sus partidos siguen y se juegan abajo.
  if (context.unemployed && !context.nationalOnly) {
    return context.canWait ? { kind: 'wait' } : { kind: 'none', reason: 'unemployed' };
  }
  if (context.dismissed && !context.nationalOnly) {
    return { kind: 'none', reason: 'dismissed' };
  }

  const before = roundBeforeNextGame(context);
  if (before?.managedRests) {
    return { kind: 'playRound', round: before.round };
  }
  if (context.nextGame) {
    return { kind: 'playGame', gameId: context.nextGame.gameId };
  }

  const { stage, pendingLeagues, seasonNumber } = context.season;
  if (stage === 'finished') {
    return pendingLeagues.length > 0
      ? { kind: 'advance', reason: 'pendingLeagues' }
      : { kind: 'startSeason', seasonNumber: seasonNumber + 1 };
  }
  return { kind: 'advance', reason: stage === 'playoffs' ? 'eliminated' : 'noOwnGames' };
}

/**
 * Las acciones que avanzan el calendario a golpes de `advanceToNextGame` se
 * repiten mientras CONTINUAR siga queriendo decir lo mismo: así un solo clic
 * llega hasta lo siguiente que necesita al usuario y no se para en cada día con
 * partidos de otras ligas. Las demás son una sola llamada.
 */
export function isRepeating(action: ContinueAction): boolean {
  return action.kind === 'playGame' || action.kind === 'playRound' || action.kind === 'advance';
}

/** Identidad de una acción: si cambia a mitad de un avance, se para ahí. */
export function continueKey(action: ContinueAction): string {
  switch (action.kind) {
    case 'none':
    case 'advance':
      return `${action.kind}:${action.reason}`;
    case 'playRound':
      return `playRound:${action.round}`;
    case 'playGame':
      return `playGame:${action.gameId}`;
    case 'startSeason':
      return `startSeason:${action.seasonNumber}`;
    case 'wait':
      return 'wait';
  }
}

/** «Avanzar día» tiene sentido mientras haya calendario que mover con banquillo. */
export function canAdvanceDay(action: ContinueAction): boolean {
  return isRepeating(action);
}

/** La línea pequeña bajo CONTINUAR: qué va a pasar al pulsarlo. */
export function continueDetail(action: ContinueAction, rivalName: string | null): string {
  switch (action.kind) {
    case 'none':
      return action.reason === 'dismissed'
        ? 'Destituido'
        : action.reason === 'unemployed'
          ? 'Sin equipo'
          : '';
    case 'wait':
      return 'Esperar un mes';
    case 'playRound':
      return `Jornada ${action.round} · descansas`;
    case 'playGame':
      return rivalName ? `Partido contra ${rivalName}` : 'Ir al partido';
    case 'advance':
      return action.reason === 'pendingLeagues'
        ? 'Terminar las otras ligas'
        : 'Seguir la temporada';
    case 'startSeason':
      return `Empezar temporada ${action.seasonNumber}`;
  }
}

/** Lo que dice el aviso de avance de días mientras trabaja. */
export function progressText(
  kind: ContinueKind | 'day' | 'waitMonth',
  rivalName: string | null
): string {
  switch (kind) {
    case 'playGame':
      return rivalName
        ? `Simulando hasta el partido contra ${rivalName}…`
        : 'Simulando hasta tu partido…';
    case 'playRound':
      return 'Jugando la jornada en la que descansas…';
    case 'advance':
      return 'Simulando el resto de la temporada…';
    case 'startSeason':
      return 'Preparando la temporada nueva…';
    case 'wait':
    case 'waitMonth':
      return 'Pasa el mes…';
    case 'day':
      return 'Avanzando un día…';
    case 'none':
      return '';
  }
}

/**
 * El rival del partido que toca, visto desde el usuario. En un partido de
 * selección ninguno de los dos es el club, así que se mira el nombre de la
 * selección que dirige; si tampoco, no hay «rival» que decir.
 */
export function rivalOf(
  game: Pick<FixtureEntry, 'homeTeamId' | 'homeTeamName' | 'awayTeamId' | 'awayTeamName'>,
  teamId: string | null,
  nationalTeamName: string | null
): { teamId: string; teamName: string } | null {
  if (game.homeTeamId === teamId || game.homeTeamName === nationalTeamName) {
    return { teamId: game.awayTeamId, teamName: game.awayTeamName };
  }
  if (game.awayTeamId === teamId || game.awayTeamName === nationalTeamName) {
    return { teamId: game.homeTeamId, teamName: game.homeTeamName };
  }
  return null;
}
