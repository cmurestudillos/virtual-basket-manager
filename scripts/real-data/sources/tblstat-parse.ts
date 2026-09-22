import { decodeEntities, rowCells, tableRows, textOf } from '../lib/html';
import { toNationCode } from '../lib/nationalities';
import { minutesToSeconds, toHeightCm, toInt, toPosition, toWeightKg } from '../lib/normalize';
import type { SourcePosition, SourceStats } from '../lib/source-types';
import { nameSimilarity } from '../lib/greek';
import { bbrefDistance, matchBbref, type BbrefRow } from './esake-parse';
import { POWER_FORWARD_CM } from './lba-parse';

/**
 * Lectura de tblstat.net (la Basketbol Süper Ligi turca) y de las fichas de
 * jugador de basketball-reference. Sólo parseo, sin red: `tblstat.ts`
 * descarga y decide.
 *
 * tblstat.net es una web de estadísticas de aficionado, HTML de servidor sin
 * API. La web oficial (tbf.org.tr) no se puede leer: está tras la
 * comprobación anti-robots de Cloudflare. tblstat da los nombres con su
 * grafía (turcos con ç, ğ, ı, ş; extranjeros con la suya), fecha de
 * nacimiento, altura (no siempre) y nacionalidad; las actas traen minutos al
 * segundo, puntos, tiros, rebotes totales, asistencias, robos, pérdidas,
 * valoración y el entrenador de cada equipo, pero no rebotes de ataque y
 * defensa, tapones, faltas ni titulares.
 */

const PLAYER_LINK = /go\('player\/(\d+)\/\d+'\)/;
const TEAM_LINK = /go\('team\/(\d+)\/\d+'\)/g;

export interface TblStanding {
  rank: number;
  teamId: string;
  name: string;
  games: number | null;
  wins: number | null;
  losses: number | null;
}

/** `standings/<temporada>`: la clasificación de la liga regular. */
export function parseTblStandings(html: string): TblStanding[] {
  return tableRows(html).flatMap((row) => {
    const cells = rowCells(row);
    const rank = /^(\d+)\.$/.exec(textOf(cells[0]?.html ?? ''))?.[1];
    const teamId = /go\('team\/(\d+)\//.exec(cells[1]?.html ?? '')?.[1];
    if (!rank || !teamId) return [];
    const int = (index: number): number | null => toInt(textOf(cells[index]?.html ?? ''));
    return [
      {
        rank: Number(rank),
        teamId,
        name: textOf(cells[1]?.html ?? ''),
        games: int(3),
        wins: int(4),
        losses: int(5)
      }
    ];
  });
}

export interface TblRosterPlayer {
  playerId: string;
  /** Nombre completo tal cual: «Nombre Apellido». */
  name: string;
  /** Partidos de la temporada, playoffs incluidos (sólo para revisar). */
  games: number | null;
  birthDate: string | null;
  heightCm: number | null;
  /** Código de la bandera (ISO de dos letras), como lo da la fuente. */
  flag: string | null;
  /** País en inglés, como lo da la fuente («Turkiye», «Bosnia&Herz.»). */
  country: string | null;
  /** En qué lista sale: la plantilla, la de canteranos o la de los que se fueron. */
  section: 'plantilla' | 'cantera' | 'bajas';
}

export interface TblCoachRow {
  name: string;
  flag: string | null;
  country: string | null;
}

export interface TblTeamPage {
  name: string;
  players: TblRosterPlayer[];
  /** Los entrenadores de la temporada, del más reciente al primero. */
  coaches: TblCoachRow[];
}

/** «24.02.1988» → «1988-02-24». */
export function tblDate(raw: string | null | undefined): string | null {
  const match = /(\d{2})\.(\d{2})\.(\d{4})/.exec(raw ?? '');
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function flagOf(html: string): { flag: string | null; country: string | null } {
  const flag = /ctr\/([A-Za-z-]+)\.png/.exec(html)?.[1] ?? null;
  const country = textOf(html);
  return { flag: flag ? flag.toUpperCase() : null, country: country === '' ? null : country };
}

/**
 * `team/<id>/<temporada>`: la ficha del equipo en una temporada. Tres tablas
 * de jugadores (plantilla, «Youth Team Players» y «Departed Players») con
 * partidos, medias, fecha, altura en metros y bandera, y las filas «Head
 * Coach» de cada entrenador que tuvo, el de ahora el primero.
 */
export function parseTblTeamPage(html: string): TblTeamPage {
  const name = textOf(/<title>([^|<]*)/.exec(html)?.[1] ?? '');
  const players: TblRosterPlayer[] = [];
  const coaches: TblCoachRow[] = [];
  const tables = [...html.matchAll(/<table class="td-gl"[^>]*>([\s\S]*?)<\/table>/g)].map(
    (match) => match[1] ?? ''
  );
  for (const table of tables) {
    const header = textOf(/<tr class="hdr">([\s\S]*?)<\/tr>/.exec(table)?.[1] ?? '');
    if (!/\bGP\b/.test(header)) continue;
    const section = header.startsWith('Youth')
      ? 'cantera'
      : header.startsWith('Departed')
        ? 'bajas'
        : 'plantilla';
    for (const row of tableRows(table)) {
      const cells = rowCells(row);
      const coach = /Head Coach:\s*([^<]+)/.exec(cells[0]?.html ?? '')?.[1];
      if (coach) {
        coaches.push({ name: decodeEntities(coach).trim(), ...flagOf(cells.at(-1)?.html ?? '') });
        continue;
      }
      const playerId = PLAYER_LINK.exec(cells[0]?.html ?? '')?.[1];
      if (!playerId || cells.length < 10) continue;
      const text = (index: number): string => textOf(cells[index]?.html ?? '');
      players.push({
        playerId,
        name: text(0),
        games: toInt(text(1)),
        birthDate: tblDate(text(7)),
        heightCm: toHeightCm(text(8)),
        ...flagOf(cells[9]?.html ?? ''),
        section
      });
    }
  }
  return { name, players, coaches };
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
];

/**
 * `player/<id>/<temporada>`: la ficha del jugador («Born: February 24,
 * 1988», «Height: 1.90», «Nationality: <bandera> France»). Para quien jugó con
 * un equipo y no sale en su plantilla.
 */
export function parseTblPlayerPage(
  html: string,
  playerId: string
): Omit<TblRosterPlayer, 'section'> {
  const name = textOf(/<h1>([^|<]*)/.exec(html)?.[1] ?? '');
  const bio = /<span class="hdr1">Born:([\s\S]*?)<\/span>/.exec(html)?.[1] ?? '';
  const born = /^\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(bio);
  const month = born ? MONTHS.indexOf((born[1] ?? '').toLowerCase()) + 1 : 0;
  const nationality = /Nationality:([\s\S]*?)(?:<br>|$)/.exec(bio)?.[1] ?? '';
  return {
    playerId,
    name,
    games: null,
    birthDate:
      born && month > 0
        ? `${born[3]}-${String(month).padStart(2, '0')}-${born[2]!.padStart(2, '0')}`
        : null,
    heightCm: toHeightCm(/Height:\s*([\d.,]+)/.exec(bio)?.[1] ?? null),
    ...flagOf(nationality)
  };
}

/** La nacionalidad de la bandera de tblstat (ISO de dos letras) o, si no, del país escrito. */
export function tblNationality(flag: string | null, country: string | null): string | null {
  return toNationCode(flag) ?? toNationCode(country?.replace(/&/g, ' and ') ?? null);
}

export interface TblBoxLine {
  teamId: string;
  playerId: string;
  name: string;
  seconds: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  turnovers: number;
  rating: number;
  freeThrowMade: number;
  freeThrowAttempted: number;
  twoPointMade: number;
  twoPointAttempted: number;
  threePointMade: number;
  threePointAttempted: number;
}

export interface TblGame {
  gameId: string;
  /** «Regular Season», «Playoffs»…, como lo pone la cabecera. */
  phase: string | null;
  round: number | null;
  date: string | null;
  venue: string | null;
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  homeCoach: string | null;
  awayCoach: string | null;
  lines: TblBoxLine[];
}

function madeAttempted(text: string): [number, number] {
  const match = /(\d+)\s*-\s*(\d+)/.exec(text);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

/**
 * `game/<id>`: el acta. Cabecera con fase y jornada, los dos equipos (casa y
 * fuera, por este orden), el tanteo, la fecha con el pabellón («26.09.2025
 * 19:00 | Pabellón, Ciudad») y una tabla por equipo, en el mismo orden, tras
 * su «Head Coach». Columnas: Min, Pts, Reb, Ast, Stl, To, Eff, FT, 2Pt, 3Pt
 * (anotados-intentados). Quien no jugó sale con «0:00» y «~»: no cuenta.
 */
export function parseTblGame(html: string, gameId: string): TblGame | null {
  const title = textOf(/<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');
  const start = html.indexOf('id="divGameHeader"');
  const header = start < 0 ? '' : html.slice(start, html.indexOf('Head Coach:', start));
  const teams = [...header.matchAll(TEAM_LINK)].map((match) => match[1] ?? '');
  if (teams.length < 2) return null;
  const score = /(\d+)\s*-\s*(\d+)/.exec(
    textOf(/<span style="font:[^"]*">([\s\S]*?)<\/span>/.exec(header)?.[1] ?? '')
  );
  const when = /(\d{2}\.\d{2}\.\d{4})\s+\d{1,2}:\d{2}\s*\|\s*([^<]*)</.exec(html);
  const phase = /\|\s*\w+ \d+, \d{4}\s+(.+?)\s+Day\s+(\d+)/.exec(title);
  const parts = html.split(/Head Coach:\s*/).slice(1);
  const coaches: (string | null)[] = [];
  const lines: TblBoxLine[] = [];
  parts.slice(0, 2).forEach((part, index) => {
    const teamId = teams[index]!;
    // «Nombre (Disqualified @16:37)»: el entrenador expulsado sigue siendo él.
    const coach = decodeEntities(/^([^<]*)</.exec(part)?.[1] ?? '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim();
    coaches.push(coach === '' ? null : coach);
    const table = /<table class="gd-gl">([\s\S]*?)<\/table>/.exec(part)?.[1] ?? '';
    for (const row of tableRows(table)) {
      const cells = rowCells(row);
      const playerId = PLAYER_LINK.exec(cells[0]?.html ?? '')?.[1];
      if (!playerId || cells.length < 11) continue;
      const text = (column: number): string => textOf(cells[column]?.html ?? '');
      if (text(2) === '~') continue;
      const int = (column: number): number => toInt(text(column)) ?? 0;
      const [freeThrowMade, freeThrowAttempted] = madeAttempted(text(8));
      const [twoPointMade, twoPointAttempted] = madeAttempted(text(9));
      const [threePointMade, threePointAttempted] = madeAttempted(text(10));
      lines.push({
        teamId,
        playerId,
        name: text(0),
        seconds: minutesToSeconds(text(1)),
        points: int(2),
        rebounds: int(3),
        assists: int(4),
        steals: int(5),
        turnovers: int(6),
        rating: int(7),
        freeThrowMade,
        freeThrowAttempted,
        twoPointMade,
        twoPointAttempted,
        threePointMade,
        threePointAttempted
      });
    }
  });
  return {
    gameId,
    phase: phase?.[1] ?? null,
    round: phase ? Number(phase[2]) : null,
    date: tblDate(when?.[1]),
    venue: when ? decodeEntities(when[2] ?? '').trim() || null : null,
    homeId: teams[0]!,
    awayId: teams[1]!,
    homeScore: score ? Number(score[1]) : null,
    awayScore: score ? Number(score[2]) : null,
    homeCoach: coaches[0] ?? null,
    awayCoach: coaches[1] ?? null,
    lines
  };
}

export interface TblPlayerStats {
  playerId: string;
  teamId: string;
  name: string;
  stats: SourceStats;
}

/**
 * Los totales de cada jugador en cada equipo, sumando sus actas. tblstat sólo
 * da el rebote total: hasta completarlos con basketball-reference, van todos
 * como defensivos (así la suma, que es lo que se compara al emparejar, cuadra).
 */
export function aggregateTblBoxScores(lines: readonly TblBoxLine[]): TblPlayerStats[] {
  const byKey = new Map<string, TblPlayerStats>();
  for (const line of lines) {
    const key = `${line.playerId}|${line.teamId}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        playerId: line.playerId,
        teamId: line.teamId,
        name: line.name,
        stats: {
          games: 0,
          starts: null,
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
          blocksReceived: null,
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
    stats.seconds += line.seconds;
    stats.points += line.points;
    stats.twoPointMade += line.twoPointMade;
    stats.twoPointAttempted += line.twoPointAttempted;
    stats.threePointMade += line.threePointMade;
    stats.threePointAttempted += line.threePointAttempted;
    stats.freeThrowMade += line.freeThrowMade;
    stats.freeThrowAttempted += line.freeThrowAttempted;
    stats.defensiveRebounds += line.rebounds;
    stats.assists += line.assists;
    stats.steals += line.steals;
    stats.turnovers += line.turnovers;
    stats.rating = (stats.rating ?? 0) + line.rating;
  }
  return [...byKey.values()];
}

/**
 * Completa unos totales de tblstat con lo que sólo da basketball-reference:
 * rebotes de ataque y defensa, tapones y faltas. Si los rebotes de las dos no
 * suman lo mismo, se reparte el total de tblstat en la proporción de
 * basketball-reference. Devuelve `false` si la fila no trae esas columnas.
 */
export function completeFromBbref(stats: SourceStats, row: BbrefRow): boolean {
  const { offensiveRebounds, defensiveRebounds, blocks, fouls } = row;
  if (
    offensiveRebounds === undefined ||
    defensiveRebounds === undefined ||
    blocks === undefined ||
    fouls === undefined
  ) {
    return false;
  }
  const total = stats.offensiveRebounds + stats.defensiveRebounds;
  const bbrefTotal = offensiveRebounds + defensiveRebounds;
  const offensive =
    bbrefTotal === total
      ? offensiveRebounds
      : bbrefTotal === 0
        ? 0
        : Math.round((total * offensiveRebounds) / bbrefTotal);
  stats.offensiveRebounds = offensive;
  stats.defensiveRebounds = total - offensive;
  stats.blocks = blocks;
  stats.fouls = fouls;
  return true;
}

/** El apellido de un nombre completo para comparar: la última palabra que no es sufijo, sin la «ı». */
function surnameKey(full: string): string {
  const words = full.trim().split(/\s+/);
  while (words.length > 1 && SUFFIXES.has((words.at(-1) ?? '').toLowerCase())) words.pop();
  return (words.at(-1) ?? '').replace(/ı/g, 'i').replace(/İ/g, 'I');
}

/**
 * Empareja los totales de tblstat con las filas de basketball-reference del
 * mismo equipo. Primero por estadísticas, como en Grecia; a
 * basketball-reference le falta algún partido (un club entero con un partido
 * menos), así que a los que quedan se les busca después la fila con el mismo
 * apellido (parecido de al menos `MIN_SURNAME_SIMILARITY`) y como mucho dos
 * partidos de diferencia, la más cercana primero.
 */
export const MIN_SURNAME_SIMILARITY = 0.8;

export function matchTblBbref<T extends { name: string; stats: SourceStats }>(
  players: readonly T[],
  rows: readonly BbrefRow[]
): Map<T, BbrefRow> {
  const matched = matchBbref(players, rows);
  const used = new Set(matched.values());
  const pairs: { player: T; row: BbrefRow; distance: number }[] = [];
  for (const player of players) {
    if (matched.has(player)) continue;
    for (const row of rows) {
      if (used.has(row) || Math.abs(row.games - player.stats.games) > 2) continue;
      if (nameSimilarity(surnameKey(player.name), surnameKey(row.name)) < MIN_SURNAME_SIMILARITY) {
        continue;
      }
      pairs.push({ player, row, distance: bbrefDistance(player.stats, row) });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  for (const { player, row } of pairs) {
    if (matched.has(player) || used.has(row)) continue;
    matched.set(player, row);
    used.add(row);
  }
  return matched;
}

/** Sufijos que van con el apellido en los nombres anglosajones. */
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);
/** Partículas que van con el apellido («van der», «de»). */
const PARTICLES = new Set(['de', 'da', 'del', 'di', 'du', 'dos', 'van', 'von', 'der', 'le', 'la']);

/**
 * Parte «Nombre Apellido» de tblstat: el apellido es la última palabra, con
 * su sufijo («Jr.», «IV») y sus partículas («van der»); el resto, entero, es
 * el nombre, porque los turcos usan a menudo dos nombres de pila («Ali
 * Can»). Lo que no sigue esta regla va a mano.
 */
export function splitTblName(full: string): { firstName: string; lastName: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { firstName: '', lastName: words[0] ?? '' };
  let count = 1;
  if (SUFFIXES.has((words.at(-1) ?? '').toLowerCase()) && words.length > 2) count += 1;
  while (
    count < words.length - 1 &&
    PARTICLES.has((words[words.length - count - 1] ?? '').toLowerCase())
  ) {
    count += 1;
  }
  return { firstName: words.slice(0, -count).join(' '), lastName: words.slice(-count).join(' ') };
}

export interface BbrefBio {
  /** Tal cual: «Guard», «Point Guard», «Forward», «Center»… */
  position: string | null;
  heightCm: number | null;
  weightKg: number | null;
  birthDate: string | null;
}

/**
 * La ficha internacional de basketball-reference
 * (`/international/players/<slug>.html`): puesto, altura y peso en el
 * sistema métrico entre paréntesis («(213cm, 113kg)») y nacimiento.
 */
export function parseBbrefBio(html: string): BbrefBio {
  const meta = /<div id="meta">([\s\S]*?)<!-- div#meta -->/.exec(html)?.[1] ?? '';
  const position = /Position:\s*<\/strong>([\s\S]*?)(?:<p|<\/p|&#9642;|▪)/.exec(meta)?.[1];
  const metric = /\((\d{3})cm(?:,(?:&nbsp;|\s)*(\d{2,3})kg)?\)/.exec(meta);
  const born = /data-birth="(\d{4}-\d{2}-\d{2})"/.exec(meta)?.[1] ?? null;
  const positionText = position ? textOf(position) : '';
  return {
    position: positionText === '' ? null : positionText,
    heightCm: toHeightCm(metric?.[1] ?? null),
    weightKg: toWeightKg(metric?.[2] ?? null),
    birthDate: born
  };
}

/** Hasta aquí un «Guard» de basketball-reference es base; desde aquí, escolta. */
export const POINT_GUARD_MAX_CM = 190;

/**
 * El puesto de basketball-reference en PG…C. Da a veces el puesto exacto
 * («Point Guard», «Power Forward») y a veces sólo «Guard» o «Forward»; ésos se
 * separan por altura: base hasta `POINT_GUARD_MAX_CM`, ala-pívot desde
 * `POWER_FORWARD_CM`. Con dos puestos («Guard and Forward») cuenta el primero.
 */
export function toBbrefPosition(
  raw: string | null | undefined,
  heightCm: number | null
): SourcePosition | null {
  if (!raw) return null;
  const first = raw
    .split(/\s+and\s+|,|\//i)[0]!
    .trim()
    .toLowerCase();
  if (first === 'guard') return (heightCm ?? 999) <= POINT_GUARD_MAX_CM ? 'PG' : 'SG';
  if (first === 'forward') return (heightCm ?? 0) >= POWER_FORWARD_CM ? 'PF' : 'SF';
  return toPosition(first);
}
