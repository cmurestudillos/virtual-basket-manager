import type {
  Dataset,
  DatasetCoach,
  DatasetPlayer,
  DatasetTeam
} from '../../../src/main/features/saves/dataset';
import { POSITIONS, type Position } from '../../../src/shared/domain/positions';
import { MAX_ROSTER } from '../../../src/shared/domain/youth';
import { WORLD, type LeagueTier } from '../../seed-data/leagues.mts';
import {
  ageFrom,
  jitter,
  quantileOf,
  rateLeague,
  referenceFrom,
  type LeagueReference,
  type RatedPlayer
} from './ratings';
import type {
  SourceCoach,
  SourceGuest,
  SourceLeague,
  SourcePlayer,
  SourcePromotion,
  SourceTeam
} from './source-types';

/**
 * Monta el dataset de la edición privada: el mundo ficticio con las ligas que
 * ya tienen datos reales sustituidas por las de verdad.
 *
 * Se sustituye liga a liga y no país a país a propósito: así un país puede
 * tener ya su primera división real y la segunda todavía inventada. Las ligas
 * reales conservan el identificador de la ficticia a la que sustituyen
 * (`liga-nacional`, `liga-plata`), de modo que el calendario, los ascensos, la
 * copa y las plazas europeas siguen funcionando sin tocar el juego.
 *
 * Las ligas invitadas (`SourceLeague.guest`) no sustituyen a ninguna: de ellas
 * sólo entran unos equipos, detrás de los de una liga real y con la escala de
 * su propia categoría, para completar una liga real que tiene menos equipos
 * que la del juego. Los ascendidos de una liga real (`SourceLeague.promoted`)
 * entran igual en la de encima, pero valorados con su propia liga entera.
 *
 * Lo que la fuente no da se rellena aquí, siempre igual para el mismo jugador
 * (nada de azar: regenerar el dataset no puede cambiarle la ficha a nadie):
 * peso, envergadura, potencial, sueldo, contrato y valor.
 */

/** Nombres reales de las copas de los países con liga real. */
const REAL_CUPS: Record<string, { name: string; shortName: string }> = {
  ESP: { name: 'Copa del Rey', shortName: 'Copa' },
  ITA: { name: 'Coppa Italia', shortName: 'Coppa' },
  FRA: { name: 'Coupe de France', shortName: 'Coupe' },
  GRE: { name: 'Kýpello Elládos', shortName: 'Kýpello' }
};

/** Altura típica por puesto: para quien no la trae y para deducir el puesto. */
const HEIGHT_BY_POSITION: Record<Position, number> = {
  PG: 186,
  SG: 194,
  SF: 200,
  PF: 205,
  C: 211
};

export interface MergeReport {
  competitionId: string;
  name: string;
  teams: number;
  players: number;
  estimated: number;
  droppedDuplicates: number;
  droppedOverRoster: number;
  unknownNationalities: string[];
  /** Equipos sin entrenador real: se les inventa uno al crear la partida. */
  withoutCoach: string[];
  /** En una liga invitada, la liga del juego en la que entran sus equipos. */
  guestOf?: string;
}

export interface MergeResult {
  dataset: Dataset & { realLeagues: string[] };
  reports: MergeReport[];
  rated: Map<string, RatedPlayer[]>;
}

/** El puesto de la fuente o, si no lo da, el que le toca por altura. */
export function positionFor(player: SourcePlayer): Position {
  if (player.position) return player.position;
  const height = player.heightCm;
  if (!height) return 'SF';
  if (height < 191) return 'PG';
  if (height < 198) return 'SG';
  if (height < 203) return 'SF';
  if (height < 208) return 'PF';
  return 'C';
}

/** «Valencia Basket» → «valencia-basket»: identificador legible y estable. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function tierOf(competitionId: string): LeagueTier | null {
  for (const country of WORLD) {
    const tier = country.tiers.find((entry) => entry.id === competitionId);
    if (tier) return tier;
  }
  return null;
}

/**
 * Cada jugador en un solo equipo y como mucho `MAX_ROSTER` por equipo.
 *
 * Las plantillas de una temporada terminada traen a todo el que pasó por el
 * club, incluidos los que se fueron a mitad de año —a veces a otro equipo de
 * la misma liga—. Se queda donde más minutos jugó, y de cada plantilla sobran
 * los que menos jugaron.
 */
export function selectRosters(league: SourceLeague): {
  rosters: Map<SourceTeam, SourcePlayer[]>;
  droppedDuplicates: number;
  droppedOverRoster: number;
} {
  const seconds = (player: SourcePlayer): number => player.stats?.seconds ?? 0;
  const home = new Map<string, { team: SourceTeam; player: SourcePlayer }>();
  let droppedDuplicates = 0;

  for (const team of league.teams) {
    const seen = new Set<string>();
    for (const player of team.players) {
      if (seen.has(player.sourceId)) {
        droppedDuplicates += 1;
        continue;
      }
      seen.add(player.sourceId);
      const current = home.get(player.sourceId);
      if (!current) {
        home.set(player.sourceId, { team, player });
      } else {
        droppedDuplicates += 1;
        if (seconds(player) > seconds(current.player)) {
          home.set(player.sourceId, { team, player });
        }
      }
    }
  }

  const rosters = new Map<SourceTeam, SourcePlayer[]>(league.teams.map((team) => [team, []]));
  for (const { team, player } of home.values()) {
    (rosters.get(team) as SourcePlayer[]).push(player);
  }

  let droppedOverRoster = 0;
  for (const [team, players] of rosters) {
    players.sort((a, b) => seconds(b) - seconds(a) || a.sourceId.localeCompare(b.sourceId));
    if (players.length > MAX_ROSTER) {
      droppedOverRoster += players.length - MAX_ROSTER;
      rosters.set(team, players.slice(0, MAX_ROSTER));
    }
  }
  return { rosters, droppedDuplicates, droppedOverRoster };
}

/** Reputación por puesto final, en el rango de reputación de la liga ficticia. */
export function reputationFor(
  finalPosition: number | null,
  index: number,
  teams: number,
  tier: LeagueTier | null
): number {
  const [best, worst] = tier?.reputation ?? [60, 30];
  const rank = (finalPosition ?? index + 1) - 1;
  const step = teams > 1 ? (best - worst) / (teams - 1) : 0;
  return Math.max(1, Math.round(best - Math.min(rank, teams - 1) * step));
}

/** El nivel de un equipo en su liga por su puesto final: 1 el primero, 0 el último. */
export function teamStrength(finalPosition: number | null, teams: number): number | null {
  if (finalPosition === null || teams < 2) return null;
  return Math.min(1, Math.max(0, 1 - (finalPosition - 1) / (teams - 1)));
}

function neighbour(position: Position, seed: string): Position | null {
  const roll = jitter(seed);
  if (Math.abs(roll) > 0.45) return null;
  const index = POSITIONS.indexOf(position);
  const next = roll < 0 ? index - 1 : index + 1;
  return POSITIONS[Math.min(POSITIONS.length - 1, Math.max(0, next))] as Position;
}

function birthDateFor(player: SourcePlayer, seasonStartYear: number): string {
  if (player.birthDate) return player.birthDate;
  const age = player.age ?? 26;
  return `${seasonStartYear - age}-07-01`;
}

/**
 * La fecha de nacimiento de un entrenador: la real o, si la fuente sólo da la
 * edad, el 1 de julio del año que le cuadra con esa edad el día de la
 * extracción, que es cuando la cuenta la fuente. Siempre la misma para el
 * mismo fichero de la fuente.
 */
export function coachBirthDate(coach: SourceCoach, extractedAt: string): string | null {
  if (coach.birthDate) return coach.birthDate;
  if (coach.age === null) return null;
  const extracted = new Date(extractedAt);
  if (Number.isNaN(extracted.getTime())) return null;
  // Antes del 1 de julio, quien tiene esa edad la cumplió como tarde el año anterior.
  const beforeJuly = extracted.getUTCMonth() < 6;
  return `${extracted.getUTCFullYear() - coach.age - (beforeJuly ? 1 : 0)}-07-01`;
}

/**
 * El entrenador real de un equipo para el dataset; `null` si la fuente no lo
 * da o le falta el nombre o la edad. Una nacionalidad que el juego no conoce
 * se cambia por la del país, como a los jugadores.
 */
export function datasetCoachFor(
  coach: SourceCoach | null | undefined,
  league: Pick<SourceLeague, 'country' | 'extractedAt'>,
  knownNationalities: ReadonlySet<string>
): DatasetCoach | null {
  if (!coach || coach.lastName.trim() === '') return null;
  const birthDate = coachBirthDate(coach, league.extractedAt);
  if (!birthDate) return null;
  return {
    firstName: coach.firstName,
    lastName: coach.lastName,
    nationality:
      coach.nationality && knownNationalities.has(coach.nationality)
        ? coach.nationality
        : league.country,
    birthDate
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

/** Los jugadores de una liga ficticia. */
function fictitiousPlayersOf(fictitious: Dataset, competitionId: string): DatasetPlayer[] {
  const teamIds = new Set(
    fictitious.teams.filter((team) => team.competitionId === competitionId).map((team) => team.id)
  );
  return fictitious.players.filter((player) => teamIds.has(player.teamId));
}

/** La categoría de encima de una liga ficticia en su país; `null` si es la primera. */
function tierAbove(competitionId: string): LeagueTier | null {
  for (const country of WORLD) {
    const index = country.tiers.findIndex((entry) => entry.id === competitionId);
    if (index > 0) return country.tiers[index - 1] ?? null;
  }
  return null;
}

/**
 * La escala con la que se traducen a atributos los percentiles de una liga
 * invitada: la de la liga ficticia que se diga y, con `stepsDown`, bajada otro
 * tanto por cada paso extrapolando la distancia a la categoría de encima,
 * percentil a percentil. Así una tercera división, que no tiene liga ficticia
 * equivalente, queda por debajo de la segunda como ésta de la primera.
 */
export function scaleReference(fictitious: Dataset, scale: SourceGuest['scale']): LeagueReference {
  const base = referenceFrom(fictitiousPlayersOf(fictitious, scale.league));
  const steps = scale.stepsDown ?? 0;
  const upperTier = steps > 0 ? tierAbove(scale.league) : null;
  if (!upperTier) return base;
  const upper = referenceFrom(fictitiousPlayersOf(fictitious, upperTier.id));
  const attributes = {} as LeagueReference['attributes'];
  for (const key of Object.keys(base.attributes) as (keyof LeagueReference['attributes'])[]) {
    const values = base.attributes[key];
    attributes[key] = values
      .map((value, index) => {
        const above = quantileOf(upper.attributes[key], index / Math.max(1, values.length - 1));
        return value - steps * (above - value);
      })
      .sort((a, b) => a - b);
  }
  return { attributes };
}

/** Nombre y fecha de nacimiento: para no meter dos veces a la misma persona. */
function personKey(player: Pick<SourcePlayer, 'firstName' | 'lastName' | 'birthDate'>): string {
  return `${slugify(`${player.firstName} ${player.lastName}`)}|${player.birthDate ?? ''}`;
}

export function mergeRealLeagues(
  fictitious: Dataset,
  sources: readonly SourceLeague[],
  knownNationalities: ReadonlySet<string>
): MergeResult {
  // Primero las ligas que sustituyen a una ficticia y después las invitadas,
  // que se meten en una de ellas.
  const hosts = sources.filter((source) => !source.guest);
  const guests = sources.filter((source) => source.guest);
  const replaced = new Set(hosts.map((source) => source.competitionId));
  const guestSlots = new Map<string, number>();
  for (const source of guests) {
    const guest = source.guest as SourceGuest;
    if (!replaced.has(guest.into)) {
      throw new Error(
        `${source.name} mete equipos en ${guest.into}, que no es una liga real: extrae antes esa liga.`
      );
    }
    guestSlots.set(guest.into, (guestSlots.get(guest.into) ?? 0) + guest.teamIds.length);
  }
  // Los ascendidos de una liga real a la de encima ocupan plaza allí como invitados.
  for (const source of hosts) {
    const promoted = source.promoted;
    if (!promoted) continue;
    if (!replaced.has(promoted.into) || promoted.into === source.competitionId) {
      throw new Error(
        `${source.name} sube equipos a ${promoted.into}, que no es otra liga real: extrae antes esa liga.`
      );
    }
    guestSlots.set(promoted.into, (guestSlots.get(promoted.into) ?? 0) + promoted.teamIds.length);
  }
  const competitions = fictitious.competitions.map((competition) => ({ ...competition }));
  const keptTeams = fictitious.teams.filter((team) => !replaced.has(team.competitionId));
  const keptTeamIds = new Set(keptTeams.map((team) => team.id));
  const teams: DatasetTeam[] = [...keptTeams];
  const players: DatasetPlayer[] = fictitious.players.filter((player) =>
    keptTeamIds.has(player.teamId)
  );
  const reports: MergeReport[] = [];
  const ratedByLeague = new Map<string, RatedPlayer[]>();
  /** Equipos ya puestos en cada liga real y quién juega en ella. */
  const placed = new Map<string, number>();
  const peopleIn = new Map<string, Set<string>>();

  interface Placement {
    source: SourceLeague;
    /** Liga del juego en la que entra. */
    competitionId: string;
    reputation: number;
    /** Con qué empiezan los ids de sus jugadores. */
    playerIdPrefix: string;
    ratedBySource: ReadonlyMap<SourcePlayer, RatedPlayer>;
    unknown: Set<string>;
    withoutCoach: string[];
  }

  /** Un equipo real y su plantilla, ya con atributos, en su liga del juego. */
  function addTeam(sourceTeam: SourceTeam, roster: readonly SourcePlayer[], at: Placement): void {
    const { source, competitionId, reputation, unknown, withoutCoach } = at;
    const tier = tierOf(competitionId);
    const capacityBase = tier?.capacity ?? 5000;
    const teamId = `${competitionId}-${slugify(sourceTeam.name)}`;
    const city = sourceTeam.city ?? sourceTeam.name;
    const coach = datasetCoachFor(sourceTeam.coach, source, knownNationalities);
    const coachNationality = sourceTeam.coach?.nationality ?? null;
    if (!coach) withoutCoach.push(sourceTeam.name);
    else if (!coachNationality || !knownNationalities.has(coachNationality)) {
      unknown.add(`${coachNationality ?? 'sin dato'} (entrenador de ${sourceTeam.name})`);
    }
    teams.push({
      id: teamId,
      name: sourceTeam.name,
      shortName:
        sourceTeam.shortName ??
        sourceTeam.name
          .replace(/[^\p{L}]/gu, '')
          .slice(0, 3)
          .toUpperCase(),
      city,
      country: source.country,
      competitionId,
      pavilionName: sourceTeam.pavilionName ?? `Pabellón de ${city}`,
      pavilionCapacity:
        sourceTeam.pavilionCapacity ?? Math.round(capacityBase * (0.45 + reputation / 110)),
      reputation,
      // La misma fórmula que el mundo ficticio: el presupuesto sale de la
      // reputación, y el motor económico está calibrado con ella.
      budgetCents: (300_000 + reputation * 58_000) * 100,
      ...(coach ? { coach } : {})
    });

    const people = peopleIn.get(competitionId) ?? new Set<string>();
    peopleIn.set(competitionId, people);
    for (const sourcePlayer of roster) {
      people.add(personKey(sourcePlayer));
      const entry = at.ratedBySource.get(sourcePlayer) as RatedPlayer;
      const seed = `${source.competitionId}:${sourcePlayer.sourceId}`;
      const nationality =
        sourcePlayer.nationality && knownNationalities.has(sourcePlayer.nationality)
          ? sourcePlayer.nationality
          : source.country;
      if (!sourcePlayer.nationality || !knownNationalities.has(sourcePlayer.nationality)) {
        unknown.add(sourcePlayer.nationality ?? sourcePlayer.nationalityRaw ?? '(vacía)');
      }
      const birthDate = birthDateFor(sourcePlayer, source.seasonStartYear);
      const age = ageFrom(birthDate, source.seasonStartYear) ?? 26;
      const height = sourcePlayer.heightCm ?? HEIGHT_BY_POSITION[entry.position];
      // El sueldo y el valor se escalan con la media, igual que el
      // generador ficticio los escala con su nivel.
      const level = entry.overall;

      players.push({
        id: `${at.playerIdPrefix}-p${slugify(sourcePlayer.sourceId)}`,
        teamId,
        firstName: sourcePlayer.firstName,
        lastName: sourcePlayer.lastName,
        nationality,
        birthDate,
        position: entry.position,
        secondaryPosition: neighbour(entry.position, `${seed}:second`),
        heightCm: height,
        weightKg:
          sourcePlayer.weightKg ?? Math.round((height - 100) * 0.92 + jitter(`${seed}:weight`) * 6),
        wingspanCm: height + clamp(4 + jitter(`${seed}:wingspan`) * 5, 0, 9),
        attributes: entry.attributes,
        potential: clamp(
          entry.overall + Math.max(0, 24 - age) * 1.6 + jitter(`${seed}:potential`) * 4,
          entry.overall,
          97
        ),
        wageCents: Math.round(Math.pow(level / 10, 3.1) * 1_200) * 100,
        contractUntil: `${source.seasonStartYear + clamp(2.5 + jitter(`${seed}:contract`) * 1.5, 1, 4)}-06-30`,
        valueCents: Math.round(Math.pow(level / 10, 3.6) * 9_000) * 100
      });
    }
  }

  /** Atributos de toda una liga real, con el nivel de cada equipo en ella. */
  function rateSource(
    source: SourceLeague,
    reference: LeagueReference
  ): ReturnType<typeof selectRosters> & { rated: RatedPlayer[] } {
    const selection = selectRosters(source);
    const strength = new Map<SourcePlayer, number | null>();
    for (const [sourceTeam, roster] of selection.rosters) {
      const value = teamStrength(sourceTeam.finalPosition, source.teams.length);
      for (const sourcePlayer of roster) strength.set(sourcePlayer, value);
    }
    const rated = rateLeague(
      [...selection.rosters.values()].flat(),
      reference,
      positionFor,
      (sourcePlayer) => strength.get(sourcePlayer) ?? null
    );
    return { ...selection, rated };
  }

  const pendingPromotions: {
    source: SourceLeague;
    rosters: Map<SourceTeam, SourcePlayer[]>;
    ratedBySource: ReadonlyMap<SourcePlayer, RatedPlayer>;
  }[] = [];

  for (const source of hosts) {
    const competition = competitions.find((entry) => entry.id === source.competitionId);
    if (!competition) {
      throw new Error(`La liga ${source.competitionId} no existe en el dataset ficticio.`);
    }
    competition.name = source.name;
    competition.shortName = source.shortName;
    const cup = REAL_CUPS[competition.country];
    const cupCompetition = competitions.find(
      (entry) => entry.country === competition.country && entry.format === 'cup'
    );
    if (cup && cupCompetition) {
      cupCompetition.name = cup.name;
      cupCompetition.shortName = cup.shortName;
    }

    const tier = tierOf(source.competitionId);
    const reference = referenceFrom(fictitiousPlayersOf(fictitious, source.competitionId));
    // Toda la liga se valora junta, también los que suben a la de encima: el
    // percentil de cada jugador es el de su liga entera.
    const { rosters, droppedDuplicates, droppedOverRoster, rated } = rateSource(source, reference);
    const ratedBySource = new Map(rated.map((entry) => [entry.source, entry]));
    const promotedIds = new Set(source.promoted?.teamIds ?? []);
    const staying = source.teams.filter((team) => !promotedIds.has(team.sourceId));
    const stayingPlayers = new Set(staying.flatMap((team) => rosters.get(team) ?? []));
    const ratedHere =
      promotedIds.size > 0 ? rated.filter((e) => stayingPlayers.has(e.source)) : rated;
    ratedByLeague.set(source.competitionId, ratedHere);
    if (source.promoted) pendingPromotions.push({ source, rosters, ratedBySource });
    const unknown = new Set<string>();
    const withoutCoach: string[] = [];
    // Los invitados van detrás, pero la reputación se reparte entre todos.
    const total = staying.length + (guestSlots.get(source.competitionId) ?? 0);

    const ordered = [...staying].sort(
      (a, b) => (a.finalPosition ?? 99) - (b.finalPosition ?? 99) || a.name.localeCompare(b.name)
    );
    ordered.forEach((sourceTeam, index) => {
      addTeam(sourceTeam, rosters.get(sourceTeam) ?? [], {
        source,
        competitionId: source.competitionId,
        // Sin los que suben, el puesto de la fuente ya no es el de esta liga:
        // cuenta el orden entre los que se quedan.
        reputation: reputationFor(
          promotedIds.size > 0 ? index + 1 : sourceTeam.finalPosition,
          index,
          total,
          tier
        ),
        playerIdPrefix: source.competitionId,
        ratedBySource,
        unknown,
        withoutCoach
      });
    });
    placed.set(source.competitionId, ordered.length);

    reports.push({
      competitionId: source.competitionId,
      name: source.name,
      teams: staying.length,
      players: ratedHere.length,
      estimated: ratedHere.filter((entry) => entry.estimated).length,
      droppedDuplicates,
      droppedOverRoster,
      unknownNationalities: [...unknown].sort(),
      withoutCoach
    });
  }

  // Los ascendidos, detrás de los de la liga de encima y en el orden en que
  // se dan, con los atributos de su liga (ya valorada entera).
  for (const { source, rosters, ratedBySource } of pendingPromotions) {
    const promoted = source.promoted as SourcePromotion;
    const into = promoted.into;
    const tier = tierOf(into);
    const total = (placed.get(into) ?? 0) + (guestSlots.get(into) ?? 0);
    const unknown = new Set<string>();
    const withoutCoach: string[] = [];
    const kept: RatedPlayer[] = [];
    let droppedDuplicates = 0;
    const people = peopleIn.get(into) ?? new Set<string>();
    for (const teamId of promoted.teamIds) {
      const sourceTeam = source.teams.find((team) => team.sourceId === teamId);
      if (!sourceTeam) throw new Error(`${source.name}: no está el equipo que sube ${teamId}.`);
      // Quien ya juega en la liga de destino se queda allí.
      const roster = (rosters.get(sourceTeam) ?? []).filter((sourcePlayer) => {
        const duplicate = sourcePlayer.birthDate !== null && people.has(personKey(sourcePlayer));
        if (duplicate) droppedDuplicates += 1;
        return !duplicate;
      });
      const position = (placed.get(into) ?? 0) + 1;
      placed.set(into, position);
      addTeam({ ...sourceTeam, finalPosition: position }, roster, {
        source,
        competitionId: into,
        reputation: reputationFor(position, position - 1, total, tier),
        playerIdPrefix: `${into}-${slugify(source.competitionId)}`,
        ratedBySource,
        unknown,
        withoutCoach
      });
      for (const sourcePlayer of roster) kept.push(ratedBySource.get(sourcePlayer) as RatedPlayer);
    }
    const reportId = `${source.competitionId}-ascendidos`;
    ratedByLeague.set(reportId, kept);
    reports.push({
      competitionId: reportId,
      name: `${source.name} (ascendidos)`,
      guestOf: into,
      teams: promoted.teamIds.length,
      players: kept.length,
      estimated: kept.filter((entry) => entry.estimated).length,
      droppedDuplicates,
      droppedOverRoster: 0,
      unknownNationalities: [...unknown].sort(),
      withoutCoach
    });
  }

  for (const source of guests) {
    const guest = source.guest as SourceGuest;
    const into = guest.into;
    const tier = tierOf(into);
    const total = (placed.get(into) ?? 0) + (guestSlots.get(into) ?? 0);
    const { rosters, rated } = rateSource(source, scaleReference(fictitious, guest.scale));
    const ratedBySource = new Map(rated.map((entry) => [entry.source, entry]));
    const unknown = new Set<string>();
    const withoutCoach: string[] = [];
    const kept: RatedPlayer[] = [];
    let droppedDuplicates = 0;
    // Sólo cuentan los de los equipos invitados, no los de toda su liga.
    let droppedOverRoster = 0;

    const invited = source.teams.filter((team) => guest.teamIds.includes(team.sourceId));
    if (invited.length !== guest.teamIds.length) {
      throw new Error(`${source.name}: faltan equipos invitados (${guest.teamIds.join(', ')}).`);
    }
    for (const sourceTeam of invited) {
      // Quien ya juega en la liga de destino (fichado a mitad de temporada,
      // cedido) se queda allí: sus números en esa liga dicen más.
      const selected = rosters.get(sourceTeam) ?? [];
      droppedOverRoster +=
        new Set(sourceTeam.players.map((entry) => entry.sourceId)).size - selected.length;
      const people = peopleIn.get(into) ?? new Set<string>();
      const roster = (rosters.get(sourceTeam) ?? []).filter((sourcePlayer) => {
        const duplicate = sourcePlayer.birthDate !== null && people.has(personKey(sourcePlayer));
        if (duplicate) droppedDuplicates += 1;
        return !duplicate;
      });
      // Detrás de los de la liga real: el que sube es el último de la categoría.
      const position = (placed.get(into) ?? 0) + 1;
      placed.set(into, position);
      addTeam({ ...sourceTeam, finalPosition: position }, roster, {
        source,
        competitionId: into,
        reputation: reputationFor(position, position - 1, total, tier),
        playerIdPrefix: `${into}-${slugify(source.competitionId)}`,
        ratedBySource,
        unknown,
        withoutCoach
      });
      for (const sourcePlayer of roster) kept.push(ratedBySource.get(sourcePlayer) as RatedPlayer);
    }
    ratedByLeague.set(source.competitionId, kept);

    reports.push({
      competitionId: source.competitionId,
      name: source.name,
      guestOf: into,
      teams: invited.length,
      players: kept.length,
      estimated: kept.filter((entry) => entry.estimated).length,
      droppedDuplicates,
      droppedOverRoster,
      unknownNationalities: [...unknown].sort(),
      withoutCoach
    });
  }

  return {
    dataset: {
      ...fictitious,
      competitions,
      teams,
      players,
      realLeagues: [...replaced].sort()
    },
    reports,
    rated: ratedByLeague
  };
}
