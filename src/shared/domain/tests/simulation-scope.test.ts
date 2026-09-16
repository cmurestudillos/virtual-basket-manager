import { describe, expect, it } from 'vitest';
import {
  COUNTRY_NAMES,
  countryName,
  CUP_GAMES,
  estimateContinentalGames,
  estimateCountryGames,
  estimateLeagueGames,
  estimateSeconds,
  formatEstimate,
  parseActiveCountries,
  resolveActiveCountries
} from '../simulation-scope';

/** Qué parte del mundo se juega, y cuánto cuesta. */

describe('países que se juegan', () => {
  it('el del club dirigido entra siempre, aunque no se haya elegido', () => {
    expect(resolveActiveCountries(['GER', 'GRE'], 'ESP')).toEqual(['ESP', 'GER', 'GRE']);
  });

  it('sin elección guardada se juega sólo el país del club, como antes de poder elegir', () => {
    expect(resolveActiveCountries(null, 'ESP')).toEqual(['ESP']);
  });

  it('no repite países', () => {
    expect(resolveActiveCountries(['ESP', 'ESP', 'GER'], 'ESP')).toEqual(['ESP', 'GER']);
  });

  it('la elección guardada se lee con cuidado: lo que no es una lista cuenta como sin elegir', () => {
    expect(parseActiveCountries('["ESP","GRE"]')).toEqual(['ESP', 'GRE']);
    expect(parseActiveCountries(null)).toBeNull();
    expect(parseActiveCountries('no es json')).toBeNull();
    expect(parseActiveCountries('{"ESP":true}')).toBeNull();
  });

  it('cada país de liga tiene su nombre, y un código desconocido se deja tal cual', () => {
    expect(countryName('ABA')).toBe('Adriática');
    expect(countryName('XYZ')).toBe('XYZ');
    expect(Object.keys(COUNTRY_NAMES)).toHaveLength(14);
  });
});

describe('coste de una liga', () => {
  it('dieciocho equipos a ida y vuelta son 306 partidos de fase regular', () => {
    expect(estimateLeagueGames({ teams: 18, playoffTeams: 0, playoffSeriesLength: 5 })).toBe(306);
  });

  it('los playoffs suman, pero menos que su máximo: las series rara vez se juegan enteras', () => {
    const sinPlayoffs = estimateLeagueGames({ teams: 18, playoffTeams: 0, playoffSeriesLength: 5 });
    const conPlayoffs = estimateLeagueGames({ teams: 18, playoffTeams: 8, playoffSeriesLength: 5 });
    // Cuartos al mejor de 3, semis y final al mejor de 5: 4·3 + 2·5 + 1·5 = 27 como máximo.
    expect(conPlayoffs - sinPlayoffs).toBeGreaterThan(0);
    expect(conPlayoffs - sinPlayoffs).toBeLessThan(27);
  });

  it('una liga de treinta juega una sola vuelta', () => {
    expect(estimateLeagueGames({ teams: 30, playoffTeams: 0, playoffSeriesLength: 7 })).toBe(
      15 * 29
    );
  });

  it('un país suma sus divisiones y su copa', () => {
    const primera = { teams: 18, playoffTeams: 8, playoffSeriesLength: 5 };
    const segunda = { teams: 18, playoffTeams: 0, playoffSeriesLength: 1 };
    expect(estimateCountryGames([primera, segunda], true)).toBe(
      estimateLeagueGames(primera) + estimateLeagueGames(segunda) + CUP_GAMES
    );
    expect(estimateCountryGames([primera], false)).toBe(estimateLeagueGames(primera));
  });

  it('una continental son sus 120 partidos de liga y un puñado de eliminatoria', () => {
    expect(estimateContinentalGames()).toBeGreaterThan(120);
    expect(estimateContinentalGames()).toBeLessThan(140);
  });

  it('el tiempo crece con los partidos y se lee como en una pantalla de opciones', () => {
    expect(estimateSeconds(1000)).toBeGreaterThan(estimateSeconds(300));
    expect(formatEstimate(40)).toBe('40 s');
    expect(formatEstimate(600)).toBe('10 min');
  });
});
