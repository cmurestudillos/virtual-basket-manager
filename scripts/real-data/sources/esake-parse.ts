import { decodeEntities, rowCells, tableRows, textOf } from '../lib/html';
import { minutesToSeconds, toHeightCm, toInt, toIsoDate, usualFirstName } from '../lib/normalize';
import type { SourceStats } from '../lib/source-types';

/**
 * Lectura de las páginas de esake.gr (la Stoiximan GBL, la A1 griega) y de la
 * tabla de totales de basketball-reference, de la que sólo se sacan los
 * nombres en alfabeto latino. Sólo parseo, sin red: `esake.ts` descarga y
 * decide.
 *
 * esake.gr es HTML de servidor sin API. Los nombres vienen unos en latino y
 * otros en griego (los extranjeros, transcritos: no se pueden deshacer), los
 * países en griego y las actas sin titulares ni entrenadores.
 */

/** Los ids de esake son ocho cifras hexadecimales: equipos, jugadores y partidos. */
const HEX_ID = /[0-9A-F]{8}/;

function idAfter(html: string, key: string): string | null {
  return new RegExp(`${key}=(${HEX_ID.source})`).exec(html)?.[1] ?? null;
}

export interface EsakeStanding {
  rank: number;
  teamId: string;
  name: string;
  games: number | null;
  wins: number | null;
  losses: number | null;
}

/** `EsakeRanking?idchampionship=…&day=<jornada>-1`: la clasificación tras esa jornada. */
export function parseEsakeStandings(html: string): EsakeStanding[] {
  const table = /<table class="table table-esake[^"]*">([\s\S]*?)<\/table>/.exec(html)?.[1] ?? '';
  return tableRows(table).flatMap((row) => {
    const cells = rowCells(row);
    const first = cells[0]?.html ?? '';
    const teamId = idAfter(first, 'idteam');
    const text = textOf(first);
    const match = /^(\d+)\s+(.+)$/.exec(text);
    if (!teamId || !match) return [];
    const record = /(\d+)\s*-\s*(\d+)/.exec(textOf(cells[3]?.html ?? ''));
    return [
      {
        rank: Number(match[1]),
        teamId,
        name: match[2]!.trim(),
        games: toInt(textOf(cells[2]?.html ?? '')),
        wins: record ? Number(record[1]) : null,
        losses: record ? Number(record[2]) : null
      }
    ];
  });
}

export interface EsakeListPlayer {
  playerId: string;
  /** Tal cual: en latino («PROTOPOULOS») o en griego («ΠΡΩΤΟΣ»). */
  lastName: string;
  firstName: string;
  shirtNumber: number | null;
  heightCm: number | null;
  /** PG, SG, SF, PF o C. */
  position: string | null;
  birthDate: string | null;
  /** En griego («ΗΠΑ»). */
  country: string | null;
}

/**
 * `EsakePlayers?idchampionship=…&idteam=…`: la plantilla de un equipo en una
 * temporada, una ficha por jugador. Ojo: el «equipo» de la ficha es el de
 * hoy, no el de esa temporada; no se usa.
 */
export function parseEsakePlayers(html: string): EsakeListPlayer[] {
  return html
    .split('<div class="player-tile">')
    .slice(1)
    .flatMap((tile) => {
      const playerId = idAfter(tile, 'idplayer');
      const name = /<SPAN>([\s\S]*?)<\/SPAN>([^<]*)<BR\/>\s*([^<]*)/i.exec(tile);
      if (!playerId || !name) return [];
      const number = /player-title-number[^>]*>[\s\S]*?<\/span>\s*(\d+)/.exec(tile)?.[1];
      let lastName = textOf(name[1] ?? '');
      let firstName = textOf(name[3] ?? '');
      // «<SPAN>ΠΡΩΤΟΣ</SPAN> -<BR/>ΔΕΥΤΕΡΟΣ ΝΙΚΟΣ»: el apellido doble sigue tras el salto.
      if ((name[2] ?? '').trim() === '-') {
        const [second = '', ...rest] = firstName.split(' ');
        lastName = `${lastName}-${second}`;
        firstName = rest.join(' ');
      }
      return [
        {
          playerId,
          lastName,
          firstName,
          shirtNumber: number === undefined ? null : Number(number),
          ...parseEsakeBio(tile)
        }
      ];
    });
}

export type EsakeBio = Pick<EsakeListPlayer, 'heightCm' | 'position' | 'birthDate' | 'country'>;

/**
 * Los datos de una ficha, que esake escribe en tablas de dos columnas
 * («ΘΕΣΗ» | «SG»): en la plantilla y en la página del jugador
 * (`EsakeplayerView?idplayer=…`), que es de donde salen los que jugaron y ya
 * no están en la plantilla de la temporada.
 */
export function parseEsakeBio(html: string): EsakeBio {
  const cells = [...html.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((match) => textOf(match[1] ?? ''));
  const field = (label: RegExp): string | null => {
    const index = cells.findIndex((cell) => label.test(cell));
    const value = index >= 0 ? cells[index + 1] : undefined;
    return value && value.trim() !== '' ? value.trim() : null;
  };
  return {
    heightCm: toHeightCm(field(/^ΥΨΟΣ$/)),
    position: field(/^ΘΕΣΗ$/),
    birthDate: toIsoDate(field(/^ΗΜ\. ΓΕΝΝΗΣΗΣ$/)),
    country: field(/^ΧΩΡΑ$/)
  };
}

export interface EsakeGame {
  gameId: string;
  round: number | null;
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
}

/**
 * `EsakeResults?idchampionship=…&idseason=00000001&series=<jornada>`: los
 * partidos de una jornada. Los equipos salen de la ruta de su escudo
 * (`/dat/esaketeam/<id>/…`), que es lo único con su id.
 */
export function parseEsakeResults(html: string): EsakeGame[] {
  return html
    .split('<div class="esake-program-game">')
    .slice(1)
    .flatMap((block) => {
      const gameId = idAfter(block, 'idgame');
      const teams = [...block.matchAll(/\/dat\/esaketeam\/([0-9A-F]{8})\//g)].map(
        (match) => match[1] ?? ''
      );
      if (!gameId || teams.length < 2) return [];
      const round = /<h5>\s*(\d+)/.exec(block)?.[1];
      const score = /<span>(\d+)(?:&nbsp;|\s)*-(?:&nbsp;|\s)*(\d+)<\/span>/.exec(block);
      const infos = [...block.matchAll(/esake-program-game-info[^>]*>([\s\S]*?)<\/div>/g)].map(
        (match) => textOf(match[1] ?? '')
      );
      return [
        {
          gameId,
          round: round ? Number(round) : null,
          homeId: teams[0]!,
          awayId: teams[1]!,
          homeScore: score ? Number(score[1]) : null,
          awayScore: score ? Number(score[2]) : null,
          venue: infos[1] ?? null
        }
      ];
    });
}

export interface EsakeBoxLine {
  teamId: string;
  playerId: string;
  /** Como en el acta: «ΣΜΙΘ ΤΖΟΝ» o «PROTOPOULOS NIKOS». */
  name: string;
  lastName: string;
  firstName: string;
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
  blocksReceived: number;
  fouls: number;
  foulsDrawn: number;
  /** La «RANK» de esake: la valoración. */
  rating: number;
}

function madeAttempted(text: string): [number, number] {
  const match = /(\d+)\s*-\s*(\d+)/.exec(text);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

/**
 * `EsakegameView?idgame=…&mode=3`: el acta. Una tabla por equipo tras
 * «ΑΝΑΛΥΤΙΚΑ ΣΤΑΤΙΣΤΙΚΑ <equipo>». Columnas: P, 2PM-A, 3PM-A, FTM-A, REBS,
 * D.REBS, O.REBS, AST, BLK (hechos), BLK-A (recibidos), FOULS F (recibidas,
 * «Κερδισμένα»), FOULS M (cometidas, «Αμυντικά»), STL, TO, TIM.PL., RANK.
 * Quien no salió a pista (00:00:00 y nada más) no cuenta. El id de equipo de
 * los enlaces de cada jugador no es de fiar: vale el de la cabecera.
 */
export function parseEsakeBoxScore(html: string): EsakeBoxLine[] {
  const lines: EsakeBoxLine[] = [];
  const parts = html.split('ΑΝΑΛΥΤΙΚΑ ΣΤΑΤΙΣΤΙΚΑ').slice(1);
  for (const part of parts) {
    const teamId = idAfter(part.slice(0, 300), 'idteam');
    const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(part)?.[1];
    if (!teamId || !body) continue;
    for (const row of tableRows(body)) {
      const cells = rowCells(row);
      const playerId = idAfter(cells[0]?.html ?? '', 'idplayer');
      if (!playerId || cells.length < 17) continue;
      const value = (index: number): string => textOf(cells[index]?.html ?? '');
      const int = (index: number): number => toInt(value(index)) ?? 0;
      const [twoPointMade, twoPointAttempted] = madeAttempted(value(2));
      const [threePointMade, threePointAttempted] = madeAttempted(value(3));
      const [freeThrowMade, freeThrowAttempted] = madeAttempted(value(4));
      const nameHtml = (cells[0]?.html ?? '').replace(/^[\s\S]*<\/div>/, '');
      const split = /<SPAN>([\s\S]*?)<\/SPAN>([\s\S]*)$/i.exec(nameHtml);
      const line: EsakeBoxLine = {
        teamId,
        playerId,
        name: textOf(nameHtml),
        lastName: textOf(split?.[1] ?? nameHtml),
        firstName: textOf(split?.[2] ?? ''),
        seconds: minutesToSeconds(value(15)),
        points: int(1),
        twoPointMade,
        twoPointAttempted,
        threePointMade,
        threePointAttempted,
        freeThrowMade,
        freeThrowAttempted,
        defensiveRebounds: int(6),
        offensiveRebounds: int(7),
        assists: int(8),
        blocks: int(9),
        blocksReceived: int(10),
        foulsDrawn: int(11),
        fouls: int(12),
        steals: int(13),
        turnovers: int(14),
        rating: int(16)
      };
      const played =
        line.seconds > 0 ||
        line.points + line.twoPointAttempted + line.threePointAttempted + line.freeThrowAttempted >
          0 ||
        line.offensiveRebounds + line.defensiveRebounds + line.assists + line.fouls > 0;
      if (played) lines.push(line);
    }
  }
  return lines;
}

export interface EsakePlayerStats {
  playerId: string;
  teamId: string;
  name: string;
  lastName: string;
  firstName: string;
  stats: SourceStats;
}

/** Los totales de cada jugador en cada equipo, sumando sus actas. */
export function aggregateEsakeBoxScores(lines: readonly EsakeBoxLine[]): EsakePlayerStats[] {
  const byKey = new Map<string, EsakePlayerStats>();
  for (const line of lines) {
    const key = `${line.playerId}|${line.teamId}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        playerId: line.playerId,
        teamId: line.teamId,
        name: line.name,
        lastName: line.lastName,
        firstName: line.firstName,
        stats: {
          games: 0,
          // esake no marca los titulares ni los mates.
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
          blocksReceived: 0,
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

// ---------------------------------------------------------------------------
// basketball-reference
// ---------------------------------------------------------------------------

export interface BbrefRow {
  /** «Nombre Apellido», en latino y con sus tildes. */
  name: string;
  /** Ruta de su ficha, que sirve de id. */
  playerPath: string;
  /** Tramo de la ruta del equipo (`aek-athens`, `rhodes`). */
  teamSlug: string;
  games: number;
  minutes: number;
  points: number;
  threePointMade: number;
  freeThrowMade: number;
  rebounds: number;
  assists: number;
  /**
   * Rebotes de ataque y defensa, tapones y faltas: sólo si la tabla trae esas
   * columnas (la de la liga turca sí; Turquía los toma de aquí).
   */
  offensiveRebounds?: number;
  defensiveRebounds?: number;
  blocks?: number;
  fouls?: number;
}

/**
 * `/international/<liga>/<año>_totals.html`: la tabla de totales de la liga
 * regular, una fila por jugador y equipo.
 */
export function parseBbrefTotals(html: string): BbrefRow[] {
  return tableRows(html).flatMap((row) => {
    const cell = (stat: string): string | null => {
      const match = new RegExp(`data-stat="${stat}"[^>]*>([\\s\\S]*?)</t[dh]>`).exec(row);
      return match ? decodeEntities(match[1] ?? '') : null;
    };
    const player = cell('player');
    const team = cell('team_name');
    const playerPath = /href='([^']+)'/.exec(player ?? '')?.[1];
    const teamSlug = /\/international\/teams\/([^/]+)\//.exec(team ?? '')?.[1];
    if (!player || !playerPath || !teamSlug) return [];
    const int = (stat: string): number => toInt(textOf(cell(stat) ?? '')) ?? 0;
    const optional = (stat: string, key: keyof BbrefRow): Partial<BbrefRow> =>
      cell(stat) === null ? {} : { [key]: int(stat) };
    return [
      {
        name: textOf(player),
        playerPath,
        teamSlug,
        games: int('g'),
        minutes: int('mp'),
        points: int('pts'),
        threePointMade: int('fg3'),
        freeThrowMade: int('ft'),
        rebounds: int('trb'),
        assists: int('ast'),
        ...optional('orb', 'offensiveRebounds'),
        ...optional('drb', 'defensiveRebounds'),
        ...optional('blk', 'blocks'),
        ...optional('pf', 'fouls')
      }
    ];
  });
}

/**
 * Lo lejos que están unos totales de esake y una fila de basketball-reference
 * del mismo equipo: 0 si coinciden en todo. Pesan más los partidos y los
 * puntos, que casi nunca se corrigen.
 */
export function bbrefDistance(stats: SourceStats, row: BbrefRow): number {
  return (
    Math.abs(stats.games - row.games) * 10 +
    Math.abs(stats.points - row.points) * 2 +
    Math.abs(stats.offensiveRebounds + stats.defensiveRebounds - row.rebounds) +
    Math.abs(stats.assists - row.assists) +
    Math.abs(stats.threePointMade - row.threePointMade) +
    Math.abs(stats.freeThrowMade - row.freeThrowMade) +
    Math.abs(Math.round(stats.seconds / 60) - row.minutes) / 3
  );
}

/**
 * Empareja jugadores de esake con filas de basketball-reference del mismo
 * equipo: de la pareja más parecida a la menos, cada uno una sola vez y sólo
 * si están a menos de `maxDistance`. Devuelve la fila de cada jugador.
 */
export function matchBbref<T extends { stats: SourceStats }>(
  players: readonly T[],
  rows: readonly BbrefRow[],
  maxDistance = 12
): Map<T, BbrefRow> {
  const pairs: { player: T; row: BbrefRow; distance: number }[] = [];
  for (const player of players) {
    for (const row of rows) {
      const distance = bbrefDistance(player.stats, row);
      if (distance <= maxDistance) pairs.push({ player, row, distance });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  const matched = new Map<T, BbrefRow>();
  const used = new Set<BbrefRow>();
  for (const { player, row } of pairs) {
    if (matched.has(player) || used.has(row)) continue;
    matched.set(player, row);
    used.add(row);
  }
  return matched;
}

/** Sufijos que van con el apellido en los nombres anglosajones. */
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);

/**
 * Parte «Nombre Apellido» de basketball-reference con tantas palabras de
 * apellido como tiene el de esake (más el sufijo, si lo hay).
 */
export function splitBbrefName(
  full: string,
  lastNameWords: number
): { firstName: string; lastName: string } {
  const words = full.trim().split(/\s+/);
  let count = Math.max(1, lastNameWords);
  if (SUFFIXES.has((words[words.length - 1] ?? '').toLowerCase())) count += 1;
  // «Silvio De Sousa», «Jake Van Tubbergen»: la partícula va con el apellido.
  while (
    count < words.length - 1 &&
    SURNAME_PARTICLES.has((words[words.length - count - 1] ?? '').toLowerCase())
  ) {
    count += 1;
  }
  if (count >= words.length) count = words.length - 1;
  if (count <= 0) return { firstName: '', lastName: full.trim() };
  return {
    // Con varios nombres de pila, el primero, que es el que se usa.
    firstName: usualFirstName(words.slice(0, -count).join(' ')),
    lastName: words.slice(-count).join(' ')
  };
}

const SURNAME_PARTICLES = new Set([
  'de',
  'da',
  'del',
  'della',
  'di',
  'du',
  'dos',
  'van',
  'von',
  'der',
  'le',
  'la'
]);
