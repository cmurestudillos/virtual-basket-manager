import { describe, expect, it } from 'vitest';
import {
  canAdvanceDay,
  continueDetail,
  continueKey,
  decideContinue,
  isRepeating,
  progressText,
  rivalOf,
  roundBeforeNextGame,
  type ContinueContext
} from '../continue-action';

const DAY = 24 * 60 * 60 * 1000;

/** Liga regular en marcha, con partido propio en tres días y la jornada al día. */
function context(overrides: Partial<ContinueContext> = {}): ContinueContext {
  return {
    hasGame: true,
    season: {
      stage: 'regular',
      nextRound: { round: 5, scheduledOn: 3 * DAY, managedRests: false },
      pendingLeagues: [],
      seasonNumber: 2
    },
    nextGame: { gameId: 'g-5', scheduledOn: 3 * DAY },
    dismissed: false,
    unemployed: false,
    nationalOnly: false,
    canWait: false,
    ...overrides
  };
}

describe('decideContinue', () => {
  it('sin partida cargada no hace nada', () => {
    expect(decideContinue(context({ hasGame: false }))).toEqual({ kind: 'none', reason: 'noGame' });
    expect(decideContinue(context({ season: null }))).toEqual({ kind: 'none', reason: 'noGame' });
  });

  it('con partido propio pendiente va a por él', () => {
    expect(decideContinue(context())).toEqual({ kind: 'playGame', gameId: 'g-5' });
  });

  it('con la jornada anterior a medias sigue yendo al partido: el avance la juega antes', () => {
    const action = decideContinue(
      context({
        season: {
          ...context().season!,
          nextRound: { round: 4, scheduledOn: DAY, managedRests: false }
        }
      })
    );
    expect(action).toEqual({ kind: 'playGame', gameId: 'g-5' });
    expect(isRepeating(action)).toBe(true);
  });

  it('en la semana de descanso juega la jornada sin el club', () => {
    const resting = context({
      season: {
        ...context().season!,
        nextRound: { round: 4, scheduledOn: DAY, managedRests: true }
      }
    });
    expect(decideContinue(resting)).toEqual({ kind: 'playRound', round: 4 });
  });

  it('destituido y sin selección no mueve nada', () => {
    expect(decideContinue(context({ dismissed: true }))).toEqual({
      kind: 'none',
      reason: 'dismissed'
    });
  });

  it('en el paro espera un mes si la carrera lo deja', () => {
    const paro = context({ unemployed: true, dismissed: true, nextGame: null });
    expect(decideContinue({ ...paro, canWait: true })).toEqual({ kind: 'wait' });
    expect(decideContinue(paro)).toEqual({ kind: 'none', reason: 'unemployed' });
  });

  it('en el paro con selección sigue jugando sus partidos, sin semanas de descanso', () => {
    const action = decideContinue(
      context({
        unemployed: true,
        nationalOnly: true,
        dismissed: true,
        canWait: true,
        season: {
          ...context().season!,
          nextRound: { round: 4, scheduledOn: DAY, managedRests: true }
        }
      })
    );
    expect(action).toEqual({ kind: 'playGame', gameId: 'g-5' });
  });

  it('eliminado o sin partidos propios sigue la temporada', () => {
    const season = context().season!;
    expect(
      decideContinue(context({ nextGame: null, season: { ...season, nextRound: null } }))
    ).toEqual({ kind: 'advance', reason: 'noOwnGames' });
    expect(
      decideContinue(
        context({ nextGame: null, season: { ...season, stage: 'playoffs', nextRound: null } })
      )
    ).toEqual({ kind: 'advance', reason: 'eliminated' });
  });

  it('con la temporada terminada termina las otras ligas y después empieza la siguiente', () => {
    const season = { ...context().season!, stage: 'finished' as const, nextRound: null };
    expect(
      decideContinue(context({ nextGame: null, season: { ...season, pendingLeagues: ['A1'] } }))
    ).toEqual({ kind: 'advance', reason: 'pendingLeagues' });
    expect(decideContinue(context({ nextGame: null, season }))).toEqual({
      kind: 'startSeason',
      seasonNumber: 3
    });
  });
});

describe('roundBeforeNextGame', () => {
  it('sólo cuenta en liga regular, con banquillo y si el partido llega después', () => {
    const base = context();
    expect(roundBeforeNextGame(base)).toBeNull();
    expect(roundBeforeNextGame({ ...base, nextGame: null })).toEqual(base.season!.nextRound);
    expect(
      roundBeforeNextGame({ ...base, nextGame: { gameId: 'g', scheduledOn: 9 * DAY } })
    ).toEqual(base.season!.nextRound);
    expect(roundBeforeNextGame({ ...base, nextGame: null, unemployed: true })).toBeNull();
    expect(
      roundBeforeNextGame({
        ...base,
        nextGame: null,
        season: { ...base.season!, stage: 'playoffs' }
      })
    ).toBeNull();
  });
});

describe('textos y claves', () => {
  it('sólo repiten llamadas los avances de calendario, y sólo en ellos hay «Avanzar día»', () => {
    expect(isRepeating({ kind: 'wait' })).toBe(false);
    expect(isRepeating({ kind: 'startSeason', seasonNumber: 2 })).toBe(false);
    expect(canAdvanceDay({ kind: 'advance', reason: 'eliminated' })).toBe(true);
    expect(canAdvanceDay({ kind: 'none', reason: 'dismissed' })).toBe(false);
  });

  it('la clave cambia cuando cambia lo que toca', () => {
    expect(continueKey({ kind: 'playGame', gameId: 'a' })).not.toBe(
      continueKey({ kind: 'playGame', gameId: 'b' })
    );
    expect(continueKey({ kind: 'advance', reason: 'eliminated' })).not.toBe(
      continueKey({ kind: 'advance', reason: 'pendingLeagues' })
    );
    expect(continueKey({ kind: 'playRound', round: 4 })).toBe('playRound:4');
    expect(continueKey({ kind: 'startSeason', seasonNumber: 3 })).toBe('startSeason:3');
    expect(continueKey({ kind: 'wait' })).toBe('wait');
    expect(continueKey({ kind: 'none', reason: 'noGame' })).toBe('none:noGame');
  });

  it('dice qué va a pasar', () => {
    expect(continueDetail({ kind: 'playGame', gameId: 'g' }, 'Rival')).toBe('Partido contra Rival');
    expect(continueDetail({ kind: 'playGame', gameId: 'g' }, null)).toBe('Ir al partido');
    expect(continueDetail({ kind: 'playRound', round: 7 }, null)).toBe('Jornada 7 · descansas');
    expect(continueDetail({ kind: 'wait' }, null)).toBe('Esperar un mes');
    expect(continueDetail({ kind: 'advance', reason: 'pendingLeagues' }, null)).toBe(
      'Terminar las otras ligas'
    );
    expect(continueDetail({ kind: 'advance', reason: 'eliminated' }, null)).toBe(
      'Seguir la temporada'
    );
    expect(continueDetail({ kind: 'startSeason', seasonNumber: 3 }, null)).toBe(
      'Empezar temporada 3'
    );
    expect(continueDetail({ kind: 'none', reason: 'dismissed' }, null)).toBe('Destituido');
    expect(continueDetail({ kind: 'none', reason: 'unemployed' }, null)).toBe('Sin equipo');
    expect(continueDetail({ kind: 'none', reason: 'noGame' }, null)).toBe('');
  });

  it('el aviso de avance dice qué se simula', () => {
    expect(progressText('playGame', 'Rival')).toContain('Rival');
    expect(progressText('playGame', null)).toBe('Simulando hasta tu partido…');
    expect(progressText('wait', null)).toBe('Pasa el mes…');
    expect(progressText('waitMonth', null)).toBe('Pasa el mes…');
    for (const kind of ['playRound', 'advance', 'startSeason', 'day'] as const) {
      expect(progressText(kind, null)).not.toBe('');
    }
    expect(progressText('none', null)).toBe('');
  });
});

describe('rivalOf', () => {
  const game = {
    homeTeamId: 'club-a',
    homeTeamName: 'Club A',
    awayTeamId: 'seleccion-esp',
    awayTeamName: 'España'
  };

  it('es el otro equipo, juegue el club en casa o fuera', () => {
    expect(rivalOf(game, 'club-a', null)).toEqual({ teamId: 'seleccion-esp', teamName: 'España' });
    expect(rivalOf(game, 'x', 'España')).toEqual({ teamId: 'club-a', teamName: 'Club A' });
  });

  it('sin ninguno de los dos es nadie', () => {
    expect(rivalOf(game, 'x', null)).toBeNull();
  });
});
