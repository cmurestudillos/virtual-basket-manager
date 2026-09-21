import { decodeEntities, rowCells, tableRows, textOf } from '../lib/html';
import { toInt } from '../lib/normalize';
import type { SourceStats } from '../lib/source-types';

/**
 * Lectura de la web de la Lega Nazionale Pallacanestro (la Serie A2 italiana):
 * la clasificación y el calendario, que salen en JSON de su servicio de
 * estadísticas (`lnpstat.domino.it`), y las estadísticas por equipo y la ficha
 * de cada jugador, que son HTML de Drupal. Sólo parseo, sin red: `lnp.ts`
 * descarga y decide.
 */

export interface LnpStanding {
  position: number;
  teamId: string;
  name: string;
  games: number | null;
}

/** `getstatisticsfiles?task=standings&round=ista…`: la clasificación final de la fase. */
export function parseStandings(text: string): LnpStanding[] {
  const json: unknown = JSON.parse(text);
  if (!json || typeof json !== 'object' || 'error' in json) return [];
  const rows = Object.values(json as Record<string, unknown>).filter(
    (row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object'
  );
  return rows
    .flatMap((row) => {
      const position = toInt(row.position as number | string | null | undefined);
      const teamId =
        typeof row.teamid === 'string' || typeof row.teamid === 'number' ? String(row.teamid) : '';
      const name = typeof row.teamname === 'string' ? row.teamname.trim() : '';
      if (position === null || teamId === '' || name === '') return [];
      return [{ position, teamId, name, games: toInt(row.games as string | null | undefined) }];
    })
    .sort((a, b) => a.position - b.position);
}

export interface LnpGame {
  gameId: string;
  round: number | null;
  homeId: string;
  awayId: string;
  /** «PalaFinto - Ciudad»: el pabellón y la ciudad del equipo de casa. */
  arena: string | null;
  /** `AAAA-MM-DD`. */
  date: string | null;
  finished: boolean;
}

/** `getstatisticsfiles?task=schedule&round=N…`: los partidos de una jornada. */
export function parseSchedule(text: string): LnpGame[] {
  const json: unknown = JSON.parse(text);
  if (!Array.isArray(json)) return [];
  return json.flatMap((row: Record<string, unknown>) => {
    const text = (key: string): string | null =>
      typeof row[key] === 'string' && (row[key] as string).trim() !== ''
        ? (row[key] as string).trim()
        : null;
    const gameId = text('gameid');
    const homeId = text('teamid_home');
    const awayId = text('teamid_away');
    if (!gameId || !homeId || !awayId) return [];
    const day = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text('date') ?? '');
    return [
      {
        gameId,
        round: toInt(text('round')),
        homeId,
        awayId,
        arena: text('arena'),
        date: day ? `${day[3]}-${day[2]!.padStart(2, '0')}-${day[1]!.padStart(2, '0')}` : null,
        finished: text('game_status') === 'finished'
      }
    ];
  });
}

/** «PalaFinto - Ciudad» → pabellón y ciudad; sin guion, todo es el pabellón. */
export function splitArena(arena: string | null): { pavilion: string | null; city: string | null } {
  if (!arena) return { pavilion: null, city: null };
  const cut = arena.lastIndexOf(' - ');
  if (cut < 0) return { pavilion: arena.trim() || null, city: null };
  return {
    pavilion: arena.slice(0, cut).trim() || null,
    city: arena.slice(cut + 3).trim() || null
  };
}

export interface LnpStatsLine {
  playerId: string;
  /** Nombre y apellido seguidos, como en la tabla («Nombre Apellido Apellido»). */
  name: string;
  games: number;
  minutes: number;
  points: number;
  fouls: number;
  foulsDrawn: number;
  twoPointMade: number;
  twoPointAttempted: number;
  threePointMade: number;
  threePointAttempted: number;
  freeThrowMade: number;
  freeThrowAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  blocks: number;
  blocksReceived: number;
  turnovers: number;
  steals: number;
  assists: number;
}

/**
 * La tabla que devuelve el Ajax de Drupal al elegir competición en
 * «Statistiche giocatori» del equipo: una lista de comandos, y el que rellena
 * `#tabelle-stats-giocatori-wrapper` trae el HTML.
 */
export function statsHtmlFromAjax(text: string): string | null {
  const json: unknown = JSON.parse(text);
  if (!Array.isArray(json)) return null;
  const command = json.find(
    (entry: Record<string, unknown>) =>
      entry?.command === 'insert' && entry.selector === '#tabelle-stats-giocatori-wrapper'
  ) as { data?: unknown } | undefined;
  return typeof command?.data === 'string' ? command.data : null;
}

/** La primera `<table>` que empieza después de `marker`, sin las anidadas. */
function tableAfter(html: string, marker: RegExp): string {
  const start = html.search(marker);
  if (start < 0) return '';
  const rest = html.slice(start);
  const open = rest.search(/<table\b/i);
  const close = rest.search(/<\/table>/i);
  return open >= 0 && close > open ? rest.slice(open, close) : '';
}

/**
 * Los totales de cada jugador. La web parte la tabla en dos (los nombres a la
 * izquierda y los números a la derecha) y las filas van en el mismo orden. Las
 * columnas: puntos, partidos, minutos, faltas cometidas y recibidas, tiros de
 * dos, de tres y libres (anotados, intentados y porcentaje), rebotes
 * (ofensivos, defensivos, totales), tapones (puestos, recibidos), pérdidas,
 * recuperaciones y asistencias. No da valoración, titularidades ni mates.
 */
export function parseTeamStats(html: string): LnpStatsLine[] {
  const totals = html.split(/<h4[^>]*>\s*Medie/i)[0] ?? '';
  const names = tableRows(tableAfter(totals, /class="table-left"/i)).flatMap((row) => {
    const link = /giocatore\/wp\/([A-Za-z0-9]+)"[^>]*>([^<]*)</i.exec(row);
    return link ? [{ playerId: link[1] ?? '', name: decodeEntities(link[2] ?? '').trim() }] : [];
  });
  const numbers = tableRows(tableAfter(totals, /class="table-right"/i))
    .map((row) => rowCells(row).map((cell) => toInt(textOf(cell.html)) ?? 0))
    .filter((cells) => cells.length >= 22);
  if (names.length !== numbers.length) return [];
  return names.map(({ playerId, name }, index) => {
    const c = numbers[index] as number[];
    const at = (i: number): number => c[i] ?? 0;
    return {
      playerId,
      name,
      points: at(0),
      games: at(1),
      minutes: at(2),
      fouls: at(3),
      foulsDrawn: at(4),
      twoPointMade: at(5),
      twoPointAttempted: at(6),
      threePointMade: at(8),
      threePointAttempted: at(9),
      freeThrowMade: at(11),
      freeThrowAttempted: at(12),
      offensiveRebounds: at(14),
      defensiveRebounds: at(15),
      blocks: at(17),
      blocksReceived: at(18),
      turnovers: at(19),
      steals: at(20),
      assists: at(21)
    };
  });
}

/** Las estadísticas de la LNP en el formato común; `null` si no jugó. */
export function toSourceStats(line: LnpStatsLine): SourceStats | null {
  if (line.games <= 0) return null;
  return {
    games: line.games,
    starts: null,
    seconds: line.minutes * 60,
    points: line.points,
    twoPointMade: line.twoPointMade,
    twoPointAttempted: line.twoPointAttempted,
    threePointMade: line.threePointMade,
    threePointAttempted: line.threePointAttempted,
    freeThrowMade: line.freeThrowMade,
    freeThrowAttempted: line.freeThrowAttempted,
    offensiveRebounds: line.offensiveRebounds,
    defensiveRebounds: line.defensiveRebounds,
    assists: line.assists,
    steals: line.steals,
    turnovers: line.turnovers,
    blocks: line.blocks,
    blocksReceived: line.blocksReceived,
    dunks: null,
    fouls: line.fouls,
    foulsDrawn: line.foulsDrawn,
    rating: null
  };
}

export interface LnpPlayerPage {
  /** «Apellido Nombre», como lo escribe la ficha. */
  surnameFirst: string | null;
  shirtNumber: string | null;
  role: string | null;
  /** «27/6/1999». */
  birth: string | null;
  /** Código de tres letras; con doble nacionalidad, «CRO/ITA». */
  nationality: string | null;
  height: string | null;
  weight: string | null;
}

/** La ficha del jugador (`/giocatore/wp/<id>`). */
export function parsePlayerPage(html: string): LnpPlayerPage {
  const byClass = (className: string): string | null => {
    const match = new RegExp(`<div class="${className}">([\\s\\S]*?)</div>`, 'i').exec(html);
    const text = match ? textOf(match[1] ?? '') : '';
    return text === '' ? null : text;
  };
  const spec = (label: string): string | null => {
    const match = new RegExp(
      `<span class="spec-label">\\s*${label}:?\\s*</span>\\s*<span class="spec-value">([\\s\\S]*?)</span>`,
      'i'
    ).exec(html);
    const text = match ? textOf(match[1] ?? '') : '';
    return text === '' || /^n\.?d\.?$/i.test(text) ? null : text;
  };
  return {
    surnameFirst: byClass('player-name'),
    shirtNumber: byClass('num-maglia'),
    role: byClass('ruolo'),
    birth: spec('Data di nascita'),
    nationality: spec('Nazionalità'),
    height: spec('Altezza'),
    weight: spec('Peso')
  };
}

/**
 * Nombre y apellidos a partir de las dos formas en que los escribe la web:
 * «Nombre Apellidos» en las tablas y «Apellidos Nombre» en la ficha. El corte
 * es el que hace que las dos coincidan («Filippo Baldi Rossi» y «Baldi Rossi
 * Filippo» → «Filippo» | «Baldi Rossi»). La ficha manda en las mayúsculas
 * («McGee»). Si no casan, la primera palabra de la tabla es el nombre.
 */
export function splitLnpName(
  nameFirst: string,
  surnameFirst: string | null
): { firstName: string; lastName: string } {
  const table = nameFirst.trim().split(/\s+/).filter(Boolean);
  const page = (surnameFirst ?? '').trim().split(/\s+/).filter(Boolean);
  const same = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((word, i) => word.toLowerCase() === b[i]?.toLowerCase());
  if (page.length === table.length && page.length > 1) {
    for (let first = 1; first < table.length; first += 1) {
      const pageFirst = page.slice(page.length - first);
      const pageLast = page.slice(0, page.length - first);
      if (same(table.slice(0, first), pageFirst) && same(table.slice(first), pageLast)) {
        return { firstName: pageFirst.join(' '), lastName: pageLast.join(' ') };
      }
    }
  }
  return { firstName: table[0] ?? '', lastName: table.slice(1).join(' ') };
}
