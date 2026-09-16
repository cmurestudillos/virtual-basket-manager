/**
 * Con qué reglamento nacen las partidas nuevas.
 *
 * Cada competición del mundo trae el suyo —FIBA en Europa, Sudamérica y
 * Oceanía; NBA en las dos ligas de Estados Unidos—, y eso es lo que se juega
 * «como en la realidad». Los otros dos modos lo unifican: todo el mundo con
 * cuartos de diez minutos y cinco faltas, o todo con cuartos de doce y seis.
 *
 * Es un ajuste de las partidas nuevas y no de la que está en marcha: cambiar la
 * duración de los cuartos a mitad de temporada dejaría estadísticas de dos
 * reglamentos mezcladas en la misma tabla.
 */

import type { RulesetId } from './rulesets';

export const RULESET_MODES = ['real', 'fiba', 'nba'] as const;
export type RulesetMode = (typeof RULESET_MODES)[number];

export const DEFAULT_RULESET_MODE: RulesetMode = 'real';

export const RULESET_MODE_LABELS: Record<RulesetMode, string> = {
  real: 'Como en la realidad',
  fiba: 'FIBA en todas las ligas',
  nba: 'NBA en todas las ligas'
};

export const RULESET_MODE_HINTS: Record<RulesetMode, string> = {
  real: 'FIBA en Europa, Sudamérica y Oceanía; NBA en Estados Unidos.',
  fiba: 'Cuartos de 10 minutos y eliminación con 5 faltas en todo el mundo.',
  nba: 'Cuartos de 12 minutos y eliminación con 6 faltas en todo el mundo.'
};

export function isRulesetMode(value: string | null | undefined): value is RulesetMode {
  return (RULESET_MODES as readonly string[]).includes(value ?? '');
}

/** El reglamento que juega una competición bajo este modo. */
export function rulesetFor(mode: RulesetMode, original: string): RulesetId {
  if (mode === 'fiba' || mode === 'nba') {
    return mode;
  }
  return original === 'nba' ? 'nba' : 'fiba';
}
