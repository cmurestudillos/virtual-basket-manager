import { describe, expect, it } from 'vitest';
import { COMPETITION_KINDS, COMPETITION_KIND_LABEL, competitionKind } from '../competition-kind';
import { nationalTeamId } from '../national-teams';

/** Un color por tipo de competición: el mismo partido, del mismo color en todo el juego. */

describe('competitionKind', () => {
  it('traduce el formato de la competición', () => {
    expect(competitionKind({ format: 'league' })).toBe('league');
    expect(competitionKind({ format: 'cup' })).toBe('cup');
    expect(competitionKind({ format: 'continental' })).toBe('continental');
  });

  it('una liga con eliminatoria son los playoffs', () => {
    expect(competitionKind({ format: 'league', seriesId: 'liga-nacional-r1-s0' })).toBe('playoffs');
    expect(competitionKind({ format: 'league', seriesId: null })).toBe('league');
  });

  it('Europa sigue siendo Europa en sus eliminatorias', () => {
    expect(competitionKind({ format: 'continental', seriesId: 'euro-c5-s0' })).toBe('continental');
  });

  it('las selecciones, por formato o por sus equipos', () => {
    expect(competitionKind({ format: 'national' })).toBe('national');
    expect(competitionKind({ format: 'national-qualifiers' })).toBe('national');
    expect(competitionKind({ format: 'national-tournament', seriesId: 'x' })).toBe('national');
    expect(competitionKind({ format: null, nationOf: 'ESP' })).toBe('national');
    expect(competitionKind({ format: undefined, teamId: nationalTeamId('GRE') })).toBe('national');
    expect(competitionKind({ format: 'league', teamId: 'real-madrid' })).toBe('league');
  });

  it('un formato que no se conoce se pinta como liga', () => {
    expect(competitionKind({ format: 'amistoso' })).toBe('league');
    expect(competitionKind({ format: null })).toBe('league');
  });

  it('cada tipo tiene su nombre para la leyenda', () => {
    expect(COMPETITION_KINDS).toHaveLength(5);
    for (const kind of COMPETITION_KINDS) {
      expect(COMPETITION_KIND_LABEL[kind]).toBeTruthy();
    }
  });
});
