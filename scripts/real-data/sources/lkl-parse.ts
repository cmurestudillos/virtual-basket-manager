import { decodeEntities, rowCells, tableRows, textOf } from '../lib/html';
import { toNationCode } from '../lib/nationalities';
import { toHeightCm, toWeightKg } from '../lib/normalize';
import type { SourcePosition, SourceStats } from '../lib/source-types';
import { POWER_FORWARD_CM } from './lba-parse';

/**
 * Lectura de lkl.lt, la web oficial de la liga lituana (LKL): Laravel con
 * HTML de servidor, trozos que se cargan con jQuery y componentes de
 * Livewire. En lituano (los nombres, con sus diacríticos).
 *
 * - La clasificación (`/loadStandings/<temporada>`): el trozo de HTML que
 *   pide el selector de temporada, con el `slug` de cada club.
 * - El acta de cada partido, en JSON (`/api/livestream/boxscore/<id>`): la
 *   estadística de cada jugador con rebotes de ataque y defensa, faltas
 *   hechas y recibidas y tapones puestos y recibidos. Los titulares faltan en
 *   las primeras semanas de la temporada.
 * - La plantilla de un club en una temporada: el componente Livewire
 *   `team-squad` de la página del club, con puesto (sólo exterior, alero o
 *   pívot), altura, peso, fecha de nacimiento y nacionalidad (código COI).
 *   Sólo trae a los que acabaron la temporada en el club.
 * - La ficha del jugador (`/zaidejai/<slug>`): lo mismo, con la nacionalidad
 *   como bandera (ISO de dos letras) y el id numérico que pide su historial.
 * - El historial (`/zaidejai/get-player-history`): partidos jugados y de
 *   titular por temporada y club, sólo de la liga regular.
 */

/* ---------------------------------------------------------- puestos */

/**
 * El puesto de la web en PG/SG/SF/PF/C. La LKL sólo distingue exterior
 * («Gynėjas»), alero o ala-pívot («Puolėjas») y pívot («Centras»), así que se
 * separan por altura: el exterior de menos de `POINT_GUARD_BELOW_CM` es base
 * (el mismo corte que el montaje usa para quien no trae puesto) y el alero,
 * desde `POWER_FORWARD_CM`, ala-pívot, como el «Ala» de la LBA.
 */
export const POINT_GUARD_BELOW_CM = 191;

export function lklPosition(
  raw: string | null | undefined,
  heightCm: number | null | undefined
): SourcePosition | null {
  const key = (raw ?? '').trim().toLowerCase();
  if (key.startsWith('gyn')) return (heightCm ?? 999) < POINT_GUARD_BELOW_CM ? 'PG' : 'SG';
  if (key.startsWith('puol')) return (heightCm ?? 0) >= POWER_FORWARD_CM ? 'PF' : 'SF';
  if (key.startsWith('centr')) return 'C';
  return null;
}

/* ---------------------------------------------------- clasificación */

export interface LklStanding {
  rank: number;
  slug: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
}

/** La tabla general (la primera del trozo: detrás van la de casa, la de fuera y la final). */
export function parseLklStandings(html: string): LklStanding[] {
  const general = html.split(/<div class="tab-c-ins[^"]*" data-id="(?!full)/)[0] ?? html;
  const rows: LklStanding[] = [];
  for (const row of tableRows(general)) {
    const cells = rowCells(row);
    const slug = /\/komandos\/([a-z0-9-]+)/i.exec(cells[1]?.html ?? '')?.[1];
    if (!slug || rows.some((entry) => entry.slug === slug)) continue;
    const [rank, , games, wins, losses] = cells.map((cell) => Number(textOf(cell.html)));
    if (![rank, games, wins, losses].every((value) => Number.isInteger(value))) continue;
    rows.push({
      rank: rank as number,
      slug,
      name: textOf(cells[1]?.html ?? ''),
      games: games as number,
      wins: wins as number,
      losses: losses as number
    });
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

/* ------------------------------------------------------------- acta */

export interface LklBoxLine {
  /** El `slug` del jugador (`/zaidejai/<slug>`): su id en la web. */
  slug: string;
  teamId: string;
  /** Abreviado, «N. Apellido». */
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
  blocksReceived: number;
  fouls: number;
  foulsDrawn: number;
  rating: number;
}

export interface LklGame {
  gameId: string;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  lines: LklBoxLine[];
}

type Cell = { value?: unknown } | undefined;

function valueOf(cell: Cell): unknown {
  return cell && typeof cell === 'object' ? cell.value : undefined;
}

function numberOf(cell: Cell): number {
  const value = Number(valueOf(cell));
  return Number.isFinite(value) ? value : 0;
}

function pairOf(cell: Cell): [number, number] {
  const match = /(\d+)\s*\/\s*(\d+)/.exec(String(valueOf(cell) ?? ''));
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

function secondsOf(cell: Cell): number {
  const match = /(\d+):(\d+)/.exec(String(valueOf(cell) ?? ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

interface RawPlayer {
  name?: Cell;
  slug?: string;
  is_starter?: boolean;
  [key: string]: unknown;
}

/**
 * El acta en JSON. El lado de casa y el de fuera no llevan el id del club: se
 * sabe por los puntos, que están también en la estadística de cada equipo
 * (`gameStatistics`, por id). `null` si no se puede leer.
 */
export function parseLklBoxScore(json: string, gameId: string): LklGame | null {
  let data: {
    gameStatistics?: Record<string, { team_id?: number; points?: number }>;
    boxscore?: Record<'home' | 'away', { players?: RawPlayer[]; team?: Record<string, Cell> }>;
  };
  try {
    data = JSON.parse(json) as typeof data;
  } catch {
    return null;
  }
  const teams = Object.values(data.gameStatistics ?? {});
  const box = data.boxscore;
  if (teams.length !== 2 || !box?.home || !box.away) return null;
  const sideScore = (side: 'home' | 'away'): number =>
    numberOf(box[side].team?.points) ||
    (box[side].players ?? []).reduce((sum, player) => sum + numberOf(player.points as Cell), 0);
  const homeScore = sideScore('home');
  const awayScore = sideScore('away');
  const home = teams.find((team) => team.points === homeScore);
  const away = teams.find((team) => team !== home && team.points === awayScore);
  if (!home?.team_id || !away?.team_id || homeScore === awayScore) return null;

  const lines: LklBoxLine[] = [];
  for (const [side, teamId] of [
    ['home', String(home.team_id)],
    ['away', String(away.team_id)]
  ] as const) {
    for (const player of box[side].players ?? []) {
      if (!player.slug) continue;
      const cell = (key: string): Cell => player[key] as Cell;
      const [twoMade, twoAttempted] = pairOf(cell('fg2'));
      const [threeMade, threeAttempted] = pairOf(cell('fg3'));
      const [freeMade, freeAttempted] = pairOf(cell('ft'));
      lines.push({
        slug: player.slug,
        teamId,
        name: decodeEntities(String(valueOf(player.name) ?? '')).trim(),
        starter: player.is_starter === true,
        seconds: secondsOf(cell('time')),
        points: numberOf(cell('points')),
        twoPointMade: twoMade,
        twoPointAttempted: twoAttempted,
        threePointMade: threeMade,
        threePointAttempted: threeAttempted,
        freeThrowMade: freeMade,
        freeThrowAttempted: freeAttempted,
        offensiveRebounds: numberOf(cell('offensive_rebounds')),
        defensiveRebounds: numberOf(cell('defensive_rebounds')),
        assists: numberOf(cell('assists')),
        steals: numberOf(cell('steals')),
        turnovers: numberOf(cell('turnovers')),
        blocks: numberOf(cell('blocks')),
        blocksReceived: numberOf(cell('blocks_received')),
        fouls: numberOf(cell('fouls')),
        foulsDrawn: numberOf(cell('fouls_on')),
        rating: numberOf(cell('efficiency'))
      });
    }
  }
  return {
    gameId,
    homeId: String(home.team_id),
    awayId: String(away.team_id),
    homeScore,
    awayScore,
    lines
  };
}

export interface LklPlayerStats {
  slug: string;
  teamId: string;
  stats: SourceStats;
}

export function emptyStats(): SourceStats {
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

/** Una línea de acta con lo que suma a los totales de un jugador. */
export interface BoxNumbers {
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
  blocksReceived: number;
  fouls: number;
  foulsDrawn: number;
  rating: number;
}

/**
 * ¿Jugó? Con minutos o con algo en la estadística. Las actas listan también
 * a los que se quedaron en el banquillo, con «00:00».
 */
export function playedIn(line: BoxNumbers): boolean {
  return (
    line.seconds > 0 ||
    line.starter ||
    line.points + line.twoPointAttempted + line.threePointAttempted + line.freeThrowAttempted > 0 ||
    line.offensiveRebounds + line.defensiveRebounds + line.assists + line.steals > 0 ||
    line.turnovers + line.blocks + line.fouls + line.foulsDrawn > 0
  );
}

/** Suma una línea de acta a unos totales. */
export function addLine(stats: SourceStats, line: BoxNumbers): void {
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

/** Suma las actas por jugador y club; sólo los partidos que jugó. */
export function aggregateLklBoxScores(lines: readonly LklBoxLine[]): LklPlayerStats[] {
  const byKey = new Map<string, LklPlayerStats>();
  for (const line of lines) {
    if (!playedIn(line)) continue;
    const key = `${line.slug}|${line.teamId}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { slug: line.slug, teamId: line.teamId, stats: emptyStats() };
      byKey.set(key, entry);
    }
    addLine(entry.stats, line);
  }
  return [...byKey.values()];
}

/* ------------------------------------------------------- plantilla */

export interface LklSquadPlayer {
  slug: string;
  fullName: string;
  shirtNumber: number | null;
  positionRaw: string | null;
  heightCm: number | null;
  weightKg: number | null;
  birthDate: string | null;
  /** Código COI tal cual («LTU», «USA»); `null` si no lo da. */
  nationalityRaw: string | null;
}

/** La tabla de jugadores del componente `team-squad`. */
export function parseLklSquad(html: string): LklSquadPlayer[] {
  const players: LklSquadPlayer[] = [];
  for (const row of tableRows(html)) {
    const slug = /\/zaidejai\/([a-z0-9-]+)/i.exec(row)?.[1];
    const cells = rowCells(row).map((cell) => textOf(cell.html));
    if (!slug || cells.length < 7 || players.some((entry) => entry.slug === slug)) continue;
    const [
      number = '',
      name = '',
      position = '',
      height = '',
      weight = '',
      birth = '',
      nation = ''
    ] = cells;
    players.push({
      slug,
      fullName: name,
      shirtNumber: /^\d+$/.test(number) ? Number(number) : null,
      positionRaw: position || null,
      heightCm: toHeightCm(height),
      weightKg: toWeightKg(weight),
      birthDate: /^\d{4}-\d{2}-\d{2}$/.test(birth) ? birth : null,
      nationalityRaw: nation || null
    });
  }
  return players;
}

/** El componente Livewire que se carga al verlo, con lo que hace falta para pedirlo. */
export interface LivewireLazy {
  csrf: string;
  snapshot: string;
  lazyParam: string;
}

/** Un componente Livewire perezoso de la página (`team-squad`) y el token CSRF. */
export function findLivewireLazy(html: string, component: string): LivewireLazy | null {
  const csrf = /data-csrf="([^"]+)"/.exec(html)?.[1];
  if (!csrf) return null;
  const pattern =
    /wire:snapshot="([^"]+)"[^>]*?x-intersect="\$wire\.__lazyLoad\(&#039;([^&]+)&#039;\)"/g;
  for (const match of html.matchAll(pattern)) {
    const snapshot = decodeEntities(match[1] ?? '');
    try {
      const parsed = JSON.parse(snapshot) as { memo?: { name?: string } };
      if (parsed.memo?.name === component) return { csrf, snapshot, lazyParam: match[2] ?? '' };
    } catch {
      // Otro atributo con comillas raras: no es el componente.
    }
  }
  return null;
}

/** La respuesta de `/livewire/update`: el HTML y el estado nuevo del componente. */
export function parseLivewireUpdate(json: string): { html: string; snapshot: string } | null {
  try {
    const data = JSON.parse(json) as {
      components?: { snapshot?: string; effects?: { html?: string } }[];
    };
    const component = data.components?.[0];
    if (!component?.snapshot) return null;
    return { html: component.effects?.html ?? '', snapshot: component.snapshot };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ ficha */

export interface LklPlayerPage {
  /** El id numérico que pide el historial. */
  playerId: string | null;
  firstName: string;
  lastName: string;
  positionRaw: string | null;
  birthDate: string | null;
  /** Códigos ISO de dos letras de las banderas, en minúscula. */
  flags: string[];
  heightCm: number | null;
  weightKg: number | null;
}

/** El valor de un recuadro de la ficha («Amžius», «Svoris»…). */
function box(html: string, label: string): string | null {
  const match = new RegExp(
    `>\\s*${label}\\s*</div>\\s*<div class="font-semibold">([\\s\\S]*?)</div>`,
    'i'
  ).exec(html);
  return match ? (match[1] ?? '') : null;
}

export function parseLklPlayerPage(html: string): LklPlayerPage | null {
  const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  if (!heading) return null;
  const [first = '', ...rest] = heading.split(/<br\s*\/?>/i).map((part) => textOf(part));
  const position = /<div class="md:text-xl[^"]*">([\s\S]*?)<\/div>\s*<h1/i.exec(html)?.[1];
  const nationality = box(html, 'Pilietybė') ?? '';
  return {
    playerId: /data-player-id="(\d+)"/.exec(html)?.[1] ?? null,
    firstName: first,
    lastName: rest.join(' ').trim(),
    positionRaw: position ? textOf(position) || null : null,
    birthDate: /(\d{4}-\d{2}-\d{2})/.exec(textOf(box(html, 'Amžius') ?? ''))?.[1] ?? null,
    flags: [...nationality.matchAll(/flag-icon-([a-z]{2})\b/g)].map((match) => match[1] ?? ''),
    heightCm: toHeightCm(textOf(box(html, 'Ūgis') ?? '')),
    weightKg: toWeightKg(textOf(box(html, 'Svoris') ?? ''))
  };
}

/** La nacionalidad de las banderas o del código COI de la plantilla. */
export function lklNationality(codes: readonly (string | null | undefined)[]): string | null {
  for (const code of codes) {
    const nation = toNationCode(code);
    if (nation) return nation;
  }
  return null;
}

/* -------------------------------------------------------- historial */

export interface LklHistoryRow {
  team: string;
  /** «2025-2026». */
  season: string;
  games: number;
  starts: number;
}

/** El historial de liga regular: una fila por temporada y club. */
export function parseLklHistory(html: string): LklHistoryRow[] {
  const rows: LklHistoryRow[] = [];
  for (const row of tableRows(html)) {
    const cells = rowCells(row);
    const team = /<strong>([\s\S]*?)<\/strong>/i.exec(cells[0]?.html ?? '')?.[1];
    const season = /(\d{4}-\d{4})/.exec(textOf(cells[0]?.html ?? ''))?.[1];
    const games = Number(textOf(cells[1]?.html ?? ''));
    const starts = Number(textOf(cells[2]?.html ?? ''));
    if (!team || !season || !Number.isInteger(games) || !Number.isInteger(starts)) continue;
    rows.push({ team: textOf(team), season, games, starts });
  }
  return rows;
}
