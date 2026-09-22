import { greekLongDate, greekNameToLatin, isGreekScript, transliterateGreek } from '../lib/greek';
import { decodeEntities, rowCells, tableRows, textOf } from '../lib/html';
import {
  minutesToSeconds,
  toHeightCm,
  toInt,
  toIsoDate,
  toNameCase,
  toPosition,
  usualFirstName
} from '../lib/normalize';
import type { SourcePosition, SourceStats } from '../lib/source-types';
import { POWER_FORWARD_CM } from './lba-parse';

/**
 * Lectura de stats.basket.gr, la web de estadísticas de la federación griega
 * (proveedor sportstats.gr), para la Elite League, la A2 griega. Sólo parseo,
 * sin red: `hbf.ts` descarga y decide.
 *
 * Es HTML de servidor (ASP.NET) con ids GUID. Los griegos vienen con el
 * nombre legal en mayúsculas griegas («ΠΑΠΑΠΡΩΤΟΣ ΙΩΑΝΝΗΣ») y los
 * extranjeros en latino con todos sus nombres («SMITH JOHN PAUL»),
 * siempre el apellido delante. No hay nacionalidad. El acta va dentro de una
 * llamada JavaScript (`loadDoc("<table…>", "statistics1")`) y trae titulares,
 * minutos exactos, faltas recibidas y el entrenador de cada equipo.
 */

const GUID = /[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/;

function guidAfter(html: string, path: string): string | null {
  return new RegExp(`${path}/id/(${GUID.source})`).exec(html)?.[1]?.toUpperCase() ?? null;
}

function allGuidsAfter(html: string, path: string): string[] {
  return [
    ...new Set(
      [...html.matchAll(new RegExp(`${path}/id/(${GUID.source})`, 'g'))].map((match) =>
        (match[1] ?? '').toUpperCase()
      )
    )
  ];
}

export interface HbfTeamRef {
  teamId: string;
  name: string;
}

/** `/<temporada>/elite-league/teams`: los equipos inscritos. */
export function parseHbfTeams(html: string): HbfTeamRef[] {
  const teams = new Map<string, string>();
  for (const match of html.matchAll(
    new RegExp(`teamdetails/id/(${GUID.source})'\\s+class='fnt14 colorBlack'>([^<]+)<`, 'g')
  )) {
    teams.set((match[1] ?? '').toUpperCase(), decodeEntities(match[2] ?? '').trim());
  }
  return [...teams].map(([teamId, name]) => ({ teamId, name }));
}

export interface HbfStanding {
  rank: number;
  name: string;
  points: number;
  wins: number;
  losses: number;
  games: number;
}

/** `/<temporada>/elite-league/standings`: la clasificación de la liga regular (sin ids: por nombre). */
export function parseHbfStandings(html: string): HbfStanding[] {
  const flat = html.replace(/\s+/g, ' ');
  const pattern =
    /<tr class="[^"]*alCenter"> ?<td><b>(\d+)<\/b><\/td>[\s\S]*?<td> ?([^<]+?) ?<\/td> ?<\/tr> ?<\/table> ?<\/td> ?<td> ?<b>(\d+)<\/b> ?<\/td> ?<td class="mobile"> ?(\d+) ?<\/td> ?<td class="mobile">[^<]*<\/td> ?<td class="mobile"> ?(\d+) ?<\/td> ?<td class="mobile">[^<]*<\/td> ?<td class="mobile"> ?<b>(\d+)<\/b>/g;
  return [...flat.matchAll(pattern)].map((match) => ({
    rank: Number(match[1]),
    name: decodeEntities(match[2] ?? '').trim(),
    points: Number(match[3]),
    wins: Number(match[4]),
    losses: Number(match[5]),
    games: Number(match[6])
  }));
}

export interface HbfRosterPlayer {
  playerId: string;
  /** Tal cual: «ΠΑΠΑΠΡΩΤΟΣ ΙΩΑΝΝΗΣ» o «SMITH JOHN PAUL», apellido delante. */
  fullName: string;
  /** El patronímico (nombre del padre), que la federación publica. */
  fatherName: string | null;
  /** El puesto en griego transliterado del inglés («Σμαλ Φοργουορντ»). */
  position: string | null;
  heightCm: number | null;
  birthDate: string | null;
  shirtNumber: number | null;
}

export interface HbfTeamPage {
  roster: HbfRosterPlayer[];
  /** Los partidos del equipo en la competición (todas las fases). */
  gameIds: string[];
}

/** `/<temporada>/elite-league/teamdetails/id/<guid>`: plantilla y partidos. */
export function parseHbfTeamPage(html: string): HbfTeamPage {
  const roster: HbfRosterPlayer[] = [];
  const seen = new Set<string>();
  for (const block of html.split("<div class='country_roster_team'>").slice(1)) {
    const playerId = guidAfter(block, 'playerdetails');
    const div = (className: string): string | null => {
      const match = new RegExp(`<div class='${className}'>([\\s\\S]*?)</div>`).exec(block);
      const text = match ? textOf(match[1] ?? '') : '';
      return text === '' ? null : text;
    };
    const fullName = div('firstname');
    if (!playerId || !fullName || seen.has(playerId)) continue;
    seen.add(playerId);
    const birth = /<div class='birth'>([^<]*)/.exec(block)?.[1] ?? null;
    roster.push({
      playerId,
      fullName,
      fatherName: div('fnt08em'),
      position: div('position'),
      heightCm: toHeightCm(div('height')),
      birthDate: toIsoDate(birth),
      shirtNumber: toInt(div('num fnt15em'))
    });
  }
  return { roster, gameIds: allGuidsAfter(html, 'gamedetails') };
}

/** Los partidos de una página de calendario (la de playoffs y permanencia, para descartarlos). */
export function parseHbfGameIds(html: string): string[] {
  return allGuidsAfter(html, 'gamedetails');
}

export interface HbfBoxLine {
  teamId: string;
  playerId: string;
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
  fouls: number;
  foulsDrawn: number;
  /** La valoración («EF»). */
  rating: number;
}

export interface HbfGame {
  gameId: string;
  /** `AAAA-MM-DD`. */
  date: string | null;
  venue: string | null;
  homeId: string | null;
  awayId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** El primer entrenador de cada equipo en el acta, tal cual. */
  homeCoach: string | null;
  awayCoach: string | null;
  lines: HbfBoxLine[];
}

/** El texto de un `loadDoc("…", "<destino>")` de la página, ya sin escapes de JavaScript. */
function loadDoc(html: string, target: string): string | null {
  const match = new RegExp(`loadDoc\\("((?:[^"\\\\]|\\\\.)*)",\\s*"${target}"\\)`).exec(html);
  return match ? (match[1] ?? '').replace(/\\(.)/g, '$1') : null;
}

function madeAttempted(html: string): [number, number] {
  const match = /(\d+)\s*\/\s*(\d+)/.exec(textOf(html));
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

function parseBoxTable(table: string, teamId: string): HbfBoxLine[] {
  const body = /<tbody>([\s\S]*)<\/tbody>/.exec(table)?.[1] ?? '';
  return tableRows(body).flatMap((row) => {
    const cells = rowCells(row);
    const playerId = guidAfter(cells[1]?.html ?? '', 'playerdetails');
    if (!playerId || cells.length < 19) return [];
    const int = (index: number): number => toInt(textOf(cells[index]?.html ?? '')) ?? 0;
    const [freeThrowMade, freeThrowAttempted] = madeAttempted(cells[5]?.html ?? '');
    const [twoPointMade, twoPointAttempted] = madeAttempted(cells[6]?.html ?? '');
    const [threePointMade, threePointAttempted] = madeAttempted(cells[7]?.html ?? '');
    const line: HbfBoxLine = {
      teamId,
      playerId,
      name: textOf(cells[1]?.html ?? ''),
      starter: textOf(cells[2]?.html ?? '') === '*',
      seconds: minutesToSeconds(textOf(cells[3]?.html ?? '')),
      points: int(4),
      freeThrowMade,
      freeThrowAttempted,
      twoPointMade,
      twoPointAttempted,
      threePointMade,
      threePointAttempted,
      offensiveRebounds: int(9),
      defensiveRebounds: int(10),
      assists: int(12),
      steals: int(13),
      blocks: int(14),
      turnovers: int(15),
      fouls: int(16),
      foulsDrawn: int(17),
      rating: int(18)
    };
    const played =
      line.seconds > 0 ||
      line.starter ||
      line.points + line.twoPointAttempted + line.threePointAttempted + line.freeThrowAttempted >
        0 ||
      line.offensiveRebounds + line.defensiveRebounds + line.assists + line.fouls > 0;
    return played ? [line] : [];
  });
}

/** `/<temporada>/elite-league/gamedetails/id/<guid>`: el acta de un partido. */
export function parseHbfGame(html: string, gameId: string): HbfGame {
  const statistics = html.slice(Math.max(0, html.indexOf('id="Statistics"')));
  const [homeId = null, awayId = null] = allGuidsAfter(statistics.slice(0, 20_000), 'teamdetails');
  const coaches = [
    ...statistics.matchAll(
      /<div class="coach">\s*<p class="title">Coach<\/p>\s*<ul>\s*<li>([^<]*)<\/li>/g
    )
  ].map((match) => {
    const name = decodeEntities(match[1] ?? '').trim();
    return name === '' ? null : name;
  });
  const reportDate = /sportstats_tournaments_reports\/[^/]+\/(\d{4}-\d{2}-\d{2})__/.exec(html)?.[1];
  const venue =
    loadDoc(html, 'stadiumname')
      ?.replace(/^\s*Γήπεδο:\s*/, '')
      .trim() || null;
  const score = (target: string): number | null => toInt(loadDoc(html, target));
  const lines = [
    ...(homeId ? parseBoxTable(loadDoc(html, 'statistics1') ?? '', homeId) : []),
    ...(awayId ? parseBoxTable(loadDoc(html, 'statistics2') ?? '', awayId) : [])
  ];
  return {
    gameId,
    date: greekLongDate(loadDoc(html, 'gameDate')) ?? reportDate ?? null,
    venue,
    homeId,
    awayId,
    homeScore: score('gameScoreHome'),
    awayScore: score('gameScoreVisitor'),
    homeCoach: coaches[0] ?? null,
    awayCoach: coaches[1] ?? null,
    lines
  };
}

export interface HbfPlayerStats {
  playerId: string;
  teamId: string;
  name: string;
  stats: SourceStats;
}

/** Los totales de cada jugador en cada equipo, sumando sus actas. */
export function aggregateHbfBoxScores(lines: readonly HbfBoxLine[]): HbfPlayerStats[] {
  const byKey = new Map<string, HbfPlayerStats>();
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
          // La federación no da tapones recibidos ni mates.
          blocksReceived: null,
          dunks: null,
          fouls: 0,
          foulsDrawn: 0,
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
    stats.fouls += line.fouls;
    stats.foulsDrawn = (stats.foulsDrawn ?? 0) + line.foulsDrawn;
    stats.rating = (stats.rating ?? 0) + line.rating;
  }
  return [...byKey.values()];
}

/**
 * Los puestos de la federación, que escribe el nombre inglés con letras
 * griegas («Πλειμακερ», «Σμαλ Φοργουορντ»). «Φοργουορντ» a secas (forward) es
 * alero o ala-pívot y se separa por altura como el «Ala» de la LBA: desde
 * `POWER_FORWARD_CM`, ala-pívot. «Γκαρντ» (guard) es escolta.
 */
const HBF_POSITIONS: Record<string, SourcePosition> = {
  pleimaker: 'PG',
  'point gkarnt': 'PG',
  'soutingk gkarnt': 'SG',
  gkarnt: 'SG',
  'smal forgouornt': 'SF',
  'paouer forgouornt': 'PF',
  senter: 'C'
};

export function toHbfPosition(
  raw: string | null | undefined,
  heightCm: number | null | undefined
): SourcePosition | null {
  if (!raw || raw.trim() === '') return null;
  if (!isGreekScript(raw)) return toPosition(raw);
  const key = transliterateGreek(raw)
    .replace(/[^a-z]+/g, ' ')
    .trim();
  if (key === 'forgouornt') return (heightCm ?? 0) >= POWER_FORWARD_CM ? 'PF' : 'SF';
  return HBF_POSITIONS[key] ?? null;
}

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

/**
 * «APELLIDO NOMBRE OTROS» → apellido y nombres (sin partir ni cambiar nada
 * más): el apellido es la primera palabra, con el sufijo si lo lleva («SMITH
 * III JOHN PAUL»).
 */
export function splitSurnameFirst(raw: string): { lastName: string; givenNames: string } {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  let count = 1;
  if (words.length > 2 && SUFFIXES.has((words[1] ?? '').toLowerCase().replace(/\./g, ''))) {
    count = 2;
  }
  return { lastName: words.slice(0, count).join(' '), givenNames: words.slice(count).join(' ') };
}

/**
 * Nombre y apellido de «APELLIDO NOMBRE…» de la federación: los griegos,
 * transliterados y con el nombre de pila de uso (`usual`, la lista a mano:
 * «Ioannis» → «Giannis»); los extranjeros, con el primer nombre de pila, que
 * es el que se usa casi siempre.
 */
export function hbfName(
  raw: string,
  usual: Readonly<Record<string, string>> = {}
): { firstName: string; lastName: string } {
  const { lastName, givenNames } = splitSurnameFirst(raw);
  if (isGreekScript(raw)) {
    const first = usualFirstName(greekNameToLatin(givenNames));
    return { firstName: usual[first] ?? first, lastName: greekNameToLatin(lastName) };
  }
  return { firstName: usualFirstName(toNameCase(givenNames)), lastName: toNameCase(lastName) };
}
