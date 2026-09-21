import { deflateSync, inflateSync } from 'node:zlib';
import { toNationCode } from '../lib/nationalities';
import type { SourcePosition, SourceStats } from '../lib/source-types';
import { POWER_FORWARD_CM } from './lba-parse';

/**
 * Lectura de las dos fuentes de la liga francesa (LNB). Sólo parseo, sin red:
 * `lnb.ts` descarga y decide.
 *
 * - La API de lnb.fr (`api-prod.lnb.fr`): competiciones, clasificación,
 *   equipos, plantillas, fichas de jugador y cuerpo técnico.
 * - Las actas y el calendario, del widget de Sportradar (Atrium) que la web de
 *   la LNB usa en su «match center»: la API de la LNB sólo da los totales de
 *   los jugadores «cualificados», y el acta partido a partido lo da todo.
 *
 * Los ids de persona y de equipo de Sportradar (UUID) son los `person_id` y
 * `team_id` de la LNB, pero la plantilla sólo trae el id numérico: jugadores
 * y actas se cruzan por nombre dentro del equipo.
 *
 * Cada función recibe el texto tal cual llega y no se fía de ningún campo: lo
 * que falta o no tiene el tipo esperado sale como `null`.
 */

type Json = Record<string, unknown>;

function parse(text: string): Json {
  const value: unknown = JSON.parse(text);
  return value && typeof value === 'object' ? (value as Json) : {};
}

function obj(value: unknown, key: string): Json | null {
  const child = value && typeof value === 'object' ? (value as Json)[key] : undefined;
  return child && typeof child === 'object' && !Array.isArray(child) ? (child as Json) : null;
}

function list(value: unknown, key: string): Json[] {
  const child = value && typeof value === 'object' ? (value as Json)[key] : undefined;
  return Array.isArray(child)
    ? (child.filter((item) => item && typeof item === 'object') as Json[])
    : [];
}

function str(value: Json | null, key: string): string | null {
  const raw = value?.[key];
  if (typeof raw === 'number') return String(raw);
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  return text === '' ? null : text;
}

function num(value: Json | null, key: string): number | null {
  const raw = value?.[key];
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return null;
}

function id(value: Json | null, key: string): string | null {
  const raw = num(value, key);
  return raw === null ? null : String(raw);
}

/** «2002-07-16» o «2002-07-16T00:00:00.000Z» → «2002-07-16». */
function isoDay(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

/** Nombre para cruzar fuentes: sin tildes, mayúsculas, espacios ni signos. */
export function nameKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// API de la LNB
// ---------------------------------------------------------------------------

/** `GET https://lnb.fr/api/token`: el token de la API, que dura quince minutos. */
export function parseToken(text: string): string | null {
  return str(parse(text), 'token');
}

export interface LnbCompetition {
  /** Id numérico de la competición (302), el que piden las rutas. */
  externalId: string;
  divisionId: number | null;
  /** PROA, PROB, «PROA PO»… */
  abbrev: string | null;
  name: string;
  /** UUID de la temporada: con él se piden las actas a Sportradar. */
  seasonId: string | null;
  /** GENERAL en las ligas regulares, FINAL en los playoffs. */
  filter: string | null;
}

/** `GET competition/getDivisionCompetitionByYear?year=…`: las competiciones de un año. */
export function parseCompetitions(text: string): LnbCompetition[] {
  return list(parse(text), 'data').flatMap((row) => {
    const externalId = id(row, 'external_id');
    const name = str(row, 'competition_name');
    if (!externalId || !name) return [];
    return [
      {
        externalId,
        divisionId: num(row, 'division_external_id'),
        abbrev: str(row, 'competition_abbrev'),
        name,
        seasonId: str(row, 'season_id'),
        filter: str(row, 'competition_filter_value')
      }
    ];
  });
}

/**
 * La liga regular de una división: la competición de esa división cuyo filtro
 * es GENERAL y cuya abreviatura es la de la liga (PROA, PROB) sin sufijo de
 * fase («PROA PO», «PROA PIN»).
 */
export function regularSeasonOf(
  competitions: readonly LnbCompetition[],
  abbrev: string
): LnbCompetition | null {
  return (
    competitions.find(
      (competition) => competition.abbrev === abbrev && competition.filter === 'GENERAL'
    ) ?? null
  );
}

export interface LnbStanding {
  rank: number;
  teamId: string;
  /** UUID del equipo, el mismo que usa Sportradar. */
  teamUuid: string | null;
  name: string;
  code: string | null;
  games: number | null;
  wins: number | null;
  losses: number | null;
  /** Victorias quitadas por sanción. */
  penalty: number;
  penaltyNote: string | null;
}

/**
 * `POST altrstats/getStandingByCompetition`: la clasificación oficial, con las
 * sanciones ya aplicadas (las victorias quitadas no están en `s_wins`).
 */
export function parseStandings(text: string): LnbStanding[] {
  return list(parse(text), 'data')
    .flatMap((pool) => list(pool, 'data'))
    .flatMap((row) => {
      const team = obj(row, 'team');
      const teamId = id(team, 'external_id');
      const name = str(team, 'team_name');
      const rank = num(row, 'rank');
      if (!teamId || !name || rank === null) return [];
      return [
        {
          rank,
          teamId,
          teamUuid: str(team, 'team_id'),
          name,
          code: str(team, 'team_code'),
          games: num(row, 's_games'),
          wins: num(row, 's_wins'),
          losses: num(row, 's_losses'),
          penalty: num(row, 'penalty') ?? 0,
          penaltyNote: str(row, 'penalty_note')
        }
      ];
    })
    .sort((a, b) => a.rank - b.rank);
}

export interface LnbRosterPlayer {
  personId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  heightCm: number | null;
  /** Código COI (`FRA`, `USA`). */
  nationality: string | null;
  /** «1/2 - Meneur/Arrière». */
  position: string | null;
  shirtNumber: string | null;
}

/**
 * `GET teams/getRoster?team_external_id=…`: todos los que pasaron por el
 * equipo esa temporada, también los que se fueron a mitad.
 */
export function parseRoster(text: string): LnbRosterPlayer[] {
  return list(parse(text), 'data').flatMap((row) => {
    const person = obj(row, 'person');
    const role = obj(row, 'player_role');
    const personId = id(person, 'external_id');
    const lastName = str(person, 'family_name');
    if (!personId || !lastName) return [];
    return [
      {
        personId,
        firstName: str(person, 'first_name') ?? '',
        lastName,
        birthDate: isoDay(str(person, 'dob')),
        heightCm: num(person, 'height'),
        nationality: str(person, 'nationality_code_ioc'),
        position: str(role, 'playing_position'),
        shirtNumber: str(role, 'shirt_number')
      }
    ];
  });
}

export interface LnbPersonDetail {
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  nationality: string | null;
  position: string | null;
  shirtNumber: string | null;
  /** Alta y baja en el club (`AAAA-MM-DD`). */
  fromDate: string | null;
  toDate: string | null;
}

/** `POST person/getPersonDetail`: la ficha del jugador en ese equipo; `null` si viene vacía. */
export function parsePersonDetail(text: string): LnbPersonDetail | null {
  const data = obj(parse(text), 'data');
  const person = obj(data, 'person');
  if (!data || !person) return null;
  const positive = (value: number | null): number | null =>
    value !== null && value > 0 ? value : null;
  return {
    birthDate: isoDay(str(person, 'dob')),
    heightCm: positive(num(data, 'height')),
    weightKg: positive(num(data, 'weight')),
    nationality: str(data, 'nationality_code_ioc'),
    position: str(data, 'playing_position'),
    shirtNumber: str(data, 'shirt_number'),
    fromDate: isoDay(str(data, 'from_date')),
    toDate: isoDay(str(data, 'to_date'))
  };
}

/**
 * ¿Se fue del club antes de terminar la liga regular? Sólo si la baja es una
 * fecha con sentido: posterior al alta y anterior al fin de la liga. La LNB
 * pone a veces bajas anteriores al alta (`2025-06-30` a quien llegó en
 * diciembre), y eso no dice nada.
 */
export function leftBefore(detail: LnbPersonDetail | null, seasonEnd: string): boolean {
  if (!detail?.toDate) return false;
  if (detail.fromDate && detail.toDate < detail.fromDate) return false;
  return detail.toDate < seasonEnd;
}

export interface LnbStaffCoach {
  /** Id del cargo (uno por persona y club). */
  roleId: string;
  personId: string;
  firstName: string;
  lastName: string;
  fromDate: string | null;
  toDate: string | null;
}

/**
 * `POST altrstats/getCoachingStaff`: los primeros entrenadores (`HEAD_COACH`)
 * que ha tenido el club, del primero al último por fecha de alta (a igual
 * fecha, por orden de alta en la base de datos, que es el del cargo). Las
 * fechas no siempre son de fiar: hay destituidos que siguen «hasta el 30 de
 * junio» y sustitutos que no están.
 */
export function parseHeadCoaches(text: string): LnbStaffCoach[] {
  return list(parse(text), 'data')
    .filter((row) => str(row, 'role_type') === 'HEAD_COACH')
    .flatMap((row) => {
      const person = obj(row, 'person');
      const roleId = id(row, 'external_id');
      const personId = id(row, 'person_external_id') ?? id(person, 'external_id');
      const lastName = str(person, 'family_name');
      if (!roleId || !personId || !lastName) return [];
      return [
        {
          roleId,
          personId,
          firstName: str(person, 'first_name') ?? '',
          lastName,
          fromDate: isoDay(str(row, 'from_date')),
          toDate: isoDay(str(row, 'to_date'))
        }
      ];
    })
    .sort(
      (a, b) =>
        (a.fromDate ?? '').localeCompare(b.fromDate ?? '') || Number(a.roleId) - Number(b.roleId)
    );
}

/**
 * `GET match/getMatchDetails/<uuid>`: el pabellón del partido como lo escribe
 * la LNB, «Adidas Arena (Paris)», partido en pabellón y ciudad.
 */
export function parseMatchVenue(text: string): { pavilion: string | null; city: string | null } {
  return splitVenue(str(obj(parse(text), 'data'), 'venue_name'));
}

export function splitVenue(raw: string | null): { pavilion: string | null; city: string | null } {
  if (!raw) return { pavilion: null, city: null };
  const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(raw);
  if (!match) return { pavilion: raw, city: null };
  return { pavilion: match[1]?.trim() || null, city: match[2]?.trim() || null };
}

/**
 * Los puestos de la LNB («1 - Meneur», «2/3 - Arrière/Ailier») en
 * PG/SG/SF/PF/C. Con dos puestos cuenta **el primero**, que es el principal:
 * «1/2» es base, «2/3» escolta y «4/5» ala-pívot. «3/4» (alero o ala-pívot)
 * se separa por altura como el «Ala» de la LBA: desde `POWER_FORWARD_CM`,
 * ala-pívot. Vacío o sin número: `null` (el montaje lo deduce por la altura).
 */
const LNB_POSITIONS: readonly SourcePosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function toLnbPosition(
  raw: string | null | undefined,
  heightCm: number | null | undefined = null
): SourcePosition | null {
  const match = /^\s*([1-5])(?:\s*\/\s*([1-5]))?/.exec(raw ?? '');
  if (!match) return null;
  if (match[1] === '3' && match[2] === '4') {
    return (heightCm ?? 0) >= POWER_FORWARD_CM ? 'PF' : 'SF';
  }
  return LNB_POSITIONS[Number(match[1]) - 1] ?? null;
}

/**
 * La nacionalidad de un entrenador a partir de su lugar de nacimiento, como
 * se escribe en el fichero a mano: «Ciudad (País)» → ese país; un país solo
 * («Grèce», «Grecia») → ese país; y una ciudad sin país es francesa. `null`
 * si viene vacío o el país no se reconoce.
 */
export function nationFromFrenchPlace(place: string | null | undefined): string | null {
  if (!place || place.trim() === '') return null;
  const inside = /\(([^()]+)\)\s*$/.exec(place)?.[1]?.trim();
  if (inside) return toNationCode(inside);
  return toNationCode(place) ?? 'FRA';
}

// ---------------------------------------------------------------------------
// Sportradar (widget del match center)
// ---------------------------------------------------------------------------

/**
 * El estado de las páginas del widget: el JSON de la temporada comprimido con
 * zlib y en base64 de URL, que es lo que la web lleva en `~w=…`.
 */
export function widgetState(seasonId: string, locale = 'fr-FR'): string {
  return deflateSync(Buffer.from(JSON.stringify({ s: seasonId, l: locale })))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Lo contrario de {@link widgetState}: `null` si no es un estado válido. */
export function decodeWidgetState(state: string): Json | null {
  try {
    const text = inflateSync(
      Buffer.from(state.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    ).toString('utf8');
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' ? (value as Json) : null;
  } catch {
    return null;
  }
}

export interface SrFixture {
  fixtureId: string;
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
  /** Tanteo oficial; un partido dado por ganado sale 0-0. */
  homeScore: number | null;
  awayScore: number | null;
  /** Hora local, `AAAA-MM-DDTHH:MM:SS`. */
  start: string | null;
  venue: string | null;
  /** CONFIRMED cuando está terminado y validado. */
  status: string | null;
}

/** `fixtures?state=…`: los partidos de la temporada (de una liga regular, si el estado es el suyo). */
export function parseFixtures(text: string): SrFixture[] {
  return list(obj(parse(text), 'data'), 'fixtures').flatMap((row) => {
    const fixtureId = str(row, 'fixtureId');
    const competitors = list(row, 'competitors');
    const home = competitors.find((entry) => entry.isHome === true);
    const away = competitors.find((entry) => entry.isHome !== true);
    const homeId = str(home ?? null, 'entityId');
    const awayId = str(away ?? null, 'entityId');
    if (!fixtureId || !homeId || !awayId) return [];
    return [
      {
        fixtureId,
        homeId,
        homeName: str(home ?? null, 'name') ?? '',
        awayId,
        awayName: str(away ?? null, 'name') ?? '',
        homeScore: num(home ?? null, 'score'),
        awayScore: num(away ?? null, 'score'),
        start: str(row, 'startTimeLocal'),
        venue: str(row, 'venue'),
        status: str(obj(row, 'status'), 'value')
      }
    ];
  });
}

export interface SrBoxLine {
  /** UUID del equipo. */
  teamId: string;
  personId: string;
  name: string;
  starter: boolean;
  seconds: number;
  points: number;
  twoPointMade: number;
  twoPointAttempted: number;
  threePointMade: number;
  threePointAttempted: number;
  freeThrowMade: number;
  freeThrowAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  assists: number;
  steals: number;
  turnovers: number;
  blocks: number;
  blocksReceived: number;
  fouls: number;
  /** La «évaluation» de la LNB. */
  rating: number;
}

/** «PT16M24S» → 984 segundos. */
export function isoDurationSeconds(raw: string | null): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(raw ?? '');
  if (!match) return 0;
  return Math.round(
    Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
  );
}

/**
 * `fixture_detail?fixtureId=…`: el acta de un partido, una línea por jugador
 * que jugó (los que no salieron a pista, fuera).
 */
export function parseBoxScore(text: string): SrBoxLine[] {
  const base = obj(obj(obj(obj(parse(text), 'data'), 'statistics'), 'data'), 'base');
  const lines: SrBoxLine[] = [];
  for (const side of ['home', 'away']) {
    const team = obj(base, side);
    for (const group of list(team, 'persons')) {
      for (const row of list(group, 'rows')) {
        const teamId = str(row, 'entityId');
        const personId = str(row, 'personId');
        if (!teamId || !personId || row.participated !== true) continue;
        const stats = obj(row, 'statistics');
        const int = (key: string): number => Math.round(num(stats, key) ?? 0);
        lines.push({
          teamId,
          personId,
          name: str(row, 'personName') ?? '',
          starter: row.starter === true,
          seconds: isoDurationSeconds(str(stats, 'minutes')),
          points: int('points'),
          twoPointMade: int('pointsTwoMade'),
          twoPointAttempted: int('pointsTwoAttempted'),
          threePointMade: int('pointsThreeMade'),
          threePointAttempted: int('pointsThreeAttempted'),
          freeThrowMade: int('freeThrowsMade'),
          freeThrowAttempted: int('freeThrowsAttempted'),
          offensiveRebounds: int('reboundsOffensive'),
          defensiveRebounds: int('reboundsDefensive'),
          assists: int('assists'),
          steals: int('steals'),
          turnovers: int('turnovers'),
          blocks: int('blocks'),
          blocksReceived: int('blocksReceived'),
          fouls: int('foulsTotal'),
          rating: int('efficiency')
        });
      }
    }
  }
  return lines;
}

export interface SrPlayerTotals {
  personId: string;
  name: string;
  /** Nombre del equipo, que es lo único que da la tabla para separar a quien cambió de club. */
  teamName: string;
  dunks: number | null;
  foulsDrawn: number | null;
}

/**
 * `statistics_persons?state=…`: la tabla de totales de la temporada. Sólo se
 * usa por lo que las actas no traen: mates y faltas recibidas. El id de la
 * persona va dentro del enlace a su ficha (otro estado comprimido).
 */
export function parsePlayerTotals(text: string): SrPlayerTotals[] {
  const groups = list(obj(parse(text), 'data'), 'statistics');
  const totals = groups.find((group) => str(obj(group, 'label'), 'key') === 'totals');
  if (!totals) return [];
  const keys = list(totals, 'headers').map((header) => str(header, 'key'));
  return list(totals, 'statistics').flatMap((row) => {
    const person = obj(row, 'person');
    const link = str(obj(obj(person, 'link'), 'queryParams'), '~w');
    const state = link ? decodeWidgetState(link.split('~')[1] ?? '') : null;
    const personId = str(state, 'p');
    const values = Array.isArray(row.statistics) ? (row.statistics as unknown[]) : [];
    const value = (key: string): number | null => {
      const raw = values[keys.indexOf(key)];
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    };
    if (!personId) return [];
    return [
      {
        personId,
        name: str(person, 'name') ?? '',
        teamName: str(obj(row, 'entity'), 'name') ?? '',
        dunks: value('dunks'),
        foulsDrawn: value('foulsDrawn')
      }
    ];
  });
}

export interface LnbPlayerStats {
  personId: string;
  teamId: string;
  name: string;
  stats: SourceStats;
}

/**
 * Los totales de la liga regular de cada jugador en cada equipo, sumando sus
 * actas. Quien cambió de club dentro de la liga sale una vez por equipo.
 */
export function aggregateBoxScores(lines: readonly SrBoxLine[]): LnbPlayerStats[] {
  const byKey = new Map<string, LnbPlayerStats>();
  for (const line of lines) {
    const key = `${line.personId}|${line.teamId}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        personId: line.personId,
        teamId: line.teamId,
        name: line.name,
        stats: {
          games: 0,
          starts: 0,
          seconds: 0,
          points: 0,
          twoPointMade: 0,
          twoPointAttempted: 0,
          threePointMade: 0,
          threePointAttempted: 0,
          freeThrowMade: 0,
          freeThrowAttempted: 0,
          offensiveRebounds: 0,
          defensiveRebounds: 0,
          assists: 0,
          steals: 0,
          turnovers: 0,
          blocks: 0,
          blocksReceived: 0,
          dunks: null,
          fouls: 0,
          foulsDrawn: null,
          rating: 0
        }
      };
      byKey.set(key, entry);
    }
    const stats = entry.stats;
    stats.games += 1;
    stats.starts = (stats.starts ?? 0) + (line.starter ? 1 : 0);
    stats.seconds += line.seconds;
    stats.points += line.points;
    stats.twoPointMade += line.twoPointMade;
    stats.twoPointAttempted += line.twoPointAttempted;
    stats.threePointMade += line.threePointMade;
    stats.threePointAttempted += line.threePointAttempted;
    stats.freeThrowMade += line.freeThrowMade;
    stats.freeThrowAttempted += line.freeThrowAttempted;
    stats.offensiveRebounds += line.offensiveRebounds;
    stats.defensiveRebounds += line.defensiveRebounds;
    stats.assists += line.assists;
    stats.steals += line.steals;
    stats.turnovers += line.turnovers;
    stats.blocks += line.blocks;
    stats.blocksReceived = (stats.blocksReceived ?? 0) + line.blocksReceived;
    stats.fouls += line.fouls;
    stats.rating = (stats.rating ?? 0) + line.rating;
  }
  return [...byKey.values()];
}
