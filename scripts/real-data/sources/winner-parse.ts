import { decodeEntities, rowCells, tableRows, textOf } from '../lib/html';
import { nationFromIso3 } from '../lib/nationalities';
import { toHeightCm, toIsoDate } from '../lib/normalize';
import type { SourcePlayer, SourcePosition, SourceStats, SourceTeam } from '../lib/source-types';
import { POWER_FORWARD_CM } from './lba-parse';

/**
 * Lectura de basket.co.il, la web oficial de la liga israelí (Ligat Winner),
 * en su versión inglesa (`&lang=en`): HTML de servidor de ASP clásico, sin API.
 *
 * - La clasificación (`table.asp`), con el `TeamId` de cada club en esa
 *   temporada (los ids cambian de una temporada a otra).
 * - La página de cada equipo (`team.asp`): la plantilla con puesto, altura y
 *   fecha de nacimiento, los que se fueron y el pabellón con su aforo.
 * - El acta de cada partido (`game-zone.asp`): jornada, fecha, pabellón,
 *   tanteo, el entrenador de cada equipo y la estadística de cada jugador,
 *   con titulares, rebotes de ataque y defensa, faltas hechas y recibidas y
 *   tapones puestos y recibidos. Los minutos vienen redondeados.
 * - La ficha del jugador (`player.asp`): la nacionalidad (o las dos) con su
 *   código ISO de tres letras.
 *
 * El `PlayerId` de la web es del jugador en un equipo y una temporada: quien
 * cambia de club lleva un id distinto en cada uno.
 */

/* ------------------------------------------------------------ nombres */

export interface WinnerName {
  firstName: string;
  lastName: string;
  /** El apodo que la web pone entre comillas («Nombre "Apodo" Apellido»). */
  nickname: string | null;
}

/** Primera letra en mayúscula si la web la dejó en minúscula («apellido» → «Apellido»). */
function capitalizeFirst(word: string): string {
  return word.length > 0 && word[0] === word[0]?.toLowerCase() && word[0] !== word[0]?.toUpperCase()
    ? word[0].toUpperCase() + word.slice(1)
    : word;
}

/**
 * Nombre y apellido tal y como los separa la web, sin espacios de sobra, con
 * el apodo entre comillas aparte y la primera letra en mayúscula.
 */
export function cleanWinnerName(first: string, last: string): WinnerName {
  const clean = (text: string): string => decodeEntities(text).replace(/\s+/g, ' ').trim();
  let firstName = clean(first);
  let lastName = clean(last);
  let nickname: string | null = null;
  const quoted = /["“”]([^"“”]+)["“”]/;
  for (const part of ['first', 'last'] as const) {
    const text = part === 'first' ? firstName : lastName;
    const match = quoted.exec(text);
    if (!match) continue;
    nickname = match[1]?.trim() || null;
    const without = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
    if (part === 'first') firstName = without;
    else lastName = without;
  }
  return {
    firstName: firstName.split(' ').map(capitalizeFirst).join(' '),
    lastName: lastName.split(' ').map(capitalizeFirst).join(' '),
    nickname
  };
}

/** Un nombre completo («Nombre Apellido») partido por la primera palabra, como las actas. */
export function splitWinnerFullName(full: string): WinnerName {
  const words = decodeEntities(full).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= 1) return cleanWinnerName('', words[0] ?? '');
  // El apodo entre comillas va con el nombre de pila.
  const quoteEnd = words.findIndex((word, index) => index > 0 && /["”]$/.test(word));
  const cut = /^["“]/.test(words[1] ?? '') && quoteEnd > 0 ? quoteEnd + 1 : 1;
  return cleanWinnerName(words.slice(0, cut).join(' '), words.slice(cut).join(' '));
}

/* --------------------------------------------------- puestos y países */

/**
 * Los puestos de la web en PG/SG/SF/PF/C. La web sólo distingue base (PG),
 * exterior (G), alero-escolta (G-F), alero o ala-pívot (F), ala-pívot-pívot
 * (F-C, a veces «F/C») y pívot (C); como en la LBA, «F» se separa por altura: desde
 * `POWER_FORWARD_CM` es ala-pívot.
 */
export function winnerPosition(
  raw: string | null | undefined,
  heightCm: number | null | undefined
): SourcePosition | null {
  const key = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '').replace('/', '-');
  switch (key) {
    case 'PG':
      return 'PG';
    case 'G':
    case 'SG':
      return 'SG';
    case 'G-F':
    case 'SF':
      return 'SF';
    case 'F':
      return (heightCm ?? 0) >= POWER_FORWARD_CM ? 'PF' : 'SF';
    case 'F-C':
    case 'PF':
      return 'PF';
    case 'C':
      return 'C';
    default:
      return null;
  }
}

/** La nacionalidad deportiva: la primera que da la ficha, de su código ISO de tres letras. */
export function winnerNationality(codes: readonly string[]): string | null {
  for (const code of codes) {
    const nation = nationFromIso3(code);
    if (nation) return nation;
  }
  return null;
}

/* ------------------------------------------------------ clasificación */

export interface WinnerStanding {
  rank: number;
  teamId: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
}

/** La tabla de `table.asp`: la primera fila de cada equipo (la de la clasificación general). */
export function parseWinnerStandings(html: string): WinnerStanding[] {
  const rows: WinnerStanding[] = [];
  const seen = new Set<string>();
  for (const row of tableRows(html)) {
    const cells = rowCells(row);
    const link = /team\.asp\?TeamId=(\d+)/i.exec(cells[1]?.html ?? '');
    if (!link?.[1] || seen.has(link[1])) continue;
    const numbers = cells.map((cell) => Number(textOf(cell.html)));
    const [rank, , , games, wins, losses] = numbers;
    if (![rank, games, wins, losses].every((value) => Number.isInteger(value))) continue;
    seen.add(link[1]);
    rows.push({
      rank: rank as number,
      teamId: link[1],
      name: textOf(cells[1]?.html ?? ''),
      games: games as number,
      wins: wins as number,
      losses: losses as number
    });
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

/* ------------------------------------------------------------- equipo */

export type WinnerRosterSection = 'plantilla' | 'inactivo' | 'baja';

export interface WinnerRosterPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  shirtNumber: number | null;
  /** Tal cual: «PG», «G», «G-F», «F», «F-C», «C». */
  positionRaw: string | null;
  heightCm: number | null;
  birthDate: string | null;
  section: WinnerRosterSection;
}

export interface WinnerTeamPage {
  /** El nombre comercial de la temporada («Club Patrocinador Ciudad»). */
  name: string | null;
  players: WinnerRosterPlayer[];
  /** El pabellón y su aforo («Places»), si la web los da. */
  arena: { name: string | null; capacity: number | null };
}

const SECTION_TITLES: Record<string, WinnerRosterSection> = {
  players: 'plantilla',
  'inactive players': 'inactivo',
  'released players': 'baja'
};

export function parseWinnerTeamPage(html: string): WinnerTeamPage {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
  const name = decodeEntities(title).split('|')[2]?.trim() || null;

  // Los títulos de sección y los jugadores, en el orden en que salen.
  const players: WinnerRosterPlayer[] = [];
  const pattern =
    /<div class="role_title[^"]*">([^<]*)<\/div>|<div class="box_role">\s*<a href="player\.asp\?PlayerId=(\d+)[^"]*">([\s\S]*?)<\/a>\s*<\/div>/gi;
  let section: WinnerRosterSection | null = null;
  for (const match of html.matchAll(pattern)) {
    if (match[1] !== undefined) {
      section = SECTION_TITLES[textOf(match[1]).toLowerCase()] ?? null;
      continue;
    }
    if (!section || !match[2]) continue;
    const body = match[3] ?? '';
    const nameHtml = /role_name[^"]*">([\s\S]*?)<\/div>/i.exec(body)?.[1] ?? '';
    const [first = '', last = ''] = nameHtml.split(/<br\s*\/?>/i).map((part) => textOf(part));
    const number = /role_num[^"]*">([^<]*)<\/div>/i.exec(body)?.[1]?.trim() ?? '';
    const descHtml = /role_desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(body)?.[1] ?? '';
    const strong = /<strong>([\s\S]*?)<\/strong>/i.exec(descHtml)?.[1] ?? '';
    const [positionText = '', heightText = ''] = textOf(strong)
      .split('|')
      .map((part) => part.trim());
    const cleaned = cleanWinnerName(first, last);
    players.push({
      playerId: match[2],
      ...cleaned,
      shirtNumber: /^\d+$/.test(number) ? Number(number) : null,
      positionRaw: positionText || null,
      heightCm: toHeightCm(heightText),
      birthDate: toIsoDate(textOf(descHtml)),
      section
    });
  }

  const arenaName = /<div class="arena_title">([\s\S]*?)<\/div>/i.exec(html)?.[1];
  const places = /Places:(?:&nbsp;|\s)*(\d+)/i.exec(html)?.[1];
  return {
    name,
    players,
    arena: {
      name: arenaName ? textOf(arenaName) || null : null,
      capacity: places ? Number(places) : null
    }
  };
}

/* --------------------------------------------------------------- acta */

export interface WinnerBoxLine {
  playerId: string;
  teamId: string;
  firstName: string;
  lastName: string;
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
  fouls: number;
  foulsDrawn: number;
  steals: number;
  turnovers: number;
  assists: number;
  blocks: number;
  blocksReceived: number;
  rating: number;
}

export interface WinnerCoachLine {
  coachId: string | null;
  name: string;
}

export interface WinnerGame {
  gameId: string;
  /** «League Game 12» → 12; `null` si el acta no es de liga. */
  round: number | null;
  /** `AAAA-MM-DD`. */
  date: string | null;
  /** Pabellón (y ciudad) tal cual la cabecera. */
  venue: string | null;
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  homeCoach: WinnerCoachLine | null;
  awayCoach: WinnerCoachLine | null;
  lines: WinnerBoxLine[];
}

function made(text: string): [number, number] {
  const match = /(\d+)\s*\/\s*(\d+)/.exec(text);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

function num(text: string | undefined): number {
  const value = Number((text ?? '').trim());
  return Number.isFinite(value) ? value : 0;
}

/** Una tabla de equipo del acta: su id, su entrenador y las filas de jugadores. */
function parseBoxTable(tableHtml: string): {
  teamId: string;
  coach: WinnerCoachLine | null;
  lines: WinnerBoxLine[];
} | null {
  const head = /<td class="round_break[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(tableHtml)?.[1] ?? '';
  const teamId = /team\.asp\?TeamId=(\d+)/i.exec(head)?.[1];
  if (!teamId) return null;
  const coachMatch = /(?:CoachId=(\d+)[^>]*>)?\s*Coach:\s*([^<]*)/i.exec(head);
  const coachName = coachMatch ? decodeEntities(coachMatch[2] ?? '').trim() : '';
  const coach = coachName ? { coachId: coachMatch?.[1] ?? null, name: coachName } : null;

  const lines: WinnerBoxLine[] = [];
  for (const row of tableRows(tableHtml)) {
    const cells = rowCells(row);
    const playerId = /player\.asp\?PlayerId=(\d+)/i.exec(cells[1]?.html ?? '')?.[1];
    if (!playerId || cells.length < 22) continue;
    const text = cells.map((cell) => textOf(cell.html));
    const name = splitWinnerFullName(text[1] ?? '');
    const [twoMade, twoAttempted] = made(text[5] ?? '');
    const [threeMade, threeAttempted] = made(text[7] ?? '');
    const [freeMade, freeAttempted] = made(text[9] ?? '');
    lines.push({
      playerId,
      teamId,
      firstName: name.firstName,
      lastName: name.lastName,
      starter: (text[2] ?? '').includes('*'),
      seconds: num(text[3]) * 60,
      points: num(text[4]),
      twoPointMade: twoMade,
      twoPointAttempted: twoAttempted,
      threePointMade: threeMade,
      threePointAttempted: threeAttempted,
      freeThrowMade: freeMade,
      freeThrowAttempted: freeAttempted,
      defensiveRebounds: num(text[11]),
      offensiveRebounds: num(text[12]),
      fouls: num(text[14]),
      foulsDrawn: num(text[15]),
      steals: num(text[16]),
      turnovers: num(text[17]),
      assists: num(text[18]),
      blocks: num(text[19]),
      blocksReceived: num(text[20]),
      rating: num(text[21])
    });
  }
  return { teamId, coach, lines };
}

/**
 * El acta de `game-zone.asp`. Las dos tablas de equipo van en orden: la
 * primera es la del de casa. `null` si no trae las dos.
 */
export function parseWinnerGame(html: string, gameId: string): WinnerGame | null {
  const tables = [...html.matchAll(/<table class="stats_tbl">([\s\S]*?)<\/table>/gi)]
    .map((match) => parseBoxTable(match[1] ?? ''))
    .filter((table): table is NonNullable<typeof table> => table !== null);
  const [home, away] = tables;
  if (!home || !away) return null;

  const title = /<h4 class="en">([\s\S]*?)<\/h4>/i.exec(html)?.[1] ?? '';
  const round = /League Game (\d+)/i.exec(textOf(title))?.[1];
  const header = textOf(/<h5 class="en">([\s\S]*?)<\/h5>/i.exec(html)?.[1] ?? '');
  const date = toIsoDate(header);
  // «Pabellón, Ciudad, Domingo , 12/10/2025, 13:00»: lo de antes del día de la semana.
  const venue =
    header
      .replace(/,?\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)[\s\S]*$/i, '')
      .replace(/,\s*$/, '')
      .trim() || null;
  // El marcador se escribe para leerse de derecha a izquierda: «visitante:local».
  const score = /id="gz_result"[^>]*>\s*(\d+)\s*:\s*(\d+)/i.exec(html);
  return {
    gameId,
    round: round ? Number(round) : null,
    date,
    venue,
    homeId: home.teamId,
    awayId: away.teamId,
    homeScore: score ? Number(score[2]) : null,
    awayScore: score ? Number(score[1]) : null,
    homeCoach: home.coach,
    awayCoach: away.coach,
    lines: [...home.lines, ...away.lines]
  };
}

export interface WinnerPlayerStats {
  playerId: string;
  teamId: string;
  firstName: string;
  lastName: string;
  stats: SourceStats;
}

function emptyStats(): SourceStats {
  return {
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
    foulsDrawn: 0,
    rating: 0
  };
}

/**
 * Suma las líneas de las actas por jugador y equipo. Cuenta como jugado un
 * partido con minutos o con algo en la estadística (los minutos van
 * redondeados y quien sale unos segundos puede quedarse en cero).
 */
export function aggregateWinnerBoxScores(lines: readonly WinnerBoxLine[]): WinnerPlayerStats[] {
  const byKey = new Map<string, WinnerPlayerStats>();
  for (const line of lines) {
    const played =
      line.seconds > 0 ||
      line.starter ||
      line.points + line.twoPointAttempted + line.threePointAttempted + line.freeThrowAttempted >
        0 ||
      line.offensiveRebounds + line.defensiveRebounds + line.assists + line.steals > 0 ||
      line.turnovers + line.blocks + line.fouls + line.foulsDrawn > 0;
    const key = `${line.playerId}|${line.teamId}`;
    let entry = byKey.get(key);
    if (!entry) {
      if (!played) continue;
      entry = {
        playerId: line.playerId,
        teamId: line.teamId,
        firstName: line.firstName,
        lastName: line.lastName,
        stats: emptyStats()
      };
      byKey.set(key, entry);
    }
    if (!played) continue;
    const stats = entry.stats;
    stats.games += 1;
    if (line.starter) stats.starts = (stats.starts ?? 0) + 1;
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
    stats.foulsDrawn = (stats.foulsDrawn ?? 0) + line.foulsDrawn;
    stats.rating = (stats.rating ?? 0) + line.rating;
  }
  return [...byKey.values()];
}

/* ------------------------------------------------------------- ficha */

export interface WinnerPlayerPage {
  firstName: string;
  lastName: string;
  nickname: string | null;
  shirtNumber: number | null;
  /** Códigos ISO de tres letras, en el orden de la web. */
  nationalityCodes: string[];
  /** Los países tal cual («Israel (ISR), United States (USA)»). */
  nationalityRaw: string | null;
  positionRaw: string | null;
  heightCm: number | null;
  birthDate: string | null;
}

/** La ficha de `player.asp`; `null` si no es una ficha de jugador. */
export function parseWinnerPlayerPage(html: string): WinnerPlayerPage | null {
  const info = /<div class="p_info[^"]*">([\s\S]*?)<\/div>/i.exec(html)?.[1];
  if (!info) return null;
  const field = (label: string): string | null => {
    const match = new RegExp(
      `<span class="p_info_title">${label}:(?:&nbsp;|\\s)*</span>([\\s\\S]*?)(?:<br\\s*/?>|$)`,
      'i'
    ).exec(info);
    return match ? textOf(match[1] ?? '') || null : null;
  };
  const nationality = field('Nationality');
  const codes = [...(nationality ?? '').matchAll(/\(([A-Z]{3})\)/g)].map((match) => match[1] ?? '');
  const first = /<div class="p_first_name[^"]*">([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? '';
  const last = /<div class="p_last_name[^"]*">([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? '';
  const number = textOf(/<div class="p_num">([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? '');
  const height = field('Height');
  return {
    ...cleanWinnerName(textOf(first), textOf(last)),
    shirtNumber: /^\d+$/.test(number) ? Number(number) : null,
    nationalityCodes: codes,
    nationalityRaw: nationality,
    positionRaw: field('Position'),
    heightCm: toHeightCm(height),
    birthDate: toIsoDate(field('Birth Date'))
  };
}

/* ------------------------------------------------------ traspasados */

function plainName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/**
 * El `PlayerId` de la web es de un jugador en un equipo: quien cambió de club
 * a mitad de temporada tiene uno en cada uno. Para que el montaje le deje en
 * un solo equipo (el de más minutos), todos sus ids pasan a ser el primero,
 * reconociéndole por nombre y fecha de nacimiento. Si una de sus fichas no
 * trae la nacionalidad, se toma la de la otra.
 */
export function unifyTransferred(
  teams: readonly SourceTeam[],
  warn: (message: string) => void
): void {
  const canonical = new Map<string, string>();
  const key = (player: SourcePlayer): string | null =>
    player.birthDate
      ? `${plainName(`${player.firstName}${player.lastName}`)}|${player.birthDate}`
      : null;
  for (const player of teams.flatMap((team) => team.players)) {
    const id = key(player);
    if (!id) continue;
    const current = canonical.get(id);
    if (!current || Number(player.sourceId) < Number(current)) canonical.set(id, player.sourceId);
  }
  for (const team of teams) {
    for (const player of team.players) {
      const id = key(player);
      const target = id ? canonical.get(id) : undefined;
      if (target && target !== player.sourceId) {
        warn(
          `${team.name}: ${player.firstName} ${player.lastName} (${player.sourceId}) es el mismo que ${target}`
        );
        player.sourceId = target;
      }
    }
  }
  // La nacionalidad que falta en una de sus fichas, de la otra.
  const nationalities = new Map<string, SourcePlayer>();
  for (const player of teams.flatMap((team) => team.players)) {
    if (player.nationality && !nationalities.has(player.sourceId)) {
      nationalities.set(player.sourceId, player);
    }
  }
  for (const player of teams.flatMap((team) => team.players)) {
    const other = player.nationality ? undefined : nationalities.get(player.sourceId);
    if (other) {
      player.nationality = other.nationality;
      player.nationalityRaw = other.nationalityRaw;
    }
  }
}
