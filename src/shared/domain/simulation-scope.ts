/**
 * Qué parte del mundo se juega en una partida.
 *
 * El mundo tiene veintiuna ligas en catorce países, pero simularlas todas cada
 * temporada cuesta tiempo de espera real. Por eso se elige al crear la partida
 * qué países se juegan —con su calendario, sus playoffs, sus ascensos y su
 * copa— y el resto del mundo sigue existiendo: sus clubes fichan, entran en las
 * competiciones continentales y se pueden ver, pero su liga no se disputa.
 *
 * La unidad es el **país**, no la liga: las divisiones de un país están atadas
 * por los ascensos, y jugar la segunda sin la primera no tendría de dónde subir.
 * El país del club dirigido se juega siempre.
 *
 * Funciones puras: ni base de datos ni azar.
 */

import {
  CONTINENTAL_GROUP_ROUNDS,
  CONTINENTAL_PLAYOFF_TEAMS,
  CONTINENTAL_SERIES_LENGTH,
  CONTINENTAL_TEAMS
} from './continental';
import { CUP_TEAMS } from './cup';
import { buildPlayoffFormat } from './playoffs';
import { MAX_MATCHDAYS, roundRobinLaps } from './schedule';

/**
 * Nombre de cada país de liga. Dos no son países: la liga Adriática reúne
 * clubes de la antigua Yugoslavia y la BNXT, de Bélgica y Países Bajos.
 */
export const COUNTRY_NAMES: Record<string, string> = {
  ESP: 'España',
  TUR: 'Turquía',
  GRE: 'Grecia',
  ITA: 'Italia',
  FRA: 'Francia',
  GER: 'Alemania',
  ISR: 'Israel',
  LTU: 'Lituania',
  ABA: 'Adriática',
  BNL: 'Bélgica y Países Bajos',
  ARG: 'Argentina',
  CHI: 'Chile',
  USA: 'Estados Unidos',
  AUS: 'Australia'
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

/**
 * Coste orientativo de simular un partido, en segundos, incluyendo guardar su
 * acta. Medido en el equipo de desarrollo con una temporada entera como
 * espectador: España sola, 1.041 partidos en 124 s; España y Grecia, 1.431 en
 * 149 s. Es una estimación para comparar opciones, no una promesa: en otro
 * ordenador será otra cifra.
 */
export const ESTIMATED_SECONDS_PER_GAME = 0.11;

/**
 * Los países que se juegan: los elegidos y, siempre, el del club dirigido.
 *
 * Sin elección guardada —partidas creadas antes de poder elegir— se juega sólo
 * el país del club, que es exactamente lo que pasaba en ellas.
 */
export function resolveActiveCountries(
  chosen: readonly string[] | null,
  managedCountry: string | null
): string[] {
  const countries = new Set(chosen ?? []);
  if (managedCountry) {
    countries.add(managedCountry);
  }
  return [...countries].sort();
}

/** Lee la elección guardada en la partida; cualquier cosa rara cuenta como «sin elegir». */
export function parseActiveCountries(stored: string | null): string[] | null {
  if (!stored) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((code) => typeof code === 'string') : null;
  } catch {
    return null;
  }
}

/** Lo que hace falta de una liga para estimar sus partidos. */
export interface LeagueSize {
  teams: number;
  playoffTeams: number;
  playoffSeriesLength: number;
}

/**
 * Partidos de una liga en una temporada: la fase regular que cabe en el
 * calendario y unos playoffs con su duración esperada.
 *
 * Una serie no se juega entera casi nunca —un 3-0 no llega al cuarto—, así que
 * se cuenta con el 80 % de su máximo, que es lo que duran de media.
 */
export function estimateLeagueGames(league: LeagueSize): number {
  if (league.teams < 2) {
    return 0;
  }
  const laps = roundRobinLaps(league.teams, MAX_MATCHDAYS);
  const roundsPerLap = league.teams % 2 === 0 ? league.teams - 1 : league.teams;
  const regular = Math.floor(league.teams / 2) * roundsPerLap * laps;

  if (league.playoffTeams < 2) {
    return regular;
  }
  const playoffs = buildPlayoffFormat(league.playoffTeams, league.playoffSeriesLength).reduce(
    (sum, round) => sum + (round.teams / 2) * round.bestOf * 0.8,
    0
  );
  return regular + Math.round(playoffs);
}

/** Partidos de una copa: ocho equipos a partido único son siete. */
export const CUP_GAMES = CUP_TEAMS - 1;

/**
 * Partidos de una competición continental: la fase de liga a una vuelta, los
 * cuartos al mejor de tres con su duración media y la Final Four.
 */
export function estimateContinentalGames(): number {
  const group = (CONTINENTAL_TEAMS / 2) * CONTINENTAL_GROUP_ROUNDS;
  const quarterfinals = (CONTINENTAL_PLAYOFF_TEAMS / 2) * CONTINENTAL_SERIES_LENGTH * 0.8;
  return group + Math.round(quarterfinals) + 3;
}

/**
 * Partidos de selecciones por temporada, que se juegan siempre: seis jornadas
 * de clasificación por grupo de cuatro y el Mundial de dieciséis.
 */
export function estimateNationalGames(nations: number): number {
  const groups = Math.floor(Math.max(0, nations - 1) / 4);
  if (groups < 2) {
    return 0;
  }
  const qualifiers = groups * 12;
  const worldCup = 4 * 6 + 7;
  return qualifiers + worldCup;
}

/** Partidos que añade un país a cada temporada: sus ligas y, si la tiene, su copa. */
export function estimateCountryGames(leagues: readonly LeagueSize[], hasCup: boolean): number {
  const games = leagues.reduce((sum, league) => sum + estimateLeagueGames(league), 0);
  return games + (hasCup ? CUP_GAMES : 0);
}

/** Segundos orientativos que cuesta simular esos partidos. */
export function estimateSeconds(games: number): number {
  return Math.round(games * ESTIMATED_SECONDS_PER_GAME);
}

/** «40 s», «2 min», «12 min»: el tiempo como se lee en una pantalla de opciones. */
export function formatEstimate(seconds: number): string {
  if (seconds < 90) {
    return `${Math.max(1, Math.round(seconds))} s`;
  }
  return `${Math.round(seconds / 60)} min`;
}
