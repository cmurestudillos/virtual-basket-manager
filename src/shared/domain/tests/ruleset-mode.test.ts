import { describe, expect, it } from 'vitest';
import { RULESETS } from '../rulesets';
import {
  DEFAULT_RULESET_MODE,
  RULESET_MODES,
  RULESET_MODE_HINTS,
  RULESET_MODE_LABELS,
  isRulesetMode,
  rulesetFor
} from '../ruleset-mode';

/** Con qué reglamento nacen las partidas nuevas. */

describe('modo de reglamento', () => {
  it('como en la realidad, cada liga conserva el suyo', () => {
    expect(rulesetFor('real', 'fiba')).toBe('fiba');
    expect(rulesetFor('real', 'nba')).toBe('nba');
  });

  it('los otros dos modos unifican el mundo entero', () => {
    expect(rulesetFor('fiba', 'nba')).toBe('fiba');
    expect(rulesetFor('nba', 'fiba')).toBe('nba');
  });

  it('un reglamento desconocido en el dataset se juega como FIBA', () => {
    expect(rulesetFor('real', 'inventado')).toBe('fiba');
  });

  it('todo lo que devuelve es un reglamento que el motor conoce', () => {
    for (const mode of RULESET_MODES) {
      for (const original of ['fiba', 'nba', 'otro']) {
        expect(RULESETS[rulesetFor(mode, original)]).toBeDefined();
      }
    }
  });

  it('se reconoce lo válido y lo que no', () => {
    expect(isRulesetMode(DEFAULT_RULESET_MODE)).toBe(true);
    expect(isRulesetMode('ncaa')).toBe(false);
    expect(isRulesetMode(null)).toBe(false);
  });

  it('cada modo tiene su nombre y su explicación', () => {
    for (const mode of RULESET_MODES) {
      expect(RULESET_MODE_LABELS[mode].length).toBeGreaterThan(0);
      expect(RULESET_MODE_HINTS[mode].length).toBeGreaterThan(0);
    }
  });
});
