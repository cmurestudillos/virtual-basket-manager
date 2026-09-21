import { toNationCode, nationFromIso3 } from '../lib/nationalities';
import { toPosition } from '../lib/normalize';
import type { SourcePosition, SourceStats } from '../lib/source-types';

/**
 * Lectura de la API JSON de legabasket.it (la de su propia web). Sólo parseo,
 * sin red: `lba.ts` descarga y decide. Cada función recibe el texto tal cual
 * llega y no se fía de ningún campo: lo que falta o no tiene el tipo esperado
 * sale como `null`.
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

/** Texto recortado; vacío, «-» y lo que no es texto ni número son `null`. */
function str(value: Json | null, key: string): string | null {
  const raw = value?.[key];
  if (typeof raw === 'number') return String(raw);
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  return text === '' || text === '-' ? null : text;
}

function num(value: Json | null, key: string): number | null {
  const raw = value?.[key];
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return null;
}

/** Un id numérico de la API como texto, que es como lo guarda el formato común. */
function id(value: Json | null, key: string): string | null {
  const raw = num(value, key);
  return raw === null ? null : String(raw);
}

export interface LbaTeamRef {
  /** Id del equipo en la temporada (cambia cada año); el de todas las rutas. */
  teamId: string;
  /** Id del club, que no cambia de un año a otro. */
  clubId: string | null;
  /** Abreviatura del club (MIO, BOV). */
  clubCode: string | null;
  /** Nombre comercial de esa temporada, con el patrocinador. */
  name: string;
}

/** `/teams/get-teams?year=…`: los equipos de la Serie A de ese año. */
export function parseTeams(text: string): LbaTeamRef[] {
  return list(parse(text), 'teams').flatMap((team) => {
    const teamId = id(team, 'id');
    const name = str(team, 'name');
    return teamId && name
      ? [{ teamId, clubId: id(team, 'club_id'), clubCode: str(team, 'club_code'), name }]
      : [];
  });
}

export interface LbaPerson {
  id: string;
  firstName: string;
  lastName: string;
  /** `AAAA-MM-DD`. */
  birthDate: string | null;
  /** Ciudad («Bergamo»), ciudad y país («Spalato (CRO)») o sólo país («Italia»). */
  placeOfBirth: string | null;
}

export interface LbaRosterPlayer extends LbaPerson {
  /** Código ISO de tres letras (`ITA`, `DNK`). */
  country: string | null;
  heightCm: number | null;
  weightKg: number | null;
  shirtNumber: string | null;
  /** «Playmaker», «Guardia/Ala», «Ala/Centro»… */
  role: string | null;
  /** Cupo: I (italiano), E (extracomunitario), C (comunitario)… */
  uefaRatio: string | null;
}

export interface LbaRoster {
  players: LbaRosterPlayer[];
  /** El primer entrenador de ahora (el del final de la temporada). */
  coach: LbaPerson | null;
  /** Puesto final de la liga regular. */
  finalPosition: number | null;
  wins: number | null;
  losses: number | null;
}

function person(value: Json | null): LbaPerson | null {
  const personId = id(value, 'id');
  const lastName = str(value, 'surname');
  if (!personId || !lastName) return null;
  return {
    id: personId,
    firstName: str(value, 'name') ?? '',
    lastName,
    birthDate: isoDay(str(value, 'birth_date')),
    placeOfBirth: str(value, 'place_of_birth')
  };
}

/** «1990-08-26» o «1990-08-26T00:00:00Z» → «1990-08-26». */
function isoDay(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

/**
 * `/teams/get-team-roster?id=…`: la plantilla del final de la temporada (quien
 * se fue a mitad no está), el primer entrenador de ahora y la clasificación.
 */
export function parseRoster(text: string): LbaRoster {
  const json = parse(text);
  const regular = obj(obj(json, 'rnk_sum'), 'r_s');
  const players = list(json, 'players').flatMap((row) => {
    const base = person(row);
    if (!base) return [];
    return [
      {
        ...base,
        country: str(row, 'country'),
        heightCm: num(row, 'height'),
        weightKg: num(row, 'weight'),
        shirtNumber: str(row, 'player_number'),
        role: str(row, 'player_role'),
        uefaRatio: str(row, 'uefa_ratio')
      }
    ];
  });
  return {
    players,
    coach: person(obj(json, 'coach')),
    finalPosition: num(regular, 'pos'),
    wins: num(regular, 'mw'),
    losses: num(regular, 'ml')
  };
}

export interface LbaClub {
  /** El nombre social del club, no el comercial del equipo. */
  clubName: string | null;
  /** Municipio de la sede del club. */
  companyTown: string | null;
  plantName: string | null;
  /** Municipio del pabellón, que a veces no es la ciudad del club. */
  plantTown: string | null;
  plantCapacity: number | null;
}

/** `/clubs/get-club-by-id?id=…` (con el id del equipo): sede y pabellón. */
export function parseClub(text: string): LbaClub {
  const club = obj(parse(text), 'club');
  return {
    clubName: str(club, 'name'),
    companyTown: str(club, 'company_town_name'),
    plantName: str(club, 'plant_name'),
    plantTown: str(club, 'plant_town_name'),
    plantCapacity: num(club, 'plant_capacity')
  };
}

export interface LbaStatsLine {
  playerId: string;
  firstName: string;
  lastName: string;
  games: number;
  starts: number;
  /** La API los da en minutos enteros. */
  minutes: number;
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
  dunks: number;
  fouls: number;
  foulsDrawn: number;
  rating: number;
}

/**
 * `/teams/get-team-players-stats?id=…&s=…&cs_id=1&ct_id=4&st=sum`: totales de
 * la liga regular de cada jugador que pasó por el equipo, también los que no
 * llegaron a jugar (con cero partidos).
 */
export function parseTeamStats(text: string): LbaStatsLine[] {
  return list(parse(text), 'players').flatMap((row) => {
    const playerId = id(row, 'player_id');
    if (!playerId) return [];
    const int = (key: string): number => Math.round(num(row, key) ?? 0);
    return [
      {
        playerId,
        firstName: str(row, 'player_name') ?? '',
        lastName: str(row, 'player_surname') ?? '',
        games: int('played_matches'),
        starts: int('start_formation'),
        minutes: int('played_minutes_sum'),
        points: int('points_sum'),
        twoPointMade: int('shots_2p_realized_sum'),
        twoPointAttempted: int('shots_2p_total_sum'),
        threePointMade: int('shots_3p_realized_sum'),
        threePointAttempted: int('shots_3p_total_sum'),
        freeThrowMade: int('free_throws_realized_sum'),
        freeThrowAttempted: int('free_throws_total_sum'),
        offensiveRebounds: int('offensive_rebound_sum'),
        defensiveRebounds: int('defensive_rebound_sum'),
        assists: int('assists_sum'),
        steals: int('regain_balls_sum'),
        turnovers: int('lost_balls_sum'),
        blocks: int('ball_stop_given_sum'),
        blocksReceived: int('ball_stop_received_sum'),
        dunks: int('slam_dunk_sum'),
        fouls: int('done_fouls_sum'),
        foulsDrawn: int('suffered_fouls_sum'),
        rating: int('rating_lega_sum')
      }
    ];
  });
}

/** Las estadísticas de la LBA en el formato común; `null` si no jugó ningún partido. */
export function toSourceStats(line: LbaStatsLine): SourceStats | null {
  if (line.games <= 0) return null;
  return {
    games: line.games,
    starts: line.starts,
    seconds: line.minutes * 60,
    points: line.points,
    twoPointMade: line.twoPointMade,
    twoPointAttempted: line.twoPointAttempted,
    threePointMade: line.threePointMade,
    threePointAttempted: line.threePointAttempted,
    freeThrowMade: line.freeThrowMade,
    freeThrowAttempted: line.freeThrowAttempted,
    offensiveRebounds: line.offensiveRebounds,
    defensiveRebounds: line.defensiveRebounds,
    assists: line.assists,
    steals: line.steals,
    turnovers: line.turnovers,
    blocks: line.blocks,
    blocksReceived: line.blocksReceived,
    dunks: line.dunks,
    fouls: line.fouls,
    foulsDrawn: line.foulsDrawn,
    rating: line.rating
  };
}

export interface LbaScheduledMatch {
  matchId: string;
  /** ISO con hora, en UTC. */
  date: string;
  played: boolean;
}

/** Así llama la API a la fase de liga regular de la Serie A. */
const REGULAR_SEASON = 'regular season';

/**
 * `/teams/get-team-schedules?id=…`: los partidos de liga regular del equipo,
 * del primero al último por fecha. La respuesta mezcla todas las competiciones
 * del año (Supercoppa, Final Eight, playoffs) aunque se pida sólo una.
 */
export function parseSchedule(text: string): LbaScheduledMatch[] {
  return list(parse(text), 'matches')
    .filter((row) => str(row, 'ctype_name')?.toLowerCase() === REGULAR_SEASON)
    .flatMap((row) => {
      const matchId = id(row, 'championships_match_id');
      const date = str(row, 'match_date');
      // 2 = terminado; los aplazados o anulados no cuentan.
      return matchId && date ? [{ matchId, date, played: str(row, 'game_status') === '2' }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchId.localeCompare(b.matchId));
}

export interface LbaMatchCoach {
  coachId: string;
  /** Nombre de pila y apellido: del contrato si es el mismo, o partido del acta. */
  name: string;
}

/**
 * `/championships/get-championships-matches-by-id?id=…`: quién se sentó de
 * primer entrenador en el banquillo de cada equipo (id de equipo → entrenador).
 * Manda el acta (`home_coach_*`), no `coaches_extra`: eso es el entrenador con
 * contrato ese día, y un partido con el ayudante en el banquillo sale con el
 * del contrato.
 */
export function parseMatchCoaches(text: string): Map<string, LbaMatchCoach> {
  const json = parse(text);
  const match = obj(json, 'match');
  const extra = obj(json, 'coaches_extra');
  const coaches = new Map<string, LbaMatchCoach>();
  for (const [side, teamKey, extraKey] of [
    ['home', 'h_team_id', 'home'],
    ['visitor', 'v_team_id', 'visitor']
  ] as const) {
    const teamId = id(match, teamKey);
    const coachId = id(match, `${side}_coach_id`);
    if (!teamId || !coachId) continue;
    const contract = obj(extra, extraKey);
    const fromContract =
      id(contract, 'id') === coachId
        ? [str(contract, 'name'), str(contract, 'surname')].filter(Boolean).join(' ')
        : '';
    // El acta escribe «Apellido Nombre»; sin contrato con que cruzarlo se deja así.
    const name = fromContract || str(match, `${side}_coach_fullname`) || `entrenador ${coachId}`;
    coaches.set(teamId, { coachId, name });
  }
  return coaches;
}

export interface LbaCoachSpell {
  coachId: string;
  name: string;
  /** Partidos de liga regular en el banquillo. */
  games: number;
}

/**
 * Los entrenadores de un equipo en la liga regular a partir de las actas de
 * sus partidos jugados, ya en orden de fecha: el primero es el que empezó la
 * temporada y los demás, cada uno una vez, en el orden en que llegaron (un
 * ayudante que sustituye un partido al titular también sale).
 */
export function coachSpells(
  coachesByMatch: readonly (LbaMatchCoach | undefined)[]
): LbaCoachSpell[] {
  const spells: LbaCoachSpell[] = [];
  for (const coach of coachesByMatch) {
    if (!coach) continue;
    const spell = spells.find((entry) => entry.coachId === coach.coachId);
    if (spell) spell.games += 1;
    else spells.push({ coachId: coach.coachId, name: coach.name, games: 1 });
  }
  return spells;
}

export interface LbaPlayerProfile extends LbaPerson {
  country: string | null;
  heightCm: number | null;
  weightKg: number | null;
  shirtNumber: string | null;
  role: string | null;
  uefaRatio: string | null;
  /** Temporada de la ficha: la API da la del contrato de ahora, no la pedida. */
  year: number | null;
}

/** `/players/get-player-by-id?id=…`: la ficha de hoy del jugador. */
export function parsePlayerProfile(text: string): LbaPlayerProfile | null {
  const player = obj(parse(text), 'player');
  const base = person(player);
  if (!base) return null;
  return {
    ...base,
    country: str(player, 'player_alpha3'),
    heightCm: num(player, 'height'),
    weightKg: num(player, 'weight'),
    shirtNumber: str(player, 'player_number'),
    role: str(player, 'player_role_description'),
    uefaRatio: str(player, 'uefa_ratio'),
    year: num(player, 'year')
  };
}

/** `/coaches/get-coaches-by-id?id=…`: la ficha del entrenador. */
export function parseCoachProfile(text: string): LbaPerson | null {
  return person(obj(parse(text), 'coach'));
}

/**
 * Los puestos de la LBA en PG/SG/SF/PF/C. «Ala» en italiano es cualquier
 * alero o ala-pívot y la LBA no los distingue, así que se separan por altura:
 * desde `POWER_FORWARD_CM` es ala-pívot. Con dos puestos cuenta el primero
 * («Play/Guardia» es base), salvo «Ala/Centro», que es el ala-pívot de libro.
 * «-» (los canteranos) no dice nada: `null`.
 */
const LBA_ROLES = new Map<string, SourcePosition>([
  ['playmaker', 'PG'],
  ['play', 'PG'],
  ['guardia', 'SG'],
  ['centro', 'C'],
  ['ala/centro', 'PF']
]);

export const POWER_FORWARD_CM = 205;

export function toLbaPosition(
  role: string | null | undefined,
  heightCm: number | null | undefined
): SourcePosition | null {
  if (!role) return null;
  const whole = role
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/');
  const direct = LBA_ROLES.get(whole);
  if (direct) return direct;
  const first = whole.split('/')[0] ?? '';
  if (first === 'ala') return (heightCm ?? 0) >= POWER_FORWARD_CM ? 'PF' : 'SF';
  return LBA_ROLES.get(first) ?? toPosition(role);
}

/**
 * Los países tal y como los escribe la LBA en los lugares de nacimiento: en
 * italiano («Croazia») o con una abreviatura que no siempre es la del COI
 * («Capljina (BOS)»).
 */
const ITALIAN_COUNTRIES: Record<string, string> = {
  italia: 'ITA',
  croazia: 'CRO',
  grecia: 'GRE',
  spagna: 'ESP',
  francia: 'FRA',
  germania: 'GER',
  slovenia: 'SLO',
  serbia: 'SRB',
  montenegro: 'MNE',
  bosnia: 'BIH',
  'bosnia erzegovina': 'BIH',
  bos: 'BIH',
  lituania: 'LTU',
  lettonia: 'LAT',
  'stati uniti': 'USA',
  'stati uniti d america': 'USA',
  argentina: 'ARG',
  turchia: 'TUR',
  israele: 'ISR',
  macedonia: 'MKD',
  'macedonia del nord': 'MKD',
  polonia: 'POL',
  belgio: 'BEL',
  'paesi bassi': 'NED',
  olanda: 'NED',
  svizzera: 'SUI',
  austria: 'AUT',
  ungheria: 'HUN',
  'repubblica ceca': 'CZE',
  russia: 'RUS',
  ucraina: 'UKR',
  finlandia: 'FIN',
  danimarca: 'DEN',
  svezia: 'SWE',
  brasile: 'BRA',
  uruguay: 'URU',
  senegal: 'SEN',
  nigeria: 'NGR',
  australia: 'AUS',
  canada: 'CAN'
};

function countryCode(raw: string): string | null {
  const plain = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
  return ITALIAN_COUNTRIES[plain] ?? toNationCode(raw);
}

/**
 * La nacionalidad de un entrenador a partir de su lugar de nacimiento, como lo
 * escribe la LBA: «Spalato (CRO)» → el país de entre paréntesis; «Croazia» →
 * ese país; y una ciudad sin país («Bergamo») es italiana, porque la LBA sólo
 * añade el país a las de fuera. `null` si viene vacío o el país no se reconoce.
 */
export function nationFromLbaPlace(place: string | null | undefined): string | null {
  if (!place || place.trim() === '') return null;
  const inside = /\(([^()]+)\)\s*$/.exec(place)?.[1]?.trim();
  if (inside) return countryCode(inside);
  return countryCode(place) ?? 'ITA';
}

/** La nacionalidad de un jugador: la API da el código ISO de tres letras. */
export function nationFromLbaCountry(country: string | null | undefined): string | null {
  return nationFromIso3(country);
}
