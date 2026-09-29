import { decodeEntities, textOf } from '../lib/html';
import { toNationCode } from '../lib/nationalities';
import type { SourcePosition, SourceStats } from '../lib/source-types';

/**
 * Lectura de las dos fuentes de EE. UU.: basketball-reference (la NBA) y la
 * API oficial de estadísticas de la NBA, que sirve la NBA (`LeagueID=00`) y
 * la G League (`LeagueID=20`).
 *
 * - basketball-reference mete muchas tablas **dentro de comentarios HTML**
 *   (las pinta después con JavaScript): hay que destaparlas antes de leer.
 *   Cada celda lleva su `data-stat`.
 * - La API contesta `{ resultSets: [{ name, headers, rowSet }] }`: filas como
 *   listas, con los nombres de columna aparte.
 */

/* ------------------------------------------------------------ comunes */

/** «6-8» (pies y pulgadas) → centímetros; `null` si no es una altura. */
export function feetInchesToCm(raw: string | null | undefined): number | null {
  const match = /^\s*(\d)\s*-\s*(\d{1,2})\s*$/.exec(raw ?? '');
  if (!match) return null;
  const cm = Math.round((Number(match[1]) * 12 + Number(match[2])) * 2.54);
  return cm >= 150 && cm <= 240 ? cm : null;
}

/** Libras → kilos; `null` si no es un peso. */
export function poundsToKg(raw: string | number | null | undefined): number | null {
  const pounds = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isFinite(pounds) || pounds < 100 || pounds > 400) return null;
  return Math.round(pounds * 0.45359237);
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

/**
 * Fechas en inglés o ISO: «January 3, 2001» (basketball-reference),
 * «AUG 10, 2005» (plantilla de la API), «2002-03-22T00:00:00» (ficha de la
 * API) → «2001-01-03».
 */
export function usaDate(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const english = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/.exec(text);
  if (!english) return null;
  const month = MONTHS[(english[1] ?? '').toLowerCase()];
  const day = Number(english[2]);
  if (!month || day < 1 || day > 31) return null;
  return `${english[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const SUFFIXES: Record<string, string> = {
  jr: 'Jr.',
  'jr.': 'Jr.',
  sr: 'Sr.',
  'sr.': 'Sr.',
  ii: 'II',
  iii: 'III',
  iv: 'IV'
};

/** El nombre partido de la API, con los sufijos siempre igual («Jr» → «Jr.»). */
export function usaName(
  firstName: string,
  lastName: string
): { firstName: string; lastName: string } {
  const clean = (text: string): string => decodeEntities(text).replace(/\s+/g, ' ').trim();
  const last = clean(lastName)
    .split(' ')
    .map((word, index) => (index > 0 ? (SUFFIXES[word.toLowerCase()] ?? word) : word))
    .join(' ');
  return { firstName: clean(firstName), lastName: last };
}

/**
 * «Nombre Apellido» de una sola cadena: la primera palabra es el nombre y el
 * resto el apellido (con su sufijo). Para quien sólo sale en
 * basketball-reference.
 */
export function splitUsaName(full: string): { firstName: string; lastName: string } {
  const words = decodeEntities(full).replace(/\s+/g, ' ').trim().split(' ');
  if (words.length < 2) return { firstName: '', lastName: words[0] ?? '' };
  return usaName(words[0] as string, words.slice(1).join(' '));
}

/**
 * Clave para casar a la misma persona en basketball-reference y la API: sin
 * tildes, sin puntuación y sin sufijos («Xavier Tillman Sr.» = «Xavier
 * Tillman»).
 */
export function nameKey(full: string): string {
  return decodeEntities(full)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .split(/[\s-]+/)
    .filter((word) => word !== '' && !(word in SUFFIXES))
    .join(' ');
}

/** El apellido de la clave (la última palabra sin sufijo): para casar con apodos. */
export function surnameKey(full: string): string {
  const words = nameKey(full).split(' ');
  return words[words.length - 1] ?? '';
}

/** La nacionalidad de la API: el país en inglés («Serbia», «DRC»). */
export function usaNationality(raw: string | null | undefined): string | null {
  return toNationCode(raw);
}

/** Corrección a mano de un jugador (`nba-jugadores.json`, por `PERSON_ID`). */
export interface UsaPlayerFix {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  nationality?: string;
  heightCm?: number;
}

/* ------------------------------------------------ basketball-reference */

/** El HTML con las tablas de los comentarios ya a la vista. */
export function uncommentHtml(html: string): string {
  return html.replace(/<!--/g, '').replace(/-->/g, '');
}

/** Una fila de una tabla de basketball-reference: texto y enlace de cada `data-stat`. */
export interface BbrefCells {
  text: Record<string, string>;
  href: Record<string, string>;
}

/** Las filas de datos de la tabla `id` (sin cabeceras: las que no llevan `data-stat` de datos). */
export function bbrefTable(html: string, id: string): BbrefCells[] {
  const page = uncommentHtml(html);
  const table = new RegExp(`<table[^>]*id="${id}"[\\s\\S]*?</table>`).exec(page)?.[0];
  if (!table) return [];
  const rows: BbrefCells[] = [];
  for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells: BbrefCells = { text: {}, href: {} };
    for (const cell of (row[1] ?? '').matchAll(
      /<t[hd][^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/t[hd]>/g
    )) {
      const stat = cell[1] as string;
      const content = cell[2] ?? '';
      cells.text[stat] = textOf(content);
      const link = /href=["']([^"']+)["']/.exec(content)?.[1];
      if (link) cells.href[stat] = link;
    }
    // Las cabeceras repetidas no llevan enlace de jugador ni de equipo.
    if (Object.keys(cells.href).length > 0) rows.push(cells);
  }
  return rows;
}

/** `/players/d/doncilu01.html` → `doncilu01`. */
function bbrefId(path: string | undefined): string | null {
  return /\/([a-z0-9]+)\.html$/.exec(path ?? '')?.[1] ?? null;
}

const int = (text: string | undefined): number => {
  const value = Number((text ?? '').replace(/,/g, ''));
  return Number.isFinite(value) ? Math.round(value) : 0;
};

/** Una fila de totales de basketball-reference: un jugador en un club, o su total. */
export interface BbrefTotalsRow {
  playerId: string;
  name: string;
  /** Abreviatura de basketball-reference (`BRK`, `PHO`) o `2TM`/`3TM` en la fila total. */
  team: string;
  /** La fila que suma varios clubes. */
  total: boolean;
  position: string;
  games: number;
  starts: number;
  minutes: number;
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
  blocks: number;
  turnovers: number;
  fouls: number;
  points: number;
}

/** `/leagues/NBA_2026_totals.html`, tabla `totals_stats`: la fase regular. */
export function parseBbrefTotals(html: string): BbrefTotalsRow[] {
  return bbrefTable(html, 'totals_stats').flatMap((row) => {
    const playerId = bbrefId(row.href.name_display);
    const team = row.text.team_name_abbr ?? '';
    if (!playerId || !team) return [];
    const t = row.text;
    return [
      {
        playerId,
        name: t.name_display ?? '',
        team,
        total: /^\dTM$/.test(team),
        position: t.pos ?? '',
        games: int(t.games),
        starts: int(t.games_started),
        minutes: int(t.mp),
        twoPointMade: int(t.fg2),
        twoPointAttempted: int(t.fg2a),
        threePointMade: int(t.fg3),
        threePointAttempted: int(t.fg3a),
        freeThrowMade: int(t.ft),
        freeThrowAttempted: int(t.fta),
        offensiveRebounds: int(t.orb),
        defensiveRebounds: int(t.drb),
        assists: int(t.ast),
        steals: int(t.stl),
        blocks: int(t.blk),
        turnovers: int(t.tov),
        fouls: int(t.pf),
        points: int(t.pts)
      }
    ];
  });
}

/** Un jugador de la NBA en la temporada: sus totales y el club donde más minutos jugó. */
export interface BbrefSeason {
  /** La fila total (la suma de sus clubes) o la única. */
  totals: BbrefTotalsRow;
  /** El club donde más minutos jugó (a igualdad, el primero de la tabla). */
  team: string;
  /** Cada club con sus minutos, en el orden de la tabla. */
  clubs: { team: string; minutes: number }[];
}

/** Agrupa las filas por jugador: la total manda y el club es el de más minutos. */
export function bbrefSeasons(rows: readonly BbrefTotalsRow[]): BbrefSeason[] {
  const byPlayer = new Map<string, BbrefTotalsRow[]>();
  for (const row of rows) {
    const list = byPlayer.get(row.playerId) ?? [];
    list.push(row);
    byPlayer.set(row.playerId, list);
  }
  return [...byPlayer.values()].map((list) => {
    const clubs = list.filter((row) => !row.total);
    const total = list.find((row) => row.total) ?? (clubs[0] as BbrefTotalsRow);
    const home = clubs.reduce((best, row) => (row.minutes > best.minutes ? row : best));
    return {
      totals: total,
      team: home.team,
      clubs: clubs.map((row) => ({ team: row.team, minutes: row.minutes }))
    };
  });
}

/** `/leagues/NBA_2026_shooting.html`, tabla `shooting`: los mates de cada uno (la fila total si la hay). */
export function parseBbrefDunks(html: string): Map<string, number> {
  const dunks = new Map<string, number>();
  for (const row of bbrefTable(html, 'shooting')) {
    const playerId = bbrefId(row.href.name_display);
    if (!playerId || row.text.fg_dunk === undefined) continue;
    const total = /^\dTM$/.test(row.text.team_name_abbr ?? '');
    if (total || !dunks.has(playerId)) dunks.set(playerId, int(row.text.fg_dunk));
  }
  return dunks;
}

/** `/leagues/NBA_2026_standings.html`, tabla `expanded_standings`: puesto (1-30) y balance. */
export function parseBbrefStandings(
  html: string
): { rank: number; name: string; wins: number; losses: number }[] {
  return bbrefTable(html, 'expanded_standings').flatMap((row) => {
    const record = /^(\d+)-(\d+)$/.exec(row.text.Overall ?? '');
    if (!row.text.team_name || !record) return [];
    return [
      {
        rank: int(row.text.ranker),
        name: row.text.team_name,
        wins: Number(record[1]),
        losses: Number(record[2])
      }
    ];
  });
}

/** La ficha de un jugador en la plantilla de su club (`/teams/<COD>/2026.html`, tabla `roster`). */
export interface BbrefBio {
  playerId: string;
  name: string;
  position: string;
  heightCm: number | null;
  weightKg: number | null;
  birthDate: string | null;
  /** País de NACIMIENTO (ISO de dos letras), no la nacionalidad. */
  birthCountry: string | null;
  shirtNumber: number | null;
}

export function parseBbrefRoster(html: string): BbrefBio[] {
  return bbrefTable(html, 'roster').flatMap((row) => {
    const playerId = bbrefId(row.href.player);
    if (!playerId) return [];
    const t = row.text;
    const number = Number(t.number);
    return [
      {
        playerId,
        name: t.player ?? '',
        position: t.pos ?? '',
        heightCm: feetInchesToCm(t.height),
        weightKg: poundsToKg(t.weight),
        birthDate: usaDate(t.birth_date),
        birthCountry: /\b([A-Z]{2})$/.exec(t.flag ?? '')?.[1] ?? null,
        shirtNumber:
          t.number !== undefined && t.number !== '' && Number.isFinite(number) ? number : null
      }
    ];
  });
}

/** El pabellón de la cabecera de la página de un club («Arena: Moda Center»). */
export function parseBbrefArena(html: string): string | null {
  const match = /<strong>\s*Arena:\s*<\/strong>([\s\S]*?)(?:<strong>|<\/p>)/.exec(html);
  // «Madison Square Garden (IV)»: el número del edificio no es parte del nombre.
  const text = match ? textOf(match[1] ?? '').replace(/\s*\([IVX]+\)$/, '') : '';
  return text === '' ? null : text;
}

/** Un entrenador de la temporada: `NBA_coaches` de `/leagues/NBA_2026_coaches.html`. */
export interface BbrefCoach {
  coachId: string;
  name: string;
  team: string;
  /** Partidos de liga regular con ese club esta temporada. */
  games: number;
}

/** En el orden de la tabla: en un club con dos, el que empezó va antes. */
export function parseBbrefCoaches(html: string): BbrefCoach[] {
  return bbrefTable(html, 'NBA_coaches').flatMap((row) => {
    const coachId = bbrefId(row.href.coach);
    const team = row.text.team ?? '';
    if (!coachId || !team) return [];
    return [{ coachId, name: row.text.coach ?? '', team, games: int(row.text.cur_g) }];
  });
}

/** «Born: April 7, 1976 in Winchester, Massachusetts» de la ficha de un entrenador. */
export function parseBbrefCoachBirth(html: string): string | null {
  const text = textOf(html);
  const match = /Born:\s*([A-Za-z]+ \d{1,2}, \d{4})/.exec(text);
  return match ? usaDate(match[1]) : null;
}

/* ---------------------------------------------------------------- API */

export type ApiRow = Record<string, string | number | null>;

/**
 * Las filas del conjunto `name` (o del primero) de una respuesta de la API;
 * `null` si no es una respuesta de la API.
 */
export function apiRows(body: string, name?: string): ApiRow[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const sets = (parsed as { resultSets?: unknown }).resultSets;
  if (!Array.isArray(sets)) return null;
  const set = (
    sets as { name?: string; headers?: string[]; rowSet?: (string | number | null)[][] }[]
  ).find((entry) => name === undefined || entry.name === name);
  if (!set || !Array.isArray(set.headers) || !Array.isArray(set.rowSet)) return null;
  const headers = set.headers;
  return set.rowSet.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null]))
  );
}

const num = (value: string | number | null | undefined): number =>
  typeof value === 'number' ? value : Number(value ?? 0) || 0;

const text = (value: string | number | null | undefined): string | null =>
  value === null || value === undefined || String(value).trim() === ''
    ? null
    : String(value).trim();

/** Los totales de un jugador en un club (`leaguedashplayerstats`, `PerMode=Totals`). */
export interface ApiTotalsRow {
  personId: string;
  name: string;
  teamId: string;
  teamCode: string;
  stats: SourceStats;
}

export function parseApiTotals(body: string): ApiTotalsRow[] {
  return (apiRows(body, 'LeagueDashPlayerStats') ?? []).map((row) => {
    const fgm = num(row.FGM);
    const fga = num(row.FGA);
    const threes = num(row.FG3M);
    const threeAttempts = num(row.FG3A);
    return {
      personId: String(row.PLAYER_ID),
      name: text(row.PLAYER_NAME) ?? '',
      teamId: String(row.TEAM_ID),
      teamCode: text(row.TEAM_ABBREVIATION) ?? '',
      stats: {
        games: num(row.GP),
        starts: null,
        seconds: Math.round(num(row.MIN) * 60),
        points: num(row.PTS),
        twoPointMade: fgm - threes,
        twoPointAttempted: fga - threeAttempts,
        threePointMade: threes,
        threePointAttempted: threeAttempts,
        freeThrowMade: num(row.FTM),
        freeThrowAttempted: num(row.FTA),
        offensiveRebounds: num(row.OREB),
        defensiveRebounds: num(row.DREB),
        assists: num(row.AST),
        steals: num(row.STL),
        turnovers: num(row.TOV),
        blocks: num(row.BLK),
        blocksReceived: num(row.BLKA),
        dunks: null,
        fouls: num(row.PF),
        foulsDrawn: num(row.PFD),
        rating: null
      }
    };
  });
}

/** Una persona según la API: índice de jugadores, plantilla o ficha. */
export interface ApiPerson {
  personId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  /** G, F, C, G-F, F-C… (también «Guard», «Forward-Center» en la ficha). */
  position: string | null;
  country: string | null;
  shirtNumber: number | null;
}

/** Lo que falta en `base` se toma de `extra`. */
export function mergePerson(base: ApiPerson, extra: ApiPerson | null | undefined): ApiPerson {
  if (!extra) return base;
  return {
    personId: base.personId,
    firstName: base.firstName || extra.firstName,
    lastName: base.lastName || extra.lastName,
    birthDate: base.birthDate ?? extra.birthDate,
    heightCm: base.heightCm ?? extra.heightCm,
    weightKg: base.weightKg ?? extra.weightKg,
    position: base.position ?? extra.position,
    country: base.country ?? extra.country,
    shirtNumber: base.shirtNumber ?? extra.shirtNumber
  };
}

const shirt = (value: string | number | null | undefined): number | null => {
  const parsed = Number(text(value) ?? NaN);
  return Number.isInteger(parsed) ? parsed : null;
};

/** `playerindex`: todos los de la temporada, con nombre partido, país y medidas (sin fecha). */
export function parseApiPlayerIndex(body: string): ApiPerson[] {
  return (apiRows(body, 'PlayerIndex') ?? []).map((row) => ({
    personId: String(row.PERSON_ID),
    ...usaName(text(row.PLAYER_FIRST_NAME) ?? '', text(row.PLAYER_LAST_NAME) ?? ''),
    birthDate: null,
    heightCm: feetInchesToCm(text(row.HEIGHT)),
    weightKg: poundsToKg(text(row.WEIGHT)),
    position: text(row.POSITION),
    country: text(row.COUNTRY),
    shirtNumber: shirt(row.JERSEY_NUMBER)
  }));
}

/** `commonteamroster`: la plantilla final de un club, con la fecha de nacimiento. */
export function parseApiRoster(body: string): ApiPerson[] {
  return (apiRows(body, 'CommonTeamRoster') ?? []).map((row) => {
    const full = splitUsaName(text(row.PLAYER) ?? '');
    return {
      personId: String(row.PLAYER_ID),
      ...full,
      birthDate: usaDate(text(row.BIRTH_DATE)),
      heightCm: feetInchesToCm(text(row.HEIGHT)),
      weightKg: poundsToKg(text(row.WEIGHT)),
      position: text(row.POSITION),
      country: null,
      shirtNumber: shirt(row.NUM)
    };
  });
}

/** `commonplayerinfo`: la ficha de cualquiera; `null` si la respuesta no la trae. */
export function parseApiPlayerInfo(body: string): ApiPerson | null {
  const row = apiRows(body, 'CommonPlayerInfo')?.[0];
  if (!row) return null;
  return {
    personId: String(row.PERSON_ID),
    ...usaName(text(row.FIRST_NAME) ?? '', text(row.LAST_NAME) ?? ''),
    birthDate: usaDate(text(row.BIRTHDATE)),
    heightCm: feetInchesToCm(text(row.HEIGHT)),
    weightKg: poundsToKg(text(row.WEIGHT)),
    position: text(row.POSITION),
    country: text(row.COUNTRY),
    shirtNumber: shirt(row.JERSEY)
  };
}

/** `leaguestandingsv3`: la clasificación de la fase regular. */
export interface ApiStanding {
  teamId: string;
  name: string;
  conference: string;
  division: string | null;
  wins: number;
  losses: number;
  /** Diferencia de puntos por partido: el desempate. */
  pointDiff: number;
}

export function parseApiStandings(body: string): ApiStanding[] {
  return (apiRows(body, 'Standings') ?? []).map((row) => ({
    teamId: String(row.TeamID),
    name: `${text(row.TeamCity) ?? ''} ${text(row.TeamName) ?? ''}`.trim(),
    conference: text(row.Conference) ?? '',
    division: text(row.Division),
    wins: num(row.WINS),
    losses: num(row.LOSSES),
    pointDiff: num(row.DiffPointsPG)
  }));
}

/**
 * La clasificación de toda la liga: por porcentaje de victorias y, a
 * igualdad, por diferencia de puntos. Devuelve el puesto de cada `teamId`.
 */
export function leagueOrder(standings: readonly ApiStanding[]): Map<string, number> {
  const pct = (row: ApiStanding): number => row.wins / Math.max(1, row.wins + row.losses);
  const sorted = [...standings].sort(
    (a, b) => pct(b) - pct(a) || b.pointDiff - a.pointDiff || a.name.localeCompare(b.name)
  );
  return new Map(sorted.map((row, index) => [row.teamId, index + 1]));
}

/** Suma los totales de un jugador en varios clubes. */
export function sumStats(list: readonly SourceStats[]): SourceStats {
  const fields = [
    'games',
    'seconds',
    'points',
    'twoPointMade',
    'twoPointAttempted',
    'threePointMade',
    'threePointAttempted',
    'freeThrowMade',
    'freeThrowAttempted',
    'offensiveRebounds',
    'defensiveRebounds',
    'assists',
    'steals',
    'turnovers',
    'blocks',
    'fouls'
  ] as const;
  const total = { ...(list[0] as SourceStats) };
  for (const field of fields) total[field] = list.reduce((sum, stats) => sum + stats[field], 0);
  const optional = (key: 'starts' | 'blocksReceived' | 'dunks' | 'foulsDrawn'): number | null =>
    list.some((stats) => stats[key] === null)
      ? null
      : list.reduce((sum, stats) => sum + (stats[key] as number), 0);
  total.starts = optional('starts');
  total.blocksReceived = optional('blocksReceived');
  total.dunks = optional('dunks');
  total.foulsDrawn = optional('foulsDrawn');
  return total;
}

/* ------------------------------------------------------------ puestos */

/** El puesto de basketball-reference («PG», «SF-PF» → el primero). */
export function bbrefPosition(raw: string | null | undefined): SourcePosition | null {
  const first = (raw ?? '').trim().toUpperCase().split('-')[0];
  return first === 'PG' || first === 'SG' || first === 'SF' || first === 'PF' || first === 'C'
    ? first
    : null;
}

/** Pívot seguro por altura, aunque la API diga alero. */
export const GLEAGUE_CENTER_MIN_CM = 208;
/** Con esta altura, un «F-C» o un alero que rebotea como un pívot ya lo es. */
export const GLEAGUE_BIG_CENTER_MIN_CM = 206;
/** A partir de aquí un alero es ala-pívot. */
export const GLEAGUE_POWER_FORWARD_MIN_CM = 203;
/** Un base es base hasta esta altura, o si reparte. */
export const GLEAGUE_POINT_GUARD_MAX_CM = 190;
export const GLEAGUE_POINT_GUARD_ASSISTS = 5;
/** Un escolta de esta altura ya juega de alero. */
export const GLEAGUE_GUARD_MAX_CM = 200;
/** Rebotes por 36 minutos que hacen pívot a un ala-pívot alto. */
export const GLEAGUE_CENTER_REBOUNDS = 9;
/** Un alero de esta altura que rebotea como un ala-pívot lo es. */
export const GLEAGUE_REBOUNDING_FORWARD_MIN_CM = 198;
export const GLEAGUE_POWER_FORWARD_REBOUNDS = 7;

/**
 * El puesto en la G League: la API sólo da G, F, C y sus mezclas («G-F»,
 * «F-C», «Guard-Forward» en la ficha). Se decide con la altura y el juego
 * (rebotes y asistencias por 36 minutos), para que los pívots sean los que
 * son de verdad y no sólo los que la liga apunta como «C».
 */
export function gleaguePosition(
  raw: string | null | undefined,
  heightCm: number | null,
  stats: SourceStats | null
): SourcePosition {
  const code = (raw ?? '')
    .toUpperCase()
    .replace(/GUARD/g, 'G')
    .replace(/FORWARD/g, 'F')
    .replace(/CENTER/g, 'C')
    .replace(/\s/g, '');
  const first = code.split('-')[0] ?? '';
  const height = heightCm ?? 0;
  const minutes = stats ? stats.seconds / 60 : 0;
  const per36 = (value: number): number => (minutes >= 60 ? (value * 36) / minutes : 0);
  const rebounds = stats ? per36(stats.offensiveRebounds + stats.defensiveRebounds) : 0;
  const assists = stats ? per36(stats.assists) : 0;

  if (first === 'C' || code === 'F-C') {
    if (height >= GLEAGUE_BIG_CENTER_MIN_CM || heightCm === null) return 'C';
    return rebounds >= GLEAGUE_CENTER_REBOUNDS ? 'C' : 'PF';
  }
  if (height >= GLEAGUE_CENTER_MIN_CM) return 'C';
  if (first === 'F') {
    if (height >= GLEAGUE_BIG_CENTER_MIN_CM && rebounds >= GLEAGUE_CENTER_REBOUNDS) return 'C';
    const rebounder =
      height >= GLEAGUE_REBOUNDING_FORWARD_MIN_CM && rebounds >= GLEAGUE_POWER_FORWARD_REBOUNDS;
    return height >= GLEAGUE_POWER_FORWARD_MIN_CM || rebounder ? 'PF' : 'SF';
  }
  // Escoltas y bases (y quien no trae puesto).
  if (height >= GLEAGUE_POWER_FORWARD_MIN_CM) return 'PF';
  if (height >= GLEAGUE_GUARD_MAX_CM || code === 'G-F')
    return height >= GLEAGUE_GUARD_MAX_CM ? 'SF' : 'SG';
  if (heightCm !== null && heightCm <= GLEAGUE_POINT_GUARD_MAX_CM) return 'PG';
  return assists >= GLEAGUE_POINT_GUARD_ASSISTS ? 'PG' : 'SG';
}
