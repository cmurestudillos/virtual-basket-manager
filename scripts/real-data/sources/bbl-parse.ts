import { decodeEntities, rowCells, tableRows, textOf } from '../lib/html';
import { toNationCode } from '../lib/nationalities';
import { minutesToSeconds, toHeightCm, toInt, toPosition, toWeightKg } from '../lib/normalize';
import type { SourcePosition, SourceStats } from '../lib/source-types';

/**
 * Lectura de las dos ligas alemanas: la easyCredit BBL (easycredit-bbl.de) y
 * la ProA (2basketballbundesliga.de). Sólo parseo, sin red: `bbl.ts`
 * descarga y decide.
 *
 * - easycredit-bbl.de es una web Next.js que se pinta en el servidor: cada
 *   página lleva sus datos en `<script id="__NEXT_DATA__">` (un JSON), así que
 *   se lee sin ejecutar nada ni pasar por su API (que pide clave). La página
 *   de un equipo en una temporada (`/teams/<id>/<año>`) trae la plantilla con
 *   fecha, altura, peso, puesto y nacionalidades (ISO de dos letras), el
 *   pabellón con su aforo y la clasificación; la de un partido
 *   (`/spiele/<id>`), el acta completa con el entrenador de cada equipo.
 * - 2basketballbundesliga.de es un WordPress con tablas de servidor; la
 *   temporada se elige con un formulario. La plantilla de un equipo
 *   (`/teams/kader/<id>`) trae el cuerpo técnico, los jugadores y sus
 *   estadísticas de liga regular.
 */

export type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | null =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Los `pageProps` del `__NEXT_DATA__` de una página; `null` si no los hay. */
export function nextPageProps(html: string): JsonObject | null {
  const raw = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    const props = isObject(data) && isObject(data.props) ? data.props.pageProps : null;
    return isObject(props) ? props : null;
  } catch {
    return null;
  }
}

/** Espacios de más fuera y los sufijos escritos a su manera («JR» → «Jr.»). */
export function cleanPersonName(raw: string): string {
  return decodeEntities(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /\b(jr|sr)\.?$/i,
      (_, suffix: string) => `${suffix[0]!.toUpperCase()}${suffix[1]!.toLowerCase()}.`
    );
}

const BBL_POSITIONS: Record<string, SourcePosition> = {
  POINT_GUARD: 'PG',
  SHOOTING_GUARD: 'SG',
  SMALL_FORWARD: 'SF',
  POWER_FORWARD: 'PF',
  CENTER: 'C'
};

/** «POINT_GUARD» (BBL) o «PG» (ProA) → el puesto; `null` si no se reconoce. */
export function bblPosition(raw: string | null | undefined): SourcePosition | null {
  if (!raw) return null;
  return BBL_POSITIONS[raw.trim().toUpperCase()] ?? toPosition(raw);
}

/** La primera nacionalidad reconocida de una lista de códigos ISO de dos letras. */
export function bblNationality(codes: readonly string[]): string | null {
  for (const code of codes) {
    const found = toNationCode(code);
    if (found) return found;
  }
  return null;
}

export interface BblRosterPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  /** Tal cual: «POINT_GUARD»… */
  position: string | null;
  /** Códigos ISO de dos letras, el primero el deportivo. */
  nationalities: string[];
  shirtNumber: number | null;
}

export interface BblCoachRow {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  headCoach: boolean;
}

export interface BblTeamSeason {
  teamId: string;
  seasonId: number | null;
  name: string;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  /** El pabellón principal de esa temporada. */
  venue: { name: string; capacity: number | null } | null;
  players: BblRosterPlayer[];
  /**
   * El cuerpo técnico que publica la web. No sirve para saber quién empezó la
   * temporada (es el de ahora y a veces marca mal al principal), pero sí para
   * la fecha de nacimiento.
   */
  coaches: BblCoachRow[];
}

const isoDate = (value: unknown): string | null => {
  const text = str(value);
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

/** `/teams/<id>/<año>`: plantilla, pabellón, clasificación y cuerpo técnico. */
export function parseBblTeamSeason(html: string): BblTeamSeason | null {
  const props = nextPageProps(html);
  const team = props && isObject(props.seasonTeam) ? props.seasonTeam : null;
  if (!team) return null;
  const standing = isObject(team.mainRoundStanding) ? team.mainRoundStanding : {};
  const venues = list(team.seasonVenues).filter(isObject);
  const main = venues.find((venue) => venue.isMain === true) ?? venues[0];
  return {
    teamId: str(team.id) ?? '',
    seasonId: typeof team.seasonId === 'number' ? team.seasonId : null,
    name: cleanPersonName(str(team.name) ?? ''),
    rank: toInt(str(standing.rank)),
    wins: toInt(str(standing.totalVictories)),
    losses: toInt(str(standing.totalLosses)),
    venue: main
      ? { name: cleanPersonName(str(main.name) ?? ''), capacity: toInt(str(main.capacity)) }
      : null,
    players: list(team.players)
      .filter(isObject)
      .map((player) => ({
        playerId: str(player.id) ?? '',
        firstName: cleanPersonName(str(player.firstName) ?? ''),
        lastName: cleanPersonName(str(player.lastName) ?? ''),
        birthDate: isoDate(player.birthDate),
        heightCm: toHeightCm(str(player.height)),
        weightKg: toWeightKg(str(player.weight)),
        position: str(player.position),
        nationalities: list(player.nationalities).flatMap((code) => str(code) ?? []),
        shirtNumber: toInt(str(player.shirtNumber))
      }))
      .filter((player) => player.playerId !== ''),
    coaches: list(team.coaches)
      .filter(isObject)
      .map((coach) => ({
        firstName: cleanPersonName(str(coach.firstName) ?? ''),
        lastName: cleanPersonName(str(coach.lastName) ?? ''),
        birthDate: isoDate(coach.birthDate),
        headCoach: coach.isHeadCoach === true
      }))
  };
}

export interface BblBoxLine {
  teamId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  seconds: number;
  starter: boolean;
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
  rating: number;
}

export interface BblGame {
  gameId: string;
  seasonId: number | null;
  /** «MAIN_ROUND» es la liga regular; «PLAYINS», «ROUND_OF_8»… los playoffs. */
  stage: string | null;
  matchDay: number | null;
  /** Fecha y hora UTC de la web. */
  scheduledTime: string | null;
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  homeCoach: string | null;
  awayCoach: string | null;
  lines: BblBoxLine[];
}

/**
 * `/spiele/<id>`: el acta. `null` si la página no tiene partido (los ids que no
 * existen dan una página de error) o todavía no tiene estadísticas.
 */
export function parseBblGame(html: string): BblGame | null {
  const props = nextPageProps(html);
  if (!props) return null;
  const data = isObject(props.initialGameData) ? props.initialGameData : null;
  const stats = isObject(props.initialGameStats) ? props.initialGameStats : null;
  if (!data || !stats) return null;
  const home = isObject(stats.homeTeam) ? stats.homeTeam : null;
  const away = isObject(stats.guestTeam) ? stats.guestTeam : null;
  if (!home || !away) return null;
  const result = isObject(data.result) ? data.result : {};
  const linesOf = (side: JsonObject): BblBoxLine[] => {
    const teamId = str(side.id) ?? '';
    return list(side.playerStats)
      .filter(isObject)
      .flatMap((row) => {
        const player = isObject(row.seasonPlayer) ? row.seasonPlayer : null;
        const playerId = player ? str(player.id) : null;
        if (!player || !playerId) return [];
        return [
          {
            teamId,
            playerId,
            firstName: cleanPersonName(str(player.firstName) ?? ''),
            lastName: cleanPersonName(str(player.lastName) ?? ''),
            seconds: num(row.secondsPlayed),
            starter: row.isStartingFive === true,
            points: num(row.points),
            twoPointMade: num(row.twoPointShotsMade),
            twoPointAttempted: num(row.twoPointShotsAttempted),
            threePointMade: num(row.threePointShotsMade),
            threePointAttempted: num(row.threePointShotsAttempted),
            freeThrowMade: num(row.freeThrowsMade),
            freeThrowAttempted: num(row.freeThrowsAttempted),
            offensiveRebounds: num(row.offensiveRebounds),
            defensiveRebounds: num(row.defensiveRebounds),
            assists: num(row.assists),
            steals: num(row.steals),
            turnovers: num(row.turnovers),
            blocks: num(row.blocks),
            fouls: num(row.foulsCommitted),
            foulsDrawn: num(row.foulsReceived),
            rating: num(row.efficiency)
          }
        ];
      });
  };
  const coach = (side: JsonObject): string | null => {
    const name = cleanPersonName(str(side.headCoachName) ?? '');
    return name === '' ? null : name;
  };
  const score = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    gameId: str(data.id) ?? '',
    seasonId: typeof data.seasonId === 'number' ? data.seasonId : null,
    stage: str(data.stage),
    matchDay: typeof data.matchDay === 'number' ? data.matchDay : null,
    scheduledTime: str(data.scheduledTime),
    homeId: str(home.id) ?? '',
    awayId: str(away.id) ?? '',
    homeScore: score(result.homeTeamFinalScore),
    awayScore: score(result.guestTeamFinalScore),
    homeCoach: coach(home),
    awayCoach: coach(away),
    lines: [...linesOf(home), ...linesOf(away)]
  };
}

export interface BblPlayerStats {
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
    blocksReceived: null,
    dunks: null,
    fouls: 0,
    foulsDrawn: 0,
    rating: 0
  };
}

/**
 * Suma las actas por jugador y equipo. Cuenta como partido jugado el que tiene
 * minutos (el acta trae también a los que no salieron, con todo a cero).
 */
export function aggregateBblBoxScores(lines: readonly BblBoxLine[]): BblPlayerStats[] {
  const byKey = new Map<string, BblPlayerStats>();
  for (const line of lines) {
    const played = line.seconds > 0;
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
    const stats = entry.stats;
    if (played) stats.games += 1;
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
    stats.fouls += line.fouls;
    stats.foulsDrawn = (stats.foulsDrawn ?? 0) + line.foulsDrawn;
    stats.rating = (stats.rating ?? 0) + line.rating;
  }
  return [...byKey.values()];
}

/** «Nombre Apellido» de un acta partido por la primera palabra. */
export function splitCoachName(full: string): { firstName: string; lastName: string } {
  const words = cleanPersonName(full).split(' ').filter(Boolean);
  if (words.length <= 1) return { firstName: '', lastName: words[0] ?? '' };
  return { firstName: words[0] ?? '', lastName: words.slice(1).join(' ') };
}

/* ------------------------------------------------------------------ ProA */

export interface ProaPerson {
  /** Id de persona de la liga (el de su ficha). */
  personId: string | null;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  /** «Trainer», «Co-Trainer» en el cuerpo técnico; el puesto en la plantilla. */
  role: string;
  /** Código ISO de dos letras de la bandera. */
  flag: string | null;
  /** El país de la bandera, en alemán. */
  country: string | null;
  heightCm: number | null;
  weightKg: number | null;
  shirtNumber: number | null;
}

export interface ProaStatsRow {
  personId: string | null;
  /** Sin el dorsal: «Nombre Apellido». */
  name: string;
  stats: SourceStats;
}

export interface ProaKader {
  /** El nombre del equipo en su tabla de totales. */
  teamName: string | null;
  staff: ProaPerson[];
  players: ProaPerson[];
  stats: ProaStatsRow[];
  /** Los partidos de liga regular del calendario del equipo. */
  games: { home: string; away: string; homeScore: number | null; awayScore: number | null }[];
}

function tableById(html: string, id: string): string {
  const re = new RegExp(`<table[^>]*id=["']${id}["'][\\s\\S]*?</table>`, 'i');
  return re.exec(html)?.[0] ?? '';
}

const personIdOf = (cellHtml: string): string | null =>
  /\/spieler\/(\d+)/i.exec(cellHtml)?.[1] ?? null;

/** Quita la marca de formado en Alemania («Apellido *») y los iconos. */
const cleanProaName = (cellHtml: string): string =>
  cleanPersonName(textOf(cellHtml).replace(/\*/g, ''));

function personRow(cells: { html: string }[], offset: number, withBody: boolean): ProaPerson {
  const cell = (index: number): string => cells[index + offset]?.html ?? '';
  const birth = /(\d{2})\.(\d{2})\.(\d{4})/.exec(textOf(cell(3)));
  const flagHtml = cell(withBody ? 8 : 6);
  return {
    personId: personIdOf(cell(0)) ?? personIdOf(cell(1)),
    firstName: cleanProaName(cell(0)),
    lastName: cleanProaName(cell(1)),
    birthDate: birth ? `${birth[3]}-${birth[2]}-${birth[1]}` : null,
    role: textOf(cell(withBody ? 7 : 5)),
    flag: /flag-icon-([a-z]{2})\b/i.exec(flagHtml)?.[1]?.toUpperCase() ?? null,
    country: decodeEntities(/title=['"]([^'"]*)['"]/.exec(flagHtml)?.[1] ?? '') || null,
    heightCm: withBody ? toHeightCm(textOf(cell(5))) : null,
    weightKg: withBody ? toWeightKg(textOf(cell(6))) : null,
    shirtNumber: null
  };
}

/** «138 - 263» (y lo que venga detrás) → [138, 263]. */
function pairOf(cellHtml: string): [number, number, number | null] {
  const first = textOf(cellHtml.split(/<br\s*\/?>/i)[0] ?? '');
  const numbers = [...first.matchAll(/-?\d+/g)].map((match) => Number(match[0]));
  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? null];
}

const totalOf = (cellHtml: string): number => pairOf(cellHtml)[0];

/**
 * `/teams/kader/<id>` con la temporada elegida: cuerpo técnico (`#trainer`),
 * plantilla (`#kader`), estadísticas de liga regular (`#stats`, la vista por
 * defecto es «Hauptrunde») y calendario.
 */
export function parseProaKader(html: string): ProaKader {
  // Fuera los scripts y los comentarios: la fila de estadísticas lleva dentro
  // una celda de rebotes antigua comentada.
  const page = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const staff = tableRows(tableById(page, 'trainer'))
    .map(rowCells)
    .filter((cells) => cells.length >= 7)
    .map((cells) => personRow(cells, 0, false));
  const players = tableRows(tableById(page, 'kader'))
    .map(rowCells)
    .filter((cells) => cells.length >= 10)
    .map((cells) => ({
      ...personRow(cells, 1, true),
      shirtNumber: toInt(textOf(cells[0]?.html ?? ''))
    }));

  const stats: ProaStatsRow[] = [];
  for (const row of tableRows(tableById(page, 'stats'))) {
    const cells = rowCells(row);
    const byClass = (name: string): string =>
      cells.find((cell) => cell.className.split(/\s+/).includes(name))?.html ?? '';
    const playerCell = byClass('td-player');
    const personId = personIdOf(playerCell);
    if (!personId) continue;
    const [twoMade, twoAttempted] = pairOf(byClass('td-2p'));
    const [threeMade, threeAttempted] = pairOf(byClass('td-3p'));
    const [ftMade, ftAttempted] = pairOf(byClass('td-ft'));
    const [offensive, defensive] = pairOf(byClass('td-reb'));
    stats.push({
      personId,
      name: cleanPersonName(textOf(playerCell).replace(/^#\s*\d*\s*/, '')),
      stats: {
        games: totalOf(byClass('td-games')),
        starts: null,
        seconds: minutesToSeconds(textOf(byClass('td-min').split(/<br\s*\/?>/i)[0] ?? '')),
        points: totalOf(byClass('td-pts')),
        twoPointMade: twoMade,
        twoPointAttempted: twoAttempted,
        threePointMade: threeMade,
        threePointAttempted: threeAttempted,
        freeThrowMade: ftMade,
        freeThrowAttempted: ftAttempted,
        offensiveRebounds: offensive,
        defensiveRebounds: defensive,
        assists: totalOf(byClass('td-ass')),
        steals: totalOf(byClass('td-st')),
        turnovers: totalOf(byClass('td-to')),
        blocks: totalOf(byClass('td-bl')),
        blocksReceived: null,
        dunks: null,
        fouls: totalOf(byClass('td-fls')),
        foulsDrawn: null,
        rating: totalOf(byClass('td-eff'))
      }
    });
  }

  // La tabla de totales del equipo: la primera fila es el equipo, la segunda el rival.
  const totalsTable = [...page.matchAll(/<table[\s\S]*?<\/table>/gi)]
    .map((match) => match[0])
    .find((table) => />\s*Gegner\s*</.test(table));
  const teamRow = totalsTable ? rowCells(tableRows(totalsTable)[1] ?? '') : [];
  const teamName = teamRow.length > 0 ? textOf(teamRow[0]?.html ?? '') || null : null;

  const games: ProaKader['games'] = [];
  for (const row of tableRows(page)) {
    const cells = rowCells(row).map((cell) => textOf(cell.html));
    if (!cells.some((text) => /^Runde HR$/.test(text))) continue;
    const field = (label: string): string =>
      cells.find((text) => text.startsWith(`${label} `))?.slice(label.length + 1) ?? '';
    const score = /(\d+)\s*:\s*(\d+)/.exec(field('Ergebnis'));
    games.push({
      home: field('Heim'),
      away: field('Gast'),
      homeScore: score ? Number(score[1]) : null,
      awayScore: score ? Number(score[2]) : null
    });
  }
  return { teamName, staff, players, stats, games };
}

/**
 * El nombre del equipo en su propio calendario: el que sale en todos los
 * partidos. No siempre es el de la tabla de totales, que lleva el patrocinador
 * de hoy.
 */
export function proaCalendarName(games: ProaKader['games']): string | null {
  const counts = new Map<string, number>();
  for (const game of games) {
    for (const name of [game.home, game.away]) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [name, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) best = name;
  }
  return best;
}

/** Victorias y derrotas de un equipo en su calendario de liga regular. */
export function proaRecord(
  games: ProaKader['games'],
  teamName: string
): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const game of games) {
    if (game.homeScore === null || game.awayScore === null) continue;
    const home = game.home === teamName;
    if (!home && game.away !== teamName) continue;
    const won = home ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
    if (won) wins += 1;
    else losses += 1;
  }
  return { wins, losses };
}

export interface ProaPlayerPage {
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  /** En alemán: «Vereinigte Staaten von Amerika». */
  country: string | null;
}

/** La ficha de una persona (`/teams/kader/spieler/<id>`): «Vorname: …», «Geburtstag: …». */
export function parseProaPlayerPage(html: string): ProaPlayerPage {
  const text = textOf(html.replace(/<script[\s\S]*?<\/script>/gi, ''));
  const LABELS =
    'Vorname|Nachname|Team|Position|Nummer|Geburtstag|Alter|Größe|Gewicht|Nationalität|Im Verein seit|Stationen';
  const field = (label: string): string | null => {
    const re = new RegExp(`${label}:\\s*(.*?)\\s*(?=(?:${LABELS}):|$)`);
    const value = re.exec(text)?.[1]?.trim();
    return value ? value : null;
  };
  const birth = /(\d{2})\.(\d{2})\.(\d{4})/.exec(field('Geburtstag') ?? '');
  return {
    firstName: field('Vorname'),
    lastName: field('Nachname'),
    position: field('Position'),
    birthDate: birth ? `${birth[3]}-${birth[2]}-${birth[1]}` : null,
    heightCm: toHeightCm(field('Größe')),
    weightKg: toWeightKg(field('Gewicht')),
    country: field('Nationalität')
  };
}

/** Los países que la ProA escribe en alemán y el código COI; lo demás, por el ISO de la bandera. */
const GERMAN_COUNTRIES: Record<string, string> = {
  deutschland: 'GER',
  'vereinigte staaten von amerika': 'USA',
  kanada: 'CAN',
  niederlande: 'NED',
  kroatien: 'CRO',
  slowenien: 'SLO',
  dänemark: 'DEN',
  serbien: 'SRB',
  schweden: 'SWE',
  österreich: 'AUT',
  griechenland: 'GRE',
  slowakei: 'SVK',
  ukraine: 'UKR',
  irland: 'IRL',
  neuseeland: 'NZL',
  frankreich: 'FRA',
  schweiz: 'SUI',
  türkei: 'TUR',
  litauen: 'LTU',
  italien: 'ITA',
  spanien: 'ESP',
  finnland: 'FIN',
  polen: 'POL',
  tschechien: 'CZE',
  belgien: 'BEL',
  großbritannien: 'GBR',
  england: 'GBR',
  nigeria: 'NGR',
  australien: 'AUS',
  lettland: 'LAT',
  estland: 'EST',
  ungarn: 'HUN',
  bosnien: 'BIH',
  'bosnien und herzegowina': 'BIH',
  montenegro: 'MNE',
  nordmazedonien: 'MKD',
  israel: 'ISR',
  norwegen: 'NOR',
  portugal: 'POR',
  brasilien: 'BRA',
  kamerun: 'CMR',
  senegal: 'SEN',
  ghana: 'GHA',
  jamaika: 'JAM'
};

/** La nacionalidad de la ProA: el ISO de la bandera o, si no, el país en alemán. */
export function proaNationality(flag: string | null, country: string | null): string | null {
  if (flag) {
    const byFlag = toNationCode(flag);
    if (byFlag) return byFlag;
  }
  if (!country) return null;
  return GERMAN_COUNTRIES[country.trim().toLowerCase()] ?? toNationCode(country);
}

/**
 * El nombre de uso a partir del de la ProA, que da los nombres de pila
 * legales («Nombre Segundo Apellido»): el primero, salvo lo que se ponga a
 * mano.
 */
export function proaFirstName(raw: string): string {
  return cleanPersonName(raw).split(' ')[0] ?? '';
}
