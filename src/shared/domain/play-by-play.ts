/**
 * La retransmisión: el registro de jugadas del motor contado en castellano.
 *
 * El motor apunta hechos sueltos —un tiro, la asistencia de ese tiro, el robo
 * de esa pérdida— porque así cuadran las estadísticas. Un narrador no habla
 * así: «canasta de Pérez» y, en otra línea, «asistencia de Gómez» se leen como
 * dos jugadas. Aquí se funden en una sola frase las que son la misma jugada, y
 * se añade lo que el acta no dice y un comentarista sí: la personal que lleva
 * cada uno y los parciales.
 *
 * Funciones puras: ni base de datos ni azar. La variedad de las frases sale del
 * número de jugada, así que la misma retransmisión se lee igual cada vez.
 */

import type { GameEvent } from '@shared/engine/basketball/types';

export type PlaySide = 'home' | 'away';

/** Qué clase de jugada es: decide cómo se pinta y qué filtra «sólo canastas». */
export type PlayKind =
  'score' | 'miss' | 'rebound' | 'turnover' | 'foul' | 'substitution' | 'run' | 'period';

export interface PlayLine {
  period: number;
  /** Segundos restantes del cuarto. */
  clockSeconds: number;
  /** De quién es la jugada; `null` en los avisos del partido (inicio, final). */
  side: PlaySide | null;
  kind: PlayKind;
  text: string;
  /** Puntos que sube al marcador. */
  points: number;
  homeScore: number;
  awayScore: number;
}

export interface NarrationContext {
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  regulationPeriods: number;
  /** Nombre corto con el que se nombra a un jugador: «J. Pérez». */
  playerName: (playerId: string) => string;
}

/** A partir de cuántos puntos seguidos sin respuesta un parcial merece línea. */
export const RUN_THRESHOLD = 8;

/** «1er cuarto», «4º cuarto», «prórroga», «2ª prórroga». */
export function periodName(period: number, regulationPeriods: number): string {
  if (period > regulationPeriods) {
    const extra = period - regulationPeriods;
    return extra === 1 ? 'prórroga' : `${extra}ª prórroga`;
  }
  return `${period === 1 || period === 3 ? `${period}er` : `${period}º`} cuarto`;
}

/** Con su artículo, que no es el mismo: «el 2º cuarto», «la prórroga». */
function withArticle(period: number, regulationPeriods: number): { el: string; del: string } {
  const noun = periodName(period, regulationPeriods);
  return period > regulationPeriods
    ? { el: `la ${noun}`, del: `de la ${noun}` }
    : { el: `el ${noun}`, del: `del ${noun}` };
}

/** Reloj de partido: `07:34`. */
export function formatGameClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function narrateGame(events: readonly GameEvent[], context: NarrationContext): PlayLine[] {
  const lines: PlayLine[] = [];
  const personalFouls = new Map<string, number>();
  const run = { side: null as PlaySide | null, points: 0, announced: false };
  const name = context.playerName;

  const sideOf = (event: GameEvent): PlaySide =>
    event.teamId === context.homeTeamId ? 'home' : 'away';
  const teamName = (side: PlaySide): string =>
    side === 'home' ? context.homeTeamName : context.awayTeamName;

  const push = (event: GameEvent, line: Omit<PlayLine, 'period' | 'clockSeconds'>): void => {
    lines.push({ period: event.period, clockSeconds: event.clockSeconds, ...line });
  };

  const trackRun = (event: GameEvent, side: PlaySide, points: number): void => {
    if (run.side !== side) {
      run.side = side;
      run.points = 0;
      run.announced = false;
    }
    run.points += points;
    if (!run.announced && run.points >= RUN_THRESHOLD) {
      run.announced = true;
      push(event, {
        side,
        kind: 'run',
        text: `Parcial de ${run.points}-0 para ${teamName(side)}`,
        points: 0,
        homeScore: event.homeScore,
        awayScore: event.awayScore
      });
    }
  };

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index] as GameEvent;
    const next = events[index + 1];
    const player = event.playerId ? name(event.playerId) : '';
    const score = { homeScore: event.homeScore, awayScore: event.awayScore };

    switch (event.type) {
      case 'periodStart': {
        push(event, {
          side: null,
          kind: 'period',
          text: `Empieza ${withArticle(event.period, context.regulationPeriods).el}`,
          points: 0,
          ...score
        });
        break;
      }

      case 'periodEnd': {
        push(event, {
          side: null,
          kind: 'period',
          text: periodEndText(event, context.regulationPeriods),
          points: 0,
          ...score
        });
        break;
      }

      case 'twoPointMade':
      case 'threePointMade': {
        const side = sideOf(event);
        const points = event.points ?? (event.type === 'threePointMade' ? 3 : 2);
        const assisted =
          next?.type === 'assist' && next.secondaryPlayerId === event.playerId ? next : null;
        const shot = event.type === 'threePointMade' ? pick(TRIPLES, index) : pick(TWOS, index);
        const text = assisted
          ? `${shot(player)}, asistencia de ${name(assisted.playerId ?? '')}`
          : shot(player);
        push(event, { side, kind: 'score', text, points, ...score });
        trackRun(event, side, points);
        if (assisted) {
          index += 1;
        }
        break;
      }

      case 'twoPointMissed':
      case 'threePointMissed': {
        push(event, {
          side: sideOf(event),
          kind: 'miss',
          text: event.type === 'threePointMissed' ? `${player} falla el triple` : `Falla ${player}`,
          points: 0,
          ...score
        });
        break;
      }

      case 'block': {
        // El motor apunta el tapón antes que el tiro fallado: son la misma jugada.
        const shooter = event.secondaryPlayerId ? name(event.secondaryPlayerId) : '';
        const missed =
          (next?.type === 'twoPointMissed' || next?.type === 'threePointMissed') &&
          next.playerId === event.secondaryPlayerId;
        push(event, {
          side: sideOf(event),
          kind: 'miss',
          text: `¡Tapón de ${player} a ${shooter}!`,
          points: 0,
          ...score
        });
        if (missed) {
          index += 1;
        }
        break;
      }

      case 'freeThrowMade':
      case 'freeThrowMissed': {
        // Los tiros libres seguidos del mismo jugador se cuentan en una línea.
        let made = 0;
        let attempts = 0;
        let last = event;
        while (index < events.length) {
          const current = events[index] as GameEvent;
          if (
            (current.type !== 'freeThrowMade' && current.type !== 'freeThrowMissed') ||
            current.playerId !== event.playerId
          ) {
            break;
          }
          attempts += 1;
          if (current.type === 'freeThrowMade') made += 1;
          last = current;
          index += 1;
        }
        index -= 1;

        const side = sideOf(event);
        push(last, {
          side,
          kind: made > 0 ? 'score' : 'miss',
          text: `${player}, ${made} de ${attempts} desde la línea`,
          points: made,
          homeScore: last.homeScore,
          awayScore: last.awayScore
        });
        if (made > 0) {
          trackRun(last, side, made);
        }
        break;
      }

      case 'offensiveRebound':
      case 'defensiveRebound': {
        push(event, {
          side: sideOf(event),
          kind: 'rebound',
          text:
            event.type === 'offensiveRebound'
              ? `Rebote ofensivo de ${player}`
              : `Rebote de ${player}`,
          points: 0,
          ...score
        });
        break;
      }

      case 'turnover': {
        const stolen =
          next?.type === 'steal' && next.secondaryPlayerId === event.playerId ? next : null;
        push(stolen ?? event, {
          side: stolen ? sideOf(stolen) : sideOf(event),
          kind: 'turnover',
          text: stolen
            ? `Robo de ${name(stolen.playerId ?? '')} a ${player}`
            : `Pérdida de ${player}`,
          points: 0,
          ...score
        });
        if (stolen) {
          index += 1;
        }
        break;
      }

      case 'steal': {
        // Un robo sin su pérdida delante no debería darse; si se da, se cuenta igual.
        push(event, {
          side: sideOf(event),
          kind: 'turnover',
          text: `Robo de ${player}`,
          points: 0,
          ...score
        });
        break;
      }

      case 'assist': {
        // Suelta sólo si no iba pegada a su canasta.
        push(event, {
          side: sideOf(event),
          kind: 'score',
          text: `Asistencia de ${player}`,
          points: 0,
          ...score
        });
        break;
      }

      case 'foul': {
        const count = (personalFouls.get(event.playerId ?? '') ?? 0) + 1;
        personalFouls.set(event.playerId ?? '', count);
        const drawer = event.secondaryPlayerId ? ` sobre ${name(event.secondaryPlayerId)}` : '';
        push(event, {
          side: sideOf(event),
          kind: 'foul',
          text: `Falta de ${player}${drawer} (${count}ª personal)`,
          points: 0,
          ...score
        });
        break;
      }

      case 'foulOut': {
        push(event, {
          side: sideOf(event),
          kind: 'foul',
          text: `${player}, eliminado por faltas`,
          points: 0,
          ...score
        });
        break;
      }

      case 'substitution': {
        // Los cambios del mismo equipo en el mismo segundo van en una línea.
        const side = sideOf(event);
        const changes: string[] = [];
        while (index < events.length) {
          const current = events[index] as GameEvent;
          if (
            current.type !== 'substitution' ||
            current.teamId !== event.teamId ||
            current.period !== event.period ||
            current.clockSeconds !== event.clockSeconds
          ) {
            break;
          }
          const outgoing = current.secondaryPlayerId ? name(current.secondaryPlayerId) : '';
          changes.push(`entra ${name(current.playerId ?? '')} por ${outgoing}`);
          index += 1;
        }
        index -= 1;

        push(event, {
          side,
          kind: 'substitution',
          text: `Cambio en ${teamName(side)}: ${changes.join(', ')}`,
          points: 0,
          ...score
        });
        break;
      }
    }
  }

  return lines;
}

/**
 * Cuántas líneas de la retransmisión se han visto ya con el reloj del partido
 * en ese cuarto y ese segundo. Las líneas van en orden, así que basta con
 * buscar la primera que todavía no ha pasado.
 */
export function visibleLineCount(
  lines: readonly PlayLine[],
  period: number,
  clockSeconds: number
): number {
  const pending = lines.findIndex(
    (line) => line.period > period || (line.period === period && line.clockSeconds < clockSeconds)
  );
  return pending === -1 ? lines.length : pending;
}

/** Lo que cabe esperar al ver sólo las canastas: los tantos y los parciales. */
export function isHighlight(line: PlayLine): boolean {
  return line.kind === 'score' || line.kind === 'run' || line.kind === 'period';
}

function periodEndText(event: GameEvent, regulationPeriods: number): string {
  const score = `${event.homeScore}-${event.awayScore}`;
  if (event.period >= regulationPeriods && event.homeScore !== event.awayScore) {
    return `Final del partido · ${score}`;
  }
  if (event.period === regulationPeriods) {
    return `Empate al final del tiempo reglamentario · ${score}: habrá prórroga`;
  }
  if (event.period > regulationPeriods) {
    return `Empate al final ${withArticle(event.period, regulationPeriods).del} · ${score}: otra prórroga`;
  }
  if (event.period === Math.floor(regulationPeriods / 2)) {
    return `Descanso · ${score}`;
  }
  return `Final ${withArticle(event.period, regulationPeriods).del} · ${score}`;
}

type Phrase = (player: string) => string;

const TWOS: readonly Phrase[] = [
  (player) => `Canasta de ${player}`,
  (player) => `${player} anota de dos`,
  (player) => `${player} la mete`
];

const TRIPLES: readonly Phrase[] = [
  (player) => `¡Triple de ${player}!`,
  (player) => `${player} anota desde lejos`,
  (player) => `Triple de ${player}`
];

function pick(phrases: readonly Phrase[], index: number): Phrase {
  return phrases[index % phrases.length] as Phrase;
}
