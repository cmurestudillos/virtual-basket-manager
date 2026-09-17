import { flightDataOf, findObjects, type JsonObject } from '../lib/next-flight';
import type { SourceStats } from '../lib/source-types';

/**
 * Lectura de las páginas de acb.com. Sólo parseo, sin red: `acb.ts` descarga y
 * decide. Los datos salen del payload de React incrustado en el HTML (ver
 * `next-flight.ts`); aquí se buscan por la forma de los objetos (un jugador de
 * plantilla es lo que tiene `player` y `nationalityCountry`), no por su
 * posición en el árbol, que cambia con cualquier retoque de la web.
 */

/** React escribe `"$undefined"` donde no hay valor. */
function str(object: JsonObject | undefined, key: string): string | null {
  const value = object?.[key];
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value !== '$undefined' && value.trim() !== ''
    ? value.trim()
    : null;
}

function num(object: JsonObject | undefined, key: string): number | null {
  const value = object?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

function obj(object: JsonObject | undefined, key: string): JsonObject | undefined {
  const value = object?.[key];
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

export interface AcbPlayerRef {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  shirtNumber: string | null;
  gameRole: string | null;
  editionId: number | null;
}

function playerRef(player: JsonObject | undefined): AcbPlayerRef | null {
  const id = str(player, 'id');
  if (!player || !id) return null;
  return {
    id,
    firstName: str(player, 'firstName') ?? '',
    lastName: str(player, 'lastName') ?? '',
    nickname: str(player, 'nickname'),
    shirtNumber: str(player, 'shirtNumber'),
    gameRole: str(player, 'gameRole'),
    editionId: num(player, 'editionId')
  };
}

export interface AcbStanding {
  position: number;
  clubId: string;
  teamId: string;
  fullName: string;
  abbreviatedName: string | null;
  matchesPlayed: number | null;
}

export interface AcbStandings {
  season: number | null;
  totalRounds: number | null;
  standings: AcbStanding[];
}

export function parseStandings(html: string): AcbStandings {
  const data = findObjects(
    flightDataOf(html),
    (o) => 'standings' in o && 'selectedFilters' in o
  )[0];
  const rows = Array.isArray(data?.standings) ? (data.standings as JsonObject[]) : [];
  const standings: AcbStanding[] = [];
  for (const row of rows) {
    const team = obj(row, 'team');
    const position = num(row, 'position');
    const clubId = str(team, 'clubId');
    if (position === null || !clubId) continue;
    standings.push({
      position,
      clubId,
      teamId: str(team, 'id') ?? '',
      fullName: str(team, 'fullName') ?? '',
      abbreviatedName: str(team, 'abbreviatedName'),
      matchesPlayed: num(row, 'matchesPlayed')
    });
  }
  return {
    season: num(obj(data, 'selectedFilters'), 'season'),
    totalRounds: num(data, 'totalRounds'),
    standings
  };
}

/** El slug canónico de la página («valencia-basket-13»), del `<link rel="canonical">`. */
export function canonicalTeamSlug(html: string): string | null {
  return (
    /<link rel="canonical" href="https?:\/\/[^"]*\/equipos\/([a-z0-9-]+)"/i.exec(html)?.[1] ?? null
  );
}

export interface AcbTeamInfo {
  editionId: number | null;
  clubId: string | null;
  fullName: string | null;
  abbreviatedName: string | null;
  stadiumName: string | null;
  stadiumAddress: string | null;
  stadiumCapacity: number | null;
}

export function parseTeamInfo(html: string): AcbTeamInfo | null {
  const data = findObjects(flightDataOf(html), (o) => 'stadiumName' in o && 'team' in o)[0];
  if (!data) return null;
  const team = obj(data, 'team');
  return {
    editionId: num(team, 'editionId'),
    clubId: str(team, 'clubId'),
    fullName: str(team, 'fullName'),
    abbreviatedName: str(team, 'abbreviatedName'),
    stadiumName: str(data, 'stadiumName'),
    stadiumAddress: str(data, 'stadiumAddress'),
    stadiumCapacity: num(data, 'stadiumCapacity')
  };
}

export interface AcbRosterEntry {
  player: AcbPlayerRef;
  licensing: string | null;
  age: number | null;
  nationalityCountry: string | null;
  heightCm: number | null;
}

/** La plantilla: los jugadores (los técnicos llevan `coach` y no `player`). */
export function parseRoster(html: string): AcbRosterEntry[] {
  const entries: AcbRosterEntry[] = [];
  for (const row of findObjects(
    flightDataOf(html),
    (o) => 'player' in o && 'nationalityCountry' in o
  )) {
    const player = playerRef(obj(row, 'player'));
    if (!player) continue;
    entries.push({
      player,
      licensing: str(row, 'licensing'),
      age: num(row, 'age'),
      nationalityCountry: str(row, 'nationalityCountry'),
      heightCm: num(row, 'height')
    });
  }
  return entries;
}

export interface AcbPhase {
  id: string;
  abbreviation: string;
  description: string;
}

export interface AcbStatsEntry {
  player: AcbPlayerRef;
  totals: JsonObject;
}

export interface AcbTeamStats {
  phases: AcbPhase[];
  players: AcbStatsEntry[];
}

export function parseTeamStats(html: string): AcbTeamStats {
  const data = flightDataOf(html);
  const phases: AcbPhase[] = [];
  for (const filters of findObjects(data, (o) => Array.isArray(o.phases))) {
    for (const phase of filters.phases as JsonObject[]) {
      const id = str(phase, 'id');
      // La misma lista sale en varios sitios de la página: sin repetir.
      if (id && !phases.some((known) => known.id === id)) {
        phases.push({
          id,
          abbreviation: str(phase, 'abreviation') ?? str(phase, 'abbreviation') ?? '',
          description: str(phase, 'description') ?? ''
        });
      }
    }
  }
  const players: AcbStatsEntry[] = [];
  for (const row of findObjects(data, (o) => 'player' in o && 'totals' in o)) {
    const player = playerRef(obj(row, 'player'));
    const totals = obj(row, 'totals');
    if (player && totals && !players.some((known) => known.player.id === player.id)) {
      players.push({ player, totals });
    }
  }
  return { phases, players };
}

/** Los totales de acb.com en el formato común. */
export function toSourceStats(totals: JsonObject): SourceStats {
  const n = (key: string) => num(totals, key) ?? 0;
  return {
    games: n('numGames'),
    starts: num(totals, 'starter'),
    seconds: n('timePlayed'),
    points: n('points'),
    twoPointMade: n('twoPointersMade'),
    twoPointAttempted: n('twoPointersAttempted'),
    threePointMade: n('threePointersMade'),
    threePointAttempted: n('threePointersAttempted'),
    freeThrowMade: n('freeThrowsMade'),
    freeThrowAttempted: n('freeThrowsAttempted'),
    offensiveRebounds: n('offensiveRebounds'),
    defensiveRebounds: n('defensiveRebounds'),
    assists: n('assists'),
    steals: n('steals'),
    turnovers: n('turnovers'),
    blocks: n('blocks'),
    blocksReceived: num(totals, 'shotsRejected'),
    dunks: num(totals, 'dunks'),
    fouls: n('personalFouls'),
    foulsDrawn: num(totals, 'foulsReceived'),
    rating: num(totals, 'rating')
  };
}

export interface AcbPlayerProfile {
  player: AcbPlayerRef | null;
  /** «15-10-1997». */
  birthDate: string | null;
  birthPlace: string | null;
  nationality: string | null;
  /** En metros y con coma: «1,75». */
  height: string | null;
  licensing: string | null;
}

export function parsePlayerProfile(html: string): AcbPlayerProfile | null {
  const data = findObjects(flightDataOf(html), (o) => 'birthDate' in o && 'player' in o)[0];
  if (!data) return null;
  return {
    player: playerRef(obj(data, 'player')),
    birthDate: str(data, 'birthDate'),
    birthPlace: str(data, 'birthPlace'),
    nationality: str(data, 'nationality'),
    height: str(data, 'height'),
    licensing: str(data, 'licensing')
  };
}

/** Los enlaces a fichas de jugador de una página: id → slug completo («timoti-shorts-30005376»). */
export function playerSlugs(html: string): Map<string, string> {
  const slugs = new Map<string, string>();
  for (const match of html.matchAll(/\/jugadores\/([a-z0-9-]+-(\d+))/g)) {
    if (!slugs.has(match[2] ?? '')) slugs.set(match[2] ?? '', match[1] ?? '');
  }
  return slugs;
}

/**
 * La ciudad de una dirección de acb.com, si la lleva («…, 46013 València»).
 * La mayoría de clubes sólo publican calle y número, sin ciudad.
 */
export function cityFromAcbAddress(address: string | null): string | null {
  if (!address) return null;
  const match = /\b\d{5}\s+([A-Za-zÀ-ÿ' .-]+?)\s*(?:[(,]|$)/.exec(address);
  return match?.[1]?.trim() || null;
}
