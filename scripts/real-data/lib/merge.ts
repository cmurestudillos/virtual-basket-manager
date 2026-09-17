import type { Dataset, DatasetPlayer, DatasetTeam } from '../../../src/main/features/saves/dataset';
import { POSITIONS, type Position } from '../../../src/shared/domain/positions';
import { MAX_ROSTER } from '../../../src/shared/domain/youth';
import { WORLD, type LeagueTier } from '../../seed-data/leagues.mts';
import { ageFrom, jitter, rateLeague, referenceFrom, type RatedPlayer } from './ratings';
import type { SourceLeague, SourcePlayer, SourceTeam } from './source-types';

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
 * Lo que la fuente no da se rellena aquí, siempre igual para el mismo jugador
 * (nada de azar: regenerar el dataset no puede cambiarle la ficha a nadie):
 * peso, envergadura, potencial, sueldo, contrato y valor.
 */

/** Nombres reales de las copas de los países con liga real. */
const REAL_CUPS: Record<string, { name: string; shortName: string }> = {
  ESP: { name: 'Copa del Rey', shortName: 'Copa' }
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

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

export function mergeRealLeagues(
  fictitious: Dataset,
  sources: readonly SourceLeague[],
  knownNationalities: ReadonlySet<string>
): MergeResult {
  const replaced = new Set(sources.map((source) => source.competitionId));
  const competitions = fictitious.competitions.map((competition) => ({ ...competition }));
  const keptTeams = fictitious.teams.filter((team) => !replaced.has(team.competitionId));
  const keptTeamIds = new Set(keptTeams.map((team) => team.id));
  const teams: DatasetTeam[] = [...keptTeams];
  const players: DatasetPlayer[] = fictitious.players.filter((player) =>
    keptTeamIds.has(player.teamId)
  );
  const reports: MergeReport[] = [];
  const ratedByLeague = new Map<string, RatedPlayer[]>();

  for (const source of sources) {
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
    const fictitiousTeamIds = new Set(
      fictitious.teams
        .filter((team) => team.competitionId === source.competitionId)
        .map((team) => team.id)
    );
    const reference = referenceFrom(
      fictitious.players.filter((player) => fictitiousTeamIds.has(player.teamId))
    );

    const { rosters, droppedDuplicates, droppedOverRoster } = selectRosters(source);
    const allPlayers = [...rosters.values()].flat();
    const strength = new Map<SourcePlayer, number | null>();
    for (const [sourceTeam, roster] of rosters) {
      const value = teamStrength(sourceTeam.finalPosition, source.teams.length);
      for (const sourcePlayer of roster) strength.set(sourcePlayer, value);
    }
    const rated = rateLeague(
      allPlayers,
      reference,
      positionFor,
      (sourcePlayer) => strength.get(sourcePlayer) ?? null
    );
    ratedByLeague.set(source.competitionId, rated);
    const ratedBySource = new Map(rated.map((entry) => [entry.source, entry]));
    const unknown = new Set<string>();

    const ordered = [...source.teams].sort(
      (a, b) => (a.finalPosition ?? 99) - (b.finalPosition ?? 99) || a.name.localeCompare(b.name)
    );
    ordered.forEach((sourceTeam, index) => {
      const reputation = reputationFor(sourceTeam.finalPosition, index, ordered.length, tier);
      const capacityBase = tier?.capacity ?? 5000;
      const teamId = `${source.competitionId}-${slugify(sourceTeam.name)}`;
      const city = sourceTeam.city ?? sourceTeam.name;
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
        competitionId: source.competitionId,
        pavilionName: sourceTeam.pavilionName ?? `Pabellón de ${city}`,
        pavilionCapacity:
          sourceTeam.pavilionCapacity ?? Math.round(capacityBase * (0.45 + reputation / 110)),
        reputation,
        // La misma fórmula que el mundo ficticio: el presupuesto sale de la
        // reputación, y el motor económico está calibrado con ella.
        budgetCents: (300_000 + reputation * 58_000) * 100
      });

      for (const sourcePlayer of rosters.get(sourceTeam) ?? []) {
        const entry = ratedBySource.get(sourcePlayer) as RatedPlayer;
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
          id: `${source.competitionId}-p${slugify(sourcePlayer.sourceId)}`,
          teamId,
          firstName: sourcePlayer.firstName,
          lastName: sourcePlayer.lastName,
          nationality,
          birthDate,
          position: entry.position,
          secondaryPosition: neighbour(entry.position, `${seed}:second`),
          heightCm: height,
          weightKg:
            sourcePlayer.weightKg ??
            Math.round((height - 100) * 0.92 + jitter(`${seed}:weight`) * 6),
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
    });

    reports.push({
      competitionId: source.competitionId,
      name: source.name,
      teams: source.teams.length,
      players: allPlayers.length,
      estimated: rated.filter((entry) => entry.estimated).length,
      droppedDuplicates,
      droppedOverRoster,
      unknownNationalities: [...unknown].sort()
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
