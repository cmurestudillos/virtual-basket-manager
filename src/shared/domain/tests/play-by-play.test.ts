import { describe, expect, it } from 'vitest';
import { FIBA_RULESET } from '@shared/domain/rulesets';
import { simulateGame, type GameEvent } from '@shared/engine/basketball';
import { buildTestTeam } from '@shared/engine/basketball/tests/test-teams';
import {
  formatGameClock,
  isHighlight,
  narrateGame,
  periodName,
  RUN_THRESHOLD,
  visibleLineCount,
  type NarrationContext
} from '../play-by-play';

const CONTEXT: NarrationContext = {
  homeTeamId: 'local',
  homeTeamName: 'Local',
  awayTeamName: 'Visitante',
  regulationPeriods: 4,
  playerName: (id) => id.toUpperCase()
};

/** Una jugada a mano: sólo lo que el test necesita, el resto con valores neutros. */
function event(partial: Partial<GameEvent> & Pick<GameEvent, 'type'>): GameEvent {
  return {
    period: 1,
    clockSeconds: 500,
    teamId: 'local',
    playerId: 'a',
    homeScore: 0,
    awayScore: 0,
    ...partial
  };
}

describe('narrateGame', () => {
  it('funde la canasta con su asistencia en una sola línea', () => {
    const lines = narrateGame(
      [
        event({ type: 'twoPointMade', points: 2, homeScore: 2 }),
        event({ type: 'assist', playerId: 'b', secondaryPlayerId: 'a', homeScore: 2 })
      ],
      CONTEXT
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toContain('asistencia de B');
    expect(lines[0]).toMatchObject({ kind: 'score', side: 'home', points: 2, homeScore: 2 });
  });

  it('cuenta el robo desde el lado del que roba', () => {
    const lines = narrateGame(
      [
        event({ type: 'turnover' }),
        event({ type: 'steal', teamId: 'visitante', playerId: 'z', secondaryPlayerId: 'a' })
      ],
      CONTEXT
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ text: 'Robo de Z a A', side: 'away', kind: 'turnover' });
  });

  it('el tapón y el tiro fallado son la misma jugada', () => {
    const lines = narrateGame(
      [
        event({ type: 'block', teamId: 'visitante', playerId: 'z', secondaryPlayerId: 'a' }),
        event({ type: 'twoPointMissed' })
      ],
      CONTEXT
    );

    expect(lines.map((line) => line.text)).toEqual(['¡Tapón de Z a A!']);
  });

  it('agrupa los tiros libres seguidos y lleva la cuenta de personales', () => {
    const lines = narrateGame(
      [
        event({ type: 'foul', teamId: 'visitante', playerId: 'z', secondaryPlayerId: 'a' }),
        event({ type: 'freeThrowMade', points: 1, homeScore: 1 }),
        event({ type: 'freeThrowMissed', homeScore: 1 }),
        event({ type: 'foul', teamId: 'visitante', playerId: 'z', secondaryPlayerId: 'a' })
      ],
      CONTEXT
    );

    expect(lines.map((line) => line.text)).toEqual([
      'Falta de Z sobre A (1ª personal)',
      'A, 1 de 2 desde la línea',
      'Falta de Z sobre A (2ª personal)'
    ]);
    expect(lines[1]).toMatchObject({ kind: 'score', points: 1, homeScore: 1 });
  });

  it('junta en una línea los cambios del mismo equipo en el mismo segundo', () => {
    const lines = narrateGame(
      [
        event({ type: 'substitution', playerId: 'f', secondaryPlayerId: 'a' }),
        event({ type: 'substitution', playerId: 'g', secondaryPlayerId: 'b' }),
        event({ type: 'substitution', teamId: 'visitante', playerId: 'y', secondaryPlayerId: 'z' })
      ],
      CONTEXT
    );

    expect(lines.map((line) => line.text)).toEqual([
      'Cambio en Local: entra F por A, entra G por B',
      'Cambio en Visitante: entra Y por Z'
    ]);
  });

  it('anuncia un parcial una sola vez, y lo corta la canasta del rival', () => {
    const baskets: GameEvent[] = [];
    let home = 0;
    let away = 0;
    for (let index = 0; index < 6; index += 1) {
      home += 2;
      baskets.push(event({ type: 'twoPointMade', points: 2, homeScore: home }));
    }
    away += 3;
    baskets.push(
      event({
        type: 'threePointMade',
        teamId: 'visitante',
        points: 3,
        homeScore: home,
        awayScore: away
      })
    );

    const runs = narrateGame(baskets, CONTEXT).filter((line) => line.kind === 'run');

    expect(runs).toHaveLength(1);
    expect(runs[0]?.text).toBe(`Parcial de ${RUN_THRESHOLD}-0 para Local`);
  });

  it('cierra cada cuarto con su nombre y distingue descanso, prórroga y final', () => {
    const end = (period: number, homeScore: number, awayScore: number): string =>
      narrateGame(
        [event({ type: 'periodEnd', period, clockSeconds: 0, teamId: '', homeScore, awayScore })],
        CONTEXT
      )[0]?.text ?? '';

    expect(end(1, 20, 18)).toBe('Final del 1er cuarto · 20-18');
    expect(end(2, 40, 38)).toBe('Descanso · 40-38');
    expect(end(4, 80, 80)).toContain('habrá prórroga');
    expect(end(5, 88, 88)).toContain('Empate al final de la prórroga');
    expect(end(5, 90, 88)).toBe('Final del partido · 90-88');
  });

  it('narra un partido entero sin perder un punto por el camino', () => {
    const result = simulateGame({
      gameId: 'retransmision',
      home: buildTestTeam('local', 62),
      away: buildTestTeam('visitante', 60),
      ruleset: FIBA_RULESET
    });
    const lines = narrateGame(result.events, CONTEXT);

    const pointsFor = (side: 'home' | 'away'): number =>
      lines.filter((line) => line.side === side).reduce((sum, line) => sum + line.points, 0);
    expect(pointsFor('home')).toBe(result.home.score);
    expect(pointsFor('away')).toBe(result.away.score);

    // Cada asistencia del acta va pegada a su canasta, no suelta.
    const assists = [...result.home.boxScores, ...result.away.boxScores].reduce(
      (sum, line) => sum + line.assists,
      0
    );
    expect(lines.filter((line) => line.text.includes('asistencia de'))).toHaveLength(assists);
    expect(lines.some((line) => line.text.startsWith('Asistencia de'))).toBe(false);

    expect(lines.some((line) => line.kind === 'substitution')).toBe(true);
    expect(lines.at(-1)?.text).toBe(
      `Final del partido · ${result.home.score}-${result.away.score}`
    );
  });
});

describe('utilidades de la retransmisión', () => {
  it('nombra cuartos y prórrogas', () => {
    expect(periodName(1, 4)).toBe('1er cuarto');
    expect(periodName(2, 4)).toBe('2º cuarto');
    expect(periodName(3, 4)).toBe('3er cuarto');
    expect(periodName(5, 4)).toBe('prórroga');
    expect(periodName(6, 4)).toBe('2ª prórroga');
  });

  it('pinta el reloj con dos cifras', () => {
    expect(formatGameClock(600)).toBe('10:00');
    expect(formatGameClock(454)).toBe('07:34');
    expect(formatGameClock(-3)).toBe('00:00');
  });

  it('destapa las jugadas cuyo segundo ya ha pasado', () => {
    const lines = narrateGame(
      [
        event({ type: 'periodStart', clockSeconds: 600, teamId: '' }),
        event({ type: 'twoPointMissed', clockSeconds: 580 }),
        event({ type: 'defensiveRebound', clockSeconds: 580, teamId: 'visitante' }),
        event({ type: 'turnover', clockSeconds: 560, teamId: 'visitante' }),
        event({ type: 'periodEnd', clockSeconds: 0, teamId: '' }),
        event({ type: 'periodStart', period: 2, clockSeconds: 600, teamId: '' })
      ],
      CONTEXT
    );

    expect(visibleLineCount(lines, 1, 600)).toBe(1);
    // Las dos jugadas del mismo segundo salen a la vez.
    expect(visibleLineCount(lines, 1, 580)).toBe(3);
    expect(visibleLineCount(lines, 1, 0)).toBe(5);
    expect(visibleLineCount(lines, 2, 0)).toBe(6);
  });

  it('en «canastas» quedan los tantos, los parciales y los cortes de cuarto', () => {
    const lines = narrateGame(
      [
        event({ type: 'periodStart', teamId: '' }),
        event({ type: 'twoPointMade', points: 2, homeScore: 2 }),
        event({ type: 'defensiveRebound' })
      ],
      CONTEXT
    );

    expect(lines.filter(isHighlight).map((line) => line.kind)).toEqual(['period', 'score']);
  });
});
