import { toNationCode } from '../lib/nationalities';
import { toNameCase, toWeightKg, usualFirstName } from '../lib/normalize';
import type { SourcePosition, SourceStats } from '../lib/source-types';
import { addLine, emptyStats, playedIn, type BoxNumbers } from './lkl-parse';

/**
 * Lectura de la BNXT League (bnxtleague.com). La web es una aplicación de Vue
 * que lee una API JSON de sportpress (`bnxt.sportpress.info/api/v1/`); aquí se
 * leen sus respuestas tal cual:
 *
 * - La clasificación (`standings/competition/<competición>/phase/<fase>`): una
 *   fila por equipo con su puesto, balance y país (`club.name`, «Belgium» o
 *   «Netherlands»).
 * - Los equipos (`competition-team/all`): el id del equipo en esa temporada
 *   (`id`), el del club, que no cambia (`uu_team_id`), y su cuerpo técnico, que
 *   es el del final de la temporada.
 * - El calendario de un equipo (`schedule/club/<temporada>`): sus partidos con
 *   la fase, el tanteo y el pabellón.
 * - El acta (`boxscore/game/<competición>/<partido>`): una lista por equipo con
 *   la línea de cada jugador. Los minutos vienen enteros; `defensive_foul` son
 *   las faltas recibidas; `block_against`, los tapones recibidos; `dunk_made`
 *   está siempre a cero (no se usa).
 * - La plantilla (`roster/team-players/<equipo>`): la del final de la
 *   temporada, sin los que se fueron, con puesto, altura, peso, fecha de
 *   nacimiento y nacionalidad (código COI casi siempre, a veces en minúsculas).
 *
 * El id de jugador (`player.id`) es el de la persona: el mismo en todos sus
 * equipos y temporadas.
 */

/* ------------------------------------------------------------- tipos */

interface ApiPlayer {
  id: number;
  birthdate: string | null;
  first_name: string;
  last_name: string;
  nationality_code: string | null;
}

interface ApiTeam {
  id: number;
  name: string;
  short_name?: string | null;
  uu_team_id?: number;
  club?: { id: number; name: string } | null;
}

/** El cuerpo `{ data: … }` de todas las respuestas de la API. */
function dataOf<T>(json: string): T {
  const parsed = JSON.parse(json) as { data?: T };
  if (parsed.data === undefined) throw new Error('BNXT: la respuesta no trae «data».');
  return parsed.data;
}

/** El nombre del equipo sin la coletilla «playoff» que la API les pone a muchos. */
export function bnxtTeamName(raw: string): string {
  return raw.replace(/\s*playoff\s*$/i, '').trim();
}

/** El país del equipo en la API («Belgium», «Netherlands») en código COI. */
export function bnxtCountry(clubName: string | null | undefined): string | null {
  switch ((clubName ?? '').trim().toLowerCase()) {
    case 'belgium':
      return 'BEL';
    case 'netherlands':
      return 'NED';
    default:
      return null;
  }
}

/* ---------------------------------------------------- clasificación */

export interface BnxtStanding {
  position: number;
  /** Id del equipo en la temporada (`competition_team_id`). */
  teamId: string;
  name: string;
  shortName: string | null;
  country: string | null;
  games: number;
  wins: number;
  losses: number;
}

export function parseBnxtStandings(json: string): BnxtStanding[] {
  const rows =
    dataOf<{ team: ApiTeam; position: number; played: number; win: number; loss: number }[]>(json);
  return rows
    .map((row) => ({
      position: row.position,
      teamId: String(row.team.id),
      name: bnxtTeamName(row.team.name),
      shortName: row.team.short_name ?? null,
      country: bnxtCountry(row.team.club?.name),
      games: row.played,
      wins: row.win,
      losses: row.loss
    }))
    .sort((a, b) => a.position - b.position);
}

/* ------------------------------------------------------------ equipos */

export interface BnxtTeam {
  /** Id del equipo en la temporada. */
  teamId: string;
  /** Id del club, el mismo todas las temporadas. */
  clubId: string;
  name: string;
  /** Los primeros entrenadores que tiene hoy la API (los del final de la temporada). */
  headCoaches: string[];
}

export function parseBnxtTeams(json: string): BnxtTeam[] {
  const teams = dataOf<
    (ApiTeam & {
      staffs?: { staff: { name: string }; title: { name: string } }[];
    })[]
  >(json);
  return teams.map((team) => ({
    teamId: String(team.id),
    clubId: String(team.uu_team_id ?? ''),
    name: bnxtTeamName(team.name),
    headCoaches: (team.staffs ?? [])
      .filter((entry) => /^head coach$/i.test(entry.title.name.trim()))
      .map((entry) => entry.staff.name.trim())
  }));
}

/* --------------------------------------------------------- calendario */

export interface BnxtGame {
  gameId: string;
  /** «AAAA-MM-DD hh:mm:ss». */
  time: string;
  phaseId: string;
  status: string;
  arena: string | null;
  home: { teamId: string; score: number };
  away: { teamId: string; score: number };
}

/** Los partidos del calendario de un equipo (de todas las fases). */
export function parseBnxtSchedule(json: string): BnxtGame[] {
  const games = dataOf<
    {
      id: number;
      game_time: string;
      status: string;
      phase: { id: number } | null;
      arena: { name: string } | null;
      competitors: { side: number; finalScore: number; competition_team: ApiTeam }[];
    }[]
  >(json);
  const out: BnxtGame[] = [];
  for (const game of games) {
    const home = game.competitors.find((entry) => entry.side === 1);
    const away = game.competitors.find((entry) => entry.side === 2);
    if (!home || !away) continue;
    out.push({
      gameId: String(game.id),
      time: game.game_time,
      phaseId: String(game.phase?.id ?? ''),
      status: game.status,
      arena: game.arena?.name?.replace(/\s+/g, ' ').trim() || null,
      home: { teamId: String(home.competition_team.id), score: home.finalScore },
      away: { teamId: String(away.competition_team.id), score: away.finalScore }
    });
  }
  return out;
}

/* --------------------------------------------------------------- acta */

export interface BnxtPerson {
  playerId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  nationalityRaw: string | null;
}

export interface BnxtBoxLine extends BoxNumbers {
  gameId: string;
  teamId: string;
  person: BnxtPerson;
  positionRaw: string | null;
  shirtNumber: number | null;
}

export interface BnxtBoxTeam {
  teamId: string;
  isHome: boolean;
  /** Los puntos del equipo según la fila de totales. */
  points: number;
  lines: BnxtBoxLine[];
}

interface ApiBoxPlayer {
  player: ApiPlayer;
  position: { name: string } | null;
  starter: boolean;
  minute: number;
  foul: number;
  defensive_foul: number;
  two_point_made: number;
  two_point_all: number;
  three_point_made: number;
  three_point_all: number;
  free_throw_made: number;
  free_throw_all: number;
  offensive_rebound: number;
  defensive_rebound: number;
  block: number;
  block_against: number;
  turnover: number;
  steal: number;
  assist: number;
  points: number;
  value: number;
  jersey: number | string | null;
}

function personOf(player: ApiPlayer): BnxtPerson {
  return {
    playerId: String(player.id),
    firstName: player.first_name.trim(),
    lastName: player.last_name.trim(),
    birthDate: /^\d{4}-\d{2}-\d{2}$/.test(player.birthdate ?? '') ? player.birthdate : null,
    nationalityRaw: player.nationality_code?.trim() || null
  };
}

function shirtOf(raw: number | string | null | undefined): number | null {
  const value = Number(raw);
  return raw !== '' && raw !== null && raw !== undefined && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Las dos mitades del acta; una lista vacía si no hay (un partido dado por
 * perdido no tiene acta).
 */
export function parseBnxtBoxScore(json: string, gameId: string): BnxtBoxTeam[] {
  const sides = dataOf<
    {
      team: ApiTeam;
      is_home: boolean;
      players: ApiBoxPlayer[];
      total: { points: number };
    }[]
  >(json);
  return sides.map((side) => ({
    teamId: String(side.team.id),
    isHome: side.is_home,
    points: side.total.points,
    lines: side.players.map((line) => ({
      gameId,
      teamId: String(side.team.id),
      person: personOf(line.player),
      positionRaw: line.position?.name ?? null,
      shirtNumber: shirtOf(line.jersey),
      starter: line.starter,
      seconds: line.minute * 60,
      points: line.points,
      twoPointMade: line.two_point_made,
      twoPointAttempted: line.two_point_all,
      threePointMade: line.three_point_made,
      threePointAttempted: line.three_point_all,
      freeThrowMade: line.free_throw_made,
      freeThrowAttempted: line.free_throw_all,
      offensiveRebounds: line.offensive_rebound,
      defensiveRebounds: line.defensive_rebound,
      assists: line.assist,
      steals: line.steal,
      turnovers: line.turnover,
      blocks: line.block,
      blocksReceived: line.block_against,
      fouls: line.foul,
      foulsDrawn: line.defensive_foul,
      rating: line.value
    }))
  }));
}

export interface BnxtPlayerStats {
  playerId: string;
  teamId: string;
  /** La última línea de acta: persona, puesto y dorsal. */
  line: BnxtBoxLine;
  stats: SourceStats;
}

/** Suma las actas por jugador y equipo; sólo los partidos que jugó. */
export function aggregateBnxtBoxScores(lines: readonly BnxtBoxLine[]): BnxtPlayerStats[] {
  const byKey = new Map<string, BnxtPlayerStats>();
  for (const line of lines) {
    if (!playedIn(line)) continue;
    const key = `${line.person.playerId}|${line.teamId}`;
    const entry = byKey.get(key) ?? {
      playerId: line.person.playerId,
      teamId: line.teamId,
      line,
      stats: emptyStats()
    };
    addLine(entry.stats, line);
    entry.line = line;
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}

/* ---------------------------------------------------------- plantilla */

export interface BnxtRosterPlayer extends BnxtPerson {
  positionRaw: string | null;
  heightCm: number | null;
  weightKg: number | null;
  shirtNumber: number | null;
}

export function parseBnxtRoster(json: string): BnxtRosterPlayer[] {
  const rows = dataOf<
    {
      jersey: number | string | null;
      weight: number | null;
      height: number | null;
      player_position: { name: string } | null;
      player: ApiPlayer;
    }[]
  >(json);
  return rows.map((row) => ({
    ...personOf(row.player),
    positionRaw: row.player_position?.name ?? null,
    heightCm: row.height !== null && row.height >= 150 && row.height <= 240 ? row.height : null,
    weightKg: toWeightKg(row.weight),
    shirtNumber: shirtOf(row.jersey)
  }));
}

/* ------------------------------------------------- puestos y países */

/** Desde esta altura, un alero (`small_forward`) es ala-pívot. */
export const BNXT_POWER_FORWARD_CM = 205;
/** Por debajo de esta altura, un pívot (`center`) es ala-pívot. */
export const BNXT_CENTER_MIN_CM = 203;

/**
 * El puesto de la API (`point_guard`, `shooting_guard`, `small_forward`,
 * `center` o dos unidos por un guion: cuenta el primero). La BNXT no tiene
 * ala-pívots: son los pívots bajos y los aleros altos.
 */
export function bnxtPosition(
  raw: string | null | undefined,
  heightCm: number | null
): SourcePosition | null {
  const first = (raw ?? '').trim().toLowerCase().split('-')[0] ?? '';
  switch (first) {
    case 'point_guard':
      return 'PG';
    case 'shooting_guard':
      return 'SG';
    case 'small_forward':
      return heightCm !== null && heightCm >= BNXT_POWER_FORWARD_CM ? 'PF' : 'SF';
    case 'power_forward':
      return 'PF';
    case 'center':
      return heightCm !== null && heightCm < BNXT_CENTER_MIN_CM ? 'PF' : 'C';
    default:
      return null;
  }
}

/** La nacionalidad de la API: código COI (`SLO`, `SUI`, `GER`), a veces en minúsculas. */
export function bnxtNationality(raw: string | null | undefined): string | null {
  return toNationCode((raw ?? '').trim().toUpperCase());
}

/* ------------------------------------------------------------ nombres */

/** Sufijos que van con el apellido y se escriben siempre igual. */
const SUFFIXES: Record<string, string> = {
  jr: 'Jr.',
  'jr.': 'Jr.',
  junior: 'Jr.',
  ii: 'II',
  iii: 'III',
  iv: 'IV'
};

/** Partículas de los apellidos neerlandeses, en minúscula detrás del nombre de pila. */
const DUTCH_PARTICLES = new Set(['van', 'de', 'der', 'den', 'het', 'ter', 'ten', 'te', "'t"]);

/**
 * El nombre de uso de un jugador de la API:
 * - del nombre de pila legal se queda el primero (`usualFirstName`);
 * - lo que viene en mayúsculas («KLANJŠČEK») se escribe con mayúscula inicial;
 * - los sufijos del apellido, siempre igual («Junior», «Jr» → «Jr.»);
 * - las partículas de los neerlandeses, en minúscula («Van Der Vuurst» → «van
 *   der Vuurst»), como se escriben en los Países Bajos con el nombre delante;
 *   las de los belgas se quedan como vienen («Van Den Eynde»).
 */
export function bnxtName(
  firstName: string,
  lastName: string,
  nationality: string | null
): { firstName: string; lastName: string } {
  const fix = (text: string): string =>
    text
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) =>
        word.length > 1 && word === word.toUpperCase() && /\p{Lu}{2}/u.test(word)
          ? toNameCase(word)
          : word
      )
      .join(' ');
  const first = usualFirstName(fix(firstName));
  const words = fix(lastName).split(' ').filter(Boolean);
  const last = words
    .map((word, index) => {
      const suffix = index > 0 ? SUFFIXES[word.toLowerCase()] : undefined;
      if (suffix) return suffix;
      if (
        nationality === 'NED' &&
        index < words.length - 1 &&
        DUTCH_PARTICLES.has(word.toLowerCase())
      ) {
        return word.toLowerCase();
      }
      return word;
    })
    .join(' ');
  return { firstName: first, lastName: last };
}
