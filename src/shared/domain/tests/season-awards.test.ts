import { describe, expect, it } from 'vitest';
import { emptyPlayerBoxScore, type PlayerBoxScore } from '../box-score';
import type { Position } from '../positions';
import { computeSeasonAwards, type AwardLine, type SeasonAwardsInput } from '../season-awards';

let gameCounter = 0;

/** Un partido de un jugador, con 20 minutos jugados salvo que se diga otra cosa. */
function line(
  playerId: string,
  teamId: string,
  overrides: Partial<PlayerBoxScore> = {},
  gameId = `g${gameCounter++}`
): AwardLine {
  return {
    ...emptyPlayerBoxScore(playerId),
    secondsPlayed: 1200,
    // Sin intentos dichos, los tiros entran todos: así la valoración sale redonda.
    twoPointAttempted: overrides.twoPointAttempted ?? overrides.twoPointMade ?? 0,
    ...overrides,
    gameId,
    teamId
  };
}

/** `games` partidos iguales del mismo jugador, cada uno en su partido. */
function lines(
  playerId: string,
  teamId: string,
  games: number,
  overrides: Partial<PlayerBoxScore> = {}
): AwardLine[] {
  return Array.from({ length: games }, (_, index) =>
    line(playerId, teamId, overrides, `${teamId}-${index}`)
  );
}

function input(overrides: Partial<SeasonAwardsInput> = {}): SeasonAwardsInput {
  return {
    regularLines: [],
    players: new Map(),
    standings: [],
    expectedPositions: new Map(),
    coaches: new Map(),
    finals: null,
    ...overrides
  };
}

function player(position: Position, age = 27): { position: Position; age: number } {
  return { position, age };
}

describe('computeSeasonAwards', () => {
  const regularLines = [
    // El anotador: muchos puntos, poca cosa más.
    ...lines('anotador', 'a', 10, { twoPointMade: 10, twoPointAttempted: 18 }),
    // El pívot: rebotes y tapones.
    ...lines('pivot', 'b', 10, { defensiveRebounds: 12, blocks: 3, twoPointMade: 4 }),
    // El base: asistencias y robos.
    ...lines('base', 'a', 10, { assists: 9, steals: 2, twoPointMade: 3 }),
    // El joven, que juega bien pero menos que los de arriba.
    ...lines('joven', 'b', 10, { twoPointMade: 5, defensiveRebounds: 3 }),
    // Un fenómeno de dos partidos: no llega al mínimo.
    ...lines('fugaz', 'c', 2, { twoPointMade: 20, defensiveRebounds: 20, assists: 20 })
  ];
  const players = new Map([
    ['anotador', player('SF')],
    ['pivot', player('C')],
    ['base', player('PG')],
    ['joven', player('SG', 21)],
    ['fugaz', player('PF', 20)]
  ]);

  const awards = computeSeasonAwards(input({ regularLines, players }));
  const of = (type: string) => awards.filter((award) => award.type === type);

  it('cada premio sale de su media, con el mínimo de partidos de la tabla de líderes', () => {
    expect(of('top_scorer')[0]?.playerId).toBe('anotador');
    expect(of('top_scorer')[0]?.value).toBe(20);
    expect(of('top_rebounder')[0]?.playerId).toBe('pivot');
    expect(of('top_assister')[0]?.playerId).toBe('base');
    // El que jugó dos partidos no gana nada, por mucho que metiera.
    expect(awards.some((award) => award.playerId === 'fugaz')).toBe(false);
  });

  it('el mejor defensor suma robos y tapones', () => {
    expect(of('best_defender')[0]?.playerId).toBe('pivot');
    expect(of('best_defender')[0]?.value).toBe(3);
  });

  it('el MVP es la mejor valoración, y el joven sólo mira a los de 22 o menos', () => {
    expect(of('mvp')[0]?.playerId).toBe('pivot');
    expect(of('best_young')[0]?.playerId).toBe('joven');
  });

  it('el quinteto ideal lleva uno por puesto, de base a pívot, y deja vacío el que no tiene nadie', () => {
    const quintet = of('all_league');
    expect(quintet.map((award) => [award.slot, award.position, award.playerId])).toEqual([
      [0, 'PG', 'base'],
      [1, 'SG', 'joven'],
      [2, 'SF', 'anotador'],
      [4, 'C', 'pivot']
    ]);
  });

  it('el premio se apunta al club con el que más jugó el jugador', () => {
    const traspasado = [
      ...lines('viajero', 'a', 3, { twoPointMade: 30 }),
      ...lines('viajero', 'b', 7, { twoPointMade: 30 }).map((row, index) => ({
        ...row,
        gameId: `otro-${index}`
      }))
    ];
    const result = computeSeasonAwards(
      input({ regularLines: [...regularLines, ...traspasado], players })
    );
    const scorer = result.find((award) => award.type === 'top_scorer');
    expect(scorer?.playerId).toBe('viajero');
    expect(scorer?.teamId).toBe('b');
  });

  it('el entrenador del año es el del club que más ha superado lo que se esperaba de él', () => {
    const result = computeSeasonAwards(
      input({
        standings: [
          { teamId: 'favorito', position: 1 },
          { teamId: 'sorpresa', position: 2 },
          { teamId: 'decepcion', position: 3 }
        ],
        expectedPositions: new Map([
          ['favorito', 1],
          ['sorpresa', 3],
          ['decepcion', 2]
        ]),
        coaches: new Map([
          ['favorito', 'coach-f'],
          ['sorpresa', 'coach-s'],
          ['decepcion', 'coach-d']
        ])
      })
    );
    const coach = result.find((award) => award.type === 'coach_of_year');
    expect(coach).toMatchObject({ coachId: 'coach-s', teamId: 'sorpresa', value: 1 });
    expect(coach?.playerId).toBeNull();
  });

  it('sin banquillo no hay premio: pasa al siguiente club', () => {
    const result = computeSeasonAwards(
      input({
        standings: [
          { teamId: 'vacio', position: 1 },
          { teamId: 'otro', position: 2 }
        ],
        expectedPositions: new Map([
          ['vacio', 5],
          ['otro', 2]
        ]),
        coaches: new Map([['otro', 'coach-o']])
      })
    );
    expect(result.find((award) => award.type === 'coach_of_year')?.coachId).toBe('coach-o');
  });

  it('el MVP de la final es del campeón, aunque un rival valorara más', () => {
    const result = computeSeasonAwards(
      input({
        finals: {
          championTeamId: 'a',
          lines: [
            line('estrella-rival', 'b', { twoPointMade: 15 }),
            line('heroe', 'a', { twoPointMade: 8 }),
            line('secundario', 'a', { twoPointMade: 3 })
          ]
        }
      })
    );
    const finals = result.find((award) => award.type === 'finals_mvp');
    expect(finals).toMatchObject({ playerId: 'heroe', teamId: 'a', value: 16 });
  });

  it('sin playoffs no hay MVP de la final', () => {
    expect(awards.some((award) => award.type === 'finals_mvp')).toBe(false);
  });

  it('sin actas no se inventa ningún premio de jugador', () => {
    expect(computeSeasonAwards(input())).toEqual([]);
  });
});
