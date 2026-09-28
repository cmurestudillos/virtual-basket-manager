import { toNameCase, usualFirstName } from '../lib/normalize';
import type { SourcePosition, SourceStats } from '../lib/source-types';
import { accentName, SPANISH_SPEAKING, type WikiRosterEntry } from './adc-parse';
import { plainName } from './aba-parse';
import { addLine, emptyStats, playedIn, type BoxNumbers } from './lkl-parse';

/**
 * Lectura de la Liga Nacional de Básquetbol de Chile (la «Liga UNO»), que
 * lleva FEBACHILE con Genius Sports:
 *
 * - La web «hosted» de Genius (`hosted.dcd.shared.geniussports.com/embednf/
 *   FDBCH/es/…`): contesta un JSON `{css, js, html}` con el HTML dentro
 *   (`geniusHtml`). De ahí salen los equipos de una competición, el
 *   calendario de cada fase, la plantilla (dorsal, fecha de nacimiento y
 *   nacionalidad; la altura casi nunca y el puesto, de relleno), el cuerpo
 *   técnico y el acta completa con el id de cada persona (estable entre
 *   competiciones), pero **sin titulares ni faltas recibidas**.
 * - El `data.json` de FIBA LiveStats del mismo partido: titulares, faltas
 *   recibidas, el nombre legal completo y el entrenador, pero sin el id de
 *   persona. Se casa con el acta por dorsal y apellido. A veces viene sin
 *   números o cortado a mitad de partido: entonces no se usa.
 * - Las fichas de los clubes en la Wikipedia en español: una tabla por
 *   temporada con bandera, puesto (B, E, A, AP, P), nombre con tildes, altura
 *   y fecha (`parseWikiTableRoster`), y la tabla de extranjeros de los
 *   artículos de cada torneo (`parseWikiForeigners`).
 */

/* ------------------------------------------------------------ comunes */

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function clean(text: string): string {
  return decode(text.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** El HTML de una respuesta de la web «hosted» (`{"css": …, "js": …, "html": "…"}`). */
export function geniusHtml(body: string): string | null {
  try {
    const json = JSON.parse(body) as { html?: unknown };
    return typeof json.html === 'string' ? json.html : null;
  } catch {
    return null;
  }
}

/** «19:46» (minutos y segundos) en segundos. */
function secondsOf(raw: string | null | undefined): number {
  const match = /^(\d+):(\d{1,2})$/.exec((raw ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/* ------------------------------------------------------------ equipos */

export interface GeniusTeamRef {
  teamId: string;
  name: string;
}

/** Los equipos de una competición (`competition/<id>/teams`). */
export function parseGeniusTeams(html: string): GeniusTeamRef[] {
  const teams = new Map<string, string>();
  for (const match of html.matchAll(/\/team\/(\d+)\?">([^<]+)</g)) {
    const name = clean(match[2]!);
    if (name) teams.set(match[1]!, name);
  }
  return [...teams].map(([teamId, name]) => ({ teamId, name }));
}

/* --------------------------------------------------------- calendario */

export interface GeniusGame {
  gameId: string;
  /** `AAAA-MM-DD`. */
  date: string | null;
  /** «hh:mm». */
  time: string | null;
  venue: string | null;
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
}

const MONTHS: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dic: 12
};

/** «25 sept. 2025 19:00» → fecha y hora. */
export function geniusDate(raw: string): { date: string | null; time: string | null } {
  const match = /(\d{1,2})\s+([a-zñ]+)\.?\s+(\d{4})(?:\s+(\d{1,2}:\d{2}))?/i.exec(raw.trim());
  const month = match ? MONTHS[match[2]!.toLowerCase()] : undefined;
  if (!match || !month) return { date: null, time: null };
  return {
    date: `${match[3]}-${String(month).padStart(2, '0')}-${match[1]!.padStart(2, '0')}`,
    time: match[4] ?? null
  };
}

/** Los partidos de una fase (`competition/<id>/schedule?phaseName=…`). */
export function parseGeniusSchedule(html: string): GeniusGame[] {
  const games: GeniusGame[] = [];
  const blocks = html.split(/<div class="match-wrap[^"]*" id = "extfix_/).slice(1);
  for (const block of blocks) {
    const gameId = /^(\d+)/.exec(block)?.[1];
    const home = /<div class="home-team">[\s\S]*?\/team\/(\d+)\?/.exec(block)?.[1];
    const away = /<div class="away-team">[\s\S]*?\/team\/(\d+)\?/.exec(block)?.[1];
    if (!gameId || !home || !away) continue;
    const when = geniusDate(
      clean(/<div class="match-time">[\s\S]*?<span>([^<]*)<\/span>/.exec(block)?.[1] ?? '')
    );
    const score = (side: string): number | null => {
      const raw = new RegExp(
        `team-score ${side}score">\\s*<div class="fake-cell">\\s*(\\d*)\\s*<`
      ).exec(block)?.[1];
      return raw ? Number(raw) : null;
    };
    games.push({
      gameId,
      ...when,
      venue:
        clean(
          /<div class="match-venue">[\s\S]*?(?:class="venuename">|<span>)([^<]*)</.exec(
            block
          )?.[1] ?? ''
        ) || null,
      homeId: home,
      awayId: away,
      homeScore: score('home'),
      awayScore: score('away')
    });
  }
  return games;
}

/* ---------------------------------------------------------- plantilla */

export interface GeniusRosterEntry {
  personId: string;
  shirtNumber: number | null;
  /** «D. Jones Navarrete». */
  shortName: string;
  /** Tal cual (PG, SG, SF, PF, C, G, F o vacío): casi siempre de relleno. */
  positionRaw: string | null;
  birthDate: string | null;
  /** Código FIBA; `null` si viene vacío. */
  nationality: string | null;
  /** Sólo si es creíble (160-235): la web la trae casi siempre vacía o con basura («1», «2»). */
  heightCm: number | null;
}

/** La plantilla de un equipo (`competition/<id>/team/<id>/roster`): la del final del torneo. */
export function parseGeniusRoster(html: string): GeniusRosterEntry[] {
  const body = html.slice(html.indexOf('<tbody'));
  const entries: GeniusRosterEntry[] = [];
  for (const [, row = ''] of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
    const personId = /\/person\/(\d+)/.exec(row)?.[1];
    if (!personId || cells.length < 8) continue;
    const text = cells.map((cell) => clean(cell[2]!));
    const shirt = Number(text[0]);
    const birth = /data-value = "(\d{4}-\d{2}-\d{2})"/.exec(cells[3]![1]!)?.[1] ?? null;
    const height = Number(text[5]);
    entries.push({
      personId,
      shirtNumber: text[0] !== '' && Number.isInteger(shirt) ? shirt : null,
      shortName: text[1]!,
      positionRaw: text[2] || null,
      birthDate: birth,
      nationality: /^[A-Z]{3}$/.test(text[4]!) ? text[4]! : null,
      heightCm: Number.isInteger(height) && height >= 160 && height <= 235 ? height : null
    });
  }
  return entries;
}

/** Los primeros entrenadores del cuerpo técnico (`…/staff`): «Frutos M., Guillermo». */
export function parseGeniusStaff(html: string): string[] {
  const coaches: string[] = [];
  for (const [, row = ''] of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => clean(cell[1]!));
    if (/^head coach$/i.test(cells[0] ?? '') && cells[1] && !coaches.includes(cells[1]))
      coaches.push(cells[1]);
  }
  return coaches;
}

/* --------------------------------------------------------------- acta */

export interface GeniusBoxLine extends BoxNumbers {
  teamId: string;
  personId: string;
  shirtNumber: number | null;
  /** «J. Pino Hernandez». */
  shortName: string;
}

export interface GeniusBoxScore {
  /** Local primero. */
  teams: { teamId: string; name: string; lines: GeniusBoxLine[] }[];
}

/** Las columnas del acta por su título, por si cambian de orden. */
const BOX_COLUMNS: Record<string, string> = {
  Minutos: 'min',
  'Falta Personal': 'pf',
  '3 Puntos Intentados': '3a',
  '3 Puntos Convertidos': '3m',
  '2 Puntos Intentados': '2a',
  '2 Puntos Convertidos': '2m',
  'Tiro Libre Intentado': 'fta',
  'Tiros Libres Convertidos': 'ftm',
  Puntos: 'pts',
  'Rebotes Ofensivos': 'or',
  'Rebotes Defensivos': 'dr',
  Asistencias: 'as',
  Recuperaciones: 'st',
  Tapones: 'bk',
  'Tapones Recibidos': 'bkr',
  Pérdidas: 'to',
  'Valoración Personalizada': 'val'
};

/**
 * El acta de la web «hosted» (`competition/<id>/match/<id>/boxscore`): una
 * tabla por equipo, local primero, con el id de persona de cada jugador.
 * Sin titulares ni faltas recibidas (`starter` falso y `foulsDrawn` 0: los
 * pone el `data.json`). `null` si la página no es un acta.
 */
export function parseGeniusBoxScore(html: string): GeniusBoxScore | null {
  const sections = html.split(/<a href = "[^"]*\/team\/(\d+)\?">\s*<h4>([^<]*)<\/h4>/);
  if (sections.length < 5) return null;
  const teams: GeniusBoxScore['teams'] = [];
  for (let index = 1; index + 2 < sections.length && teams.length < 2; index += 3) {
    const teamId = sections[index]!;
    const name = clean(sections[index + 1]!);
    const table = sections[index + 2] ?? '';
    const head = /<thead>([\s\S]*?)<\/thead>/.exec(table)?.[1] ?? '';
    const columns = [...head.matchAll(/<th([^>]*)>/g)].map(
      (match) => BOX_COLUMNS[/title = "([^"]*)"/.exec(match[1]!)?.[1] ?? ''] ?? null
    );
    const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table)?.[1] ?? '';
    const lines: GeniusBoxLine[] = [];
    for (const [, row = ''] of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const personId = /\/person\/(\d+)/.exec(row)?.[1];
      if (!personId) continue;
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => clean(cell[1]!));
      const value = (key: string): string => cells[columns.indexOf(key)] ?? '';
      const count = (key: string): number => Number(value(key)) || 0;
      const shirt = Number(cells[0]);
      lines.push({
        teamId,
        personId,
        shirtNumber: cells[0] !== '' && Number.isInteger(shirt) ? shirt : null,
        shortName: cells[1] ?? '',
        starter: false,
        seconds: secondsOf(value('min')),
        points: count('pts'),
        twoPointMade: count('2m'),
        twoPointAttempted: count('2a'),
        threePointMade: count('3m'),
        threePointAttempted: count('3a'),
        freeThrowMade: count('ftm'),
        freeThrowAttempted: count('fta'),
        offensiveRebounds: count('or'),
        defensiveRebounds: count('dr'),
        assists: count('as'),
        steals: count('st'),
        turnovers: count('to'),
        blocks: count('bk'),
        blocksReceived: count('bkr'),
        fouls: count('pf'),
        foulsDrawn: 0,
        rating: count('val')
      });
    }
    teams.push({ teamId, name, lines });
  }
  return teams.length === 2 ? { teams } : null;
}

/* ------------------------------------------------ FIBA LiveStats */

export interface LiveStatsPlayer {
  shirtNumber: number | null;
  firstName: string;
  familyName: string;
  starter: boolean;
  seconds: number;
  points: number;
  foulsDrawn: number;
}

export interface LiveStatsTeam {
  name: string;
  code: string | null;
  /** «Alvaro Chacon Escobar»; `null` si no lo pone. */
  coach: string | null;
  score: number;
  players: LiveStatsPlayer[];
}

export interface LiveStatsGame {
  /** Local (`tm.1`) y visitante (`tm.2`). */
  teams: [LiveStatsTeam, LiveStatsTeam];
  /**
   * ¿Trae los números de todos los jugadores y suman el tanteo? Hay actas sin
   * números y otras cortadas a mitad de partido.
   */
  complete: boolean;
}

interface LiveStatsJsonPlayer {
  shirtNumber?: string;
  firstName?: string;
  familyName?: string;
  starter?: number;
  sMinutes?: string;
  sPoints?: number;
  sFoulsOn?: number;
}

interface LiveStatsJsonTeam {
  name?: string;
  code?: string;
  coach?: string;
  score?: number;
  pl?: Record<string, LiveStatsJsonPlayer>;
}

/** El `data.json` de FIBA LiveStats de un partido; `null` si no lo es. */
export function parseLiveStats(json: string): LiveStatsGame | null {
  let data: {
    tm?: Record<string, LiveStatsJsonTeam>;
    period?: number;
    periodType?: string;
    clock?: string;
  };
  try {
    data = JSON.parse(json) as typeof data;
  } catch {
    return null;
  }
  const home = data.tm?.['1'];
  const away = data.tm?.['2'];
  if (!home || !away) return null;
  let complete = true;
  const team = (raw: LiveStatsJsonTeam): LiveStatsTeam => {
    const players = Object.values(raw.pl ?? {}).map((player) => {
      if (player.sPoints === undefined) complete = false;
      const shirt = Number(player.shirtNumber);
      return {
        shirtNumber:
          player.shirtNumber !== undefined && player.shirtNumber !== '' && Number.isInteger(shirt)
            ? shirt
            : null,
        firstName: (player.firstName ?? '').trim(),
        familyName: (player.familyName ?? '').trim(),
        starter: player.starter === 1,
        seconds: secondsOf(player.sMinutes),
        points: player.sPoints ?? 0,
        foulsDrawn: player.sFoulsOn ?? 0
      };
    });
    const score = raw.score ?? 0;
    if (players.reduce((sum, player) => sum + player.points, 0) !== score) complete = false;
    if (players.filter((player) => player.starter).length !== 5) complete = false;
    return {
      name: (raw.name ?? '').trim(),
      code: raw.code?.trim() || null,
      coach: raw.coach?.trim() || null,
      score,
      players
    };
  };
  const teams: [LiveStatsTeam, LiveStatsTeam] = [team(home), team(away)];
  // Cortada a mitad de partido: no llegó al final del cuarto 4 (o de la prórroga,
  // que cuenta sus periodos aparte).
  const overtime = data.periodType === 'OVERTIME';
  if ((!overtime && (data.period ?? 0) < 4) || (data.clock ?? '00:00') !== '00:00')
    complete = false;
  return { teams, complete };
}

/** Los apellidos del nombre corto del acta («J. Pino Hernandez» → pino, hernandez). */
export function shortSurnames(shortName: string): string[] {
  return shortName
    .replace(/^[^.]*\.\s*/, '')
    .split(/[\s-]+/)
    .map(plainName)
    .filter(Boolean);
}

/** ¿Tiene el nombre del `data.json` algún apellido del nombre corto del acta? */
export function sharesSurname(shortName: string, familyName: string): boolean {
  const surnames = shortSurnames(shortName);
  const family = familyName
    .split(/[\s-]+/)
    .map(plainName)
    .filter(Boolean);
  // «Mc Laughlin» y «McLaughlin», «Andrade Toyo» y «Toyo».
  return (
    family.some((word) => surnames.includes(word)) || plainName(familyName) === surnames.join('')
  );
}

/**
 * ¿Es el jugador del `data.json` el de la línea del acta? El mismo dorsal y,
 * para no fiarse sólo de él, algún apellido en común o, si la mesa lo
 * escribió de otra manera («Suzum» por «Sudzum») o al revés («Henry Lenell
 * D» por «Lenell D. Henry»), la inicial del nombre o una palabra cualquiera.
 */
export function sameLivePlayer(line: GeniusBoxLine, player: LiveStatsPlayer): boolean {
  if (line.shirtNumber === null || line.shirtNumber !== player.shirtNumber) return false;
  if (sharesSurname(line.shortName, player.familyName)) return true;
  const surnames = shortSurnames(line.shortName);
  const words = `${player.firstName} ${player.familyName}`
    .split(/[\s-]+/)
    .map(plainName)
    .filter(Boolean);
  const initial = plainName(/^([^.\s]+)\./.exec(line.shortName)?.[1] ?? '');
  return (
    words.some((word) => surnames.includes(word)) ||
    (initial !== '' && plainName(player.firstName).startsWith(initial))
  );
}

/** Pone a las líneas del acta los titulares y las faltas recibidas del `data.json`. */
export function applyLiveStats(lines: GeniusBoxLine[], team: LiveStatsTeam): number {
  let matched = 0;
  for (const line of lines) {
    const player = team.players.find((entry) => sameLivePlayer(line, entry));
    if (!player) continue;
    line.starter = player.starter;
    line.foulsDrawn = player.foulsDrawn;
    matched++;
  }
  return matched;
}

/* ------------------------------------------------------- totales */

export interface GeniusPlayerStats {
  personId: string;
  teamId: string;
  /** La última línea de acta: dorsal y nombre corto. */
  line: GeniusBoxLine;
  stats: SourceStats;
}

/**
 * Suma las actas por persona y equipo; sólo los partidos que jugó. En los
 * partidos sin `data.json` bueno no se sabe quién salió de titular ni las
 * faltas recibidas: cuentan como cero.
 */
export function aggregateGeniusBoxScores(lines: readonly GeniusBoxLine[]): GeniusPlayerStats[] {
  const byKey = new Map<string, GeniusPlayerStats>();
  for (const line of lines) {
    if (!playedIn(line)) continue;
    const key = `${line.personId}|${line.teamId}`;
    const entry = byKey.get(key) ?? {
      personId: line.personId,
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

/* ------------------------------------------------- nombres */

/** Partículas que van con el apellido que las sigue («De la Fuente», «Del Río»). */
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'di', 'van', 'von', 'mc', 'san']);

/** Sufijos del apellido, siempre igual: «Ii» → «II», «Jr» → «Jr.». */
const SUFFIXES: Record<string, string> = {
  jr: 'Jr.',
  'jr.': 'Jr.',
  ii: 'II',
  iii: 'III',
  iv: 'IV'
};

/**
 * El nombre de uso de un jugador chileno (o de otro país de habla hispana):
 * el primer nombre de pila (salvo los compuestos, `usualFirstName`) y el
 * **primer apellido** («Herrera Alvarez» → «Herrera»), con sus partículas
 * («De la Fuente»). Los de otros países se quedan con el apellido entero
 * («Payton-Clottey», «Ferreira Chaves»). Las tildes, de la Wikipedia
 * (`reference`) o, en los de habla hispana, del diccionario.
 */
export function chileanName(
  firstName: string,
  familyName: string,
  reference: string | null,
  nationality: string | null
): { firstName: string; lastName: string } {
  const spanish = SPANISH_SPEAKING.has(nationality ?? '');
  const first = usualFirstName(toNameCase(firstName));
  const words = toNameCase(familyName, { fragment: false }).split(/\s+/).filter(Boolean);
  let lastWords = words;
  if (spanish && words.length > 1) {
    let end = 0;
    while (end < words.length - 1 && PARTICLES.has(words[end]!.toLowerCase())) end++;
    lastWords = words.slice(0, end + 1);
  }
  const last = lastWords
    .map((word, index) => (index > 0 ? (SUFFIXES[word.toLowerCase()] ?? word) : word))
    .join(' ');
  return {
    firstName: accentName(first, reference, spanish),
    lastName: accentName(last, reference, spanish)
  };
}

/* ---------------------------------------------------------- Wikipedia */

/** «[[Barham Amor|Barham Amor Alvear]] {{cap|15px}}» → «Barham Amor Alvear». */
function wikiText(raw: string): string {
  return raw
    .replace(/<small>[\s\S]*?<\/small>|<ref[\s\S]*?(?:<\/ref>|\/>)|<[^>]+>/g, ' ')
    .replace(/\[\[(?:Archivo|File|Imagen):[^\]]*\]\]/gi, ' ')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Las banderas de una celda: «{{bandera|VEN}}{{bandera|CHI}}» → «VEN/CHI». */
function flagsOf(cell: string): string[] {
  return [...cell.matchAll(/\{\{\s*bandera\s*\|\s*([^|}]+)/gi)].map((match) => match[1]!.trim());
}

/**
 * Las filas de las tablas de plantilla de la ficha de un club de la
 * Wikipedia en español, como las de la LNB chilena:
 *
 *   |4||{{bandera|CHI}}||[[Alero (baloncesto)|A]]||Darrol Jones Navarrete||{{altura|m=1.95}}||{{edad|24|01|1994}}||…
 *
 * Las columnas de bandera y puesto cambian de orden de un club a otro: se
 * reconocen por el contenido. Con dos banderas (nacionalizados), las dos
 * («VEN/CHI»).
 */
export function parseWikiTableRoster(wikitext: string): WikiRosterEntry[] {
  const entries: WikiRosterEntry[] = [];
  for (const line of wikitext.split('\n')) {
    if (!line.startsWith('|') || !/\{\{\s*altura\s*\|/i.test(line)) continue;
    const cells = line.slice(1).split('||');
    const heightAt = cells.findIndex((cell) => /\{\{\s*altura\s*\|/i.test(cell));
    if (heightAt < 1) continue;
    const name = wikiText(cells[heightAt - 1]!);
    if (!name || !/\p{L}/u.test(name)) continue;
    const before = cells.slice(0, heightAt - 1);
    const flags = before.flatMap(flagsOf);
    const position =
      before
        .map((cell) => /\[\[[^\]|]*\|\s*(B|E|A|AP|P|Ala-Pívot)\s*\]\]/.exec(cell)?.[1])
        .find(Boolean) ?? null;
    const metres = /m\s*=\s*(\d(?:[.,]\d{1,2})?)\s*\}\}/.exec(cells[heightAt]!)?.[1];
    let heightCm: number | null = null;
    if (metres) {
      const [whole = '0', fraction = ''] = metres.split(/[.,]/);
      heightCm = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
      if (heightCm < 160 || heightCm > 235) heightCm = null;
    }
    const age = /\{\{\s*edad\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})\s*\|\s*(\d{4})/i.exec(
      cells.slice(heightAt).join('||')
    );
    entries.push({
      name,
      nationalityRaw: flags.length > 0 ? flags.join('/') : null,
      positionRaw: position === 'Ala-Pívot' ? 'AP' : position,
      heightCm,
      birthDate: age ? `${age[3]}-${age[2]!.padStart(2, '0')}-${age[1]!.padStart(2, '0')}` : null
    });
  }
  return entries;
}

export interface WikiForeigner {
  name: string;
  nationalityRaw: string;
}

/**
 * La tabla de extranjeros de los artículos de cada torneo: una fila por
 * club, con los inscritos y los cambios, cada uno con su bandera
 * («{{bandera|USA}} '''Troy Cracknell'''»). Incluye a los cortados, que ya
 * no están en ninguna plantilla.
 */
export function parseWikiForeigners(wikitext: string): WikiForeigner[] {
  const start = wikitext.search(/=+\s*Extranjeros\s*=+/);
  if (start < 0) return [];
  const end = wikitext.indexOf('|}', start);
  const section = wikitext.slice(start, end < 0 ? undefined : end);
  const out: WikiForeigner[] = [];
  for (const line of section.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('|-') || line.startsWith('|}')) continue;
    for (const cell of line.slice(1).split('||')) {
      const flags = flagsOf(cell);
      const name = wikiText(cell);
      if (flags.length === 1 && name && /\p{L}/u.test(name))
        out.push({ name, nationalityRaw: flags[0]! });
    }
  }
  return out;
}

/**
 * ¿Es este jugador (nombre de pila y apellidos del `data.json`) el de la
 * Wikipedia? El primer nombre de la Wikipedia tiene que ser uno de sus
 * nombres de pila (o el principio de uno) y alguna otra palabra, uno de sus
 * apellidos.
 */
export function sameChileanPlayer(
  firstName: string,
  familyName: string,
  wikiName: string
): boolean {
  const given = new Set(firstName.split(/\s+/).map(plainName).filter(Boolean));
  const surnames = new Set(
    familyName
      .split(/[\s-]+/)
      .map(plainName)
      .filter(Boolean)
  );
  // «Mc Laughlin» y «Mclaughlin»: también el apellido entero, junto.
  surnames.add(plainName(familyName));
  const words = wikiName
    .split(/[\s-]+/)
    .map(plainName)
    .filter(Boolean);
  if (words.length < 2) return false;
  const lead = words[0]!;
  const givenMatch =
    given.has(lead) || (lead.length >= 3 && [...given].some((name) => name.startsWith(lead)));
  const rest = words.slice(1);
  return givenMatch && (rest.some((word) => surnames.has(word)) || surnames.has(rest.join('')));
}

/** Por debajo de esta altura, un ala-pívot es alero. */
export const CHILE_MIN_POWER_FORWARD_CM = 198;

/**
 * La Wikipedia chilena pone «AP» a casi todos los americanos y las
 * estadísticas también los mandan ahí: con eso la liga salía con un 30 % de
 * ala-pívots. Los de menos de 198 cm pasan a alero.
 */
export function chileanPosition(
  position: SourcePosition | null,
  heightCm: number | null
): SourcePosition | null {
  return position === 'PF' && heightCm !== null && heightCm < CHILE_MIN_POWER_FORWARD_CM
    ? 'SF'
    : position;
}
