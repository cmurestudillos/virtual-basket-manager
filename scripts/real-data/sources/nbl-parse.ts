import { toNationCode } from '../lib/nationalities';
import type { SourcePosition, SourceStats } from '../lib/source-types';
import { positionFromStats } from './adc-parse';
import { addLine, emptyStats, playedIn, type BoxNumbers } from './lkl-parse';

/**
 * Lectura de la NBL australiana, que desde la 2025-26 lleva los datos con
 * Synergy (Sportradar) y los sirve en su web a través de su propia API JSON,
 * «Rosetta» (`prod.rosetta.nbl.com.au/get/…`):
 *
 * - `nbl/matches/in/season/<año>/regular`: los partidos de la temporada
 *   (fase regular, play-in y playoffs, y la final de la Ignite Cup).
 * - `nbl/players/for/team/<id>/in/season/<año>`: la plantilla con la ficha
 *   (fecha, altura, peso, nacionalidad y un puesto G/F/C).
 * - `match/<id>/live/all`: el acta, con titulares y el jugada a jugada, de
 *   donde salen las faltas recibidas, los mates y los tapones recibidos.
 * - `nbl/stats/leaders/for/season/id/<id>`: los totales oficiales por jugador
 *   y club (con los playoffs), para corregir las actas que se quedan cortas.
 *
 * Cada equipo y cada jugador tienen dos ids: el de Rosetta (`id`) y el de
 * Synergy (`external_id`). Las actas usan el de Synergy como `id`; aquí se
 * trabaja siempre con el de Synergy.
 */

/* ------------------------------------------------------------ comunes */

interface RosettaEnvelope {
  count?: number;
  data?: unknown[];
}

/** El `data` de una respuesta de Rosetta; `null` si no es una. */
export function rosettaData(json: string): unknown[] | null {
  try {
    const parsed = JSON.parse(json) as RosettaEnvelope;
    return Array.isArray(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value && typeof value === 'object' ? (value as Json) : {};
}

function str(value: unknown): string | null {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** «34:14» (o «1:02:03») → segundos; lo que no se entienda, 0. */
export function nblSeconds(raw: unknown): number {
  const text = str(raw);
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/* ------------------------------------------------------------ partidos */

export interface NblMatch {
  /** Id de Rosetta: el que piden las rutas. */
  id: string;
  date: string;
  round: string | null;
  /** `regular`, `final` (play-in y playoffs) o `null` (la final de la Ignite Cup). */
  type: string | null;
  /** Ids de Synergy de los equipos. */
  homeId: string;
  awayId: string;
  homeCode: string | null;
  awayCode: string | null;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
}

function teamIdOf(team: Json): string {
  return str(team.external_id) ?? str(team.id) ?? '';
}

export function parseNblMatches(json: string): NblMatch[] {
  return (rosettaData(json) ?? []).map((raw) => {
    const match = obj(raw);
    const home = obj(match.home_team);
    const away = obj(match.away_team);
    const score = (value: unknown): number | null => (str(value) === null ? null : num(value));
    return {
      id: str(match.id) ?? '',
      date: (str(match.start_time) ?? '').slice(0, 10),
      round: str(match.round),
      type: str(match.match_type),
      homeId: teamIdOf(home),
      awayId: teamIdOf(away),
      homeCode: str(home.team_code),
      awayCode: str(away.team_code),
      homeScore: score(match.home_score),
      awayScore: score(match.away_score),
      venue: str(obj(match.venue).name)
    };
  });
}

/* ------------------------------------------------------------ fichas */

export interface NblPerson {
  /** Id de Synergy. */
  personId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  nationalityRaw: string | null;
  positionRaw: string | null;
  shirtNumber: number | null;
}

function shirtOf(value: unknown): number | null {
  const text = str(value);
  return text !== null && /^\d{1,2}$/.test(text) ? Number(text) : null;
}

function personOf(player: Json, row: Json = {}): NblPerson {
  const height = num(player.height);
  const weight = num(player.weight);
  const birth = str(player.date_of_birth);
  return {
    personId: str(player.external_id) ?? str(player.id) ?? '',
    firstName: str(player.first_name) ?? '',
    lastName: str(player.last_name) ?? '',
    birthDate: birth && /^\d{4}-\d{2}-\d{2}/.test(birth) ? birth.slice(0, 10) : null,
    heightCm: height >= 150 && height <= 240 ? Math.round(height) : null,
    weightKg: weight >= 50 && weight <= 180 ? Math.round(weight) : null,
    nationalityRaw: str(player.nationality_code) ?? str(player.nationality),
    positionRaw:
      str(row.playing_position) ??
      str(player.playing_position) ??
      str(player.latest_playing_position),
    shirtNumber: shirtOf(row.jersey_number) ?? shirtOf(player.jersey_number)
  };
}

/**
 * La plantilla de un equipo. Hay equipos que salen con cada jugador dos
 * veces (por la final de la Ignite Cup): uno por id de Synergy.
 */
export function parseNblRoster(json: string): NblPerson[] {
  const byId = new Map<string, NblPerson>();
  for (const raw of rosettaData(json) ?? []) {
    const row = obj(raw);
    const person = personOf(obj(row.player), row);
    if (person.personId && !byId.has(person.personId)) byId.set(person.personId, person);
  }
  return [...byId.values()];
}

/** La ficha suelta de un jugador (`nbl/player/<id de Synergy>`). */
export function parseNblPerson(json: string): NblPerson | null {
  const first = (rosettaData(json) ?? [])[0];
  if (!first) return null;
  const person = personOf(obj(first));
  return person.personId ? person : null;
}

/* --------------------------------------------------------------- actas */

/**
 * Lo que se guarda de cada acta: la de la API pesa más de 1 MB (vídeos,
 * cuotas, el jugada a jugada entero con fotos) y de ella sólo hacen falta las
 * líneas del partido entero y unas pocas acciones del jugada a jugada.
 */
export interface NblSlimMatch {
  id: string;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  lines: Json[];
  /** Faltas recibidas, tapones y tiros: `[acción, subtipo, persona, equipo, acierto, periodo, reloj, orden]`. */
  actions: (string | number | boolean | null)[][];
}

const KEPT_ACTIONS = new Set(['foul', 'block', '2pt', '3pt']);

/** El acta de `match/<id>/live/all`, reducida a lo que hace falta; `null` si no trae líneas. */
export function slimNblMatch(json: string): NblSlimMatch | null {
  const match = obj((rosettaData(json) ?? [])[0]);
  const all = Array.isArray(match.player_match_statistics) ? match.player_match_statistics : [];
  const lines = all.map(obj).filter((line) => str(line.period) === '0');
  if (lines.length === 0) return null;
  const pbp = Array.isArray(match.play_by_play) ? match.play_by_play.map(obj) : [];
  const actions = pbp
    .filter((action) => KEPT_ACTIONS.has(str(action.action_type) ?? ''))
    .filter((action) => str(action.action_type) !== 'foul' || str(action.sub_type) === 'Drawn')
    .map((action) => [
      str(action.action_type),
      str(action.sub_type),
      str(action.personId),
      teamIdOf(obj(action.team)) || null,
      action.success === true,
      num(action.period),
      str(action.clock),
      num(action.action_id)
    ]);
  return {
    id: str(match.id) ?? '',
    homeId: teamIdOf(obj(match.home_team)),
    awayId: teamIdOf(obj(match.away_team)),
    homeScore: num(match.home_score),
    awayScore: num(match.away_score),
    lines: lines.map((line) => ({
      player: {
        id: str(obj(line.player).id),
        first_name: str(obj(line.player).first_name),
        last_name: str(obj(line.player).last_name)
      },
      team: { id: teamIdOf(obj(line.team)), team_code: str(obj(line.team).team_code) },
      jersey_number: line.jersey_number,
      starter: line.starter,
      participated: line.participated,
      minutes: line.minutes,
      points: line.points,
      two_points_made: line.two_points_made,
      two_points_attempted: line.two_points_attempted,
      three_points_made: line.three_points_made,
      three_points_attempted: line.three_points_attempted,
      free_throws_made: line.free_throws_made,
      free_throws_attempted: line.free_throws_attempted,
      offensive_rebounds: line.offensive_rebounds,
      defensive_rebounds: line.defensive_rebounds,
      assists: line.assists,
      steals: line.steals,
      blocks: line.blocks,
      turnovers: line.turnovers,
      personal_fouls: line.personal_fouls,
      technical_fouls: line.technical_fouls,
      efficiency: line.efficiency
    })),
    actions
  };
}

/** Lo que el jugada a jugada añade a cada jugador en un partido. */
export interface PlayByPlayExtras {
  foulsDrawn: number;
  dunks: number;
  blocksReceived: number;
}

/**
 * Faltas recibidas (`foul` / `Drawn`), mates (tiro de 2 anotado cuyo subtipo
 * es un mate) y tapones recibidos: cada `block` se casa con el tiro fallado
 * del rival en el mismo periodo y reloj, el más cercano en orden (la API los
 * apunta seguidos, uno antes o después del otro).
 */
export function playByPlayExtras(actions: NblSlimMatch['actions']): Map<string, PlayByPlayExtras> {
  const out = new Map<string, PlayByPlayExtras>();
  const of = (personId: string): PlayByPlayExtras => {
    let entry = out.get(personId);
    if (!entry) {
      entry = { foulsDrawn: 0, dunks: 0, blocksReceived: 0 };
      out.set(personId, entry);
    }
    return entry;
  };
  const rows = actions.map(([type, subType, personId, teamId, success, period, clock, order]) => ({
    type: type as string | null,
    subType: (subType as string | null) ?? '',
    personId: personId as string | null,
    teamId: teamId as string | null,
    success: success === true,
    period: Number(period),
    clock: clock as string | null,
    order: Number(order)
  }));
  const usedShots = new Set<number>();
  for (const row of rows) {
    if (!row.personId) continue;
    if (row.type === 'foul' && row.subType === 'Drawn') of(row.personId).foulsDrawn++;
    if (row.type === '2pt' && row.success && /dunk/i.test(row.subType)) of(row.personId).dunks++;
  }
  for (const block of rows.filter((row) => row.type === 'block')) {
    let best: (typeof rows)[number] | null = null;
    for (const [index, shot] of rows.entries()) {
      if (shot.type !== '2pt' && shot.type !== '3pt') continue;
      if (shot.success || !shot.personId || usedShots.has(index)) continue;
      if (shot.period !== block.period || shot.clock !== block.clock) continue;
      if (block.teamId && shot.teamId && block.teamId === shot.teamId) continue;
      if (Math.abs(shot.order - block.order) > 3) continue;
      if (!best || Math.abs(shot.order - block.order) < Math.abs(best.order - block.order)) {
        best = shot;
      }
    }
    if (best) {
      usedShots.add(rows.indexOf(best));
      of(best.personId!).blocksReceived++;
    }
  }
  return out;
}

export interface NblBoxLine extends BoxNumbers {
  personId: string;
  /** Id de Synergy del equipo. */
  teamId: string;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  dunks: number;
  participated: boolean;
}

export interface NblBoxSide {
  teamId: string;
  score: number;
  lines: NblBoxLine[];
}

export interface NblBoxScore {
  matchId: string;
  /** El local primero. */
  sides: [NblBoxSide, NblBoxSide];
  /** ¿Trae jugada a jugada? Sin él, faltas recibidas, mates y tapones recibidos a cero. */
  hasPlayByPlay: boolean;
}

/** El acta ya reducida ({@link slimNblMatch}). */
export function parseNblBoxScore(slim: NblSlimMatch): NblBoxScore {
  const extras = playByPlayExtras(slim.actions);
  const hasPlayByPlay = slim.actions.length > 0;
  const side = (teamId: string, score: number): NblBoxSide => ({
    teamId,
    score,
    lines: slim.lines
      .filter((line) => teamIdOf(obj(line.team)) === teamId)
      .map((line) => {
        const player = obj(line.player);
        const personId = str(player.id) ?? '';
        const extra = extras.get(personId);
        return {
          personId,
          teamId,
          firstName: str(player.first_name) ?? '',
          lastName: str(player.last_name) ?? '',
          shirtNumber: shirtOf(line.jersey_number),
          participated: line.participated === true,
          starter: line.starter === true,
          seconds: nblSeconds(line.minutes),
          points: num(line.points),
          twoPointMade: num(line.two_points_made),
          twoPointAttempted: num(line.two_points_attempted),
          threePointMade: num(line.three_points_made),
          threePointAttempted: num(line.three_points_attempted),
          freeThrowMade: num(line.free_throws_made),
          freeThrowAttempted: num(line.free_throws_attempted),
          offensiveRebounds: num(line.offensive_rebounds),
          defensiveRebounds: num(line.defensive_rebounds),
          assists: num(line.assists),
          steals: num(line.steals),
          turnovers: num(line.turnovers),
          blocks: num(line.blocks),
          blocksReceived: extra?.blocksReceived ?? 0,
          dunks: extra?.dunks ?? 0,
          fouls: num(line.personal_fouls) + num(line.technical_fouls),
          foulsDrawn: extra?.foulsDrawn ?? 0,
          rating: num(line.efficiency)
        };
      })
  });
  return {
    matchId: slim.id,
    sides: [side(slim.homeId, slim.homeScore), side(slim.awayId, slim.awayScore)],
    hasPlayByPlay
  };
}

export interface NblPlayerStats {
  personId: string;
  teamId: string;
  /** La última línea de acta: nombre y dorsal. */
  line: NblBoxLine;
  stats: SourceStats;
}

/** Suma las actas por jugador y club; sólo los partidos que jugó. */
export function aggregateNblBoxScores(lines: readonly NblBoxLine[]): NblPlayerStats[] {
  const byKey = new Map<string, NblPlayerStats>();
  for (const line of lines) {
    if (!line.participated && !playedIn(line)) continue;
    const key = `${line.personId}|${line.teamId}`;
    const entry = byKey.get(key) ?? {
      personId: line.personId,
      teamId: line.teamId,
      line,
      stats: { ...emptyStats(), dunks: 0 }
    };
    addLine(entry.stats, line);
    entry.stats.dunks = (entry.stats.dunks ?? 0) + line.dunks;
    entry.line = line;
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}

/* ------------------------------------------ totales oficiales (leaders) */

/** Los totales oficiales de un jugador en un club (fase regular y playoffs juntos). */
export interface NblTotals {
  personId: string;
  teamId: string;
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
}

/** Los campos que se corrigen con los totales oficiales. */
export const TOTAL_FIELDS = [
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

export function parseNblLeaders(json: string): NblTotals[] {
  return (rosettaData(json) ?? []).map((raw) => {
    const row = obj(raw);
    const offensive = num(row.offensive_rebounds);
    return {
      personId: str(obj(row.player).external_id) ?? '',
      teamId: str(obj(row.team).external_id) ?? '',
      points: num(row.points),
      twoPointMade: num(row.two_points_made),
      twoPointAttempted: num(row.two_points_attempted),
      threePointMade: num(row.three_points_made),
      threePointAttempted: num(row.three_points_attempted),
      freeThrowMade: num(row.free_throws_made),
      freeThrowAttempted: num(row.free_throws_attempted),
      offensiveRebounds: offensive,
      defensiveRebounds: num(row.rebounds) - offensive,
      assists: num(row.assists),
      steals: num(row.steals),
      turnovers: num(row.turnovers),
      blocks: num(row.blocks),
      // Como en las actas: personales y técnicas.
      fouls: num(row.personal_fouls) + num(row.technical_fouls)
    };
  });
}

/**
 * Lo que les falta a unas estadísticas para cuadrar con los totales
 * oficiales: `official` menos lo sumado en las actas de los mismos partidos
 * (`summed`), campo a campo. Se suma a la fase regular sin dejar nada en
 * negativo; devuelve los campos que cambian.
 */
export function correctWithTotals(
  stats: SourceStats,
  official: NblTotals,
  summed: Pick<NblTotals, (typeof TOTAL_FIELDS)[number]>
): Partial<Record<(typeof TOTAL_FIELDS)[number], number>> {
  const changed: Partial<Record<(typeof TOTAL_FIELDS)[number], number>> = {};
  for (const field of TOTAL_FIELDS) {
    const delta = official[field] - summed[field];
    if (delta === 0) continue;
    const next = Math.max(0, stats[field] + delta);
    if (next === stats[field]) continue;
    changed[field] = next - stats[field];
    stats[field] = next;
  }
  return changed;
}

/* ---------------------------------------------------- puestos y nombres */

/** Desde esta altura, pívot (salvo que la fuente diga otra cosa por debajo de 2,03). */
export const NBL_CENTER_MIN_CM = 208;
/** Desde esta altura, ala-pívot. */
export const NBL_POWER_FORWARD_MIN_CM = 203;
/** Un «G» desde esta altura juega de alero. */
export const NBL_GUARD_MAX_CM = 197;
/** Un «F» de menos de esto no es ala-pívot aunque reboteé. */
export const NBL_SMALL_FORWARD_MAX_CM = 197;
/** Un «G» de esta altura o menos es base aunque no dé asistencias. */
export const NBL_POINT_GUARD_MAX_CM = 185;
/** Asistencias por 36 minutos desde las que un «G» es base. */
export const NBL_POINT_GUARD_ASSISTS = 4;

/**
 * El puesto: la NBL sólo da `G`, `F`, `C` o `FC`, y reparte mal (seis de cada
 * diez minutos son de «G»). Manda la altura, y dentro de cada franja el
 * juego:
 *
 * 1. `C`/`FC` de la fuente: pívot, o ala-pívot si mide menos de 2,03.
 * 2. Desde 2,08, pívot; desde 2,03, ala-pívot.
 * 3. `F`: ala-pívot si coge 6,5 rebotes por 36 minutos y mide 1,98 o más;
 *    si no, alero.
 * 4. `G` de 1,98 o más: alero.
 * 5. El resto de `G`: base con 4 asistencias por 36 minutos o 1,85 o menos;
 *    si no, escolta.
 *
 * Sin altura ni puesto, `positionFromStats`.
 */
export function nblPosition(
  raw: string | null | undefined,
  heightCm: number | null,
  stats: SourceStats | null
): SourcePosition | null {
  const code = (raw ?? '').trim().toUpperCase();
  const height = heightCm ?? 0;
  if (code === 'C' || code === 'FC') {
    return heightCm !== null && heightCm < NBL_POWER_FORWARD_MIN_CM ? 'PF' : 'C';
  }
  if (height >= NBL_CENTER_MIN_CM) return 'C';
  if (height >= NBL_POWER_FORWARD_MIN_CM) return 'PF';
  const minutes = stats ? stats.seconds / 60 : 0;
  const per36 = (value: number): number => (minutes > 0 ? (value * 36) / minutes : 0);
  if (code === 'F') {
    if (!stats || minutes < 60) return 'SF';
    const rebounds = per36(stats.offensiveRebounds + stats.defensiveRebounds);
    return rebounds >= 6.5 && (heightCm === null || heightCm > NBL_SMALL_FORWARD_MAX_CM)
      ? 'PF'
      : 'SF';
  }
  if (code === 'G') {
    if (height > NBL_GUARD_MAX_CM) return 'SF';
    const small = heightCm !== null && heightCm <= NBL_POINT_GUARD_MAX_CM;
    if (!stats || minutes < 60) return small ? 'PG' : 'SG';
    return small || per36(stats.assists) >= NBL_POINT_GUARD_ASSISTS ? 'PG' : 'SG';
  }
  if (heightCm !== null) return null;
  return positionFromStats(stats);
}

const SUFFIXES: Record<string, string> = {
  jnr: 'Jr.',
  'jnr.': 'Jr.',
  jr: 'Jr.',
  'jr.': 'Jr.',
  snr: 'Sr.',
  ii: 'II',
  iii: 'III',
  iv: 'IV'
};

/** El nombre como lo da la API, con los sufijos siempre igual («Jnr» → «Jr.»). */
export function nblName(
  firstName: string,
  lastName: string
): { firstName: string; lastName: string } {
  const words = lastName.trim().split(/\s+/).filter(Boolean);
  const last = words
    .map((word, index) => (index > 0 ? (SUFFIXES[word.toLowerCase()] ?? word) : word))
    .join(' ');
  return { firstName: firstName.trim().split(/\s+/).join(' '), lastName: last };
}

/** La nacionalidad de la ficha: códigos FIBA o ISO mezclados (`AUS`, `NLD`, `TRI`). */
export function nblNationality(raw: string | null | undefined): string | null {
  return toNationCode(raw);
}
