import { decodeEntities, rowCells, tableRows, textOf } from '../lib/html';
import { normalizeCountryText, toNationCode } from '../lib/nationalities';
import { toHeightCm, toPosition, toWeightKg } from '../lib/normalize';
import type { SourcePosition } from '../lib/source-types';
import type { BoxNumbers } from './lkl-parse';

/**
 * Lectura de la segunda división lituana, la NKL, de dos webs que comparten
 * los ids de partido, club y jugador:
 *
 * - nkl.lt, la oficial (WordPress; pide diez segundos entre peticiones): el
 *   calendario de la temporada, un JSON por partido con su fase
 *   (`stage_id`), y la clasificación de cada fase. Sus actas no traen los
 *   intentos de tiro ni las faltas.
 * - basketnews.lt: el acta completa (titulares marcados, rebotes de defensa
 *   y ataque, faltas hechas y recibidas, tapones puestos y recibidos y el
 *   primer entrenador de cada equipo en ese partido) y la ficha del jugador
 *   (puesto, altura, peso, fecha y banderas de nacionalidad).
 */

/* -------------------------------------------------------- calendario */

export interface NklFixture {
  gameId: string;
  stageId: string;
  /** `AAAA-MM-DD`. */
  date: string;
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
}

/** Los partidos de una temporada del calendario de nkl.lt (van en un JSON dentro de la página). */
export function parseNklCalendar(html: string, season: number): NklFixture[] {
  const fixtures = new Map<string, NklFixture>();
  const pattern = new RegExp(`\\{"id":\\d+,"season":${season},"stage_id":\\d+[^{}]*\\}`, 'g');
  for (const match of html.matchAll(pattern)) {
    let game: {
      id: number;
      stage_id: number;
      date_label?: string;
      home_team_id?: number;
      away_team_id?: number;
      home_score?: number | string | null;
      away_score?: number | string | null;
    };
    try {
      game = JSON.parse(match[0]) as typeof game;
    } catch {
      continue;
    }
    if (!game.home_team_id || !game.away_team_id) continue;
    const score = (value: number | string | null | undefined): number | null =>
      value === null || value === undefined || value === '' ? null : Number(value);
    fixtures.set(String(game.id), {
      gameId: String(game.id),
      stageId: String(game.stage_id),
      date: game.date_label ?? '',
      homeId: String(game.home_team_id),
      awayId: String(game.away_team_id),
      homeScore: score(game.home_score),
      awayScore: score(game.away_score)
    });
  }
  return [...fixtures.values()].sort((a, b) => Number(a.gameId) - Number(b.gameId));
}

/* ----------------------------------------------------- clasificación */

export interface NklStanding {
  rank: number;
  teamId: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
}

/** La tabla de una fase de nkl.lt (`/turnyro-lentele/?fseason=…&fstage=…`). */
export function parseNklStandings(html: string): NklStanding[] {
  const rows: NklStanding[] = [];
  for (const row of tableRows(html)) {
    const cells = rowCells(row);
    const teamId = /\/komandos\/(\d+)\//.exec(cells[1]?.html ?? '')?.[1];
    if (!teamId || rows.some((entry) => entry.teamId === teamId)) continue;
    const [rank, , games, wins, losses] = cells.map((cell) => Number(textOf(cell.html)));
    if (![rank, games, wins, losses].every((value) => Number.isInteger(value))) continue;
    rows.push({
      rank: rank as number,
      teamId,
      name: textOf(cells[1]?.html ?? ''),
      games: games as number,
      wins: wins as number,
      losses: losses as number
    });
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

/* ----------------------------------------------------- acta (basketnews) */

export interface NklBoxLine extends BoxNumbers {
  playerId: string;
  teamId: string;
  firstName: string;
  lastName: string;
}

export interface NklBoxTeam {
  teamId: string;
  name: string;
  /** El primer entrenador en ese partido («Vyr. treneris»). */
  coach: string | null;
}

export interface NklGame {
  gameId: string;
  home: NklBoxTeam;
  away: NklBoxTeam;
  lines: NklBoxLine[];
}

/**
 * Un nombre de basketnews: el nombre de pila y el apellido van separados por
 * dos espacios («Nombre Segundo  Apellido»); si no, el apellido es la última
 * palabra.
 */
export function splitBasketnewsName(raw: string): { firstName: string; lastName: string } {
  const text = decodeEntities(raw).trim();
  const parts = text.split(/\s{2,}/);
  if (parts.length >= 2) {
    return {
      firstName: parts.slice(0, -1).join(' ').replace(/\s+/g, ' ').trim(),
      lastName: (parts[parts.length - 1] ?? '').replace(/\s+/g, ' ').trim()
    };
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { firstName: '', lastName: words[0] ?? '' };
  return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1] ?? '' };
}

function pair(text: string): [number, number] {
  const match = /(\d+)\s*[-/]\s*(\d+)/.exec(text);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

function num(text: string | undefined): number {
  const value = Number((text ?? '').trim());
  return Number.isFinite(value) ? value : 0;
}

function secondsOf(text: string): number {
  const match = /(\d+):(\d+)/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/**
 * Una tabla de equipo del acta, leyendo las columnas por la cabecera. El
 * rebote va partido en una sola columna, «REB D-O» (defensa-ataque) o «REB
 * O-D»: el orden se toma de la cabecera.
 */
function parseTeamTable(tableHtml: string, teamId: string): NklBoxLine[] {
  const headers = [...tableHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((match) =>
    textOf(match[1] ?? '').toUpperCase()
  );
  const column = (name: string): number => headers.indexOf(name);
  const reboundHeader = headers.find((header) => /^REB\s+[DO]-[DO]$/.test(header)) ?? 'REB D-O';
  const defensiveFirst = /REB\s+D-O/.test(reboundHeader);
  const index = {
    minutes: column('MIN'),
    points: column('PTS'),
    two: column('2PM-A'),
    three: column('3PM-A'),
    free: column('FTM-A'),
    rebounds: column(reboundHeader),
    steals: column('ST'),
    turnovers: column('TO'),
    blocks: column('BS'),
    blocksReceived: column('RBS'),
    fouls: column('PF'),
    foulsDrawn: column('RF'),
    assists: column('AST'),
    // La valoración sale dos veces (una para el móvil): vale cualquiera.
    rating: headers.lastIndexOf('EFF')
  };
  if (Object.values(index).some((value) => value < 0)) return [];

  const lines: NklBoxLine[] = [];
  for (const match of tableHtml.matchAll(/<tr class="body_row">([\s\S]*?)<\/tr>/gi)) {
    const row = match[1] ?? '';
    const playerId = /\/zaidejai\/(\d+)-/.exec(row)?.[1];
    if (!playerId) continue;
    const cells = rowCells(row);
    const text = cells.map((cell) =>
      textOf(/mw-value">([^<]*)</.exec(cell.html)?.[1] ?? cell.html)
    );
    const full = /d-lg-inline">([^<]*)</.exec(row)?.[1] ?? '';
    const [twoMade, twoAttempted] = pair(text[index.two] ?? '');
    const [threeMade, threeAttempted] = pair(text[index.three] ?? '');
    const [freeMade, freeAttempted] = pair(text[index.free] ?? '');
    const [firstRebounds, secondRebounds] = pair(text[index.rebounds] ?? '');
    lines.push({
      playerId,
      teamId,
      ...splitBasketnewsName(full),
      // Los titulares llevan marcado el dorsal.
      starter: /\bmarked\b/.test(cells[0]?.className ?? ''),
      seconds: secondsOf(text[index.minutes] ?? ''),
      points: num(text[index.points]),
      twoPointMade: twoMade,
      twoPointAttempted: twoAttempted,
      threePointMade: threeMade,
      threePointAttempted: threeAttempted,
      freeThrowMade: freeMade,
      freeThrowAttempted: freeAttempted,
      defensiveRebounds: defensiveFirst ? firstRebounds : secondRebounds,
      offensiveRebounds: defensiveFirst ? secondRebounds : firstRebounds,
      assists: num(text[index.assists]),
      steals: num(text[index.steals]),
      turnovers: num(text[index.turnovers]),
      blocks: num(text[index.blocks]),
      blocksReceived: num(text[index.blocksReceived]),
      fouls: num(text[index.fouls]),
      foulsDrawn: num(text[index.foulsDrawn]),
      rating: num(text[index.rating])
    });
  }
  return lines;
}

/**
 * El acta de basketnews (`/rungtynes/ziureti/<id>-…html`): los dos equipos en
 * orden (primero el de casa), cada uno con su entrenador y su tabla. `null`
 * si no trae los dos.
 */
export function parseBasketnewsGame(html: string, gameId: string): NklGame | null {
  const blocks = html.split(/<a class="game-stats__team" /).slice(1);
  const teams: { team: NklBoxTeam; lines: NklBoxLine[] }[] = [];
  for (const block of blocks) {
    const teamId = /href="\/komandos\/(\d+)-/.exec(block)?.[1];
    if (!teamId) continue;
    const name = textOf(/game-stats__team-name">([\s\S]*?)<\/h3>/.exec(block)?.[1] ?? '');
    const coachHtml = /game-stats__coach-name"[^>]*>([\s\S]*?)<\/a>/.exec(block)?.[1];
    const coach = coachHtml ? textOf(coachHtml) || null : null;
    const table = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(block)?.[1] ?? '';
    teams.push({ team: { teamId, name, coach }, lines: parseTeamTable(table, teamId) });
  }
  const [home, away] = teams;
  if (!home || !away) return null;
  return { gameId, home: home.team, away: away.team, lines: [...home.lines, ...away.lines] };
}

/* ------------------------------------------------ ficha (basketnews) */

export interface BasketnewsPlayer {
  firstName: string;
  lastName: string;
  /** Tal cual: «PG», «SG, SF». */
  positionRaw: string | null;
  heightCm: number | null;
  weightKg: number | null;
  birthDate: string | null;
  /** Códigos ISO de dos letras de las banderas, en minúscula. */
  flags: string[];
  /** Las ciudadanías en lituano («JAV», «Lietuvos»). */
  citizenships: string[];
}

function infoRow(html: string, label: string): string | null {
  const match = new RegExp(
    `<div>\\s*${label}:\\s*</div>\\s*<div[^>]*>([\\s\\S]*?)</div>`,
    'i'
  ).exec(html);
  return match ? (match[1] ?? '') : null;
}

export function parseBasketnewsPlayer(html: string): BasketnewsPlayer | null {
  const name = /<h1>\s*<span itemprop="name">([\s\S]*?)<\/span>/i.exec(html)?.[1];
  if (name === undefined) return null;
  // Las ciudadanías, cada una con su bandera y su nombre, hasta el final de la cabecera.
  const start = html.indexOf('player-header__citizenships');
  const end = html.indexOf('player-header__stats', start);
  const citizenshipHtml = start < 0 ? '' : html.slice(start, end < 0 ? undefined : end);
  return {
    ...splitBasketnewsName(name),
    positionRaw: textOf(infoRow(html, 'Pozicija') ?? '') || null,
    heightCm: toHeightCm(textOf(infoRow(html, 'Ūgis') ?? '')),
    weightKg: toWeightKg(textOf(infoRow(html, 'Svoris') ?? '')),
    birthDate: /itemprop="birthDate"\s+datetime="(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1] ?? null,
    flags: [...citizenshipHtml.matchAll(/flag-icon-([a-z]{2})\b/g)].map((match) => match[1] ?? ''),
    citizenships: [
      ...citizenshipHtml.matchAll(
        /<div class="player-header__citizenship">\s*<div[^>]*><\/div>\s*<div>([^<]*)<\/div>/g
      )
    ]
      .map((match) => textOf(match[1] ?? ''))
      .filter(Boolean)
  };
}

/** El puesto de basketnews: con dos («SG, SF»), el primero. */
export function nklPosition(raw: string | null | undefined): SourcePosition | null {
  return toPosition(raw);
}

/* ------------------------------------------------ países en lituano */

/**
 * Los países como los escriben las webs lituanas: en genitivo, que es como
 * se dice la ciudadanía («Lietuvos» pilietybė), o en nominativo
 * («LIETUVA»), y alguna sigla («JAV»). Ya normalizados como
 * {@link normalizeCountryText}.
 */
const LITHUANIAN_COUNTRIES: Record<string, string> = {
  lietuva: 'LTU',
  lietuvos: 'LTU',
  jav: 'USA',
  'jungtines amerikos valstijos': 'USA',
  'jungtiniu amerikos valstiju': 'USA',
  latvija: 'LAT',
  latvijos: 'LAT',
  estija: 'EST',
  estijos: 'EST',
  lenkija: 'POL',
  lenkijos: 'POL',
  ukraina: 'UKR',
  ukrainos: 'UKR',
  baltarusija: 'BLR',
  baltarusijos: 'BLR',
  rusija: 'RUS',
  rusijos: 'RUS',
  suomija: 'FIN',
  suomijos: 'FIN',
  svedija: 'SWE',
  svedijos: 'SWE',
  norvegija: 'NOR',
  norvegijos: 'NOR',
  danija: 'DEN',
  danijos: 'DEN',
  islandija: 'ISL',
  islandijos: 'ISL',
  vokietija: 'GER',
  vokietijos: 'GER',
  prancuzija: 'FRA',
  prancuzijos: 'FRA',
  italija: 'ITA',
  italijos: 'ITA',
  ispanija: 'ESP',
  ispanijos: 'ESP',
  portugalija: 'POR',
  portugalijos: 'POR',
  graikija: 'GRE',
  graikijos: 'GRE',
  turkija: 'TUR',
  turkijos: 'TUR',
  serbija: 'SRB',
  serbijos: 'SRB',
  kroatija: 'CRO',
  kroatijos: 'CRO',
  slovenija: 'SLO',
  slovenijos: 'SLO',
  'bosnija ir hercegovina': 'BIH',
  'bosnijos ir hercegovinos': 'BIH',
  juodkalnija: 'MNE',
  juodkalnijos: 'MNE',
  'siaures makedonija': 'MKD',
  'siaures makedonijos': 'MKD',
  gruzija: 'GEO',
  gruzijos: 'GEO',
  'didzioji britanija': 'GBR',
  'didziosios britanijos': 'GBR',
  airija: 'IRL',
  airijos: 'IRL',
  nyderlandai: 'NED',
  nyderlandu: 'NED',
  belgija: 'BEL',
  belgijos: 'BEL',
  cekija: 'CZE',
  cekijos: 'CZE',
  slovakija: 'SVK',
  slovakijos: 'SVK',
  vengrija: 'HUN',
  vengrijos: 'HUN',
  sveicarija: 'SUI',
  sveicarijos: 'SUI',
  austrija: 'AUT',
  austrijos: 'AUT',
  kanada: 'CAN',
  kanados: 'CAN',
  australija: 'AUS',
  australijos: 'AUS',
  nigerija: 'NGR',
  nigerijos: 'NGR',
  senegalas: 'SEN',
  senegalo: 'SEN',
  kamerunas: 'CMR',
  kameruno: 'CMR',
  angola: 'ANG',
  angolos: 'ANG',
  izraelis: 'ISR',
  izraelio: 'ISR',
  brazilija: 'BRA',
  brazilijos: 'BRA',
  jamaika: 'JAM',
  jamaikos: 'JAM',
  bahamos: 'BAH',
  bahamu: 'BAH'
};

/**
 * El código COI de una nacionalidad escrita en lituano; si no está en la
 * tabla, como la escriba cualquier otra web (código o nombre en otro idioma).
 */
export function nationFromLithuanian(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return LITHUANIAN_COUNTRIES[normalizeCountryText(raw)] ?? toNationCode(raw);
}

/** La nacionalidad de la ficha: la primera bandera o, si no hay, la primera ciudadanía. */
export function basketnewsNationality(
  player: Pick<BasketnewsPlayer, 'flags' | 'citizenships'>
): string | null {
  for (const flag of player.flags) {
    const nation = toNationCode(flag);
    if (nation) return nation;
  }
  for (const citizenship of player.citizenships) {
    const nation = nationFromLithuanian(citizenship);
    if (nation) return nation;
  }
  return null;
}
