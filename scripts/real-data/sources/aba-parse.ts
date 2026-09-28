import { decodeEntities, rowCells, tableRows, textOf } from '../lib/html';
import { nationFromIso3 } from '../lib/nationalities';
import { minutesToSeconds, toIsoDate } from '../lib/normalize';
import type { SourcePosition } from '../lib/source-types';
import { addLine, emptyStats, playedIn, type BoxNumbers } from './lkl-parse';

/**
 * Lectura de aba-liga.com (la Liga Adriática) y druga.aba-liga.com (su
 * segunda división): PHP con HTML de servidor, en inglés, la misma aplicación
 * en los dos sitios. Las páginas llevan en la ruta la temporada (`25` es la
 * 2025-26) y la competición (`1` la ABA, `2` la ABA2).
 *
 * - La clasificación (`/standings/<temporada>/<competición>/`): una tabla por
 *   fase, cada una con su título («Top 8 …», «Play-out …», «Group A», «Regular
 *   Season …»), con el id de cada club en el enlace.
 * - El acta (`/match/<id>/<temporada>/<competición>/Boxscore/`): la cabecera
 *   (fase, fecha, público, pabellón, equipos y tanteo) y una tabla por equipo
 *   con minutos al segundo, tiros, rebotes de ataque y defensa, tapones
 *   puestos y recibidos, faltas cometidas y recibidas y valoración; los
 *   titulares llevan un `*` detrás del nombre. En la pestaña de comentarios, lo
 *   que dijeron los entrenadores después del partido («Nombre, trener Club:»).
 * - La plantilla de la temporada (`/team/<id>/<temporada>/<competición>/0/<slug>/`):
 *   todos los que pasaron por el club, también los que se fueron, con puesto,
 *   altura, fecha de nacimiento y nacionalidad (código ISO de tres letras).
 *
 * El id de jugador es el de la persona: el mismo en las dos ligas y en todas
 * las temporadas.
 */

/* ---------------------------------------------------------- puestos */

/** El puesto de la web (`Guard`, `Shooting Guard`, `Forward`, `Power Forward`, `Center`). */
export function abaPosition(raw: string | null | undefined): SourcePosition | null {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'guard':
    case 'point guard':
      return 'PG';
    case 'shooting guard':
      return 'SG';
    case 'forward':
    case 'small forward':
      return 'SF';
    case 'power forward':
      return 'PF';
    case 'center':
      return 'C';
    default:
      return null;
  }
}

/** La nacionalidad de la web (ISO de tres letras: `SRB`, `HRV`, `SVN`, `DEU`) en código COI. */
export function abaNationality(raw: string | null | undefined): string | null {
  return nationFromIso3(raw);
}

/* ---------------------------------------------------- clasificación */

export interface AbaStanding {
  rank: number;
  teamId: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
}

export interface AbaStandingsTable {
  /** El título de la tabla: «Top 8 Season 2025/26», «Group A», «Regular Season 2025/26»… */
  title: string;
  rows: AbaStanding[];
}

/** Las tablas de la clasificación, en el orden de la página, cada una con su título. */
export function parseAbaStandings(html: string): AbaStandingsTable[] {
  const tables: AbaStandingsTable[] = [];
  const pattern =
    /<h2 class="main_title">([\s\S]*?)<\/h2>|<table[^>]*league_standings_table[^>]*>([\s\S]*?)<\/table>/g;
  let title = '';
  for (const match of html.matchAll(pattern)) {
    if (match[1] !== undefined) {
      title = textOf(match[1]);
      continue;
    }
    const rows: AbaStanding[] = [];
    for (const row of tableRows(match[2] ?? '')) {
      const cells = rowCells(row);
      const teamId = /\/team\/(\d+)\//.exec(cells[1]?.html ?? '')?.[1];
      if (!teamId) continue;
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
    tables.push({ title, rows });
  }
  return tables;
}

/* ------------------------------------------------------------- acta */

export interface AbaBoxLine extends BoxNumbers {
  playerId: string;
  teamId: string;
  /** Como lo escribe el acta: apellido e inicial («Bailey Jr. V.»). */
  shortName: string;
  shirtNumber: number | null;
}

export interface AbaGameTeam {
  teamId: string;
  name: string;
  city: string;
  score: number;
}

export interface AbaGame {
  gameId: string;
  /** «ROUND 1, AdmiralBet ABA League, Season 2025/26 - Group A». */
  round: string;
  /** AAAA-MM-DD. */
  date: string | null;
  attendance: number | null;
  venue: string | null;
  home: AbaGameTeam;
  away: AbaGameTeam;
  lines: AbaBoxLine[];
  /** Quién habló después del partido: el nombre, tal cual. */
  speakers: string[];
}

function toNumber(html: string | undefined): number {
  const value = Number(textOf(html ?? ''));
  return Number.isFinite(value) ? value : 0;
}

/** Los dos equipos de la cabecera: enlace, ciudad y tanteo. */
function gameTeams(html: string): [AbaGameTeam, AbaGameTeam] | null {
  const block = /<div id="match_clubs_and_results_info_table">([\s\S]*?)<\/table>/.exec(html)?.[1];
  if (!block) return null;
  const clubs = [
    ...block.matchAll(
      /<span class="club"><a href="\/team\/(\d+)\/[^"]*">([\s\S]*?)<\/a><\/span>\s*<span class="city">([\s\S]*?)<\/span>/g
    )
  ];
  const score = /<td class="gameScore">\s*(\d+)\s*:\s*(\d+)/.exec(block);
  if (clubs.length !== 2 || !score) return null;
  const [home, away] = clubs.map((club, index) => ({
    teamId: club[1] ?? '',
    name: textOf(club[2] ?? ''),
    city: textOf(club[3] ?? ''),
    score: Number(score[index + 1])
  }));
  return [home as AbaGameTeam, away as AbaGameTeam];
}

/**
 * Las líneas de una tabla de equipo del acta. Las columnas son fijas: dorsal,
 * nombre, Min, Pts, %, 2P M/A/%, 3P M/A/%, TL M/A/%, rebotes D/O/T, Ass, St,
 * To, tapones Fv/Ag, faltas Cm/Rv, tres de «puntos desde», +/- y Val. Quien no
 * jugó sale con cuatro celdas.
 */
function teamLines(tableHtml: string, teamId: string): AbaBoxLine[] {
  const body = tableHtml.split(/<tbody>/i)[1] ?? '';
  const lines: AbaBoxLine[] = [];
  for (const row of tableRows(body)) {
    const cells = rowCells(row).map((cell) => cell.html);
    const playerId = /\/player\/(\d+)\//.exec(cells[1] ?? '')?.[1];
    if (!playerId) continue;
    const label = textOf(cells[1] ?? '');
    const full = cells.length >= 29;
    const n = (index: number): number => (full ? toNumber(cells[index]) : 0);
    lines.push({
      playerId,
      teamId,
      shortName: label.replace(/\*/g, '').replace(/\s+/g, ' ').trim(),
      shirtNumber: Number.isInteger(Number(textOf(cells[0] ?? '')))
        ? Number(textOf(cells[0] ?? ''))
        : null,
      starter: label.includes('*'),
      seconds: full ? minutesToSeconds(textOf(cells[2] ?? '')) : 0,
      points: n(3),
      twoPointMade: n(5),
      twoPointAttempted: n(6),
      threePointMade: n(8),
      threePointAttempted: n(9),
      freeThrowMade: n(11),
      freeThrowAttempted: n(12),
      defensiveRebounds: n(14),
      offensiveRebounds: n(15),
      assists: n(17),
      steals: n(18),
      turnovers: n(19),
      blocks: n(20),
      blocksReceived: n(21),
      fouls: n(22),
      foulsDrawn: n(23),
      rating: n(28)
    });
  }
  return lines;
}

/** Quién habló en los comentarios: «Nombre, trener Club:» o «Nombre, Club head coach:». */
function speakersOf(html: string): string[] {
  const start = html.indexOf('id="Comments"');
  if (start < 0) return [];
  const end = html.indexOf('id="Photo"', start);
  const block = html.slice(start, end > start ? end : undefined);
  const names: string[] = [];
  for (const match of block.matchAll(/<strong>([\s\S]*?)<\/strong>/g)) {
    const text = textOf(match[1] ?? '');
    const comma = text.indexOf(',');
    if (comma < 0 || !/trener|coach/i.test(text)) continue;
    const name = text.slice(0, comma).trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export function parseAbaBoxScore(html: string, gameId: string): AbaGame | null {
  const teams = gameTeams(html);
  if (!teams) return null;
  const round = textOf(/<span class="roundNumber">([\s\S]*?)<\/span>/.exec(html)?.[1] ?? '');
  const info =
    /<div class="col-sm-6 dateAndVenue_container">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
  const infoText = textOf(info.replace(/<br\s*\/?>/gi, '\n'));
  const date = toIsoDate(/(\d{2})\.(\d{2})\.(\d{4})/.exec(infoText)?.[0].replace(/\./g, '/'));
  const attendance = /fa-users"><\/i>\s*(\d+)/.exec(info)?.[1];
  const venue = /Venue:\s*([^<]*)/.exec(info)?.[1]?.trim();

  const start = html.indexOf('id="Boxscore"');
  const end = html.indexOf('id="UnofficialBoxscore"', start);
  const box = start >= 0 ? html.slice(start, end > start ? end : undefined) : '';
  const lines: AbaBoxLine[] = [];
  const pattern =
    /<a class="team" href="[^"]*\/team\/(\d+)\/[^"]*">[\s\S]*?<table[^>]*match_boxscore_team_table[^>]*>([\s\S]*?)<\/table>/g;
  for (const match of box.matchAll(pattern)) {
    lines.push(...teamLines(match[2] ?? '', match[1] ?? ''));
  }
  if (lines.length === 0) return null;
  return {
    gameId,
    round,
    date,
    attendance: attendance ? Number(attendance) : null,
    venue: venue ? decodeEntities(venue) : null,
    home: teams[0],
    away: teams[1],
    lines,
    speakers: speakersOf(html)
  };
}

/** Suma las líneas de las actas por jugador y club; sólo los partidos que jugó. */
export function aggregateAbaBoxScores(
  lines: readonly AbaBoxLine[]
): { playerId: string; teamId: string; line: AbaBoxLine; stats: ReturnType<typeof emptyStats> }[] {
  const byKey = new Map<
    string,
    { playerId: string; teamId: string; line: AbaBoxLine; stats: ReturnType<typeof emptyStats> }
  >();
  for (const line of lines) {
    if (!playedIn(line)) continue;
    const key = `${line.playerId}|${line.teamId}`;
    const entry = byKey.get(key) ?? {
      playerId: line.playerId,
      teamId: line.teamId,
      line,
      stats: emptyStats()
    };
    addLine(entry.stats, line);
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}

/* -------------------------------------------------------- plantilla */

export interface AbaRosterPlayer {
  playerId: string;
  fullName: string;
  positionRaw: string | null;
  heightCm: number | null;
  /** AAAA-MM-DD. */
  birthDate: string | null;
  nationalityRaw: string | null;
}

/** La tabla «Roster, Season …» de la página del club en la temporada. */
export function parseAbaRoster(html: string): AbaRosterPlayer[] {
  const start = html.indexOf('Roster, Season');
  if (start < 0) return [];
  const end = html.indexOf('</table>', start);
  const players: AbaRosterPlayer[] = [];
  for (const row of tableRows(html.slice(start, end > start ? end : undefined))) {
    const cells = rowCells(row).map((cell) => cell.html);
    const playerId = /\/player\/(\d+)\//.exec(cells[2] ?? '')?.[1];
    if (!playerId) continue;
    const height = Number(textOf(cells[4] ?? ''));
    const position = textOf(cells[3] ?? '');
    const nationality = textOf(cells[6] ?? '');
    players.push({
      playerId,
      fullName: textOf(cells[2] ?? ''),
      positionRaw: position || null,
      // Alguna ficha trae «2» por altura: sólo valen alturas de persona.
      heightCm: Number.isFinite(height) && height >= 150 && height <= 240 ? height : null,
      birthDate: toIsoDate(textOf(cells[5] ?? '').replace(/\./g, '/')),
      nationalityRaw: nationality || null
    });
  }
  return players;
}

/* ------------------------------------------------------ entrenadores */

/** Un nombre sin tildes, mayúsculas ni espacios: para comparar grafías. */
export function plainName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/**
 * Quién habló por cada club después de los partidos, en orden. La
 * declaración no dice de qué club es el que habla (sólo el nombre del club en
 * genitivo y en serbio o croata), así que un nombre es de un club si ese club
 * jugó todos los partidos en los que habló; y si habló una sola vez, del club
 * que no es el del otro que habló ese día.
 */
export function speakersByTeam(games: readonly AbaGame[]): Map<string, string[]> {
  const teamsOf = new Map<string, { name: string; teams: Set<string> }>();
  for (const game of games) {
    const playing = [game.home.teamId, game.away.teamId];
    for (const name of game.speakers) {
      const key = plainName(name);
      const entry = teamsOf.get(key);
      if (!entry) teamsOf.set(key, { name, teams: new Set(playing) });
      else entry.teams = new Set([...entry.teams].filter((id) => playing.includes(id)));
    }
  }
  // Los dos que hablan en un partido son de clubes distintos: si se sabe el de
  // uno, el otro es del rival. Hasta que no cambie nada.
  for (let changed = true; changed;) {
    changed = false;
    for (const game of games) {
      const entries = game.speakers.map((name) => teamsOf.get(plainName(name)));
      for (const entry of entries) {
        if (!entry || entry.teams.size !== 2) continue;
        const known = entries.find((other) => other && other !== entry && other.teams.size === 1);
        if (!known) continue;
        const [taken] = [...known.teams];
        entry.teams = new Set([...entry.teams].filter((id) => id !== taken));
        changed = true;
      }
    }
  }
  const byTeam = new Map<string, string[]>();
  const ordered = [...games].sort(
    (a, b) => (a.date ?? '').localeCompare(b.date ?? '') || Number(a.gameId) - Number(b.gameId)
  );
  for (const game of ordered) {
    for (const name of game.speakers) {
      const entry = teamsOf.get(plainName(name));
      if (!entry || entry.teams.size !== 1) continue;
      const [teamId] = [...entry.teams];
      const list = byTeam.get(teamId as string) ?? [];
      if (!list.some((known) => plainName(known) === plainName(name))) list.push(name);
      byTeam.set(teamId as string, list);
    }
  }
  return byTeam;
}

/* ----------------------------------------------------------- nombres */

/** Sufijos que van con el apellido y se escriben siempre igual. */
const SUFFIXES: Record<string, string> = {
  jr: 'Jr.',
  'jr.': 'Jr.',
  ii: 'II',
  iii: 'III',
  iv: 'IV'
};

/**
 * Nombre y apellido de un jugador. La plantilla da el nombre completo, y el de
 * los estadounidenses es el legal («Khalil Umar Mubaarak Brantley»); el acta
 * da el apellido con la inicial («Mubaarak Brantley K.»), que dice dónde
 * empieza; sin acta, el apellido es la última palabra. Del nombre de pila se
 * queda el de uso (`firstNameOf`) y los sufijos se escriben igual para todos
 * («JR» → «Jr.»). Los apellidos de dos palabras de quien no jugó («Yago dos
 * Santos») van a mano.
 */
export function splitAbaName(
  fullName: string,
  shortName: string | null,
  firstNameOf: (legal: string) => string
): { firstName: string; lastName: string } {
  const full = fullName.replace(/\s+/g, ' ').trim();
  const fromBox = shortName
    ?.replace(/\s+\S{1,3}\.$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  let first: string;
  let last: string;
  if (fromBox && full.toLowerCase().endsWith(` ${fromBox.toLowerCase()}`)) {
    last = full.slice(full.length - fromBox.length);
    first = full.slice(0, full.length - fromBox.length).trim();
  } else {
    // Sin acta (no jugó): el apellido es la última palabra, con su sufijo
    // («Nombre Segundo Apellido Jr»); una inicial suelta al final sobra.
    const words = full.split(' ').filter((word) => !/^\p{Lu}\.$/u.test(word));
    const suffix = words.length > 2 && SUFFIXES[(words[words.length - 1] ?? '').toLowerCase()];
    const lastWords = suffix ? 2 : 1;
    first = words.slice(0, Math.max(1, words.length - lastWords)).join(' ');
    last = words.slice(Math.max(1, words.length - lastWords)).join(' ');
  }
  last = last
    .split(' ')
    .map((word) => SUFFIXES[word.toLowerCase()] ?? word)
    .join(' ');
  return { firstName: firstNameOf(first), lastName: last };
}
