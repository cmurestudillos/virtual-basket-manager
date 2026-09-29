import { describe, expect, it } from 'vitest';
import {
  CELEBRATION_ORDER,
  TROPHY_DESIGN,
  TROPHY_KINDS,
  celebrationHeadline,
  countsAsTitle,
  trophyKindOf
} from '../trophies';

describe('trophyKindOf', () => {
  it('la liga de primera y la de segunda levantan la misma copa, en oro y en bronce', () => {
    const top = trophyKindOf({ format: 'league', tier: 1, nbaFormat: false });
    const lower = trophyKindOf({ format: 'league', tier: 2, nbaFormat: false });

    expect(top).toBe('league_top');
    expect(lower).toBe('league_lower');
    expect(TROPHY_DESIGN[top!].shape).toBe(TROPHY_DESIGN[lower!].shape);
    expect(TROPHY_DESIGN[top!].metal).toBe('gold');
    expect(TROPHY_DESIGN[lower!].metal).toBe('bronze');
  });

  it('el campeón de la liga americana levanta su cáliz, no la copa de liga', () => {
    const kind = trophyKindOf({ format: 'league', tier: 1, nbaFormat: true });
    expect(kind).toBe('nba_champion');
    expect(TROPHY_DESIGN[kind!]).toEqual({ shape: 'chalice', metal: 'gold' });
  });

  it('las continentales son la misma boca abierta: platino, plata y bronce por nivel', () => {
    const metals = [1, 2, 3].map(
      (tier) => TROPHY_DESIGN[trophyKindOf({ format: 'continental', tier, nbaFormat: false })!]
    );
    expect(metals.map((design) => design.shape)).toEqual(['wide_cup', 'wide_cup', 'wide_cup']);
    expect(metals.map((design) => design.metal)).toEqual(['platinum', 'silver', 'bronze']);
  });

  it('la copa nacional es plata y el Mundial, la esfera de oro', () => {
    expect(TROPHY_DESIGN[trophyKindOf({ format: 'cup', tier: 1, nbaFormat: false })!]).toEqual({
      shape: 'low_cup',
      metal: 'silver'
    });
    expect(
      TROPHY_DESIGN[trophyKindOf({ format: 'national-tournament', tier: 1, nbaFormat: false })!]
    ).toEqual({ shape: 'globe', metal: 'gold' });
  });

  it('la clasificación para el Mundial no se levanta', () => {
    expect(trophyKindOf({ format: 'national-qualifiers', tier: 1, nbaFormat: false })).toBeNull();
  });
});

describe('diseño de la vitrina', () => {
  it('cada tipo de título tiene su copa', () => {
    for (const kind of TROPHY_KINDS) {
      expect(TROPHY_DESIGN[kind], kind).toBeDefined();
    }
  });

  it('el ascenso y los premios no cuentan como títulos', () => {
    expect(countsAsTitle('promotion')).toBe(false);
    expect(countsAsTitle('award')).toBe(false);
    expect(countsAsTitle('league_lower')).toBe(true);
  });

  it('la gala sale siempre después del título y del ascenso', () => {
    expect(CELEBRATION_ORDER.title).toBeLessThan(CELEBRATION_ORDER.promotion);
    expect(CELEBRATION_ORDER.promotion).toBeLessThan(CELEBRATION_ORDER.season_gala);
  });

  it('los titulares hablan del título que se ha ganado', () => {
    expect(celebrationHeadline('title', 'Copa Nacional', 'national_cup')).toBe(
      '¡Campeones de Copa Nacional!'
    );
    expect(celebrationHeadline('title', 'Mundial', 'world_cup')).toBe('¡Campeones del mundo!');
    expect(celebrationHeadline('promotion', 'Liga Nacional', 'promotion')).toBe(
      '¡Ascenso a Liga Nacional!'
    );
  });
});
